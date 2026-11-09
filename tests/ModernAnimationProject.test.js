'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const compat=require('../src/animation/ModernAnimationCompatibility');
const animation=require('../src/animation/ModernAnimationProject');
const clone=v=>structuredClone(v);
function experiment(mode='scene'){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Base',Description:'',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,20000],ObjDeltaDist:[297.55,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return codec.capture(model,{atmosphere:'temperature-lapse',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:false,horizon:true,selected:'A'});
}
function project(snapshots,options={}){
  return animation.create(snapshots,{id:'test-anim',name:'Test animation',...options});
}
const near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<=eps,`${a} differs from ${b}`);

test('Camera snapshots infer one animation channel and preserve owned data',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.camera.Height=55;b.scene.camera.Pan=90;b.scene.camera.FocalLengthField=4000;
  c.scene.camera.Height=100;c.scene.camera.Pan=180;
  const original=clone([a,b,c]);
  const check=compat.inspect([a,b,c]);
  assert.equal(check.compatible,true);assert.equal(check.mode,'camera');assert.equal(check.target,null);
  assert.deepEqual(check.changedPaths,['camera.FocalLengthField','camera.Height','camera.Pan']);
  const p=project([{id:11,name:'Start',experiment:a,holdMs:1000},
    {id:12,name:'Middle',experiment:b,travelMs:4000,easing:'linear'},
    {id:13,name:'End',experiment:c,travelMs:2000}]);
  assert.equal(p.version,1);assert.equal(p.keyframes.length,3);
  assert.deepEqual(p.keyframes.map(f=>f.sourceSnapshotId),[11,12,13]);
  assert.equal(animation.totalMs(p),7000);
  assert.deepEqual(animation.timeline(p).map(x=>[x.arrivalMs,x.departureMs]),
    [[0,1000],[5000,5000],[7000,7000]]);
  near(animation.sampleAt(p,3000).scene.camera.Height,35);
  near(animation.sampleAt(p,3000).scene.camera.FocalLengthField,Math.sqrt(2000*4000));
  assert.equal(animation.sampleAt(p,-100).scene.camera.Height,15);
  assert.equal(animation.sampleAt(p,99999).scene.camera.Height,100);
  assert.deepEqual([a,b,c],original);
  assert.equal(Object.isFrozen(p.baseExperiment.scene.camera),true);
  assert.deepEqual(animation.validate(clone(p)),p,'JSON roundtrip preserves project');
  const prior=animation.sampleAt(p,3000);prior.scene.camera.Height=999;
  assert.equal(animation.sampleAt(p,3000).scene.camera.Height,35);
});

test('physical temperature gradient interpolates without moving camera or modifying inputs',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  a.scene.temperatureProfile.gradientKPerKm=-6.5;
  b.scene.temperatureProfile.gradientKPerKm=2;
  c.scene.temperatureProfile.gradientKPerKm=10;
  const check=compat.inspect([a,b,c]);
  assert.deepEqual(check.target,{scope:'scene',parameter:'temperatureProfile.gradientKPerKm'});
  const p=project([a,b,c]);
  assert.equal(p.mode,'physical');assert.equal(p.keyframes[1].value,2);
  const mid=animation.sampleAt(p,2500);
  near(mid.scene.temperatureProfile.gradientKPerKm,-2.25);
  assert.deepEqual(mid.scene.camera,a.scene.camera);
  assert.deepEqual(mid.scene.objects,a.scene.objects);
  assert.equal(mid.scene.temperatureProfile.temperatureC,a.scene.temperatureProfile.temperatureC);
  assert.equal(animation.sampleAt(p,10000).scene.temperatureProfile.gradientKPerKm,10);
  assert.equal(a.scene.temperatureProfile.gradientKPerKm,-6.5);
});

test('physical curvature uses inverse radius and represents exact Flat',()=>{
  const a=experiment(),b=clone(a),c=clone(a);
  b.scene.surface.rEarth=12742000;
  c.scene.surface.showModel=2;c.scene.surface.rEarth=99999999;
  const check=compat.inspect([a,b,c]);
  assert.equal(check.compatible,true);
  assert.deepEqual(check.target,{scope:'scene',parameter:'surface.curvature'});
  const p=project([a,b,c]);
  near(animation.sampleAt(p,2500).scene.surface.rEarth,8494666.666666667,1e-5);
  const intermediate=animation.sampleAt(p,7500).scene.surface;
  near(intermediate.rEarth,25484000,1e-5);
  assert.equal(intermediate.showModel,1);
  const final=animation.sampleAt(p,10000);
  assert.equal(final.scene.surface.showModel,2);
  assert.equal(compat.effective(final).scene.surface.curvature,0);
  assert.equal(final.scene.camera.Height,15);
  const reverse=project([c,a]);
  assert.equal(animation.sampleAt(reverse,0).scene.surface.showModel,2);
  near(animation.sampleAt(reverse,2500).scene.surface.rEarth,12742000,1e-5);
});

