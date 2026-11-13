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
function sandbox(options={}){
  const held=[];
  const dir=path.resolve(__dirname,'../src/animation'),messages=[];
  const workers=[];
  class FakeEncoder{
    static async isConfigSupported(config){return {supported:config.codec==='vp09.00.10.08'||config.codec.startsWith('avc1.42E0')};}
    constructor(callbacks){this.callbacks=callbacks;this.queue=0;this.outputs=[];
      this.handlers=[];this.closed=false;this.maxQueued=0;workers.push(this);}
    configure(config){this.config=config;}
    get encodeQueueSize(){return this.queue;}
    addEventListener(type,callback){if(type==='dequeue')this.handlers.push(callback);}
    encode(frame,params){
      assert.equal(frame.closed,false);
      assert.equal(this.closed,false);
      this.queue++;this.maxQueued=Math.max(this.maxQueued,this.queue);
      const output=new Promise(resolve=>{
        const complete=()=>{
        const mp4=this.config.codec.startsWith('avc1.42E0');
        const bytes=mp4?Uint8Array.from([0,0,0,2,0x65,0x88]):Uint8Array.from([0x82,5,4,3,2]);
        this.callbacks.output({timestamp:frame.timestamp,
          type:params.keyFrame?'key':'delta',
          byteLength:options.oversizedChunk?193*1024*1024:bytes.length,
          copyTo(out){out.set(bytes);}},mp4?{decoderConfig:{description:
          Uint8Array.from([1,66,0,31,255,225,0,3,0x67,0x42,0x1f,1,0,2,0x68,0xce]).buffer}}:undefined);
        this.queue--;
        this.handlers.forEach(fn=>fn());resolve();
        };
        if(options.manualDequeue)held.push(complete);
        else queueMicrotask(complete);
      });
      this.outputs.push(output);
    }
    flush(){return Promise.all(this.outputs);}
    close(){this.closed=true;}
  }
  const root=vm.createContext({console,performance,TextEncoder,Uint8Array,Blob,
    Map,Set,Promise,ArrayBuffer,VideoEncoder:FakeEncoder,VideoFrame:class VideoFrame{},
    postMessage:v=>messages.push(v)});
  root.self=root;
  root.importScripts=(...scripts)=>scripts.forEach(script=>{
    const filename=path.resolve(dir,script.split('?')[0]);
    vm.runInContext(fs.readFileSync(filename,'utf8'),root,{filename});
  });
  vm.runInContext(fs.readFileSync(path.join(dir,'ModernAnimationVideoEncoderWorker.js'),'utf8'),root);
  return {root,messages,workers,release:()=>{
    if(!held.length)throw Error('No held codec callback');
    held.shift()();
  }};
}
function frame(plan,index){
  const timing=plan.frames[index],frames={};
  for(const side of plan.outputSides)
    frames[side]={timestamp:timing.timestampUs,closed:false,close(){this.closed=true;}};
  return {index,timestampUs:timing.timestampUs,durationUs:timing.durationUs,
    sampleTimeMs:timing.sampleTimeMs,frames};
}
async function tick(){await new Promise(resolve=>setImmediate(resolve));}
test('encoder worker VP9 uses ordered VideoFrames, closes RGBA inputs and emits finished WebM',async()=>{
  const p=project(),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages,workers}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'standard',workers:2,frameWindow:4}});
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
  const progress=messages.filter(x=>x.type==='progress');
  assert.ok(progress.every(x=>x.rendered>=x.submitted&&x.buffered<=4&&
    x.encodeQueue>=0&&x.encodedBytes>=0));
  assert.equal(completed[0].manifest.frameWindow,4);
  assert.ok(completed[0].manifest.peakEncoderQueue<=3);
  assert.ok(completed[0].manifest.encodedBytes>0);
  const profiling=completed[0].manifest.profiling;
  assert.equal(profiling.schema,'curvature-video-profile-v1');
  assert.equal(profiling.units,'ms');
  assert.equal(profiling.codecOutputLatency.samples,5);
  assert.equal(profiling.encoderHandoffWait.samples,5);
  assert.equal(profiling.outOfOrderArrivals,3);
  assert.ok(profiling.codecOutputLatency.meanMs>=0);
  assert.ok(profiling.finalize.flushMs>=0&&profiling.finalize.muxMs>=0);
  assert.equal(profiling.finalize.zipMs,0);
  assert.ok(profiling.encoderWorkerElapsedMs>=0);
});
test('encoder worker Compare A/B encodes a single 1280×720 WebM',async()=>{
  const p=project('compare'),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages,workers}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'high',workers:2,frameWindow:4}});
  await tick();
  assert.equal(messages.at(-1).type,'ready');
  for(const t of plan.frames)root.onmessage({data:{type:'frame',frame:frame(plan,t.index)}});
  await tick();await tick();
  const complete=messages.find(x=>x.type==='complete');
  assert.ok(complete,'Compare must finish');
  assert.equal(complete.blob.type,'video/webm');
  assert.equal(complete.filename,'vp9-worker-test_1280x720_5fps_compare.webm');
  assert.equal(complete.manifest.width,1280);
  assert.equal(complete.manifest.height,720);
  assert.equal(complete.manifest.viewWidth,640);
  assert.equal(complete.manifest.compareLayout,'side-by-side');
  assert.equal(complete.manifest.sides.length,2);
  assert.equal(complete.manifest.outputStreams,1);
  assert.equal(complete.manifest.frameWindow,4);
  assert.deepEqual(messages.filter(x=>x.type==='packing'),[]);
  assert.equal(workers.length,1);
  assert.equal(workers[0].config.width,1280);
  assert.equal(workers[0].config.height,720);
  assert.ok(workers.every(w=>w.closed));
  assert.ok(complete.manifest.profiling.finalize.zipMs>=0);
  // The embedded JSON is created before ZIP assembly; unlike the completion
  // message it cannot include its own packing duration.
  assert.equal(complete.manifest.profiling.schema,'curvature-video-profile-v1');
});
test('encoder worker rejects unexpected frames without completing a partial file',async()=>{
  const p=project(),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'standard',workers:1,frameWindow:2}});
  await tick();
  const bad=frame(plan,0);bad.timestampUs=100;
  root.onmessage({data:{type:'frame',frame:bad}});
  await tick();
  assert.equal(messages.at(-1).type,'error');
  assert.equal(messages.some(x=>x.type==='complete'),false);
  assert.ok(bad.frames.A.closed);
});

