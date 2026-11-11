'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const direction=require('../src/camera/ModernTargetDirection');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const translation=require('../src/geometry/CurvatureCameraTranslation');
const physicalCamera=require('../src/app/CurvaturePhysicalCamera');
function base(overrides={}){
  return {...{rEarth:6371000,rFEarth:10007543,geometryRadius:6371000,
    showModel:1,Height:15,CameraEast:0,CameraNorth:0,
    Pan:0,Nick:0,Roll:0,camViewAngle:Math.PI/3,deviceRatio:16/9,viewcenterHorizon:3,
    ObjType:[3,3],NObjects:[1,0],ObjDist:[1000,1000],ObjDeltaDist:[300,300],
    ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[65,65],
    ObjSizeVar:[0,0],ObjSizeType:[0,0]},...overrides};
}
const approx=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const sample=(m,sel)=>direction.measure(m,sel);

test('Geometric camera-forward anchor starts ahead and responds to pan without moving authored geometry',()=>{
  const m=base(),before=structuredClone(m),north=sample(m),right=sample({...m,Pan:-90});
  assert.equal(north.direction,'ahead');assert.equal(north.inView,true);
  approx(north.bearingDegrees,0);approx(north.relativeBearingDegrees,0);
  assert.equal(right.direction,'right');assert.equal(right.inView,false);
  approx(right.relativeBearingDegrees,90);
  const left=sample({...m,Pan:90});
  assert.equal(left.direction,'left');approx(left.relativeBearingDegrees,-90);
  const back=sample({...m,Pan:180});
  assert.equal(back.direction,'behind');assert.equal(back.inView,false);
  assert.equal(back.screenX,null);assert.equal(back.screenY,null);
  assert.deepEqual(m,before);
});

test('Flat surface and Globe both honor the camera-translated observer-relative coordinates',()=>{
  for(const showModel of [1,2]){
    const m=base({showModel,CameraEast:100,CameraNorth:500});
    const collected=direction.collect(m);
    assert.equal(collected.objects.length,1);
    const p=collected.objects[0].position;
    // The anchor is half-height, unlike the ground-base point; x/y are
    // observer-local, not old world-origin coordinates.
    approx(p[0],-100,0.1);approx(p[1],500,0.1);
    approx(sample(m).bearingDegrees,Math.atan2(-100,500)*180/Math.PI,0.001);
  }
});

test('Camera offset is parallel transported on Globe, not a flat subtraction',()=>{
  const m=base({CameraEast:18000,CameraNorth:26000,ObjDist:[33000,1000],
    ObjSidePos:[22000,0],Height:80});
  const list=direction.collect(m);
  const params=engine.objectSequence({...m,geometryRadius:m.rEarth},0,true,
    {physicalSurface:true,curvature:1/m.rEarth})[0].params;
  const plane=engine.towerPlacement(params);
  const world=plane.origin.map((v,i)=>v+plane.yAxis[i]/2);
  const expected=translation.pointAt(world,translation.frame(m.CameraEast,m.CameraNorth,m.Height,1/m.rEarth));
  for(let i=0;i<3;i++)approx(list.objects[0].position[i],expected[i],1e-7);
  const wrongFlat=[world[0]-m.CameraEast,world[1]-m.CameraNorth,world[2]];
  assert.ok(Math.hypot(...expected.map((v,i)=>v-wrongFlat[i]))>50,
    'large curved displacement is not the flat limit');
});

test('Globe and Flat retain different geometric depression at distance; no refraction visibility is inferred',()=>{
  const settings={ObjDist:[50000,2000],ObjSize:[10,10],Height:2};
  const globe=sample(base(settings));
  const flat=sample(base({...settings,showModel:2}));
  assert.ok(globe.elevationDegrees<flat.elevationDegrees);
  assert.ok(globe.elevationDegrees<0);
  assert.ok(flat.elevationDegrees>0);
  assert.equal(globe.direction,'ahead','below horizon can still be inside the viewport');
  assert.equal(flat.direction,'ahead');
  assert.equal(typeof globe.opticallyVisible,'undefined');
});

