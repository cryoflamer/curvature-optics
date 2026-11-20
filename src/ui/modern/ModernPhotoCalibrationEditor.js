/* Locally persisted photo correspondence editor. No solver or scene mutation. */
(function(root,factory){
  const api=factory(root,
    root.CurvatureCameraMaterialAnchor||require('../../calibration/CameraMaterialAnchor'),
    root.CurvatureCameraMaterialAnchorResolver||require('../../calibration/CameraMaterialAnchorResolver'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.CurvatureModernPhotoCalibrationEditor=api;
    root.document.addEventListener('DOMContentLoaded',()=>api.mount(root.document));}
}(typeof globalThis!=='undefined'?globalThis:this,function(env,materialAnchor,materialResolver){
  'use strict';
  function fit(width,height,w,h){
    const scale=Math.min(w/width,h/height);
    return {scale,x:(w-width*scale)/2,y:(h-height*scale)/2};
  }
  function imagePoint(view,x,y,w,h){
    const p=[(x-view.x)/view.scale,(y-view.y)/view.scale];
    return p.every(Number.isFinite)&&p[0]>=0&&p[0]<w&&p[1]>=0&&p[1]<h?p:null;
  }
  function zoomAt(view,x,y,factor,min,max){
    const scale=Math.max(min,Math.min(max,view.scale*factor)),f=scale/view.scale;
    return {scale,x:x-(x-view.x)*f,y:y-(y-view.y)*f};
  }
  // Backing-store rectangle -> original projection pixels. No owner hit needed.
  function magnifierRegion(view,a,b,rasterWidth,rasterHeight,canvasWidth,canvasHeight,minDrag=4){
    if(!view||!(view.scale>0)||![view.x,view.y,...a,...b,rasterWidth,rasterHeight,canvasWidth,canvasHeight].every(Number.isFinite))return null;
    const lo=[Math.max(0,view.x,Math.min(a[0],b[0])),Math.max(0,view.y,Math.min(a[1],b[1]))];
    const hi=[Math.min(canvasWidth,view.x+rasterWidth*view.scale,Math.max(a[0],b[0])),
      Math.min(canvasHeight,view.y+rasterHeight*view.scale,Math.max(a[1],b[1]))];
    if(hi[0]-lo[0]<minDrag||hi[1]-lo[1]<minDrag)return null;
    const x=Math.max(0,(lo[0]-view.x)/view.scale),y=Math.max(0,(lo[1]-view.y)/view.scale);
    const width=Math.min(rasterWidth-x,(hi[0]-lo[0])/view.scale),height=Math.min(rasterHeight-y,(hi[1]-lo[1])/view.scale);
    return width>0&&height>0?{x,y,width,height}:null;
  }
  const isMaterial=l=>!!l&&Object.prototype.hasOwnProperty.call(l,'anchor');
  const hasMaterial=rows=>rows.some(r=>isMaterial(r.landmark));
  function pair(landmark,pixel,width,height,weight=1,included=true){
    if(!landmark||typeof landmark.id!=='string'||!landmark.id||
      !Array.isArray(pixel)||pixel.length!==2||!pixel.every(Number.isFinite)||
      pixel[0]<0||pixel[0]>=width||pixel[1]<0||pixel[1]>=height||
      !Number.isFinite(weight)||weight<=0||typeof included!=='boolean')throw RangeError('Invalid correspondence');
    if(isMaterial(landmark)){
      const kind=landmark.anchor?.kind;
      return {kind,landmark:materialAnchor.normalizeLandmark(kind,landmark),pixel:pixel.slice(),weight,included};
    }
    if(![0,1].includes(landmark.bank)||![landmark.objectType,landmark.primitive,landmark.vertex].every(Number.isInteger)||
       landmark.primitive<0||landmark.vertex<0)throw RangeError('Invalid authored vertex');
    return {kind:'vertex',landmark:{...landmark},pixel:pixel.slice(),weight,included};
  }
  function upsert(rows,value,replaceId=null){
    if(rows.some(r=>r.landmark.id!==replaceId&&(r.landmark.id===value.landmark.id||
       isMaterial(r.landmark)&&isMaterial(value.landmark)&&materialAnchor.anchorKey(r.landmark.anchor)===materialAnchor.anchorKey(value.landmark.anchor))))
      throw Error('This model vertex is already paired; edit its existing row');
    if(replaceId!==null&&!rows.some(r=>r.landmark.id===replaceId))throw Error('Correspondence no longer exists');
    return replaceId===null?[...rows,value]:rows.map(r=>r.landmark.id===replaceId?value:r);
  }
  const fitRows=rows=>rows.filter(r=>r.included!==false);
  const pairLabel=(r,i)=>String(i+1)+(r.included===false?'V':'');
  function residualStatistics(rows){
    function summary(group){
      const available=group.filter(r=>Number.isFinite(r.best.error));
      return {count:group.length,available:available.length,
        rms:group.length&&available.length===group.length?Math.hypot(...available.map(r=>r.best.error))/Math.sqrt(group.length):null};
    }
    return {fit:summary(rows.filter(r=>r.included!==false)),validation:summary(rows.filter(r=>r.included===false)),all:summary(rows)};
  }
  // The raster and the pan/zoom viewport are independent of the physical pose.
  function previewSize(width,height,max=1200){
    const factor=max/Math.max(width,height);
    return {width:Math.max(1,Math.round(width*factor)),height:Math.max(1,Math.round(height*factor))};
  }
  function screenPoint(view,p){return [view.x+p[0]*view.scale,view.y+p[1]*view.scale];}
  // Return the nearest candidates within the snap radius and tie window.
  // Shared polygon vertices at the same authored position are one choice.
  // Different 3D points with nearly coincident screen positions are not.
  function snapCandidates(points,view,x,y,radius=10,tie=2){
    const matches=[],seen=new Set();
    for(const point of points){
      const p=screenPoint(view,point.pixel),d=Math.hypot(p[0]-x,p[1]-y);
      if(d<=radius)matches.push({point,d});
    }
    matches.sort((a,b)=>a.d-b.d||a.point.landmark.id.localeCompare(b.point.landmark.id));
    const result=[];
    for(const {point,d} of matches){
      if(d>matches[0].d+tie)break;
      if(seen.has(point.worldKey))continue;
      seen.add(point.worldKey);result.push(point);
    }
    return result;
  }
  // Index in raster coordinates: viewport zoom/pan never invalidates it.
  function spatialIndex(points,cell=32){
    const buckets=new Map();
    for(const p of points){
      const key=Math.floor(p.pixel[0]/cell)+','+Math.floor(p.pixel[1]/cell);
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(p);
    }
    return {query(view,x,y,radius){
      const a=(x-view.x)/view.scale,b=(y-view.y)/view.scale,r=radius/view.scale;
      const x0=Math.floor((a-r)/cell),x1=Math.floor((a+r)/cell),
        y0=Math.floor((b-r)/cell),y1=Math.floor((b+r)/cell);
      if((x1-x0+1)*(y1-y0+1)>buckets.size*2)return points;
      const found=[];
      for(let i=x0;i<=x1;i++)for(let j=y0;j<=y1;j++){
        const bucket=buckets.get(i+','+j);if(bucket)for(const p of bucket)found.push(p);
      }
      return found;
    }};
  }
  function objectKey(landmark,banks){
    const index=banks[landmark.bank]?.[landmark.primitive]?.metadata?.placedObjectIndex;
    return Number.isInteger(index)&&index>=0?index*2+landmark.bank+1:null;
  }
  // The RGB key identifies a painted package, not a persistent anchor.
  // Only full authored sequences provide snapshot-scoped owner descriptors.
  function objectPackages(banks,rangeOf=()=>null){
    const packages=new Map(),invalid=new Set();
    for(let bank=0;bank<banks.length;bank++)for(const [primitive,p] of banks[bank].entries()){
      const m=p.metadata,owner=m?.landmarkPackage,placed=m?.placedObjectIndex;
      if(!owner||owner.kind!=='object'||owner.bank!==bank||!Number.isInteger(placed)||placed<0)continue;
      const key=placed*2+bank+1;
      if(!packages.has(key))packages.set(key,{key,placedIndex:placed,owner,primitiveIndices:[],spanOwners:[],rangeMetres:null});
      const pkg=packages.get(key);
      if(JSON.stringify(pkg.owner)!==JSON.stringify(owner)){invalid.add(key);continue;}
      pkg.primitiveIndices.push(primitive);
      if(m.landmarkOwner?.kind==='span')pkg.spanOwners.push(m.landmarkOwner);
      else if(pkg.rangeMetres===null&&p.points?.length){
        const r=rangeOf(p.points[0]);if(Number.isFinite(r))pkg.rangeMetres=r;
      }
    }
    for(const key of invalid)packages.delete(key);
    return packages;
  }
  // One selection per actual owner; context is explicitly not the selected
  // geometry. Keep transient raster key separate from owner descriptor.
  function ownerSelections(banks,keyOf,rangeOf=()=>null){
    const packages=objectPackages(banks,rangeOf),result=new Map();
    const ownerID=o=>JSON.stringify(o);
    const byOwner=new Map([...packages.values()].map(p=>[ownerID(p.owner),p]));
    for(const pkg of packages.values()){
      const b=pkg.owner.bank,primitives=banks[b];
      const primaryIndices=pkg.primitiveIndices.filter(i=>primitives[i].metadata.landmarkOwner?.kind==='object');
      if(!primaryIndices.length)continue;
      result.set(pkg.key,{...pkg,primaryIndices,packageOwner:pkg.owner});
      for(const i of pkg.primitiveIndices){
        const p=primitives[i],owner=p.metadata.landmarkOwner;
        if(owner?.kind!=='span')continue;
        const key=keyOf(b,pkg.placedIndex,owner),from=byOwner.get(ownerID(owner.from));
        if(key===null||!from||ownerID(owner.to)!==ownerID(pkg.owner))continue;
        const context=from.primitiveIndices.filter(j=>primitives[j].metadata.landmarkOwner?.kind==='object');
        const center=p.points.reduce((a,v)=>a.map((x,k)=>x+v[k]/p.points.length),[0,0,0]);
        const range=rangeOf(center);
        result.set(key,{key,placedIndex:pkg.placedIndex,owner,packageOwner:pkg.owner,
          primaryIndices:[i],primitiveIndices:[i,...context,...primaryIndices],
          spanOwners:[],rangeMetres:Number.isFinite(range)?range:null});
      }
    }
    return result;
  }
  function identitySpans(data,width,height){
    const result=new Map();
    for(let y=0;y<height;y++){
      let previous=0,start=0;
      for(let x=0;x<=width;x++){
        const i=(y*width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
        const id=x<width&&data[i+3]===255&&b===1+((r*31+g*17)%254)?r+256*g:0;
        if(id!==previous){
          if(previous){
            if(!result.has(previous))result.set(previous,[]);
            result.get(previous).push([start,y,x-start]);
          }
          previous=id;start=x;
        }
      }
    }
    return result;
  }
  // Reuse the decoded identity spans for constant-time interior ownership.
  function ownershipRaster(spans,width,height){
    const ids=new Uint16Array(width*height);
    for(const [key,runs] of spans)for(const [x,y,length] of runs)
      ids.fill(key,y*width+x,y*width+x+length);
    return {ids,width,height};
  }
  function ownerAt(raster,x,y,radius=0){
    if(!raster||!Number.isFinite(x)||!Number.isFinite(y))return null;
    const {ids,width,height}=raster,ix=Math.floor(x),iy=Math.floor(y);
    if(ix<0||iy<0||ix>=width||iy>=height)return null;
    const exact=ids[iy*width+ix];
    if(exact)return exact;
    let key=null,best=Infinity,tied=false;
    for(let j=Math.max(0,Math.floor(y-radius));j<=Math.min(height-1,Math.floor(y+radius));j++){
      for(let i=Math.max(0,Math.floor(x-radius));i<=Math.min(width-1,Math.floor(x+radius));i++){
        const id=ids[j*width+i];if(!id)continue;
        const dist=Math.hypot(i+.5-x,j+.5-y);
        if(dist>radius)continue;
        if(dist<best-1e-9){key=id;best=dist;tied=false;}
        else if(Math.abs(dist-best)<1e-9&&id!==key)tied=true;
      }
    }
    return tied?null:key;
  }
  function visiblePick(raster,points,view,x,y,radius=10,tie=2){
    // An occupied pixel always wins over a closer projected hidden vertex.
    // A tiny background tolerance covers silhouette/antialias gaps only.
    const key=ownerAt(raster,(x-view.x)/view.scale,(y-view.y)/view.scale,
      Math.min(3,radius*.4/view.scale));
    return {key,candidates:key===null?[]:snapCandidates(points.filter(p=>p.objectKey===key&&p.painterVisible),
      view,x,y,radius,tie)};
  }
  function nearestMarker(markers,p,radius){
    let best=null,distance=radius;
    for(const m of markers){const d=Math.hypot(m.pixel[0]-p[0],m.pixel[1]-p[1]);
      if(d<distance){best=m;distance=d;}}
    return best;
  }
  const COLORS=['#dc2626','#2563eb','#00856a','#b45309','#9333ea','#db2777','#087ea4','#526713'];
  function marker(context,p,label,color,active=false){
    context.save();
    if(active){context.strokeStyle=color;context.lineWidth=2;context.beginPath();context.arc(p[0],p[1],11,0,Math.PI*2);context.stroke();}
    context.strokeStyle='#fff';context.lineWidth=4;context.beginPath();
    context.moveTo(p[0]-7,p[1]);context.lineTo(p[0]+7,p[1]);
    context.moveTo(p[0],p[1]-7);context.lineTo(p[0],p[1]+7);context.stroke();
    context.strokeStyle=color;context.lineWidth=2;context.stroke();
    context.font='bold 14px sans-serif';context.lineWidth=3;context.strokeStyle='#fff';
    context.strokeText(label,p[0]+9,p[1]-8);context.fillStyle=color;context.fillText(label,p[0]+9,p[1]-8);
    context.restore();
  }
  // Residuals are in original image pixels, never CSS/backing-store pixels.
  // Match by landmark identity rather than trusting result-array order.
  function residualRows(rows,initialPoints,bestPoints){
    const initial=new Map((initialPoints||[]).map(p=>[p.id,p])),best=new Map((bestPoints||[]).map(p=>[p.id,p]));
    function sample(p,observed){
      if(!p)return {status:'unavailable',predicted:null,residual:null,error:null};
      const q=p.predicted;
      if(!['visible','out_of_frame'].includes(p.status)||!Array.isArray(q)||q.length!==2||!q.every(Number.isFinite))
        return {status:p.status||'unavailable',predicted:null,residual:null,error:null};
      const residual=q.map((v,i)=>v-observed[i]);
      if(!residual.every(Number.isFinite))return {status:'unavailable',predicted:null,residual:null,error:null};
      return {status:p.status,predicted:q.slice(),residual,error:Math.hypot(...residual)};
    }
    return rows.map((r,i)=>({id:r.landmark.id,number:i+1,included:r.included!==false,observed:r.pixel.slice(),
      initial:sample(initial.get(r.landmark.id),r.pixel),best:sample(best.get(r.landmark.id),r.pixel)}));
  }
  function drawResidual(context,view,observed,sample,color,active){
    if(!sample.predicted)return;
    const a=screenPoint(view,observed),b=screenPoint(view,sample.predicted);
    if(![...a,...b].every(Number.isFinite))return;
    context.save();context.globalAlpha=active?1:.85;
    context.beginPath();context.moveTo(...a);context.lineTo(...b);
    context.setLineDash([5,3]);context.strokeStyle='#fff';context.lineWidth=active?4:3;context.stroke();
    context.strokeStyle=color;context.lineWidth=active?2.5:1.5;context.stroke();
    context.setLineDash([]);context.beginPath();context.arc(b[0],b[1],active?8:6,0,Math.PI*2);
    context.strokeStyle='#fff';context.lineWidth=4;context.stroke();
    context.strokeStyle=color;context.lineWidth=2;context.stroke();context.restore();
  }
  // Library IDs are local; a shipped demo can use the same ID for a
  // different original. Never merge these namespaces or import on selection.
  function photoChoices(libraryRows,projects,demos){
    const linked=new Map();
    for(const entry of projects){
      const project=entry.project;
      for(const [i,frame] of project.keyframes.entries())
        for(const id of frame.referenceImageIds||[]){
          if(!linked.has(id))linked.set(id,[]);
          linked.get(id).push(project.name+' / '+(frame.name||'Keyframe '+(i+1)));
        }
    }
    const choices=libraryRows.map(row=>({
      key:JSON.stringify(['library',row.id]),id:row.id,source:'library',
      title:row.title,width:row.width,height:row.height,author:row.author||'',
      links:[...new Set(linked.get(row.id)||[])]
    }));
    for(const demo of demos){
      for(const record of demo.referenceImages||[]){
        const links=demo.project.keyframes.flatMap((frame,i)=>
          (frame.referenceImageIds||[]).includes(record.id)?[demo.project.name+' / '+(frame.name||'Keyframe '+(i+1))]:[]);
        choices.push({key:JSON.stringify(['demo',demo.id,record.id]),source:'demo',demoId:demo.id,
          id:record.id,title:record.title,width:record.original.width,height:record.original.height,
          author:record.author||'',links:[...new Set(links)]});
      }
    }
    return choices;
  }
  const CAMERA_FIELDS=Object.freeze(["CameraEast","CameraNorth","Height","Pan","Nick","Roll","FocalLengthField"]), EXPERIMENT_FORMAT='curvature-photo-calibration', EXPERIMENT_VERSION=3;
  const experimentVersion=rows=>hasMaterial(rows)?EXPERIMENT_VERSION:2;
  function observationRows(input,width,height,allowMaterial,model){
    if(!Array.isArray(input)||input.length>10000)throw Error('Invalid observations');
    const rows=input.map(r=>{
      if(!r||!['vertex','edge','surface'].includes(r.kind)||(!allowMaterial&&(r.kind!=='vertex'||isMaterial(r.landmark))))
        throw Error('Expected authored vertex observation or material format version 3');
      const value=pair(r.landmark,r.pixel,width,height,r.weight,r.included);
      if(value.kind!==r.kind)throw Error('Observation and anchor kind mismatch');
      return value;
    });
    if(new Set(rows.map(r=>r.landmark.id)).size!==rows.length)throw Error('Duplicate landmark ID');
    if(hasMaterial(rows)){
      const resolver=materialResolver.create(model),keys=new Set();
      for(const row of rows.filter(r=>isMaterial(r.landmark))){
        const q=resolver.resolveLandmark(row.kind,row.landmark),key=materialAnchor.anchorKey(q.anchor);
        if(keys.has(key))throw Error('Duplicate material anchor');
        keys.add(key);
      }
    }
    return rows;
  }
  function validateLegacyTopology(rows,scene){
    for(const {landmark:l} of rows){
      if(isMaterial(l))continue;
      if(l.objectType!==scene.model.ObjType[l.bank]||!scene.banks[l.bank]?.[l.primitive]?.points[l.vertex]||
        l.id!=='b'+l.bank+':p'+l.primitive+':v'+l.vertex)throw Error('Landmark topology mismatch: '+l.id);
    }
  }
  // Equality guard for saved candidates, not a security signature.
  function fitBinding(rows,free,model,physics,width,height){
    return JSON.stringify(['material-fit-v1',model.showModel,model.rEarth,model.rFEarth,
      materialResolver.LAYOUT.map(k=>model[k]),CAMERA_FIELDS.map(k=>model[k]),free,physics?.atmosphere,
      physics?.temperatureProfile?['temperatureC','pressureHpa','gradientKPerKm'].map(k=>physics.temperatureProfile[k]):null,
      width,height,rows.map(r=>[r.kind,isMaterial(r.landmark)?
        materialAnchor.normalizeLandmark(r.kind,r.landmark):[r.landmark.id,r.landmark.bank,r.landmark.objectType,r.landmark.primitive,r.landmark.vertex],
        r.pixel,r.weight,r.included!==false])]);
  }
  const jsonCopy=value=>JSON.parse(JSON.stringify(value));
  function validatedFreeFields(free){
    if(!Array.isArray(free)||new Set(free).size!==free.length||free.some(k=>!CAMERA_FIELDS.includes(k)))
      throw Error('Invalid free camera parameters');
    return CAMERA_FIELDS.filter(k=>free.includes(k));
  }
  function validateFitResult(result,rows,free,model,physics,width,height){
    if(result===null||result===undefined)return null;
    if((hasMaterial(rows)||result.materialBinding!==undefined)&&result.materialBinding!==fitBinding(rows,free,model,physics,width,height))
      throw Error('Stored fit result does not match material observations or captured scene');
    rows=fitRows(rows);
    const r=jsonCopy(result),v=r?.evaluation;
    if(!v?.valid||!r.pose||CAMERA_FIELDS.some(k=>!Number.isFinite(r.pose[k]))||
      CAMERA_FIELDS.some(k=>!free.includes(k)&&r.pose[k]!==model[k])||
      ![r.initialRmsPx,v.rmsPx,v.weightedRmsPx,v.cost,r.evaluations,r.acceptedSteps].every(n=>Number.isFinite(n)&&n>=0)||
      !Array.isArray(v.points)||v.points.length!==rows.length)
      throw Error('Invalid stored fit result');
    for(const [i,p] of v.points.entries()){
      const row=rows[i];
      if(p.id!==row.landmark.id||p.weight!==row.weight||
        !Array.isArray(p.observed)||p.observed.length!==2||p.observed.some((n,j)=>n!==row.pixel[j])||
        !Array.isArray(p.predicted)||p.predicted.length!==2||!p.predicted.every(Number.isFinite))
        throw Error('Stored fit result does not match observations');
    }
    return r;
  }
  function validateExperiment(input,validateReference){
    if(!input||input.format!==EXPERIMENT_FORMAT||![1,2,EXPERIMENT_VERSION].includes(input.version))
      throw Error('Unsupported calibration experiment format/version');
    const m=input.scene?.model,physics=input.scene?.physics;
    if(!m||![1,2].includes(m.showModel)||!Number.isFinite(m.rEarth)||m.rEarth<=0||
      !Number.isFinite(m.rFEarth)||m.rFEarth<=0||CAMERA_FIELDS.some(k=>!Number.isFinite(m[k]))||
      !['vacuum','standard','temperature-lapse'].includes(physics?.atmosphere))
      throw Error('Invalid captured scene or atmosphere');
    for(const k of ['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos','ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar']){
      if(!Array.isArray(m[k])||m[k].length!==2||!m[k].every(Number.isFinite))throw Error('Invalid scene field '+k);
    }
    if(m.NObjects.some(n=>!Number.isInteger(n)||n<0||n>10000))throw Error('Invalid object count');
    const record=validateReference(input.referenceImage);
    const observations=observationRows(input.observations,record.original.width,record.original.height,input.version===3,m);
    if(input.version===1&&observations.some(r=>r.included===false))throw Error('Validation roles require experiment version 2');
    const freeParameters=validatedFreeFields(input.fit?.freeParameters);
    if(input.fit.method!=='canvas-direct'||input.fit.maxIterations!==80)throw Error('Unsupported fit configuration');
    const result=validateFitResult(input.fit.result,observations,freeParameters,m,physics,record.original.width,record.original.height);
    const referenceSource=input.referenceSource&&typeof input.referenceSource==='object'?
      jsonCopy(input.referenceSource):null;
    if(referenceSource&&(!Array.isArray(referenceSource.links)||referenceSource.links.some(x=>typeof x!=='string')))
      throw Error('Invalid photo provenance');
    return {format:EXPERIMENT_FORMAT,version:experimentVersion(observations),scene:jsonCopy(input.scene),
      referenceImage:record,referenceSource,observations,fit:{method:'canvas-direct',maxIterations:80,freeParameters,
        result,status:typeof input.fit.status==='string'?input.fit.status.slice(0,1000):'Imported fit',
        running:input.fit.running===true}};
  }
  let mounted=null;
  function mount(doc){
    const $=id=>doc.getElementById(id),workspace=$('ModernPhotoCalibration');
    if(!workspace)return null;
    if(mounted)return mounted;
    const photo=$('ModernCalibrationPhoto'),sceneCanvas=$('ModernCalibrationMesh'),
      file=$('ModernCalibrationFile'),bank=$('ModernCalibrationBank'),object=$('ModernCalibrationObject'),
      vertex=$('ModernCalibrationVertex'),list=$('ModernCalibrationPairs'),status=$('ModernCalibrationStatus'),
      add=$('ModernCalibrationAdd'),weight=$('ModernCalibrationWeight'),px=$('ModernCalibrationX'),py=$('ModernCalibrationY');
    const ctx=photo.getContext('2d'),mesh=sceneCanvas.getContext('2d');
    let scene=null,record=null,image=null,view=null,rows=[],pending=null,editing=null,loadToken=0,
      groups=[],vertices=[],drag=null,modelDrag=null;
    const modelRaster=doc.createElement('canvas'),renderer=env.CurvatureCanvasDirectPreview.create(),
      modelStatus=$('ModernCalibrationModelStatus'),pickStatus=$('ModernCalibrationPickStatus'),
      pickConflict=$('ModernCalibrationPickConflict'),pickOptions=$('ModernCalibrationPickOptions'),
      showLandmarks=$('ModernCalibrationShowLandmarks'),pickMode=$('ModernCalibrationPickMode'),
      objectPicker=$('ModernCalibrationObjectPicker'),objectControls=$('ModernCalibrationObjectControls'),
      objectSelectionStatus=$('ModernCalibrationObjectSelection'),clearObject=$('ModernCalibrationClearObject');
    let packages=new Map(),selectedObjectKey=null;
    const viewerButton=$('ModernCalibrationOpenViewer'),viewer=env.CurvatureModernLandmarkViewer.mount($('ModernCalibrationViewer'),saveMagnifier,selectPair);
    const inlinePanel=$('ModernCalibrationInlinePanel'),inlineHost=$('ModernCalibrationInlineViewer'),
      legacyPanel=$('ModernCalibrationLegacyModel'),legacyToggle=$('ModernCalibrationLegacyToggle');
    // Share the viewer controls without duplicating an independent markup contract.
    inlineHost.replaceChildren(...Array.from($('ModernCalibrationViewer').children,n=>n.cloneNode(true)));
    const inlineHeader=inlineHost.querySelector('header');
    inlineHeader.removeAttribute('data-viewer-titlebar');inlineHeader.removeAttribute('tabindex');inlineHeader.removeAttribute('aria-label');
    inlineHeader.querySelector('h2').removeAttribute('id');
    inlineHost.querySelector('[data-viewer-close]').remove();inlineHost.querySelector('footer').remove();
    inlineHost.querySelector('canvas').setAttribute('aria-label','Integrated calibration model');
    const fastOption=doc.createElement('option');fastOption.value='fast-vertex';fastOption.textContent='Fast Vertex';
    inlineHost.querySelector('[data-viewer-pick-mode]').append(fastOption);
    const inlineDelete=doc.createElement('button');inlineDelete.type='button';inlineDelete.textContent='Delete pair';inlineDelete.disabled=true;inlineDelete.setAttribute('data-viewer-delete-pair','');
    inlineHost.querySelector('[data-viewer-selection-status]').after(inlineDelete);
    const inlineViewer=env.CurvatureModernLandmarkViewer.mount(inlineHost,()=>{},selectPair,{inline:true,onFastVertex:chooseInlineVertex,onDeleteCorrespondence:deletePair,onUndo:undo});
    const inlineRenderer=env.CurvatureCanvasDirectPreview.create();
    let legacyShown=false,inlineSource=null,initialParked=false,bestCropSource=null;
    const globeRoute=()=>scene?.model.showModel===1;
    const objectMode=()=>pickMode.value==='object',magnifierMode=()=>pickMode.value==='magnifier';
    let cropSource=null,regionDrag=null,magnifierSessionId=null,pendingMagnifier=null;
    const MAGNIFIER_KEY='curvature-calibration-magnifier-v1';
    function newMagnifierSession(){
      magnifierSessionId=env.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
      pendingMagnifier=null;
      try{env.localStorage.removeItem(MAGNIFIER_KEY);}catch(error){/* Optional UI storage. */}
    }
    function saveMagnifier(){
      if(restoring||!magnifierSessionId||pendingMagnifier)return;
      try{
        const session=viewer.sessionSnapshot();
        if(!session||!cropSource){env.localStorage.removeItem(MAGNIFIER_KEY);return;}
        env.localStorage.setItem(MAGNIFIER_KEY,JSON.stringify({id:magnifierSessionId,source:JSON.stringify(cropSource),session}));
      }catch(error){/* Optional UI storage. */}
    }
    function readMagnifier(){
      try{
        const saved=JSON.parse(env.localStorage.getItem(MAGNIFIER_KEY));
        if(saved?.id===magnifierSessionId&&saved.source===JSON.stringify(cropSource))return saved.session;
      }catch(error){/* Invalid or unavailable optional UI storage. */}
      return null;
    }
    function restoreMagnifier(){
      if(workspace.hidden||!pendingMagnifier||!cropSource||viewBest)return;
      const saved=pendingMagnifier;pendingMagnifier=null;
      try{
        const r=saved.region;
        if(!r||![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>cropSource.width+1e-6||r.y+r.height>cropSource.height+1e-6)throw Error('Invalid stored region');
        legacyShown=true;syncModelRoute();pickMode.value='magnifier';openRegion(r);viewer.restoreSession(saved);updateHint();meshDraw();
      }catch(error){viewer.close();pickStatus.textContent='Magnifier session discarded: '+error.message;}
    }
    const cropRenderer=env.CurvatureCanvasDirectPreview.create();
    let modelView=null,projected=[],byLandmark=new Map(),hover=[],ambiguous=[],previewValid=false;
    let markerProjection=null,markerResolver=null,materialMarkers=new Map();
    let pendingModel=null,activePair=null,undoStack=[],hoverIndex=0,photoGhost=null,modelGhost=null;
    let index=spatialIndex([]),modelFrame=null,queuedPointer=null;
    const identityRaster=doc.createElement('canvas'),highlightRaster=doc.createElement('canvas');
    let visibleSpans=new Map(),ownerSpans=new Map(),highlightKey=null,ownership=null,exactOwnership=null,hoverObject=null,visibleByObject=new Map();
    const sourcePicker=$('ModernCalibrationSource'),sourceStatus=$('ModernCalibrationSourceStatus'),
      sourceLoad=$('ModernCalibrationUsePhoto'),sourceRefresh=$('ModernCalibrationRefreshPhotos'),
      photoInfo=$('ModernCalibrationPhotoInfo');
    let choices=[],demoRecords=[],catalogToken=0,activeSource=null;
    const fitFields=CAMERA_FIELDS,fitLabels=["East (m)","North (m)","Height (m)","Pan (°)","Nick (°)","Roll (°)","Focal field (mm)"];
    const fitPanel=$('ModernCalibrationFitParameters'),runFit=$('ModernCalibrationRunFit'),stopFit=$('ModernCalibrationStopFit'),bestView=$('ModernCalibrationBestView'),fitStatus=$('ModernCalibrationFitStatus'),fitResult=$('ModernCalibrationFitResult');
    const exportButton=$('ModernCalibrationExportExperiment'),importButton=$('ModernCalibrationImportExperiment'),importFile=$('ModernCalibrationExperimentFile'),exchangeStatus=$('ModernCalibrationExchangeStatus');
    const residualMode=$('ModernCalibrationResidualMode'),residualPanel=$('ModernCalibrationResidualPanel'),
      residualList=$('ModernCalibrationResidualRows'),residualNotice=$('ModernCalibrationResidualNotice');
    let initialPoints=null,initialProjectionError='',residualData=[],diagnosticResult=null,diagnosticBestPoints=[];
    const fitRaster=doc.createElement('canvas');let fitWorker=null,fitBest=null,fitSignature=null,viewBest=false,paintedFit=null,lastFitPaint=0;
    // IndexedDB keeps original images out of the small localStorage quota.
    // A single atomic record binds the photograph to its fixed scene and pairs.
    let restoring=false,writeQueue=Promise.resolve(),dbPromise=null;
    function database(){
      if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
        const request=env.indexedDB.open('curvature-photo-calibration',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('draft');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>reject(Error('Calibration storage blocked'));
      });
      return dbPromise;
    }
    async function readDraft(){
      const db=await database();
      return new Promise((resolve,reject)=>{
        const request=db.transaction('draft','readonly').objectStore('draft').get('active');
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
    }
    function persist(){
      if(restoring||!scene)return;
      const data=JSON.parse(JSON.stringify({version:2,scene:{model:scene.model,physics:scene.physics},
        record,activeSource,rows,pending,pendingModel,activePair,editing,view,modelView,selected:selected(),magnifierSessionId,legacyShown,
        weight:weight.value,showLandmarks:showLandmarks.checked,freeParameters:freeFields(),
        fitBest,fitStatus:fitStatus.textContent,viewBest,residualMode:residualMode.value}));
      writeQueue=writeQueue.catch(()=>{}).then(async()=>{
        const db=await database();
        await new Promise((resolve,reject)=>{
          const tx=db.transaction('draft','readwrite');
          tx.objectStore('draft').put(data,'active');
          tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('Draft write failed'));
        });
        $('ModernCalibrationStorage').textContent='Draft saved in this browser.';
      }).catch(e=>{$('ModernCalibrationStorage').textContent='Draft not saved: '+e.message;});
      $('ModernCalibrationStorage').textContent='Saving draft…';
    }
    async function restoreDraft(){
      restoring=true;
      try{
        const d=await readDraft();
        if(!d||![1,2].includes(d.version))return;
        const next=prepareScene(d.scene);
        if(d.record){
          const decoded=new env.Image();decoded.src=d.record.original.dataUrl;await decoded.decode();
          if(decoded.naturalWidth!==d.record.original.width||decoded.naturalHeight!==d.record.original.height)throw Error('Stored image dimensions mismatch');
          const checked=observationRows(d.rows,d.record.original.width,d.record.original.height,d.version===2,next.model);
          validateLegacyTopology(checked,next);rows=checked;
          record=d.record;image=decoded;activeSource=d.activeSource;
        }
        showScene(next);legacyShown=d.legacyShown===true;syncModelRoute();
        magnifierSessionId=typeof d.magnifierSessionId==='string'?d.magnifierSessionId:magnifierSessionId;
        if(record){photoDetails(record,activeSource);fitPhoto();}
        if(d.view)view=d.view;
        if(d.modelView&&previewValid)modelView=d.modelView;
        showLandmarks.checked=!!d.showLandmarks;
        if(d.selected)selectLandmark(d.selected);
        editing=rows.some(r=>r.landmark.id===d.editing)?d.editing:null;
        const editRow=rows.find(r=>r.landmark.id===editing);
        pendingModel=isMaterial(editRow?.landmark)?editRow.landmark:isMaterial(d.pendingModel)?null:d.pendingModel||null;
        activePair=rows.some(r=>r.landmark.id===d.activePair)?d.activePair:null;
        weight.value=d.weight||'1';setPixel(d.pending||null);
        add.textContent=editing?'Update pair':'Add pair';
        refreshRows();photoDraw();meshDraw();
        if(['best','initial','off'].includes(d.residualMode))residualMode.value=d.residualMode;
        if(d.freeParameters){applyFreeFields(validatedFreeFields(d.freeParameters));
          try{restoreFit(validateFitResult(d.fitBest,rows,freeFields(),scene.model,scene.physics,record?.original.width,record?.original.height),d.fitStatus,!!d.viewBest);}
          catch(error){fitStatus.textContent='Stored fit discarded: '+error.message;}}
        pendingMagnifier=readMagnifier();
        message('Calibration draft restored.');
        $('ModernCalibrationStorage').textContent='Draft restored from this browser.';
      }catch(e){$('ModernCalibrationStorage').textContent='Cannot restore draft: '+e.message;}
      finally{restoring=false;if(scene&&!magnifierSessionId)newMagnifierSession();syncFitControls();restoreMagnifier();}
    }
    async function refreshSources(){
      const token=++catalogToken;
      sourceRefresh.disabled=true;sourceStatus.textContent='Loading available photographs…';
      const [library,projects,demos]=await Promise.allSettled([
        Promise.resolve().then(()=>env.CurvatureModernReferenceImageLibrary.list(env.indexedDB)),
        Promise.resolve().then(()=>env.CurvatureModernAnimationLibrary.list(env.indexedDB)),
        Promise.resolve().then(()=>env.CurvatureModernDemoCatalog.load())
      ]);
      if(token!==catalogToken)return;
      const errors=[['Image library',library],['Project library',projects],['Built-in demos',demos]]
        .filter(([,r])=>r.status==='rejected').map(([name,r])=>name+': '+(r.reason?.message||String(r.reason)));
      demoRecords=demos.status==='fulfilled'?demos.value:[];
      choices=photoChoices(library.status==='fulfilled'?library.value:[],
        projects.status==='fulfilled'?projects.value:[],demoRecords);
      const previous=sourcePicker.value||activeSource?.key;
      populate(sourcePicker,[['','Choose an existing photograph…'],...choices.map(c=>[c.key,
        (c.source==='demo'?'Built-in demo':c.links.length?'Saved project':'Reference library')+
        ' · '+c.title+' ('+c.width+' × '+c.height+')'+(c.links.length?' — '+c.links.join('; '):'')])]);
      if(choices.some(c=>c.key===previous))sourcePicker.value=previous;
      sourceLoad.disabled=!sourcePicker.value;sourceRefresh.disabled=false;
      sourceStatus.textContent=choices.length+' available photographs'+(errors.length?' · '+errors.join(' · '):'');
    }
    function photoDetails(next,source){
      photoInfo.replaceChildren();
      const label=doc.createElement('span');
      label.textContent=(source?.imported?'Imported experiment · ':source?.source==='demo'?'Built-in demo · ':source?.source==='library'?'Reference library · ':'Local file · ')+
        next.title+(next.author?' · '+next.author:'')+' · '+next.original.width+' × '+next.original.height+' px'+
        (source?.links.length?' · '+source.links.join('; '):'');
      photoInfo.append(label);
      if(next.sourceUrl){
        const a=doc.createElement('a');a.href=next.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Source';
        photoInfo.append(' · ',a);
      }
    }
    function confirmReplacement(){return !rows.length||env.confirm('Replacing the photo discards all correspondences. Continue?');}
    async function acceptPhoto(next,source,token){
      const decoded=new env.Image();decoded.src=next.original.dataUrl;await decoded.decode();
      if(token!==loadToken)return false;
      if(decoded.naturalWidth!==next.original.width||decoded.naturalHeight!==next.original.height)
        throw Error('Reference image decoded dimensions mismatch');
      newMagnifierSession();record=next;image=decoded;activeSource=source;rows=[];activePair=null;undoStack=[];resetPending();refreshRows();fitPhoto();renderModel();
      photoDetails(next,source);
      message(next.title+' · '+next.original.width+' × '+next.original.height+' px');
      persist();return true;
    }
    sourcePicker.onchange=()=>{sourceLoad.disabled=!sourcePicker.value;};
    sourceRefresh.onclick=refreshSources;
    sourceLoad.onclick=async()=>{
      const choice=choices.find(c=>c.key===sourcePicker.value);
      if(!choice)return;
      if(activeSource?.key===choice.key&&record){message('This photograph is already loaded.');return;}
      if(!confirmReplacement())return;
      const token=++loadToken;message('Loading original photograph…');
      try{
        let next;
        if(choice.source==='library'){
          const row=await env.CurvatureModernReferenceImageLibrary.get(env.indexedDB,choice.id);
          next=row?.record;
        }else{
          next=demoRecords.find(d=>d.id===choice.demoId)?.referenceImages.find(r=>r.id===choice.id);
        }
        if(!next)throw Error('Original photograph no longer available; refresh the list.');
        await acceptPhoto(next,choice,token);
      }catch(e){if(token===loadToken)message('Cannot load photograph: '+e.message);}
    };
    function message(s){status.textContent=s;}
    function populate(select,options){
      select.replaceChildren(...options.map(([value,label])=>{
        const o=doc.createElement('option');o.value=String(value);o.textContent=label;return o;
      }));
    }
    function materialEdit(){const r=rows.find(r=>r.landmark.id===editing);return isMaterial(r?.landmark)?r.landmark:null;}
    function selected(){return materialEdit()||vertices[Number(vertex.value)]||null;}
    function photoDraw(){
      ctx.clearRect(0,0,photo.width,photo.height);
      if(!image||!view)return;
      ctx.drawImage(image,view.x,view.y,record.original.width*view.scale,record.original.height*view.scale);
      if(residualMode.value!=='off'&&fitBest&&!photoGhost){
        for(const r of residualData)drawResidual(ctx,view,r.observed,r[residualMode.value],COLORS[(r.number-1)%COLORS.length],r.id===activePair);
      }
      rows.forEach((r,i)=>marker(ctx,screenPoint(view,photoGhost?.id===r.landmark.id?photoGhost.pixel:r.pixel),pairLabel(r,i),COLORS[i%COLORS.length],r.landmark.id===activePair));
      if(pending){const p=screenPoint(view,pending),scale=photo.width/Math.max(1,photo.getBoundingClientRect().width);ctx.save();ctx.translate(...p);ctx.scale(scale,scale);ctx.beginPath();ctx.arc(0,0,10,0,2*Math.PI);ctx.strokeStyle='#17212d';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#009ab3';ctx.lineWidth=2.5;ctx.stroke();ctx.beginPath();ctx.arc(0,0,3.5,0,2*Math.PI);ctx.fillStyle='#009ab3';ctx.fill();ctx.restore();}
    }
    function fitPhoto(){
      if(!record)return;
      view=fit(record.original.width,record.original.height,photo.width,photo.height);photoDraw();
    }
    function setPixel(p){
      pending=p;px.value=p?String(+p[0].toFixed(3)):'';py.value=p?String(+p[1].toFixed(3)):'';
      photoDraw();add.disabled=!pending||!selected();
      updateHint();
    }
    function setIncluded(id,included){
      const row=rows.find(r=>r.landmark.id===id);
      if(!row||row.included===included)return;
      rememberUndo();rows=rows.map(r=>r===row?{...r,included}:r);
      refreshRows();photoDraw();meshDraw();persist();
    }
    function inclusionControl(row,i){
      const label=doc.createElement('label'),check=doc.createElement('input');
      check.type='checkbox';check.checked=row.included!==false;
      check.setAttribute('aria-label','Use correspondence '+(i+1)+' for fit');
      check.onchange=()=>setIncluded(row.landmark.id,check.checked);
      label.append(check,check.checked?' Fit':' Validation');return label;
    }
    function correspondenceDescriptors(){
      if(!globeRoute())return [];
      let resolver;
      const descriptors=rows.map((row,i)=>{
        const common={id:row.landmark.id,label:pairLabel(row,i),color:COLORS[i%COLORS.length],kind:row.kind};
        try{
          if(!resolver)resolver=materialResolver.create(scene.model);
          const q=resolver.resolveLandmark(row.kind,row.landmark);
          return {...common,bank:q.bank,index:q.index,anchor:q.anchor};
        }catch(error){return {...common,anchor:null};}
      });
      return descriptors;
    }
    function refreshMagnifierCorrespondences(){
      if(!globeRoute())return;
      const popup=viewer.isCrop(),embedded=inlineViewer.isCrop()&&!inlinePanel.hidden&&!workspace.hidden;
      if(!popup&&!embedded)return;
      const descriptors=correspondenceDescriptors();
      if(popup)viewer.setCorrespondences(descriptors,activePair);
      if(embedded)inlineViewer.setCorrespondences(descriptors,activePair);
    }
    function refreshRows(){
      if(fitSignature!==null&&fitSignature!==JSON.stringify(rows))invalidateFit('Correspondences changed. Run calibration again.');
      syncFitControls();
      list.replaceChildren();
      rows.forEach((r,i)=>{
        const tr=doc.createElement('tr');tr.classList.toggle('is-selected',r.landmark.id===activePair);
        tr.onclick=e=>{if(!e.target.closest('button,input,label'))selectPair(r.landmark.id);};
        for(const [column,t] of [String(i+1),landmarkLabel(r.landmark),r.pixel.map(x=>x.toFixed(2)).join(', '),String(r.weight)].entries()){
          const td=doc.createElement('td');td.textContent=t;if(column===0){td.style.color=COLORS[i%COLORS.length];td.style.fontWeight='bold';}if(column===1)td.title=r.landmark.id;tr.append(td);
        }
        const role=doc.createElement('td');role.append(inclusionControl(r,i));tr.append(role);
        const actions=doc.createElement('td');
        const edit=doc.createElement('button');edit.type='button';edit.textContent='Edit';
        edit.onclick=()=>{
          resetPending();activePair=r.landmark.id;editing=r.landmark.id;
          if(isMaterial(r.landmark))pendingModel=r.landmark;else selectLandmark(r.landmark);
          weight.value=String(r.weight);
          setPixel(r.pixel.slice());refreshRows();photoDraw();meshDraw();add.textContent='Update pair';
        };
        const del=doc.createElement('button');del.type='button';del.textContent='Delete';
        del.onclick=()=>deletePair(r.landmark.id);
        actions.append(edit,del);tr.append(actions);list.append(tr);
      });
      $('ModernCalibrationCount').textContent=rows.length+' correspondences';
      $('ModernCalibrationInlineCount').textContent=rows.length+' correspondences';
      $('ModernCalibrationUndo').disabled=!undoStack.length;
      $('ModernCalibrationDeleteSelected').disabled=!activePair;
      refreshResidualTable();refreshMagnifierCorrespondences();
    }
    function updateHint(){
      const text=globeRoute()&&!legacyShown&&!editing?(activePair?'Pair '+(rows.findIndex(r=>r.landmark.id===activePair)+1)+' selected · Delete to remove, or click another numbered marker.':pending?'Photo point selected · choose Fast Vertex in the Model Viewer.':pendingModel?'Model vertex selected · click the matching photo point.':'Wheel to zoom; drag to pan. Free View to orbit. Fast Vertex pairs photo and model points.'):magnifierMode()?'Drag a rectangle on the model to magnify the same optical view.':objectMode()?'Select an object independently of correspondences. Switch to Vertex to edit pairs.':editing?'Editing pair '+(rows.findIndex(r=>r.landmark.id===editing)+1)+' · drag a marker or use manual controls.':
        pending?'Photo point selected. Click a model vertex.':
        pendingModel?'Model vertex selected. Click a photo point.':
        activePair?'Pair '+(rows.findIndex(r=>r.landmark.id===activePair)+1)+' selected · drag either marker or click a new point.':
        'Click either image, then its matching point in the other.';
      $('ModernCalibrationActionHint').textContent=text;
      pickStatus.textContent=text;
    }
    function resetPending(){if(inlineViewer.isOpen())inlineViewer.clearLocalPoint();editing=null;pendingModel=null;weight.value='1';add.textContent='Add pair';setPixel(null);clearAmbiguity();updateHint();meshDraw();}
    function selectPair(id){
      if(!rows.some(r=>r.landmark.id===id))return;
      activePair=id;refreshRows();updateHint();photoDraw();meshDraw();persist();
    }
    function rememberUndo(){
      undoStack.push({rows,activePair});if(undoStack.length>50)undoStack.shift();
    }
    function deletePair(id){
      if(!rows.some(r=>r.landmark.id===id))return;
      rememberUndo();rows=rows.filter(r=>r.landmark.id!==id);
      activePair=null;resetPending();refreshRows();photoDraw();meshDraw();persist();
    }
    function undo(){
      const old=undoStack.pop();if(!old)return;
      rows=old.rows;activePair=old.activePair;resetPending();refreshRows();photoDraw();meshDraw();persist();
    }
    function replacePair(id,landmark,pixel){
      const old=rows.find(r=>r.landmark.id===id);if(!old)return;
      try{
        const next=upsert(rows,pair(landmark,pixel,record.original.width,record.original.height,old.weight,old.included),id);
        rememberUndo();rows=next;activePair=landmark.id;resetPending();refreshRows();photoDraw();meshDraw();
        message('Correspondence updated.');persist();
      }catch(e){message(e.message);}
    }
    function markerHit(canvas,p,items){
      const ratio=canvas.width/Math.max(1,canvas.getBoundingClientRect().width);
      return nearestMarker(items,p,10*ratio);
    }
    function photoMarker(p){return markerHit(photo,p,rows.map(r=>({id:r.landmark.id,pixel:screenPoint(view,r.pixel)})));}
    function committedMarker(r){
      if(!isMaterial(r.landmark))return byLandmark.get(r.landmark.id);
      if(!markerProjection)return null;
      const l=r.landmark,key=materialAnchor.anchorKey(l.anchor);
      if(!materialMarkers.has(key)){
        let item=null;
        try{
          const q=markerProjection[r.kind](l);
          if(q.status==='visible'&&q.pixel){
            if(!markerResolver)markerResolver=materialResolver.create(scene.model);
            const physical=markerResolver.resolveLandmark(r.kind,l);
            item={pixel:q.pixel,objectKey:objectKey({bank:physical.bank,primitive:physical.index},scene.banks)};
          }
        }catch(error){/* Invalid or unavailable material projection: no marker. */}
        materialMarkers.set(key,item);
      }
      return materialMarkers.get(key);
    }
    function modelMarker(p){return markerHit(sceneCanvas,p,rows.flatMap(r=>{
      const item=committedMarker(r);return item?[{id:r.landmark.id,pixel:screenPoint(modelView,item.pixel)}]:[];
    }));}
    function updateObjects(){
      groups=[];vertices=[];
      const b=Number(bank.value),m=scene.model;
      const authored=scene.banks[b]||[];
      const byObject=new Map();
      authored.forEach((p,index)=>{
        const key=p.metadata?.placedObjectIndex??0;
        if(!byObject.has(key))byObject.set(key,[]);
        byObject.get(key).push({p,index});
      });
      groups=[...byObject].map(([key,items])=>({key,items}));
      populate(object,groups.map((g,i)=>[i,'Object '+(g.key+1)+' (far-to-near)']));
      updateVertices();
    }
    function updateVertices(){
      vertices=[];const b=Number(bank.value),g=groups[Number(object.value)];
      if(g)for(const {p,index} of g.items)if(p.points.length>=2)
        p.points.forEach((point,j)=>vertices.push({id:'b'+b+':p'+index+':v'+j,bank:b,
          objectType:scene.model.ObjType[b],primitive:index,vertex:j}));
      populate(vertex,vertices.map((v,i)=>[i,'Primitive '+v.primitive+' · vertex '+v.vertex]));
      meshDraw();add.disabled=!pending||!selected();
    }
    function landmarkLabel(v){
      if(isMaterial(v)){const a=v.anchor,o=a.owner;return 'Bank '+(o.bank+1)+' · '+(o.kind==='span'?o.role+' '+(o.from.stationIndex+1)+'–'+(o.to.stationIndex+1):'Station '+(o.stationIndex+1))+' · '+a.kind+' · P'+a.primitive+' / '+a.indices.join(',');}
      const p=scene?.banks[v.bank]?.[v.primitive];
      const number=(p?.metadata?.placedObjectIndex??0)+1;
      return 'Bank '+(v.bank+1)+' · Object '+number+' (far-to-near) · P'+v.primitive+' / V'+v.vertex;
    }
    function selectLandmark(v){
      if(!v||isMaterial(v))return false;
      bank.value=String(v.bank);updateObjects();
      const g=groups.findIndex(g=>g.items.some(p=>p.index===v.primitive));
      if(g<0)return false;
      object.value=String(g);updateVertices();
      const index=vertices.findIndex(p=>p.id===v.id);
      if(index<0)return false;
      vertex.value=String(index);meshDraw();add.disabled=!pending||!selected();return true;
    }
    function fitModel(){
      if(!previewValid)return;
      modelView=fit(modelRaster.width,modelRaster.height,sceneCanvas.width,sceneCanvas.height);
      clearHover();clearAmbiguity();
    }
    function renderModel(){
      inlineViewer.close();inlineSource=null;initialParked=false;bestCropSource=null;
      if(viewer.isCrop())viewer.close();cropSource=null;cancelRegion();
      invalidateFit('Add correspondences or run calibration from the captured camera.');
      cancelModelFrame();modelGhost=null;projected=[];index=spatialIndex([]);byLandmark=new Map();previewValid=false;modelView=null;
      markerProjection=null;markerResolver=null;materialMarkers=new Map();
      visibleSpans=new Map();ownerSpans=new Map();highlightKey=null;ownership=null;exactOwnership=null;hoverObject=null;visibleByObject=new Map();
      hover=[];hoverIndex=0;$('ModernCalibrationHoverTip').hidden=true;clearAmbiguity();modelStatus.textContent='Rendering Canvas Direct…';
      try{
        const size=previewSize(record?.original.width||sceneCanvas.width,record?.original.height||sceneCanvas.height);
        modelRaster.width=size.width;modelRaster.height=size.height;
        // Same camera and raster for actual painter and landmark projector.
        // Eye-level is the existing photo calibration camera convention.
        const m={...scene.model,viewcenterHorizon:3,geometryRadius:scene.model.rEarth,
          deviceRatio:size.width/size.height};
        const camera=env.CurvatureCameraPhysicalPose.photoCamera(m,size.width,size.height);
        m.camViewAngle=camera.fieldOfViewRadians;
        const paintOptions={...scene.physics,canvasDirectOptions:{thinOutlines:true}};
        const stats=renderer.paint(modelRaster,camera,m,paintOptions);
        cropSource=jsonCopy({camera,model:m,options:paintOptions,width:size.width,height:size.height});
        // Same painter order and terrain mask, once per preview, not per hover.
        try{
          identityRaster.width=highlightRaster.width=size.width;
          identityRaster.height=highlightRaster.height=size.height;
          renderer.paint(identityRaster,camera,m,{...scene.physics,
            canvasDirectOptions:{thinOutlines:true,objectIdentityPass:true}});
          visibleSpans=identitySpans(identityRaster.getContext('2d').getImageData(0,0,size.width,size.height).data,size.width,size.height);
          const validKeys=new Set();
          for(let bank=0;bank<2;bank++)for(const p of scene.banks[bank]){
            const i=p.metadata?.placedObjectIndex;if(Number.isInteger(i))validKeys.add(i*2+bank+1);
          }
          for(const key of visibleSpans.keys())if(!validKeys.has(key))visibleSpans.delete(key);
          ownership=ownershipRaster(visibleSpans,size.width,size.height);
        }catch(error){visibleSpans=new Map();console.warn('Calibration object highlight unavailable:',error);}
        // Keep the legacy package mask; owner selection uses a separate pass
        // with identical painter order and masks, not nearest-vertex inference.
        try{
          renderer.paint(identityRaster,camera,m,{...scene.physics,canvasDirectOptions:{thinOutlines:true,landmarkOwnerPass:true}});
          ownerSpans=identitySpans(identityRaster.getContext('2d').getImageData(0,0,size.width,size.height).data,size.width,size.height);
          for(const key of ownerSpans.keys())if(!packages.has(key))ownerSpans.delete(key);
          exactOwnership=ownershipRaster(ownerSpans,size.width,size.height);
        }catch(error){ownerSpans=new Map();console.warn('Calibration owner picking unavailable:',error);}
        const projection=env.CurvatureCameraLandmarkProjection.create(m,camera,size.width,size.height,
          {...scene.physics,method:'canvas-direct'});
        markerProjection=projection;
        for(let b=0;b<2;b++){
          for(const [index,p] of scene.banks[b].entries()){
            if(p.points.length<2)continue;
            for(const [j,world] of p.points.entries()){
              const landmark={id:'b'+b+':p'+index+':v'+j,bank:b,objectType:m.ObjType[b],primitive:index,vertex:j};
              const result=projection.vertex(landmark);
              if(result.status!=='visible'||!result.pixel)continue;
              const key=objectKey(landmark,scene.banks);
              const painterVisible=key!==null&&ownerAt(ownership,...result.pixel,2.5)===key;
              const item={landmark,pixel:result.pixel,worldKey:world.map(x=>Math.round(x*1e6)).join(','),objectKey:key,painterVisible};
              projected.push(item);byLandmark.set(landmark.id,item);
              if(painterVisible){
                if(!visibleByObject.has(key))visibleByObject.set(key,[]);
                visibleByObject.get(key).push(item);
              }
            }
          }
        }
        index=spatialIndex(projected.filter(p=>p.painterVisible));previewValid=true;fitModel();
        modelStatus.textContent='Canvas Direct · '+stats.sourceObjects+' objects · '+projected.length+
          ' terrain-eligible vertices · '+projected.filter(p=>p.painterVisible).length+' painter-visible pick candidates'+
          (ownership?' · approximate painter visibility':' · identity unavailable; use manual menu');
      }catch(e){
        projected=[];byLandmark.clear();markerProjection=null;materialMarkers.clear();modelView=null;meshDraw();
        modelStatus.textContent='Model preview unavailable: '+e.message+'; the landmark menu remains available.';
        if(globeRoute()&&!cropSource){legacyShown=true;syncModelRoute();}
      }
      refreshObjectSelection();meshDraw();
    }
    function packageLabel(pkg){
      if(pkg.owner.kind==='span'){
        const o=pkg.owner;
        return 'Bank '+(o.bank+1)+' · '+o.role+(o.side===null?'':' · side '+(o.side<0?'−':'+'))+
          ' · stations '+(o.from.stationIndex+1)+' → '+(o.to.stationIndex+1)+(o.to.column?' · column '+o.to.column:'');
      }
      return objectLabel(pkg.key)+' · type '+pkg.owner.objectType+' · station '+(pkg.owner.stationIndex+1)+
        (pkg.owner.column?' · column '+pkg.owner.column:'');
    }
    function refreshObjectSelection(){
      const pkg=packages.get(selectedObjectKey);
      objectControls.hidden=!objectMode();
      pickMode.disabled=viewBest;
      objectPicker.disabled=viewBest||!packages.size;
      clearObject.disabled=viewBest||selectedObjectKey===null;
      viewerButton.disabled=viewBest||!pkg;
      if(viewBest&&viewer.isOpen())viewer.close();
      objectPicker.value=pkg?String(pkg.key):'';
      objectSelectionStatus.textContent=pkg?
        packageLabel(pkg)+(pkg.rangeMetres===null?'':' · approx. horizontal range '+pkg.rangeMetres.toFixed(1)+' m')+
        (pkg.owner.kind==='span'?' · individual span':' · '+pkg.spanOwners.length+' incoming spans')+(ownerSpans.has(pkg.key)?'':' · not visible in identity pass'):
        'No owner selected. Click a visible object or span, or choose from the list.';
    }
    function selectObject(key){
      if(viewBest)return false;
      if(key!==null&&!packages.has(key))return false;
      const changed=selectedObjectKey!==key;
      selectedObjectKey=key;refreshObjectSelection();meshDraw();
      if(viewer.isOpen()&&!viewer.isCrop()&&changed){if(key===null)viewer.close();else openViewer();}
      return true;
    }
    function openViewer(){
      const pkg=packages.get(selectedObjectKey);if(!pkg||viewBest)return;
      try{
        const m=scene.model,b=pkg.owner.bank,globe=m.showModel===1,engine=env.CurvatureGeometryEngine;
        const entries=engine.objectSequence({...m,geometryRadius:m.rEarth},b,globe,
          {opticsNeutral:true,physicalSurface:true,curvature:globe?1/m.rEarth:0});
        const entry=entries[pkg.placedIndex];
        if(!entry||entry.scene.metadata.drawn!==pkg.packageOwner.drawn||(entry.scene.metadata.column||0)!==pkg.packageOwner.column)
          throw Error('Selected object no longer matches the authored sequence');
        const local=env.CurvatureModernLandmarkViewer.localGeometry(scene.banks[b],pkg,engine.towerPlacement(entry.params));
        viewer.open(local,packageLabel(pkg));
      }catch(error){viewer.close();objectSelectionStatus.textContent='Cannot open object viewer: '+error.message;}
    }
    viewerButton.onclick=openViewer;
    // The floating window is fixed-position but owned by this workspace.
    new env.MutationObserver(()=>{if(workspace.hidden){cancelRegion();pendingMagnifier=null;viewer.close();}else{restoreMagnifier();meshDraw();if(!inlinePanel.hidden){inlineViewer.refresh();refreshMagnifierCorrespondences();}}}).observe(workspace,{attributes:true,attributeFilter:['hidden']});
    function cancelRegion(){const d=regionDrag;regionDrag=null;if(d&&sceneCanvas.hasPointerCapture(d.id))sceneCanvas.releasePointerCapture(d.id);}
    function syncModelRoute(){
      const integrated=globeRoute()&&!legacyShown;
      legacyToggle.hidden=!globeRoute();legacyToggle.setAttribute('aria-pressed',String(!integrated&&globeRoute()));
      legacyToggle.textContent=integrated?'Legacy model tools':'Integrated model viewer';
      inlinePanel.hidden=!integrated;legacyPanel.hidden=integrated;
      return integrated;
    }
    function inlinePaint(source){
      return (canvas,capture,region)=>inlineRenderer.paintCrop(canvas,source.camera,source.model,
        {...source.options,canvasDirectOptions:{...source.options.canvasDirectOptions,capturePicking:capture}},
        source.width,source.height,region);
    }
    function buildInlineFree(source,region,selected){
      const api=env.CurvatureModernLandmarkViewer,m=source.model,t=env.CurvatureCameraTranslation;
      const basis=t.frame(m.CameraEast||0,m.CameraNorth||0,m.Height,1/m.rEarth);
      if(selected){
        try{return api.regionGeometry(scene.banks,{...selected,region},source,basis);}
        catch(error){/* Unavailable selected geometry: retain the visible-owner fallback. */}
      }
      const seed=api.regionSeed(ownerSpans,region),owner=seed&&packages.get(seed.key);
      if(!owner)return null;
      return api.regionGeometry(scene.banks,{owner:owner.owner,primaryIndices:owner.primaryIndices,pixel:seed.pixel,region},source,basis);
    }
    function syncInline(){
      if(!syncModelRoute()||workspace.hidden)return false;
      const best=!!(viewBest&&fitBest&&paintedFit&&bestCropSource),source=best?bestCropSource:cropSource;
      if(!source)return true;
      if(inlineSource===source&&inlineViewer.isOpen())return true;
      try{
        if(best&&inlineSource===cropSource)initialParked=inlineViewer.parkScene();
        if(!best&&initialParked){
          initialParked=false;
          if(inlineViewer.resumeScene()){inlineSource=source;refreshMagnifierCorrespondences();return true;}
        }
        if(best&&inlineSource&&inlineSource!==cropSource&&inlineSource.width===source.width&&inlineSource.height===source.height&&inlineViewer.updateScenePaint(inlinePaint(source))){
          inlineSource=source;refreshMagnifierCorrespondences();return true;
        }
        inlineViewer.openScene({width:source.width,height:source.height,banks:scene.banks,paint:inlinePaint(source),
          buildFree:best?null:(region,active,selected)=>buildInlineFree(source,region,selected),readOnly:best,
          title:best?'Model · Best Camera':'Model · Initial Camera'});
        inlineSource=source;refreshMagnifierCorrespondences();return true;
      }catch(error){
        inlineViewer.close();inlineSource=null;initialParked=false;legacyShown=true;syncModelRoute();
        message('Integrated model unavailable: '+error.message+' · legacy tools retained.');return false;
      }
    }
    legacyToggle.onclick=()=>{
      if(!globeRoute())return;
      legacyShown=!legacyShown;cancelRegion();cancelModelFrame();modelDrag=null;modelGhost=null;
      if(!legacyShown){viewer.close();pickMode.value='vertex';}
      syncModelRoute();clearHover();updateHint();meshDraw();
      if(!legacyShown){inlineViewer.refresh();refreshMagnifierCorrespondences();}
      persist();
    };
    function openRegion(region){
      if(!cropSource||!region)return;
      const source=cropSource,banks=scene.banks,api=env.CurvatureModernLandmarkViewer;
      const seed=api.regionSeed(ownerSpans,region),owner=seed&&packages.get(seed.key);
      const build=owner?()=>{
        const m=source.model,t=env.CurvatureCameraTranslation;
        const basis=t.frame(m.CameraEast||0,m.CameraNorth||0,m.Height,m.showModel===1?1/m.rEarth:0);
        return api.regionGeometry(banks,{owner:owner.owner,primaryIndices:owner.primaryIndices,pixel:seed.pixel,region},source,basis);
      }:null;
      viewer.openCrop(region,(canvas,capture=false)=>cropRenderer.paintCrop(canvas,source.camera,source.model,
        {...source.options,canvasDirectOptions:{...source.options.canvasDirectOptions,capturePicking:capture&&source.model.showModel===1}},
        source.width,source.height,region),
        build,build?'':'No visible geometry in this rectangle; Free View unavailable.',source.model.showModel===1);
      refreshMagnifierCorrespondences();
    }
    pickMode.onchange=()=>{
      cancelRegion();cancelModelFrame();modelDrag=null;modelGhost=null;clearAmbiguity();clearHover();
      refreshObjectSelection();updateHint();meshDraw();
    };
    objectPicker.onchange=()=>selectObject(objectPicker.value?Number(objectPicker.value):null);
    clearObject.onclick=()=>{clearHover();selectObject(null);};
    function highlightedObject(){
      if(magnifierMode())return null;
      if(objectMode())return hoverObject??selectedObjectKey;
      if(hoverObject!==null||modelGhost)return hoverObject;
      const landmark=pendingModel||rows.find(r=>r.landmark.id===activePair)?.landmark;
      if(isMaterial(landmark))return committedMarker({kind:landmark.anchor.kind,landmark})?.objectKey??null;
      return landmark&&scene?objectKey(landmark,scene.banks):null;
    }
    function drawObjectHighlight(){
      const key=highlightedObject();
      const spans=objectMode()?ownerSpans:visibleSpans,cacheKey=(objectMode()?'owner:':'package:')+key;
      if(cacheKey!==highlightKey){
        highlightKey=cacheKey;
        const ctx=highlightRaster.getContext('2d');
        ctx.clearRect(0,0,highlightRaster.width,highlightRaster.height);
        ctx.fillStyle='rgba(0,168,220,0.72)';
        for(const [x,y,width] of spans.get(key)||[])ctx.fillRect(x,y,width,1);
      }
      if(spans.has(key))mesh.drawImage(highlightRaster,modelView.x,modelView.y,
        modelRaster.width*modelView.scale,modelRaster.height*modelView.scale);
    }
    function meshDraw(){
      if(syncInline())return;
      if(viewBest&&fitBest&&paintedFit){drawFitPreview();return;}
      mesh.clearRect(0,0,sceneCanvas.width,sceneCanvas.height);
      if(!modelView||!previewValid)return;
      mesh.drawImage(modelRaster,modelView.x,modelView.y,modelRaster.width*modelView.scale,modelRaster.height*modelView.scale);
      drawObjectHighlight();
      // By default reveal only the eligible vertices of the hovered object.
      // The explicit checkbox still shows all painter-visible candidates.
      const dots=showLandmarks.checked?projected.filter(p=>p.painterVisible):objectMode()?[]:visibleByObject.get(highlightedObject())||[];
      if(dots.length){
        mesh.fillStyle='#006f92';mesh.globalAlpha=.85;
        for(const item of dots){
          const p=screenPoint(modelView,item.pixel);
          if(p[0]>=0&&p[0]<sceneCanvas.width&&p[1]>=0&&p[1]<sceneCanvas.height)mesh.fillRect(p[0]-2,p[1]-2,4,4);
        }
        mesh.globalAlpha=1;
      }
      rows.forEach((r,i)=>{
        const ghost=modelGhost?.id===r.landmark.id?modelGhost:null;
        const item=committedMarker(r);
        const pixel=ghost?ghost.pixel:item?screenPoint(modelView,item.pixel):null;
        if(pixel)marker(mesh,pixel,pairLabel(r,i),COLORS[i%COLORS.length],!!ghost||r.landmark.id===activePair);
      });
      const pendingLandmark=pendingModel||(editing?selected():null);
      const item=pendingLandmark?committedMarker({kind:pendingLandmark.anchor?.kind||'vertex',landmark:pendingLandmark}):null;
      if(item)marker(mesh,screenPoint(modelView,item.pixel),'+','#009ab3');
      if(regionDrag){
        const a=regionDrag.start,b=regionDrag.last,x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0]),h=Math.abs(a[1]-b[1]);
        mesh.save();mesh.fillStyle='rgba(0,150,200,.13)';mesh.strokeStyle='#009ac5';mesh.lineWidth=2;mesh.setLineDash([5,3]);
        mesh.fillRect(x,y,w,h);mesh.strokeRect(x,y,w,h);mesh.restore();
      }
      if(hover.length){
        const p=screenPoint(modelView,hover[hoverIndex]?.pixel||hover[0].pixel);
        mesh.strokeStyle='#00a6c5';mesh.lineWidth=2;mesh.beginPath();mesh.arc(p[0],p[1],9,0,Math.PI*2);mesh.stroke();
        if(modelGhost){
          mesh.save();mesh.setLineDash([4,4]);mesh.lineWidth=1;mesh.beginPath();
          mesh.moveTo(...modelGhost.pixel);mesh.lineTo(...p);mesh.stroke();mesh.restore();
        }
      }
    }
    function inspectPick(p){
      if(!modelView)return {key:null,candidates:[]};
      const ratio=sceneCanvas.width/Math.max(1,sceneCanvas.getBoundingClientRect().width);
      return visiblePick(ownership,index.query(modelView,p[0],p[1],10*ratio),modelView,p[0],p[1],10*ratio,2*ratio);
    }
    function inspectOwner(p){
      if(!modelView)return null;
      const ratio=sceneCanvas.width/Math.max(1,sceneCanvas.getBoundingClientRect().width);
      const key=ownerAt(exactOwnership,(p[0]-modelView.x)/modelView.scale,(p[1]-modelView.y)/modelView.scale,Math.min(3,4*ratio/modelView.scale));
      return packages.has(key)?key:null;
    }
    function hoverLabel(key){return objectMode()?packageLabel(packages.get(key)):objectLabel(key);}
    function objectLabel(key){return 'Bank '+((key-1)%2+1)+' · Object '+(Math.floor((key-1)/2)+1)+' (far-to-near)';}
    function clearAmbiguity(){
      ambiguous=[];pickConflict.hidden=true;pickOptions.replaceChildren();
    }
    function hoverAt(p,draw=true){
      const previous=hover[hoverIndex]?.landmark.id;
      const result=objectMode()?{key:inspectOwner(p),candidates:[]}:inspectPick(p);hoverObject=result.key;hover=result.candidates;
      hoverIndex=Math.max(0,hover.findIndex(q=>q.landmark.id===previous));
      const item=hover[hoverIndex];
      const tip=$('ModernCalibrationHoverTip');
      tip.hidden=hoverObject===null;
      if(hoverObject!==null){
        tip.textContent=item?(hover.length>1?'Candidate '+(hoverIndex+1)+'/'+hover.length+' · Tab / Shift+Tab · ':'')+
          landmarkLabel(item.landmark)+' · '+(modelGhost?'Release to snap':'Click highlighted vertex'):
          hoverLabel(hoverObject)+(objectMode()?' · Click to select owner':' · Move to a marked vertex');
        const r=sceneCanvas.getBoundingClientRect();
        tip.style.left=Math.min(Math.max(0,p[0]*r.width/sceneCanvas.width+12),Math.max(0,r.width-230))+'px';
        tip.style.top=Math.min(Math.max(0,p[1]*r.height/sceneCanvas.height+16),Math.max(0,r.height-42))+'px';
      }
      pickStatus.textContent=item?landmarkLabel(item.landmark)+(hover.length>1?' · '+(hoverIndex+1)+'/'+hover.length:''):
        hoverObject!==null?hoverLabel(hoverObject)+(objectMode()?' · Click to select owner':' · Move to a marked vertex'):objectMode()?'Select a visible object or use the object list.':$('ModernCalibrationActionHint').textContent;
      if(draw)meshDraw();
    }
    function clearHover(){
      hover=[];hoverIndex=0;hoverObject=null;$('ModernCalibrationHoverTip').hidden=true;meshDraw();
    }
    function savePair(){
      try{
        const landmark=materialEdit()||pendingModel||selected();
        if(!record||!pending||!landmark)throw Error('Select both a photo pixel and a model vertex');
        const next=upsert(rows,pair(landmark,pending,record.original.width,record.original.height,Number(weight.value),rows.find(r=>r.landmark.id===editing)?.included),editing);
        rememberUndo();rows=next;activePair=null;
        resetPending();refreshRows();photoDraw();meshDraw();message('Correspondence saved.');persist();return true;
      }catch(e){message(e.message);$('ModernCalibrationActionHint').textContent=e.message;return false;}
    }
    function chooseInlineVertex(hit){
      if(!globeRoute()||legacyShown||viewBest||!scene)return false;
      const p=scene.banks[hit.bank]?.[hit.index];
      if(hit.kind!=='vertex'||!Number.isInteger(hit.vertex)||!p?.points[hit.vertex])return false;
      return chooseModel({landmark:{id:'b'+hit.bank+':p'+hit.index+':v'+hit.vertex,bank:hit.bank,objectType:scene.model.ObjType[hit.bank],primitive:hit.index,vertex:hit.vertex}})?(pendingModel?'pending':'saved'):false;
    }
    function chooseModel(item){
      if(!record){message('Load a photograph first.');return false;}
      if(materialEdit()){message('Finish photo-side edit or cancel; material model editing will use Magnifier.');return false;}
      if(!selectLandmark(item.landmark))return false;
      clearAmbiguity();pendingModel=item.landmark;activePair=null;
      if(pending)return savePair();
      refreshRows();updateHint();meshDraw();persist();return true;
    }
    function choosePhoto(p){
      if(!p)return;
      activePair=null;setPixel(p);refreshRows();
      if(pendingModel)savePair();
      else {photoDraw();meshDraw();persist();}
    }
    function pickAt(p){
      hoverAt(p);
      if(objectMode()){
        if(hoverObject===null)pickStatus.textContent='No visible object here. Zoom in or use the object list.';
        else if(!selectObject(hoverObject))pickStatus.textContent='Stable object identity unavailable; choose another object.';
        return;
      }
      const item=hover[hoverIndex];
      if(!item){pickStatus.textContent=hoverObject!==null?'Move to a visible vertex of '+objectLabel(hoverObject):'No visible object here. Zoom in or use the landmark menu.';return;}
      chooseModel(item);
    }
    // Legacy manual candidate controls remain as fallback for old hosts.
    pickOptions.onchange=()=>{const p=ambiguous[Number(pickOptions.value)];if(p)selectLandmark(p.landmark);};
    $('ModernCalibrationConfirmPick').onclick=()=>{const p=ambiguous[Number(pickOptions.value)];if(p)chooseModel(p);};
    $('ModernCalibrationFitModel').onclick=()=>{if(viewBest){meshDraw();return;}fitModel();};
    showLandmarks.onchange=meshDraw;
    function canvasPoint(canvas,e){
      const r=canvas.getBoundingClientRect();
      return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];
    }
    function prepareScene(snapshot){
      const m=snapshot.model,globe=m.showModel===1;
      if(!['vacuum','standard','temperature-lapse'].includes(snapshot.physics.atmosphere))
        throw Error('Select Vacuum, Standard or Temperature lapse in Scene for calibration.');
      const banks=[0,1].map(b=>{
        if(!m.NObjects[b])return [];
        return env.CurvatureGeometryEngine.createObjectSequenceScene({...m,geometryRadius:m.rEarth},b,globe,
          {opticsNeutral:true,physicalSurface:true,curvature:globe?1/m.rEarth:0}).primitives;
      });
      return {...snapshot,banks};
    }
    function showScene(next){
      cancelRegion();viewer.close();inlineViewer.close();inlineSource=null;initialParked=false;bestCropSource=null;legacyShown=false;if(!restoring)newMagnifierSession();scene=next;selectedObjectKey=null;pickMode.value='vertex';
      const m=scene.model,globe=m.showModel===1;
      let rangeOf=()=>null;
      try{const t=env.CurvatureCameraTranslation,basis=t.frame(m.CameraEast,m.CameraNorth,m.Height,globe?1/m.rEarth:0);
        rangeOf=p=>{const q=t.pointAt(p,basis);return Math.hypot(q[0],q[1]);};}catch(error){/* Range is optional. */}
      packages=ownerSelections(scene.banks,env.CurvatureGeometryEngine.landmarkOwnerKey,rangeOf);
      populate(objectPicker,[['','Choose an object or span…'],...[...packages.values()].map(p=>[p.key,packageLabel(p)])]);
      syncFitControls();
      $('ModernCalibrationScene').textContent=(m.DemoText||'Current scene')+' · '+(globe?'Globe':'Flat')+' · '+scene.physics.atmosphere;
      populate(bank,[0,1].filter(b=>scene.banks[b].length).map(b=>[b,'Bank '+(b+1)+' · type '+m.ObjType[b]]));
      updateObjects();refreshRows();renderModel();
      message('Load a reference photo and select matching vertices.');
    }
    function enter(snapshot){
      if(!scene){
        try{showScene(prepareScene(snapshot));}
        catch(e){scene=null;env.alert(e.message);return false;}
      }
      void refreshSources();persist();
      return true;
    }
    $('ModernCalibrationReset').onclick=()=>{
      if((rows.length||record)&&!env.confirm('Discard this photo and all correspondences and capture the latest Scene?'))return;
      let next;
      try{next=prepareScene(env.CurvatureModernApp.getPhotoCalibrationScene());}
      catch(e){message('Cannot start a new session: '+e.message);return;}
      loadToken++;record=null;image=null;view=null;activeSource=null;rows=[];activePair=null;undoStack=[];drag=null;modelDrag=null;photoGhost=null;modelGhost=null;file.value='';
      photoInfo.replaceChildren();sourcePicker.value='';sourceLoad.disabled=true;resetPending();
      showScene(next);persist();void refreshSources();
    };
    file.onchange=async()=>{
      const f=file.files[0];if(!f)return;
      if(!confirmReplacement()){file.value='';return;}
      const token=++loadToken;message('Loading photograph…');
      try{
        const next=await env.CurvatureModernReferenceImageImport.ingest(f,'calibration-photo',env);
        await acceptPhoto(next,null,token);
      }catch(e){if(token===loadToken)message('Cannot load photograph: '+e.message);}
      finally{if(token===loadToken)file.value='';}
    };
    photo.addEventListener('pointerdown',e=>{
      if(!record||e.button!==0)return;const p=canvasPoint(photo,e);
      const hit=photoMarker(p);
      drag={id:e.pointerId,start:p,last:p,moved:false,marker:hit?.id||null};
      photo.setPointerCapture(e.pointerId);
    });
    photo.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;const p=canvasPoint(photo,e);
      if(Math.hypot(p[0]-drag.start[0],p[1]-drag.start[1])>4)drag.moved=true;
      if(drag.moved){
        if(drag.marker){
          const pixel=imagePoint(view,...p,record.original.width,record.original.height);
          photoGhost=pixel?{id:drag.marker,pixel}:null;
        }else{view.x+=p[0]-drag.last[0];view.y+=p[1]-drag.last[1];}
        photoDraw();
      }
      drag.last=p;
    });
    photo.addEventListener('pointerup',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const action=drag,p=canvasPoint(photo,e);drag=null;photoGhost=null;
      if(action.marker){
        if(action.moved){
          const row=rows.find(r=>r.landmark.id===action.marker);
          const pixel=imagePoint(view,...p,record.original.width,record.original.height);
          if(row&&pixel)replacePair(action.marker,row.landmark,pixel);
        }else selectPair(action.marker);
      }else if(!action.moved)choosePhoto(imagePoint(view,...p,record.original.width,record.original.height));
      photoDraw();
    });
    photo.addEventListener('pointercancel',()=>{drag=null;photoGhost=null;photoDraw();});
    photo.addEventListener('wheel',e=>{
      if(!record)return;e.preventDefault();const p=canvasPoint(photo,e);
      const min=fit(record.original.width,record.original.height,photo.width,photo.height).scale/4;
      view=zoomAt(view,...p,Math.exp(-e.deltaY*.0015),min,Math.max(16,min*16));photoDraw();
    },{passive:false});
    $('ModernCalibrationFit').onclick=fitPhoto;
    function manualPixel(){
      if(!record)return;
      const p=[Number(px.value),Number(py.value)];
      const valid=px.value!==''&&py.value!==''&&imagePoint({scale:1,x:0,y:0},...p,record.original.width,record.original.height);
      pending=valid?p:null;photoDraw();meshDraw();add.disabled=!pending||!selected();
    }
    px.oninput=py.oninput=manualPixel;
    bank.onchange=()=>{pendingModel=null;updateObjects();};object.onchange=()=>{pendingModel=null;updateVertices();};vertex.onchange=()=>{pendingModel=null;meshDraw();add.disabled=!pending||!selected();};
    function cancelModelFrame(){
      if(modelFrame!==null)env.cancelAnimationFrame(modelFrame);
      modelFrame=null;queuedPointer=null;
    }
    function processModelPointer(p){
      if(!modelView||viewBest)return;
      if(magnifierMode()&&!modelDrag)return;
      if(!modelDrag){hoverAt(p);return;}
      if(Math.hypot(p[0]-modelDrag.start[0],p[1]-modelDrag.start[1])>4)modelDrag.moved=true;
      if(modelDrag.moved){
        if(modelDrag.marker){
          modelGhost={id:modelDrag.marker,pixel:p.slice()};
          hoverAt(p,false);meshDraw();
        }else{
          modelView.x+=p[0]-modelDrag.last[0];modelView.y+=p[1]-modelDrag.last[1];
          clearHover();clearAmbiguity();
        }
      }
      modelDrag.last=p;
    }
    function queueModelPointer(p){
      queuedPointer=p;
      if(modelFrame!==null)return;
      modelFrame=env.requestAnimationFrame(()=>{
        modelFrame=null;const next=queuedPointer;queuedPointer=null;
        if(next)processModelPointer(next);
      });
    }
    sceneCanvas.addEventListener('pointerdown',e=>{
      if(!modelView||viewBest||e.button!==0)return;
      if(magnifierMode()){
        if(regionDrag||!cropSource)return;
        e.preventDefault();cancelModelFrame();clearHover();const p=canvasPoint(sceneCanvas,e);
        regionDrag={id:e.pointerId,start:p,last:p};sceneCanvas.setPointerCapture(e.pointerId);meshDraw();return;
      }
      cancelModelFrame();const p=canvasPoint(sceneCanvas,e),hit=objectMode()?null:modelMarker(p);
      modelDrag={id:e.pointerId,start:p,last:p,moved:false,marker:hit?.id||null};
      sceneCanvas.setPointerCapture(e.pointerId);
    });
    sceneCanvas.addEventListener('pointermove',e=>{
      if(regionDrag){if(regionDrag.id===e.pointerId){regionDrag.last=canvasPoint(sceneCanvas,e);meshDraw();}return;}
      if(magnifierMode())return;
      if(modelDrag&&modelDrag.id!==e.pointerId)return;
      const p=canvasPoint(sceneCanvas,e);
      // Preserve drag intent even if several events arrive between frames.
      if(modelDrag&&Math.hypot(p[0]-modelDrag.start[0],p[1]-modelDrag.start[1])>4)modelDrag.moved=true;
      queueModelPointer(p);
    });
    sceneCanvas.addEventListener('pointerup',e=>{
      if(regionDrag){
        if(regionDrag.id!==e.pointerId)return;
        const p=canvasPoint(sceneCanvas,e),d=regionDrag;cancelRegion();meshDraw();
        const ratio=sceneCanvas.width/Math.max(1,sceneCanvas.getBoundingClientRect().width);
        const region=magnifierRegion(modelView,d.start,p,modelRaster.width,modelRaster.height,sceneCanvas.width,sceneCanvas.height,4*ratio);
        if(region)openRegion(region);else pickStatus.textContent='Drag a larger rectangle inside the model image.';
        return;
      }
      if(!modelDrag||modelDrag.id!==e.pointerId)return;
      const p=canvasPoint(sceneCanvas,e);cancelModelFrame();processModelPointer(p);
      const action=modelDrag;modelDrag=null;modelGhost=null;
      if(action.marker){
        if(action.moved){
          hoverAt(p,false);const item=hover[hoverIndex],row=rows.find(r=>r.landmark.id===action.marker);
          if(isMaterial(row?.landmark))message('Material model editing will use Magnifier; correspondence unchanged.');
          else if(row&&item)replacePair(action.marker,item.landmark,row.pixel);
          else message('No eligible vertex at drop; correspondence unchanged.');
        }else selectPair(action.marker);
      }else if(!action.moved)pickAt(p);
      meshDraw();
    });
    sceneCanvas.addEventListener('lostpointercapture',e=>{if(regionDrag?.id===e.pointerId){regionDrag=null;meshDraw();}});
    sceneCanvas.addEventListener('pointercancel',()=>{cancelRegion();cancelModelFrame();modelDrag=null;modelGhost=null;clearHover();});
    sceneCanvas.addEventListener('pointerleave',()=>{if(!modelDrag){cancelModelFrame();clearHover();}});
    sceneCanvas.addEventListener('wheel',e=>{
      if(!modelView)return;e.preventDefault();if(modelDrag||regionDrag||viewBest)return;cancelModelFrame();
      const p=canvasPoint(sceneCanvas,e),base=fit(modelRaster.width,modelRaster.height,sceneCanvas.width,sceneCanvas.height).scale;
      modelView=zoomAt(modelView,...p,Math.exp(-e.deltaY*.0015),base/4,Math.max(16,base*32));
      clearHover();clearAmbiguity();
    },{passive:false});
    function freeFields(){return Array.from(fitPanel.querySelectorAll('[data-fit-field]')).filter(n=>n.checked).map(n=>n.dataset.fitField);}
    function applyFreeFields(free){for(const n of fitPanel.querySelectorAll('[data-fit-field]'))n.checked=free.includes(n.dataset.fitField);syncFitControls();}
    function syncFitControls(){
      const free=freeFields(),count=fitRows(rows).length;
      $('ModernCalibrationRoleCount').textContent=count+' Fit · '+(rows.length-count)+' Validation'+(count===0||2*count<free.length?' · insufficient Fit points for selected free parameters':'');
      exportButton.disabled=!record||!scene;
      importButton.disabled=restoring;
      runFit.disabled=!!fitWorker||!record||!scene||!count||!free.length||2*count<free.length;
      stopFit.disabled=!fitWorker;bestView.disabled=!fitBest;
      for(const field of fitFields){
        const v=scene?.model[field];
        fitPanel.querySelector('[data-fit-value="'+field+'"]').textContent=Number.isFinite(v)?'('+Number(v.toPrecision(6))+')':'';
      }
      bestView.textContent=viewBest?'Return to initial camera':'Show best camera';
      $('ModernCalibrationFitNotice').hidden=!viewBest;
      residualMode.disabled=!fitBest;refreshObjectSelection();
    }
    function exportExperiment(){
      if(!scene||!record)throw Error('Load a photograph first');
      return jsonCopy({format:EXPERIMENT_FORMAT,version:experimentVersion(rows),
        scene:{model:scene.model,physics:scene.physics},referenceImage:record,referenceSource:activeSource,
        observations:rows,fit:{method:'canvas-direct',maxIterations:80,freeParameters:freeFields(),
          result:fitBest,status:fitStatus.textContent,running:!!fitWorker}});
    }
    function restoreFit(result,status,show){
      fitBest=result;fitSignature=result?JSON.stringify(rows):null;viewBest=!!(show&&result);
      if(result){fitSummary(result);if(viewBest)paintBest();}
      if(typeof status==='string'&&status)fitStatus.textContent=status;
      syncFitControls();meshDraw();
    }
    async function importExperiment(input){
      // All decoding and topology checks precede replacement of the existing draft.
      const data=validateExperiment(input,env.CurvatureModernReferenceImage.validate);
      const next=prepareScene(data.scene);
      validateLegacyTopology(data.observations,next);
      const width=data.referenceImage.original.width,height=data.referenceImage.original.height;
      env.CurvatureCameraPhysicalPose.photoCamera({...next.model,viewcenterHorizon:3},width,height);
      if(data.fit.result)env.CurvatureCameraPhysicalPose.photoCamera({...next.model,...data.fit.result.pose,viewcenterHorizon:3},width,height);
      const token=++loadToken,decoded=new env.Image();
      decoded.src=data.referenceImage.original.dataUrl;await decoded.decode();
      if(token!==loadToken)throw Error('Import superseded');
      if(decoded.naturalWidth!==width||decoded.naturalHeight!==height)throw Error('Embedded photo dimensions mismatch');
      if((record||rows.length)&&!env.confirm('Replace the current calibration draft with this experiment?'))return false;
      invalidateFit('Importing calibration experiment…');cancelModelFrame();
      drag=null;modelDrag=null;photoGhost=null;modelGhost=null;activePair=null;undoStack=[];
      record=data.referenceImage;image=decoded;rows=data.observations;
      activeSource={...(data.referenceSource||{}),key:null,links:data.referenceSource?.links||[],imported:true};
      view=null;resetPending();sourcePicker.value='';sourceLoad.disabled=true;
      showScene(next);photoDetails(record,activeSource);fitPhoto();
      applyFreeFields(data.fit.freeParameters);
      restoreFit(data.fit.result,data.fit.running?'Imported interrupted fit · best saved candidate only':data.fit.status,!!data.fit.result);
      message('Calibration experiment imported.');persist();return true;
    }
    exportButton.onclick=()=>{
      try{
        const data=exportExperiment(),blob=new env.Blob([JSON.stringify(data,null,2)],{type:'application/json'});
        const url=env.URL.createObjectURL(blob),a=doc.createElement('a');
        a.href=url;a.download='calibration-'+record.id+'.json';doc.body.append(a);a.click();a.remove();
        env.setTimeout(()=>env.URL.revokeObjectURL(url),30000);
        exchangeStatus.textContent='Experiment exported · original photo embedded.';
      }catch(error){exchangeStatus.textContent='Export failed: '+error.message;}
    };
    importButton.onclick=()=>importFile.click();
    importFile.onchange=async()=>{
      const f=importFile.files[0];if(!f)return;
      try{
        if(f.size>40*1024*1024)throw Error('Experiment file exceeds 40 MiB');
        const ok=await importExperiment(JSON.parse(await f.text()));
        exchangeStatus.textContent=ok?'Experiment imported.':'Import cancelled.';
      }catch(error){exchangeStatus.textContent='Import failed: '+error.message;}
      finally{importFile.value='';}
    };
    function terminateFit(){
      if(fitWorker){fitWorker.terminate();fitWorker=null;}
    }
    function initialProjection(){
      // Recompute initial positions with the same physical projection and
      // original raster as the worker. No extra optimization is performed.
      if(initialPoints!==null)return initialPoints;
      initialPoints=[];initialProjectionError='';
      try{
        const width=record.original.width,height=record.original.height,
          m={...scene.model,deviceRatio:width/height,viewcenterHorizon:3},
          camera=env.CurvatureCameraPhysicalPose.photoCamera(m,width,height),
          session=env.CurvatureCameraLandmarkProjection.create(m,camera,width,height,{...scene.physics,method:'canvas-direct'});
        initialPoints=rows.map(r=>{
          const q=session[r.kind](r.landmark);
          return {id:r.landmark.id,status:q.status,predicted:q.pixel};
        });
      }catch(error){initialProjectionError=String(error.message||error);}
      return initialPoints;
    }
    function bestProjection(result){
      if(diagnosticResult===result)return diagnosticBestPoints;
      const points=result.evaluation.points.slice(),held=rows.filter(r=>r.included===false);
      if(held.length){
        try{
          const width=record.original.width,height=record.original.height,
            m={...scene.model,...result.pose,deviceRatio:width/height,viewcenterHorizon:3},
            camera=env.CurvatureCameraPhysicalPose.photoCamera(m,width,height),
            session=env.CurvatureCameraLandmarkProjection.create(m,camera,width,height,{...scene.physics,method:'canvas-direct'});
          for(const r of held){
            try{const q=session[r.kind](r.landmark);points.push({id:r.landmark.id,status:q.status,predicted:q.pixel});}
            catch(error){points.push({id:r.landmark.id,status:'unavailable',predicted:null});}
          }
        }catch(error){for(const r of held)points.push({id:r.landmark.id,status:'unavailable',predicted:null});}
      }
      diagnosticResult=result;diagnosticBestPoints=points;return points;
    }
    function refreshResidualTable(){
      residualPanel.hidden=!fitBest;
      residualData=fitBest?residualRows(rows,initialProjection(),bestProjection(fitBest)):[];
      residualList.replaceChildren();
      residualNotice.textContent=initialProjectionError?'Initial projection unavailable: '+initialProjectionError:'';
      const n=v=>Number.isFinite(v)?v.toFixed(2):'—',xy=p=>p?p.map(n).join(', '):'—';
      const stats=residualStatistics(residualData);
      $('ModernCalibrationResidualStats').textContent=fitBest?Object.entries(stats).map(([key,s])=>
        ({fit:'Fit',validation:'Validation',all:'All points'}[key])+' RMS '+n(s.rms)+' px ('+s.available+'/'+s.count+' projected)').join(' · '):'';
      const max=residualData.reduce((v,r)=>Math.max(v,r.best.error??0),0);
      for(const r of residualData){
        const tr=doc.createElement('tr');tr.classList.toggle('is-selected',r.id===activePair);
        tr.dataset.landmarkId=r.id;
        const cell=doc.createElement('td'),button=doc.createElement('button');
        button.type='button';button.textContent=String(r.number);button.title=r.id;
        button.style.color=COLORS[(r.number-1)%COLORS.length];button.style.fontWeight='bold';
        button.setAttribute('aria-label','Select correspondence '+r.number);
        button.setAttribute('aria-pressed',String(r.id===activePair));
        button.onclick=()=>selectPair(r.id);cell.append(button);tr.append(cell);
        const role=doc.createElement('td');role.append(inclusionControl(rows[r.number-1],r.number-1));tr.append(role);
        for(const [key,value] of [['observed',xy(r.observed)],['initial',xy(r.initial.predicted)],['initialError',n(r.initial.error)],
          ['predicted',xy(r.best.predicted)],['dx',n(r.best.residual?.[0])],['dy',n(r.best.residual?.[1])],['error',n(r.best.error)],
          ['status',r.best.status]]){
          const td=doc.createElement('td');td.dataset.residual=key;td.textContent=value;
          if(key==='error'&&max>0&&r.best.error===max){td.style.fontWeight='bold';td.title='Largest best-camera residual';}
          tr.append(td);
        }
        residualList.append(tr);
      }
    }
    residualMode.onchange=()=>{photoDraw();persist();};
    function invalidateFit(message){
      terminateFit();fitBest=null;fitSignature=null;viewBest=false;paintedFit=null;
      initialPoints=null;initialProjectionError='';diagnosticResult=null;diagnosticBestPoints=[];
      fitResult.textContent='';fitStatus.textContent=message;syncFitControls();refreshResidualTable();photoDraw();
    }
    function fitSummary(r){
      const n=v=>Number.isFinite(v)?v.toFixed(2):'—';
      fitResult.textContent='Original pixels: Fit RMS '+n(r.initialRmsPx)+' → '+n(r.evaluation.rmsPx)+
        ' px · weighted RMS '+n(r.evaluation.weightedRmsPx)+' px · '+r.evaluations+' evaluations · '+
        fitFields.map((k,i)=>fitLabels[i]+': '+(Number.isFinite(r.pose[k])?Number(r.pose[k].toPrecision(7)):'—')).join(' · ');
      refreshResidualTable();photoDraw();
    }
    function paintBest(){
      if(!fitBest||!record||!scene)return;
      try{
        const size=previewSize(record.original.width,record.original.height);
        fitRaster.width=size.width;fitRaster.height=size.height;
        const m={...scene.model,...fitBest.pose,viewcenterHorizon:3,geometryRadius:scene.model.rEarth,deviceRatio:size.width/size.height};
        const camera=env.CurvatureCameraPhysicalPose.photoCamera(m,size.width,size.height);
        m.camViewAngle=camera.fieldOfViewRadians;
        const options={...scene.physics,canvasDirectOptions:{thinOutlines:true}};
        renderer.paint(fitRaster,camera,m,options);
        bestCropSource=jsonCopy({camera,model:m,options,width:size.width,height:size.height});
        paintedFit=fitBest;lastFitPaint=Date.now();meshDraw();
      }catch(error){viewBest=false;paintedFit=null;fitStatus.textContent='Best camera preview unavailable: '+error.message;syncFitControls();meshDraw();}
    }
    function drawFitPreview(){
      mesh.clearRect(0,0,sceneCanvas.width,sceneCanvas.height);
      const v=fit(fitRaster.width,fitRaster.height,sceneCanvas.width,sceneCanvas.height);
      mesh.drawImage(fitRaster,v.x,v.y,fitRaster.width*v.scale,fitRaster.height*v.scale);
      const sx=fitRaster.width/record.original.width,sy=fitRaster.height/record.original.height;
      const byId=new Map(bestProjection(paintedFit).map(p=>[p.id,p]));
      rows.forEach((r,i)=>{
        const p=byId.get(r.landmark.id);if(!p||!['visible','out_of_frame'].includes(p.status))return;
        if(p.predicted&&p.predicted.every(Number.isFinite)){
          const xy=screenPoint(v,[p.predicted[0]*sx,p.predicted[1]*sy]);
          if(xy[0]>=0&&xy[0]<sceneCanvas.width&&xy[1]>=0&&xy[1]<sceneCanvas.height)
            marker(mesh,xy,pairLabel(r,i),COLORS[i%COLORS.length],p.id===activePair);
        }
      });
    }
    function receiveFit(r){
      if(!r.evaluation?.valid)return;
      if(hasMaterial(rows))r={...r,materialBinding:fitBinding(rows,freeFields(),scene.model,scene.physics,record.original.width,record.original.height)};
      if(!fitBest||r.evaluation.cost<=fitBest.evaluation.cost){fitBest=r;fitSummary(r);}
      syncFitControls();
      if(viewBest&&Date.now()-lastFitPaint>=500)paintBest();
    }
    runFit.onclick=()=>{
      if(runFit.disabled)return;
      invalidateFit('Starting Canvas Direct fit…');meshDraw();
      const free=freeFields(),model=JSON.parse(JSON.stringify(scene.model));
      const input=JSON.parse(JSON.stringify(fitRows(rows))),physics=JSON.parse(JSON.stringify(scene.physics));
      fitSignature=JSON.stringify(rows);
      try{
        const worker=new env.Worker('src/calibration/CameraCalibrationWorker.js?camera-fit=1&vertex-scale=1&material-fit=1');fitWorker=worker;
        worker.onmessage=event=>{
          if(fitWorker!==worker)return;
          const data=event.data;
          if(data.type==='progress'){
            receiveFit(data.result);fitStatus.textContent='Fitting · '+data.result.acceptedSteps+' accepted steps · RMS '+data.result.evaluation.rmsPx.toFixed(2)+' px';
          }else if(data.type==='complete'){
            receiveFit(data.result);terminateFit();
            fitStatus.textContent=data.result.status+' · '+(data.result.reason||'Complete')+' (local fit; not a uniqueness certificate)';
            if(fitBest){viewBest=true;paintBest();}syncFitControls();persist();
          }else if(data.type==='error'){
            terminateFit();fitStatus.textContent='Fit failed: '+data.message;syncFitControls();
          }
        };
        worker.onerror=event=>{if(fitWorker!==worker)return;terminateFit();fitStatus.textContent='Worker failed: '+(event.message||'Unable to load calibration worker');syncFitControls();};
        worker.postMessage({model,input,options:{...physics,width:record.original.width,height:record.original.height,freeParameters:free,maxIterations:80}});
        syncFitControls();
      }catch(error){terminateFit();fitStatus.textContent='Cannot start fit: '+error.message;syncFitControls();}
    };
    stopFit.onclick=()=>{terminateFit();fitStatus.textContent='Stopped · best valid camera retained if available.';if(viewBest&&fitBest)paintBest();syncFitControls();persist();};
    bestView.onclick=()=>{if(!fitBest)return;viewBest=!viewBest;clearHover();if(viewBest)paintBest();else meshDraw();syncFitControls();};
    fitPanel.addEventListener('change',()=>{invalidateFit('Parameter selection changed. Run calibration again.');meshDraw();});
    add.onclick=savePair;
    $('ModernCalibrationCancelEdit').onclick=()=>{activePair=null;resetPending();refreshRows();photoDraw();meshDraw();};
    $('ModernCalibrationUndo').onclick=undo;
    $('ModernCalibrationDeleteSelected').onclick=()=>deletePair(activePair);
    doc.addEventListener('keydown',e=>{
      if(workspace.hidden||e.target?.closest?.('#ModernCalibrationViewer, #ModernCalibrationInlineViewer')||e.target?.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName))return;
      if(magnifierMode()&&e.key==='Escape'){e.preventDefault();cancelRegion();meshDraw();return;}
      if(objectMode()){
        if(e.key==='Escape'&&!viewBest){e.preventDefault();clearHover();selectObject(null);}
        return;
      }
      if(e.key==='Tab'&&hover.length>1){
        e.preventDefault();hoverIndex=(hoverIndex+(e.shiftKey?-1:1)+hover.length)%hover.length;
        $('ModernCalibrationHoverTip').textContent='Candidate '+(hoverIndex+1)+'/'+hover.length+' · Tab / Shift+Tab · Click highlighted vertex';
        pickStatus.textContent=landmarkLabel(hover[hoverIndex].landmark);meshDraw();
      }else if(e.key==='Escape'){
        e.preventDefault();activePair=null;resetPending();clearHover();refreshRows();photoDraw();persist();
      }else if(e.key==='Delete'&&activePair){
        e.preventDefault();deletePair(activePair);
      }else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!e.shiftKey){
        e.preventDefault();undo();
      }
    });
    for(const event of ['click','change','input','pointerup','pointercancel','wheel'])workspace.addEventListener(event,()=>persist());
    syncFitControls();
    mounted={enter,restore:restoreDraft,exportExperiment,importExperiment,objectSelection:()=>selectedObjectKey===null?null:jsonCopy(packages.get(selectedObjectKey)),inspectOwner:(x,y)=>inspectOwner([x,y]),viewerState:()=>viewer.snapshot(),viewerCorrespondences:()=>viewer.correspondences(),inlineViewerState:()=>inlineViewer.snapshot(),inlineViewerCorrespondences:()=>inlineViewer.correspondences(),activeCorrespondence:()=>activePair,viewerWindow:()=>viewer.windowSnapshot(),fitResult:()=>fitBest?JSON.parse(JSON.stringify(fitBest)):null,inspectPick:(x,y)=>{const hit=inspectPick([x,y]);return {key:hit.key,ids:hit.candidates.map(p=>p.landmark.id)};},preview:()=>({view:modelView?{...modelView}:null,points:projected.map(p=>({landmark:{...p.landmark},pixel:p.pixel.slice(),worldKey:p.worldKey,objectKey:p.objectKey,painterVisible:p.painterVisible})),valid:previewValid}),snapshot:()=>scene&&record?{model:JSON.parse(JSON.stringify(scene.model)),physics:{...scene.physics},
      referenceImageId:record.id,referenceSource:activeSource?{source:activeSource.source,demoId:activeSource.demoId||null}:null,
      width:record.original.width,height:record.original.height,
      observations:rows.map(r=>pair(r.landmark,r.pixel,record.original.width,record.original.height,r.weight,r.included))}:null};
    return mounted;
  }
  return Object.freeze({fit,imagePoint,zoomAt,magnifierRegion,previewSize,screenPoint,snapCandidates,spatialIndex,objectKey,objectPackages,ownerSelections,identitySpans,ownershipRaster,ownerAt,visiblePick,nearestMarker,pair,upsert,photoChoices,validateExperiment,validateFitResult,observationRows,fitBinding,experimentVersion,fitRows,residualRows,residualStatistics,drawResidual,mount});
}));
