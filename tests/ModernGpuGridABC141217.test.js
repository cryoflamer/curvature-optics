'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
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
  vm.runInContext(source('src/app/CurvatureModel.js'),c);
  const m=vm.runInContext('new CurveAppClass()',c);
  Object.assign(m,{Height:15,FocalLengthField:2000,Nick:0.0121,Pan:0.0464,
    Roll:0,showModel:1,showGrid:1,viewcenterHorizon:3,
    ObjType:[3],NObjects:[85],ObjDist:[1200],ObjDeltaDist:[280],
    ObjSidePos:[35],ObjSize:[64]});
  m.Update();return m;
}
const deps={composition,silhouette,surfaces,branch:'first-forward-x'};
function grid(layout,modelOverride){return compare.gpuFirstGrid(modelOverride||model(),4096,deps,{layout});}
function response(g,correction){
  return {results:g.request.targets.map((target,i)=>{
    const col=Math.floor(i/g.rows),row=i%g.rows;
    const d=g.distances[col],h=g.heightColumns?g.heightColumns[col][row]:g.heights[row];
    const geometric=Math.atan2(target[1]-g.request.observerHeight,target[0]);
    return {target:target.slice(),status:'visible',angle:geometric+correction(d,h)};
  })};
}
test('140.12.17: exactly 4096 scene-derived rays in each layout with correct dimensions and shared physics',()=>{
  const a=grid('near-ground'),b=grid('vertical-32'),c=grid('distance-focused');
  assert.deepEqual([a.columns,a.rows],[256,16]);
  assert.deepEqual([b.columns,b.rows],[128,32]);
  assert.deepEqual([c.columns,c.rows],[256,16]);
  for(const g of [a,b,c]){
    assert.equal(g.request.targets.length,4096);
    assert.equal(g.request.targets.length,g.columns*g.rows);
    assert.equal(g.cpuOracleDiscovery,false);
    assert.deepEqual(g.objectDistanceRange,a.objectDistanceRange);
    assert.equal(g.request.geometry,a.request.geometry);
    assert.equal(g.request.observerHeight,a.request.observerHeight);
    assert.ok(g.distances.every((d,i)=>i===0||d>g.distances[i-1]));
    assert.ok(g.heightColumns.every(heights=>heights.length===g.rows&&
      heights.every((h,i)=>i===0||h>heights[i-1])));
    const batches=compare.gpuFirstBatchRequests(g,1024);
    assert.equal(batches.length,4);
    assert.ok(batches.every(x=>x.targets.length===1024));
    batches.forEach(req=>{req.controls.step=500;assert.doesNotThrow(()=>gpu.checked(req));});
  }
  const uniform=grid('uniform');
  assert.deepEqual(a.distances,uniform.distances,
    'the 140.12.16 near-ground distance axis must remain unchanged');
  assert.deepEqual(a.heights,c.heights);
  assert.ok(b.distances.length<a.distances.length,
    'the vertical candidate must genuinely trade distance columns for rows');
});
test('140.12.17: near-distance concentrates columns under 6 km while covering 100 m to 99.9 km',()=>{
  const a=grid('near-ground'),c=grid('distance-focused');
  const countNear=x=>x.distances.filter(d=>d<=6000).length;
  assert.ok(countNear(c)>=countNear(a)+25,
    `expected genuine shift: ${countNear(a)} vs ${countNear(c)}`);
  assert.ok(countNear(c)/c.columns>=0.44);
  assert.equal(c.distances[0],a.distances[0]);
  assert.equal(c.distances.at(-1),a.distances.at(-1));
  assert.ok(c.distances.some(d=>Math.abs(d-6000)<1e-5),
    'near-distance must preserve a focus boundary');
  assert.equal(c.heightColumns.length,c.columns);
  assert.notDeepEqual(c.distances,a.distances);
  assert.deepEqual(c.objectDistanceRange,a.objectDistanceRange);
});
test('140.12.17: height/distance interpolation uses actual per-layout node coordinates',()=>{
  const constant=0.000024;
  for(const layout of ['near-ground','vertical-32','distance-focused']){
    const g=grid(layout);
    const field=compare.gpuFirstRayField(g,response(g,()=>constant),surfaces);
    const metric=surfaces.createFromCurvature(1/g.request.radius);
    for(const [d,h] of [[110,0.05],[1200,0.3],[3500,1],[5800,12],[20000,41]]){
      const target=metric.surfacePoint2(d,h);
      const direct=Math.atan2(target[1]-g.request.observerHeight,target[0]);
      assert.ok(Math.abs(field.sample(d,h).angle-direct-constant)<1e-12,
        `constant correction not conserved: ${layout}, d=${d}, h=${h}`);
    }
    assert.equal(field.stats().experimentalGpu.cpuFallbackRequests,0);
    assert.equal(field.stats().experimentalGpu.gpuSeedNodes,4096);
    assert.throws(()=>compare.gpuFirstRayField(g,
      {results:response(g,()=>constant).results.reverse()},surfaces),/target order mismatch/);
  }
});
test('140.12.17: near-distance layout improves a rapidly varying near-distance synthetic correction',()=>{
  const old=grid('near-ground'),focused=grid('distance-focused');
  const correction=(d,h)=>0.0001*Math.exp(-Math.pow((d-3350)/190,2));
  const oldField=compare.gpuFirstRayField(old,response(old,correction),surfaces);
  const focusedField=compare.gpuFirstRayField(focused,response(focused,correction),surfaces);
  const metric=surfaces.createFromCurvature(1/old.request.radius);
  let oldError=0,newError=0;
  for(let d=3000;d<=3700;d+=10){
    const h=0.5,target=metric.surfacePoint2(d,h);
    const truth=Math.atan2(target[1]-15,target[0])+correction(d,h);
    oldError+=Math.abs(oldField.sample(d,h).angle-truth);
    newError+=Math.abs(focusedField.sample(d,h).angle-truth);
  }
  assert.ok(newError<oldError,`expected a synthetic near-distance interpolation gain ${oldError} -> ${newError}`);
});
test('140.12.17: lower-RIGHT ROI measures actual right-hand changes, not old left-hand changes',()=>{
  function canvas(data,w=20,h=20){return {width:w,height:h,getContext:()=>({
    getImageData:(x,y,width,height)=>{
      const pixels=[];
      for(let j=y;j<y+height;j++)for(let i=x;i<x+width;i++)
        pixels.push(...data.slice((j*w+i)*4,(j*w+i+1)*4));
      return {data:pixels};
    }})};}
  const w=20,h=20,plain=Array(w*h*4).fill(0),changed=plain.slice();
  for(let y=12;y<20;y++)for(let x=13;x<20;x++)changed[(y*w+x)*4]=40;
  const cpu=canvas(plain),gpu=canvas(changed);
  const right=compare.compareFramePixels(cpu,gpu,{x:0.55,y:0.55,width:0.45,height:0.45});
  const left=compare.compareFramePixels(cpu,gpu,{x:0,y:0.55,width:0.55,height:0.45});
  assert.equal(right.status,'measured');
  assert.equal(right.significantPixels,56);
  assert.equal(left.significantPixels,0);
  assert.equal(right.region.x,11);
  assert.equal(right.region.y,11);
});
