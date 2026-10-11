# ผลตรวจสอบ ForestProof

## โหมดเปรียบเทียบก่อน–หลัง · 11 ตุลาคม 2026

- ใช้ Cloud project ที่บัญชีทดสอบมีสิทธิ์ตามที่ผู้ใช้อนุญาต ใช้ local credentials เดิมโดยไม่คัดลอก secret จากเว็บเดิม (ข้อมูลการตั้งค่าของเครื่องไม่เผยแพร่ใน repo)
- Production build: `npm run build` ผ่าน TypeScript และ Vite
- Backend รวมการประเมิน mask ด้วย Earth Engine จริง: `FORESTPROOF_TEST_GEE=1 .cache/venv-macos/bin/python -m pytest backend/tests -q --disable-warnings` **10 passed** ตรวจ threshold 0.60, probability ต่ำ/ศูนย์เป็นโปร่งใส, ข้อมูลไม่เพียงพอแยกเป็นสีเทา และทุก mask ถูกตัดตามขอบเขต
- Playwright Chrome: `npm test` **45 passed** บน desktop 1440×1000, tablet 900×1000 และ mobile 390×844 รวมชุดเดิม และโหมดสองภาพ วันที่ตรงฝั่ง การกลับไปโครงการเดิม การเลื่อนด้วยคีย์บอร์ด/เมาส์ ซูม/กริด/สวิตช์ การเปลี่ยนวันที่หรือโครงการระหว่างโหลด HTTP503 และลิงก์ภาพหมดอายุ HTTP410 พร้อมโหลดใหม่
- Live browser smoke ใช้ FP-001 ช่วง 2023-01-01–2023-04-01 เทียบ 2025-01-01–2025-04-01 และผลแคชเดิม สร้างชั้นภาพใหม่จาก GEE ทั้ง RGB สัญญาณต้นไม้ และข้อมูลไม่เพียงพอ ไม่ใช้ภาพ/ค่าจำลองในเว็บ
- ภาพจริงโหลดครบทั้งสามขนาด ตำแหน่งขอบเขตหลังซูม/เลื่อนตรงกันภายใน 2 px สวิตช์สีและกริดทำงาน และมี POST วิเคราะห์เพียงครั้งเดียวต่อหน้า ไม่มี JavaScript page error, Vite error overlay หรือ horizontal overflow
- เก็บภาพหลัง tile fade จบ ทั้งสีสัญญาณต้นไม้และ RGB ใน `/tmp/forestproof-comparison-smoke` พร้อม `validation.json` โดยไม่บันทึก URL ที่มี token ลงรายงาน ผลต่างแสดงละเอียดถึง 6 ตำแหน่งเพื่อไม่ปัดค่าจริงขนาดเล็กเป็นศูนย์
- การตรวจสดครอบคลุมหนึ่งโครงการและสองช่วงเวลา ข้อจำกัดของวิธีวิเคราะห์เดิมด้านล่างยังคงใช้

## บันทึกเดิม · 10 ตุลาคม 2026

### ผ่านแล้ว

- Production frontend build: `npm run build` ผ่าน TypeScript และ Vite build
- Backend: `pytest backend/tests -q` **8 passed** ตรวจ hierarchy, search/company, area intersections, cross-boundary behavior, UTM area/unit conversion, clipping, overlapping-window area pitfall, evidence/no-data classification, cache identity, missing GEE configuration และ input limits
- Playwright Chrome: **18 passed** ใน desktop1440×1000, tablet900×1000, mobile390×844 ตรวจ search outside area resets filters, company multi-location markers, map/list selection synchronization, province/district/subdistrict cascading, keyboard selection, no horizontal overflow, controls accessible และ HTTP503ไม่แสดงผลวิเคราะห์
- Siting audit: โครงการ10แห่ง จุดกลาง+มุม6จุด/โครงการอ่านจริงจาก ESA WorldCover2021v200 ทั้ง70จุดเป็น class10 Tree cover ดูพิกัดและ URL ใน location-audit.json ไม่ใช่การตรวจทุกพิกเซล
- Earth Engine **เรียกใช้จริงสำเร็จ** ด้วยข้อมูลสิทธิ์ local ที่มีในเครื่องและ Cloud project ที่ตั้งไว้ในเครื่องทดสอบ ไม่ต้องสร้างหรือคัดลอก secret ลง repository
- รันผ่าน background API จน complete จริง ด้วย FP-001, Jan1–Apr1 2023 เทียบ Jan1–Apr1 2025, window50m/stride25m, method forestproof-1.0.1 ได้60ช่อง พร้อม seasonal trends2022–2025
- Summary/trends/grid/cell/layer endpoints ส่ง HTTP200; สร้าง layer metadataครบ6แบบ; EE tile response HTTP200 image/png และทดสอบโหลด actual tile ใน browser
- Live UI smoke: ผลจริงแสดงใน UI, evidence layer โหลด, before/after sliderทำงาน, ไม่พบ JavaScript page error และ overflow รูป screenshotอยู่ใน frontend/test-results (ไม่ commit artifacts ทดสอบ)

