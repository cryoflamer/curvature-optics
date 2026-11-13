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
test('one nominal FPS interval is split to retain both endpoints without extending the video',()=>{
  for(const mode of ['scene','compare']){
    const p=video.plan(make(mode,200.0001),{fps:5});
    assert.equal(p.durationUs,200000,'fractional microsecond is rounded consistently');
    assert.equal(p.frameCount,2);
    assert.deepEqual(p.frames.map(f=>({timestampUs:f.timestampUs,durationUs:f.durationUs})),[
      {timestampUs:0,durationUs:100000},
      {timestampUs:100000,durationUs:100000}]);
    assert.equal(p.frames[0].sampleTimeMs,0);
    assert.equal(p.frames[1].sampleTimeMs,200.0001);
    assert.equal(p.frames.at(-1).timestampUs+p.frames.at(-1).durationUs,p.durationUs);
    assert.equal(p.frames.every(f=>f.durationUs>0),true);
    if(mode==='scene'){
      assert.equal(projects.sampleAt(p.project,p.frames[0].sampleTimeMs).scene.surface.showModel,1);
      assert.equal(projects.sampleAt(p.project,p.frames[1].sampleTimeMs).scene.surface.showModel,2);
    }else{
      assert.equal(projects.sampleAt(p.project,p.frames[0].sampleTimeMs).compare.A.surface,'globe');
      assert.equal(projects.sampleAt(p.project,p.frames[1].sampleTimeMs).compare.A.surface,'flat');
    }
  }
  assert.equal(png.plan(make('scene',200),{fps:5}).timesMs.length,2,
    'PNG retains its independent inclusive endpoint timeline');
  const normal=video.plan(make('scene',250),{fps:5});
  assert.equal(normal.frameCount,2,'ordinary two-frame timelines keep their FPS boundary');
  assert.equal(normal.frames[1].timestampUs,200000);
  assert.equal(normal.frames[1].durationUs,50000);
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
  assert.equal(final.stats.A.opticsMs,null);
  assert.ok(Number.isFinite(final.stats.A.renderMs));
  assert.ok(final.stats.A.renderMs>=0);
  video.closeFrames(final);
  assert.equal(final.frames.A.closed,true);
});
test('Compare frames are synchronized and constructed independently per side',async()=>{
  const p=video.plan(make('compare'),{fps:5,width:640,height:360,compareLayout:'separate'});
  const got=[];
  class Frame{constructor(canvas,opts){this.canvas=canvas;this.timestamp=opts.timestamp;
    this.duration=opts.duration;}close(){this.closed=true;}}
  const r=await video.renderTimestamp(p,2,async(_sample,side,opts)=>{
    got.push([side,opts.timestampUs,opts.timeMs]);
    return {canvas:{width:640,height:360,getContext:()=>ctx()},quality:'accurate'};
  },Frame);
  assert.deepEqual(got,[['A',400000,400],['B',400000,400]]);
  assert.ok(r.stats.A.renderMs>=0&&r.stats.B.renderMs>=0);
  assert.equal(r.frames.A.timestamp,r.frames.B.timestamp);
  assert.notEqual(r.frames.A.canvas,r.frames.B.canvas);
  video.closeFrames(r);
  assert.equal(r.frames.A.closed,true);assert.equal(r.frames.B.closed,true);
});
test('Fast mode is rejected and a failing B render closes the completed A frame',async()=>{
  const p=video.plan(make('compare'),{fps:5,width:640,height:360,compareLayout:'separate'});
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
  const p=video.plan(make('compare'),{fps:5,width:640,height:360,compareLayout:'separate'});
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
  const p=video.plan(make('compare'),{fps:5,width:640,height:360,compareLayout:'separate'});
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

test('encoder queue backpressure pauses ordered gate until dequeue without leaking VideoFrames',()=>{
  const p=video.plan(make(),{fps:5,width:640,height:360});
  let room=false,seen=[];
  const gate=video.orderedGate(p,{capacity:2,canConsume:()=>room,
    consume:bundle=>seen.push(bundle.index)});
  const first=mockFrame(0,p),second=mockFrame(1,p);
  gate.offer(first);gate.offer(second);
  assert.equal(gate.available(),0);
  assert.deepEqual(seen,[]);
  assert.equal(first.frames.A.closed,false);
  room=true;
  gate.drain();
  assert.deepEqual(seen,[0,1]);
  assert.equal(first.frames.A.closed,true);
  assert.equal(second.frames.A.closed,true);
  assert.equal(gate.available(),2);
});

test('Compare side-by-side default creates one deterministic VideoFrame from painted A/B',async()=>{
  const p=video.plan(make('compare'),{fps:5,width:640,height:360});
  assert.equal(p.compareLayout,'side-by-side');
  assert.deepEqual(Array.from(p.sides),['A','B']);
  assert.deepEqual(Array.from(p.outputSides),['COMBINED']);
  assert.equal(p.outputWidth,1280);assert.equal(p.outputHeight,720);
  const calls=[],outCanvas={width:1280,height:720};
  class Frame{constructor(canvas,options){this.canvas=canvas;this.timestamp=options.timestamp;
    this.duration=options.duration;this.closed=false;}close(){this.closed=true;}}
  const result=await video.renderTimestamp(p,4,async(_sample,side,dimensions)=>{
    calls.push([side,dimensions.timestampUs]);
    return {quality:'accurate',canvas:{width:640,height:360,getContext:ctx},
      cameraModel:{showModel:side==='A'?1:2},metrics:{opticalQuality:'accurate'}};
  },Frame,null,(images,timing)=>{
    assert.deepEqual(Object.keys(images),['A','B']);
    assert.equal(images.A.cameraModel.showModel,1);
    assert.equal(images.B.cameraModel.showModel,2);
    assert.equal(timing.timeMs,800);
    assert.equal(timing.durationMs,5000);
    return outCanvas;
  });
  assert.deepEqual(calls,[['A',800000],['B',800000]]);
  assert.deepEqual(Object.keys(result.frames),['COMBINED']);
  assert.equal(result.frames.COMBINED.canvas,outCanvas);
  assert.equal(result.frames.COMBINED.timestamp,800000);
  assert.equal(result.frames.COMBINED.duration,200000);
  assert.equal(result.stats.compositionMs>=0,true);
  video.closeFrames(result);assert.equal(result.frames.COMBINED.closed,true);
  const gate=video.orderedGate(p,{capacity:1,consume:bundle=>{
    assert.equal(bundle.frames.COMBINED.closed,false);
  }});
  gate.offer(result);assert.equal(gate.completed(),false);
  await assert.rejects(video.renderTimestamp(p,0,()=>{},Frame),/composition callback/);
  assert.throws(()=>video.plan(make(),{compareLayout:'side-by-side'}),/Compare layout/);
});

test('real Compare compositor consumes both opaque view canvases once and preserves their pixels',async()=>{
  const compose=require('../src/animation/ModernAnimationCompareComposition');
  const p=video.plan(make('compare'),{fps:25,width:960,height:540});
  const ops=[];
  const canvasCtx={save(){},restore(){},setTransform(){},fillRect(){},
    drawImage(...a){ops.push(['image',...a]);},
    fillText(...a){ops.push(['text',...a]);}};
  const destination={width:1920,height:1080,getContext(){return canvasCtx;}};
  let constructed=0;
  class Frame{constructor(canvas,timing){constructed++;this.canvas=canvas;
    this.timestamp=timing.timestamp;this.closed=false;}close(){this.closed=true;}}
  const images={};
  const bundle=await video.renderTimestamp(p,0,async(_sample,side)=>{
    const source={width:960,height:540,getContext:ctx};images[side]=source;
    return {quality:'accurate',canvas:source,cameraModel:{showModel:side==='A'?1:2},
      metrics:{opticalQuality:'accurate'}};
  },Frame,null,(pair,t)=>compose.paint(destination,pair,t));
  assert.equal(constructed,1);
  assert.equal(bundle.frames.COMBINED.canvas,destination);
  assert.deepEqual(ops.filter(x=>x[0]==='image'),[
    ['image',images.A,0,270],['image',images.B,960,270]]);
  assert.deepEqual(ops.filter(x=>x[0]==='text').map(x=>x[1]),[
    'COMPARE A / B','A · GLOBE','B · FLAT','PHYSICAL ANIMATION','00:00.00 / 00:05.00']);
  assert.equal(bundle.stats.compositionMs>=0,true);
  video.closeFrames(bundle);assert.equal(bundle.frames.COMBINED.closed,true);
});

test('combined output frame contract rejects two-stream bundles and invalid layout inputs',()=>{
  const p=video.plan(make('compare'),{fps:5,width:640,height:360});
  const bundle=mockFrame(0,p,['A','B']);
  const gate=video.orderedGate(p,{capacity:1,consume:()=>{throw Error('Should not encode');}});
  assert.throws(()=>gate.offer(bundle),/incomplete video frame/);
  assert.equal(gate.completed(),false);
  assert.throws(()=>video.plan(make('compare'),{compareLayout:false}),/Unsupported Compare/);
  assert.throws(()=>video.plan(make('compare'),{compareLayout:'stacked'}),/Unsupported Compare/);
});

test('frame Worker actually composes and transfers one synchronized Compare VideoFrame',async()=>{
  const compose=require('../src/animation/ModernAnimationCompareComposition');
  const root={};
  const posts=[],canvases=[];
  class Canvas{
    constructor(width,height){this.width=width;this.height=height;this.calls=[];canvases.push(this);}
    getContext(){const canvas=this;return {save(){},restore(){},setTransform(){},
      fillRect(){},drawImage(...args){canvas.calls.push(['image',...args]);},
      fillText(...args){canvas.calls.push(['text',...args]);}};}
  }
  class Frame{
    constructor(canvas,opts){this.source=canvas;this.timestamp=opts.timestamp;this.closed=false;}
    close(){this.closed=true;}
  }
  class Graph{
    InitInternals(){}
    SaveAttrs(){}
    SaveDefaultAttrs(){}
  }
  root.self=root;root.JsGraphX3D=Graph;root.JsgCamera=class{};
  root.OffscreenCanvas=Canvas;root.VideoFrame=Frame;
  root.CurveAppClass=class{};
  root.CurvatureMainCanvasRenderer={};root.CurvaturePhysicalSceneOptics={};
  root.CurvatureModernAnimationFrameExport=png;
  root.CurvatureModernAnimationVideoPipeline=video;
  root.CurvatureModernAnimationCompareComposition=compose;
  root.CurvatureModernAnimationPreview={create:()=>({render(_sample,side,graph){
    return {quality:'accurate',result:{opticalQuality:'accurate'},
      cameraModel:{showModel:side==='A'?1:2}};
  }})};
  root.importScripts=()=>{};
  root.postMessage=(value,transfer)=>posts.push({value,transfer});
  const scope=vm.createContext({performance,OffscreenCanvas:Canvas,VideoFrame:Frame,
    Object,Promise,JsGraphX3D:Graph,JsgCamera:root.JsgCamera,...root});
  scope.self=scope;
  vm.runInContext(fs.readFileSync(path.join(__dirname,
    '../src/animation/ModernAnimationFrameWorker.js'),'utf8'),scope);
  const project=make('compare');
  await scope.onmessage({data:{type:'video-init',project,width:640,height:360,
    fps:5,cameraHud:false,compareLayout:'side-by-side'}});
  assert.equal(posts[0].value.type,'ready');
  assert.equal(posts[0].value.sides,2);
  await scope.onmessage({data:{type:'video-render',index:0}});
  assert.equal(posts[1].value.type,'video-frame');
  assert.equal(posts[1].transfer.length,1);
  assert.deepEqual(Object.keys(posts[1].value.frame.frames),['COMBINED']);
  const composite=posts[1].transfer[0];
  assert.equal(composite.source.width,1280);assert.equal(composite.source.height,720);
  assert.deepEqual(composite.source.calls.filter(x=>x[0]==='image').map(x=>x.slice(2)),
    [[0,180],[640,180]]);
  assert.equal(posts[1].value.frame.stats.compositionMs>=0,true);
  assert.equal(posts[1].value.frame.timestampUs,0);
  assert.equal(canvases.length,3);
});
