/* #140.12.2: opt-in, independent root-refinement A/B experiment ONLY.
 * Same sweep/RK4/ground kernel, different bracket termination. The prior
 * #140.12 and #140.12.1 reports remain reproducible via residual-stop.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchDiagnostics14121'):root.CurvatureWebGPUBatchDiagnostics14121);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPURootRefinement14122=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract,gpu,diagnostics){
  'use strict';
  if(!contract||!gpu||!diagnostics)throw Error('#140.12.2 dependencies missing');
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  var ANGLE_TOLERANCE=1e-7;
  function analyticRequest(){
    return {branch:contract.BRANCH,geometry:'flat',radius:6371000,
      observerHeight:15,atmosphere:'vacuum',
      controls:{step:50,targetTolerance:0.005,eventSubsteps:8},
      targets:[[56,20.47],[60,3.151],[350,18.86],[650,7.13],
        [1250,23],[3000,21.39],[5000,12.5]]};
  }
  function analyticResults(request,response){
    contract.validateResponse(request,response);
    var targets=request.targets.map(function(target,i){
      var expected=Math.atan2(target[1]-request.observerHeight,target[0]);
      var actual=response.results[i],error=actual.angle===null?null:Math.abs(actual.angle-expected);
      var passed=actual.status==='visible'&&actual.ground&&!actual.ground.hitGround&&
        error!==null&&error<=ANGLE_TOLERANCE;
      return {targetIndex:i,target:target.slice(),expectedAngleRadians:expected,
        actualAngleRadians:actual.angle,absoluteAngleErrorRadians:error,
        status:actual.status,unexpectedGround:!!(actual.ground&&actual.ground.hitGround),passed:passed};
    });
    var known=targets.map(function(t){return t.absoluteAngleErrorRadians;}).filter(function(t){return t!==null;});
    return {angleToleranceRadians:ANGLE_TOLERANCE,
      passed:targets.filter(function(t){return t.passed;}).length,
      failed:targets.filter(function(t){return !t.passed;}).length,
      maxAngularErrorRadians:known.length?Math.max.apply(null,known):null,
      targets:targets};
  }
  function sceneResult(request,cpu,cpuMs,legacy,strict){
    var old=contract.compare(request,cpu,legacy.response),newCmp=contract.compare(request,cpu,strict.response);
    var oldDetails=diagnostics.details(request,cpu,legacy.response,legacy.telemetry);
    var newDetails=diagnostics.details(request,cpu,strict.response,strict.telemetry);
    var perTarget=newDetails.targets.map(function(t,i){
      var previous=oldDetails.targets[i];
      return Object.assign({},t,{legacy:{status:previous.gpu.status,
        angle:previous.gpu.angle,residual:previous.gpu.residual,
        flags:previous.flags,refineIterations:previous.gpuSearch.refineIterations,
        finalBracketWidthRadians:previous.gpuSearch.finalBracketWidthRadians},
        angleErrorReductionRadians:previous.differences.angleRadians===null||
          t.differences.angleRadians===null?null:
          previous.differences.angleRadians-t.differences.angleRadians});
    });
    function times(measured){return Object.assign({
      coldSpeedup:cpuMs/measured.timing.gpuColdMs,
      warmSpeedup:cpuMs/measured.timing.gpuWarmMedianMs},measured.timing);}
    return {count:request.targets.length,cpuMs:cpuMs,
      legacy:{refinement:'residual-stop',comparison:old,timing:times(legacy),
        flaggedTargets:oldDetails.flaggedCount},
      corrected:{refinement:'angle-bracket',comparison:newCmp,timing:times(strict),
        flaggedTargets:newDetails.flaggedCount,
        finalNonzeroBrackets:newDetails.targets.filter(function(t){return t.gpuSearch.finalBracketWidthRadians>0;}).length,
        f32MidpointStalls:newDetails.targets.filter(function(t){
          var g=t.gpuSearch;
          if(g.finalBracketLowRadians===null||g.finalBracketWidthRadians<=2e-8)return false;
          var midpoint=Math.fround(g.finalBracketLowRadians+g.finalBracketWidthRadians*0.5);
          return midpoint===g.finalBracketLowRadians||midpoint===g.finalBracketHighRadians;
        }).length},perTarget:perTarget,device:strict.device};
  }
  function decide(scenes,analytic){
    if(!analytic||analytic.status!=='measured'||scenes.some(function(s){return s.status!=='measured';}))
      return {verdict:'INCONCLUSIVE',productionAuthorized:false,nextAction:'GPU measurement unavailable; retain CPU'};
    if(analytic.cpu&&analytic.cpu.failed)
      return {verdict:'ANALYTIC_CPU_REFERENCE_STOP',productionAuthorized:false,
        nextAction:'CPU baseline failed the analytic geometry oracle; investigate reference first'};
    if(analytic.corrected.failed)
      return {verdict:'ANALYTIC_ROOT_STOP',productionAuthorized:false,
        nextAction:'Corrected GPU root solve failed analytic vacuum rays; retain CPU'};
    if(scenes.some(function(s){return !s.corrected.timing.warmOutputBitwiseStable;}))
      return {verdict:'BATCH_REPEAT_INSTABILITY_STOP',productionAuthorized:false,
        nextAction:'Corrected GPU repeats were not bitwise stable; retain CPU'};
    if(scenes.some(function(s){return s.corrected.comparison.angleMismatch||s.corrected.comparison.residualMismatch;}))
      return {verdict:'ANGLE_PARITY_STOP',productionAuthorized:false,
        nextAction:'Angle/residual parity still fails; investigate f32 integration; retain CPU'};
    if(scenes.some(function(s){return !s.corrected.comparison.sampleMatches;}))
      return {verdict:'GROUND_EVENT_STOP',productionAuthorized:false,
        nextAction:'Angle/root parity passed but status or ground-event parity failed; retain CPU'};
    if(scenes.some(function(s){return s.corrected.timing.coldSpeedup<2;}))
      return {verdict:'BATCH_PERFORMANCE_STOP',productionAuthorized:false,
        nextAction:'Numerical parity passed, but 2x cold stage speedup was not met; retain CPU'};
    return {verdict:'BATCH_STAGE_PASS_ONLY',productionAuthorized:false,
      nextAction:'Stage qualified only; full async scene and frame require separate validation'};
  }
  async function run(fixture,deps,options){
    options=options||{};
    var solver=options.solver||gpu,warmRepeats=options.warmRepeats===undefined?3:options.warmRepeats;
    if(!Number.isInteger(warmRepeats)||warmRepeats<1||warmRepeats>5)
      throw RangeError('Diagnostic requires 1–5 warm repeats');
    var sceneRequests=gpu.fixtureRequests(fixture),scenes=[];
    for(var entry of sceneRequests){
      var started=now(),cpu=await contract.solveCpuBatch(entry.request),cpuMs=now()-started;
      try{
        var legacy=await solver.solveBatch(entry.request,deps,{warmRepeats:warmRepeats,refinement:'residual-stop'});
        var strict=await solver.solveBatch(entry.request,deps,{warmRepeats:warmRepeats,refinement:'angle-bracket'});
        scenes.push(Object.assign({id:entry.id,status:'measured'},
          sceneResult(entry.request,cpu,cpuMs,legacy,strict)));
      }catch(error){scenes.push({id:entry.id,status:'unavailable',count:entry.request.targets.length,
        cpuMs:cpuMs,reason:String(error.message||error)});}
    }
    var request=analyticRequest(),analytic;
    try{
      var cpuAnalytic=await contract.solveCpuBatch(request);
      var legacyAnalytic=await solver.solveBatch(request,deps,{refinement:'residual-stop'});
      var strictAnalytic=await solver.solveBatch(request,deps,{refinement:'angle-bracket'});
      analytic={status:'measured',cpu:analyticResults(request,cpuAnalytic),
        legacy:analyticResults(request,legacyAnalytic.response),
        corrected:analyticResults(request,strictAnalytic.response),
        cpuGpuLegacy:contract.compare(request,cpuAnalytic,legacyAnalytic.response),
        cpuGpuCorrected:contract.compare(request,cpuAnalytic,strictAnalytic.response)};
    }catch(error){analytic={status:'unavailable',reason:String(error.message||error)};}
    var decision=decide(scenes,analytic);
    return {version:'140.12.2',status:scenes.every(function(s){return s.status==='measured';})&&
      analytic.status==='measured'?'finished':'incomplete',
      experiment:'GPU shooting refinement: 5 mm residual stop vs f32 angle-bracket resolution',
      measurement:{warmRepeats:warmRepeats,legacyAndCorrectedSeparateDeviceSessions:true,
        cpuReference:'one independent CPU batch per scene',
        warmTiming:'upload + dispatch + fence/readback CPU wall-clock; same pipelines/buffers within each variant'},
      scenes:scenes,analyticVacuum:analytic,decision:decision,limitations:[
        'Baseline and corrected GPU runs use separate device sessions; cold/warm timings are exploratory',
        'Angle-bracket convergence does NOT prove physical correctness with f32 ray integration',
        'Sweep angle density, contact sampling and surface event classification were NOT changed',
        'Seven analytic vacuum rays have no terrain crossings; they do not certify atmospheric or grazing cases',
        'CPU oracle remains independent; no production backend or renderer changes']};
  }
  return Object.freeze({analyticRequest:analyticRequest,analyticResults:analyticResults,
    sceneResult:sceneResult,decide:decide,run:run});
}));
