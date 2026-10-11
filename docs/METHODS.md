# วิธีวิเคราะห์ ForestProof 1.0.1

วิธีคัดกรองทดลอง ไม่ใช่เกณฑ์วิทยาศาสตร์ที่ผ่าน calibration หรือการรับรองโครงการ

## ภาพและช่วงเวลา

Sentinel-2 `COPERNICUS/S2_SR_HARMONIZED` ใช้ surface reflectance B2/B3/B4/B8 คูณ 0.0001 ก่อนทำ RGB และ NDVI `(B8-B4)/(B8+B4)` ตัดตัวหารศูนย์ ไม่ใช้ QA60 ซึ่งความพร้อมเปลี่ยนในช่วงเวลาต่างกัน ใช้ Cloud Score+ `GOOGLE/CLOUD_SCORE_PLUS/V1/S2_HARMONIZED` เชื่อมด้วย system:index แล้วเก็บ `cs_cdf >= 0.60` พร้อมตัด SCL 1/3/8/9/10/11 (พิกเซลเสีย เงา เมฆ cirrus หิมะ) CS+ ออกแบบคัดกรองความชัดเจนรวมเมฆและเงา ค่าขีดแบ่งนี้เป็น exploratory ค่า QA ที่เชื่อมไม่พบจะเป็น no-data

Dynamic World `GOOGLE/DYNAMICWORLD/V1` ใช้ผล pretrained model จริง แบนด์ trees เป็น probability 0–1 มี mask เมฆและเงาของ dataset เอง เชื่อมกับ Sentinel-2 SR เฉพาะ scene index ที่ตรงกันและเพิ่ม mask แบบเดียวกัน จึงอาจมีภาพหรือวันใช้ได้ต่างจาก Sentinel-2 รายงาน IDs/วัน/จำนวนทั้งสองแหล่ง

รวม granules ที่ได้วันเดียวกันเป็น daily mosaic เพื่อไม่ให้นับ tile overlap เป็นวันสังเกตอิสระ Sentinel-2 composite เป็น median ของ daily reflectance/NDVI; tree probability เป็น mean ของ daily model outputs ตั้ง default projection ของ composites เป็น UTM ของพื้นที่ที่ 10 เมตร และใช้ scale/CRS เดียวกันทุก reducer ไม่มี bestEffort ที่เปลี่ยน scale เงียบ ๆ

ช่วง end เป็น exclusive ไม่มีการตีความ composite เป็นภาพในวันเดียว แสดง acquisition dates ของ scene ที่ตรงพื้นที่ พร้อม counts ต่อพิกเซลหลัง mask; scene ที่ตัดกับพื้นที่อาจไม่มีพิกเซลใช้ได้ทั้งหมด วันที่ latest ตรวจว่ามีพิกเซลผ่าน mask จริงก่อนเลือก แต่ยังไม่รับประกัน 3 วันครบทุกพิกเซล

## พื้นที่และค่ารวม

ขอบเขตตัวอย่างตรวจ valid polygon และพิกัดไทย พื้นที่เรขาคณิตคำนวณด้วย pyproj/Shapely ใน UTM zone 47N/48N ตามลองจิจูดโครงการ: 1 ไร่ = 1,600 ตร.ม.; 1 hectare = 10,000 ตร.ม. โครงการเล็กจึงใช้ CRS ท้องถิ่นได้ ความคลาดเคลื่อนจาก UTM และเส้นขอบพิกเซลยังมีอยู่

`metrics` ให้ค่าเฉลี่ยตาม available footprint ของแต่ละแบนด์; `comparable_metrics` จำกัดพิกเซลร่วมที่ S2 และ DW มีอย่างน้อย 3 วันในทั้งสองช่วง UI ใช้ comparable values เป็นค่าหลัก การขาดข้อมูลแสดง null/ขีด ไม่แทนด้วยศูนย์ ค่าครอบคลุม available คือสัดส่วนพิกเซลที่มีอย่างน้อย 1 วันจากทั้งสองแหล่งทั้งสองช่วง ส่วน insufficient area ใช้เกณฑ์อย่างน้อย 3 วัน

พื้นที่ประเภทหลักฐานคำนวณ `ee.Image.pixelArea()` grouped reduction จากภาพประเภทที่ไม่ทับซ้อน ที่ 10m เฉพาะ boundary mask ไม่บวกพื้นที่หน้าต่าง หน่วยผลสรุปแปลงจาก actual pixel area ระบบ EE มี boundary weighting/rasterization ทำให้ผลรวมพื้นที่พิกเซลอาจต่างเล็กน้อยจากพื้นที่ polygon ใน UTM ต้องไม่อ้างว่าพอดีกันทุกทศนิยม

