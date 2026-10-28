'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const camera=require('../src/app/CurvaturePhysicalCamera');
const curve=require('../src/app/CurvaturePhysicalCurvature');
const surface=require('../src/geometry/CurvatureSurfaceGeometry');
const preview=require('../src/renderers/CurvaturePerspectivePreview');
const root=path.resolve(__dirname,'..');
const nearly=(a,b,tol=1e-12)=>assert.ok(Math.abs(a-b)<=tol,
  `expected ${a} ≈ ${b} (within ${tol})`);
function model(radius=6371000,flat=false,aim=3){return {rEarth:radius,rFEarth:10007543,
  Height:15,camViewAngle:1.05408*Math.PI/180,deviceRatio:1.5,
  Pan:0.0464,Nick:0.0121,Roll:0,showModel:flat?2:1,viewcenterHorizon:aim};}
function pixel(m,point){
  const c=camera.create(m),scene={primitives:[{type:'line',commandIndex:0,
    points:[point,point.map((v,i)=>v+(i===2?.0001:0))]}]};
  const r=preview.project(scene,{...c,screenSize:1,objectZExtend:0,zoom:1,near:1e-6},900,600);
  assert.equal(r.segments.length,1);
  return r.segments[0].points[0];
}

test('127: local angular projection remains exactly invariant as curvature changes at fixed Eye-Lvl',()=>{
 const samplePoints=[[0,1000,0],[2,950,1],[-3,1000,-2],[0.4,100,0.2]];
 const baseline=model(),reference=camera.create(baseline);
 for(const R of [6371000,6370000000,1e12,1e16])for(const flat of [false,true]){
  const m=model(R,flat),c=camera.create(m);
  assert.deepEqual(c.pos,reference.pos);assert.deepEqual(c.center,reference.center);
  assert.deepEqual(c.up,reference.up);assert.equal(c.sceneSize,reference.sceneSize);
  for(const p of samplePoints){const actual=pixel(m,p),expected=pixel(baseline,p);
   nearly(actual[0],expected[0],1e-12);nearly(actual[1],expected[1],1e-12);}
 }
});

test('127: physically identical nearby target changes only by its real surface curvature',()=>{
 const eye=15,d=500,h=15.5,origin=model(6371000),point=surface.createFromRadius(origin.rEarth).surfacePoint3(0,d,h);
 const flat=surface.createFromCurvature(0).surfacePoint3(0,d,h);
 point[2]-=eye;flat[2]-=eye;
 const globePixel=pixel(origin,point),flatPixel=pixel(model(1e16,true),flat);
 const difference=Math.hypot(globePixel[0]-flatPixel[0],globePixel[1]-flatPixel[1]);
 assert.ok(difference>0&&difference<4,`500 m tower shift should reflect curvature, not camera (${difference} pixels)`);
});

test('127: FOV, pan/nick/roll, and aspect ratio are radius-independent',()=>{
 for(const aspect of [1.5,2/3,16/9,9/16])for(const pan of [-12,0,33]){
  const m=model();m.Pan=pan;m.Nick=-3;m.Roll=22;m.deviceRatio=aspect;
  const baseline=camera.create(m);
  const changed=camera.create({...m,rEarth:1e16,showModel:2});
  assert.deepEqual(changed,baseline);
  assert.equal(baseline.referenceDistance,1000);
  nearly(Math.hypot(...baseline.up),1,1e-12);
  nearly(Math.hypot(...baseline.center),1000,1e-10);
 }
});

test('127: Horizon aim follows a numerically stable geometric dip; flat has no globe horizon',()=>{
 for(const R of [6371000,6000370000,1e16]){
  const g=camera.create(model(R,false,0));
  nearly(g.aimDip,surface.createFromRadius(R).geometricHorizon(15).dipAngle,1e-15);
  assert.ok(g.aimDip>0);
 }
 assert.equal(camera.create(model(1e16,true,0)).aimDip,0);
 assert.equal(camera.create(model(6371000,false,3)).aimDip,0);
 const fe=camera.create(model(6371000,false,1)).aimDip;
 nearly(fe,Math.atan(15/10007543));
 const between=camera.create(model(6371000,false,2)).aimDip;
 nearly(between,(fe+camera.create(model(6371000,false,0)).aimDip)/2);
});

