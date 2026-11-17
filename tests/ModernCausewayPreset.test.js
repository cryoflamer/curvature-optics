'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {extractAllDemoStates}=require('../tools/audit-legacy-modern-boundary');
const scene=require('../src/ui/modern/ModernSceneState');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const compare=require('../src/ui/modern/ModernCompareModel');
const compareState=require('../src/ui/modern/ModernCompareState');
const experiment=require('../src/ui/modern/ModernExperimentState');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const vec={Norm:a=>a.map(x=>x/Math.hypot(...a)),Mult:(a,b)=>
  [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((x,i)=>x+b[i]),
  ScalarProd:(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0)};
function model(){const c=vm.createContext({JsgVect3:vec});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),c);
  return vm.runInContext('new CurveAppClass()',c);}
const states=extractAllDemoStates(fs.readFileSync('src/animation/CurvatureDemos.js','latin1'))
  .find(x=>x.demo==='Causeway').states;
const fields=['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType',
  'ObjSidePos','ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'];
function graph(){const c={save(){},restore(){},setTransform(){},beginPath(){},
  moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){},clearRect(){},
  setLineDash(){},measureText(){return {width:0};},fillText(){}};
  return {Canvas:{width:680,height:453,getContext(){return c;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,
      CamViewCenter:p.CamViewCenter,SceneSize:p.SceneSize,ScreenSize:1,
      ObjectZExtend:0,Zoom:1};},SetCameraZoom(z){this.Camera.Zoom=z;}};}
test('Causeway native preset is derived from authored state 5 and labels the intentional projection difference',()=>{
  assert.equal(states.length,6);const l=states[4],m=model();
  const p=scene.applyPreset(m,'causeway');m.Update();
  for(const f of fields)assert.deepEqual(Array.from(m[f]),l[f],f);
  for(const f of ['Height','FocalLengthField','Nick','Pan','Roll'])assert.equal(m[f],l[f]);
  assert.equal(l.showModel,3);assert.equal(m.showModel,1);
  assert.equal(l.refractionCoeff,0);assert.equal(p.atmosphere,'vacuum');
  assert.equal(l.viewcenterHorizon,2);assert.equal(m.viewcenterHorizon,3);
  assert.equal(m.ObjDist[0],0);assert.equal(m.ObjDeltaDist[0],967.5);
});
test('Causeway has independent road continuity for both 41-support rows in physical Globe/Flat',()=>{
  const m=model();scene.applyPreset(m,'causeway');m.Update();
  const pair=compare.pair(m);assert.ok(compare.invariant(pair));
  for(const [part,globe] of [['A',true],['B',false]]){
    const obj=pair[part],opts={physicalSurface:true,opticsNeutral:true,
      curvature:globe?1/obj.rEarth:0};
    const entries=geometry.objectSequence(obj,0,globe,opts);
    assert.equal(entries.length,82);
    assert.deepEqual([1,2].map(c=>entries.filter(e=>e.scene.metadata.column===c).length),[41,41]);
    const bridge=geometry.createObjectSequenceScene(obj,0,globe,opts);
    assert.equal(bridge.metadata.objectCount,82);
    const roads=bridge.primitives.filter(p=>p.metadata.kind==='bridge-road');
    assert.equal(roads.length,80);
    assert.deepEqual([1,2].map(c=>roads.filter(p=>p.metadata.column===c).length),[40,40]);
    assert.ok(roads.every(p=>p.points.length===4&&p.points.every(v=>v.every(Number.isFinite))));
    assert.equal(geometry.createObjectSequenceScene(obj,1,globe,opts).metadata.objectCount,0);
  }
});
test('Causeway is serialized for History/JSON/URL, and is physically rendered on Globe and Flat',()=>{
  const m=model();scene.applyPreset(m,'causeway');m.Update();
  const saved=experiment.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'causeway',resetPreset:'causeway'},compareState.initial(m,'vacuum',6371000),
    {mode:'compare',selected:'A',eyeLevel:false,horizon:true});
  assert.deepEqual(experiment.validate(saved),saved);
  assert.deepEqual(experiment.decode(experiment.encode(saved)),saved);
  assert.deepEqual(experiment.readUrl(new URL(experiment.urlWithExperiment(
    'https://example.org/CurvatureModern.html',saved)).search),saved);
  for(const globe of [true,false]){
    m.showModel=globe?1:2;m.Update();
    const result=renderer.renderPhysical(graph(),m,{atmosphere:'vacuum',
      occlusionRadius:6371000,interactive:false});
    assert.equal(result.mode,'physical-scene');
    assert.ok(result.drawn>0);assert.ok(result.fillTriangles>0);
  }
});