## กฎประเภทหลักฐาน

พิกเซลต้องมี ≥3 วันจากแต่ละแหล่งในทั้งสองช่วงก่อน หากไม่ผ่านเป็น insufficient (เทา) ไม่ใช่พบการลดลง

| ประเภท | กฎทดลอง |
|---|---|
| มีต้นไม้อยู่เดิม (เขียวเข้ม) | tree probability ทั้งสองช่วง ≥0.60, abs(Δtree)<0.10 และ abs(ΔNDVI)<0.05 |
| พบสัญญาณต้นไม้เพิ่มขึ้น (เขียวอ่อน) | Δtree≥0.10 และ ΔNDVI≥0.05 |
| พบสัญญาณต้นไม้ลดลง (แดง) | Δtree≤−0.10 และ ΔNDVI≤−0.05 |
| ควรตรวจเพิ่มเติม (อำพัน) | กรณีอื่นที่มีข้อมูลพอ รวมการสวนทางและค่าที่ไม่ชัดเจน |
| ข้อมูลไม่เพียงพอ (เทา) | ไม่ผ่านจำนวนวันหรือ mask ทำให้ข้อมูลไม่มี |

## กริดและความไม่แน่นอน

หน้าต่าง default 50×50m, stride25m สร้างด้วย UTM **ไม่ใช้ degrees แทนเมตร** ตัดทุกหน้าต่างกับ polygon ก่อนส่ง GEE ใช้ reduceRegions แบบ batch ต่อทุกหน้าต่าง ไม่ยิง request แยกทุกช่อง ช่วงปลายขอบมีพื้นที่เล็กและตัวอย่างน้อยกว่า กริดที่ทับกันใช้ดูเฉพาะจุด ไม่บวกพื้นที่ และไม่ถือเป็นตัวอย่างอิสระ

เก็บค่า mean NDVI/tree/change, valid coverage, mean per-pixel acquisition-day counts, temporal standard deviation ของ daily NDVI/tree เมื่อมีอย่างน้อย 3 วัน, maximum-class confidence, missing fraction และ indicator disagreement รายละเอียดช่องอ่านจากผลที่บันทึก ไม่คำนวณใหม่ทุกครั้งที่คลิก

ประเภทของช่องใช้กฎเดียวกันกับค่าเฉลี่ยในช่อง แต่เมื่อ mean counts ไม่ผ่าน3 หรือพื้นที่ insufficient >20% จะแสดง insufficient นี่เป็นกฎแสดงช่องเพื่อคัดกรอง ไม่ใช่ผลประเภทพิกเซลที่ใช้คำนวณพื้นที่รวม

แผนที่ quality แสดง 0=ผ่านการคัดกรอง, 0.5=มีธงตรวจเพิ่มเติม, 1=ข้อมูลไม่พอ **ไม่ใช่ probability of error** ธงตรวจเพิ่มเติมคือ max-class confidence ต่ำกว่า0.60 ในช่วงใดช่วงหนึ่ง, NDVI SD>0.15 ในช่วงใดช่วงหนึ่ง, หรือ ΔNDVI×Δtree<0 แสดงองค์ประกอบในรายละเอียดช่อง Temporal SD ของ tree probability มีให้ตรวจด้วย แต่ไม่ได้รวมใน quality flag รุ่นนี้

จุดเสนอให้ตรวจเลือกเฉพาะช่องที่ไม่เป็น persistent จัดลำดับ mixed/decreasing ก่อน แล้วสัดส่วน disagreement แล้ว missing ใช้ representative point ที่อยู่ในช่องจริง เว้นระยะ ≥100m ใน UTM สูงสุด5จุด ไม่มีการลงพื้นที่จริง และไม่ต้องมี5จุดหากไม่มีพื้นที่ที่เข้าเกณฑ์

## แนวโน้มและการตีความ

แสดง4 seasonal windows ที่จบในปี comparison ย้อนหลังถึง2019 ใช้เดือน/วันเริ่มและจำนวนวันเดียวกัน (ปีอธิกสุรทินวันสิ้นสุดอาจต่าง1วัน) แต่ละปีคำนวณจริง จำกัดพิกเซลที่มี≥3วันทั้งสองแหล่ง ปีที่ไม่มีข้อมูลพอเป็น null ไม่ลากเส้นหรือเติมข้อมูลเพื่อให้กราฟเต็ม Coverage แต่ละปีอยู่ใน export (`sufficient`)

