'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const compare=require('../src/ui/modern/ModernCompareModel');
function field(){
  const calls=[];
  const sample=(d,h)=>{calls.push([d,h]);return {status:d<2000?'visible':'blocked',angle:d/100000+h/1e6};};
  return {fullCoverageGrid:true,request:{geometry:'globe',radius:6371000,observerHeight:15},
    sample,exact:sample,stats:()=>({solves:0,experimentalGpu:{kind:'gpu-first-grid',cpuFallbackRequests:0}}),calls};
}
function result(status,angle,d=500,h=2){
  return {target:[d,h],status,angle,ground:status==='blocked'?{hitGround:true,event:{contact:'crossing'}}:
    {hitGround:false,event:null},reason:null};
}
test('140.12.20: renderer-query capture returns unmodified GPU values and deduplicates sample/exact paths',()=>{
  const original=field(),audit=compare.captureGpuRendererQueries(original);
  const a=audit.sample(700,2),b=audit.exact(700,2);
  audit.sample(700,2);audit.sample(700,0);audit.sample(6001,3);audit.sample(500,21);
  assert.deepEqual(a,b);
  assert.equal(original.calls.length,6);
  assert.deepEqual(audit.audit(),{rendererCalls:6,qualifyingCalls:4,
    uniqueQualifiedTargets:2,maximumDistanceMetres:6000,maximumHeightMetres:20});
  assert.equal(audit.request,original.request);
  assert.equal(audit.stats().experimentalGpu.cpuFallbackRequests,0);
  const selected=audit.select(8);
  assert.equal(selected.length,2);
  const low=selected.find(x=>x.h===2);
  assert.equal(low.sampleCalls,2);
  assert.equal(low.exactCalls,1);
  assert.equal(selected.find(x=>x.h===0).kind,'ground-height');
  assert.throws(()=>audit.select(1025),/budget/);
  assert.throws(()=>compare.captureGpuRendererQueries(original,{maximumHeight:-1}),/bounds/);
});
test('140.12.20: low-height targets are stratified across all distance bins, with ground requests capped',()=>{
  const audit=compare.captureGpuRendererQueries(field());
  for(let i=0;i<2000;i++)audit.sample(100+i*2.9,1+(i%15));
  for(let i=0;i<100;i++)audit.exact(100+i*58,0);
  const selected=audit.select(128);
  assert.equal(selected.length,128);
  assert.equal(new Set(selected.map(x=>x.d+','+x.h)).size,128);
  assert.ok(selected.filter(x=>x.h===0).length<=16);
  for(let bin=0;bin<4;bin++)
    assert.ok(selected.some(x=>x.h>0&&Math.min(3,Math.floor(x.d/6000*4))===bin));
  assert.deepEqual(audit.select(128),selected);
});
test('140.12.20: status disagreement categories separate wrong interpolation from wrong direct GPU',()=>{
  const samples=[
    {d:500,h:3,kind:'low-height',gridStatus:'blocked',gridAngle:0.01,sampleCalls:1,exactCalls:0},
    {d:1800,h:5,kind:'low-height',gridStatus:'visible',gridAngle:0.02,sampleCalls:2,exactCalls:0},
    {d:3500,h:0,kind:'ground-height',gridStatus:'blocked',gridAngle:0.03,sampleCalls:0,exactCalls:1},
    {d:5200,h:2,kind:'low-height',gridStatus:'visible',gridAngle:0.04,sampleCalls:1,exactCalls:0}
  ];
  const cpu={results:[result('visible',0.011,500,3),result('visible',0.021,1800,5),
    result('blocked',0.031,3500,0),result('visible',0.041,5200,2)]};
  const gpu={results:[result('visible',0.0112,500,3),result('blocked',0.0208,1800,5),
    result('blocked',0.0301,3500,0),result('visible',0.041,5200,2)]};
  const audit=compare.compareRendererVisibility(samples,cpu,gpu),s=audit.summary;
  assert.equal(s.samples,4);
  assert.equal(s.groundHeightSamples,1);
  assert.equal(s.gridVsCpuMismatches,1);
  assert.equal(s.directGpuVsCpuMismatches,1);
  assert.equal(s.gridRecoveredByDirectGpu,1);
  assert.equal(s.directGpuRegressions,1);
  assert.equal(s.cpuVisibleGridNonvisible,1);
  assert.equal(s.cpuVisibleDirectNonvisible,1);
  assert.equal(s.diagnosticCategories.interpolationStatusCandidate,1);
  assert.equal(s.diagnosticCategories.directGpuStatusCandidate,1);
  assert.equal(s.matchedAllThree,2);
  assert.equal(s.distanceBands['0-1.5km'].gridVsCpu,1);
  assert.equal(s.distanceBands['1.5-3km'].directVsCpu,1);
  assert.equal(audit.rows[2].cpuGroundContact,'crossing');
  assert.ok(s.maxAbsoluteGridAngleDeltaArcsec>0);
  assert.equal(audit.productionAuthorized,false);
  assert.equal(audit.cpuUsedForTargetSelection,false);
  assert.equal(audit.actualFrameCompared,false);
});
test('140.12.20: a CPU-visible point rejected by both GPU paths is distinguished',()=>{
  const a={d:1000,h:1,kind:'low-height',gridStatus:'indeterminate',gridAngle:0.01,
    sampleCalls:1,exactCalls:0};
  const v=compare.compareRendererVisibility([a],{results:[result('visible',0.01)]},
    {results:[result('blocked',0.01)]});
  assert.equal(v.summary.diagnosticCategories.cpuVisibleBothGpuNonvisible,1);
  assert.equal(v.summary.gridRecoveredByDirectGpu,0);
  assert.equal(v.summary.cpuVisibleDirectNonvisible,1);
});
test('140.12.20: invalid source fields and target response order are rejected',()=>{
  assert.throws(()=>compare.captureGpuRendererQueries({}),/Invalid GPU field/);
  const a={d:500,h:1,kind:'low-height',gridStatus:'visible',gridAngle:0.01,
    sampleCalls:1,exactCalls:0};
  assert.throws(()=>compare.compareRendererVisibility([a],{results:[]},{results:[]}),/Mismatched/);
  assert.throws(()=>compare.compareRendererVisibility([a],{results:[result('visible',0.01)]},
    {results:[result('visible',0.01,900,1)]}),/target\/status mismatch/);
});
test('140.12.20: UI runs real GPU B renderer capture and independent CPU batch without fallback or frame substitution',()=>{
  const html=src('CurvatureModern.html'),app=src('src/ui/modern/ModernApp.js'),
    model=src('src/ui/modern/ModernCompareModel.js');
  assert.match(html,/ModernApp\.js\?v=140\.12\.20/);
  assert.match(html,/ModernCompareModel\.js\?v=140\.12\.20/);
  assert.match(html,/id="ModernGpuRendererVisibilityRun"/);
  assert.match(app,/addEventListener\('click',runCompareRendererVisibility141220\)/);
  assert.match(app,/curvature-compare-140\.12\.20-renderer-visibility\.json/);
  assert.match(model,/captureGpuRendererQueries:captureGpuRendererQueries/);
  assert.match(model,/compareRendererVisibility:compareRendererVisibility/);
  const block=app.slice(app.indexOf('async function runCompareRendererVisibility141220()'),
    app.indexOf('function bindCompareGpuProbe()'));
  assert.match(block,/gpuFirstGrid\(state\.comparePair\.A,/);
  assert.match(block,/captureGpuRendererQueries\(field,/);
  assert.match(block,/state\.compareGraphs\.B\.Redraw\(\)/);
  assert.match(block,/captured\.select\(targetBudget\)/);
  assert.match(block,/session\.solve\(exactRequest/);
  assert.match(block,/contract\.solveCpuBatch\(cpuRequest\)/);
  assert.ok(block.indexOf('contract.solveCpuBatch(cpuRequest)')>
    block.indexOf('captured.select(targetBudget)'), 'CPU cannot select GPU targets');
  assert.match(block,/directGpuAnswersNotInjectedIntoFrame:true/);
  assert.match(block,/cpuShootingFallback:false/);
  assert.match(block,/productionAuthorized:false/);
});
test('140.12.20: real physical object outlines/fills produce auditable GPU B targets without CPU shooting',()=>{
  const composition=require('../src/scene/CurvatureIndependentComposition');
  const silhouette=require('../src/optics/OpticalTowerSilhouette');
  const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
  const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
  const bench=require('../tools/benchmark-adaptive-prism-112');
  const m=bench.model(85,'globe');
  const grid=compare.gpuFirstGrid(m,4096,
    {composition,silhouette,surfaces,branch:'first-forward-x'},
    {layout:'distance-focused'});
  const response={results:grid.request.targets.map(p=>({target:p.slice(),status:'visible',
    angle:Math.atan2(p[1]-m.Height,p[0])}))};
  const gpuField=compare.gpuFirstRayField(grid,response,surfaces),
    captured=compare.captureGpuRendererQueries(gpuField);
  const scene=composition.composeOpticalMain(Object.assign({},m,{geometryRadius:m.rEarth}),true,
    {physicalWorld:true});
  const res=optics.create().transform(scene,m,{atmosphere:'standard',experimentalRayField:captured});
  assert.ok(res.stats.fillTriangles>0,'actual painter-ready foundations must be emitted');
  assert.ok(res.stats.visibleSegments>0);
  assert.ok(captured.audit().uniqueQualifiedTargets>16);
  assert.ok(captured.select(16).every(row=>row.d<=6000&&row.h<=20));
  assert.equal(gpuField.stats().experimentalGpu.cpuFallbackRequests,0);
});
