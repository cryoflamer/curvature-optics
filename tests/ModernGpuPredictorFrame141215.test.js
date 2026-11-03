'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const src=p=>fs.readFileSync(path.join(root,p),'utf8');
const compare=require('../src/ui/modern/ModernCompareModel');
const composition=require('../src/scene/CurvatureIndependentComposition');
const silhouette=require('../src/optics/OpticalTowerSilhouette');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');

function model(){
  const vec={Norm:a=>a.map(x=>x/Math.hypot(...a)),
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    Scale:(a,t)=>a.map(x=>x*t),Add:(a,b)=>a.map((x,i)=>x+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
  const c=vm.createContext({JsgVect3:vec});
  vm.runInContext(src('src/app/CurvatureModel.js'),c);
  const m=vm.runInContext('new CurveAppClass()',c);
  Object.assign(m,{Height:15,FocalLengthField:2000,Nick:0.0121,Pan:0.0464,
    Roll:0,showModel:1,showGrid:1,viewcenterHorizon:3,
    ObjType:[3,3],NObjects:[3,2],ObjDist:[1200,3000],ObjDeltaDist:[380,500],
    ObjSidePos:[35,25.4],ObjSize:[23,64]});
  m.Update();return m;
}
function gridFor(n){return compare.gpuFirstGrid(model(),n,
  {composition,silhouette,surfaces,branch:'first-forward-x'});}

test('140.12.15: dense authored GPU-first grids remain monotone and CPU-independent',()=>{
  for(const count of [1024,2048,4096,8192]){
    const grid=gridFor(count);
    assert.equal(grid.cpuOracleDiscovery,false);
    assert.equal(grid.request.targets.length,count);
    assert.equal(grid.columns*grid.rows,count);
    assert.equal(grid.rows,count>1024?16:8);
    assert.ok(grid.distances.every((x,i,a)=>i===0||x>a[i-1]));
    assert.ok(grid.heights.every((x,i,a)=>i===0||x>a[i-1]));
    const batches=compare.gpuFirstBatchRequests(grid,1024);
    assert.equal(batches.length,count/1024);
    batches.forEach((b,i)=>{
      assert.equal(b.targets.length,1024);
      assert.deepEqual(b.targets,grid.request.targets.slice(i*1024,(i+1)*1024));
      b.controls.step=500;
      assert.doesNotThrow(()=>gpu.checked(b));
    });
    assert.equal(grid.request.controls.step,50,'batch settings must not mutate grid');
  }
});

test('140.12.15: ordered GPU batches reconstruct a real interpolated ray field with zero CPU fallback',()=>{
  const grid=gridFor(4096),batches=compare.gpuFirstBatchRequests(grid,1024);
  const responses=batches.flatMap((batch)=>batch.targets.map(target=>({
    target:target.slice(),status:'visible',angle:Math.atan2(target[1]-15,target[0]),residual:0})));
  assert.equal(responses.length,4096);
  const field=compare.gpuFirstRayField(grid,{results:responses},surfaces);
  assert.equal(field.fullCoverageGrid,true);
  for(const sample of [[1200,0],[3000,22],[50000,4]]){
    const result=field.sample(...sample);
    assert.equal(result.status,'visible');
    assert.ok(Number.isFinite(result.angle));
  }
  assert.equal(field.stats().experimentalGpu.cpuFallbackRequests,0);
  assert.equal(field.stats().experimentalGpu.gpuSeedNodes,4096);
  assert.throws(()=>compare.gpuFirstRayField(grid,{results:responses.slice().reverse()},surfaces),
    /target order mismatch/);
});

test('140.12.15: batch capacity and grid structure are strictly bounded',()=>{
  const grid=gridFor(2048);
  for(const bad of [0,1025,1.5,-1])
    assert.throws(()=>compare.gpuFirstBatchRequests(grid,bad),/batch capacity/);
  assert.throws(()=>compare.gpuFirstGrid(model(),32768,
    {composition,silhouette,surfaces,branch:'first-forward-x'}),/Invalid GPU-first/);
  assert.throws(()=>compare.gpuFirstBatchRequests({request:{targets:[[]]},columns:2,rows:2},1024),
    /Invalid GPU-first grid/);
});