test('Compare permits shared camera motion without altering either A/B physics',()=>{
  const a=experiment('compare'),b=clone(a);b.scene.camera.Height=30;
  b.compare.selected='B';b.scene.title='Other label';
  const p=project([a,b]);
  const mid=animation.sampleAt(p,2500);
  near(mid.scene.camera.Height,22.5);
  assert.deepEqual(mid.compare.A,a.compare.A);assert.deepEqual(mid.compare.B,a.compare.B);
  assert.equal(mid.display.mode,'compare');
});

test('Compare allows changing gradient on A OR B while other model is fixed',()=>{
  const a=experiment('compare'),b=clone(a);
  a.compare.A.atmosphere=b.compare.A.atmosphere='temperature-lapse';
  b.compare.A.temperatureProfile.gradientKPerKm=10;
  const check=compat.inspect([a,b]);
  assert.deepEqual(check.target,{scope:'A',parameter:'temperatureProfile.gradientKPerKm'});
  const p=project([a,b]);
  assert.equal(animation.sampleAt(p,2500).compare.A.temperatureProfile.gradientKPerKm,1.75);
  assert.deepEqual(animation.sampleAt(p,2500).compare.B,a.compare.B);
  const c=clone(b);c.compare.B.surface='globe';
  assert.equal(compat.inspect([a,b,c]).compatible,false);
  assert.throws(()=>project([a,b,c]),/Incompatible/);
});

test('Compare curvature in one viewport preserves independent second viewport',()=>{
  const a=experiment('compare'),b=clone(a);
  a.compare.B.surface=b.compare.B.surface='flat';
  b.compare.A.surface='flat';
  const p=project([a,b]);
  assert.deepEqual(p.target,{scope:'A',parameter:'surface.curvature'});
  const mid=animation.sampleAt(p,2500);
  near(mid.compare.A.radiusKm,12742,1e-7);
  assert.equal(mid.compare.B.surface,'flat');
  assert.deepEqual(mid.compare.B,a.compare.B);
  assert.equal(animation.sampleAt(p,5000).compare.A.surface,'flat');
});

test('inactive Flat radius and Vacuum gradient do not count as changes',()=>{
  const a=experiment(),b=clone(a);
  a.scene.surface.showModel=b.scene.surface.showModel=2;
  a.scene.atmosphere=b.scene.atmosphere='vacuum';
  b.scene.surface.rEarth=1000000000;
  b.scene.temperatureProfile.gradientKPerKm=17;
  b.compare.B.radiusKm=55555; // inactive Compare editor in Scene
  b.compare.selected='B';b.scene.preset='custom';b.scene.title='Other label';
  b.cameraPositions=[{id:'saved',name:'Old',camera:{...b.scene.camera}}];
  assert.deepEqual(compat.inspect([a,b]).changedPaths,[]);
  assert.equal(compat.inspect([a,b]).compatible,false,'unchanged states require an explicit mode');
  assert.equal(compat.inspect([a,b],{mode:'camera'}).compatible,true);
  const p=project([a,b],{mode:'camera'});
  assert.equal(p.mode,'camera');
});

test('Global channel constraint rejects camera plus physics and one channel per segment',()=>{
  const a=experiment(),b=clone(a),c=clone(b);
  b.scene.camera.Height=30;
  c.scene.temperatureProfile.gradientKPerKm=10;
  const check=compat.inspect([a,b,c]);
  assert.equal(check.compatible,false);
  assert.ok(check.changedPaths.includes('camera.Height'));
  assert.ok(check.changedPaths.includes('scene.temperatureProfile.gradientKPerKm'));
  assert.throws(()=>project([a,b,c]),e=>e instanceof RangeError&&e.issues.length>0);
  assert.equal(compat.inspect([a,b],{mode:'physical',target:{scope:'scene',
    parameter:'temperatureProfile.gradientKPerKm'}}).issues[0].code,'camera-change');
});

test('Two physical channels are forbidden even if changed on separate segments',()=>{
  const a=experiment(),b=clone(a),c=clone(b);
  b.scene.surface.rEarth=10000000;
  c.scene.temperatureProfile.gradientKPerKm=10;
  const check=compat.inspect([a,b,c]);
  assert.equal(check.compatible,false);
  assert.equal(check.changedPaths.length,2);
  const forced=compat.inspect([a,b,c],{mode:'physical',
    target:{scope:'scene',parameter:'surface.curvature'}});
  assert.equal(forced.issues[0].code,'multiple-physical-channels');
});

test('View and object changes are blockers, not animation channels',()=>{
  const a=experiment(),b=clone(a);
  b.scene.objects.ObjDist[0]+=1;
  b.display.horizon=!b.display.horizon;
  b.scene.camera.viewcenterHorizon=2;
  const check=compat.inspect([a,b],{mode:'camera'});
  assert.equal(check.compatible,false);
  assert.deepEqual(check.issues.map(i=>i.path),
    ['camera.viewcenterHorizon','display.horizon','scene.objects.ObjDist.0']);
  assert.throws(()=>project([a,b],{mode:'camera'}));
});

