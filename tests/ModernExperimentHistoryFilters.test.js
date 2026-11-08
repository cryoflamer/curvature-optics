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
  assert.deepEqual(filters.normalize(),{query:'',mode:'all',geometry:'any',atmosphere:'any'});
  assert.deepEqual(filters.normalize({mode:'bogus',geometry:'cube',atmosphere:42,query:{}}),
    filters.normalize());
  assert.equal(filters.normalize({query:'x'.repeat(1000)}).query.length,160);
  assert.equal(filters.normalize({query:'  hi  '}).query,'hi');
  assert.equal(filters.normalize({query:'hi',mode:'compare'}).mode,'compare');
  assert.equal(Object.isFrozen(filters.normalize()),true);
});
