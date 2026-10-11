"""Metric geometry only; overlapping windows are never used for area totals."""
import hashlib
import json
import math
from pyproj import Transformer
from shapely.geometry import shape, box, mapping
from shapely.ops import transform


def projected(geometry):
    g = shape(geometry)
    if not g.is_valid or g.is_empty or g.geom_type not in ('Polygon', 'MultiPolygon'):
        raise ValueError('Invalid polygon boundary')
    if not (97 <= g.bounds[0] <= g.bounds[2] <= 106 and 5 <= g.bounds[1] <= g.bounds[3] <= 21):
        raise ValueError('Boundary must be in Thailand')
    epsg = 32600 + int((g.centroid.x + 180) // 6) + 1
    forward = Transformer.from_crs(4326, epsg, always_xy=True).transform
    backward = Transformer.from_crs(epsg, 4326, always_xy=True).transform
    return transform(forward, g), backward, f'EPSG:{epsg}'


def area(geometry):
    g, _, crs = projected(geometry)
    return {'m2': g.area, 'hectares': g.area / 10000, 'rai': g.area / 1600, 'crs': crs}


def grid(geometry, window=50, stride=25):
    if not (20 <= window <= 200 and 10 <= stride <= 200):
        raise ValueError('Window 20–200 m; stride 10–200 m')
    g, backward, crs = projected(geometry)
    x0, y0, x1, y1 = g.bounds
    features = []
    for i in range(math.ceil((x1 - x0) / stride)):
        for j in range(math.ceil((y1 - y0) / stride)):
            cell = box(x0+i*stride, y0+j*stride, x0+i*stride+window, y0+j*stride+window).intersection(g)
            if cell.is_empty or cell.area < 1:
                continue
            features.append({'type': 'Feature', 'geometry': mapping(transform(backward, cell)),
                             'properties': {'id': f'{i}-{j}', 'area_m2': cell.area, 'crs': crs}})
            if len(features) > 800:
                raise ValueError('Too many windows; increase stride (maximum 800)')
    return {'type': 'FeatureCollection', 'features': features}


def cache_key(geometry, params, method):
    return hashlib.sha256(json.dumps({'boundary': geometry, 'params': params, 'method': method},
                                    sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def classify(ndvi_before, ndvi_after, tree_before, tree_after, count_before, count_after):
    if None in (ndvi_before, ndvi_after, tree_before, tree_after, count_before, count_after) or min(count_before, count_after) < 3:
        return 'insufficient'
    dn, dt = ndvi_after-ndvi_before, tree_after-tree_before
    if dt >= .10 and dn >= .05:
        return 'increasing'
    if dt <= -.10 and dn <= -.05:
        return 'decreasing'
    if tree_before >= .6 and tree_after >= .6 and abs(dt) < .1 and abs(dn) < .05:
        return 'persistent'
    return 'mixed'
