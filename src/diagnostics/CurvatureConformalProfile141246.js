/* #140.12.46: diagnostic-only, per-stage CPU predictor profiler.
 * Uses actual exact-ray requests captured from the rendered scene.
 * Does not classify visibility; uses the same opt-in numerical predictor.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('../optics/OpticalConformalPredictor'):root.CurvatureOpticalConformalPredictor);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureConformalProfile141246=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(predictor){
  'use strict';
  function clock(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function median(a){var b=a.slice().sort(function(x,y){return x-y;}),n=b.length;
    return n?(b[(n-1)>>1]+b[n>>1])/2:null;}
  function benchmark(captured,options){
    options=options||{};
    var R=options.radius,eye=options.observerHeight,
      limit=options.sampleLimit===undefined?256:options.sampleLimit,
      rounds=options.rounds===undefined?5:options.rounds,
      iterations=options.iterations===undefined?10:options.iterations;
    if(!Array.isArray(captured)||!captured.length||!Number.isInteger(limit)||limit<1||limit>2048||
        !Number.isInteger(rounds)||rounds<1||rounds>15||
        !Number.isInteger(iterations)||iterations<1||iterations>100)
      throw RangeError('Invalid captured targets / profiler configuration');
    var c=predictor.constants({geometry:'globe',atmosphere:'standard',radius:R,observerHeight:eye});
    if(!c)throw RangeError('Unsupported conformal profiler geometry');
    var targets=[];
    for(var i=0,n=Math.min(limit,captured.length);i<n;i++){
      // Evenly sample the actual chronological ray requests, without assuming
      // the scene is uniform in distance or altitude.
      var pair=captured[Math.floor(i*captured.length/n)],d=pair[0],h=pair[1],q=d/R;
      if(!Number.isFinite(d)||!Number.isFinite(h)||d<=0||h<0)continue;
      var t=[(R+h)*Math.sin(q),(R+h)*Math.cos(q)-R],u=predictor.transform(c,t),
        first=predictor.inverseAngle(c,t,c.effectiveRadius);
      if(u&&first.status==='candidate')targets.push({t:t,u:u.u,X:u.X,angle:first.angle});
    }
    if(!targets.length)throw RangeError('No valid conformal profiler targets');
    var variants=['gradientReference','gradientFast','rk4Reference','rk4Gradient','rk4Fast',
      'candidateReference','candidateGradient','candidateFast'];
    var functions={
      gradientReference:function(q){return predictor.gradientReference(c,q.u)[0];},
      gradientFast:function(q){return predictor.gradientFast(c,q.u)[0];},
      rk4Reference:function(q){var r=predictor.coarseReference(c,q.X,q.angle,2);return r?r.u:0;},
      rk4Gradient:function(q){var r=predictor.coarseGradient(c,q.X,q.angle,2);return r?r.u:0;},
      rk4Fast:function(q){var r=predictor.coarseFast(c,q.X,q.angle,2);return r?r.u:0;},
      candidateReference:function(q){var r=predictor.adaptiveCandidate(c,q.t,{mode:'richardson',engine:'reference'});return r.angle||0;},
      candidateGradient:function(q){var r=predictor.adaptiveCandidate(c,q.t,{mode:'richardson',engine:'gradient'});return r.angle||0;},
      candidateFast:function(q){var r=predictor.adaptiveCandidate(c,q.t,{mode:'richardson',engine:'fast'});return r.angle||0;}
    };
    var samples={};variants.forEach(function(k){samples[k]=[];});
    var checksum=0;
    function pass(round,measure){
      var order=variants.slice(),shift=(round<0?0:round)%order.length;
      order=order.slice(shift).concat(order.slice(0,shift));
      order.forEach(function(k){
        var start=clock(),fn=functions[k];
        for(var repeat=0;repeat<iterations;repeat++)for(var j=0;j<targets.length;j++)checksum+=fn(targets[j]);
        if(measure)samples[k].push(clock()-start);
      });
    }
    pass(-1,false);pass(-1,false);
    for(var r=0;r<rounds;r++)pass(r,true);
    var mediansMs={},perTargetUs={};
    variants.forEach(function(k){mediansMs[k]=median(samples[k]);
      perTargetUs[k]=mediansMs[k]*1000/(targets.length*iterations);});
    var maxAngleDelta=0,stepMismatches=0,statusMismatches=0,stepHistogram={};
    targets.forEach(function(q){
      var a=predictor.adaptiveCandidate(c,q.t,{mode:'richardson',engine:'reference'}),
        b=predictor.adaptiveCandidate(c,q.t,{mode:'richardson',engine:'fast'});
      if(a.status!==b.status)statusMismatches++;
      if(a.stepsUsed!==b.stepsUsed)stepMismatches++;
      if(a.status==='candidate'&&b.status==='candidate')
        maxAngleDelta=Math.max(maxAngleDelta,Math.abs(a.angle-b.angle));
      var step=String(b.stepsUsed||0);stepHistogram[step]=(stepHistogram[step]||0)+1;
    });
    return {version:'140.12.46',source:'evenly sampled actual exact target requests',
      capturedCount:captured.length,validSampleCount:targets.length,
      iterations:iterations,rounds:rounds,samplesMs:samples,
      mediansMs:mediansMs,perTargetUs:perTargetUs,
      speedup:{gradient:mediansMs.gradientReference/mediansMs.gradientFast,
        rk4Gradient:mediansMs.rk4Reference/mediansMs.rk4Gradient,
        rk4Fast:mediansMs.rk4Reference/mediansMs.rk4Fast,
        candidateFast:mediansMs.candidateReference/mediansMs.candidateFast},
      parity:{maxCandidateAngleDeltaRadians:maxAngleDelta,stepMismatches:stepMismatches,
        statusMismatches:statusMismatches,stepsHistogram:stepHistogram},
      methodology:'Microprofile only: precomputed representative targets and fixed two-step RK4; ' +
        'median of alternating hot JS rounds. No Canvas, no RK4 physical certification; full-frame A/B separately measured.',
      checksum:checksum};
  }
  return {benchmark:benchmark};
}));
