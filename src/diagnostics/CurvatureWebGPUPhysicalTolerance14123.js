/* #140.12.3: application-level 5 mm shooting qualification, research ONLY.
 * A CPU-vs-GPU angle difference is NOT a failure when each connecting ray
 * meets the physical target tolerance. Independently replay the GPU angle in
 * the f64 CPU integrator (outside GPU timings) to catch GPU self-consistency
 * that disagrees with the reference optical model. Ground events and status
 * still have to agree. This does not authorize a production backend switch.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412,
    typeof module==='object'&&module.exports?
    require('../optics/OpticalRayTracer'):root.CurvatureRayTracer);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUPhysicalTolerance14123=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract,gpu,rayTracer){
  'use strict';
  if(!contract||!gpu||!rayTracer)throw Error('#140.12.3 dependencies missing');
  var GROUND_EVENT_TOLERANCE=0.001;
  var MIN_TOLERANCE=1e-6;
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function tolerance(request){
    var t=request.controls&&request.controls.targetTolerance!==undefined?
      request.controls.targetTolerance:MIN_TOLERANCE;
    if(!Number.isFinite(t)||t<=0||t>0.1)throw RangeError('Invalid physical target tolerance');
    return t;
  }
  // Replays ONLY the GPU launch angle with the CPU ray model. It does not
  // search for another angle or certify an event; event checks are separate.
  // The GPU path length supplies a near-target starting point, followed by
  // safeguarded f64 endpoint correction to the target x coordinate.
  function cpuReplay(request,entry,prepared){
    if(entry.status==='solver_failed'||entry.angle===null||entry.pathLength===null)
      return {status:'unavailable',reason:'GPU did not provide a solved ray'};
    var step=request.controls&&request.controls.step!==undefined?request.controls.step:50;
    try{
      var traced=rayTracer.trace({geometry:request.geometry,radius:request.radius,
        profile:prepared.profile,observerHeight:request.observerHeight,angle:entry.angle,
        length:entry.pathLength,step:step,stopAtGround:false});
      var s=[traced.x,traced.z,Math.cos(traced.angle),Math.sin(traced.angle)];
      var correction=0;
      var advance=prepared.advance;
      for(var i=0;i<4;i++){
        var dx=entry.target[0]-s[0];
        if(Math.abs(dx)<=Math.max(1e-9,entry.target[0]*1e-13))break;
        if(s[2]<=0.0001)throw Error('No forward-x CPU replay');
        var ds=dx/s[2];
        if(Math.abs(ds)>step*2)throw Error('CPU/GPU path-length divergence exceeds local correction bound');
        s=advance(s,ds);correction+=ds;
      }
      var xError=Math.abs(s[0]-entry.target[0]);
      if(xError>Math.max(1e-8,entry.target[0]*1e-12))
        throw Error('CPU replay did not converge to target x');
      var residual=s[1]-entry.target[1];
      if(!Number.isFinite(residual))throw Error('Nonfinite CPU replay residual');
      return {status:'measured',residualMetres:residual,
        absoluteResidualMetres:Math.abs(residual),
        targetXErrorMetres:xError,endpointCorrectionMetres:correction};
    }catch(error){return {status:'unavailable',reason:String(error.message||error)};}
  }
  function physicalComparison(request,cpu,gpuResponse){
    gpu.checked(request);
    contract.validateResponse(request,cpu);contract.validateResponse(request,gpuResponse);
    if(cpu.backend!=='cpu-reference'||gpuResponse.backend!=='gpu-experimental')
      throw RangeError('Independent CPU reference and GPU response required');
    var t=tolerance(request),strict=contract.compare(request,cpu,gpuResponse);
    var prepared={profile:rayTracer.atmosphere(request.atmosphere,request.profileOptions)};
    prepared.advance=rayTracer.prepareStepper({geometry:request.geometry,radius:request.radius,
      profile:prepared.profile},true);
    var counts={cpuResidualExceeded:0,gpuResidualExceeded:0,
      gpuReplayResidualExceeded:0,gpuReplayUnavailable:0,statusMismatch:0,
      groundEventMismatch:0,unresolved:0,physicallyAdequate:0};
    var max={cpuAbsoluteResidualMetres:0,gpuAbsoluteResidualMetres:0,
      gpuReplayAbsoluteResidualMetres:0,angleDifferenceRadians:0};
    var targets=request.targets.map(function(target,i){
      var a=cpu.results[i],b=gpuResponse.results[i],flags=[];
      var cpuResidual=a.residual===null?null:Math.abs(a.residual);
      var gpuResidual=b.residual===null?null:Math.abs(b.residual);
      var angleDifference=a.angle===null||b.angle===null?null:Math.abs(a.angle-b.angle);
      if(cpuResidual!==null)max.cpuAbsoluteResidualMetres=Math.max(max.cpuAbsoluteResidualMetres,cpuResidual);
      if(gpuResidual!==null)max.gpuAbsoluteResidualMetres=Math.max(max.gpuAbsoluteResidualMetres,gpuResidual);
      if(angleDifference!==null)max.angleDifferenceRadians=Math.max(max.angleDifferenceRadians,angleDifference);
      var replay=cpuReplay(request,b,prepared);
      if(replay.status==='measured')max.gpuReplayAbsoluteResidualMetres=
        Math.max(max.gpuReplayAbsoluteResidualMetres,replay.absoluteResidualMetres);
      if(a.status==='solver_failed'||b.status==='solver_failed'||
          a.status==='indeterminate'||b.status==='indeterminate')flags.push('unresolved');
      if(cpuResidual!==null&&cpuResidual>t)flags.push('cpuResidualExceeded');
      if(gpuResidual!==null&&gpuResidual>t)flags.push('gpuResidualExceeded');
      if(replay.status!=='measured')flags.push('gpuReplayUnavailable');
      else if(replay.absoluteResidualMetres>t)flags.push('gpuReplayResidualExceeded');
      if(a.status!==b.status)flags.push('statusMismatch');
      var eventA=a.ground&&a.ground.event,eventB=b.ground&&b.ground.event;
      var eventGap=eventA&&eventB?Math.abs(eventA.pathLength-eventB.pathLength):null;
      if(!a.ground||!b.ground||a.ground.hitGround!==b.ground.hitGround||
          !!eventA!==!!eventB||(eventA&&eventB&&
          (eventA.contact!==eventB.contact||eventGap>GROUND_EVENT_TOLERANCE)))
        flags.push('groundEventMismatch');
      flags.forEach(function(flag){counts[flag]++;});
      if(flags.length===0)counts.physicallyAdequate++;
      return {targetIndex:i,target:target.slice(),flags:flags,
        cpu:{status:a.status,residualMetres:a.residual,hitGround:a.ground&&a.ground.hitGround,
          groundEvent:eventA||null},
        gpu:{status:b.status,residualMetres:b.residual,hitGround:b.ground&&b.ground.hitGround,
          groundEvent:eventB||null},
        cpuReplayOfGpuAngle:replay,
        diagnostic:{angleDifferenceRadians:angleDifference,
          cpuGpuResidualDifferenceMetres:a.residual===null||b.residual===null?null:Math.abs(a.residual-b.residual),
          groundEventPathDifferenceMetres:eventGap}};
    });
    return {targetToleranceMetres:t,groundEventToleranceMetres:GROUND_EVENT_TOLERANCE,
      counts:counts,max:max,physicallyAdequate:counts.physicallyAdequate===targets.length,
      strictParityDiagnostic:strict,targets:targets};
  }
  function decide(scenes){
    var base={productionAuthorized:false,thresholdColdSpeedup:2};
    function stop(verdict,nextAction){return Object.assign({},base,{verdict:verdict,nextAction:nextAction});}
    if(!scenes||scenes.length===0||scenes.some(function(s){return s.status!=='measured';}))
      return stop('INCONCLUSIVE','GPU/CPU execution unavailable; retain CPU');
    if(scenes.some(function(s){return s.physical.counts.cpuResidualExceeded>0}))
      return stop('CPU_REFERENCE_STOP','CPU reference does not meet requested target tolerance');
    if(scenes.some(function(s){return s.physical.counts.gpuResidualExceeded>0}))
      return stop('GPU_ARRIVAL_STOP','GPU target residual exceeds requested 5 mm tolerance; retain CPU');
    if(scenes.some(function(s){return s.physical.counts.gpuReplayUnavailable>0||
        s.physical.counts.gpuReplayResidualExceeded>0}))
      return stop('GPU_REPLAY_STOP','Independent CPU trace of GPU angle failed target tolerance; retain CPU');
    if(scenes.some(function(s){return s.physical.counts.unresolved>0||
        s.physical.counts.statusMismatch>0||s.physical.counts.groundEventMismatch>0}))
      return stop('GROUND_STATUS_STOP','Ground/visibility evidence disagrees or is unresolved; retain CPU');
    if(scenes.some(function(s){return !s.physical.physicallyAdequate}))
      return stop('PHYSICAL_QUALIFICATION_STOP','Physical accuracy gate failed; retain CPU');
    if(scenes.some(function(s){return !s.timing.warmOutputBitwiseStable}))
      return stop('BATCH_REPEAT_INSTABILITY_STOP','GPU repeat outputs differ; retain CPU');
    if(scenes.some(function(s){return s.timing.coldSpeedup<2}))
      return stop('BATCH_PERFORMANCE_STOP','Physical stage passed but 2x cold GPU speedup not reached; retain CPU');
    return stop('BATCH_STAGE_PASS_ONLY','Stage-only qualification; async scene and full-frame integration still unqualified');
  }
  // #140.12.4: screen-space *proxy*, never a renderer/image parity claim.
  // Camera parameters below are an explicit illustrative perspective view,
  // not inferred from Bislin's live Camera/WinTrans or a production viewport.
  function screenProxyOptions(options){
    options=options||{};
    var settings={viewportHeightPx:options.viewportHeightPx===undefined?1080:options.viewportHeightPx,
      verticalFovDegrees:options.verticalFovDegrees===undefined?45:options.verticalFovDegrees,
      cameraPitchDegrees:options.cameraPitchDegrees===undefined?0:options.cameraPitchDegrees,
      pixelBudgetPx:options.pixelBudgetPx===undefined?0.5:options.pixelBudgetPx,
      nearGroundMetres:options.nearGroundMetres===undefined?0.01:options.nearGroundMetres,
      endpointWindowMetres:options.endpointWindowMetres===undefined?0.1:options.endpointWindowMetres};
    if(!Number.isInteger(settings.viewportHeightPx)||settings.viewportHeightPx<100||settings.viewportHeightPx>8192||
        !Number.isFinite(settings.verticalFovDegrees)||settings.verticalFovDegrees<5||settings.verticalFovDegrees>120||
        !Number.isFinite(settings.cameraPitchDegrees)||Math.abs(settings.cameraPitchDegrees)>75||
        !Number.isFinite(settings.pixelBudgetPx)||settings.pixelBudgetPx<=0||settings.pixelBudgetPx>5||
        !Number.isFinite(settings.nearGroundMetres)||settings.nearGroundMetres<0||settings.nearGroundMetres>0.5||
        !Number.isFinite(settings.endpointWindowMetres)||settings.endpointWindowMetres<=0||settings.endpointWindowMetres>10)
      throw RangeError('Invalid illustrative screen-space diagnostic parameters');
    return settings;
  }
  function perspectiveY(angle,settings){
    if(angle===null)return null;
    var relative=angle-settings.cameraPitchDegrees*Math.PI/180;
    var half=settings.verticalFovDegrees*Math.PI/360;
    if(Math.abs(relative)>half)return null;
    return settings.viewportHeightPx*(0.5-Math.tan(relative)/(2*Math.tan(half)));
  }
  // Use the same ground-event search as the CPU optical ray tracer, at the
  // GPU's angle. This is NOT a GPU event certification and is excluded from
  // the GPU timing. In particular, 'boundary-candidate' is never a pass.
  function groundReplay(request,entry,profile){
    if(entry.status==='solver_failed'||entry.angle===null||entry.pathLength===null)
      return {status:'unavailable',reason:'GPU angle/path unavailable'};
    try{
      var traced=rayTracer.trace({geometry:request.geometry,radius:request.radius,
        profile:profile,observerHeight:request.observerHeight,angle:entry.angle,
        length:entry.pathLength,step:request.controls&&request.controls.step||50,
        eventSubsteps:request.controls&&request.controls.eventSubsteps||8,
        contactTolerance:request.controls&&request.controls.contactTolerance||1e-6});
      return {status:'measured',hitGround:traced.hitGround,
        event:traced.event?{kind:traced.event.kind,contact:traced.event.contact,
          pathLength:traced.event.pathLength}:null,
        remainingPathMetres:traced.hitGround?Math.max(0,entry.pathLength-traced.travelled):null};
    }catch(error){return {status:'unavailable',reason:String(error.message||error)};}
  }
  function visualComparison(request,cpu,gpuResponse,settings,physical){
    var view=screenProxyOptions(settings);
    // The physical comparison remains a separate historical strict report;
    // its 1 mm event threshold does not become a screen-space failure here.
    physical=physical||physicalComparison(request,cpu,gpuResponse);
    contract.validateResponse(request,cpu);contract.validateResponse(request,gpuResponse);
    var profile=rayTracer.atmosphere(request.atmosphere,request.profileOptions);
    var surface=rayTracer.resolveGeometry({geometry:request.geometry,radius:request.radius}).surface;
    var counts={inViewport:0,outsideViewport:0,subpixelAngleProxy:0,
      overPixelBudget:0,statusDisagreements:0,groundEvidenceDisagreements:0,
      nearBoundaryCandidates:0,requiresFrameReview:0,groundReplayUnavailable:0};
    var maxPixelShift=0;
    var targets=request.targets.map(function(target,i){
      var a=cpu.results[i],b=gpuResponse.results[i],p=physical.targets[i];
      var aY=perspectiveY(a.angle,view),bY=perspectiveY(b.angle,view);
      var pixelGap=aY===null||bY===null?null:Math.abs(aY-bY);
      if(pixelGap===null)counts.outsideViewport++;
      else{
        counts.inViewport++;maxPixelShift=Math.max(maxPixelShift,pixelGap);
        if(pixelGap<=view.pixelBudgetPx)counts.subpixelAngleProxy++;
        else counts.overPixelBudget++;
      }
      var statusDifferent=a.status!==b.status;
      var groundDifferent=p.flags.includes('groundEventMismatch');
      if(statusDifferent)counts.statusDisagreements++;
      if(groundDifferent)counts.groundEvidenceDisagreements++;
      var event=b.ground&&b.ground.event;
      var targetAltitude=surface.height2(target[0],target[1]);
      var gpuContactGap=event?Math.max(0,b.pathLength-event.pathLength):null;
      var replay=groundReplay(request,b,profile);
      if(replay.status!=='measured')counts.groundReplayUnavailable++;
      // A narrow endpoint contact at ground level is a REVIEW PRIORITY,
      // not proof that a visible/blocked flip is harmless on a rendered frame.
      var boundaryCandidate=(statusDifferent||groundDifferent)&&
        targetAltitude>=-view.nearGroundMetres&&targetAltitude<=view.nearGroundMetres&&
        pixelGap!==null&&pixelGap<=view.pixelBudgetPx&&
        (gpuContactGap!==null?gpuContactGap<=view.endpointWindowMetres:
          (replay.remainingPathMetres!==null&&
           replay.remainingPathMetres<=view.endpointWindowMetres));
      if(boundaryCandidate)counts.nearBoundaryCandidates++;
      var frameReview=statusDifferent||groundDifferent||pixelGap===null||
        pixelGap>view.pixelBudgetPx||replay.status!=='measured';
      if(frameReview)counts.requiresFrameReview++;
      return {targetIndex:i,target:target.slice(),cpuLaunchAngleRadians:a.angle,
        gpuLaunchAngleRadians:b.angle,cpuIllustrativePixelY:aY,
        gpuIllustrativePixelY:bY,launchAngleProxyShiftPx:pixelGap,
        targetSurfaceAltitudeMetres:targetAltitude,
        cpuStatus:a.status,gpuStatus:b.status,statusDifferent:statusDifferent,
        groundEvidenceDifferent:groundDifferent,gpuContactToTargetPathMetres:gpuContactGap,
        cpuGroundReplayOfGpuAngle:replay,
        nearEndpointGroundBoundaryCandidate:boundaryCandidate,
        requiresActualFrameReview:frameReview};
    });
    return {view:view,kind:'illustrative launch-angle perspective projection (NOT rendered image pixels)',
      counts:counts,maxLaunchAngleProxyShiftPx:maxPixelShift,targets:targets,
      actualRenderedImageCompared:false,visualEquivalenceProven:false};
  }
  function decideVisual(scenes){
    var base={productionAuthorized:false,visualEquivalenceProven:false,
      requiresFullFrameComparison:true};
    if(!scenes||scenes.length===0||scenes.some(function(s){return s.status!=='measured';}))
      return Object.assign({},base,{verdict:'INCONCLUSIVE',nextAction:'GPU/CPU unavailable; no visual assessment'});
    if(scenes.some(function(s){return !s.timing.warmOutputBitwiseStable;}))
      return Object.assign({},base,{verdict:'BATCH_REPEAT_INSTABILITY_STOP',
        nextAction:'Unstable GPU output must be resolved before frame comparison'});
    return Object.assign({},base,{verdict:'VISUAL_PROXY_ONLY',
      nextAction:'Inspect ground/status edge cases and compare actual rendered CPU/GPU frames before any visual-equivalence claim'});
  }
  async function run(fixture,deps,options){
    options=options||{};
    var visualSettings=options.visual?screenProxyOptions(options.visual):null;
    var entries=gpu.fixtureRequests(fixture),reports=[];
    var solver=options.solver||gpu;
    var repeats=options.warmRepeats===undefined?3:options.warmRepeats;
    if(!Number.isInteger(repeats)||repeats<1||repeats>5)
      throw RangeError('Physical diagnostic requires 1–5 warm repeats');
    for(var entry of entries){
      var began=now(),cpu=await contract.solveCpuBatch(entry.request),cpuMs=now()-began;
      try{
        // The original 5 mm residual-stop policy is the intended workload.
        // No hidden CPU shooting/certification occurs in the GPU timed batch.
        var measured=await solver.solveBatch(entry.request,deps,
          {refinement:'residual-stop',warmRepeats:repeats});
        var verifyStarted=now(),physical=physicalComparison(entry.request,cpu,measured.response);
        var visual=visualSettings?
          visualComparison(entry.request,cpu,measured.response,visualSettings,physical):null;
        var verifyMs=now()-verifyStarted;
        var timing=Object.assign({coldSpeedup:cpuMs/measured.timing.gpuColdMs,
          warmSpeedup:cpuMs/measured.timing.gpuWarmMedianMs},measured.timing);
        reports.push({id:entry.id,status:'measured',count:entry.request.targets.length,
          cpuMs:cpuMs,cpuReplayVerificationMs:verifyMs,timing:timing,
          physical:physical,device:measured.device,
          ...(visual?{visual:visual}:{})});
      }catch(error){reports.push({id:entry.id,status:'unavailable',count:entry.request.targets.length,
        cpuMs:cpuMs,reason:String(error.message||error)});}
    }
    return {version:visualSettings?'140.12.4':'140.12.3',status:reports.every(function(s){return s.status==='measured';})?
      'finished':'incomplete',
      experiment:visualSettings?'Illustrative screen-space impact proxy and independent CPU ground replay (not a frame comparison)':'5 mm target tolerance and independent CPU replay of GPU angles; ground/status qualification',
      measurement:{gpuPolicy:'residual-stop',warmRepeats:repeats,
        cpuReference:'separate complete CPU shooting batch',
        gpuTiming:'upload + dispatch + fence/readback CPU wall-clock; GPU pipelines reused in warm runs',
        cpuReplay:'outside timed GPU batch; forward-x CPU RK4 at GPU angle; no shooting search',
        targetCriterion:'each CPU/GPU residual and CPU replay residual <= requested targetTolerance',
        angleCriterion:'diagnostic only, NOT a rejection gate',
        groundCriterion:'status and first-ground event/contact agree; event path <= 1 mm difference'},
      scenes:reports,decision:visualSettings?decideVisual(reports):decide(reports),
      ...(visualSettings?{previousPhysicalDecision:decide(reports)}:{}),limitations:[
        '5 mm describes target-height accuracy, not a blanket tolerance on ground contact or apparent angle',
        'CPU replay verifies GPU angle against independent f64 ray model, but is diagnostic only and not in GPU timings',
        'CPU ground-level endpoints use a tighter internal solve tolerance and protective endpoint classification',
        'The GPU 33-angle sweep does not prove all roots or tangential contacts were found',
        'The preserved 2x cold GPU stage speed gate excludes full adaptive scene/frame costs',
        'No GPU backend or rendering switch; production authorization always false',
        ...(visualSettings?[
          'No images are rendered or pixel-diffed; 2D illustrative launch-angle shift is not an actual camera or scene-projection measurement',
          'A subpixel angular shift cannot certify occlusion silhouettes, visibility or visual equivalence',
          'Near-boundary candidates flag possible visually minor cases for frame inspection, never automatic passes',
          'Viewport/FOV, near-ground and endpoint parameters are scenarios, not production camera settings or safety thresholds']:[])]};
  }
  // #140.12.5: actual GPU shooting scaling, not a full-frame renderer test.
  // Expanded batches replicate real fixture targets exactly; identical prefix
  // rays can therefore be checked across dispatch sizes without changing the
  // physical scene. This deliberately does not invent a new camera/scene.
  function performanceOptions(options){
    options=options||{};
    var maxRays=options.maxRays===undefined?1024:options.maxRays;
    var warmRepeats=options.warmRepeats===undefined?2:options.warmRepeats;
    if(![256,512,1024].includes(maxRays)||![1,2,3].includes(warmRepeats))
      throw RangeError('Performance scaling supports maxRays 256/512/1024 and 1–3 warm repeats');
    return {maxRays:maxRays,warmRepeats:warmRepeats,
      visual:screenProxyOptions(Object.assign({pixelBudgetPx:1},options.visual||{}))};
  }
  function replicatedRequest(base,count){
    gpu.checked(base);
    if(!Number.isInteger(count)||count<base.targets.length||count>1024||
        count%base.targets.length!==0)
      throw RangeError('Scaling count must be an integral fixture replication up to 1024');
    var targets=Array.from({length:count},function(_,i){return base.targets[i%base.targets.length].slice();});
    return Object.assign({},base,{targets:targets});
  }
  function compactVisualComparison(visual,physical){
    return {kind:visual.kind,view:visual.view,counts:visual.counts,
      maxLaunchAngleProxyShiftPx:visual.maxLaunchAngleProxyShiftPx,
      frameReviewTargetIndices:visual.targets.filter(function(t){return t.requiresActualFrameReview;})
        .map(function(t){return t.targetIndex;}),
      cpuReplayResidualExceeded:physical.counts.gpuReplayResidualExceeded,
      actualRenderedImageCompared:false,visualEquivalenceProven:false};
  }
  async function runPerformance(fixture,deps,options){
    options=options||{};
    var settings=performanceOptions(options),solver=options.solver||gpu;
    var entries=gpu.fixtureRequests(fixture),reports=[];
    // Report workgroup counts as information about dispatch, NOT GPU occupancy.
    for(var entry of entries){
      var session=null,steps=[],baseline=null,quality=null,device=null;
      try{
        session=await solver.createSession(settings.maxRays,deps,{refinement:'residual-stop'});
        for(var count=entry.request.targets.length;count<=settings.maxRays;count*=2){
          var req=replicatedRequest(entry.request,count),began=now();
          var cpu=await contract.solveCpuBatch(req),cpuMs=now()-began;
          var measured=await session.solve(req,{warmRepeats:settings.warmRepeats});
          device=measured.device;
          var timing=measured.timing,warm=timing.gpuWarmMedianMs;
          if(!Number.isFinite(warm)||warm<=0||!Number.isFinite(cpuMs))
            throw Error('Invalid measured scaling timings');
          var prefix=measured.response.results.slice(0,entry.request.targets.length);
          // The prefix must not change merely because dispatch size changed.
          var prefixStable=baseline===null?true:JSON.stringify(prefix)===JSON.stringify(baseline);
          if(baseline===null){
            baseline=prefix;
            var physical=physicalComparison(req,cpu,measured.response);
            quality=compactVisualComparison(visualComparison(req,cpu,measured.response,
              settings.visual,physical),physical);
          }
          var byStatus=measured.response.results.reduce(function(acc,result){
            acc[result.status]=(acc[result.status]||0)+1;return acc;
          },{});
          steps.push({rays:count,replicatedFixture:count/entry.request.targets.length,
            cpuMs:cpuMs,gpuFirstBatchMs:timing.gpuUploadToReadbackMs,
            gpuWarmMedianMs:warm,gpuWarmRunsMs:timing.warmRunMs,
            gpuCpuWarmSpeedup:cpuMs/warm,
            gpuWarmRaysPerSecond:1000*count/warm,
            gpuWorkgroups:{sweep:Math.ceil(count*33/64),refine:Math.ceil(count/64)},
            gpuWallClockPhases:timing.wallClockPhases,
            gpuOutputBitwiseStable:timing.warmOutputBitwiseStable,
            identicalFixturePrefixStable:prefixStable,gpuStatusCounts:byStatus});
          if(typeof options.onProgress==='function')options.onProgress(entry.id,count,settings.maxRays);
        }
        reports.push({id:entry.id,status:'measured',baseTargets:entry.request.targets.length,
          setupMs:session.setupMs,sessionCapacity:settings.maxRays,
          sessionReusesDevicePipelinesBuffers:true,device:device,
          baselineVisualProxy:quality,scaling:steps});
      }catch(error){reports.push({id:entry.id,status:'unavailable',
        reason:String(error.message||error),scaling:steps});}
      finally{if(session)session.close();}
    }
    var measuredAll=reports.every(function(r){return r.status==='measured';});
    var stable=measuredAll&&reports.every(function(r){return r.scaling.every(function(s){
      return s.gpuOutputBitwiseStable&&s.identicalFixturePrefixStable;
    });});
    return {version:'140.12.5',status:measuredAll?'finished':'incomplete',
      experiment:'Performance-first GPU shooting scaling with one reusable session per geometry',
      measurement:{batchSizes:'64, 128, 256, 512, 1024 (up to selected max)',
        batchConstruction:'Exact deterministic replication of the same 64 12-tower targets; not independent scene complexity',
        gpuPolicy:'residual-stop',warmRepeats:settings.warmRepeats,
        deviceSession:'One adapter/device, two pipelines and fixed-capacity buffers per scene',
        timings:'CPU f64 shooting separately; GPU total/upload/encode-submit/wait-readback browser wall-clock, not GPU timestamp queries',
        screenProxy:'Illustrative launch-angle projection, 1 px default, evaluated only for original 64 fixture targets'},
      scenes:reports,decision:{verdict:!measuredAll?'INCONCLUSIVE':!stable?
        'SCALING_STABILITY_REVIEW':'PERFORMANCE_PROFILE_ONLY',productionAuthorized:false,
        visualEquivalenceProven:false,requiresFullFrameComparison:true,
        nextAction:!measuredAll?'Check unavailable hardware/measurements; retain CPU':
          !stable?'Investigate output changes across repeats or dispatch sizes; retain CPU':
          'Use measured warm throughput to choose next GPU optimization; confirm actual silhouette/frame parity and whole-frame costs'},
      limitations:[
        'Not a rendered frame, image diff, production camera projection or FPS benchmark',
        '1 px illustrative angular budget is a prioritization target, not an occlusion/silhouette equivalence proof',
        'Scaled batches reuse identical fixture targets and may have different cache/load behavior from real dense scenes',
        'Each CPU size has one wall-clock sample; warm GPU samples include upload, dispatch, fence and readback',
        'Wall-clock phase splits are not GPU execution timestamps; wait/readback can include queued kernel execution',
        'CPU replay and ground checks occur only for the 64 original fixture targets, outside all timed GPU runs',
        'GPU execution is experimental and does not authorize replacing the production solver or renderer']};
  }
  // #140.12.6: dense REAL boundary samples (the polygon-edge sample pool is
  // generated from the same physical scene). No repeated target coordinates.
  // Bit reversal spreads the first 64/128/... targets across the whole scene
  // while guaranteeing that previous targets keep their indices on growth.
  function denseOptions(options){
    options=options||{};
    var maxRays=options.maxRays===undefined?1024:options.maxRays;
    var warmRepeats=options.warmRepeats===undefined?2:options.warmRepeats;
    if(![256,512,1024].includes(maxRays)||![1,2,3].includes(warmRepeats))
      throw RangeError('Dense scaling requires 256/512/1024 maximum rays and 1–3 warm repeats');
    return {maxRays:maxRays,warmRepeats:warmRepeats,
      visual:screenProxyOptions(Object.assign({pixelBudgetPx:1},options.visual||{}))};
  }
  function reverseTenBits(i){
    var reversed=0;
    for(var j=0;j<10;j++){reversed=(reversed<<1)|(i&1);i>>=1;}
    return reversed;
  }
  function denseRequest(scene,base,count){
    gpu.checked(base);
    if(!scene||!Array.isArray(scene.denseTargets)||scene.denseTargets.length!==1024||
      ![64,128,256,512,1024].includes(count))
      throw RangeError('Exactly 1024 precomputed production polygon-edge targets required');
    var surface=rayTracer.resolveGeometry({geometry:base.geometry,radius:base.radius}).surface;
    var targets=Array.from({length:count},function(_,i){
      var target=scene.denseTargets[reverseTenBits(i)];
      if(!Array.isArray(target)||target.length!==2||!target.every(Number.isFinite)||
          target[0]<=0||target[1]<0)throw Error('Invalid physical polygon-edge target');
      return surface.surfacePoint2(target[0],target[1]);
    });
    return Object.assign({},base,{targets:targets});
  }
  // A one-dimensional raster of projected *visible target point occupancy*.
  // This is NOT an image, polygon fill, depth buffer, production camera,
  // silhouette or full-frame parity measurement. Unknown rays never count as
  // resolved pixels. A one-pixel neighborhood is a triage comparison only.
  function projectedTargetOccupancy(request,cpu,gpuResponse,settings){
    var view=screenProxyOptions(settings);
    contract.validateResponse(request,cpu);contract.validateResponse(request,gpuResponse);
    var cpuMask=new Uint8Array(view.viewportHeightPx),gpuMask=new Uint8Array(view.viewportHeightPx);
    var counts={targets:request.targets.length,projectedPairs:0,
      subpixelAngleProxy:0,overPixelBudget:0,statusDisagreements:0,
      unresolvedPairs:0,groundEvidenceDisagreements:0,offscreenPairs:0};
    var maxShift=0,review=[],profile=rayTracer.atmosphere(request.atmosphere,request.profileOptions);
    for(var i=0;i<request.targets.length;i++){
      var a=cpu.results[i],b=gpuResponse.results[i];
      var ay=perspectiveY(a.angle,view),by=perspectiveY(b.angle,view);
      var shift=ay===null||by===null?null:Math.abs(ay-by);
      var uncertain=['solver_failed','indeterminate'].includes(a.status)||
        ['solver_failed','indeterminate'].includes(b.status);
      var statusMismatch=a.status!==b.status;
      var eventA=a.ground&&a.ground.event,eventB=b.ground&&b.ground.event;
      var groundMismatch=!!(a.ground&&a.ground.hitGround)!==!!(b.ground&&b.ground.hitGround)||
        !!eventA!==!!eventB||(eventA&&eventB&&eventA.contact!==eventB.contact);
      if(uncertain)counts.unresolvedPairs++;
      if(statusMismatch)counts.statusDisagreements++;
      if(groundMismatch)counts.groundEvidenceDisagreements++;
      if(shift===null)counts.offscreenPairs++;
      else{
        counts.projectedPairs++;maxShift=Math.max(maxShift,shift);
        if(shift<=view.pixelBudgetPx)counts.subpixelAngleProxy++;
        else counts.overPixelBudget++;
      }
      // A visible target marks one sample pixel (not a filled geometry pixel).
      if(a.status==='visible'&&ay!==null)cpuMask[Math.min(cpuMask.length-1,Math.max(0,Math.floor(ay)))]=1;
      if(b.status==='visible'&&by!==null)gpuMask[Math.min(gpuMask.length-1,Math.max(0,Math.floor(by)))]=1;
      if(statusMismatch||groundMismatch||uncertain||(shift!==null&&shift>view.pixelBudgetPx)){
        review.push({targetIndex:i,cpuStatus:a.status,gpuStatus:b.status,
          shiftPx:shift,groundEvidenceDifferent:groundMismatch});
      }
    }
    var strict=0,outsideBudget=0,occupiedCpu=0,occupiedGpu=0;
    var cpuRows=[],gpuRows=[],unmatchedCpuRows=[],unmatchedGpuRows=[];
    var radius=Math.ceil(view.pixelBudgetPx);
    function nearby(mask,i){
      for(var j=Math.max(0,i-radius);j<=Math.min(mask.length-1,i+radius);j++)
        if(mask[j])return true;
      return false;
    }
    for(var px=0;px<cpuMask.length;px++){
      var c=cpuMask[px],g=gpuMask[px];
      occupiedCpu+=c;occupiedGpu+=g;
      if(c)cpuRows.push(px);
      if(g)gpuRows.push(px);
      if(c!==g)strict++;
      if(c&&!nearby(gpuMask,px)){outsideBudget++;unmatchedCpuRows.push(px);}
      if(g&&!nearby(cpuMask,px)){outsideBudget++;unmatchedGpuRows.push(px);}
    }
    // A bounded CPU ground replay is used only to explain contentious rays;
    // never inserted into GPU timings and never confused with frame parity.
    var groundReviews=review.slice(0,24).map(function(item){
      return {targetIndex:item.targetIndex,
        cpuGroundReplayOfGpuAngle:groundReplay(request,gpuResponse.results[item.targetIndex],profile)};
    });
    return {kind:'1D projected visible-target occupancy (NOT rendered silhouettes)',
      view:view,counts:counts,maxLaunchAngleProxyShiftPx:maxShift,
      occupiedSamplePixels:{cpu:occupiedCpu,gpu:occupiedGpu},
      sampleRows:{cpuVisible:cpuRows,gpuVisible:gpuRows,
        unmatchedCpu:unmatchedCpuRows,unmatchedGpu:unmatchedGpuRows},
      strictOccupancyDifferencePixels:strict,unmatchedBeyondPixelBudget:outsideBudget,
      reviewTargetCount:review.length,reviewTargets:review.slice(0,64),
      reviewListTruncated:review.length>64,groundReplays:groundReviews,
      groundReplayTruncated:review.length>24,
      actualRenderedImageCompared:false,actualSilhouetteCompared:false,
      visualEquivalenceProven:false};
  }
  async function runDensePerformance(fixture,deps,options){
    options=options||{};
    var settings=denseOptions(options),solver=options.solver||gpu;
    var entries=gpu.fixtureRequests(fixture),reports=[];
    for(var entry of entries){
      var scene=fixture.scenes.find(function(s){return s.id===entry.id;});
      var session=null,steps=[],device=null,baseline=null,quality=null;
      try{
        // Validate dense source before allocating a GPU session.
        denseRequest(scene,entry.request,settings.maxRays);
        session=await solver.createSession(settings.maxRays,deps,{refinement:'residual-stop'});
        for(var count=64;count<=settings.maxRays;count*=2){
          var req=denseRequest(scene,entry.request,count),began=now();
          var cpu=await contract.solveCpuBatch(req),cpuMs=now()-began;
          var measured=await session.solve(req,{warmRepeats:settings.warmRepeats});
          device=measured.device;
          var timing=measured.timing,warm=timing.gpuWarmMedianMs;
          if(!Number.isFinite(warm)||warm<=0||!Number.isFinite(cpuMs))
            throw Error('Invalid dense scaling timing');
          var prefix=measured.response.results;
          var stable=baseline===null||prefix.slice(0,baseline.length).every(function(r,i){
            return JSON.stringify(r)===JSON.stringify(baseline[i]);
          });
          baseline=prefix;
          // The first and final sizes provide independent visual diagnostics;
          // intermediate batches are timed with no extra CPU replay.
          if(count===settings.maxRays)
            quality=projectedTargetOccupancy(req,cpu,measured.response,settings.visual);
          steps.push({rays:count,uniquePhysicalTargets:count,
            cpuMs:cpuMs,gpuFirstBatchMs:timing.gpuUploadToReadbackMs,
            gpuWarmMedianMs:warm,gpuWarmRunsMs:timing.warmRunMs,
            gpuCpuWarmSpeedup:cpuMs/warm,gpuWarmRaysPerSecond:1000*count/warm,
            gpuWallClockPhases:timing.wallClockPhases,
            gpuOutputBitwiseStable:timing.warmOutputBitwiseStable,
            sharedPrefixStable:stable});
          if(typeof options.onProgress==='function')options.onProgress(entry.id,count,settings.maxRays);
        }
        reports.push({id:entry.id,status:'measured',source:'real 12-tower physical polygon edges',
          denseSourcePointCount:scene.denseSourcePointCount,
          sessionCapacity:settings.maxRays,setupMs:session.setupMs,
          sessionReusesDevicePipelinesBuffers:true,device:device,
          scaling:steps,projectedTargetOccupancy:quality});
      }catch(error){reports.push({id:entry.id,status:'unavailable',
        reason:String(error.message||error),scaling:steps});}
      finally{if(session)session.close();}
    }
    var measuredAll=reports.every(function(s){return s.status==='measured';});
    var stable=measuredAll&&reports.every(function(s){return s.scaling.every(function(t){
      return t.gpuOutputBitwiseStable&&t.sharedPrefixStable;
    });});
    return {version:'140.12.6',status:measuredAll?'finished':'incomplete',
      experiment:'Dense physical polygon-edge GPU shooting scaling and 1D projected visible-target occupancy diagnostic',
      measurement:{batchSizes:'64, 128, 256, 512, 1024 (up to selected maximum)',
        batchConstruction:'Distinct distance-distributed samples on real 12-tower polygon edges; nested 10-bit bit-reversal ordering',
        gpuPolicy:'residual-stop',warmRepeats:settings.warmRepeats,
        deviceSession:'One device, two pipelines and fixed-capacity buffers reused per scene',
        timings:'CPU f64 shooting separately; GPU warm includes browser upload/dispatch/fence/readback wall-clock',
        screenProxy:'1D projected visible-target occupancy and angle proxy at the largest batch, not production rendering'},
      scenes:reports,decision:{verdict:!measuredAll?'INCONCLUSIVE':!stable?
        'DENSE_STABILITY_REVIEW':'DENSE_PROFILE_REVIEW_ONLY',
        productionAuthorized:false,visualEquivalenceProven:false,
        requiresFullFrameComparison:true,
        nextAction:!measuredAll?'Resolve unavailable dense GPU/CPU measurements; retain CPU':
          !stable?'Investigate batch-dependent GPU output; retain CPU':
          'Review projected-target occupancy disagreements; compare actual production CPU/GPU frames before backend integration'},
      limitations:[
        'The dense targets lie on real physical polygon boundaries; they are not independent random rays or pixels of a rendered frame',
        '1D visible-target occupancy is not a silhouette, depth buffer, rasterized geometry, camera projection or full-frame image diff',
        'Subpixel launch-angle differences cannot certify correct visible/blocked classifications',
        'Only a bounded subset of contentious GPU rays receives independent CPU ground replay, outside all GPU timings',
        'CPU has one wall-clock sample per size; GPU warm timings include transfer/synchronization and are not kernel timestamps',
        'GPU solve is experimental; no production renderer or backend is changed or authorized']};
  }
  return Object.freeze({tolerance:tolerance,cpuReplay:cpuReplay,
    physicalComparison:physicalComparison,screenProxyOptions:screenProxyOptions,
    perspectiveY:perspectiveY,groundReplay:groundReplay,visualComparison:visualComparison,
    decide:decide,decideVisual:decideVisual,run:run,
    performanceOptions:performanceOptions,replicatedRequest:replicatedRequest,runPerformance:runPerformance,
    denseOptions:denseOptions,denseRequest:denseRequest,reverseTenBits:reverseTenBits,
    projectedTargetOccupancy:projectedTargetOccupancy,runDensePerformance:runDensePerformance});
}));