test('Object, group, and scene centres use the actual authored instances including twin columns',()=>{
  const m=base({showModel:2,NObjects:[3,2],ObjDist:[300,2000],
    ObjSideType:[1,0],ObjSidePos:[20,-50],ObjSideVar:[100,0],
    ObjDeltaDist:[200,300]});
  const positions=direction.collect(m);
  assert.equal(positions.objects.length,8,'three paired columns and two more objects');
  assert.equal(positions.groups.length,2);
  assert.equal(positions.groups[0].objectCount,6);
  assert.equal(positions.groups[1].objectCount,2);
  const average=points=>[0,1,2].map(i=>points.reduce((s,p)=>s+p.position[i],0)/points.length);
  for(const [group,index] of positions.groups.map((g,i)=>[g,i])){
    const members=positions.objects.filter(x=>x.groupIndex===index);
    for(let axis=0;axis<3;axis++)approx(group.position[axis],average(members)[axis]);
  }
  for(let axis=0;axis<3;axis++)approx(positions.scene.position[axis],average(positions.objects)[axis]);
  const object=direction.select(positions,{kind:'object',groupIndex:0,instanceIndex:3});
  assert.equal(object.groupIndex,0);assert.equal(object.instanceIndex,3);
  assert.notDeepEqual(object.position,positions.groups[0].position);
  assert.equal(direction.select(positions,{kind:'group',groupIndex:1}),positions.groups[1]);
  assert.equal(direction.select(positions),positions.scene);
  assert.equal(Object.isFrozen(positions.objects),true);
  assert.equal(Object.isFrozen(object.position),true);
});

test('Active rEarth overrides stale geometryRadius just as the physical renderer does',()=>{
  const m=base({rEarth:4000000,geometryRadius:6371000,ObjDist:[100000,1000]});
  const ref=direction.collect({...m,geometryRadius:m.rEarth});
  const stale=direction.collect(m);
  assert.deepEqual(stale,ref);
});

test('Camera view uses diagonal FOV with real aspect, not horizontal FOV',()=>{
  const m=base({showModel:2,Height:0,Pan:0,Nick:0,Roll:0,camViewAngle:Math.PI/3,deviceRatio:16/9});
  const halfTan=Math.tan(m.camViewAngle/2)/Math.hypot(m.deviceRatio,1);
  const hw=halfTan*m.deviceRatio,hh=halfTan;
  let r=direction.point(m,{position:[hw*1000,1000,0]});
  approx(r.screenX,1);approx(r.screenY,0);
  assert.equal(r.inView,true);
  r=direction.point(m,{position:[hw*1000*1.01,1000,0]});
  assert.equal(r.inView,false);assert.equal(r.direction,'right');
  r=direction.point(m,{position:[0,1000,hh*1000*1.01]});
  assert.equal(r.direction,'above');
  r=direction.point(m,{position:[0,1000,-hh*1000*1.01]});
  assert.equal(r.direction,'below');
});

test('Camera roll rotates screen axes, while geodetic bearing is not changed',()=>{
  const m=base({showModel:2});
  const east={position:[500,1000,0]};
  const noRoll=direction.point(m,east),rolled=direction.point({...m,Roll:90},east);
  approx(rolled.bearingDegrees,noRoll.bearingDegrees);
  approx(rolled.relativeBearingDegrees,noRoll.relativeBearingDegrees);
  approx(rolled.screenX,0,1e-10);
  approx(rolled.screenY,noRoll.screenX*m.deviceRatio,1e-10);
});

test('Aim modes modify vertical direction in the same way as physical rendering',()=>{
  const a=base({Height:100,Nick:0,viewcenterHorizon:3});
  const b={...a,viewcenterHorizon:0};
  const target=direction.collect(a).objects[0];
  const eye=direction.point(a,target),horizon=direction.point(b,target);
  assert.ok(horizon.screenY>eye.screenY);
  approx(horizon.bearingDegrees,eye.bearingDegrees);
});

