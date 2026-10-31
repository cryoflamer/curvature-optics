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
  // #140.12.12: GPU-first optical field.  Grid coordinates come directly
  // from the authored physical scene; NOT from a CPU reference frame or
  // observed CPU oracle calls.  This is a bounded coarse interpolation
  // experiment, not a numerically certified shooting replacement.
  function gpuFirstGrid(model,count,deps,options){
    options=options||{};
    if(options.layout!==undefined&&!['uniform','near-ground','vertical-32','distance-focused'].includes(options.layout))
      throw RangeError('Invalid GPU-first grid height layout');
    if(options.layout==='vertical-32'&&count<1024)
      throw RangeError('Vertical-32 GPU-first grid requires at least 1024 targets');
    if(![128,256,512,1024,2048,4096,4608,8192].includes(count)||!deps||!deps.composition||
        !deps.silhouette||!deps.surfaces||!deps.branch)
      throw TypeError('Invalid GPU-first grid inputs');
    var geometry=model.showModel===2?'flat':'globe',radius=model.rEarth,eye=model.Height;
    if(!(radius>0&&eye>=0))throw RangeError('Invalid GPU-first observer');
    var metric=deps.surfaces.createFromCurvature(geometry==='globe'?1/radius:0);
    var composed=deps.composition.composeOpticalMain(Object.assign({},model,
      {geometryRadius:radius}),geometry==='globe',{physicalWorld:true});
    var distances=[],maxH=0,vertexCount=0;
    composed.ranges.filter(function(r){return r.role==='objects';}).forEach(function(r){
      for(var i=r.start;i<r.end;i++)(composed.scene.primitives[i].points||[]).forEach(function(p){
        var c=deps.silhouette.coordinate(p,geometry,radius,eye,metric);
        if(!Number.isFinite(c.distance)||!Number.isFinite(c.height)||c.distance<=0||
            c.distance>100000||c.height<0)return;
        vertexCount++;distances.push(c.distance);maxH=Math.max(maxH,c.height);
      });
    });
    if(!distances.length)throw Error('GPU-first grid requires positive-distance physical objects');
    distances.sort(function(a,b){return a-b;});
    var nh=options.layout==='vertical-32'?32:(count>=2048?16:8),nd=count/nh;
    if(count===128){nd=32;nh=4;}
    var dMin=100,dMax=99900,objectMin=distances[0],objectMax=distances[distances.length-1];
    // Uniform quantiles give scene towers most of the columns, while a small
    // logarithmic backbone covers foreground/ground guides outside the towers.
    var samples=[];
    var objectColumns=nd-Math.max(6,Math.floor(nd/5));
    for(var j=0;j<objectColumns;j++){
      var q=(j+0.5)/objectColumns,at=Math.floor(q*(distances.length-1));
      samples.push(Math.min(dMax,Math.max(dMin,distances[at])));
    }
    for(var k=0;k<nd-objectColumns;k++){
      var t=k/(nd-objectColumns-1);
      samples.push(dMin*Math.pow(dMax/dMin,t));
    }
    samples.push(dMin,dMax);
    samples.sort(function(a,b){return a-b;});
    // Keep the two outer limits and select a monotone fixed-width axis.
    var deduplicated=[];
    samples.forEach(function(d){if(!deduplicated.length||d-deduplicated[deduplicated.length-1]>1e-4)
      deduplicated.push(d);});
    // Fill duplicated tower-distance quantiles by splitting the widest
    // unsampled interval INSIDE the object region, not by spending scarce
    // GPU slots on empty tens-of-kilometres far-field distances.
    while(deduplicated.length<nd){
      var gap=-1,at=-1,stop=Math.min(dMax,objectMax+100);
      for(var n=1;n<deduplicated.length;n++){
        var a=deduplicated[n-1],b=deduplicated[n];
        if(a>stop)break;
        var candidate=Math.min(b,stop)-a;
        if(candidate>gap){gap=candidate;at=n;}
      }
      if(at<0||gap<1e-5)throw Error('GPU-first scene grid has degenerate distance bounds');
      deduplicated.splice(at,0,(deduplicated[at-1]+Math.min(deduplicated[at],stop))/2);
    }
    var axisD=[dMin];
    for(var x=1;x<nd-1;x++)axisD.push(deduplicated[Math.floor(x*(deduplicated.length-1)/(nd-1))]);
    axisD.push(dMax);
    for(var n=1;n<axisD.length;n++)if(axisD[n]<=axisD[n-1])
      axisD[n]=axisD[n-1]+1e-5;
    // #140.12.17: redistribute the SAME number of distance columns towards
    // the nearest 6 km, preserving the scene-derived baseline distribution
    // within each segment (rather than sampling a uniform artificial scene).
    // Neither CPU rays nor CPU frame pixels decide where GPU samples go.
    if(options.layout==='distance-focused'){
      var focusLimit=Math.min(6000,Math.max(axisD[0]+1,objectMax));
      if(focusLimit>=axisD[axisD.length-1])focusLimit=axisD[axisD.length-2];
      var nearAxis=axisD.filter(function(d){return d<focusLimit;});
      nearAxis.push(focusLimit);
      var farAxis=[focusLimit].concat(axisD.filter(function(d){return d>focusLimit;}));
      if(nearAxis.length<2||farAxis.length<2)
        throw Error('Distance-focused GPU grid requires both near and far coverage');
      function resample(axis,fraction){
        var at=fraction*(axis.length-1),lo=Math.floor(at),hi=Math.min(axis.length-1,lo+1);
        return axis[lo]+(axis[hi]-axis[lo])*(at-lo);
      }
      var nearColumns=Math.max(3,Math.min(nd-3,Math.round(nd*0.45)));
      var focused=[];
      for(var f=0;f<nearColumns;f++)
        focused.push(resample(nearAxis,f/(nearColumns-1)));
      for(var g=0;g<nd-nearColumns;g++)
        focused.push(resample(farAxis,(g+1)/(nd-nearColumns)));
      axisD=focused;
      for(var k=1;k<nd;k++)if(!(axisD[k]>axisD[k-1]))
        throw Error('Distance-focused GPU grid is not strictly monotone');
    }
    var heightMax=Math.max(20,maxH+2),axisH=[];
    for(var z=0;z<nh;z++)axisH.push(heightMax*Math.pow(z/(nh-1),1.25));
    // #140.12.16: same ray budget, but shift vertical samples towards ground
    // *only* for columns near the observer. Far columns retain the original
    // height axis. This is a hypothesis test for near-tower base artifacts,
    // not an extra GPU pass, an f64 oracle, or an accuracy certification.
    var local=['near-ground','vertical-32','distance-focused'].includes(options.layout),heightColumns=null;
    if(local){
      heightColumns=axisD.map(function(d){
        var proximity=Math.max(0,Math.min(1,(6000-d)/5000));
        var exponent=1.25+1.4*proximity*proximity;
        var heights=[];
        for(var row=0;row<nh;row++)
          heights.push(heightMax*Math.pow(row/(nh-1),exponent));
        return heights;
      });
    }
    var targets=[];
    axisD.forEach(function(d,column){
      (heightColumns?heightColumns[column]:axisH).forEach(function(h){
        targets.push(metric.surfacePoint2(d,h));
      });
    });
    var request={branch:deps.branch,geometry:geometry,radius:radius,observerHeight:eye,
      atmosphere:'standard',controls:{step:50,targetTolerance:0.005,eventSubsteps:8},targets:targets};
    return {request:request,distances:axisD,heights:axisH,heightColumns:heightColumns,
      columns:nd,rows:nh,objectVertices:vertexCount,
      objectDistanceRange:[objectMin,objectMax],maxHeight:heightMax,
      method:options.layout==='distance-focused'?'authored-scene-near-distance-height-grid':
        local?'authored-scene-local-near-ground-height-grid':
        'authored-physical-scene-distance-height-grid',
      layout:options.layout||'uniform',cpuOracleDiscovery:false};
  }
  // #140.12.15: the GPU session is intentionally bounded to 1024 targets.
  // Split a denser physical scene grid into deterministic sub-batches without
  // a CPU shooting oracle or a second CPU frame-discovery pass. Stitching
  // must preserve the exact row-major order consumed by gpuFirstRayField.
  function gpuFirstBatchRequests(grid,maxBatch){
    if(!grid||!grid.request||!Array.isArray(grid.request.targets)||
        grid.request.targets.length!==grid.columns*grid.rows)
      throw TypeError('Invalid GPU-first grid batch source');
    if(!Number.isInteger(maxBatch)||maxBatch<1||maxBatch>1024)
      throw RangeError('GPU-first batch capacity must be 1–1024');
    var requests=[];
    for(var start=0;start<grid.request.targets.length;start+=maxBatch)
      requests.push(Object.assign({},grid.request,{controls:Object.assign({},grid.request.controls),
        targets:grid.request.targets.slice(start,start+maxBatch)}));
    return requests;
  }
  function gpuFirstRayField(grid,response,surfaces,options){
    options=options||{};
    if(!grid||!grid.request||!Array.isArray(grid.distances)||!Array.isArray(grid.heights)||
        !response||!Array.isArray(response.results)||!surfaces||
        response.results.length!==grid.request.targets.length||
        response.results.length!==grid.columns*grid.rows)
      throw TypeError('Invalid GPU-first response');
    var r=grid.request,points=response.results,failures=0,lookupCount=0,
      exactCount=0,mixedCells=0,extrapolated=0,uncertain=0,cache=new Map(),
      strictRejected=0,strictMixed=0,strictOutOfDomain=0,strictInvalid=0,
      candidates=[],refinements=new Map(),refinementHits=0,refinementFailures=0;
    // Opt-in #140.12.18 sparse GPU answers are selected by the FIRST GPU B
    // frame's own queries, never by CPU pixels or CPU shooting. An exact
    // lookup replacement is deliberately local: no unvalidated field-wide
    // correction or guessed visibility is propagated across cell boundaries.
    if(options.refinements){
      if(!Array.isArray(options.refinements))throw TypeError('Invalid GPU refinement samples');
      var metricCheck=surfaces.createFromCurvature(r.geometry==='globe'?1/r.radius:0);
      options.refinements.forEach(function(item){
        if(!item||!Number.isFinite(item.d)||!Number.isFinite(item.h)||
            !item.result||!Array.isArray(item.result.target))
          throw TypeError('Invalid GPU refinement sample');
        var target=metricCheck.surfacePoint2(item.d,item.h);
        if(item.result.target[0]!==target[0]||item.result.target[1]!==target[1])
          throw RangeError('GPU refinement target/order mismatch');
        var key=item.d+','+item.h;
        if(refinements.has(key))throw RangeError('Duplicate GPU refinement sample');
        refinements.set(key,item.result);
        if(item.result.status==='solver_failed'||!Number.isFinite(item.result.angle))
          refinementFailures++;
      });
    }
    for(var i=0;i<points.length;i++){
      if(!Array.isArray(points[i].target)||points[i].target.length!==2||
          points[i].target[0]!==r.targets[i][0]||points[i].target[1]!==r.targets[i][1])
        throw RangeError('GPU-first response target order mismatch');
      if(points[i].status==='solver_failed'||!Number.isFinite(points[i].angle))failures++;
    }
    var metric=surfaces.createFromCurvature(r.geometry==='globe'?1/r.radius:0);
    function direct(d,h){var p=metric.surfacePoint2(d,h);
      return Math.atan2(p[1]-r.observerHeight,p[0]);}
    function interval(a,x){
      if(x<=a[0])return 0;
      if(x>=a[a.length-1])return a.length-2;
      var lo=0,hi=a.length-1;
      while(hi-lo>1){var middle=(lo+hi)>>1;if(a[middle]<=x)lo=middle;else hi=middle;}
      return lo;
    }
    function solve(d,h,exact){
      if(!Number.isFinite(d)||!Number.isFinite(h)||!(d>0)||h<0)
        throw RangeError('Invalid GPU-first field sample');
      lookupCount++;if(exact)exactCount++;
      var key=d+','+h,cached=cache.get(key);
      if(cached)return cached;
      if(refinements.has(key)){
        var refined=refinements.get(key);
        if(refined.status!=='solver_failed'&&Number.isFinite(refined.angle)){
          refinementHits++;
          var directResult=Object.freeze({status:refined.status,angle:refined.angle,
            residual:refined.residual===undefined?null:refined.residual,
            method:'gpu-first-sparse-direct',reason:'Exact queried GPU refinement; no CPU fallback'});
          cache.set(key,directResult);return directResult;
        }
      }
      var di=interval(grid.distances,d),d0=grid.distances[di],d1=grid.distances[di+1];
      var u=Math.max(0,Math.min(1,(d-d0)/(d1-d0)));
      var indices=[],weights=[],extrapolatedHeight=false;
      // Near-ground grid cells have different vertical coordinates in each
      // distance column. Interpolate vertically *within* each column before
      // blending those two answers across distance; a shared hi/v is invalid.
      for(var side=0;side<2;side++){
        var column=di+side,axis=grid.heightColumns?
          grid.heightColumns[column]:grid.heights;
        var hi=interval(axis,h),low=axis[hi],high=axis[hi+1];
        var v=Math.max(0,Math.min(1,(h-low)/(high-low)));
        if(h<low||h>high)extrapolatedHeight=true;
        indices.push(column*grid.rows+hi,column*grid.rows+hi+1);
        weights.push((side===0?1-u:u)*(1-v),(side===0?1-u:u)*v);
      }
      if(d<d0||d>d1||extrapolatedHeight)extrapolated++;
      var valid=[];
      indices.forEach(function(index,j){var point=points[index];
        if(point.status!=='solver_failed'&&Number.isFinite(point.angle))
          valid.push({point:point,index:index,weight:weights[j],order:j});
      });
      if(!valid.length){uncertain++;var failure={status:'solver_failed',angle:null,
        reason:'GPU-first grid cell has no valid GPU nodes',method:'gpu-first-grid-unresolved'};
        cache.set(key,failure);return failure;}
      var classes=new Set(valid.map(function(a){return a.point.status;}));
      if(classes.size>1)mixedCells++;
      // #140.12.35 opt-in *diagnostic* strict gate: no implied visibility
      // across mixed/failed/uncertain/out-of-domain grid cells. This never
      // estimates the true boundary and must not be used as production proof.
      var outside=extrapolatedHeight||d<d0||d>d1,
        invalid=valid.length!==4||classes.has('indeterminate')||
          classes.has('solver_failed')||
          Array.from(classes).some(function(status){return status!=='visible'&&status!=='blocked';}),
        unsafe=outside||invalid||classes.size!==1;
      if(options.strictVisibility&&unsafe){
        strictRejected++;if(outside)strictOutOfDomain++;
        if(classes.size!==1)strictMixed++;if(invalid)strictInvalid++;
      }
      var nearest=valid.reduce(function(best,item){return !best||item.weight>best.weight?item:best;},null);
      var status=classes.size===1?valid[0].point.status:nearest.point.status;
      // Subtract the geometric arrival angle before interpolation; this
      // preserves the analytically known strong distance/height component.
      var total=0,correction=0,minCorrection=Infinity,maxCorrection=-Infinity;
      valid.forEach(function(item){var col=Math.floor(item.index/grid.rows),row=item.index%grid.rows;
        var nodeHeights=grid.heightColumns?grid.heightColumns[col]:grid.heights;
        var localCorrection=item.point.angle-direct(grid.distances[col],nodeHeights[row]);
        correction+=item.weight*localCorrection;
        minCorrection=Math.min(minCorrection,localCorrection);
        maxCorrection=Math.max(maxCorrection,localCorrection);
        total+=item.weight;
      });
      var angle=direct(d,h)+(total?correction/total:0);
      if(options.strictVisibility&&unsafe)status='indeterminate';
      if(status==='indeterminate')uncertain++;
      var riskFlags=[];if(classes.size!==1)riskFlags.push('mixed-status');
      if(outside)riskFlags.push('out-of-grid-clamp');
      if(invalid)riskFlags.push('invalid-or-uncertain-node');
      var record=Object.freeze({status:status,angle:angle,residual:null,
        method:options.strictVisibility?'gpu-first-strict-diagnostic':'gpu-first-grid-approximation',
        riskFlags:riskFlags,reason:options.strictVisibility&&unsafe?
          'Uncertified grid cell: refinement required; NOT physical blocked':
          classes.size>1?'Mixed GPU visibility nodes; nearest status, NOT certified':
          'Interpolated GPU grid'});
      cache.set(key,record);
      if(options.collectCandidates){
        var causes=[];
        if(classes.size>1)causes.push('mixed-status');
        if(status==='indeterminate')causes.push('indeterminate');
        if(extrapolatedHeight||d<d0||d>d1)causes.push('extrapolated');
        var spread=Number.isFinite(minCorrection)&&Number.isFinite(maxCorrection)?
          (maxCorrection-minCorrection)*1e6:0;
        if(spread>0.15)causes.push('angular-gradient');
        // Prefer actual status risk, then locally rapidly varying angles;
        // below 6 km is a small tie-breaker, not a mandatory restriction.
        var score=(status==='indeterminate'?1000:0)+(classes.size>1?500:0)+
          (extrapolatedHeight?160:0)+(d<d0||d>d1?160:0)+
          Math.min(200,spread*15)+(d<=6000?5:0);
        if(causes.length)candidates.push({d:d,h:h,score:score,causes:causes,
          dCell:di,hCell:Math.floor(h/Math.max(0.5,grid.maxHeight||75)*16)});
      }
      return record;
    }
    function stats(){return {solves:0,hits:Math.max(0,lookupCount-cache.size),
      interpolations:lookupCount,shootRK4Calls:0,shootEvaluations:0,
      exactSolveMs:0,fallbacks:0,experimentalGpu:{kind:'gpu-first-grid',
        gpuSeedNodes:points.length,failedGpuNodes:failures,
        refinementSamples:refinements.size,refinementFailures:refinementFailures,
        refinementHits:refinementHits,gpuHits:lookupCount,
        gpuExactHits:exactCount,cpuFallbackRequests:0,mixedStatusLookups:mixedCells,
        extrapolatedLookups:extrapolated,uncertainLookups:uncertain,
        uniqueRequests:cache.size,strictVisibility:options.strictVisibility===true,
        strictRejected:strictRejected,strictMixed:strictMixed,
        strictOutOfDomain:strictOutOfDomain,strictInvalid:strictInvalid,
        approximate:true,productionAuthorized:false}};}
    function refinementCandidates(limit){
      if(!Number.isInteger(limit)||limit<0||limit>1024)
        throw RangeError('Invalid GPU refinement budget');
      // Spread the budget over distance/height cells before selecting second
      // candidates from a cell. Original renderer requests are deterministic.
      var sorted=candidates.slice().sort(function(a,b){return b.score-a.score||a.d-b.d||a.h-b.h;});
      var selected=[],seen=new Set(),cellPass=new Set();
      for(var pass=0;pass<2&&selected.length<limit;pass++){
        sorted.forEach(function(item){
          if(selected.length>=limit)return;
          var key=item.d+','+item.h,cell=item.dCell+':'+item.hCell;
          if(seen.has(key)||(pass===0&&cellPass.has(cell)))return;
          seen.add(key);cellPass.add(cell);
          selected.push({d:item.d,h:item.h,score:item.score,causes:item.causes});
        });
      }
      return selected;
    }
    return {request:r,fullCoverageGrid:true,sample:function(d,h){return solve(d,h,false);},
      exact:function(d,h){return solve(d,h,true);},stats:stats,
      refinementCandidates:refinementCandidates};
  }
  // #140.12.20: observe the ACTUAL target calls made by the physical B
  // silhouette/fill/ground renderer. This wrapper never alters its answer.
  // h=0 requests may be guides or object feet; h>0 is a height tier, NOT
  // proof that a query belongs to a particular tower primitive.
  function captureGpuRendererQueries(field,options){
    options=options||{};
    if(!field||!field.fullCoverageGrid||!field.request||
        typeof field.sample!=='function'||typeof field.exact!=='function'||
        typeof field.stats!=='function')
      throw TypeError('Invalid GPU field for renderer-query capture');
    var maximumDistance=options.maximumDistance===undefined?6000:options.maximumDistance,
      maximumHeight=options.maximumHeight===undefined?20:options.maximumHeight;
    if(!(maximumDistance>0&&maximumDistance<=100000&&maximumHeight>0&&maximumHeight<=1000))
      throw RangeError('Invalid renderer-query capture bounds');
    var unique=new Map(),calls=0,qualifyingCalls=0;
    function record(d,h,method){
      // Do not record synthetic, invented or CPU-oracle requests. The original
      // field is evaluated first so errors/values are identical to baseline.
      var result=field[method](d,h);calls++;
      if(d>0&&d<=maximumDistance&&h>=0&&h<=maximumHeight&&
          Number.isFinite(d)&&Number.isFinite(h)){
        qualifyingCalls++;
        var key=d+','+h,entry=unique.get(key);
        if(!entry){entry={d:d,h:h,kind:h===0?'ground-height':'low-height',
          gridStatus:result.status,gridAngle:result.angle,
          riskFlags:Array.isArray(result.riskFlags)?result.riskFlags.slice():[],
          sampleCalls:0,exactCalls:0};unique.set(key,entry);}
        if(method==='exact')entry.exactCalls++;else entry.sampleCalls++;
      }
      return result;
    }
    // Distribute the capped batch across distance bins, rather than letting
    // the first object's thousands of adaptive edge points consume it.
    function select(limit){
      if(!Number.isInteger(limit)||limit<1||limit>1024)
        throw RangeError('Invalid renderer-query audit budget');
      var groups=Array.from({length:8},function(){return [];});
      unique.forEach(function(entry){
        var bin=Math.min(3,Math.floor(entry.d/maximumDistance*4)),
          tier=entry.h===0?1:0;
        groups[bin*2+tier].push(entry);
      });
      groups.forEach(function(group){group.sort(function(a,b){
        // Favor lower targets and actual exact-vertex requests before interior
        // samples; preserve deterministic ordering among otherwise equal rays.
        return (a.h-b.h)||(b.exactCalls-a.exactCalls)||(a.d-b.d);
      });});
      var selected=[],seen=new Set(),pointers=groups.map(function(){return 0;});
      // Sample evenly throughout each bin, not just its first few requests.
      var bins=groups.map(function(group){
        var width=Math.min(group.length,limit);
        if(!width)return [];
        return Array.from({length:width},function(_,i){
          return group[Math.floor((i+0.5)*group.length/width)];
        });
      });
      while(selected.length<limit){
        var progressed=false;
        // h>0 is the main focus; at most 1/8 of the budget can be ground.
        for(var b of [0,2,4,6,1,3,5,7]){
          if(selected.length>=limit)break;
          if(b%2&&selected.filter(function(x){return x.h===0;}).length>=Math.ceil(limit/8))continue;
          var list=bins[b];
          while(pointers[b]<list.length){
            var item=list[pointers[b]++],key=item.d+','+item.h;
            if(seen.has(key))continue;
            selected.push(Object.assign({},item));seen.add(key);progressed=true;break;
          }
        }
        if(!progressed)break;
      }
      return selected;
    }
    return {request:field.request,fullCoverageGrid:true,
      sample:function(d,h){return record(d,h,'sample');},
      exact:function(d,h){return record(d,h,'exact');},
      stats:function(){return field.stats();},
      candidates:function(){return Array.from(unique.values()).map(function(row){return Object.assign({},row);});},
      audit:function(){return {rendererCalls:calls,qualifyingCalls:qualifyingCalls,
        uniqueQualifiedTargets:unique.size,maximumDistanceMetres:maximumDistance,
        maximumHeightMetres:maximumHeight};},select:select};
  }
  // #140.12.21: select the actually indeterminate renderer queries, not
  // CPU-identified errors. Keep each distance bin represented. The output
  // never changes capture results and is deterministic for the same frame.
  function selectIndeterminateRendererTargets(capture,limit){
    if(!capture||typeof capture.select!=='function'||typeof capture.audit!=='function')
      throw TypeError('Invalid GPU renderer-query capture');
    if(!Number.isInteger(limit)||limit<1||limit>1024)
      throw RangeError('Invalid indeterminate target budget');
    // We need the complete captured set, not the pre-stratified first 128.
    if(typeof capture.candidates!=='function')
      throw TypeError('Renderer-query capture lacks status candidates');
    var all=capture.candidates().filter(function(row){return row.gridStatus==='indeterminate';});
    var groups=Array.from({length:4},function(){return [];});
    all.forEach(function(row){groups[Math.min(3,Math.floor(row.d/6000*4))].push(row);});
    groups.forEach(function(group,bin){
      group.sort(function(a,b){return a.h-b.h||a.d-b.d;});
      // Split the first share of each bin between genuinely near-ground
      // points and heights sampled through the full 0–20 m envelope.
      // Otherwise sorting by height alone can consume all 128 rays on
      // effectively zero-height feet without auditing higher footing edges.
      var quota=Math.min(group.length,Math.ceil(limit/4)),chosen=[],used=new Set();
      for(var j=0;j<quota;j++){
        var index=j%2===0?Math.floor(j/2):
          Math.min(group.length-1,Math.floor((Math.floor(j/2)+0.5)*
            group.length/Math.max(1,Math.floor(quota/2))));
        if(!used.has(index)){chosen.push(group[index]);used.add(index);}
      }
      for(var k=0;chosen.length<quota&&k<group.length;k++)
        if(!used.has(k)){chosen.push(group[k]);used.add(k);}
      groups[bin]=chosen.concat(group.filter(function(_,index){return !used.has(index);}));
    });
    var selected=[],pointers=[0,0,0,0],max=Math.min(limit,all.length);
    while(selected.length<max){
      var moved=false;
      for(var bin=0;bin<4 && selected.length<max;bin++){
        if(pointers[bin]<groups[bin].length){
          selected.push(Object.assign({},groups[bin][pointers[bin]++]));moved=true;
        }
      }
      if(!moved)break;
    }
    return selected;
  }
  // Diagnostic status-only override on exact renderer requests. A previously
  // visible or blocked GRID result is never changed; nor is the grid ANGLE.
  // Direct GPU and fine-step GPU statuses must be independently certified as
  // visible/blocked. Indeterminate/failed remain indeterminate; no CPU oracle.
  function gpuStatusQualificationField(field,samples,direct,options){
    options=options||{};
    if(!field||!field.fullCoverageGrid||!field.request||
        typeof field.sample!=='function'||typeof field.exact!=='function'||
        typeof field.stats!=='function'||!Array.isArray(samples)||
        !direct||!Array.isArray(direct.results)||direct.results.length!==samples.length)
      throw TypeError('Invalid GPU status qualification input');
    var useDirect=options.useDirect===true,useFine=options.useFine===true,
      fine=options.fineResults||[],surface=options.surfaces;
    if(!surface||typeof surface.createFromCurvature!=='function')
      throw TypeError('GPU status qualification requires surface geometry');
    if(!Array.isArray(fine))throw TypeError('Invalid fine GPU qualification results');
    var metric=surface.createFromCurvature(field.request.geometry==='globe'?1/field.request.radius:0),
      lookup=new Map(),fineLookup=new Map(),counts={directUpgrades:0,fineUpgrades:0,
        eligibleRendererRequests:0,uniqueUpgradedTargets:0,unconfirmedTargets:0};
    function validStatus(value){return value==='visible'||value==='blocked';}
    function matchTarget(row,result){
      var target=metric.surfacePoint2(row.d,row.h);
      if(!result||!Array.isArray(result.target)||
          result.target[0]!==target[0]||result.target[1]!==target[1])
        throw RangeError('GPU status qualification target/order mismatch');
    }
    samples.forEach(function(row,i){
      if(!row||!Number.isFinite(row.d)||!Number.isFinite(row.h)||
          !(row.d>0)||row.h<0||row.gridStatus!=='indeterminate')
        throw RangeError('GPU status qualification requires indeterminate renderer targets');
      matchTarget(row,direct.results[i]);
      var key=row.d+','+row.h;
      if(lookup.has(key))throw RangeError('Duplicate GPU status qualification target');
      lookup.set(key,direct.results[i]);
    });
    fine.forEach(function(item){
      if(!item||!item.sample||!item.result)throw TypeError('Invalid fine GPU qualification sample');
      matchTarget(item.sample,item.result);
      var key=item.sample.d+','+item.sample.h;
      if(!lookup.has(key)||fineLookup.has(key)||lookup.get(key).status!=='indeterminate')
        throw RangeError('Fine GPU status qualification target not uncertain in direct pass');
      fineLookup.set(key,item.result);
    });
    var previously=new Map();
    function read(d,h,method){
      var original=field[method](d,h),key=d+','+h;
      if(original.status!=='indeterminate'||!lookup.has(key))return original;
      counts.eligibleRendererRequests++;
      var directResult=lookup.get(key),fineResult=fineLookup.get(key),
        chosen=useDirect&&validStatus(directResult.status)?directResult:null,
        source=chosen?'direct-500m':null;
      if(!chosen&&useFine&&directResult.status==='indeterminate'&&fineResult&&
          validStatus(fineResult.status)){
        chosen=fineResult;source='contact-50m';
      }
      if(!chosen||!Number.isFinite(chosen.angle)){
        if(!previously.has(key)){counts.unconfirmedTargets++;previously.set(key,'unconfirmed');}
        return original;
      }
      if(!previously.has(key)){
        counts.uniqueUpgradedTargets++;
        if(source==='direct-500m')counts.directUpgrades++;
        else counts.fineUpgrades++;
        previously.set(key,source);
      }
      return Object.freeze(Object.assign({},original,{status:chosen.status,
        method:'gpu-status-only-'+source,
        reason:'Diagnostic independently solved GPU visibility; original grid angle retained'}));
    }
    return {request:field.request,fullCoverageGrid:true,
      sample:function(d,h){return read(d,h,'sample');},
      exact:function(d,h){return read(d,h,'exact');},
      stats:function(){
        var s=field.stats();
        return Object.assign({},s,{experimentalGpu:Object.assign({},s.experimentalGpu,
          {statusQualification:Object.assign({useDirect:useDirect,useFine:useFine,
            qualifiedTargets:samples.length,fineTargets:fineLookup.size,
            cpuFallbackRequests:0},counts)})});
      },
      qualificationAudit:function(){return Object.assign({useDirect:useDirect,useFine:useFine,
        qualifiedTargets:samples.length,fineTargets:fineLookup.size},counts);}};
  }
  // Compare CPU f64, *interpolated* GPU, and *direct* GPU shooting for exactly
  // the same renderer-requested coordinates. Each comparison is descriptive:
  // CPU is a reference, not a GPU fallback or a source of candidate selection.
  function compareRendererVisibility(samples,cpu,gpu){
    if(!Array.isArray(samples)||!cpu||!gpu||!Array.isArray(cpu.results)||
        !Array.isArray(gpu.results)||cpu.results.length!==samples.length||
        gpu.results.length!==samples.length)
      throw TypeError('Mismatched renderer-visibility audit responses');
    var summary={samples:samples.length,groundHeightSamples:0,lowHeightSamples:0,
      gridVsCpuMismatches:0,directGpuVsCpuMismatches:0,gridVsDirectGpuMismatches:0,
      cpuVisibleGridNonvisible:0,cpuVisibleDirectNonvisible:0,
      gridRecoveredByDirectGpu:0,directGpuRegressions:0,
      matchedAllThree:0,angleComparisons:0,meanAbsoluteGridAngleDeltaArcsec:0,
      meanAbsoluteDirectAngleDeltaArcsec:0,maxAbsoluteGridAngleDeltaArcsec:0,
      maxAbsoluteDirectAngleDeltaArcsec:0,
      statuses:{cpu:{},grid:{},directGpu:{}},distanceBands:{},
      diagnosticCategories:{interpolationStatusCandidate:0,directGpuStatusCandidate:0,
        cpuVisibleBothGpuNonvisible:0,otherDisagreements:0}};
    var gridTotal=0,directTotal=0;
    var rows=samples.map(function(sample,i){
      var a=cpu.results[i],b=gpu.results[i];
      if(!a||!b||!Array.isArray(a.target)||!Array.isArray(b.target)||
          a.target[0]!==b.target[0]||a.target[1]!==b.target[1]||
          !['visible','blocked','indeterminate','solver_failed'].includes(sample.gridStatus))
        throw RangeError('Renderer-visibility audit response target/status mismatch');
      var band=sample.d<=1500?'0-1.5km':sample.d<=3000?'1.5-3km':'3-6km';
      if(!summary.distanceBands[band])summary.distanceBands[band]={samples:0,gridVsCpu:0,directVsCpu:0};
      var cell=summary.distanceBands[band];cell.samples++;
      if(sample.h===0)summary.groundHeightSamples++;else summary.lowHeightSamples++;
      [['cpu',a.status],['grid',sample.gridStatus],['directGpu',b.status]].forEach(function(pair){
        var counts=summary.statuses[pair[0]];counts[pair[1]]=(counts[pair[1]]||0)+1;
      });
      var gm=sample.gridStatus!==a.status,dm=b.status!==a.status,
        gd=sample.gridStatus!==b.status;
      if(gm){summary.gridVsCpuMismatches++;cell.gridVsCpu++;}
      if(dm){summary.directGpuVsCpuMismatches++;cell.directVsCpu++;}
      if(gd)summary.gridVsDirectGpuMismatches++;
      if(a.status==='visible'&&sample.gridStatus!=='visible')summary.cpuVisibleGridNonvisible++;
      if(a.status==='visible'&&b.status!=='visible')summary.cpuVisibleDirectNonvisible++;
      if(gm&&!dm)summary.gridRecoveredByDirectGpu++;
      if(!gm&&dm)summary.directGpuRegressions++;
      if(!gm&&!dm)summary.matchedAllThree++;
      var category=gm&&!dm?'interpolationStatusCandidate':dm?
        (a.status==='visible'&&sample.gridStatus!=='visible'?'cpuVisibleBothGpuNonvisible':
          'directGpuStatusCandidate'):gm?'otherDisagreements':null;
      if(category)summary.diagnosticCategories[category]++;
      var gridDelta=Number.isFinite(a.angle)&&Number.isFinite(sample.gridAngle)?
        (sample.gridAngle-a.angle)*180/Math.PI*3600:null;
      var directDelta=Number.isFinite(a.angle)&&Number.isFinite(b.angle)?
        (b.angle-a.angle)*180/Math.PI*3600:null;
      if(gridDelta!==null){summary.angleComparisons++;gridTotal+=Math.abs(gridDelta);
        summary.maxAbsoluteGridAngleDeltaArcsec=Math.max(summary.maxAbsoluteGridAngleDeltaArcsec,Math.abs(gridDelta));}
      if(directDelta!==null){directTotal+=Math.abs(directDelta);
        summary.maxAbsoluteDirectAngleDeltaArcsec=Math.max(summary.maxAbsoluteDirectAngleDeltaArcsec,Math.abs(directDelta));}
      return {d:sample.d,h:sample.h,kind:sample.kind,
        rendererSampleCalls:sample.sampleCalls,rendererExactCalls:sample.exactCalls,
        cpuStatus:a.status,gridStatus:sample.gridStatus,directGpuStatus:b.status,
        gridMinusCpuArcsec:gridDelta,directGpuMinusCpuArcsec:directDelta,
        cpuGroundHit:a.ground?a.ground.hitGround:null,
        cpuGroundContact:a.ground&&a.ground.event?a.ground.event.contact:null,
        directGpuGroundHit:b.ground?b.ground.hitGround:null,
        directGpuGroundContact:b.ground&&b.ground.event?b.ground.event.contact:null,
        cpuReason:a.reason||null,directGpuReason:b.reason||null,
        diagnosticCategory:category};
    });
    summary.meanAbsoluteGridAngleDeltaArcsec=summary.angleComparisons?
      gridTotal/summary.angleComparisons:0;
    var directCount=rows.filter(function(r){return r.directGpuMinusCpuArcsec!==null;}).length;
    summary.meanAbsoluteDirectAngleDeltaArcsec=directCount?directTotal/directCount:0;
    return {summary:summary,rows:rows,diagnosticOnly:true,
      actualFrameCompared:false,cpuUsedForTargetSelection:false,
      productionAuthorized:false};
  }
  // #140.12.19: opt-in distance-gated geometric control of the existing
  // GPU-first field. Use the SAME analytic vacuum path as the production
  // physical optics adapter, including the geometric horizon. No refraction
  // is assumed ONLY for nearby targets. Far targets and the painter remain
  // unchanged. Both field answers are sampled for a paired-angle audit; no
  // CPU ray integration or CPU-guided target selection takes place.
  function nearGeometricField(gpuField,model,surfaces,vacuumSample,cutoffMetres){
    if(!gpuField||!gpuField.fullCoverageGrid||typeof gpuField.sample!=='function'||
        typeof gpuField.exact!=='function'||typeof gpuField.stats!=='function'||
        !surfaces||typeof surfaces.createFromCurvature!=='function'||
        typeof vacuumSample!=='function'||![1500,3000,6000].includes(cutoffMetres)||
        !model||!(model.rEarth>0)||!(model.Height>=0)||
        ![1,2].includes(model.showModel))
      throw TypeError('Invalid near-geometric GPU experiment inputs');
    var geometry=model.showModel===2?'flat':'globe',radius=model.rEarth,eye=model.Height,
      unique=new Map(),lookups=0,nearExact=0;
    function resolve(d,h,exact){
      var method=exact?'exact':'sample';
      if(!(d>0&&d<=cutoffMetres&&h>=0&&Number.isFinite(h)))
        return gpuField[method](d,h);
      var direct=vacuumSample(geometry,radius,eye,d,h,true);
      var gpu=gpuField[method](d,h);
      lookups++;if(exact)nearExact++;
      var key=d.toPrecision(13)+','+h.toPrecision(13);
      if(!unique.has(key)){
        var angleDelta=Number.isFinite(direct.angle)&&gpu&&Number.isFinite(gpu.angle)?
          (direct.angle-gpu.angle)*180/Math.PI*3600:null;
        unique.set(key,{distanceMetres:d,heightMetres:h,directStatus:direct.status,
          gpuStatus:gpu&&gpu.status,angleDeltaArcsec:angleDelta});
      }
      return direct;
    }
    function nearAudit(){
      var counts={nearQueries:lookups,nearExactQueries:nearExact,
        uniqueNearTargets:unique.size,groundTargets:0,objectHeightTargets:0,
        statusDisagreements:0,anglesCompared:0,meanAbsoluteAngleDeltaArcsec:0,
        maxAbsoluteAngleDeltaArcsec:0,nonFiniteGpuAngles:0};
      var total=0;
      unique.forEach(function(row){
        if(row.heightMetres===0)counts.groundTargets++;else counts.objectHeightTargets++;
        if(row.directStatus!==row.gpuStatus)counts.statusDisagreements++;
        if(row.angleDeltaArcsec===null){counts.nonFiniteGpuAngles++;return;}
        var abs=Math.abs(row.angleDeltaArcsec);
        counts.anglesCompared++;total+=abs;
        counts.maxAbsoluteAngleDeltaArcsec=Math.max(counts.maxAbsoluteAngleDeltaArcsec,abs);
      });
      counts.meanAbsoluteAngleDeltaArcsec=counts.anglesCompared?total/counts.anglesCompared:0;
      return counts;
    }
    function stats(){
      var original=gpuField.stats(),extra=nearAudit();
      return Object.assign({},original,{experimentalGpu:Object.assign({},original.experimentalGpu,
        {nearGeometricControl:true,nearGeometricLimitMetres:cutoffMetres,
          nearGeometryAudit:extra,cpuShootingFallback:false,productionAuthorized:false})});
    }
    return {request:gpuField.request,fullCoverageGrid:true,
      sample:function(d,h){return resolve(d,h,false);},
      exact:function(d,h){return resolve(d,h,true);},
      stats:stats,nearAudit:nearAudit,nearGeometricLimitMetres:cutoffMetres};
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
  function compareFramePixels(a,b,region){
    if(!a||!b||!a.getContext||!b.getContext||a.width!==b.width||a.height!==b.height)
      return {status:'unavailable',reason:'Canvas sizes differ or no readable canvas'};
    try{
      var ac=a.getContext('2d'),bc=b.getContext('2d');
      if(!ac||!bc||!ac.getImageData||!bc.getImageData)
        return {status:'unavailable',reason:'Pixel readback not supported'};
      var x=0,y=0,width=a.width,height=a.height;
      if(region){
        if(![region.x,region.y,region.width,region.height].every(function(n){
          return Number.isFinite(n)&&n>=0&&n<=1;
        })||region.x+region.width>1||region.y+region.height>1||
            region.width===0||region.height===0)
          throw RangeError('Invalid normalized frame comparison region');
        x=Math.floor(region.x*a.width);y=Math.floor(region.y*a.height);
        width=Math.max(1,Math.min(a.width-x,Math.ceil(region.width*a.width)));
        height=Math.max(1,Math.min(a.height-y,Math.ceil(region.height*a.height)));
      }
      var first=ac.getImageData(x,y,width,height).data,
        second=bc.getImageData(x,y,width,height).data;
      var strictPixels=0,significantPixels=0,maxChannelDelta=0;
      for(var i=0;i<first.length;i+=4){
        var diff=Math.max(Math.abs(first[i]-second[i]),Math.abs(first[i+1]-second[i+1]),
          Math.abs(first[i+2]-second[i+2]),Math.abs(first[i+3]-second[i+3]));
        if(diff>0)strictPixels++;
        if(diff>8)significantPixels++;
        maxChannelDelta=Math.max(maxChannelDelta,diff);
      }
      return {status:'measured',width:width,height:height,totalPixels:width*height,
        region:region?{x:x,y:y,width:width,height:height}:null,
        strictPixels:strictPixels,significantPixels:significantPixels,maxChannelDelta:maxChannelDelta,
        // An 8/255 channel difference filter is not a 1-pixel contour metric.
        visualEquivalenceProven:false};
    }catch(error){return {status:'unavailable',reason:String(error.message||error)};}
  }
  // #140.12.18: spatially resolved, channel-thresholded frame differences.
  // The heatmap uses the same >8/255 criterion as compareFramePixels. It is
  // diagnostic only and is NEVER accessed by the GPU refinement selector.
  function frameDifferenceTiles(a,b,cols,rows){
    if(!Number.isInteger(cols)||!Number.isInteger(rows)||cols<1||rows<1||
        cols>128||rows>128)throw RangeError('Invalid frame heatmap dimensions');
    if(!a||!b||a.width!==b.width||a.height!==b.height||!a.getContext||!b.getContext)
      return {status:'unavailable',reason:'Canvas sizes differ or no readable canvas'};
    try{
      var first=a.getContext('2d').getImageData(0,0,a.width,a.height).data,
        second=b.getContext('2d').getImageData(0,0,b.width,b.height).data,
        counts=Array(cols*rows).fill(0),total=0;
      for(var y=0;y<a.height;y++)for(var x=0;x<a.width;x++){
        var i=(y*a.width+x)*4;
        var delta=Math.max(Math.abs(first[i]-second[i]),Math.abs(first[i+1]-second[i+1]),
          Math.abs(first[i+2]-second[i+2]),Math.abs(first[i+3]-second[i+3]));
        if(delta>8){counts[Math.floor(y*rows/a.height)*cols+
          Math.floor(x*cols/a.width)]++;total++;}
      }
      return {status:'measured',width:a.width,height:a.height,columns:cols,rows:rows,
        significantPixels:total,tileCounts:counts,maxTileCount:Math.max.apply(null,counts),
        thresholdChannelDelta:8};
    }catch(error){return {status:'unavailable',reason:String(error.message||error)};}
  }
  return Object.freeze({pair:pair,clone:clone,invariant:invariant,
    probeTargets:probeTargets,probeReport:probeReport,probeGroundReview:probeGroundReview,
    gpuFieldRequest:gpuFieldRequest,gpuRayField:gpuRayField,
    gpuFirstGrid:gpuFirstGrid,gpuFirstRayField:gpuFirstRayField,
    nearGeometricField:nearGeometricField,
    captureGpuRendererQueries:captureGpuRendererQueries,
    compareRendererVisibility:compareRendererVisibility,
    selectIndeterminateRendererTargets:selectIndeterminateRendererTargets,
    gpuStatusQualificationField:gpuStatusQualificationField,
    gpuFirstBatchRequests:gpuFirstBatchRequests,
    cpuReplayField:cpuReplayField,frameControlCounts:frameControlCounts,
    compareFramePixels:compareFramePixels,frameDifferenceTiles:frameDifferenceTiles});
}));
