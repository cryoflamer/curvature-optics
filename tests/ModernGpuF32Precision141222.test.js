'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const precision=require('../src/diagnostics/CurvatureGpuPrecisionAudit141222');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const base={branch:contract.BRANCH,geometry:'globe',radius:6371000,observerHeight:15};
function fake(request,status){
  return {backend:'gpu-experimental',branch:contract.BRANCH,
    results:request.targets.map((target,i)=>({target:target.slice(),status,
      angle:i/10000,residual:0,pathLength:request.targets[i][0],
      ground:{hitGround:false,travelled:request.targets[i][0],event:null}}))};
}
test('140.12.22: independent height ladder spans sub-micrometre surface and upper towers',()=>{
  const p=precision.createLadder(base,surfaces);
  assert.equal(p.targetsCount,48);
  assert.deepEqual(p.heightsMetres,[0,1e-6,.01,.1,1,5,20,50]);
  assert.deepEqual(p.distancesMetres,[60,350,1250,2100,3900,5400]);
  assert.equal(p.request.targets.length,p.coordinates.length);
  assert.ok(p.coordinates.every(c=>Number.isFinite(c.f32SurfaceHeightErrorMetres)));
  assert.ok(p.coordinates.some(c=>c.heightMetres===0));
  const metric=surfaces.createFromCurvature(1/6371000);
  p.request.targets.forEach((t,i)=>{
    assert.ok(Math.abs(metric.height2(...t)-p.coordinates[i].heightMetres)<1e-7);
  });
  assert.throws(()=>precision.createLadder({...base,radius:0},surfaces),/Invalid/);
});
test('140.12.22: vacuum/standard and tolerance/integration knobs vary independently',()=>{
  const p=precision.createLadder(base,surfaces),r=precision.stages(p);
  assert.deepEqual(Object.keys(r),['standard500','standardStrict','standardFine','vacuum500']);
  assert.deepEqual(Object.values(r).map(v=>[v.atmosphere,v.controls.step,v.controls.targetTolerance]),[
    ['standard',500,.005],['standard',500,.0001],['standard',50,.005],['vacuum',500,.005]]);
  Object.values(r).forEach(x=>{
    assert.doesNotThrow(()=>gpu.checked(x));
    assert.equal(x.targets,p.request.targets);
  });
  assert.equal(precision.stages(p).standard500.controls.targetTolerance,.005);
});
test('140.12.22: f32 coordinates and terminal contact are diagnostic only',()=>{
  const p=precision.createLadder(base,surfaces),r=precision.stages(p),
    results=Object.fromEntries(Object.entries(r).map(([k,req])=>[k,fake(req,'visible')]));
  const cpu={standard:fake(r.standard500,'visible'),vacuum:fake(r.vacuum500,'visible')};
  results.standard500.results[0].status='indeterminate';
  results.standard500.results[0].ground={hitGround:true,travelled:59.95,
    event:{kind:'ground',contact:'crossing',pathLength:59.95}};
  results.standard500.results[0].pathLength=60;
  results.standard500.results[8].status='indeterminate';
  results.standard500.results[8].ground={hitGround:true,travelled:349.1,
    event:{kind:'ground',contact:'crossing',pathLength:349.1}};
  results.standard500.results[8].pathLength=350;
  results.standardStrict.results[0].status='solver_failed';
  results.standardStrict.results[0].angle=null;
  results.standardStrict.results[0].residual=null;
  results.standardStrict.results[0].pathLength=null;
  results.standardStrict.results[0].ground=null;
  const out=precision.audit(p,results,cpu);
  assert.equal(out.variants.standard500.statusMismatches,2);
  assert.equal(out.variants.standard500.endpointContacts,1);
  assert.equal(out.variants.standard500.interiorContacts,1);
  assert.equal(out.variants.standard500.nearGroundMismatches,2);
  assert.equal(out.variants.standardStrict.gpuStatusCounts.solver_failed,1);
  assert.equal(out.comparisons.strictToleranceStatusMismatchDelta,-1);
  assert.equal(out.variants.standard500.upperHeightAngleComparisons,18);
  assert.equal(out.perTargetResults.length,192);
  assert.equal(out.perTargetResults[0].endpointContactWithin25cm,true);
  assert.equal(out.perTargetResults[8].endpointContactWithin25cm,false);
  assert.equal(out.productionAuthorized,false);
  assert.equal(out.terminalContactClassificationIsDiagnosticOnly,true);
  assert.throws(()=>precision.audit(p,{...results,standard500:{results:[]}},cpu),/length/);
  assert.throws(()=>precision.audit(p,results,{standard:fake(r.standard500,'visible'),vacuum:
    {results:cpu.vacuum.results.map((v,i)=>i? v:{...v,target:[100,200]})}}),/Unmatched/);
});
test('140.12.22: upper tower angle metric excludes ground without hiding solver failures',()=>{
  const p=precision.createLadder(base,surfaces),r=precision.stages(p),
    results=Object.fromEntries(Object.entries(r).map(([k,req])=>[k,fake(req,'visible')]));
  const cpu={standard:fake(r.standard500,'visible'),vacuum:fake(r.vacuum500,'visible')};
  results.standard500.results[5].angle+=Math.PI/(180*3600);
  const out=precision.audit(p,results,cpu);
  assert.ok(Math.abs(out.variants.standard500.upperHeightMeanAbsoluteAngleDeltaArcsec-1/18)<1e-8);
  assert.ok(Math.abs(out.variants.standard500.maxAbsoluteAngleDeltaArcsec-1)<1e-8);
  assert.equal(out.variants.vacuum500.statusMismatches,0);
});
test('140.12.22: browser audit uses GPU predictor first, CPU oracle last, no frame edits',()=>{
  const app=src('src/ui/modern/ModernApp.js'),html=src('CurvatureModern.html');
  assert.match(html,/CurvatureGpuPrecisionAudit141222\.js/);
  assert.match(html,/ModernApp\.js\?v=140\.12\.29/);
  assert.match(html,/ModernCompareModel\.js\?v=140\.12\.29/);
  assert.match(html,/id="ModernGpuPrecisionAuditRun"/);
  assert.match(app,/addEventListener\('click',runGpuPrecisionAudit141222\)/);
  assert.match(app,/curvature-compare-140\.12\.22-gpu-f32-precision\.json/);
  const body=app.slice(app.indexOf('async function runGpuPrecisionAudit141222(){'),
    app.indexOf('function bindCompareGpuProbe(){'));
  assert.match(body,/gpu\.createSession/);
  assert.match(body,/session\.solve\(runs\[key\]/);
  assert.match(body,/contract\.solveCpuBatch/);
  assert.ok(body.indexOf('contract.solveCpuBatch')>body.indexOf('session.solve(runs[key]'));
  assert.match(body,/report\.framePaintingChanged=false/);
  assert.match(body,/cpuAnswersNotInjectedIntoGPU=true/);
  assert.doesNotMatch(body,/\.Redraw\(/);
});
