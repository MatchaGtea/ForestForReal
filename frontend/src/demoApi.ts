import {ApiError} from './types';
import type {Admin,DateCheck,DateParams,DateSuggestions,Grid,Layers,Params,Project,Summary} from './types';

type Catalog={projects:Project[];admin:Record<string,Admin[]>};
type Sample={id:string;project_id:string;params:Params;created_at:string;common_sufficient_fraction:number|null};
type Manifest={exported_at:string;samples:Sample[];date_checks:string[]};
const dateFields=['baseline_start','baseline_end','comparison_start','comparison_end'] as const;
const sameDates=(left:Partial<Params>,right:Partial<Params>)=>dateFields.every(key=>left[key]===right[key]);
const asset=(path:string)=>`${import.meta.env.BASE_URL}demo/${path}`;

async function read<T>(path:string,signal?:AbortSignal|null):Promise<T>{
  const response=await fetch(asset(path),{signal});
  if(!response.ok)throw new ApiError('โหลดไฟล์ผลที่บันทึกไว้ไม่ได้',response.status,{code:'demo_asset',message:'โหลดไฟล์ผลที่บันทึกไว้ไม่ได้',actions:['ตรวจการเชื่อมต่อ แล้วโหลดหน้าเว็บอีกครั้ง'],suggest_dates:false});
  return response.json();
}
function unavailable(message:string,actions:string[],suggestDates=true):never{
  throw new ApiError(message,422,{code:'recorded_only',message,actions,suggest_dates:suggestDates});
}

