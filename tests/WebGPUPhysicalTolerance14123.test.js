'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const physical=require('../src/diagnostics/CurvatureWebGPUPhysicalTolerance14123');
const fixture=require('../tools/reference/webgpu-real-scene-targets-14010.json');
const clone=object=>JSON.parse(JSON.stringify(object));
function request(){return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
 observerHeight:15,atmosphere:'vacuum',controls:{step:50,targetTolerance:0.005,eventSubsteps:8},
 targets:[[56,20.47]]};}
async function responses(){
 const req=request(),cpu=await contract.solveCpuBatch(req),gpuResponse=clone(cpu);
 gpuResponse.backend='gpu-experimental';return {req,cpu,gpuResponse};
}
test('140.12.3: 5 mm is the physical arrival criterion; angular mismatches are diagnostic, not vetoes',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 const r=gpuResponse.results[0];r.angle+=3e-5;r.residual=0.0017;
 // Both solver-reported arrivals and an independently integrated CPU replay
 // are within 5 mm, despite a >1e-7 rad angle difference.
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.physicallyAdequate,true);
 assert.equal(assessed.strictParityDiagnostic.angleMismatch,1);
 assert.equal(assessed.counts.gpuResidualExceeded,0);
 assert.equal(assessed.counts.gpuReplayResidualExceeded,0);
 assert.equal(assessed.targets[0].flags.length,0);
 assert.ok(assessed.targets[0].cpuReplayOfGpuAngle.absoluteResidualMetres<0.005);
});
test('140.12.3: individual residuals are tested; the difference between them is NOT a failure',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 cpu.results[0].residual=-0.003;
 gpuResponse.results[0].residual=0.003;
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.physicallyAdequate,true);
 assert.equal(assessed.strictParityDiagnostic.residualMismatch,1);
 assert.equal(assessed.counts.cpuResidualExceeded,0);
 assert.equal(assessed.counts.gpuResidualExceeded,0);
 assert.equal(assessed.max.cpuAbsoluteResidualMetres,0.003);
 assert.equal(assessed.max.gpuAbsoluteResidualMetres,0.003);
});
test('140.12.3: exceeding 5 mm in any arrival fails closed',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 gpuResponse.results[0].residual=0.005001;
 let assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.gpuResidualExceeded,1);
 assert.equal(assessed.physicallyAdequate,false);
 gpuResponse.results[0].residual=0.002;
 cpu.results[0].residual=-0.005001;
 assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.cpuResidualExceeded,1);
 assert.equal(assessed.physicallyAdequate,false);
});
test('140.12.3: independent f64 replay catches a false GPU self-reported 5 mm hit',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 gpuResponse.results[0].angle+=0.0001;
 gpuResponse.results[0].residual=0.002;
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.gpuResidualExceeded,0);
 assert.equal(assessed.counts.gpuReplayResidualExceeded,1);
 assert.equal(assessed.physicallyAdequate,false);
 assert.ok(assessed.targets[0].cpuReplayOfGpuAngle.absoluteResidualMetres>0.005);
});
test('140.12.3: ground/visibility disagreement and unresolved rays cannot pass at 5 mm',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 const r=gpuResponse.results[0];
 r.status='indeterminate';r.reason='uncertain crossing';
 r.ground={hitGround:true,travelled:r.pathLength-0.01,
   event:{kind:'ground',contact:'grazing',pathLength:r.pathLength-0.01}};
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.statusMismatch,1);
 assert.equal(assessed.counts.groundEventMismatch,1);
 assert.equal(assessed.counts.unresolved,1);
 assert.equal(assessed.physicallyAdequate,false);
});
test('140.12.3: fixed angle replay agrees analytically with straight ray in vacuum',()=>{
 const req=request(),angle=Math.atan2(20.47-15,56);
 const exact={target:req.targets[0],angle,pathLength:Math.hypot(56,5.47),status:'visible'};
 const tracer=require('../src/optics/OpticalRayTracer');
 const profile=tracer.atmosphere('vacuum');
 const prepared={profile,advance:tracer.prepareStepper({geometry:'flat',radius:req.radius,profile},true)};
 let result=physical.cpuReplay(req,exact,prepared);
 assert.equal(result.status,'measured');
 assert.ok(Math.abs(result.residualMetres)<1e-10);
 assert.ok(result.targetXErrorMetres<1e-8);
 const away=Object.assign({},exact,{angle:angle+0.0001});
 result=physical.cpuReplay(req,away,prepared);
 assert.equal(result.status,'measured');
 assert.ok(result.absoluteResidualMetres>0.005);
});
test('140.12.3: historical Flat #54 CPU replay exceeds 5 mm despite 3.4 mm GPU residual',()=>{
 const req=gpu.fixtureRequests(fixture)[0].request;
 const tracer=require('../src/optics/OpticalRayTracer');
 const profile=tracer.atmosphere(req.atmosphere,req.profileOptions);
 const prepared={profile,advance:tracer.prepareStepper({geometry:req.geometry,radius:req.radius,profile},true)};
 const target=req.targets[54];
 assert.ok(Math.abs(target[0]-25550.01097343013)<1e-6);
 const result=physical.cpuReplay(req,{target,angle:0.0018239873461425304,
   pathLength:25550.033203125,status:'visible'},prepared);
 assert.equal(result.status,'measured');
 assert.ok(Math.abs(result.residualMetres-0.005171501392233324)<1e-6);
 assert.ok(Math.abs(0.003406524658203125)<req.controls.targetTolerance);
 assert.ok(result.absoluteResidualMetres>req.controls.targetTolerance);
});
test('140.12.3: missing GPU ray fails closed; cannot gain success from null residual',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 gpuResponse.results[0]={target:req.targets[0],status:'solver_failed',angle:null,
  residual:null,pathLength:null,ground:null,reason:'no bracket'};
 const assessed=physical.physicalComparison(req,cpu,gpuResponse);
 assert.equal(assessed.counts.unresolved,1);
 assert.equal(assessed.counts.gpuReplayUnavailable,1);
 assert.equal(assessed.physicallyAdequate,false);
});
test('140.12.3: decision prioritizes physics, then stable repeats, then retained 2x cold gate',()=>{
 const counts={cpuResidualExceeded:0,gpuResidualExceeded:0,gpuReplayResidualExceeded:0,
  gpuReplayUnavailable:0,statusMismatch:0,groundEventMismatch:0,unresolved:0,physicallyAdequate:1};
 const scene={status:'measured',physical:{counts,physicallyAdequate:true},
  timing:{warmOutputBitwiseStable:true,coldSpeedup:3}};
 assert.equal(physical.decide([scene]).verdict,'BATCH_STAGE_PASS_ONLY');
 assert.equal(physical.decide([scene]).productionAuthorized,false);
 assert.equal(physical.decide([scene]).thresholdColdSpeedup,2);
 for(const [field,expected] of [['cpuResidualExceeded','CPU_REFERENCE_STOP'],
  ['gpuResidualExceeded','GPU_ARRIVAL_STOP'],['gpuReplayResidualExceeded','GPU_REPLAY_STOP'],
  ['groundEventMismatch','GROUND_STATUS_STOP'],['unresolved','GROUND_STATUS_STOP']]){
  const altered=clone(scene);altered.physical.counts[field]=1;
  assert.equal(physical.decide([altered]).verdict,expected);
 }
 assert.equal(physical.decide([Object.assign({},scene,{timing:{coldSpeedup:3,warmOutputBitwiseStable:false}})]).verdict,
  'BATCH_REPEAT_INSTABILITY_STOP');
 assert.equal(physical.decide([Object.assign({},scene,{timing:{coldSpeedup:1.5,warmOutputBitwiseStable:true}})]).verdict,
  'BATCH_PERFORMANCE_STOP');
 assert.equal(physical.decide([{status:'unavailable'}]).verdict,'INCONCLUSIVE');
});
test('140.12.3: orchestrator retains original 5 mm residual-stop GPU policy and independent CPU reference',async()=>{
 const policies=[];
 const mock={async solveBatch(req,_deps,opts){
  policies.push(opts);const reference=await contract.solveCpuBatch(req);
  return {response:{branch:contract.BRANCH,backend:'gpu-experimental',results:reference.results},
   timing:{gpuColdMs:100000,gpuWarmMedianMs:200,warmOutputBitwiseStable:true,
    warmRunMs:[200,200,200]},device:{adapterInfo:null}};
 }};
 const result=await physical.run(fixture,{}, {solver:mock});
 assert.equal(result.status,'finished');
 assert.equal(result.version,'140.12.3');
 assert.equal(result.scenes.length,2);
 assert.deepEqual(policies,[{refinement:'residual-stop',warmRepeats:3},
  {refinement:'residual-stop',warmRepeats:3}]);
 assert.ok(result.scenes.every(s=>s.physical.physicallyAdequate));
 assert.equal(result.decision.verdict,'BATCH_PERFORMANCE_STOP');
 assert.equal(result.decision.productionAuthorized,false);
});
test('140.12.3: no WebGPU returns INCONCLUSIVE and no invented scene accuracy or performance',async()=>{
 const result=await physical.run(fixture,{navigator:{}});
 assert.equal(result.status,'incomplete');
 assert.ok(result.scenes.every(s=>s.status==='unavailable'));
 assert.equal(result.decision.verdict,'INCONCLUSIVE');
 assert.equal(result.decision.productionAuthorized,false);
});
test('140.12.3: single canonical diagnostics HTML and physical gate controls',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/value="7"/);
 assert.match(html,/CurvatureWebGPUPhysicalTolerance14123\.run/);
 assert.match(html,/curvature-webgpu-optics-140\.12\.3-physical-tolerance\.json/);
 assert.match(html,/for\(var i=0;i<11;i\+\+\)/);
 assert.deepEqual(fs.readdirSync(path.join(__dirname,'../tools')).filter(s=>/webgpu-optics.*\.html/.test(s)),['webgpu-optics.html']);
 assert.match(gpu.WGSL_REFINE,/if\(abs\(shot\.residual\)<=bitcast<f32>\(config\[11\]\)\)/);
});


