'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const engine=require('../src/animation/ModernAnimationCompatibility');
const animation=require('../src/animation/ModernAnimationProject');
const contracts=require('../src/animation/ModernAnimationContract');
const clone=structuredClone;
function snapshot(mode='scene'){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Base',Description:'',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,20000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return state.capture(model,{atmosphere:'temperature-lapse',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:false,horizon:true,selected:'A'});
}
const target=(scope,parameter)=>({scope,parameter});

test('Camera contract freezes physical scene, allows only supported camera motion and zoom',()=>{
  const a=snapshot(),original=clone(a),c=contracts.create(a,{mode:'camera'});
  const b=clone(a);b.scene.camera.Height=40;b.scene.camera.FocalLengthField=3000;
  assert.equal(contracts.inspectCandidate(c,b).allowed,true);
  assert.deepEqual(contracts.allowedPaths(c),[
    'camera.CameraEast','camera.CameraNorth','camera.Height','camera.Pan',
    'camera.Nick','camera.Roll','camera.FocalLengthField']);
  assert.equal(contracts.inspectCandidate(c,a).allowed,true,'unchanged candidate is allowed');
  const changed=clone(b);changed.scene.temperatureProfile.gradientKPerKm=3;
  const rejected=contracts.inspectCandidate(c,changed);
  assert.equal(rejected.allowed,false);assert.equal(rejected.previewCompatible,false);
  assert.ok(rejected.issues.some(issue=>issue.path==='scene.temperatureProfile.gradientKPerKm'));
  const objects=clone(b);objects.scene.objects.ObjDist[0]+=1;
  assert.ok(contracts.inspectCandidate(c,objects).issues.some(issue=>issue.path==='scene.objects.ObjDist.0'));
  assert.deepEqual(a,original);
  assert.equal(Object.isFrozen(c.referenceExperiment.scene.objects.NObjects),true);
  assert.equal(c.referenceExperiment===a,false);
});

test('Physical contracts permit only the chosen curvature channel including Globe to Flat',()=>{
  const a=snapshot(),b=clone(a),c=contracts.create(a,{mode:'physical',
    target:target('scene','surface.curvature')});
  b.scene.surface.showModel=2;
  assert.equal(contracts.inspectCandidate(c,b).allowed,true);
  assert.deepEqual(contracts.allowedPaths(c),['scene.surface.curvature']);
  const other=clone(b);other.scene.camera.Height=50;
  assert.deepEqual(contracts.inspectCandidate(c,other).issues.map(e=>e.path),['camera.Height']);
  const withGradient=clone(b);withGradient.scene.temperatureProfile.gradientKPerKm=0;
  assert.equal(contracts.inspectCandidate(c,withGradient).allowed,false);
  assert.equal(contracts.inspectFrames(c,[a,b]).previewCompatible,true);
  assert.deepEqual(animation.create([a,b],{id:'contract_curvature',name:'Curvature'}).target,
    target('scene','surface.curvature'));
});

test('Temperature contracts require active lapse model and do not allow camera zoom',()=>{
  const a=snapshot(),gradient=target('scene','temperatureProfile.gradientKPerKm');
  const c=contracts.create(a,{mode:'physical',target:gradient});
  const b=clone(a);b.scene.temperatureProfile.gradientKPerKm=10;
  assert.equal(contracts.inspectCandidate(c,b).allowed,true);
  b.scene.camera.FocalLengthField+=500;
  assert.equal(contracts.inspectCandidate(c,b).allowed,false);
  assert.ok(contracts.inspectCandidate(c,b).issues.some(x=>x.path==='camera.FocalLengthField'));
  const vacuum=clone(a);vacuum.scene.atmosphere='vacuum';
  assert.throws(()=>contracts.create(vacuum,{mode:'physical',target:gradient}),/Inactive/);
  assert.throws(()=>contracts.create(a,{mode:'physical',target:target('B','surface.curvature')}),/Inactive/);
});

test('Compare A and B are distinct physical channels and mode switch is not an animation',()=>{
  const a=snapshot('compare'),b=clone(a);
  const c=contracts.create(a,{mode:'physical',target:target('A','surface.curvature')});
  b.compare.A.surface='flat';
  assert.equal(contracts.inspectCandidate(c,b).allowed,true);
  b.compare.B.surface='globe';
  assert.equal(contracts.inspectCandidate(c,b).allowed,false);
  assert.ok(contracts.inspectCandidate(c,b).issues.some(x=>x.path.startsWith('compare.B.')));
  const d=clone(a);d.display.mode='scene';
  assert.ok(contracts.inspectCandidate(c,d).issues.some(x=>x.path==='mode'));
});

test('Scene signatures ignore editing controls of empty groups but not active layout',()=>{
  const a=snapshot(),b=clone(a);
  a.scene.objects.NObjects[1]=b.scene.objects.NObjects[1]=0;
  b.scene.objects.ObjDist[1]+=3000;b.scene.objects.ObjType[1]=1;
  const s1=contracts.signatures(a),s2=contracts.signatures(b);
  assert.deepEqual(s1,s2);
  assert.equal(engine.inspect([a,b],{mode:'camera'}).compatible,true);
  assert.equal(contracts.inspectCandidate(contracts.create(a,{mode:'camera'}),b).allowed,true);
  assert.equal(animation.create([a,b],{id:'empty_group',name:'Empty group',mode:'camera'}).mode,'camera');
  b.scene.objects.NObjects[1]=1;
  assert.notEqual(contracts.signatures(a).scene,contracts.signatures(b).scene);
  assert.equal(contracts.inspectCandidate(contracts.create(a,{mode:'camera'}),b).allowed,false);
});

