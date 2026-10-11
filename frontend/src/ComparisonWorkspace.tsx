import {useCallback,useEffect,useRef,useState} from 'react';
import {MapContainer,TileLayer,ImageOverlay,GeoJSON,Pane,useMap} from 'react-leaflet';
import L from 'leaflet';
import {ArrowLeft,ArrowUpRight,Info,LocateFixed,Maximize2,Minimize2,RefreshCw,Satellite,SlidersHorizontal} from 'lucide-react';
import type {Project,Params,Summary,Grid,Layers,LayerName,Cell,Guidance} from './types';
import {fmt,colors,labels,isDemo} from './types';
import AnalysisGrid,{ProjectPin} from './AnalysisGrid';

type Period = 'baseline' | 'comparison';
type Props = {
  project:Project;
  params:Params;
  onAnalyze:()=>void;
  busy:boolean;
  status:string;
  summary:Summary|null;
  grid:Grid|null;
  layers:Layers;
  layersLoading:boolean;
  layersError:string;
  layersRevision:number;
  health:{gee_configured:boolean;message:string}|null;
  onRefresh:()=>void;
  onExit:()=>void;
  settingsOpen:boolean;
  onSettings:()=>void;
  base:string;
  onBase:(base:string)=>void;
  wide:boolean;
  onWide:()=>void;
  onCell:(cell:Cell)=>void;
  guidance:Guidance|null;
  onAdvice:()=>void;
};
const names:Partial<Record<LayerName,string>> = {
  baseline_rgb:'ภาพสีจริงช่วงก่อน',comparison_rgb:'ภาพสีจริงช่วงหลัง',
  baseline_trees:'สีสัญญาณต้นไม้ช่วงก่อน',comparison_trees:'สีสัญญาณต้นไม้ช่วงหลัง',
  comparison_insufficient:'สีพื้นที่ข้อมูลไม่เพียงพอ',
};
function displayDate(date:string) {
  if(!date||!Number.isFinite(Date.parse(date)))return 'เลือกวันที่';
  return new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
}

// Leaflet owns the transient viewport. Synchronizing it doesn't update React
// state, reload layers, or trigger an analysis request.
function MapNavigation({period,project,register}:{period:Period;project:Project;register:(period:Period,map:L.Map)=>()=>void}) {
  const map=useMap();
  useEffect(()=>{
    const container=map.getContainer();
    container.setAttribute('role','region');
    container.setAttribute('aria-label',`แผนที่ช่วง${period==='baseline'?'ก่อน':'หลัง'}`);
    map.fitBounds(L.geoJSON(project.geometry).getBounds(),{padding:[28,28],maxZoom:18,animate:false});
    const unregister=register(period,map);
    // Preserve the geographic center as catalog/full-width changes resize the
    // canvas. Disabling Leaflet's corrective pan drifts both synchronized maps.
    const observer=new ResizeObserver(()=>map.invalidateSize({animate:false}));
    observer.observe(container);
    return()=>{observer.disconnect();unregister();};
  },[map,period,project,register]);
  return null;
}

// Track failing tiles that still belong to the viewport. A failed request must
// not hide successful imagery, or survive after Leaflet unloads that tile.
function AnalysisTile({name,url,opacity,period,onFailure,kind,bounds}: {
  name:LayerName;url:string;opacity:number;period:Period;
  onFailure:(key:string,failed:boolean)=>void;
  kind?:'image';bounds?:[[number,number],[number,number]];
}) {
  const failures=useRef(new Set<HTMLElement>());
  const key=`${period}:${name}`;
  useEffect(()=>()=>onFailure(key,false),[key,onFailure]);
  function report(){onFailure(key,failures.current.size>0);}
  if(kind==='image'&&bounds)return <ImageOverlay url={url} bounds={bounds} opacity={opacity} pane="analysis-images"
    alt={`${names[name]||name} · ผลดาวเทียมที่บันทึกไว้`} attribution="ESA / Google / WRI · Earth Engine"
    className="recorded-image" eventHandlers={{error:()=>onFailure(key,true),load:()=>onFailure(key,false)}}/>;
  return <TileLayer url={url} maxZoom={20} opacity={opacity} pane="analysis-images"
    attribution={name.endsWith('_rgb')?'ESA / Google / WRI · Earth Engine':undefined}
    eventHandlers={{
      tileerror:event=>{failures.current.add(event.tile);report();},
      tileload:event=>{if(failures.current.delete(event.tile))report();},
      tileunload:event=>{if(failures.current.delete(event.tile))report();},
    }}/>;
}

