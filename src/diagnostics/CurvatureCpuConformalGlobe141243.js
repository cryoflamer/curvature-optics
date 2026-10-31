/* #140.12.43: Diagnostic-only Globe shooting feasibility via an exact
 * conformal transformation and a surface-matched inverse exponential.
 * All angle candidates are untrusted: only the original Globe RK4 solver
 * decides residual, first ground contact, and forward-x branch status.
 * No production renderer/shooting code is changed here.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('../optics/OpticalTargetProjection'):root.CurvatureTargetProjection);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCpuConformalGlobe141243=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projection){
  'use strict';
  var VERSION='140.12.43',ARCSEC=180/Math.PI*3600;
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function median(a){var b=a.slice().sort(function(x,y){return x-y;}),n=b.length;
    return n?(b[Math.floor((n-1)/2)]+b[Math.floor(n/2)])/2:null;}
  function constants(options){
    if(!options||options.geometry!=='globe'||options.atmosphere!=='standard')return null;
    var profile=options.profileOptions||{},R=options.radius,
      N=profile.refractivity===undefined?.000293:profile.refractivity,
      H=profile.scaleHeight===undefined?7350:profile.scaleHeight,
      eye=options.observerHeight;
    if(!Number.isFinite(R)||R<1e5||!Number.isFinite(N)||N<0||
        !Number.isFinite(H)||H<=0||!Number.isFinite(eye)||eye<=0||eye>10000)return null;
    var gradient=1/R-N/(H*(1+N));
    if(!(gradient>0)||!Number.isFinite(gradient))return null;
    return {R:R,N:N,H:H,observerHeight:eye,effectiveRadius:1/gradient,
      classicRadius:4*R/3,uObserver:R*Math.log1p(eye/R),
      scope:'spherical standard exponential atmosphere; meridional 2D rays'};
  }
  function transform(c,target){
    if(!Array.isArray(target)||target.length!==2||!target.every(Number.isFinite)||!(target[0]>0))return null;
    var x=target[0],z=target[1],base=c.R+z,r=Math.hypot(x,base),
      // Stable height, since subtracting R from a large hypotenuse loses digits.
      h=z+x*x/(r+base),X=c.R*Math.atan2(x,base);
    // Ground endpoints may be a few ulps negative after coordinate conversion.
    if(h<0&&h>=-1e-6)h=0;
    var u=c.R*Math.log1p(h/c.R);
    if(!(r>0)||!Number.isFinite(h)||h<0||!Number.isFinite(X)||!(X>0)||!Number.isFinite(u))return null;
    return {X:X,u:u,h:h};
  }
  function inverseAngle(c,target,L){
    var t=transform(c,target);
    if(!t||!(L>0))return {status:'unsupported',reason:'invalid transformed coordinates'};
    var q=t.X/L,v=(t.u-c.uObserver)/L;
    if(!(q>0&&q<1.5)||!Number.isFinite(v))return {status:'unsupported',reason:'outside inverse-exponential domain'};
    // Stable cos(q)-exp(-v), even for nearby points.
    var angle=Math.atan2(-2*Math.sin(q/2)*Math.sin(q/2)-Math.expm1(-v),Math.sin(q));
    if(!Number.isFinite(angle)||Math.abs(angle)>=Math.PI/2-.001)
      return {status:'unsupported',reason:'non-forward ray angle'};
    return {status:'candidate',angle:angle,transformed:t,method:'inverse-exponential',
      certified:false,groundVerdict:null};
  }
  function logGradient(c,u){
    var f=Math.exp(u/c.R),h=c.R*Math.expm1(u/c.R),a=c.N*Math.exp(-h/c.H),
      g=1/c.R-f*a/(c.H*(1+a)),
      gp=-f*a/(c.R*c.H*(1+a))+f*f*a/(c.H*c.H*(1+a)*(1+a));
    return [g,gp];
  }
  // Differential sensitivity of arrival height to launch angle:
  // u'=tan(a), a'=d ln(m)/du, v'=w sec²(a), w'=g'(u)*v,
  // (v,w) = (du/d(a0),da/d(a0)), initial (0,1).
  function coarse(c,X,start,steps){
    var dx=X/steps,u=c.uObserver,a=start,v=0,w=1,calls=0;
    function rhs(state){
      var U=state[0],A=state[1],V=state[2],W=state[3],
        pair=logGradient(c,U);calls++;
      var cosine=Math.cos(A);
      if(!(cosine>0.001)||!Number.isFinite(pair[0])||!Number.isFinite(pair[1]))return null;
      return [Math.tan(A),pair[0],W/(cosine*cosine),pair[1]*V];
    }
    function offset(state,slope,k){return state.map(function(x,i){return x+slope[i]*k;});}
    for(var j=0;j<steps;j++){
      var state=[u,a,v,w],k1=rhs(state);if(!k1)return null;
      var k2=rhs(offset(state,k1,dx/2));if(!k2)return null;
      var k3=rhs(offset(state,k2,dx/2));if(!k3)return null;
      var k4=rhs(offset(state,k3,dx));if(!k4)return null;
      u+=dx*(k1[0]+2*k2[0]+2*k3[0]+k4[0])/6;
      a+=dx*(k1[1]+2*k2[1]+2*k3[1]+k4[1])/6;
      v+=dx*(k1[2]+2*k2[2]+2*k3[2]+k4[2])/6;
      w+=dx*(k1[3]+2*k2[3]+2*k3[3]+k4[3])/6;
      if(![u,a,v,w].every(Number.isFinite)||Math.abs(a)>=Math.PI/2-.001)return null;
    }
    return {u:u,a:a,v:v,w:w,gradientCalls:calls};
  }
  function conformalCandidate(c,target,config){
    config=config||{};
    var steps=config.steps===undefined?2:config.steps,
      corrections=config.corrections===undefined?2:config.corrections,
      first=inverseAngle(c,target,c.effectiveRadius);
    if(!Number.isInteger(steps)||steps<1||steps>32||
        !Number.isInteger(corrections)||corrections<1||corrections>6)
      throw RangeError('Invalid coarse conformal configuration');
    if(first.status!=='candidate')return first;
    var angle=first.angle,calls=0,residual=null;
    for(var i=0;i<corrections;i++){
      var result=coarse(c,first.transformed.X,angle,steps);
      if(!result||!(Math.abs(result.v)>1e-12))return {status:'unsupported',reason:'coarse integration/sensitivity failed'};
      calls+=result.gradientCalls;residual=result.u-first.transformed.u;
      var correction=residual/result.v;
      if(!Number.isFinite(correction)||Math.abs(correction)>0.1||
          Math.abs(angle-correction)>=Math.PI/2-.001)
        return {status:'unsupported',reason:'unstable angular Newton correction'};
      angle-=correction;
    }
    return {status:'candidate',angle:angle,transformed:first.transformed,
      method:'exact-conformal coarse RK4 + Newton',coarseSteps:steps,
      corrections:corrections,gradientCalls:calls,lastCoarseResidualMetres:residual,
      certified:false,groundVerdict:null};
  }
  function certify(opts,targets,candidates){
    return targets.map(function(target,i){
      var q=candidates[i],params=Object.assign({},opts,{target:target});
      if(q.status==='candidate')params.shootingWarmStartAngle=q.angle;
      return projection.solve(params);
    });
  }
  function experiment(request,configuration){
    configuration=configuration||{};
    var c=constants(request);
    if(!c)throw RangeError('Conformal benchmark requires Globe standard atmosphere and positive effective radius');
    var targets=request.targets,controls=request.controls||{},steps=configuration.steps===undefined?2:configuration.steps,
      corrections=configuration.corrections===undefined?2:configuration.corrections,
      repeats=configuration.repeats===undefined?5:configuration.repeats;
    if(!Array.isArray(targets)||targets.length<1||targets.length>128||
        !Number.isInteger(repeats)||repeats<1||repeats>15)
      throw RangeError('Invalid targets or repeats');
    var cfg={steps:steps,corrections:corrections,controls:controls};
    // Materialize candidates independently inside each timed round; no
    // precomputed angles are reused across rounds (only JIT is warmed).
    function measuredPass(){
      var opts=projection.preparedOptions(Object.assign({},request,controls,{shootingPredictor:true}));
      delete opts.targets;delete opts.controls;
      var t=now(),baseline=targets.map(function(p){return projection.solve(Object.assign({},opts,{target:p}));}),
        baselineMs=now()-t;
      t=now();var analytic=targets.map(function(p){return inverseAngle(c,p,c.effectiveRadius);});var analyticMs=now()-t;
      t=now();var conformal=targets.map(function(p){return conformalCandidate(c,p,cfg);});var conformalMs=now()-t;
      t=now();var analyticCertified=certify(opts,targets,analytic);var analyticRK4Ms=now()-t;
      t=now();var conformalCertified=certify(opts,targets,conformal);var conformalRK4Ms=now()-t;
      return {baseline:baseline,analytic:analytic,conformal:conformal,
        analyticCertified:analyticCertified,conformalCertified:conformalCertified,
        timing:{predictorOnlyMs:baselineMs,analyticPredictionMs:analyticMs,
          analyticRK4Ms:analyticRK4Ms,analyticTotalMs:analyticMs+analyticRK4Ms,
          conformalPredictionMs:conformalMs,conformalRK4Ms:conformalRK4Ms,
          conformalTotalMs:conformalMs+conformalRK4Ms}};
    }
    measuredPass();
    var rounds=[],last;
    for(var i=0;i<repeats;i++){last=measuredPass();rounds.push(last.timing);}
    function angleError(candidate,reference){return candidate.status==='candidate'&&
      Number.isFinite(reference.angle)?candidate.angle-reference.angle:null;}
    function mismatch(reference,computed){
      return {status:reference.status!==computed.status,
        ground:!!(reference.ray&&reference.ray.hitGround)!==!!(computed.ray&&computed.ray.hitGround),
        angle:reference.angle===null||computed.angle===null?
          reference.angle!==computed.angle:Math.abs(reference.angle-computed.angle)>1e-7};
    }
    var rows=targets.map(function(target,index){
      var reference=last.baseline[index],analytic=last.analytic[index],
        conformal=last.conformal[index],ac=last.analyticCertified[index],cc=last.conformalCertified[index],
        analyticError=angleError(analytic,reference),conformalError=angleError(conformal,reference),
        classic=inverseAngle(c,target,c.classicRadius),classicError=angleError(classic,reference);
      return {index:index,target:target,altitudeMetres:transform(c,target).h,
        cpuStatus:reference.status,cpuAngleRadians:reference.angle,cpuResidualMetres:reference.residual,
        cpuRK4Calls:reference.shootRK4Calls,cpuGroundHit:!!(reference.ray&&reference.ray.hitGround),
        inverseAngleRadians:analytic.angle===undefined?null:analytic.angle,
        inverseErrorRadians:analyticError,inverseErrorArcseconds:analyticError===null?null:analyticError*ARCSEC,
        classicErrorArcseconds:classicError===null?null:classicError*ARCSEC,
        conformalAngleRadians:conformal.angle===undefined?null:conformal.angle,
        conformalErrorRadians:conformalError,conformalErrorArcseconds:conformalError===null?null:conformalError*ARCSEC,
        conformalReason:conformal.reason||null,conformalGradientCalls:conformal.gradientCalls||0,
        analyticWarmAccepted:!!ac.warmStartAccepted,conformalWarmAccepted:!!cc.warmStartAccepted,
        analyticFallback:!ac.warmStartAccepted,conformalFallback:!cc.warmStartAccepted,
        analyticCertifiedStatus:ac.status,conformalCertifiedStatus:cc.status,
        analyticRK4Calls:ac.shootRK4Calls,conformalRK4Calls:cc.shootRK4Calls,
        analyticParity:mismatch(reference,ac),conformalParity:mismatch(reference,cc)};
    });
    function count(predicate){return rows.filter(predicate).length;}
    function largest(field){var xs=rows.map(function(r){return Math.abs(r[field]);}).filter(Number.isFinite);
      return xs.length?Math.max.apply(null,xs):null;}
    var timingKeys=Object.keys(rounds[0]),mediansMs={};
    timingKeys.forEach(function(k){mediansMs[k]=median(rounds.map(function(r){return r[k];}));});
    return {version:VERSION,scope:'diagnostic only; never use candidate to decide ground or visibility',
      geometry:'globe',atmosphere:'standard',constants:c,steps:steps,corrections:corrections,
      rounds:rounds,mediansMs:mediansMs,rows:rows,
      summary:{targets:rows.length,analyticCandidates:count(function(r){return r.inverseAngleRadians!==null;}),
        conformalCandidates:count(function(r){return r.conformalAngleRadians!==null;}),
        analyticWarmAccepted:count(function(r){return r.analyticWarmAccepted;}),
        conformalWarmAccepted:count(function(r){return r.conformalWarmAccepted;}),
        analyticFallback:count(function(r){return r.analyticFallback;}),
        conformalFallback:count(function(r){return r.conformalFallback;}),
        analyticStatusMismatches:count(function(r){return r.analyticParity.status;}),
        conformalStatusMismatches:count(function(r){return r.conformalParity.status;}),
        analyticGroundMismatches:count(function(r){return r.analyticParity.ground;}),
        conformalGroundMismatches:count(function(r){return r.conformalParity.ground;}),
        analyticAngleMismatches:count(function(r){return r.analyticParity.angle;}),
        conformalAngleMismatches:count(function(r){return r.conformalParity.angle;}),
        maxInverseErrorArcseconds:largest('inverseErrorArcseconds'),
        maxClassicErrorArcseconds:largest('classicErrorArcseconds'),
        maxConformalErrorArcseconds:largest('conformalErrorArcseconds'),
        predictorRK4Calls:rows.reduce(function(s,r){return s+r.cpuRK4Calls;},0),
        conformalRK4Calls:rows.reduce(function(s,r){return s+r.conformalRK4Calls;},0),
        productionEligible:false}};
  }
  function surfaceTarget(R,x,h){
    var radius=R+h;
    if(!(x>0)||!(radius>x))throw RangeError('Invalid surface target geometry');
    return [x,h-x*x/(Math.sqrt(radius*radius-x*x)+radius)];
  }
  function stressTargets(R,observerHeight){
    var targets=[];
    [1000,3000,10000,20000].forEach(function(x){
      [0,observerHeight].forEach(function(h){targets.push(surfaceTarget(R,x,h));});
    });return targets;
  }
  function envelopeTargets(R){
    var targets=[];
    [1000,10000,25000,50000,100000].forEach(function(x){
      [0,15,100,500].forEach(function(h){targets.push(surfaceTarget(R,x,h));});
    });return targets;
  }
  return {version:VERSION,constants:constants,transform:transform,
    inverseAngle:inverseAngle,conformalCandidate:conformalCandidate,
    experiment:experiment,surfaceTarget:surfaceTarget,stressTargets:stressTargets,
    envelopeTargets:envelopeTargets};
}));
