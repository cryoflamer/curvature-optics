'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const project=require('../src/optics/OpticalTargetProjection');
const compose=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const silhouette=require('../src/optics/OpticalTowerSilhouette');
const R=6371000;
function globeTarget(d,h){const theta=d/R;return [(R+h)*Math.sin(theta),(R+h)*Math.cos(theta)-R];}
function model(count=85){return {
  rEarth:R,geometryRadius:R,Height:15,showModel:1,ObjType:[3,3],NObjects:[count,2],
  ObjDist:[50,25550],ObjDeltaDist:[297.55,373],ObjSidePos:[32,22.4],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],ObjSizeType:[0,0],
  rDisk:1000,zDisk:999,hDip:1,hDisk:R/2,aDip:.065,aDelta:.025,
  showGrid:1,rFEarth:10007543,PanRad:0,sceneWidth:5000,
  GlobeGridCol:'green',GlobeFGridCol:'yellow',TangentCol:'red',FEGridCol:'gray',FEEqCol:'blue',
  showTangent:true,showData:false,camPos:[0,0,0],camViewCenter:[0,1,0],
  camUp:[0,0,1],camSceneSize:1
};}
test('109: RK4 shooting with safeguarded interpolation matches fine-step standard Globe oracle',()=>{
  for(const d of [1000,10000,20000,30000,40000])for(const h of [0,15,35,70]){
    const request={geometry:'globe',radius:R,observerHeight:15,
      target:globeTarget(d,h),atmosphere:'standard'};
    const fine=project.solve({...request,step:200});
    const fast=project.solve({...request,step:2000});
    assert.equal(fast.status,fine.status,`status ${d}m ${h}m`);
    assert.ok(Number.isFinite(fast.angle));
    assert.ok(Math.abs(fast.angle-fine.angle)<2e-9,
      `angle ${d}m ${h}m: ${fast.angle} versus ${fine.angle}`);
    assert.ok(fast.evaluations<=fine.evaluations+3,'faster shoot must not destabilize convergence');
  }
});
test('109: engineered Flat profiles retain accurate angular positions and horizon statuses at long RK4 steps',()=>{
  for(const kind of ['inverse-spherical','exponential-occlusion'])
    for(const d of [5000,15000,25000,35000])for(const h of [0,15,25,60]){
      const req={geometry:'flat',radius:R,observerHeight:15,target:[d,h],
        atmosphere:kind,profileOptions:{occlusionRadius:R}};
      const fine=project.solve({...req,step:200});
      const fast=project.solve({...req,step:2000});
      assert.equal(fast.status,fine.status,`${kind} ${d}m ${h}m`);
      assert.ok(Math.abs(fast.angle-fine.angle)<2e-9);
    }
});
test('109: standard n(h) tends continuously to vacuum for zero refractivity',()=>{
  for(const geometry of ['flat','globe'])for(const d of [1500,12000,25000]){
    const target=geometry==='flat'?[d,50]:globeTarget(d,50);
    const request={geometry,radius:R,observerHeight:15,target,step:1000};
    const vacuum=project.solve({...request,atmosphere:'vacuum'});
    const zero=project.solve({...request,atmosphere:'standard',profileOptions:{refractivity:0}});
    assert.equal(zero.status,vacuum.status);
    assert.ok(Math.abs(zero.angle-vacuum.angle)<2e-10);
  }
});
test('109: full 85+2 tower Standard scene is not silently truncated at 3500ms',()=>{
  const m=model(),scene=compose.composeOpticalMain(m,true);
  const transformed=optics.create().transform(scene,m,{atmosphere:'standard'});
  assert.equal(transformed.stats.budgetExceeded,false);
  assert.ok(transformed.stats.visibleSegments>2000);
  assert.ok(transformed.stats.perGroup.some(r=>r.name==='objects-0'&&r.visibleSegments>1000));
  assert.ok(transformed.stats.perGroup.some(r=>r.name==='objects-1'&&r.visibleSegments>0));
  assert.equal(transformed.stats.sampleStatuses.solver_failed||0,0);
  assert.equal(transformed.stats.unresolvedReasons['sample-budget']||0,0);
  assert.equal(transformed.stats.unresolvedReasons['optical-solver']||0,0);
  assert.equal(transformed.stats.unresolved,
    Object.values(transformed.stats.unresolvedReasons).reduce((a,b)=>a+b,0));
  assert.ok(transformed.stats.fieldStats.solves>1000);
  assert.equal(optics.create().transform(scene,m,{atmosphere:'vacuum'}).stats.budgetExceeded,false);
});
test('109: explicit diagnostic time limits still stop work and partial results are never cached',()=>{
  const m=model(1),scene=compose.composeOpticalMain(m,true),session=optics.create();
  const settings={maxBuildMs:0,step:500,maximumDepth:1};
  const first=session.transform(scene,m,{atmosphere:'standard',settings});
  assert.equal(first.stats.budgetExceeded,true);
  assert.ok(first.stats.unresolved>0);
  const again=session.transform(scene,m,{atmosphere:'standard',settings});
  assert.equal(again.reused,false);
  const normal=session.transform(scene,m,{atmosphere:'standard'});
  assert.equal(normal.stats.budgetExceeded,false);
  assert.ok(normal.stats.visibleSegments>0);
});
test('109: geometric visibility boundary is counted separately from numerical failures',()=>{
  const line={type:'line',points:[[0,5000,2],[0,5000,12]]};
  const field={sample(_d,h){return {status:h>=7?'visible':'blocked',angle:0};}};
  const result=silhouette.projectPrimitives({primitives:[line],field,geometry:'flat',
    radius:R,observerHeight:0,maximumDepth:12,boundaryTolerance:0.01});
  assert.ok(result.segments.length>0);
  assert.equal(result.stats.sampleStatuses.solver_failed||0,0);
  assert.ok((result.stats.unresolvedReasons['visibility-boundary']||0)>0);
  assert.equal(result.unresolved.length,result.stats.unresolvedLeaves);
});
test('109: main UI separates mode, atmosphere, help and runtime diagnostics',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../CurvatureApp.html'),'utf8');
  const runtime=fs.readFileSync(path.resolve(__dirname,'../src/app/CurvatureAppRuntime.js'),'utf8');
  assert.match(html,/id="PhysicalCanvasControls"/);
  assert.match(html,/id="PhysicalCanvasOcclusionWrap"/);
  assert.match(html,/id="MainCanvasRendererStatus"/);
  assert.match(runtime,/RefreshPhysicalCanvasControls/);
  assert.match(runtime,/exact ray solves/);
  assert.match(runtime,/solver, /);
});
