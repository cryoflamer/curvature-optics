/* #140.12.1: diagnostic ONLY. Preserves #140.12 CPU/GPU algorithm, exposes
 * per-target strict parity evidence and GPU pipeline-reuse timings.
 * Never imported by production Scene/Compare or used for GPU certification.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUBatchDiagnostics14121=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract,gpu){
  'use strict';
  if(!contract||!gpu)throw Error('#140.12.1 diagnostic dependencies missing');
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function difference(a,b){return a===null||b===null?null:Math.abs(a-b);}
  function eventSummary(r){
    if(!r.ground)return null;
    return {hitGround:r.ground.hitGround,travelled:r.ground.travelled,
      contact:r.ground.event?r.ground.event.contact:null,
      eventPathLength:r.ground.event?r.ground.event.pathLength:null};
  }
  function details(request,cpuResponse,gpuResponse,telemetry){
    contract.validateResponse(request,cpuResponse);
    contract.validateResponse(request,gpuResponse);
    if(cpuResponse.backend!=='cpu-reference'||gpuResponse.backend!=='gpu-experimental')
      throw RangeError('Detailed parity requires independent CPU and GPU responses');
    if(!Array.isArray(telemetry)||telemetry.length!==request.targets.length)
      throw RangeError('GPU telemetry must cover every target in order');
    var all=request.targets.map(function(target,i){
      var a=cpuResponse.results[i],b=gpuResponse.results[i],t=telemetry[i];
      if(!t||t.targetIndex!==i)throw RangeError('GPU telemetry target order mismatch');
      var oneRequest=Object.assign({},request,{targets:[target]});
      var oneCpu={backend:'cpu-reference',branch:contract.BRANCH,results:[a]};
      var oneGpu={backend:'gpu-experimental',branch:contract.BRANCH,results:[b]};
      // Reuse the SAME gate implementation as the top-level #140.11 comparison;
      // do not silently introduce a second definition of numerical tolerance.
      var comparison=contract.compare(oneRequest,oneCpu,oneGpu);
      var flags=[];
      for(var key of ['statusMismatch','angleMismatch','residualMismatch','groundEventMismatch','unresolved']){
        if(comparison[key]>0)flags.push(key);
      }
      var groundA=eventSummary(a),groundB=eventSummary(b);
      var eventDistanceDelta=(groundA&&groundB&&groundA.eventPathLength!==null&&
        groundB.eventPathLength!==null)?difference(groundA.eventPathLength,groundB.eventPathLength):null;
      return {targetIndex:i,target:target.slice(),flags:flags,
        cpu:{status:a.status,angle:a.angle,residual:a.residual,pathLength:a.pathLength,
          ground:groundA,reason:a.reason},
        gpu:{status:b.status,angle:b.angle,residual:b.residual,pathLength:b.pathLength,
          ground:groundB,reason:b.reason},
        differences:{angleRadians:difference(a.angle,b.angle),
          residualMetres:difference(a.residual,b.residual),
          groundEventPathMetres:eventDistanceDelta},
        gpuSearch:t};
    });
    return {targets:all,flaggedCount:all.filter(function(t){return t.flags.length>0;}).length,
      noBracketCount:all.filter(function(t){return t.gpuSearch.bracketIndex<0;}).length,
      multipleBracketCount:all.filter(function(t){return t.gpuSearch.bracketCount>1;}).length};
  }
  async function run(fixture,deps,options){
    var entries=gpu.fixtureRequests(fixture),reports=[];
    var warmRepeats=options&&options.warmRepeats!==undefined?options.warmRepeats:3;
    if(!Number.isInteger(warmRepeats)||warmRepeats<1||warmRepeats>5)
      throw RangeError('Diagnostic mode requires 1–5 warm repeats');
    for(var entry of entries){
      var started=now(),cpu=await contract.solveCpuBatch(entry.request),cpuMs=now()-started;
      try{
        var measured=await gpu.solveBatch(entry.request,deps,{warmRepeats:warmRepeats});
        var comparison=contract.compare(entry.request,cpu,measured.response);
        var trace=details(entry.request,cpu,measured.response,measured.telemetry);
        var timing=Object.assign({coldSpeedup:cpuMs/measured.timing.gpuColdMs,
          warmSpeedup:measured.timing.gpuWarmMedianMs===null?null:
            cpuMs/measured.timing.gpuWarmMedianMs},measured.timing);
        reports.push({id:entry.id,status:'measured',count:entry.request.targets.length,
          cpuMs:cpuMs,timing:timing,comparison:comparison,
          diagnosticSummary:{flaggedTargets:trace.flaggedCount,
            noBracketTargets:trace.noBracketCount,multipleBracketTargets:trace.multipleBracketCount},
          perTarget:trace.targets,device:measured.device});
      }catch(error){reports.push({id:entry.id,status:'unavailable',count:entry.request.targets.length,
        cpuMs:cpuMs,reason:String(error.message||error)});}
    }
    var decision=gpu.decision(reports);
    if(reports.some(function(r){return r.status==='measured'&&!r.timing.warmOutputBitwiseStable;})){
      decision={verdict:'BATCH_REPEAT_INSTABILITY_STOP',productionAuthorized:false,
        nextAction:'GPU repeat outputs differ; diagnose before performance qualification'};
    }
    return {version:'140.12.1',status:reports.every(function(r){return r.status==='measured';})?'finished':'incomplete',
      experiment:'Independent GPU shooting: per-target parity and reused-pipeline timing diagnostics',
      measurement:{warmRepeats:warmRepeats,pipelineReuse:true,
        cpuReference:'independent single CPU batch per scene',
        gpuTiming:'CPU wall-clock upload, dispatch, fence/readback (not isolated GPU shader time)',
        coldDefinition:'GPU device and pipeline creation + first GPU batch',
        warmDefinition:'Repeated GPU batches on the same device, pipelines and buffers (no compilation/setup)'},
      scenes:reports,decision:decision,limitations:[
        'Diagnostic instrumentation is observational; GPU shooting and CPU oracle are unchanged',
        'Warm timings are wall-clock and are not statistically controlled or end-to-end frame measurements',
        'Per-target flags reuse #140.11 tolerances; they identify discrepancies, not root causes',
        'Finite 33-angle grid and sampled contact detection do not guarantee root/contact completeness',
        'No production backend switch; failed #140.12 numerical stage remains failed']};
  }
  return Object.freeze({details:details,run:run});
}));