function PeriodMap({period,project,layers,showTrees,grid,revision,register,onFailure,base,summary,onCell,onRecenter}: {
  period:Period;project:Project;layers:Layers;showTrees:boolean;grid:Grid|null;revision:number;
  register:(period:Period,map:L.Map)=>()=>void;onFailure:(key:string,failed:boolean)=>void;base:string;
  summary:Summary|null;onCell:(cell:Cell)=>void;onRecenter:()=>void;
}) {
  const rgb:LayerName=period==='baseline'?'baseline_rgb':'comparison_rgb';
  const trees:LayerName=period==='baseline'?'baseline_trees':'comparison_trees';
  function tile(name:LayerName,opacity=1) {
    const url=layers[name]?.url;
    return url?<AnalysisTile key={`${name}:${revision}:${url}`} name={name} url={url} opacity={opacity} period={period} onFailure={onFailure} kind={layers[name]?.kind} bounds={layers[name]?.bounds}/>:null;
  }
  return <MapContainer className="comparison-map" center={[15,101]} zoom={6} minZoom={5} maxZoom={20}
    zoomControl={false}>
    <MapNavigation period={period} project={project} register={register}/>
    {base==='street'?<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={20} maxNativeZoom={19} attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'/>:
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={20} attribution="Esri · ภาพฐานต่างวันที่ ใช้ระบุตำแหน่ง"/>}
    <Pane name="analysis-images" style={{zIndex:350}}>
      {tile(rgb)}
      {showTrees&&tile(trees,.45)}
      {tile('comparison_insufficient',.55)}
    </Pane>
    <Pane name="comparison-boundary" style={{zIndex:450}}>
      <GeoJSON key={project.id} data={project.geometry} interactive={false} style={{color:layers[rgb]?.url?'#f8fff0':'#447a4d',weight:2,fill:false}}/>
      <AnalysisGrid grid={grid} summary={summary} projectId={project.id} onCell={onCell} showInspectionPoints={Boolean(grid)}/>
      <ProjectPin project={project} selected={true} onClick={onRecenter}/>
    </Pane>
  </MapContainer>;
}

