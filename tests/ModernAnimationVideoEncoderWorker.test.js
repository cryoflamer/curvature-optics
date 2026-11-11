'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const projects=require('../src/animation/ModernAnimationProject');
const video=require('../src/animation/ModernAnimationVideoPipeline');
function project(mode='scene'){
  const m={Height:15,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:0,DemoText:'Animation',Description:'',
    ObjType:[3,3],NObjects:[1,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  const a=state.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
    compare.preset('globe-flat-vacuum'),{mode,eyeLevel:false,horizon:false,selected:'A'});
  const b=structuredClone(a);if(mode==='scene')b.scene.surface.showModel=2;
  else b.compare.A.surface='flat';
  return projects.create([{experiment:a,holdMs:0},{experiment:b,travelMs:1000}],
    {id:'vp9_encoder_test',name:'VP9 worker test'});
}
function sandbox(){
  const dir=path.resolve(__dirname,'../src/animation'),messages=[];
  const workers=[];
  class FakeEncoder{
    static async isConfigSupported(config){return {supported:config.codec==='vp09.00.10.08'};}
    constructor(callbacks){this.callbacks=callbacks;this.queue=0;this.outputs=[];
      this.handlers=[];this.closed=false;workers.push(this);}
    configure(config){this.config=config;}
    get encodeQueueSize(){return this.queue;}
    addEventListener(type,callback){if(type==='dequeue')this.handlers.push(callback);}
    encode(frame,params){
      assert.equal(frame.closed,false);
      assert.equal(this.closed,false);
      this.queue++;
      const output=Promise.resolve().then(()=>{
        this.callbacks.output({timestamp:frame.timestamp,
          type:params.keyFrame?'key':'delta',byteLength:5,
          copyTo(out){out.set(Uint8Array.from([0x82,5,4,3,2]));}});
        this.queue--;
        this.handlers.forEach(fn=>fn());
      });
      this.outputs.push(output);
    }
    flush(){return Promise.all(this.outputs);}
    close(){this.closed=true;}
  }
  const root=vm.createContext({console,performance,TextEncoder,Uint8Array,Blob,
    Map,Set,Promise,VideoEncoder:FakeEncoder,VideoFrame:class VideoFrame{},
    postMessage:v=>messages.push(v)});
  root.self=root;
  root.importScripts=(...scripts)=>scripts.forEach(script=>{
    const filename=path.resolve(dir,script);
    vm.runInContext(fs.readFileSync(filename,'utf8'),root,{filename});
  });
  vm.runInContext(fs.readFileSync(path.join(dir,'ModernAnimationVideoEncoderWorker.js'),'utf8'),root);
  return {root,messages,workers};
}
function frame(plan,index){
  const timing=plan.frames[index],frames={};
  for(const side of plan.sides)
    frames[side]={timestamp:timing.timestampUs,closed:false,close(){this.closed=true;}};
  return {index,timestampUs:timing.timestampUs,durationUs:timing.durationUs,
    sampleTimeMs:timing.sampleTimeMs,frames};
}
async function tick(){await new Promise(resolve=>setImmediate(resolve));}
test('encoder worker VP9 uses ordered VideoFrames, closes RGBA inputs and emits finished WebM',async()=>{
  const p=project(),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages,workers}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'standard',workers:2}});
  await tick();
  assert.equal(messages.at(-1).type,'ready');
  const all=plan.frames.map(t=>frame(plan,t.index));
  for(const idx of [4,1,0,3,2])root.onmessage({data:{type:'frame',frame:all[idx]}});
  await tick();await tick();
  const completed=messages.filter(x=>x.type==='complete');
  assert.equal(completed.length,1);
  assert.equal(completed[0].blob.type,'video/webm');
  assert.equal(completed[0].manifest.frameCount,5);
  assert.equal(completed[0].manifest.durationUs,1000000);
  assert.deepEqual(messages.filter(x=>x.type==='progress').map(x=>x.submitted),[1,2,3,4,5]);
  assert.ok(all.every(x=>Object.values(x.frames).every(f=>f.closed)));
  assert.ok(workers.every(w=>w.closed));
});
test('encoder worker Compare A/B creates one ZIP with two videos and manifest',async()=>{
  const p=project('compare'),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages,workers}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'high',workers:2}});
  await tick();
  assert.equal(messages.at(-1).type,'ready');
  for(const t of plan.frames)root.onmessage({data:{type:'frame',frame:frame(plan,t.index)}});
  await tick();await tick();
  const complete=messages.find(x=>x.type==='complete');
  assert.ok(complete,'Compare must finish');
  assert.equal(complete.blob.type,'application/zip');
  const buf=Buffer.from(await complete.blob.arrayBuffer());
  assert.ok(buf.includes(Buffer.from('curvature-animation-A.webm')));
  assert.ok(buf.includes(Buffer.from('curvature-animation-B.webm')));
  assert.ok(buf.includes(Buffer.from('manifest.json')));
  assert.equal(complete.manifest.sides.length,2);
  assert.equal(workers.length,2);
  assert.ok(workers.every(w=>w.closed));
});
test('encoder worker rejects unexpected frames without completing a partial file',async()=>{
  const p=project(),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'standard',workers:1}});
  await tick();
  const bad=frame(plan,0);bad.timestampUs=100;
  root.onmessage({data:{type:'frame',frame:bad}});
  await tick();
  assert.equal(messages.at(-1).type,'error');
  assert.equal(messages.some(x=>x.type==='complete'),false);
  assert.ok(bad.frames.A.closed);
});
