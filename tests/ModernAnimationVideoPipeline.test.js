'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const projects=require('../src/animation/ModernAnimationProject');
const png=require('../src/animation/ModernAnimationFrameExport');
const video=require('../src/animation/ModernAnimationVideoPipeline');
function make(mode='scene',durationMs=5000){
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
  return projects.create([{experiment:a,holdMs:0},
    {experiment:b,travelMs:durationMs}],{id:'video_test',name:'Video foundation'});
}
function ctx(){return {save(){},restore(){},setTransform(){},fillRect(){
  assert.equal(this.globalCompositeOperation,'destination-over');
  assert.equal(this.fillStyle,'#fff');
}};}
function mockFrame(index,plan,sides=plan.sides){
  const t=plan.frames[index];
  const frames={};
  for(const side of sides)frames[side]={closed:false,close(){this.closed=true;}};
  return {index,timestampUs:t.timestampUs,durationUs:t.durationUs,frames};
}
test('video is exactly 5 seconds at 25 FPS, includes final physical state without extra 40 ms',()=>{
  const p=video.plan(make());
  assert.equal(p.frameCount,125);
  assert.equal(p.durationUs,5000000);
  assert.deepEqual(p.frames[0],{index:0,timestampUs:0,durationUs:40000,sampleTimeMs:0});
  assert.deepEqual(p.frames.at(-1),{
    index:124,timestampUs:4960000,durationUs:40000,sampleTimeMs:5000});
  assert.equal(p.frames.at(-1).timestampUs+p.frames.at(-1).durationUs,p.durationUs);
  assert.equal(png.plan(make()).timesMs.length,126,'PNG inclusive endpoint is unaffected');
  assert.equal(projects.sampleAt(p.project,p.frames.at(-1).sampleTimeMs).scene.surface.showModel,2);
  assert.equal(projects.sampleAt(p.project,p.frames[0].sampleTimeMs).scene.surface.showModel,1);
});
test('non-integral FPS boundaries never accumulate time drift or extend duration',()=>{
  const p=video.plan(make('scene',1051),{fps:30,width:1280,height:720});
  assert.equal(p.frameCount,32);
  assert.equal(p.frames[1].timestampUs,33333);
  assert.equal(p.frames[2].timestampUs,66667);
  assert.equal(p.frames[3].timestampUs,100000);
  assert.equal(p.frames.at(-1).timestampUs,1033333);
  assert.equal(p.frames.at(-1).durationUs,17667);
  assert.equal(p.frames.at(-1).sampleTimeMs,1051);
  for(let i=1;i<p.frames.length;i++){
    assert.equal(p.frames[i-1].timestampUs+p.frames[i-1].durationUs,p.frames[i].timestampUs);
    assert.ok(p.frames[i].durationUs>0);
  }
  assert.equal(p.frames.at(-1).timestampUs+p.frames.at(-1).durationUs,1051000);
  assert.equal(p.width,1280);assert.equal(p.height,720);
});
test('sub-microsecond excess over an FPS boundary does not create a zero-duration frame',()=>{
  const p=video.plan(make('scene',200.0001),{fps:5});
  assert.equal(p.durationUs,200000);
  assert.equal(p.frameCount,1);
  assert.equal(p.frames[0].durationUs,200000);
});
test('scene and Compare plans use the same timestamps but distinct side sets',()=>{
  const a=video.plan(make('scene'));
  const b=video.plan(make('compare'));
  assert.deepEqual(Array.from(a.sides),['A']);
  assert.deepEqual(Array.from(b.sides),['A','B']);
  assert.deepEqual(Array.from(a.frames,x=>x.timestampUs),Array.from(b.frames,x=>x.timestampUs));
  assert.equal(b.frameCount,125);
});
test('shared input validation rejects illegal FPS, dimensions and empty timelines',()=>{
  const p=make();
  assert.throws(()=>video.plan(p,{fps:24}),/Unsupported/);
  assert.throws(()=>video.plan(p,{width:199,height:200}),/Unsupported/);
  const empty=structuredClone(p);
  empty.keyframes[1].travelMs=0;
  assert.throws(()=>video.plan(empty),/Invalid animation number/);
});
test('accurate Canvas becomes opaque VideoFrame with direct pixel source, no PNG roundtrip',async()=>{
  const p=video.plan(make(),{fps:25,width:640,height:360});
  let encodedPng=0,seen=[];
  const canvas={width:640,height:360,getContext(){return ctx();},
    convertToBlob(){encodedPng++;throw Error('Must not PNG-encode for video');}};
  class Frame{
    constructor(source,opts){
      assert.equal(source,canvas);
      this.timestamp=opts.timestamp;this.duration=opts.duration;this.closed=false;
      seen.push(opts);
    }
    close(){this.closed=true;}
  }
  const final=await video.renderTimestamp(p,124,async(experiment,side,settings)=>{
    assert.equal(side,'A');assert.equal(settings.timeMs,5000);
    assert.equal(experiment.scene.surface.showModel,2);
    return {quality:'accurate',canvas,metrics:{opticalQuality:'accurate'}};
  },Frame);
  assert.equal(final.timestampUs,4960000);
  assert.equal(final.durationUs,40000);
  assert.equal(final.frames.A.timestamp,4960000);
  assert.equal(final.frames.A.duration,40000);
  assert.deepEqual(seen,[{timestamp:4960000,duration:40000}]);
  assert.equal(encodedPng,0);
  video.closeFrames(final);
  assert.equal(final.frames.A.closed,true);
});
test('Compare frames are synchronized and constructed independently per side',async()=>{
  const p=video.plan(make('compare'),{fps:5,width:640,height:360});
  const got=[];
  class Frame{constructor(canvas,opts){this.canvas=canvas;this.timestamp=opts.timestamp;
    this.duration=opts.duration;}close(){this.closed=true;}}
  const r=await video.renderTimestamp(p,2,async(_sample,side,opts)=>{
    got.push([side,opts.timestampUs,opts.timeMs]);
    return {canvas:{width:640,height:360,getContext:()=>ctx()},quality:'accurate'};
  },Frame);
  assert.deepEqual(got,[['A',400000,400],['B',400000,400]]);
  assert.equal(r.frames.A.timestamp,r.frames.B.timestamp);
  assert.notEqual(r.frames.A.canvas,r.frames.B.canvas);
  video.closeFrames(r);
  assert.equal(r.frames.A.closed,true);assert.equal(r.frames.B.closed,true);
});
test('Fast mode is rejected and a failing B render closes the completed A frame',async()=>{
  const p=video.plan(make('compare'),{fps:5,width:640,height:360});
  const allocated=[];
  class Frame{constructor(){this.closed=false;allocated.push(this);}close(){this.closed=true;}}
  await assert.rejects(()=>video.renderTimestamp(p,0,async(_s,side)=>({
    quality:side==='A'?'accurate':'fast',canvas:{width:640,height:360,getContext:()=>ctx()}
  }),Frame),/Accurate RK4/);
  assert.equal(allocated.length,1);assert.equal(allocated[0].closed,true);
  const stop={cancelled:false};
  const cancelled=await video.renderTimestamp(p,0,async()=>{
    stop.cancelled=true;
    return {quality:'accurate',canvas:{width:640,height:360,getContext:()=>ctx()}};
  },Frame,stop);
  assert.equal(cancelled,null);
  assert.ok(allocated.every(f=>f.closed));
});
test('bounded reordering preserves timestamp order despite out-of-order completions',()=>{
  const p=video.plan(make('compare'),{fps:5,width:640,height:360});
  let accepted=[];
  const sink=video.orderedGate(p,{capacity:4,consume:frame=>{
    assert.equal(frame.frames.A.closed,false);
    accepted.push(frame.index);
  }});
  for(const i of [4,3,2,1])sink.offer(mockFrame(i,p));
  assert.equal(sink.available(),0);
  assert.throws(()=>sink.offer(mockFrame(5,p)),/backpressure/);
  const head=mockFrame(0,p);
  const progress=sink.offer(head);
  assert.deepEqual(accepted,[0,1,2,3,4]);
  assert.equal(progress.completed,5);
  assert.equal(head.frames.A.closed,true);
  assert.equal(head.frames.B.closed,true);
  for(let i=5;i<p.frameCount;i++)sink.offer(mockFrame(i,p));
  assert.equal(sink.completed(),true);
  assert.equal(accepted.length,p.frameCount);
});
test('duplicate, invalid timestamp, incomplete Compare and cancellation do not leak buffered frames',()=>{
  const p=video.plan(make('compare'),{fps:5,width:640,height:360});
  const sink=video.orderedGate(p,{capacity:2,consume:()=>{}});
  const x=mockFrame(2,p),y=mockFrame(3,p);
  sink.offer(x);sink.offer(y);
  assert.equal(sink.available(),0);
  assert.throws(()=>sink.offer(mockFrame(2,p)),/duplicate|Unexpected/i);
  assert.throws(()=>sink.offer(mockFrame(4,p)),/backpressure/);
  const bogus=mockFrame(0,p);bogus.timestampUs++;
  assert.throws(()=>sink.offer(bogus),/Unexpected/);
  const broken=mockFrame(0,p,['A']);
  assert.throws(()=>sink.offer(broken),/incomplete/);
  sink.cancel();
  assert.equal(x.frames.A.closed,true);
  assert.equal(y.frames.B.closed,true);
  assert.equal(sink.available(),0);
  assert.throws(()=>sink.offer(mockFrame(0,p)),/closed/);
  assert.throws(()=>video.orderedGate(p,{capacity:99,consume:()=>{}}),/capacity/);
});
test('consumer exceptions close current and buffered VideoFrames',()=>{
  const p=video.plan(make(),{fps:5,width:640,height:360});
  const sink=video.orderedGate(p,{capacity:2,consume:()=>{throw Error('encoder failed');}});
  const later=mockFrame(1,p),head=mockFrame(0,p);
  sink.offer(later);
  assert.throws(()=>sink.offer(head),/encoder failed/);
  assert.equal(later.frames.A.closed,true);assert.equal(head.frames.A.closed,true);
  assert.equal(sink.available(),0);
});
test('browser script exposes video pipeline with the same production PNG validator',()=>{
  const script=fs.readFileSync(path.join(__dirname,'../src/animation/ModernAnimationVideoPipeline.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  assert.ok(html.indexOf('ModernAnimationFrameExport.js')<html.indexOf('ModernAnimationVideoPipeline.js'));
  assert.match(html,/ModernAnimationVideoCapabilities\.js/);
  const scope={CurvatureModernAnimationProject:projects,CurvatureModernAnimationFrameExport:png};
  vm.runInNewContext(script,scope,{filename:'ModernAnimationVideoPipeline.js'});
  assert.equal(scope.CurvatureModernAnimationVideoPipeline.plan(make()).frameCount,125);
});