test('encoder worker H.264 outputs valid MP4 media boxes and selected format',async()=>{
  const p=project(),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages,workers}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'standard',workers:2,frameWindow:4,format:'mp4'}});
  await tick();
  assert.equal(messages.at(-1).type,'ready');
  assert.equal(workers[0].config.codec,'avc1.42E01F');
  assert.equal(workers[0].config.avc.format,'avc');
  const all=plan.frames.map(t=>frame(plan,t.index));
  for(const idx of [4,1,0,3,2])root.onmessage({data:{type:'frame',frame:all[idx]}});
  await tick();await tick();
  const result=messages.find(x=>x.type==='complete');
  assert.ok(result);
  assert.equal(result.blob.type,'video/mp4');
  assert.equal(result.manifest.format,'mp4');
  assert.equal(result.filename,'vp9-worker-test_640x360_5fps.mp4');
  const bytes=Buffer.from(await result.blob.arrayBuffer());
  for(const tag of ['ftyp','moov','avc1','avcC','stts','stss','mdat'])
    assert.ok(bytes.includes(Buffer.from(tag)),tag);
  assert.ok(all.every(x=>Object.values(x.frames).every(f=>f.closed)));
  assert.ok(workers.every(w=>w.closed));
});
test('encoder worker MP4 Compare encodes a single 1280×720 MP4',async()=>{
  const p=project('compare'),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'high',workers:2,frameWindow:4,format:'mp4'}});
  await tick();
  for(const t of plan.frames)root.onmessage({data:{type:'frame',frame:frame(plan,t.index)}});
  await tick();await tick();
  const result=messages.find(x=>x.type==='complete');
  assert.ok(result);
  assert.equal(result.blob.type,'video/mp4');
  const bytes=Buffer.from(await result.blob.arrayBuffer());
  assert.ok(bytes.includes(Buffer.from('avc1')));
  assert.equal(result.filename,'vp9-worker-test_1280x720_5fps_compare.mp4');
  assert.equal(result.manifest.sides.length,2);
  assert.equal(result.manifest.outputStreams,1);
  assert.equal(result.manifest.width,1280);
  assert.deepEqual(messages.filter(x=>x.type==='packing'),[]);
});

test('encoder backpressure resumes after slow WebCodecs dequeue events',async()=>{
  const p=project(),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages,workers,release}=sandbox({manualDequeue:true});
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'standard',workers:2,frameWindow:4}});
  await tick();assert.equal(messages.at(-1).type,'ready');
  for(const i of [4,1,0,3,2])root.onmessage({data:{type:'frame',frame:frame(plan,i)}});
  assert.deepEqual(messages.filter(x=>x.type==='progress').map(x=>x.submitted),[1,2,3]);
  assert.equal(workers[0].maxQueued,3);
  release();await tick();
  assert.equal(messages.filter(x=>x.type==='progress').at(-1).submitted,4);
  release();await tick();
  assert.equal(messages.filter(x=>x.type==='progress').at(-1).submitted,5);
  for(let i=0;i<3;i++){release();await tick();}
  await tick();
  assert.equal(messages.filter(x=>x.type==='complete').length,1);
  assert.equal(messages.filter(x=>x.type==='error').length,0);
  assert.ok(workers.every(w=>w.closed));
});
test('oversized encoded output fails early without allocating a 193 MiB sample',async()=>{
  const p=project(),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages}=sandbox({oversizedChunk:true});
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'standard',workers:2,frameWindow:4}});
  await tick();
  root.onmessage({data:{type:'frame',frame:frame(plan,0)}});
  await tick();
  assert.match(messages.find(x=>x.type==='error').message,/192 MiB/);
  assert.equal(messages.some(x=>x.type==='complete'),false);
});

