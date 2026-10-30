/* #140.12.13: paired predictor/sweep experiment at RK4 steps 50/500 m.
 * Identical, distinct production polygon-edge targets per geometry. Timed GPU
 * execution never calls CPU; f64 predictor oracle runs separately. No frame
 * rendering or production integration is modified by this module.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUPhysicalTolerance14123'):root.CurvatureWebGPUPhysicalTolerance14123,
    typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?
    require('../optics/OpticalTargetProjection'):root.CurvatureTargetProjection);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUPredictor141213=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(gpu,physical,contract,projection){
  'use strict';
  if(!gpu||!physical||!contract||!projection)throw Error('#140.12.13 dependencies missing');
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function selectedRequest(fixture,geometry){
    var entry=gpu.fixtureRequests(fixture).find(function(e){return e.request.geometry===geometry;});
    if(!entry)throw RangeError('Missing '+geometry+' scene fixture');
    var scene=fixture.scenes.find(function(s){return s.id===entry.id;});
    var req=physical.denseRequest(scene,entry.request,1024);
    // Preserve real unique scene edge samples, not replicated throughput rays.
    if(new Set(req.targets.map(function(t){return t.join('/');})).size!==1024)
      throw RangeError('The experiment requires 1024 distinct production edge targets');
    return req;
  }
  function withStep(request,step){
    if(![50,500].includes(step))throw RangeError('Unsupported research step');
    return Object.assign({},request,{controls:Object.assign({},request.controls,{step:step})});
  }
  async function cpuReference(request){
    var start=now(),opt=projection.preparedOptions(Object.assign({geometry:request.geometry,
      radius:request.radius,observerHeight:request.observerHeight,
      atmosphere:request.atmosphere,profileOptions:request.profileOptions,
      shootingPredictor:true},request.controls));
    var evaluations=0,rk4=0,predictorAccepted=0;
    var results=request.targets.map(function(target){
      var r=projection.solve(Object.assign({},opt,{target:target}));
      evaluations+=r.evaluations||0;rk4+=r.shootRK4Calls||0;
      predictorAccepted+=r.predictorAccepted||0;
      return {target:target.slice(),status:r.status,angle:r.angle,
        residual:r.residual,pathLength:r.pathLength===undefined?null:r.pathLength,
        ground:r.ray?{hitGround:r.ray.hitGround,travelled:r.ray.travelled,
          event:r.ray.event?{kind:r.ray.event.kind,contact:r.ray.event.contact,
            pathLength:r.ray.event.pathLength}:null}:null,
        reason:r.reason||null};
    });
    var response=contract.validateResponse(request,{backend:'cpu-reference',branch:contract.BRANCH,
      results:results});
    return {response:response,ms:now()-start,
      shooting:{evaluations:evaluations,rk4Calls:rk4,predictorAccepted:predictorAccepted}};
  }
  function summarize(request,cpu,batch){
    contract.validateResponse(request,cpu.response);
    contract.validateResponse(request,batch.response);
    var comparison=contract.compare(request,cpu.response,batch.response,
      {angleTolerance:1e-7,residualTolerance:0.005,groundEventTolerance:0.001});
    var statusCounts={};batch.response.results.forEach(function(r){
      statusCounts[r.status]=(statusCounts[r.status]||0)+1;});
    var predictor=batch.algorithm.kind==='predictor';
    var telemetry=batch.telemetry||[];
    var accepted=predictor?telemetry.filter(function(t){return t.bracketIndex===-2;}).length:null;
    var refinements=telemetry.reduce(function(a,t){return a+(t.refineIterations||0);},0);
    var physicalCheck=physical.physicalComparison(request,cpu.response,batch.response);
    return {algorithm:batch.algorithm.kind,step:request.controls.step,
      timing:batch.timing,setupMs:batch.timing.gpuSetupMs,
      warmSpeedupAgainstCpu:batch.timing.gpuWarmMedianMs>0?
        cpu.ms/batch.timing.gpuWarmMedianMs:null,
      gpuStatusCounts:statusCounts,predictorAccepted:accepted,
      predictorFallbacks:predictor?request.targets.length-accepted:null,
      totalRefineIterations:refinements,
      comparison:comparison,physical:{counts:physicalCheck.counts,max:physicalCheck.max,
        flagsExample:physicalCheck.targets.filter(function(x){return x.flags.length;}).slice(0,20)
          .map(function(x){return {targetIndex:x.targetIndex,flags:x.flags,
            target:x.target,gpuStatus:x.gpu.status,cpuStatus:x.cpu.status};})}};
  }
  function verdict(rows){
    if(!rows.length||rows.some(function(x){return x.status!=='measured';}))return 'INCONCLUSIVE';
    if(rows.some(function(x){return x.variants.some(function(v){
      return v.physical.counts.physicallyAdequate!==1024 ||
        v.comparison.statusMismatch>0 || !v.timing.warmOutputBitwiseStable;
    });}))return 'NUMERICAL_OR_EVENT_STOP';
    if(rows.every(function(x){return x.variants[1].timing.gpuWarmMedianMs<
      x.variants[0].timing.gpuWarmMedianMs;}))return 'GPU_PREDICTOR_BATCH_FASTER_ONLY';
    return 'NO_CONSISTENT_GPU_PREDICTOR_SPEEDUP';
  }
  async function run(fixture,deps,options){
    options=options||{};
    var solver=options.solver||gpu,oracle=options.cpuOracle||cpuReference;
    var geometry=options.geometry||'globe';
    if(!['flat','globe'].includes(geometry))throw RangeError('Unsupported geometry');
    var warmRepeats=options.warmRepeats===undefined?2:options.warmRepeats;
    if(!Number.isInteger(warmRepeats)||warmRepeats<1||warmRepeats>3)
      throw RangeError('Warm repeats must be 1–3');
    var common=selectedRequest(fixture,geometry),rows=[];
    for(var step of [50,500]){
      var request=withStep(common,step);
      var cpu=await oracle(request);
      var variants=[];
      for(var algorithm of ['sweep','predictor']){
        var session=null;
        try{
          if(options.onProgress)options.onProgress(geometry,step,algorithm);
          session=await solver.createSession(1024,deps,{algorithm:algorithm});
          var batch=await session.solve(request,{warmRepeats:warmRepeats});
          variants.push(summarize(request,cpu,batch));
        }catch(error){variants.push({status:'unavailable',algorithm:algorithm,
          reason:String(error.message||error)});}
        finally{if(session)session.close();}
      }
      var measured=variants.every(function(v){return v.status!=='unavailable';});
      var sweepWarm=measured?variants[0].timing.gpuWarmMedianMs:null;
      var predictorWarm=measured?variants[1].timing.gpuWarmMedianMs:null;
      rows.push({step:step,status:measured?'measured':'unavailable',
        cpuMs:cpu.ms,cpuShooting:cpu.shooting,variants:variants,
        predictorOverSweepWarmSpeedup:measured&&predictorWarm>0?sweepWarm/predictorWarm:null,
        predictorBeatsSweepWarm:measured&&predictorWarm>0?predictorWarm<sweepWarm:null});
    }
    return {version:'140.12.13',kind:'Independent GPU predictor fast-path and step-size A/B',
      geometry:geometry,atmosphere:common.atmosphere,
      targets:1024,targetSource:'distinct 12-tower production polygon-edge samples',
      stepsMetres:[50,500],warmRepeats:warmRepeats,rows:rows,
      verdict:verdict(rows),productionAuthorized:false,fullFrameSpeedupProven:false,
      limitations:[
        'CPU f64 uses predictor and is measured outside GPU timings; no CPU oracle runs inside GPU batches',
        'Warm GPU times include transfer, synchronization and readback; they are not kernel-only timestamps',
        'Predictor accepts only re-integrated targets and sampled ground evidence; failed predictions use the original sweep/bracket solver',
        'f32 ground-contact sampling is not equivalent to the CPU contact finder; numerical and status checks are mandatory',
        'This measures independent batches, NOT an actual CPU/GPU full-frame speedup or visual equivalence',
        'No production backend authorization']};
  }
  return Object.freeze({selectedRequest:selectedRequest,withStep:withStep,
    cpuReference:cpuReference,summarize:summarize,verdict:verdict,run:run});
}));
