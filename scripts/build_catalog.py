"""No environmental statistics here. Fictional records, geographic polygons only."""
import json
from pathlib import Path

locations = [
    ('ดอยสุเทพ', 'เชียงใหม่', 98.901, 18.807, 'conservation'),
    ('ดอยอินทนนท์', 'เชียงใหม่', 98.492, 18.558, 'conservation'),
    ('ภูหลวง', 'เลย', 101.520, 17.265, 'conservation'),
    ('เขาใหญ่', 'นครราชสีมา', 101.373, 14.445, 'conservation'),
    ('แก่งกระจาน', 'เพชรบุรี', 99.382, 12.858, 'conservation'),
    ('ห้วยขาแข้ง', 'อุทัยธานี', 99.286, 15.604, 'conservation'),
    ('เขาสก', 'สุราษฎร์ธานี', 98.519, 8.940, 'conservation'),
    ('เขาหลวง', 'นครศรีธรรมราช', 99.739, 8.492, 'conservation'),
    ('ดอยภูคา', 'น่าน', 101.082, 19.205, 'restoration'),
    ('เขาชะเมา', 'ระยอง', 101.725, 12.925, 'restoration'),
]
companies = ['บริษัท ใบไม้วันใหม่ (สมมติ)', 'บริษัท รากรักษ์ภูผา (สมมติ)',
             'บริษัท ธารพนาอนาคต (สมมติ)', 'บริษัท เมล็ดฝันสีเขียว (สมมติ)']
projects = []
for i, (place, province, x, y, category) in enumerate(locations):
    ring = [[x-.0008,y-.0005],[x-.0003,y-.0009],[x+.0008,y-.0006],
            [x+.001,y+.0003],[x+.0003,y+.0009],[x-.0007,y+.0006],[x-.0008,y-.0005]]
    projects.append({'id': f'FP-{i+1:03}', 'name': f'โครงการสาธิต · {place}', 'company': companies[i%4],
                     'category': category, 'landscape': place, 'province': province,
                     'start_date': f'{2020+i%4}-02-01', 'reported_rai': 20+i*2,
                     'claim': 'อ้างว่าฟื้นฟูพื้นที่และปลูกกล้าไม้' if category == 'restoration' else 'อ้างว่าดูแลรักษาป่าที่มีอยู่เดิม',
                     'mock': True, 'boundary_label': 'illustrative boundary',
                     'geometry': {'type': 'Polygon', 'coordinates': [ring]}})
Path('backend/data/projects.json').write_text(json.dumps(projects,ensure_ascii=False,indent=2),encoding='utf-8')
