/* Lightweight, read-only physical sanity checks. No live model mutation. */
(function(root,factory){
  var api=factory(root.CurvatureSurfaceGeometry||(typeof require==='function'?require('../geometry/CurvatureSurfaceGeometry'):null),
    root.CurvatureTargetProjection||(typeof require==='function'?require('../optics/OpticalTargetProjection'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePhysicalSanity=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(surfaces,targets){
  'use strict';
  function run(){
    var checks=[];
    function record(id,fn){
      try{var result=fn();checks.push({id:id,status:result.status||'PASS',details:result.details,measurements:result.measurements||{}});}
      catch(e){checks.push({id:id,status:'FAIL',details:String(e)});}
    }
    var R=6371000,H=15;
    record('vacuum-analytic-angles',function(){
      var max=0,count=0;
      for(var radius of [R,Infinity])for(var d of [1000,5000,10000])for(var h of [0,25,65]){
        var s=surfaces.createFromRadius(radius),p=s.surfacePoint2(d,h);
        var result=targets.solve({geometry:radius===Infinity?'flat':'globe',radius:radius===Infinity?R:radius,
          observerHeight:H,target:p,atmosphere:'vacuum',step:100});
        var expected=Math.atan2(p[1]-H,p[0]);
        if(result.status!=='visible')throw Error('Expected visible vacuum target at '+d+' m, '+h+' m: '+result.status);
        max=Math.max(max,Math.abs(result.angle-expected));count++;
      }
      return {status:max<=1e-8?'PASS':'FAIL',details:'Independent straight-line angles; 18 visible targets',
        measurements:{cases:count,maxAngleErrorRad:max,toleranceRad:1e-8}};
    });
    record('standard-refraction',function(){
      var d=10000,s=surfaces.createFromRadius(R),p=s.surfacePoint2(d,65);
      var vacuum=targets.solve({geometry:'globe',radius:R,observerHeight:H,target:p,atmosphere:'vacuum',step:100});
      var standard=targets.solve({geometry:'globe',radius:R,observerHeight:H,target:p,atmosphere:'standard',step:100});
      if(vacuum.status!=='visible'||standard.status!=='visible')return {status:'WARN',details:'A comparison ray was not confirmed visible',measurements:{vacuum:vacuum.status,standard:standard.status}};
      var delta=standard.angle-vacuum.angle;
      return {status:delta>0&&delta<0.005?'PASS':'FAIL',details:'Standard atmosphere should elevate the apparent target relative to vacuum',
        measurements:{vacuumAngleRad:vacuum.angle,standardAngleRad:standard.angle,deltaRad:delta}};
    });
    record('geometric-horizon',function(){
      var s=surfaces.createFromRadius(R),horizon=s.geometricHorizon(H).arcDistance;
      var near=s.surfacePoint2(horizon-250,0),far=s.surfacePoint2(horizon+250,0);
      var a=targets.solve({geometry:'globe',radius:R,observerHeight:H,target:near,atmosphere:'vacuum',step:100});
      var b=targets.solve({geometry:'globe',radius:R,observerHeight:H,target:far,atmosphere:'vacuum',step:100});
      var status=a.status==='visible'&&b.status==='blocked'?'PASS':
        [a.status,b.status].some(function(x){return x==='solver_failed'||x==='indeterminate';})?'WARN':'FAIL';
      return {status:status,details:'Ground points 250 m before and after the analytic vacuum horizon',
        measurements:{horizonMetres:horizon,near:a.status,far:b.status}};
    });
    record('flat-limit-continuity',function(){
      var near=surfaces.createFromRadius(1e16),flat=surfaces.createFromCurvature(0);
      var max=0;
      for(var d of [100,1000,10000,50000,100000])for(var h of [0,20,65]){
        var a=near.surfacePoint2(d,h),b=flat.surfacePoint2(d,h);
        max=Math.max(max,Math.hypot(a[0]-b[0],a[1]-b[1]));
      }
      return {status:max<0.001?'PASS':'FAIL',details:'World-space positions converge to exact flat geometry (15 metric landmarks)',
        measurements:{maxPositionDifferenceMetres:max,toleranceMetres:0.001}};
    });
    var summary={PASS:0,WARN:0,FAIL:0};checks.forEach(function(c){summary[c.status]++;});
    return {schema:'physical-sanity-check-v129',timestamp:new Date().toISOString(),
      scope:'Read-only fixed reference scenes, not a full image or multipath validation',summary:summary,checks:checks};
  }
  return Object.freeze({run:run});
}));
