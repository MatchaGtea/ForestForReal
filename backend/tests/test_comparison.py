import os
from types import SimpleNamespace

import pytest
from backend import engine


def test_layer_failure_keeps_other_images_available(monkeypatch):
    class Image:
        def __init__(self, fail=False):
            self.fail = fail

        def select(self, *args):
            return self

        def neq(self, *args):
            return self

        def getMapId(self, vis):
            if self.fail:
                raise RuntimeError('One layer is unavailable')
            return {'tile_fetcher': SimpleNamespace(url_format='https://tiles.example/{z}/{x}/{y}')}

    image = Image()
    monkeypatch.setattr(engine, 'initialize', lambda: None)
    monkeypatch.setattr(engine, 'expressions', lambda *_: (
        None, {'rgb': image}, {'rgb': image}, image, image, image))
    monkeypatch.setattr(engine, 'comparison_images', lambda *_: {
        'baseline_trees': Image(fail=True), 'comparison_trees': image,
        'comparison_insufficient': image})
    result = engine.layers({}, {})
    assert result['baseline_rgb']['url'] == result['comparison_rgb']['url']
    assert 'url' not in result['baseline_trees']
    assert result['baseline_trees']['error']
    assert result['comparison_trees']['url']
    assert result['comparison_insufficient']['url']
    assert all(key in result for key in ('ndvi_change', 'tree_change', 'quality', 'evidence'))


@pytest.mark.skipif(os.getenv('FORESTPROOF_TEST_GEE') != '1', reason='Opt-in live Earth Engine mask validation')
def test_live_masks_threshold_missing_observations_and_boundary():
    """Evaluate the production masks on controlled inputs using actual EE.

    These constant images are test inputs only, never runtime imagery/results.
    """
    engine.initialize()
    ee = engine.ee
    geometry = ee.Geometry.Rectangle([99, 18, 99.001, 18.001])
    inside = ee.Geometry.Point([99.0005, 18.0005])
    outside = ee.Geometry.Point([99.01, 18.01])

    def evaluate(before, after, valid, point):
        images = engine.comparison_images(geometry,
            {'trees': ee.Image.constant(before).rename('trees')},
            {'trees': ee.Image.constant(after).rename('trees')},
            ee.Image.constant(valid))
        combined = ee.Image.cat([im.rename(key) for key, im in images.items()])
        return combined.reduceRegion(ee.Reducer.first(), point, 10).getInfo()

    assert evaluate(.60, .59, 1, inside) == {
        'baseline_trees': 1, 'comparison_trees': None, 'comparison_insufficient': None}
    assert evaluate(.9, .9, 0, inside) == {
        'baseline_trees': None, 'comparison_trees': None, 'comparison_insufficient': 1}
    assert evaluate(0, 0, 1, inside) == {
        'baseline_trees': None, 'comparison_trees': None, 'comparison_insufficient': None}
    assert evaluate(.9, .9, 1, outside) == {
        'baseline_trees': None, 'comparison_trees': None, 'comparison_insufficient': None}
