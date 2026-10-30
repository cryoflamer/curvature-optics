/* Patch 132 baseline A/B comparison. The default pair stays current-vs-flat.
 * Patch 133 reuses clone() and the shared camera/object invariant for
 * independently configured physics, with no duplicate optical implementation.
 * No Legacy DOM, renderer, or global model state is accessed here.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCompareModel=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function clone(source){
    if(!source||typeof source.Update!=='function')throw TypeError('A physical CurveAppClass is required');
    var copy=Object.create(Object.getPrototypeOf(source));
    Object.keys(source).forEach(function(key){
      var value=source[key];
      copy[key]=Array.isArray(value)?value.slice():value;
    });
    return copy;
  }
  function pair(source){
    var a=clone(source),b=clone(source);
    // Compare must never silently aim at two different curvature-dependent horizons.
    a.viewcenterHorizon=3;
    b.viewcenterHorizon=3;
    b.showModel=2; // Exact κ = 0, not an approximating huge radius.
    a.Update();b.Update();
    return {A:a,B:b};
  }
  function invariant(pairResult){
    var a=pairResult.A,b=pairResult.B;
    var fields=['Height','FocalLengthField','Pan','Nick','Roll','deviceRatio',
      'viewcenterHorizon','camViewAngle','showGrid'];
    var groups=['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType',
      'ObjSidePos','ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'];
    return fields.every(function(key){return a[key]===b[key];})&&
      groups.every(function(key){return JSON.stringify(a[key])===JSON.stringify(b[key]);});
  }
  // Opt-in Compare probe only. Extract target vertices from the *current* authored
  // physical scene, never the archived 12-tower diagnostic fixture. The preview
  // renderer does not consume the GPU result: these are ray samples, not pixels.
  function probeTargets(model, options, deps){
    options=options||{};deps=deps||{};
    var size=options.count===undefined?256:options.count;
    if(!Number.isInteger(size)||size<8||size>1024)throw RangeError('Probe count must be 8–1024');
    var composition=deps.composition, silhouette=deps.silhouette,surfaces=deps.surfaces;
    if(!composition||!silhouette||!surfaces)throw TypeError('Physical scene dependencies are required');
    var geometry=model.showModel===2?'flat':'globe',radius=model.rEarth,eye=model.Height;
    if(!(radius>0&&eye>=0))throw RangeError('Invalid physical observer');
    var scene=composition.composeOpticalMain(Object.assign({},model,{geometryRadius:radius}),
      geometry==='globe',{physicalWorld:true});
    var metric=surfaces.createFromCurvature(geometry==='globe'?1/radius:0);
    var seen=new Set(),all=[];
    scene.ranges.filter(function(r){return r.role==='objects';}).forEach(function(r){
      for(var i=r.start;i<r.end;i++){
        var vertices=scene.scene.primitives[i].points||[];
        function add(p){
          var c=silhouette.coordinate(p,geometry,radius,eye,metric);
          if(!(c.distance>0&&c.distance<=100000&&c.height>=0&&
            (geometry==='flat'||c.distance<radius*Math.PI/2)))return;
          var target=metric.surfacePoint2(c.distance,c.height);
          if(Math.abs(Math.atan2(target[1]-eye,target[0]))>1.2)return;
          var key=target[0].toPrecision(13)+':'+target[1].toPrecision(13)+':'+c.azimuth.toPrecision(10);
          if(seen.has(key))return;seen.add(key);
          all.push({target:target,azimuth:c.azimuth});
        }
        vertices.forEach(add);
        if(options.includeEdges!==false){
          // These are actual straight edges of authored polygons/strokes, not
          // arbitrary 2D projected interpolation or synthetic replicated rays.
          for(var edge=1;edge<vertices.length;edge++){
            var a=vertices[edge-1],b=vertices[edge];
            for(var fraction=1;fraction<4;fraction++){
              var t=fraction/4;
              add(a.map(function(value,k){return value*(1-t)+b[k]*t;}));
            }
          }
        }
      }
    });
    // Uniformly cover all objects rather than selecting only the first bank.
    var count=Math.min(size,all.length),sampled=[];
    for(var j=0;j<count;j++)sampled.push(all[Math.floor((j+0.5)*all.length/count)]);
    return {geometry:geometry,radius:radius,observerHeight:eye,
      atmosphere:options.atmosphere,points:sampled,sourcePointCount:all.length};
  }
  function probeReport(points,cpu,gpu,viewportHeight){
    if(!Array.isArray(points)||!cpu||!gpu||cpu.results.length!==points.length||
       gpu.results.length!==points.length)throw TypeError('Mismatched Compare probe responses');
    var mismatches=0,uncertain=0,maxShift=0,overOnePx=0,matchedVisible=0;
    var scale=(viewportHeight||1080)/(2*Math.tan(Math.PI/8));
    var rows=points.map(function(p,i){
      var a=cpu.results[i],b=gpu.results[i];
      var shift=Number.isFinite(a.angle)&&Number.isFinite(b.angle)?
        Math.abs(Math.tan(a.angle)-Math.tan(b.angle))*scale:null;
      if(a.status!==b.status)mismatches++;
      if(a.status==='indeterminate'||b.status==='indeterminate'||
        a.status==='solver_failed'||b.status==='solver_failed')uncertain++;
      if(shift!==null){maxShift=Math.max(maxShift,shift);if(shift>1)overOnePx++;}
      if(a.status==='visible'&&b.status==='visible')matchedVisible++;
      return {azimuth:p.azimuth,cpu:a.status,gpu:b.status,
        cpuAngle:a.angle,gpuAngle:b.angle,shiftPx:shift};
    });
    return {count:rows.length,rows:rows,statusMismatches:mismatches,
      uncertain:uncertain,overOnePixel:overOnePx,maxAngleProxyShiftPx:maxShift,
      matchedVisible:matchedVisible,actualFrameCompared:false,
      visualEquivalenceProven:false,productionAuthorized:false};
  }
  return Object.freeze({pair:pair,clone:clone,invariant:invariant,
    probeTargets:probeTargets,probeReport:probeReport});
}));
