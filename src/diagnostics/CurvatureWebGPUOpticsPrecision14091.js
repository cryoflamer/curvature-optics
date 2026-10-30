/* #140.9.1: one bounded diagnostic attempt for 100-km f32 position drift.
 * Run BOTH unchanged f32 baseline and optional compensated-coordinate shader.
 * Never select the production optics backend; fail closed on incomplete evidence.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUOpticsBenchmark'):root.CurvatureWebGPUOpticsBenchmark,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUOpticsMatrix1409'):root.CurvatureWebGPUOpticsMatrix1409);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUOpticsPrecision14091=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(benchmark,matrix){
  'use strict';
  if(!benchmark||!matrix)throw Error('#140.9.1 benchmark and matrix dependencies required');
  var MODES=['naive','compensated'];
  function evaluate(rows,expectedCount){
    if(!Array.isArray(rows)||!Number.isInteger(expectedCount)||expectedCount<1)
      throw Error('Invalid #140.9.1 results');
    var seen=new Set(),evaluated=[],missing=0,analyticMissing=0,analyticFailures=0;
    var baselineFailed=0,repaired=0;
    for(var i=0;i<rows.length;i++){
      var row=rows[i];
      if(!row||typeof row.id!=='string'||seen.has(row.id))throw Error('Duplicate or missing precision case');
      seen.add(row.id);
      var result=row.compensated;
      if(row.naive&&row.naive.status==='measured'&&row.naive.qualified===false){
        baselineFailed++;
        if(result&&result.status==='measured'&&result.qualified===true)repaired++;
      }
      evaluated.push({id:row.id,result:result,error:row.compensatedError});
      if(row.naiveError||row.compensatedError||!row.naive||!result||
        row.naive.status!=='measured'||result.status!=='measured')missing++;
      if(row.parameters.atmosphere==='vacuum'){
        for(var j=0;j<MODES.length;j++){
          var a=row[MODES[j]]&&row[MODES[j]].analyticVacuum;
          if(!a||!a.cpuVsAnalytic||!a.gpuVsAnalytic){analyticMissing++;continue;}
          if(!a.cpuVsAnalytic.qualified||!a.gpuVsAnalytic.qualified)analyticFailures++;
        }
      }
    }
    var gate=matrix.evaluate(evaluated,expectedCount);
    var complete=rows.length===expectedCount&&seen.size===expectedCount;
    var verdict=gate.verdict,reasons=gate.reasons.slice();
    // Require paired evidence and the independent vacuum line solution, not only
    // a compensated-shader comparison to a potentially incorrect CPU output.
    if(!complete||missing||analyticMissing){
      verdict='INCONCLUSIVE';reasons.push('Missing paired GPU/CPU or analytical vacuum evidence');
    }else if(analyticFailures){
      verdict='NUMERICAL_STOP';reasons.push(analyticFailures+' vacuum analytic comparisons failed');
    }
    var nextAction=verdict==='SPIKE_CANDIDATE'?
      'STOP isolated RK4 benchmarking; allow ONE bounded opt-in real-scene spike, never a production switch':
      verdict==='NUMERICAL_STOP'?
      'STOP this f32 GPU RK4 branch after the single attempted correction; retain CPU reference':
      verdict==='PERFORMANCE_STOP'?
      'STOP this GPU optimization branch: insufficient representative upload-to-readback speedup':
      'No GPU promotion; record the unavailable/incomplete evidence without assuming success';
    return {verdict:verdict,nextAction:nextAction,reasons:reasons,
      stats:gate.stats,baselineFailedCases:baselineFailed,repairedCases:repaired,
      missingPairs:missing,missingAnalyticalChecks:analyticMissing,
      failedAnalyticalChecks:analyticFailures,minimumRepresentativeSpeedup:gate.minimumRepresentativeSpeedup,
      representativeSpeedups:gate.representativeSpeedups,productionAuthorized:false,
      experimentsRemaining:0};
  }
  async function run(options,deps){
    var s=matrix.settings(options),plan=matrix.cases(s),rows=[];
    deps=deps||{};
    var worker=deps.runner||benchmark.run;
    var progress=typeof deps.onProgress==='function'?deps.onProgress:function(){};
    var isCancelled=typeof deps.isCancelled==='function'?deps.isCancelled:function(){return false;};
    for(var i=0;i<plan.length;i++){
      if(isCancelled())break;
      var task=plan[i],row={id:task.id,parameters:task.parameters};
      for(var j=0;j<MODES.length;j++){
        if(isCancelled())break;
        var mode=MODES[j];
        var p=Object.assign({},task.parameters,{accumulation:mode});
        progress({phase:'start',index:i*2+j+1,total:plan.length*2,id:task.id,mode:mode});
        try{row[mode]=await worker(p,deps.benchmarkDeps);}
        catch(error){row[mode+'Error']=String(error&&error.message||error);}
        progress({phase:'done',index:i*2+j+1,total:plan.length*2,id:task.id,mode:mode});
      }
      row.comparison={
        baselineMaxPositionErrorMetres:row.naive&&row.naive.validation?row.naive.validation.maxPositionErrorMetres:null,
        compensatedMaxPositionErrorMetres:row.compensated&&row.compensated.validation?row.compensated.validation.maxPositionErrorMetres:null,
        baselineCpuToGpu:row.naive&&row.naive.timing?row.naive.timing.ratioCpuToGpu:null,
        compensatedCpuToGpu:row.compensated&&row.compensated.timing?row.compensated.timing.ratioCpuToGpu:null};
      rows.push(row);
    }
    var decision=evaluate(rows,plan.length);
    return {version:'140.9.1',status:decision.verdict==='INCONCLUSIVE'?'incomplete':'finished',
      experiment:'Single Kahan compensated-position correction vs unmodified WebGPU RK4',
      settings:s,caseCount:plan.length,cases:rows,decision:decision,
      limitations:[
        'An analytic straight-line reference is available ONLY for Vacuum, not for refracting profiles',
        '100-km paths are a numerical stress test, not validated physical visibility trajectories',
        'f32 Kahan compensation may not correct stage arithmetic, direction drift or shader compiler optimizations',
        'Browser GPU shaders have not been executed or validated by the offline unit tests',
        'A finite sample, even if passing, can authorize only one opt-in integration spike, not production GPU use']};
  }
  return Object.freeze({evaluate:evaluate,run:run});
}));
