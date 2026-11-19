'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const project=require('../src/animation/ModernAnimationProject');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const background=require('../src/animation/ModernAnimationBackgroundExport');
function make(){
  const m={Height:15,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:0,DemoText:'Animation',Description:'',
    ObjType:[3,3],NObjects:[1,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  const a=state.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
    compare.preset('globe-flat-vacuum'),{mode:'scene',eyeLevel:false,horizon:false,selected:'A'});
  const b=structuredClone(a);b.scene.surface.showModel=2;
  return project.create([{experiment:a,holdMs:0},{experiment:b,travelMs:5000}],
    {id:'worker_export',name:'Globe to Flat'});
}
const frameExport=require('../src/animation/ModernAnimationFrameExport');
const pngHeader=Uint8Array.from([137,80,78,71,13,10,26,10]);
function fakeFrame(plan,index){
  const timeMs=plan.timesMs[index];
  const images={},entries=[],renderStats={};
  for(const side of frameExport.outputSides(plan)){
    const name='frames/frame_'+String(index).padStart(5,'0')+'_'+side+'.png';
    images[side]=name;
    entries.push({name,data:Uint8Array.from([...pngHeader,index&255,index>>>8,side.charCodeAt(0)])});
    renderStats[side]={opticsMs:5,unresolved:0,fillUnresolved:0,
      budgetExceeded:false,cacheReused:false};
  }
  const info=plan.presentation?require('../src/animation/ModernAnimationPresentationCompositor').frameAt(plan.presentation,timeMs):null;
  return {row:{index,timeMs,timestampUs:Math.round(timeMs*1000),images,renderStats,
    ...(info?{referenceId:info.referenceId,referenceCount:info.referenceCount,viewSize:info.viewSize,warnings:[]}: {})},entries};
}
class FakeWorker {
  static instances=[];
  static paused=false;
  static errorAt=-1;
  static staleSpline=false;
  static staleRole=null;
  static wrongManifest=false;
  static reset(){FakeWorker.instances=[];FakeWorker.paused=false;FakeWorker.errorAt=-1;
    FakeWorker.staleSpline=false;FakeWorker.staleRole=null;FakeWorker.wrongManifest=false;}
  constructor(url){this.url=url;this.terminated=false;this.commands=[];
    this.isArchive=url.split('?')[0].endsWith('ModernAnimationArchiveWorker.js');
    FakeWorker.instances.push(this);}
  postMessage(value){
    if(this.terminated)throw Error('Message sent to terminated worker');
    this.commands.push(structuredClone(value));
    if(value.type==='init'){
      assert.equal(value.projectFieldsRevision,project.FIELDS_REVISION);
      this.plan=frameExport.plan(structuredClone(value.project),value);
      if(this.isArchive){this.frames=new Array(this.plan.timesMs.length);this.total=0;
        this.workers=value.workers;}
      queueMicrotask(()=>this.emit({type:'ready',total:this.plan.timesMs.length,
        sides:this.plan.sides.length,
        projectFieldsRevision:FakeWorker.staleRole===(this.isArchive?'archive':'renderer')?undefined:project.FIELDS_REVISION,
        splineProof:FakeWorker.staleSpline?undefined:project.splineProof(this.plan.project)}));
    }else if(value.type==='render'){
      if(FakeWorker.paused)return;
      setTimeout(()=>{
        if(value.index===FakeWorker.errorAt){this.emit({type:'error',message:'RK4 failed'});return;}
        this.emit({type:'frame',index:value.index,frame:fakeFrame(this.plan,value.index)});
      },value.index===0?12:0); // Force out-of-order completion.
    }else if(value.type==='frame'){
      const index=value.index;
      if(this.frames[index])throw Error('Duplicate mock frame');
      this.frames[index]=value.frame;this.total++;
      queueMicrotask(()=>{
        this.emit({type:'progress',completed:this.total,total:this.plan.timesMs.length,
          timeMs:this.plan.timesMs[index],elapsedMs:100+this.total});
        if(this.total===this.plan.timesMs.length){
          this.emit({type:'packing',total:this.total});
          const out=frameExport.assemble(this.plan,this.frames,
            {workers:this.workers,renderElapsedMs:1234});
          if(FakeWorker.wrongManifest)out.manifest.cameraInterpolation='linear';
          this.emit({type:'complete',blob:out.blob,manifest:out.manifest,previewBlob:out.previewBlob});
        }
      });
    }
  }
  terminate(){this.terminated=true;}
  emit(value){if(!this.terminated&&this.onmessage)this.onmessage({data:value});}
}
async function simulatedExport(count,animation=make()){
  FakeWorker.reset();
  const controller=background.create({WorkerCtor:FakeWorker,hardwareConcurrency:8});
  const progress=[],ready=[],packing=[];
  const result=await controller.start({project:animation,fps:5,width:640,height:360,
    workerCount:count,onReady:v=>ready.push(v),onProgress:v=>progress.push(v),
    onPacking:v=>packing.push(v)});
  return {result,progress,ready,packing,workers:FakeWorker.instances,
    archive:FakeWorker.instances[0]};
}
test('parallel controller distributes each timestamp once, reports progress and builds ordered ZIP',async()=>{
  const {result,progress,ready,packing,workers,archive}=await simulatedExport(4);
  assert.equal(workers.length,5); // Four renderers and a separate ZIP worker.
  assert.equal(workers.filter(w=>w.isArchive).length,1);
  assert.equal(ready.length,1);assert.equal(ready[0].workers,4);
  assert.equal(packing.length,1);
  assert.equal(progress.length,26);assert.equal(progress.at(-1).completed,26);
  assert.equal(progress.at(-1).workers,4);
  assert.deepEqual(workers.slice(1).flatMap(w=>w.commands.filter(v=>v.type==='render')
    .map(v=>v.index)).sort((a,b)=>a-b),Array.from({length:26},(_,i)=>i));
  assert.notEqual(archive.commands.filter(v=>v.type==='frame')[0].index,0,
    'worker completion must be allowed to arrive out of timestamp order');
  assert.equal(result.manifest.frameCount,26);
  assert.equal(result.manifest.renderWorkers,4);
  assert.equal(result.manifest.renderElapsedMs,1234);
  assert.equal(result.manifest.frames.at(-1).timestampUs,5000000);
  assert.equal(result.manifest.backgroundColor,'#ffffff');
  const data=Buffer.from(await result.blob.arrayBuffer());
  assert.ok(data.includes(Buffer.from('frames/frame_00025_A.png')));
  assert.ok(data.includes(Buffer.from('manifest.json')));
  assert.equal(workers.every(w=>w.terminated),true);
});
test('1, 2 and 4 workers produce identical PNG bytes in deterministic index order',async()=>{
  const arrays=[];
  for(const count of [1,2,4]){
    const {result}=await simulatedExport(count);
    const bytes=Buffer.from(await result.blob.arrayBuffer());
    const names=[],pngs=[];let at=0;
    while(bytes.readUInt32LE(at)===0x04034b50){
      const len=bytes.readUInt16LE(at+26),size=bytes.readUInt32LE(at+18);
      const name=bytes.subarray(at+30,at+30+len).toString();
      if(name.endsWith('.png')){names.push(name);
        pngs.push(bytes.subarray(at+30+len,at+30+len+size).toString('hex'));}
      at+=30+len+size;
    }
    arrays.push({names,pngs});
  }
  assert.deepEqual(arrays[0],arrays[1]);assert.deepEqual(arrays[0],arrays[2]);
});
test('cancel terminates every in-flight worker immediately and ignores stale results',async()=>{
  FakeWorker.reset();FakeWorker.paused=true;
  const controller=background.create({WorkerCtor:FakeWorker,hardwareConcurrency:8});
  const pending=controller.start({project:make(),fps:5,width:640,height:360,workerCount:4});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(controller.isBusy(),true);
  assert.equal(FakeWorker.instances.length,5);
  assert.equal(FakeWorker.instances.some(w=>w.commands.some(v=>v.type==='render')),true);
  assert.equal(controller.cancel(),true);
  assert.deepEqual(await pending,{cancelled:true});
  assert.equal(FakeWorker.instances.every(w=>w.terminated&&w.onmessage===null),true);
  assert.equal(controller.isBusy(),false);
  assert.equal(controller.cancel(),false);
});
test('invalid plans, worker selection, renderer failures and archive errors reject without a ZIP',async()=>{
  FakeWorker.reset();
  assert.throws(()=>background.create({}).start({project:make()}),/Web Workers/);
  const c=background.create({WorkerCtor:FakeWorker,hardwareConcurrency:8});
  assert.throws(()=>c.start({project:make(),fps:24}),/Unsupported/);
  assert.throws(()=>c.start({project:make(),workerCount:7}),/worker count/);
  assert.equal(background.countFor('auto',2,26),1);
  assert.equal(background.countFor('auto',4,26),2);
  assert.equal(background.countFor('auto',8,26),4);
  assert.equal(background.countFor(4,8,2),2);
  FakeWorker.errorAt=1;
  const failed=c.start({project:make(),fps:5,width:640,height:360,workerCount:2});
  await assert.rejects(failed,/RK4 failed/);
  assert.equal(FakeWorker.instances.every(w=>w.terminated),true);
  FakeWorker.reset();FakeWorker.paused=true;
  const bad=c.start({project:make(),fps:5,width:640,height:360,workerCount:2});
  await new Promise(resolve=>setImmediate(resolve));
  FakeWorker.instances[0].emit({type:'error',message:'Archive limit exceeded'});
  await assert.rejects(bad,/Archive limit exceeded/);
  assert.equal(FakeWorker.instances.every(w=>w.terminated),true);
});
test('worker entrypoint imports actual production optics without DOM or Node require',()=>{
  const dir=path.join(__dirname,'../src/animation');
  const root=vm.createContext({console,setTimeout,clearTimeout,performance,
    TextEncoder,Blob,Uint8Array});
  root.self=root;
  root.importScripts=(...scripts)=>scripts.forEach(rel=>{
    const full=path.resolve(dir,rel.split('?')[0]);
    // No fake document! Importing the legacy DOM constructor must not run it.
    vm.runInContext(fs.readFileSync(full,'utf8'),root,{filename:full});
  });
  vm.runInContext(fs.readFileSync(path.join(dir,'ModernAnimationFrameWorker.js'),'utf8'),root);
  assert.equal(typeof root.CurveAppClass,'function');
  assert.equal(typeof root.CurvatureMainCanvasRenderer.renderPhysical,'function');
  assert.equal(typeof root.CurvatureModernAnimationFrameExport.run,'function');
  assert.equal(typeof root.CurvatureModernAnimationFrameExport.compositeOpaqueWhite,'function');
  const ctx={save(){},restore(){},setTransform(){},beginPath(){},rect(){},clip(){}};
  root.canvas={width:640,height:360,getContext(){return ctx;}};
  const graph=vm.runInContext('createGraph(canvas)',root);
  assert.equal(graph.CanvasWidth,640);
  assert.equal(graph.AutoScalePix,true);
  assert.equal(graph.DevicePixelRatio,1);
  assert.doesNotThrow(()=>graph.SetViewport(0,1,-.5,-2));
  assert.ok(graph.Camera);
});
test('background controller loads as browser script without require/module',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/animation/ModernAnimationBackgroundExport.js'),'utf8');
  const ctx={CurvatureModernAnimationFrameExport:require('../src/animation/ModernAnimationFrameExport')};
  vm.runInNewContext(source,ctx);
  assert.equal(typeof ctx.CurvatureModernAnimationBackgroundExport.create,'function');
});