export default function ComparisonWorkspace({project,params,onAnalyze,busy,status,summary,grid,layers,layersLoading,layersError,layersRevision,health,onRefresh,onExit,settingsOpen,onSettings,base,onBase,wide,onWide,onCell,guidance,onAdvice}:Props) {
  const [showTrees,setShowTrees]=useState(false);
  const [showGrid,setShowGrid]=useState(true);
  const [tileFailures,setTileFailures]=useState<string[]>([]);
  const maps=useRef<Partial<Record<Period,L.Map>>>({});
  const syncing=useRef(false);
  const backButton=useRef<HTMLButtonElement>(null);
  useEffect(()=>{backButton.current?.focus();},[]);
  useEffect(()=>{setTileFailures([]);},[layersRevision]);
  const register=useCallback((period:Period,map:L.Map)=>{
    maps.current[period]=map;
    const other:Period=period==='baseline'?'comparison':'baseline';
    const peer=maps.current[other];
    if(peer)map.setView(peer.getCenter(),peer.getZoom(),{animate:false});
    function sync() {
      const target=maps.current[other];
      if(syncing.current||!target)return;
      const center=map.getCenter();const zoom=map.getZoom();
      if(target.getCenter().equals(center,1e-9)&&target.getZoom()===zoom)return;
      syncing.current=true;
      try{target.setView(center,zoom,{animate:false});}finally{syncing.current=false;}
    }
    map.on('move zoom',sync);
    return()=>{map.off('move zoom',sync);if(maps.current[period]===map)delete maps.current[period];};
  },[]);
  const onFailure=useCallback((key:string,failed:boolean)=>setTileFailures(current=>{
    if(failed)return current.includes(key)?current:[...current,key];
    return current.includes(key)?current.filter(item=>item!==key):current;
  }),[]);
  const displayedKeys:LayerName[]=['baseline_rgb','comparison_rgb','comparison_insufficient',...(showTrees?['baseline_trees','comparison_trees'] as LayerName[]:[])];
  const failedKeys=summary&&!layersLoading?displayedKeys.filter(key=>!layers[key]?.url||layers[key]?.error||tileFailures.some(item=>item.endsWith(`:${key}`))):[];
  const metrics=summary?.comparable_metrics;
  const hasImages=Boolean(layers.baseline_rgb?.url&&layers.comparison_rgb?.url);
  function recenter() {
    const bounds=L.geoJSON(project.geometry).getBounds();
    Object.values(maps.current).forEach(map=>map.fitBounds(bounds,{padding:[28,28],maxZoom:18,animate:false}));
  }
  function zoom(delta:number) {
    const map=maps.current.baseline;
    if(map)map.setZoom(Math.max(map.getMinZoom(),Math.min(map.getMaxZoom(),map.getZoom()+delta)),{animate:false});
  }
  return <section className="comparison-workspace" aria-label="เปรียบเทียบก่อน–หลัง" onKeyDown={event=>{if(event.key==='Escape'&&wide&&!settingsOpen)onWide();}}>
    <div className="comparison-heading">
      <div><span className="eyebrow">{project.id} · เปรียบเทียบก่อน–หลัง</span><h1>{project.name}</h1></div>
      <div className="comparison-actions">
        <button ref={backButton} className="comparison-back" onClick={onExit}><ArrowLeft size={15}/> แผนที่เดียว</button>
        <button className="comparison-settings-toggle" aria-expanded={settingsOpen} aria-controls="project-settings" onClick={onSettings}><SlidersHorizontal size={15}/>{settingsOpen?'พับตั้งค่า':'เปิดตั้งค่า'}</button>
        <button className="comparison-wide-toggle" type="button" aria-label={wide?'แสดงรายการโครงการ':'ขยายแผนที่เต็มพื้นที่'} aria-pressed={wide} title={wide?'แสดงรายการโครงการ':'ขยายแผนที่เต็มพื้นที่'} onClick={onWide}>{wide?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button>
        <button className="primary" type="button" disabled={busy} onClick={onAnalyze}><Satellite size={16}/>{busy?status:isDemo?(summary?'โหลดผลอีกครั้ง':'เปิดผลที่บันทึกไว้'):summary?'วิเคราะห์อีกครั้ง':'เริ่มวิเคราะห์พื้นที่'}{busy?<RefreshCw className="spin" size={15}/>:<ArrowUpRight size={15}/>}</button>
      </div>
    </div>
    <div className="comparison-toolbar">
      <div className="comparison-switches"><label className="check"><input type="checkbox" checked={showTrees} disabled={!summary} onChange={event=>setShowTrees(event.target.checked)}/> แสดงสัญญาณต้นไม้</label>
        <label className="check"><input type="checkbox" checked={showGrid} disabled={!grid} onChange={event=>setShowGrid(event.target.checked)}/> แสดงกริด</label></div>
      <div className="comparison-navigation" aria-label="ควบคุมแผนที่ทั้งสองช่วง">
        <div className="base-toggle"><button className={base==='street'?'active':''} onClick={()=>onBase('street')}>แผนที่</button><button className={base==='imagery'?'active':''} onClick={()=>onBase('imagery')}>ภาพฐาน</button></div>
        <button type="button" aria-label="ซูมเข้าทั้งสองภาพ" onClick={()=>zoom(1)}>+</button>
        <button type="button" aria-label="ซูมออกทั้งสองภาพ" onClick={()=>zoom(-1)}>−</button>
        <button type="button" aria-label="กลับไปขอบเขตโครงการทั้งสองภาพ" onClick={recenter}><LocateFixed size={17}/></button>
      </div>
    </div>
    {health&&!health.gee_configured&&!isDemo&&<div className="comparison-message" role="status"><Info size={18}/>{health.message}</div>}
    {(layersError||failedKeys.length>0)&&<div className="comparison-message comparison-warning" role="alert">
      <Info size={18}/><span>{layersError||`โหลดไม่ได้: ${failedKeys.map(key=>names[key]).join(' · ')}`}</span>
      <button type="button" disabled={layersLoading} onClick={onRefresh}><RefreshCw size={15}/> โหลดภาพใหม่</button>
    </div>}
    {guidance&&!layersError&&failedKeys.length===0&&<div className="comparison-message comparison-advice" role="status"><Info size={18}/><span>{guidance.message}</span><button type="button" onClick={onAdvice}>ดูสิ่งที่ควรปรับ</button></div>}
    <div className="comparison-panels">{(['baseline','comparison'] as const).map(period=>{
      const before=period==='baseline';const rgb=before?'baseline_rgb':'comparison_rgb';
      const range=summary?.[period];
      const start=range?.start||(before?params.baseline_start:params.comparison_start);
      const end=range?.end_exclusive||(before?params.baseline_end:params.comparison_end);
      const unavailable=layers[rgb]?.error||tileFailures.includes(`${period}:${rgb}`)||layersError||(summary&&!layersLoading&&!layers[rgb]?.url);
      return <figure className="comparison-period" key={period} data-period={period}>
        <figcaption><strong>{before?'ก่อน':'หลัง'}</strong><span>{displayDate(start)} → {displayDate(end)}<small>ไม่รวมวันสิ้นสุด{params.latest&&!summary?' · รอวันที่ภาพจริง':''}</small></span></figcaption>
        <div className="comparison-media">
          <PeriodMap period={period} project={project} layers={layers} showTrees={showTrees} grid={showGrid?grid:null} revision={layersRevision} register={register} onFailure={onFailure} base={base} summary={summary} onCell={onCell} onRecenter={recenter}/>
          {(!summary||!layers[rgb]?.url||unavailable)&&<div className={`comparison-placeholder ${unavailable?'has-error':''}`} role="status">
            {busy||layersLoading?<RefreshCw className="spin" size={15}/>:<Satellite size={16}/>}
            <strong>{busy?status:unavailable?'ภาพช่วงนี้ยังไม่พร้อม':layersLoading?'กำลังโหลดภาพดาวเทียมจริง':'รอข้อมูลภาพดาวเทียม'}</strong>
            <span>{summary?(layersLoading?'แผนที่พื้นฐานแสดงตำแหน่งเท่านั้น':'กดโหลดภาพใหม่เพื่อลองอีกครั้ง'):isDemo?'เลือกช่วงที่บันทึกไว้ แล้วกดเปิดผล':'เลือกวันที่ แล้วกดเริ่มวิเคราะห์'}</span>
          </div>}
        </div>
        <div className="comparison-metrics" aria-label={`ผลช่วง${before?'ก่อน':'หลัง'}`}>
          <div><span>NDVI เฉลี่ย</span><strong>{fmt(metrics?.[before?'ndvi_baseline':'ndvi_comparison'],3)}</strong></div>
          <div><span>ความน่าจะเป็นต้นไม้</span><strong>{fmt(metrics?.[before?'tree_baseline':'tree_comparison'],3)}</strong></div>
        </div>
      </figure>;
    })}</div>
    <div className="comparison-footer">
      <div className="comparison-color-key">{showTrees&&<span><i style={{background:'#14532d'}}/> สัญญาณต้นไม้ ≥ 0.60</span>}
        {showGrid&&summary&&<details className="comparison-grid-key"><summary>สีกริด · ผลเทียบร่วม <span aria-hidden="true">{Object.entries(colors).filter(([key])=>grid?.features.some(feature=>feature.properties.classification===key)).map(([key,color])=><i key={key} style={{background:color}}/>)}</span></summary>
          <div>{Object.entries(labels).filter(([key])=>grid?.features.some(feature=>feature.properties.classification===key)).map(([key,label])=><span key={key}><i style={{background:colors[key]}}/>{label}</span>)}<p>กริดและจุดตรวจเป็นผลเปรียบเทียบชุดเดียวกันทั้งสองฝั่ง ภาพ RGB เป็นข้อมูลของแต่ละช่วง</p></div></details>}
        <span><i style={{background:'#9ca3af'}}/> ข้อมูลไม่เพียงพอ</span><p>คลิกสีกริดเพื่อดูคำอธิบาย · คลิกช่องหรือจุดตรวจเพื่อดูรายละเอียด</p></div>
      <div className="comparison-deltas"><div><span>ΔNDVI · หลัง − ก่อน</span><strong>{fmt(metrics?.ndvi_change,6)}</strong></div>
        <div><span>Δความน่าจะเป็นต้นไม้</span><strong>{fmt(metrics?.tree_change,6)}</strong></div></div>
    </div>
    <p className="comparison-note">{hasImages?'ภาพในขอบเขต: Sentinel-2 ตามช่วงวันที่เลือก':'รอภาพดาวเทียมในขอบเขต'} · ภาพฐานใช้ระบุตำแหน่ง{base==='imagery'?' ไม่ตรงกับวันที่วิเคราะห์':''}</p>
  </section>;
}
