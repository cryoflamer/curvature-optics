/* Integrated physical correspondence viewer; authored geometry and independent camera/picking state. */
(function(root,factory){
  const api=factory(root.CurvatureEarClip||(typeof require==='function'?require('../../geometry/CurvatureEarClip'):null),
    root.CurvatureCalibrationPointerGestures||(typeof require==='function'?require('./CalibrationPointerGestures'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CurvatureModernLandmarkViewer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(earClip,pointerGestures){
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
  const DEFAULT_SENSITIVITY=25,SENSITIVITY_KEY='curvature-landmark-viewer-orbit-sensitivity-v1';
  function orbitSensitivity(value){return typeof value==='number'&&Number.isFinite(value)?Math.round(clamp(value,5,100)/5)*5:DEFAULT_SENSITIVITY;}
  function orbit(state,dx,dy,sensitivity=DEFAULT_SENSITIVITY){const k=.008*orbitSensitivity(sensitivity)/100;return {...state,yaw:((state.yaw+dx*k+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI,pitch:clamp(state.pitch+dy*k,-Math.PI/2,Math.PI/2)};}
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
  // The optical owner raster supplies a visible seed, not an anchor or a
  // physical depth test. Choose the pixel centre nearest the region centre.
  function regionSeed(spans,region){
    const cx=region.x+region.width/2,cy=region.y+region.height/2;
    let best=null;
    for(const [key,runs] of spans)for(const [x,y,n] of runs){
      if(y+.5<region.y||y+.5>=region.y+region.height)continue;
      const lo=Math.max(x,Math.ceil(region.x-.5)),hi=Math.min(x+n-1,Math.ceil(region.x+region.width-.5)-1);
      if(lo>hi)continue;
      const px=clamp(Math.round(cx-.5),lo,hi)+.5,py=y+.5,d=(px-cx)**2+(py-cy)**2;
      if(!best||d<best.distance||(d===best.distance&&(key<best.key||key===best.key&&(py<best.pixel[1]||py===best.pixel[1]&&px<best.pixel[0]))))
        best={key,pixel:[px,py],distance:d};
    }
    return best;
  }
  const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,t)=>a.map(v=>v*t);
  const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  // Geometry used for the pivot is physical, not virtually bent. A
  // planar polygon hit is preferred; otherwise use its closest projected
  // edge with perspective-correct interpolation. Never save this as a pick.
  function regionPivot(items,pixel,width,height,focal,near){
    const ray=[(pixel[0]-width/2)/focal,(height/2-pixel[1])/focal,-1];
    const project=p=>[width/2-focal*p[0]/p[2],height/2+focal*p[1]/p[2]];
    let best=null;
    function offer(point,distance){
      if(!finite3(point)||!(point[2]<-near))return;
      if(!best||distance<best.distance-1e-8||Math.abs(distance-best.distance)<=1e-8&&point[2]>best.point[2])
        best={point,distance};
    }
    for(const p of items){
      const pts=p.points,polygon=p.type==='polygon';
      if(polygon&&((p.mode??1)&2)){
        let normal=null;
        for(let i=1;i+1<pts.length;i++){const n=cross(sub(pts[i],pts[0]),sub(pts[i+1],pts[0]));if(Math.hypot(...n)>1e-9){normal=unit(n);break;}}
        if(normal&&pts.every(q=>Math.abs(dot(sub(q,pts[0]),normal))<1e-5)){
          const den=dot(ray,normal),t=dot(pts[0],normal)/den;
          if(Number.isFinite(t)&&t>near&&Math.abs(den)>1e-12){
            const q=mul(ray,t),axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
            const axes=[0,1,2].filter(i=>i!==axis),[u,w]=axes;let inside=false;
            for(let i=0,j=pts.length-1;i<pts.length;j=i++){
              const a=pts[i],b=pts[j];
              if((a[w]>q[w])!==(b[w]>q[w])&&q[u]<(b[u]-a[u])*(q[w]-a[w])/(b[w]-a[w])+a[u])inside=!inside;
            }
            if(inside)offer(q,0);
          }
        }
      }
      for(let i=0;i<(polygon?pts.length:pts.length-1);i++){
        let a=pts[i],b=pts[(i+1)%pts.length];
        const limit=-near*1.001;
        if(a[2]>=limit&&b[2]>=limit)continue;
        if(a[2]>=limit)a=lerp(a,b,(limit-a[2])/(b[2]-a[2]));
        if(b[2]>=limit)b=lerp(b,a,(limit-b[2])/(a[2]-b[2]));
        const A=project(a),B=project(b),d=sub(B,A),den=dot(d,d);
        const u=den>0?clamp(dot(sub(pixel,A),d)/den,0,1):0;
        const t=(u/-b[2])/((1-u)/-a[2]+u/-b[2]);
        offer(lerp(a,b,t),Math.hypot(...sub(lerp(A,B,u),pixel)));
      }
    }
    if(!best)throw Error('No forward physical geometry for the visible owner');
    return best;
  }
  function regionGeometry(banks,selection,source,observer){
    if((!selection?.owner&&!finite3(selection?.worldPoint))||!finite3(observer.origin))throw Error('No visible owner in this rectangle');
    const camera=source.camera,back=unit(sub(camera.pos,camera.center)),right=unit(cross(unit(camera.up),back)),up=cross(back,right);
    const focal=source.height/camera.sceneSize*(Math.hypot(...sub(camera.center,camera.pos))-camera.objectZExtend)*camera.zoom;
    const near=camera.near||.001;
    if(!(focal>0))throw Error('Invalid source focal scale');
    // Use the captured physical scene, including the observer-relative height
    // convention. Keep every authored owner from both banks, never station
    // neighbours or a permanent screen-rectangle cutoff.
    let count=0,vertices=0;
    for(const bank of banks)for(const p of bank){count++;vertices+=p.points.length;}
    if(count>100000||vertices>1000000)throw Error('Free View geometry budget exceeded (100000 primitives / 1000000 vertices)');
    const observerAxes=[observer.right,observer.forward,observer.up];
    const toCamera=p=>{const d=sub(p,observer.origin),q=sub(observerAxes.map(a=>dot(d,a)),camera.pos);return [dot(q,right),dot(q,up),dot(q,back)];};
    const items=[];
    for(const [bank,primitives] of banks.entries())for(const [index,p] of primitives.entries()){
      if(!p.metadata?.landmarkOwner||!p.points.every(finite3))continue;
      items.push({bank,index,primitive:p.metadata.landmarkPrimitive,primary:true,type:p.type,mode:p.mode,style:{...p.style},
        owner:JSON.parse(JSON.stringify(p.metadata.landmarkOwner)),points:p.points.map(toCamera)});
    }
    const explicit=finite3(selection.worldPoint);
    const indices=new Set(selection.primaryIndices||[]),candidates=items.filter(p=>p.bank===selection.owner?.bank&&indices.has(p.index));
    const hit=explicit?{point:toCamera(selection.worldPoint),distance:0}:regionPivot(candidates,selection.pixel,source.width,source.height,focal,near),pivot=hit.point;
    if(!finite3(pivot)||-pivot[2]<near)throw Error('Selected physical pivot is behind the camera');
    const seed=selection.pixel||[source.width/2-focal*pivot[0]/pivot[2],source.height/2+focal*pivot[1]/pivot[2]];
    const worldAxis=a=>[0,1,2].map(i=>a.reduce((sum,v,j)=>sum+v*observerAxes[j][i],0));
    const axes=[right,up,back].map(worldAxis);
    const origin=add(add(observer.origin,worldAxis(camera.pos)),axes.reduce((p,a,i)=>add(p,mul(a,pivot[i])),[0,0,0]));
    const frame={origin,x:axes[0],y:axes[1],z:axes[2]};
    return {kind:'region',frame,items:items.map(p=>({...p,points:p.points.map(q=>sub(q,pivot))})),
      eye:pivot.map(x=>x===0?0:-x),focal,near,region:{...selection.region},seed:seed.slice(),pivotError:hit.distance,
      owner:JSON.parse(JSON.stringify(selection.owner))};
  }
  // A stable, camera-independent physical frame for the correspondence editor.
  // World east / up / south form a right-handed basis. The full authored
  // bounding box supplies a deterministic centre, independent of visibility.
  function physicalGeometry(banks){
    const source=opticalGeometry(banks),b=bounds(source.items),origin=b.center;
    const frame={origin,x:[1,0,0],y:[0,0,1],z:[0,-1,0]};
    const local=p=>{const d=sub(p,origin);return [dot(d,frame.x),dot(d,frame.y),dot(d,frame.z)];};
    const extent=1000,distance=4*b.radius;
    return {kind:'region',physical:true,frame,items:source.items.map(p=>({...p,points:p.points.map(local)})),
      eye:[0,0,distance],focal:extent*.40*distance/b.radius,near:Math.max(.000001,distance*1e-7),
      region:{x:0,y:0,width:extent,height:extent},seed:[extent/2,extent/2],pivotError:0,owner:null};
  }
  // Reuse the original full optical region's visible-owner seed and camera
  // framing. The resulting viewport is physical from the first frame.
  // No optical pixels or owner visibility are required for subsequent orbit.
  function initialPhysicalGeometry(banks,source=null,observer=null,spans=null,packages=null){
    if(source&&observer&&spans&&packages)try{
      const region={x:0,y:0,width:source.width,height:source.height};
      const seed=regionSeed(spans,region),owner=seed&&packages.get(seed.key);
      if(owner){
        const g=regionGeometry(banks,{owner:owner.owner,primaryIndices:owner.primaryIndices,pixel:seed.pixel,region},source,observer);
        return {...g,physical:true,sceneFramed:true};
      }
    }catch(error){/* A missing or invalid optical seed must not prevent editing. */}
    return physicalGeometry(banks);
  }
  const physicalView=geometry=>({...reset(),yaw:geometry?.sceneFramed?0:-Math.PI/5,pitch:geometry?.sceneFramed?0:Math.PI/12,projection:'perspective',spans:true});
  function regionCamera(geometry,state,width,height){
    const a=state.yaw,p=state.pitch,ca=Math.cos(a),sa=Math.sin(a),cp=Math.cos(p),sp=Math.sin(p);
    const right=[ca,0,-sa],up=[-sa*sp,cp,-ca*sp],toward=[sa*cp,sp,ca*cp];
    const pivot=state.orbitPivot?.point||[0,0,0],eye=state.orbitPivot?.eye||geometry.eye;
    const r=geometry.region,scale=Math.min(width/r.width,height/r.height),focal=geometry.focal*scale*state.zoom;
    const perspective=state.projection==='perspective',orthoDepth=geometry.eye[2];
    // The principal point and orthographic scale do not depend on the pivot.
    const principal=[width/2+(geometry.seed[0]-r.x-r.width/2)*scale+state.pan[0]+focal*geometry.eye[0]/geometry.eye[2],
      height/2+(geometry.seed[1]-r.y-r.height/2)*scale+state.pan[1]-focal*geometry.eye[1]/geometry.eye[2]];
    const near=Math.max(geometry.near,geometry.eye[2]*1e-7);
    function coordinates(q){const d=sub(q,pivot);return [dot(d,right)-eye[0],dot(d,up)-eye[1],eye[2]-dot(d,toward)];}
    function screen(q){
      const z=perspective?q[2]:orthoDepth;
      return [principal[0]+focal*q[0]/z,principal[1]-focal*q[1]/z];
    }
    function ray(pixel){
      const u=(pixel[0]-principal[0])/focal,v=(principal[1]-pixel[1])/focal;
      const start=add(pivot,add(add(mul(right,eye[0]+(perspective?0:u*orthoDepth)),mul(up,eye[1]+(perspective?0:v*orthoDepth))),mul(toward,eye[2])));
      const direction=perspective?add(add(mul(right,u),mul(up,v)),mul(toward,-1)):mul(toward,-1);
      return {origin:start,direction,near};
    }
    const origin=eye[2]>=near?screen([-eye[0],-eye[1],eye[2]]):null;
    return {coordinates,screen,ray,near,origin,right,up,toward,perspective,
      project(q){const v=coordinates(q);return v[2]>=near?{pixel:screen(v),depth:v[2]}:null;}};
  }
  function rebaseRegionPivot(geometry,state,point,width,height,{allowBehind=false}={}){
    if(!finite3(point))return state;
    const c=regionCamera(geometry,state,width,height),q=c.coordinates(point);
    if(!finite3(q)||!allowBehind&&q[2]<c.near)return state;
    // Express the unchanged eye in the current basis relative to the new
    // physical point. Future orbit rotates this offset about that point.
    return {...state,orbitPivot:{point:point.slice(),eye:[-q[0],-q[1],q[2]]}};
  }
  // Reset the physical centre, not the camera. An orbit can put the original
  // centre behind the eye; the signed local eye offset is still valid.
  function resetPhysicalPivot(geometry,state,width,height){
    if(!state.orbitPivot||state.orbitPivot.point.every(n=>n===0))return state;
    return rebaseRegionPivot(geometry,state,[0,0,0],width,height,{allowBehind:true});
  }
  // Picking uses the canonical physical authored geometry, not rendered
  // pixels, synthetic thickness, clipped vertices, or EarClip ordinals.
  const indexedTriangles=item=>earClip.indexedTriangles(item);
  function preparePick(items){
    return items.map((item,order)=>{
      const pts=item.points,valid=Array.isArray(pts)&&pts.every(finite3),edges=earClip.authoredEdges(item);
      const mesh=valid?indexedTriangles(item):{triangles:[],reason:'invalid-coordinate'};
      return {item,order,valid,edges,...mesh};
    });
  }
  function rayTriangle(ray,a,b,c){
    const e=sub(b,a),f=sub(c,a),p=cross(ray.direction,f),det=dot(e,p);
    const bound=Math.hypot(...e)*Math.hypot(...f)*Math.hypot(...ray.direction);
    if(!(bound>0)||Math.abs(det)<=bound*1e-12)return null;
    const d=sub(ray.origin,a),u=dot(d,p)/det,q=cross(d,e),v=dot(ray.direction,q)/det,t=dot(f,q)/det;
    if(!Number.isFinite(t)||t<(ray.near??0)||u< -1e-9||v< -1e-9||u+v>1+1e-9)return null;
    const weights=[1-u-v,u,v].map(x=>clamp(x,0,1)),sum=weights.reduce((x,y)=>x+y,0);
    const normalized=weights.map(x=>x/sum);
    return {depth:t,weights:normalized,point:[0,1,2].map(i=>normalized[0]*a[i]+normalized[1]*b[i]+normalized[2]*c[i])};
  }
  function pickDescriptor(entry,kind,indices,weights,point,depth,pixel,distance){
    // Snapshot identity; stable serialized schema/topology guard belongs
    // to 8F.4. Preserve original indices, never triangulated local ordinals.
    const item=entry.item;
    return {kind,bank:item.bank,index:item.index,primitive:item.primitive,owner:item.owner,
      indices,weights,point,depth,pixel,distance,order:entry.order};
  }
  function surfaceHits(mesh,camera,pixel){
    const ray=camera.ray(pixel),hits=[];
    for(const entry of mesh){
      const pts=entry.item.points;
      let best=null;
      for(const indices of entry.triangles){
        const h=rayTriangle(ray,...indices.map(i=>pts[i]));
        if(h&&(!best||h.depth<best.depth-1e-8))
          best=pickDescriptor(entry,'surface',indices,h.weights,h.point,h.depth,pixel.slice(),0);
      }
      if(best)hits.push(best); // one candidate per authored primitive
    }
    return hits.sort((a,b)=>a.depth-b.depth||b.order-a.order);
  }
  function edgeHit(camera,pixel,a,b){
    // Clip before projection; carry the original segment parameter through
    // the near-plane clipping and perspective-correct interpolation.
    const z0=camera.coordinates(a)[2],z1=camera.coordinates(b)[2],near=camera.near;
    if(z0<near&&z1<near)return null;
    let lo=0,hi=1;
    if(z0<near)lo=(near-z0)/(z1-z0);
    if(z1<near)hi=(near-z0)/(z1-z0);
    const qa=camera.coordinates(lerp(a,b,lo)),qb=camera.coordinates(lerp(a,b,hi));
    qa[2]=Math.max(near,qa[2]);qb[2]=Math.max(near,qb[2]);
    const A=camera.screen(qa),B=camera.screen(qb),d=sub(B,A),den=dot(d,d);
    if(!(den>1e-12))return null; // projected zero-length edge is ambiguous
    const w=clamp(dot(sub(pixel,A),d)/den,0,1);
    const t=camera.perspective?(w/qb[2])/((1-w)/qa[2]+w/qb[2]):w;
    const u=lo+(hi-lo)*t,point=lerp(a,b,u),xy=lerp(A,B,w);
    return {t:u,point,depth:camera.coordinates(point)[2],pixel:xy,distance:Math.hypot(...sub(pixel,xy))};
  }
  function depthTolerance(z){return Math.max(1e-7,Math.abs(z)*1e-9);}
  function pickRegion(mesh,camera,pixel,kind,{radius=8,wireframe=false}={}){
    if(!['vertex','edge','surface'].includes(kind)||!Array.isArray(pixel)||pixel.length!==2||!pixel.every(Number.isFinite)||!Number.isFinite(radius)||radius<0)
      throw RangeError('Invalid local pick');
    const rejected=mesh.filter(e=>e.reason&&e.reason!=='not-filled').map(e=>({bank:e.item.bank,index:e.item.index,reason:e.reason}));
    let hits=[];
    if(kind==='surface'){
      if(!wireframe)hits=surfaceHits(mesh,camera,pixel);
      if(hits.length){const depth=hits[0].depth;
        hits=hits.filter(h=>h.depth<=depth+depthTolerance(depth)).sort((a,b)=>b.order-a.order);}
    }else{
      for(const entry of mesh){
        if(!entry.valid)continue;
        const pts=entry.item.points;
        if(kind==='vertex')for(const [i,p] of pts.entries()){
          const q=camera.project(p);if(!q)continue;
          const d=Math.hypot(...sub(pixel,q.pixel));
          if(d<=radius)hits.push(pickDescriptor(entry,kind,[i],[1],p.slice(),q.depth,q.pixel,d));
        }
        else for(const indices of entry.edges){
          const h=edgeHit(camera,pixel,...indices.map(i=>pts[i]));
          if(h&&h.distance<=radius)hits.push(pickDescriptor(entry,kind,indices,[1-h.t,h.t],h.point,h.depth,h.pixel,h.distance));
        }
      }
      // Test visibility at the snapped point, not merely the mouse position.
      // Wireframe has no filled occluders. Invalid fills are reported, not
      // silently certified as absent. Painter parity remains a UI concern.
      if(!wireframe)hits=hits.filter(h=>{
        const front=surfaceHits(mesh,camera,h.pixel)[0];
        return !front||h.depth<=front.depth+depthTolerance(front.depth);
      });
      hits.sort((a,b)=>a.distance-b.distance||a.depth-b.depth||b.order-a.order);
    }
    return {candidates:hits,rejected,visibility:'geometric-only'};
  }
  // Clip in depth and in screen space before handing paths to Canvas.
  // Fill clipping edges are never painted as authored outlines.
  function clipPolygon(points,axis,limit,greater){
    if(!points.length)return [];
    const result=[];let a=points[points.length-1],inside=p=>greater?p[axis]>=limit:p[axis]<=limit;
    for(const b of points){if(inside(a)!==inside(b))result.push(lerp(a,b,(limit-a[axis])/(b[axis]-a[axis])));
      if(inside(b))result.push(b);a=b;}
    return result;
  }
  function clipEdge(a,b,axis,limit,greater){
    const inside=p=>greater?p[axis]>=limit:p[axis]<=limit;
    if(!inside(a)&&!inside(b))return null;
    if(!inside(a))a=lerp(a,b,(limit-a[axis])/(b[axis]-a[axis]));
    if(!inside(b))b=lerp(b,a,(limit-b[axis])/(a[axis]-b[axis]));
    return [a,b];
  }
  function regionPaths(geometry,state,w,h){
    const c=regionCamera(geometry,state,w,h);
    const screenBounds=[[0,-2,true],[0,w+2,false],[1,-2,true],[1,h+2,false]],groups=new Map();
    let visible=0;
    for(const [order,p] of geometry.items.entries()){
      const q=p.points.map(c.coordinates),polygon=p.type==='polygon',mode=polygon?(p.mode??1):1;
      let fill=polygon&&(mode&2)&&!state.wireframe?clipPolygon(q,2,c.near,true).map(c.screen):[];
      for(const b of screenBounds)fill=clipPolygon(fill,...b);
      const edges=[];
      if((mode&1)||state.wireframe)for(let i=0;i<(polygon?q.length:q.length-1);i++){
        let edge=clipEdge(q[i],q[(i+1)%q.length],2,c.near,true);
        if(!edge)continue;edge=edge.map(c.screen);
        for(const b of screenBounds){if(edge)edge=clipEdge(...edge,...b);}
        if(edge)edges.push(edge);
      }
      if(fill.length<3&&!edges.length)continue;
      const key=JSON.stringify(p.owner);if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({p,order,fill,edges,depth:q.reduce((s,v)=>s+v[2]/q.length,0)});visible++;
    }
    const ordered=[...groups.values()].map(g=>({g,depth:g.reduce((s,v)=>s+v.depth/g.length,0)})).sort((a,b)=>b.depth-a.depth).flatMap(v=>v.g);
    return {camera:c,ordered,visible,count:geometry.items.length};
  }
  function drawRegion(canvas,geometry,state,paths=regionPaths(geometry,state,canvas.width,canvas.height)){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,{ordered,visible,count}=paths;
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#eef4f8';ctx.fillRect(0,0,w,h);
    ctx.lineJoin='round';ctx.lineWidth=1;
    for(const {p,fill,edges} of ordered){
      ctx.globalAlpha=p.style.alpha??1;
      if(fill.length>=3){ctx.beginPath();ctx.moveTo(...fill[0]);for(const q of fill.slice(1))ctx.lineTo(...q);ctx.closePath();ctx.fillStyle=p.style.fill||'white';ctx.fill();}
      if(edges.length){ctx.beginPath();for(const [a,b] of edges){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.strokeStyle=p.style.stroke||'#526b7f';ctx.stroke();}
    }
    ctx.globalAlpha=1;
    return {visible,count};
  }
  // Nonzero winding matches Canvas fill(), including invalid authored fills.
  // Use a narrow boundary tolerance for snapped perimeter points.
  function containsFill(points,p){
    let winding=0;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],d=sub(b,a),q=sub(p,a),n=dot(d,d);
      if(n>0&&Math.hypot(...sub(q,mul(d,clamp(dot(q,d)/n,0,1))))<=1e-6)return true;
      const side=d[0]*q[1]-d[1]*q[0];
      if(a[1]<=p[1]&&b[1]>p[1]&&side>0)winding++;
      if(a[1]>p[1]&&b[1]<=p[1]&&side<0)winding--;
    }
    return winding!==0;
  }
  function pathBounds(path){
    const points=path.fill.concat(...path.edges);
    if(!points.length)return null;
    let x=Infinity,y=Infinity,X=-Infinity,Y=-Infinity;
    for(const p of points){x=Math.min(x,p[0]);y=Math.min(y,p[1]);X=Math.max(X,p[0]);Y=Math.max(Y,p[1]);}
    return {x,y,X,Y};
  }
  function inBounds(b,p,r=0){return b&&p[0]>=b.x-r&&p[0]<=b.X+r&&p[1]>=b.y-r&&p[1]<=b.Y+r;}
  // Cache the topology separately from the view paths. Filter to projected
  // screen bounds before ray/edge queries; explicitly stop pathological
  // overlap rather than return an incomplete candidate list.
  function pickFrame(mesh,paths){
    const entries=paths.ordered.map((path,rank)=>({path,rank,bounds:pathBounds(path),entry:mesh[path.order]}));
    return {camera:paths.camera,entries,byOrder:new Map(entries.map(e=>[e.path.order,e]))};
  }
  function framePick(frame,pixel,kind,{radius=8,wireframe=false,allCandidates=false}={}){
    const matches=frame.entries.filter(e=>inBounds(e.bounds,pixel,radius));
    const work=matches.reduce((n,e)=>n+e.entry.item.points.length+e.entry.triangles.length,0);
    if(work>30000||matches.length>2500)return {candidates:[],reason:'Too much overlapping geometry; zoom in or rotate.',blocked:true,limited:true};
    // Restrict geometry to the local screen neighbourhood, including all
    // fills which could occlude a snapped pixel inside that neighbourhood.
    const nearby=matches.map(e=>e.entry);
    // Bound the quadratic snapped-depth stage independently.
    if(kind!=='surface'&&work*work>4000000)return {candidates:[],reason:'Too much overlapping geometry for snapping; zoom in or rotate.',blocked:true,limited:true};
    const result=pickRegion(nearby,frame.camera,pixel,kind,{radius,wireframe});
    const visible=[],blocked=[];
    for(const h of result.candidates){
      const current=frame.byOrder.get(h.order);
      if(!current)continue;
      // The actual fill painter is authoritative for whether a candidate is
      // exposed on screen. A later fill on the same plane is an explicit
      // ambiguity, but a depth-conflicting or invalid later fill blocks it.
      let conflict=false;
      if(!wireframe)for(let i=matches.length-1;i>=0;i--){
        const p=matches[i];
        if(p.rank<=current.rank||!inBounds(p.bounds,h.pixel)||p.path.fill.length<3||!containsFill(p.path.fill,h.pixel))continue;
        if(!p.entry.triangles.length){conflict=true;break;}
        const front=surfaceHits([p.entry],frame.camera,h.pixel)[0];
        if(!front||Math.abs(front.depth-h.depth)>depthTolerance(h.depth)){conflict=true;break;}
      }
      if(conflict)blocked.push(h);else visible.push(h);
    }
    // An invalid fill under the cursor must not silently look like a valid
    // transparent surface. The user can rotate or enable wireframe.
    const invalid=matches.some(p=>p.path.fill.length>=3&&!p.entry.triangles.length&&inBounds(p.bounds,pixel)&&containsFill(p.path.fill,pixel));
    if(kind==='surface'&&invalid&&!visible.length)return {candidates:[],reason:'Surface unavailable: invalid or overlapping authored fill.',blocked:true};
    visible.sort((a,b)=>kind==='surface'?frame.byOrder.get(b.order).rank-frame.byOrder.get(a.order).rank:
      a.distance-b.distance||a.depth-b.depth||frame.byOrder.get(b.order).rank-frame.byOrder.get(a.order).rank);
    // Expose near-equal snap candidates rather than every feature in radius.
    const choices=kind==='surface'||allCandidates?visible:visible.filter(h=>h.distance<=visible[0].distance+1.5);
    return {candidates:choices,reason:!choices.length&&blocked.length?'Painter and geometric depth disagree; rotate or use wireframe.':
      !choices.length&&kind==='surface'&&wireframe?'Surface picking requires filled view.':'',blocked:!choices.length&&!!blocked.length};
  }
  // Normalize the physical pick frame into CSS pixels, including edge
  // interpolation, so raster density and unequal axis scales do not change snap.
  function cssPickFrame(frame,scale){
    if(scale[0]===1&&scale[1]===1)return frame;
    const down=p=>[p[0]/scale[0],p[1]/scale[1]],up=p=>[p[0]*scale[0],p[1]*scale[1]],c=frame.camera;
    const camera={...c,screen:q=>down(c.screen(q)),ray:p=>c.ray(up(p)),
      project:q=>{const h=c.project(q);return h?{...h,pixel:down(h.pixel)}:null;}};
    const entries=frame.entries.map(e=>{
      const path={...e.path,fill:e.path.fill.map(down),edges:e.path.edges.map(edge=>edge.map(down))};
      return {...e,path,bounds:pathBounds(path)};
    });
    return {camera,entries,byOrder:new Map(entries.map(e=>[e.path.order,e]))};
  }
  const sameFeature=(a,b)=>!!a&&!!b&&a.kind===b.kind&&a.bank===b.bank&&a.index===b.index&&
    a.indices.length===b.indices.length&&a.indices.every((n,i)=>n===b.indices[i]);
  // Retain the same visible authored feature, not its old coordinates.
  // Higher-priority newly acquired features still win.
  function automaticPick(frame,pixel,{previous=null,bypass=false,wireframe=false,acquire=8,release=11}={}){
    let reason='';
    for(const kind of bypass?['surface']:['vertex','edge','surface']){
      const retain=previous?.kind===kind&&kind!=='surface';
      const result=framePick(frame,pixel,kind,{radius:kind==='surface'?0:retain?release:acquire,wireframe,allCandidates:true});
      if(result.limited)return result;
      if(result.reason)reason=result.reason;
      const held=retain?result.candidates.find(h=>sameFeature(h,previous)&&h.distance<=release):null;
      const acquired=result.candidates.filter(h=>h.distance<=acquire),best=held||acquired[0];
      if(best){
        const choices=kind==='surface'?acquired:acquired.filter(h=>h.distance<=acquired[0].distance+1.5);
        return {...result,candidates:[best,...choices.filter(h=>h!==best)],reason:''};
      }
    }
    return {candidates:[],reason,blocked:!!reason};
  }
  // Conservative empty-space classification: painted but unpickable
  // geometry and unresolved or nearby snap candidates are not background.
  function frameBackgroundEmpty(frame,p,wireframe=false){
    if(!frame)return false;
    if(frame.entries.some(e=>inBounds(e.bounds,p,1)&&opticalCoverage({...e.path,strokeWidth:2},p)))return false;
    const result=automaticPick(frame,p,{wireframe,acquire:11,release:11});
    return !result.candidates.length&&!result.blocked&&!result.limited;
  }
  // A local selection is a material point, independent of the current camera.
  function adjustPoint(mesh,hit,weights, snap='none'){
    const e=mesh[hit.order];
    if(!e||e.item.index!==hit.index||e.item.bank!==hit.bank)throw Error('Point geometry changed');
    let indices=hit.indices.slice(),kind=hit.kind,w=weights.slice();
    if(w.length!==indices.length||!w.every(x=>Number.isFinite(x)&&x>=0&&x<=1)||Math.abs(w.reduce((a,b)=>a+b,0)-1)>1e-9)
      throw Error('Weights must be nonnegative and sum to one');
    const sum=w.reduce((a,b)=>a+b,0);w=w.map(x=>x/sum);
    if(snap==='vertex'){
      const point=indices.reduce((p,i,j)=>add(p,mul(e.item.points[i],w[j])),[0,0,0]);
      // On an edge use only its endpoints; on a surface use every original
      // vertex of its authored polygon, not just this triangulation simplex.
      // Equal distances are resolved by the lowest original vertex index.
      const candidates=kind==='surface'?e.item.points.map((_,i)=>i):indices;
      let best=null;
      for(const i of candidates){
        const distance=Math.hypot(...sub(e.item.points[i],point));
        if(!best||distance<best.distance||distance===best.distance&&i<best.index)best={index:i,distance};
      }
      indices=[best.index];w=[1];kind='vertex';
    }else if(snap==='midpoint'){
      if(kind!=='edge')throw Error('Select an authored edge first');
      w=[.5,.5];
    }else if(snap==='boundary'){
      if(kind!=='surface')throw Error('Select a surface first');
      const point=indices.reduce((p,i,j)=>add(p,mul(e.item.points[i],w[j])),[0,0,0]);
      let best=null;
      for(const edge of e.edges){
        const a=e.item.points[edge[0]],b=e.item.points[edge[1]],d=sub(b,a),t=clamp(dot(sub(point,a),d)/dot(d,d),0,1);
        const distance=Math.hypot(...sub(point,lerp(a,b,t)));
        if(!best||distance<best.distance)best={edge,t,distance};
      }
      if(!best)throw Error('No authored boundary');
      indices=best.edge.slice();w=[1-best.t,best.t];kind='edge';
    }else if(snap!=='none')throw Error('Unknown snap');
    const point=indices.reduce((p,i,j)=>add(p,mul(e.item.points[i],w[j])),[0,0,0]);
    return {...hit,kind,indices,weights:w,point};
  }
  function worldPoint(frame,p){return frame.origin.map((v,i)=>v+p[0]*frame.x[i]+p[1]*frame.y[i]+p[2]*frame.z[i]);}
  function markerVisibility(frame,hit,width,height,wireframe){
    const q=frame.camera.project(hit.point);
    if(!q||q.pixel[0]<0||q.pixel[0]>=width||q.pixel[1]<0||q.pixel[1]>=height)return 'out of view';
    if(wireframe)return 'wireframe';
    const matches=frame.entries.filter(e=>inBounds(e.bounds,q.pixel)&&e.path.fill.length>=3&&containsFill(e.path.fill,q.pixel));
    if(matches.length>2500||matches.reduce((n,e)=>n+e.entry.triangles.length,0)>30000)return 'visibility unresolved';
    const front=surfaceHits(matches.map(e=>e.entry),frame.camera,q.pixel)[0];
    if(front&&front.depth<q.depth-depthTolerance(q.depth))return 'occluded';
    const current=frame.byOrder.get(hit.order);
    if(matches.some(e=>!e.entry.triangles.length||(!current||e.rank>current.rank)&&!surfaceHits([e.entry],frame.camera,q.pixel).some(h=>Math.abs(h.depth-q.depth)<=depthTolerance(q.depth))))return 'visibility unresolved';
    return 'visible';
  }
  function drawPickMarker(canvas,hit,camera,color,opacity=1){
    if(!hit)return;
    const p=camera.project(hit.point);if(!p)return;
    const ctx=canvas.getContext('2d'),r=canvas.getBoundingClientRect(),scale=canvas.width/Math.max(1,r.width);
    ctx.save();ctx.globalAlpha=opacity;ctx.translate(...p.pixel);ctx.scale(scale,scale);
    ctx.beginPath();ctx.arc(0,0,10,0,2*Math.PI);ctx.strokeStyle='#17212d';ctx.lineWidth=6;ctx.stroke();
    ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,3.5,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.stroke();ctx.restore();
  }
  // The actual optical camera, not a ray from the physical Free View.
  function opticalCamera(capture){
    const {fx,fy,cx,cy,near}=capture;
    if(![fx,fy,cx,cy,near].every(Number.isFinite)||fx===0||fy===0||near<=0)throw Error('Invalid optical camera');
    const screen=q=>[cx+fx*q[0]/q[2],cy+fy*q[1]/q[2]];
    return {near,perspective:true,coordinates:q=>q.slice(),screen,
      project:q=>finite3(q)&&q[2]>=near?{pixel:screen(q),depth:q[2]}:null,
      ray:p=>({origin:[0,0,0],direction:[(p[0]-cx)/fx,(p[1]-cy)/fy,1],near})};
  }
  function opticalEntry(item,path,order){
    if(!item||path.role!=='objects'||item.bank!==path.bank||item.index!==path.index||item.primitive!==path.primitive||
       JSON.stringify(item.owner)!==JSON.stringify(path.owner)||item.type!==path.type||
       (item.type==='line'?1:item.mode??1)!==path.mode||
       item.points.length!==path.points?.length||!path.points.every(finite3))return null;
    const entry=preparePick([item])[0];entry.order=order;
    return entry;
  }
  // Per-primitive inverse, not a visibility certificate. Return material
  // weights, never screen interpolation. The signed Flat embedding is
  // independently checked against the chord actually drawn by the renderer.
  function opticalPrimitivePick(capture,path,item,pixel,kind,{radius=8,tolerance=.1,order=0}={}){
    const entry=opticalEntry(item,path,order),camera=opticalCamera(capture);
    if(!entry||!entry.valid)return {candidates:[],reason:'topology mismatch'};
    if(!['vertex','edge','surface'].includes(kind)||!Array.isArray(pixel)||pixel.length!==2||!pixel.every(Number.isFinite)||
       !Number.isFinite(radius)||radius<0||!Number.isFinite(tolerance)||tolerance<0||
       !['flat','globe'].includes(capture.geometry))throw RangeError('Invalid optical pick');
    if(kind==='surface'&&(!entry.triangles.length||path.fill.length<3||!containsFill(path.fill,pixel)))
      return {candidates:[],reason:entry.reason||'outside painted fill'};
    const material=(indices,weights)=>indices.reduce((p,i,j)=>add(p,mul(item.points[i],weights[j])),[0,0,0]);
    const effectivePoint=(indices,weights)=>indices.reduce((p,i,j)=>add(p,mul(path.points[i],weights[j])),[0,0,0]);
    const candidates=[];let failed=0;
    function addHit(indices,weights,paintedPixel){
      const point=material(indices,weights),effective=effectivePoint(indices,weights);
      let actual;
      try{actual=capture.geometry==='flat'?capture.flatMaterial(point):effective;}catch(error){failed++;return;}
      const projected=camera.project(actual);
      if(!projected||!projected.pixel.every(Number.isFinite)){failed++;return;}
      const error=Math.hypot(...sub(projected.pixel,paintedPixel));
      if(error>tolerance){failed++;return;}
      const distance=Math.hypot(...sub(pixel,projected.pixel));
      if(kind!=='surface'&&distance>radius)return;
      if(projected.pixel[0]<0||projected.pixel[0]>=capture.width||projected.pixel[1]<0||projected.pixel[1]>=capture.height)return;
      const h=pickDescriptor(entry,kind,indices,weights,point,projected.depth,projected.pixel,distance);
      candidates.push({...h,roundTripError:error,paintedPixel:paintedPixel.slice()});
    }
    if(kind==='vertex'){
      for(const [i,p] of path.points.entries()){const q=camera.project(p);if(q&&Math.hypot(...sub(pixel,q.pixel))<=radius)addHit([i],[1],q.pixel);}
    }else if(kind==='edge'){
      for(const ij of entry.edges){const h=edgeHit(camera,pixel,...ij.map(i=>path.points[i]));if(h&&h.distance<=radius)addHit(ij,[1-h.t,h.t],h.pixel);}
    }else{
      const ray=camera.ray(pixel);
      for(const ijk of entry.triangles){const h=rayTriangle(ray,...ijk.map(i=>path.points[i]));if(h)addHit(ijk,h.weights,pixel);}
    }
    candidates.sort((a,b)=>a.distance-b.distance||a.depth-b.depth);
    // A shared triangulation diagonal can describe the same material point.
    // Distinct intersections remain explicit instead of choosing arbitrarily.
    const distinct=kind==='surface'?candidates.filter((h,i)=>!candidates.slice(0,i).some(q=>Math.hypot(...sub(q.point,h.point))<=1e-7)):candidates;
    return {candidates:distinct,reason:failed?'optical round trip unresolved':'',unresolved:failed,visibility:'primitive-only'};
  }
  // Globe calibration only. Actual Canvas Direct painter coverage, not a
  // physical depth oracle. Guides are annotations; the horizon disk is a mask.
  function opticalFrame(mesh,capture){
    if(capture?.geometry!=='globe')return null;
    const items=new Map(mesh.map(e=>[e.item.bank+':'+e.item.index,e]));
    const entries=capture.paths.filter(p=>(p.alpha??1)>0).map((path,rank)=>{
      const e=items.get(path.bank+':'+path.index);
      return {path,rank,bounds:pathBounds(path),entry:e&&opticalEntry(e.item,path,e.order)?e:null};
    });
    return {capture,camera:opticalCamera(capture),entries,byOrder:new Map(entries.filter(e=>e.entry).map(e=>[e.entry.order,e]))};
  }
  function opticalCoverage(path,p){
    if(path.fill.length>=3&&containsFill(path.fill,p))return true;
    const r=(path.strokeWidth||0)/2+1e-6;
    return path.edges.some(([a,b])=>{
      const d=sub(b,a),q=sub(p,a),den=dot(d,d),t=den?dot(q,d)/den:-1;
      return t>=-1e-9&&t<=1+1e-9&&Math.hypot(...sub(q,mul(d,t)))<=r;
    });
  }
  // Owner inspection follows actual painter coverage, including lines and
  // horizon masks. It does not stage a material hit or change the orbit.
  function ownerAtFrame(frame,p,strokeWidth=1){
    if(!frame)return null;
    for(let i=frame.entries.length-1;i>=0;i--){
      const e=frame.entries[i],path=e.path;
      const width=path.strokeWidth??strokeWidth;
      if((path.alpha??path.p?.style?.alpha??1)<=0||!inBounds(e.bounds,p,width/2+1e-6)||
        !opticalCoverage({...path,strokeWidth:width},p))continue;
      // An opaque non-owner mask or unresolved topology must not expose
      // a hidden object behind it.
      if(!e.entry||(path.alpha??path.p?.style?.alpha??1)<1)return null;
      return e.entry.item.owner||null;
    }
    return null;
  }
  function opticalNearby(frame,p,r=0){
    return frame.entries.filter(e=>inBounds(e.bounds,p,r+(e.path.strokeWidth||0)/2+1e-6));
  }
  function opticalWork(entries){
    return entries.reduce((n,e)=>n+1+e.path.fill.length+2*e.path.edges.length+(e.path.points?.length||0)+(e.entry?.triangles.length||0),0);
  }
  function opticalVisibility(current,p,nearby){
    if(!opticalCoverage(current.path,p))return 'not painted';
    for(let i=nearby.length-1;i>=0;i--){
      const e=nearby[i];
      if(e.rank<=current.rank)break;
      if(!opticalCoverage(e.path,p))continue;
      if((e.path.alpha??1)<1)return 'visibility unresolved';
      return e.path.role==='occlusion'?'horizon masked':'occluded';
    }
    return 'visible';
  }
  function opticalMarker(frame,hit){
    const current=frame?.byOrder.get(hit.order);
    if(!current)return {visibility:'not painted'};
    const q=hit.indices.reduce((p,i,j)=>add(p,mul(current.path.points[i],hit.weights[j])),[0,0,0]);
    const projected=frame.camera.project(q);
    if(!projected)return {visibility:'out of view'};
    const p=projected.pixel,{width,height}=frame.capture;
    if(p[0]<0||p[0]>=width||p[1]<0||p[1]>=height)return {visibility:'out of view'};
    const nearby=opticalNearby(frame,p);
    if(nearby.length>2500||opticalWork(nearby)>30000)return {visibility:'visibility unresolved'};
    return {pixel:p,visibility:opticalVisibility(current,p,nearby)};
  }
  function opticalFramePick(frame,pixel,kind,{radius=8}={}){
    if(!frame)return {candidates:[],reason:'Optical picking is available for Globe only.'};
    const nearby=opticalNearby(frame,pixel,radius),work=opticalWork(nearby);
    if(nearby.length>2500||work>30000||kind!=='surface'&&work*work>4000000)
      return {candidates:[],reason:'Too much overlapping optical geometry; select a smaller region.',blocked:true};
    const visible=[];let blocked=false;
    for(const e of nearby){
      if(!e.entry){if(opticalCoverage(e.path,pixel))blocked=true;continue;}
      const result=opticalPrimitivePick(frame.capture,e.path,e.entry.item,pixel,kind,{radius,order:e.entry.order});
      for(const h of result.candidates){
        if(opticalVisibility(e,h.pixel,nearby)==='visible')visible.push(h);else blocked=true;
      }
    }
    visible.sort((a,b)=>a.distance-b.distance||frame.byOrder.get(b.order).rank-frame.byOrder.get(a.order).rank);
    return {candidates:kind==='surface'?visible:visible.filter(h=>h.distance<=visible[0].distance+1.5),
      reason:!visible.length&&blocked?'Point hidden by painter, horizon mask or unresolved coverage.':'',blocked:!visible.length&&blocked};
  }
  // Window geometry is a UI preference, never experiment or camera state.
  // Optical picking needs authored geometry, not an orbit pivot.
  function opticalGeometry(banks){
    if(!Array.isArray(banks)||banks.length!==2||!banks.every(Array.isArray))throw Error('Invalid physical banks');
    let count=0,vertices=0;const items=[];
    for(const [bank,primitives] of banks.entries())for(const [index,p] of primitives.entries()){
      count++;vertices+=p.points.length;
      if(count>100000||vertices>1000000)throw Error('Optical geometry budget exceeded');
      if(!p.metadata?.landmarkOwner||!p.points.every(finite3))continue;
      items.push({bank,index,primitive:p.metadata.landmarkPrimitive,primary:true,type:p.type,mode:p.mode,style:{...p.style},
        owner:JSON.parse(JSON.stringify(p.metadata.landmarkOwner)),points:p.points.map(q=>q.slice())});
    }
    return {kind:'optical',items,frame:{origin:[0,0,0],x:[1,0,0],y:[0,1,0],z:[0,0,1]}};
  }
  function reframePoint(hit,from,to,mesh){
    if(!hit)return null;
    const e=mesh.find(e=>e.item.bank===hit.bank&&e.item.index===hit.index&&e.item.primitive===hit.primitive&&
      JSON.stringify(e.item.owner)===JSON.stringify(hit.owner));
    if(!e||!e.valid||!hit.indices.every(i=>Number.isInteger(i)&&i>=0&&i<e.item.points.length))throw Error('Point frame topology mismatch');
    const same=t=>t.length===hit.indices.length&&t.every(i=>hit.indices.includes(i));
    if(hit.kind==='edge'&&!e.edges.some(same)||hit.kind==='surface'&&!e.triangles.some(same))throw Error('Point frame topology mismatch');
    const point=hit.indices.reduce((p,i,j)=>add(p,mul(e.item.points[i],hit.weights[j])),[0,0,0]);
    if(Math.hypot(...sub(worldPoint(from.frame,hit.point),worldPoint(to.frame,point)))>1e-6)throw Error('Point frame geometry changed');
    return {...hit,order:e.order,point,pixel:null,depth:0,distance:0};
  }
  function rasterSize(width,height,dpr){
    const scale=Math.min(Math.max(1,Number(dpr)||1),2,2048/Math.max(1,width,height));
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
  }
  function restoreView(input){
    if(!input||![input.yaw,input.pitch,input.zoom,...(Array.isArray(input.pan)?input.pan:[])].every(Number.isFinite)||
      !Array.isArray(input.pan)||input.pan.length!==2||Math.abs(input.yaw)>Math.PI+1e-9||Math.abs(input.pitch)>Math.PI/2+1e-9||
      input.zoom<.1||input.zoom>100||input.pan.some(x=>Math.abs(x)>1e8)||!['orthographic','perspective'].includes(input.projection)||
      typeof input.wireframe!=='boolean'||typeof input.spans!=='boolean')throw Error('Invalid stored viewer camera');
    return {yaw:input.yaw,pitch:input.pitch,zoom:input.zoom,pan:input.pan.slice(),projection:input.projection,wireframe:input.wireframe,spans:input.spans};
  }
  function restorePoint(mesh,hit){
    if(hit===null||hit===undefined)return null;
    const e=mesh[hit.order],n={vertex:1,edge:2,surface:3}[hit.kind];
    if(!e||!n||e.item.bank!==hit.bank||e.item.index!==hit.index||e.item.primitive!==hit.primitive||
      JSON.stringify(e.item.owner)!==JSON.stringify(hit.owner)||!Array.isArray(hit.indices)||hit.indices.length!==n||
      !hit.indices.every(i=>Number.isInteger(i)&&i>=0&&i<e.item.points.length)||new Set(hit.indices).size!==n||
      !Array.isArray(hit.weights)||!finite3(hit.point))throw Error('Stored point topology mismatch');
    if(hit.kind==='edge'&&!e.edges.some(t=>t.every((i,j)=>i===hit.indices[j])))throw Error('Invalid stored edge');
    if(hit.kind==='surface'&&!e.triangles.some(t=>t.every((i,j)=>i===hit.indices[j])))throw Error('Invalid stored triangle');
    const h=adjustPoint(mesh,hit,hit.weights);
    if(Math.hypot(...sub(h.point,hit.point))>1e-6)throw Error('Stored point geometry changed');
    // Preserve the original snapshot; the camera-dependent pixel/depth fields
    // are not used for restored marker projection.
    return JSON.parse(JSON.stringify(hit));
  }
  // Input descriptors are authenticated by the editor's physical resolver.
  // Bind to the actual local mesh without depending on its enumeration order.
  function correspondenceHits(mesh,rows){
    const byIndex=new Map(mesh.map(e=>[e.item.bank+':'+e.item.index,e]));
    return rows.map(row=>{
      const a=row.anchor,e=byIndex.get(row.bank+':'+row.index);
      if(!a||!e||e.item.primitive!==a.primitive||
        JSON.stringify(e.item.owner)!==JSON.stringify(a.owner)||!e.valid||
        !a.indices.every(i=>Number.isInteger(i)&&i>=0&&i<e.item.points.length))
        return {...row,hit:null};
      const same=t=>t.slice().sort((x,y)=>x-y).every((x,i)=>x===a.indices[i]);
      if(a.kind==='edge'&&!e.edges.some(same)||a.kind==='surface'&&!e.triangles.some(same))
        return {...row,hit:null};
      const point=a.indices.reduce((p,i,j)=>add(p,mul(e.item.points[i],a.weights[j])),[0,0,0]);
      return {...row,hit:pickDescriptor(e,a.kind,a.indices,a.weights,point,0,null,0)};
    });
  }
  // Distances are CSS pixels, independent of backing raster density. Only
  // actually displayed markers participate. Coincident markers cycle in row order.
  function correspondenceAt(rows,p,scale=[1,1],active=null){
    const candidates=rows.filter(r=>r.pixel&&['visible','wireframe'].includes(r.visibility))
      .map(r=>({id:r.id,d:Math.hypot((r.pixel[0]-p[0])/scale[0],(r.pixel[1]-p[1])/scale[1])}))
      .filter(r=>r.d<=12).sort((a,b)=>a.d-b.d);
    if(!candidates.length)return null;
    const tied=candidates.filter(r=>r.d<=candidates[0].d+2);
    return tied[(tied.findIndex(r=>r.id===active)+1)%tied.length].id;
  }
  function drawCorrespondence(canvas,p,row){
    const ctx=canvas.getContext('2d');ctx.save();ctx.font='bold 13px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=2;
    ctx.fillStyle=row.color;ctx.strokeStyle='#fff';ctx.beginPath();ctx.arc(...p,row.hovered?12:10,0,2*Math.PI);ctx.fill();ctx.stroke();
    ctx.fillStyle='#fff';ctx.fillText(row.label,p[0],p[1]);
    if(row.selected||row.hovered){ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.beginPath();ctx.arc(...p,16,0,2*Math.PI);ctx.stroke();ctx.strokeStyle='#142e45';ctx.lineWidth=3;ctx.stroke();}
    ctx.restore();
  }
  function mount(dialog,onSessionChange=()=>{},onSelectCorrespondence=()=>{},{inline=true,onFastVertex=null,onDeleteCorrespondence=null,onUndo=null,onRedo=null,onInspectOwner=null,onCancelPair=null,onConfirmMaterial=null,onGesture=null,onMoveEndpoint=null}={}){
    if(!inline)throw Error('Only the integrated physical viewer is supported');
    let inlineOpen=false;
    const isOpen=()=>inlineOpen;
    const canvas=dialog.querySelector('canvas'),status=dialog.querySelector('[data-viewer-status]'),heading=dialog.querySelector('h2');
    const projection=dialog.querySelector('[data-viewer-projection]'),wire=dialog.querySelector('[data-viewer-wire]');
    const env=dialog.ownerDocument.defaultView,frame=dialog.querySelector('[data-viewer-frame]');
    let geometry=null,state=reset(),gestures=null;
    const freeControls=dialog.querySelectorAll('[data-viewer-free-controls]');
    const pickControls=dialog.querySelector('[data-viewer-pick-controls]'),pickMode=dialog.querySelector('[data-viewer-pick-mode]'),
      pickChoices=dialog.querySelector('[data-viewer-pick-candidates]'),pickStatus=dialog.querySelector('[data-viewer-pick-status]');
    let mesh=null,paths=null,pickCache=null,hover=null,staged=null,confirmed=null,choices=[],hoverFrame=null,queued=null,restoringSession=false;
    let stagedMode=null,pendingVertex=null,inputKey=null,cssCache=null,pressedHover=null,lastHoverCSS=null,endpointDrag=null;
    let correspondenceRows=[],correspondenceMesh=null,correspondenceCache=[],correspondenceState=[];
    const correspondenceStatus=dialog.querySelector('[data-viewer-correspondence-status]');
    function setText(node,value){if(node&&node.textContent!==value)node.textContent=value;}
    let activeCorrespondence=null,hoveredCorrespondence=null;
    const selectionStatus=dialog.querySelector('[data-viewer-selection-status]');
    let inspectedOwner=null;
    const ownerMode=()=>inline&&pickMode.value==='owner'&&typeof onInspectOwner==='function';
    const ownerStatus=inline?dialog.querySelector('[data-viewer-owner-status]'):null;
    const ownerList=inline?dialog.querySelector('[data-viewer-owner-list]'):null;
    function inspectOwnerAt(css){return ownerAtFrame(pickCache,backing(css));}
    function setInspectedOwner(owner,label='',primitives=[]){
      inspectedOwner=owner;
      if(ownerStatus)setText(ownerStatus,label||'No owner selected.');
      if(ownerList){
        ownerList.replaceChildren();
        for(const p of primitives){const n=dialog.ownerDocument.createElement('option');n.textContent=p;n.value=p;ownerList.append(n);}
        ownerList.disabled=!primitives.length;
      }
    }
    function outlineOwner(entries,transform,ctx){
      if(!inspectedOwner)return;
      const key=JSON.stringify(inspectedOwner);
      // Dashed contextual outline of the selected owner's projected primitives;
      // it is not a visibility certificate.
      ctx.save();ctx.strokeStyle='#a126dd';ctx.lineWidth=2.5;
      ctx.setLineDash?.([5,4]);
      for(const e of entries){
        if(!e.entry||JSON.stringify(e.entry.item.owner)!==key)continue;
        const {fill,edges}=e.path;
        ctx.beginPath();
        if(fill.length>=3){ctx.moveTo(...transform(fill[0]));for(const q of fill.slice(1))ctx.lineTo(...transform(q));ctx.closePath();}
        for(const [a,b] of edges){ctx.moveTo(...transform(a));ctx.lineTo(...transform(b));}
        ctx.stroke();
      }
      ctx.restore();
    }
    const deleteButton=dialog.querySelector('[data-viewer-delete-pair]');
    if(deleteButton)deleteButton.onclick=()=>{if(activeCorrespondence!==null)onDeleteCorrespondence?.(activeCorrespondence);};
    const tooltip=dialog.querySelector('[data-viewer-marker-tooltip]');
    const localControls=dialog.querySelectorAll('[data-viewer-local-pick]');
    function clearMarkerHover(){hoveredCorrespondence=null;tooltip.hidden=true;canvas.style.cursor=pickActive()?'crosshair':'grab';}
    function markerAtCSS(css,active=null){
      const r=canvas.getBoundingClientRect(),scale=[canvas.width/Math.max(1,r.width),canvas.height/Math.max(1,r.height)];
      return correspondenceAt(correspondenceState,[(css[0]-r.left)*scale[0],(css[1]-r.top)*scale[1]],scale,active);
    }
    function hoverMarker(css){
      const id=geometry?markerAtCSS(css):null;
      const changed=id!==hoveredCorrespondence;hoveredCorrespondence=id;
      const row=correspondenceState.find(r=>r.id===id);
      canvas.style.cursor=id!==null?'pointer':'grab';
      tooltip.hidden=!row;
      if(row){const r=frame.getBoundingClientRect();setText(tooltip,'Correspondence #'+row.label+' · '+row.kind+' · click to select');
        tooltip.style.left=Math.max(0,Math.min(css[0]-r.left+14,frame.clientWidth-tooltip.offsetWidth-4))+'px';
        tooltip.style.top=Math.max(0,Math.min(css[1]-r.top+16,frame.clientHeight-tooltip.offsetHeight-4))+'px';}
      if(changed)redrawMarkers();
    }
    function selectOrbitPoint(hit){
      if(!geometry||!hit)return false;
      const next=rebaseRegionPivot(geometry,state,hit.point,canvas.width,canvas.height);
      if(next===state)return false;
      state=next;render();return true;
    }
    function focusCorrespondence(id){
      if(!geometry||!mesh)return false;
      const hit=correspondenceHits(mesh,correspondenceRows.filter(r=>r.id===id))[0]?.hit;
      if(!hit||!pickCache||!['visible','wireframe'].includes(markerVisibility(pickCache,hit,canvas.width,canvas.height,state.wireframe)))return false;
      return selectOrbitPoint(hit);
    }
    function resetPivot(){
      if(!geometry)return false;
      const next=resetPhysicalPivot(geometry,state,canvas.width,canvas.height);
      if(next!==state){state=next;render();sessionChanged();}
      return true;
    }
    function setCorrespondences(rows,active=null){
      activeCorrespondence=active;
      if(deleteButton)deleteButton.disabled=active===null;
      correspondenceRows=rows.slice();correspondenceMesh=undefined;
      if(geometry&&isOpen()&&frame.clientWidth>0&&frame.clientHeight>0){clearMarkerHover();redrawMarkers();}
    }
    function committedMarkers(project){
      if(correspondenceMesh!==mesh){correspondenceMesh=mesh;correspondenceCache=mesh?correspondenceHits(mesh,correspondenceRows):correspondenceRows.map(r=>({...r,hit:null}));}
      correspondenceState=correspondenceCache.map(row=>{
        const q=row.hit?project(row.hit):{visibility:'geometry unavailable'};
        const selected=row.id===activeCorrespondence;
        return {id:row.id,label:row.label,color:row.color,kind:row.anchor?.kind||row.kind||'vertex',selected,hovered:row.id===hoveredCorrespondence,visibility:q.visibility,pixel:q.pixel||null};
      });
      for(const row of correspondenceState.filter(r=>!r.selected).concat(correspondenceState.filter(r=>r.selected)))
        if(row.pixel&&['visible','wireframe'].includes(row.visibility)&&!(endpointDrag?.hit&&endpointDrag.target.kind==='saved'&&endpointDrag.target.id===row.id))drawCorrespondence(canvas,row.pixel,row);
      const selected=correspondenceState.find(r=>r.selected);
      setText(selectionStatus,selected?'Selected correspondence: #'+selected.label+' · '+selected.kind+' · '+selected.visibility+' · Delete to remove':'Click a numbered correspondence to select it.');
      if(correspondenceStatus){
        const visible=correspondenceState.filter(r=>['visible','wireframe'].includes(r.visibility)).length;
        setText(correspondenceStatus,correspondenceState.length?
          visible+' / '+correspondenceState.length+' correspondences shown · '+(activeCorrespondence?'Selected '+(correspondenceState.find(r=>r.selected)?.label||'—')+' · ':'')+correspondenceState.filter(r=>!['visible','wireframe'].includes(r.visibility)).map(r=>r.label+': '+r.visibility).join('; '):'');
      }
    }
    function sessionChanged(){if(!restoringSession)onSessionChange();}
    const details=dialog.querySelector('[data-viewer-point-details]'),coords=dialog.querySelector('[data-viewer-point-coords]'),parameters=dialog.querySelector('[data-viewer-point-parameters]'),paramInputs=[...dialog.querySelectorAll('[data-viewer-point-weight]')],confirmButton=dialog.querySelector('[data-viewer-point-confirm]'),cancelButton=dialog.querySelector('[data-viewer-point-cancel]');
    const snaps=[...dialog.querySelectorAll('[data-viewer-point-snap]')];
    function cancelHover(){if(hoverFrame!==null)env.cancelAnimationFrame(hoverFrame);hoverFrame=null;queued=null;hover=null;}
    function clearPick(){cancelHover();staged=null;stagedMode=null;inputKey=null;choices=[];pickChoices.replaceChildren();pickChoices.disabled=true;pickStatus.textContent='';}
    function clearGeometryPick(){confirmed=null;clearPick();mesh=null;paths=null;pickCache=null;pickMode.value='navigate';syncPoint();}
    function pickAvailable(){return !!geometry;}
    function fastVertex(){return inline&&typeof onFastVertex==='function'&&pickMode.value==='fast-vertex';}
    function automaticMode(){return !!geometry&&pickMode.value==='auto';}
    function pickKind(){return fastVertex()?'vertex':pickMode.value;}
    function pickActive(){return pickAvailable()&&pickMode.value!=='navigate'&&!ownerMode();}
    function draftEditable(){return !!staged&&pickActive()&&(!inline||stagedMode===pickMode.value);}
    function pendingHit(){
      if(!pendingVertex||!mesh)return null;
      const e=mesh.find(e=>e.item.bank===pendingVertex.bank&&e.item.index===pendingVertex.primitive);
      if(pendingVertex.anchor){const a=pendingVertex.anchor;if(!e?.valid||!a.indices.every(i=>e.item.points[i]))return null;const point=a.indices.reduce((p,i,j)=>add(p,mul(e.item.points[i],a.weights[j])),[0,0,0]);return pickDescriptor(e,a.kind,a.indices,a.weights,point,0,null,0);}
      const i=pendingVertex.vertex;
      if(!e?.valid||!Number.isInteger(i)||!e.item.points[i])return null;
      return pickDescriptor(e,'vertex',[i],[1],e.item.points[i],0,null,0);
    }
    function localMarkers(){
      if(automaticMode()&&onConfirmMaterial&&!staged)return [[endpointDrag?.hit&&endpointDrag.target.kind==='draft'?null:pendingHit(),'#009ab3']];
      return [[confirmed,'#25834b'],[staged,'#b83d18'],[pendingHit(),'#009ab3']];
    }
    function describe(h){return h.kind+' · bank '+(h.bank+1)+' · primitive '+h.index+' · indices '+h.indices.join(', ');}
    function updatePickStatus(message=''){pickStatus.textContent=!pickActive()?'':message||(fastVertex()?(draftEditable()?'Choose candidate, then Use vertex.':'Click a visible vertex to pair; drag to navigate.'):'')||(draftEditable()?'Staged: '+describe(staged)+' (not a correspondence)':pickActive()?(automaticMode()?'Automatic snapping · click to select; Ctrl for surface only.':'Click to stage a point; drag to orbit.'):'');}
    function syncPoint(){
      const editable=draftEditable(),h=inline?(editable?staged:!fastVertex()&&(automaticMode()||confirmed?.kind===pickKind())?confirmed:null):staged||confirmed;
      details.style.display=h&&pickActive()?'':'none';confirmButton.disabled=!editable;cancelButton.disabled=!editable;
      if(inline)pickChoices.disabled=!editable||choices.length<2;
      const nextInputKey=h?JSON.stringify([h.kind,h.bank,h.index,h.indices,h.weights]):null;
      if(inline)confirmButton.textContent=fastVertex()?'Use vertex':'Confirm point';
      parameters.style.display=editable&&h.kind!=='vertex'?'':'none';
      for(const [i,n] of paramInputs.entries()){
        n.closest('label').style.display=editable&&h.kind==='surface'&&i===1||editable&&h.kind!=='vertex'&&i===0?'':'none';
        if(!inline||nextInputKey!==inputKey&&h)n.value=h?.kind==='edge'?String(h.weights[1]):String(h?.weights[i]??0);
      }
      if(nextInputKey!==null)inputKey=nextInputKey;
      for(const n of snaps)n.disabled=!editable||(n.dataset.viewerPointSnap==='midpoint'&&h.kind!=='edge')||(n.dataset.viewerPointSnap==='boundary'&&h.kind!=='surface');
      if(!h||!geometry?.frame){setText(coords,'');return;}
      const fmt=p=>p.map(x=>x.toFixed(6)).join(', ');
      const vis=pickCache?markerVisibility(pickCache,h,canvas.width,canvas.height,state.wireframe):'not projected';
      setText(coords,(editable?'Draft':'Confirmed locally')+' · '+describe(h)+' · '+vis+' · local XYZ (m): '+fmt(h.point)+' · world XYZ (m): '+fmt(worldPoint(geometry.frame,h.point))+' · weights: '+fmt(h.weights));
    }
    function markers(){
      if(paths&&geometry){
        if(inline&&ownerMode()&&pickCache)outlineOwner(pickCache.entries,p=>p,canvas.getContext('2d'));
        committedMarkers(h=>{const visibility=pickCache?markerVisibility(pickCache,h,canvas.width,canvas.height,state.wireframe):'visibility unresolved';return {visibility,pixel:paths.camera.project(h.point)?.pixel};});
        for(const [h,color] of localMarkers()){
          if(h&&pickCache){const vis=markerVisibility(pickCache,h,canvas.width,canvas.height,state.wireframe);if(vis==='visible'||vis==='wireframe')drawPickMarker(canvas,h,paths.camera,color);}
        }
        if(pickActive())drawPickMarker(canvas,hover,paths.camera,'#008ab1',automaticMode()?0.55:1);
        drawEndpointGhost();
        {
          const p=paths.camera.project(state.orbitPivot?.point||[0,0,0])?.pixel;
          if(p&&p[0]>=0&&p[0]<canvas.width&&p[1]>=0&&p[1]<canvas.height){
            const ctx=canvas.getContext('2d'),[x,y]=p;
            const r=canvas.getBoundingClientRect(),scale=canvas.width/Math.max(1,r.width);
            ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.strokeStyle='#111';ctx.lineWidth=5;
            ctx.beginPath();ctx.moveTo(-16,0);ctx.lineTo(-6,0);ctx.moveTo(6,0);ctx.lineTo(16,0);
            ctx.moveTo(0,-16);ctx.lineTo(0,-6);ctx.moveTo(0,6);ctx.lineTo(0,16);ctx.stroke();
            ctx.strokeStyle='#ffe15a';ctx.lineWidth=2.5;ctx.stroke();ctx.restore();
          }
        }
      }
    }
    function changePoint(weights,snap){
      if(!draftEditable())return;
      try{staged=adjustPoint(mesh,staged,weights,snap);selectOrbitPoint(staged);choices=[];pickChoices.replaceChildren();pickChoices.disabled=true;updatePickStatus();syncPoint();redrawMarkers();}
      catch(error){pickStatus.textContent=error.message;}
    }
    dialog.querySelector('[data-viewer-point-apply]').onclick=()=>{
      if(!draftEditable())return;
      const val=n=>n.value.trim()===''?NaN:Number(n.value),a=val(paramInputs[0]),b=val(paramInputs[1]);
      changePoint(staged.kind==='edge'?[1-a,a]:[a,b,1-a-b],'none');
    };
    for(const n of snaps)n.onclick=()=>changePoint(staged.weights,n.dataset.viewerPointSnap);
    confirmButton.onclick=()=>{if(fastVertex()){acceptFastVertex();return;}if(draftEditable()){if(inline&&onConfirmMaterial&&!onConfirmMaterial(staged))return;confirmed=staged;clearPick();syncPoint();updatePickStatus(inline&&onConfirmMaterial?'Model point confirmed · Create pair when the photo point is selected.':'Point confirmed locally (not a correspondence).');redrawMarkers();}};
    cancelButton.onclick=()=>{if(inline&&!draftEditable())return;clearPick();syncPoint();updatePickStatus();redrawMarkers();};
    function redrawMarkers(){if(!paths)return;drawRegion(canvas,geometry,state,paths);markers();}
    function cssFrame(sx,sy){
      if(cssCache?.frame!==pickCache||cssCache.sx!==sx||cssCache.sy!==sy)
        cssCache={frame:pickCache,sx,sy,value:cssPickFrame(pickCache,[sx,sy])};
      return cssCache.value;
    }
    function query(css,bypass=false,previous=hover,dragging=false){
      if(!dragging&&!pickActive())return {candidates:[],reason:''};
      const r=canvas.getBoundingClientRect(),sx=canvas.width/Math.max(1,r.width),sy=canvas.height/Math.max(1,r.height);
      const p=[(css[0]-r.left)*sx,(css[1]-r.top)*sy],radius=8*Math.max(sx,sy);
      if(!pickCache)return {candidates:[],reason:''};
      if(automaticMode()||dragging){
        const result=automaticPick(cssFrame(sx,sy),[p[0]/sx,p[1]/sy],{previous,bypass,wireframe:state.wireframe});
        return {...result,candidates:result.candidates.map(h=>({...h,pixel:[h.pixel[0]*sx,h.pixel[1]*sy]}))};
      }
      return framePick(pickCache,p,pickKind(),{radius,wireframe:state.wireframe});
    }
    function queueHover(css,bypass=false){
      queued={css,bypass};if(hoverFrame!==null)return;
      hoverFrame=env.requestAnimationFrame(()=>{hoverFrame=null;const p=queued;queued=null;if(!p||!pickActive()||gestures?.active)return;
        const result=query(p.css,p.bypass);hover=result.candidates[0]||null;redrawMarkers();
        updatePickStatus(result.reason||(hover?'Hover: '+describe(hover)+(result.candidates.length>1?' · '+result.candidates.length+' candidates':''):''));});
    }
    function acceptFastVertex(){
      if(!fastVertex()||!draftEditable()||staged?.kind!=='vertex')return false;
      const hit=staged;
      const accepted=onFastVertex({...hit,vertex:hit.indices[0]});
      if(!accepted)return false;
      clearPick();syncPoint();updatePickStatus(accepted==='pending'?'Model vertex selected for pairing.':'Correspondence saved.');redrawMarkers();return true;
    }
    function stageAt(css,bypass=false,previous=hover){
      const result=query(css,bypass,previous);cancelHover();
      if(inline&&!result.candidates.length){updatePickStatus(result.reason||'No visible point here; existing draft retained.');redrawMarkers();return;}
      if(automaticMode()&&onConfirmMaterial&&result.candidates.length){
        const hit=result.candidates[0];
        // The editor owns the draft; no second local stage or confirmation.
        if(onConfirmMaterial(hit)){
          confirmed=null;clearPick();selectOrbitPoint(hit);syncPoint();
          updatePickStatus('Model point selected · double-click a draft marker to link when both points are ready.');redrawMarkers();
        }else redrawMarkers();
        return;
      }
      inputKey=null;choices=result.candidates;staged=choices[0]||null;stagedMode=staged?pickMode.value:null;
      pickChoices.replaceChildren();for(const [i,h] of choices.entries()){const option=dialog.ownerDocument.createElement('option');option.value=String(i);option.textContent=describe(h);pickChoices.append(option);}
      pickChoices.disabled=choices.length<2;pickChoices.value='0';selectOrbitPoint(staged);
      if(fastVertex()&&choices.length===1&&acceptFastVertex())return;
      syncPoint();updatePickStatus(result.reason||(choices.length>1?'Staged: '+describe(staged)+' · choose among '+choices.length+' candidates (not a correspondence)':''));redrawMarkers();
    }
    pickMode.onchange=()=>{pressedHover=null;cancelHover();clearMarkerHover();syncMode();render();};
    pickChoices.onchange=()=>{if(inline&&!draftEditable())return;staged=choices[Number(pickChoices.value)]||null;selectOrbitPoint(staged);syncPoint();updatePickStatus();redrawMarkers();};
    dialog.querySelector('[data-viewer-pick-clear]').onclick=()=>{confirmed=null;clearPick();syncPoint();updatePickStatus();redrawMarkers();};
    const sensitivityInput=dialog.querySelector('[data-viewer-sensitivity]'),sensitivityValue=dialog.querySelector('[data-viewer-sensitivity-value]');
    let sensitivity=DEFAULT_SENSITIVITY;
    try{const saved=env.localStorage.getItem(SENSITIVITY_KEY);if(saved!==null)sensitivity=orbitSensitivity(JSON.parse(saved));}catch(e){/* Optional UI preference. */}
    function setSensitivity(value){
      sensitivity=orbitSensitivity(value);sensitivityInput.value=String(sensitivity);sensitivityValue.textContent=sensitivity+'%';
      try{env.localStorage.setItem(SENSITIVITY_KEY,JSON.stringify(sensitivity));}catch(e){/* Optional UI preference. */}
    }
    setSensitivity(sensitivity);
    sensitivityInput.oninput=()=>setSensitivity(Number(sensitivityInput.value));
    dialog.querySelector('[data-viewer-sensitivity-reset]').onclick=()=>setSensitivity(DEFAULT_SENSITIVITY);
    function syncMode(){
      if(ownerStatus)ownerStatus.hidden=!ownerMode();
      if(ownerList)ownerList.hidden=!ownerMode();
      if(deleteButton){deleteButton.hidden=!geometry;deleteButton.disabled=activeCorrespondence===null;}
      pickControls.style.display=pickAvailable()?'':'none';
      for(const el of localControls)el.style.display=pickActive()?'':'none';
      selectionStatus.style.display=geometry?'':'none';
      canvas.style.cursor=gestures?.active?.moved?'grabbing':(pickActive()||ownerMode())?'crosshair':hoveredCorrespondence!==null?'pointer':'grab';
    }
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
      if(!geometry||!isOpen()||!(frame.clientWidth>0&&frame.clientHeight>0))return;
      clearMarkerHover();resizeRaster();cancelHover();
      paths=regionPaths(geometry,state,canvas.width,canvas.height);
      pickCache=mesh?pickFrame(mesh,paths):null;
      const r=drawRegion(canvas,geometry,state,paths);markers();syncPoint();
      status.textContent='Free View · '+r.visible+' / '+r.count+' primitives · geometric view (no atmospheric refraction)';
    }
    function sync(){projection.value=state.projection;wire.checked=state.wireframe;render();}
    function stopDrags(){lastHoverCSS=null;pressedHover=null;gestures?.cancel();}
    function close(){
      pendingVertex=null;stopDrags();clearMarkerHover();geometry=null;clearGeometryPick();
      correspondenceRows=[];correspondenceMesh=undefined;correspondenceCache=[];correspondenceState=[];activeCorrespondence=null;
      if(correspondenceStatus)correspondenceStatus.textContent='';
      inlineOpen=false;dialog.hidden=true;sessionChanged();
    }
    new env.ResizeObserver(()=>{
      if(!isOpen()||!(frame.clientWidth>0&&frame.clientHeight>0))return;
      const next=rasterSize(frame.clientWidth,frame.clientHeight,env.devicePixelRatio);
      if(canvas.width!==next.width||canvas.height!==next.height)render();
    }).observe(frame);
    env.addEventListener('resize',()=>{if(isOpen()){stopDrags();render();}});
    function resetScene(){
      if(!geometry)return false;
      stopDrags();cancelHover();state=physicalView(geometry);paths=null;pickCache=null;syncMode();sync();return true;
    }
    function backing(css){
      const r=canvas.getBoundingClientRect();return [(css[0]-r.left)*canvas.width/Math.max(1,r.width),(css[1]-r.top)*canvas.height/Math.max(1,r.height)];
    }
    dialog.querySelector('[data-viewer-reset]').onclick=()=>{const pivot=state.orbitPivot;state={...reset(),projection:'perspective',spans:true,...(pivot?{orbitPivot:pivot}:{})};sync();};
    dialog.querySelectorAll('[data-viewer-view]').forEach(n=>n.onclick=()=>{state=standardView(state,n.dataset.viewerView);render();});
    projection.onchange=()=>{state={...state,projection:projection.value};render();};
    wire.onchange=()=>{cancelHover();state={...state,wireframe:wire.checked};render();};
    dialog.querySelectorAll('[data-viewer-zoom]').forEach(n=>n.onclick=()=>{state=zoom(state,Number(n.dataset.viewerZoom));render();});
    function gestureTarget(css,context=false){
      if(!geometry||!context&&ownerMode())return {kind:'background'};
      {
        const h=pendingHit(),p=backing(css),r=canvas.getBoundingClientRect(),scale=[canvas.width/Math.max(1,r.width),canvas.height/Math.max(1,r.height)];
        if(h&&pickCache&&['visible','wireframe'].includes(markerVisibility(pickCache,h,canvas.width,canvas.height,state.wireframe))){
          const pixel=paths?.camera.project(h.point)?.pixel;
          if(pointerGestures.markerAt([{kind:'draft',pixel}],p,scale))return {kind:'draft'};
        }
      }
      const id=markerAtCSS(css,activeCorrespondence);
      return id!==null?{kind:'saved',id}:{kind:'background'};
    }
    function emptyPhysicalBackground(css){
      if(!geometry||!pickCache||ownerMode()||gestureTarget(css).kind!=='background')return false;
      const r=canvas.getBoundingClientRect(),p=[css[0]-r.left,css[1]-r.top];
      if(p[0]<0||p[1]<0||p[0]>=r.width||p[1]>=r.height)return false;
      // A locally staged advanced-mode point is also a marker, even when
      // it has not been passed to the shared draft yet.
      const sx=canvas.width/Math.max(1,r.width),sy=canvas.height/Math.max(1,r.height);
      if(localMarkers().some(([h])=>h&&['visible','wireframe'].includes(markerVisibility(pickCache,h,canvas.width,canvas.height,state.wireframe))&&pointerGestures.markerAt([{kind:'draft',pixel:paths.camera.project(h.point)?.pixel}],backing(css),[sx,sy])))return false;
      return frameBackgroundEmpty(cssFrame(sx,sy),p,state.wireframe);
    }
    function gestureStartTarget(css,event){
      const target=gestureTarget(css,event?.button===2);
      return geometry&&target.kind==='background'?{...target,empty:emptyPhysicalBackground(css)}:target;
    }
    // All endpoint edits are transient until pointer-up. Use the same
    // visible automatic picker even when the advanced manual mode is active.
    function updateEndpointDrag(a,event){
      const p=backing(a.point),inside=p[0]>=0&&p[0]<canvas.width&&p[1]>=0&&p[1]<canvas.height;
      const result=inside?query(a.point,!!event.ctrlKey,endpointDrag?.hit||null,true):{candidates:[],reason:'Outside viewport'};
      const hit=result.candidates.find(h=>h.pixel[0]>=0&&h.pixel[0]<canvas.width&&h.pixel[1]>=0&&h.pixel[1]<canvas.height)||null;
      endpointDrag={target:a.target,hit,pixel:p,reason:result.reason};
      redrawMarkers();
      canvas.style.cursor=hit?'move':'not-allowed';
      setText(pickStatus,hit?'Moving '+describe(hit)+' · release to apply':(result.reason||'No visible material point')+' · original point retained');
    }
    function drawEndpointGhost(){
      const d=endpointDrag;if(!d)return;
      if(d.hit){
        const row=d.target.kind==='saved'?correspondenceState.find(r=>r.id===d.target.id):null;
        if(row){const p=paths.camera.project(d.hit.point)?.pixel;if(p)drawCorrespondence(canvas,p,{...row,selected:true,hovered:false});}
        else drawPickMarker(canvas,d.hit,paths.camera,'#009ab3');
      }else{
        const ctx=canvas.getContext('2d'),r=canvas.getBoundingClientRect(),scale=canvas.width/Math.max(1,r.width);
        ctx.save();ctx.translate(...d.pixel);ctx.scale(scale,scale);ctx.strokeStyle='#cf3535';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(6,6);ctx.moveTo(-6,6);ctx.lineTo(6,-6);ctx.stroke();ctx.restore();
      }
    }
    gestures=pointerGestures.mount(canvas,{
      enabled:()=>isOpen()&&!!geometry,
      target:gestureStartTarget,backgroundDrag:()=>'orbit',
      markerDrag:()=>!!geometry,
      onStart(a){canvas.focus({preventScroll:true});lastHoverCSS=a.start;pressedHover=hover;cancelHover();clearMarkerHover();redrawMarkers();},
      onHover(css,event){
        lastHoverCSS=css;
        if(ownerMode()){clearMarkerHover();canvas.style.cursor='crosshair';return;}
        if(geometry&&gestureTarget(css).kind==='draft'){const had=!!hover;cancelHover();clearMarkerHover();if(had)redrawMarkers();canvas.style.cursor='move';return;}
        if(inline&&markerAtCSS(css)!==null){const had=!!hover;cancelHover();hoverMarker(css);if(had)redrawMarkers();canvas.style.cursor='move';}
        else if(pickActive()){if(hoveredCorrespondence!==null){clearMarkerHover();redrawMarkers();}queueHover(css,!!event.ctrlKey);}else hoverMarker(css);
      },
      onDrag(a,event){
        lastHoverCSS=null;clearMarkerHover();
        if(a.action==='marker'){if(onMoveEndpoint)updateEndpointDrag(a,event);else canvas.style.cursor='move';return;}
        canvas.style.cursor='grabbing';const delta=a.delta,r=canvas.getBoundingClientRect();
        state=a.action==='pan'?pan(state,delta[0]*canvas.width/Math.max(1,r.width),delta[1]*canvas.height/Math.max(1,r.height)):orbit(state,...delta,sensitivity);
        render();
      },
      onAction(a,event){
        if(a.kind==='drag'&&a.action==='marker'&&onMoveEndpoint){
          updateEndpointDrag(a,event);
          const hit=endpointDrag.hit;endpointDrag=null;
          if(!hit){redrawMarkers();return;}
          if(onMoveEndpoint(a.target,hit)===true){
            selectOrbitPoint(hit);sessionChanged();
          }
          redrawMarkers();return;
        }
        if(onGesture?.(a)===true)return;
        const css=a.point;
        if(a.kind==='double-click'&&a.target.kind==='background'&&a.target.empty===true){
          if(emptyPhysicalBackground(css))resetPivot();
          return;
        }
        if(a.kind!=='click')return;
        if(a.target.kind==='saved'){
          onSelectCorrespondence(a.target.id);
          if(focusCorrespondence(a.target.id))sessionChanged();
          hoverMarker(css);return;
        }
        if(a.target.kind==='draft'){
          if(geometry&&selectOrbitPoint(pendingHit()))sessionChanged();
          return;
        }
        // Do not turn the first click of a background double-click into a
        // draft selection, even when snapping would reach a nearby object.
        if(a.target.empty===true)return;
        if(ownerMode()&&pickAvailable()){onInspectOwner(inspectOwnerAt(css));redrawMarkers();return;}
        if(pickActive())stageAt(css,!!event.ctrlKey,pressedHover);else hoverMarker(css);
      },
      onEnd(a){pressedHover=null;const wasMoving=!!endpointDrag;endpointDrag=null;if(a.kind!=='click'){clearMarkerHover();redrawMarkers();if(wasMoving&&a.kind==='cancel')updatePickStatus('Move cancelled · original point retained.');}},
      onLeave(){lastHoverCSS=null;cancelHover();clearMarkerHover();if(!gestures.active){redrawMarkers();updatePickStatus();}}
    });
    // Capture modifier changes even when the canvas has not received focus.
    function refreshModifier(e){
      if(e.key!=='Control'||!lastHoverCSS||!isOpen()||dialog.hidden||!automaticMode()||gestures.active||gestureTarget(lastHoverCSS).kind!=='background')return;
      queueHover(lastHoverCSS,e.type==='keydown');
    }
    env.addEventListener('keydown',refreshModifier,true);env.addEventListener('keyup',refreshModifier,true);
    env.addEventListener('blur',()=>{lastHoverCSS=null;gestures.cancel();cancelHover();if(isOpen())redrawMarkers();});
    canvas.addEventListener('wheel',e=>{e.preventDefault();if(gestures.active)return;gestures.clearClicks();
      const factor=Math.exp(clamp(-e.deltaY*.0015,-20,20));
      if(geometry){state=zoom(state,factor);render();}
    },{passive:false});
    // Scope model shortcuts to the integrated viewport and its controls.
    dialog.addEventListener('keydown',e=>{
      const editable=e.target?.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName);
      if(!editable&&e.key==='Escape'&&gestures.active){e.preventDefault();gestures.cancel();}
      else if(inline&&!editable&&e.key==='Delete'&&activeCorrespondence!==null&&onDeleteCorrespondence){e.preventDefault();onDeleteCorrespondence(activeCorrespondence);}
      else if(inline&&!editable&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&(e.shiftKey?onRedo:onUndo)){e.preventDefault();(e.shiftKey?onRedo:onUndo)();}
      else if(e.key==='Escape'&&!editable){e.preventDefault();if(draftEditable()){clearPick();syncPoint();updatePickStatus();redrawMarkers();}else onCancelPair?.();}e.stopPropagation();});
    for(const event of ['click','change','input','pointerup','pointercancel','wheel','keydown'])dialog.addEventListener(event,e=>{e.stopPropagation();sessionChanged();});
    env.addEventListener('pagehide',()=>sessionChanged());
    return {cancelGesture(){gestures.cancel();},openPhysical(banks,framing=null){
      const next=initialPhysicalGeometry(banks,framing?.source,framing?.observer,framing?.spans,framing?.packages),nextMesh=preparePick(next.items);
      stopDrags();clearGeometryPick();geometry=next;mesh=nextMesh;state=physicalView(next);
      pickMode.value='auto';heading.textContent='Model · Free View';inlineOpen=true;dialog.hidden=false;syncMode();sync();sessionChanged();
    },refresh(){if(isOpen())render();},
    resetScene,resetPivot,focusCorrespondence,toggleWireframe(){if(!geometry)return false;wire.checked=!state.wireframe;wire.onchange();sessionChanged();return true;},
    inspectAt(css){if(!geometry||!onInspectOwner)return false;pickMode.value='owner';pickMode.onchange();onInspectOwner(inspectOwnerAt(css));redrawMarkers();sessionChanged();return true;},
    activateAutomatic(){if(!geometry)return false;pickMode.value='auto';pickMode.onchange();sessionChanged();return true;},
    sessionSnapshot(){
      if(!isOpen()||!geometry)return null;
      // Keep the existing version-4 physical-session schema byte-compatible.
      return JSON.parse(JSON.stringify({version:4,region:geometry.region,free:true,view:state,readOnly:false,
        base:{worldPoint:geometry.frame.origin,owner:geometry.owner,pixel:geometry.seed,frame:geometry.frame,eye:geometry.eye,focal:geometry.focal},
        raster:[canvas.width,canvas.height],pickMode:pickMode.value,staged,stagedMode,confirmed,choices,choice:pickChoices.value,inputs:paramInputs.map(n=>n.value)}));
    },restoreSession(saved){
      const g=geometry,m=mesh,r=saved?.region,b=saved?.base;
      if(!g||!m||saved?.version!==4||saved.readOnly!==false||saved.free!==true||
        !['navigate','vertex','edge','surface','fast-vertex','owner','auto'].includes(saved.pickMode)||
        !r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<0||r.y<0||r.width<=0||r.height<=0||
        !Array.isArray(saved.raster)||saved.raster.length!==2||!saved.raster.every(n=>Number.isInteger(n)&&n>0&&n<=2048))
        throw Error('Invalid integrated viewer session');
      if(!finite3(b?.worldPoint)||Math.hypot(...sub(g.frame.origin,b.worldPoint))>1e-6||
        JSON.stringify(r)!==JSON.stringify(g.region)||JSON.stringify(b.pixel)!==JSON.stringify(g.seed)||JSON.stringify(b.owner)!==JSON.stringify(g.owner)||JSON.stringify(b.frame)!==JSON.stringify(g.frame)||
        JSON.stringify(b.eye)!==JSON.stringify(g.eye)||b.focal!==g.focal)
        throw Error('Stored physical frame changed');
      let next=restoreView(saved.view);
      const p=saved.view.orbitPivot;
      if(p!==undefined){
        if(!finite3(p?.point)||!finite3(p.eye)||(!p.point.every(n=>n===0)&&p.eye[2]<=g.near)||[...p.point,...p.eye].some(x=>Math.abs(x)>1e9))
          throw Error('Invalid stored orbit pivot');
        next={...next,orbitPivot:{point:p.point.slice(),eye:p.eye.slice()}};
      }
      const a=restorePoint(m,saved.staged),c=restorePoint(m,saved.stagedMode===undefined&&saved.pickMode==='fast-vertex'?null:saved.confirmed);
      const draftMode=a?(saved.stagedMode||(['vertex','edge','surface','fast-vertex','auto'].includes(saved.pickMode)?saved.pickMode:a.kind)):null;
      if(a&&(!['vertex','edge','surface','fast-vertex','auto'].includes(draftMode)||draftMode!=='auto'&&a.kind!==(draftMode==='fast-vertex'?'vertex':draftMode)))throw Error('Invalid stored draft mode');
      if(!Array.isArray(saved.choices)||saved.choices.length>2500)throw Error('Invalid stored candidates');
      const candidates=saved.choices.map(h=>restorePoint(m,h));
      if(candidates.some(h=>!h))throw Error('Invalid stored candidate');
      restoringSession=true;
      try{
        stopDrags();clearPick();clearMarkerHover();
        staged=a;stagedMode=draftMode;confirmed=c;choices=candidates;state=next;paths=null;pickCache=null;correspondenceMesh=undefined;
        pickMode.value=saved.pickMode==='navigate'&&!a?'auto':saved.pickMode;
        for(const [i,h] of choices.entries()){const n=dialog.ownerDocument.createElement('option');n.value=String(i);n.textContent=describe(h);pickChoices.append(n);}
        pickChoices.disabled=choices.length<2;pickChoices.value=saved.choice;
        syncMode();resizeRaster();
        const ratio=Math.min(canvas.width,canvas.height)/Math.min(...saved.raster);
        state={...next,pan:next.pan.map(x=>x*ratio)};
        sync();if(staged&&Array.isArray(saved.inputs))paramInputs.forEach((n,i)=>{if(typeof saved.inputs[i]==='string'&&saved.inputs[i].length<64)n.value=saved.inputs[i];});
        updatePickStatus();
      }finally{restoringSession=false;}
      sessionChanged();return true;
    },setPendingVertex(landmark){
      const next=landmark?{bank:landmark.bank,primitive:landmark.primitive,vertex:landmark.vertex,anchor:landmark.anchor}:null;
      if(JSON.stringify(next)===JSON.stringify(pendingVertex))return;
      pendingVertex=next;if(isOpen())redrawMarkers();
    },discardPairDraft(){
      if(stagedMode==='fast-vertex'){clearPick();syncPoint();if(isOpen())redrawMarkers();}
    },setInspectedOwner(owner,label,primitives){setInspectedOwner(owner,label,primitives);if(isOpen())redrawMarkers();},clearLocalPoint(){confirmed=null;clearPick();syncPoint();if(isOpen())redrawMarkers();},close,setCorrespondences,correspondences:()=>JSON.parse(JSON.stringify(correspondenceState)),isOpen,
      snapshot:()=>isOpen()&&geometry?{mode:'free',region:{...geometry.region},view:JSON.parse(JSON.stringify(state)),count:geometry.items.length,pivot:worldPoint(geometry.frame,state.orbitPivot?.point||[0,0,0]),pivotError:geometry.pivotError,pickMode:pickMode.value,staged:staged?JSON.parse(JSON.stringify(staged)):null,confirmed:confirmed?JSON.parse(JSON.stringify(confirmed)):null}:null};
  }
  return Object.freeze({automaticPick,cssPickFrame,frameBackgroundEmpty,resetPhysicalPivot,physicalGeometry,initialPhysicalGeometry,physicalView,localGeometry,visibleItems,bounds,reset,standardView,orbit,orbitSensitivity,pan,zoom,camera,draw,regionSeed,regionPivot,regionGeometry,regionCamera,rebaseRegionPivot,indexedTriangles,preparePick,rayTriangle,surfaceHits,edgeHit,pickRegion,regionPaths,pickFrame,framePick,containsFill,adjustPoint,worldPoint,markerVisibility,restoreView,restorePoint,opticalCamera,opticalEntry,opticalPrimitivePick,opticalFrame,opticalFramePick,opticalMarker,ownerAtFrame,correspondenceHits,correspondenceAt,drawRegion,opticalGeometry,reframePoint,rasterSize,mount});
}));
