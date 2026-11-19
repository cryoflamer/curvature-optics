/* Locally persisted photo correspondence editor. No solver or scene mutation. */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.CurvatureModernPhotoCalibrationEditor=api;
    root.document.addEventListener('DOMContentLoaded',()=>api.mount(root.document));}
}(typeof globalThis!=='undefined'?globalThis:this,function(env){
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
  function pair(landmark,pixel,width,height,weight=1){
    if(!landmark||typeof landmark.id!=='string'||!landmark.id||
      !Array.isArray(pixel)||pixel.length!==2||!pixel.every(Number.isFinite)||
      pixel[0]<0||pixel[0]>=width||pixel[1]<0||pixel[1]>=height||
      !Number.isFinite(weight)||weight<=0)throw RangeError('Invalid correspondence');
    if(![0,1].includes(landmark.bank)||![landmark.objectType,landmark.primitive,landmark.vertex].every(Number.isInteger)||
       landmark.primitive<0||landmark.vertex<0)throw RangeError('Invalid authored vertex');
    return {kind:'vertex',landmark:{...landmark},pixel:pixel.slice(),weight};
  }
  function upsert(rows,value,replaceId=null){
    if(rows.some(r=>r.landmark.id===value.landmark.id&&r.landmark.id!==replaceId))
      throw Error('This model vertex is already paired; edit its existing row');
    if(replaceId!==null&&!rows.some(r=>r.landmark.id===replaceId))throw Error('Correspondence no longer exists');
    return replaceId===null?[...rows,value]:rows.map(r=>r.landmark.id===replaceId?value:r);
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
      showLandmarks=$('ModernCalibrationShowLandmarks');
    let modelView=null,projected=[],byLandmark=new Map(),hover=[],ambiguous=[],previewValid=false;
    let pendingModel=null,activePair=null,undoStack=[],hoverIndex=0,photoGhost=null,modelGhost=null;
    let index=spatialIndex([]),modelFrame=null,queuedPointer=null;
    const identityRaster=doc.createElement('canvas'),highlightRaster=doc.createElement('canvas');
    let visibleSpans=new Map(),highlightKey=null,ownership=null,hoverObject=null,visibleByObject=new Map();
    const sourcePicker=$('ModernCalibrationSource'),sourceStatus=$('ModernCalibrationSourceStatus'),
      sourceLoad=$('ModernCalibrationUsePhoto'),sourceRefresh=$('ModernCalibrationRefreshPhotos'),
      photoInfo=$('ModernCalibrationPhotoInfo');
    let choices=[],demoRecords=[],catalogToken=0,activeSource=null;
    const fitFields=["CameraEast","CameraNorth","Height","Pan","Nick","Roll","FocalLengthField"],fitLabels=["East (m)","North (m)","Height (m)","Pan (°)","Nick (°)","Roll (°)","Focal field (mm)"];
    const fitPanel=$('ModernCalibrationFitParameters'),runFit=$('ModernCalibrationRunFit'),stopFit=$('ModernCalibrationStopFit'),bestView=$('ModernCalibrationBestView'),fitStatus=$('ModernCalibrationFitStatus'),fitResult=$('ModernCalibrationFitResult');
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
      const data=JSON.parse(JSON.stringify({version:1,scene:{model:scene.model,physics:scene.physics},
        record,activeSource,rows,pending,pendingModel,activePair,editing,view,modelView,selected:selected(),
        weight:weight.value,showLandmarks:showLandmarks.checked}));
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
        if(!d||d.version!==1)return;
        const next=prepareScene(d.scene);
        if(d.record){
          const decoded=new env.Image();decoded.src=d.record.original.dataUrl;await decoded.decode();
          if(decoded.naturalWidth!==d.record.original.width||decoded.naturalHeight!==d.record.original.height)throw Error('Stored image dimensions mismatch');
          rows=d.rows.map(r=>pair(r.landmark,r.pixel,d.record.original.width,d.record.original.height,r.weight));
          record=d.record;image=decoded;activeSource=d.activeSource;
        }
        showScene(next);
        if(record){photoDetails(record,activeSource);fitPhoto();}
        if(d.view)view=d.view;
        if(d.modelView&&previewValid)modelView=d.modelView;
        showLandmarks.checked=!!d.showLandmarks;
        if(d.selected)selectLandmark(d.selected);
        editing=d.editing;pendingModel=d.pendingModel||null;activePair=d.activePair||null;weight.value=d.weight||'1';setPixel(d.pending||null);
        add.textContent=editing?'Update pair':'Add pair';
        refreshRows();photoDraw();meshDraw();
        message('Calibration draft restored.');
        $('ModernCalibrationStorage').textContent='Draft restored from this browser.';
      }catch(e){$('ModernCalibrationStorage').textContent='Cannot restore draft: '+e.message;}
      finally{restoring=false;}
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
      label.textContent=(source?.source==='demo'?'Built-in demo · ':source?.source==='library'?'Reference library · ':'Local file · ')+
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
      record=next;image=decoded;activeSource=source;rows=[];activePair=null;undoStack=[];resetPending();refreshRows();fitPhoto();renderModel();
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
    function selected(){return vertices[Number(vertex.value)]||null;}
    function photoDraw(){
      ctx.clearRect(0,0,photo.width,photo.height);
      if(!image||!view)return;
      ctx.drawImage(image,view.x,view.y,record.original.width*view.scale,record.original.height*view.scale);
      rows.forEach((r,i)=>marker(ctx,screenPoint(view,photoGhost?.id===r.landmark.id?photoGhost.pixel:r.pixel),String(i+1),COLORS[i%COLORS.length],r.landmark.id===activePair));
      if(pending)marker(ctx,screenPoint(view,pending),'+','#009ab3');
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
    function refreshRows(){
      if(fitSignature!==null&&fitSignature!==JSON.stringify(rows))invalidateFit('Correspondences changed. Run calibration again.');
      syncFitControls();
      list.replaceChildren();
      rows.forEach((r,i)=>{
        const tr=doc.createElement('tr');tr.classList.toggle('is-selected',r.landmark.id===activePair);
        for(const [column,t] of [String(i+1),landmarkLabel(r.landmark),r.pixel.map(x=>x.toFixed(2)).join(', '),String(r.weight)].entries()){
          const td=doc.createElement('td');td.textContent=t;if(column===0){td.style.color=COLORS[i%COLORS.length];td.style.fontWeight='bold';}if(column===1)td.title=r.landmark.id;tr.append(td);
        }
        const actions=doc.createElement('td');
        const edit=doc.createElement('button');edit.type='button';edit.textContent='Edit';
        edit.onclick=()=>{
          resetPending();activePair=r.landmark.id;editing=r.landmark.id;selectLandmark(r.landmark);weight.value=String(r.weight);
          setPixel(r.pixel.slice());meshDraw();add.textContent='Update pair';
        };
        const del=doc.createElement('button');del.type='button';del.textContent='Delete';
        del.onclick=()=>deletePair(r.landmark.id);
        actions.append(edit,del);tr.append(actions);list.append(tr);
      });
      $('ModernCalibrationCount').textContent=rows.length+' correspondences';
      $('ModernCalibrationInlineCount').textContent=rows.length+' correspondences';
      $('ModernCalibrationUndo').disabled=!undoStack.length;
      $('ModernCalibrationDeleteSelected').disabled=!activePair;
    }
    function updateHint(){
      const text=editing?'Editing pair '+(rows.findIndex(r=>r.landmark.id===editing)+1)+' · drag a marker or use manual controls.':
        pending?'Photo point selected. Click a model vertex.':
        pendingModel?'Model vertex selected. Click a photo point.':
        activePair?'Pair '+(rows.findIndex(r=>r.landmark.id===activePair)+1)+' selected · drag either marker or click a new point.':
        'Click either image, then its matching point in the other.';
      $('ModernCalibrationActionHint').textContent=text;
      pickStatus.textContent=text;
    }
    function resetPending(){editing=null;pendingModel=null;weight.value='1';add.textContent='Add pair';setPixel(null);clearAmbiguity();updateHint();meshDraw();}
    function selectPair(id){
      resetPending();activePair=id;refreshRows();updateHint();photoDraw();meshDraw();
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
        const next=upsert(rows,pair(landmark,pixel,record.original.width,record.original.height,old.weight),id);
        rememberUndo();rows=next;activePair=landmark.id;resetPending();refreshRows();photoDraw();meshDraw();
        message('Correspondence updated.');persist();
      }catch(e){message(e.message);}
    }
    function markerHit(canvas,p,items){
      const ratio=canvas.width/Math.max(1,canvas.getBoundingClientRect().width);
      return nearestMarker(items,p,10*ratio);
    }
    function photoMarker(p){return markerHit(photo,p,rows.map(r=>({id:r.landmark.id,pixel:screenPoint(view,r.pixel)})));}
    function modelMarker(p){return markerHit(sceneCanvas,p,rows.flatMap(r=>{
      const item=byLandmark.get(r.landmark.id);return item?[{id:r.landmark.id,pixel:screenPoint(modelView,item.pixel)}]:[];
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
      const p=scene?.banks[v.bank]?.[v.primitive];
      const number=(p?.metadata?.placedObjectIndex??0)+1;
      return 'Bank '+(v.bank+1)+' · Object '+number+' (far-to-near) · P'+v.primitive+' / V'+v.vertex;
    }
    function selectLandmark(v){
      if(!v)return false;
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
      invalidateFit('Add correspondences or run calibration from the captured camera.');
      cancelModelFrame();modelGhost=null;projected=[];index=spatialIndex([]);byLandmark=new Map();previewValid=false;modelView=null;
      visibleSpans=new Map();highlightKey=null;ownership=null;hoverObject=null;visibleByObject=new Map();
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
        const stats=renderer.paint(modelRaster,camera,m,{...scene.physics,canvasDirectOptions:{thinOutlines:true}});
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
        const projection=env.CurvatureCameraLandmarkProjection.create(m,camera,size.width,size.height,
          {...scene.physics,method:'canvas-direct'});
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
        projected=[];byLandmark.clear();modelView=null;meshDraw();
        modelStatus.textContent='Model preview unavailable: '+e.message+'; the landmark menu remains available.';
      }
    }
    function highlightedObject(){
      if(hoverObject!==null||modelGhost)return hoverObject;
      const landmark=pendingModel||rows.find(r=>r.landmark.id===activePair)?.landmark;
      return landmark&&scene?objectKey(landmark,scene.banks):null;
    }
    function drawObjectHighlight(){
      const key=highlightedObject();
      if(key!==highlightKey){
        highlightKey=key;
        const ctx=highlightRaster.getContext('2d');
        ctx.clearRect(0,0,highlightRaster.width,highlightRaster.height);
        ctx.fillStyle='rgba(0,168,220,0.72)';
        for(const [x,y,width] of visibleSpans.get(key)||[])ctx.fillRect(x,y,width,1);
      }
      if(visibleSpans.has(key))mesh.drawImage(highlightRaster,modelView.x,modelView.y,
        modelRaster.width*modelView.scale,modelRaster.height*modelView.scale);
    }
    function meshDraw(){
      if(viewBest&&fitBest&&paintedFit){drawFitPreview();return;}
      mesh.clearRect(0,0,sceneCanvas.width,sceneCanvas.height);
      if(!modelView||!previewValid)return;
      mesh.drawImage(modelRaster,modelView.x,modelView.y,modelRaster.width*modelView.scale,modelRaster.height*modelView.scale);
      drawObjectHighlight();
      // By default reveal only the eligible vertices of the hovered object.
      // The explicit checkbox still shows all painter-visible candidates.
      const dots=showLandmarks.checked?projected.filter(p=>p.painterVisible):visibleByObject.get(highlightedObject())||[];
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
        const item=byLandmark.get(r.landmark.id);
        const pixel=ghost?ghost.pixel:item?screenPoint(modelView,item.pixel):null;
        if(pixel)marker(mesh,pixel,String(i+1),COLORS[i%COLORS.length],!!ghost||r.landmark.id===activePair);
      });
      const item=byLandmark.get(pendingModel?.id||(editing?selected()?.id:null));
      if(item)marker(mesh,screenPoint(modelView,item.pixel),'+','#009ab3');
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
    function objectLabel(key){return 'Bank '+((key-1)%2+1)+' · Object '+(Math.floor((key-1)/2)+1)+' (far-to-near)';}
    function clearAmbiguity(){
      ambiguous=[];pickConflict.hidden=true;pickOptions.replaceChildren();
    }
    function hoverAt(p,draw=true){
      const previous=hover[hoverIndex]?.landmark.id;
      const result=inspectPick(p);hoverObject=result.key;hover=result.candidates;
      hoverIndex=Math.max(0,hover.findIndex(q=>q.landmark.id===previous));
      const item=hover[hoverIndex];
      const tip=$('ModernCalibrationHoverTip');
      tip.hidden=hoverObject===null;
      if(hoverObject!==null){
        tip.textContent=item?(hover.length>1?'Candidate '+(hoverIndex+1)+'/'+hover.length+' · Tab / Shift+Tab · ':'')+
          landmarkLabel(item.landmark)+' · '+(modelGhost?'Release to snap':'Click highlighted vertex'):
          objectLabel(hoverObject)+' · Move to a marked vertex';
        const r=sceneCanvas.getBoundingClientRect();
        tip.style.left=Math.min(Math.max(0,p[0]*r.width/sceneCanvas.width+12),Math.max(0,r.width-230))+'px';
        tip.style.top=Math.min(Math.max(0,p[1]*r.height/sceneCanvas.height+16),Math.max(0,r.height-42))+'px';
      }
      pickStatus.textContent=item?landmarkLabel(item.landmark)+(hover.length>1?' · '+(hoverIndex+1)+'/'+hover.length:''):
        hoverObject!==null?objectLabel(hoverObject)+' · Move to a marked vertex':$('ModernCalibrationActionHint').textContent;
      if(draw)meshDraw();
    }
    function clearHover(){
      hover=[];hoverIndex=0;hoverObject=null;$('ModernCalibrationHoverTip').hidden=true;meshDraw();
    }
    function savePair(){
      try{
        const landmark=pendingModel||selected();
        if(!record||!pending||!landmark)throw Error('Select both a photo pixel and a model vertex');
        const next=upsert(rows,pair(landmark,pending,record.original.width,record.original.height,Number(weight.value)),editing);
        rememberUndo();rows=next;activePair=null;
        resetPending();refreshRows();photoDraw();meshDraw();message('Correspondence saved.');persist();
      }catch(e){message(e.message);$('ModernCalibrationActionHint').textContent=e.message;}
    }
    function chooseModel(item){
      if(!record){message('Load a photograph first.');return;}
      if(!selectLandmark(item.landmark))return;
      clearAmbiguity();pendingModel=item.landmark;activePair=null;
      if(pending)savePair();
      else {refreshRows();updateHint();meshDraw();persist();}
    }
    function choosePhoto(p){
      if(!p)return;
      activePair=null;setPixel(p);refreshRows();
      if(pendingModel)savePair();
      else {photoDraw();meshDraw();persist();}
    }
    function pickAt(p){
      hoverAt(p);
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
      scene=next;syncFitControls();
      const m=scene.model,globe=m.showModel===1;
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
      cancelModelFrame();const p=canvasPoint(sceneCanvas,e),hit=modelMarker(p);
      modelDrag={id:e.pointerId,start:p,last:p,moved:false,marker:hit?.id||null};
      sceneCanvas.setPointerCapture(e.pointerId);
    });
    sceneCanvas.addEventListener('pointermove',e=>{
      if(modelDrag&&modelDrag.id!==e.pointerId)return;
      const p=canvasPoint(sceneCanvas,e);
      // Preserve drag intent even if several events arrive between frames.
      if(modelDrag&&Math.hypot(p[0]-modelDrag.start[0],p[1]-modelDrag.start[1])>4)modelDrag.moved=true;
      queueModelPointer(p);
    });
    sceneCanvas.addEventListener('pointerup',e=>{
      if(!modelDrag||modelDrag.id!==e.pointerId)return;
      const p=canvasPoint(sceneCanvas,e);cancelModelFrame();processModelPointer(p);
      const action=modelDrag;modelDrag=null;modelGhost=null;
      if(action.marker){
        if(action.moved){
          hoverAt(p,false);const item=hover[hoverIndex],row=rows.find(r=>r.landmark.id===action.marker);
          if(row&&item)replacePair(action.marker,item.landmark,row.pixel);
          else message('No eligible vertex at drop; correspondence unchanged.');
        }else selectPair(action.marker);
      }else if(!action.moved)pickAt(p);
      meshDraw();
    });
    sceneCanvas.addEventListener('pointercancel',()=>{cancelModelFrame();modelDrag=null;modelGhost=null;clearHover();});
    sceneCanvas.addEventListener('pointerleave',()=>{if(!modelDrag){cancelModelFrame();clearHover();}});
    sceneCanvas.addEventListener('wheel',e=>{
      if(!modelView)return;e.preventDefault();if(modelDrag||viewBest)return;cancelModelFrame();
      const p=canvasPoint(sceneCanvas,e),base=fit(modelRaster.width,modelRaster.height,sceneCanvas.width,sceneCanvas.height).scale;
      modelView=zoomAt(modelView,...p,Math.exp(-e.deltaY*.0015),base/4,Math.max(16,base*32));
      clearHover();clearAmbiguity();
    },{passive:false});
    function freeFields(){return Array.from(fitPanel.querySelectorAll('[data-fit-field]')).filter(n=>n.checked).map(n=>n.dataset.fitField);}
    function syncFitControls(){
      const free=freeFields();
      runFit.disabled=!!fitWorker||!record||!scene||!rows.length||!free.length||2*rows.length<free.length;
      stopFit.disabled=!fitWorker;bestView.disabled=!fitBest;
      for(const field of fitFields){
        const v=scene?.model[field];
        fitPanel.querySelector('[data-fit-value="'+field+'"]').textContent=Number.isFinite(v)?'('+Number(v.toPrecision(6))+')':'';
      }
      bestView.textContent=viewBest?'Return to initial camera':'Show best camera';
      $('ModernCalibrationFitNotice').hidden=!viewBest;
    }
    function terminateFit(){
      if(fitWorker){fitWorker.terminate();fitWorker=null;}
    }
    function invalidateFit(message){
      terminateFit();fitBest=null;fitSignature=null;viewBest=false;paintedFit=null;
      fitResult.textContent='';fitStatus.textContent=message;syncFitControls();
    }
    function fitSummary(r){
      const n=v=>Number.isFinite(v)?v.toFixed(2):'—';
      fitResult.textContent='Original pixels: RMS '+n(r.initialRmsPx)+' → '+n(r.evaluation.rmsPx)+
        ' px · weighted RMS '+n(r.evaluation.weightedRmsPx)+' px · '+r.evaluations+' evaluations · '+
        fitFields.map((k,i)=>fitLabels[i]+': '+(Number.isFinite(r.pose[k])?Number(r.pose[k].toPrecision(7)):'—')).join(' · ');
    }
    function paintBest(){
      if(!fitBest||!record||!scene)return;
      try{
        const size=previewSize(record.original.width,record.original.height);
        fitRaster.width=size.width;fitRaster.height=size.height;
        const m={...scene.model,...fitBest.pose,viewcenterHorizon:3,geometryRadius:scene.model.rEarth,deviceRatio:size.width/size.height};
        const camera=env.CurvatureCameraPhysicalPose.photoCamera(m,size.width,size.height);
        m.camViewAngle=camera.fieldOfViewRadians;
        renderer.paint(fitRaster,camera,m,{...scene.physics,canvasDirectOptions:{thinOutlines:true}});
        paintedFit=fitBest;lastFitPaint=Date.now();meshDraw();
      }catch(error){viewBest=false;paintedFit=null;fitStatus.textContent='Best camera preview unavailable: '+error.message;syncFitControls();meshDraw();}
    }
    function drawFitPreview(){
      mesh.clearRect(0,0,sceneCanvas.width,sceneCanvas.height);
      const v=fit(fitRaster.width,fitRaster.height,sceneCanvas.width,sceneCanvas.height);
      mesh.drawImage(fitRaster,v.x,v.y,fitRaster.width*v.scale,fitRaster.height*v.scale);
      const sx=fitRaster.width/record.original.width,sy=fitRaster.height/record.original.height;
      paintedFit.evaluation.points.forEach((p,i)=>{
        if(p.predicted&&p.predicted.every(Number.isFinite)){
          const xy=screenPoint(v,[p.predicted[0]*sx,p.predicted[1]*sy]);
          if(xy[0]>=0&&xy[0]<sceneCanvas.width&&xy[1]>=0&&xy[1]<sceneCanvas.height)
            marker(mesh,xy,String(i+1),COLORS[i%COLORS.length]);
        }
      });
    }
    function receiveFit(r){
      if(!r.evaluation?.valid)return;
      if(!fitBest||r.evaluation.cost<=fitBest.evaluation.cost){fitBest=r;fitSummary(r);}
      syncFitControls();
      if(viewBest&&Date.now()-lastFitPaint>=500)paintBest();
    }
    runFit.onclick=()=>{
      if(runFit.disabled)return;
      invalidateFit('Starting Canvas Direct fit…');meshDraw();
      const free=freeFields(),model=JSON.parse(JSON.stringify(scene.model));
      const input=JSON.parse(JSON.stringify(rows)),physics=JSON.parse(JSON.stringify(scene.physics));
      fitSignature=JSON.stringify(rows);
      try{
        const worker=new env.Worker('src/calibration/CameraCalibrationWorker.js?camera-fit=1');fitWorker=worker;
        worker.onmessage=event=>{
          if(fitWorker!==worker)return;
          const data=event.data;
          if(data.type==='progress'){
            receiveFit(data.result);fitStatus.textContent='Fitting · '+data.result.acceptedSteps+' accepted steps · RMS '+data.result.evaluation.rmsPx.toFixed(2)+' px';
          }else if(data.type==='complete'){
            receiveFit(data.result);terminateFit();
            fitStatus.textContent=data.result.status+' · '+(data.result.reason||'Complete')+' (local fit; not a uniqueness certificate)';
            if(fitBest){viewBest=true;paintBest();}syncFitControls();
          }else if(data.type==='error'){
            terminateFit();fitStatus.textContent='Fit failed: '+data.message;syncFitControls();
          }
        };
        worker.onerror=event=>{if(fitWorker!==worker)return;terminateFit();fitStatus.textContent='Worker failed: '+(event.message||'Unable to load calibration worker');syncFitControls();};
        worker.postMessage({model,input,options:{...physics,width:record.original.width,height:record.original.height,freeParameters:free,maxIterations:80}});
        syncFitControls();
      }catch(error){terminateFit();fitStatus.textContent='Cannot start fit: '+error.message;syncFitControls();}
    };
    stopFit.onclick=()=>{terminateFit();fitStatus.textContent='Stopped · best valid camera retained if available.';if(viewBest&&fitBest)paintBest();syncFitControls();};
    bestView.onclick=()=>{if(!fitBest)return;viewBest=!viewBest;clearHover();if(viewBest)paintBest();else meshDraw();syncFitControls();};
    fitPanel.addEventListener('change',()=>{invalidateFit('Parameter selection changed. Run calibration again.');meshDraw();});
    add.onclick=savePair;
    $('ModernCalibrationCancelEdit').onclick=()=>{activePair=null;resetPending();refreshRows();photoDraw();meshDraw();};
    $('ModernCalibrationUndo').onclick=undo;
    $('ModernCalibrationDeleteSelected').onclick=()=>deletePair(activePair);
    doc.addEventListener('keydown',e=>{
      if(workspace.hidden||e.target?.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(e.target?.tagName))return;
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
    mounted={enter,restore:restoreDraft,fitResult:()=>fitBest?JSON.parse(JSON.stringify(fitBest)):null,inspectPick:(x,y)=>{const hit=inspectPick([x,y]);return {key:hit.key,ids:hit.candidates.map(p=>p.landmark.id)};},preview:()=>({view:modelView?{...modelView}:null,points:projected.map(p=>({landmark:{...p.landmark},pixel:p.pixel.slice(),worldKey:p.worldKey,objectKey:p.objectKey,painterVisible:p.painterVisible})),valid:previewValid}),snapshot:()=>scene&&record?{model:JSON.parse(JSON.stringify(scene.model)),physics:{...scene.physics},
      referenceImageId:record.id,referenceSource:activeSource?{source:activeSource.source,demoId:activeSource.demoId||null}:null,
      width:record.original.width,height:record.original.height,
      observations:rows.map(r=>pair(r.landmark,r.pixel,record.original.width,record.original.height,r.weight))}:null};
    return mounted;
  }
  return Object.freeze({fit,imagePoint,zoomAt,previewSize,screenPoint,snapCandidates,spatialIndex,objectKey,identitySpans,ownershipRaster,ownerAt,visiblePick,nearestMarker,pair,upsert,photoChoices,mount});
}));
