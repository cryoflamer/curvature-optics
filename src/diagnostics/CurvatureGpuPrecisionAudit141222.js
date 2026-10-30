/* #140.12.22: diagnostic-only f32 near-surface/upper-tower precision ladder.
 * No CPU oracle is involved in selection, GPU dispatch, or frame painting.
 * This does NOT certify or modify production WebGPU visibility decisions.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuPrecisionAudit141222=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var HEIGHTS=Object.freeze([0,0.000001,0.01,0.1,1,5,20,50]);
  var DISTANCES=Object.freeze([60,350,1250,2100,3900,5400]);
  var ARCSEC=180/Math.PI*3600;
  function createLadder(base,surfaces){
    if(!base||!['globe','flat'].includes(base.geometry)||
        !(base.radius>0)||!(base.observerHeight>=0)||
        !surfaces||typeof surfaces.createFromCurvature!=='function')
      throw TypeError('Invalid precision ladder source');
    var metric=surfaces.createFromCurvature(base.geometry==='globe'?1/base.radius:0);
    var targets=[],coordinates=[];
    DISTANCES.forEach(function(d){HEIGHTS.forEach(function(h){
      var target=metric.surfacePoint2(d,h),x32=Math.fround(target[0]),y32=Math.fround(target[1]);
      targets.push(target);
      coordinates.push({distanceMetres:d,heightMetres:h,
        f32HorizontalRoundingMetres:x32-target[0],
        f32VerticalRoundingMetres:y32-target[1],
        f32SurfaceHeightErrorMetres:metric.height2(x32,y32)-h});
    });});
    var request={branch:base.branch,geometry:base.geometry,radius:base.radius,
      observerHeight:base.observerHeight,atmosphere:'standard',targets:targets,
      controls:{step:500,targetTolerance:0.005,eventSubsteps:8}};
    return {request:request,coordinates:coordinates,
      distancesMetres:DISTANCES.slice(),heightsMetres:HEIGHTS.slice(),
      targetsCount:targets.length};
  }
  function stages(ladder){
    if(!ladder||!ladder.request||!Array.isArray(ladder.request.targets))
      throw TypeError('Precision ladder required');
    function request(atmosphere,step,tolerance){
      return Object.assign({},ladder.request,{atmosphere:atmosphere,
        controls:Object.assign({},ladder.request.controls,
          {step:step,targetTolerance:tolerance})});
    }
    return {
      standard500:request('standard',500,0.005),
      standardStrict:request('standard',500,0.0001),
      standardFine:request('standard',50,0.005),
      vacuum500:request('vacuum',500,0.005)
    };
  }
  function audit(ladder,gpuResults,cpuResults){
    var requests=stages(ladder),names=Object.keys(requests),len=ladder.targetsCount;
    if(!gpuResults||!cpuResults||!cpuResults.standard||!cpuResults.vacuum)
      throw TypeError('CPU and GPU results are required for independent audit');
    function ordered(data,name){
      if(!data||!Array.isArray(data.results)||data.results.length!==len)
        throw RangeError('Invalid '+name+' precision response length');
      data.results.forEach(function(r,i){
        var target=ladder.request.targets[i];
        if(!r||!Array.isArray(r.target)||r.target.length!==2||
            r.target[0]!==target[0]||r.target[1]!==target[1])
          throw RangeError('Unmatched '+name+' precision target at '+i);
      });
      return data.results;
    }
    var reference={standard:ordered(cpuResults.standard,'CPU standard'),
      vacuum:ordered(cpuResults.vacuum,'CPU vacuum')};
    var summaries={},points=[];
    names.forEach(function(name){
      var gpu=ordered(gpuResults[name],name),cpu=reference[name==='vacuum500'?'vacuum':'standard'];
      var summary={samples:len,statusMismatches:0,cpuVisibleGpuNonvisible:0,
        gpuStatusCounts:{visible:0,blocked:0,indeterminate:0,solver_failed:0},
        groundDisagreements:0,endpointContacts:0,interiorContacts:0,
        angleComparisons:0,meanAbsoluteAngleDeltaArcsec:0,maxAbsoluteAngleDeltaArcsec:0,
        upperHeightAngleComparisons:0,upperHeightMeanAbsoluteAngleDeltaArcsec:0,
        nearGroundMismatches:0};
      var angleSum=0,upperAngleSum=0;
      gpu.forEach(function(g,i){
        var c=cpu[i],coord=ladder.coordinates[i],ce=c.ground&&c.ground.event,
          ge=g.ground&&g.ground.event,contactBeforeEnd=ge&&Number.isFinite(g.pathLength)?
            g.pathLength-ge.pathLength:null,
          // A diagnostic proximity label only. Never upgrades a ray to visible.
          endpointContact=contactBeforeEnd!==null&&contactBeforeEnd>=0&&contactBeforeEnd<=0.25;
        summary.gpuStatusCounts[g.status]++;
        if(c.status!==g.status){
          summary.statusMismatches++;
          if(coord.heightMetres<=0.01)summary.nearGroundMismatches++;
          if(c.status==='visible'&&g.status!=='visible')summary.cpuVisibleGpuNonvisible++;
        }
        if(!!ce!==!!ge||(ce&&ge&&ce.contact!==ge.contact))summary.groundDisagreements++;
        if(ge){if(endpointContact)summary.endpointContacts++;else summary.interiorContacts++;}
        var angleDelta=c.angle!==null&&g.angle!==null?
          (g.angle-c.angle)*ARCSEC:null;
        if(angleDelta!==null){
          summary.angleComparisons++;angleSum+=Math.abs(angleDelta);
          summary.maxAbsoluteAngleDeltaArcsec=Math.max(summary.maxAbsoluteAngleDeltaArcsec,Math.abs(angleDelta));
          if(coord.heightMetres>=5){summary.upperHeightAngleComparisons++;
            upperAngleSum+=Math.abs(angleDelta);}
        }
        points.push({variant:name,distanceMetres:coord.distanceMetres,
          heightMetres:coord.heightMetres,cpuStatus:c.status,gpuStatus:g.status,
          cpuAngleRadians:c.angle,gpuAngleRadians:g.angle,angleDeltaArcsec:angleDelta,
          gpuResidualMetres:g.residual,cpuResidualMetres:c.residual,
          gpuContact:ge?ge.contact:null,cpuContact:ce?ce.contact:null,
          gpuContactDistanceBeforeEndMetres:contactBeforeEnd,
          endpointContactWithin25cm:endpointContact,
          f32SurfaceHeightErrorMetres:coord.f32SurfaceHeightErrorMetres});
      });
      summary.meanAbsoluteAngleDeltaArcsec=summary.angleComparisons?
        angleSum/summary.angleComparisons:null;
      summary.upperHeightMeanAbsoluteAngleDeltaArcsec=summary.upperHeightAngleComparisons?
        upperAngleSum/summary.upperHeightAngleComparisons:null;
      summaries[name]=summary;
    });
    var standard=summaries.standard500,strict=summaries.standardStrict,
      fine=summaries.standardFine;
    return {version:'140.12.22',kind:'Near-surface GPU precision and upper-tower angular audit',
      targetSelection:'Fixed distance/height ladder, independent of CPU oracle',
      heightsMetres:ladder.heightsMetres,distancesMetres:ladder.distancesMetres,
      samplesPerVariant:len,variants:summaries,
      comparisons:{strictToleranceStatusMismatchDelta:strict.statusMismatches-standard.statusMismatches,
        fineStepStatusMismatchDelta:fine.statusMismatches-standard.statusMismatches,
        strictToleranceEndpointContactDelta:strict.endpointContacts-standard.endpointContacts,
        fineStepEndpointContactDelta:fine.endpointContacts-standard.endpointContacts},
      perTargetResults:points,cpuShootingFallback:false,productionAuthorized:false,
      terminalContactClassificationIsDiagnosticOnly:true};
  }
  return Object.freeze({HEIGHTS:HEIGHTS,DISTANCES:DISTANCES,
    createLadder:createLadder,stages:stages,audit:audit});
}));
