'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const compare=require('../src/ui/modern/ModernCompareModel');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const audit=require('../src/diagnostics/CurvatureGpuAlgorithmAttribution141235');
function fixture(statuses=['visible','visible','blocked','blocked']){
  const metric=surfaces.createFromCurvature(0),distances=[100,200],heights=[0,20],
    targets=distances.flatMap(d=>heights.map(h=>metric.surfacePoint2(d,h))),
    grid={distances,heights,columns:2,rows:2,
      request:{geometry:'flat',radius:6371000,observerHeight:15,targets}},
    points=targets.map((target,i)=>({target,status:statuses[i],
      angle:Math.atan2(target[1]-15,target[0])+0.00001}));
  return {grid,response:{results:points}};
}
function field(statuses,opts){const f=fixture(statuses);return compare.gpuFirstRayField(f.grid,f.response,surfaces,opts);}
test('140.12.35: baseline nearest-vote flips visibility at midpoint while strict refuses to guess',()=>{
  const baseline=field(),strict=field(undefined,{strictVisibility:true});
  for(const d of [149.999,150,150.001]){
    const b=baseline.sample(d,10),s=strict.sample(d,10);
    assert.ok(Number.isFinite(b.angle)&&Number.isFinite(s.angle));
    assert.ok(Math.abs(b.angle-s.angle)<1e-14,'strict only changes status, not optical angle');
    assert.equal(s.status,'indeterminate');
    assert.deepEqual(s.riskFlags,['mixed-status']);
  }
  assert.equal(baseline.sample(149.999,10).status,'visible');
  assert.equal(baseline.sample(150.001,10).status,'blocked');
  assert.equal(strict.stats().experimentalGpu.strictMixed,3);
  assert.equal(strict.stats().experimentalGpu.strictRejected,3);
  assert.equal(baseline.stats().experimentalGpu.strictRejected,0);
});
test('140.12.35: uniform valid cells preserve status, out-of-domain/unknown nodes become uncertain',()=>{
  const clean=field(['visible','visible','visible','visible'],{strictVisibility:true});
  assert.equal(clean.sample(150,10).status,'visible');
  assert.equal(clean.sample(99,10).status,'indeterminate');
  assert.equal(clean.sample(150,25).status,'indeterminate');
  assert.equal(clean.stats().experimentalGpu.strictOutOfDomain,2);
  const broken=field(['solver_failed','visible','visible','visible'],{strictVisibility:true});
  assert.equal(broken.exact(125,4).status,'indeterminate');
  assert.equal(broken.stats().experimentalGpu.strictInvalid,1);
  assert.equal(broken.stats().experimentalGpu.failedGpuNodes,1);
  const unknown=field(['visible','visible','indeterminate','indeterminate'],{strictVisibility:true});
  assert.equal(unknown.sample(150,10).status,'indeterminate');
  assert.equal(unknown.stats().experimentalGpu.strictInvalid,1);
});
test('140.12.35: sparse direct GPU answers only override exact selected coordinates',()=>{
  const f=fixture(),d=150.001,h=10,target=surfaces.createFromCurvature(0).surfacePoint2(d,h);
  const strict=compare.gpuFirstRayField(f.grid,f.response,surfaces,{strictVisibility:true,
    refinements:[{d,h,result:{target,status:'visible',angle:-0.001,residual:0}}]});
  assert.equal(strict.sample(d,h).status,'visible');
  assert.equal(strict.exact(d,h).angle,-0.001);
  assert.equal(strict.exact(d+1e-4,h).status,'indeterminate');
  assert.equal(strict.stats().experimentalGpu.refinementHits,1);
  assert.equal(strict.stats().experimentalGpu.cpuFallbackRequests,0);
  assert.throws(()=>compare.gpuFirstRayField(f.grid,f.response,surfaces,{strictVisibility:true,
    refinements:[{d,h,result:{target:[1,2],status:'visible',angle:0}}]}),/target\/order mismatch/);
});
test('140.12.35: selected same-coordinate CPU vs direct GPU vs interpolated grid exposes classification and angle separately',()=>{
  const sample=[
    {d:100,h:0,gridStatus:'blocked',gridAngle:0.1,riskFlags:['mixed-status']},
    {d:200,h:2,gridStatus:'visible',gridAngle:0.2,riskFlags:[]},
    {d:300,h:3,gridStatus:'indeterminate',gridAngle:0.3,riskFlags:['out-of-grid-clamp']}
  ];
  const cpu={results:[{status:'visible',angle:0.11},{status:'visible',angle:0.19},{status:'indeterminate',angle:0.3}]},
    direct={results:[{status:'visible',angle:0.1101},{status:'blocked',angle:0.19},{status:'visible',angle:0.3}]};
  const out=audit.comparison(sample,cpu,direct,{height:100},(_,angle)=>({xPx:0,yPx:angle*100}));
  assert.equal(out.summary.targets,3);
  assert.equal(out.summary.robustCpuTargets,2);
  assert.equal(out.summary.gridStatusMismatches,1);
  assert.equal(out.summary.directStatusMismatches,1);
  assert.equal(out.summary.gridWrongDirectCorrect,1);
  assert.equal(out.summary.gridCorrectDirectWrong,1);
  assert.equal(out.summary.uncertainCpuTargets,1);
  assert.equal(out.summary.directVsCpuAnglesCount,1);
  assert.ok(Math.abs(out.summary.maxDirectVsCpuPx-0.01)<1e-10);
  assert.equal(out.summary.gridVsCpuAnglesCount,1);
  assert.ok(Math.abs(out.summary.maxGridVsCpuPx-1)<1e-10);
  assert.equal(out.perTarget[0].gridVsCpuPx,null);
  assert.equal(out.perTarget[1].directVsCpuPx,null);
  assert.deepEqual(out.confusion.gridVsCpu['visible → blocked'],1);
  assert.throws(()=>audit.comparison([sample[0]],{results:[{status:'visible',target:[1,2]}]},
    {results:[{status:'visible',target:[3,2]}]}, {},(_,a)=>({yPx:a})),/target order mismatch/);
});
test('140.12.35: report is explicitly non-certified and enforces three actual variant frames',()=>{
  const cases=Array.from({length:4},(_,i)=>({id:String(i),variants:{baseline:{pixelDiff:{}},
    strict:{pixelDiff:{}},strictDirect:{pixelDiff:{}}}}));
  assert.throws(()=>audit.report(cases.slice(0,3),{summary:{}},{}),/Four 3-way/);
  const r=audit.report(cases,{summary:{targets:10}},{gpuGridNodes:4096});
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.doubleSingleFrame,false);
  assert.equal(r.causalDecompositionCertified,false);
  assert.equal(r.cpuOracleInjectedIntoGpuFrame,false);
  assert.match(r.limitations.join(' '),/not additive|NOT additive/i);
});
test('140.12.35: browser path is opt-in, real GPU B paints occur before independent CPU targets',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const html=fs.readFileSync(path.resolve(__dirname,'../CurvatureModern.html'),'utf8');
  const start=app.indexOf('async function runGpuAlgorithmAttribution141235()'),end=app.indexOf('  function bind(){',start);
  assert.ok(start>=0&&end>start);
  const block=app.slice(start,end);
  assert.match(block,/gpuFirstGrid\(sourceA,4096,deps,\{layout:'distance-focused'\}\)/);
  assert.match(block,/captureGpuRendererQueries\(baselineDiscovery/);
  assert.match(block,/strictVisibility:true/);
  assert.match(block,/refinements:refinements/);
  assert.match(block,/state\.probeField=fields\[name\]/);
  assert.match(block,/graphB\.Redraw\(\)/);
  assert.match(block,/graphA\.Redraw\(\)/);
  assert.ok(block.indexOf('contract.solveCpuBatch(cpuRequest)')>block.indexOf('for(var j=0;j<configurations.length;j++)'));
  assert.match(block,/numericAuditFailed\('140\.12\.35'/);
  assert.match(app,/attributionButton\.addEventListener\('click',runGpuAlgorithmAttribution141235\)/);
  assert.match(html,/CurvatureGpuAlgorithmAttribution141235\.js\?v=140\.12\.35/);
  assert.match(html,/id="ModernGpuAlgorithmAttributionRun"/);
});
test('140.12.35: strict diagnostic field reaches real contours/fills without CPU fallback',()=>{
  const composition=require('../src/scene/CurvatureIndependentComposition');
  const silhouette=require('../src/optics/OpticalTowerSilhouette');
  const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
  const bench=require('../tools/benchmark-adaptive-prism-112');
  const model=bench.model(10,'globe');
  const grid=compare.gpuFirstGrid(model,4096,
    {composition,silhouette,surfaces,branch:'first-forward-x'},
    {layout:'distance-focused'});
  const response={results:grid.request.targets.map((p,i)=>({target:p.slice(),
    status:Math.floor(i/grid.rows)%2===0?'visible':'blocked',
    angle:Math.atan2(p[1]-model.Height,p[0])}))};
  const strict=compare.gpuFirstRayField(grid,response,surfaces,{strictVisibility:true});
  const scene=composition.composeOpticalMain(Object.assign({},model,{geometryRadius:model.rEarth}),true,
    {physicalWorld:true});
  const out=optics.create().transform(scene,model,{atmosphere:'standard',experimentalRayField:strict});
  assert.ok(Number.isInteger(out.stats.unresolved));
  assert.ok(Number.isInteger(out.stats.fillUnresolved));
  assert.ok(strict.stats().experimentalGpu.strictRejected>0);
  assert.equal(strict.stats().experimentalGpu.cpuFallbackRequests,0);
});

test('140.12.35.1: baseline paint timing declares elapsed in strict browser scope',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const start=app.indexOf('async function runGpuAlgorithmAttribution141235()');
  const end=app.indexOf('  function bind(){',start);
  const block=app.slice(start,end);
  const match=block.match(/var t=profileNow\(\);graphB\.Redraw\(\);var elapsed=profileNow\(\)-t,\s*stats=ensureGpuResult\(\),frame=parity\.canvasCapture\(graphB\.Canvas\);/);
  assert.ok(match,'paint duration must be declared locally rather than assigned as an undeclared identifier');
  const run=new Function('profileNow','graphB','ensureGpuResult','parity',
    '\"use strict\";'+match[0]+'return {elapsed,stats,frame};');
  let now=100;const result=run(()=>{now+=5;return now;},
    {Redraw(){},Canvas:{width:1}},()=>({ok:true}),{canvasCapture:()=>({width:1})});
  assert.equal(result.elapsed,5);
  assert.deepEqual(result.stats,{ok:true});
  assert.deepEqual(result.frame,{width:1});
});