test('140.12.4: illustrative perspective pixel proxy is deterministic, configurable and clipped',()=>{
 const cfg=physical.screenProxyOptions({viewportHeightPx:1080,verticalFovDegrees:45});
 assert.equal(physical.perspectiveY(0,cfg),540);
 assert.ok(Math.abs(physical.perspectiveY(Math.PI/8,cfg))<1e-10);
 assert.equal(physical.perspectiveY(Math.PI/4,cfg),null);
 const pixelDiff=Math.abs(physical.perspectiveY(0.1,cfg)-physical.perspectiveY(0.10001,cfg));
 assert.ok(pixelDiff>0&&pixelDiff<0.02);
 assert.notEqual(physical.perspectiveY(0.1,physical.screenProxyOptions({verticalFovDegrees:20})),
  physical.perspectiveY(0.1,cfg));
 for(const bad of [{viewportHeightPx:99},{viewportHeightPx:1080.1},{verticalFovDegrees:0},
  {cameraPitchDegrees:80},{pixelBudgetPx:0},{nearGroundMetres:-0.01},
  {endpointWindowMetres:100}])assert.throws(()=>physical.screenProxyOptions(bad),RangeError);
});

test('140.12.4: subpixel angular difference is never proof of visible-image parity',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 gpuResponse.results[0].angle+=3e-5;gpuResponse.results[0].residual=0.002;
 const result=physical.visualComparison(req,cpu,gpuResponse);
 assert.equal(result.counts.subpixelAngleProxy,1);
 assert.equal(result.counts.overPixelBudget,0);
 assert.equal(result.counts.requiresFrameReview,0);
 assert.equal(result.actualRenderedImageCompared,false);
 assert.equal(result.visualEquivalenceProven,false);
 assert.ok(result.maxLaunchAngleProxyShiftPx<0.05);
 assert.equal(result.targets[0].cpuGroundReplayOfGpuAngle.status,'measured');
});

