/* Session-only photo correspondence editor. No solver or scene mutation. */
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
      groups=[],vertices=[],meshPoints=[],drag=null;
    const sourcePicker=$('ModernCalibrationSource'),sourceStatus=$('ModernCalibrationSourceStatus'),
      sourceLoad=$('ModernCalibrationUsePhoto'),sourceRefresh=$('ModernCalibrationRefreshPhotos'),
      photoInfo=$('ModernCalibrationPhotoInfo');
    let choices=[],demoRecords=[],catalogToken=0,activeSource=null;
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
      const previous=sourcePicker.value;
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
      record=next;image=decoded;activeSource=source;rows=[];resetPending();refreshRows();fitPhoto();
      photoDetails(next,source);
      message(next.title+' · '+next.original.width+' × '+next.original.height+' px');
      return true;
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
      function mark(p,n,color){
        const x=view.x+p[0]*view.scale,y=view.y+p[1]*view.scale;
        ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);
        ctx.moveTo(x,y-7);ctx.lineTo(x,y+7);ctx.stroke();ctx.fillStyle=color;ctx.font='13px sans-serif';
        ctx.fillText(n,x+9,y-8);
      }
      rows.forEach((r,i)=>mark(r.pixel,String(i+1),'#ffae42'));
      if(pending)mark(pending,'+', '#00e5ff');
    }
    function fitPhoto(){
      if(!record)return;
      view=fit(record.original.width,record.original.height,photo.width,photo.height);photoDraw();
    }
    function setPixel(p){
      pending=p;px.value=p?String(+p[0].toFixed(3)):'';py.value=p?String(+p[1].toFixed(3)):'';
      photoDraw();add.disabled=!pending||!selected();
    }
    function refreshRows(){
      list.replaceChildren();
      rows.forEach((r,i)=>{
        const tr=doc.createElement('tr');
        for(const t of [String(i+1),r.landmark.id,r.pixel.map(x=>x.toFixed(2)).join(', '),String(r.weight)]){
          const td=doc.createElement('td');td.textContent=t;tr.append(td);
        }
        const actions=doc.createElement('td');
        const edit=doc.createElement('button');edit.type='button';edit.textContent='Edit';
        edit.onclick=()=>{
          editing=r.landmark.id;bank.value=String(r.landmark.bank);updateObjects();
          const g=groups.findIndex(g=>g.items.some(p=>p.index===r.landmark.primitive));
          object.value=String(g);updateVertices();
          vertex.value=String(vertices.findIndex(v=>v.id===r.landmark.id));weight.value=String(r.weight);
          setPixel(r.pixel.slice());meshDraw();add.textContent='Update pair';
        };
        const del=doc.createElement('button');del.type='button';del.textContent='Delete';
        del.onclick=()=>{rows=rows.filter(x=>x.landmark.id!==r.landmark.id);
          if(editing===r.landmark.id)resetPending();refreshRows();photoDraw();};
        actions.append(edit,del);tr.append(actions);list.append(tr);
      });
      $('ModernCalibrationCount').textContent=rows.length+' correspondences';
    }
    function resetPending(){editing=null;weight.value='1';add.textContent='Add pair';setPixel(null);}
    function updateObjects(){
      groups=[];vertices=[];meshPoints=[];
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
      // Display a magnified direct projection of only the selected authored
      // object. Hidden/out-of-frame vertices remain selectable by their ID.
      meshPoints=[];
      if(g)try{
        const m={...scene.model,viewcenterHorizon:3};
        const w=sceneCanvas.width,h=sceneCanvas.height;
        const projection=env.CurvatureCameraLandmarkProjection.create(m,
          env.CurvatureCameraPhysicalPose.photoCamera(m,w,h),w,h,
          {...scene.physics,method:'canvas-direct'});
        meshPoints=vertices.map(v=>projection.vertex(v).pixel);
      }catch(e){message('Object preview unavailable: '+e.message+'; select vertex by ID.');}
      meshDraw();add.disabled=!pending||!selected();
    }
    let screenPoints=[];
    function meshDraw(){
      mesh.clearRect(0,0,sceneCanvas.width,sceneCanvas.height);screenPoints=[];
      const finite=meshPoints.filter(p=>p&&p.every(Number.isFinite));
      if(!finite.length)return;
      const min=[Math.min(...finite.map(p=>p[0])),Math.min(...finite.map(p=>p[1]))];
      const max=[Math.max(...finite.map(p=>p[0])),Math.max(...finite.map(p=>p[1]))];
      const scale=Math.min((sceneCanvas.width-40)/Math.max(1e-6,max[0]-min[0]),
        (sceneCanvas.height-40)/Math.max(1e-6,max[1]-min[1]));
      screenPoints=meshPoints.map(p=>p?[sceneCanvas.width/2+(p[0]-(min[0]+max[0])/2)*scale,
        sceneCanvas.height/2+(p[1]-(min[1]+max[1])/2)*scale]:null);
      mesh.strokeStyle='#91a7bd';mesh.lineWidth=1;
      for(let i=1;i<vertices.length;i++)if(vertices[i].primitive===vertices[i-1].primitive&&screenPoints[i]&&screenPoints[i-1]){
        mesh.beginPath();mesh.moveTo(...screenPoints[i-1]);mesh.lineTo(...screenPoints[i]);mesh.stroke();
      }
      screenPoints.forEach((p,i)=>{if(!p)return;mesh.fillStyle=i===Number(vertex.value)?'#ffae42':'#91a7bd';
        mesh.beginPath();mesh.arc(p[0],p[1],i===Number(vertex.value)?5:2,0,2*Math.PI);mesh.fill();});
    }
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
      scene=next;
      const m=scene.model,globe=m.showModel===1;
      $('ModernCalibrationScene').textContent=(m.DemoText||'Current scene')+' · '+(globe?'Globe':'Flat')+' · '+scene.physics.atmosphere;
      populate(bank,[0,1].filter(b=>scene.banks[b].length).map(b=>[b,'Bank '+(b+1)+' · type '+m.ObjType[b]]));
      updateObjects();refreshRows();
      message('Load a reference photo and select matching vertices.');
    }
    function enter(snapshot){
      if(!scene){
        try{showScene(prepareScene(snapshot));}
        catch(e){scene=null;env.alert(e.message);return false;}
      }
      void refreshSources();
      return true;
    }
    $('ModernCalibrationReset').onclick=()=>{
      if((rows.length||record)&&!env.confirm('Discard this photo and all correspondences and capture the latest Scene?'))return;
      let next;
      try{next=prepareScene(env.CurvatureModernApp.getPhotoCalibrationScene());}
      catch(e){message('Cannot start a new session: '+e.message);return;}
      loadToken++;record=null;image=null;view=null;activeSource=null;rows=[];drag=null;file.value='';
      photoInfo.replaceChildren();sourcePicker.value='';sourceLoad.disabled=true;resetPending();
      showScene(next);void refreshSources();
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
      drag={id:e.pointerId,start:p,last:p,moved:false};photo.setPointerCapture(e.pointerId);
    });
    photo.addEventListener('pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;const p=canvasPoint(photo,e);
      if(Math.hypot(p[0]-drag.start[0],p[1]-drag.start[1])>4)drag.moved=true;
      if(drag.moved){view.x+=p[0]-drag.last[0];view.y+=p[1]-drag.last[1];photoDraw();}
      drag.last=p;
    });
    photo.addEventListener('pointerup',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      if(!drag.moved){const p=canvasPoint(photo,e);setPixel(imagePoint(view,...p,record.original.width,record.original.height));}
      drag=null;
    });
    photo.addEventListener('pointercancel',()=>{drag=null;});
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
      pending=valid?p:null;photoDraw();add.disabled=!pending||!selected();
    }
    px.oninput=py.oninput=manualPixel;
    bank.onchange=updateObjects;object.onchange=updateVertices;vertex.onchange=()=>{meshDraw();add.disabled=!pending||!selected();};
    sceneCanvas.onclick=e=>{
      const p=canvasPoint(sceneCanvas,e);let idx=-1,d=12;
      screenPoints.forEach((q,i)=>{if(q){const n=Math.hypot(q[0]-p[0],q[1]-p[1]);if(n<d){idx=i;d=n;}}});
      if(idx>=0){vertex.value=String(idx);vertex.onchange();}
    };
    add.onclick=()=>{
      try{
        if(!record||!pending||!selected())throw Error('Select both a photo pixel and a model vertex');
        rows=upsert(rows,pair(selected(),pending,record.original.width,record.original.height,Number(weight.value)),editing);
        resetPending();refreshRows();photoDraw();message('Correspondence saved.');
      }catch(e){message(e.message);}
    };
    $('ModernCalibrationCancelEdit').onclick=resetPending;
    mounted={enter,snapshot:()=>scene&&record?{model:JSON.parse(JSON.stringify(scene.model)),physics:{...scene.physics},
      referenceImageId:record.id,referenceSource:activeSource?{source:activeSource.source,demoId:activeSource.demoId||null}:null,
      width:record.original.width,height:record.original.height,
      observations:rows.map(r=>pair(r.landmark,r.pixel,record.original.width,record.original.height,r.weight))}:null};
    return mounted;
  }
  return Object.freeze({fit,imagePoint,zoomAt,pair,upsert,photoChoices,mount});
}));
