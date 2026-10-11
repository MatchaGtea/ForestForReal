import json
import os
import logging
import time
import uuid
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta, datetime, timezone
from pathlib import Path
from typing import Literal
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / '.env')
from . import engine, advice
from .catalog import PROJECTS, ADMIN, GEOMETRIES, browse, search
from .geo import grid, cache_key

app = FastAPI(title='ForestProof', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=[os.getenv('FRONTEND_ORIGIN','http://localhost:5173')],
                   allow_methods=['GET','POST'],allow_headers=['Content-Type'])
cache_dir = Path(os.getenv('CACHE_DIR', '.cache'))
if not cache_dir.is_absolute():cache_dir = ROOT / cache_dir
cache_dir.mkdir(parents=True,exist_ok=True)
pool = ThreadPoolExecutor(max_workers=2)
jobs = {}
lock = threading.Lock()
date_checks = threading.BoundedSemaphore(1)


class AnalysisRequest(BaseModel):
    project_id: str = Field(max_length=16)
    baseline_start: date
    baseline_end: date
    comparison_start: date
    comparison_end: date
    window_m: int = Field(default=50,ge=20,le=200)
    stride_m: int = Field(default=25,ge=10,le=200)
    latest: bool = False

    @model_validator(mode='after')
    def windows(self):
        if self.latest:return self
        today = date.today()
        for start,end in [(self.baseline_start,self.baseline_end),(self.comparison_start,self.comparison_end)]:
            if start < date(2019,1,1) or end > today or not 30 <= (end-start).days <= 120:
                raise ValueError('ใช้ช่วง 30–120 วัน ตั้งแต่ปี 2019 ถึงวันนี้ (วันสิ้นสุดไม่นับรวม)')
        if self.baseline_end > self.comparison_start:
            raise ValueError('ช่วงฐานต้องอยู่ก่อนช่วงเปรียบเทียบ')
        return self


class DateCheckRequest(BaseModel):
    baseline_start: date | None = None
    baseline_end: date | None = None
    comparison_start: date | None = None
    comparison_end: date | None = None
    latest: bool = False


@app.exception_handler(HTTPException)
async def explain_http_error(request:Request, exc:HTTPException):
    return JSONResponse(status_code=exc.status_code, headers=exc.headers,
                        content={'detail':exc.detail, 'guidance':advice.failure(Exception(str(exc.detail)),exc.status_code)})


@app.exception_handler(RequestValidationError)
async def explain_validation(request:Request, exc:RequestValidationError):
    if not (request.url.path == '/api/analysis' or request.url.path.endswith('/date-suggestions')):
        return await request_validation_exception_handler(request,exc)
    errors = exc.errors()
    fields = {str(part) for error in errors for part in error['loc']}
    if fields & {'window_m','stride_m'}:
        guide = advice.failure(Exception('window_m stride'))
    else:
        guide = advice.failure(Exception('baseline_start comparison_end'))
    return JSONResponse(status_code=422, content={'detail':guide['message'], 'guidance':guide})


def project(pid):
    for p in PROJECTS:
        if p['id']==pid:return p
    raise HTTPException(404,'ไม่พบโครงการ')


def configuration():
    if not os.getenv('GEE_PROJECT_ID'):
        return False,'ยังไม่ได้ตั้ง GEE_PROJECT_ID'
    if os.getenv('GEE_AUTH_MODE','local') == 'local':
        if not Path(engine.ee.oauth.get_credentials_path()).exists():
            return False,'ยังไม่ได้ยืนยันสิทธิ์ Earth Engine รัน .venv\\Scripts\\earthengine authenticate แล้วเปิดเซิร์ฟเวอร์ใหม่'
    elif not Path(os.getenv('GOOGLE_APPLICATION_CREDENTIALS','')).is_file():
        return False,'ยังไม่มีไฟล์สิทธิ์ service account'
    return True,'พบการตั้งค่าสิทธิ์แล้ว จะตรวจการเข้าถึงจริงเมื่อเริ่มวิเคราะห์'


@app.get('/api/health')
def health():
    configured,message=configuration()
    return {'status':'ok','gee_configured':configured,'message':message,'method':engine.METHOD}


