"""Real EE computations. No fixture or synthetic result fallback."""
import os
import threading
from datetime import date, timedelta, datetime, timezone
import ee
from google.oauth2 import service_account
from .geo import grid

METHOD = 'forestproof-1.0.1'
DATASETS = ['COPERNICUS/S2_SR_HARMONIZED', 'GOOGLE/DYNAMICWORLD/V1',
            'GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED']
PALETTE = ['9ca3af', '14532d', '84cc16', 'dc5656', 'd6a13c']
CLASSES = ['insufficient', 'persistent', 'increasing', 'decreasing', 'mixed']
_lock = threading.Lock()
_ready = False


class Unavailable(Exception):
    pass


def initialize():
    global _ready
    with _lock:
        if _ready:
            return
        project = os.getenv('GEE_PROJECT_ID', '')
        if not project:
            raise Unavailable('ยังไม่ได้ตั้ง GEE_PROJECT_ID ดูวิธีติดตั้งใน README')
        try:
            mode = os.getenv('GEE_AUTH_MODE', 'local')
            if mode == 'service_account':
                key = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', '')
                if not key:
                    raise Unavailable('ยังไม่ได้ตั้งไฟล์สิทธิ์ service account')
                credentials = service_account.Credentials.from_service_account_file(
                    key, scopes=['https://www.googleapis.com/auth/earthengine',
                                 'https://www.googleapis.com/auth/cloud-platform'])
                ee.Initialize(credentials=credentials, project=project)
            elif mode == 'local':
                ee.Initialize(project=project)
            else:
                raise Unavailable('GEE_AUTH_MODE ต้องเป็น local หรือ service_account')
            ee.data.setDeadline(120000)
            ee.data.setMaxRetries(2)
            _ready = True
        except Unavailable:
            raise
        except Exception as exc:
            raise Unavailable('เชื่อมต่อ Earth Engine ไม่ได้ กรุณารัน earthengine authenticate และตรวจสิทธิ์โปรเจกต์ Google Cloud') from exc


def daily(collection, bands):
    """Mosaic same-day granules; counts mean distinct acquisition days."""
    tagged = collection.map(lambda i: i.set('day', i.date().format('YYYY-MM-dd')))
    days = ee.List(tagged.aggregate_array('day')).distinct().sort()
    def compose(day):
        return tagged.filter(ee.Filter.eq('day', day)).select(bands).mosaic().set(
            'system:time_start', ee.Date(day).millis())
    return ee.ImageCollection.fromImages(days.map(compose)), days


def period(geometry, start, end, crs):
    raw = ee.ImageCollection(DATASETS[0]).filterBounds(geometry).filterDate(start, end)
    cs = ee.ImageCollection(DATASETS[2])
    linked = raw.linkCollection(cs, ['cs_cdf'])
    def mask(i):
        scl = i.select('SCL')
        valid = i.select('cs_cdf').gte(.60).And(scl.neq(3)).And(scl.neq(8)).And(
            scl.neq(9)).And(scl.neq(10)).And(scl.neq(11)).And(scl.neq(1))
        reflectance = i.select(['B2','B3','B4','B8']).multiply(.0001).updateMask(valid)
        ndvi = reflectance.expression('(n-r)/(n+r)', {'n': reflectance.select('B8'),
            'r': reflectance.select('B4')}).rename('ndvi').updateMask(
            reflectance.select('B8').add(reflectance.select('B4')).neq(0))
        return reflectance.addBands(ndvi).copyProperties(i, ['system:time_start', 'system:index'])
    s2 = linked.map(mask)
    dw_raw = ee.ImageCollection(DATASETS[1]).filterBounds(geometry).filterDate(start,end)
    dw = dw_raw.filter(ee.Filter.inList('system:index', raw.aggregate_array('system:index')))
    # Apply the same S2 QA mask in addition to Dynamic World's own cloud/shadow mask.
    joined = ee.Join.saveFirst('s2').apply(dw, s2, ee.Filter.equals(
        leftField='system:index', rightField='system:index'))
    def dw_mask(i):
        i = ee.Image(i)
        qa = ee.Image(i.get('s2')).select('ndvi').mask()
        confidence = i.select(['water','trees','grass','flooded_vegetation','crops',
                              'shrub_and_scrub','built','bare','snow_and_ice']).reduce(ee.Reducer.max()).rename('confidence')
        return i.select('trees').addBands(confidence).updateMask(qa).copyProperties(i,['system:time_start'])
    ds, s_days = daily(s2, ['B2','B3','B4','B8','ndvi'])
    dt, t_days = daily(ee.ImageCollection(joined).map(dw_mask), ['trees','confidence'])
    # Masked placeholders make empty collections explicit no-data, never zeros.
    blank_s = ee.Image.constant([0]*5).rename(['B2','B3','B4','B8','ndvi']).updateMask(ee.Image(0))
    blank_t = ee.Image.constant([0,0]).rename(['trees','confidence']).updateMask(ee.Image(0))
    safe_s = ds.merge(ee.ImageCollection([blank_s]))
    safe_t = dt.merge(ee.ImageCollection([blank_t]))
    med = safe_s.median().setDefaultProjection(crs,None,10).clip(geometry)
    tree = safe_t.mean().setDefaultProjection(crs,None,10).clip(geometry)
    counts = safe_s.select('ndvi').count().unmask(0).rename('s_count').addBands(
        safe_t.select('trees').count().unmask(0).rename('t_count')).setDefaultProjection(crs,None,10).clip(geometry)
    variability = safe_s.select('ndvi').reduce(ee.Reducer.stdDev()).rename('ndvi_sd').addBands(
        safe_t.select('trees').reduce(ee.Reducer.stdDev()).rename('tree_sd')).updateMask(
        counts.select('s_count').gte(3).And(counts.select('t_count').gte(3)))
    return {'rgb': med.select(['B4','B3','B2']), 'ndvi':med.select('ndvi'), 'trees':tree.select('trees'),
            'confidence':tree.select('confidence'), 'counts': counts, 'variability': variability,
            'raw':raw, 'dw_raw':dw, 's_days':s_days,'t_days':t_days, 'start':start, 'end':end}