NDVI วัด greenness ไม่ใช่อัตรารอด biodiversity สุขภาพระบบนิเวศ หรือคาร์บอน Dynamic World tree probability ไม่ใช่สัดส่วนต้นไม้ปลูกที่รอดหรือ exact canopy fraction NDVI และ DW ใช้ภาพ Sentinel-2 ร่วมกัน ไม่ใช่หลักฐานอิสระ Small seedlings อาจต่ำกว่าความละเอียด 10m; พืชสีเขียวไม่ใช่ป่าเสมอ ความเปลี่ยนแปลงไม่พิสูจน์ผู้ก่อเหตุหรือผลจากโครงการสมมติ ไม่ตัดสิน fraud/greenwashing และไม่รับรองคาร์บอนเครดิต

## API

โหมดสองภาพใช้ RGB ช่วงฐานและช่วงเปรียบเทียบด้วยสเกล reflectance 0–0.30 เหมือนกัน `baseline_trees` / `comparison_trees` แสดงสีเขียวเมื่อค่าเฉลี่ย probability ของ trees ≥0.60 เฉพาะพิกเซลร่วมที่ผ่านจำนวนวันขั้นต่ำทั้งสองช่วง ใช้ความทึบ 0.45 เหมือนกัน และตัดด้วยขอบเขตเดียวกัน `comparison_insufficient` แสดงสีเทาความทึบ 0.55 เฉพาะพิกเซลภายในขอบเขตที่ข้อมูลร่วมไม่พอ พิกเซลนอกขอบเขตและพิกเซลที่ไม่ถึงเกณฑ์สีเขียวเป็นโปร่งใส ไม่ใช้สีเติมขอบเขตหรือกริดทับภาพ ไม่เปลี่ยนสูตรหรือเกณฑ์ของผลวิเคราะห์เดิม

การซูม เลื่อนภาพ และสวิตช์สีทำใน browser โดยไม่เริ่ม analysis ใหม่ ค่าที่แสดงใต้ภาพมาจาก `comparable_metrics` ซึ่งใช้พื้นที่ข้อมูลร่วม ไม่ใช่เปอร์เซ็นต์พื้นที่ต้นไม้

Layer metadata แต่ละชื่อมี `{url, expires_hint}` เมื่อพร้อม หรือ `{error}` เมื่อชั้นนั้นสร้างไม่ได้ เพื่อให้ภาพที่พร้อมยังแสดงได้ ถ้าทุกชั้นไม่พร้อม endpoint ตอบ 503 การโหลดใหม่สร้าง tile metadata ใหม่ ไม่วิเคราะห์ตัวเลขซ้ำ

| Endpoint | หน้าที่ |
|---|---|
| GET /api/health | พร้อมตั้งค่าสิทธิ์หรือไม่ (ยังไม่ใช่การตรวจ quota ทุกครั้ง) |
| GET /api/projects?q=&area_code=&company= | catalog / intersection filtering |
| GET /api/search?q= | autocomplete แยก project/company |
| GET /api/admin/provinces, districts?parent=, subdistricts?parent= | hierarchy + navigation bounds |
| GET /api/projects/{id}/grid?window_m=&stride_m= | clipped geometry ไม่มีผลดาวเทียม |
| POST /api/analysis | validate parameters, queue/background job/cache |
| GET /api/analysis/{job} | ขั้นตอนจริง |
| GET /api/analysis/{job}/summary, trends | ผลตัวเลขและ provenance |
| GET /api/analysis/{job}/layers | short-lived EE tile metadata; เรียกซ้ำเพื่อ refresh token |
| GET /api/analysis/{job}/grid, cells/{cell} | ผล reduceRegions / รายละเอียด on demand |

HTTP 503=ตั้งค่าสิทธิ์/บริการไม่พร้อม, 422=พารามิเตอร์ไม่ถูกต้อง, 429=ครบ2งาน, 409=ผลยังไม่เสร็จ, 404=ไม่พบข้อมูล Unknown processing errors บันทึก backend log และแสดงข้อความที่ไม่เผยข้อมูลสิทธิ์ ไม่มี fallback ผลจำลอง