// This adapter only reads exported real observations. It never estimates a
// result for new dates, invents progress, or sends a request to Earth Engine.
export async function demoApi<T>(path:string,options?:RequestInit):Promise<T>{
  const signal=options?.signal;
  signal?.throwIfAborted();
  const url=new URL(path,'https://demo.invalid');
  const parts=url.pathname.split('/').filter(Boolean);
  const output=await resolve();
  signal?.throwIfAborted();
  return output as T;

  async function resolve():Promise<unknown>{
    if(parts[0]==='health')return {status:'ok',gee_configured:false,mode:'recorded',message:'เว็บทดลองใช้ผลดาวเทียมจริงที่บันทึกไว้ ยังไม่วิเคราะห์ช่วงวันที่ใหม่'};
    if(parts[0]==='projects'||parts[0]==='search'||parts[0]==='admin'){
      const catalog=await read<Catalog>('catalog.json',signal);
      if(parts[0]==='admin')return (catalog.admin[parts[1]]||[]).filter(row=>!url.searchParams.get('parent')||row.parent===url.searchParams.get('parent'));
      const q=(url.searchParams.get('q')||'').trim().toLocaleLowerCase();
      const matches=catalog.projects.filter(project=>(!url.searchParams.get('area_code')||project.admin_codes.includes(url.searchParams.get('area_code')!))&&(!url.searchParams.get('company')||project.company===url.searchParams.get('company'))&&(!q||`${project.id} ${project.name} ${project.company}`.toLocaleLowerCase().includes(q)));
      if(parts[0]==='search')return {projects:matches.map(({id,name,company})=>({id,name,company})),companies:[...new Set(catalog.projects.map(project=>project.company))].sort().filter(company=>company.toLocaleLowerCase().includes(q)).map(name=>({name,count:catalog.projects.filter(project=>project.company===name).length}))};
      if(parts.length===1)return matches;
      if(parts[2]==='grid'){
        if((url.searchParams.get('window_m')||'50')!=='50'||(url.searchParams.get('stride_m')||'25')!=='25')unavailable('ผลตัวอย่างใช้หน้าต่าง 50 เมตร และระยะเลื่อน 25 เมตร',['ตั้งหน้าต่างเป็น 50 และระยะเลื่อนเป็น 25 เพื่อเปิดผลที่บันทึกไว้'],false);
        return read<Grid>(`grids/${parts[1]}.json`,signal);
      }
      if(parts[2]==='date-suggestions')return suggestions(parts[1]);
    }
    if(parts[0]==='analysis'){
      const manifest=await read<Manifest>('manifest.json',signal);
      if(parts.length===1){
        const params=JSON.parse(String(options?.body||'{}')) as Params&{project_id:string};
        const samples=manifest.samples.filter(sample=>sample.project_id===params.project_id);
        if(!samples.length)unavailable('พื้นที่นี้ยังไม่มีผลที่บันทึกไว้ในเว็บทดลอง',['ลอง FP-001 ดอยสุเทพ, FP-002 ดอยอินทนนท์ หรือ FP-004 เขาใหญ่','การวิเคราะห์พื้นที่หรือช่วงใหม่ทำได้ในรุ่นที่เชื่อมต่อ GEE'],false);
        if(params.latest)unavailable('เว็บทดลองยังไม่เรียกภาพล่าสุด',['ปิดตัวเลือกภาพล่าสุด แล้วเลือกช่วงวันที่ที่บันทึกไว้']);
        if(params.window_m!==50||params.stride_m!==25)unavailable('ผลตัวอย่างใช้หน้าต่าง 50 เมตร และระยะเลื่อน 25 เมตร',['ตั้งหน้าต่างเป็น 50 และระยะเลื่อนเป็น 25'],false);
        const sample=samples.find(sample=>sameDates(sample.params,params));
        if(!sample)unavailable('ช่วงนี้ยังไม่มีผลที่บันทึกไว้',['กดเลือกช่วงวันที่ที่บันทึกไว้ แล้วใช้ช่วงที่แสดง','เว็บทดลองแสดงเฉพาะผลจริงที่ส่งออกไว้ ไม่คำนวณหรือประมาณผลของวันใหม่']);
        return {job_id:`demo-${sample.id}`,stage:'complete'};
      }
      const sample=manifest.samples.find(sample=>`demo-${sample.id}`===parts[1]);
      if(!sample)unavailable('ไม่พบผลตัวอย่างนี้',['เลือกโครงการและเปิดผลที่บันทึกไว้อีกครั้ง'],false);
      if(parts.length===2)return {stage:'complete',project_id:sample.project_id};
      if(parts[2]==='layers'){
        const layers=await read<Layers>(`${sample.id}/layers.json`,signal);
        return Object.fromEntries(Object.entries(layers).map(([name,layer])=>[name,{...layer,url:layer.url?asset(layer.url):undefined}]));
      }
      if(parts[2]==='summary')return read<Summary>(`${sample.id}/summary.json`,signal);
      if(parts[2]==='grid')return read<Grid>(`${sample.id}/grid.json`,signal);
    }
    unavailable('ยังไม่รองรับข้อมูลนี้ในเว็บทดลอง',['ลองเปิดผลตัวอย่างที่บันทึกไว้'],false);
  }

  async function suggestions(projectId:string):Promise<DateSuggestions>{
    const manifest=await read<Manifest>('manifest.json',signal);
    const samples=manifest.samples.filter(sample=>sample.project_id===projectId);
    const summaries=await Promise.all(samples.map(sample=>read<Summary>(`${sample.id}/summary.json`,signal)));
    const checks:DateCheck[]=summaries.map((summary,index)=>({label:'ช่วงวันที่ที่บันทึกไว้',params:summary.params,
      common_sufficient_fraction:samples[index].common_sufficient_fraction,
      eligible:samples[index].common_sufficient_fraction!=null&&samples[index].common_sufficient_fraction!>=.8,
      baseline:{s_count:summary.metrics.s_count_baseline,t_count:summary.metrics.t_count_baseline},
      comparison:{s_count:summary.metrics.s_count_comparison,t_count:summary.metrics.t_count_comparison}}));
    const recorded=await Promise.all(manifest.date_checks.map(file=>read<DateSuggestions>(file,signal)));
    for(const record of recorded.filter(record=>record.project_id===projectId)){
      for(const check of record.checks){
        // Offer only dates for which the complete displayed analysis is saved.
        const index=checks.findIndex(existing=>sameDates(existing.params,check.params));
        if(index>=0)checks[index]={...check,label:'ช่วงวันที่ที่ตรวจจาก GEE และบันทึกไว้'};
      }
    }
    const params=JSON.parse(String(options?.body||'{}')) as DateParams;
    const current=checks.find(check=>sameDates(check.params,params))||null;
    return {project_id:projectId,checked_at:manifest.exported_at,criteria:{minimum_days:3,target_fraction:.8},
      current,recommendations:checks.filter(check=>check.eligible),checks,
      message:samples.length?'ช่วงวันที่ที่ผ่านเกณฑ์จากข้อมูลจริงที่บันทึกไว้':'ยังไม่มีผลที่บันทึกไว้ของพื้นที่นี้',
      actions:samples.length?['เลือกวันที่เพื่อเปิดผลที่บันทึกไว้ การเลือกวันอื่นไม่สร้างผลวิเคราะห์ใหม่ในเว็บทดลอง']:['ลอง FP-001 ดอยสุเทพ, FP-002 ดอยอินทนนท์ หรือ FP-004 เขาใหญ่']};
  }
}