test('opt-in HUD flag is sent to every PNG render worker and the archive manifest',async()=>{
  FakeWorker.reset();
  const api=background.create({WorkerCtor:FakeWorker,hardwareConcurrency:8});
  const result=await api.start({project:make(),fps:5,width:640,height:360,
    workerCount:2,cameraHud:true});
  assert.equal(result.manifest.cameraHudIncluded,true);
  assert.ok(FakeWorker.instances.every(worker=>{
    const init=worker.commands.find(command=>command.type==='init');
    return !!init&&init.cameraHud===true;
  }));
});

test('Spline PNG export requires matching renderer sample before dispatching frames',async()=>{
  FakeWorker.reset();
  const base=make().baseExperiment;
  const moved=structuredClone(base);
  moved.scene.camera.Height=90;
  const spline=project.create([{experiment:base,holdMs:0},
    {experiment:moved,travelMs:1000}],
    {id:'spline_export_check',name:'Spline renderer check',mode:'camera',interpolation:'spline'});
  const result=await background.create({WorkerCtor:FakeWorker}).start({
    project:spline,fps:5,width:640,height:360,workerCount:1});
  assert.equal(result.cancelled,false);
  FakeWorker.reset();FakeWorker.staleSpline=true;
  await assert.rejects(background.create({WorkerCtor:FakeWorker}).start({
    project:spline,fps:5,width:640,height:360,workerCount:1}),/Spline interpolation mismatch/);
  assert.ok(FakeWorker.instances.every(w=>w.terminated));
  assert.equal(FakeWorker.instances.filter(w=>!w.isArchive)
    .flatMap(w=>w.commands.filter(command=>command.type==='render')).length,0);
  FakeWorker.reset();
});


