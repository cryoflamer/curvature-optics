/* #140.12.25: opt-in numerical saturation shooting audit.
 * Experimental GPU status 4 is retained as an uncertified candidate only.
 * Neither a precision floor nor a near-endpoint contact proves visibility.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuPrecisionLimit141225=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var ARCSEC=180/Math.PI*3600;
  var names=['predictor5mm','predictorStrict','sweepStrict','bracketStrict','precisionAware'];
  function measured(ladder,batches,cpu){
    if(!ladder||!ladder.request||!Array.isArray(ladder.request.targets)||
       !Array.isArray(ladder.coordinates)||!cpu||!Array.isArray(cpu.results))
      throw TypeError('Precision-limit reference inputs missing');
    var targets=ladder.request.targets,n=targets.length;
    if(n!==48||ladder.coordinates.length!==n||cpu.results.length!==n)
      throw RangeError('Precision-limit ladder requires 48 fixed geometry targets');
    var variants={},perTargetResults=[],intervalViolations=[];
    cpu.results.forEach(function(r,i){
      if(!r||!Array.isArray(r.target)||r.target[0]!==targets[i][0]||
         r.target[1]!==targets[i][1])throw RangeError('CPU target mismatch '+i);
    });
    names.forEach(function(name){
      var batch=batches&&batches[name];
      if(!batch||!batch.response||!Array.isArray(batch.response.results)||
         batch.response.results.length!==n||!Array.isArray(batch.telemetry)||
         batch.telemetry.length!==n||
         (name!=='predictor5mm'&&(!Array.isArray(batch.refinementTrace)||
          batch.refinementTrace.length!==n)))
        throw RangeError('GPU precision-limit batch missing '+name);
      var s={targets:n,solverFailed:0,indeterminate:0,statusMismatches:0,
        precisionLimited:0,uncertifiedCandidates:0,successAngles:0,
        meanAbsSuccessfulAngleErrorArcsec:null,meanAbsCandidateAngleErrorArcsec:null,
        candidateAngles:0,nearEndpointCandidates:0,interiorContactCandidates:0,
        intervalWideningViolations:0,traceTargets:0,reportedVisibleFromCandidates:0};
      var successSum=0,candidateSum=0;
      batch.response.results.forEach(function(g,i){
        var c=cpu.results[i],t=batch.telemetry[i],coord=ladder.coordinates[i],
          trace=name==='predictor5mm'?[]:batch.refinementTrace[i].trace;
        if(!g||!Array.isArray(g.target)||g.target[0]!==targets[i][0]||
           g.target[1]!==targets[i][1]||!t||t.targetIndex!==i||
           !Array.isArray(trace)||(name!=='predictor5mm'&&batch.refinementTrace[i].targetIndex!==i))
          throw RangeError('GPU target/trace identity mismatch '+name+' '+i);
        if(g.status!==c.status)s.statusMismatches++;
        if(g.status==='solver_failed')s.solverFailed++;
        if(g.status==='indeterminate')s.indeterminate++;
        if(trace.length)s.traceTargets++;
        for(var j=1;j<trace.length;j++){
          if(trace[j].iteration<=trace[j-1].iteration||
             !Number.isFinite(trace[j].bracketWidthRadians)||
             !Number.isFinite(trace[j-1].bracketWidthRadians))
            throw RangeError('Invalid refinement trace ordering/width '+name+' '+i);
          // Allow f32 subtraction noise, but not real widening in a bracket.
          if(trace[j].bracketWidthRadians>trace[j-1].bracketWidthRadians*1.00001+1e-12){
            s.intervalWideningViolations++;
            intervalViolations.push({variant:name,distanceMetres:coord.distanceMetres,
              heightMetres:coord.heightMetres,previousIteration:trace[j-1].iteration,
              iteration:trace[j].iteration,previousWidthArcsec:trace[j-1].bracketWidthRadians*ARCSEC,
              widthArcsec:trace[j].bracketWidthRadians*ARCSEC});
          }
        }
        var flagged=t.precisionLimited===true;
        if(flagged){
          if(name!=='precisionAware'||t.rawStatusCode!==4||g.status!=='solver_failed'||
             g.angle!==null||!Number.isFinite(t.candidateAngleRadians)||
             !Number.isFinite(t.candidateResidualMetres)||
             !Number.isFinite(t.candidatePathLengthMetres)||
             !(Math.abs(t.candidateResidualMetres)>0.0001))
            throw RangeError('Unsafe or invalid precision-limited candidate '+name+' '+i);
          s.precisionLimited++;s.uncertifiedCandidates++;
          if(Number.isFinite(c.angle)){
            s.candidateAngles++;
            candidateSum+=Math.abs((t.candidateAngleRadians-c.angle)*ARCSEC);
          }
          var before=Number.isFinite(t.candidateImpactPathLengthMetres)?
            t.candidatePathLengthMetres-t.candidateImpactPathLengthMetres:null;
          if(before!==null&&before>=0&&before<=0.25)s.nearEndpointCandidates++;
          if(before!==null&&before>0.25)s.interiorContactCandidates++;
        }
        if(g.status==='visible'&&Number.isFinite(g.angle)&&Number.isFinite(c.angle)){
          s.successAngles++;successSum+=Math.abs((g.angle-c.angle)*ARCSEC);
        }
        perTargetResults.push({variant:name,distanceMetres:coord.distanceMetres,
          heightMetres:coord.heightMetres,cpuStatus:c.status,gpuStatus:g.status,
          diagnosticOutcome:flagged?'precision_limited':g.status,
          candidateIsCertified:false,rawGpuStatusCode:t.rawStatusCode,
          gpuAngleDeltaArcsec:Number.isFinite(g.angle)&&Number.isFinite(c.angle)?
            (g.angle-c.angle)*ARCSEC:null,
          candidateAngleDeltaArcsec:flagged&&Number.isFinite(c.angle)?
            (t.candidateAngleRadians-c.angle)*ARCSEC:null,
          candidateAngleRadians:flagged?t.candidateAngleRadians:null,
          candidateResidualMetres:flagged?t.candidateResidualMetres:null,
          candidateGroundContact:flagged?(t.candidateContactCode===1?'crossing':
            t.candidateContactCode===2?'grazing':null):null,
          candidateContactBeforeEndMetres:flagged&&Number.isFinite(t.candidateImpactPathLengthMetres)?
            t.candidatePathLengthMetres-t.candidateImpactPathLengthMetres:null,
          bracketIndex:t.bracketIndex,refineIterations:t.refineIterations,
          finalBracketWidthArcsec:t.finalBracketWidthRadians===null?null:
            t.finalBracketWidthRadians*ARCSEC,
          trace:trace.map(function(x){return {iteration:x.iteration,
            angleRadians:x.angleRadians,residualMetres:x.residualMetres,
            bracketWidthArcsec:x.bracketWidthRadians*ARCSEC};})});
      });
      s.meanAbsSuccessfulAngleErrorArcsec=s.successAngles?successSum/s.successAngles:null;
      s.meanAbsCandidateAngleErrorArcsec=s.candidateAngles?candidateSum/s.candidateAngles:null;
      variants[name]=s;
    });
    return {version:'140.12.25',kind:'GPU f32 precision-limited candidate and trace-invariant audit',
      targets:n,variants:variants,perTargetResults:perTargetResults,
      traceIntervalWideningViolations:intervalViolations,
      traceRepair:'Diagnostic ring slots are cleared before each possible early exit; no synthetic iterations',
      status4Policy:'Diagnostic only. The ordinary response remains solver_failed with null angle; ground events are observations, not visibility certificates.',
      cpuOracleDiscovery:false,cpuShootingFallback:false,framePaintingChanged:false,
      candidateIsCertified:false,productionAuthorized:false};
  }
  return Object.freeze({measured:measured});
}));
