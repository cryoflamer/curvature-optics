'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {extractAllDemoStates} = require('../tools/audit-legacy-modern-boundary');
const scene = require('../src/ui/modern/ModernSceneState');
const compare = require('../src/ui/modern/ModernCompareModel');
const compareState = require('../src/ui/modern/ModernCompareState');
const geometry = require('../src/geometry/CurvatureGeometryEngine');
const experiments = require('../src/ui/modern/ModernExperimentState');
const catalog = require('../src/ui/modern/ModernLocationCatalog');
const base = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(base, p), 'utf8');
const source = extractAllDemoStates(fs.readFileSync(path.join(base, 'src/animation/CurvatureDemos.js'), 'latin1'));
const authored = source.find(d => d.demo === 'Bedford').states;
const vec = {Norm:a => a.map(x => x / Math.hypot(...a)),
  Mult:(a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  Scale:(a,s) => a.map(v => v*s),Add:(a,b) => a.map((v,i) => v+b[i]),
  ScalarProd:(a,b) => a.reduce((n,v,i) => n+v*b[i],0)};
function model(){
  const ctx = vm.createContext({JsgVect3:vec});
  vm.runInContext(read('src/app/CurvatureModel.js'),ctx);
  return vm.runInContext('new CurveAppClass()',ctx);
}
function near(actual,expected,eps=1e-8){
  assert.ok(Math.abs(actual-expected)<=eps,`${actual} differs from ${expected} by ${actual-expected}`);
}

test('Bedford native study exactly preserves source state 3 camera, active marker bank, and lateral variation',()=>{
  const original=authored[3],m=model();
  scene.applyPreset(m,'bedford');m.Update();
  for(const key of ['Height','FocalLengthField','Pan','Nick','Roll'])assert.equal(m[key],original[key],key);
  for(const key of ['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSidePos','ObjSideVar','ObjSize','ObjSideType','ObjSizeType','ObjSizeVar'])
    assert.deepEqual(Array.from(m[key]),original[key],key);
  assert.equal(m.showGrid,original.showGrid);
  assert.equal(m.rEarth,original.rEarth);
  assert.equal(m.viewcenterHorizon,original.viewcenterHorizon);
  assert.equal(m.showModel,1,'the physical globe is an explicitly non-equivalent adaptation');
  assert.equal(original.showModel,3,'original single-Canvas globe+flat composite is retained in Demos');
  assert.equal(original.refractionCoeff,0);
  assert.equal(scene.PRESETS.bedford.atmosphere,'vacuum');
  const rows=geometry.objectSequence(m,0,true,{opticsNeutral:true});
  assert.equal(rows.length,3);
  const expectedDistances=[9784,4954,124],expectedOffsets=[18.23,9.23,.23];
  rows.forEach((entry,i)=>{
    assert.equal(entry.scene.metadata.objectType,0);
    near(entry.params.longitude*m.geometryRadius,expectedDistances[i]);
    near(entry.params.latitude*m.geometryRadius,expectedOffsets[i]);
  });
  assert.equal(geometry.objectSequence(m,1,true,{opticsNeutral:true}).length,0);
  assert.equal(catalog.scenario('bedford-level-experiment').status,'partial');
  assert.equal(catalog.scenario('bedford-level-experiment').nativePresetId,'bedford');
});

test('Bedford study keeps Scene and physical Compare A/B camera and non-tower geometry invariant',()=>{
  const m=model();scene.applyPreset(m,'bedford');m.Update();
  const pair=compare.pair(m);
  assert.ok(compare.invariant(pair));
  assert.equal(pair.A.showModel,1);
  assert.equal(pair.B.showModel,2);
  assert.equal(m.showModel,1);
  for(const side of ['A','B']){
    assert.deepEqual(Array.from(pair[side].ObjType),[0,3]);
    assert.deepEqual(Array.from(pair[side].ObjSideVar),[18,0]);
    const seq=geometry.objectSequence(pair[side],0,side==='A',{opticsNeutral:true});
    assert.equal(seq.length,3);
    near(seq[0].params.longitude*pair[side].geometryRadius,9784);
  }
});

test('Bedford Scene preset and reset ID round-trip in version-1 experiment links and old presets stay valid',()=>{
  const m=model();scene.applyPreset(m,'bedford');m.Update();
  const pair=compareState.preset('globe-flat-vacuum');
  const input=experiments.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'bedford',resetPreset:'bedford'},pair,{mode:'scene',selected:'A',eyeLevel:false,horizon:true});
  const restored=experiments.decode(experiments.encode(input));
  assert.deepEqual(restored,input);
  assert.equal(restored.scene.preset,'bedford');
  assert.equal(restored.scene.resetPreset,'bedford');
  assert.equal(restored.scene.atmosphere,'vacuum');
  assert.equal(restored.scene.showGrid,false);
  assert.deepEqual(restored.scene.objects.ObjSideVar,[18,0]);
  const url=experiments.urlWithExperiment('https://example.org/CurvatureApp.html?ui=modern',input);
  assert.match(url,/CurvatureModern\.html/);
  assert.deepEqual(experiments.readUrl(new URL(url).search),input);
  for(const id of ['pontchartrain','single','rows']){
    scene.applyPreset(m,id);m.Update();
    assert.deepEqual(Array.from(m.ObjSideVar),[0,0],id+' does not inherit Bedford variation');
    const old=experiments.capture(m,{atmosphere:'standard',occlusionRadius:6371000,preset:id,resetPreset:id},
      pair,{mode:'scene',selected:'A',eyeLevel:false,horizon:true});
    assert.equal(experiments.decode(experiments.encode(old)).scene.resetPreset,id);
  }
  assert.throws(()=>scene.setObject(m,0,'ObjDist',authored[0].ObjDist[0]),/Expected/,
    'signed source-state prelude must remain rejected rather than silently clamped');
});
