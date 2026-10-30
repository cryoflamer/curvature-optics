/* #140.12.23: diagnostic-only root convergence comparison; never paints a frame. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuRootConvergence141223=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var ARCSEC=180/Math.PI*3600;
  function summarize(ladder,batches,cpu){
    if(!ladder||!batches||!cpu||!Array.isArray(cpu.results))throw TypeError('Root audit inputs missing');
    var n=ladder.targetsCount;
    if(cpu.results.length!==n)throw RangeError('CPU reference count mismatch');
    var variants={},perTarget=[];
    ['predictor5mm','predictorStrict','sweepStrict','bracketStrict'].forEach(function(name){
      var batch=batches[name];
      if(!batch||!batch.response||!Array.isArray(batch.response.results)||
         batch.response.results.length!==n||!Array.isArray(batch.telemetry)||batch.telemetry.length!==n)
        throw RangeError('Invalid GPU root batch '+name);
      var s={targets:n,statusMismatches:0,solverFailed:0,indeterminate:0,
        successfulAngles:0,meanAbsAngleDeltaArcsec:null,maxAbsAngleDeltaArcsec:0,
        nearGroundMismatches:0,endpointContacts:0,bracketed:0,
        meanRefineIterations:null,meanFinalBracketWidthArcsec:null,
        predictorAccepted:batch.algorithm&&batch.algorithm.predictorAccepted};
      var sum=0,iters=0,width=0,iterationsCount=0,widthCount=0;
      batch.response.results.forEach(function(g,i){
        var c=cpu.results[i],t=batch.telemetry[i],target=ladder.request.targets[i],coord=ladder.coordinates[i];
        if(!g||!c||!Array.isArray(g.target)||g.target[0]!==target[0]||g.target[1]!==target[1])
          throw RangeError('Root target mismatch '+name+' '+i);
        if(g.status!==c.status){s.statusMismatches++;if(coord.heightMetres<=0.01)s.nearGroundMismatches++;}
        if(g.status==='solver_failed')s.solverFailed++;
        if(g.status==='indeterminate')s.indeterminate++;
        var delta=Number.isFinite(g.angle)&&Number.isFinite(c.angle)?(g.angle-c.angle)*ARCSEC:null;
        if(delta!==null){s.successfulAngles++;sum+=Math.abs(delta);s.maxAbsAngleDeltaArcsec=Math.max(s.maxAbsAngleDeltaArcsec,Math.abs(delta));}
        if(t.bracketIndex>=0){s.bracketed++;if(Number.isFinite(t.refineIterations)){iters+=t.refineIterations;iterationsCount++;}
          if(Number.isFinite(t.finalBracketWidthRadians)){width+=t.finalBracketWidthRadians*ARCSEC;widthCount++;}}
        var event=g.ground&&g.ground.event;
        var before=event&&Number.isFinite(g.pathLength)?g.pathLength-event.pathLength:null;
        if(before!==null&&before>=0&&before<=0.25)s.endpointContacts++;
        perTarget.push({variant:name,distanceMetres:coord.distanceMetres,heightMetres:coord.heightMetres,
          cpuStatus:c.status,gpuStatus:g.status,angleDeltaArcsec:delta,residualMetres:g.residual,
          bracketIndex:t.bracketIndex,refineIterations:t.refineIterations,
          bracketWidthArcsec:t.finalBracketWidthRadians===null?null:t.finalBracketWidthRadians*ARCSEC,
          groundContact:event?event.contact:null,contactBeforeEndMetres:before});
      });
      s.meanAbsAngleDeltaArcsec=s.successfulAngles?sum/s.successfulAngles:null;
      s.meanRefineIterations=iterationsCount?iters/iterationsCount:null;
      s.meanFinalBracketWidthArcsec=widthCount?width/widthCount:null;
      variants[name]=s;
    });
    return {version:'140.12.23',kind:'GPU root convergence and verified angle-bracket audit',
      targets:n,variants:variants,perTargetResults:perTarget,
      strictToleranceMetres:0.0001,standardToleranceMetres:0.005,
      cpuOracleDiscovery:false,cpuShootingFallback:false,framePaintingChanged:false,
      terminalContactClassificationIsDiagnosticOnly:true,productionAuthorized:false};
  }
  return Object.freeze({summarize:summarize});
}));
