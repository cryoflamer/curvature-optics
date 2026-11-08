'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const fingerprint=require('../src/ui/modern/ModernExperimentFingerprint');
const filters=require('../src/ui/modern/ModernExperimentHistoryFilters');
function experiment(mode='scene'){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Experiment',Description:'',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,20000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return state.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:false,horizon:true,selected:'A'});
}
function entry(id,experiment,name='',description=''){
  return {id,experiment,features:fingerprint.features(experiment),name,description,source:'manual'};
}
test('History filters use the active Scene geometry and atmosphere only',()=>{
  const globe=entry(1,experiment('scene'),'Lake study','Observer at 15m');
  const flatExperiment=experiment('scene');flatExperiment.scene.surface.showModel=2;
  flatExperiment.scene.atmosphere='vacuum';
  const flat=entry(2,flatExperiment,'Flat vacuum','');
  const items=[globe,flat];
  assert.deepEqual(filters.filter(items,{mode:'scene',geometry:'globe'}),[globe]);
  assert.deepEqual(filters.filter(items,{geometry:'flat',atmosphere:'vacuum'}),[flat]);
  assert.deepEqual(filters.filter(items,{atmosphere:'standard'}),[globe]);
  assert.deepEqual(filters.filter(items,{mode:'compare'}),[]);
  assert.deepEqual(filters.filter(items,{query:' LAKE  15M '}),[globe],
    'multiword search spans names and notes, ignoring whitespace/case');
  assert.deepEqual(filters.filter(items,{query:'Scene Globe Standard'}),[globe],
    'search includes physical classification');
  assert.deepEqual(filters.filter(items,{query:'does not exist'}),[]);
  assert.ok(filters.matches(globe,{}));
  assert.equal(filters.active({}),false);
  assert.equal(filters.active({geometry:'flat'}),true);
  assert.equal(filters.matches(globe,{query:'flat'}),false);
});
test('Compare geometry and atmosphere match either active A or B, not only selected editor',()=>{
  const pair=experiment('compare');
  pair.compare.A.atmosphere='standard';pair.compare.B.atmosphere='vacuum';
  const one=entry(1,pair,'A/B atmosphere contrast','Globe versus Flat');
  assert.ok(filters.matches(one,{mode:'compare',geometry:'globe',atmosphere:'standard'}));
  assert.equal(filters.matches(one,{geometry:'flat',atmosphere:'standard'}),false,
    'geometry and atmosphere must belong to the same Compare side');
  assert.ok(filters.matches(one,{geometry:'flat',atmosphere:'vacuum'}));
  assert.ok(filters.matches(one,{atmosphere:'standard',query:'DIFFERENT GEOMETRY'}));
  assert.equal(filters.matches(one,{mode:'scene'}),false);
  assert.equal(filters.matches(one,{atmosphere:'temperature-lapse'}),false);
  const original=fingerprint.features(pair);
  pair.compare.B.radiusKm=999999;
  assert.equal(fingerprint.features(pair).compare.B.geometry.kind,'flat');
  assert.deepEqual(filters.filter([entry(2,pair)],{geometry:'flat'}).map(x=>x.id),[2]);
  assert.equal(original.relations.geometrySame,false);
});
test('physical search ignores inactive Vacuum gradients and Flat radii',()=>{
  const value=experiment('scene');value.scene.atmosphere='vacuum';
  value.scene.temperatureProfile.gradientKPerKm=-15;
  value.scene.surface.showModel=2;value.scene.surface.rEarth=7777000;
  const item=entry(1,value,'', '');
  assert.equal(filters.matches(item,{query:'7777'}),false);
  assert.equal(filters.matches(item,{query:'-15'}),false);
  assert.equal(filters.matches(item,{geometry:'flat',atmosphere:'vacuum'}),true);
  assert.equal(filters.matches(item,{geometry:'globe'}),false);
});
test('old snapshots can be filtered by recalculating missing cached features read-only',()=>{
  const value=experiment('compare');
  const older={id:1,experiment:value,name:'Legacy',description:''};
  const previous=structuredClone(older);
  assert.deepEqual(filters.filter([older],{mode:'compare',geometry:'flat'}),[older]);
  assert.deepEqual(older,previous,'search never rewrites old IndexedDB entries');
});
test('invalid local filter preferences fall back safely, query size is bounded',()=>{
  assert.deepEqual(filters.normalize(),{query:'',mode:'all',geometry:'any',atmosphere:'any',geometryRelation:'any',refractionRelation:'any'});
  assert.deepEqual(filters.normalize({mode:'bogus',geometry:'cube',atmosphere:42,query:{}}),
    filters.normalize());
  assert.equal(filters.normalize({query:'x'.repeat(1000)}).query.length,160);
  assert.equal(filters.normalize({query:'  hi  '}).query,'hi');
  assert.equal(filters.normalize({query:'hi',mode:'compare'}).mode,'compare');
  assert.equal(Object.isFrozen(filters.normalize()),true);
});