@app.get('/api/projects')
def projects(q:str=Query('',max_length=100),area_code:str='',company:str=''):
    if area_code and area_code not in GEOMETRIES and not any(r['code']==area_code for rows in ADMIN.values() for r in rows):
        raise HTTPException(400,'ไม่พบพื้นที่')
    return browse(q,area_code,company)


@app.get('/api/search')
def searching(q:str=Query(...,min_length=1,max_length=100)):
    return search(q)


@app.get('/api/admin/{level}')
def admin(level:Literal['provinces','districts','subdistricts'],parent:str=''):
    return [r for r in ADMIN[level] if not parent or r['parent']==parent]


@app.get('/api/projects/{pid}/grid')
def project_grid(pid:str,window_m:int=50,stride_m:int=25):
    try:return grid(project(pid)['geometry'],window_m,stride_m)
    except ValueError as e:raise HTTPException(422,str(e))


@app.post('/api/projects/{pid}/date-suggestions')
def date_suggestions(pid:str, request:DateCheckRequest):
    p = project(pid)
    configured,message = configuration()
    if not configured:raise HTTPException(503,message)
    requested = request.model_dump()
    if request.latest:
        end = date.today();start = end-timedelta(days=90)
        requested.update(comparison_start=start, comparison_end=end,
                         baseline_start=start-timedelta(days=365), baseline_end=end-timedelta(days=365))
    rows = advice.candidates(requested, date.today())
    key = cache_key(p['geometry'], {'rows':rows, 'datasets':engine.DATASETS,
                                   'gee_project':os.getenv('GEE_PROJECT_ID')}, engine.METHOD+'-date-check-1')
    cached = cache_dir/f'dates-{key}.json'
    if cached.exists() and time.time()-cached.stat().st_mtime < 21600:
        try:return json.loads(cached.read_text(encoding='utf-8'))
        except (OSError,ValueError):pass
    if not date_checks.acquire(blocking=False):
        raise HTTPException(429,'กำลังตรวจช่วงวันที่อยู่ กรุณารอสักครู่')
    try:
        result = advice.format_checks(rows, engine.check_date_pairs(p,rows), pid)
        result['checked_at'] = datetime.now(timezone.utc).isoformat()
        temp = cached.with_suffix('.tmp')
        temp.write_text(json.dumps(result,allow_nan=False),encoding='utf-8');temp.replace(cached)
        return result
    except Exception as exc:
        guide = advice.failure(exc,date_check=True)
        return JSONResponse(status_code=503,content={'detail':guide['message'], 'guidance':guide})
    finally:
        date_checks.release()


def run(job_id,p,params,key):
    def stage(name):
        with lock:
            if time.time()-jobs[job_id]['created']>600:raise TimeoutError('Analysis exceeded 10 minutes')
            jobs[job_id]['stage']=name
    try:
        if params.pop('latest',False):
            engine.initialize()
            end=date.today()
            start=end-timedelta(days=90)
            # Find latest acquisition with usable boundary pixels, not just latest catalog entry.
            g=engine.ee.Geometry(p['geometry'])
            raw=engine.ee.ImageCollection(engine.DATASETS[0]).filterBounds(g).filterDate(start.isoformat(),end.isoformat()).linkCollection(
                engine.ee.ImageCollection(engine.DATASETS[2]),['cs_cdf'])
            def usable(im):
                im=engine.ee.Image(im)
                scl=im.select('SCL')
                mask=im.select('cs_cdf').gte(.6).And(scl.neq(3)).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))
                count=im.select('B4').updateMask(mask).reduceRegion(engine.ee.Reducer.count(),g,10,maxPixels=1000000).get('B4')
                return im.set('usable',count)
            dates=raw.map(usable).filter(engine.ee.Filter.gt('usable',0)).aggregate_array('system:time_start').getInfo()
            if not dates:raise engine.Unavailable('ไม่พบภาพที่ใช้ได้ใน 90 วันที่ผ่านมา ลองเลือกช่วงฤดูอื่น')
            last=datetime.fromtimestamp(max(dates)/1000,timezone.utc).date()
            end=last+timedelta(days=1);start=end-timedelta(days=90)
            params.update(comparison_start=start.isoformat(),comparison_end=end.isoformat(),
                          baseline_start=(start-timedelta(days=365)).isoformat(),baseline_end=(end-timedelta(days=365)).isoformat())
        result=engine.analyze(p,params,stage)
        stage('saving_results')
        temp=cache_dir/f'{key}.tmp'
        temp.write_text(json.dumps(result,allow_nan=False),encoding='utf-8');temp.replace(cache_dir/f'{key}.json')
        with lock:jobs[job_id].update(stage='complete',result=result)
    except engine.Unavailable as e:
        with lock:jobs[job_id].update(stage='unavailable',message=str(e),guidance=advice.failure(e))
    except Exception as e:
        logging.exception('Earth Engine analysis failed')
        guide = advice.failure(e)
        with lock:jobs[job_id].update(stage='failed',message=guide['message'],guidance=guide)


