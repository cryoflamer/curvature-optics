'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const app=require('../src/app/CurvatureMainCanvasRenderer');
const effective=require('../src/optics/OpticalEffectiveRadiusPreview');
const physical=require('../src/optics/CurvaturePhysicalSceneOptics');
const composition=require('../src/scene/CurvatureIndependentComposition');
const state=require('../src/ui/modern/ModernSceneState');
const preview=require('../src/animation/ModernAnimationPreview');
const R=6371000;
function m(o={}){return Object.assign({rEarth:R,geometryRadius:R,Height:5,showModel:1,
  ObjType:[3,3],NObjects:[3,0],ObjDist:[1000,0],ObjDeltaDist:[300,100],
  ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[23,64],
  ObjSizeVar:[0,0],ObjSizeType:[0,0],showGrid:0,rFEarth:10007543,
  aDelta:0,aDip:0,PanRad:0,sceneWidth:5000,camPos:[0,0,0],camUp:[0,0,1],
  camViewCenter:[0,1,0],camSceneSize:1,GlobeGridCol:'blue',FEGridCol:'blue'},o);}
function realModel(){const c=vm.createContext({JsgVect3:{Norm:a=>a.map(v=>v/Math.hypot(...a)),
  Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],
  Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((v,i)=>v+b[i]),
  ScalarProd:(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0)}});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),c);
  return vm.runInContext('new CurveAppClass()',c);}
function graph(){const ctx={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},
  lineTo(){},closePath(){},stroke(){},fill(){},clearRect(){},setLineDash(){},
  measureText(){return {width:0};},fillText(){}};
  return {Canvas:{width:640,height:420,getContext(){return ctx;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},SetCameraZoom(z){this.Camera.Zoom=z;}};}
test('local k is derived from the Modern atmosphere; unsupported profiles reject explicitly',()=>{
  const v=effective.parameters(m(),{atmosphere:'vacuum'});
  const s=effective.parameters(m(),{atmosphere:'standard'});
  const t=effective.parameters(m(),{atmosphere:'temperature-lapse',
    temperatureProfile:{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5}});
  assert.equal(v.k,0);assert.equal(v.effectiveRadius,R);
  assert.ok(s.k>0&&s.k<.5);assert.ok(s.effectiveRadius>R);
  assert.ok(t.k>0&&t.k<.5);assert.notEqual(s.k,t.k);
  assert.throws(()=>effective.parameters(m({showModel:2}),{atmosphere:'standard'}),/Flat/);
  assert.throws(()=>effective.parameters(m(),{atmosphere:'inverse-temperature'}),/supports/);
});
test('vacuum analytical projection agrees with production and refractive horizon moves farther',()=>{
  const v=effective.parameters(m(),{atmosphere:'vacuum'}),s=effective.parameters(m(),{atmosphere:'standard'});
  for(const d of [100,1000,3000,7000])for(const h of [0,5,100]){
    const a=effective.ray(v,d,h),b=physical.vacuumSample('globe',R,5,d,h);
    assert.equal(a.status,b.status);
    if(a.status==='visible')assert.ok(Math.abs(a.angle-b.angle)<5e-12);
  }
  assert.equal(effective.ray(v,9000,0).status,'blocked');
  assert.equal(effective.ray(s,9000,0).status,'visible');
  assert.equal(effective.ray(s,20000,0).status,'blocked');
});
test('projector keeps source untouched and renders filled and stroked objects in painter order',()=>{
  const model=m(),scene=composition.composeOpticalMain(model,true,{physicalWorld:true});
  const source=JSON.stringify(scene);
  const result=effective.create().transform(scene,model,{atmosphere:'vacuum',previewLod:{stride:4}});
  assert.equal(JSON.stringify(scene),source);
  assert.equal(result.stats.opticalQuality,'effective-radius');
  assert.equal(result.stats.previewLod.selected,3);
  assert.ok(result.stats.visibleSegments>0&&result.stats.fillTriangles>0);
  const objects=result.composition.ranges.find(r=>r.role==='objects');
  const primitives=result.composition.scene.primitives.slice(objects.start,objects.end);
  assert.ok(primitives.some(p=>p.metadata.kind==='physical-object-fill'));
  assert.ok(primitives.some(p=>p.metadata.kind==='physical-object-stroke'));
  assert.ok(primitives.every(p=>p.points.every(q=>q.every(Number.isFinite))));
  assert.equal(result.composition.scene.metadata.composition,'physical-projected-main');
});
test('fully hidden distant towers are not promoted to visible fragments',()=>{
  const model=m({NObjects:[1,0],ObjDist:[60000,0],Height:5});
  const composition1=composition.composeOpticalMain(model,true,{physicalWorld:true});
  const result=effective.create().transform(composition1,model,{atmosphere:'vacuum'});
  assert.equal(result.stats.visibleSegments,0);
  assert.equal(result.stats.fillTriangles,0);
  assert.equal(result.stats.previewLod.selected,1);
});
test('full Soundly 128 objects render with fewer fill facets than adaptive optics',()=>{
  const model=realModel();state.applyPreset(model,'soundly');model.Height=4.29;model.Update();
  const before=Array.from(model.NObjects);
  const result=app.renderPhysical(graph(),model,{atmosphere:'vacuum',
    opticalQuality:'effective-radius',previewLod:{stride:4}});
  assert.equal(result.opticalQuality,'effective-radius');
  assert.equal(result.previewLod.original,128);assert.equal(result.previewLod.selected,128);
  assert.ok(result.fillTriangles>100&&result.fillTriangles<10000);
  assert.ok(result.drawn>0);assert.deepEqual(Array.from(model.NObjects),before);
});
test('Animation Preview forwards Effective Radius only on explicit opt-in',()=>{
  const mdl=realModel();state.applyPreset(mdl,'soundly');mdl.Update();
  const experiment=require('../src/ui/modern/ModernExperimentState');
  const snap=experiment.capture(mdl,{atmosphere:'vacuum',occlusionRadius:R,preset:'soundly',resetPreset:'soundly'},
    require('../src/ui/modern/ModernCompareState').preset('globe-flat-vacuum'),
    {mode:'scene',eyeLevel:false,horizon:false,selected:'A'});
  const before=structuredClone(snap);let options;
  class FakeModel{Update(){}}
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical(_g,_m,o){options=o;return {drawn:1};}}});
  const result=view.render(snap,'A',{Canvas:{}},{quality:'effective-radius',sceneDetail:'performance'});
  assert.equal(result.quality,'effective-radius');assert.equal(options.opticalQuality,'effective-radius');
  assert.equal(options.previewLod.stride,4);assert.deepEqual(snap,before);
  assert.equal(view.build(snap,'A',{quality:'fast'}).quality,'fast');
  assert.equal(view.build(snap,'A',{quality:'accurate'}).quality,'accurate');
});
test('browser loader and studio selector expose the new mode in the right order',()=>{
  const html=fs.readFileSync('CurvatureModern.html','utf8');
  assert.ok(html.includes('src/optics/OpticalEffectiveRadiusPreview.js'));
  assert.ok(html.indexOf('src/optics/OpticalEffectiveRadiusPreview.js')<
    html.indexOf('src/app/CurvatureMainCanvasRenderer.js'));
  assert.match(html,/value="effective-radius"/);
});
