/* #140.12.41 — original-scene CPU f64 vs GPU double-single RK4 sample gate.
 * Actual GPU and CPU results are always retained separately, including
 * unresolved roots and near-contact uncertainty. Point plots are NOT frames.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureGpuDsPainterGate141240'):root.CurvatureGpuDsPainterGate141240,
    typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?
    require('./CurvatureGpuPixelSpaceAudit141233'):root.CurvatureGpuPixelSpaceAudit141233,
    typeof module==='object'&&module.exports?
    require('./CurvatureAttributionVisualZip141236'):root.CurvatureAttributionVisualZip141236);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuDsRk4Audit141241=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(gate,contract,pixels,visual){
'use strict';
if(!gate||!contract||!pixels||!visual)throw Error('DS RK4 audit dependencies unavailable');
var VERSION='140.12.41';
function makeReport(inputs,gpu,cpu,camera,timings,cpuFrame){
  var request=inputs.request;
  contract.validateResponse(request,cpu);contract.validateResponse(request,gpu);
  if(gpu.backend!=='gpu-experimental'||cpu.backend!=='cpu-reference')throw Error('Incorrect shooting backend');
  var stats={targets:request.targets.length,cpuVisible:0,cpuBlocked:0,cpuIndeterminate:0,cpuFailed:0,
    gpuVisible:0,gpuBlocked:0,gpuIndeterminate:0,gpuFailed:0,statusMatches:0,
    statusMismatches:0,fullyComparable:0,withinHalfPixel:0,overHalfPixel:0,
    maxAngleDifferenceRadians:null,maxPixelDisplacementPx:null,
    maxResidualDifferenceMetres:null,groundContactMismatches:0,
    groundEventKindMismatches:0,maxGroundEventPathDifferenceMetres:null,
    unresolvedOrIndeterminate:0};
  var rows=request.targets.map(function(target,i){
    var a=cpu.results[i],b=gpu.results[i],origin=inputs.selected[i],
      cpuPixel=a.angle===null?null:pixels.project(camera,a.angle),
      gpuPixel=b.angle===null?null:pixels.project(camera,b.angle),
      angleError=a.angle===null||b.angle===null?null:Math.abs(a.angle-b.angle),
      errorPx=cpuPixel&&gpuPixel?Math.hypot(cpuPixel.xPx-gpuPixel.xPx,cpuPixel.yPx-gpuPixel.yPx):null,
      residualError=a.residual===null||b.residual===null?null:Math.abs(a.residual-b.residual),
      groundMismatch=!!a.ground!==!!b.ground||(!!a.ground&&!!b.ground&&a.ground.hitGround!==b.ground.hitGround),
      aEvent=a.ground&&a.ground.event,bEvent=b.ground&&b.ground.event,
      kindMismatch=!!aEvent!==!!bEvent||(!!aEvent&&!!bEvent&&aEvent.contact!==bEvent.contact),
      eventError=aEvent&&bEvent?Math.abs(aEvent.pathLength-bEvent.pathLength):null;
    stats['cpu'+(a.status==='visible'?'Visible':a.status==='blocked'?'Blocked':a.status==='indeterminate'?'Indeterminate':'Failed')]++;
    stats['gpu'+(b.status==='visible'?'Visible':b.status==='blocked'?'Blocked':b.status==='indeterminate'?'Indeterminate':'Failed')]++;
    if(a.status===b.status)stats.statusMatches++;else stats.statusMismatches++;
    if(a.status==='solver_failed'||b.status==='solver_failed'||a.status==='indeterminate'||b.status==='indeterminate')
      stats.unresolvedOrIndeterminate++;
    if(angleError!==null){stats.fullyComparable++;
      stats.maxAngleDifferenceRadians=Math.max(stats.maxAngleDifferenceRadians||0,angleError);
      stats.maxResidualDifferenceMetres=Math.max(stats.maxResidualDifferenceMetres||0,residualError);}
    if(errorPx!==null){stats.maxPixelDisplacementPx=Math.max(stats.maxPixelDisplacementPx||0,errorPx);
      if(errorPx<=.5)stats.withinHalfPixel++;else stats.overHalfPixel++;}
    if(groundMismatch)stats.groundContactMismatches++;
    if(kindMismatch)stats.groundEventKindMismatches++;
    if(eventError!==null)stats.maxGroundEventPathDifferenceMetres=Math.max(stats.maxGroundEventPathDifferenceMetres||0,eventError);
    return {index:i,target:target.slice(),physicalHeightMetres:origin.heightMetres,
      distanceMetres:origin.distanceMetres,sourceIndex:origin.sourceIndex,
      placedObjectIndex:origin.placedObjectIndex,authoredOpaque:origin.authoredOpaque,
      cpuStatus:a.status,gpuStatus:b.status,statusMismatch:a.status!==b.status,
      cpuAngleRadians:a.angle,gpuAngleRadians:b.angle,angleErrorRadians:angleError,
      cpuPixel:cpuPixel,gpuPixel:gpuPixel,pixelDisplacementPx:errorPx,
      cpuResidualMetres:a.residual,gpuResidualMetres:b.residual,residualErrorMetres:residualError,
      cpuPathLengthMetres:a.pathLength,gpuPathLengthMetres:b.pathLength,
      cpuGround:a.ground,gpuGround:b.ground,groundMismatch:groundMismatch,
      groundEventKindMismatch:kindMismatch,groundEventPathErrorMetres:eventError,
      gpuEvaluations:b.evaluations,gpuRk4Calls:b.rk4Calls,gpuEventChecks:b.eventChecks,
      gpuFailureReason:b.reason};
  });
  return {version:VERSION,kind:'GPU double-single RK4 first-forward-x shooting vs CPU f64 reference',
    verdict:stats.statusMismatches===0&&stats.unresolvedOrIndeterminate===0&&
      stats.fullyComparable===request.targets.length&&stats.maxPixelDisplacementPx<=.5&&
      stats.groundContactMismatches===0&&stats.groundEventKindMismatches===0&&
      (stats.maxGroundEventPathDifferenceMetres===null||stats.maxGroundEventPathDifferenceMetres<=.001)&&
      stats.maxResidualDifferenceMetres<=1e-6?
      'sample_parity_candidate':'sample_parity_not_established',
    eligibleForCpuPainter:false,gpuDsFullFrameAvailable:false,cpuFrameParityAvailable:false,
    originalScene:true,selection:inputs.selection,geometry:{geometry:request.geometry,radiusMetres:request.radius,
      observerHeightMetres:request.observerHeight,atmosphere:request.atmosphere,
      shootingStepMetres:request.controls.step,contactEventSubsteps:request.controls.eventSubsteps},
    camera:camera,cpuFrame:{width:cpuFrame.width,height:cpuFrame.height,
      source:'actual Compare A Canvas; only CPU reference is a full frame'},
    stats:stats,timings:timings,rows:rows,
    limitations:['One GPU invocation per physical scene target, one first-forward-x root branch; not all multipath rays',
      'GPU uses software double-single, not true IEEE f64; branch decisions can still differ at grazing boundaries',
      'RK4 shooting and 8-substep ground event search ported; f32-range approximations and fixed loop budgets require real GPU validation',
      'Only 48 selected real object-edge points; not the adaptive polygon sample set and not a full GPU-rendered image',
      'A passing 48-point sample gate does NOT certify painter-equivalent polygon topology or visibility elsewhere',
      'Runtime includes GPU dispatch and readback; initialization and CPU shooting measured separately',
      'Unsupported performance batch sizes are never inferred, fabricated or interpolated',
      'Production shooting, shared optical field, painter, WebGPU renderer and geometry remain untouched']};
}
function blank(w,h){var rgba=new Uint8ClampedArray(w*h*4);rgba.fill(255);return {width:w,height:h,rgba:rgba};}
function dot(frame,p,color){if(!p||!p.inFrame)return;
  var w=frame.width,h=frame.height,cx=Math.round(p.xPx),cy=Math.round(p.yPx);
  for(var y=Math.max(0,cy-3);y<=Math.min(h-1,cy+3);y++)
    for(var x=Math.max(0,cx-3);x<=Math.min(w-1,cx+3);x++){
      var off=(y*w+x)*4;frame.rgba.set(color,off);
    }
}
function overlay(report,kind){var frame=blank(report.camera.widthPx,report.camera.heightPx);
  report.rows.forEach(function(r){
    if(kind==='cpu')dot(frame,r.cpuPixel,[40,100,210,255]);
    else if(kind==='gpu')dot(frame,r.gpuPixel,[225,110,35,255]);
    else dot(frame,r.cpuPixel,r.statusMismatch?[235,45,45,255]:
      r.gpuStatus==='solver_failed'||r.gpuStatus==='indeterminate'?[145,65,180,255]:
      r.pixelDisplacementPx!==null&&r.pixelDisplacementPx>.5?[240,150,10,255]:[40,150,75,255]);
  });return frame;
}
function performance(report){var frame=blank(640,320),t=report.timings,
  values=[t.gpuSessionSetupMs,t.gpuCompileMs,t.gpuDispatchReadbackMs,t.cpuOracleMs],
  colors=[[100,110,130,255],[90,140,220,255],[210,125,30,255],[50,150,80,255]],
  max=Math.max(1,...values.filter(Number.isFinite));
  values.forEach(function(v,i){if(!Number.isFinite(v))return;
    var x=30+i*155,bar=Math.min(240,Math.round(v/max*240));
    for(var y=275-bar;y<275;y++)for(var px=x;px<x+110;px++){
      frame.rgba.set(colors[i],(y*frame.width+px)*4);
    }
  });return frame;
}
function entries(report,cpuFrame,doc){return [
  {name:'results.json',data:JSON.stringify(report,null,2)},
  {name:'cpu-reference.png',data:visual.png(cpuFrame,doc)},
  {name:'cpu-f64-ray-positions-SAMPLES.png',data:visual.png(overlay(report,'cpu'),doc)},
  {name:'gpu-ds-rk4-ray-positions-NOT-A-FRAME.png',data:visual.png(overlay(report,'gpu'),doc)},
  {name:'status-and-position-disagreements-SAMPLES-ONLY.png',data:visual.png(overlay(report,'mismatch'),doc)},
  {name:'performance-48-target-batch.png',data:visual.png(performance(report),doc)},
  {name:'README.txt',data:[
    'Curvature #140.12.41 — GPU DS RK4 shooting / sampled first-ground-event parity gate',
    'Real scene 48 authored physical object-edge targets, matched CPU f64 / GPU DS.',
    'cpu-reference.png: true current Compare A Canvas screenshot.',
    'All remaining ray-position images are diagnostic overlays on white background, NOT GPU rendered object frames.',
    'Disagreements: red = unequal statuses; purple = unresolved/indeterminate; orange = >0.5 pixel; green = other samples.',
    'Bars: GPU session setup, WGSL compile (included in setup), GPU dispatch+readback, CPU f64 reference.',
    'GPU first-forward-x RK4 shooting plus sampled ground event search use software DS, not true f64.',
    'The complete adaptive polygon projection/painter has NOT been transferred to GPU.',
    'One batch of 48 objects, no extrapolation to 64/256/1024/4096 targets.',
    'Unresolved rays stay unresolved. CPU answers do not seed the GPU solver.',
    ''
  ].join('\n')}
];}
return Object.freeze({VERSION:VERSION,makeReport:makeReport,overlay:overlay,performance:performance,entries:entries});
}));