test('Signatures split scene, physics, camera and presentation independently',()=>{
  const a=snapshot(),camera=clone(a),physics=clone(a),view=clone(a);
  camera.scene.camera.Pan=30;
  physics.scene.temperatureProfile.gradientKPerKm=6;
  view.display.horizon=false;
  const base=contracts.signatures(a),moving=contracts.signatures(camera),air=contracts.signatures(physics),ui=contracts.signatures(view);
  assert.deepEqual(Object.keys(base),['scene','physics','camera','display']);
  assert.equal(moving.scene,base.scene);assert.equal(moving.physics,base.physics);
  assert.notEqual(moving.camera,base.camera);
  assert.notEqual(air.physics,base.physics);assert.equal(air.scene,base.scene);
  assert.notEqual(ui.display,base.display);assert.equal(ui.physics,base.physics);
  const inactive=clone(a);inactive.scene.surface.showModel=2;
  const inactive2=clone(inactive);inactive2.scene.surface.rEarth=123456789;
  assert.equal(contracts.signatures(inactive).physics,contracts.signatures(inactive2).physics);
  inactive2.scene.title='Changed';inactive2.scene.description='Different';
  assert.deepEqual(contracts.signatures(inactive),contracts.signatures(inactive2));
});

test('Experimental accepts valid mixed frames but never promises renderer compatibility',()=>{
  const a=snapshot(),b=clone(a),c=clone(a);
  b.scene.camera.Height=50;c.display.mode='compare';
  const contract=contracts.create(a,{mode:'experimental'});
  assert.deepEqual(contracts.allowedPaths(contract),['*']);
  const result=contracts.inspectCandidate(contract,c);
  assert.equal(result.allowed,true);assert.equal(result.previewCompatible,null);
  assert.ok(result.changedPaths.includes('mode'));
  const group=contracts.inspectFrames(contract,[a,b,c]);
  assert.equal(group.accepted,true);assert.equal(group.previewCompatible,false);
  assert.equal(group.checks.length,3);
  assert.throws(()=>contracts.inspectCandidate(contract,{not:'a snapshot'}));
});

test('Sequence preflight requires at least two frames for preview and has no side effects',()=>{
  const a=snapshot(),b=clone(a),c=clone(a);
  b.scene.camera.Height=60;c.scene.objects.ObjDist[0]+=10;
  const contract=contracts.create(a,{mode:'camera'}),before=clone([a,b,c]);
  assert.deepEqual(contracts.inspectFrames(contract,[]),{
    accepted:true,checks:[],previewCompatible:false,previewIssues:[]});
  assert.equal(contracts.inspectFrames(contract,[a]).previewCompatible,false);
  const mixed=contracts.inspectFrames(contract,[a,b,c]);
  assert.equal(mixed.accepted,false);assert.equal(mixed.previewCompatible,false);
  assert.equal(mixed.checks[1].allowed,true);assert.equal(mixed.checks[2].allowed,false);
  assert.equal(contracts.inspectFrames(contract,[a,b]).previewCompatible,true);
  assert.deepEqual([a,b,c],before);
  assert.throws(()=>contracts.inspectFrames(contract,new Array(201).fill(a)),/frame count/);
});

test('Contract validation is strict, round-trippable, and does not freeze caller input',()=>{
  const a=snapshot(),parameters=target('scene','surface.curvature');
  const c=contracts.create(a,{mode:'physical',target:parameters});
  assert.equal(Object.isFrozen(parameters),false);
  assert.deepEqual(contracts.validate(clone(c)),c);
  const bad=[{...c,version:2},{...c,mode:'mixed'},
    {...c,extra:1},{...c,target:null},
    {...c,target:{scope:'scene',parameter:'other'}},
    {...c,referenceExperiment:{broken:true}}];
  bad.forEach(v=>assert.throws(()=>contracts.validate(v)));
  assert.throws(()=>contracts.create(a,{mode:'camera',target:parameters}));
  assert.throws(()=>contracts.create(a,{mode:'experimental',target:parameters}));
  assert.throws(()=>contracts.create(a,{}));
  assert.throws(()=>contracts.create(a,{mode:'camera',extra:true}));
  assert.equal(contracts.create(a,{mode:'camera'}).mode,'camera');
});

test('Browser load order exposes the pure module without running app or altering state',()=>{
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const source='src/animation/ModernAnimationContract.js';
  assert.ok(html.indexOf('ModernAnimationCompatibility.js')<html.indexOf(source));
  assert.ok(html.indexOf(source)<html.indexOf('ModernAnimationStudio.js'));
  const sandbox={CurvatureModernExperimentState:state,
    CurvatureModernAnimationCompatibility:engine};
  vm.runInNewContext(fs.readFileSync(path.join(root,source),'utf8'),sandbox);
  assert.equal(typeof sandbox.CurvatureModernAnimationContract.create,'function');
  const before=clone(snapshot());
  const result=sandbox.CurvatureModernAnimationContract.create(before,{mode:'camera'});
  assert.equal(result.mode,'camera');assert.deepEqual(snapshot(),before);
});
