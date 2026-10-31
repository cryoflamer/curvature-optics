/* #140.12.44: Diagnostic-only adaptive Globe conformal shooting.
 * No predicted ray decides visibility, physical contact, or multipath.
 * All final classifications and angles are obtained from the UNCHANGED
 * OpticalTargetProjection.solve with its RK4 warm-start checks/fallback.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureCpuConformalGlobe141243'):root.CurvatureCpuConformalGlobe141243,
    typeof module==='object'&&module.exports?
    require('../optics/OpticalTargetProjection'):root.CurvatureTargetProjection);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCpuAdaptiveConformal141244=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(previous,projection){
  'use strict';
  var VERSION='140.12.44',ARCSEC=180*3600/Math.PI;
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function median(xs){var a=xs.slice().sort(function(x,y){return x-y;}),n=a.length;
    return n?(a[Math.floor((n-1)/2)]+a[Math.floor(n/2)])/2:null;}
  function finiteAngle(v){return v&&v.status==='candidate'&&Number.isFinite(v.angle);}
  function adaptiveCandidate(c,target,config){
    config=config||{};
    var mode=config.mode||'adaptive',threshold=config.angularResidualMetres===undefined?2e-7:config.angularResidualMetres;
    if(['fixed2','adaptive','richardson'].indexOf(mode)<0||
      !Number.isFinite(threshold)||!(threshold>0)||threshold>0.01)
      throw RangeError('Invalid adaptive predictor configuration');
    var first=previous.conformalCandidate(c,target,{steps:2,corrections:2});
    if(!finiteAngle(first))return Object.assign({},first,{mode:mode,coarseCalls:0,stepsUsed:0});
    var calls=first.gradientCalls||0,levels=[2],last=first,older=null,estimatedMetres=null;
    if(mode!=='fixed2'){
      // The short-path two-step solution is already inside the original
      // warm-start tolerance. Avoid paying for step-doubling on all 48 rays.
      // The cutoff is a measured computational heuristic, NOT a physical
      // assertion or a ground-contact classification.
      var X=first.transformed.X;
      var nearSurface=first.transformed.h<=1e-6&&X>5000;
      var goal=nearSurface?Math.min(threshold,5e-11):threshold;
      if(X>30000||nearSurface){
        for(var steps=4;steps<=16;steps*=2){
          var next=previous.conformalCandidate(c,target,{steps:steps,corrections:2});
          if(!finiteAngle(next))return {status:'unsupported',reason:'adaptive coarse integration failed',
            mode:mode,stepsUsed:steps,coarseCalls:calls,certified:false};
          calls+=next.gradientCalls||0;
          older=last;last=next;levels.push(steps);
          // RK4 fourth-order step-doubling estimate; target-distance scaling
          // is only a numerical *heuristic*. Certification is always via
          // original Globe RK4, including strict surface and ground events.
          estimatedMetres=Math.abs(last.angle-older.angle)*X/15;
          if(estimatedMetres<=goal)break;
        }
      }
    }
    var angle=last.angle,extrapolationRadians=0;
    if(mode==='richardson'&&older){
      extrapolationRadians=(last.angle-older.angle)/15;
      var trial=angle+extrapolationRadians;
      // A corrected angle is still an untrusted candidate, not a solved ray.
      if(Number.isFinite(trial)&&Math.abs(trial)<Math.PI/2-.001)angle=trial;
      else extrapolationRadians=0;
    }
    return {status:'candidate',angle:angle,mode:mode,
      method:mode==='richardson'?'adaptive conformal + local Richardson angle refinement':
        mode==='fixed2'?'fixed two-step conformal':'adaptive conformal step-doubling',
      stepsUsed:levels[levels.length-1],evaluatedLevels:levels,coarseCalls:calls,
      estimateMetres:estimatedMetres,extrapolationRadians:extrapolationRadians,
      transformed:first.transformed,certified:false,groundVerdict:null};
  }
  function parity(reference,certified){
    return {status:reference.status!==certified.status,
      ground:!!(reference.ray&&reference.ray.hitGround)!==!!(certified.ray&&certified.ray.hitGround),
      angle:reference.angle===null||certified.angle===null?
        reference.angle!==certified.angle:Math.abs(reference.angle-certified.angle)>1e-7};
  }
  function experiment(request,configuration){
    configuration=configuration||{};
    var c=previous.constants(request),targets=request.targets,repeats=configuration.repeats===undefined?5:configuration.repeats,
      threshold=configuration.angularResidualMetres===undefined?2e-7:configuration.angularResidualMetres;
    if(!c)throw RangeError('Adaptive conformal benchmark requires Globe standard exponential atmosphere');
    if(!Array.isArray(targets)||targets.length<1||targets.length>128||
       !Number.isInteger(repeats)||repeats<1||repeats>15)
      throw RangeError('Invalid adaptive target set or repeats');
    var modes=['fixed2','adaptive','richardson'];
    function pass(round){
      var options=projection.preparedOptions(Object.assign({},request,request.controls||{},
        {shootingPredictor:true}));
      delete options.targets;delete options.controls;
      var timings={},answers={},candidates={},parts={};
      // Rotation avoids permanently favouring whichever mode is timed last.
      var order=['baseline'].concat(modes);
      if(round>=0){var shift=round%order.length;order=order.slice(shift).concat(order.slice(0,shift));}
      order.forEach(function(mode){
        var t=now();
        if(mode==='baseline'){
          answers[mode]=targets.map(function(target){return projection.solve(Object.assign({},options,{target:target}));});
          timings.baselineTotalMs=now()-t;
          return;
        }
        candidates[mode]=targets.map(function(target){return adaptiveCandidate(c,target,
          {mode:mode,angularResidualMetres:threshold});});
        var predicted=now()-t;
        t=now();answers[mode]=targets.map(function(target,j){
          var opt=Object.assign({},options,{target:target}),candidate=candidates[mode][j];
          if(finiteAngle(candidate))opt.shootingWarmStartAngle=candidate.angle;
          return projection.solve(opt);
        });
        var rk4=now()-t;
        parts[mode]={predictionMs:predicted,rk4Ms:rk4,totalMs:predicted+rk4};
        timings[mode+'PredictionMs']=predicted;
        timings[mode+'RK4Ms']=rk4;
        timings[mode+'TotalMs']=predicted+rk4;
      });
      return {timings:timings,answers:answers,candidates:candidates,parts:parts};
    }
    pass(-1); // JIT warm-up; never included in medians.
    var rounds=[],last;
    for(var k=0;k<repeats;k++){last=pass(k);rounds.push(last.timings);}
    var rows=targets.map(function(target,i){
      var baseline=last.answers.baseline[i],row={index:i,target:target,
        altitudeMetres:previous.transform(c,target).h,
        cpuStatus:baseline.status,cpuAngleRadians:baseline.angle,
        cpuGroundHit:!!(baseline.ray&&baseline.ray.hitGround),cpuRK4Calls:baseline.shootRK4Calls};
      modes.forEach(function(mode){
        var q=last.candidates[mode][i],v=last.answers[mode][i],p=parity(baseline,v),prefix=mode;
        row[prefix+'Status']=q.status;
        row[prefix+'Reason']=q.reason||null;
        row[prefix+'AngleRadians']=finiteAngle(q)?q.angle:null;
        row[prefix+'ErrorArcseconds']=finiteAngle(q)&&Number.isFinite(baseline.angle)?
          (q.angle-baseline.angle)*ARCSEC:null;
        row[prefix+'Steps']=q.stepsUsed||0;
        row[prefix+'Levels']=q.evaluatedLevels||[];
        row[prefix+'EstimatedMetres']=q.estimateMetres===undefined?null:q.estimateMetres;
        row[prefix+'ExtrapolationRadians']=q.extrapolationRadians||0;
        row[prefix+'GradientCalls']=q.coarseCalls||0;
        row[prefix+'WarmAccepted']=!!v.warmStartAccepted;
        row[prefix+'Fallback']=!v.warmStartAccepted;
        row[prefix+'RK4Calls']=v.shootRK4Calls;
        row[prefix+'CertifiedStatus']=v.status;
        row[prefix+'Parity']=p;
      });
      return row;
    });
    var mediansMs={},keys=Object.keys(rounds[0]);
    keys.forEach(function(key){mediansMs[key]=median(rounds.map(function(r){return r[key];}));});
    var summary={targets:rows.length,baselineRK4Calls:rows.reduce(function(s,r){return s+r.cpuRK4Calls;},0),
      productionEligible:false};
    modes.forEach(function(mode){
      summary[mode]={candidates:rows.filter(function(r){return r[mode+'Status']==='candidate';}).length,
        warmAccepted:rows.filter(function(r){return r[mode+'WarmAccepted'];}).length,
        fallback:rows.filter(function(r){return r[mode+'Fallback'];}).length,
        statusMismatches:rows.filter(function(r){return r[mode+'Parity'].status;}).length,
        groundMismatches:rows.filter(function(r){return r[mode+'Parity'].ground;}).length,
        angleMismatches:rows.filter(function(r){return r[mode+'Parity'].angle;}).length,
        rk4Calls:rows.reduce(function(s,r){return s+r[mode+'RK4Calls'];},0),
        gradientCalls:rows.reduce(function(s,r){return s+r[mode+'GradientCalls'];},0),
        stepsHistogram:rows.reduce(function(o,r){var s=String(r[mode+'Steps']);o[s]=(o[s]||0)+1;return o;},{})};
    });
    return {version:VERSION,geometry:'globe',atmosphere:'standard',
      scope:'diagnostic candidates only; unchanged Globe RK4 decides target residual, ground contact and visibility',
      source:'same physical Globe targets supplied by Compare A; stress and envelope reported separately',
      angularResidualMetres:threshold,shortPathCutoffMetres:30000,
      estimator:'RK4 step-doubling |angle_fine-angle_coarse|*X/15 (heuristic, not a guarantee)',
      refinement:'Richardson local fourth-order angle extrapolation (angle_fine-angle_coarse)/15, untrusted until Globe RK4',
      constants:c,rounds:rounds,mediansMs:mediansMs,rows:rows,summary:summary};
  }
  return {version:VERSION,adaptiveCandidate:adaptiveCandidate,experiment:experiment,
    stressTargets:previous.stressTargets,envelopeTargets:previous.envelopeTargets};
}));
