/* #140.11: diagnostic-only batch shooting contract; NO GPU solver and NO
 * production dispatch. A reference adapter makes the next experiment compare
 * complete target results, never merely RK4 rays or candidate angles.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('../optics/OpticalTargetProjection'):root.CurvatureTargetProjection);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureOpticalBatchContract1411=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projection){
  'use strict';
  var BRANCH='first-forward-x';
  var STATUSES=['visible','blocked','indeterminate','solver_failed'];
  var ATMOSPHERES=['vacuum','standard','exponential-occlusion','inverse-spherical'];
  var CONTROLS=['step','targetTolerance','maxIterations','maxSteps',
    'initialSpan','maxSpan','eventSubsteps','contactTolerance'];
  var MAX_TARGETS=16384;
  function finite(value){return typeof value==='number'&&Number.isFinite(value);}
  function validateRequest(request){
    if(!request||typeof request!=='object'||Array.isArray(request))throw TypeError('Batch request required');
    if(request.branch!==BRANCH)throw RangeError('Only the first-forward-x branch is specified');
    if(!['flat','globe'].includes(request.geometry)||!finite(request.radius)||request.radius<=0||
        !finite(request.observerHeight)||request.observerHeight<0)
      throw RangeError('Invalid optical geometry or observer height');
    if(!ATMOSPHERES.includes(request.atmosphere))throw RangeError('Unsupported batch atmosphere');
    if(!Array.isArray(request.targets)||request.targets.length===0||request.targets.length>MAX_TARGETS||
        request.targets.some(function(t){return !Array.isArray(t)||t.length!==2||
          !finite(t[0])||!finite(t[1])||t[0]<=0;}))
      throw RangeError('Batch targets must be finite [x,z], x > 0');
    if(request.profile!==undefined||request.curvature!==undefined||request.surfaceArithmetic==='legacy')
      throw RangeError('Custom profiles, explicit curvature and legacy arithmetic are outside the metric batch contract');
    if(request.profileOptions!==undefined&&(!request.profileOptions||
        typeof request.profileOptions!=='object'||Array.isArray(request.profileOptions)||
        Object.values(request.profileOptions).some(function(v){return !finite(v);})) )
      throw RangeError('Only numeric profile options are supported');
    var controls=request.controls===undefined?{}:request.controls;
    if(!controls||typeof controls!=='object'||Array.isArray(controls)||
        Object.keys(controls).some(function(k){return !CONTROLS.includes(k);}))
      throw RangeError('Unrecognized optical shooting controls');
    // Reject invalid numeric controls early, but let the CPU oracle retain
    // authority over its precise bounds (including integer-only controls).
    if(Object.values(controls).some(function(v){return !finite(v);}))
      throw RangeError('Nonfinite shooting control');
    return request;
  }
  function groundEvidence(ray){
    return {hitGround:ray.hitGround,travelled:ray.travelled,
      event:ray.event?{kind:ray.event.kind,contact:ray.event.contact,
        pathLength:ray.event.pathLength}:null};
  }
  function resultFromCpu(result){
    return {target:result.target,status:result.status,angle:result.angle,
      residual:result.residual,pathLength:result.pathLength===undefined?null:result.pathLength,
      ground:result.ray?groundEvidence(result.ray):null,reason:result.reason||null};
  }
  function validateResponse(request,response){
    validateRequest(request);
    if(!response||typeof response!=='object'||response.branch!==BRANCH||
        !['cpu-reference','gpu-experimental'].includes(response.backend)||
        !Array.isArray(response.results)||response.results.length!==request.targets.length)
      throw TypeError('Invalid batch response shape, order or backend');
    response.results.forEach(function(result,i){
      if(!result||!Array.isArray(result.target)||result.target.length!==2||
          result.target[0]!==request.targets[i][0]||result.target[1]!==request.targets[i][1]||
          !STATUSES.includes(result.status))
        throw RangeError('Target order, coordinates or status mismatch at '+i);
      if(result.status==='solver_failed'){
        if(result.angle!==null||result.residual!==null||result.pathLength!==null||
            result.ground!==null||typeof result.reason!=='string'||!result.reason)
          throw RangeError('Unresolved target must fail closed at '+i);
        return;
      }
      if(!finite(result.angle)||Math.abs(result.angle)>=Math.PI/2||
          !finite(result.residual)||!finite(result.pathLength)||result.pathLength<=0)
        throw RangeError('Nonfinite or invalid solved ray at '+i);
      var ground=result.ground;
      if(!ground||typeof ground.hitGround!=='boolean'||!finite(ground.travelled)||
          ground.travelled<0||
          (ground.hitGround&&(!ground.event||ground.event.kind!=='ground'||
            !['crossing','grazing'].includes(ground.event.contact)||
            !finite(ground.event.pathLength)||ground.event.pathLength<0||
            Math.abs(ground.travelled-ground.event.pathLength)>1e-6))||
          (!ground.hitGround&&ground.event!==null)||
          ground.travelled>result.pathLength+1e-6||
          (result.status==='blocked'&&(!ground.hitGround||
            ground.travelled>=result.pathLength-1e-6)))
        throw RangeError('Missing or inconsistent first-ground-event evidence at '+i);
      // The shape of evidence is NOT numerical certification; the next GPU
      // solver must actually detect the first ground event and pass CPU parity.
    });
    return response;
  }
  async function solveCpuBatch(request){
    validateRequest(request);
    // This adapter provides API parity, NOT CPU parallelism or a nonblocking
    // frame path. Run it only in explicit diagnostics / tests.
    var common={geometry:request.geometry,radius:request.radius,
      observerHeight:request.observerHeight,atmosphere:request.atmosphere,
      profileOptions:request.profileOptions};
    Object.assign(common,request.controls||{});
    var prepared=projection.preparedOptions(common);
    var results=request.targets.map(function(target){
      return resultFromCpu(projection.solve(Object.assign({},prepared,{target:target})));
    });
    return validateResponse(request,{backend:'cpu-reference',branch:BRANCH,results:results});
  }
  function compare(request,reference,candidate,options){
    validateResponse(request,reference);
    validateResponse(request,candidate);
    if(reference.backend!=='cpu-reference'||candidate.backend!=='gpu-experimental')
      throw RangeError('Comparison needs CPU reference and experimental GPU results');
    var angleTolerance=options&&options.angleTolerance!==undefined?
      options.angleTolerance:1e-7;
    var residualTolerance=options&&options.residualTolerance!==undefined?
      options.residualTolerance:request.controls&&request.controls.targetTolerance||1e-6;
    var groundEventTolerance=options&&options.groundEventTolerance!==undefined?
      options.groundEventTolerance:1e-3;
    if([angleTolerance,residualTolerance,groundEventTolerance].some(function(v){return !finite(v)||v<=0;}))
      throw RangeError('Invalid comparison tolerances');
    var statusMismatch=0,angleMismatch=0,residualMismatch=0,groundEventMismatch=0,
      maxAngularErrorRadians=0,maxResidualErrorMetres=0,
      maxGroundEventErrorMetres=0,unresolved=0;
    reference.results.forEach(function(a,i){
      var b=candidate.results[i];
      if(a.status!==b.status)statusMismatch++;
      if(a.status==='solver_failed'||b.status==='solver_failed'||
          a.status==='indeterminate'||b.status==='indeterminate')unresolved++;
      if(a.angle!==null&&b.angle!==null){
        var d=Math.abs(a.angle-b.angle);
        maxAngularErrorRadians=Math.max(maxAngularErrorRadians,d);
        if(d>angleTolerance)angleMismatch++;
        var r=Math.abs(a.residual-b.residual);
        maxResidualErrorMetres=Math.max(maxResidualErrorMetres,r);
        if(r>residualTolerance)residualMismatch++;
        var ga=a.ground,gb=b.ground;
        if(ga.hitGround!==gb.hitGround||!!ga.event!==!!gb.event||
            (ga.event&&gb.event&&ga.event.contact!==gb.event.contact))
          groundEventMismatch++;
        else if(ga.event&&gb.event){
          var delta=Math.abs(ga.event.pathLength-gb.event.pathLength);
          maxGroundEventErrorMetres=Math.max(maxGroundEventErrorMetres,delta);
          if(delta>groundEventTolerance)groundEventMismatch++;
        }
      }
    });
    return {statusMismatch:statusMismatch,angleMismatch:angleMismatch,
      residualMismatch:residualMismatch,groundEventMismatch:groundEventMismatch,
      maxAngularErrorRadians:maxAngularErrorRadians,
      maxResidualErrorMetres:maxResidualErrorMetres,
      maxGroundEventErrorMetres:maxGroundEventErrorMetres,
      unresolved:unresolved,
      sampleMatches:statusMismatch===0&&angleMismatch===0&&
        residualMismatch===0&&groundEventMismatch===0&&unresolved===0};
  }
  return {BRANCH:BRANCH,MAX_TARGETS:MAX_TARGETS,validateRequest:validateRequest,
    validateResponse:validateResponse,solveCpuBatch:solveCpuBatch,compare:compare};
}));
