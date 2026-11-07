'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const camera=require('../src/geometry/CurvatureCameraTranslation');
const surface=require('../src/geometry/CurvatureSurfaceGeometry');
const contract=require('../src/scene/CurvatureSceneContract');
const optics=require('../src/optics/OpticalTowerSilhouette');
const interact=require('../src/ui/modern/ModernCameraInteraction');
const experiment=require('../src/ui/modern/ModernExperimentState');
const sceneState=require('../src/ui/modern/ModernSceneState');

function near(a,b,tolerance=1e-7){assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);}
function projected(e,n,h=15,curvature=1/6371000){
  const R=1/curvature;
  return surface.createFromCurvature(curvature).surfacePoint3(e,n,0).map((v,i)=>i===2?v-h:v);
}
test('Camera local globe translation preserves exact spherical height/ground range',()=>{
  const R=6371000,H=15;
  const p=projected(0,2000,H,1/R);
  let basis=camera.frame(0,500,H,1/R);
  let shifted=camera.pointAt(p,basis);
  const coords=optics.coordinate(shifted,'globe',R,H,surface.createFromCurvature(1/R));
  near(coords.distance,1500,1e-4);
  near(coords.height,0,1e-6);
  near(coords.azimuth,0,1e-9);
  // Same result for a large off-axis camera move, not a planar approximation.
  const east=18000,north=26000,target=projected(22000,33000,H,1/R);
  basis=camera.frame(east,north,H,1/R);
  shifted=camera.pointAt(target,basis);
  const length=Math.hypot(east,north),theta=length/R;
  const u=[Math.sin(theta)*east/length,Math.sin(theta)*north/length,Math.cos(theta)];
  const global=[target[0],target[1],target[2]+R+H];
  const dot=global.reduce((sum,v,i)=>sum+v*u[i],0);
  near(shifted[2]+R+H,dot,1e-6);
  const expectedHeight=Math.hypot(...global)-(R+H);
  const sampled=optics.coordinate(shifted,'globe',R,H,surface.createFromCurvature(1/R));
  near(sampled.height,expectedHeight+H,1e-5);
});
test('Flat camera translation is an exact observer-relative displacement',()=>{
  const p=[100,1000,5],out=camera.pointAt(p,camera.frame(20,40,15,0));
  assert.deepEqual(out,[80,960,5]);
});
test('Only physical objects are recentered; observer-relative metric guides stay put',()=>{
  const source=contract.createScene('legacy',[
    {type:'line',points:[[0,20,-15],[20,20,-15]]},
    {type:'line',points:[[10,100,-5],[10,101,20]]}],
    {composition:'optics-neutral-main',physicalMetricWorld:true});
  const composition={scene:source,ranges:[
    {role:'visual-aid',start:0,end:1},{role:'objects',start:1,end:2}]};
  assert.equal(camera.apply(composition,{east:0,north:0,height:15,curvature:0}),composition);
  const moved=camera.apply(composition,{east:3,north:50,height:15,curvature:0});
  assert.deepEqual(moved.scene.primitives[0].points,source.primitives[0].points);
  assert.deepEqual(moved.scene.primitives[1].points,[[7,50,-5],[7,51,20]]);
  assert.equal(source.primitives[1].points[0][0],10);
  assert.deepEqual(moved.scene.metadata.cameraPosition,{east:3,north:50,height:15});
  assert.throws(()=>camera.frame(500000,0,15,1/100000),/too far/);
});
test('Shift drag tracks shared local translation without changing orientation',()=>{
  const state=interact.create(),initial={Pan:30,Nick:1,Roll:3,Height:15,CameraEast:2,CameraNorth:4};
  state.begin({viewport:'B',mode:'translate',x:10,y:20,width:800,height:400,
    referenceDistance:1000,fovRadians:.1,aspectRatio:2,camera:initial});
  const sample=state.move({x:110,y:-30});
  const moved=interact.translate(sample);
  assert.ok(moved.CameraEast>initial.CameraEast);
  assert.ok(moved.CameraNorth<initial.CameraNorth);
  assert.ok(moved.Height>initial.Height);
  assert.deepEqual(interact.angles(sample).Roll,initial.Roll);
  assert.deepEqual(state.end(),sample);
  assert.equal(initial.CameraEast,2);
  assert.throws(()=>interact.translate({mode:'rotate'}),/Translation/);
});
test('Alt wheel dolly follows horizontal Pan and respects wheel modes',()=>{
  const cam={Pan:0,Nick:-65,Roll:30,CameraEast:0,CameraNorth:0};
  const forward=interact.dolly(cam,-100,0,1000);
  near(forward.CameraEast,0);near(forward.CameraNorth,10);
  const back=interact.dolly(cam,3,1,1000);
  near(back.CameraNorth,-10);
  const sideways=interact.dolly({...cam,Pan:90},-100,0,1000);
  near(sideways.CameraEast,10);near(sideways.CameraNorth,0);
  assert.equal(cam.Pan,0);assert.equal(cam.Nick,-65);
});
test('Presets reset offsets and camera bounds permit both translation axes',()=>{
  assert.equal(sceneState.CAMERA.CameraEast[0],-1e7);
  assert.equal(sceneState.CAMERA.CameraNorth[1],1e7);
  const model={CameraEast:45,CameraNorth:123};
  Object.assign(model,{ObjType:[3,3],NObjects:[0,0],ObjDist:[0,0],ObjDeltaDist:[1,1],
    ObjSidePos:[0,0],ObjSize:[1,1],ObjSideVar:[0,0],ObjSideType:[0,0],
    ObjSizeVar:[0,0],ObjSizeType:[0,0]});
  sceneState.applyPreset(model,'single');
  assert.equal(model.CameraEast,0);assert.equal(model.CameraNorth,0);
});

test('Translated authored towers run through actual flat/globe physical vacuum optics',()=>{
  const compose=require('../src/scene/CurvatureIndependentComposition');
  const optical=require('../src/optics/CurvaturePhysicalSceneOptics');
  const R=6371000;
  for(const flat of [false,true]){
    const m={rEarth:R,geometryRadius:R,Height:15,showModel:flat?2:1,
      ObjType:[3,3],NObjects:[1,0],ObjDist:[2000,5000],ObjDeltaDist:[300,300],
      ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSideType:[0,0],
      ObjSize:[65,65],ObjSizeVar:[0,0],ObjSizeType:[0,0],showGrid:0};
    const composed=compose.composeOpticalMain(m,!flat,{physicalWorld:true});
    const translated=camera.apply(composed,{east:50,north:600,height:15,
      curvature:flat?0:1/R});
    const source=composed.ranges.find(r=>r.role==='objects');
    const first=composed.scene.primitives[source.start].points[0];
    const next=translated.scene.primitives[source.start].points[0];
    assert.notDeepEqual(next,first);
    const frame=optical.create().transform(translated,m,{atmosphere:'vacuum'});
    assert.equal(frame.composition.scene.metadata.composition,'physical-projected-main');
    assert.ok(frame.stats.visibleSegments>0);
    assert.ok(frame.stats.fillTriangles>0);
    assert.equal(frame.stats.budgetExceeded,false);
  }
});