test('140.12.4: near-endpoint ground mismatch is triaged but never excused',async()=>{
 const req=request();req.targets=[[1000,0]];
 const cpu=await contract.solveCpuBatch(req),candidate=clone(cpu);
 candidate.backend='gpu-experimental';
 const r=candidate.results[0];
 r.angle-=5e-7;r.status='indeterminate';r.reason='ground grazing';
 r.ground={hitGround:true,travelled:r.pathLength-0.02,
  event:{kind:'ground',contact:'crossing',pathLength:r.pathLength-0.02}};
 const near=physical.visualComparison(req,cpu,candidate);
 assert.equal(near.counts.statusDisagreements,1);
 assert.equal(near.counts.groundEvidenceDisagreements,1);
 assert.equal(near.counts.nearBoundaryCandidates,1);
 assert.equal(near.counts.requiresFrameReview,1);
 assert.equal(near.visualEquivalenceProven,false);
 assert.ok(near.targets[0].launchAngleProxyShiftPx<0.5);
 r.status='blocked';r.ground.travelled=r.pathLength-3;
 r.ground.event.pathLength=r.pathLength-3;
 const earlier=physical.visualComparison(req,cpu,candidate);
 assert.equal(earlier.counts.nearBoundaryCandidates,0);
 assert.equal(earlier.counts.requiresFrameReview,1);
});

