/* Isolated authored-geometry inspection. No optical or calibration state. */
(function(root,factory){
  const api=factory(root.CurvatureEarClip||(typeof require==='function'?require('../../geometry/CurvatureEarClip'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CurvatureModernLandmarkViewer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(earClip){
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
    if(!selection?.owner||!finite3(observer.origin))throw Error('No visible owner in this rectangle');
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
    const indices=new Set(selection.primaryIndices),candidates=items.filter(p=>p.bank===selection.owner.bank&&indices.has(p.index));
    const hit=regionPivot(candidates,selection.pixel,source.width,source.height,focal,near),pivot=hit.point;
    const worldAxis=a=>[0,1,2].map(i=>a.reduce((sum,v,j)=>sum+v*observerAxes[j][i],0));
    const axes=[right,up,back].map(worldAxis);
    const origin=add(add(observer.origin,worldAxis(camera.pos)),axes.reduce((p,a,i)=>add(p,mul(a,pivot[i])),[0,0,0]));
    const frame={origin,x:axes[0],y:axes[1],z:axes[2]};
    return {kind:'region',frame,items:items.map(p=>({...p,points:p.points.map(q=>sub(q,pivot))})),
      eye:pivot.map(x=>x===0?0:-x),focal,near,region:{...selection.region},seed:selection.pixel.slice(),pivotError:hit.distance,
      owner:JSON.parse(JSON.stringify(selection.owner))};
  }
  function regionCamera(geometry,state,width,height){
    const a=state.yaw,p=state.pitch,ca=Math.cos(a),sa=Math.sin(a),cp=Math.cos(p),sp=Math.sin(p);
    const right=[ca,0,-sa],up=[-sa*sp,cp,-ca*sp],toward=[sa*cp,sp,ca*cp],eye=geometry.eye;
    const r=geometry.region,scale=Math.min(width/r.width,height/r.height),focal=geometry.focal*scale*state.zoom;
    const origin=[width/2+(geometry.seed[0]-r.x-r.width/2)*scale+state.pan[0],
      height/2+(geometry.seed[1]-r.y-r.height/2)*scale+state.pan[1]];
    // Rotate the original off-axis eye and its rolled basis together around
    // the physical pivot. At zero orbit the physical direction is unchanged.
    const near=Math.max(geometry.near,eye[2]*1e-7);
    function coordinates(q){return [dot(q,right)-eye[0],dot(q,up)-eye[1],eye[2]-dot(q,toward)];}
    function screen(q){
      const z=state.projection==='perspective'?q[2]:eye[2];
      return [origin[0]+focal*(q[0]/z+eye[0]/eye[2]),origin[1]-focal*(q[1]/z+eye[1]/eye[2])];
    }
    function ray(pixel){
      const u=(pixel[0]-origin[0])/focal-eye[0]/eye[2],v=(origin[1]-pixel[1])/focal-eye[1]/eye[2];
      const perspective=state.projection==='perspective';
      const start=add(add(mul(right,eye[0]+(perspective?0:u*eye[2])),mul(up,eye[1]+(perspective?0:v*eye[2]))),mul(toward,eye[2]));
      const direction=perspective?add(add(mul(right,u),mul(up,v)),mul(toward,-1)):mul(toward,-1);
      // Parameter t is forward camera depth, not Euclidean range.
      return {origin:start,direction,near};
    }
    return {coordinates,screen,ray,near,origin,right,up,toward,perspective:state.projection==='perspective',
      project(q){const v=coordinates(q);return v[2]>=near?{pixel:screen(v),depth:v[2]}:null;}};
  }
  // Picking uses the canonical physical authored geometry, not rendered
  // pixels, synthetic thickness, clipped vertices, or EarClip ordinals.
  function indexedTriangles(item){
    const pts=item.points,fail=reason=>({triangles:[],reason});
    if(item.type!=='polygon'||!((item.mode??1)&2))return fail('not-filled');
    if(!Array.isArray(pts)||pts.length<3||!pts.every(finite3))return fail('invalid-coordinate');
    if(!earClip)throw Error('EarClip required for indexed surface picking');
    const origin=pts[0],relative=pts.map(p=>sub(p,origin));
    let longest=relative[0],scale=0;
    for(const p of relative){const n=Math.hypot(...p);if(n>scale){scale=n;longest=p;}}
    if(!(scale>0))return fail('zero-area');
    const axis=unit(longest),scaled=relative.map(p=>mul(p,1/scale));
    let normal=null,area=0;
    for(const p of scaled){const n=cross(axis,p),a=Math.hypot(...n);if(a>area){normal=n;area=a;}}
    if(!(area>1e-9))return fail('zero-area');
    normal=unit(normal);
    // Relative tolerance plus a small absolute allowance for physical
    // placement arithmetic (metres). Reject nonplanar filled primitives.
    if(relative.some(p=>Math.abs(dot(p,normal))>Math.max(1e-7,scale*1e-9)))return fail('nonplanar');
    const y=cross(normal,axis);
    let points=scaled.map((p,i)=>[dot(p,axis),dot(p,y),i]);
    // Remove only duplicate consecutive points (including closure), retaining
    // the first authored index. Backtracking collinear edges are not simple.
    const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    points=points.filter((p,i)=>i===0||dist(p,points[i-1])>1e-9);
    if(points.length>1&&dist(points[0],points.at(-1))<=1e-9)points.pop();
    if(points.length<3)return fail('zero-area');
    for(let i=0;i<points.length;i++){
      const a=points[(i+points.length-1)%points.length],b=points[i],c=points[(i+1)%points.length];
      const u=sub(b.slice(0,2),a.slice(0,2)),w=sub(c.slice(0,2),b.slice(0,2));
      if(Math.abs(u[0]*w[1]-u[1]*w[0])<=1e-9&&dot(u,w)<-1e-12)return fail('backtracking-edge');
    }
    const result=earClip.triangulate(points);
    if(result.reason)return fail(result.reason);
    return {triangles:result.triangles.map(t=>t.map(p=>p[2])),reason:null};
  }
  function preparePick(items){
    return items.map((item,order)=>{
      const pts=item.points,valid=Array.isArray(pts)&&pts.every(finite3),edges=[];
      if(valid)for(let i=0;i<(item.type==='polygon'?pts.length:pts.length-1);i++){
        const j=(i+1)%pts.length;
        if(Math.hypot(...sub(pts[i],pts[j]))>1e-10)edges.push([i,j]);
      }
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
  function framePick(frame,pixel,kind,{radius=8,wireframe=false}={}){
    const matches=frame.entries.filter(e=>inBounds(e.bounds,pixel,radius));
    const work=matches.reduce((n,e)=>n+e.entry.item.points.length+e.entry.triangles.length,0);
    if(work>30000||matches.length>2500)return {candidates:[],reason:'Too much overlapping geometry; zoom in or rotate.',blocked:true};
    // Restrict geometry to the local screen neighbourhood, including all
    // fills which could occlude a snapped pixel inside that neighbourhood.
    const nearby=matches.map(e=>e.entry);
    // Bound the quadratic snapped-depth stage independently.
    if(kind!=='surface'&&work*work>4000000)return {candidates:[],reason:'Too much overlapping geometry for snapping; zoom in or rotate.',blocked:true};
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
    const choices=kind==='surface'?visible:visible.filter(h=>h.distance<=visible[0].distance+1.5);
    return {candidates:choices,reason:!choices.length&&blocked.length?'Painter and geometric depth disagree; rotate or use wireframe.':
      !choices.length&&kind==='surface'&&wireframe?'Surface picking requires filled view.':'',blocked:!choices.length&&!!blocked.length};
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
  function drawPickMarker(canvas,hit,camera,color){
    if(!hit)return;
    const p=camera.project(hit.point);if(!p)return;
    const ctx=canvas.getContext('2d');ctx.save();ctx.lineWidth=2;ctx.strokeStyle=color;ctx.fillStyle=color;
    ctx.beginPath();ctx.arc(...p.pixel,5,0,2*Math.PI);ctx.stroke();
    ctx.beginPath();ctx.arc(...p.pixel,2,0,2*Math.PI);ctx.fill();ctx.restore();
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
  function mount(dialog,onSessionChange=()=>{}){
    const canvas=dialog.querySelector('canvas'),status=dialog.querySelector('[data-viewer-status]'),heading=dialog.querySelector('h2');
    const projection=dialog.querySelector('[data-viewer-projection]'),wire=dialog.querySelector('[data-viewer-wire]'),spans=dialog.querySelector('[data-viewer-spans]');
    const env=dialog.ownerDocument.defaultView,frame=dialog.querySelector('[data-viewer-frame]'),titleBar=dialog.querySelector('[data-viewer-titlebar]'),grip=dialog.querySelector('[data-viewer-resize]');
    let geometry=null,crop=null,free=false,state=reset(),drag=null,windowDrag=null,rect=null;
    const sceneControls=dialog.querySelector('[data-viewer-scene-controls]'),freeButton=dialog.querySelector('[data-viewer-free]');
    const freeControls=dialog.querySelectorAll('[data-viewer-free-controls]');
    const pickControls=dialog.querySelector('[data-viewer-pick-controls]'),pickMode=dialog.querySelector('[data-viewer-pick-mode]'),
      pickChoices=dialog.querySelector('[data-viewer-pick-candidates]'),pickStatus=dialog.querySelector('[data-viewer-pick-status]');
    let mesh=null,paths=null,pickCache=null,opticalCache=null,opticalTransform=null,hover=null,staged=null,confirmed=null,choices=[],hoverFrame=null,queued=null,restoringSession=false;
    function sessionChanged(){if(!restoringSession)onSessionChange();}
    const details=dialog.querySelector('[data-viewer-point-details]'),coords=dialog.querySelector('[data-viewer-point-coords]'),parameters=dialog.querySelector('[data-viewer-point-parameters]'),paramInputs=[...dialog.querySelectorAll('[data-viewer-point-weight]')],confirmButton=dialog.querySelector('[data-viewer-point-confirm]'),cancelButton=dialog.querySelector('[data-viewer-point-cancel]');
    const snaps=[...dialog.querySelectorAll('[data-viewer-point-snap]')];
    function cancelHover(){if(hoverFrame!==null)env.cancelAnimationFrame(hoverFrame);hoverFrame=null;queued=null;hover=null;}
    function clearPick(){cancelHover();staged=null;choices=[];pickChoices.replaceChildren();pickChoices.disabled=true;pickStatus.textContent='';}
    function clearGeometryPick(){confirmed=null;clearPick();mesh=null;paths=null;pickCache=null;opticalCache=null;opticalTransform=null;pickMode.value='navigate';syncPoint();}
    function pickAvailable(){return !!crop&&(free||!!opticalCache);}
    function pickActive(){return pickAvailable()&&pickMode.value!=='navigate';}
    function describe(h){return h.kind+' · bank '+(h.bank+1)+' · primitive '+h.index+' · indices '+h.indices.join(', ');}
    function updatePickStatus(message=''){pickStatus.textContent=message||(staged?'Staged: '+describe(staged)+' (not a correspondence)':pickActive()?'Click to stage a point; drag to orbit.':'');}
    function syncPoint(){
      const h=staged||confirmed,editable=!!staged;
      details.style.display=h?'':'none';confirmButton.disabled=!editable;cancelButton.disabled=!editable;
      parameters.style.display=editable&&h.kind!=='vertex'?'':'none';
      for(const [i,n] of paramInputs.entries()){
        n.closest('label').style.display=editable&&h.kind==='surface'&&i===1||editable&&h.kind!=='vertex'&&i===0?'':'none';
        n.value=h?.kind==='edge'?String(h.weights[1]):String(h?.weights[i]??0);
      }
      for(const n of snaps)n.disabled=!editable||(n.dataset.viewerPointSnap==='midpoint'&&h.kind!=='edge')||(n.dataset.viewerPointSnap==='boundary'&&h.kind!=='surface');
      if(!h||!geometry?.frame){coords.textContent='';return;}
      const fmt=p=>p.map(x=>x.toFixed(6)).join(', ');
      const vis=free&&pickCache?markerVisibility(pickCache,h,canvas.width,canvas.height,state.wireframe):opticalCache?opticalScreen(h).visibility:'not projected';
      coords.textContent=(editable?'Draft':'Confirmed locally')+' · '+describe(h)+' · '+vis+' · local XYZ (m): '+fmt(h.point)+' · world XYZ (m): '+fmt(worldPoint(geometry.frame,h.point))+' · weights: '+fmt(h.weights);
    }
    function opticalScreen(hit){
      const q=opticalMarker(opticalCache,hit),t=opticalTransform;
      if(!q.pixel||!t)return q;
      const p=[q.pixel[0]*t.scale+t.offsetX,q.pixel[1]*t.scale+t.offsetY];
      if(p[0]<t.x||p[0]>=t.x+t.width||p[1]<t.y||p[1]>=t.y+t.height)return {visibility:'out of crop'};
      return {pixel:p,visibility:q.visibility};
    }
    function opticalMarkers(){
      const t=opticalTransform;if(!opticalCache||!t)return;
      const ctx=canvas.getContext('2d');ctx.save();ctx.beginPath();ctx.rect(t.x,t.y,t.width,t.height);ctx.clip();
      try{
        for(const [h,color] of [[confirmed,'#25834b'],[staged,'#b83d18'],[pickActive()?hover:null,'#008ab1']]){
          if(!h)continue;const q=opticalScreen(h);
          if(q.visibility==='visible')drawPickMarker(canvas,h,{project:()=>q},color);
        }
      }finally{ctx.restore();}
    }
    function markers(){
      if(paths&&crop&&free){
        for(const [h,color] of [[confirmed,'#25834b'],[staged,'#b83d18']]){
          if(h&&pickCache){const vis=markerVisibility(pickCache,h,canvas.width,canvas.height,state.wireframe);if(vis==='visible'||vis==='wireframe')drawPickMarker(canvas,h,paths.camera,color);}
        }
        if(pickActive())drawPickMarker(canvas,hover,paths.camera,'#008ab1');
      }
    }
    function changePoint(weights,snap){
      if(!staged)return;
      try{staged=adjustPoint(mesh,staged,weights,snap);choices=[];pickChoices.replaceChildren();pickChoices.disabled=true;updatePickStatus();syncPoint();redrawMarkers();}
      catch(error){pickStatus.textContent=error.message;}
    }
    dialog.querySelector('[data-viewer-point-apply]').onclick=()=>{
      if(!staged)return;
      const val=n=>n.value.trim()===''?NaN:Number(n.value),a=val(paramInputs[0]),b=val(paramInputs[1]);
      changePoint(staged.kind==='edge'?[1-a,a]:[a,b,1-a-b],'none');
    };
    for(const n of snaps)n.onclick=()=>changePoint(staged.weights,n.dataset.viewerPointSnap);
    confirmButton.onclick=()=>{if(staged){confirmed=staged;clearPick();syncPoint();updatePickStatus('Point confirmed locally (not a correspondence).');redrawMarkers();}};
    cancelButton.onclick=()=>{clearPick();syncPoint();updatePickStatus();redrawMarkers();};
    function redrawMarkers(){if(crop&&!free){try{crop.paint(canvas,false);opticalMarkers();}catch(error){status.textContent='Magnifier unavailable: '+error.message;}return;}if(!paths)return;drawRegion(canvas,geometry,state,paths);markers();}
    function query(css){
      if(!pickActive())return {candidates:[],reason:''};
      const r=canvas.getBoundingClientRect(),sx=canvas.width/Math.max(1,r.width),sy=canvas.height/Math.max(1,r.height);
      const p=[(css[0]-r.left)*sx,(css[1]-r.top)*sy],radius=8*Math.max(sx,sy);
      if(free)return pickCache?framePick(pickCache,p,pickMode.value,{radius,wireframe:state.wireframe}):{candidates:[],reason:''};
      const t=opticalTransform;
      if(!t||p[0]<t.x||p[0]>=t.x+t.width||p[1]<t.y||p[1]>=t.y+t.height)return {candidates:[],reason:''};
      const result=opticalFramePick(opticalCache,[(p[0]-t.offsetX)/t.scale,(p[1]-t.offsetY)/t.scale],pickMode.value,{radius:radius/t.scale});
      return {...result,candidates:result.candidates.filter(h=>opticalScreen(h).visibility==='visible')};
    }
    function queueHover(css){
      queued=css;if(hoverFrame!==null)return;
      hoverFrame=env.requestAnimationFrame(()=>{hoverFrame=null;const p=queued;queued=null;if(!p||!pickActive()||drag)return;
        const result=query(p);hover=result.candidates[0]||null;redrawMarkers();
        updatePickStatus(result.reason||(hover?'Hover: '+describe(hover)+(result.candidates.length>1?' · '+result.candidates.length+' candidates':''):''));});
    }
    function stageAt(css){
      cancelHover();const result=query(css);choices=result.candidates;staged=choices[0]||null;
      pickChoices.replaceChildren();for(const [i,h] of choices.entries()){const option=dialog.ownerDocument.createElement('option');option.value=String(i);option.textContent=describe(h);pickChoices.append(option);}
      pickChoices.disabled=choices.length<2;syncPoint();updatePickStatus(result.reason||(choices.length>1?'Staged: '+describe(staged)+' · choose among '+choices.length+' candidates (not a correspondence)':''));redrawMarkers();
    }
    pickMode.onchange=()=>{cancelHover();syncMode();render();};
    pickChoices.onchange=()=>{staged=choices[Number(pickChoices.value)]||null;syncPoint();updatePickStatus();redrawMarkers();};
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
      sceneControls.style.display=crop?'':'none';
      for(const el of freeControls)el.style.display=crop&&!free?'none':'';
      spans.closest('label').style.display=crop?'none':'';
      freeButton.disabled=!crop||free||!crop.build;freeButton.title=crop?.reason||'';
      pickControls.style.display=pickAvailable()?'':'none';
      canvas.style.cursor=pickActive()?'crosshair':crop&&!free&&!crop.build?'default':'';
    }
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
      if((!geometry&&!crop)||!dialog.open)return;
      resizeRaster();
      if(crop&&!free){
        cancelHover();opticalCache=null;opticalTransform=null;pickCache=null;
        try{
          if(crop.optical&&crop.build&&!mesh){geometry=crop.build();mesh=preparePick(geometry.items);}
          const result=crop.paint(canvas,!!(crop.optical&&mesh));
          opticalTransform=result.transform;opticalCache=mesh&&result.stats?.picking?opticalFrame(mesh,result.stats.picking):null;
          status.textContent='Scene View · '+result.transform.scale.toFixed(2)+'× source raster · same optical camera · '+(crop.reason||(opticalCache?'Globe optical picking · drag to orbit or choose Free View':'drag to orbit or choose Free View'));
          opticalMarkers();
        }catch(error){status.textContent='Magnifier unavailable: '+error.message;opticalCache=null;}
        syncMode();syncPoint();updatePickStatus();return;
      }
      if(crop&&free){cancelHover();opticalCache=null;opticalTransform=null;paths=regionPaths(geometry,state,canvas.width,canvas.height);pickCache=mesh?pickFrame(mesh,paths):null;const r=drawRegion(canvas,geometry,state,paths);markers();syncPoint();status.textContent='Free View · '+r.visible+' / '+r.count+' primitives · geometric view (no atmospheric refraction) · Reset View restores optical crop';return;}
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
    function close(){stopDrags();clearGeometryPick();saveRect();geometry=null;crop=null;free=false;if(dialog.open)dialog.close();sessionChanged();}
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
    function resetScene(){stopDrags();cancelHover();paths=null;pickCache=null;free=false;state=reset();syncMode();render();}
    function enterFree(){
      if(!crop||free)return !!geometry;
      if(!crop.build)return false;
      try{if(!geometry)geometry=crop.build();if(!mesh)mesh=preparePick(geometry.items);free=true;state={...reset(),projection:'perspective',spans:true};syncMode();sync();return true;}
      catch(error){crop.reason='Free View unavailable: '+error.message;crop.build=null;free=false;syncMode();render();return false;}
    }
    freeButton.onclick=enterFree;
    dialog.querySelector('[data-viewer-scene-reset]').onclick=resetScene;
    dialog.querySelector('[data-viewer-reset]').onclick=()=>{if(crop){state={...reset(),projection:'perspective',spans:true};}else state=initialView();sync();};
    dialog.querySelectorAll('[data-viewer-view]').forEach(n=>n.onclick=()=>{state=standardView(state,n.dataset.viewerView);render();});
    projection.onchange=()=>{state={...state,projection:projection.value};render();};
    wire.onchange=()=>{cancelHover();state={...state,wireframe:wire.checked};render();};
    spans.onchange=()=>{state={...state,spans:spans.checked,pan:[0,0],zoom:1};render();};
    dialog.querySelectorAll('[data-viewer-zoom]').forEach(n=>n.onclick=()=>{state=zoom(state,Number(n.dataset.viewerZoom));render();});
    canvas.addEventListener('pointerdown',e=>{
      if((!geometry&&!crop?.build)||drag||windowDrag||![0,1,2].includes(e.button))return;
      e.preventDefault();canvas.focus({preventScroll:true});cancelHover();drag={id:e.pointerId,css:[e.clientX,e.clientY],start:[e.clientX,e.clientY],moved:false,pan:e.button!==0||e.shiftKey,button:e.button};canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove',e=>{
      const css=[e.clientX,e.clientY];
      if(!drag){if(pickActive())queueHover(css);return;}
      if(drag.id!==e.pointerId)return;
      if(!drag.moved&&Math.hypot(...sub(css,drag.start))<3)return;
      drag.moved=true;const delta=sub(css,drag.css);
      if(crop&&!free&&!enterFree())return;
      // Orbit uses CSS pixels only. Pan still maps into backing-store pixels.
      const r=canvas.getBoundingClientRect();
      state=drag.pan?pan(state,delta[0]*canvas.width/Math.max(1,r.width),delta[1]*canvas.height/Math.max(1,r.height)):orbit(state,...delta,sensitivity);
      drag.css=css;render();
    });
    canvas.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;const d=drag;drag=null;if(!d.moved&&Math.hypot(e.clientX-d.start[0],e.clientY-d.start[1])<3&&!d.pan&&d.button===0&&pickActive())stageAt([e.clientX,e.clientY]);});
    const end=e=>{if(drag?.id===e.pointerId)drag=null;};
    for(const event of ['pointercancel','lostpointercapture'])canvas.addEventListener(event,end);
    canvas.addEventListener('pointerleave',()=>{cancelHover();if(pickActive()&&!drag){redrawMarkers();updatePickStatus();}});
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('wheel',e=>{e.preventDefault();if(!drag&&(!crop||enterFree())){state=zoom(state,Math.exp(-e.deltaY*.0015));render();}},{passive:false});
    // Modeless: scope shortcuts to focus inside the inspector, not the
    // whole workspace. Escape outside still belongs to the workspace.
    dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();if(staged||hover){clearPick();syncPoint();updatePickStatus();redrawMarkers();}else close();}e.stopPropagation();});
    for(const event of ['click','change','input','pointerup','pointercancel','wheel','keydown'])dialog.addEventListener(event,e=>{e.stopPropagation();sessionChanged();});
    env.addEventListener('pagehide',()=>sessionChanged());
    dialog.addEventListener('close',()=>{if(!dialog.open){stopDrags();clearGeometryPick();saveRect();geometry=null;crop=null;free=false;}});
    function show(){if(!dialog.open){applyRect(readRect());dialog.show();applyRect(rect);saveRect();}}
    return {open(next,title){
      stopDrags();clearGeometryPick();crop=null;free=false;geometry=next;state=initialView();heading.textContent=title;spans.disabled=!next.items.some(p=>!p.primary);
      show();syncMode();sync();
    },openCrop(region,paint,build=null,reason='',optical=false){
      stopDrags();clearGeometryPick();geometry=null;free=false;crop={region:{...region},paint,build,reason,optical};heading.textContent='3D Scene Magnifier';
      show();syncMode();render();sessionChanged();
    },sessionSnapshot(){
      if(!dialog.open||!crop)return null;
      return JSON.parse(JSON.stringify({version:1,region:crop.region,free,view:state,raster:[canvas.width,canvas.height],pickMode:pickMode.value,staged,confirmed,choices,choice:pickChoices.value,inputs:paramInputs.map(n=>n.value)}));
    },restoreSession(saved){
      if(!crop||saved?.version!==1||typeof saved.free!=='boolean'||!['navigate','vertex','edge','surface'].includes(saved.pickMode))throw Error('Invalid stored magnifier session');
      restoringSession=true;
      try{
        const next=restoreView(saved.view);
        if(!Array.isArray(saved.raster)||saved.raster.length!==2||!saved.raster.every(n=>Number.isInteger(n)&&n>0&&n<=2048))throw Error('Invalid stored raster');
        if(saved.free||saved.staged||saved.confirmed){if(!enterFree())throw Error('Stored Free View unavailable');}
        if(mesh){staged=restorePoint(mesh,saved.staged);confirmed=restorePoint(mesh,saved.confirmed);}
        choices=mesh&&Array.isArray(saved.choices)&&saved.choices.length<=2500?saved.choices.map(h=>restorePoint(mesh,h)):[];
        pickChoices.replaceChildren();for(const [i,h] of choices.entries()){if(!h)throw Error('Invalid stored candidate');const n=dialog.ownerDocument.createElement('option');n.value=String(i);n.textContent=describe(h);pickChoices.append(n);}
        pickChoices.disabled=choices.length<2;pickChoices.value=saved.choice;
        free=saved.free;state=next;pickMode.value=saved.pickMode;syncMode();resizeRaster();
        const ratio=Math.min(canvas.width,canvas.height)/Math.min(...saved.raster);state={...next,pan:next.pan.map(x=>x*ratio)};
        sync();if(staged&&Array.isArray(saved.inputs))paramInputs.forEach((n,i)=>{if(typeof saved.inputs[i]==='string'&&saved.inputs[i].length<64)n.value=saved.inputs[i];});updatePickStatus();
      }finally{restoringSession=false;}
      sessionChanged();
    },close,isOpen:()=>dialog.open,isCrop:()=>!!crop,
      snapshot:()=>dialog.open?crop?free?{mode:'free',region:{...crop.region},view:JSON.parse(JSON.stringify(state)),count:geometry.items.length,pivot:geometry.frame.origin.slice(),pivotError:geometry.pivotError,pickMode:pickMode.value,staged:staged?JSON.parse(JSON.stringify(staged)):null,confirmed:confirmed?JSON.parse(JSON.stringify(confirmed)):null}:{mode:'scene',region:{...crop.region},pickMode:pickMode.value,staged:staged?JSON.parse(JSON.stringify(staged)):null,confirmed:confirmed?JSON.parse(JSON.stringify(confirmed)):null}:JSON.parse(JSON.stringify(state)):null,
      windowSnapshot:()=>dialog.open?{...rect}:null};
  }
  return Object.freeze({localGeometry,visibleItems,bounds,reset,standardView,orbit,orbitSensitivity,pan,zoom,camera,draw,regionSeed,regionPivot,regionGeometry,regionCamera,indexedTriangles,preparePick,rayTriangle,surfaceHits,edgeHit,pickRegion,regionPaths,pickFrame,framePick,containsFill,adjustPoint,worldPoint,markerVisibility,restoreView,restorePoint,opticalCamera,opticalEntry,opticalPrimitivePick,opticalFrame,opticalFramePick,opticalMarker,drawRegion,windowRect,changeWindowRect,rasterSize,mount});
}));
