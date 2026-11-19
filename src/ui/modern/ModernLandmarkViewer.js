/* Isolated authored-geometry inspection. No optical or calibration state. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CurvatureModernLandmarkViewer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  const sub=(a,b)=>a.map((v,i)=>v-b[i]);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=a=>{const n=Math.hypot(...a);if(!(n>0))throw Error('Degenerate object frame');return a.map(v=>v/n);};
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const finite3=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
  function localGeometry(primitives,pkg,plane){
    if(!finite3(plane.origin)||!finite3(plane.xAxis)||!finite3(plane.yAxis))throw Error('Invalid object frame');
    const x=unit(plane.xAxis),z=unit(cross(x,plane.yAxis)),y=cross(z,x);
    const frame={origin:plane.origin.slice(),x,y,z};
    const primary=new Set(pkg.primaryIndices||pkg.primitiveIndices.filter(i=>primitives[i].metadata.landmarkOwner?.kind==='object'));
    const items=pkg.primitiveIndices.map(index=>{
      const p=primitives[index];
      if(!p||!p.metadata?.landmarkOwner||!p.points.every(finite3))throw Error('Object geometry unavailable');
      const points=p.points.map(v=>{const d=sub(v,frame.origin);return [dot(d,x),dot(d,y),dot(d,z)];});
      return {index,primary:primary.has(index),type:p.type,mode:p.mode,style:{...p.style},owner:JSON.parse(JSON.stringify(p.metadata.landmarkOwner)),points};
    });
    if(!items.some(p=>p.primary))throw Error('Selected owner has no authored primitives');
    return {frame,items,ownerKind:pkg.owner.kind};
  }
  function visibleItems(geometry,spans){return geometry.items.filter(p=>spans||(p.primary??p.owner.kind!=='span'));}
  function bounds(items){
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const p of items)for(const v of p.points)for(let i=0;i<3;i++){lo[i]=Math.min(lo[i],v[i]);hi[i]=Math.max(hi[i],v[i]);}
    if(!lo.every(Number.isFinite))throw Error('No visible geometry');
    const size=hi.map((v,i)=>v-lo[i]),center=hi.map((v,i)=>(v+lo[i])/2);
    return {center,size,radius:Math.max(.001,Math.hypot(...size)/2)};
  }
  const reset=()=>({yaw:0,pitch:0,zoom:1,pan:[0,0],projection:'orthographic',wireframe:false,spans:false});
  function standardView(state,name){
    const angles={front:[0,0],back:[Math.PI,0],left:[-Math.PI/2,0],right:[Math.PI/2,0],top:[0,Math.PI/2],bottom:[0,-Math.PI/2]};
    if(!angles[name])return state;
    return {...state,yaw:angles[name][0],pitch:angles[name][1],pan:[0,0],zoom:1};
  }
  function orbit(state,dx,dy){return {...state,yaw:((state.yaw+dx*.008+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI,pitch:clamp(state.pitch+dy*.008,-Math.PI/2,Math.PI/2)};}
  function pan(state,dx,dy){return {...state,pan:[state.pan[0]+dx,state.pan[1]+dy]};}
  function zoom(state,factor){return {...state,zoom:clamp(state.zoom*factor,.1,100)};}
  function camera(state,b,width,height){
    const a=state.yaw,p=state.pitch,ca=Math.cos(a),sa=Math.sin(a),cp=Math.cos(p),sp=Math.sin(p);
    const right=[ca,0,-sa],up=[-sa*sp,cp,-ca*sp],toward=[sa*cp,sp,ca*cp];
    const distance=4*b.radius,scale=Math.min(width,height)*.43/b.radius*state.zoom;
    const origin=[width/2+state.pan[0],height/2+state.pan[1]];
    function project(point){
      const d=sub(point,b.center),depth=dot(d,toward),den=distance-depth;
      if(!(den>0))return null;
      const k=scale*(state.projection==='perspective'?distance/den:1);
      return {pixel:[origin[0]+dot(d,right)*k,origin[1]-dot(d,up)*k],depth};
    }
    return {right,up,toward,distance,scale,origin,project};
  }
  function draw(canvas,geometry,state){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
    const items=visibleItems(geometry,state.spans),b=bounds(items),c=camera(state,b,w,h);
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#eef4f8';ctx.fillRect(0,0,w,h);
    // Far-to-near inspection painter. Keep authored order for coplanar
    // overlapping shapes; this is not a depth-certified surface picker.
    const projected=items.map((p,i)=>{
      const q=p.points.map(c.project);if(q.some(v=>!v))return null;
      return {p,i,q,depth:q.reduce((s,v)=>s+v.depth,0)/q.length};
    }).filter(Boolean);
    // Coplanar object polygons preserve authored order even when oblique.
    // Sort packages (the support plane and each span) by mean view depth.
    const groups=new Map();
    for(const v of projected){
      const key=JSON.stringify(v.p.owner);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(v);
    }
    const ordered=[...groups.values()].map(g=>({g,depth:g.reduce((s,v)=>s+v.depth,0)/g.length}))
      .sort((a,b)=>a.depth-b.depth).flatMap(v=>v.g);
    ctx.lineJoin='round';ctx.lineWidth=1;
    for(const {p,q} of ordered){
      const polygon=p.type==='polygon',mode=polygon?(p.mode??1):1;
      ctx.beginPath();ctx.moveTo(...q[0].pixel);for(const v of q.slice(1))ctx.lineTo(...v.pixel);
      if(polygon)ctx.closePath();
      ctx.globalAlpha=(p.style.alpha??1)*(p.primary===false?.45:1);
      if(polygon&&(mode&2)&&!state.wireframe){ctx.fillStyle=p.style.fill||'white';ctx.fill();}
      if((mode&1)||state.wireframe){ctx.strokeStyle=p.style.stroke||'#526b7f';ctx.stroke();}
    }
    ctx.globalAlpha=1;
    // Orientation triad is a decoration, never part of authored geometry.
    const o=[35,h-35],axes=[[1,0,0],[0,1,0],[0,0,1]],colors=['#b84444','#25834b','#356aa6'];
    ctx.font='12px sans-serif';
    axes.forEach((a,i)=>{const end=[o[0]+23*dot(a,c.right),o[1]-23*dot(a,c.up)];ctx.strokeStyle=ctx.fillStyle=colors[i];
      ctx.beginPath();ctx.moveTo(...o);ctx.lineTo(...end);ctx.stroke();ctx.fillText(['X','Y','Z'][i],end[0]+4,end[1]-3);});
    return {size:b.size,face:Math.abs(c.toward[2])<1e-3?'edge-on':c.toward[2]<0?'back':'front',count:items.length};
  }
  // Window geometry is a UI preference, never experiment or camera state.
  const WINDOW_KEY='curvature-landmark-viewer-window-v1';
  function windowRect(request,width,height){
    const W=Math.max(1,Math.floor(width)),H=Math.max(1,Math.floor(height));
    const margin=Math.min(8,Math.floor(Math.min(W,H)/4));
    const maxW=W-2*margin,maxH=H-2*margin;
    const valid=request&&['x','y','width','height'].every(k=>Number.isFinite(request[k]));
    const w=Math.round(clamp(valid?request.width:Math.min(720,W*.58),Math.min(340,maxW),maxW));
    const h=Math.round(clamp(valid?request.height:Math.min(620,H*.72),Math.min(300,maxH),maxH));
    return {x:Math.round(clamp(valid?request.x:W-w-margin-12,margin,W-w-margin)),
      y:Math.round(clamp(valid?request.y:Math.min(72,H-h-margin),margin,H-h-margin)),width:w,height:h};
  }
  function changeWindowRect(rect,kind,dx,dy,width,height){
    if(kind==='move')return windowRect({...rect,x:rect.x+dx,y:rect.y+dy},width,height);
    // Resize from the lower right without moving the top-left corner.
    const margin=Math.min(8,Math.floor(Math.min(width,height)/4));
    return windowRect({...rect,width:clamp(rect.width+dx,Math.min(340,width-2*margin),width-rect.x-margin),
      height:clamp(rect.height+dy,Math.min(300,height-2*margin),height-rect.y-margin)},width,height);
  }
  function rasterSize(width,height,dpr){
    const scale=Math.min(Math.max(1,Number(dpr)||1),2,2048/Math.max(1,width,height));
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
  }
  function mount(dialog){
    const canvas=dialog.querySelector('canvas'),status=dialog.querySelector('[data-viewer-status]'),heading=dialog.querySelector('h2');
    const projection=dialog.querySelector('[data-viewer-projection]'),wire=dialog.querySelector('[data-viewer-wire]'),spans=dialog.querySelector('[data-viewer-spans]');
    const env=dialog.ownerDocument.defaultView,frame=dialog.querySelector('[data-viewer-frame]'),titleBar=dialog.querySelector('[data-viewer-titlebar]'),grip=dialog.querySelector('[data-viewer-resize]');
    let geometry=null,state=reset(),drag=null,windowDrag=null,rect=null;
    const viewport=()=>[env.innerWidth,env.innerHeight];
    function readRect(){try{return JSON.parse(env.localStorage.getItem(WINDOW_KEY));}catch(e){return null;}}
    function saveRect(){if(rect)try{env.localStorage.setItem(WINDOW_KEY,JSON.stringify(rect));}catch(e){/* Optional UI preference. */}}
    function applyRect(next){rect=windowRect(next,...viewport());Object.assign(dialog.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});}
    function resizeRaster(){
      const r=frame.getBoundingClientRect();if(!(r.width>0&&r.height>0))return;
      const next=rasterSize(frame.clientWidth,frame.clientHeight,env.devicePixelRatio);
      if(canvas.width!==next.width||canvas.height!==next.height){
        const ratio=Math.min(next.width,next.height)/Math.max(1,Math.min(canvas.width,canvas.height));
        state={...state,pan:state.pan.map(v=>v*ratio)};
        canvas.width=next.width;canvas.height=next.height;
      }
    }
    function render(){
      if(!geometry||!dialog.open)return;
      resizeRaster();
      const r=draw(canvas,geometry,state);
      status.textContent=r.count+' primitives · '+r.size.map(v=>v.toFixed(2)).join(' × ')+' m (X/Y/Z) · '+r.face+
        (geometry.ownerKind==='span'?' · orientation relative to support plane':r.face==='edge-on'?' · planar surfaces viewed edge-on':'')+' · inspection only';
    }
    function initialView(){const s=reset();return geometry?.ownerKind==='span'?standardView(s,'top'):s;}
    function sync(){projection.value=state.projection;wire.checked=state.wireframe;spans.checked=state.spans;render();}
    function releaseCapture(element,id){if(id!==null&&element.hasPointerCapture(id))element.releasePointerCapture(id);}
    function stopDrags(){
      const a=drag,b=windowDrag;drag=null;windowDrag=null;
      if(a)releaseCapture(canvas,a.id);
      if(b)releaseCapture(b.element,b.id);
    }
    function close(){stopDrags();saveRect();geometry=null;if(dialog.open)dialog.close();}
    dialog.querySelector('[data-viewer-close]').onclick=close;
    function windowPointer(element,kind){
      element.addEventListener('pointerdown',e=>{
        if(!dialog.open||windowDrag||drag||e.button!==0||
           (kind==='move'&&e.target.closest('button,input,select,a')))return;
        e.preventDefault();
        element.focus({preventScroll:true});
        windowDrag={id:e.pointerId,element,kind,x:e.clientX,y:e.clientY,rect:{...rect}};
        element.setPointerCapture(e.pointerId);
      });
      element.addEventListener('pointermove',e=>{
        const d=windowDrag;if(!d||d.element!==element||d.id!==e.pointerId)return;
        applyRect(changeWindowRect(d.rect,d.kind,e.clientX-d.x,e.clientY-d.y,...viewport()));
        if(kind==='resize')render();
      });
      const finish=e=>{if(windowDrag?.id===e.pointerId&&windowDrag.element===element){windowDrag=null;saveRect();}};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(event,finish);
      element.addEventListener('keydown',e=>{
        if(e.target!==element||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
        e.preventDefault();const d=e.shiftKey?32:8;
        applyRect(changeWindowRect(rect,kind,e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0,e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0,...viewport()));
        saveRect();render();
      });
    }
    windowPointer(titleBar,'move');windowPointer(grip,'resize');
    new env.ResizeObserver(()=>{if(dialog.open)render();}).observe(frame);
    env.addEventListener('resize',()=>{if(dialog.open){stopDrags();applyRect(rect);saveRect();render();}});
    dialog.querySelector('[data-viewer-reset]').onclick=()=>{state=initialView();sync();};
    dialog.querySelectorAll('[data-viewer-view]').forEach(n=>n.onclick=()=>{state=standardView(state,n.dataset.viewerView);render();});
    projection.onchange=()=>{state={...state,projection:projection.value};render();};
    wire.onchange=()=>{state={...state,wireframe:wire.checked};render();};
    spans.onchange=()=>{state={...state,spans:spans.checked,pan:[0,0],zoom:1};render();};
    dialog.querySelectorAll('[data-viewer-zoom]').forEach(n=>n.onclick=()=>{state=zoom(state,Number(n.dataset.viewerZoom));render();});
    function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];}
    canvas.addEventListener('pointerdown',e=>{
      if(!geometry||drag||windowDrag||![0,1,2].includes(e.button))return;
      e.preventDefault();canvas.focus({preventScroll:true});drag={id:e.pointerId,last:point(e),pan:e.button!==0||e.shiftKey};canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;const p=point(e),d=p.map((v,i)=>v-drag.last[i]);
      state=drag.pan?pan(state,...d):orbit(state,...d);drag.last=p;render();
    });
    const end=e=>{if(drag?.id===e.pointerId)drag=null;};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,end);
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{e.preventDefault();if(!drag){state=zoom(state,Math.exp(-e.deltaY*.0015));render();}},{passive:false});
    // Modeless: scope shortcuts to focus inside the inspector, not the
    // whole workspace. Escape outside still belongs to the workspace.
    dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}e.stopPropagation();});
    for(const event of ['click','change','input','pointerup','pointercancel','wheel'])dialog.addEventListener(event,e=>e.stopPropagation());
    dialog.addEventListener('close',()=>{if(!dialog.open){stopDrags();saveRect();geometry=null;}});
    return {open(next,title){
      stopDrags();geometry=next;state=initialView();heading.textContent=title;spans.disabled=!next.items.some(p=>!p.primary);
      if(!dialog.open){applyRect(readRect());dialog.show();applyRect(rect);saveRect();}
      sync();
    },close,isOpen:()=>dialog.open,snapshot:()=>dialog.open?JSON.parse(JSON.stringify(state)):null,
      windowSnapshot:()=>dialog.open?{...rect}:null};
  }
  return Object.freeze({localGeometry,visibleItems,bounds,reset,standardView,orbit,pan,zoom,camera,draw,windowRect,changeWindowRect,rasterSize,mount});
}));