test('127: extreme radii cannot invalidate the physical camera or flip its up vector',()=>{
 for(const R of [1e5,6371000,1e12,1e16])for(const eye of [0.001,15,1e9]){
  const m=model(R);m.Height=eye;
  for(const aim of [0,1,2,3]){
   m.viewcenterHorizon=aim;
   const c=camera.create(m);
   assert.ok([...c.center,...c.up,c.sceneSize].every(Number.isFinite));
   assert.ok(c.sceneSize>0);
  }
 }
 assert.throws(()=>camera.create({...model(),camViewAngle:0}),/field of view/);
});

test('127: logarithmic globe-radius slider is monotonic with an exact flat endpoint',()=>{
 assert.equal(curve.stepToGeometry(0).radius,1e5);
 assert.equal(curve.stepToGeometry(999).radius,1e16);
 assert.deepEqual(curve.stepToGeometry(1000),{showModel:2,curvature:0,radius:Infinity});
 let last=0;
 for(let step=0;step<1000;step++){
  const {radius,curvature,showModel}=curve.stepToGeometry(step);
  assert.ok(radius>last);last=radius;
  assert.equal(showModel,1);nearly(curvature*radius,1,1e-15);
 }
 assert.equal(curve.radiusToStep(6371000),curve.modelStep(model()));
 assert.throws(()=>curve.stepToGeometry(-1),/step/);
 assert.throws(()=>curve.stepToGeometry(1001),/step/);
});

test('127: slider updates existing model state; existing save formats need no new field',()=>{
 const m=model();
 curve.applyStep(m,500);
 assert.equal(m.showModel,1);assert.ok(m.rEarth>6371000);
 const remembered=m.rEarth;
 curve.applyStep(m,1000);
 assert.equal(m.showModel,2);assert.equal(m.rEarth,remembered);
 assert.equal(curve.modelStep(m),1000);
 assert.match(curve.label(m),/exact/);
 curve.resetEarth(m);
 assert.equal(m.showModel,1);assert.equal(m.rEarth,6371000);
 assert.equal(curve.modelStep({...m,showModel:3}),null);
});

test('127: existing Legacy/Independent camera path and optical caching remain unchanged',()=>{
 const main=fs.readFileSync(path.join(root,'src/app/CurvatureMainCanvasRenderer.js'),'utf8');
 assert.match(main,/configureCamera\(g,m\)/);
 assert.match(main,/configureCamera\(g,m,true\)/);
 assert.match(main,/physical\?physicalCamera\.create\(m\)/);
 const optical=fs.readFileSync(path.join(root,'src/optics/CurvaturePhysicalSceneOptics.js'),'utf8');
 assert.doesNotMatch(optical,/CurvaturePhysicalCamera/);
});

test('127: browser controls are physical-only and synchronize with saved or numeric model edits',()=>{
 const html=fs.readFileSync(path.join(root,'CurvatureApp.html'),'utf8');
 const runtime=fs.readFileSync(path.join(root,'src/app/CurvatureAppRuntime.js'),'utf8');
 assert.ok(html.indexOf('CurvaturePhysicalCamera.js')<html.indexOf('CurvatureMainCanvasRenderer.js'));
 assert.ok(html.indexOf('CurvaturePhysicalCurvature.js')<html.indexOf('CurvatureAppRuntime.js'));
 for(const id of ['PhysicalCanvasCurvature','PhysicalCanvasCurvatureLabel','PhysicalCanvasEarthRadius'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(runtime,/SyncPhysicalCurvatureControl127\(\)/);
 assert.match(runtime,/physicalCanvasFrameScheduler\.cancel\(\)/);
 assert.match(runtime,/setTimeout\(commit,250\)/);
 assert.match(runtime,/api\.applyStep\(CurveApp,Number\(slider\.value\)\)/);
});
