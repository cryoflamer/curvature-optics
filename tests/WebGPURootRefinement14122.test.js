'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const refinement=require('../src/diagnostics/CurvatureWebGPURootRefinement14122');
const fixture=require('../tools/reference/webgpu-real-scene-targets-14010.json');
function request(){return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
 observerHeight:15,atmosphere:'vacuum',controls:{step:50,targetTolerance:0.005},
 targets:[[56,20.47]]};}
test('140.12.2: old residual-stop shader is retained; opt-in angle-bracket policy has no 5 mm early stop',()=>{
 assert.match(gpu.WGSL_REFINE,/if\(abs\(shot\.residual\)<=bitcast<f32>\(config\[11\]\)\)/);
 assert.match(gpu.WGSL_REFINE,/b=a;/);
 assert.match(gpu.WGSL_REFINE_ANGLE_BRACKET,/if\(b\.x-a\.x<=2e-8\)/);
 assert.match(gpu.WGSL_REFINE_ANGLE_BRACKET,/if\(midpoint<=a\.x \|\| midpoint>=b\.x\)/);
 assert.match(gpu.WGSL_REFINE_ANGLE_BRACKET,/refinementValid=false/);
 assert.match(gpu.WGSL_REFINE_ANGLE_BRACKET,/status=2\.0/); // ground path unchanged
 assert.doesNotMatch(gpu.WGSL_REFINE_ANGLE_BRACKET,/if\(abs\(shot\.residual\)<=bitcast<f32>\(config\[11\]\)\)/);
 assert.doesNotMatch(gpu.WGSL_REFINE_ANGLE_BRACKET,/b=a;\s*break;\s*}\s*if\(a\.y\*shot/);
 const original=gpu.pack(request());
 assert.equal(original.config[11],gpu.pack(request()).config[11]);
});
test('140.12.2: analytic line proves 5 mm arrival tolerance does not imply 1e-7 rad angle tolerance',()=>{
 // Deliberately off-center bracket and a fully independent f32 approximation
 // of the flat/vacuum target-height function (NOT an emulated WGSL compiler).
 const f=Math.fround,x=56,z=20.47,h=15,exact=Math.atan2(z-h,x);
 function refine(legacy){
  let left=f(exact-0.009),right=f(exact+0.016),selected=NaN;
  const residual=a=>f(f(x*f(Math.tan(a)))+h-z);
  let y0=residual(left);
  for(let i=0;i<28;i++){
   let mid=f(legacy?f(f(left+right)*0.5):f(left+f(f(right-left)*0.5)));
   const r=residual(mid);
   if(legacy&&Math.abs(r)<=0.005){selected=mid;break;}
   if(!legacy&&(right-left<=2e-8||mid<=left||mid>=right))break;
   if(y0*r<=0){right=mid;}else{left=mid;y0=r;}
  }
  return legacy?selected:f(left+f(f(right-left)*0.5));
 }
 const old=refine(true),improved=refine(false);
 assert.ok(Number.isFinite(old));
 assert.ok(Math.abs(old-exact)>1e-7,`old residual-stop should be coarser: ${old-exact}`);
 assert.ok(Math.abs(improved-exact)<1e-7,`f32 bracket should meet analytical angle: ${improved-exact}`);
});
test('140.12.2: seven exact flat/vacuum rays are distinct from the 128 scene targets',()=>{
 const r=refinement.analyticRequest();
 assert.equal(r.targets.length,7);assert.equal(r.geometry,'flat');
 assert.equal(r.atmosphere,'vacuum');
 assert.ok(r.targets.every(t=>t[1]>0));
 const response={branch:contract.BRANCH,backend:'gpu-experimental',results:r.targets.map(t=>({
  target:t.slice(),angle:Math.atan2(t[1]-r.observerHeight,t[0]),residual:0,
  status:'visible',pathLength:Math.hypot(t[0],t[1]-r.observerHeight),
  ground:{hitGround:false,travelled:Math.hypot(t[0],t[1]-r.observerHeight),event:null},reason:null}))};
 const result=refinement.analyticResults(r,response);
 assert.equal(result.passed,7);assert.equal(result.failed,0);
 response.results[0].angle+=5e-5;
 assert.equal(refinement.analyticResults(r,response).failed,1);
 response.results[0].angle-=5e-5;
 response.results[0].ground.hitGround=true;
 response.results[0].ground.event={kind:'ground',contact:'grazing',pathLength:1};
 response.results[0].ground.travelled=1;
 assert.equal(refinement.analyticResults(r,response).failed,1);
});
test('140.12.2: invalid refinement policy fails before WebGPU allocation',async()=>{
 await assert.rejects(gpu.solveBatch(request(),{}, {refinement:'unverified'}),/root refinement policy/);
});
test('140.12.2: both GPU policies compile separately, without mixing old pipeline',async()=>{
 const shaders=[];const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
 const device={limits:{maxStorageBufferBindingSize:1e7},createShaderModule({code}){
   shaders.push(code);return {getCompilationInfo:async()=>({messages:[]})}},
  async createComputePipelineAsync(){return {getBindGroupLayout:()=>({})}},
  createBuffer({size}){return {data:new ArrayBuffer(size),async mapAsync(){},getMappedRange(){return this.data},unmap(){},destroy(){}}},
  createBindGroup(){return {}},
  createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}}},
   copyBufferToBuffer(a,_offset,b){b.data=a.data.slice(0)},finish(){return {}}}},
  queue:{writeBuffer(){},submit(){}},destroy(){}};
 const deps={navigator:{gpu:{requestAdapter:async()=>({requestDevice:async()=>device})}},
  GPUBufferUsage:usage,GPUMapMode:{READ:1}};
 const legacy=await gpu.solveBatch(request(),deps);
 const corrected=await gpu.solveBatch(request(),deps,{refinement:'angle-bracket'});
 assert.equal(legacy.algorithm.refinement,'residual-stop');
 assert.equal(corrected.algorithm.refinement,'angle-bracket');
 assert.deepEqual(shaders,[gpu.WGSL_SWEEP,gpu.WGSL_REFINE,gpu.WGSL_SWEEP,gpu.WGSL_REFINE_ANGLE_BRACKET]);
 assert.equal(corrected.response.results[0].status,'solver_failed'); // mock does not simulate physics
});
test('140.12.2: gate always denies production, prioritizes analytic and parity errors',()=>{
 const row=(a,r,g,s=true)=>({status:'measured',corrected:{comparison:{angleMismatch:a,residualMismatch:r,
   sampleMatches:!a&&!r&&!g},timing:{warmOutputBitwiseStable:s,coldSpeedup:4}}});
 const anal=n=>({status:'measured',corrected:{failed:n}});
 assert.equal(refinement.decide([row(0,0,0)],anal(1)).verdict,'ANALYTIC_ROOT_STOP');
 assert.equal(refinement.decide([row(1,0,0)],anal(0)).verdict,'ANGLE_PARITY_STOP');
 assert.equal(refinement.decide([row(0,0,1)],anal(0)).verdict,'GROUND_EVENT_STOP');
 assert.equal(refinement.decide([row(0,0,0,false)],anal(0)).verdict,'BATCH_REPEAT_INSTABILITY_STOP');
 assert.equal(refinement.decide([{status:'unavailable'}],anal(0)).verdict,'INCONCLUSIVE');
 assert.equal(refinement.decide([row(0,0,0)],anal(0)).productionAuthorized,false);
});
test('140.12.2: missing WebGPU reports unavailable, not a fictitious physical improvement',async()=>{
 const result=await refinement.run(fixture,{navigator:{}});
 assert.equal(result.version,'140.12.2');
 assert.equal(result.status,'incomplete');
 assert.equal(result.decision.verdict,'INCONCLUSIVE');
 assert.equal(result.analyticVacuum.status,'unavailable');
 assert.ok(result.scenes.every(s=>s.status==='unavailable'));
 assert.equal(result.decision.productionAuthorized,false);
});
test('140.12.2: canonical selector runs the new mode without adding a numbered page',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../tools/webgpu-optics.html'),'utf8');
 assert.match(html,/CurvatureWebGPURootRefinement14122\.run/);
 assert.match(html,/curvature-webgpu-optics-140\.12\.2-refinement\.json/);
 assert.match(html,/value="6"/); // the mode survives when a newer one is selected
 const panelCount=html.match(/for\(var i=0;i<(\d+);i\+\+\)/);
 assert.ok(panelCount&&Number(panelCount[1])>=7, 'older panels must remain selectable');
 assert.deepEqual(fs.readdirSync(path.join(__dirname,'../tools')).filter(x=>/webgpu-optics.*\.html/.test(x)),['webgpu-optics.html']);
});

