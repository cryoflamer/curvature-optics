/* #140.12.3: application-level 5 mm shooting qualification, research ONLY.
 * A CPU-vs-GPU angle difference is NOT a failure when each connecting ray
 * meets the physical target tolerance. Independently replay the GPU angle in
 * the f64 CPU integrator (outside GPU timings) to catch GPU self-consistency
 * that disagrees with the reference optical model. Ground events and status
 * still have to agree. This does not authorize a production backend switch.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412,
    typeof module==='object'&&module.exports?
    require('../optics/OpticalRayTracer'):root.CurvatureRayTracer);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUPhysicalTolerance14123=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract,gpu,rayTracer){
  'use strict';
  if(!contract||!gpu||!rayTracer)throw Error('#140.12.3 dependencies missing');
  var GROUND_EVENT_TOLERANCE=0.001;
  var MIN_TOLERANCE=1e-6;
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function tolerance(request){
    var t=request.controls&&request.controls.targetTolerance!==undefined?
      request.controls.targetTolerance:MIN_TOLERANCE;
    if(!Number.isFinite(t)||t<=0||t>0.1)throw RangeError('Invalid physical target tolerance');
    return t;
  }
  // Replays ONLY the GPU launch angle with the CPU ray model. It does not
  // search for another angle or certify an event; event checks are separate.
  // The GPU path length supplies a near-target starting point, followed by
  // safeguarded f64 endpoint correction to the target x coordinate.
  function cpuReplay(request,entry,prepared){
    if(entry.status==='solver_failed'||entry.angle===null||entry.pathLength===null)
      return {status:'unavailable',reason:'GPU did not provide a solved ray'};
    var step=request.controls&&request.controls.step!==undefined?request.controls.step:50;
    try{
      var traced=rayTracer.trace({geometry:request.geometry,radius:request.radius,
        profile:prepared.profile,observerHeight:request.observerHeight,angle:entry.angle,
        length:entry.pathLength,step:step,stopAtGround:false});
      var s=[traced.x,traced.z,Math.cos(traced.angle),Math.sin(traced.angle)];
      var correction=0;
      var advance=prepared.advance;
      for(var i=0;i<4;i++){
        var dx=entry.target[0]-s[0];
        if(Math.abs(dx)<=Math.max(1e-9,entry.target[0]*1e-13))break;
        if(s[2]<=0.0001)throw Error('No forward-x CPU replay');
        var ds=dx/s[2];
        if(Math.abs(ds)>step*2)throw Error('CPU/GPU path-length divergence exceeds local correction bound');
        s=advance(s,ds);correction+=ds;
      }
      var xError=Math.abs(s[0]-entry.target[0]);
      if(xError>Math.max(1e-8,entry.target[0]*1e-12))
        throw Error('CPU replay did not converge to target x');
      var residual=s[1]-entry.target[1];
      if(!Number.isFinite(residual))throw Error('Nonfinite CPU replay residual');
      return {status:'measured',residualMetres:residual,
        absoluteResidualMetres:Math.abs(residual),
        targetXErrorMetres:xError,endpointCorrectionMetres:correction};
    }catch(error){return {status:'unavailable',reason:String(error.message||error)};}
  }
  function physicalComparison(request,cpu,gpuResponse){
    gpu.checked(request);
    contract.validateResponse(request,cpu);contract.validateResponse(request,gpuResponse);
    if(cpu.backend!=='cpu-reference'||gpuResponse.backend!=='gpu-experimental')
      throw RangeError('Independent CPU reference and GPU response required');
    var t=tolerance(request),strict=contract.compare(request,cpu,gpuResponse);
    var prepared={profile:rayTracer.atmosphere(request.atmosphere,request.profileOptions)};
    prepared.advance=rayTracer.prepareStepper({geometry:request.geometry,radius:request.radius,
      profile:prepared.profile},true);
    var counts={cpuResidualExceeded:0,gpuResidualExceeded:0,
      gpuReplayResidualExceeded:0,gpuReplayUnavailable:0,statusMismatch:0,
      groundEventMismatch:0,unresolved:0,physicallyAdequate:0};
    var max={cpuAbsoluteResidualMetres:0,gpuAbsoluteResidualMetres:0,
      gpuReplayAbsoluteResidualMetres:0,angleDifferenceRadians:0};
    var targets=request.targets.map(function(target,i){
      var a=cpu.results[i],b=gpuResponse.results[i],flags=[];
      var cpuResidual=a.residual===null?null:Math.abs(a.residual);
      var gpuResidual=b.residual===null?null:Math.abs(b.residual);
      var angleDifference=a.angle===null||b.angle===null?null:Math.abs(a.angle-b.angle);
      if(cpuResidual!==null)max.cpuAbsoluteResidualMetres=Math.max(max.cpuAbsoluteResidualMetres,cpuResidual);
      if(gpuResidual!==null)max.gpuAbsoluteResidualMetres=Math.max(max.gpuAbsoluteResidualMetres,gpuResidual);
      if(angleDifference!==null)max.angleDifferenceRadians=Math.max(max.angleDifferenceRadians,angleDifference);
      var replay=cpuReplay(request,b,prepared);
      if(replay.status==='measured')max.gpuReplayAbsoluteResidualMetres=
        Math.max(max.gpuReplayAbsoluteResidualMetres,replay.absoluteResidualMetres);
      if(a.status==='solver_failed'||b.status==='solver_failed'||
          a.status==='indeterminate'||b.status==='indeterminate')flags.push('unresolved');
      if(cpuResidual!==null&&cpuResidual>t)flags.push('cpuResidualExceeded');
      if(gpuResidual!==null&&gpuResidual>t)flags.push('gpuResidualExceeded');
      if(replay.status!=='measured')flags.push('gpuReplayUnavailable');
      else if(replay.absoluteResidualMetres>t)flags.push('gpuReplayResidualExceeded');
      if(a.status!==b.status)flags.push('statusMismatch');
      var eventA=a.ground&&a.ground.event,eventB=b.ground&&b.ground.event;
      var eventGap=eventA&&eventB?Math.abs(eventA.pathLength-eventB.pathLength):null;
      if(!a.ground||!b.ground||a.ground.hitGround!==b.ground.hitGround||
          !!eventA!==!!eventB||(eventA&&eventB&&
          (eventA.contact!==eventB.contact||eventGap>GROUND_EVENT_TOLERANCE)))
        flags.push('groundEventMismatch');
      flags.forEach(function(flag){counts[flag]++;});
      if(flags.length===0)counts.physicallyAdequate++;
      return {targetIndex:i,target:target.slice(),flags:flags,
        cpu:{status:a.status,residualMetres:a.residual,hitGround:a.ground&&a.ground.hitGround,
          groundEvent:eventA||null},
        gpu:{status:b.status,residualMetres:b.residual,hitGround:b.ground&&b.ground.hitGround,
          groundEvent:eventB||null},
        cpuReplayOfGpuAngle:replay,
        diagnostic:{angleDifferenceRadians:angleDifference,
          cpuGpuResidualDifferenceMetres:a.residual===null||b.residual===null?null:Math.abs(a.residual-b.residual),
          groundEventPathDifferenceMetres:eventGap}};
    });
    return {targetToleranceMetres:t,groundEventToleranceMetres:GROUND_EVENT_TOLERANCE,
      counts:counts,max:max,physicallyAdequate:counts.physicallyAdequate===targets.length,
      strictParityDiagnostic:strict,targets:targets};
  }
  function decide(scenes){
    var base={productionAuthorized:false,thresholdColdSpeedup:2};
    function stop(verdict,nextAction){return Object.assign({},base,{verdict:verdict,nextAction:nextAction});}
    if(!scenes||scenes.length===0||scenes.some(function(s){return s.status!=='measured';}))
      return stop('INCONCLUSIVE','GPU/CPU execution unavailable; retain CPU');
    if(scenes.some(function(s){return s.physical.counts.cpuResidualExceeded>0}))
      return stop('CPU_REFERENCE_STOP','CPU reference does not meet requested target tolerance');
    if(scenes.some(function(s){return s.physical.counts.gpuResidualExceeded>0}))
      return stop('GPU_ARRIVAL_STOP','GPU target residual exceeds requested 5 mm tolerance; retain CPU');
    if(scenes.some(function(s){return s.physical.counts.gpuReplayUnavailable>0||
        s.physical.counts.gpuReplayResidualExceeded>0}))
      return stop('GPU_REPLAY_STOP','Independent CPU trace of GPU angle failed target tolerance; retain CPU');
    if(scenes.some(function(s){return s.physical.counts.unresolved>0||
        s.physical.counts.statusMismatch>0||s.physical.counts.groundEventMismatch>0}))
      return stop('GROUND_STATUS_STOP','Ground/visibility evidence disagrees or is unresolved; retain CPU');
    if(scenes.some(function(s){return !s.physical.physicallyAdequate}))
      return stop('PHYSICAL_QUALIFICATION_STOP','Physical accuracy gate failed; retain CPU');
    if(scenes.some(function(s){return !s.timing.warmOutputBitwiseStable}))
      return stop('BATCH_REPEAT_INSTABILITY_STOP','GPU repeat outputs differ; retain CPU');
    if(scenes.some(function(s){return s.timing.coldSpeedup<2}))
      return stop('BATCH_PERFORMANCE_STOP','Physical stage passed but 2x cold GPU speedup not reached; retain CPU');
    return stop('BATCH_STAGE_PASS_ONLY','Stage-only qualification; async scene and full-frame integration still unqualified');
  }
  async function run(fixture,deps,options){
    options=options||{};
    var entries=gpu.fixtureRequests(fixture),reports=[];
    var solver=options.solver||gpu;
    var repeats=options.warmRepeats===undefined?3:options.warmRepeats;
    if(!Number.isInteger(repeats)||repeats<1||repeats>5)
      throw RangeError('Physical diagnostic requires 1–5 warm repeats');
    for(var entry of entries){
      var began=now(),cpu=await contract.solveCpuBatch(entry.request),cpuMs=now()-began;
      try{
        // The original 5 mm residual-stop policy is the intended workload.
        // No hidden CPU shooting/certification occurs in the GPU timed batch.
        var measured=await solver.solveBatch(entry.request,deps,
          {refinement:'residual-stop',warmRepeats:repeats});
        var verifyStarted=now(),physical=physicalComparison(entry.request,cpu,measured.response);
        var verifyMs=now()-verifyStarted;
        var timing=Object.assign({coldSpeedup:cpuMs/measured.timing.gpuColdMs,
          warmSpeedup:cpuMs/measured.timing.gpuWarmMedianMs},measured.timing);
        reports.push({id:entry.id,status:'measured',count:entry.request.targets.length,
          cpuMs:cpuMs,cpuReplayVerificationMs:verifyMs,timing:timing,
          physical:physical,device:measured.device});
      }catch(error){reports.push({id:entry.id,status:'unavailable',count:entry.request.targets.length,
        cpuMs:cpuMs,reason:String(error.message||error)});}
    }
    return {version:'140.12.3',status:reports.every(function(s){return s.status==='measured';})?
      'finished':'incomplete',
      experiment:'5 mm target tolerance and independent CPU replay of GPU angles; ground/status qualification',
      measurement:{gpuPolicy:'residual-stop',warmRepeats:repeats,
        cpuReference:'separate complete CPU shooting batch',
        gpuTiming:'upload + dispatch + fence/readback CPU wall-clock; GPU pipelines reused in warm runs',
        cpuReplay:'outside timed GPU batch; forward-x CPU RK4 at GPU angle; no shooting search',
        targetCriterion:'each CPU/GPU residual and CPU replay residual <= requested targetTolerance',
        angleCriterion:'diagnostic only, NOT a rejection gate',
        groundCriterion:'status and first-ground event/contact agree; event path <= 1 mm difference'},
      scenes:reports,decision:decide(reports),limitations:[
        '5 mm describes target-height accuracy, not a blanket tolerance on ground contact or apparent angle',
        'CPU replay verifies GPU angle against independent f64 ray model, but is diagnostic only and not in GPU timings',
        'CPU ground-level endpoints use a tighter internal solve tolerance and protective endpoint classification',
        'The GPU 33-angle sweep does not prove all roots or tangential contacts were found',
        'The preserved 2x cold GPU stage speed gate excludes full adaptive scene/frame costs',
        'No GPU backend or rendering switch; production authorization always false']};
  }
  return Object.freeze({tolerance:tolerance,cpuReplay:cpuReplay,
    physicalComparison:physicalComparison,decide:decide,run:run});
}));
