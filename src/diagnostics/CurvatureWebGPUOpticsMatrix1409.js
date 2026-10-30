/* #140.9: finite CPU/WebGPU RK4 qualification matrix and explicit stop gate.
 * Standalone diagnostics only. Never selects a production optics backend.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUOpticsBenchmark'):root.CurvatureWebGPUOpticsBenchmark);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUOpticsMatrix1409=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(benchmark){
  'use strict';
  if(!benchmark)throw Error('CurvatureWebGPUOpticsBenchmark dependency required');
  var ATMOSPHERES=['vacuum','standard','exponential-occlusion','inverse-spherical'];
  var GEOMETRIES=['flat','globe'];
  // Heuristic for authorizing ONE limited integration spike, not a physical proof.
  var MIN_REPRESENTATIVE_SPEEDUP=3;
  var REQUIRED_SPEED_CASES=['standard.flat.normal','standard.flat.long'];

  function settings(options){
    options=options||{};
    var p={repeats:options.repeats===undefined?5:options.repeats,
      maxPositionError:options.maxPositionError===undefined?0.1:options.maxPositionError,
      maxAngularError:options.maxAngularError===undefined?1e-5:options.maxAngularError};
    // Reuse exactly the original benchmark's finite-budget validation.
    benchmark.check(Object.assign({count:1024,steps:256,step:50},p));
    return p;
  }
  function cases(options){
    var s=settings(options),out=[];
    function add(id,atmosphere,geometry,count,steps){
      var parameters=Object.assign({count:count,steps:steps,step:50,
        atmosphere:atmosphere,geometry:geometry},s);
      benchmark.check(parameters);
      out.push({id:id,parameters:parameters});
    }
    for(var i=0;i<ATMOSPHERES.length;i++){
      for(var j=0;j<GEOMETRIES.length;j++){
        var a=ATMOSPHERES[i],g=GEOMETRIES[j];
        add(a+'.'+g+'.normal',a,g,1024,256);   // 12.8 km
        add(a+'.'+g+'.long',a,g,256,2000);     // 100 km
      }
    }
    // One small and one larger package; separate from the representative gate.
    add('standard.flat.small','standard','flat',128,256);
    add('standard.flat.large','standard','flat',4096,256);
    return out;
  }
  function evaluate(rows,expectedCount){
    if(!Array.isArray(rows)||!Number.isInteger(expectedCount)||expectedCount<1)
      throw Error('Invalid #140.9 matrix results');
    var passed=0,failed=0,unavailable=0,errors=0,seen=new Set(),rates={};
    for(var i=0;i<rows.length;i++){
      var row=rows[i];
      if(!row||typeof row.id!=='string'||seen.has(row.id))throw Error('Duplicate or missing matrix case id');
      seen.add(row.id);
      var result=row.result;
      if(row.error){errors++;continue;}
      if(!result||result.status==='unavailable'){unavailable++;continue;}
      if(result.status!=='measured'||!result.validation||result.qualified!==true||
         result.validation.qualified!==true||result.validation.failedRays!==0 ||
         result.validation.nonFiniteRays!==0){failed++;continue;}
      passed++;
      var rate=result.timing&&result.timing.ratioCpuToGpu;
      if(typeof rate==='number'&&Number.isFinite(rate)&&rate>0)rates[row.id]=rate;
    }
    var complete=rows.length===expectedCount&&seen.size===expectedCount;
    var stats={total:expectedCount,completed:rows.length,passed:passed,failed:failed,
      unavailable:unavailable,errors:errors,complete:complete};
    var reasons=[],verdict,nextAction;
    if(!complete||errors||unavailable){
      verdict='INCONCLUSIVE';nextAction='Repeat only missing/unavailable/errored cases; no GPU promotion';
      reasons.push('An incomplete or unavailable matrix cannot authorize GPU integration');
    }else if(failed){
      verdict='NUMERICAL_STOP';nextAction='Stop GPU promotion; investigate the first reproducible numerical failure only';
      reasons.push(failed+' of '+expectedCount+' cases failed the declared numerical tolerances');
    }else{
      var slow=REQUIRED_SPEED_CASES.filter(function(id){
        return !Number.isFinite(rates[id])||rates[id]<MIN_REPRESENTATIVE_SPEEDUP;
      });
      if(slow.length){
        verdict='PERFORMANCE_STOP';nextAction='Stop GPU integration work unless a real workload changes the cost model';
        reasons.push('Representative wall-clock batch speedup is below '+MIN_REPRESENTATIVE_SPEEDUP+
          'x or missing: '+slow.join(', '));
      }else{
        verdict='SPIKE_CANDIDATE';
        nextAction='Stop isolated microbenchmarks; authorize one bounded end-to-end scene integration spike';
        reasons.push('Finite-sample numerical gates passed and both representative batches reached '+
          MIN_REPRESENTATIVE_SPEEDUP+'x (upload through readback)');
      }
    }
    return {stats:stats,verdict:verdict,nextAction:nextAction,reasons:reasons,
      representativeSpeedups:REQUIRED_SPEED_CASES.map(function(id){return {id:id,ratio:rates[id]||null};}),
      minimumRepresentativeSpeedup:MIN_REPRESENTATIVE_SPEEDUP,
      productionAuthorized:false};
  }
  async function run(options,deps){
    var s=settings(options),plan=cases(s),rows=[];
    deps=deps||{};
    var worker=deps.runner||benchmark.run;
    var progress=typeof deps.onProgress==='function'?deps.onProgress:function(){};
    var isCancelled=typeof deps.isCancelled==='function'?deps.isCancelled:function(){return false;};
    for(var i=0;i<plan.length;i++){
      if(isCancelled())break;
      var item=plan[i];
      progress({phase:'start',index:i+1,total:plan.length,id:item.id});
      var row={id:item.id,parameters:item.parameters};
      try{
        row.result=await worker(item.parameters,deps.benchmarkDeps);
      }catch(error){row.error=String(error&&error.message||error);}
      rows.push(row);
      progress({phase:'done',index:i+1,total:plan.length,id:item.id,row:row});
    }
    var gate=evaluate(rows,plan.length);
    return {version:'140.9',status:gate.stats.complete?'finished':'incomplete',
      settings:s,caseCount:plan.length,cases:rows,decision:gate,
      limitations:[
        'Fixed-step independent rays only: no shooting, branch completeness, ground events or occlusion',
        'CPU f64 against WebGPU f32 with f32 initial seeds; finite samples do not certify physical visibility',
        'Each case creates its own WebGPU device and pipeline; ratios exclude that setup but include upload and full readback',
        'GPU timings are browser wall-clock, not device execution timestamps; hardware acceleration is unverified',
        'Matrix covers near-horizon launch angles only; no general-purpose ray/scene equivalence is asserted',
        'All decision thresholds are predeclared engineering heuristics, not proof or production authorization']};
  }
  return Object.freeze({settings:settings,cases:cases,evaluate:evaluate,run:run,
    REQUIRED_SPEED_CASES:REQUIRED_SPEED_CASES.slice(),MIN_REPRESENTATIVE_SPEEDUP:MIN_REPRESENTATIVE_SPEEDUP});
}));
