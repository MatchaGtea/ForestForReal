import {useEffect,useRef,useState} from 'react';
import {CalendarSearch,Info,RefreshCw} from 'lucide-react';
import {api,errorGuidance,fmt,pct,isDemo} from './types';
import type {DateCheck,DateParams,DateSuggestions,Guidance,Params} from './types';

function range(start:string,end:string){return `${start} → ${end}`;}
function Counts({check}:{check:DateCheck}){
  return <><p className="date-check-coverage">พื้นที่ผ่านเกณฑ์ร่วม <strong>{fmt(pct(check.common_sufficient_fraction),1)}%</strong></p>
    <table><caption>วันใช้ได้เฉลี่ยต่อพิกเซล หลังกรองเมฆ/เงา</caption><thead><tr><th>ข้อมูล</th><th>ก่อน</th><th>หลัง</th></tr></thead><tbody>
      <tr><th>Sentinel-2</th><td>{fmt(check.baseline.s_count,1)}</td><td>{fmt(check.comparison.s_count,1)}</td></tr>
      <tr><th>Dynamic World</th><td>{fmt(check.baseline.t_count,1)}</td><td>{fmt(check.comparison.t_count,1)}</td></tr>
    </tbody></table></>;
}

export default function DateAdvisor({projectId,params,issue,busy,configured,onApply}: {
  projectId:string;params:Params;issue:Guidance|null;busy:boolean;configured:boolean;onApply:(dates:DateParams)=>void;
}){
  const requestKey=JSON.stringify([projectId,params.baseline_start,params.baseline_end,params.comparison_start,params.comparison_end,params.latest]);
  const activeKey=useRef(requestKey);activeKey.current=requestKey;
  const controller=useRef<AbortController|null>(null);
  const [pending,setPending]=useState('');
  const [result,setResult]=useState<{key:string;data:DateSuggestions}|null>(null);
  const [failure,setFailure]=useState<{key:string;guide:Guidance}|null>(null);
  const loading=pending===requestKey;
  const data=result?.key===requestKey?result.data:null;
  const guide=failure?.key===requestKey?failure.guide:issue;
  useEffect(()=>{setPending('');setResult(null);setFailure(null);return()=>controller.current?.abort();},[requestKey]);

  async function checkDates(){
    controller.current?.abort();
    const abort=new AbortController();controller.current=abort;
    const key=requestKey;setPending(key);setResult(null);setFailure(null);
    try{
      const body={...Object.fromEntries(['baseline_start','baseline_end','comparison_start','comparison_end'].map(key=>[key,params[key as keyof Params]||null])),latest:params.latest};
      const response=await api<DateSuggestions>(`/projects/${projectId}/date-suggestions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});
      if(!abort.signal.aborted&&activeKey.current===key&&response.project_id===projectId)setResult({key,data:response});
    }catch(error){if(!abort.signal.aborted&&activeKey.current===key)setFailure({key,guide:errorGuidance(error)});}
    finally{if(activeKey.current===key&&controller.current===abort)setPending('');}
  }
  return <div className="date-advisor" aria-label="คำแนะนำข้อมูลดาวเทียม" tabIndex={-1}>
    {guide&&<div className="analysis-guidance" role="status"><strong><Info size={14}/>{guide.message}</strong><span>ควรปรับ / ลองทำดังนี้</span><ul>{guide.actions.map(action=><li key={action}>{action}</li>)}</ul></div>}
    <p>ต้องมีวันภาพที่ใช้ได้อย่างน้อย 3 วัน ทั้ง Sentinel-2 และ Dynamic World ในแต่ละช่วง พื้นที่ข้อมูลขาดยังแสดงเป็นสีเทา</p>
    <button className="date-advisor-check" type="button" disabled={busy||loading||!configured} onClick={checkDates}>{loading?<RefreshCw size={15} className="spin"/>:<CalendarSearch size={15}/>} {isDemo?(loading?'กำลังโหลดช่วงที่บันทึกไว้…':'เลือกช่วงวันที่ที่บันทึกไว้'):loading?'กำลังตรวจช่วงวันที่จริง…':'แนะนำช่วงวันที่จากดาวเทียม'}</button>
    {!configured&&<p>เชื่อมต่อ GEE ให้พร้อมก่อน จึงจะตรวจวันภาพจริงได้</p>}
    {loading&&<p role="status">{isDemo?'กำลังอ่านผลดาวเทียมจริงที่บันทึกไว้ ไม่มีการวิเคราะห์ช่วงใหม่':'ตรวจช่วงที่เลือกและช่วงอื่นใกล้เคียง โดยใช้การกรองข้อมูลแบบเดียวกับการวิเคราะห์'}</p>}
    {data&&<div className="date-advisor-result" role="status"><strong>{data.message}</strong>
      <p>เกณฑ์แนะนำ: พื้นที่ร่วมอย่างน้อย {fmt(pct(data.criteria.target_fraction),0)}% มีข้อมูลใช้ได้อย่างน้อย {data.criteria.minimum_days} วันต่อชุดข้อมูลและต่อช่วง ช่องบางส่วนอาจยังมีข้อมูลขาด</p>
      {data.current&&<details className="date-check-current" open={!data.current.eligible}><summary>ข้อมูลของช่วงที่เลือก{data.current.eligible?' · ผ่านเกณฑ์':' · ยังไม่ผ่านเกณฑ์'}</summary><Counts check={data.current}/></details>}
      {data.recommendations.map(check=><article className="date-recommendation" key={JSON.stringify(check.params)}><strong>{check.label}</strong>
        <p>ก่อน {range(check.params.baseline_start,check.params.baseline_end)}<br/>หลัง {range(check.params.comparison_start,check.params.comparison_end)}</p>
        <Counts check={check}/><button type="button" onClick={()=>onApply(check.params)}>ใช้ช่วงวันที่นี้</button></article>)}
      {data.actions.length>0&&<ul>{data.actions.map(action=><li key={action}>{action}</li>)}</ul>}
      <small>วันสิ้นสุดไม่นับรวม · {isDemo?'บันทึกชุดข้อมูล':'ตรวจจาก GEE'}: {new Date(data.checked_at).toLocaleString('th-TH')}</small>
    </div>}
  </div>;
}