## ตัวอย่างผลจริงที่ทวนได้ (ไม่ใช่ผลการดำเนินงานของโครงการ)

FP-001 เป็น **ขอบเขตตัวอย่างสมมติ** ที่ป่าดอยสุเทพ พื้นที่ geometry17.3425ไร่/2.7748ha

| ค่า | ช่วงฐาน2023 | ช่วงเปรียบเทียบ2025 |
|---|---|---|
| Median-composite NDVI เฉลี่ยบน footprintร่วม | 0.816454 | 0.863119 |
| Mean tree probability | 0.724582 | 0.724845 |
| วัน Sentinel-2 ต่อพิกเซล เฉลี่ย | 15 | 12 |
| วัน Dynamic World ต่อพิกเซล เฉลี่ย | 14 | 12 |
| acquisitionแรก–ท้าย Sentinel-2 ที่ตรงพื้นที่ | 2023-01-04–2023-03-30 | 2025-01-03–2025-03-29 |

ΔNDVI0.046664, Δtree0.000263, available coverage100%, raster evidence: persistent10.0261ไร่, mixed7.3254ไร่, increasing/decreasing/insufficient0ไร่ ค่าศูนย์เหล่านี้มาจากกลุ่มพิกเซลที่ไม่พบในการคำนวณจริง ไม่ใช่ค่าตัวอย่าง ผลรวมพื้นที่ raster17.3516ไร่ต่างจาก geometryเล็กน้อยจาก projection/boundary rasterization ไม่มีการบวกพื้นที่60หน้าต่างที่ทับซ้อนกัน

ค่าจริงอาจต่างเล็กน้อยเมื่อ datasetปรับย้อนหลัง/แคชหมดอายุ โปรด export JSON ในหน้าโครงการเพื่อเก็บ IDs, dates, parameters, datasets และ method version ของการเรียกแต่ละครั้ง ผลนี้ไม่พิสูจน์ว่าโครงการสมมติสร้างผลเปลี่ยนแปลง

## ข้อที่ยังต้องตรวจเพิ่ม

- การทดสอบสดครอบคลุม1โครงการ/2ช่วงและ4ปี trend ไม่ใช่ validationครบทุกพื้นที่/ฤดู/สภาพเมฆ
- Local credential modeทดสอบแล้ว; service-account mode และ latest-window selection มี implementation แต่ยังไม่ได้รันทวนสดแบบ end-to-end
- กฎ evidence/quality เป็น exploratory ยังไม่มี field calibration, accuracy assessment หรือการตรวจภาคสนาม
- ขอบเขตย่อจากปี2019และ14รหัสตำบลไม่มี geometry ไม่เหมาะสำหรับสรุปกรรมสิทธิ์หรือพื้นที่ทางกฎหมาย
- มี deprecation warnings จาก Shapely transform และ Starlette/httpx test adapter; testsผ่าน ไม่มี runtime failure ใน integrationที่ตรวจ แต่ควรทวนเมื่ออัปเดต dependencies
- Jobs in-memory/2threads เหมาะกับต้นแบบlocal ยังไม่ทดสอบproduction load, persistentqueue, multiplebackendworkers หรือ deployment