@app.post('/api/analysis',status_code=202)
def start_analysis(request:AnalysisRequest):
    p=project(request.project_id)
    configured,message=configuration()
    if not configured:raise HTTPException(503,message)
    params=request.model_dump(mode='json',exclude={'project_id'})
    try:grid(p['geometry'],params['window_m'],params['stride_m'])
    except ValueError as e:raise HTTPException(422,str(e))
    key=cache_key(p['geometry'],{**params,'datasets':engine.DATASETS},engine.METHOD)
    with lock:
        for jid,j in jobs.items():
            if j['key']==key and j['stage'] not in ['failed','unavailable'] and time.time()-j['created'] < (3600 if params['latest'] else 86400):
                return {'job_id':jid,'stage':j['stage']}
        if sum(j['stage'] not in ['complete','failed','unavailable'] for j in jobs.values())>=2:
            raise HTTPException(429,'กำลังวิเคราะห์ครบ 2 งาน กรุณารอสักครู่')
        jid=uuid.uuid4().hex
        cached=cache_dir/f'{key}.json'
        # Results 24h; latest request 1h. Tile URLs never persisted.
        ttl=3600 if params['latest'] else 86400
        entry={'stage':'queued','key':key,'project_id':p['id'],'created':time.time()}
        if cached.exists() and time.time()-cached.stat().st_mtime<ttl:
            try:entry.update(stage='complete',result=json.loads(cached.read_text(encoding='utf-8')))
            except (OSError,ValueError):pass
        # Bound memory usage; keep finished jobs for this prototype process only.
        if len(jobs)>=100:
            old=next((k for k,v in jobs.items() if v['stage'] in ['complete','failed','unavailable']),None)
            if old:jobs.pop(old)
        jobs[jid]=entry
        if entry['stage']=='queued':pool.submit(run,jid,p,params,key)
    return {'job_id':jid,'stage':entry['stage']}


def job(jid):
    with lock:j=jobs.get(jid)
    if not j:raise HTTPException(404,'ไม่พบงาน เซิร์ฟเวอร์อาจถูกเปิดใหม่ กรุณาเริ่มวิเคราะห์อีกครั้ง')
    return j


@app.get('/api/analysis/{jid}')
def status(jid:str):
    j=job(jid)
    return {k:j[k] for k in ['stage','message','project_id','guidance'] if k in j}


@app.get('/api/analysis/{jid}/summary')
def summary(jid:str):
    j=job(jid)
    if j['stage']!='complete':raise HTTPException(409,'ผลยังไม่พร้อม')
    return {**{k:v for k,v in j['result'].items() if k!='cells'}, 'guidance':advice.result_guidance(j['result'])}


@app.get('/api/analysis/{jid}/trends')
def trends(jid:str):return summary(jid)['trends']


@app.get('/api/analysis/{jid}/layers')
def layers(jid:str):
    j=job(jid)
    if j['stage']!='complete':raise HTTPException(409,'ผลยังไม่พร้อม')
    try:return engine.layers(project(j['project_id']),j['result']['params'])
    except Exception as e:raise HTTPException(503,'โหลดชั้นภาพไม่ได้ ลองรีเฟรชภาพหรือตรวจสิทธิ์ GEE') from e


@app.get('/api/analysis/{jid}/grid')
def analyzed_grid(jid:str):
    j=job(jid)
    if j['stage']!='complete':raise HTTPException(409,'ผลยังไม่พร้อม')
    return j['result']['cells']


@app.get('/api/analysis/{jid}/cells/{cell_id}')
def cell(jid:str,cell_id:str):
    for f in analyzed_grid(jid)['features']:
        if f['properties']['id']==cell_id:return f
    raise HTTPException(404,'ไม่พบช่องวิเคราะห์')
