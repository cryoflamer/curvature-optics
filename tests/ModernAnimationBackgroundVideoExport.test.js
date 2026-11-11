'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const projects=require('../src/animation/ModernAnimationProject');
const video=require('../src/animation/ModernAnimationVideoPipeline');
const background=require('../src/animation/ModernAnimationBackgroundVideoExport');
function make(mode='scene'){
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
    {id:'webm_test',name:'Video worker controller'});
}
class FakeWorker{
  static instances=[];static paused=false;static errorAt=-1;
  static reset(){FakeWorker.instances=[];FakeWorker.paused=false;FakeWorker.errorAt=-1;}
  constructor(url){this.url=url;this.encoder=url.includes('VideoEncoderWorker');
    this.closed=false;this.sent=[];FakeWorker.instances.push(this);}
  emit(data){if(!this.closed&&this.onmessage)this.onmessage({data});}
  postMessage(data,transfer){
    if(this.closed)throw Error('Terminated worker');
    this.sent.push({data,transfer});
    if(data.type==='init'||data.type==='video-init'){
      this.plan=video.plan(data.project,data);
      if(this.encoder)this.format=data.format||'webm';
      if(this.encoder){this.pending=new Map();this.submitted=0;this.received=0;this.maxBuffered=0;
        this.window=data.frameWindow;}
      queueMicrotask(()=>this.emit({type:'ready',total:this.plan.frameCount,
        sides:this.plan.sides.length,workers:data.workers}));
    }else if(data.type==='video-render'){
      if(FakeWorker.paused)return;
      setTimeout(()=>{
        if(data.index===FakeWorker.errorAt){this.emit({type:'error',message:'RK4 failed'});return;}
        const time=this.plan.frames[data.index],frames={};
        for(const side of this.plan.sides)frames[side]={closed:false,close(){this.closed=true;}};
        this.emit({type:'video-frame',index:data.index,
          frame:{index:data.index,timestampUs:time.timestampUs,
            durationUs:time.durationUs,sampleTimeMs:time.sampleTimeMs,frames}});
      },data.index===0?15:0);
    }else if(data.type==='frame'){
      assert.equal(transfer.length,this.plan.sides.length);
      this.pending.set(data.frame.index,data.frame);this.received++;
      this.maxBuffered=Math.max(this.maxBuffered,this.pending.size);
      queueMicrotask(()=>{
        while(this.pending.has(this.submitted)){
          this.pending.delete(this.submitted);this.submitted++;
          this.emit({type:'progress',submitted:this.submitted,total:this.plan.frameCount,
            rendered:this.received,buffered:this.pending.size,
            encodedBytes:this.submitted*100,encodeQueue:0,
            timeMs:this.plan.frames[this.submitted-1].sampleTimeMs,elapsedMs:this.submitted*10});
        }
        if(this.submitted===this.plan.frameCount){
          this.emit({type:'muxing',total:this.submitted});
          this.emit({type:'complete',blob:new Blob(['test'],{type:this.plan.sides.length===1?'video/'+this.format:'application/zip'}),
            filename:'test.'+this.format,manifest:{format:data.fakeFormat||this.format||'webm',frameCount:this.plan.frameCount,
              durationUs:this.plan.durationUs,sides:Array.from(this.plan.sides),
              frameWindow:this.window,peakBufferedFrames:this.maxBuffered}});
        }
      });
    }
  }
  terminate(){this.closed=true;}
}
test('bounded parallel WebM controller delivers every frame once with reordered workers',async()=>{
  FakeWorker.reset();
  const api=background.create({WorkerCtor:FakeWorker,hardwareConcurrency:8});
  const progress=[];
  const result=await api.start({project:make(),fps:25,width:640,height:360,
    workerCount:4,onProgress:v=>progress.push(v)});
  assert.equal(result.cancelled,false);
  assert.equal(result.manifest.frameCount,25);
  assert.equal(result.workers,4);
  assert.equal(progress.at(-1).submitted,25);
  const encoder=FakeWorker.instances[0];
  assert.equal(encoder.encoder,true);
  assert.ok(encoder.maxBuffered<=encoder.window);
  const requests=FakeWorker.instances.slice(1).flatMap(w=>w.sent.filter(x=>x.data.type==='video-render').map(x=>x.data.index));
  assert.deepEqual(requests.sort((a,b)=>a-b),Array.from({length:25},(_,i)=>i));
  assert.ok(FakeWorker.instances.every(w=>w.closed));
});
test('Compare A/B exports synchronized frames and uses a single ZIP download',async()=>{
  FakeWorker.reset();
  const result=await background.create({WorkerCtor:FakeWorker,hardwareConcurrency:4}).start({
    project:make('compare'),fps:5,width:640,height:360,workerCount:2});
  assert.equal(result.blob.type,'application/zip');
  assert.deepEqual(result.manifest.sides,['A','B']);
  const encoder=FakeWorker.instances[0];
  assert.ok(encoder.sent.filter(x=>x.data.type==='frame').every(x=>x.transfer.length===2));
});
test('Cancel terminates render and encoder workers immediately and never saves partial WebM',async()=>{
  FakeWorker.reset();FakeWorker.paused=true;
  const api=background.create({WorkerCtor:FakeWorker});
  const pending=api.start({project:make(),fps:25,width:640,height:360,workerCount:4});
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(api.isBusy(),true);
  assert.equal(api.cancel(),true);
  assert.deepEqual(await pending,{cancelled:true});
  assert.equal(api.isBusy(),false);
  assert.ok(FakeWorker.instances.every(w=>w.closed));
  FakeWorker.paused=false;
});
test('renderer errors reject WebM without a partial file',async()=>{
  FakeWorker.reset();FakeWorker.errorAt=0;
  const api=background.create({WorkerCtor:FakeWorker});
  await assert.rejects(api.start({project:make(),fps:5,width:640,height:360}),/RK4 failed/);
  assert.ok(FakeWorker.instances.every(w=>w.closed));
  FakeWorker.errorAt=-1;
});