test('140.12.4: offscreen or unresolved GPU never becomes silently equivalent',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 const settings={verticalFovDegrees:5};
 let result=physical.visualComparison(req,cpu,gpuResponse,settings);
 assert.equal(result.counts.outsideViewport,1);
 assert.equal(result.counts.requiresFrameReview,1);
 gpuResponse.results[0]={target:req.targets[0],status:'solver_failed',angle:null,
  residual:null,pathLength:null,ground:null,reason:'no root'};
 result=physical.visualComparison(req,cpu,gpuResponse);
 assert.equal(result.counts.groundReplayUnavailable,1);
 assert.equal(result.counts.requiresFrameReview,1);
 assert.equal(result.counts.nearBoundaryCandidates,0);
});

test('140.12.4: visual mode reuses existing physical module, GPU policy and warm timing',async()=>{
 const policies=[];
 const mock={async solveBatch(req,_deps,opts){
  policies.push(opts);const reference=await contract.solveCpuBatch(req);
  return {response:{branch:contract.BRANCH,backend:'gpu-experimental',results:reference.results},
   timing:{gpuColdMs:100000,gpuWarmMedianMs:200,warmOutputBitwiseStable:true,
    warmRunMs:[200,200,200]},device:{adapterInfo:null}};
 }};
 const result=await physical.run(fixture,{}, {solver:mock,visual:{viewportHeightPx:1080}});
 assert.equal(result.version,'140.12.4');
 assert.equal(result.status,'finished');
 assert.equal(result.decision.verdict,'VISUAL_PROXY_ONLY');
 assert.equal(result.decision.productionAuthorized,false);
 assert.equal(result.decision.visualEquivalenceProven,false);
 assert.equal(result.previousPhysicalDecision.verdict,'BATCH_PERFORMANCE_STOP');
 assert.equal(result.scenes.length,2);
 assert.ok(result.scenes.every(s=>s.visual&&s.visual.targets.length===64));
 assert.deepEqual(policies,[{refinement:'residual-stop',warmRepeats:3},
  {refinement:'residual-stop',warmRepeats:3}]);
 assert.equal(physical.decideVisual([{status:'unavailable'}]).verdict,'INCONCLUSIVE');
 assert.equal(physical.decideVisual([{status:'measured',timing:{warmOutputBitwiseStable:false}}]).verdict,
  'BATCH_REPEAT_INSTABILITY_STOP');
});

test('140.12.4: only the existing JS module, existing tests and canonical HTML are used',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/value="8"/);
 assert.match(html,/id="panel-8"/);
 assert.match(html,/for\(var i=0;i<11;i\+\+\)/);
 assert.match(html,/CurvatureWebGPUPhysicalTolerance14123\.run\(await response\.json\(\),undefined,\{visual:view\}\)/);
 assert.match(html,/curvature-webgpu-optics-140\.12\.4-visual-proxy\.json/);
 assert.deepEqual(fs.readdirSync(path.join(__dirname,'../tools')).filter(s=>/webgpu-optics.*\.html/.test(s)),['webgpu-optics.html']);
});

test('140.12.6: only newest panel is initially visible; old modes remain selectable',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 const sections=[...html.matchAll(/<section id="panel-(\d+)" class="experiment"( hidden)?>/g)];
 assert.equal(sections.length,11);
 assert.deepEqual(sections.filter(m=>!m[2]).map(m=>Number(m[1])),[10]);
});

