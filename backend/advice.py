"""Explain quality and propose bounded date checks without changing analysis rules."""
from datetime import date, timedelta
import math

MIN_DAYS = 3
TARGET_FRACTION = .80


def guidance(code, message, actions, suggest_dates=False):
    return {'code': code, 'message': message, 'actions': actions, 'suggest_dates': suggest_dates}


def failure(exc, status=None, date_check=False):
    parts = []
    cause = exc
    while cause is not None and len(parts) < 4:
        parts.append(str(cause).lower())
        cause = getattr(cause, '__cause__', None)
    text = ' '.join(parts)
    if 'too many windows' in text:
        return guidance('grid_too_dense', 'กริดละเอียดเกินเพดาน 800 ช่อง',
                        ['เพิ่มระยะเลื่อนกริด เช่น จาก 25 เป็น 50 เมตร แล้วเริ่มวิเคราะห์อีกครั้ง'])
    if 'window 20' in text or 'stride' in text or 'window_m' in text:
        return guidance('invalid_grid', 'ขนาดกริดอยู่นอกช่วงที่รองรับ',
                        ['ตั้งหน้าต่าง 20–200 เมตร และระยะเลื่อน 10–200 เมตร ในตัวเลือกเพิ่มเติม'])
    if status == 429 or any(word in text for word in ('quota', 'too many requests', 'rate limit', 'ครบ 2 งาน')):
        return guidance('rate_limit', 'มีงานประมวลผลหรือคำขอมากเกินไปในขณะนี้',
                        ['รอให้งานเดิมเสร็จ แล้วลองอีกครั้ง ไม่ต้องเปลี่ยนวันที่เพราะเหตุนี้'])
    if any(word in text for word in ('timeout', 'timed out', 'deadline', '10 minutes')):
        return guidance('timeout', 'บริการดาวเทียมประมวลผลเกินเวลาที่กำหนด',
                        ['ลองตรวจช่วงวันที่อีกครั้งเมื่อบริการพร้อม การตรวจวันที่ไม่ใช้ขนาดกริด'] if date_check else
                        ['ลองอีกครั้งเมื่อบริการพร้อม หากยังเกิดซ้ำ เพิ่มระยะเลื่อนกริดเป็น 50 เมตรเพื่อลดจำนวนช่อง'])
    if any(word in text for word in ('permission', 'not authorized', '403', 'สิทธิ์', 'authenticate', 'gee_project_id', 'service account')):
        return guidance('gee_access', 'การเชื่อมต่อหรือสิทธิ์ Earth Engine ยังไม่พร้อม',
                        ['ตรวจการยืนยันบัญชี Earth Engine และสิทธิ์ใช้ GEE project ที่ตั้งไว้',
                         'เมื่อตั้งสิทธิ์เรียบร้อย ให้ลองอีกครั้ง การเปลี่ยนวันที่ไม่แก้ปัญหาสิทธิ์'])
    if any(word in text for word in ('ไม่พบภาพ', 'no images', 'empty collection')):
        return guidance('no_imagery', 'ไม่พบภาพดาวเทียมที่ใช้ได้ในช่วงที่เลือก',
                        ['กดแนะนำช่วงวันที่จากดาวเทียม เพื่อตรวจช่วงอื่นในพื้นที่นี้',
                         'ลองช่วงยาวขึ้นถึง 120 วัน และเทียบฤดูกาลใกล้กันทั้งสองฝั่ง'], True)
    if any(word in text for word in ('30–120', 'ช่วงฐานต้อง', 'baseline_start', 'comparison_start', 'baseline_end', 'comparison_end')):
        return guidance('invalid_dates', 'ช่วงวันที่ไม่อยู่ในเงื่อนไขที่วิเคราะห์ได้',
                        ['เลือกช่วงละ 30–120 วัน ตั้งแต่ 1 ม.ค. 2019 ถึงวันนี้ โดยไม่รวมวันสิ้นสุด',
                         'ช่วงฐานต้องสิ้นสุดก่อนหรือเท่ากับวันเริ่มช่วงเปรียบเทียบ'], True)
    if 'ไม่พบงาน' in text:
        return guidance('job_expired', 'งานเดิมไม่อยู่ในเซิร์ฟเวอร์แล้ว',
                        ['กดเริ่มวิเคราะห์อีกครั้งโดยใช้วันที่เดิม'])
    if 'ชั้นภาพ' in text:
        return guidance('layer_unavailable', 'โหลดลิงก์ภาพดาวเทียมไม่สำเร็จ',
                        ['กดโหลดภาพใหม่เพื่อขอลิงก์ใหม่ แล้วตรวจการเชื่อมต่ออินเทอร์เน็ตและสิทธิ์ GEE',
                         'ยังไม่ต้องเปลี่ยนช่วงวันที่ ผลตัวเลขที่คำนวณแล้วจะใช้ชุดเดิม'])
    return guidance('service_error', 'บริการดาวเทียมไม่สามารถประมวลผลคำขอนี้ได้',
                    ['ลองอีกครั้งและตรวจการเชื่อมต่อ หากยังเกิดซ้ำ ให้ตรวจสิทธิ์หรือสถานะบริการ GEE'])