test('MP4 controller preserves bounded scheduling, format, and Compare ZIP',async()=>{
  FakeWorker.reset();
  const result=await background.create({WorkerCtor:FakeWorker,hardwareConcurrency:4}).start({
    project:make('compare'),fps:5,width:640,height:360,workerCount:2,format:'mp4'});
  assert.equal(result.blob.type,'application/zip');
  assert.equal(result.manifest.format,'mp4');
  assert.equal(FakeWorker.instances[0].sent[0].data.format,'mp4');
  assert.ok(FakeWorker.instances[0].maxBuffered<=FakeWorker.instances[0].window);
  assert.ok(FakeWorker.instances.every(w=>w.closed));
  assert.throws(()=>background.create({WorkerCtor:FakeWorker}).start({
    project:make(),fps:5,width:640,height:360,format:'avi'}),/format/);
});

test('adaptive window constrains RGBA memory for high-resolution Compare',async()=>{
  const high=video.plan(make('compare'),{fps:25,width:1280,height:720});
  const low=video.plan(make(),{fps:25,width:640,height:360});
  assert.equal(background.frameWindow(high,4),4);
  assert.equal(background.frameWindow(low,4),8);
  assert.ok(background.MAX_INFLIGHT_RGBA_BYTES>=32*1024*1024);
  FakeWorker.reset();FakeWorker.paused=true;
  const api=background.create({WorkerCtor:FakeWorker,hardwareConcurrency:8});
  let ready=null;
  const pending=api.start({project:make('compare'),fps:25,width:1280,
    height:720,workerCount:4,onReady:v=>{ready=v;}});
  await new Promise(resolve=>setTimeout(resolve,15));
  assert.equal(ready.frameWindow,4);
  assert.equal(FakeWorker.instances[0].sent[0].data.frameWindow,4);
  const issued=FakeWorker.instances.slice(1).flatMap(w=>w.sent.filter(x=>
    x.data.type==='video-render'));
  assert.equal(issued.length,4,'no more than the budget fits are issued');
  api.cancel();assert.deepEqual(await pending,{cancelled:true});
  FakeWorker.paused=false;
});
test('UI render-progress callback failures terminate every transferred-frame worker',async()=>{
  FakeWorker.reset();
  const api=background.create({WorkerCtor:FakeWorker,hardwareConcurrency:4});
  await assert.rejects(api.start({project:make(),fps:5,width:640,height:360,
    workerCount:2,onRendered(){throw Error('UI callback failed');}}),/UI callback failed/);
  assert.equal(api.isBusy(),false);
  assert.ok(FakeWorker.instances.every(w=>w.closed));
});
