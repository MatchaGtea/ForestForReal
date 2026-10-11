import json
from pathlib import Path
from shapely.geometry import shape
from shapely.ops import unary_union
from .geo import area

DATA = Path(__file__).parent / 'data'
PROJECTS = json.loads((DATA / 'projects.json').read_text(encoding='utf-8'))
ADMIN = {}
GEOMETRIES = {}
for level, name in [(1, 'provinces'), (2, 'districts'), (3, 'subdistricts')]:
    rows = json.loads((DATA / f'{name}.json').read_text(encoding='utf-8'))
    geometries = json.loads((DATA / f'ADM{level}.geojson').read_text(encoding='utf-8'))
    for f in geometries['features']:
        code = f['properties'][f'ADM{level}_PCODE'].removeprefix('TH')
        g = shape(f['geometry'])
        if not g.is_valid:
            from shapely import make_valid
            g = make_valid(g)
        GEOMETRIES[code] = g
    ADMIN[name] = [{'code': str(r[f'{name[:-1] if name != "provinces" else "province"}Code']),
                    'name': r[f'{name[:-1] if name != "provinces" else "province"}NameTh'],
                    'parent': str(r['provinceCode']) if level == 2 else str(r['districtCode']) if level == 3 else None,
                    'bounds': list(GEOMETRIES[str(r[f'{name[:-1] if name != "provinces" else "province"}Code'])].bounds)
                    if str(r[f'{name[:-1] if name != "provinces" else "province"}Code']) in GEOMETRIES else None}
                   for r in rows]

# Build navigation/filter parents from their available child polygons. Original
# simplified ADM2/ADM1 files occasionally disagree with the ADM3 edge positions.
# This guarantees hierarchy consistency without assigning projects by centroid.
for parent_level,child_level in [('districts','subdistricts'),('provinces','districts')]:
    for parent in ADMIN[parent_level]:
        children=[GEOMETRIES[r['code']] for r in ADMIN[child_level]
                  if r['parent']==parent['code'] and r['code'] in GEOMETRIES]
        if children:GEOMETRIES[parent['code']]=unary_union(children)
for rows in ADMIN.values():
    for row in rows:
        row['bounds']=list(GEOMETRIES[row['code']].bounds) if row['code'] in GEOMETRIES else None

for p in PROJECTS:
    p['boundary_area'] = area(p['geometry'])
    boundary = shape(p['geometry'])
    p['admin_codes'] = [code for code, g in GEOMETRIES.items() if boundary.intersects(g)]
    p['administrative_areas'] = [r for rows in ADMIN.values() for r in rows if r['code'] in p['admin_codes']]


def browse(q='', area_code='', company=''):
    q = q.casefold().strip()
    return [p for p in PROJECTS if (not area_code or area_code in p['admin_codes'])
            and (not company or p['company'] == company)
            and (not q or q in ' '.join([p['id'], p['name'], p['company']]).casefold())]


def search(q):
    found = browse(q)
    return {'projects': [{'id': p['id'], 'name': p['name'], 'company': p['company']} for p in found],
            'companies': [{'name': c, 'count': len(browse(company=c))}
                          for c in sorted({p['company'] for p in PROJECTS}) if q.casefold() in c.casefold()]}