test('140.12.5: scaling options are bounded and replicated fixture is deterministic',()=>{
 const opts=physical.performanceOptions({maxRays:512,warmRepeats:3});
 assert.equal(opts.visual.pixelBudgetPx,1);
 assert.equal(opts.maxRays,512);
 for(const bad of [{maxRays:10000},{maxRays:128},{warmRepeats:0},{warmRepeats:5},
  {visual:{pixelBudgetPx:0}},{visual:{viewportHeightPx:20}}])
  assert.throws(()=>physical.performanceOptions(bad),RangeError);
 const req=gpu.fixtureRequests(fixture)[0].request;
 const copy=physical.replicatedRequest(req,256);
 assert.equal(copy.targets.length,256);
 assert.deepEqual(copy.targets.slice(64,128),req.targets);
 copy.targets[0][0]++;
 assert.notDeepEqual(copy.targets[0],req.targets[0]);
 for(const invalid of [0,65,1025,257])
  assert.throws(()=>physical.replicatedRequest(req,invalid),RangeError);
});
test('140.12.5: performance experiment reuses sessions across sizes and retains pixel limitations',async()=>{
 const calls=[],closed=[];
 const mock={async createSession(capacity,_,opts){
  calls.push({kind:'session',capacity,opts});
  return {setupMs:5,close(){closed.push(capacity);},async solve(req,options){
   calls.push({kind:'solve',count:req.targets.length,options});
   const reference=await contract.solveCpuBatch(req);
   return {response:{branch:contract.BRANCH,backend:'gpu-experimental',results:reference.results},
    timing:{gpuUploadToReadbackMs:10,gpuWarmMedianMs:8,warmRunMs:[8,8],
     warmOutputBitwiseStable:true,wallClockPhases:[{totalMs:10},{totalMs:8},{totalMs:8}]},
    device:{adapterInfo:{vendor:'mock'}}};}};}};
 const progress=[];
 const report=await physical.runPerformance(fixture,{}, {solver:mock,maxRays:256,
  onProgress:(scene,n)=>progress.push(scene+':'+n)});
 assert.equal(report.status,'finished');assert.equal(report.version,'140.12.5');
 assert.equal(report.decision.verdict,'PERFORMANCE_PROFILE_ONLY');
 assert.equal(report.decision.productionAuthorized,false);
 assert.equal(report.decision.visualEquivalenceProven,false);
 assert.deepEqual(report.scenes.map(s=>s.scaling.map(t=>t.rays)),[[64,128,256],[64,128,256]]);
 assert.deepEqual(calls.filter(c=>c.kind==='session').map(c=>c.capacity),[256,256]);
 assert.deepEqual(calls.filter(c=>c.kind==='solve').map(c=>c.options.warmRepeats),Array(6).fill(2));
 assert.deepEqual(closed,[256,256]);
 assert.equal(progress.length,6);
 assert.ok(report.scenes.every(s=>s.baselineVisualProxy.counts.subpixelAngleProxy===64));
 assert.ok(report.scenes.every(s=>s.scaling.every(x=>x.identicalFixturePrefixStable)));
 assert.match(report.limitations.join(' '),/not.*frame|Not a rendered frame/i);
});
test('140.12.5: unavailable WebGPU stays inconclusive and no CPU fallback masquerades as GPU',async()=>{
 const result=await physical.runPerformance(fixture,{navigator:{}},{maxRays:256});
 assert.equal(result.status,'incomplete');
 assert.equal(result.decision.verdict,'INCONCLUSIVE');
 assert.ok(result.scenes.every(x=>x.status==='unavailable'));
});
test('140.12.5: canonical HTML has tenth scaling mode and no extra page',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/value="9"/);
 assert.match(html,/id="panel-9"/);
 assert.match(html,/CurvatureWebGPUPhysicalTolerance14123\.runPerformance/);
 assert.match(html,/curvature-webgpu-optics-140\.12\.5-performance\.json/);
 assert.match(html,/for\(var i=0;i<11;i\+\+\)/);
 assert.deepEqual(fs.readdirSync(path.join(__dirname,'../tools')).filter(s=>/webgpu-optics.*\.html/.test(s)),['webgpu-optics.html']);
});

