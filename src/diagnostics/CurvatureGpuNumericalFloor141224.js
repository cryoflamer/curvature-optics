/* #140.12.24: independent f32 root-refinement floor audit; never changes a ray status.
 * Direct and local-altitude residuals are reported side-by-side, neither is an oracle.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuNumericalFloor141224=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var ARCSEC=180/Math.PI*3600,TRACE_LIMIT=12;
  var variants=['predictor5mm','predictorStrict','sweepStrict','bracketStrict'];
  var floatBits=new DataView(new ArrayBuffer(4));
  function ulp32(value){
    if(!Number.isFinite(value))return null;
    floatBits.setFloat32(0,value,true);
    var rounded=floatBits.getFloat32(0,true),bits=floatBits.getUint32(0,true);
    if(rounded===0)return Math.pow(2,-149);
    floatBits.setUint32(0,bits+(rounded>0?1:-1),true);
    return Math.abs(floatBits.getFloat32(0,true)-rounded);
  }
  function measured(ladder,batches,cpu){
    if(!ladder||!ladder.request||!Array.isArray(ladder.request.targets)||
       !Array.isArray(ladder.coordinates)||!cpu||!Array.isArray(cpu.results))
      throw TypeError('Numerical floor reference inputs missing');
    var targets=ladder.request.targets,n=targets.length;
    if(n!==48||ladder.coordinates.length!==n||cpu.results.length!==n)
      throw RangeError('Numerical floor ladder must contain exactly 48 targets');
    var summary={},perTarget=[];
    variants.forEach(function(name){
      var batch=batches&&batches[name];
      if(!batch||!batch.response||!Array.isArray(batch.response.results)||
         batch.response.results.length!==n||!Array.isArray(batch.telemetry)||
         batch.telemetry.length!==n||(name!=='predictor5mm'&&
         (!Array.isArray(batch.refinementTrace)||batch.refinementTrace.length!==n)))
        throw RangeError('Missing GPU root-trace batch '+name);
      var m={targets:n,solverFailed:0,indeterminate:0,statusMismatches:0,
        bracketFailures:0,tracedTargets:0,fullIterationFailures:0,
        angularPlateauSteps:0,residualPlateauSteps:0,numericFloorCandidates:0,
        minAbsDirectResidualMetres:null,minAbsLocalResidualMetres:null,
        maxDirectVsLocalResidualGapMetres:0};
      batch.response.results.forEach(function(g,i){
        var t=targets[i],coord=ladder.coordinates[i],c=cpu.results[i],tel=batch.telemetry[i],
          rawTrace=name==='predictor5mm'?[]:batch.refinementTrace[i].trace;
        if(!g||!c||!Array.isArray(g.target)||!Array.isArray(c.target)||
           g.target[0]!==t[0]||g.target[1]!==t[1]||
           c.target[0]!==t[0]||c.target[1]!==t[1]||
           !tel||!Array.isArray(rawTrace)||rawTrace.length>TRACE_LIMIT||
           (name!=='predictor5mm'&&batch.refinementTrace[i].targetIndex!==i))
          throw RangeError('Numerical floor target identity/trace mismatch '+name+' '+i);
        if(g.status!==c.status)m.statusMismatches++;
        if(g.status==='solver_failed')m.solverFailed++;
        if(g.status==='indeterminate')m.indeterminate++;
        if(g.status==='solver_failed'&&tel.bracketIndex>=0)m.bracketFailures++;
        if(g.status==='solver_failed'&&tel.refineIterations===28)m.fullIterationFailures++;
        var steps=rawTrace.map(function(s,index){
          if(!s||!Number.isInteger(s.iteration)||!Number.isFinite(s.angleRadians)||
             !Number.isFinite(s.residualMetres)||
             !Number.isFinite(s.localAltitudeResidualMetres)||
             !Number.isFinite(s.bracketWidthRadians)||s.iteration<1||s.iteration>28||
             (index&&s.iteration<=rawTrace[index-1].iteration))
            throw RangeError('Corrupt GPU refinement trace '+name+' '+i);
          var u=ulp32(s.angleRadians);
          var directAbs=Math.abs(s.residualMetres),localAbs=Math.abs(s.localAltitudeResidualMetres);
          m.minAbsDirectResidualMetres=m.minAbsDirectResidualMetres===null?directAbs:
            Math.min(m.minAbsDirectResidualMetres,directAbs);
          m.minAbsLocalResidualMetres=m.minAbsLocalResidualMetres===null?localAbs:
            Math.min(m.minAbsLocalResidualMetres,localAbs);
          m.maxDirectVsLocalResidualGapMetres=Math.max(m.maxDirectVsLocalResidualGapMetres,
            Math.abs(s.residualMetres-s.localAltitudeResidualMetres));
          return {iteration:s.iteration,angleRadians:s.angleRadians,
            angleUlpRadians:u,residualMetres:s.residualMetres,
            localAltitudeResidualMetres:s.localAltitudeResidualMetres,
            bracketWidthArcsec:s.bracketWidthRadians*ARCSEC,
            bracketWidthUlp:u>0?s.bracketWidthRadians/u:null};
        });
        var flatAngles=0,flatResiduals=0;
        for(var j=1;j<steps.length;j++){
          if(steps[j].angleRadians===steps[j-1].angleRadians)flatAngles++;
          if(steps[j].angleRadians!==steps[j-1].angleRadians&&
             steps[j].residualMetres===steps[j-1].residualMetres)flatResiduals++;
        }
        m.angularPlateauSteps+=flatAngles;m.residualPlateauSteps+=flatResiduals;
        if(steps.length)m.tracedTargets++;
        var last=steps[steps.length-1]||null,
          floorSuspected=!!last&&(flatAngles>0||flatResiduals>0||
            (last.bracketWidthUlp!==null&&last.bracketWidthUlp<=2.1));
        if(floorSuspected)m.numericFloorCandidates++;
        perTarget.push({variant:name,distanceMetres:coord.distanceMetres,
          heightMetres:coord.heightMetres,cpuStatus:c.status,gpuStatus:g.status,
          bracketIndex:tel.bracketIndex,refineIterations:tel.refineIterations,
          angleDeltaArcsec:Number.isFinite(g.angle)&&Number.isFinite(c.angle)?
            (g.angle-c.angle)*ARCSEC:null,
          finalResidualMetres:g.residual,numericalFloorSuspected:floorSuspected,
          anglePlateauSteps:flatAngles,residualPlateauSteps:flatResiduals,
          trace:steps});
      });
      summary[name]=m;
    });
    return {version:'140.12.24',kind:'f32 root residual floor and local-altitude trace audit',
      targetSelection:'Fixed 48-point physical geometry ladder; no CPU-guided selection',
      traceLastIterations:TRACE_LIMIT,
      variants:summary,perTargetResults:perTarget,
      residualDefinitions:{direct:'f32 terminal endpoint.y minus f32 target.y',
        localAltitude:'f32 surface-relative altitude(endpoint) minus altitude(target), diagnostic only',
        note:'Alternative residual may reflect endpoint horizontal error; it is not a higher-precision oracle'},
      floorCandidateIsDiagnosticOnly:true,notAConvergenceProof:true,
      cpuOracleDiscovery:false,cpuShootingFallback:false,framePaintingChanged:false,
      productionAuthorized:false};
  }
  return Object.freeze({measured:measured,ulp32:ulp32});
}));
