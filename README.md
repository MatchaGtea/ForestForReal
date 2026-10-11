# ForestForReal

เว็บภาษาไทยสำหรับสำรวจโครงการป่าสาธิต ดูภาพดาวเทียมก่อน–หลัง และอ่านสัญญาณต้นไม้ผ่าน NDVI และ Dynamic World พัฒนาจาก ForestProof ด้วย React, TypeScript, Leaflet และ Python FastAPI / Google Earth Engine

**เปิดทดลองและส่งให้เพื่อน:** [matchagtea.github.io/ForestForReal](https://matchagtea.github.io/ForestForReal/)

> โครงการ บริษัท และขอบเขตเป็นข้อมูลสาธิตสมมติ ภาพดาวเทียมและค่าที่แสดงมาจากข้อมูลจริง ไม่ใช่ผลสุ่ม ไม่ใช่การรับรองป่า คาร์บอนเครดิต หรือการยืนยันว่าใครทำให้พื้นที่เปลี่ยนแปลง

## ลองบน GitHub Pages

ไม่ต้องติดตั้ง ไม่ต้องล็อกอิน และไม่ต้องใส่ API key

1. เปิดลิงก์แล้วกด **ลองดอยสุเทพ**
2. กด **เปิดผลที่บันทึกไว้** เพื่อดูภาพก่อน–หลังพร้อมกริดสี
3. ซูม/เลื่อนสองฝั่งพร้อมกัน เปิด–ปิดสัญญาณต้นไม้ คลิกช่องหรือจุดตรวจ และดูค่าของแต่ละช่วงได้
4. กด **เปิดตั้งค่า → เลือกช่วงวันที่ที่บันทึกไว้ → ใช้ช่วงวันที่นี้** แล้วเปิดผลของช่วงนั้น
5. กด **แผนที่เดียว** เพื่อสำรวจ ค้นหาโครงการ/บริษัท และกรองจังหวัด อำเภอ ตำบล รองรับมือถือและ keyboard

GitHub Pages เป็น static hosting: รุ่นออนไลน์นี้อ่าน **ผลวิเคราะห์จริงที่บันทึกไว้** และภาพ PNG ที่ส่งออกจาก GEE ไม่เรียกคำนวณใหม่ ไม่เรียกภาพล่าสุด และไม่ประมาณผลของวันที่อื่น วันที่ที่ไม่มีผลบันทึกจะแจ้งให้เลือกช่วงที่มีข้อมูล หากต้องการวิเคราะห์ช่วงใหม่ใช้รุ่น local ด้านล่าง

### ชุดผลที่เปิดลองได้

ทุกช่วงไม่นับรวมวันสิ้นสุด ใช้หน้าต่าง 50 เมตร / ระยะเลื่อน 25 เมตร

| โครงการสาธิต | ก่อน | หลัง | พื้นที่ผ่านเกณฑ์ข้อมูลร่วม ≥ 3 วัน |
|---|---|---|---|
| FP-001 ดอยสุเทพ | 2023-01-01 → 2023-04-01 | 2025-01-01 → 2025-04-01 | 100% |
| FP-001 ดอยสุเทพ | 2025-01-01 → 2025-04-01 | 2026-01-01 → 2026-04-01 | 100% |
| FP-001 ดอยสุเทพ | 2025-07-13 → 2025-10-11 | 2026-07-13 → 2026-10-11 | 0% — ตัวอย่างข้อมูลไม่พอ |
| FP-002 ดอยอินทนนท์ | 2023-01-01 → 2023-04-01 | 2025-01-01 → 2025-04-01 | 100% |
| FP-004 เขาใหญ่ | 2023-01-01 → 2023-04-01 | 2025-01-01 → 2025-04-01 | 100% |

ยังสำรวจโครงการทั้ง 10 แห่งได้ แต่รุ่น Pages มีผลบันทึกเฉพาะ 3 แห่งข้างต้น `frontend/public/demo/manifest.json` ระบุเวลาคำนวณ ช่วงวันที่ วิธีวิเคราะห์ และแหล่งข้อมูล แต่ละชุดเก็บ summary, grid และภาพพร้อม SHA-256 ไม่มีลิงก์ GEE หรือ token ที่หมดอายุ

สีกริดเป็นผลเปรียบเทียบร่วมของสองช่วง ไม่ใช่ค่าต้นไม้แยกช่วง ความน่าจะเป็นต้นไม้ไม่ใช่เปอร์เซ็นต์พื้นที่ป่าหรืออัตรารอด ข้อมูลขาดแสดงแยกเป็นสีเทาและ `null` ไม่แทนด้วยศูนย์

## รันเองเพื่อวิเคราะห์ GEE ใหม่

ใช้ Node.js 22.12+ และ Python 3.12+ บัญชี Earth Engine ต้องมีสิทธิ์ใน Cloud project ที่ลงทะเบียนใช้งาน Earth Engine และเปิด Earth Engine API แล้ว

### macOS / Linux

```sh
git clone https://github.com/MatchaGtea/ForestForReal.git
cd ForestForReal
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
cp .env.example .env
# แก้ .env: GEE_PROJECT_ID เป็น project ของคุณ
.venv/bin/earthengine authenticate
.venv/bin/earthengine set_project YOUR_PROJECT_ID
cd frontend
npm ci
cd ..
```

Terminal 1 จาก root:

```sh
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Terminal 2:

```sh
cd frontend
npm run dev
```

เปิด http://127.0.0.1:5173 · API docs: http://127.0.0.1:8000/docs

### Windows PowerShell

```powershell
git clone https://github.com/MatchaGtea/ForestForReal.git
cd ForestForReal
python -m venv .venv
.venv\Scripts\python -m pip install -r backend/requirements.txt
Copy-Item .env.example .env
# แก้ .env: GEE_PROJECT_ID เป็น project ของคุณ
.venv\Scripts\earthengine authenticate
.venv\Scripts\earthengine set_project YOUR_PROJECT_ID
cd frontend
npm ci
cd ..
.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

เปิดอีก terminal แล้ว `cd frontend` และ `npm run dev` หรือใช้ `scripts/start-dev.ps1` หลังติดตั้ง

อย่าคัดลอก `.env.example` ทับ `.env` ที่ตั้งแล้ว หากสิทธิ์หมดอายุ ใช้ `earthengine authenticate --force` และเปิด backend ใหม่ รายละเอียด: [GEE authentication](https://developers.google.com/earth-engine/guides/auth), [Cloud project setup](https://developers.google.com/earth-engine/cloud/earthengine_cloud_project_setup)

Service account เป็นทางเลือกสำหรับ backend: ตั้ง `GEE_AUTH_MODE=service_account` และ `GOOGLE_APPLICATION_CREDENTIALS` เป็น path ของไฟล์ key **นอก repo** ไม่ใช้ใน GitHub Pages และไม่ส่งให้ browser

## ความสามารถของรุ่น local

- ภาพ RGB ก่อน–หลังใช้สเกลสีเดียวกัน ตัดเฉพาะขอบเขตตัวอย่าง แผนที่ซิงก์ตำแหน่งและซูม
- NDVI, ความน่าจะเป็นต้นไม้, ผลต่าง, คุณภาพข้อมูล, กริด, จุดที่เสนอให้ตรวจ และ provenance ดาวน์โหลดเป็น JSON
- ช่วงละ 30–120 วัน ตั้งแต่ปี 2019 หรือเลือกภาพล่าสุดที่มีข้อมูลใน 90 วันเทียบฤดูเดียวกันปีก่อน
- เมื่อข้อมูลไม่พอ **แนะนำช่วงวันที่จากดาวเทียม** ตรวจ GEE จริงไม่เกิน 4 คู่ เสนอเฉพาะคู่ที่ ≥ 80% ของพื้นที่ร่วมมี Sentinel-2 และ Dynamic World ≥ 3 วันต่อพิกเซลต่อช่วง
- Error แยกคำแนะนำเรื่องวันที่ เมฆ/จำนวนวัน สิทธิ์ GEE กริดหนาแน่น และบริการหมดเวลา
- เปลี่ยนวันที่/โครงการจะล้างผลเก่า ป้องกันคำตอบล่าช้า ซูม/เลื่อน/สวิตช์สีไม่สร้างงานใหม่
- จำกัด 2 งานพร้อมกัน / 800 หน้าต่าง ผลตัวเลขแคช 24 ชั่วโมง (Latest 1 ชั่วโมง) ผลตรวจวันที่ 6 ชั่วโมง

Backend เป็นต้นแบบ **หนึ่ง process** งานในหน่วยความจำหายเมื่อ restart คงผลตัวเลขใน disk cache สำหรับการใช้หลายคนต้องเพิ่ม authentication, rate limiting, job persistence และการควบคุม quota ก่อนเปิด backend สาธารณะ

## สร้างและเผยแพร่ Pages

เว็บนี้เผยแพร่จาก branch **`gh-pages` / root** โดย build และสแกนในเครื่องก่อน push GitHub Pages จะนำ branch นี้ไป deploy โดยอัตโนมัติ ไม่ต้องตั้งเซิร์ฟเวอร์หรือใส่ GEE secrets

เผยแพร่เวอร์ชันใหม่หลัง `npm ci` และติดตั้ง [Gitleaks](https://github.com/gitleaks/gitleaks), GitHub CLI และล็อกอิน GitHub แล้ว:

```sh
python3 scripts/publish_pages.py
```

สคริปต์ build โหมดผลบันทึก สแกนด้วย Gitleaks และอัปเดต `gh-pages` ด้วย commit ใหม่โดยไม่ force push สามารถส่ง path ของ Gitleaks ด้วย `--gitleaks /path/to/gitleaks`

มี workflow `pages.yml` และ `checks.yml` สำหรับใช้ Actions ภายหลัง แต่ปิดไว้ในบัญชีนี้: GitHub แจ้งว่าบัญชีมี billing issue และไม่เริ่มงาน Actions ทั่วไป การ deploy แบบ branch สำเร็จและไม่ต้องใช้ workflow สองไฟล์นี้ หากจะเปลี่ยนไป Actions ให้แก้ข้อจำกัดบัญชีก่อน เปิด workflow และเปลี่ยน Pages publishing source เป็น GitHub Actions

ลอง build แบบเดียวกับ Pages บน macOS / Linux:

```sh
cd frontend
npm ci
VITE_DEMO_MODE=true VITE_BASE_PATH=/ForestForReal/ npm run build
npm run preview
```

เปิด `/ForestForReal/` บน URL ที่ preview แสดง สำหรับ PowerShell ตั้ง `$env:VITE_DEMO_MODE="true"` และ `$env:VITE_BASE_PATH="/ForestForReal/"` ก่อน build

ถ้าเปลี่ยนชื่อ repo ให้ส่ง `--repo OWNER/NEW_REPO` ให้สคริปต์ และแก้ `VITE_BASE_PATH` ใน workflow ด้วยหากใช้ Actions Frontend รองรับ `VITE_API_BASE_URL` สำหรับ backend แยก แต่ทุกค่า `VITE_*` เปิดเผยต่อผู้เข้าชม ต้องใส่เฉพาะ URL/feature flag ห้ามใส่ secrets ดู [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)

## ความปลอดภัยของ token / key

ดู [SECURITY.md](SECURITY.md) `.gitignore` กัน `.env*`, credentials, service-account JSON, private keys, caches, logs และ virtual environments ไฟล์ตัวอย่างไม่มีข้อมูลบัญชีจริง

- GEE credentials อยู่ในเครื่องหรือ backend เท่านั้น
- Pages มีภาพ PNG และ JSON จาก public datasets ไม่มี GEE tile/thumbnail URL, access/refresh token หรือ key
- GitHub Actions ใช้ token ชั่วคราวของระบบพร้อมสิทธิ์สำหรับ build/deploy เท่าที่จำเป็น ไม่ใช้ PAT
- ก่อนเผยแพร่ สแกน staged source และ `frontend/dist` ด้วย Gitleaks และตรวจรายการไฟล์ที่จะอัปโหลด

## ตรวจสอบ

```sh
.venv/bin/python -m pytest backend/tests -q
cd frontend
npm run build
npm test
npm run test:pages
```

`npm test` ใช้ local backend และ Vite ที่เปิดอยู่ พร้อม Chrome ผ่าน Playwright; `test:pages` เปิด build แบบ static ใต้ `/ForestForReal/` เอง ไม่ต้องใช้ backend หรือ GEE credentials

Tests ตรวจการค้นหา/ตัวกรอง โหมดก่อน–หลัง ซิงก์แผนที่ ข้อมูลไม่พอ คำแนะนำ error คำตอบเก่า และเว็บ Pages ที่ใช้ผลบันทึก สำหรับทวน GEE จริงเพิ่มเติมใช้ `frontend/scripts/evidence-smoke.mjs` หรือ `comparison-smoke.mjs` หลังตั้งสิทธิ์ GEE แล้ว

ส่งออกชุด demo ใหม่ด้วยสิทธิ์ GEE local และผลจริงที่ได้จาก backend:

```sh
.venv/bin/python scripts/export_demo.py --results PATH_TO_RECORDED_RESULT.json --date-checks PATH_TO_DATE_CHECK.json
```

สคริปต์ใช้วิธีวิเคราะห์เดิม ส่งออกเฉพาะไฟล์ที่ระบุ และดาวน์โหลดภาพ PNG โดยไม่บันทึก URL/token ตรวจชุดผลและสแกน secrets อีกครั้งก่อน commit

## โครงสร้าง

```text
backend/                 FastAPI, real GEE analysis, date advice, tests
backend/data/            fictional projects, public admin data and licenses
frontend/src/            Thai UI, maps, date advice and recorded-data adapter
frontend/public/demo/    real recorded results and rendered PNGs for Pages
frontend/tests/          local browser tests
frontend/pages-tests/    static Pages browser tests
scripts/                 startup, catalog audit and safe demo export
.github/workflows/       build, checks and GitHub Pages deployment
docs/                    methods, sources and existing validation notes
```

## แหล่งข้อมูลและข้อจำกัด

ภาพ RGB / NDVI: [Copernicus Sentinel-2](https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_SR_HARMONIZED), contains modified Copernicus Sentinel data. สัญญาณต้นไม้: [Dynamic World](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1), Google / WRI, CC BY 4.0. การกรองเมฆ: [Cloud Score+](https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_CLOUD_SCORE_PLUS_V1_S2_HARMONIZED), CC BY 4.0. ชื่อ/ขอบเขตการปกครองมี attribution และสำเนา license ใน `backend/data` ภาพฐาน OpenStreetMap / Esri ใช้ระบุตำแหน่งและไม่ใช้คำนวณ

NDVI กับ Dynamic World ใช้ Sentinel-2 ร่วมกัน จึงไม่ใช่หลักฐานอิสระ กล้าไม้เล็กอาจไม่ปรากฏ พืชเขียวไม่ใช่ป่าเสมอไป ขอบเขตเป็นตัวอย่าง ไม่ยืนยันกรรมสิทธิ์ ต้องตรวจด้วยหลักฐานอื่นและการลงพื้นที่

อ่านต่อ: [วิธีวิเคราะห์](docs/METHODS.md) · [แหล่งข้อมูล](docs/DATA_SOURCES.md) · [การตรวจเดิมของ ForestProof](docs/VALIDATION.md)
