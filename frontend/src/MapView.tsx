import {useEffect,useRef} from 'react';
import {MapContainer,TileLayer,GeoJSON,useMap} from 'react-leaflet';
import L from 'leaflet';
import type {Project,Grid,Cell,Layers,Summary,LayerName} from './types';
import AnalysisGrid,{ProjectPin} from './AnalysisGrid';

function Navigation({projects,selected,focus,bounds,expanded}:{projects:Project[];selected:Project|null;focus:number;bounds:number[]|null;expanded:boolean}){
  const map=useMap();
  useEffect(()=>{const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(map.getContainer());return()=>observer.disconnect();},[map]);
  useEffect(()=>{
    const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile=matchMedia('(max-width:768px)').matches;
    const paddingTopLeft:L.PointExpression=mobile?[25,130]:[55,80];
    const paddingBottomRight:L.PointExpression=mobile?[25,expanded?map.getSize().y*(selected? .58:.45):50]:[55,55];
    if(bounds){map.fitBounds([[bounds[1],bounds[0]],[bounds[3],bounds[2]]],{paddingTopLeft,paddingBottomRight,animate});return;}
    const features=selected?[selected]:projects;
    if(features.length)map.fitBounds(L.geoJSON(features.map(p=>({type:'Feature' as const,geometry:p.geometry,properties:{}}))).getBounds(),{paddingTopLeft,paddingBottomRight,maxZoom:selected?18:8,animate});
  // Explicit navigation intent only: panning doesn't request analysis or refit.
  },[focus,expanded]);
  return null;
}
function Satellite({layers,layer,compare,swipe,onError}:{layers:Layers;layer:LayerName;compare:boolean;swipe:number;onError:()=>void}){
  const map=useMap();const baseline=useRef<L.TileLayer|L.ImageOverlay|null>(null);
  useEffect(()=>{
    const url=layers[layer]?.url;if(!url)return;
    function raster(name:LayerName){
      const item=layers[name]!;
      const options={attribution:'ESA / Google / WRI · Earth Engine',pane:'overlayPane'};
      const image=item.kind==='image'&&item.bounds?L.imageOverlay(item.url!,item.bounds,{...options,className:'recorded-image',alt:'ผลดาวเทียมจริงที่บันทึกไว้'}):L.tileLayer(item.url!,{...options,maxZoom:20});
      image.on(item.kind==='image'?'error':'tileerror',onError);
      return image.addTo(map);
    }
    const after=raster(layer);
    let before:L.TileLayer|L.ImageOverlay|undefined;
    if(compare&&layers.baseline_rgb?.url){before=raster('baseline_rgb');baseline.current=before;}
    return()=>{after.remove();before?.remove();baseline.current=null;};
  },[map,layers,layer,compare]);
  useEffect(()=>{
    const clip=()=>{const image=baseline.current;const container=image instanceof L.ImageOverlay?image.getElement():image?.getContainer();if(!container)return;
      const origin=map.containerPointToLayerPoint([0,0]);const size=map.getSize();
      if(image instanceof L.ImageOverlay){
        const west=map.latLngToContainerPoint(image.getBounds().getNorthWest()).x;
        const east=map.latLngToContainerPoint(image.getBounds().getSouthEast()).x;
        const percent=Math.max(0,Math.min(100,(size.x*swipe/100-west)/(east-west)*100));
        container.style.clipPath=`inset(0 ${100-percent}% 0 0)`;return;
      }
      // Leaflet tile containers have zero CSS height; use layer-coordinate rect,
      // not percentage clipPath on that container.
      container.style.clip=`rect(${origin.y}px, ${origin.x+size.x*swipe/100}px, ${origin.y+size.y}px, ${origin.x}px)`;};
    clip();map.on('move zoom resize',clip);return()=>{map.off('move zoom resize',clip);};
  },[map,swipe,layers,compare]);
  return null;
}
export default function MapView({projects,selected,onSelect,focus,bounds,grid,onCell,layers,layer,compare,swipe,summary,onTileError,base,expanded}:{projects:Project[];selected:Project|null;onSelect:(p:Project)=>void;focus:number;bounds:number[]|null;grid:Grid|null;onCell:(c:Cell)=>void;layers:Layers;layer:LayerName;compare:boolean;swipe:number;summary:Summary|null;onTileError:()=>void;base:string;expanded:boolean}){
  return <MapContainer bounds={[[5.6,97.3],[20.5,105.7]]} boundsOptions={{padding:[25,25]}} zoomControl={false} className="map" aria-label="แผนที่โครงการในประเทศไทย">
    {base==='street'?<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'/>:<TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Tiles © Esri, Maxar, Earthstar Geographics · ภาพฐานต่างวันที่ ไม่ใช้คำนวณ"/>}
    <Navigation projects={projects} selected={selected} focus={focus} bounds={bounds} expanded={expanded}/>
    <Satellite layers={layers} layer={compare?'comparison_rgb':layer} compare={compare} swipe={swipe} onError={onTileError}/>
    {projects.map(p=><GeoJSON key={`${p.id}-${selected?.id}`} data={p.geometry} style={{color:selected?.id===p.id?'#c9e99a':'#247356',weight:selected?.id===p.id?3:2,fillOpacity:.12}} eventHandlers={{click:()=>onSelect(p)}}/>)}
    {projects.map(p=><ProjectPin key={p.id} project={p} selected={selected?.id===p.id} onClick={()=>onSelect(p)}/>)}
    <AnalysisGrid grid={grid} summary={summary} projectId={selected?.id} onCell={onCell} outlineOnly={compare}/>
  </MapContainer>;
}