test('Active pressure and temperature are not mistaken for gradient animation',()=>{
  const a=experiment(),b=clone(a);
  b.scene.temperatureProfile.pressureHpa=850;
  const result=compat.inspect([a,b]);
  assert.equal(result.compatible,false);
  assert.ok(result.changedPaths.includes('scene.temperatureProfile.pressureHpa'));
  assert.throws(()=>project([a,b],{mode:'physical',target:{scope:'scene',
    parameter:'temperatureProfile.gradientKPerKm'}}));
});

test('Discrete atmosphere switches, Scene/Compare switches, and inactive targets are blocked',()=>{
  const a=experiment(),b=clone(a);b.scene.atmosphere='vacuum';
  assert.equal(compat.inspect([a,b]).compatible,false);
  assert.ok(compat.inspect([a,b]).changedPaths.includes('scene.atmosphere'));
  const c=clone(a);c.display.mode='compare';
  assert.equal(compat.inspect([a,c]).compatible,false);
  const plain=clone(a);plain.scene.atmosphere='vacuum';
  assert.equal(compat.inspect([plain,plain],{mode:'physical',
    target:{scope:'scene',parameter:'temperatureProfile.gradientKPerKm'}}).issues[0].code,'inactive-target');
});

test('Explicit mode resolves unchanged sequences but incorrect targets are rejected',()=>{
  const a=experiment();
  assert.equal(compat.inspect([a,a],{mode:'camera'}).compatible,true);
  assert.equal(compat.inspect([a,a],{mode:'physical',target:{scope:'scene',
    parameter:'surface.curvature'}}).compatible,true);
  const other=clone(a);other.scene.surface.rEarth=10000000;
  assert.equal(compat.inspect([a,other],{mode:'camera'}).compatible,false);
  assert.throws(()=>compat.inspect([a,a],{mode:'camera',target:{scope:'scene',
    parameter:'surface.curvature'}}));
  const wrong=compat.inspect([a,a],{mode:'physical',target:{scope:'B',
    parameter:'surface.curvature'}});
  assert.equal(wrong.compatible,false);
  assert.equal(wrong.issues[0].code,'inactive-target');
  const inferredWithWrongTarget=compat.inspect([a,other],{target:{scope:'scene',
    parameter:'temperatureProfile.gradientKPerKm'}});
  assert.equal(inferredWithWrongTarget.compatible,false);
  assert.equal(inferredWithWrongTarget.issues[0].code,'multiple-physical-channels');
});

test('Project metadata and source snapshot IDs never influence sampled physics',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=80;
  const p=project([{id:12,name:'First',experiment:a},{id:13,name:'Second',experiment:b}]);
  const copy=clone(p);
  copy.name='Renamed';copy.description='Note';copy.keyframes[1].name='Other';
  copy.keyframes[1].sourceSnapshotId='imported-id';
  assert.deepEqual(animation.sampleAt(copy,2500),animation.sampleAt(p,2500));
  assert.deepEqual(animation.validate(copy).name,'Renamed');
  assert.deepEqual(p.baseExperiment.scene.camera,a.scene.camera);
  assert.equal(animation.sampleAt(p,0).scene.camera.Height,15);
});

test('Bad project schemas, frame values, time metadata and bounds are rejected',()=>{
  const a=experiment(),b=clone(a);b.scene.camera.Height=80;
  const p=clone(project([a,b]));
  const bad=[
    {...p,version:2},{...p,id:'../oops'},
    {...p,mode:'physical',target:null},
    {...p,keyframes:[]},{...p,keyframes:[p.keyframes[0]]},
    {...p,keyframes:[{...p.keyframes[0],travelMs:1},p.keyframes[1]]},
    {...p,keyframes:[p.keyframes[0],{...p.keyframes[1],travelMs:0}]},
    {...p,keyframes:[p.keyframes[0],{...p.keyframes[1],easing:'elastic'}]},
    {...p,keyframes:[p.keyframes[0],{...p.keyframes[1],sourceSnapshotId:-1}]},
    {...p,keyframes:[p.keyframes[0],{...p.keyframes[1],value:{...p.keyframes[1].value,Height:0}}]},
    {...p,extra:'unsafe'}
  ];
  for(const item of bad)assert.throws(()=>animation.validate(item));
  for(const time of [NaN,Infinity,'1000'])assert.throws(()=>animation.sampleAt(p,time));
  assert.throws(()=>animation.create([a,b]),/Invalid animation project text/);
  assert.throws(()=>animation.create([a],{id:'a',name:'One'}));
  assert.throws(()=>animation.create(Array(201).fill(a),{id:'a',name:'Many'}));
});

test('Curvature interpolation explicitly rejects intermediate radii outside allowed model range',()=>{
  const a=experiment(),b=clone(a);
  b.scene.surface.showModel=2;a.scene.surface.rEarth=1e16;
  const p=project([a,b]);
  assert.throws(()=>animation.sampleAt(p,2500),/supported radius/);
  assert.equal(animation.sampleAt(p,0).scene.surface.rEarth,1e16);
  assert.equal(animation.sampleAt(p,5000).scene.surface.showModel,2);
});