def expressions(project, params):
    g = ee.Geometry(project['geometry'])
    crs = project['boundary_area']['crs']
    a = period(g,params['baseline_start'],params['baseline_end'],crs)
    b = period(g,params['comparison_start'],params['comparison_end'],crs)
    dn = b['ndvi'].subtract(a['ndvi']).rename('ndvi_change')
    dt = b['trees'].subtract(a['trees']).rename('tree_change')
    valid = a['counts'].reduce(ee.Reducer.min()).gte(3).And(b['counts'].reduce(ee.Reducer.min()).gte(3))
    classes = ee.Image.constant(4).where(a['trees'].gte(.6).And(b['trees'].gte(.6)).And(
        dt.abs().lt(.1)).And(dn.abs().lt(.05)),1).where(dt.gte(.1).And(dn.gte(.05)),2).where(
        dt.lte(-.1).And(dn.lte(-.05)),3).updateMask(valid).unmask(0).rename('class').setDefaultProjection(crs,None,10).clip(g)
    coverage = a['counts'].select('s_count').gt(0).And(a['counts'].select('t_count').gt(0)).And(
        b['counts'].select('s_count').gt(0)).And(b['counts'].select('t_count').gt(0)).rename('coverage')
    # Screening components are separate binary bands, not calibrated error probabilities.
    missing = valid.Not().rename('missing')
    low = a['confidence'].min(b['confidence']).lt(.6).rename('low_confidence')
    variable = a['variability'].select('ndvi_sd').max(b['variability'].select('ndvi_sd')).gt(.15).rename('variable')
    disagree = dn.multiply(dt).lt(0).rename('disagreement')
    quality = missing.unmask(1).where(valid.And(low.Or(variable).Or(disagree)), .5).rename('quality').clip(g)
    metrics = a['ndvi'].rename('ndvi_baseline').addBands(b['ndvi'].rename('ndvi_comparison')).addBands(dn).addBands(
        a['trees'].rename('tree_baseline')).addBands(b['trees'].rename('tree_comparison')).addBands(dt).addBands(coverage).addBands(
        a['counts'].rename(['s_count_baseline','t_count_baseline'])).addBands(b['counts'].rename(['s_count_comparison','t_count_comparison'])).addBands(
        a['variability'].rename(['ndvi_sd_baseline','tree_sd_baseline'])).addBands(b['variability'].rename(['ndvi_sd_comparison','tree_sd_comparison'])).addBands(
        a['confidence'].min(b['confidence']).rename('confidence')).addBands(missing).addBands(low).addBands(variable).addBands(disagree)
    return g, a, b, classes, metrics, quality


