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
  for(const side of plan.sides){
    const name='frames/frame_'+String(index).padStart(5,'0')+'_'+side+'.png';
    images[side]=name;
    entries.push({name,data:Uint8Array.from([...pngHeader,index&255,index>>>8,side.charCodeAt(0)])});
    renderStats[side]={opticsMs:5,unresolved:0,fillUnresolved:0,
      budgetExceeded:false,cacheReused:false};
  }
  return {row:{index,timeMs,timestampUs:Math.round(timeMs*1000),images,renderStats},entries};
}
class FakeWorker {
  static instances=[];
  static paused=false;
  static errorAt=-1;
  static reset(){FakeWorker.instances=[];FakeWorker.paused=false;FakeWorker.errorAt=-1;}
  constructor(url){this.url=url;this.terminated=false;this.commands=[];
    this.isArchive=url.endsWith('ModernAnimationArchiveWorker.js');
    FakeWorker.instances.push(this);}
  postMessage(value){
    if(this.terminated)throw Error('Message sent to terminated worker');
    this.commands.push(value);
    if(value.type==='init'){
      this.plan=frameExport.plan(value.project,value);
      if(this.isArchive){this.frames=new Array(this.plan.timesMs.length);this.total=0;
        this.workers=value.workers;}
      queueMicrotask(()=>this.emit({type:'ready',total:this.plan.timesMs.length,
        sides:this.plan.sides.length}));
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
          this.emit({type:'complete',blob:out.blob,manifest:out.manifest});
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
    const full=path.resolve(dir,rel);
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
