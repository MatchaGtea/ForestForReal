import type {Polygon, FeatureCollection, Feature, Point} from 'geojson';
export type Admin = {code:string;name:string;parent:string|null;bounds:number[]|null};
export type Project = {id:string;name:string;company:string;province:string;landscape:string;category:string;start_date:string;reported_rai:number;claim:string;geometry:Polygon;boundary_area:{rai:number;hectares:number;crs:string};administrative_areas:Admin[];admin_codes:string[]};
export type Params = {baseline_start:string;baseline_end:string;comparison_start:string;comparison_end:string;window_m:number;stride_m:number;latest:boolean};
export type CellProps = {id:string;classification?:string;area_m2:number;[key:string]:number|string|undefined};
export type Grid = FeatureCollection<Polygon,CellProps>;
export type Cell = Feature<Polygon,CellProps>;
export type Provenance = {start:string;end_exclusive:string;sentinel_dates:string[];dynamic_world_dates:string[];sentinel_ids:string[];dynamic_world_ids:string[];sentinel_scene_count:number;dynamic_world_scene_count:number};
export type Guidance = {code:string;message:string;actions:string[];suggest_dates:boolean};
export type Summary = {project_id:string;method:string;datasets:string[];created_at:string;params:Params;metrics:Record<string,number|null>;comparable_metrics:Record<string,number|null>;baseline:Provenance;comparison:Provenance;trends:{year:number;ndvi:number|null;trees:number|null;sufficient:number;start:string;end_exclusive:string}[];area_summaries:{class:string;rai:number;hectares:number;m2:number}[];inspection_points:{cell_id:string;geometry:Point;reason:string}[];guidance?:Guidance|null};
export type DateParams = Pick<Params,'baseline_start'|'baseline_end'|'comparison_start'|'comparison_end'>;
export type DateCheck = {label:string;params:DateParams;common_sufficient_fraction:number|null;eligible:boolean;baseline:{s_count:number|null;t_count:number|null};comparison:{s_count:number|null;t_count:number|null}};
export type DateSuggestions = {project_id:string;checked_at:string;criteria:{minimum_days:number;target_fraction:number};current:DateCheck|null;recommendations:DateCheck[];checks:DateCheck[];message:string;actions:string[]};
export type LayerName = 'baseline_rgb' | 'comparison_rgb' | 'ndvi_change' | 'tree_change' | 'evidence' | 'quality' | 'baseline_trees' | 'comparison_trees' | 'comparison_insufficient';
export type Layers = Partial<Record<LayerName,{url?:string;error?:string;expires_hint?:string;kind?:'image';bounds?:[[number,number],[number,number]]}>>;
export const isDemo=import.meta.env.VITE_DEMO_MODE==='true';
export function errorGuidance(error:unknown,status?:number):Guidance {
  if(error instanceof ApiError)return error.guidance;
  const message=error instanceof Error?error.message:String(error);
  if(status===429)return {code:'rate_limit',message,actions:['รอให้งานเดิมเสร็จ แล้วลองอีกครั้ง ไม่ต้องเปลี่ยนวันที่'],suggest_dates:false};
  if(/ไม่พบภาพ/.test(message))return {code:'no_imagery',message,actions:['ตรวจช่วง 90–120 วันที่มีภาพใช้ได้จริง และเทียบฤดูกาลใกล้กันทั้งสองฝั่ง'],suggest_dates:true};
  if(/สิทธิ์|GEE_PROJECT_ID|authenticate|service account/.test(message))return {code:'gee_access',message,actions:['ตรวจการยืนยันบัญชี Earth Engine และสิทธิ์ GEE project ที่ตั้งไว้ การเปลี่ยนวันที่ไม่แก้ปัญหานี้'],suggest_dates:false};
  if(status===422||/30–120|ช่วงฐานต้อง/.test(message))return {code:'invalid_dates',message,actions:['เลือกช่วงละ 30–120 วัน ตั้งแต่ปี 2019 ถึงวันนี้ โดยไม่รวมวันสิ้นสุด','ช่วงฐานต้องสิ้นสุดก่อนหรือเท่ากับวันเริ่มช่วงเปรียบเทียบ'],suggest_dates:true};
  return {code:'service_error',message,actions:['ตรวจการเชื่อมต่อ แล้วลองอีกครั้ง หากยังเกิดซ้ำให้ตรวจสถานะบริการและสิทธิ์ GEE'],suggest_dates:false};
}
export class ApiError extends Error {
  constructor(message:string,public status:number,public guidance:Guidance){super(message);this.name='ApiError';}
}
export async function api<T>(url:string,options?:RequestInit):Promise<T> {
  if(isDemo){const {demoApi}=await import('./demoApi');return demoApi<T>(url,options);}
  const base=(import.meta.env.VITE_API_BASE_URL||'/api').replace(/\/$/,'');
  const response=await fetch(base+url,options);
  if(!response.ok){const e=await response.json().catch(()=>({detail:'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'}));const message=typeof e.detail==='string'?e.detail:e.guidance?.message||'ข้อมูลช่วงเวลาหรือขนาดช่องไม่ถูกต้อง';throw new ApiError(message,response.status,e.guidance||errorGuidance(new Error(message),response.status));}
  return response.json();
}
export const labels:Record<string,string>={persistent:'มีต้นไม้อยู่เดิม',increasing:'พบสัญญาณต้นไม้เพิ่มขึ้น',decreasing:'พบสัญญาณต้นไม้ลดลง',mixed:'ควรตรวจเพิ่มเติม',insufficient:'ข้อมูลไม่เพียงพอ'};
export const colors:Record<string,string>={persistent:'#14532d',increasing:'#84cc16',decreasing:'#dc5656',mixed:'#d6a13c',insufficient:'#9ca3af'};
export const fmt=(x:number|null|undefined,d=2)=>x==null||!Number.isFinite(x)?'—':x.toLocaleString('th-TH',{maximumFractionDigits:d});
export const pct=(x:unknown)=>typeof x==='number'?x*100:null;
