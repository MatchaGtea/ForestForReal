# แหล่งข้อมูลและการวางขอบเขตตัวอย่าง

ตรวจเอกสาร/ดาวน์โหลดเมื่อ 10 ตุลาคม 2026 ทุกบริษัท ชื่อโครงการ วันที่เริ่ม คำกล่าวอ้าง และพื้นที่รายงานเป็นสมมติ รูป polygon เป็นเพียง **illustrative boundary** ไม่แสดงว่ามีโครงการจริงอยู่ในสถานที่เหล่านี้

## Administrative data

- ชื่อและ parent codes: [thailand-geography-data/thailand-geography-json](https://github.com/thailand-geography-data/thailand-geography-json) โดย Joe Takara, MIT; bundled 77 provinces, 928 districts, 7,436 subdistricts เก็บ license ใน `backend/data/ADMIN_LOOKUP_LICENSE.txt`
- ขอบเขต: [DevelopedbyWill/thailand-canonical-admin-names](https://github.com/DevelopedbyWill/thailand-canonical-admin-names), data/v1.0.0/ADM1/2/3 polygons, CC BY4.0; ต้นทาง [piyayut-ch/mapthai](https://github.com/piyayut-ch/mapthai), Piyayut Chitchumnong, MIT เก็บ NOTICE, LICENSE-DATA และ upstream MIT license ใน backend/data
- ปัจจุบัน snapshot รูปทรงเป็นข้อมูลย่อ ที่ระบุวันที่2019 มี77 /928 /7,425 distinct polygon codes (ข้อมูลชื่อใหม่กว่ารูปทรง บางรหัสเก่าหายหรือเปลี่ยน) 14รหัสชื่อไม่มี geometry: เขตใหม่ในกรุงเทพฯ13รหัส และตำบลท่าแฝก530407 ในอุตรดิตถ์ UIแจ้งเมื่อเลือกแล้วนำทางไปขอบเขตแม่ ไม่อ้างว่าขอบเขตแม่นยำหรือเป็นปัจจุบัน
- Geometry อำเภอ/จังหวัดสำหรับ filtering/navigation ประกอบจาก union ของ child polygons ที่มีและ parent codes ของ hierarchy เพื่อให้ขอบเขตที่ย่อคนละระดับไม่ทำให้โครงการในตำบลหายจากอำเภอแม่ ถ้าไม่มี child geometry ใช้รูปต้นทางระดับแม่ รูปย่ออาจซ้อน/มีช่องว่าง/ผิดจากขอบเขตจริง ไม่ใช้เป็นหลักฐานกรรมสิทธิ์
- Filter projects ใช้ intersection กับ polygon ไม่ใช้ centroid แต่ marker ที่แสดงตำแหน่งโดยประมาณไม่ใช้ตัดสินเขตโครงการ โครงการเขาหลวงตัด2อำเภอ/2ตำบลได้ ข้อจำกัดบริเวณขอบจาก simplification และรหัสที่ขาดยังคงมีอยู่

## Satellite data

เอกสารทางการที่ตรวจระหว่างพัฒนา:

- [Sentinel-2 SR Harmonized](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED), Copernicus Sentinel terms, reflectance scale0.0001
- [Cloud Score+](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED), Google, CC BY4.0
- [Dynamic World V1](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1), Google/WRI, CC BY4.0, pretrained tree probabilities10m
- แผนที่พื้นฐาน: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL; optional Esri World Imagery พร้อม attribution ของ provider ภาพฐานไม่ใช้ในการวิเคราะห์และ acquisition dates อาจต่างกัน

## Siting audit (ไม่ใช่การวิเคราะห์โครงการ)

เลือกพื้นที่ภูเขา/ป่าจริง10แห่งจากหลายภูมิภาค โดยไม่ได้ดู gain/loss ก่อนเลือก ส่วนใหญ่เป็น existing-forest monitoring อีก2รายการมี restoration claim สมมติที่อาจไม่มีหลักฐานรองรับ ไม่ย้ายขอบเขตเพื่อสร้างผลบวก/ลบที่น่าประทับใจ

ตรวจขอบเขตกับ [ESA WorldCover 2021 v200](https://esa-worldcover.org/en/data-access), CC BY4.0, พิกเซล10m จาก public Cloud Optimized GeoTIFF บน AWS โดย rasterio `scripts/check_locations.py` อ่านจุดกลางและมุมทั้ง6จุดของแต่ละ polygon ทุกจุดที่อ่านจริงเป็น class10 (Tree cover) เก็บ URL/พิกัด/ค่าอ่านใน `backend/data/location-audit.json` ไม่มีค่า NDVI หรือสถิติ trend จากขั้นตอนนี้

การตรวจเป็นการ sampling บนแผนที่ปี2021 ไม่ใช่การยืนยัน forest ทุกพิกเซล/สภาพปัจจุบัน ประวัติ restoration หรือโครงการจริง ไม่รับประกันคุณภาพ ecological หรือกรรมสิทธิ์ ภาพ WorldCover ใช้เลือกภูมิประเทศเท่านั้น; analytical outputsใช้ Sentinel-2/DW ผ่าน GEE

| ID | ภูมิประเทศจริง | จังหวัดที่ตั้งตัวอย่าง | ลองจิจูด / ละติจูดโดยประมาณ | ประเภทคำกล่าวอ้างสมมติ |
|---|---|---|---|---|
| FP-001 | ดอยสุเทพ | เชียงใหม่ | 98.901 /18.807 | ดูแลป่าเดิม |
| FP-002 | ดอยอินทนนท์ | เชียงใหม่ | 98.492 /18.558 | ดูแลป่าเดิม |
| FP-003 | ภูหลวง | เลย | 101.520 /17.265 | ดูแลป่าเดิม |
| FP-004 | เขาใหญ่ | นครราชสีมา | 101.373 /14.445 | ดูแลป่าเดิม |
| FP-005 | แก่งกระจาน | เพชรบุรี | 99.382 /12.858 | ดูแลป่าเดิม |
| FP-006 | ห้วยขาแข้ง | อุทัยธานี | 99.286 /15.604 | ดูแลป่าเดิม |
| FP-007 | เขาสก | สุราษฎร์ธานี | 98.519 /8.940 | ดูแลป่าเดิม |
| FP-008 | เขาหลวง | นครศรีธรรมราช | 99.739 /8.492 | ดูแลป่าเดิม |
| FP-009 | ดอยภูคา | น่าน | 101.082 /19.205 | อ้างว่าฟื้นฟู |
| FP-010 | เขาชะเมา | ระยอง | 101.725 /12.925 | อ้างว่าฟื้นฟู |

บริษัท ใบไม้วันใหม่/รากรักษ์ภูผา/ธารพนาอนาคต/เมล็ดฝันสีเขียว เป็นชื่อสมมติ ไม่มีโลโก้หรือความเกี่ยวข้องกับบริษัทจริง บริษัทหนึ่งมีหลายโครงการต่างจังหวัดเพื่อทดสอบ company search

ถ้าต้องการทวน siting audit ติดตั้ง `pip install rasterio` ใน virtualenv แล้วรัน `python scripts/check_locations.py` ไม่ใช่ dependency ของเซิร์ฟเวอร์ runtime
