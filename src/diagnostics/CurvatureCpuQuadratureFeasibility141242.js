/* #140.12.42 — Diagnostic-only native f64 integral feasibility experiment.
 * A monotone-height branch is intentionally narrower than full first-forward-x
 * RK4 shooting. Invariant quadratures are exact for n(h) in this model;
 * numerical quadrature/root decisions are NOT proofs of global visibility.
 * Unsupported branches fail closed and hybrid falls back to unchanged CPU RK4.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('../optics/OpticalTargetProjection'):root.CurvatureTargetProjection);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCpuQuadratureFeasibility141242=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projection){
  'use strict';
  var VERSION='140.12.42',PI2=Math.PI/2;
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function median(xs){var a=xs.slice().sort(function(x,y){return x-y;});return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;}
  function geometry(options){
    var kind=options.geometry;
    if(kind!=='flat'&&kind!=='globe')throw RangeError('Expected flat or globe');
    var atm=options.atmosphere;
    if(atm!=='standard'&&atm!=='vacuum')return null;
    var profile=options.profileOptions||{},N=atm==='vacuum'?0:(profile.refractivity===undefined?.000293:profile.refractivity),
      H=profile.scaleHeight===undefined?7350:profile.scaleHeight,R=options.radius||6371000;
    if(!Number.isFinite(N)||N<0||!Number.isFinite(H)||H<=0||!(R>0)||!Number.isFinite(R))return null;
    // Only strictly monotone F(h)=n(h)*(R+h) in the Globe model.
    // Exponential F' reaches its minimum at max(0,2H-R).
    if(kind==='globe'&&N>0&&[0,Math.max(0,2*H-R)].some(function(h){
      return !(1+N*Math.exp(-h/H)*(1-(R+h)/H)>0);
    }))return null;
    function n(h){return 1+N*Math.exp(-h/H);}
    function F(h){return n(h)*(kind==='globe'?R+h:1);}
    return {kind:kind,N:N,H:H,R:R,F:F,n:n};
  }
  function targetHeight(g,target){
    if(g.kind==='flat')return target[1];
    var x=target[0],z=target[1],a=g.R+z;
    return z+x*x/(Math.hypot(x,a)+a);
  }
  function targetCoordinate(g,target){return g.kind==='flat'?target[0]:Math.atan2(target[0],g.R+target[1]);}
  // Gauss–Legendre on [0,1]. Nodes are cached; use an endpoint-square
  // substitution adjacent to the small radicand. This is a real 1D
  // invariant quadrature, not an RK4 integrator in disguise.
  var gaussCache={};
  function gauss(n){
    if(gaussCache[n])return gaussCache[n];
    var pairs=[];
    for(var j=0;j<Math.ceil(n/2);j++){
      var z=Math.cos(Math.PI*(j+.75)/(n+.5)),pp=0;
      for(var k=0;k<16;k++){
        var p0=1,p1=z;
        for(var m=2;m<=n;m++){var v=((2*m-1)*z*p1-(m-1)*p0)/m;p0=p1;p1=v;}
        pp=n*(z*p1-p0)/(z*z-1);
        var next=z-p1/pp;
        if(Math.abs(next-z)<2e-15){z=next;break;}z=next;
      }
      var w=1/((1-z*z)*pp*pp);
      pairs.push({u:(1-z)/2,w:w});
      if(n-j-1!==j)pairs.push({u:(1+z)/2,w:w});
    }
    pairs.sort(function(a,b){return a.u-b.u;});
    gaussCache[n]=pairs;return pairs;
  }
  function integral(g,lo,hi,b,nodes,nearLo,nearHi,counter){
    if(!(hi>lo))return 0;
    var sum=0,compensation=0,d=hi-lo,points=gauss(nodes);
    for(var j=0;j<points.length;j++){
      var u=points[j].u;
      var h=nearLo?lo+d*u*u:nearHi?hi-d*u*u:lo+d*u;
      var jac=(nearLo||nearHi)?2*d*u:d;
      var f=g.F(h),rad=(f-b)*(f+b);
      counter.samples++;
      if(!(rad>0))return null;
      var value=points[j].w*jac*b/(g.kind==='flat'?Math.sqrt(rad):(g.R+h)*Math.sqrt(rad));
      var y=value-compensation,tmp=sum+y;compensation=(tmp-sum)-y;sum=tmp;
    }
    return sum;
  }
  function fixedAngle(g,eye,target,angle,nodes,counter){
    var ht=targetHeight(g,target),lo=Math.min(ht,eye),hi=Math.max(ht,eye),
      outward=ht>eye,sign=outward?1:-1,abs=Math.abs(angle);
    // The test is intentionally restricted to one radial/vertical leg.
    if(!(ht>=0)||!(eye>0)||!(hi>lo+1e-5)||!Number.isFinite(abs)||abs>=1.4||
        Math.sign(angle)!==sign)return null;
    var b=g.F(eye)*Math.cos(abs);
    // A turning point at or before target requires multi-leg accounting.
    if(b>=Math.min(g.F(lo),g.F(hi))*(1-1e-14))return null;

    // A true endpoint singularity occurs only at alpha=0 (start)
    // or at the limiting angle where F(ht)=b; exclude both here.
    return integral(g,lo,hi,b,nodes,g.kind==='globe',g.kind==='flat'&&g.N>0,counter);
  }
  // Find a SINGLE monotone-height shooting branch by bracketing the invariant
  // integral. The result does not claim a ground event or global multipath.
  function candidate(options,target,config){
    var g=geometry(options),counts={samples:0,integrals:0,iterations:0};
    if(!g)return {status:'unsupported',reason:'unsupported profile or nonmonotone spherical invariant',counts:counts};
    var eye=options.observerHeight,ht=targetHeight(g,target),distance=targetCoordinate(g,target),
      outward=ht>eye,sign=outward?1:-1;
    if(!(eye>0)||!(ht>=0)||Math.abs(ht-eye)<1e-5||!(distance>0))
      return {status:'unsupported',reason:'equal-height, below-ground or degenerate branch',counts:counts};
    var f0=g.F(eye),ft=g.F(ht),fmin=Math.min(f0,ft),
      minAngle=fmin<f0?Math.acos(Math.min(1,fmin/f0)):0;
    if(!(minAngle<1.4))return {status:'unsupported',reason:'outside angular domain',counts:counts};
    var nodes=config&&config.nodes||64;
    function residual(abs){
      counts.integrals++;
      var v=fixedAngle(g,eye,target,sign*abs,nodes,counts);
      return v===null?null:v-distance;
    }
    // Both limits are strictly inside the integrable domain; unsupported
    // if a bracket cannot be proved, never infer solver failure/occlusion.
    var a=minAngle+Math.max(1e-5,minAngle*1e-3),b=1.35,
      fa=residual(a),fb=residual(b);
    if(fa===null||fb===null||fa*fb>0)return {status:'unsupported',reason:'monotone bracket unavailable',counts:counts};
    var best=null,epsilon=config&&config.coordinateTolerance||
      (g.kind==='globe'?1e-10:1e-4);
    for(var i=0;i<36;i++){
      counts.iterations++;
      var m=(a+b)/2,fm=residual(m);
      if(fm===null)return {status:'unsupported',reason:'radicand near a branch boundary',counts:counts};
      best={angle:sign*m,coordinateResidual:fm};
      if(Math.abs(fm)<=epsilon||b-a<1e-13)break;
      if(fa*fm>0){a=m;fa=fm;}else{b=m;fb=fm;}
    }
    if(!best||Math.abs(best.coordinateResidual)>epsilon)
      return {status:'unsupported',reason:'quadrature residual exceeds tolerance',counts:counts};
    return {status:'candidate',angle:best.angle,coordinateResidual:best.coordinateResidual,
      counts:counts,scope:'monotone-height branch only; ground and branch not independently certified'};
  }
  function prepared(options){return projection.preparedOptions(options);}
  function reference(opts,target){return projection.solve(Object.assign({},opts,{target:target}));}
  function batch(options,targets,config){
    var opts=prepared(options),t0=now(),rk4=targets.map(function(t){return reference(opts,t);}),cpuMs=now()-t0;
    var p0=now(),predictor=targets.map(function(t){
      return reference(Object.assign({},opts,{shootingPredictor:true}),t);
    }),predictorMs=now()-p0;
    var q0=now(),quadratures=targets.map(function(t){return candidate(options,t,config);}),quadMs=now()-q0;
    var h0=now(),hybrid=quadratures.map(function(q,i){
      var seed=q.status==='candidate';
      // The existing CPU shooting accepts a warm start only after integrating
      // it and checking its target residual. Its original RK4 fallback and
      // first-ground-event verification are preserved without modification.
      var preparedShot=Object.assign({},opts,{shootingPredictor:true});
      if(seed)preparedShot.shootingWarmStartAngle=q.angle;
      return {source:seed?'quadrature-warm-start':'rk4-fallback',
        result:reference(preparedShot,targets[i])};
    }),hybridMs=now()-h0;
    return {rk4:rk4,predictor:predictor,quadratures:quadratures,hybrid:hybrid,
      timing:{rk4Ms:cpuMs,predictorOnlyMs:predictorMs,quadratureMs:quadMs,
        hybridRK4Ms:hybridMs,hybridTotalMs:quadMs+hybridMs}};
  }
  function experiment(request,configuration){
    configuration=configuration||{};
    var raw={geometry:request.geometry,radius:request.radius,observerHeight:request.observerHeight,
      atmosphere:request.atmosphere,profileOptions:request.profileOptions},
      opts=Object.assign({},raw,request.controls||{}),targets=request.targets,
      nodes=configuration.nodes||64,repeats=configuration.repeats||5;
    if(!Array.isArray(targets)||!targets.length||targets.length>128||
        !Number.isInteger(repeats)||repeats<1||repeats>15||![32,64,128,256].includes(nodes))
      throw RangeError('Benchmark targets, repeats or nodes invalid');
    var config={nodes:nodes};
    batch(opts,targets,config); // unmeasured JIT and cache warm-up
    var timing=[],last;
    for(var r=0;r<repeats;r++){
      last=batch(opts,targets,config);timing.push(last.timing);
    }
    var rows=last.quadratures.map(function(q,i){
      var cpu=last.rk4[i],pred=last.predictor[i],hybrid=last.hybrid[i].result,
        comparable=q.status==='candidate'&&cpu.angle!==null,
        diff=comparable?Math.abs(q.angle-cpu.angle):null,
        angleMismatch=hybrid.angle!==null&&cpu.angle!==null?
          Math.abs(hybrid.angle-cpu.angle)>1e-7:hybrid.angle!==cpu.angle,
        groundMismatch=!!(cpu.ray&&cpu.ray.hitGround)!==!!(hybrid.ray&&hybrid.ray.hitGround);
      return {index:i,target:targets[i],heightMetres:targetHeight(geometry(raw),targets[i]),
        cpuStatus:cpu.status,cpuAngleRadians:cpu.angle,cpuResidualMetres:cpu.residual,
        cpuRK4Calls:cpu.shootRK4Calls,predictorOnlyRK4Calls:pred.shootRK4Calls,
        predictorOnlyStatus:pred.status,quadratureStatus:q.status,quadratureReason:q.reason||null,
        quadratureAngleRadians:q.status==='candidate'?q.angle:null,
        angularDifferenceRadians:diff,quadratureCoordinateResidual:q.coordinateResidual===undefined?null:q.coordinateResidual,
        quadratureIntegrals:q.counts.integrals,quadratureSamples:q.counts.samples,
        hybridStatus:hybrid.status,hybridAngleRadians:hybrid.angle,hybridRK4Calls:hybrid.shootRK4Calls,
        hybridWarmStartAccepted:hybrid.warmStartAccepted||0,
        hybridFallback:q.status!=='candidate'||!(hybrid.warmStartAccepted>0),
        hybridStatusMismatch:hybrid.status!==cpu.status,
        hybridAngleMismatch:angleMismatch,hybridGroundHitMismatch:groundMismatch,
        // The existing RK4 ground test is executed, so this is not a
        // stand-alone quadrature visibility result.
        acceptedWithoutRK4:false};
    });
    var compared=rows.filter(function(x){return x.angularDifferenceRadians!==null;});
    var valid=compared.filter(function(x){return x.angularDifferenceRadians<=1e-7;});
    var summary={targets:targets.length,quadratureCandidates:compared.length,
      unsupported:rows.length-compared.length,angleWithin1eMinus7Radians:valid.length,
      maxAngularDifferenceRadians:compared.length?Math.max.apply(null,compared.map(function(x){return x.angularDifferenceRadians;})):null,
      hybridWarmAccepted:rows.filter(function(x){return x.hybridWarmStartAccepted>0;}).length,
      hybridFallbackCount:rows.filter(function(x){return x.hybridFallback;}).length,
      hybridStatusMismatches:rows.filter(function(x){return x.hybridStatusMismatch;}).length,
      hybridAngleMismatches:rows.filter(function(x){return x.hybridAngleMismatch;}).length,
      hybridGroundHitMismatches:rows.filter(function(x){return x.hybridGroundHitMismatch;}).length,
      productionEligible:false};
    var med={};['rk4Ms','predictorOnlyMs','quadratureMs','hybridRK4Ms','hybridTotalMs'].forEach(function(key){
      med[key]=median(timing.map(function(t){return t[key];}));
    });
    return {version:VERSION,kind:'cpu-f64-monotone-quadrature-feasibility',geometry:raw.geometry,
      atmosphere:raw.atmosphere,scope:'monotone-height single branch; no turning or multipath; RK4 still checks ground',
      configuration:{nodes:nodes,repeats:repeats,warmup:true,
        order:'RK4, predictor-only, quadrature, seeded RK4',
        note:'Hybrid is quadrature-seeded ORIGINAL RK4, including its own convergence/ground checks and fallback. Predict-only is an additional fair CPU control.'},
      mediansMs:med,rounds:timing,summary:summary,rows:rows};
  }
  return Object.freeze({VERSION:VERSION,geometry:geometry,targetHeight:targetHeight,
    fixedAngle:fixedAngle,candidate:candidate,experiment:experiment});
}));
