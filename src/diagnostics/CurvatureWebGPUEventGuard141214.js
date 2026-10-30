/* #140.12.14: fail-closed GPU predictor event gate, measured as an independent
 * three-way batch A/B. All CPU f64 ground replays occur AFTER GPU timings.
 * The original predictor and sweep remain available as separate baselines.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUPredictor141213'):root.CurvatureWebGPUPredictor141213,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUPhysicalTolerance14123'):root.CurvatureWebGPUPhysicalTolerance14123,
    typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?
    require('../optics/OpticalRayTracer'):root.CurvatureRayTracer);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUEventGuard141214=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(base,gpu,physical,contract,rayTracer){
  'use strict';
  if(!base||!gpu||!physical||!contract||!rayTracer)throw Error('#140.12.14 dependencies missing');
  var ALGORITHMS=['sweep','predictor','predictor-guarded'];
  function analyze(request,cpu,batch){
    contract.validateResponse(request,cpu.response);
    contract.validateResponse(request,batch.response);
    var comparison=contract.compare(request,cpu.response,batch.response,
      {angleTolerance:1e-7,residualTolerance:0.005,groundEventTolerance:0.001});
    var check=physical.physicalComparison(request,cpu.response,batch.response);
    var surface=rayTracer.resolveGeometry({geometry:request.geometry,radius:request.radius}).surface;
    var profile=rayTracer.atmosphere(request.atmosphere,request.profileOptions);
    var counts={};batch.response.results.forEach(function(r){counts[r.status]=(counts[r.status]||0)+1;});
    var isPredictor=batch.algorithm.kind!=='sweep';
    var telemetry=batch.telemetry||[];
    var accepted=isPredictor?telemetry.filter(function(t){return t.bracketIndex===-2;}).length:null;
    // Unresolved or disputed ray classification is shown in FULL, rather than
    // hiding the near-ground failures behind a first-20 sample.
    var flagged=check.targets.filter(function(p){return p.flags.length>0;});
    var mismatches=check.targets.filter(function(p){
      return p.flags.includes('statusMismatch')||p.flags.includes('unresolved');});
    var detail=mismatches.map(function(p){
      var b=batch.response.results[p.targetIndex];
      var altitude=surface.height2(p.target[0],p.target[1]);
      var replay=physical.groundReplay(request,b,profile);
      return {targetIndex:p.targetIndex,target:p.target.slice(),
        targetAltitudeMetres:altitude,nearGroundCentimetre:Math.abs(altitude)<=0.01,
        flags:p.flags.slice(),cpuStatus:p.cpu.status,gpuStatus:p.gpu.status,
        gpuContact:p.gpu.groundEvent?p.gpu.groundEvent.contact:null,
        gpuGroundToTargetGapMetres:p.gpu.groundEvent&&b.pathLength!==null?
          b.pathLength-p.gpu.groundEvent.pathLength:null,
        cpuContact:p.cpu.groundEvent?p.cpu.groundEvent.contact:null,
        f64ReplayOfGpuAngle:replay,
        gpuAngleReplayResidualMetres:p.cpuReplayOfGpuAngle.status==='measured'?
          p.cpuReplayOfGpuAngle.residualMetres:null};
    });
    var eventCases=check.targets.filter(function(p){
      return p.flags.includes('groundEventMismatch');}).map(function(p){
      return {targetIndex:p.targetIndex,target:p.target.slice(),
        targetAltitudeMetres:surface.height2(p.target[0],p.target[1]),
        cpuStatus:p.cpu.status,gpuStatus:p.gpu.status,
        cpuEvent:p.cpu.groundEvent,gpuEvent:p.gpu.groundEvent,
        eventPathDifferenceMetres:p.diagnostic.groundEventPathDifferenceMetres};
    });
    var replayCounts={clear:0,hitGround:0,unavailable:0};
    detail.forEach(function(p){
      var replay=p.f64ReplayOfGpuAngle;
      if(replay.status!=='measured')replayCounts.unavailable++;
      else if(replay.hitGround)replayCounts.hitGround++;
      else replayCounts.clear++;
    });
    return {algorithm:batch.algorithm.kind,step:request.controls.step,
      timing:batch.timing,setupMs:batch.timing.gpuSetupMs,
      warmSpeedupAgainstCpu:batch.timing.gpuWarmMedianMs>0?
        cpu.ms/batch.timing.gpuWarmMedianMs:null,
      gpuStatusCounts:counts,predictorAccepted:accepted,
      predictorFallbacks:isPredictor?request.targets.length-accepted:null,
      totalRefineIterations:telemetry.reduce(function(n,t){return n+(t.refineIterations||0);},0),
      comparison:comparison,physical:{counts:check.counts,max:check.max},
      mismatchBreakdown:{count:detail.length,
        nearGroundCentimetre:detail.filter(function(p){return p.nearGroundCentimetre;}).length,
        indeterminate:detail.filter(function(p){return p.gpuStatus==='indeterminate';}).length,
        solverFailed:detail.filter(function(p){return p.gpuStatus==='solver_failed';}).length,
        gpuAngleF64GroundReplay:replayCounts},
      statusCases:detail,groundEventCases:eventCases,flaggedCount:flagged.length,
      // Still a bounded diagnostic, not proof that all f32 events are safe.
      productionAuthorized:false};
  }
  function verdict(rows){
    if(!rows.length||rows.some(function(r){return r.status!=='measured';}))return 'INCONCLUSIVE';
    if(rows.some(function(r){var v=r.variants[2];return v.physical.counts.physicallyAdequate!==1024||v.comparison.statusMismatch>0||
      !v.timing.warmOutputBitwiseStable;}))return 'NUMERICAL_OR_EVENT_STOP';
    if(rows.every(function(r){return r.variants[2].timing.gpuWarmMedianMs<
      r.variants[0].timing.gpuWarmMedianMs;}))return 'GUARDED_BATCH_FASTER_ONLY';
    return 'NO_GUARDED_BATCH_SPEEDUP';
  }
  async function run(fixture,deps,options){
    options=options||{};
    var solver=options.solver||gpu,oracle=options.cpuOracle||base.cpuReference;
    var geometry=options.geometry||'globe';
    if(!['flat','globe'].includes(geometry))throw RangeError('Unsupported geometry');
    var repeats=options.warmRepeats===undefined?2:options.warmRepeats;
    if(!Number.isInteger(repeats)||repeats<1||repeats>3)throw RangeError('Warm repeats must be 1–3');
    var common=base.selectedRequest(fixture,geometry),rows=[];
    for(var step of [50,500]){
      var request=base.withStep(common,step),cpu=await oracle(request),variants=[];
      for(var algorithm of ALGORITHMS){
        var session=null;
        try{
          if(options.onProgress)options.onProgress(geometry,step,algorithm);
          session=await solver.createSession(1024,deps,{algorithm:algorithm});
          var batch=await session.solve(request,{warmRepeats:repeats});
          variants.push(analyze(request,cpu,batch));
        }catch(error){variants.push({status:'unavailable',algorithm:algorithm,
          reason:String(error.message||error)});}
        finally{if(session)session.close();}
      }
      var measured=variants.every(function(v){return v.status!=='unavailable';});
      var old=measured?variants[1].timing.gpuWarmMedianMs:null;
      var guarded=measured?variants[2].timing.gpuWarmMedianMs:null;
      rows.push({step:step,status:measured?'measured':'unavailable',cpuMs:cpu.ms,
        cpuShooting:cpu.shooting,variants:variants,
        guardedOverOriginalWarmSpeedup:measured&&guarded>0?old/guarded:null,
        guardedOverSweepWarmSpeedup:measured&&guarded>0?
          variants[0].timing.gpuWarmMedianMs/guarded:null,
        guardStatusMismatchReduction:measured?
          variants[1].comparison.statusMismatch-variants[2].comparison.statusMismatch:null});
    }
    return {version:'140.12.14',kind:'GPU predictor uncertain-ground guard and f64 event triage',
      geometry:geometry,atmosphere:common.atmosphere,targets:1024,
      targetSource:'identical distinct 12-tower production polygon-edge samples',
      stepsMetres:[50,500],algorithms:ALGORITHMS.slice(),warmRepeats:repeats,
      rows:rows,verdict:verdict(rows),productionAuthorized:false,fullFrameSpeedupProven:false,
      limitations:[
        'The guarded predictor only accepts visible or proven prior-crossing GPU samples; grazing/indeterminate predictions enter the unchanged GPU sweep/bracket fallback',
        'A fallback sweep may still be indeterminate; this experiment does NOT infer visibility from uncertainty',
        'CPU f64 oracle, GPU-angle f64 replays and ground-event triage are outside GPU timings',
        'GPU warm times include synchronization/readback, not kernel-only timing; first-run compilation stalls are not amortized',
        'The GPU f32 ground-event detector is not equivalent to the CPU first-contact finder; strict status and event parity remains mandatory',
        'Batch acceleration alone does NOT establish full-frame speed or visual parity; production stays CPU']};
  }
  return Object.freeze({ALGORITHMS:ALGORITHMS,analyze:analyze,verdict:verdict,run:run});
}));
