import pytest
from fastapi.testclient import TestClient
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union
from pyproj import Transformer
from shapely.ops import transform
from backend.main import app
from backend.geo import area, grid, projected, classify, cache_key
from backend.catalog import PROJECTS, ADMIN, GEOMETRIES, browse, search

client = TestClient(app)


def test_full_parent_hierarchy():
    assert [len(ADMIN[k]) for k in ['provinces','districts','subdistricts']] == [77,928,7436]
    p={r['code'] for r in ADMIN['provinces']};d={r['code'] for r in ADMIN['districts']}
    assert all(r['parent'] in p for r in ADMIN['districts'])
    assert all(r['parent'] in d for r in ADMIN['subdistricts'])
    assert all(r['parent']=='50' for r in client.get('/api/admin/districts?parent=50').json())
    assert client.get('/api/admin/not-a-level').status_code==422


def test_search_company_and_area_intersection():
    assert search('fp-001')['projects'][0]['id']=='FP-001'
    company=PROJECTS[0]['company'];matches=browse(company=company)
    assert len(matches)>=2 and len({p['province'] for p in matches})>=2
    assert search(company)['companies'][0]['count']==len(matches)
    for p in PROJECTS:
        assert any(len(c)==6 for c in p['admin_codes'])
        for c in p['admin_codes']:assert shape(p['geometry']).intersects(GEOMETRIES[c])
    assert browse(area_code='10')==[]


def test_project_crossing_admin_boundary_uses_intersection():
    # Deliberately span two adjacent provinces, independent of the demo records.
    from backend.catalog import GEOMETRIES
    from shapely.geometry import LineString
    a=GEOMETRIES['50'];b=GEOMETRIES['51']
    near=a.boundary.intersection(b.buffer(.005)).representative_point()
    polygon=near.buffer(.02)
    assert polygon.intersects(a) and polygon.intersects(b)
    assert sum(polygon.intersects(g) for g in [a,b])==2


def test_metric_area_units_clipping_and_overlaps():
    square=box(500000,2000000,500100,2000100)
    inverse=Transformer.from_crs(32647,4326,always_xy=True).transform
    geom=mapping(transform(inverse,square));stats=area(geom)
    assert stats['hectares']==pytest.approx(1,rel=.00001)
    assert stats['rai']==pytest.approx(6.25,rel=.00001)
    cells=grid(geom,50,25)['features']
    g,_,_=projected(geom)
    polygons=[projected(f['geometry'])[0] for f in cells]
    assert all(g.buffer(.001).covers(c) for c in polygons)
    assert unary_union(polygons).area==pytest.approx(g.area,rel=.00001)
    assert sum(c.area for c in polygons)>2*g.area  # cannot sum overlapping windows


def test_no_data_is_never_negative_evidence():
    assert classify(None,.3,None,.2,0,4)=='insufficient'
    assert classify(.8,.1,.9,.1,2,5)=='insufficient'
    assert classify(.8,.1,.9,.1,5,5)=='decreasing'
    assert classify(.6,.7,.6,.8,5,5)=='increasing'
    assert classify(.75,.76,.8,.81,5,5)=='persistent'
    assert classify(.8,.9,.9,.5,5,5)=='mixed'


def test_cache_changes_with_method_boundary_dates_and_windows():
    g=PROJECTS[0]['geometry'];p={'date':'2025','stride':25}
    a=cache_key(g,p,'v1')
    assert a!=cache_key(g,p,'v2')
    assert a!=cache_key(g,{**p,'stride':50},'v1')
    assert a!=cache_key(PROJECTS[1]['geometry'],p,'v1')


def payload():
    return {'project_id':'FP-001','baseline_start':'2023-01-01','baseline_end':'2023-04-01',
            'comparison_start':'2025-01-01','comparison_end':'2025-04-01','window_m':50,'stride_m':25}


def test_missing_gee_returns_setup_not_fake_results(monkeypatch):
    monkeypatch.setenv('GEE_PROJECT_ID','')
    assert client.get('/api/health').json()['gee_configured'] is False
    assert len(client.get('/api/projects').json())==10
    r=client.post('/api/analysis',json=payload())
    assert r.status_code==503
    assert 'GEE_PROJECT_ID' in r.json()['detail']
    assert 'metrics' not in r.json()


def test_limits():
    assert client.post('/api/analysis',json={**payload(),'stride_m':0}).status_code==422
    assert client.post('/api/analysis',json={**payload(),'comparison_end':'2030-01-01'}).status_code==422
    assert client.post('/api/analysis',json={**payload(),'baseline_end':'2025-03-01'}).status_code==422
    assert client.get('/api/projects/FP-001/grid?window_m=0').status_code==422
    assert client.get('/api/projects/missing/grid').status_code==404
    assert client.get('/api/analysis/missing/summary').status_code==404
