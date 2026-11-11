'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const vm=require('node:vm');
const project=require('../src/animation/ModernAnimationProject');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const frames=require('../src/animation/ModernAnimationFrameExport');
function make(mode='scene'){
  const m={Height:15,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:0,DemoText:'Animation',Description:'',
    ObjType:[3,3],NObjects:[1,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  const a=state.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
    compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:false,horizon:false,selected:'A'});
  const b=structuredClone(a);
  if(mode==='scene')b.scene.surface.showModel=2;
  else b.compare.A.surface='flat';
  return project.create([{experiment:a,holdMs:0},{experiment:b,travelMs:1000}],
    {id:'parallel_test',name:'Parallel PNG parity'});
}
function frame(plan,index){
  const timeMs=plan.timesMs[index],images={},entries=[];
  for(const side of plan.sides){
    const name='frames/frame_'+String(index).padStart(5,'0')+'_'+side+'.png';
    images[side]=name;
    entries.push({name,data:Uint8Array.from([137,80,78,71,13,10,26,10,index,side.charCodeAt(0)])});
  }
  return {row:{index,timeMs,timestampUs:Math.round(timeMs*1000),images},entries};
}
function archiveSandbox(){
  const dir=path.join(__dirname,'../src/animation'),messages=[];
  const root=vm.createContext({console,performance,TextEncoder,Uint8Array,Blob});
  root.self=root;
  root.postMessage=v=>messages.push(v);
  root.importScripts=(...scripts)=>scripts.forEach(name=>{
    const filename=path.resolve(dir,name);
    vm.runInContext(fs.readFileSync(filename,'utf8'),root,{filename});
  });
  vm.runInContext(fs.readFileSync(path.join(dir,'ModernAnimationArchiveWorker.js'),'utf8'),root);
  return {root,messages};
}
test('archive worker loads pure production modules without DOM, document or optical renderer',()=>{
  const {root}=archiveSandbox();
  assert.equal(typeof root.CurvatureModernAnimationFrameExport.assemble,'function');
  assert.equal(root.document,undefined);
  assert.equal(root.CurvatureMainCanvasRenderer,undefined);
});
test('actual archive worker processes out-of-order Compare A/B frames and embeds parallel diagnostics',async()=>{
  const {root,messages}=archiveSandbox();
  const p=frames.plan(make('compare'),{fps:5,width:640,height:360});
  root.self.onmessage({data:{type:'init',project:p.project,fps:p.fps,
    width:p.width,height:p.height,workers:2}});
  assert.equal(messages[0].type,'ready');
  assert.deepEqual(Array.from(p.sides),['A','B']);
  for(const index of [4,2,0,5,1,3]){
    root.self.onmessage({data:{type:'frame',index,frame:frame(p,index)}});
  }
  assert.equal(messages.filter(x=>x.type==='progress').length,6);
  assert.equal(messages.filter(x=>x.type==='packing').length,1);
  const done=messages.at(-1);
  assert.equal(done.type,'complete');
  assert.equal(done.manifest.frameCount,6);
  assert.equal(done.manifest.renderWorkers,2);
  assert.deepEqual(Array.from(done.manifest.frames,x=>x.index),[0,1,2,3,4,5]);
  const buffer=Buffer.from(await done.blob.arrayBuffer());
  assert.equal(buffer.readUInt32LE(0),0x04034b50);
  assert.ok(buffer.includes(Buffer.from('frames/frame_00005_B.png')));
});
test('archive worker rejects duplicates, invalid worker count and truncated payloads',()=>{
  const p=frames.plan(make(),{fps:5,width:640,height:360});
  {
    const {root,messages}=archiveSandbox();
    root.self.onmessage({data:{type:'init',project:p.project,fps:p.fps,
      width:p.width,height:p.height,workers:5}});
    assert.equal(messages.at(-1).type,'error');
    assert.match(messages.at(-1).message,/worker count/);
  }
  {
    const {root,messages}=archiveSandbox();
    root.self.onmessage({data:{type:'init',project:p.project,fps:p.fps,
      width:p.width,height:p.height,workers:1}});
    root.self.onmessage({data:{type:'frame',index:0,frame:frame(p,0)}});
    root.self.onmessage({data:{type:'frame',index:0,frame:frame(p,0)}});
    assert.equal(messages.at(-1).type,'error');
    assert.match(messages.at(-1).message,/Duplicate/);
    assert.equal(messages.some(x=>x.type==='complete'),false);
  }
  {
    const {root,messages}=archiveSandbox();
    root.self.onmessage({data:{type:'init',project:p.project,fps:p.fps,
      width:p.width,height:p.height,workers:1}});
    const bad=frame(p,0);bad.entries[0].data=new Uint8Array(0);
    root.self.onmessage({data:{type:'frame',index:0,frame:bad}});
    assert.equal(messages.at(-1).type,'progress');
    // The full sequence fails final ZIP validation; no partial ZIP is possible.
    for(let i=1;i<p.timesMs.length;i++)
      root.self.onmessage({data:{type:'frame',index:i,frame:frame(p,i)}});
    assert.equal(messages.at(-1).type,'error');
    assert.equal(messages.some(x=>x.type==='complete'),false);
  }
});
test('indexed frame painter and sequential runner produce identical rows and PNG ZIP content',async()=>{
  const p=frames.plan(make('compare'),{fps:5,width:640,height:360});
  function renderer(sample,side,dimensions){
    const data=Uint8Array.from([137,80,78,71,13,10,26,10,dimensions.index,
      side.charCodeAt(0),sample.compare.A.surface==='flat'?2:1]);
    return {quality:'accurate',canvas:{width:640,height:360,
      getContext(){return {save(){},restore(){},setTransform(){},fillRect(){}};},
      convertToBlob:async()=>new Blob([data],{type:'image/png'})},
    metrics:{opticalQuality:'accurate',unresolved:0,timings:{opticsMs:1}}};
  }
  const seq=await frames.run({project:p.project,fps:p.fps,width:p.width,height:p.height,
    render:renderer});
  const out=await Promise.all(p.timesMs.map((_,index)=>
    frames.renderTimestamp(p,index,renderer)));
  const parallel=frames.assemble(p,out.reverse().sort((a,b)=>a.row.index-b.row.index));
  assert.deepEqual(seq.manifest,parallel.manifest);
  assert.deepEqual(Buffer.from(await seq.blob.arrayBuffer()),
    Buffer.from(await parallel.blob.arrayBuffer()));
});
