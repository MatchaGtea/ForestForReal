import {CircleMarker,GeoJSON,Tooltip} from 'react-leaflet';
import type {Cell,Grid,Project,Summary} from './types';
import {colors,labels} from './types';

export function ProjectPin({project,selected,onClick}:{project:Project;selected:boolean;onClick:()=>void}){
  const ring=project.geometry.coordinates[0];
  const x=ring.reduce((sum,point)=>sum+point[0],0)/ring.length;
  const y=ring.reduce((sum,point)=>sum+point[1],0)/ring.length;
  return <CircleMarker center={[y,x]} radius={selected?10:7}
    pathOptions={{className:'project-pin',fillColor:selected?'#d4eca5':'#1e6048',fillOpacity:1,color:'#fff',weight:3}}
    eventHandlers={{click:onClick}}><Tooltip>{project.id} · {project.name}</Tooltip></CircleMarker>;
}

// These colors describe the comparison result, not a separate observation for
// each date. Both map views use this same grid and inspection-point rendering.
export default function AnalysisGrid({grid,summary,projectId,onCell,outlineOnly=false,showInspectionPoints=true}: {
  grid:Grid|null;summary:Summary|null;projectId:string|undefined;onCell:(cell:Cell)=>void;
  outlineOnly?:boolean;showInspectionPoints?:boolean;
}){
  const result=summary?.project_id===projectId?summary:null;
  return <>
    {grid&&<GeoJSON key={JSON.stringify([projectId,grid.features.length,grid.features[0]?.properties.area_m2,result?.created_at])}
      data={grid} style={feature=>{
        const color=result?colors[feature?.properties.classification]||'#9ca3af':'#e9edd2';
        return {className:'analysis-grid-cell',color,weight:1,fillColor:result?color:'#fff',fillOpacity:outlineOnly?0:result ? .12 : .03};
      }} onEachFeature={(feature,layer)=>layer.on('click',()=>onCell(feature as Cell))}/>}
    {showInspectionPoints&&result?.inspection_points.map((point,index)=>{
      const cell=grid?.features.find(feature=>feature.properties.id===point.cell_id);
      return <CircleMarker key={point.cell_id} center={[point.geometry.coordinates[1],point.geometry.coordinates[0]]}
        radius={5} pathOptions={{className:'inspection-point',color:'#fff',fillColor:'#c78c2e',fillOpacity:1}}
        eventHandlers={{click:()=>{if(cell)onCell(cell);}}}>
        <Tooltip>จุดตรวจเพิ่มเติม {index+1} · {labels[point.reason]||'ควรตรวจเพิ่มเติม'}</Tooltip>
      </CircleMarker>;
    })}
  </>;
}
