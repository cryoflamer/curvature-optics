'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const renderProfiler=require('../src/ui/modern/ModernRenderProfiler');
const report=require('../src/ui/modern/ModernPerformanceReport');
const main=require('../src/app/CurvatureMainCanvasRenderer');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');

const R=6371000;
function model(){return {
  rEarth:R,geometryRadius:R,Height:15,showModel:2,ObjType:[3,3],NObjects:[1,1],
  ObjDist:[50,25000],ObjDeltaDist:[300,373],ObjSidePos:[32,22],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],ObjSizeType:[0,0],
  rDisk:1000,zDisk:999,hDip:1,hDisk:R/2,aDip:.065,aDelta:.025,
  showGrid:0,rFEarth:10007543,PanRad:0,sceneWidth:5000,
  GlobeGridCol:'green',GlobeFGridCol:'yellow',TangentCol:'red',FEGridCol:'gray',FEEqCol:'blue',
  showTangent:true,showData:false,camPos:[0,0,0],camViewCenter:[0,1,0],
  camUp:[0,0,1],camSceneSize:1,camViewAngle:Math.PI/180,deviceRatio:1.5,
  Pan:0,Nick:0,Roll:0,viewcenterHorizon:3
};}
function graph(){
  const ctx={save(){},restore(){},setTransform(){},clearRect(){},beginPath(){},
    moveTo(){},lineTo(){},stroke(){},closePath(){},fill(){},setLineDash(){},
    measureText(){return {width:0};},fillText(){}};
  return {Canvas:{width:320,height:240,getContext(){return ctx;}},Camera:{},
    WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:160,OffsetY:120},
    ContextScale:1,AutoScalePix:true,MinLineWidth:1,ScalePixInt:false,
    DevicePixelRatio:1,GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(n){this.CameraClipPlaneDist=n;},SetWindowToCameraScreen(){},
    SetCamera(c){this.Camera={...c,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(n){this.Camera.Zoom=n;}};
}

test('140.3: actual cold request resets only the selected optical projection session',()=>{
  const m=model(),g=graph(),a=optics.create(),b=optics.create();
  function render(session,cold){return main.renderPhysical(g,m,{atmosphere:'vacuum',
    cacheSession:session,forceColdOptics:cold,interactive:false});}
  const cold=render(a,true);
  assert.equal(cold.cacheReused,false);
  assert.ok(cold.opticalStages&&Number.isFinite(cold.opticalStages.outlinesMs));
  const warm=render(a,false);
  assert.equal(warm.cacheReused,true);
  assert.equal(warm.drawn,cold.drawn);
  assert.equal(warm.fillTriangles,cold.fillTriangles);
  render(b,true);
  assert.equal(render(a,false).cacheReused,true,'B cold must not invalidate A');
  assert.equal(render(a,true).cacheReused,false,'A forced cold must rebuild');
  assert.equal(render(a,false).cacheReused,true,'A warm must reuse latest cold');
});

test('140.3: cold and genuine warm medians stay separate and optical counters remain bounded',()=>{
  const p=renderProfiler.create({capacity:3});
  p.recordRender({viewport:'Scene',totalMs:50,cacheReused:false,opticalSample:'cold',
    stages:{opticsMs:40},opticalStages:{fieldSetupMs:1,outlinesMs:23,
      fillsMs:8,groundGuidesMs:5,assemblyMs:3,sceneAdoptionMs:2,exactSolveMs:22},
    opticalWork:{ground:{solves:4,shootRK4Calls:800},outlines:{solves:20,shootRK4Calls:5000},
      fills:{solves:10,shootRK4Calls:3000}},fieldStats:{solves:34,shootRK4Calls:8800}});
  p.recordRender({viewport:'Scene',totalMs:9,cacheReused:true,opticalSample:'warm',
    stages:{opticsMs:.5},opticalStages:{outlinesMs:1000}});
  p.recordRender({viewport:'Scene',totalMs:33,cacheReused:false,opticalSample:'warm',
    stages:{opticsMs:25}});
  const s=p.summary().opticalSamples.Scene;
  assert.equal(s.cold.count,1);
  assert.equal(s.warm.count,1);
  assert.equal(s.warmCacheMisses,1);
  assert.equal(s.cold.median.totalMs,50);
  assert.equal(s.warm.median.totalMs,9);
  assert.equal(s.cold.opticalStages.median.outlinesMs,23);
  assert.equal(s.cold.opticalWork.outlines.median.shootRK4Calls,5000);
  assert.equal(s.warm.opticalStages,undefined,'stale cached phase metrics must be excluded');
  const formatted=report.format(p.summary());
  assert.match(formatted,/warm misses 1/);
  assert.match(formatted,/outlines · median new solves 20\.00, RK4 steps 5000\.00/);
  assert.match(formatted,/cold optical transform: 40\.00/);
  assert.match(formatted,/scene adoption \(inside assembly\)/);
  p.recordRender({viewport:'Scene',totalMs:5,cacheReused:true,opticalSample:'cold'});
  assert.equal(p.summary().opticalSamples.Scene.coldUnexpectedHits,1);
  assert.equal(p.summary().opticalSamples.Scene.cold.count,0,'bounded ring evicted oldest cold');
});
