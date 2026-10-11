from datetime import date

import pytest
from fastapi.testclient import TestClient
from backend import advice, main

client = TestClient(main.app)


def dates():
    return dict(zip(advice.DATE_KEYS, map(date.fromisoformat,
        ['2025-07-13','2025-10-11','2026-07-13','2026-10-11'])))


@pytest.mark.parametrize('requested', [dates(), {}, {
    'baseline_start':date(2024,2,29), 'baseline_end':date(2024,3,1),
    'comparison_start':date(2030,2,1), 'comparison_end':date(2030,6,1)}])
def test_candidates_always_obey_analysis_date_limits(requested):
    today = date(2026,10,12)
    rows = advice.candidates(requested,today)
    assert 1 <= len(rows) <= 4
    assert len({tuple(row['params'].values()) for row in rows}) == len(rows)
    for row in rows:
        a,b,c,d = [date.fromisoformat(row['params'][key]) for key in advice.DATE_KEYS]
        assert a >= date(2019,1,1) and b <= c and d <= today
        assert 30 <= (b-a).days <= 120 and 30 <= (d-c).days <= 120


def test_raw_scene_count_or_mean_days_cannot_claim_sufficient_common_area():
    rows = advice.candidates(dates(),date(2026,10,12))
    measured = {str(i): {'areas':{'area':100,'common':fraction},
        'baseline':{'s_count':30,'t_count':20},'comparison':{'s_count':30,'t_count':20}}
        for i,fraction in enumerate([0,79,80,100])}
    result = advice.format_checks(rows,measured,'FP-001')
    assert result['current']['eligible'] is False
    assert result['current']['common_sufficient_fraction'] == 0
    assert len(result['recommendations']) == 2
    assert all(row['common_sufficient_fraction'] >= .8 for row in result['recommendations'])
    for item in measured.values():item['areas']['common'] = None
    missing = advice.format_checks(rows,measured,'FP-001')
    assert missing['recommendations'] == []
    assert missing['current']['common_sufficient_fraction'] is None
    assert 'ยังไม่พบ' in missing['message']


def test_insufficient_and_service_failures_get_different_actions():
    assert advice.result_guidance({'metrics':{'missing':1}})['suggest_dates'] is True
    assert advice.result_guidance({'metrics':{'missing':None}}) is None
    assert advice.result_guidance({'metrics':{'missing':0}}) is None
    for exc,code in [(PermissionError('403 permission denied'),'gee_access'),
                     (TimeoutError('deadline exceeded'),'timeout'),
                     (ValueError('Too many windows'),'grid_too_dense')]:
        guide = advice.failure(exc)
        assert guide['code']==code and guide['actions'] and not guide['suggest_dates']
    check_timeout = advice.failure(TimeoutError('deadline exceeded'),date_check=True)
    assert 'ไม่ใช้ขนาดกริด' in ' '.join(check_timeout['actions'])


def test_api_preserves_structured_validation_and_caches_observation_checks(monkeypatch,tmp_path):
    monkeypatch.setattr(main,'configuration',lambda:(True,'configured'))
    monkeypatch.setattr(main,'cache_dir',tmp_path)
    calls = []

    def check(project,rows):
        calls.append(project['id'])
        return {str(i): {'areas':{'area':100,'common':0 if i==0 else 100},
                        'baseline':{'s_count':None,'t_count':None},
                        'comparison':{'s_count':None,'t_count':None}} for i in range(len(rows))}

    monkeypatch.setattr(main.engine,'check_date_pairs',check)
    body = {key:value.isoformat() for key,value in dates().items()}
    first = client.post('/api/projects/FP-001/date-suggestions',json=body)
    assert first.status_code == 200
    assert first.json()['recommendations']
    assert first.json()['current']['baseline']['s_count'] is None
    assert client.post('/api/projects/FP-001/date-suggestions',json=body).json() == first.json()
    assert calls == ['FP-001']
    invalid = client.post('/api/analysis',json={'project_id':'FP-001',**body,'comparison_end':'2030-01-01'})
    assert invalid.status_code == 422
    assert invalid.json()['guidance']['code'] == 'invalid_dates'
    assert '30–120' in ' '.join(invalid.json()['guidance']['actions'])
    monkeypatch.setattr(main,'configuration',lambda:(False,'ยังไม่ได้ตั้ง GEE_PROJECT_ID'))
    blocked = client.post('/api/projects/FP-001/date-suggestions',json=body)
    assert blocked.status_code == 503
    assert blocked.json()['guidance']['code'] == 'gee_access'
    assert 'recommendations' not in blocked.json()