test('Smart Compare relations distinguish geometry, active refraction, and model-name equality',()=>{
  const value=experiment('compare');
  value.compare.A.surface='globe';value.compare.B.surface='globe';
  value.compare.A.radiusKm=6371;value.compare.B.radiusKm=6371;
  value.compare.A.atmosphere='temperature-lapse';
  value.compare.B.atmosphere='temperature-lapse';
  value.compare.B.temperatureProfile.gradientKPerKm=
    value.compare.A.temperatureProfile.gradientKPerKm+1;
  const item=entry(10,value,'Different gradients');
  const original=structuredClone(item);
  assert.equal(fingerprint.features(value).relations.atmosphereSame,true);
  assert.equal(fingerprint.features(value).relations.refractionSame,false);
  assert.ok(filters.matches(item,{geometryRelation:'same',refractionRelation:'different'}));
  assert.equal(filters.matches(item,{refractionRelation:'same'}),false);
  assert.equal(filters.matches(item,{geometryRelation:'different'}),false);
  assert.ok(filters.matches(item,{mode:'compare',geometry:'globe',atmosphere:'temperature-lapse',
    geometryRelation:'same',refractionRelation:'different'}));
  assert.deepEqual(item,original,'filtering never mutates physical snapshots');
  value.compare.B.radiusKm+=1;
  const radius=entry(11,value);
  assert.ok(filters.matches(radius,{geometryRelation:'different',refractionRelation:'different'}));
  value.compare.B.temperatureProfile.gradientKPerKm=
    value.compare.A.temperatureProfile.gradientKPerKm;
  const identical=entry(12,value);
  assert.ok(filters.matches(identical,{geometryRelation:'different',refractionRelation:'same'}));
});
test('Smart Compare relations exclude Scene and ignore inactive Flat/Vacuum controls',()=>{
  const scene=entry(1,experiment('scene'));
  const value=experiment('compare');
  for(const side of ['A','B']){
    value.compare[side].surface='flat';
    value.compare[side].atmosphere='vacuum';
  }
  value.compare.A.radiusKm=3000;value.compare.B.radiusKm=100000;
  value.compare.A.temperatureProfile.gradientKPerKm=-19;
  value.compare.B.temperatureProfile.gradientKPerKm=18;
  const pair=entry(2,value);
  assert.equal(fingerprint.features(value).relations.geometrySame,true);
  assert.equal(fingerprint.features(value).relations.refractionSame,true);
  assert.deepEqual(filters.filter([scene,pair],{geometryRelation:'same',refractionRelation:'same'}),[pair]);
  assert.deepEqual(filters.filter([scene,pair],{refractionRelation:'different'}),[]);
  assert.ok(filters.matches(scene,{geometryRelation:'any',refractionRelation:'any'}));
  value.compare.B.atmosphere='standard';
  assert.ok(filters.matches(entry(3,value),{geometryRelation:'same',refractionRelation:'different'}));
  const older={id:4,experiment:value,features:{mode:'compare',scene:{},compare:{A:{},B:{}}}};
  assert.ok(filters.matches(older,{refractionRelation:'different'}),
    'missing cached relation flags are rebuilt read-only for older snapshots');
});
test('Compare relation normalization and field updates never strand Scene in contradictory filters',()=>{
  const defaults=filters.normalize();
  assert.equal(defaults.geometryRelation,'any');
  assert.equal(defaults.refractionRelation,'any');
  assert.equal(filters.active({refractionRelation:'different'}),true);
  assert.deepEqual(filters.normalize({mode:'scene',geometryRelation:'same',refractionRelation:'different'}),
    filters.normalize({mode:'scene'}));
  assert.deepEqual(filters.normalize({geometryRelation:'invalid',refractionRelation:1}),defaults);
  const fromScene=filters.update({mode:'scene'},'refractionRelation','different');
  assert.equal(fromScene.mode,'compare');
  assert.equal(fromScene.refractionRelation,'different');
  const switched=filters.update(fromScene,'mode','scene');
  assert.equal(switched.mode,'scene');
  assert.equal(switched.refractionRelation,'any');
  assert.deepEqual(filters.update(fromScene,'mode','scene'),switched);
  assert.deepEqual(filters.update(fromScene,'geometryRelation','unknown').geometryRelation,'any');
  assert.equal(filters.active(filters.normalize()),false);
});
