"""Publish recorded real observations and rendered images, never credential URLs.

Run from the repository root with a locally authenticated Earth Engine account.
Only explicit analysis JSON files are read; credentials and caches are not copied.
"""
import argparse
import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv
load_dotenv(ROOT / '.env')
from backend import engine, advice
from backend.catalog import PROJECTS, ADMIN
from backend.geo import grid


def write_json(path, value):
    text = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))
    # A snapshot must be data, never authentication or a temporary GEE URL.
    forbidden = ['"private_key"', '"refresh_token"', '"access_token"',
                 '"client_secret"', 'earthengine.googleapis.com', 'token=']
    if any(word in text for word in forbidden):
        raise ValueError('Refusing to export sensitive data or a temporary URL')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + '\n', encoding='utf-8')


def render_images(project, params):
    g, a, b, classes, metrics, quality = engine.expressions(project, params)
    images = {
        'baseline_rgb': (a['rgb'], {'min': 0, 'max': .3}),
        'comparison_rgb': (b['rgb'], {'min': 0, 'max': .3}),
        'ndvi_change': (metrics.select('ndvi_change'), {'min': -.3, 'max': .3, 'palette': ['dc5656', 'f4f2dc', '14532d']}),
        'tree_change': (metrics.select('tree_change'), {'min': -.3, 'max': .3, 'palette': ['dc5656', 'f4f2dc', '14532d']}),
        'evidence': (classes, {'min': 0, 'max': 4, 'palette': engine.PALETTE}),
        'quality': (quality, {'min': 0, 'max': 1, 'palette': ['14532d', 'd6a13c', '9ca3af']}),
    }
    images.update({name: (image, {'min': 0, 'max': 1, 'palette': ['9ca3af' if name == 'comparison_insufficient' else '14532d']})
                   for name, image in engine.comparison_images(g, a, b, classes.neq(0)).items()})
    return images


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--results', nargs='+', required=True, type=Path)
    parser.add_argument('--date-checks', nargs='*', default=[], type=Path)
    args = parser.parse_args()
    out = ROOT / 'frontend/public/demo'
    write_json(out / 'catalog.json', {'projects': PROJECTS, 'admin': ADMIN})
    for project in PROJECTS:
        write_json(out / f'grids/{project["id"]}.json', grid(project['geometry'], 50, 25))
    engine.initialize()
    manifest = {'exported_at': datetime.now(timezone.utc).isoformat(),
                'method': engine.METHOD, 'datasets': engine.DATASETS,
                'attribution': 'Contains modified Copernicus Sentinel data; Dynamic World: Google / WRI, CC BY 4.0.',
                'samples': [], 'date_checks': []}
    for path in args.date_checks:
        checks = json.loads(path.read_text(encoding='utf-8'))
        name = f'date-checks-{len(manifest["date_checks"])}.json'
        write_json(out / name, checks)
        manifest['date_checks'].append(name)
    for index, path in enumerate(args.results):
        result = json.loads(path.read_text(encoding='utf-8'))
        assert result['method'] == engine.METHOD and result['datasets'] == engine.DATASETS
        project = next(p for p in PROJECTS if p['id'] == result['project_id'])
        params = result['params']
        summary = {key: value for key, value in result.items() if key != 'cells'}
        summary['guidance'] = advice.result_guidance(result)
        sample_id = f'{project["id"]}-{index+1}'
        directory = out / sample_id
        write_json(directory / 'summary.json', summary)
        write_json(directory / 'grid.json', result['cells'])
        coords = project['geometry']['coordinates'][0]
        west = min(c[0] for c in coords); east = max(c[0] for c in coords)
        south = min(c[1] for c in coords); north = max(c[1] for c in coords)
        bounds = [[south, west], [north, east]]
        region = engine.ee.Geometry.Rectangle([west, south, east, north], geodesic=False)
        layers = {}

        def render(name, image, vis):
            target = directory / f'{name}.png'
            # URLs may contain temporary tokens. Keep them in memory only.
            try:
                url = image.getThumbURL({**vis, 'format': 'png', 'dimensions': 768,
                                         'crs': 'EPSG:3857', 'region': region})
                with urlopen(url, timeout=180) as response:
                    data = response.read()
                assert data.startswith(b'\x89PNG\r\n\x1a\n')
            except Exception:
                raise RuntimeError(f'Could not render {sample_id}/{name}; check Earth Engine access and retry') from None
            target.write_bytes(data)
            return name, {'url': f'{sample_id}/{name}.png', 'bounds': bounds,
                          'kind': 'image', 'sha256': hashlib.sha256(data).hexdigest()}

        with ThreadPoolExecutor(max_workers=3) as pool:
            tasks = [pool.submit(render, name, image, vis) for name, (image, vis) in render_images(project, params).items()]
            for task in as_completed(tasks):
                name, layer = task.result()
                layers[name] = layer
                print(f'Rendered {sample_id}/{name}', flush=True)
        write_json(directory / 'layers.json', layers)
        manifest['samples'].append({'id': sample_id, 'project_id': project['id'],
                                    'params': params, 'created_at': result['created_at'],
                                    'common_sufficient_fraction': None if result['metrics'].get('missing') is None else 1-result['metrics']['missing']})
    write_json(out / 'manifest.json', manifest)
    print(f'Exported {len(manifest["samples"])} real recorded analyses without credential URLs')


if __name__ == '__main__':
    main()
