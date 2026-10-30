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
  const context=vm.createContext({JsgVect3:vec});
  vm.runInContext(source('src/app/CurvatureModel.js'),context);
  const m=vm.runInContext('new CurveAppClass()',context);
  Object.assign(m,{Height:15,FocalLengthField:2000,Nick:0.0121,Pan:0.0464,
    Roll:0,showModel:1,showGrid:1,viewcenterHorizon:3,
    ObjType:[3],NObjects:[85],ObjDist:[1200],ObjDeltaDist:[280],
    ObjSidePos:[35],ObjSize:[64]});
  m.Update();return m;
}
const deps={composition,silhouette,surfaces,branch:'first-forward-x'};
function grid(count=4096){return compare.gpuFirstGrid(model(),count,deps,{layout:'distance-focused'});}
function response(g,correction){
  return {results:g.request.targets.map((target,i)=>{
    const d=g.distances[Math.floor(i/g.rows)],h=g.heightColumns[Math.floor(i/g.rows)][i%g.rows];
    return {target:target.slice(),status:'visible',angle:Math.atan2(target[1]-15,target[0])+correction(d,h)};
  })};
}
function canvas(pixels,w=16,h=12){return {width:w,height:h,getContext(){return {
  getImageData(x,y,width,height){let data=[];
    for(let j=y;j<y+height;j++)for(let i=x;i<x+width;i++)
      data.push(...pixels.slice((j*w+i)*4,(j*w+i+1)*4));
    return {data};
  }
};}};}
test('140.12.18: 4608 near-distance control uses same source geometry, more columns and five GPU batches',()=>{
  const a=grid(),b=grid(4608);
  assert.equal(a.request.targets.length,4096);
  assert.equal(b.request.targets.length,4608);
  assert.deepEqual([a.columns,a.rows],[256,16]);
  assert.deepEqual([b.columns,b.rows],[288,16]);
  assert.deepEqual(b.objectDistanceRange,a.objectDistanceRange);
  const batches=compare.gpuFirstBatchRequests(b,1024);
  assert.deepEqual(batches.map(x=>x.targets.length),[1024,1024,1024,1024,512]);
  batches.forEach(req=>{req.controls.step=500;assert.doesNotThrow(()=>gpu.checked(req));});
});
test('140.12.18: candidate selection is deterministic, risk-weighted, bounded and based on GPU renderer queries',()=>{
  const g=grid(),data=response(g,(d,h)=>0.00006*Math.sin(d/100)*Math.cos(h));
  const field=compare.gpuFirstRayField(g,data,surfaces,{collectCandidates:true});
  for(let d=400;d<=20000;d+=13){
    field.sample(d,0.4+(d%47)/10);
    field.exact(d,0.1+(d%23)/10);
  }
  const selected=field.refinementCandidates(512);
  assert.equal(selected.length,512);
  assert.deepEqual(field.refinementCandidates(512),selected);
  assert.equal(new Set(selected.map(x=>x.d+','+x.h)).size,selected.length);
  assert.ok(selected.every(x=>x.score>0&&x.causes.length));
  assert.ok(selected.some(x=>x.causes.includes('angular-gradient')));
  assert.equal(field.stats().experimentalGpu.cpuFallbackRequests,0);
  assert.throws(()=>field.refinementCandidates(2048),/budget/);
});
test('140.12.18: sparse GPU replacement changes ONLY the exact requested point, not nearby interpolation',()=>{
  const g=grid(),data=response(g,(d,h)=>0.000003*Math.sin(d/1000));
  const d=3350.125,h=1.75,metric=surfaces.createFromCurvature(1/g.request.radius);
  const target=metric.surfacePoint2(d,h),original=compare.gpuFirstRayField(g,data,surfaces);
  const before=original.sample(d,h),neighbor=original.sample(d+0.01,h);
  const sample={d,h,result:{target:target.slice(),status:'blocked',angle:before.angle+0.00008}};
  const field=compare.gpuFirstRayField(g,data,surfaces,{refinements:[sample]});
  assert.equal(field.exact(d,h).status,'blocked');
  assert.equal(field.sample(d,h).angle,before.angle+0.00008);
  assert.equal(field.sample(d,h).method,'gpu-first-sparse-direct');
  assert.deepEqual(field.sample(d+0.01,h),neighbor);
  assert.equal(field.stats().experimentalGpu.refinementHits,1);
  assert.equal(field.stats().experimentalGpu.refinementSamples,1);
  assert.equal(field.stats().experimentalGpu.cpuFallbackRequests,0);
  assert.throws(()=>compare.gpuFirstRayField(g,data,surfaces,{refinements:[
    {d,h,result:{target:[1,2],status:'visible',angle:0}}]}),/target\/order mismatch/);
  assert.throws(()=>compare.gpuFirstRayField(g,data,surfaces,{refinements:[sample,sample]}),
    /Duplicate GPU refinement/);
});
test('140.12.18: a failed GPU sparse sample preserves the base grid answer',()=>{
  const g=grid(),data=response(g,()=>0.0001),d=1245.33,h=0.1;
  const metric=surfaces.createFromCurvature(1/g.request.radius),target=metric.surfacePoint2(d,h);
  const a=compare.gpuFirstRayField(g,data,surfaces).sample(d,h);
  const field=compare.gpuFirstRayField(g,data,surfaces,{refinements:[
    {d,h,result:{target,status:'solver_failed',angle:null}}]});
  assert.equal(field.sample(d,h).angle,a.angle);
  assert.equal(field.stats().experimentalGpu.refinementFailures,1);
  assert.equal(field.stats().experimentalGpu.refinementHits,0);
});
test('140.12.18: spatial pixel tiles reconstruct global significant count, with lower-right localized',()=>{
  const w=16,h=12,black=Array(w*h*4).fill(0),b=black.slice();
  for(let y=8;y<12;y++)for(let x=12;x<16;x++)b[(y*w+x)*4]=40;
  const a=canvas(black),changed=canvas(b);
  const tiles=compare.frameDifferenceTiles(a,changed,4,3);
  assert.equal(tiles.status,'measured');
  assert.equal(tiles.significantPixels,16);
  assert.equal(tiles.tileCounts.length,12);
  assert.deepEqual(tiles.tileCounts.slice(0,8),Array(8).fill(0));
  assert.equal(tiles.tileCounts[11],16);
  assert.equal(tiles.tileCounts.reduce((s,x)=>s+x,0),
    compare.compareFramePixels(a,changed).significantPixels);
  assert.equal(compare.frameDifferenceTiles(a,canvas(b,8,24),4,3).status,'unavailable');
  assert.throws(()=>compare.frameDifferenceTiles(a,changed,0,3),/dimensions/);
});
test('140.12.18: Compare UI separates source-selected adaptive GPU from CPU-only comparison',()=>{
  const app=source('src/ui/modern/ModernApp.js'),html=source('CurvatureModern.html');
  assert.match(html,/id="ModernGpuAdaptiveRun"/);
  assert.match(html,/id="ModernGpuAdaptiveHeatmap"/);
  assert.match(html,/id="ModernGpuDenseHeatmap"/);
  assert.match(html,/src\/ui\/modern\/ModernCompareModel.js\?v=140\.12\.24/);
  assert.match(app,/addEventListener\('click',runCompareGpuAdaptive141218\)/);
  const start=app.indexOf('async function runCompareGpuAdaptive141218()');
  const end=app.indexOf('  function bindCompareGpuProbe(){',start);
  const block=app.slice(start,end);
  assert.match(block,/baseCount=4096,extraBudget=512/);
  assert.match(block,/collectCandidates:true/);
  assert.match(block,/baseField\.refinementCandidates\(extraBudget\)/);
  assert.match(block,/gpu\.checked\(request\)/);
  assert.match(block,/state\.probeForceColdA=true/);
  assert.ok(block.indexOf('state.probeForceColdA=true')>block.indexOf("paint(denseField,'dense4608')"));
  assert.match(block,/includesDiscoveryFrameInAdaptiveTime:true/);
  assert.match(block,/cpuOracleDiscovery:false,cpuShootingFallback:false/);
  assert.match(app,/curvature-compare-140\.12\.18-adaptive-vs-dense\.json/);
  assert.match(block,/pixelHeatmap:compareAdapter\.frameDifferenceTiles/);
});