def provenance(p, g, crs):
    # Dates represent raw matched scenes; valid days are counted separately at pixel level.
    return ee.Dictionary({'start':p['start'], 'end_exclusive':p['end'],
        'sentinel_ids':p['raw'].aggregate_array('system:id'), 'dynamic_world_ids':p['dw_raw'].aggregate_array('system:id'),
        'sentinel_dates':p['s_days'],'dynamic_world_dates':p['t_days'],
        'sentinel_scene_count':p['raw'].size(), 'dynamic_world_scene_count':p['dw_raw'].size()})


def check_date_pairs(project, rows):
    """Check actual QA-filtered daily counts; no NDVI/trends/grid analysis job."""
    initialize()
    g = ee.Geometry(project['geometry'])
    crs = project['boundary_area']['crs']
    args = {'geometry':g, 'scale':10, 'crs':crs, 'maxPixels':1000000, 'tileScale':2}
    periods = {}

    def get_period(start, end):
        key = (start,end)
        if key not in periods:
            p = period(g,start,end,crs)
            sufficient = p['counts'].reduce(ee.Reducer.min()).gte(3)
            counts = p['counts'].reduceRegion(ee.Reducer.mean(),**args)
            stats = ee.Dictionary(counts).combine({'sentinel_scene_count':p['raw'].size(),
                                                    'dynamic_world_scene_count':p['dw_raw'].size()})
            periods[key] = (sufficient, stats)
        return periods[key]

    measurements = {}
    area = ee.Image.pixelArea().setDefaultProjection(crs,None,10).clip(g)
    for index,row in enumerate(rows):
        p = row['params']
        a, stats_a = get_period(p['baseline_start'],p['baseline_end'])
        b, stats_b = get_period(p['comparison_start'],p['comparison_end'])
        areas = area.rename('area').addBands(area.multiply(a.And(b)).rename('common')).reduceRegion(ee.Reducer.sum(),**args)
        measurements[str(index)] = ee.Dictionary({'areas':areas, 'baseline':stats_a, 'comparison':stats_b})
    return ee.Dictionary(measurements).getInfo()


def analyze(project, params, stage):
    initialize()
    stage('preparing_imagery')
    g,a,b,classes,metrics,quality = expressions(project,params)
    crs = project['boundary_area']['crs']
    stage('analyzing')
    reducer_args = {'geometry':g,'scale':10,'crs':crs,'maxPixels':1000000,'tileScale':2}
    summary = metrics.reduceRegion(ee.Reducer.mean(),**reducer_args)
    totals = ee.Image.pixelArea().rename('area').addBands(classes).reduceRegion(
        ee.Reducer.sum().group(1,'class'),**reducer_args)
    # Means on the common sufficient-data mask are reported separately to avoid footprint bias.
    comparable = metrics.select(['ndvi_baseline','ndvi_comparison','ndvi_change','tree_baseline','tree_comparison','tree_change']).updateMask(
        classes.neq(0)).reduceRegion(ee.Reducer.mean(),**reducer_args)
    cells = grid(project['geometry'],params['window_m'],params['stride_m'])
    fc = ee.FeatureCollection([ee.Feature(f['geometry'], f['properties']) for f in cells['features']])
    reduced = metrics.reduceRegions(fc,ee.Reducer.mean(),scale=10,crs=crs,tileScale=2)
    # Separate non-overlapping raster area for each window's insufficient region.
    reduced = classes.eq(0).rename('insufficient_fraction').reduceRegions(reduced,
        ee.Reducer.mean().setOutputs(['insufficient_fraction']),scale=10,crs=crs)
    result = ee.Dictionary({'metrics':summary,'comparable_metrics':comparable,'areas':totals,
        'baseline':provenance(a,g,crs),'comparison':provenance(b,g,crs)}).getInfo()
    # computeValue of a collection inside a Dictionary returns metadata only.
    # Fetch one aggregated FeatureCollection, never one request per cell.
    result['cells'] = reduced.getInfo()
    stage('building_trends')
    trend = []
    base = date.fromisoformat(params['comparison_start'])
    duration = (date.fromisoformat(params['comparison_end'])-base).days
    for year in range(max(2019,base.year-3),base.year+1):
        stage('building_trends')
        try:
            start = base.replace(year=year)
        except ValueError:
            start = base.replace(year=year,day=28)
        p = period(g,start.isoformat(),(start+timedelta(days=duration)).isoformat(),crs)
        enough = p['counts'].reduce(ee.Reducer.min()).gte(3)
        values = p['ndvi'].addBands(p['trees']).updateMask(enough).addBands(enough.rename('sufficient').unmask(0)).reduceRegion(
            ee.Reducer.mean(),**reducer_args).getInfo()
        trend.append({'year':year,'start':start.isoformat(),'end_exclusive':(start+timedelta(days=duration)).isoformat(),**values})
    result['trends'] = trend
    groups={int(r['class']):r['sum'] for r in result.pop('areas').get('groups',[])}
    result['area_summaries'] = [{'class':name, 'm2':groups.get(i,0),'rai':groups.get(i,0)/1600,
                                 'hectares':groups.get(i,0)/10000} for i,name in enumerate(CLASSES)]
    result.update({'project_id':project['id'],'boundary_area':project['boundary_area'],'params':params,
                   'datasets':DATASETS,'method':METHOD,'created_at':datetime.now(timezone.utc).isoformat()})
    from .geo import classify
    for f in result['cells']['features']:
        p = f['properties']
        p['classification'] = classify(p.get('ndvi_baseline'),p.get('ndvi_comparison'),p.get('tree_baseline'),p.get('tree_comparison'),
                                       p.get('s_count_baseline',0),p.get('s_count_comparison',0))
        if p.get('insufficient_fraction',1) > .2:
            p['classification'] = 'insufficient'
    ranked = sorted([f for f in result['cells']['features'] if f['properties']['classification'] != 'persistent'],key=lambda f:(
        f['properties']['classification'] in ('mixed','decreasing'), f['properties'].get('disagreement') or 0,
        f['properties'].get('missing') or 0),reverse=True)
    from shapely.geometry import shape
    from pyproj import Transformer
    from shapely.ops import transform
    to_metric=Transformer.from_crs(4326,crs,always_xy=True).transform
    selected=[]; centers=[]
    for f in ranked:
        center = transform(to_metric,shape(f['geometry']).representative_point())
        if all(center.distance(x) >= 100 for x in centers):
            selected.append(f);centers.append(center)
        if len(selected)==5:break
    result['inspection_points'] = [{'cell_id':f['properties']['id'],'geometry':__import__('shapely').geometry.mapping(shape(f['geometry']).representative_point()),
        'reason':f['properties']['classification']} for f in selected]
    return result


