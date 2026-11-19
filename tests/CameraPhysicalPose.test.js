'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../src/calibration/CameraPhysicalPose');
const projection=require('../src/calibration/CameraLandmarkProjection');
const perspective=require('../src/calibration/CameraPerspectiveSeed');
const sweep=require('../src/calibration/CameraFocalSweep');
const surface=require('../src/geometry/CurvatureSurfaceGeometry');
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const close=(a,b,tol)=>assert.ok(Math.abs(a-b)<=tol,`${a} vs ${b}, tolerance ${tol}`);
const normError=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const base={rEarth:6371000,rFEarth:10007543,geometryRadius:6371000,
  CameraEast:-300,CameraNorth:-600,Height:45,Pan:26.56505117707799,Nick:2,Roll:13,
  FocalLengthField:43,deviceRatio:1.5,viewcenterHorizon:3};
const points=Array.from({length:12},(_,i)=>({id:`p${i}`,east:35*Math.sin(i*2.1),north:70*Math.cos(i*1.3),height:50+12*Math.sin(i*3.7)}));
function world(m,p){return surface.createFromCurvature(m.showModel===1?1/m.rEarth:0).surfacePoint3(p.east,p.north,p.height);}
function pinhole(seed,w,width,height){const [x,y,z]=seed.rotation.map(r=>dot(r,w.map((v,i)=>v-seed.position[i])));assert.ok(z>0);return [width/2+seed.focalPx*x/z,height/2+seed.focalPx*y/z];}
function comparePose(a,b,tolerance=1e-7){for(const p of ['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'])close(a[p],b[p],tolerance);}
for(const showModel of [1,2])for(const [width,height] of [[1200,800],[800,1200],[1920,1080]]){
  test(`pose and vacuum point projection round trip: model ${showModel}, ${width}x${height}`,t=>{
    const m={...base,showModel},snapshot=JSON.stringify(m),seed=bridge.toPerspective(m,width,height);
    const converted=bridge.fromPerspective(seed,m,width,height),restored={...m,...converted.pose};
    assert.equal(JSON.stringify(m),snapshot);assert.equal(converted.viewport,'centered-full-canvas');
    comparePose(restored,m);close(converted.focalPx,seed.focalPx,1e-8);
    const seedAgain=bridge.toPerspective(restored,width,height);
    assert.ok(normError(seed.position,seedAgain.position)<1e-8);
    seed.rotation.forEach((r,i)=>assert.ok(normError(r,seedAgain.rotation[i])<1e-12));
    let max=0;
    for(const method of ['accurate','canvas-direct']){
      const session=projection.create(restored,converted.camera,width,height,{method,atmosphere:'vacuum'});
      for(const p of points){const actual=session.metric(p);assert.equal(actual.status,'visible');
        max=Math.max(max,normError(actual.pixel,pinhole(seed,world(m,p),width,height)));}
    }
    t.diagnostic(`max vacuum projection error: ${max} px`);assert.ok(max<1e-6);
  });
}
for(const showModel of [1,2])for(const side of [-1,1]){
  test(`unknown pose recovery into physical projector: model ${showModel}, side ${side}`,t=>{
    const width=1920,height=1080,m={...base,showModel,CameraEast:side*300,Pan:-side*base.Pan,Roll:side*13};
    const session=projection.create(m,bridge.photoCamera(m,width,height),width,height,{atmosphere:'vacuum'});
    const observations=points.map(p=>{const r=session.metric(p);assert.equal(r.status,'visible');return {world:world(m,p),pixel:r.pixel};});
    for(const solver of [perspective,sweep]){
      const result=solver.initialize(observations,{width,height,minFocalPx:500,maxFocalPx:10000,samples:33});
      assert.equal(result.status,'candidates',result.reason);
      const converted=bridge.fromPerspective(result.candidates[0],m,width,height),restored={...m,...converted.pose};
      comparePose(restored,m,.02);
      const recovered=projection.create(restored,converted.camera,width,height,{atmosphere:'vacuum'});
      const max=Math.max(...points.map((p,i)=>normError(recovered.metric(p).pixel,observations[i].pixel)));
      t.diagnostic(`${result.candidates[0].method}: max ${max} px`);assert.ok(max<.002);
    }
  });
}
test('negative tangent z can still be above Globe surface',()=>{
  const m={...base,showModel:1,CameraEast:15000,CameraNorth:30000,Height:2,Pan:-135,Nick:-5,Roll:-31};
  const seed=bridge.toPerspective(m,800,1200);assert.ok(seed.position[2]<0);
  comparePose(bridge.fromPerspective(seed,m,800,1200).pose,m,1e-7);
});
test('wide raster uses actual legacy scene-size convention, not the nominal diagonal equivalent',()=>{
  const m={...base,showModel:2},focalPx=2500,seed={...bridge.toPerspective(m,1920,1080),focalPx};
  const fit=bridge.fromPerspective(seed,m,1920,1080);
  close(fit.diagonalEquivalentMm,43.2*focalPx/Math.hypot(1920,1080),1e-12);
  close(fit.pose.FocalLengthField/fit.diagonalEquivalentMm,(1920/1080)/1.5,1e-12);
  close(fit.focalPx,focalPx,1e-10);
});
test('invalid or unsupported cameras fail instead of clamping pose',()=>{
  const m={...base,showModel:2},seed=bridge.toPerspective(m,1200,800);
  assert.throws(()=>bridge.fromPerspective({...seed,position:[0,0,-1]},m,1200,800),/Height/);
  assert.throws(()=>bridge.fromPerspective({...seed,rotation:[[1,0,0],[0,1,0],[0,0,-1]]},m,1200,800),/proper/);
  assert.throws(()=>bridge.fromPerspective({...seed,focalPx:1e10},m,1200,800),/Field of view/);
  const upward={position:[0,0,10],rotation:[[1,0,0],[0,0,-1],[0,1,0]],focalPx:1000};
  assert.throws(()=>bridge.fromPerspective({...upward,rotation:[[1,0,0],[0,1,0],[0,0,1]]},m,1200,800),/Nick/);
  assert.throws(()=>bridge.fromPerspective({...seed,position:[1e8,0,10]},m,1200,800),/offset/);
  assert.throws(()=>bridge.fromPerspective({...seed,position:[0,0,-2*m.rEarth-10]}, {...m,showModel:1},1200,800),/local Globe/);
  assert.throws(()=>bridge.photoCamera({...m,viewcenterHorizon:0},1200,800),/Eye-Lvl/);
  assert.throws(()=>bridge.photoCamera(m,0,800),/raster/);
});
for(const showModel of [1,2])test(`distant telephoto physical reprojection survives pose conversion: model ${showModel}`,t=>{
  const width=1920,height=1080,m={...base,showModel,CameraEast:-1500,CameraNorth:-6000,Height:20,
    Pan:Math.atan2(1500,22000)*180/Math.PI,Nick:-.1,Roll:10,FocalLengthField:500};
  const before=bridge.photoCamera(m,width,height),fit=bridge.fromPerspective(bridge.toPerspective(m,width,height),m,width,height),restored={...m,...fit.pose};
  const distant=[{id:'a',east:0,north:16000,height:25},{id:'b',east:40,north:16200,height:30},{id:'c',east:-50,north:15800,height:22}];
  let max=0;
  for(const method of ['accurate','canvas-direct'])for(const atmosphere of ['standard','temperature-lapse']){
    const options={method,atmosphere,temperatureProfile:{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5}};
    const a=projection.create(m,before,width,height,options),b=projection.create(restored,fit.camera,width,height,options);
    for(const p of distant){const q=a.metric(p),r=b.metric(p);assert.equal(q.status,'visible');assert.equal(r.status,q.status);max=Math.max(max,normError(q.pixel,r.pixel));}
  }
  t.diagnostic(`max refracted round-trip error: ${max} px`);assert.ok(max<1e-6);
});