test('PNG archive cannot silently report Linear after Spline rendering',async()=>{
  FakeWorker.reset();FakeWorker.wrongManifest=true;
  const first=make().baseExperiment,second=structuredClone(first);
  second.scene.camera.Height=65;
  const spline=project.create([{experiment:first,holdMs:0},
    {experiment:second,travelMs:200}],
    {id:'png_manifest_parity',name:'PNG manifest parity',mode:'camera',interpolation:'spline'});
  try{
    await assert.rejects(background.create({WorkerCtor:FakeWorker}).start({
      project:spline,fps:5,width:640,height:360,workerCount:1}),
    /incomplete PNG sequence/);
    assert.ok(FakeWorker.instances.every(worker=>worker.terminated));
  }finally{FakeWorker.reset();}
});


test('full presentation controller forwards frozen options, transfers one PNG and returns preview image',async()=>{
  FakeWorker.reset();const controller=background.create({WorkerCtor:FakeWorker,hardwareConcurrency:8});
  const result=await controller.start({project:make(),fps:5,width:1280,height:720,workerCount:4,
    presentation:{referenceLayout:'hidden',layoutMode:'dynamic',showNarrative:false},previewTimeMs:200});
  assert.equal(result.previewBlob.type,'image/png');assert.equal(result.workers,1);
  assert.deepEqual(result.manifest.sides,['presentation']);assert.equal(result.manifest.frames[0].timeMs,200);
  assert.equal(result.manifest.presentation.showNarrative,false);
  for(const worker of FakeWorker.instances){const init=worker.commands[0];assert.equal(init.previewTimeMs,200);assert.equal(init.presentation.layoutMode,'dynamic');assert.equal(worker.terminated,true);}
  FakeWorker.reset();const seq=await controller.start({project:make(),fps:5,width:1280,height:720,workerCount:2,
    presentation:{referenceLayout:'hidden'}});
  assert.equal(seq.manifest.frameCount,26);assert.ok(seq.manifest.endpointIncluded);
  assert.ok(seq.manifest.frames.every(f=>Object.keys(f.images).join(',')==='presentation'));
});


