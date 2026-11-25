/* Locally persisted photo correspondence editor. No solver or scene mutation. */
(function(root,factory){
  const api=factory(root,
    root.CurvatureCameraMaterialAnchor||require('../../calibration/CameraMaterialAnchor'),
    root.CurvatureCameraMaterialAnchorResolver||require('../../calibration/CameraMaterialAnchorResolver'),
    root.CurvatureCalibrationPointerGestures||require('./CalibrationPointerGestures'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.CurvatureModernPhotoCalibrationEditor=api;
    root.document.addEventListener('DOMContentLoaded',()=>api.mount(root.document));}
}(typeof globalThis!=='undefined'?globalThis:this,function(env,materialAnchor,materialResolver,pointerGestures){
  'use strict';
  // Destination is a page-local action choice, not part of the fit or draft.
  function applyDestination(target){
    if(!['Scene','A','B'].includes(target))throw RangeError('Invalid calibration Apply destination');
    const label=target==='Scene'?'Scene':'Compare '+target,other=target==='A'?'B':'A';
    const effect=target==='Scene'?
      'The fitted camera, captured objects and physical hypothesis replace Scene. The inactive Compare pair is reset to Globe/Flat defaults.':
      'Both Compare panels receive the same best fitted camera (Eye-Lvl) and captured objects. Only '+label+
      ' receives the captured physical hypothesis; Compare '+other+' retains its physics except shared visibility, which is reset to off (60 km). Retained Scene physics is unchanged.';
    const shared='The scene title, description, grid, reset preset and camera positions/sequence are reset; a supported captured display aspect is used when available. Accurate rendering is selected.';
    const recovery='The previous experiment is protected in History; your calibration draft is retained. Save Snapshot remains a separate action.';
    return Object.freeze({target,label,button:'Apply Best Camera to '+label,
      description:effect+' '+shared+' '+recovery+' Canvas Direct Fit RMS is historical, not an Accurate render error.',
      confirmation:'Apply the best fitted camera and captured scene to '+label+'?\n\n'+effect+'\n\n'+shared+'\n\n'+recovery});
  }
  // Backing-raster dimensions depend on the current viewport and DPR, not
  // an editor gesture. Compare version-4 viewer pan in raster-relative units.
  // The original full snapshot (including raster) is still saved on edits.
  function sharedInputFingerprint(draft,inline){
    if(!inline?.sessions)return JSON.stringify([draft,inline]);
    const sessions=Object.fromEntries(Object.entries(inline.sessions).map(([role,entry])=>{
      const session=entry?.session,raster=session?.raster,pan=session?.view?.pan;
      if(session?.version!==4||!Array.isArray(raster)||raster.length!==2||
         !raster.every(n=>Number.isInteger(n)&&n>0)||
         !Array.isArray(pan)||pan.length!==2||!pan.every(Number.isFinite))
        return [role,entry];
      const scale=Math.min(...raster);
      // Only comparison of presentation pan uses this rounding, to absorb
      // floating-point noise from resizeRaster's multiplication by a ratio.
      const normalized=pan.map(n=>Number((n/scale).toPrecision(14)));
      return [role,{...entry,session:{...session,raster:null,
        view:{...session.view,pan:normalized}}}];
    }));
    return JSON.stringify([draft,{...inline,sessions}]);
  }
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
  // Preserve observation identity when changing the material point.
  function commitGlobePair(rows,landmark,pixel,width,height,weight,editing,model){
    const old=editing===null?null:rows.find(r=>r.landmark.id===editing);
    if(editing!==null&&!old)throw Error('Correspondence no longer exists');
    const resolver=materialResolver.create(model);
    let l=landmark;
    if(old&&l.id!==old.landmark.id){
      const m=isMaterial(l)?materialAnchor.normalizeLandmark(l.anchor.kind,l):resolver.upgradeLegacy(l);
      l={id:old.landmark.id,anchor:m.anchor};
    }
    const value=pair(l,pixel,width,height,weight,old?.included!==false);
    const key=materialAnchor.anchorKey(resolver.resolveLandmark(value.kind,value.landmark).anchor);
    if(rows.some(r=>r.landmark.id!==editing&&materialAnchor.anchorKey(resolver.resolveLandmark(r.kind,r.landmark).anchor)===key))
      throw Error('This material point is already paired; edit its existing row');
    return upsert(rows,value,editing);
  }
  // Independent saved-endpoint transaction. Keep the other endpoint,
  // observation ID/role/weight/order and unrelated draft/selection intact.
  // Validate before change(); a rejected/no-op drop creates no Undo entry.
  function moveSavedEndpoint(workflow,id,{landmark=null,pixel=null},width,height,model){
    const old=workflow.rows.find(r=>r.landmark.id===id);
    if(!old)throw Error('Correspondence no longer exists');
    let next;
    if(landmark){
      const resolver=materialResolver.create(model);
      const key=l=>materialAnchor.anchorKey(resolver.resolveLandmark(l.anchor?.kind||'vertex',l).anchor);
      if(key(old.landmark)===key(landmark))return false;
      next=commitGlobePair(workflow.rows,landmark,old.pixel,width,height,old.weight,id,model);
    }else if(pixel){
      const value=pair(old.landmark,pixel,width,height,old.weight,old.included!==false);
      if(old.pixel.every((n,i)=>n===value.pixel[i]))return false;
      next=upsert(workflow.rows,value,id);
    }else return false;
    workflow.change(next,workflow.activePair);return true;
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
      thumbnail:row.thumbnail||null,kind:row.kind||'unclassified',tags:row.tags||[],collections:row.collections||[],
      links:[...new Set(linked.get(row.id)||[])]
    }));
    for(const demo of demos){
      for(const record of demo.referenceImages||[]){
        const links=demo.project.keyframes.flatMap((frame,i)=>
          (frame.referenceImageIds||[]).includes(record.id)?[demo.project.name+' / '+(frame.name||'Keyframe '+(i+1))]:[]);
        choices.push({key:JSON.stringify(['demo',demo.id,record.id]),source:'demo',demoId:demo.id,
          id:record.id,title:record.title,width:record.original.width,height:record.original.height,
          thumbnail:record.thumbnail||null,kind:'unclassified',
          author:record.author||'',license:record.license||'',links:[...new Set(links)]});
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
    if(r.atmosphere!==undefined&&r.atmosphere!==physics?.atmosphere)
      throw Error('Stored fit result does not match captured atmosphere');
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
    if(m?.showModel===2)throw Error('Flat calibration experiments are no longer supported; use a Globe scene.');
    if(!m||m.showModel!==1||!Number.isFinite(m.rEarth)||m.rEarth<=0||
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
  // Correspondence lifecycle independent of DOM, camera, picking and storage.
  function createPairWorkflow(){
    let rows=[],activePair=null,draft=null,undoStack=[],redoStack=[];
    const copy=value=>JSON.parse(JSON.stringify(value));
    const exists=id=>rows.some(r=>r.landmark.id===id);
    const fresh=(explicit=false)=>({mode:'add',id:null,pixel:null,landmark:null,explicit});
    const clearDraft=()=>{draft=null;};
    function beginAdd(explicit=true){draft=fresh(explicit);activePair=null;}
    function beginEdit(id,{model=true}={}){
      const row=rows.find(r=>r.landmark.id===id);if(!row)return false;
      draft={mode:'edit',id,pixel:copy(row.pixel),landmark:model?copy(row.landmark):null};
      activePair=id;return true;
    }
    function point(key,value){
      if(value!==null&&!draft)beginAdd(false);
      if(!draft)return;
      draft[key]=value===null?null:copy(value);
      if(draft.mode==='add'&&!draft.explicit&&!draft.pixel&&!draft.landmark)clearDraft();
    }
    function select(id){
      if(draft?.mode==='edit'&&id!==draft.id)return false;
      if(id!==null&&!exists(id))return false;
      activePair=id;return true;
    }
    function change(next,selection=activePair,{finish=false}={}){
      pushHistory(undoStack);redoStack=[];
      rows=next;
      if(finish||draft?.mode==='edit'&&!exists(draft.id))clearDraft();
      activePair=exists(selection)?selection:null;
    }
    function cancel(){activePair=draft?.mode==='edit'?draft.id:null;clearDraft();}
    function pushHistory(stack){
      stack.push({rows:copy(rows),activePair});if(stack.length>50)stack.shift();
    }
    function travel(from,to){
      if(!from.length)return false;
      pushHistory(to);const next=from.pop();rows=next.rows;
      // History is for durable observations, not a new independent draft.
      // An explicit edit whose original row disappeared cannot retain its ID.
      if(draft?.mode==='edit'&&!exists(draft.id))clearDraft();
      activePair=draft?.mode==='edit'?draft.id:exists(next.activePair)?next.activePair:null;
      return true;
    }
    function undo(){return travel(undoStack,redoStack);}
    function redo(){return travel(redoStack,undoStack);}
    function replaceAll(next=[]){rows=next;activePair=null;clearDraft();undoStack=[];redoStack=[];}
    function restoreDraft({editing=null,pending=null,pendingModel=null,activePair:selection=null,explicitAdd=false}){
      clearDraft();activePair=exists(selection)?selection:null;
      if(exists(editing)){
        draft={mode:'edit',id:editing,pixel:copy(pending),landmark:copy(pendingModel)};activePair=editing;
      }else if(pending||pendingModel||explicitAdd)draft={...fresh(explicitAdd),pixel:copy(pending),landmark:copy(pendingModel)};
    }
    function restoreHistory(entries,redo=[]){undoStack=copy(entries.slice(-50));redoStack=copy(redo.slice(-50));}
    return Object.freeze({
      get rows(){return rows;},get activePair(){return activePair;},get mode(){return draft?.mode||'browse';},
      get editing(){return draft?.mode==='edit'?draft.id:null;},get explicitAdd(){return draft?.mode==='add'&&draft.explicit===true;},
      get pending(){return draft?.pixel||null;},get pendingModel(){return draft?.landmark||null;},
      get undoStack(){return undoStack;},get redoStack(){return redoStack;},get canCommit(){return !!(draft?.pixel&&draft.landmark);},
      beginAdd,beginEdit,select,selectPhoto:p=>point('pixel',p),selectModel:l=>point('landmark',l),
      clearDraft,cancel,change,undo,redo,replaceAll,restoreDraft,restoreHistory,
      snapshot(){return copy({mode:draft?.mode||'browse',rows,activePair,draft,undoStack,redoStack});}
    });
  }
  // Presentation is derived from workflow state, not individual viewport controls.
  // Consume only double-clicks on the current draft. The commit callback
  // is invoked once, only when both validated endpoints are present.
  function linkDraftGesture(workflow,gesture,commit,enabled=true){
    if(!enabled||gesture.kind!=='double-click'||gesture.target.kind!=='draft')return false;
    if(workflow.canCommit)commit();
    return true;
  }
  function pairToolbarState(workflow,{ready=false,readOnly=false,implicit=false}={}){
    const editing=workflow.mode==='edit',draft=workflow.mode!=='browse';
    const selected=workflow.rows.findIndex(r=>r.landmark.id===workflow.activePair);
    const photo=!!workflow.pending,model=!!workflow.pendingModel;
    let hint=!ready?'Load a photograph to start.':readOnly?'Best camera is read-only for model picking. Return to Free View to add or edit a pair.':
      editing?'Editing pair #'+(workflow.rows.findIndex(r=>r.landmark.id===workflow.editing)+1)+' · choose a replacement point, then Update pair.':
      draft?photo&&model?(implicit?'Double-click either draft point to link the pair.':'Both points selected · Create pair.'):photo?'Photo point selected · choose its matching model point.':model?'Model point selected · choose its matching photo point.':'Choose a point on either the photograph or model.':
      selected>=0?'Pair #'+(selected+1)+' selected · '+(implicit?'click either view to start a new pair.':'Edit or Delete pair.'):(implicit?'Click a point on either view.':'Add pair, or select a numbered marker.');
    return {hint,mode:editing?'Edit pair':draft?'New pair':'Browse',photo,model,
      addDisabled:!ready||readOnly||draft,editDisabled:!ready||readOnly||draft||selected<0,
      commitDisabled:!ready||readOnly||!draft||!photo||!model,cancelDisabled:!draft,
      deleteDisabled:selected<0||draft,undoDisabled:!workflow.undoStack.length,redoDisabled:!workflow.redoStack.length,
      commitLabel:editing?'Update pair':'Create pair'};
  }
  // Context actions are targeted by the right-clicked marker, not by a
  // possibly unrelated selection. The descriptions are pure and testable.
  function contextActions(workflow,target,side){
    const action=(id,label,disabled=false)=>({id,label,disabled});
    if(target.kind==='draft')return [
      action('link','Link pair',!workflow.canCommit),
      action('remove-endpoint',side==='photo'?'Remove photo point':'Remove model point'),
      action('cancel-draft','Cancel draft')
    ];
    if(target.kind==='saved'){
      const row=workflow.rows.find(r=>r.landmark.id===target.id);if(!row)return [];
      return [action('select','Select pair'),action('pivot','Set model orbit centre'),
        action('properties','Properties · weight: '+row.weight),
        action('role',row.included===false?'Use for fit':'Use for validation'),
        action('delete','Delete pair')];
    }
    return [action('undo','Undo',!workflow.undoStack.length),action('redo','Redo',!workflow.redoStack.length),
      action('cancel-draft','Cancel draft',workflow.mode==='browse'),
      action('fit-view',side==='photo'?'Fit photograph':'Reset model view'),
      ...(side==='model'?[action('reset-pivot','Reset orbit centre'),action('wireframe','Toggle wireframe'),
        action('owner','Inspect owner'),action('automatic','Automatic picking')]:[])];
  }
  function createContextMenu(doc,env,workspace){
    const menu=doc.createElement('div');
    menu.className='modern-calibration-context-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Correspondence actions');
    Object.assign(menu.style,{position:'fixed',zIndex:'10050',minWidth:'190px',maxWidth:'calc(100vw - 12px)',
      maxHeight:'calc(100vh - 12px)',overflowY:'auto',padding:'4px',background:'#fff',color:'#17212d',
      border:'1px solid #a8bdcd',borderRadius:'6px',boxShadow:'0 5px 20px #0003'});
    workspace.append(menu);
    let origin=null,buttons=[];
    function close(restoreFocus=false){
      if(menu.hidden)return;menu.hidden=true;menu.replaceChildren();buttons=[];
      const old=origin;origin=null;if(restoreFocus)old?.focus?.({preventScroll:true});
    }
    function open(point,items,run,source){
      close();if(!items.length)return false;origin=source;
      for(const item of items){
        const b=doc.createElement('button');b.type='button';b.textContent=item.label;b.disabled=item.disabled;
        b.setAttribute('role','menuitem');Object.assign(b.style,{display:'block',width:'100%',textAlign:'left',padding:'7px 10px'});
        b.addEventListener('pointerenter',event=>{if(!b.disabled&&event.pointerType!=='touch')b.focus({preventScroll:true});});
        b.onclick=()=>{if(b.disabled)return;close(true);run(item.id);};menu.append(b);buttons.push(b);
      }
      menu.style.left='0px';menu.style.top='0px';menu.hidden=false;
      const rect=menu.getBoundingClientRect();
      menu.style.left=Math.max(0,Math.min(point[0],env.innerWidth-rect.width-4))+'px';
      menu.style.top=Math.max(0,Math.min(point[1],env.innerHeight-rect.height-4))+'px';
      buttons.find(b=>!b.disabled)?.focus();return true;
    }
    menu.addEventListener('keydown',event=>{
      // Enter/Space activate the focused menu button, not the workspace's
      // global Enter-to-link or Delete/Undo shortcuts.
      event.stopPropagation();
      if(event.key==='Escape'||event.key==='Tab'){close(true);if(event.key==='Escape')event.preventDefault();event.stopPropagation();return;}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      const available=buttons.filter(b=>!b.disabled);if(!available.length)return;
      const i=available.indexOf(doc.activeElement),n=event.key==='Home'?0:event.key==='End'?available.length-1:
        (i+(event.key==='ArrowDown'?1:-1)+available.length)%available.length;
      event.preventDefault();event.stopPropagation();available[n].focus();
    });
    doc.addEventListener('pointerdown',event=>{if(!menu.hidden&&!menu.contains(event.target))close();},true);
    env.addEventListener('blur',()=>close());env.addEventListener('resize',()=>close());
    return {open,close,get visible(){return !menu.hidden;}};
  }
  // Preserve Worker diagnostics even when an invalid fit has no best camera.
  function fitProjectionFailures(rows,evaluation){
    const points=new Map((evaluation?.points||[]).map(p=>[p.id,p]));
    return rows.flatMap((r,i)=>{
      if(r.included===false)return [];
      const p=points.get(r.landmark.id);
      if(p&&Array.isArray(p.residual)&&p.residual.length===2&&p.residual.every(Number.isFinite))return [];
      return [{id:r.landmark.id,number:i+1,status:p?.status||"unavailable",reason:p?.reason||(!p?evaluation?.reason:null)||"No finite physical reprojection"}];
    });
  }
  // Disclosure defaults change with the route, never with individual picks.
  function calibrationDisclosures(stage){
    return {route:stage,manual:false,pairs:stage==='calibration'};
  }
  const CALIBRATION_STAGES=Object.freeze(["correspondences","calibration","result"]);
  function calibrationStageState(stage,hasFit=false,preferredCamera="best"){
    const current=CALIBRATION_STAGES.includes(stage)?stage:"correspondences";
    return {stage:current,editing:current==="correspondences",configuring:current==="calibration",results:current==="result",
      best:current==="result"&&!!hasFit&&preferredCamera!=="initial"};
  }
  let mounted=null;
  function mount(doc,sharedSelection=null){
    const $=id=>doc.getElementById(id),workspace=$('ModernPhotoCalibration');
    if(!workspace)return null;
    if(mounted){
      if(sharedSelection)mounted.configureSharedSelection(sharedSelection);
      return mounted;
    }
    const photo=$('ModernCalibrationPhoto'),sceneCanvas=$('ModernCalibrationMesh'),
      list=$('ModernCalibrationPairs'),status=$('ModernCalibrationStatus'),
      add=$('ModernCalibrationAdd'),weight=$('ModernCalibrationWeight'),px=$('ModernCalibrationX'),py=$('ModernCalibrationY');
    const ctx=photo.getContext('2d'),mesh=sceneCanvas.getContext('2d');
    const workflow=createPairWorkflow();
    let stage="correspondences",resultCamera="best",resultViews={initial:null,best:null};
    const editingStage=()=>stage==="correspondences",resultStage=()=>stage==="result";
    let scene=null,record=null,image=null,view=null,loadToken=0;
    let applyBusy=false,applyRevision=0,pendingPhotoLoads=0;
    const applyButton=$('ModernCalibrationApplyScene'),applyStatus=$('ModernCalibrationApplyStatus'),
      applyTarget=$('ModernCalibrationApplyTarget'),applyDescription=$('ModernCalibrationApplyDescription');
    let selectedApplyTarget='Scene';
    function syncApplyDestination(){
      const info=applyDestination(selectedApplyTarget);
      if(applyTarget)applyTarget.value=selectedApplyTarget;
      if(applyButton)applyButton.textContent=info.button;
      if(applyDescription)applyDescription.textContent=info.description;
    }
    if(applyTarget)applyTarget.onchange=()=>{
      if(applyBusy){syncApplyDestination();return;}
      if(['Scene','A','B'].includes(applyTarget.value)&&applyTarget.value!==selectedApplyTarget){
        selectedApplyTarget=applyTarget.value;applyRevision++;applyMessage('');
      }
      syncApplyDestination();
    };
    function applyMessage(value,error=false){
      if(!applyStatus)return;
      if(env.CurvatureModernStatusMessage?.set)env.CurvatureModernStatusMessage.set(applyStatus,value,error?'error':'info');
      else applyStatus.textContent=value;
    }
    function beginPhotoLoad(){pendingPhotoLoads++;applyRevision++;syncFitControls();}
    function endPhotoLoad(){pendingPhotoLoads--;syncFitControls();}
    const modelRaster=doc.createElement('canvas'),renderer=env.CurvatureCanvasDirectPreview.create(),
      modelStatus=$('ModernCalibrationModelStatus');
    let packages=new Map(),selectedObjectKey=null;
    const inlinePanel=$('ModernCalibrationInlinePanel'),inlineHost=$('ModernCalibrationInlineViewer'),
      resultPanel=$('ModernCalibrationResultModel');
    // Keep the physical canvas directly under its title. The same viewer
    // controls remain accessible on demand, without duplicating gesture UI.
    const viewTools=doc.createElement('details');viewTools.className='modern-calibration-disclosure';viewTools.id='ModernCalibrationViewTools';
    const viewSummary=doc.createElement('summary');viewSummary.textContent='Model view / picking settings';viewTools.append(viewSummary);
    for(const node of inlineHost.querySelectorAll('[data-viewer-scene-controls], [data-viewer-free-controls], [data-viewer-pick-controls]'))viewTools.append(node);
    inlineHost.append(viewTools);
    const autoOption=doc.createElement('option');autoOption.value='auto';autoOption.textContent='Automatic (Vertex / Edge / Surface)';
    inlineHost.querySelector('[data-viewer-pick-mode]').append(autoOption);
    const fastOption=doc.createElement('option');fastOption.value='fast-vertex';fastOption.textContent='Fast Vertex';
    inlineHost.querySelector('[data-viewer-pick-mode]').append(fastOption);
    const ownerOption=doc.createElement('option');ownerOption.value='owner';ownerOption.textContent='Owner Inspection';
    inlineHost.querySelector('[data-viewer-pick-mode]').append(ownerOption);
    const ownerInfo=doc.createElement('p');ownerInfo.setAttribute('data-viewer-owner-status','');ownerInfo.hidden=true;
    const ownerPrimitives=doc.createElement('select');ownerPrimitives.setAttribute('data-viewer-owner-list','');ownerPrimitives.setAttribute('aria-label','Selected owner primitives');ownerPrimitives.hidden=true;
    inlineHost.querySelector('[data-viewer-selection-status]').after(ownerInfo,ownerPrimitives);
    const pairAdd=$('ModernCalibrationBeginPair'),pairEdit=$('ModernCalibrationEditPair'),
      pairCancel=$('ModernCalibrationCancelEdit'),pairDelete=$('ModernCalibrationDeleteSelected'),
      pairUndo=$('ModernCalibrationUndo'),pairRedo=$('ModernCalibrationRedo'),pairPanel=$('ModernCalibrationPairToolbar');
    pairAdd.onclick=beginSharedAdd;pairEdit.onclick=()=>beginPairEdit(workflow.activePair);
    const inlineViewer=env.CurvatureModernLandmarkViewer.mount(inlineHost,saveInline,selectPair,{inline:true,onFastVertex:chooseInlineVertex,onDeleteCorrespondence:deletePair,onUndo:undo,onRedo:redo,onInspectOwner:selectInlineOwner,onCancelPair:cancelPairDraft,onConfirmMaterial:confirmInlineMaterial,onGesture:a=>viewportGesture(a,'model'),onMoveEndpoint:moveInlineEndpoint,orbitPreference:env.CurvatureModernApp?.calibrationOrbitPreferenceOwner?.()||null});
    let inlineSource=null,physicalSource=null,physicalFraming=null,renderingModel=false,disclosureRoute=null;
    const implicitRoute=()=>editingStage()&&!viewBest;
    const contextMenu=createContextMenu(doc,env,workspace);
    function viewportGesture(a,side){
      if(!record||!implicitRoute())return false;
      if(a.kind!=='context')return linkDraftGesture(workflow,a,savePair);
      const target=a.target,source=side==='photo'?photo:inlineHost.querySelector('canvas');
      return contextMenu.open(a.point,contextActions(workflow,target,side),id=>runContext(id,target,side,a.point),source);
    }
    function runContext(action,target,side,point){
      if(!record||!implicitRoute())return;
      const row=target.kind==='saved'?workflow.rows.find(r=>r.landmark.id===target.id):null;
      switch(action){
        case 'link':if(workflow.canCommit)savePair();break;
        case 'remove-endpoint':
          if(side==='photo')setPixel(null);
          else {inlineViewer.clearLocalPoint();workflow.selectModel(null);}
          refreshRows();updateHint();photoDraw();meshDraw();persist();break;
        case 'cancel-draft':cancelPairDraft();break;
        case 'select':if(row)selectPair(target.id);break;
        case 'pivot':if(row&&!inlineViewer.focusCorrespondence(target.id))message('Model point is not visible in this view.');persist();break;
        case 'properties':
          if(row){
            const value=env.prompt('Correspondence weight (positive number)',String(row.weight));
            if(value===null)break;
            const n=Number(value);
            if(!value.trim()||!Number.isFinite(n)||n<=0){message('Weight must be a positive number.');break;}
            if(n!==row.weight){workflow.change(workflow.rows.map(r=>r===row?{...r,weight:n}:r));finishEndpointChange();}
          }break;
        case 'role':if(row)setIncluded(target.id,row.included===false);break;
        case 'delete':if(row)deletePair(target.id);break;
        case 'undo':undo();break;
        case 'redo':redo();break;
        case 'fit-view':if(side==='photo')fitPhoto();else inlineViewer.resetScene();persist();break;
        case 'reset-pivot':inlineViewer.resetPivot();persist();break;
        case 'wireframe':inlineViewer.toggleWireframe();persist();break;
        case 'owner':inlineViewer.inspectAt(point);persist();break;
        case 'automatic':inlineViewer.activateAutomatic();persist();break;
      }
    }
    let physicalSessionId=null;
    const INLINE_KEY='curvature-calibration-inline-v2';
    let inlineSessions={initial:null},inlineRole=null,switchingInline=false;
    function captureInline(){
      if(restoring||switchingInline||!inlineSource||!inlineRole||!inlineViewer.isOpen())return;
      const session=inlineViewer.sessionSnapshot();
      if(session)inlineSessions[inlineRole]={source:JSON.stringify(inlineSource),session};
    }
    function saveInline(fromPersist=false){
      if(restoring||switchingInline||sharedPresentationHydrating||!physicalSessionId||!scene)return;
      try{
        captureInline();
        // Project views belong to their own IndexedDB checkpoint. Never
        // overwrite the retained single-draft inline session from a project.
        // A viewer-only gesture must also persist without requiring an
        // unrelated photo/toolbar event. Avoid recursion from persist().
        if(projectSession?.project()){
          if(!fromPersist){
            // The integrated viewer emits an unconditional sessionChanged()
            // on pagehide. That is not an edit: after the unload identity
            // checkpoint, do not create another durable Project revision.
            // Actual viewer gestures already save via onSessionChange.
            if(leavingPage)return;
            const saved=persist();
            if(saved)void saved.catch(()=>{});
          }
          return;
        }
        if(sharedSelection)return;
        env.localStorage.setItem(INLINE_KEY,JSON.stringify({id:physicalSessionId,photo:record?.id||null,sessions:inlineSessions}));
      }catch(error){/* Optional UI storage; project write failures are reported by persist(). */}
    }
    function readInline(){
      try{
        const saved=JSON.parse(env.localStorage.getItem(INLINE_KEY));
        if(saved?.id===physicalSessionId&&saved.photo===(record?.id||null))return {initial:saved.sessions?.initial||null};
      }catch(error){/* Invalid or unavailable UI state. */}
      return {initial:null};
    }
    function restoreInlineRole(role,source){
      const stored=inlineSessions[role];
      if(!stored)return;
      if(stored.source!==JSON.stringify(source)){inlineSessions[role]=null;return;}
      try{inlineViewer.restoreSession(stored.session);}
      catch(error){inlineSessions[role]=null;message('Stored model view discarded: '+error.message);}
    }
    function newPhysicalSession(){
      physicalSessionId=env.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
      inlineSessions={initial:null};inlineRole=null;
      // Retain historical inline recovery while editing a project.
      if(!sharedSelection&&!projectSession?.project())try{env.localStorage.removeItem(INLINE_KEY);env.localStorage.removeItem('curvature-calibration-magnifier-v1');env.localStorage.removeItem('curvature-landmark-viewer-window-v1');}catch(error){/* Optional UI storage. */}
    }
    let previewValid=false,photoGhost=null,initialProjectionKey=null;
    const identityRaster=doc.createElement('canvas');
    const sourcePicker=$('ModernCalibrationSource'),sourceStatus=$('ModernCalibrationSourceStatus'),
      sourceLoad=$('ModernCalibrationUsePhoto'),sourceRefresh=$('ModernCalibrationRefreshPhotos'),
      photoInfo=$('ModernCalibrationPhotoInfo');
    let choices=[],demoRecords=[],catalogToken=0,activeSource=null;
    const atmosphereControl=$('ModernCalibrationAtmosphere'),temperaturePanel=$('ModernCalibrationTemperatureProfile'),
      radiusStatus=$('ModernCalibrationEffectiveRadius');
    const temperatureControls={
      temperatureC:$('ModernCalibrationTemperatureC'),pressureHpa:$('ModernCalibrationPressureHpa'),
      gradientKPerKm:$('ModernCalibrationGradient')
    };
    const atmosphereApi=env.CurvatureOpticalEffectiveRadiusPreview,compareApi=env.CurvatureModernCompareState;
    function temperatureValues(physics){
      return {...compareApi.temperatureProfile(),...physics?.temperatureProfile};
    }
    function effectiveSupport(pose){
      if(!scene)return {supported:false,reason:'Capture a Globe scene first'};
      return atmosphereApi.canvasDirectSupport({...scene.model,...pose},scene.physics);
    }
    function syncHypothesis(){
      if(!atmosphereControl)return;
      const locked=!scene||restoring||pendingPhotoLoads>0||!!fitWorker||applyBusy;
      const physics=scene?.physics,profile=temperatureValues(physics);
      atmosphereControl.value=physics?.atmosphere||'vacuum';
      atmosphereControl.disabled=locked;
      temperaturePanel.hidden=atmosphereControl.value!=='temperature-lapse';
      for(const k of Object.keys(temperatureControls)){
        temperatureControls[k].value=String(profile[k]);temperatureControls[k].disabled=locked||temperaturePanel.hidden;
      }
      if(!scene){radiusStatus.textContent='Capture a Globe scene first.';return;}
      const initial=effectiveSupport(),best=fitBest?effectiveSupport(fitBest.pose):null;
      const km=n=>(n/1000).toLocaleString('en-US',{maximumFractionDigits:3});
      const describe=(label,s)=>s.supported?label+' effective R: '+km(s.parameters.effectiveRadius)+
        ' km · k = '+Number(s.parameters.k.toPrecision(6)):label+' unsupported: '+s.reason;
      radiusStatus.textContent='Physical R: '+km(scene.model.rEarth)+' km · '+describe('Initial',initial)+
        (best?' · '+describe('Best',best):'')+'. Local approximation, not Accurate ray tracing.';
    }
    function changeHypothesis(){
      if(!scene||restoring||pendingPhotoLoads||fitWorker||applyBusy){syncHypothesis();return;}
      try{
        const kind=atmosphereControl.value;
        if(!['vacuum','standard','temperature-lapse'].includes(kind))throw Error('Unsupported calibration atmosphere');
        const original=scene.physics,profile=temperatureValues(original);
        if(kind==='temperature-lapse'){
          // Selecting Temperature gradient enables existing/default values;
          // individual inputs commit on change, never coerce blank to zero.
          for(const [k,node] of Object.entries(temperatureControls)){
            if(!node.value.trim()||!node.validity.valid||!Number.isFinite(node.valueAsNumber))throw Error('Invalid '+k);
            profile[k]=node.valueAsNumber;
          }
        }
        const nextProfile=compareApi.temperatureProfile(profile);
        if(kind===original.atmosphere&&
          (kind!=='temperature-lapse'||JSON.stringify(nextProfile)===JSON.stringify(temperatureValues(original)))){
          syncHypothesis();return;
        }
        if(fitBest&&!env.confirm('Changing the atmosphere invalidates the current best camera. Previously archived results remain available. Export this result first if you want to retain an unarchived fit. Continue?')){
          syncHypothesis();return;
        }
        // Do not replace banks, workflow, initial pose, physical session or photo.
        // Repaint method-specific geometry and invalidate cached residuals/fit.
        scene={...scene,physics:{...original,atmosphere:kind,temperatureProfile:nextProfile}};
        $('ModernCalibrationScene').textContent=(scene.model.DemoText||'Current scene')+' · Globe · '+kind;
        renderModel();
        setStage('calibration',{camera:'initial',save:false});
        fitStatus.textContent='Atmosphere changed. Correspondences retained; run calibration again.';
        syncFitControls();persist();
      }catch(error){syncHypothesis();fitStatus.textContent='Atmosphere not changed: '+error.message;}
    }
    if(atmosphereControl){
      atmosphereControl.addEventListener('change',changeHypothesis);
      for(const node of Object.values(temperatureControls))node.addEventListener('change',changeHypothesis);
    }
    const fitFields=CAMERA_FIELDS,fitLabels=["East (m)","North (m)","Height (m)","Pan (°)","Nick (°)","Roll (°)","Focal field (mm)"];
    const fitPanel=$('ModernCalibrationFitParameters'),runFit=$('ModernCalibrationRunFit'),stopFit=$('ModernCalibrationStopFit'),bestView=$('ModernCalibrationBestView'),fitStatus=$('ModernCalibrationFitStatus'),fitResult=$('ModernCalibrationFitResult');
    const exportButton=$('ModernCalibrationExportExperiment'),importButton=$('ModernCalibrationImportExperiment'),importFile=$('ModernCalibrationExperimentFile'),exchangeStatus=$('ModernCalibrationExchangeStatus');
    const residualMode=$('ModernCalibrationResidualMode'),residualPanel=$('ModernCalibrationResidualPanel'),
      residualList=$('ModernCalibrationResidualRows'),residualNotice=$('ModernCalibrationResidualNotice');
    let initialPoints=null,initialProjectionError='',residualData=[],diagnosticResult=null,diagnosticBestPoints=[],fitFailures=[];
    const fitRaster=doc.createElement('canvas');let fitWorker=null,fitBest=null,fitSignature=null,viewBest=false,paintedFit=null,lastFitPaint=0;
    const stageButtons=Array.from(workspace.querySelectorAll("[data-calibration-stage]"));
    const stagePanels=Array.from(workspace.querySelectorAll("[data-calibration-stages]"));
    const manualPairs=$('ModernCalibrationManualPairs'),pairList=$('ModernCalibrationPairList'),referenceTools=$('ModernCalibrationReferenceTools');
    function syncDisclosures(){
      const next=calibrationDisclosures(stage);
      if(next.route===disclosureRoute)return;
      disclosureRoute=next.route;manualPairs.open=next.manual;pairList.open=next.pairs||fitFailures.length>0;
    }
    function syncStageUI(){
      syncDisclosures();
      $('ModernCalibrationStageHint').hidden=editingStage();
      workspace.dataset.calibrationStage=stage;
      for(const b of stageButtons){if(b.dataset.calibrationStage===stage)b.setAttribute("aria-current","step");else b.removeAttribute("aria-current");}
      for(const panel of stagePanels)panel.hidden=!panel.dataset.calibrationStages.split(" ").includes(stage);
      $("ModernCalibrationStageHint").textContent=editingStage()?"Match and edit photo/model points.":stage==="calibration"?"Choose free parameters and Fit / Validation roles, then run calibration.":fitBest?"Compare initial and fitted optical cameras and inspect residuals.":"Initial optical camera · run calibration to obtain a fitted result.";
      $("ModernCalibrationResultCamera").textContent=viewBest?"Best camera":"Initial camera";
      $("ModernCalibrationOpticalTitle").textContent=resultStage()?(viewBest?"Model · Best Camera":"Model · Initial Camera"):"Model · Canvas Direct";
      residualPanel.hidden=!resultStage()||!fitBest;
      inlinePanel.hidden=!editingStage();resultPanel.hidden=!resultStage();
    }
    function setStage(next,{camera=resultCamera,save=true,render=true}={}){
      const target=calibrationStageState(next,!!fitBest,camera);
      if(target.stage!==stage&&render){
        contextMenu.close();photoGestures.cancel();resultGestures.cancel();inlineViewer.cancelGesture();
        photoGhost=null;captureInline();
      }
      if(target.stage!==stage)applyRevision++;
      stage=target.stage;resultCamera=camera==="initial"?"initial":"best";viewBest=target.best;
      syncStageUI();if(!render)return;
      if(viewBest&&paintedFit!==fitBest)paintBest();else meshDraw();
      if(editingStage()){if(inlineViewer.isOpen())inlineViewer.refresh();refreshPhysicalCorrespondences();}
      syncFitControls();photoDraw();if(save)persist();
    }
    for(const b of stageButtons)b.onclick=()=>setStage(b.dataset.calibrationStage);
    // IndexedDB keeps original images out of the small localStorage quota.
    // A single atomic record binds the photograph to its fixed scene and pairs.
    let restoring=false,blockedFlatDraft=false,writeQueue=Promise.resolve(),dbPromise=null;
    // No project is activated at startup by merely inspecting migration readiness.
    // The legacy draft remains writable until guarded activation is qualified.
    let projectStartupStatus={status:'uninspected'};
    // No project owns the live editor until an explicit, fully qualified open.
    let projectSession=null,projectSwitchBusy=false,projectSwitchEpoch=0;
    let editorMutation=0,switchInterference=false,sharedInput=null,sharedWrite=null,sharedPresentationHydrating=false;
    function coordinateLegacyIDB(operation){
      const storage=env.CurvatureModernCalibrationProjectStore;
      if(storage?.coordinateIDB)return storage.coordinateIDB(operation);
      if(env.navigator?.locks)return Promise.reject(Error('Calibration write barrier unavailable'));
      return operation();
    }
    function database(){
      return dbPromise||coordinateLegacyIDB(databaseRaw);
    }
    function databaseRaw(){
      if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
        // Opening without a fixed version also supports the project-store v2
        // schema after an independently verified legacy adoption.
        const request=env.indexedDB.open('curvature-photo-calibration');
        let blocked=false;
        request.onupgradeneeded=()=>{
          if(blocked){request.transaction.abort();return;}
          const db=request.result;
          if(!db.objectStoreNames.contains('draft'))db.createObjectStore('draft');
        };
        request.onsuccess=()=>{
          const db=request.result;
          if(blocked){db.close();return;}
          db.onversionchange=()=>{db.close();dbPromise=null;};
          resolve(db);
        };
        request.onerror=()=>{if(!blocked)dbPromise=null;reject(request.error);};
        request.onblocked=()=>{blocked=true;dbPromise=null;reject(Error('Calibration storage blocked'));};
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
    async function inspectProjectStartup(){
      const migration=env.CurvatureModernCalibrationProjectMigration;
      if(!migration)return {status:'unavailable'};
      if(restoring)throw Error('Calibration draft restoration is unfinished');
      // Never race the old editor's write queue with an IndexedDB upgrade.
      await writeQueue;
      const db=await database();
      db.close();dbPromise=null;
      // Read-only classification of existing state. This does not call
      // migrate(), bind a new project, replace the editor, or delete raw data.
      const result=await migration.inspect(env);
      projectStartupStatus=result;
      if(result.status==='recovery-required')
        $('ModernCalibrationStorage').textContent=
          'Calibration recovery required; original draft retained: '+result.reason;
      return result;
    }
    function captureDraftState(){
      // The same byte-for-byte v2 checkpoint serves the existing legacy
      // autosave and future verified multi-project extraction.
      if(!scene)return null;
      return JSON.parse(JSON.stringify({version:2,scene:{model:scene.model,physics:scene.physics},
        record,activeSource,rows:workflow.rows,pending:workflow.pending,pendingModel:workflow.pendingModel,activePair:workflow.activePair,editing:workflow.editing,explicitAdd:workflow.explicitAdd,view,physicalSessionId,undoStack:workflow.undoStack,redoStack:workflow.redoStack,
        selectedOwner:packages.get(selectedObjectKey)?.owner||null,weight:weight.value,freeParameters:freeFields(),
        fitBest,fitStatus:fitStatus.textContent,viewBest,stage,resultCamera,resultViews,residualMode:residualMode.value}));
    }
    function captureInlineState(){
      captureInline();
      return physicalSessionId?jsonCopy({id:physicalSessionId,photo:record?.id||null,
        sessions:inlineSessions}):null;
    }
    async function captureProjectCheckpoint(){
      if(!scene||restoring||pendingPhotoLoads||fitWorker||applyBusy)
        throw Error('Stop pending calibration operations before capturing a project');
      const helper=env.CurvatureModernCalibrationProjectCheckpoint;
      if(!helper)throw Error('Calibration Project checkpoint helper unavailable');
      // Explicit opt-in: this stages a verified image in the independent
      // Library but never changes the active draft or creates a project.
      return helper.captureVerified(captureDraftState(),captureInlineState(),env);
    }
    async function prepareProjectCheckpoint(project){
      const helper=env.CurvatureModernCalibrationProjectCheckpoint;
      if(!helper)throw Error('Calibration Project checkpoint helper unavailable');
      // Validation/decode only; project activation and its generations
      // belong to 8F.7p.5. Never replace current editor on failed prepare.
      return helper.prepare(project,env);
    }
    // Project cards begin with compact metadata. Verified preview images are
    // resolved lazily from the independent Reference Image Library, not from
    // the project checkpoint or from a second photo store.
    const projectsToggle=$('ModernCalibrationProjectsToggle'),
      projectsDisclosure=$('ModernCalibrationProjectsDisclosure'),
      projectsPanel=$('ModernCalibrationProjectsPanel'),
      projectsRefresh=$('ModernCalibrationProjectsRefresh'),
      projectsSave=$('ModernCalibrationProjectsSave'),
      projectsNew=$('ModernCalibrationProjectsNew'),
      projectsSaveDraft=$('ModernCalibrationProjectsSaveDraft'),
      projectsImport=$('ModernCalibrationProjectsImport'),
      projectsImportFile=$('ModernCalibrationProjectsImportFile'),
      projectsAdopt=$('ModernCalibrationProjectsAdopt'),
      projectsLegacy=$('ModernCalibrationProjectsLegacy'),
      projectsStatus=$('ModernCalibrationProjectsStatus'),
      projectsList=$('ModernCalibrationProjectsList');
    const LAST_PROJECT_KEY='curvature-calibration-last-opened-project-v1';
    const DELETED_PROJECT_HANDOFF_KEY='curvature-calibration-deleted-project-handoff-v1';
    const PREVIOUS_PROJECT_KEY='curvature-calibration-previous-opened-project-v1';
    const RELOAD_PROJECT_KEY='curvature-calibration-clean-reload-project-v1';
    // A clean, acknowledged project may be restored after reload. Keep only
    // identity in sessionStorage; unsaved or failed writes must not auto-bind.
    let leavingPage=false;
    function rememberCleanProjectState(state){
      if(sharedSelection)return;
      try{
        if(state?.projectId&&!state.unsaved&&!state.pending&&!state.error)
          env.sessionStorage?.setItem(RELOAD_PROJECT_KEY,state.projectId);
        else env.sessionStorage?.removeItem(RELOAD_PROJECT_KEY);
      }catch(_ignored){/* Optional session identity, never photo bytes. */}
    }
    // Record the last durable state before viewer pagehide listeners can
    // synthesize another autosave. The unload event must not erase a clean
    // marker through a late in-flight, unrelated viewer snapshot.
    function markCleanProjectOnLeave(){
      if(leavingPage)return;
      // beforeunload runs before the viewer's pagehide autosave; the latter
      // must not revoke a previously acknowledged project on ordinary F5.
      rememberCleanProjectState(projectSession?.state());
      leavingPage=true;
    }
    env.addEventListener('beforeunload',markCleanProjectOnLeave,true);
    env.addEventListener('pagehide',markCleanProjectOnLeave,true);
    function rememberPreviousProject(previous,opened){
      if(sharedSelection||!previous||previous===opened)return;
      try{env.sessionStorage?.setItem(PREVIOUS_PROJECT_KEY,previous);}catch(_ignored){}
    }
    // A single explicit Delete may request exactly one startup handoff.
    // Never auto-open an arbitrary last-used project on an ordinary F5.
    let deletedProjectHandoff=null;
    try{if(!sharedSelection)deletedProjectHandoff=env.sessionStorage?.getItem(DELETED_PROJECT_HANDOFF_KEY)??null;}
    catch(_ignored){/* Optional handoff storage. */}
    let projectRows=[],projectListBusy=false,projectListToken=0,projectInspection=null;
    // A UI-only selection, deliberately independent of the active project.
    // Never persist this into the editor draft or the project summary.
    let projectSelectedId=null;
    function selectProjectCard(id){
      if(projectListBusy)return;
      projectSelectedId=id;
      for(const card of projectsList.querySelectorAll('[data-calibration-project-id]')){
        const selected=card.dataset.calibrationProjectId===id;
        card.classList.toggle('is-selected',selected);
        card.setAttribute('aria-label',(selected?'Selected calibration: ':'Calibration: ')+
          (card.dataset.projectTitle||'')+
          (card.dataset.projectActive==='true'?'. Currently opened for editing.':
            '. Open or double-click to edit.'));
      }
    }
    function projectCardControl(event,card){
      for(let target=event.target;target&&target!==card;target=target.parentNode)
        if(/^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(String(target.tagName||'').toUpperCase()))
          return true;
      return false;
    }
    // In-memory previews are UI-only. An unavailable original is a visible
    // placeholder, not an error that prevents listing/opening the project.
    const projectPreviews=new Map();
    // Reuse Animation Library's explicit card-details dialog. Read-only and
    // backed only by already loaded project summaries and verified photo previews.
    function projectInspectorMarkup(doc,entry){
      const inner=doc.createElement('div');inner.className='modern-history-inspector-inner modern-calibration-inspector-inner';
      const title=doc.createElement('strong');title.className='modern-history-inspector-title';
      title.textContent=entry.title;inner.append(title);
      inner.append(projectPreview(entry.photo));
      const columns=doc.createElement('div');columns.className='modern-history-inspector-columns';
      const section=doc.createElement('section');section.className='modern-history-inspector-column';
      const heading=doc.createElement('strong');heading.className='modern-history-inspector-heading';
      heading.textContent='Calibration project';section.append(heading);
      function row(label,value){
        const line=doc.createElement('div');line.className='modern-history-inspector-row';
        const name=doc.createElement('span');name.textContent=label;
        const detail=doc.createElement('strong');detail.textContent=String(value);
        line.append(name,detail);section.append(line);
      }
      row('Reference photo',entry.photo?entry.photo.width+' × '+entry.photo.height+' px':'None');
      row('Correspondences',entry.rowCount);
      row('Fit status',entry.fitStatus||'Not yet fitted');
      row('Fit RMS',entry.fitRmsPx===null?'Not available':
        Number(entry.fitRmsPx.toPrecision(3))+' px');
      row('Linked archived results',entry.resultCount);
      row('Revision',entry.revision);
      row('Updated',projectStamp(entry.updatedAt));
      if(entry.forkOf)row('Origin','Conflict copy');
      columns.append(section);inner.append(columns);
      const note=doc.createElement('p');note.className='modern-history-inspector-description';
      note.textContent='Read-only details. Open the project to edit it.';
      inner.append(note);
      return inner;
    }
    const projectInspector=env.CurvatureModernThumbnailPreview?.create(
      doc,projectsList,projectInspectorMarkup,
      {className:'modern-calibration-project-inspector'})||null;
    function photoPreviewKey(photo){return photo?.sha256||null;}
    function projectPreview(photo){
      const key=photoPreviewKey(photo);
      const figure=doc.createElement('div');
      figure.className='modern-animation-library-visual modern-calibration-project-preview';
      if(!key){figure.textContent='No reference photo';return figure;}
      const preview=projectPreviews.get(key);
      if(preview){
        const img=doc.createElement('img');img.src=preview;
        img.alt='Reference photograph';img.loading='lazy';
        figure.append(img);
      }else figure.textContent=projectPreviews.has(key)?
        'Photograph unavailable':'Loading photograph…';
      return figure;
    }
    async function fetchProjectPreviews(token){
      const library=env.CurvatureModernReferenceImageLibrary,
        importer=env.CurvatureModernReferenceImageImport;
      if(!library?.findOriginal||!importer?.verifyOriginal)return;
      // Resolve each content identity only once; no original bytes enter
      // project rows, preference storage or any other persistent cache.
      const photos=new Map(projectRows.filter(row=>row.photo).map(row=>
        [photoPreviewKey(row.photo),row.photo]));
      const pending=[...photos].filter(([key])=>!projectPreviews.has(key));
      // Independently verified images can load concurrently, with a bounded
      // worker count rather than waiting for every prior full photo decode.
      let cursor=0;
      async function worker(){
        while(cursor<pending.length){
          if(token!==projectListToken||projectsPanel.hidden)return;
          const [key,identity]=pending[cursor++];
          let preview=null;
        try{
          const found=await library.findOriginal(env.indexedDB,identity,env.crypto,
            original=>importer.verifyOriginal(original,env));
          if(found){
            if(found.record.thumbnail){
              await importer.verify(found.record,env);
              preview=found.record.thumbnail.dataUrl;
            }else{
              // Older observations may have no thumbnail. Generate a small
              // display-only raster; never store the copy in IndexedDB.
              const photo=new env.Image();photo.src=found.record.original.dataUrl;
              await photo.decode();
              const canvas=doc.createElement('canvas');
              const scale=Math.min(1,320/Math.max(photo.naturalWidth,photo.naturalHeight));
              canvas.width=Math.max(1,Math.round(photo.naturalWidth*scale));
              canvas.height=Math.max(1,Math.round(photo.naturalHeight*scale));
              const context=canvas.getContext('2d');
              if(context){context.drawImage(photo,0,0,canvas.width,canvas.height);
                preview=canvas.toDataURL('image/jpeg',.72);}
              canvas.width=canvas.height=0;
            }
          }
        }catch(error){env.console?.warn?.('Calibration Project preview unavailable:',error);}
          if(token!==projectListToken||projectsPanel.hidden)return;
          projectPreviews.set(key,preview);
          renderProjects();
        }
      }
      await Promise.all(Array.from({length:Math.min(3,pending.length)},()=>worker()));
    }
    function projectsMessage(text,error=false){
      projectsStatus.textContent=text;
      projectsStatus.classList.toggle('is-error',error);
    }
    function projectsControls(){
      const save=projectSession?.state();
      const needsSave=!!save?.projectId&&(save.unsaved||!!save.error||save.pending>0);
      projectsSave.hidden=!needsSave;
      projectsSave.disabled=projectListBusy||!save?.unsaved||save.pending>0;
      projectsSave.textContent=save?.pending>0?'Saving…':save?.error?'Retry save':'Save now';
      projectsToggle.setAttribute('aria-expanded',String(!projectsPanel.hidden));
      projectsRefresh.disabled=projectListBusy;
      projectsAdopt.disabled=projectListBusy||!!projectSession?.project()&&!!sharedSelection||
        !!sharedSelection&&!sharedSelection.canAdoptLegacy?.();
      projectsNew.disabled=projectListBusy;
      projectsSaveDraft.hidden=!!projectSession?.project()||!scene||!record;
      projectsSaveDraft.disabled=projectListBusy||restoring||!!pendingPhotoLoads||
        !!fitWorker||applyBusy||projectSwitchBusy;
      projectsImport.disabled=projectListBusy;
    }
    function projectStamp(ts){
      return Number.isSafeInteger(ts)?new Date(ts).toLocaleString():'Unknown time';
    }
    function projectRow(entry){
      const state=projectSession?.state();
      const active=state?.projectId===entry.id,unsaved=active&&state.unsaved,
        selected=projectSelectedId===entry.id;
      const card=doc.createElement('article');
      card.className='modern-animation-library-card modern-calibration-project-card'+
        (selected?' is-selected':'')+(active?' is-editing':'');
      card.dataset.calibrationProjectId=entry.id;
      card.dataset.projectTitle=entry.title;
      card.dataset.projectActive=String(active);
      card.dataset.projectUnsaved=String(!!unsaved);
      card.tabIndex=0;
      card.setAttribute('role','group');
      card.setAttribute('aria-label',(selected?'Selected calibration: ':'Calibration: ')+entry.title+
        (active?'. Currently opened for editing.':'. Open or double-click to edit.'));
      card.addEventListener('click',event=>{
        if(!projectCardControl(event,card))selectProjectCard(entry.id);
      });
      card.addEventListener('dblclick',event=>{
        if(!active&&!projectCardControl(event,card)&&!projectListBusy)void openFromProjects(entry.id);
      });
      card.addEventListener('keydown',event=>{
        if(projectCardControl(event,card))return;
        if(event.key==='Enter'&&!projectListBusy&&!active){
          event.preventDefault();void openFromProjects(entry.id);
        }else if(event.key===' '||event.key==='Spacebar'){
          event.preventDefault();selectProjectCard(entry.id);
        }
      });
      card.append(projectPreview(entry.photo));
      const info=doc.createElement('div');
      info.className='modern-animation-library-card-info';
      const name=doc.createElement('strong');
      name.className='modern-animation-library-card-title';
      name.textContent=entry.title;name.title=entry.title;
      info.append(name);
      const badges=doc.createElement('div');
      badges.className='modern-animation-library-card-status';
      const selection=doc.createElement('span');
      selection.className='modern-animation-library-status-selected';
      selection.textContent='Selected';
      badges.append(selection);
      if(active){
        const opened=doc.createElement('span');
        opened.className='modern-animation-library-status-editing';
        opened.textContent='Opened';
        badges.append(opened);
      }else if(entry.forkOf){
        const fork=doc.createElement('span');
        fork.className='modern-calibration-project-fork';
        fork.textContent='Conflict copy';
        badges.append(fork);
      }
      info.append(badges);
      function detail(value,klass,tooltip){
        const element=doc.createElement('small');
        element.className=klass;
        element.textContent=value;
        if(tooltip)element.title=tooltip;
        info.append(element);
        return element;
      }
      detail(entry.rowCount+' correspondences · '+
        (entry.photo?entry.photo.width+' × '+entry.photo.height+' px':'No reference photo'),
        'modern-animation-library-card-meta');
      const fit=entry.fitRmsPx!==null?
        'Fit: '+(entry.fitStatus?entry.fitStatus.split(' · ')[0]:'result')+
          ' · RMS '+Number(entry.fitRmsPx.toPrecision(3))+' px':
        'Fit: '+(entry.fitStatus||'Not yet fitted');
      detail(fit,'modern-animation-library-card-summary modern-calibration-project-fit',
        entry.fitStatus||'');
      if(entry.resultCount>0)detail(entry.resultCount+' linked archived result'+
        (entry.resultCount===1?'':'s'),'modern-animation-library-card-summary');
      detail('Updated '+projectStamp(entry.updatedAt),
        'modern-animation-library-card-updated');
      if(active&&state&&(state.error||unsaved||state.pending))
        detail(state.error?'Unsaved — '+state.error:unsaved?'Unsaved changes':'Saving…',
          'modern-calibration-project-warning');
      card.append(info);
      const actions=doc.createElement('div');
      actions.className='modern-animation-library-card-actions modern-calibration-project-actions';
      function action(label,key,callback,disabled=false){
        const button=doc.createElement('button');button.type='button';
        button.textContent=label;button.dataset[key]=entry.id;
        button.disabled=projectListBusy||disabled;
        button.onclick=event=>{event.stopPropagation();void callback(entry);};
        actions.append(button);return button;
      }
      // The opened project is already being edited; reopening it is neither
      // useful nor safe while its live checkpoint may be changing.
      if(!active)action('Open','calibrationProjectOpen',()=>openFromProjects(entry.id));
      action('Rename','calibrationProjectRename',renameFromProjects,!!sharedSelection&&
        (active?(unsaved||!!state?.pending||!!state?.error):
          !sharedSelection.canRenameUnselected?.(entry.id)));
      action('Duplicate','calibrationProjectDuplicate',duplicateFromProjects);
      card.append(actions);
      const deletion=doc.createElement('button');
      deletion.type='button';
      deletion.className='modern-animation-library-delete modern-card-delete';
      deletion.dataset.calibrationProjectDelete=entry.id;
      deletion.disabled=projectListBusy;
      if(sharedSelection&&(active&&(unsaved||state?.pending||state?.error)||!sharedSelection.remove)){
        deletion.disabled=true;deletion.title='Resolve pending work before deleting this project';
      }
      deletion.setAttribute('aria-label','Delete calibration '+entry.title);
      if(!sharedSelection||!deletion.disabled)deletion.title=active?'Delete the currently opened calibration project':
        'Delete calibration '+entry.title;
      deletion.onclick=event=>{event.stopPropagation();void deleteFromProjects(entry);};
      ['pointerdown','mousedown','dblclick','dragstart'].forEach(type=>
        deletion.addEventListener(type,event=>{
          event.stopPropagation();
          if(type==='mousedown'||type==='dragstart')event.preventDefault();
        }));
      card.append(deletion);
      if(projectInspector)projectInspector.infoButton(card,entry,card,entry.title);
      return card;
    }
    function renderProjects(){
      projectInspector?.hide();
      projectsList.replaceChildren(...projectRows.map(projectRow));
      if(!projectRows.length){
        const empty=doc.createElement('p');
        empty.textContent='No saved Calibration Projects yet. Your current editor draft remains separate and untouched.';
        projectsList.append(empty);
      }
      projectsLegacy.hidden=projectInspection?.status!=='legacy-pending';
      const state=projectSession?.state();
      // A generic library count may be replaced with editor context, but
      // never erase an explicit operation result (Adopt, Delete, Import,
      // failed Open, etc.) during the final card rerender.
      if(state?.projectId&&!state.pending&&!state.unsaved&&!state.error&&
         !projectListBusy&&!projectsStatus.classList.contains('is-error')&&
         /^(?:\d+ saved Calibration Project|Current editor: standalone draft|Opened Calibration Project:)/.test(
           projectsStatus.textContent))
        projectsMessage('Opened Calibration Project: '+projectSession.project().title+'.');
      if(!state?.projectId&&!projectListBusy&&projectInspection?.status!=='recovery-required'&&
          !projectsStatus.classList.contains('is-error')&&
          /^(?:\d+ saved Calibration Project|Current editor: standalone draft)/.test(
            projectsStatus.textContent))
        projectsMessage('Current editor: standalone draft (no saved Calibration Project is open).');
      if(state?.pending>0)projectsMessage('Saving active Calibration Project…');
      else if(state?.error)projectsMessage('Save failed: '+state.error+'. Use Retry save before switching projects.',true);
      else if(state?.unsaved)projectsMessage('Active project has unsaved changes. Use Save now before switching projects.',true);
      else if(state?.projectId&&projectsStatus.dataset.saveNotice==='active'){
        projectsMessage('Calibration Project saved in this browser.');
        delete projectsStatus.dataset.saveNotice;
      }
      else if(!projectListBusy&&projectInspection?.status==='recovery-required')
        projectsMessage('Existing draft needs recovery: '+projectInspection.reason+
          '. The original was not modified.',true);
      projectsControls();
    }
    async function refreshProjectList(){
      const token=++projectListToken,storage=env.CurvatureModernCalibrationProjectStore,
        migration=env.CurvatureModernCalibrationProjectMigration;
      if(!storage||!migration){projectsMessage('Calibration Projects storage unavailable.',true);return;}
      projectsMessage('Reading saved project metadata…');
      projectsRefresh.disabled=true;
      try{
        const [rows,inspection]=await Promise.all([
          storage.list(env.indexedDB),migration.inspect(env)
        ]);
        if(token!==projectListToken||projectsPanel.hidden)return;
        projectRows=rows;
        if(projectSelectedId&&!rows.some(row=>row.id===projectSelectedId))projectSelectedId=null;
        // Initially select the opened project; later card selections stay independent.
        if(!projectSelectedId){
          const openedId=projectSession?.state()?.projectId;
          if(rows.some(row=>row.id===openedId))projectSelectedId=openedId;
        }
        projectInspection=inspection;
        projectsMessage(rows.length+' saved Calibration Project'+(rows.length===1?'':'s')+'.');
        renderProjects();
        void fetchProjectPreviews(token);
      }catch(error){
        if(token===projectListToken&&!projectsPanel.hidden)
          projectsMessage('Cannot load projects: '+error.message+'. Current work is unchanged.',true);
      }finally{if(token===projectListToken)projectsControls();}
    }
    function showProjectList(open,hydrating){
      const libraryOnly=!!sharedSelection&&!projectSession?.project();
      if(libraryOnly){open=true;hydrating=true;}
      if(projectListBusy){
        projectsDisclosure.open=!projectsPanel.hidden;
        return;
      }
      const changed=projectsPanel.hidden===open;
      projectsDisclosure.open=open;
      projectsPanel.hidden=!open;
      if(!open)projectInspector?.hide();
      if(!hydrating&&(!sharedSelection||changed))env.CurvatureModernApp?.rememberCalibrationView?.(open?'projects':'editor');
      projectsControls();
      if(!changed)return;
      if(open)void refreshProjectList();
      else ++projectListToken;
    }
    function selectPresentationView(view){
      // Hydrate presentation only; never activate or select a saved project.
      if(!['editor','projects'].includes(view)||projectListBusy)return false;
      showProjectList(view==='projects',true);
      return true;
    }
    async function openFromProjects(id){
      if(projectListBusy)return;
      projectListBusy=true;renderProjects();
      projectsMessage('Saving current work and verifying the selected project…');
      try{
        const previous=projectSession?.state()?.projectId;
        const outcome=await openCalibrationProject(id);
        rememberPreviousProject(previous,outcome.project.id);
        projectSelectedId=outcome.project.id;
        try{if(!sharedSelection)env.sessionStorage?.setItem(LAST_PROJECT_KEY,outcome.project.id);}
        catch(_ignored){/* Session selection is optional. Never store photo bytes. */}
        // The caller must leave the library after a successful activation;
        // do not hide the editor on any failed validation or save.
        projectListBusy=false;
        showProjectList(false);
      }catch(error){
        projectsMessage('Cannot open project: '+error.message+'. The current editor was retained.',true);
      }finally{projectListBusy=false;renderProjects();}
    }
    async function adoptFromProjects(){
      if(projectListBusy)return;
      projectListBusy=true;renderProjects();
      projectsMessage('Verifying and adopting existing draft; the original will be retained…');
      try{
        const saved=await adoptLegacyCalibrationDraft();
        projectListBusy=false;
        await refreshProjectList();
        projectsMessage('Existing draft adopted as '+saved.title+'. Choose Open to activate it.');
      }catch(error){
        projectsMessage('Adoption failed: '+error.message+'. The original draft was retained.',true);
      }finally{projectListBusy=false;renderProjects();}
    }
    function projectActions(){
      const actions=env.CurvatureModernCalibrationProjectActions;
      const storage=env.CurvatureModernCalibrationProjectStore;
      if(!actions||!storage)throw Error('Calibration Project actions unavailable');
      return {actions,storage};
    }
    function projectActionMessage(error,prefix){
      projectsMessage(prefix+': '+error.message+'. Active work was not replaced.',true);
    }
    async function newFromProjects(){
      if(projectListBusy)return;
      const title=env.prompt('Name of the new Calibration Project','Untitled calibration');
      if(title===null)return;
      projectListBusy=true;renderProjects();
      projectsMessage('Creating a new Calibration Project from the current Scene…');
      try{
        const {actions}=projectActions();
        const snapshot=env.CurvatureModernApp.getPhotoCalibrationScene();
        prepareScene(snapshot); // Explicit Globe / supported-atmosphere preflight.
        const created=await actions.createNew(env,snapshot,{title:title.trim()});
        try{
          const previous=projectSession?.state()?.projectId;
          const opened=await openCalibrationProject(created.id);
          rememberPreviousProject(previous,opened.project.id);
          projectSelectedId=opened.project.id;
          try{if(!sharedSelection)env.sessionStorage?.setItem(LAST_PROJECT_KEY,opened.project.id);}catch(_ignored){}
          projectListBusy=false;showProjectList(false);
        }catch(error){
          await refreshProjectList();
          throw Error('Project '+created.title+' was created, but opening failed: '+error.message);
        }
      }catch(error){projectActionMessage(error,'New failed');}
      finally{projectListBusy=false;renderProjects();}
    }
    async function saveCurrentDraftAsNew(){
      if(projectListBusy||!scene||!record||projectSession?.project())return;
      if(restoring||projectSwitchBusy||fitWorker||applyBusy||pendingPhotoLoads||
         photoGestures.active||resultGestures.active){
        projectsMessage('Finish fitting, loading or editing before saving this draft.',true);
        return;
      }
      const title=env.prompt('Save current standalone calibration as a new project',
        (record.title||'Recovered calibration').slice(0,160));
      if(title===null)return;
      projectListBusy=true;renderProjects();
      projectsMessage('Verifying the complete draft and saving as a new Calibration Project…');
      try{
        // Capture synchronously, before asynchronous photo/storage operations.
        const source=captureDraftState(),inline=captureInlineState();
        const capturedMutation=editorMutation;
        const {actions}=projectActions();
        const created=await actions.saveDraftAsNew(env,source,inline,{title:title.trim()});
        // Never replace the source editor; Open is a separate guarded action.
        projectSelectedId=created.id;
        projectListBusy=false;
        await refreshProjectList();
        projectsMessage('Saved "'+created.title+'" as a separate verified project. '+
          (editorMutation!==capturedMutation?'Current editor changed during saving; ':
            'Current standalone draft was retained; ')+
          'choose Open on the new card to edit the saved copy.');
      }catch(error){projectsMessage('Save current draft failed: '+error.message+
        '. Your original draft remains in the editor.',true);}
      finally{projectListBusy=false;renderProjects();}
    }
    projectsSaveDraft.onclick=()=>void saveCurrentDraftAsNew();
    async function renameCalibrationProject(entry,title){
      const {storage}=projectActions();
      const active=projectSession?.project()?.id===entry.id;
      if(!active){
        if(sharedSelection){
          if(!sharedSelection.canRenameUnselected?.(entry.id))
            throw Error('Open the retained selected project before renaming it');
          return sharedSelection.renameUnselected({id:entry.id,revision:'rev:'+entry.revision,recovery:null},title);
        }
        return storage.rename(env.indexedDB,entry.id,entry.revision,title);
      }
      if(projectSwitchBusy||restoring||fitWorker||applyBusy||pendingPhotoLoads||
          photoGestures.active||resultGestures.active)
        throw Error('Finish active calibration operations before renaming');
      const previousInert=workspace.inert,request=++projectSwitchEpoch;
      projectSwitchBusy=true;switchInterference=false;workspace.inert=true;
      try{
        const ack=persist(true);if(ack)await ack;
        await writeQueue;
        if(projectSwitchEpoch!==request||switchInterference)
          throw Error('Calibration changed during rename');
        const session=projectSession;
        const current=session.project();
        if(current.id!==entry.id)throw Error('Selected project changed before rename');
        if(sharedSelection){
          const state=session.state();
          if(state.pending||state.unsaved||state.error||state.selectionPending)
            throw Error('Resolve unsaved Calibration work before renaming');
          if(current.title===title)return current;
          const outcome=await persist(true,{title});
          if(!outcome?.current||session.state().unsaved||session.state().selectionPending||
             session.state().error)throw Error('Rename acknowledgement incomplete; retained recovery');
          return outcome.project;
        }
        const renamed=await storage.rename(env.indexedDB,current.id,current.revision,title);
        if(projectSwitchEpoch!==request||switchInterference)
          throw Error('Calibration changed during rename; refresh to inspect the saved title');
        session.bind(renamed);
        return renamed;
      }finally{
        projectSwitchBusy=false;workspace.inert=previousInert;
        if(switchInterference&&scene)void persist();
      }
    }
    async function renameFromProjects(entry){
      if(projectListBusy||sharedSelection&&projectSession?.project()?.id!==entry.id&&
         !sharedSelection.canRenameUnselected?.(entry.id))return;
      const title=env.prompt('Rename Calibration Project',entry.title);
      if(title===null||title===entry.title)return;
      projectListBusy=true;renderProjects();
      projectsMessage('Renaming with revision protection…');
      try{
        const renamed=await renameCalibrationProject(entry,title.trim());
        projectListBusy=false;await refreshProjectList();
        projectsMessage(renamed.id!==entry.id?
          'Rename saved as a conflict copy: '+renamed.title+'.':
          'Renamed to '+renamed.title+'.');
      }catch(error){projectActionMessage(error,'Rename failed');}
      finally{projectListBusy=false;renderProjects();}
    }
    async function duplicateFromProjects(entry){
      if(projectListBusy)return;
      projectListBusy=true;renderProjects();
      projectsMessage('Verifying original photograph and duplicating the saved checkpoint…');
      try{
        const {actions}=projectActions();
        const created=await actions.duplicate(env,entry.id,entry.revision);
        projectListBusy=false;await refreshProjectList();
        projectsMessage('Created '+created.title+'. Open it to edit independently.');
      }catch(error){projectActionMessage(error,'Duplicate failed');}
      finally{projectListBusy=false;renderProjects();}
    }
    async function deleteFromProjects(entry){
      if(projectListBusy||sharedSelection&&!sharedSelection.remove)return;
      const active=projectSession?.project()?.id===entry.id;
      if(active&&(projectSwitchBusy||restoring||fitWorker||applyBusy||pendingPhotoLoads||
          photoGestures.active||resultGestures.active)){
        projectsMessage('Finish fitting, applying or editing endpoints before deleting the opened project.',true);
        return;
      }
      const warning=active?' The currently opened editor will be closed and the page reloaded.':'';
      if(!env.confirm('Delete Calibration Project "'+entry.title+'"?'+warning+
          ' The reference photo, archived results, and old recovery draft will be retained.'))return;
      projectListBusy=true;renderProjects();
      projectsMessage('Checking project revision before deletion…');
      const previousInert=workspace.inert;
      if(active){projectSwitchBusy=true;switchInterference=false;workspace.inert=true;}
      try{
        const {storage}=projectActions();
        let revision=entry.revision;
        if(active){
          // The active project must reach a durable checkpoint before removal.
          // Do not leave a live session bound to a deleted ID: reload after the
          // acknowledged CAS deletion, as on a normal browser restart.
          const session=projectSession;
          const ack=persist(true);if(ack)await ack;
          await writeQueue;
          if(switchInterference||session!==projectSession||
             session.project()?.id!==entry.id)
            throw Error('Calibration changed during project deletion');
          const current=session.state();
          if(current.unsaved||current.pending||current.error)
            throw Error('Active calibration has unsaved work');
          revision=current.revision;
        }
        if(sharedSelection){
          const result=await sharedSelection.remove({id:entry.id,revision:'rev:'+revision,recovery:null});
          if(result.detached||active){
            // Do not auto-select any other project or write a tab handoff.
            // The durable workspace is already the physical experiment.
            projectsMessage('Project deleted. Restoring the acknowledged physical workspace…');
            env.location.reload();return;
          }
          projectListBusy=false;await refreshProjectList();
          projectsMessage('Deleted project "'+entry.title+'". Photos and archived results were retained.');
          return;
        }
        await storage.remove(env.indexedDB,entry.id,revision);
        if(active){
          // Only this explicit Delete may reopen the next remaining project.
          // Empty string means a clean standalone editor, not an old draft.
          const remaining=await storage.list(env.indexedDB);
          let previous=null;
          try{previous=env.sessionStorage?.getItem(PREVIOUS_PROJECT_KEY);}catch(_ignored){}
          const next=remaining.find(row=>row.id===previous)?.id||
            remaining.find(row=>row.id!==entry.id)?.id||'';
          try{
            env.sessionStorage?.removeItem(PREVIOUS_PROJECT_KEY);
            env.sessionStorage?.removeItem(LAST_PROJECT_KEY);
            env.sessionStorage?.setItem(DELETED_PROJECT_HANDOFF_KEY,next);
          }catch(_ignored){/* Reload must still be safe without optional storage. */}
          projectsMessage('Opened project deleted. Reloading the editor…');
          env.location.reload();return;
        }
        projectListBusy=false;await refreshProjectList();
        projectsMessage('Deleted project "'+entry.title+'". Photos and archived results were retained.');
      }catch(error){projectActionMessage(error,'Delete failed');}
      finally{
        projectListBusy=false;
        if(active){projectSwitchBusy=false;if(!sharedSelection||sharedSelection.usable())workspace.inert=previousInert;}
        renderProjects();
      }
    }
    async function importAsNewFromProjects(file){
      if(projectListBusy)return;
      projectListBusy=true;renderProjects();
      projectsMessage('Validating imported calibration and verifying its original photograph…');
      try{
        if(file.size>40*1024*1024)throw Error('Experiment file exceeds 40 MiB');
        const data=validateExperiment(JSON.parse(await file.text()),env.CurvatureModernReferenceImage.validate);
        // Verification and IndexedDB create must finish before listing the new
        // project; no import into the active editor is performed.
        const {actions}=projectActions();
        const created=await actions.importAsNew(env,data,{
          title:(data.referenceImage.title||'Imported calibration').slice(0,160)});
        // Imported as New is selected in the library, not activated in the editor.
        projectSelectedId=created.id;
        projectListBusy=false;await refreshProjectList();
        projectsMessage('Imported '+created.title+' as a separate project. Choose Open to activate it.');
      }catch(error){projectActionMessage(error,'Import as New failed');}
      finally{projectListBusy=false;renderProjects();}
    }
    projectsNew.onclick=()=>void newFromProjects();
    projectsImport.onclick=()=>projectsImportFile.click();
    projectsImportFile.onchange=()=>{
      const file=projectsImportFile.files[0];
      if(file)void importAsNewFromProjects(file).finally(()=>{projectsImportFile.value='';});
    };
    projectsDisclosure.addEventListener('toggle',()=>showProjectList(projectsDisclosure.open));
    projectsRefresh.onclick=()=>void refreshProjectList();
    async function saveActiveFromProjects(){
      if(projectListBusy)return;
      const session=projectSession,initial=session?.state();
      if(!initial?.projectId||!initial.unsaved||initial.pending>0)return;
      projectListBusy=true;
      projectsStatus.dataset.saveNotice='active';
      renderProjects();
      projectsMessage(initial.error?'Retrying the exact unsaved Calibration Project snapshot…':
        'Saving the active Calibration Project…');
      try{
        // Retry the captured latest snapshot, including pending correspondences
        // and Undo/Redo. Do not mark an unrelated current editor or discard it.
        const outcome=await session.retry();
        const after=session.state();
        if(!outcome.current||after.projectId!==initial.projectId&&
            outcome.status!=='forked'||after.pending||after.unsaved)
          throw Error('Project changed during save; retained unsaved work');
        projectListBusy=false;
        await refreshProjectList();
        if(!session.state().unsaved&&!session.state().pending){
          delete projectsStatus.dataset.saveNotice;
          projectsMessage(outcome.status==='forked'?
            'Changes safely saved as a conflict copy. Review the updated project list.':
            'Calibration Project saved in this browser.');
        }
      }catch(error){
        projectsMessage('Save failed: '+error.message+'. Your unsaved work is retained.',true);
      }finally{
        projectListBusy=false;
        renderProjects();
      }
    }
    projectsSave.onclick=()=>void saveActiveFromProjects();

    projectsAdopt.onclick=()=>void adoptFromProjects();
    function persistenceSession(){
      if(!projectSession){
        const helper=env.CurvatureModernCalibrationProjectPersistence;
        if(!helper)throw Error('Calibration Project coordinator unavailable');
        projectSession=helper.create(env,{sharedSelection,onChange:()=>{
          // Bind/save/failure acknowledgments maintain the tab-scoped durable
          // identity. No auto-resume token is kept for unresolved edits.
          if(!leavingPage)rememberCleanProjectState(projectSession?.state());
          if(!projectsPanel.hidden)renderProjects();
          if(sharedSelection)sharedSelection.onChange();
        }});
      }
      return projectSession;
    }
    function persist(forSwitch=false,changes=null){
      if(restoring||!scene||sharedSelection&&(sharedPresentationHydrating||!projectSession?.project()||leavingPage||workspace.hidden))return;
      if(projectSwitchBusy&&!forSwitch){
        // A programmatic event during a switch invalidates the pending
        // activation. Never silently drop its mutated editor state.
        editorMutation++;switchInterference=true;
        return;
      }
      editorMutation++;
      saveInline(true);
      const data=captureDraftState();
      const session=projectSession?.project()?projectSession:null;
      const inline=session?captureInlineState():null;
      let saved;
      if(session){
        // Bind the captured project ID/generation and snapshot before
        // yielding to any earlier async write. Queuing mark() itself would
        // allow a late callback to accidentally mark a newly opened project.
        try{
          const fingerprint=sharedSelection?sharedInputFingerprint(data,inline):null;
          if(sharedSelection&&!changes&&fingerprint===sharedInput){
            if(forSwitch&&(session.state().unsaved||session.state().pending||session.state().error))
              return sharedWrite||Promise.reject(Error('Resolve unsaved Calibration work first'));
            return;
          }
          if(changes)session.mark(data,inline,changes);
          else {
            session.mark(data,inline);
          }
          saved=session.save().then(result=>{
            const current=projectSession===session&&
              session.state().projectId===result.project.id;
            if(current)$('ModernCalibrationStorage').textContent=
              result.status==='forked'?'Conflict fork saved in Calibration Projects.':
                'Calibration Project saved in this browser.';
            return result;
          });
          if(sharedSelection){sharedInput=fingerprint;sharedWrite=saved;}
        }catch(error){saved=Promise.reject(error);}
      }else{
        saved=writeQueue.catch(()=>{}).then(async()=>{
          await coordinateLegacyIDB(async()=>{
            const db=await databaseRaw();
            await new Promise((resolve,reject)=>{
              const tx=db.transaction('draft','readwrite');
              let failure=null;
              tx.oncomplete=()=>failure?reject(failure):resolve();
              tx.onerror=()=>{failure=failure||tx.error||Error('Draft write failed');};
              tx.onabort=()=>reject(failure||tx.error||Error('Draft write aborted'));
              try{tx.objectStore('draft').put(data,'active');}
              catch(error){failure=error;try{tx.abort();}catch(ignore){reject(error);}}
            });
          });
          if(!projectSession?.project())
            $('ModernCalibrationStorage').textContent='Draft saved in this browser.';
        });
      }
      // Apply and guarded switching await this rejecting promise. Ordinary
      // UI events still use a handled queue for fire-and-forget autosaves.
      writeQueue=saved.catch(e=>{
        $('ModernCalibrationStorage').textContent=
          (session?'Calibration Project':'Draft')+' not saved: '+e.message;
      });
      $('ModernCalibrationStorage').textContent='Saving '+(session?'project':'draft')+'…';
      return saved;
    }
    async function restoreDraft(){
      if(sharedSelection)throw Error('Legacy draft restore is disabled in shared-session preview');
      // A deleted project's reload must not resurrect the unrelated retained
      // legacy draft and present it as though another project were opened.
      if(deletedProjectHandoff!==null)return;
      restoring=true;
      try{
        const d=await readDraft();
        if(!d||![1,2].includes(d.version))return;
        if(d.scene?.model?.showModel===2){blockedFlatDraft=true;throw Error('Stored Flat calibration is no longer supported. Start a new Globe session to replace it.');}
        const next=prepareScene(d.scene);
        if(d.record){
          const decoded=new env.Image();decoded.src=d.record.original.dataUrl;await decoded.decode();
          if(decoded.naturalWidth!==d.record.original.width||decoded.naturalHeight!==d.record.original.height)throw Error('Stored image dimensions mismatch');
          const checked=observationRows(d.rows,d.record.original.width,d.record.original.height,d.version===2,next.model);
          validateLegacyTopology(checked,next);workflow.replaceAll(checked);
          record=d.record;image=decoded;activeSource=d.activeSource;
        }
        showScene(next);
        const storedSession=d.physicalSessionId??d.magnifierSessionId;
        physicalSessionId=typeof storedSession==='string'?storedSession:physicalSessionId;
        if(record){photoDetails(record,activeSource);fitPhoto();}
        if(d.view&&[d.view.scale,d.view.x,d.view.y].every(Number.isFinite)&&d.view.scale>0)view=d.view;
        const editRow=workflow.rows.find(r=>r.landmark.id===d.editing);
        let restoredModel=editRow?.landmark||null;
        if(record&&d.pendingModel)try{if(isMaterial(d.pendingModel))materialResolver.create(scene.model).resolveLandmark(d.pendingModel.anchor.kind,d.pendingModel);else validateLegacyTopology([{landmark:d.pendingModel}],scene);restoredModel=d.pendingModel;}catch(error){/* Invalid optional pending vertex. */}
        const restoredPixel=record&&Array.isArray(d.pending)&&d.pending.length===2&&imagePoint({scale:1,x:0,y:0},...d.pending,record.original.width,record.original.height)?d.pending:null;
        workflow.restoreDraft({editing:d.editing,pending:restoredPixel,pendingModel:restoredModel,activePair:d.activePair,explicitAdd:d.explicitAdd===true});
        weight.value=d.weight||'1';setPixel(restoredPixel);
        syncPairToolbar();
        refreshRows();photoDraw();meshDraw();
        if(['best','initial','off'].includes(d.residualMode))residualMode.value=d.residualMode;
        if(d.freeParameters){applyFreeFields(validatedFreeFields(d.freeParameters));
          try{restoreFit(validateFitResult(d.fitBest,workflow.rows,freeFields(),scene.model,scene.physics,record?.original.width,record?.original.height),d.fitStatus);}
          catch(error){fitStatus.textContent='Stored fit discarded: '+error.message;}}
        if(record){
          function checkedHistory(entries){
          const history=[];
          for(const entry of (Array.isArray(entries)?entries:[]).slice(-50)){
            try{
              const prior=observationRows(entry.rows,record.original.width,record.original.height,true,scene.model);
              validateLegacyTopology(prior,scene);
              history.push({rows:prior,activePair:prior.some(r=>r.landmark.id===entry.activePair)?entry.activePair:null});
            }catch(error){/* Discard only invalid history entries. */}
          }
          return history;
          }
          workflow.restoreHistory(checkedHistory(d.undoStack),checkedHistory(d.redoStack));refreshRows();
        }
        if(d.selectedOwner){const found=[...packages.values()].find(p=>JSON.stringify(p.owner)===JSON.stringify(d.selectedOwner));selectedObjectKey=found?.key??null;}
        inlineSessions=readInline();
        // Initial rendering during draft restoration may have opened a default
        // viewport. Reopen it after the stored source and fit are available.
        inlineViewer.close();inlineSource=null;inlineRole=null;
        for(const key of ["initial","best"]){const v=d.resultViews?.[key];if(v&&[v.scale,v.x,v.y].every(Number.isFinite)&&v.scale>0)resultViews[key]={scale:v.scale,x:v.x,y:v.y};}
        setStage(CALIBRATION_STAGES.includes(d.stage)?d.stage:(d.viewBest&&fitBest?'result':'correspondences'),{camera:d.resultCamera||(d.viewBest?'best':d.stage==='result'?'initial':'best'),save:false,render:false});
        message('Calibration draft restored.');
        $('ModernCalibrationStorage').textContent='Draft restored from this browser.';
      }catch(e){$('ModernCalibrationStorage').textContent='Cannot restore draft: '+e.message;}
      finally{restoring=false;if(scene&&!physicalSessionId)newPhysicalSession();syncFitControls();if(viewBest&&fitBest)paintBest();else meshDraw();photoDraw();}
    }
    async function adoptLegacyCalibrationDraft(){
      if(sharedSelection){
        if(projectSession?.project()||!sharedSelection.canAdoptLegacy?.()||
           projectSwitchBusy||restoring||fitWorker||applyBusy||pendingPhotoLoads)
          throw Error('Resolve active work before adopting the retained draft');
        const outcome=await sharedSelection.adoptLegacy();
        if(!outcome.project||!['migrated','already'].includes(outcome.status))
          throw Error('Draft migration produced no openable project');
        projectStartupStatus={status:'adopted',projectId:outcome.project.id};
        return outcome.project;
      }
      const migration=env.CurvatureModernCalibrationProjectMigration;
      if(!migration)throw Error('Calibration migration unavailable');
      if(projectSession?.project())
        throw Error('An active Calibration Project is already bound; use Open instead');
      if(projectSwitchBusy||restoring||fitWorker||applyBusy||pendingPhotoLoads||
         photoGestures.active||resultGestures.active)
        throw Error('Stop fitting, applying, loading or editing endpoints before adoption');
      const previousInert=workspace.inert,request=++projectSwitchEpoch;
      projectSwitchBusy=true;switchInterference=false;workspace.inert=true;
      let observed=editorMutation;
      try{
        if(scene){
          const outgoing=persist(true);
          if(outgoing)await outgoing;
        }
        await writeQueue;
        observed=editorMutation;
        if(projectSwitchEpoch!==request||switchInterference||editorMutation!==observed)
          throw Error('Editor changed during adoption');
        if(dbPromise){const open=await dbPromise;open.close();dbPromise=null;}
        const check=await migration.inspect(env);
        if(check.status==='recovery-required')
          throw Error('Legacy draft needs raw recovery: '+check.reason);
        if(check.status!=='legacy-pending')
          throw Error('There is no eligible legacy draft to adopt');
        const outcome=await migration.migrate(env);
        if(projectSwitchEpoch!==request||switchInterference||editorMutation!==observed)
          throw Error('Editor changed during adoption; original draft is still available');
        if(!outcome.project||!['migrated','already'].includes(outcome.status))
          throw Error('Draft migration produced no openable project');
        projectStartupStatus={status:'adopted',projectId:outcome.project.id};
        return outcome.project;
      }finally{
        projectSwitchBusy=false;workspace.inert=previousInert;
        if(switchInterference&&scene)void persist();
      }
    }
    // The only editor-side project switch entry point. The library UI added
    // in 8F.7p.6 will invoke this explicit operation; startup never does.
    async function openCalibrationProject(id,{cleanReload=false}={}){
      if(sharedSelection){
        const saved=await env.CurvatureModernCalibrationProjectStore.get(env.indexedDB,id);
        if(!saved)throw Error('Calibration Project missing');
        return openSharedProject(env.CurvatureModernCalibrationProjectPersistence.projectReference(saved),false);
      }
      const storage=env.CurvatureModernCalibrationProjectStore;
      const migration=env.CurvatureModernCalibrationProjectMigration;
      if(!storage||!migration)throw Error('Calibration Projects are unavailable');
      if(projectSwitchBusy||restoring||fitWorker||applyBusy||pendingPhotoLoads||
         photoGestures.active||resultGestures.active)
        throw Error('Stop fitting, applying, loading or editing endpoints before opening another project');
      const model=env.CurvatureModernCalibrationProject;
      model.id(id);
      const request=++projectSwitchEpoch,formerInert=workspace.inert;
      projectSwitchBusy=true;switchInterference=false;workspace.inert=true;
      let observed=editorMutation,oldView=null,activated=false;
      function guard(){
        return projectSwitchBusy&&projectSwitchEpoch===request&&
          editorMutation===observed&&!switchInterference&&
          !fitWorker&&!applyBusy&&!pendingPhotoLoads;
      }
      function requireGuard(){
        if(!guard())throw Error('Calibration changed during project switch; outgoing work remains active');
      }
      try{
        // Never move away from the live editor until its most recent
        // outgoing state has a durable acknowledgement, not just an enqueued
        // promise. A failed IndexedDB write aborts the switch.
        if(!cleanReload&&scene&&deletedProjectHandoff===null){
          const ack=persist(true);
          if(ack)await ack;
        }
        if(cleanReload)projectsMessage('Reopening saved Calibration Project: waiting for storage…');
        await writeQueue;
        observed=editorMutation;
        requireGuard();

        const session=persistenceSession();
        if(!session.project()){
          // Close the legacy reader before opening the v2 Project database.
          if(dbPromise){const open=await dbPromise;open.close();dbPromise=null;}
        }
        // A clean F5 reopen must not adopt or rewrite the independent legacy
        // draft. Only an explicit Open may run one-time migration.
        if(!session.project()&&!cleanReload){
          const check=await migration.inspect(env);
          requireGuard();
          if(check.status==='recovery-required')
            throw Error('Export or recover the unsupported legacy draft before opening a project: '+check.reason);
          if(check.status==='legacy-pending'||check.status==='adopted'){
            const adopted=await migration.migrate(env);
            requireGuard();
            if(adopted.status==='already-removed')
              throw Error('Previously adopted Calibration Project was deleted; legacy recovery remains available');
          }
        }
        // A project is independently verified and decoded before the first
        // mutation of the live editor. prepareOpen rechecks the DB revision.
        if(cleanReload)projectsMessage('Reopening saved Calibration Project: verifying checkpoint…');
        const prepared=await session.prepareOpen(id,guard);
        requireGuard();
        if(cleanReload)projectsMessage('Reopening saved Calibration Project: decoding photograph…');
        const incoming=await prepareVisualProject(prepared);
        requireGuard();
        oldView=scene?{
          draft:captureDraftState(),inline:captureInlineState(),
          decoded:image,next:prepareScene({model:scene.model,physics:scene.physics}),
          rows:workflow.rows.map(r=>jsonCopy(r)),
          fit:fitBest
        }:null;
        requireGuard();
        try{
          activateVisualProject(incoming);
          session.bind(prepared.project);
          activated=true;
          projectStartupStatus={status:'active',projectId:prepared.project.id};
          $('ModernCalibrationStorage').textContent='Calibration Project opened and verified.';
        }catch(error){
          try{
            if(oldView)activateVisualProject(oldView);
            else{
              // The first explicit open can start from an empty editor.
              // Do not leave a half-activated project on a render failure.
              restoring=true;
              try{
                scene=null;record=null;image=null;view=null;activeSource=null;
                fitBest=null;fitSignature=null;paintedFit=null;viewBest=false;
                workflow.replaceAll();inlineSessions={initial:null};
                resultViews={initial:null,best:null};physicalSessionId=null;
                photoInfo.replaceChildren();
              }finally{restoring=false;}
            }
          }catch(rollback){throw Error('Project activation failed; rollback also failed: '+
            error.message+' / '+rollback.message);}
          throw error;
        }
        return {status:'opened',project:session.project()};
      }finally{
        projectSwitchBusy=false;workspace.inert=formerInert;
        if(!activated&&switchInterference&&scene)void persist();
        syncFitControls();
      }
    }
    // Only an exact shared reference may activate this editor. The old
    // standalone draft and tab identities are never consulted or rewritten.
    async function openSharedProject(reference,restore=true){
      if(!sharedSelection)throw Error('Shared Calibration editor is not configured');
      if(projectSwitchBusy||restoring||fitWorker||applyBusy||pendingPhotoLoads||
         photoGestures.active||resultGestures.active)
        throw Error('Finish active Calibration operations before opening a project');
      const previousInert=workspace.inert,request=++projectSwitchEpoch;
      projectSwitchBusy=true;switchInterference=false;workspace.inert=true;
      let observed=editorMutation,pointerCommitted=false;
      const guard=()=>projectSwitchBusy&&projectSwitchEpoch===request&&
        editorMutation===observed&&!switchInterference&&!fitWorker&&!applyBusy&&!pendingPhotoLoads;
      const requireGuard=()=>{if(!guard())throw Error('Calibration changed during shared activation');};
      try{
        const session=persistenceSession();
        if(!restore&&session.project()&&!workspace.hidden){
          const ack=persist(true);if(ack)await ack;
        }
        await writeQueue;observed=editorMutation;requireGuard();
        const prepared=await session.prepareSelected(reference,guard);requireGuard();
        const incoming=await prepareVisualProject(prepared);requireGuard();
        const saved=await env.CurvatureModernCalibrationProjectStore.get(env.indexedDB,reference.id);
        requireGuard();
        if(!saved||JSON.stringify(saved)!==JSON.stringify(prepared.project))
          throw Error('Calibration Project changed during visual preparation');
        if(restore)await sharedSelection.verify(reference);
        else await sharedSelection.select(reference);
        pointerCommitted=true;requireGuard();
        const confirmed=await env.CurvatureModernCalibrationProjectStore.get(env.indexedDB,reference.id);
        requireGuard();
        if(!confirmed||JSON.stringify(confirmed)!==JSON.stringify(prepared.project))
          throw Error('Calibration Project changed after shared selection');
        activateVisualProject(incoming);
        session.bind(prepared.project);
        delete workspace.dataset.sharedLibraryOnly;
        // A visible project switch can construct the inline viewer during
        // activation. Restore its exact saved role after the draft is in place.
        sharedPresentationHydrating=true;
        try{
          if(editingStage()&&inlineViewer.isOpen()&&inlineRole&&inlineSource)
            restoreInlineRole(inlineRole,inlineSource);
          sharedInput=sharedInputFingerprint(captureDraftState(),captureInlineState());
          sharedWrite=null;
        }finally{sharedPresentationHydrating=false;}
        projectStartupStatus={status:'active',projectId:prepared.project.id};
        projectSelectedId=prepared.project.id;
        $('ModernCalibrationStorage').textContent='Calibration Project opened and verified.';
        return {status:'opened',project:session.project()};
      }catch(error){
        if(pointerCommitted)sharedSelection.fail(error);
        throw error;
      }finally{
        projectSwitchBusy=false;
        if(sharedSelection.usable())workspace.inert=previousInert;
        syncFitControls();
      }
    }
    async function prepareSharedLeave(){
      if(!sharedSelection||projectSwitchBusy||projectListBusy||restoring||fitWorker||applyBusy||
         pendingPhotoLoads||photoGestures.active||resultGestures.active)
        throw Error('Finish active Calibration operations before leaving');
      const ack=persist(true);if(ack)await ack;
      await writeQueue;
      const state=projectSession?.state();
      if(!state?.projectId)return true; // No document was selected in the library.
      if(state.pending||state.unsaved||state.error||state.selectionPending)
        throw Error('Resolve unsaved Calibration work before leaving');
      return true;
    }
    async function resumeCleanProjectAfterReload(){
      if(sharedSelection)return;
      // No automatic activation without a clean tab-scoped exit identity;
      // never replace the standalone recovery state after a failed write.
      if(deletedProjectHandoff!==null||projectSession?.project()||
         env.CurvatureModernApp?.getWorkspaceMode?.()!=='calibration')return;
      let id=null;
      try{
        id=env.sessionStorage?.getItem(RELOAD_PROJECT_KEY)||null;
        env.sessionStorage?.removeItem(RELOAD_PROJECT_KEY);
      }catch(_ignored){return;}
      if(!id)return;
      projectsMessage('Restoring last verified Calibration Project…');
      try{
        env.CurvatureModernCalibrationProject.id(id);
        const opened=await openCalibrationProject(id,{cleanReload:true});
        projectSelectedId=opened.project.id;
        projectStartupStatus={status:'active',projectId:opened.project.id};
        if(!projectsPanel.hidden)await refreshProjectList();
        projectsMessage('Opened Calibration Project: '+opened.project.title+'.');
      }catch(error){
        projectsMessage('Last Calibration Project was not reopened: '+error.message+
          '. Your standalone recovery draft remains available.',true);
      }
    }
    async function resumeAfterDeletedProject(){
      if(sharedSelection)return;
      if(deletedProjectHandoff===null)return;
      const requested=deletedProjectHandoff;
      // Consume the one-shot request even when the target disappeared or
      // decoding failed. Normal reloads never auto-activate a saved project.
      try{env.sessionStorage?.removeItem(DELETED_PROJECT_HANDOFF_KEY);}catch(_ignored){}
      try{
        if(requested){
          const existing=await env.CurvatureModernCalibrationProjectStore.get(env.indexedDB,requested);
          if(!existing)throw Error('The next project is no longer available');
          const opened=await openCalibrationProject(requested);
          projectSelectedId=opened.project.id;
          try{env.sessionStorage?.setItem(LAST_PROJECT_KEY,opened.project.id);}catch(_ignored){}
          projectsMessage('Opened remaining Calibration Project: '+opened.project.title+'.');
        }else{
          projectsMessage('Deleted project closed. No other saved project was available; choose New or Open.');
        }
      }catch(error){
        projectsMessage('Deleted project closed. Could not open the next project: '+
          error.message+'. Choose Open to retry; retained drafts were not deleted.',true);
      }finally{
        deletedProjectHandoff=null;
        if(!projectsPanel.hidden)await refreshProjectList();
      }
    }
    async function prepareVisualProject(prepared){
      const d=prepared.draft;
      if(!d)throw Error('Empty Calibration Project has no editor checkpoint yet');
      const next=prepareScene(d.scene);
      let decoded=null,rows=[];
      if(d.record){
        decoded=new env.Image();decoded.src=d.record.original.dataUrl;
        await decoded.decode();
        if(decoded.naturalWidth!==d.record.original.width||
           decoded.naturalHeight!==d.record.original.height)
          throw Error('Calibration Project image changed during decoding');
        rows=observationRows(d.rows,decoded.naturalWidth,decoded.naturalHeight,true,next.model);
        validateLegacyTopology(rows,next);
      }
      // Preserve the exact fit; do not silently discard invalid science.
      const fit=d.fitBest?validateFitResult(d.fitBest,rows,d.freeParameters,
        next.model,next.physics,decoded?.naturalWidth,decoded?.naturalHeight):null;
      return {draft:d,inline:prepared.inline,decoded,next,rows,fit};
    }
    function activateVisualProject(target){
      const d=target.draft;
      restoring=true;
      try{
        // Reject late async photo and source completions, and prevent an old
        // Apply callback from mutating a newly selected project.
        ++loadToken;++catalogToken;++applyRevision;
        contextMenu.close();photoGestures.cancel();resultGestures.cancel();
        inlineViewer.cancelGesture();inlineViewer.close();
        photoGhost=null;inlineSource=null;inlineRole=null;
        record=d.record;image=target.decoded;activeSource=d.activeSource;
        view=null;resultViews={initial:null,best:null};
        fitBest=null;fitSignature=null;paintedFit=null;viewBest=false;
        fitFailures=[];initialPoints=null;initialProjectionKey=null;diagnosticResult=null;
        workflow.replaceAll(target.rows);
        showScene(target.next);
        physicalSessionId=d.physicalSessionId;
        if(record){photoDetails(record,activeSource);fitPhoto();}
        else{photoInfo.replaceChildren();referenceTools.open=true;}
        // Imported checkpoints may have no saved photo viewport. Keep the
        // freshly computed fit instead of replacing it with null.
        if(d.view)view=d.view;
        workflow.restoreDraft({editing:d.editing,pending:d.pending,pendingModel:d.pendingModel,
          activePair:d.activePair,explicitAdd:d.explicitAdd});
        workflow.restoreHistory(d.undoStack,d.redoStack);
        weight.value=d.weight;px.value=d.pending?String(d.pending[0]):'';
        py.value=d.pending?String(d.pending[1]):'';
        residualMode.value=d.residualMode;
        inlineSessions=target.inline?.sessions?jsonCopy(target.inline.sessions):{initial:null};
        applyFreeFields(d.freeParameters);
        if(target.fit)restoreFit(target.fit,d.fitStatus);
        else fitStatus.textContent=d.fitStatus;
        const chosen=[...packages.values()].find(p=>
          d.selectedOwner&&JSON.stringify(p.owner)===JSON.stringify(d.selectedOwner));
        selectedObjectKey=chosen?.key??null;
        resultViews=jsonCopy(d.resultViews);
        setStage(d.stage,{camera:d.resultCamera,save:false,render:false});
        refreshRows();syncFitControls();
        if(viewBest&&fitBest)paintBest();else meshDraw();
        photoDraw();
      }finally{restoring=false;}
    }
    function populate(select,options){
      select.replaceChildren(...options.map(([value,label])=>{
        const o=doc.createElement('option');o.value=String(value);o.textContent=label;return o;
      }));
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
      sourceLoad.disabled=!choices.length;sourceRefresh.disabled=false;
      sourceStatus.textContent=choices.length+' available photographs'+(errors.length?' · '+errors.join(' · '):'');
    }
    function photoDetails(next,source){
      referenceTools.open=false;photoInfo.replaceChildren();
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
    function confirmReplacement(){return !workflow.rows.length||env.confirm('Replacing the photo discards all correspondences. Continue?');}
    async function acceptPhoto(next,source,token){
      if(projectSwitchBusy||applyBusy||restoring)
        throw Error('Finish the pending project switch or Apply before changing the photograph');
      const library=env.CurvatureModernReferenceImageLibrary;
      const importer=env.CurvatureModernReferenceImageImport;
      if(!library?.ensureOriginal||!importer?.verifyOriginal)
        throw Error('Verified Reference Image Library unavailable');
      // Reuse the original by SHA-256; a failed read/decode/quota/write
      // must never replace the current correspondences or photo.
      const durable=await library.ensureOriginal(env.indexedDB,next,env.crypto,
        candidate=>importer.verifyOriginal(candidate,env));
      if(token!==loadToken)return false;
      const decoded=new env.Image();decoded.src=next.original.dataUrl;await decoded.decode();
      if(token!==loadToken)return false;
      if(projectSwitchBusy||applyBusy||restoring)
        throw Error('Calibration session changed during reference photo verification');
      if(decoded.naturalWidth!==durable.identity.width||
         decoded.naturalHeight!==durable.identity.height)
        throw Error('Verified reference image dimensions changed');
      const attribution=source||{source:'local',key:null,links:[],imported:false};
      contextMenu.close();photoGestures.cancel();newPhysicalSession();record=next;image=decoded;activeSource=attribution;workflow.replaceAll();resetPending();refreshRows();fitPhoto();renderModel();
      setStage("correspondences",{camera:"best",save:false});photoDetails(next,attribution);
      message(next.title+' · '+next.original.width+' × '+next.original.height+' px · verified original retained in Library');
      persist();return true;
    }
    // The old source dropdown remains inert only as a compatibility anchor.
    // Browsing/Cancel never touches Calibration; apply still uses the verified
    // decoder, SHA-256 ensureOriginal and correspondence-loss confirmation.
    sourcePicker.onchange=()=>{};
    sourceRefresh.onclick=refreshSources;
    $('ModernCalibrationOpenImageLibrary').onclick=async()=>{
      if(sharedSelection){
        if(!await env.CurvatureModernApp?.openImageLibraryFromCalibration?.())
          sourceStatus.textContent='Cannot leave Calibration while another operation is active';
        return;
      }
      const libraryTab=$('ModernImageLibraryTab'),imageLibrary=$('ModernReferenceImageLibrary');
      if(!libraryTab||!imageLibrary){
        sourceStatus.textContent='Image Library navigation is unavailable';return;
      }
      // The Calibration editor and its working draft stay mounted. Opening the
      // standalone gallery never imports a photo or changes correspondences.
      libraryTab.click();
      if(env.CurvatureModernApp?.getWorkspaceMode?.()!=='images'){
        sourceStatus.textContent='Cannot leave Calibration while another operation is active';return;
      }
      env.CurvatureImageLibraryReturnToCalibration=true;
      imageLibrary.dispatchEvent(new Event('curvature-library-navigation'));
      imageLibrary.scrollIntoView({block:'start',behavior:'instant'});
    };
    async function useExistingPhoto(key){
      const choice=choices.find(c=>c.key===key);
      if(!choice)throw Error('The chosen photograph is no longer available; refresh the list.');
      if(activeSource?.key===choice.key&&record){
        message('This photograph is already loaded.');return true;
      }
      if(!confirmReplacement())return false;
      const token=++loadToken;beginPhotoLoad();
      message('Loading verified original photograph…');
      try{
        let next;
        if(choice.source==='library'){
          const row=await env.CurvatureModernReferenceImageLibrary.get(env.indexedDB,choice.id);
          next=row?.record;
        }else{
          next=demoRecords.find(d=>d.id===choice.demoId)?.referenceImages.find(r=>r.id===choice.id);
        }
        if(!next)throw Error('Original photograph no longer available; refresh the list.');
        const applied=await acceptPhoto(next,choice,token);
        if(!applied)throw Error('Photo selection was superseded; current editor unchanged.');
        sourcePicker.value=key;return true;
      }catch(error){
        if(token===loadToken)message('Cannot load photograph: '+error.message);
        throw error;
      }finally{endPhotoLoad();}
    }
    sourceLoad.onclick=async()=>{
      if(!env.CurvatureModernImagePicker?.open){
        sourceStatus.textContent='Shared image picker is unavailable';return;
      }
      if(!choices.length)await refreshSources();
      if(!choices.length){
        sourceStatus.textContent='No available photographs. Import one in Image Library.';return;
      }
      env.CurvatureModernImagePicker.open({
        document:doc,choices:choices,mode:'single',title:'Choose a calibration photograph',
        applyLabel:'Use original',onApply:async keys=>useExistingPhoto(keys[0])
      });
    };
    function message(s){status.textContent=s;}
    function photoDraw(){
      ctx.clearRect(0,0,photo.width,photo.height);
      if(!image||!view)return;
      ctx.drawImage(image,view.x,view.y,record.original.width*view.scale,record.original.height*view.scale);
      if(resultStage()&&residualMode.value!=='off'&&fitBest&&!photoGhost){
        for(const r of residualData)drawResidual(ctx,view,r.observed,r[residualMode.value],COLORS[(r.number-1)%COLORS.length],r.id===workflow.activePair);
      }
      workflow.rows.forEach((r,i)=>marker(ctx,screenPoint(view,photoGhost?.id===r.landmark.id?photoGhost.pixel:r.pixel),pairLabel(r,i),COLORS[i%COLORS.length],r.landmark.id===workflow.activePair));
      if(editingStage()&&workflow.pending){const p=screenPoint(view,photoGhost?.kind==='draft'?photoGhost.pixel:workflow.pending),scale=photo.width/Math.max(1,photo.getBoundingClientRect().width);ctx.save();ctx.translate(...p);ctx.scale(scale,scale);ctx.beginPath();ctx.arc(0,0,10,0,2*Math.PI);ctx.strokeStyle='#17212d';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle='#009ab3';ctx.lineWidth=2.5;ctx.stroke();ctx.beginPath();ctx.arc(0,0,3.5,0,2*Math.PI);ctx.fillStyle='#009ab3';ctx.fill();ctx.restore();}
    }
    function fitPhoto(){
      if(!record)return;
      view=fit(record.original.width,record.original.height,photo.width,photo.height);photoDraw();
    }
    function setPixel(p){
      workflow.selectPhoto(p);px.value=p?String(+p[0].toFixed(3)):'';py.value=p?String(+p[1].toFixed(3)):'';
      photoDraw();syncPairToolbar();
      updateHint();
    }
    function setIncluded(id,included){
      const row=workflow.rows.find(r=>r.landmark.id===id);
      if(!row||row.included===included)return;
      workflow.change(workflow.rows.map(r=>r===row?{...r,included}:r));
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
      if(!scene)return [];
      let resolver;
      const descriptors=workflow.rows.map((row,i)=>{
        const common={id:row.landmark.id,label:pairLabel(row,i),color:COLORS[i%COLORS.length],kind:row.kind};
        try{
          if(!resolver)resolver=materialResolver.create(scene.model);
          const q=resolver.resolveLandmark(row.kind,row.landmark);
          return {...common,bank:q.bank,index:q.index,anchor:q.anchor};
        }catch(error){return {...common,anchor:null};}
      });
      return descriptors;
    }
    function refreshPhysicalCorrespondences(){
      if(editingStage()&&inlineViewer.isOpen()&&!inlinePanel.hidden&&!workspace.hidden)
        inlineViewer.setCorrespondences(correspondenceDescriptors(),workflow.activePair);
    }
    function refreshRows(){
      if(fitSignature!==null&&fitSignature!==JSON.stringify(workflow.rows))invalidateFit('Correspondences changed. Run calibration again.');
      syncFitControls();
      list.replaceChildren();
      workflow.rows.forEach((r,i)=>{
        const tr=doc.createElement('tr');tr.classList.toggle('is-selected',r.landmark.id===workflow.activePair);
        const failure=fitFailures.find(p=>p.id===r.landmark.id);tr.classList.toggle('is-fit-failure',!!failure);
        tr.onclick=e=>{if(!e.target.closest('button,input,label'))selectPair(r.landmark.id);};
        for(const [column,t] of [String(i+1),landmarkLabel(r.landmark),r.pixel.map(x=>x.toFixed(2)).join(', '),String(r.weight)].entries()){
          const td=doc.createElement('td');td.textContent=t;if(column===0){td.style.color=COLORS[i%COLORS.length];td.style.fontWeight='bold';}if(column===1)td.title=r.landmark.id;tr.append(td);
        }
        const role=doc.createElement('td');role.append(inclusionControl(r,i));tr.append(role);
        const diagnostic=doc.createElement('td');diagnostic.textContent=failure?failure.status+' · '+failure.reason:'—';
        if(failure){const jump=doc.createElement('button');jump.type='button';jump.textContent='Locate';jump.setAttribute('aria-label','Locate failed correspondence '+(i+1));
          jump.onclick=()=>{setStage('correspondences');selectPair(r.landmark.id);};diagnostic.append(' ',jump);}
        tr.append(diagnostic);
        const actions=doc.createElement('td');
        const edit=doc.createElement('button');edit.type='button';edit.textContent='Edit';
        edit.onclick=()=>beginPairEdit(r.landmark.id);
        const del=doc.createElement('button');del.type='button';del.textContent='Delete';
        del.onclick=()=>deletePair(r.landmark.id);
        actions.append(edit,del);tr.append(actions);list.append(tr);
      });
      $('ModernCalibrationCount').textContent=workflow.rows.length+' correspondences';
      syncPairToolbar();
      refreshResidualTable();refreshPhysicalCorrespondences();
    }
    function syncPairToolbar(){
      const state=pairToolbarState(workflow,{ready:!!record,readOnly:!editingStage()||viewBest,implicit:true});
      pairAdd.disabled=state.addDisabled;pairEdit.disabled=state.editDisabled;add.disabled=state.commitDisabled;
      pairCancel.disabled=state.cancelDisabled;pairDelete.disabled=state.deleteDisabled;pairUndo.disabled=state.undoDisabled;pairRedo.disabled=state.redoDisabled;
      add.textContent=state.commitLabel;pairCancel.textContent=workflow.editing?'Cancel edit':'Cancel';
      $('ModernCalibrationPairMode').textContent=state.mode;
      $('ModernCalibrationPairPhoto').textContent='Photo: '+(state.photo?'selected':'not selected');
      $('ModernCalibrationPairModel').textContent='Model: '+(state.model?'selected':'not selected');
      $('ModernCalibrationActionHint').textContent=state.hint;
      pairPanel.dataset.mode=workflow.mode;
    }
    function beginSharedAdd(){
      if(!editingStage()||!record||viewBest||workflow.mode!=='browse')return false;
      inlineViewer.clearLocalPoint();resetPending();workflow.beginAdd();
      if(inlineViewer.isOpen()){
        const picker=inlineHost.querySelector('[data-viewer-pick-mode]');
        if(picker&&picker.value!=='auto'){
          picker.value='auto';picker.onchange?.();
        }
      }
      refreshRows();updateHint();photoDraw();meshDraw();persist();return true;
    }
    function beginPairEdit(id){
      const r=workflow.rows.find(r=>r.landmark.id===id);
      if(!editingStage()||!r||!record||viewBest)return false;
      if(workflow.editing===id)return true;
      if(workflow.mode!=='browse'&&!env.confirm('Discard the current draft and edit this pair?'))return false;
      inlineViewer.clearLocalPoint();resetPending();
      workflow.beginEdit(id,{model:true});
      weight.value=String(r.weight);setPixel(r.pixel.slice());
      syncPairToolbar();refreshRows();photoDraw();meshDraw();persist();return true;
    }
    function updateHint(){syncPairToolbar();}
    function resetPending(){inlineViewer.discardPairDraft();
      const parked=inlineSessions.initial?.session;if(parked?.stagedMode==='fast-vertex'||parked?.stagedMode===undefined&&parked?.pickMode==='fast-vertex'){Object.assign(parked,{staged:null,stagedMode:null,choices:[],choice:'',inputs:[]});if(parked.confirmed&&parked.pickMode==='fast-vertex')parked.confirmed=null;}
      workflow.clearDraft();weight.value='1';setPixel(null);updateHint();meshDraw();}
    function cancelPairDraft(){if(!editingStage())return;inlineViewer.clearLocalPoint();workflow.cancel();resetPending();refreshRows();photoDraw();meshDraw();persist();}
    function selectPair(id){
      if(!workflow.rows.some(r=>r.landmark.id===id))return;
      if(!workflow.select(id))return;refreshRows();updateHint();photoDraw();meshDraw();persist();
    }
    function deletePair(id){
      if(!editingStage())return;
      if(!workflow.rows.some(r=>r.landmark.id===id))return;
      const wasEditing=workflow.editing===id;
      workflow.change(workflow.rows.filter(r=>r.landmark.id!==id));
      if(wasEditing)resetPending();else updateHint();
      refreshRows();photoDraw();meshDraw();persist();
    }
    function applyHistory(direction){
      if(!editingStage())return;
      photoGestures.cancel();inlineViewer.cancelGesture();contextMenu.close();
      if(!workflow[direction]())return;
      // Keep the existing independent draft and its weight/coordinates.
      // Only discard obsolete local inspector staging when its draft vanished.
      if(workflow.mode==='browse'){
        inlineViewer.clearLocalPoint();
        const saved=inlineSessions.initial?.session;if(saved)Object.assign(saved,{staged:null,stagedMode:null,confirmed:null,choices:[],choice:'',inputs:[]});
        resetPending();
      }
      refreshRows();updateHint();photoDraw();meshDraw();
      message(direction==='undo'?'Last correspondence change undone.':'Last correspondence change redone.');persist();
    }
    function undo(){applyHistory('undo');}
    function redo(){applyHistory('redo');}
    function photoMarker(p){
      const r=photo.getBoundingClientRect(),scale=[photo.width/Math.max(1,r.width),photo.height/Math.max(1,r.height)];
      const items=workflow.rows.map(r=>({kind:'saved',id:r.landmark.id,pixel:screenPoint(view,r.pixel)}));
      if(editingStage()&&workflow.pending)items.push({kind:'draft',pixel:screenPoint(view,workflow.pending)});
      return pointerGestures.markerAt(items,p,scale);
    }
    function landmarkLabel(v){
      if(isMaterial(v)){const a=v.anchor,o=a.owner;return 'Bank '+(o.bank+1)+' · '+(o.kind==='span'?o.role+' '+(o.from.stationIndex+1)+'–'+(o.to.stationIndex+1):'Station '+(o.stationIndex+1))+' · '+a.kind+' · P'+a.primitive+' / '+a.indices.join(',');}
      const p=scene?.banks[v.bank]?.[v.primitive];
      const number=(p?.metadata?.placedObjectIndex??0)+1;
      return 'Bank '+(v.bank+1)+' · Object '+number+' (far-to-near) · P'+v.primitive+' / V'+v.vertex;
    }
    // Retain optical painting for Result and the stable initial physical frame.
    // Only the owner pass is needed for initial framing, not optical picking.
    function renderModel(){
      resultViews={initial:null,best:null};renderingModel=true;physicalSource=null;physicalFraming=null;
      inlineViewer.close();inlineSource=null;inlineRole=null;
      if(!restoring){inlineSessions={initial:null};saveInline();}
      previewValid=false;invalidateFit('Add correspondences or run calibration from the captured camera.');
      modelStatus.textContent='Rendering initial optical camera…';
      try{
        const size=previewSize(record?.original.width||sceneCanvas.width,record?.original.height||sceneCanvas.height);
        modelRaster.width=size.width;modelRaster.height=size.height;
        const m={...scene.model,viewcenterHorizon:3,geometryRadius:scene.model.rEarth,deviceRatio:size.width/size.height};
        const camera=env.CurvatureCameraPhysicalPose.photoCamera(m,size.width,size.height);
        m.camViewAngle=camera.fieldOfViewRadians;
        const options={...scene.physics,canvasDirectOptions:{thinOutlines:true}};
        renderer.paint(modelRaster,camera,m,options);previewValid=true;
        const source=jsonCopy({camera,model:m,options,width:size.width,height:size.height});
        modelStatus.textContent='';
        try{
          identityRaster.width=size.width;identityRaster.height=size.height;
          renderer.paint(identityRaster,camera,m,{...scene.physics,canvasDirectOptions:{thinOutlines:true,landmarkOwnerPass:true}});
          const spans=identitySpans(identityRaster.getContext('2d',{willReadFrequently:true}).getImageData(0,0,size.width,size.height).data,size.width,size.height);
          for(const key of spans.keys())if(!packages.has(key))spans.delete(key);
          const observer=env.CurvatureCameraTranslation.frame(m.CameraEast||0,m.CameraNorth||0,m.Height,1/m.rEarth);
          physicalFraming={source,observer,spans,packages};
        }catch(error){/* Physical fallback does not require optical visibility. */}
      }catch(error){modelStatus.textContent='Initial optical preview unavailable: '+error.message;}
      physicalSource={kind:'physical-v2',model:scene.model,physics:scene.physics,source:physicalFraming?physicalFraming.source:null};
      renderingModel=false;meshDraw();
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
    function selectInlineOwner(owner){
      if(!editingStage()||viewBest)return false;
      const pkg=owner?[...packages.values()].find(p=>JSON.stringify(p.owner)===JSON.stringify(owner)):null;
      if(owner&&!pkg){message('Stable owner identity unavailable.');return false;}
      selectedObjectKey=pkg?.key??null;syncInlineOwner();persist();return true;
    }
    function syncInlineOwner(){
      const pkg=packages.get(selectedObjectKey);
      const primitives=pkg?pkg.primaryIndices.map(i=>{
        const p=scene.banks[pkg.owner.bank][i];
        return 'P'+(p.metadata.landmarkPrimitive??i)+' · '+p.type+' · '+p.points.length+' vertices';
      }):[];
      inlineViewer.setInspectedOwner(pkg?.owner||null,pkg?packageLabel(pkg)+' · '+primitives.length+' primitives'+(pkg.rangeMetres===null?'':' · approx. '+pkg.rangeMetres.toFixed(1)+' m')+' · dashed contextual outline':'Click an object or span to inspect its owner.',primitives);
    }
    new env.MutationObserver(()=>{
      if(workspace.hidden){contextMenu.close();photoGestures.cancel();resultGestures.cancel();inlineViewer.cancelGesture();captureInline();}
      else if(sharedSelection){
        // Visibility changes are hydration, not edits. Opening the inline
        // viewer can emit onSessionChange even though no user changed it.
        sharedPresentationHydrating=true;
        try{
          meshDraw();if(editingStage()&&inlineViewer.isOpen()){inlineViewer.refresh();refreshPhysicalCorrespondences();}
          const state=projectSession?.state();
          if(state?.projectId&&!state.pending&&!state.unsaved&&!state.error&&!state.selectionPending)
            sharedInput=sharedInputFingerprint(captureDraftState(),captureInlineState());
        }finally{sharedPresentationHydrating=false;}
      }else{meshDraw();if(editingStage()&&inlineViewer.isOpen()){inlineViewer.refresh();refreshPhysicalCorrespondences();}}
    }).observe(workspace,{attributes:true,attributeFilter:['hidden']});
    function syncInline(){
      if(!editingStage()||workspace.hidden)return false;
      if(renderingModel)return true;
      const source=physicalSource;
      if(!source)return true;
      if(inlineSource===source&&inlineViewer.isOpen())return true;
      captureInline();switchingInline=true;
      try{
        inlineViewer.openPhysical(scene.banks,physicalFraming);
        inlineSource=source;inlineRole='initial';refreshPhysicalCorrespondences();
        if(!restoring)restoreInlineRole('initial',source);
        syncInlineOwner();return true;
      }catch(error){
        inlineViewer.close();inlineSource=null;inlineRole=null;
        message('Physical Free View unavailable: '+error.message);return false;
      }finally{switchingInline=false;saveInline();}
    }
    function objectLabel(key){return 'Bank '+((key-1)%2+1)+' · Object '+(Math.floor((key-1)/2)+1)+' (far-to-near)';}
    function meshDraw(){
      syncPairToolbar();
      if(editingStage()){
        if(syncInline()){
          let point=workflow.pendingModel;
          if(isMaterial(point))try{const q=materialResolver.create(scene.model).resolveLandmark(point.anchor.kind,point);point={bank:q.bank,primitive:q.index,anchor:q.anchor};}catch(error){point=null;}
          inlineViewer.setPendingVertex(point);
        }
        return;
      }
      if(!resultStage())return;
      if(viewBest&&fitBest&&paintedFit){drawFitPreview();return;}
      mesh.clearRect(0,0,sceneCanvas.width,sceneCanvas.height);
      if(!previewValid)return;
      const v=resultModelView();
      mesh.drawImage(modelRaster,v.x,v.y,modelRaster.width*v.scale,modelRaster.height*v.scale);
      if(!record)return;
      const byId=new Map(initialProjection().map(p=>[p.id,p]));
      const sx=modelRaster.width/record.original.width,sy=modelRaster.height/record.original.height;
      workflow.rows.forEach((r,i)=>{
        const p=byId.get(r.landmark.id);
        if(p?.status==='visible'&&p.predicted?.every(Number.isFinite))
          marker(mesh,screenPoint(v,[p.predicted[0]*sx,p.predicted[1]*sy]),pairLabel(r,i),COLORS[i%COLORS.length],r.landmark.id===workflow.activePair);
      });
    }
    function savePair(){
      try{
        const landmark=workflow.pendingModel;
        if(!editingStage()||viewBest||!record||!workflow.pending||!landmark)throw Error('Select both a photo pixel and a model vertex');
        const wasEditing=workflow.editing,width=record.original.width,height=record.original.height;
        const next=commitGlobePair(workflow.rows,landmark,workflow.pending,width,height,Number(weight.value),workflow.editing,scene.model);
        workflow.change(next,wasEditing||null,{finish:true});
        inlineViewer.clearLocalPoint();resetPending();refreshRows();photoDraw();meshDraw();message(wasEditing?'Correspondence updated.':'Correspondence saved.');persist();return true;
      }catch(e){message(e.message);$('ModernCalibrationActionHint').textContent=e.message;return false;}
    }
    function finishEndpointChange(){
      refreshRows();updateHint();photoDraw();meshDraw();persist();
    }
    function moveInlineEndpoint(target,hit){
      if(!record||!implicitRoute())return false;
      try{
        const resolver=materialResolver.create(scene.model);
        if(target.kind==='draft'){
          const old=workflow.pendingModel;if(!old)return false;
          const landmark=resolver.fromPick(hit,old.id);
          const key=l=>materialAnchor.anchorKey(resolver.resolveLandmark(l.anchor?.kind||'vertex',l).anchor);
          if(key(old)===key(landmark))return false;
          workflow.selectModel(landmark);finishEndpointChange();message('Draft model point moved.');return true;
        }
        if(target.kind==='saved'){
          const landmark=resolver.fromPick(hit,target.id);
          if(!moveSavedEndpoint(workflow,target.id,{landmark},record.original.width,record.original.height,scene.model))return false;
          finishEndpointChange();message('Correspondence model point moved.');return true;
        }
      }catch(error){message(error.message);$('ModernCalibrationActionHint').textContent=error.message;}
      return false;
    }
    function confirmInlineMaterial(hit){
      if(!editingStage()||!record||viewBest){message('Load a photo and return to Free View.');return false;}
      try{
        const resolver=materialResolver.create(scene.model);
        const id=env.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
        const landmark=resolver.fromPick(hit,workflow.editing||'material-'+id);
        workflow.selectModel(landmark);workflow.select(workflow.editing);
        refreshRows();updateHint();meshDraw();persist();return true;
      }catch(error){message(error.message);return false;}
    }
    function chooseInlineVertex(hit){
      if(!record||!implicitRoute()||!scene||hit.kind!=='vertex')return false;
      return confirmInlineMaterial(hit)?'pending':false;
    }
    function choosePhoto(p){
      if(!editingStage()||!p)return;
      workflow.select(workflow.editing);setPixel(p);refreshRows();photoDraw();meshDraw();persist();
    }
    function canvasPoint(canvas,e){
      const r=canvas.getBoundingClientRect();
      return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height];
    }
    function prepareScene(snapshot){
      const m=snapshot.model;
      if(m.showModel!==1)throw Error('Photo Calibration requires a Globe scene. Flat remains available in Scene and Compare.');
      if(!['vacuum','standard','temperature-lapse'].includes(snapshot.physics.atmosphere))
        throw Error('Select Vacuum, Standard or Temperature lapse in Scene for calibration.');
      const banks=[0,1].map(b=>{
        if(!m.NObjects[b])return [];
        return env.CurvatureGeometryEngine.createObjectSequenceScene({...m,geometryRadius:m.rEarth},b,true,
          {opticsNeutral:true,physicalSurface:true,curvature:1/m.rEarth}).primitives;
      });
      return {...snapshot,banks};
    }
    function showScene(next){
      contextMenu.close();inlineViewer.close();inlineSource=null;inlineRole=null;if(!restoring)newPhysicalSession();scene=next;physicalSource=null;physicalFraming=null;selectedObjectKey=null;
      const m=scene.model;
      let rangeOf=()=>null;
      try{const t=env.CurvatureCameraTranslation,basis=t.frame(m.CameraEast,m.CameraNorth,m.Height,1/m.rEarth);
        rangeOf=p=>{const q=t.pointAt(p,basis);return Math.hypot(q[0],q[1]);};}catch(error){/* Range is optional. */}
      packages=ownerSelections(scene.banks,env.CurvatureGeometryEngine.landmarkOwnerKey,rangeOf);
      syncFitControls();
      $('ModernCalibrationScene').textContent=(m.DemoText||'Current scene')+' · Globe · '+scene.physics.atmosphere;
      renderModel();refreshRows();
      message('Load a reference photo and select matching vertices.');
    }
    function enter(snapshot){
      if(sharedSelection){
        if(!projectSession?.project()){
          // Browsing is transient until a verified named project is selected.
          // Never create a standalone draft or acknowledge an empty workspace.
          workspace.dataset.sharedLibraryOnly='true';
          showProjectList(true,true);
          return true;
        }
        delete workspace.dataset.sharedLibraryOnly;
        void refreshSources();
        showProjectList(env.CurvatureModernApp?.getCalibrationView?.()==='projects',true);
        return true;
      }
      if(!scene){
        if(blockedFlatDraft&&!env.confirm('The stored Flat calibration is no longer supported. Replace it with a new Globe session?'))return false;
        try{showScene(prepareScene(snapshot));blockedFlatDraft=false;}
        catch(e){scene=null;env.alert(e.message);return false;}
      }
      void refreshSources();
      if(deletedProjectHandoff===null)persist();
      // The parent Modern workspace already owns the persisted navigation
      // preference. Restore this subview only when Calibration is entered;
      // do not auto-open or bind any stored project.
      showProjectList(env.CurvatureModernApp?.getCalibrationView?.()==='projects');
      return true;
    }
    $('ModernCalibrationReset').onclick=()=>{
      if((workflow.rows.length||record)&&!env.confirm('Discard this photo and all correspondences and capture the latest Scene?'))return;
      let next;
      try{next=prepareScene(env.CurvatureModernApp.getPhotoCalibrationScene());}
      catch(e){message('Cannot start a new session: '+e.message);return;}
      loadToken++;record=null;image=null;view=null;activeSource=null;workflow.replaceAll();photoGestures.cancel();photoGhost=null;
      referenceTools.open=true;photoInfo.replaceChildren();sourcePicker.value='';sourceLoad.disabled=!choices.length;resetPending();
      showScene(next);setStage("correspondences",{camera:"best"});void refreshSources();
    };
    const photoGestures=pointerGestures.mount(photo,{
      enabled:()=>!!(record&&view&&(editingStage()||resultStage())),
      target:(_css,event)=>photoMarker(canvasPoint(photo,event)),
      markerDrag:()=>editingStage(),
      onHover(_css,event){photo.style.cursor=resultStage()?'grab':record&&view&&photoMarker(canvasPoint(photo,event))?'move':'crosshair';},
      onDrag(a,event){
        const p=canvasPoint(photo,event),r=photo.getBoundingClientRect();
        if(a.action==='marker'){
          if(!editingStage())return;
          const pixel=imagePoint(view,...p,record.original.width,record.original.height);
          photoGhost=pixel?{kind:a.target.kind,id:a.target.id,pixel}:null;
          photo.style.cursor=pixel?'move':'not-allowed';
        }else{
          photo.style.cursor='grabbing';
          view.x+=a.delta[0]*photo.width/Math.max(1,r.width);
          view.y+=a.delta[1]*photo.height/Math.max(1,r.height);
        }
        photoDraw();
      },
      onAction(a,event){
        photoGhost=null;const p=canvasPoint(photo,event);
        if(!editingStage()){if(resultStage()&&a.kind==='click'&&a.target.kind==='saved')selectPair(a.target.id);return;}
        if(viewportGesture(a,'photo'))return;
        if(a.kind==='drag'&&a.action==='marker'&&a.target.kind==='draft'){
          const pixel=imagePoint(view,...p,record.original.width,record.original.height);
          if(pixel&&workflow.pending&&workflow.pending.some((n,i)=>n!==pixel[i])){setPixel(pixel);meshDraw();persist();}
        }else if(a.kind==='drag'&&a.action==='marker'&&a.target.kind==='saved'){
          const row=workflow.rows.find(r=>r.landmark.id===a.target.id);
          const pixel=imagePoint(view,...p,record.original.width,record.original.height);
          if(row&&pixel){
            try{
              if(moveSavedEndpoint(workflow,a.target.id,{pixel},record.original.width,record.original.height,scene.model)){
                finishEndpointChange();message('Correspondence photo point moved.');
              }
            }catch(error){message(error.message);}
          }
        }else if(a.kind==='click'){
          if(a.target.kind==='saved')selectPair(a.target.id);
          else if(a.target.kind==='background')choosePhoto(imagePoint(view,...p,record.original.width,record.original.height));
        }
      },
      onEnd(a){
        photoGhost=null;photo.style.cursor='crosshair';photoDraw();
        if(a.kind==='drag'&&a.action==='pan')persist();
        if(a.kind==='cancel'&&a.moved&&a.action==='marker')
          message('Move cancelled · original point retained.');
      },
      onLeave(){if(!photoGestures.active)photo.style.cursor='';}
    });
    env.addEventListener('blur',()=>photoGestures.cancel());
    photo.addEventListener('wheel',e=>{
      if(!record)return;e.preventDefault();if(photoGestures.active)return;photoGestures.clearClicks();const p=canvasPoint(photo,e);
      const min=fit(record.original.width,record.original.height,photo.width,photo.height).scale/4;
      view=zoomAt(view,...p,Math.exp(-e.deltaY*.0015),min,Math.max(16,min*16));photoDraw();persist();
    },{passive:false});
    $('ModernCalibrationFit').onclick=fitPhoto;
    function manualPixel(){
      if(!editingStage()||!record)return;
      const p=[Number(px.value),Number(py.value)];
      const valid=px.value!==''&&py.value!==''&&imagePoint({scale:1,x:0,y:0},...p,record.original.width,record.original.height);
      workflow.selectPhoto(valid?p:null);photoDraw();meshDraw();syncPairToolbar();
    }
    px.oninput=py.oninput=manualPixel;
    const resultGestures=pointerGestures.mount(sceneCanvas,{
      enabled:()=>resultStage()&&!!record&&!!(viewBest&&paintedFit||previewValid),markerDrag:()=>false,
      onDrag(a){const v=resultModelView(),r=sceneCanvas.getBoundingClientRect();v.x+=a.delta[0]*sceneCanvas.width/Math.max(1,r.width);v.y+=a.delta[1]*sceneCanvas.height/Math.max(1,r.height);meshDraw();},
      onAction(a){if(a.kind==="double-click"){resultViews[resultViewKey()]=null;meshDraw();}persist();}
    });
    sceneCanvas.addEventListener("wheel",e=>{
      if(!resultStage()||!record||!(viewBest&&paintedFit||previewValid))return;
      e.preventDefault();if(resultGestures.active)return;resultGestures.clearClicks();
      const raster=resultRaster(),v=resultModelView(),base=fit(raster.width,raster.height,sceneCanvas.width,sceneCanvas.height).scale;
      resultViews[resultViewKey()]=zoomAt(v,...canvasPoint(sceneCanvas,e),Math.exp(-e.deltaY*.0015),base/4,Math.max(16,base*32));meshDraw();persist();
    },{passive:false});
    env.addEventListener("blur",()=>resultGestures.cancel());
    function freeFields(){return Array.from(fitPanel.querySelectorAll('[data-fit-field]')).filter(n=>n.checked).map(n=>n.dataset.fitField);}
    function applyFreeFields(free){for(const n of fitPanel.querySelectorAll('[data-fit-field]'))n.checked=free.includes(n.dataset.fitField);syncFitControls();}
    function syncFitControls(){
      const free=freeFields(),count=fitRows(workflow.rows).length;
      $('ModernCalibrationRoleCount').textContent=count+' Fit · '+(workflow.rows.length-count)+' Validation'+(stage==='calibration'&&(count===0||2*count<free.length)?' · insufficient Fit points for selected free parameters':'');
      exportButton.disabled=!record||!scene;
      importButton.disabled=restoring;
      const initialSupported=!!scene&&effectiveSupport().supported;
      const bestSupported=!!scene&&!!fitBest?.evaluation?.valid&&effectiveSupport(fitBest.pose).supported;
      runFit.disabled=stage!=="calibration"||restoring||pendingPhotoLoads>0||applyBusy||
        !!fitWorker||!record||!scene||!initialSupported||!count||!free.length||2*count<free.length;
      stopFit.disabled=!fitWorker;bestView.disabled=!fitBest;
      const applyDisabled=!!sharedSelection&&(!sharedSelection.usable()||!projectSession?.project())||
        applyBusy||restoring||pendingPhotoLoads>0||!resultStage()||
        !!fitWorker||!record||!scene||!bestSupported;
      if(applyButton)applyButton.disabled=applyDisabled;
      if(applyTarget)applyTarget.disabled=applyDisabled;
      syncApplyDestination();
      syncHypothesis();

      for(const field of fitFields){
        const v=scene?.model[field];
        fitPanel.querySelector('[data-fit-value="'+field+'"]').textContent=Number.isFinite(v)?'('+Number(v.toPrecision(6))+')':'';
      }
      bestView.textContent=viewBest?'Show initial camera':'Show best camera';
      residualMode.disabled=!fitBest;syncStageUI();
    }
    function exportExperiment(){
      if(!scene||!record)throw Error('Load a photograph first');
      return jsonCopy({format:EXPERIMENT_FORMAT,version:experimentVersion(workflow.rows),
        scene:{model:scene.model,physics:scene.physics},referenceImage:record,referenceSource:activeSource,
        observations:workflow.rows,fit:{method:'canvas-direct',maxIterations:80,freeParameters:freeFields(),
          result:fitBest,status:fitStatus.textContent,running:!!fitWorker}});
    }
    function restoreFit(result,status){
      applyRevision++;
      fitBest=result;fitSignature=result?JSON.stringify(workflow.rows):null;viewBest=false;
      if(result)fitSummary(result);
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
      const token=++loadToken,decoded=new env.Image();beginPhotoLoad();
      try{
      decoded.src=data.referenceImage.original.dataUrl;await decoded.decode();
      if(token!==loadToken)throw Error('Import superseded');
      if(decoded.naturalWidth!==width||decoded.naturalHeight!==height)throw Error('Embedded photo dimensions mismatch');
      if((record||workflow.rows.length)&&!env.confirm('Replace the current calibration draft with this experiment?'))return false;
      invalidateFit('Importing calibration experiment…');
      photoGestures.cancel();photoGhost=null;
      record=data.referenceImage;image=decoded;workflow.replaceAll(data.observations);
      activeSource={...(data.referenceSource||{}),key:null,links:data.referenceSource?.links||[],imported:true};
      view=null;resetPending();sourcePicker.value='';sourceLoad.disabled=!choices.length;
      showScene(next);photoDetails(record,activeSource);fitPhoto();
      applyFreeFields(data.fit.freeParameters);
      restoreFit(data.fit.result,data.fit.running?'Imported interrupted fit · best saved candidate only':data.fit.status);
      setStage(data.fit.result?'result':'correspondences',{camera:'best',save:false});
      message('Calibration experiment imported.');persist();return true;
      }finally{endPhotoLoad();}
    }
    function experimentFilename(){
      // Prefer the saved project's user-facing name; a standalone draft
      // falls back to the original reference photo's title.
      const title=projectSession?.project()?.title||record?.title||'calibration';
      const safe=String(title).normalize('NFKC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'-')
        .replace(/\s+/g,' ').replace(/[. ]+$/g,'').trim().slice(0,120)
        .replace(/[. ]+$/g,'');
      return 'calibration-'+(safe||'untitled')+'.json';
    }
    exportButton.onclick=()=>{
      try{
        const data=exportExperiment(),blob=new env.Blob([JSON.stringify(data,null,2)],{type:'application/json'});
        const url=env.URL.createObjectURL(blob),a=doc.createElement('a');
        a.href=url;a.download=experimentFilename();doc.body.append(a);a.click();a.remove();
        env.setTimeout(()=>env.URL.revokeObjectURL(url),30000);
        exchangeStatus.textContent='Experiment exported · original photo embedded.';
      }catch(error){exchangeStatus.textContent='Export failed: '+error.message;}
    };
    importButton.onclick=()=>importFile.click();
    importFile.onchange=async()=>{
      const f=importFile.files[0];if(!f)return;
      beginPhotoLoad();
      try{
        if(f.size>40*1024*1024)throw Error('Experiment file exceeds 40 MiB');
        const ok=await importExperiment(JSON.parse(await f.text()));
        exchangeStatus.textContent=ok?'Experiment imported.':'Import cancelled.';
      }catch(error){exchangeStatus.textContent='Import failed: '+error.message;}
      finally{importFile.value='';endPhotoLoad();}
    };
    function terminateFit(){
      if(fitWorker){fitWorker.terminate();fitWorker=null;}
    }
    function initialProjection(){
      // Recompute initial positions with the same physical projection and
      // original raster as the worker. No extra optimization is performed.
      const key=JSON.stringify([scene?.model,scene?.physics,record?.original.width,record?.original.height,workflow.rows]);
      if(initialPoints!==null&&initialProjectionKey===key)return initialPoints;
      initialProjectionKey=key;initialPoints=[];initialProjectionError='';
      try{
        const width=record.original.width,height=record.original.height,
          m={...scene.model,deviceRatio:width/height,viewcenterHorizon:3},
          camera=env.CurvatureCameraPhysicalPose.photoCamera(m,width,height),
          session=env.CurvatureCameraLandmarkProjection.create(m,camera,width,height,{...scene.physics,method:'canvas-direct'});
        initialPoints=workflow.rows.map(r=>{
          const q=session[r.kind](r.landmark);
          return {id:r.landmark.id,status:q.status,predicted:q.pixel};
        });
      }catch(error){initialProjectionError=String(error.message||error);}
      return initialPoints;
    }
    function bestProjection(result){
      if(diagnosticResult===result)return diagnosticBestPoints;
      const points=result.evaluation.points.slice(),held=workflow.rows.filter(r=>r.included===false);
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
      residualPanel.hidden=!resultStage()||!fitBest;
      residualData=fitBest?residualRows(workflow.rows,initialProjection(),bestProjection(fitBest)):[];
      residualList.replaceChildren();
      residualNotice.textContent=initialProjectionError?'Initial projection unavailable: '+initialProjectionError:'';
      const n=v=>Number.isFinite(v)?v.toFixed(2):'—',xy=p=>p?p.map(n).join(', '):'—';
      const stats=residualStatistics(residualData);
      $('ModernCalibrationResidualStats').textContent=fitBest?Object.entries(stats).map(([key,s])=>
        ({fit:'Fit',validation:'Validation',all:'All points'}[key])+' RMS '+n(s.rms)+' px ('+s.available+'/'+s.count+' projected)').join(' · '):'';
      const max=residualData.reduce((v,r)=>Math.max(v,r.best.error??0),0);
      for(const r of residualData){
        const tr=doc.createElement('tr');tr.classList.toggle('is-selected',r.id===workflow.activePair);
        tr.dataset.landmarkId=r.id;
        const cell=doc.createElement('td'),button=doc.createElement('button');
        button.type='button';button.textContent=String(r.number);button.title=r.id;
        button.style.color=COLORS[(r.number-1)%COLORS.length];button.style.fontWeight='bold';
        button.setAttribute('aria-label','Select correspondence '+r.number);
        button.setAttribute('aria-pressed',String(r.id===workflow.activePair));
        button.onclick=()=>selectPair(r.id);cell.append(button);tr.append(cell);
        const role=doc.createElement('td');role.textContent=workflow.rows[r.number-1].included===false?'Validation':'Fit';tr.append(role);
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
      applyRevision++;applyMessage('');
      terminateFit();fitBest=null;fitSignature=null;viewBest=false;paintedFit=null;
      initialPoints=null;initialProjectionError='';diagnosticResult=null;diagnosticBestPoints=[];fitFailures=[];
      for(const tr of list.querySelectorAll('tr.is-fit-failure')){tr.classList.remove('is-fit-failure');const cell=tr.cells[5];if(cell)cell.textContent='—';}
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
        paintedFit=fitBest;lastFitPaint=Date.now();meshDraw();
      }catch(error){viewBest=false;resultCamera='initial';paintedFit=null;fitStatus.textContent='Best camera preview unavailable: '+error.message;syncFitControls();meshDraw();}
    }
    function resultRaster(){return viewBest&&paintedFit?fitRaster:modelRaster;}
    function resultViewKey(){return viewBest&&paintedFit?"best":"initial";}
    function resultModelView(){const raster=resultRaster(),key=resultViewKey();return resultViews[key]||(resultViews[key]=fit(raster.width,raster.height,sceneCanvas.width,sceneCanvas.height));}
    function drawFitPreview(){
      mesh.clearRect(0,0,sceneCanvas.width,sceneCanvas.height);
      const v=resultStage()?resultModelView():fit(fitRaster.width,fitRaster.height,sceneCanvas.width,sceneCanvas.height);
      mesh.drawImage(fitRaster,v.x,v.y,fitRaster.width*v.scale,fitRaster.height*v.scale);
      const sx=fitRaster.width/record.original.width,sy=fitRaster.height/record.original.height;
      const byId=new Map(bestProjection(paintedFit).map(p=>[p.id,p]));
      workflow.rows.forEach((r,i)=>{
        const p=byId.get(r.landmark.id);if(!p||!['visible','out_of_frame'].includes(p.status))return;
        if(p.predicted&&p.predicted.every(Number.isFinite)){
          const xy=screenPoint(v,[p.predicted[0]*sx,p.predicted[1]*sy]);
          if(xy[0]>=0&&xy[0]<sceneCanvas.width&&xy[1]>=0&&xy[1]<sceneCanvas.height)
            marker(mesh,xy,pairLabel(r,i),COLORS[i%COLORS.length],p.id===workflow.activePair);
        }
      });
    }
    function receiveFit(r){
      if(!r.evaluation?.valid)return;
      if(hasMaterial(workflow.rows))r={...r,materialBinding:fitBinding(workflow.rows,freeFields(),scene.model,scene.physics,record.original.width,record.original.height)};
      if(!fitBest||r.evaluation.cost<=fitBest.evaluation.cost){fitBest=r;fitSummary(r);}
      viewBest=calibrationStageState(stage,!!fitBest,resultCamera).best;syncFitControls();
      if(viewBest&&Date.now()-lastFitPaint>=500)paintBest();
    }
    runFit.onclick=()=>{
      if(runFit.disabled)return;
      invalidateFit('Starting Canvas Direct fit…');meshDraw();
      const free=freeFields(),model=JSON.parse(JSON.stringify(scene.model));
      const input=JSON.parse(JSON.stringify(fitRows(workflow.rows))),physics=JSON.parse(JSON.stringify(scene.physics));
      fitSignature=JSON.stringify(workflow.rows);
      try{
        const worker=new env.Worker('src/calibration/CameraCalibrationWorker.js?camera-fit=1&vertex-scale=1&material-fit=1&fit-diagnostics=1');fitWorker=worker;
        worker.onmessage=event=>{
          if(fitWorker!==worker)return;
          const data=event.data;
          if(data.type==='progress'){
            receiveFit(data.result);fitStatus.textContent='Fitting · '+data.result.acceptedSteps+' accepted steps · RMS '+data.result.evaluation.rmsPx.toFixed(2)+' px';
          }else if(data.type==='complete'){
            receiveFit(data.result);terminateFit();
            fitFailures=data.result.evaluation?.valid?[]:fitProjectionFailures(workflow.rows,data.result.evaluation);
            fitStatus.textContent=data.result.status+' · '+(data.result.reason||'Complete')+' (local fit; not a uniqueness certificate)'+
              (fitFailures.length?' · Failed Fit points: '+fitFailures.map(p=>'#'+p.number+' '+p.status).join(', ')+' · Worker '+(data.revision||'unknown'):'');
            if(!data.result.evaluation?.valid){pairList.open=true;env.console?.warn('Calibration Worker returned invalid projection', {revision:data.revision||'unknown',status:data.result.status,evaluation:data.result.evaluation});refreshRows();}
            if(fitBest&&stage==='calibration')setStage('result',{camera:'best',save:false});
            else if(viewBest&&fitBest)paintBest();syncFitControls();persist();
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
    bestView.onclick=()=>{if(resultStage()&&fitBest)setStage('result',{camera:viewBest?'initial':'best'});};
    function projectBinding(){
      const status=projectSession?.state();
      return status?.projectId?Object.freeze({projectId:status.projectId,
        generation:status.generation}):null;
    }
    async function linkArchivedResult(resultId,binding){
      if(!binding)return {status:'legacy-unbound'};
      const session=projectSession;
      if(!session||projectSwitchBusy||restoring||!applyBusy)
        throw Error('Calibration Project is not ready for result linking');
      const selected=session.state();
      if(selected.projectId!==binding.projectId||selected.generation!==binding.generation)
        throw Error('Calibration Project changed during archive; result link was not redirected');
      const outcome=await session.linkResult(resultId,captureDraftState(),
        captureInlineState(),binding);
      $('ModernCalibrationStorage').textContent=
        'Archived calibration result linked to '+outcome.project.title+'.';
      return outcome;
    }
    function applyCandidate(){
      if(restoring||pendingPhotoLoads||!resultStage()||fitWorker||!fitBest?.evaluation?.valid||!effectiveSupport(fitBest.pose).supported)
        throw Error('Show a completed or stopped best camera result before applying');
      return exportExperiment();
    }
    if(applyButton)applyButton.onclick=async()=>{
      if(applyButton.disabled||applyBusy)return;
      const info=applyDestination(selectedApplyTarget);
      if(!env.confirm(info.confirmation))return;
      // Navigation remains possible: the Apply host revision/generation
      // rejects an archived completion after Scene -> editor ABA changes.
      applyBusy=true;syncFitControls();
      applyMessage('Saving calibration and protecting the previous experiment for '+info.label+'…');
      try{
        await env.CurvatureModernApp.applyCalibrationToTarget({
          candidate:applyCandidate,target:()=>selectedApplyTarget,
          revision:()=>applyRevision+':'+loadToken,saveDraft:()=>persist(!!sharedSelection),
          projectBinding,linkArchivedResult
        },info.target);
        applyMessage('Applied to '+info.label+'. Calibration draft retained.');
      }catch(error){
        applyMessage(error.committed?'Applied to '+info.label+', but presentation failed: '+error.message:
          'Apply failed: '+error.message+(error.rollbackError?' · Recovery failed: '+error.rollbackError:''),true);
      }finally{applyBusy=false;syncFitControls();}
    };
    fitPanel.addEventListener('change',()=>{invalidateFit('Parameter selection changed. Run calibration again.');meshDraw();persist();});
    add.onclick=savePair;pairRedo.onclick=redo;
    $('ModernCalibrationCancelEdit').onclick=cancelPairDraft;
    $('ModernCalibrationUndo').onclick=undo;
    $('ModernCalibrationDeleteSelected').onclick=()=>{if(workflow.mode==='browse')deletePair(workflow.activePair);};
    doc.addEventListener('keydown',e=>{
      if(workspace.hidden||!editingStage()||e.target?.closest?.('#ModernCalibrationInlineViewer')||e.target?.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName))return;
      if(e.key==='Escape'&&photoGestures.active){e.preventDefault();photoGestures.cancel();return;}
      if(e.key==='Enter'&&e.target?.tagName!=='BUTTON'&&!add.disabled){e.preventDefault();savePair();return;}
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();return;}
      if(e.key==='Escape'){
        e.preventDefault();cancelPairDraft();
      }else if(e.key==='Delete'&&workflow.activePair){
        e.preventDefault();deletePair(workflow.activePair);
      }
    });
    for(const event of ['click','change','input','pointerup','pointercancel','wheel'])
      workspace.addEventListener(event,e=>{
        // Project library actions never represent mutations of editor state.
        // The list rerenders synchronously on Open and detaches the clicked
        // card before bubbling reaches this listener. closest() on the now
        // detached target would return null. composedPath() preserves the
        // original event ancestry and must be checked before autosaving.
        const path=typeof e.composedPath==='function'?e.composedPath():[];
        // Apply owns an explicit durable checkpoint-before-archive barrier.
        // Its click must not queue a *second* project autosave while the
        // archive/link step is checking for pending generation-bound writes.
        if(path.includes(projectsDisclosure)||path.includes(projectsPanel)||
           path.includes(projectsToggle)||path.includes(applyButton)||
           e.target?.closest?.('#ModernCalibrationProjectsDisclosure, #ModernCalibrationProjectsPanel, #ModernCalibrationProjectsToggle, #ModernCalibrationApplyScene'))return;
        persist();
      });
    syncFitControls();syncPairToolbar();
    function configureSharedSelection(context){
      if(sharedSelection===context)return;
      if(!context||projectSession||scene||restoring||projectSwitchBusy||leavingPage)
        throw Error('Cannot replace an active Calibration persistence owner');
      // DOMContentLoaded mounts the controls before Modern resolves its
      // route. Only the still-unbound editor may acquire the shared owner.
      sharedSelection=context;
      deletedProjectHandoff=null;
      syncFitControls();projectsControls();
    }
    // Usage inspection never mounts controls, selects a project or writes.
    // Hash the captured original, not a bare alias that may belong elsewhere.
    async function inspectUsage(){
      if(!scene||!record)return null;
      const captured=record,binding=projectBinding();
      const identity=await env.CurvatureModernReferenceImageImport.identify(captured,env);
      if(record!==captured||JSON.stringify(projectBinding())!==JSON.stringify(binding))
        throw Error('Calibration changed during usage inspection');
      return {referenceImageId:captured.id,projectId:binding?.projectId||null,identity};
    }
    mounted={enter,selectPresentationView,restore:restoreDraft,inspectProjectStartup,inspectUsage,
      configureSharedSelection,openSharedProject,prepareSharedLeave,
      hydrateOrbitSensitivity:value=>inlineViewer.hydrateOrbitSensitivity(value),
      isSharedLibraryOnly:()=>!!sharedSelection&&!projectSession?.project(),
      projectStartupStatus:()=>({...projectStartupStatus}),resumeAfterDeletedProject,
      openCalibrationProject,resumeCleanProjectAfterReload,adoptLegacyCalibrationDraft,
      refreshProjectList,projectPersistenceStatus:()=>projectSession?.state()||null,
      projectBinding,linkArchivedResult,
      captureProjectCheckpoint,prepareProjectCheckpoint,calibrationStage:()=>({...calibrationStageState(stage,!!fitBest,resultCamera),resultViews:jsonCopy(resultViews)}),exportExperiment,importExperiment,objectSelection:()=>selectedObjectKey===null?null:jsonCopy(packages.get(selectedObjectKey)),inlineViewerState:()=>inlineViewer.snapshot(),inlineViewerCorrespondences:()=>inlineViewer.correspondences(),activeCorrespondence:()=>workflow.activePair,pairWorkflow:()=>workflow.snapshot(),fitResult:()=>fitBest?JSON.parse(JSON.stringify(fitBest)):null,fitProjectionFailures:()=>jsonCopy(fitFailures),snapshot:()=>scene&&record?{model:JSON.parse(JSON.stringify(scene.model)),physics:{...scene.physics},
      referenceImageId:record.id,referenceSource:activeSource?{source:activeSource.source,demoId:activeSource.demoId||null}:null,
      width:record.original.width,height:record.original.height,
      observations:workflow.rows.map(r=>pair(r.landmark,r.pixel,record.original.width,record.original.height,r.weight,r.included))}:null};
    return mounted;
  }
  return Object.freeze({applyDestination,sharedInputFingerprint,calibrationDisclosures,fitProjectionFailures,calibrationStageState,createPairWorkflow,pairToolbarState,contextActions,createContextMenu,linkDraftGesture,commitGlobePair,moveSavedEndpoint,fit,imagePoint,zoomAt,previewSize,screenPoint,objectKey,objectPackages,ownerSelections,identitySpans,pair,upsert,photoChoices,validateExperiment,validateFitResult,observationRows,fitBinding,experimentVersion,fitRows,residualRows,residualStatistics,drawResidual,inspectCurrentUsage:()=>mounted?mounted.inspectUsage():Promise.resolve(null),mount});
}));
