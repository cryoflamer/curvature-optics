'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const direct=require('../src/renderers/CurvatureCanvasDirectPreview');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const preview=require('../src/animation/ModernAnimationPreview');
const experiment=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const state=require('../src/ui/modern/ModernSceneState');
const R=6371000;
function model(){
  const ctx=vm.createContext({JsgVect3:{
    Norm:a=>a.map(v=>v/Math.hypot(...a)),
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((v,i)=>v+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0)}});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),ctx);
  return vm.runInContext('new CurveAppClass()',ctx);
}
function graph(){
  let filled=0,stroked=0,paths=0;
  const ctx={save(){},restore(){},setTransform(){},fillRect(){},clearRect(){},
    beginPath(){paths++;},moveTo(){},lineTo(){},closePath(){},
    fill(){filled++;},stroke(){stroked++;}};
  const g={Canvas:{width:800,height:500,getContext(){return ctx;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:500,ScaleY:-500,OffsetX:400,OffsetY:250},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
  return {g,stats:()=>({filled,stroked,paths})};
}
function soundly(){const m=model();state.applyPreset(m,'soundly');m.Height=8.55;
  m.FocalLengthField=2038;m.Pan=.49;m.Nick=-.006;
  m.CameraEast=-36;m.CameraNorth=399;m.Update();return m;}
function draw(m,opts={}){return renderer.renderPhysical(graph().g,m,
  {atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true,...opts});}
test('geometric preview uses the same k profile as Effective Radius, but never mutates model',()=>{
  const m=soundly(),before=JSON.stringify(m),params=require('../src/optics/OpticalEffectiveRadiusPreview').parameters(m,{atmosphere:'standard'});
  const g=direct.geometricModel(m,params);
  assert.equal(g.geometryRadius,params.effectiveRadius);
  assert.ok(g.rDisk>0&&g.zDisk>0&&g.aDip>0);
  assert.equal(g.Height,m.Height);
  assert.equal(JSON.stringify(m),before);
  assert.ok(direct.geometricModel(m,{geometry:'globe',effectiveRadius:R}).rDisk>0);
});
test('real Soundly source renders all 128 object packages with native polygon fills and one mask',()=>{
  const m=soundly(),g=graph(),before=JSON.stringify(Array.from(m.ObjDist));
  const r=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(r.opticalQuality,'canvas-direct');
  assert.equal(r.geometryBackend,'Canvas Direct 2D');
  assert.equal(r.previewLod.original,128);assert.equal(r.previewLod.selected,128);
  assert.equal(r.directStats.horizonMasks,1);
  assert.ok(r.directStats.fillCalls>500&&r.directStats.strokeCalls>500);
  assert.equal(r.fillTriangles,0,'Canvas Direct must not pre-triangulate bridge fills');
  assert.equal(g.stats().filled,r.directStats.fillCalls);
  assert.equal(g.stats().stroked,r.directStats.strokeCalls);
  assert.ok(r.timings.totalMs>=0&&r.timings.geometryMs>=0);
  assert.equal(JSON.stringify(Array.from(m.ObjDist)),before);
});
test('moving observer and changing height reuse immutable authored geometry',()=>{
  const m=soundly(),g=graph();
  const first=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(first.cacheReused,false);
  m.Height=3.5;m.CameraEast=51.2;m.CameraNorth=496;m.Update();
  const next=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(next.cacheReused,true);
  assert.equal(next.directStats.horizonMasks,1);
  assert.equal(next.previewLod.selected,128);
});
test('distinct Animation canvases have independent cached object meshes',()=>{
  const m=soundly(),a=graph(),b=graph();
  const options={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  assert.equal(renderer.renderPhysical(a.g,m,options).cacheReused,false);
  assert.equal(renderer.renderPhysical(b.g,m,options).cacheReused,false);
  assert.equal(renderer.renderPhysical(a.g,m,options).cacheReused,true);
  assert.equal(renderer.renderPhysical(b.g,m,options).cacheReused,true);
  assert.equal(renderer.renderPhysical(a.g,m,{...options,forceColdOptics:true}).cacheReused,false);
  assert.equal(renderer.renderPhysical(b.g,m,options).cacheReused,true);
});
test('a changed source bridge geometry invalidates the cache while camera-only changes do not',()=>{
  const m=soundly(),g=graph();
  draw(m);m.ObjDist[0]+=1;m.Update();
  const changed=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(changed.cacheReused,false);
  const repeated=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(repeated.cacheReused,true);
});
test('distant support stays in far painter group and is covered by horizon mask',()=>{
  const m=soundly();m.NObjects[0]=1;m.ObjDist[0]=60000;m.Height=3;
  m.CameraEast=0;m.CameraNorth=0;m.Update();
  const r=draw(m);
  assert.equal(r.previewLod.original,1);
  assert.equal(r.directStats.horizonMasks,1);
});
test('all-near supports do not trigger a false white horizon mask',()=>{
  const m=soundly();m.NObjects[0]=1;m.ObjDist[0]=1000;m.Height=200;
  m.CameraEast=0;m.CameraNorth=0;m.Update();
  const r=draw(m);
  assert.equal(r.directStats.horizonMasks,0);
  assert.ok(r.directStats.strokeCalls>0);
});
test('non-vacuum Globe and Flat Vacuum work; refracted Flat and unsupported profiles reject',()=>{
  const m=soundly();
  const r=draw(m,{atmosphere:'standard'});
  assert.ok(r.refractionK>0&&r.effectiveRadiusMeters>m.rEarth);
  assert.equal(r.opticalQuality,'canvas-direct');
  assert.throws(()=>draw(m,{atmosphere:'inverse-temperature'}),/supports/);
  m.showModel=2;m.Update();
  assert.equal(draw(m).opticalQuality,'canvas-direct');
  assert.throws(()=>draw(m,{atmosphere:'standard'}),/Flat/);
});
test('Animation Preview routes explicit Canvas Direct without affecting Fast / Accurate / Auto',()=>{
  const m=soundly();const snap=experiment.capture(m,{atmosphere:'vacuum',occlusionRadius:R,preset:'soundly',resetPreset:'soundly'},
    compare.preset('globe-flat-vacuum'),{mode:'scene',eyeLevel:false,horizon:false,selected:'A'});
  const previous=structuredClone(snap);let received;
  class FakeModel{Update(){}}
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical(_g,_m,o){received=o;return {previewLod:{original:128,selected:128}};}}});
  const r=view.render(snap,'A',{Canvas:{}},{quality:'canvas-direct',sceneDetail:'performance'});
  assert.equal(r.quality,'canvas-direct');assert.equal(received.opticalQuality,'canvas-direct');
  assert.equal(received.previewLod.stride,1,'never thin bridge parts');
  assert.equal(view.build(snap,'A',{quality:'accurate'}).quality,'accurate');
  assert.equal(view.build(snap,'A',{quality:'fast'}).quality,'fast');
  assert.equal(view.build(snap,'A',{quality:'auto',animationMode:'physical'}).quality,'accurate');
  assert.deepEqual(snap,previous);
});
test('browser script order and Modern-only isolation of Canvas Direct',()=>{
  const html=fs.readFileSync('CurvatureModern.html','utf8');
  const code=fs.readFileSync('src/renderers/CurvatureCanvasDirectPreview.js','utf8');
  assert.ok(html.indexOf('src/renderers/CurvatureCanvasDirectPreview.js')<
    html.indexOf('src/app/CurvatureMainCanvasRenderer.js'));
  assert.ok(html.indexOf('src/optics/OpticalEffectiveRadiusPreview.js')<
    html.indexOf('src/renderers/CurvatureCanvasDirectPreview.js'));
  assert.match(html,/value="canvas-direct"/);
  assert.doesNotMatch(code,/\bGraphX3DX\s*\(|\bDrawModel\s*\(/);
  const browser=vm.createContext({CurvatureGeometryEngine:require('../src/geometry/CurvatureGeometryEngine'),
    CurvatureOpticalEffectiveRadiusPreview:require('../src/optics/OpticalEffectiveRadiusPreview'),
    CurvatureCameraTranslation:require('../src/geometry/CurvatureCameraTranslation'),
    CurvatureCanvasProjection:require('../src/renderers/CurvatureCanvasProjection')});
  vm.runInContext(code,browser);
  assert.equal(typeof browser.CurvatureCanvasDirectPreview.create,'function');
});
