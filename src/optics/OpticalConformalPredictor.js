/* #140.12.45: Opt-in standard-Globe predictor candidates only.
 * No geometry, ground-event or visibility claims: OpticalTargetProjection
 * remains the sole final authority, including its strict RK4 fallback.
 * Shared with diagnostics to prevent drift from the benchmark algorithm.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureOpticalConformalPredictor=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var HALF_PI=Math.PI/2;
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
  // #140.12.46. Two independent, deliberately selectable optimizations.
  // gradient: same array RK4, one fewer transcendental per stage.
  // scalar: gradient optimization plus no state/map allocations in RK4.
  // The pre-140.12.46 coarse() above is retained as the numeric oracle.
  function logGradientFast(c,u){
    var h=c.R*Math.expm1(u/c.R),f=1+h/c.R,
      a=c.N*Math.exp(-h/c.H),inv=1/(1+a),invH=1/c.H,
      g=1/c.R-f*a*inv*invH,
      gp=-f*a*inv*invH/c.R+f*f*a*inv*inv*invH*invH;
    return [g,gp];
  }
  function coarseGradient(c,X,start,steps){
    var dx=X/steps,u=c.uObserver,a=start,v=0,w=1,calls=0;
    function rhs(state){
      var U=state[0],A=state[1],V=state[2],W=state[3],
        pair=logGradientFast(c,U);calls++;
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
  function coarseFast(c,X,start,steps){
    var dx=X/steps,half=dx/2,sixth=dx/6,
      u=c.uObserver,a=start,v=0,w=1;
    // A stage returns only its derivatives; no stage-state / offset / map.
    // Preserve RK4 arithmetic order to bound drift relative to coarse().
    function stage(U,A,V,W){
      var h=c.R*Math.expm1(U/c.R),f=1+h/c.R,
        n=c.N*Math.exp(-h/c.H),inv=1/(1+n),invH=1/c.H,
        g=1/c.R-f*n*inv*invH,
        gp=-f*n*inv*invH/c.R+f*f*n*inv*inv*invH*invH,
        cosine=Math.cos(A);
      if(!(cosine>0.001)||!Number.isFinite(g)||!Number.isFinite(gp))return null;
      return [Math.tan(A),g,W/(cosine*cosine),gp*V];
    }
    for(var j=0;j<steps;j++){
      var k1=stage(u,a,v,w);if(!k1)return null;
      var k2=stage(u+half*k1[0],a+half*k1[1],v+half*k1[2],w+half*k1[3]);if(!k2)return null;
      var k3=stage(u+half*k2[0],a+half*k2[1],v+half*k2[2],w+half*k2[3]);if(!k3)return null;
      var k4=stage(u+dx*k3[0],a+dx*k3[1],v+dx*k3[2],w+dx*k3[3]);if(!k4)return null;
      u+=sixth*(k1[0]+2*k2[0]+2*k3[0]+k4[0]);
      a+=sixth*(k1[1]+2*k2[1]+2*k3[1]+k4[1]);
      v+=sixth*(k1[2]+2*k2[2]+2*k3[2]+k4[2]);
      w+=sixth*(k1[3]+2*k2[3]+2*k3[3]+k4[3]);
      if(!Number.isFinite(u)||!Number.isFinite(a)||!Number.isFinite(v)||
          !Number.isFinite(w)||Math.abs(a)>=Math.PI/2-.001)return null;
    }
    return {u:u,a:a,v:v,w:w,gradientCalls:steps*4};
  }
  function chooseIntegrator(engine){
    if(engine==='reference')return coarse;
    if(engine==='gradient')return coarseGradient;
    if(engine==='fast')return coarseFast;
    throw RangeError('Invalid conformal integrator');
  }
  function conformalCandidate(c,target,config){
    config=config||{};
    var steps=config.steps===undefined?2:config.steps,
      corrections=config.corrections===undefined?2:config.corrections,
      engine=config.engine||'reference',integrate=chooseIntegrator(engine),
      first=inverseAngle(c,target,c.effectiveRadius);
    if(!Number.isInteger(steps)||steps<1||steps>32||
        !Number.isInteger(corrections)||corrections<1||corrections>6)
      throw RangeError('Invalid coarse conformal configuration');
    if(first.status!=='candidate')return first;
    var angle=first.angle,calls=0,residual=null;
    for(var i=0;i<corrections;i++){
      var result=integrate(c,first.transformed.X,angle,steps);
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
  function finiteAngle(v){return v&&v.status==='candidate'&&Number.isFinite(v.angle);}
  function adaptiveCandidate(c,target,config){
    config=config||{};
    var mode=config.mode||'adaptive',threshold=config.angularResidualMetres===undefined?2e-7:config.angularResidualMetres,
      engine=config.engine||'reference';
    chooseIntegrator(engine);
    if(['fixed2','adaptive','richardson'].indexOf(mode)<0||
      !Number.isFinite(threshold)||!(threshold>0)||threshold>0.01)
      throw RangeError('Invalid adaptive predictor configuration');
    var first=conformalCandidate(c,target,{steps:2,corrections:2,engine:engine});
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
          var next=conformalCandidate(c,target,{steps:steps,corrections:2,engine:engine});
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
  return {constants:constants,transform:transform,inverseAngle:inverseAngle,
    conformalCandidate:conformalCandidate,adaptiveCandidate:adaptiveCandidate,
    // Exposed for controlled microprofiling, not for physical classification.
    coarseReference:coarse,coarseGradient:coarseGradient,coarseFast:coarseFast,
    gradientReference:logGradient,gradientFast:logGradientFast};
}));