def comparison_images(geometry, baseline, comparison, valid):
    """Same sufficient-data footprint and threshold for both periods.

    Zero/low tree probabilities are transparent; missing observations are
    displayed separately rather than treated as evidence of no trees.
    """
    def trees(period):
        signal = period['trees'].select('trees').gte(.60)
        return signal.updateMask(signal).updateMask(valid).clip(geometry)
    missing = valid.Not()
    return {'baseline_trees': trees(baseline),
            'comparison_trees': trees(comparison),
            'comparison_insufficient': missing.updateMask(missing).clip(geometry)}


def layers(project, params):
    initialize()
    g,a,b,classes,metrics,quality = expressions(project,params)
    images = {'baseline_rgb':(a['rgb'],{'min':0,'max':.3}), 'comparison_rgb':(b['rgb'],{'min':0,'max':.3}),
        'ndvi_change':(metrics.select('ndvi_change'),{'min':-.3,'max':.3,'palette':['dc5656','f4f2dc','14532d']}),
        'tree_change':(metrics.select('tree_change'),{'min':-.3,'max':.3,'palette':['dc5656','f4f2dc','14532d']}),
        'evidence':(classes,{'min':0,'max':4,'palette':PALETTE}),
        'quality':(quality,{'min':0,'max':1,'palette':['14532d','d6a13c','9ca3af']})}
    overlays = comparison_images(g, a, b, classes.neq(0))
    images.update({name: (im, {'min':0, 'max':1,
                              'palette':['9ca3af' if name == 'comparison_insufficient' else '14532d']})
                   for name, im in overlays.items()})
    result = {}
    for name, (im, vis) in images.items():
        try:
            result[name] = {'url':im.getMapId(vis)['tile_fetcher'].url_format,
                            'expires_hint':'Refresh after tile errors; GEE tokens are temporary'}
        except Exception:
            result[name] = {'error':'สร้างชั้นภาพไม่สำเร็จ ลองโหลดภาพใหม่'}
    if not any('url' in layer for layer in result.values()):
        raise Unavailable('โหลดชั้นภาพไม่ได้ ลองโหลดภาพใหม่หรือตรวจสิทธิ์ GEE')
    return result
