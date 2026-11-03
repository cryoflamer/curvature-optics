'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const compare=require('../src/ui/modern/ModernCompareModel');
const composition=require('../src/scene/CurvatureIndependentComposition');
const silhouette=require('../src/optics/OpticalTowerSilhouette');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
function model(){
  const vec={Norm:a=>a.map(x=>x/Math.hypot(...a)),
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],
    Scale:(a,t)=>a.map(x=>x*t),Add:(a,b)=>a.map((x,i)=>x+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
  const c=vm.createContext({JsgVect3:vec});
  vm.runInContext(src('src/app/CurvatureModel.js'),c);
  const m=vm.runInContext('new CurveAppClass()',c);
  Object.assign(m,{Height:15,FocalLengthField:2000,Nick:0.0121,Pan:0.0464,
    Roll:0,showModel:1,showGrid:1,viewcenterHorizon:3,
    ObjType:[3],NObjects:[85],ObjDist:[1200],ObjDeltaDist:[280],
    ObjSidePos:[35],ObjSize:[64]});
  m.Update();return m;
}
const deps={composition,silhouette,surfaces,branch:'first-forward-x'};
function grid(count,layout){return compare.gpuFirstGrid(model(),count,deps,{layout});}
function responses(g,correction){
  const metric=surfaces.createFromCurvature(1/g.request.radius);
  return g.request.targets.map((target,i)=>{
    const col=Math.floor(i/g.rows),row=i%g.rows;
    const h=g.heightColumns?g.heightColumns[col][row]:g.heights[row];
    const d=g.distances[col];
    const geometry=metric.surfacePoint2(d,h);
    assert.ok(Math.abs(geometry[0]-target[0])<1e-7);
    return {target:target.slice(),status:'visible',
      angle:Math.atan2(target[1]-g.request.observerHeight,target[0])+correction(h)};
  });
}
test('140.12.16: near-ground layout preserves budget, scene, monotonicity and GPU batching',()=>{
  for(const count of [1024,2048,4096,8192]){
    const uniform=grid(count,'uniform'),local=grid(count,'near-ground');
    assert.equal(uniform.request.targets.length,local.request.targets.length);
    assert.deepEqual(local.distances,uniform.distances);
    assert.deepEqual(local.heights,uniform.heights);
    assert.equal(local.layout,'near-ground');
    assert.equal(local.cpuOracleDiscovery,false);
    assert.equal(local.heightColumns.length,local.columns);
    assert.ok(local.heightColumns.every(h=>h.length===local.rows&&
      h.every((v,i)=>i===0||v>h[i-1])));
    assert.ok(local.heightColumns[0][1]<uniform.heights[1]*0.5,
      'ground-focused near tower column must resolve much thinner height intervals');
    assert.deepEqual(local.heightColumns[local.columns-1],uniform.heights,
      'far columns must preserve unchanged baseline height levels');
    assert.notDeepEqual(local.request.targets.slice(0,local.rows),
      uniform.request.targets.slice(0,uniform.rows));
    const batches=compare.gpuFirstBatchRequests(local,1024);
    assert.equal(batches.length,count/1024);
    batches.forEach(batch=>{batch.controls.step=500;assert.doesNotThrow(()=>gpu.checked(batch));});
  }
  assert.throws(()=>grid(4096,'fancy'),/height layout/);
});
test('140.12.16: column-dependent interpolation uses the true nonuniform node altitudes',()=>{
  const reference=grid(4096,'uniform'),local=grid(4096,'near-ground');
  const correction=h=>0.0003*Math.exp(-h/0.3);
  const refField=compare.gpuFirstRayField(reference,{results:responses(reference,correction)},surfaces);
  const localField=compare.gpuFirstRayField(local,{results:responses(local,correction)},surfaces);
  const d=local.distances[0],h=0.2;
  const metric=surfaces.createFromCurvature(1/local.request.radius),xy=metric.surfacePoint2(d,h);
  const analytic=Math.atan2(xy[1]-15,xy[0])+correction(h);
  const oldError=Math.abs(refField.sample(d,h).angle-analytic);
  const localError=Math.abs(localField.sample(d,h).angle-analytic);
  assert.ok(localError<oldError/2,`near-ground error ${localError} vs baseline ${oldError}`);
  assert.equal(localField.stats().experimentalGpu.cpuFallbackRequests,0);
  assert.equal(localField.stats().experimentalGpu.gpuSeedNodes,4096);
  assert.throws(()=>compare.gpuFirstRayField(local,
    {results:responses(local,correction).reverse()},surfaces),/target order mismatch/);
});
test('140.12.16: local-grid interpolation preserves constant geometric-angle correction',()=>{
  const g=grid(1024,'near-ground'),constant=0.000017;
  const field=compare.gpuFirstRayField(g,{results:responses(g,()=>constant)},surfaces);
  const metric=surfaces.createFromCurvature(1/g.request.radius);
  for(const [d,h] of [[g.distances[0],0.1],[2200,2],[5300,10],[20000,40],[95000,35]]){
    const p=metric.surfacePoint2(d,h),direct=Math.atan2(p[1]-15,p[0]);
    assert.ok(Math.abs(field.sample(d,h).angle-direct-constant)<1e-12,`${d},${h}`);
  }
});
test('140.12.16: lower-left ROI comparison differs from whole frame and validates bounds',()=>{
  function canvas(data,width,height){return {width,height,getContext:()=>({
    getImageData:(x,y,w,h)=>{
      const pixels=[];
      for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)
        pixels.push(...data.slice((j*width+i)*4,(j*width+i+1)*4));
      return {data:pixels};
    }})};}
  const left=Array(8*8*4).fill(0),right=left.slice();
  for(let y=5;y<8;y++)for(let x=0;x<4;x++)right[(y*8+x)*4]=20;
  const a=canvas(left,8,8),b=canvas(right,8,8);
  assert.equal(compare.compareFramePixels(a,b).significantPixels,12);
  const roi=compare.compareFramePixels(a,b,{x:0,y:0.5,width:0.5,height:0.5});
  assert.equal(roi.significantPixels,12);
  assert.equal(roi.totalPixels,16);
  assert.equal(compare.compareFramePixels(a,b,{x:0.5,y:0,width:0.5,height:1}).significantPixels,0);
  assert.match(compare.compareFramePixels(a,b,{x:0.8,y:0,width:0.5,height:0.5}).reason,
    /normalized frame comparison/);
});