test('140.12.6: generated dense targets come from 12-tower physical polygon edges, not repetitions',()=>{
 const generated=require('../tools/generate-webgpu-scene-targets-14010');
 assert.deepEqual(fixture,generated.fixture());
 for(const scene of fixture.scenes){
  assert.equal(scene.denseTargets.length,1024);
  assert.ok(scene.denseSourcePointCount>=1024);
  assert.equal(new Set(scene.denseTargets.map(x=>x.join(','))).size,1024);
  assert.equal(scene.targets.length,64);
 }
});
test('140.12.6: dense nested targets preserve their prefix and spread across real geometry',()=>{
 assert.deepEqual(Array.from({length:4},(_,i)=>physical.reverseTenBits(i)),[0,512,256,768]);
 const entry=gpu.fixtureRequests(fixture)[0],scene=fixture.scenes[0];
 const a=physical.denseRequest(scene,entry.request,64),b=physical.denseRequest(scene,entry.request,256);
 assert.deepEqual(b.targets.slice(0,64),a.targets);
 assert.equal(new Set(b.targets.map(x=>JSON.stringify(x))).size,256);
 assert.ok(new Set(b.targets.map(x=>Math.floor(x[0]/1000))).size>3);
 b.targets[0][0]++;
 assert.notDeepEqual(b.targets[0],a.targets[0]);
 for(const bad of [0,63,65,1280])assert.throws(()=>physical.denseRequest(scene,entry.request,bad),RangeError);
 assert.throws(()=>physical.denseRequest({...scene,denseTargets:[]},entry.request,64),RangeError);
 for(const bad of [{maxRays:128},{maxRays:2048},{warmRepeats:0},{visual:{pixelBudgetPx:0}}])
  assert.throws(()=>physical.denseOptions(bad),RangeError);
});
test('140.12.6: projected occupancy measures visible point samples but never certifies frame equivalence',async()=>{
 const {req,cpu,gpuResponse}=await responses();
 const identical=physical.projectedTargetOccupancy(req,cpu,gpuResponse,{pixelBudgetPx:1});
 assert.equal(identical.strictOccupancyDifferencePixels,0);
 assert.equal(identical.unmatchedBeyondPixelBudget,0);
 assert.equal(identical.actualRenderedImageCompared,false);
 assert.equal(identical.actualSilhouetteCompared,false);
 assert.equal(identical.visualEquivalenceProven,false);
 gpuResponse.results[0].status='indeterminate';gpuResponse.results[0].reason='ground boundary';
 const disputed=physical.projectedTargetOccupancy(req,cpu,gpuResponse,{pixelBudgetPx:1});
 assert.equal(disputed.counts.statusDisagreements,1);
 assert.equal(disputed.counts.unresolvedPairs,1);
 assert.ok(disputed.unmatchedBeyondPixelBudget>0);
 assert.equal(disputed.groundReplays.length,1);
});
test('140.12.6: dense GPU session scales with distinct targets and closes cleanly',async()=>{
 const calls=[],closed=[];
 const mock={async createSession(capacity){
  calls.push({kind:'session',capacity});
  return {setupMs:4,close(){closed.push(capacity);},async solve(req){
   calls.push({kind:'solve',targets:req.targets.map(x=>x.slice())});
   const cpu=await contract.solveCpuBatch(req);
   return {response:{backend:'gpu-experimental',branch:contract.BRANCH,results:cpu.results},
    timing:{gpuUploadToReadbackMs:10,gpuWarmMedianMs:8,gpuWarmRunsMs:[8,8],
      warmRunMs:[8,8],warmOutputBitwiseStable:true,
      wallClockPhases:[{totalMs:10},{totalMs:8},{totalMs:8}]},device:{adapterInfo:{vendor:'mock'}}};
  }};
 }};
 const report=await physical.runDensePerformance(fixture,{}, {solver:mock,maxRays:256});
 assert.equal(report.version,'140.12.6');assert.equal(report.status,'finished');
 assert.equal(report.decision.verdict,'DENSE_PROFILE_REVIEW_ONLY');
 assert.equal(report.decision.productionAuthorized,false);
 assert.equal(report.decision.visualEquivalenceProven,false);
 assert.deepEqual(closed,[256,256]);
 assert.deepEqual(report.scenes.map(s=>s.scaling.map(x=>x.rays)),[[64,128,256],[64,128,256]]);
 assert.ok(report.scenes.every(s=>s.scaling.every(x=>x.sharedPrefixStable&&x.gpuOutputBitwiseStable)));
 assert.ok(report.scenes.every(s=>s.projectedTargetOccupancy.actualSilhouetteCompared===false));
 const batches=calls.filter(x=>x.kind==='solve');
 assert.equal(batches.length,6);
 assert.notDeepEqual(batches[0].targets.slice(0,64),fixture.scenes[0].targets);
 assert.deepEqual(batches[1].targets.slice(0,64),batches[0].targets);
});
test('140.12.6: absent WebGPU never passes dense qualification',async()=>{
 const report=await physical.runDensePerformance(fixture,{navigator:{}},{maxRays:256});
 assert.equal(report.status,'incomplete');
 assert.equal(report.decision.verdict,'INCONCLUSIVE');
 assert.equal(report.decision.productionAuthorized,false);
});
test('140.12.6: eleventh mode uses canonical WebGPU page and existing JS module',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/value="10" selected/);
 assert.match(html,/id="panel-10"/);
 assert.match(html,/runDensePerformance/);
 assert.match(html,/curvature-webgpu-optics-140\.12\.6-dense-performance\.json/);
 assert.deepEqual(fs.readdirSync(path.join(__dirname,'../tools')).filter(s=>/webgpu-optics.*\.html/.test(s)),['webgpu-optics.html']);
});