test('Object anchors match physical authored scene primitives on flat and Globe',()=>{
  for(const flat of [false,true]){
    const m=base({showModel:flat?2:1,NObjects:[1,0],ObjDist:[1750,2000],ObjSidePos:[87,0]});
    const entries=engine.objectSequence({...m,geometryRadius:m.rEarth},0,!flat,
      {physicalSurface:true,curvature:flat?0:1/m.rEarth});
    const plane=engine.towerPlacement(entries[0].params);
    const target=direction.collect(m).objects[0].position;
    for(let i=0;i<3;i++)approx(target[i],plane.origin[i]+plane.yAxis[i]/2);
  }
});

test('No objects is a legitimate empty result, without a phantom direction',()=>{
  const m=base({NObjects:[0,0]});
  assert.deepEqual(direction.collect(m).objects,[]);
  assert.equal(direction.collect(m).scene,null);
  assert.equal(sample(m),null);
  assert.equal(direction.select(direction.collect(m),{kind:'group',groupIndex:0}),null);
  assert.equal(direction.point(m,null),null);
});

test('Behind and coincident targets have no misleading projected screen coordinates',()=>{
  const m=base({showModel:2});
  const behind=direction.point(m,{position:[0,-100,0]});
  assert.equal(behind.direction,'behind');assert.equal(behind.screenY,null);
  const here=direction.point(m,{position:[0,0,0]});
  assert.equal(here.direction,'here');assert.equal(here.relativeBearingDegrees,null);
  assert.equal(here.inView,false);
});

test('Invalid model, selection or target fails closed without altering input',()=>{
  const m=base();
  for(const patch of [{showModel:3},{rEarth:0},{CameraEast:NaN},
    {CameraNorth:Infinity},{Height:-2},{NObjects:[1,-1]},{NObjects:[1,0.5]}])
    assert.throws(()=>sample({...m,...patch}),RangeError);
  assert.throws(()=>sample(null),TypeError);
  const targets=direction.collect(m);
  assert.throws(()=>direction.select(targets,{kind:'wrong'}),RangeError);
  assert.throws(()=>direction.select(targets,{kind:'group',groupIndex:9}),RangeError);
  assert.throws(()=>direction.select(targets,{kind:'object',groupIndex:0,instanceIndex:-1}),RangeError);
  assert.equal(direction.select(targets,{kind:'object',groupIndex:0,instanceIndex:999}),null);
  assert.throws(()=>direction.point(m,{position:[0,NaN,0]}),RangeError);
  assert.throws(()=>direction.point(m,{position:[0,0]}),TypeError);
  assert.throws(()=>direction.collect({...m,CameraNorth:1e7,CameraEast:1e7}),RangeError);
});

test('UMD browser loads after physical dependencies and is not included in Legacy',()=>{
  const root={CurvatureGeometryEngine:engine,CurvatureCameraTranslation:translation,
    CurvaturePhysicalCamera:physicalCamera};
  const source=fs.readFileSync(path.join(__dirname,'../src/camera/ModernTargetDirection.js'),'utf8');
  vm.runInNewContext(source,{globalThis:root});
  assert.equal(root.CurvatureModernTargetDirection.measure(base()).direction,'ahead');
  const modern=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const legacy=fs.readFileSync(path.join(__dirname,'../CurvatureApp.html'),'utf8');
  const name='src/camera/ModernTargetDirection.js';
  assert.equal(modern.split(name).length,2);
  assert.equal(legacy.includes(name),false);
  for(const dependency of ['src/geometry/CurvatureGeometryEngine.js',
    'src/geometry/CurvatureCameraTranslation.js','src/app/CurvaturePhysicalCamera.js'])
    assert.ok(modern.indexOf(dependency)<modern.indexOf(name),dependency);
  assert.ok(modern.indexOf(name)<modern.indexOf('src/ui/modern/ModernApp.js'));
});
