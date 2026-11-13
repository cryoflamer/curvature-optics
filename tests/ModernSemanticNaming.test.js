'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const naming=require('../src/ui/modern/ModernSemanticNaming');
const studio=require('../src/animation/ModernAnimationStudio');
const projects=require('../src/animation/ModernAnimationProject');
function snapshot(mode='scene'){
  const model={Height:1.85,FocalLengthField:1500,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,
    DemoText:'Lake Pontchartrain Transmission Line',Description:'',
    ObjType:[3,3],NObjects:[85,0],ObjDist:[50,1000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return state.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
  compare.preset('globe-flat-vacuum'),
  {mode,eyeLevel:false,horizon:false,selected:'A'});
}
const clone=v=>structuredClone(v);
test('new snapshots use physical state, while short and technical labels remain deterministic',()=>{
  const s=snapshot();
  assert.equal(naming.snapshot(s),'Pontchartrain · Globe · H 1.85 m · Standard');
  assert.equal(naming.snapshot(s,{style:'short'}),'Pontchartrain · Globe · H 1.85 m · Standard');
  s.scene.atmosphere='temperature-lapse';
  s.scene.temperatureProfile.gradientKPerKm=-13.1;
  assert.match(naming.snapshot(s),/dT\/dh −13\.1 K\/km/);
  s.scene.camera.Pan=12;
  assert.match(naming.snapshot(s,{style:'technical'}),/Pan 12°/);
  assert.equal(naming.snapshot(s),naming.snapshot(clone(s)));
});
test('Compare snapshot names do not claim different A/B atmospheres are identical',()=>{
  const s=snapshot('compare');
  s.compare.A.atmosphere='temperature-lapse';
  s.compare.A.temperatureProfile.gradientKPerKm=-13.1;
  s.compare.B.atmosphere='temperature-lapse';
  s.compare.B.temperatureProfile.gradientKPerKm=-5;
  const title=naming.snapshot(s);
  assert.match(title,/Compare Globe\/Flat/);
  assert.match(title,/A: dT\/dh −13\.1 K\/km/);
  assert.match(title,/B: dT\/dh −5 K\/km/);
  assert.ok(title.length<=120);
  s.compare.A.radiusKm=5000;
  assert.match(naming.snapshot(s),/Globe R5000km/);
});
test('camera sequences distinguish single-axis height from multi-axis motion',()=>{
  const a=snapshot(),b=clone(a),c=clone(a);
  b.scene.camera.Height=15;c.scene.camera.Height=75;
  const heights=projects.create([{experiment:a},{experiment:b,travelMs:5000},
    {experiment:c,travelMs:5000}],{id:'height',name:'Animation study'});
  assert.equal(naming.animation(heights),'Pontchartrain · Camera height 1.85 → 75 m');
  const loop=clone(heights);
  loop.keyframes[2].value.Height=1.85;
  assert.match(naming.animation(loop),/range 1\.85–15 m/);
  const mixed=clone(heights);
  mixed.keyframes[1].value.Pan=5;
  assert.equal(naming.animation(mixed),'Pontchartrain · Camera motion · 3 keyframes');
});
test('physical sequence labels indicate actual interpolation target, direction and scope',()=>{
  const a=snapshot(),b=clone(a),c=clone(a);
  b.scene.surface.showModel=2;
  const curvature=projects.create([{experiment:a},{experiment:b,travelMs:5000}],
    {id:'curvature',name:'Animation study'});
  assert.equal(naming.animation(curvature),'Pontchartrain · Earth curvature Globe → Flat');
  c.scene.atmosphere='temperature-lapse';
  const d=clone(c);d.scene.temperatureProfile.gradientKPerKm=-13.1;
  const gradient=projects.create([{experiment:c},{experiment:d,travelMs:5000}],
    {id:'gradient',name:'Animation study'});
  assert.match(naming.animation(gradient),/Temperature gradient −6\.5 → −13\.1 K\/km/);
});
test('Studio suggests names only for compatible active frame selections',()=>{
  const a=snapshot(),b=clone(a),c=clone(a);
  b.scene.camera.Height=5;c.scene.surface.showModel=2;
  let draft=studio.history([1,2,3],[{id:1,experiment:a,name:''},
    {id:2,experiment:b,name:''},{id:3,experiment:c,name:''}]);
  assert.equal(studio.suggestName(draft),'Animation study');
  const choice=studio.findSequences(draft).find(v=>v.mode==='camera');
  assert.ok(choice);
  draft=studio.selectSequence(draft,choice.id);
  assert.equal(studio.suggestName(draft),'Pontchartrain · Camera height 1.85 → 5 m');
  assert.equal(draft.frames.length,3,'unselected frames are never destroyed');
  assert.match(draft.frames[0].name,/Pontchartrain/,'untitled History frames get semantic labels');
});
test('filenames are cross-platform safe, distinguish output format/layout and retain user names',()=>{
  const a=snapshot('compare'),b=clone(a);b.scene.camera.Height=75;
  const project=projects.create([{experiment:a},{experiment:b,travelMs:5000}],
    {id:'video',name:'Нічна рефракція / тест: №1'});
  const p={width:1920,height:1080,fps:30,format:'mp4',compareLayout:'side-by-side'};
  const single=naming.exportNames(project,p);
  assert.match(single.filename,/nichna-refraktsiia-test-1_1920x1080_30fps_compare\.mp4$/);
  assert.ok(!/[\\/:*?"<>|]/.test(single.filename));
  const separate=naming.exportNames(project,{...p,compareLayout:'separate',width:960});
  assert.match(separate.filename,/_compare-separate\.zip$/);
  assert.match(separate.entries.A,/_A\.mp4$/);
  assert.match(separate.entries.B,/_B\.mp4$/);
  assert.notEqual(separate.entries.A,separate.entries.B);
  assert.match(naming.exportNames(project,{kind:'frames',format:'png',fps:25,width:640,height:360}).filename,/_frames\.zip$/);
  const anonymous={...project,name:'Animation study'};
  assert.match(naming.exportStem(anonymous),/pontchartrain-camera-height/);
  assert.equal(naming.slug('../../\\Україна🚀'), 'ukraina');
});