def result_guidance(result):
    missing = result.get('metrics', {}).get('missing')
    if not isinstance(missing, (int, float)) or not math.isfinite(missing):
        return None
    if missing > 1 - TARGET_FRACTION + 1e-9:
        return guidance('insufficient_observations', 'วันสังเกตที่ใช้ได้ร่วมกันของสองช่วงยังไม่เพียงพอ',
                        ['ตรวจวันใช้ได้ของ Sentinel-2 และ Dynamic World ในแต่ละช่วง ต้องมีอย่างน้อย 3 วันต่อพิกเซล',
                         'กดแนะนำช่วงวันที่จากดาวเทียม เพื่อหาช่วง 90–120 วันที่มีข้อมูลร่วมมากกว่าเดิม'], True)
    cells = result.get('cells', {}).get('features', [])
    if any(cell['properties'].get('classification') == 'insufficient' for cell in cells):
        return guidance('local_gaps', 'พื้นที่ส่วนใหญ่มีข้อมูลเพียงพอ แต่บางช่องยังมีข้อมูลขาด',
                        ['คลิกช่องสีเทาเพื่อดูวันสังเกตของช่องนั้น หรือค้นหาช่วงวันที่ที่มีข้อมูลร่วมมากขึ้น',
                         'การขยายกริดไม่ได้เพิ่มจำนวนภาพดาวเทียมที่มีอยู่'], True)
    return None


DATE_KEYS = ('baseline_start', 'baseline_end', 'comparison_start', 'comparison_end')


def candidates(requested, today):
    """At most four valid pairs. Candidate season alone never means sufficient data."""
    found = []

    def add(label, a, b, c, d):
        if a < date(2019, 1, 1) or c < date(2019, 1, 1) or d > today or b > c:
            return
        if not all(30 <= (end-start).days <= 120 for start, end in ((a,b),(c,d))):
            return
        values = dict(zip(DATE_KEYS, (day.isoformat() for day in (a,b,c,d))))
        if any(row['params'] == values for row in found):
            return
        found.append({'label': label, 'params': values})

    dates = [requested.get(key) for key in DATE_KEYS]
    if all(dates):
        add('ช่วงที่เลือก', *dates)
        a, _, c, _ = dates
        # Move both starts back equally when the longer comparison reaches today.
        shift = max(timedelta(0), c + timedelta(days=120) - today)
        a -= shift; c -= shift
        add('ขยายเป็น 120 วัน', a, a+timedelta(days=120), c, c+timedelta(days=120))
    current_year = today.year if today >= date(today.year, 4, 1) else today.year-1
    compare_year = min((requested.get('comparison_start') or date(current_year,1,1)).year, current_year)
    compare_year = max(2020, compare_year)
    base_year = (requested.get('baseline_start') or date(compare_year-1,1,1)).year
    base_year = max(2019, min(base_year, compare_year-1))
    add('ตรวจช่วง ม.ค.–มี.ค.', date(base_year,1,1), date(base_year,4,1),
        date(compare_year,1,1), date(compare_year,4,1))
    add('ตรวจช่วงต้นปี 120 วัน', date(base_year,1,1), date(base_year,1,1)+timedelta(days=120),
        date(compare_year,1,1), date(compare_year,1,1)+timedelta(days=120))
    add('ตรวจช่วง ต.ค.–ธ.ค.', date(base_year,10,1), date(base_year,12,30),
        date(compare_year,10,1), date(compare_year,12,30))
    return found[:4]


def format_checks(rows, observations, pid):
    checks = []
    for index, row in enumerate(rows):
        measured = observations[str(index)]
        area = measured['areas'].get('area')
        common = measured['areas'].get('common')
        fraction = common/area if area and common is not None else None
        checked = {**row, 'common_sufficient_fraction': fraction,
                   'eligible': fraction is not None and fraction >= TARGET_FRACTION - 1e-9,
                   'baseline': measured['baseline'], 'comparison': measured['comparison']}
        checks.append(checked)
    current = next((row for row in checks if row['label']=='ช่วงที่เลือก'), None)
    eligible = [row for row in checks if row['eligible']]
    eligible.sort(key=lambda row: (row is not current, -row['common_sufficient_fraction'],
                                  (date.fromisoformat(row['params']['comparison_end'])-date.fromisoformat(row['params']['comparison_start'])).days))
    if eligible:
        message = 'ช่วงที่เลือกผ่านเกณฑ์ข้อมูลร่วมแล้ว' if current and current['eligible'] else 'พบช่วงวันที่ที่ผ่านเกณฑ์ข้อมูลร่วม'
    else:
        message = 'ยังไม่พบช่วงที่ผ่านเกณฑ์ในช่วงที่ตรวจ ข้อมูลขาดจะยังแสดงเป็นสีเทา'
    return {'project_id': pid, 'criteria': {'minimum_days': MIN_DAYS, 'target_fraction': TARGET_FRACTION},
            'current': current, 'recommendations': eligible[:3], 'checks': checks, 'message': message,
            'actions': [] if eligible else ['ลองเลือกปีอื่นที่มีภาพ หรือกลับมาตรวจเมื่อมีภาพใหม่',
                                           'ยังไม่ควรตีความข้อมูลขาดว่าไม่มีต้นไม้']}