test('PNG rejects an outdated worker before dispatching any render jobs',async()=>{
  for(const role of ['archive','renderer']){
    FakeWorker.reset();FakeWorker.staleRole=role;
    await assert.rejects(background.create({WorkerCtor:FakeWorker}).start({
      project:make(),fps:5,width:640,height:360,workerCount:2}),/project fields revision mismatch/);
    assert.ok(FakeWorker.instances.every(w=>w.terminated));
    assert.ok(FakeWorker.instances.every(w=>!w.commands.some(c=>c.type==='render')));
  }
  FakeWorker.reset();
});

test('edited Soundly copy passes both PNG worker initializations without losing linked originals or narrative',async()=>{
  const catalog=require('../src/animation/ModernDemoCatalog'),studio=require('../src/animation/ModernAnimationStudio');
  const source=catalog.load()[0].project;
  let draft=studio.fromProject(project.validate({...source,id:'soundly_copy',name:source.name+' (copy)'}));
  const key=draft.frames[4].key;
  draft=studio.editFrame(draft,key,'referenceImageIds',['photo']);
  draft=studio.editFrame(draft,key,'narrativeTitle','Real observation');
  draft=studio.editFrame(draft,key,'description','Observed bridge');
  const photo={version:1,id:'photo',title:'Observation',original:{width:1,height:1,dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII='}};
  // Exercise saved V2 reload and playable V1 build, as Studio does.
  const saved=studio.buildSaved(draft,'soundly_copy');
  const playable=studio.build(studio.fromProject(saved),'soundly_copy');
  assert.equal(saved.version,2);assert.equal(playable.version,1);
  for(const edited of [saved,playable]){
    FakeWorker.reset();
    const api=background.create({WorkerCtor:FakeWorker});
    assert.throws(()=>api.start({project:edited,fps:25,width:1280,height:720,presentation:{},referenceImages:[photo]}),/1479 requested; maximum 751/);
    assert.equal(FakeWorker.instances.length,0);
    const time=project.timeline(edited)[4].arrivalMs;
    const result=await api.start({project:edited,fps:25,width:1280,height:720,presentation:{},referenceImages:[photo],previewTimeMs:time});
    assert.equal(result.manifest.frames[0].referenceId,'photo');
    assert.equal(result.manifest.project.keyframes[4].narrativeTitle,'Real observation');
    assert.equal(result.manifest.project.keyframes[4].description,'Observed bridge');
    assert.equal(result.manifest.project.version,edited.version);
    for(const worker of FakeWorker.instances)assert.deepEqual(worker.commands[0].project,edited);
    FakeWorker.reset();
    const sim=await api.start({project:edited,fps:5,width:640,height:360,workerCount:4});
    assert.equal(sim.manifest.frameCount,297);assert.deepEqual(sim.manifest.sides,['A','B']);
    assert.equal(sim.manifest.project.keyframes[4].referenceImageIds[0],'photo');
    FakeWorker.reset();
    const full=await api.start({project:edited,fps:5,width:1280,height:720,workerCount:4,presentation:{},referenceImages:[photo]});
    assert.equal(full.manifest.frameCount,297);assert.deepEqual(full.manifest.sides,['presentation']);
    assert.ok(full.manifest.frames.some(f=>f.referenceId==='photo'));
    assert.equal(full.manifest.frames.at(-1).timeMs,59100);
  }
});

test('page and every export worker use the same versioned project validator',()=>{
  const root=path.resolve(__dirname,'..'),revision=project.FIELDS_REVISION;
  const url='ModernAnimationProject.js?project-fields='+revision;
  for(const file of ['CurvatureModern.html','src/animation/ModernAnimationFrameWorker.js',
    'src/animation/ModernAnimationArchiveWorker.js','src/animation/ModernAnimationVideoEncoderWorker.js']){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.deepEqual(source.match(/ModernAnimationProject\.js\?[^"']+/g),[url],file);
    if(file.endsWith('Worker.js'))assert.ok(source.includes('ModernAnimationContract.js')&&source.indexOf('ModernAnimationContract.js')<source.indexOf(url),file);
  }
  const input=structuredClone(require('../src/animation/ModernDemoCatalog').load()[0].project);
  input.keyframes[4].badField=true;
  assert.throws(()=>project.validate(input),/Invalid animation project fields.*keyframe 5.*unexpected badField/);
});