// Worker render metrics are untrusted scalar telemetry; absent samples remain
// zero rather than being misreported as a measured 0 ms RK4 run.
test('encoder profile aggregates per-view render and nested optics timings',async()=>{
  const p=project('compare'),plan=video.plan(p,{fps:5,width:640,height:360});
  const {root,messages}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    quality:'standard',workers:2,frameWindow:4,format:'mp4'}});
  await tick();
  for(const t of plan.frames){
    const bundle=frame(plan,t.index);
    bundle.stats={A:{renderMs:7,opticsMs:5},B:{renderMs:11,opticsMs:8}};
    root.onmessage({data:{type:'frame',frame:bundle}});
  }
  await tick();await tick();
  const result=messages.find(m=>m.type==='complete');
  assert.ok(result);
  const prof=result.manifest.profiling;
  assert.equal(prof.render.samples,10);
  assert.equal(prof.render.totalMs,90);
  assert.equal(prof.reportedOptics.samples,10);
  assert.equal(prof.reportedOptics.totalMs,65);
  assert.equal(prof.codecOutputLatency.samples,5);
  assert.ok(prof.codecActiveWallMs>=0);
  assert.ok(prof.finalize.zipMs>=0);
});

test('legacy separate Compare layout still produces two independent files when requested',async()=>{
  const p=project('compare');
  const plan=video.plan(p,{fps:5,width:640,height:360,compareLayout:'separate'});
  const {root,messages,workers}=sandbox();
  root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
    compareLayout:'separate',quality:'standard',workers:2,frameWindow:4}});
  await tick();
  for(const t of plan.frames)root.onmessage({data:{type:'frame',frame:frame(plan,t.index)}});
  await tick();await tick();
  const result=messages.find(x=>x.type==='complete');
  assert.ok(result);assert.equal(result.blob.type,'application/zip');
  assert.equal(result.manifest.outputStreams,2);
  assert.equal(result.manifest.compareLayout,'separate');
  assert.equal(workers.length,2);
  const bytes=Buffer.from(await result.blob.arrayBuffer());
  assert.ok(bytes.includes(Buffer.from('vp9-worker-test_640x360_5fps_A.webm')));
  assert.ok(bytes.includes(Buffer.from('vp9-worker-test_640x360_5fps_B.webm')));
});

test('selected separate Compare layout produces two synchronized video files for MP4 and WebM',async()=>{
  const p=project('compare');
  for(const format of ['mp4','webm']){
    const planned=video.plan(p,{fps:5,width:640,height:360,compareLayout:'separate'});
    const {root,messages,workers}=sandbox();
    root.onmessage({data:{type:'init',project:p,fps:5,width:640,height:360,
      format,compareLayout:'separate',quality:'standard',workers:2,frameWindow:4}});
    await tick();
    assert.equal(messages.at(-1).type,'ready');
    for(const t of planned.frames)
      root.onmessage({data:{type:'frame',frame:frame(planned,t.index)}});
    await tick();await tick();
    const completed=messages.find(x=>x.type==='complete');
    assert.ok(completed,format+' encoder must finish');
    assert.equal(completed.blob.type,'application/zip');
    assert.equal(completed.manifest.outputStreams,2);
    assert.equal(completed.manifest.width,640);
    assert.equal(completed.manifest.height,360);
    assert.equal(completed.manifest.compareLayout,'separate');
    assert.equal(completed.manifest.durationUs,planned.durationUs);
    assert.equal(completed.manifest.frameCount,planned.frameCount);
    assert.equal(completed.manifest.format,format);
    assert.equal(completed.filename,'vp9-worker-test_640x360_5fps_compare-separate.zip');
    const zip=Buffer.from(await completed.blob.arrayBuffer());
    assert.ok(zip.includes(Buffer.from('vp9-worker-test_640x360_5fps_A.'+format)));
    assert.ok(zip.includes(Buffer.from('vp9-worker-test_640x360_5fps_B.'+format)));
    assert.ok(zip.includes(Buffer.from('manifest.json')));
    assert.ok(workers.every(encoder=>encoder.closed));
  }
});
