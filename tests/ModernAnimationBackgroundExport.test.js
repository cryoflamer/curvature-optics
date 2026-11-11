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
class FakeWorker {
  static instances=[];
  constructor(url){this.url=url;this.terminated=false;FakeWorker.instances.push(this);}
  postMessage(value){this.request=value;}
  terminate(){this.terminated=true;}
  emit(value){this.onmessage({data:value});}
}
test('worker controller validates plan and delivers progress and ZIP without main-thread rendering',async()=>{
  const seen=[];
  const c=background.create({WorkerCtor:FakeWorker});
  const pending=c.start({project:make(),fps:5,width:640,height:360,
    onReady:x=>seen.push(['ready',x.total]),onProgress:x=>seen.push(['progress',x.completed])});
  assert.equal(c.isBusy(),true);
  const w=FakeWorker.instances.at(-1);
  assert.equal(w.url,'src/animation/ModernAnimationFrameWorker.js');
  assert.equal(w.request.type,'start');
  assert.equal(w.request.project.mode,'physical');
  w.emit({type:'ready',total:26,sides:1});
  w.emit({type:'progress',completed:1,total:26,timeMs:0,elapsedMs:12});
  const blob=new Blob(['ZIP'],{type:'application/zip'});
  w.emit({type:'complete',blob,manifest:{frameCount:26,sides:['A']}});
  assert.deepEqual(await pending,{cancelled:false,blob,manifest:{frameCount:26,sides:['A']}});
  assert.deepEqual(seen,[['ready',26],['progress',1]]);
  assert.equal(c.isBusy(),false);
  assert.equal(w.terminated,true);
});
test('cancel terminates a synchronous worker immediately and discards late results',async()=>{
  const c=background.create({WorkerCtor:FakeWorker});
  const pending=c.start({project:make(),fps:5,width:640,height:360});
  const w=FakeWorker.instances.at(-1);
  assert.equal(c.cancel(),true);
  assert.equal(w.terminated,true);
  assert.equal(c.isBusy(),false);
  assert.deepEqual(await pending,{cancelled:true});
  assert.equal(c.cancel(),false);
  assert.equal(w.onmessage,null);
});
test('missing Worker, invalid plan, worker errors and incomplete results fail clearly',async()=>{
  assert.throws(()=>background.create({}).start({project:make()}),/Web Workers/);
  const c=background.create({WorkerCtor:FakeWorker});
  assert.throws(()=>c.start({project:make(),fps:24}),/Unsupported/);
  const pending=c.start({project:make(),fps:5,width:640,height:360});
  const w=FakeWorker.instances.at(-1);
  w.emit({type:'error',message:'OffscreenCanvas unavailable'});
  await assert.rejects(pending,/OffscreenCanvas unavailable/);
  const second=c.start({project:make(),fps:5,width:640,height:360});
  FakeWorker.instances.at(-1).emit({type:'complete',blob:new Blob(['x']),manifest:{frameCount:1}});
  await assert.rejects(second,/incomplete/);
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
