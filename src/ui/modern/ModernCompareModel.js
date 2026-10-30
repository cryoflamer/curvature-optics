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
  // Replay only disputed GPU rays in the independent f64 ground-event tracer.
  // This is evidence about the GPU launch angle, not proof of raster parity.
  function probeGroundReview(request,cpu,gpu,rayTracer,limit){
    if(!request||!cpu||!gpu||!rayTracer||!Array.isArray(request.targets)||
      !Array.isArray(cpu.results)||!Array.isArray(gpu.results)||
      request.targets.length!==cpu.results.length||cpu.results.length!==gpu.results.length)
      throw TypeError('Mismatched Compare ground review inputs');
    var profile=rayTracer.atmosphere(request.atmosphere,request.profileOptions);
    var reviews=[],total=0,maximum=limit===undefined?64:limit;
    if(!Number.isInteger(maximum)||maximum<0)throw RangeError('Invalid ground review limit');
    for(var i=0;i<cpu.results.length;i++){
      var a=cpu.results[i],b=gpu.results[i];
      if(a.status===b.status)continue;
      total++;
      if(reviews.length>=maximum)continue;
      var review={targetIndex:i,cpuStatus:a.status,gpuStatus:b.status,
        gpuAngle:b.angle,gpuPathLength:b.pathLength};
      if(!Number.isFinite(b.angle)||!Number.isFinite(b.pathLength)||b.pathLength<=0){
        review.groundReplay={status:'unavailable',reason:'GPU angle/path unavailable'};
      }else{
        try{
          var traced=rayTracer.trace({geometry:request.geometry,radius:request.radius,
            profile:profile,observerHeight:request.observerHeight,angle:b.angle,
            length:b.pathLength,step:request.controls&&request.controls.step||50,
            eventSubsteps:request.controls&&request.controls.eventSubsteps||8,
            contactTolerance:request.controls&&request.controls.contactTolerance||1e-6});
          review.groundReplay={status:'measured',hitGround:traced.hitGround,
            event:traced.event?{kind:traced.event.kind,contact:traced.event.contact,
              pathLength:traced.event.pathLength}:null,
            remainingPathMetres:traced.hitGround?Math.max(0,b.pathLength-traced.travelled):null};
        }catch(error){review.groundReplay={status:'unavailable',reason:String(error.message||error)};}
      }
      reviews.push(review);
    }
    return {disagreements:total,reviews:reviews,truncated:total>reviews.length,
      independentCpuReplay:true,excludedFromGpuTimings:true,
      renderedSilhouetteCompared:false};
  }
  // #140.12.10: capture the exact requests made by the real CPU adaptive
  // outline/fill field. Asynchronously seed a bounded subset of those targets
  // with WebGPU; new adaptive requests still use the unmodified CPU oracle.
  function rayKey(d,h){return d.toPrecision(13)+','+h.toPrecision(13);}
  function gpuFieldRequest(model,records,count,surfaces,branch){
    if(!Array.isArray(records)||!surfaces||typeof surfaces.createFromCurvature!=='function'||
        !Number.isInteger(count)||count<1||count>1024)
      throw TypeError('Invalid Compare GPU field discovery inputs');
    var geometry=model.showModel===2?'flat':'globe',radius=model.rEarth,eye=model.Height;
    if(!(radius>0&&eye>=0))throw RangeError('Invalid ray field geometry');
    var metric=surfaces.createFromCurvature(geometry==='globe'?1/radius:0);
    var seen=new Set(),qualified=[];
    records.forEach(function(record){
      var d=record[0],h=record[1];
      if(!Number.isFinite(d)||!Number.isFinite(h)||d<=0||d>100000||h<0||h>100000||
          (geometry==='globe'&&d>=radius*Math.PI/2))return;
      var key=rayKey(d,h);
      if(seen.has(key))return;
      var target=metric.surfacePoint2(d,h);
      if(!Array.isArray(target)||target.length!==2||target.some(function(x){return !Number.isFinite(x);})||
          target[0]<=0||target[0]>100000||Math.abs(target[1])>100000||
          Math.abs(Math.atan2(target[1]-eye,target[0]))>1.2)return;
      seen.add(key);qualified.push({key:key,d:d,h:h,target:target});
    });
    var selected=[];
    var size=Math.min(count,qualified.length);
    for(var i=0;i<size;i++)selected.push(qualified[Math.floor((i+0.5)*qualified.length/size)]);
    return {request:{branch:branch,geometry:geometry,radius:radius,observerHeight:eye,
        atmosphere:'standard',controls:{step:50,targetTolerance:0.005,eventSubsteps:8},
        targets:selected.map(function(q){return q.target;})},
      selected:selected,discovered:records.length,qualified:qualified.length};
  }
  function gpuRayField(bundle,response){
    if(!bundle||!response||!Array.isArray(bundle.selected)||
        !Array.isArray(response.results)||bundle.selected.length!==response.results.length)
      throw TypeError('Invalid Compare GPU ray field response');
    var map=new Map(),failures=0;
    bundle.selected.forEach(function(point,i){
      var result=response.results[i];
      if(!result||!Array.isArray(result.target)||result.target.length!==2||
          result.target[0]!==point.target[0]||result.target[1]!==point.target[1])
        throw RangeError('GPU ray field target order mismatch');
      if(result.status==='solver_failed'){failures++;return;}
      if(!['visible','blocked','indeterminate'].includes(result.status)||!Number.isFinite(result.angle))
        throw RangeError('Invalid GPU ray field result');
      map.set(point.key,Object.freeze({status:result.status,angle:result.angle,
        residual:result.residual,reason:result.reason,method:'gpu-experimental'}));
    });
    var hits=0,misses=0,exactHits=0;
    function lookup(d,h,exact){
      var result=map.get(rayKey(d,h));
      if(result){hits++;if(exact)exactHits++;return result;}
      misses++;return null;
    }
    return {request:bundle.request,sample:function(d,h){return lookup(d,h,false);},
      exact:function(d,h){return lookup(d,h,true);},
      stats:function(){return {seeds:map.size,failedGpuSeeds:failures,
        gpuHits:hits,gpuExactHits:exactHits,cpuFallbackRequests:misses};}};
  }
  // #140.12.11: replay the SAME selected adaptive requests using their
  // original CPU f64 oracle outputs. This is a control for cache/injection
  // effects; it does not compute a new CPU solution or use a GPU result.
  function cpuReplayField(bundle,records){
    if(!bundle||!bundle.request||!Array.isArray(bundle.selected)||!Array.isArray(records))
      throw TypeError('Invalid Compare CPU replay inputs');
    var originals=new Map();
    records.forEach(function(row){
      if(!row||!Number.isFinite(row.d)||!Number.isFinite(row.h)||!row.result)return;
      var result=row.result;
      if(!['visible','blocked','indeterminate'].includes(result.status)||
          !Number.isFinite(result.angle))return;
      originals.set(rayKey(row.d,row.h),Object.freeze({status:result.status,
        angle:result.angle,residual:result.residual,reason:result.reason,
        method:'cpu-replay-experimental'}));
    });
    var map=new Map(),missing=0;
    bundle.selected.forEach(function(point){
      var result=originals.get(point.key);
      if(result)map.set(point.key,result);else missing++;
    });
    var hits=0,exactHits=0,misses=0;
    function lookup(d,h,exact){
      var result=map.get(rayKey(d,h));
      if(result){hits++;if(exact)exactHits++;return result;}
      misses++;return null;
    }
    return {request:bundle.request,kind:'cpu-replay-control',
      sample:function(d,h){return lookup(d,h,false);},
      exact:function(d,h){return lookup(d,h,true);},
      stats:function(){return {seeds:map.size,missingCpuSeeds:missing,
        replayHits:hits,replayExactHits:exactHits,cpuFallbackRequests:misses};}};
  }
  // Pixel equality and adaptive-work equality are separate evidence.
  function frameControlCounts(reference,replay){
    function pick(r){return r?{contours:r.drawn,fillTriangles:r.fillTriangles,
      unresolved:r.unresolved}:null;}
    var a=pick(reference),b=pick(replay);
    return {reference:a,replay:b,sameCounts:!!a&&!!b&&
      a.contours===b.contours&&a.fillTriangles===b.fillTriangles&&
      a.unresolved===b.unresolved};
  }
  function compareFramePixels(a,b){
    if(!a||!b||!a.getContext||!b.getContext||a.width!==b.width||a.height!==b.height)
      return {status:'unavailable',reason:'Canvas sizes differ or no readable canvas'};
    try{
      var ac=a.getContext('2d'),bc=b.getContext('2d');
      if(!ac||!bc||!ac.getImageData||!bc.getImageData)
        return {status:'unavailable',reason:'Pixel readback not supported'};
      var first=ac.getImageData(0,0,a.width,a.height).data,
        second=bc.getImageData(0,0,b.width,b.height).data;
      var strictPixels=0,significantPixels=0,maxChannelDelta=0;
      for(var i=0;i<first.length;i+=4){
        var diff=Math.max(Math.abs(first[i]-second[i]),Math.abs(first[i+1]-second[i+1]),
          Math.abs(first[i+2]-second[i+2]),Math.abs(first[i+3]-second[i+3]));
        if(diff>0)strictPixels++;
        if(diff>8)significantPixels++;
        maxChannelDelta=Math.max(maxChannelDelta,diff);
      }
      return {status:'measured',width:a.width,height:a.height,totalPixels:a.width*a.height,
        strictPixels:strictPixels,significantPixels:significantPixels,maxChannelDelta:maxChannelDelta,
        // An 8/255 channel difference filter is not a 1-pixel contour metric.
        visualEquivalenceProven:false};
    }catch(error){return {status:'unavailable',reason:String(error.message||error)};}
  }
  return Object.freeze({pair:pair,clone:clone,invariant:invariant,
    probeTargets:probeTargets,probeReport:probeReport,probeGroundReview:probeGroundReview,
    gpuFieldRequest:gpuFieldRequest,gpuRayField:gpuRayField,
    cpuReplayField:cpuReplayField,frameControlCounts:frameControlCounts,
    compareFramePixels:compareFramePixels});
}));