test('140.12.2: A/B report compares both variants to exactly the same CPU target batch',async()=>{
 const req=request(),cpu=await contract.solveCpuBatch(req);
 const make=(offset,policy)=>({response:{backend:'gpu-experimental',branch:contract.BRANCH,
  results:cpu.results.map(r=>Object.assign({},r,{angle:r.angle+offset}))},
  telemetry:[{targetIndex:0,bracketIndex:16,bracketCount:1,refineIterations:policy==='residual-stop'?8:21,
   finalBracketLowRadians:cpu.results[0].angle+offset-1e-9,
   finalBracketHighRadians:cpu.results[0].angle+offset+1e-9,
   finalBracketWidthRadians:2e-9}],
  timing:{gpuColdMs:10,gpuWarmMedianMs:9,warmOutputBitwiseStable:true},device:{}});
 const report=refinement.sceneResult(req,cpu,7,make(4e-5,'residual-stop'),make(0,'angle-bracket'));
 assert.equal(report.legacy.comparison.angleMismatch,1);
 assert.equal(report.corrected.comparison.angleMismatch,0);
 assert.equal(report.corrected.finalNonzeroBrackets,1);
 assert.equal(report.perTarget.length,1);
 assert.equal(report.perTarget[0].legacy.refineIterations,8);
 assert.equal(report.perTarget[0].gpuSearch.refineIterations,21);
 assert.ok(report.perTarget[0].angleErrorReductionRadians>0);
});
test('140.12.2: full A/B orchestration requests both shader policies for both scenes and vacuum',async()=>{
 const requests=[];
 const mock={async solveBatch(req,_deps,opts){
  requests.push({geometry:req.geometry,atmosphere:req.atmosphere,count:req.targets.length,policy:opts.refinement});
  const cpu=await contract.solveCpuBatch(req);
  return {response:{backend:'gpu-experimental',branch:contract.BRANCH,results:cpu.results},
   telemetry:req.targets.map((_t,i)=>({targetIndex:i,bracketIndex:16,bracketCount:1,
    refineIterations:20,finalBracketLowRadians:0,finalBracketHighRadians:1e-9,
    finalBracketWidthRadians:1e-9})),
   timing:{gpuColdMs:200,gpuWarmMedianMs:20,warmOutputBitwiseStable:true,
    warmRunMs:opts.warmRepeats?[20,20,20]:[]},device:{adapterInfo:null}};
 }};
 const result=await refinement.run(fixture,{}, {solver:mock});
 assert.equal(result.status,'finished');
 assert.equal(result.scenes.length,2);
 assert.deepEqual(requests.map(r=>r.policy),[
  'residual-stop','angle-bracket','residual-stop','angle-bracket','residual-stop','angle-bracket']);
 assert.deepEqual(requests.map(r=>r.count),[64,64,64,64,7,7]);
 assert.equal(result.analyticVacuum.cpu.passed,7);
 assert.equal(result.analyticVacuum.corrected.passed,7);
 assert.equal(result.decision.productionAuthorized,false);
 assert.equal(result.decision.verdict,'BATCH_PERFORMANCE_STOP');
});
