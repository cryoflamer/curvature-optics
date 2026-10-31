/* #140.12.40 — Real-scene GPU double-single shooting feasibility gate.
 * Research only: the existing #140.12.32 GPU solver uses a radial Bouguer
 * quadrature and is NOT the CPU RK4 shooter's algorithm. No pixel parity or
 * exact visibility is asserted. This gate prevents substitution of an
 * approximate GPU root into the production CPU painter without certification.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('./CurvatureGpuHighPrecisionShooting141232'):root.CurvatureGpuHighPrecisionShooting141232,
    typeof module==='object'&&module.exports?require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?require('../geometry/CurvatureSurfaceGeometry'):root.CurvatureSurfaceGeometry,
    typeof module==='object'&&module.exports?require('./CurvatureGpuPixelSpaceAudit141233'):root.CurvatureGpuPixelSpaceAudit141233,
    typeof module==='object'&&module.exports?require('./CurvatureAttributionVisualZip141236'):root.CurvatureAttributionVisualZip141236);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuDsPainterGate141240=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(ds,contract,surfaces,pixels,visual){
'use strict';
if(!ds||!contract||!surfaces||!pixels||!visual)throw Error('DS painter gate dependencies missing');
var VERSION='140.12.40', COUNT=48, NODES=['classic_ds_256','classic_ds_512'];
function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
function isFinite3(v){return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);}
function requestFromScene(composed,model){
  if(!composed||!composed.scene||composed.scene.metadata.composition!=='optics-neutral-main'||
    composed.scene.metadata.physicalMetricWorld!==true||!Array.isArray(composed.ranges))
    throw TypeError('Optics-neutral metric scene required');
  if(!model||!(model.rEarth>=1e5)||!(model.Height>0&&model.Height<=147))
    throw RangeError('DS quadrature restricted to Globe, R>=100km and 0<h0<=147m');
  var R=model.rEarth,h0=model.Height,surface=surfaces.createFromCurvature(1/R),
    candidates=[],seen=new Set(),excluded={invalid:0,domain:0,duplicate:0,transparent:0};
  composed.ranges.filter(function(r){return r.role==='objects';}).forEach(function(r){
    for(var i=r.start;i<r.end;i++){
      var p=composed.scene.primitives[i];if(!p||!Array.isArray(p.points)||p.points.length<2){excluded.invalid++;continue;}
      if(p.style&&p.style.alpha!==undefined&&p.style.alpha<1){excluded.transparent++;continue;}
      // Sample the actual authored physical edges: no optical projection or
      // inferred CPU roots are used as DS input. Including edge midpoints
      // increases coverage near the vertical faces / foundations.
      for(var j=0;j<p.points.length;j++)for(var k=0;k<3;k++){
        var a=p.points[j],b=p.points[(j+1)%p.points.length];
        if(!isFinite3(a)||!isFinite3(b)){excluded.invalid++;continue;}
        var t=k/3,xyz=a.map(function(x,axis){return x+(b[axis]-x)*t;}),
          x=Math.hypot(xyz[0],xyz[1]),z=xyz[2],h=surface.height2(x,z),
          distance=R*Math.atan2(x,R+z),seed=Math.atan2(z-h0,x);
        // The legacy radial GPU solver has a genuinely narrower domain than
        // CPU RK4 (same-side monotone radial path, no horizontal turning).
        if(!(x>0&&distance>0&&Number.isFinite(h)&&h>=0&&h<=Math.min(200,.02*7350-1e-7)&&
             Math.abs(h-h0)>1e-5&&Math.abs(seed)<.54&&Math.abs(seed)>1e-8&&
             (h<h0?seed<0:seed>0))){excluded.domain++;continue;}
        var id=Math.round(x*1000)+':'+Math.round(z*1000);
        if(seen.has(id)){excluded.duplicate++;continue;}seen.add(id);
        candidates.push({target:[x,z],distanceMetres:distance,heightMetres:h,
          seed:seed,sourceIndex:p.commandIndex,edgeIndex:j,edgeFraction:t,sourceLayer:r.name,
          authoredOpaque:!!(p.mode&2),
          placedObjectIndex:p.metadata&&p.metadata.placedObjectIndex});
      }
    }
  });
  if(candidates.length<COUNT)throw Error('Only '+candidates.length+' real-scene points satisfy the GPU DS monotone radial-leg domain (48 required)');
  // A stable, spatially distributed subset rather than 48 successive points
  // from the first tower/foundation. Sorting by distance and interleaving
  // altitudes gives coverage without CPU reference leakage into GPU seeds.
  candidates.sort(function(a,b){return a.distanceMetres-b.distanceMetres||a.heightMetres-b.heightMetres;});
  var selected=[],used=new Set();
  for(var slot=0;slot<COUNT;slot++){
    var index=Math.min(candidates.length-1,Math.floor((slot+.5)*candidates.length/COUNT));
    while(used.has(index)&&index+1<candidates.length)index++;
    if(used.has(index))throw Error('Cannot select 48 distinct authored targets');
    used.add(index);selected.push(candidates[index]);
  }
  var request={branch:contract.BRANCH,geometry:'globe',radius:R,observerHeight:h0,
    atmosphere:'standard',targets:selected.map(function(c){return c.target.slice();}),
    controls:{step:500,targetTolerance:1e-6,eventSubsteps:8,contactTolerance:1e-6}};
  contract.validateRequest(request);
  var coordinates=selected.map(function(c,i){return {targetIndex:i,distanceMetres:c.distanceMetres,heightMetres:c.heightMetres};}),
    angles=selected.map(function(c){return c.seed;});
  ds.validate(request,coordinates,angles);
  return {request:request,coordinates:coordinates,angles:angles,selected:selected,
    selection:{candidates:candidates.length,selected:COUNT,excluded:excluded,
      selectedAuthoredOpaque: selected.filter(function(p){return p.authoredOpaque;}).length,
      selectedOutlineOnly:selected.filter(function(p){return !p.authoredOpaque;}).length,
      explanation:'48 deterministic samples of original metric object edges and edge interiors in the monotone radial GPU DS domain; NOT a complete scene ray field.'}};
}
function classifyGpu(ray){
  if(!ray||ray.status!=='converged')return 'unresolved';
  if(ray.contactClassification==='within_1cm_uncertain')return 'uncertain';
  if(ray.groundPhase==='no_ground')return 'candidate_clear';
  if(ray.groundPhase==='ground_reachable'&&Number.isFinite(ray.groundMarginSurfaceMetres))
    return ray.groundMarginSurfaceMetres>.01?'candidate_blocked':
      ray.groundMarginSurfaceMetres<-.01?'candidate_clear':'uncertain';
  return 'unresolved';
}
function makeReport(inputs,run,cpu,camera,timings,cpuFrame){
  var req=inputs.request;
  contract.validateResponse(req,cpu);
  if(!run||!NODES.every(function(mode){return run[mode]&&run[mode].traces.length===COUNT;}))
    throw Error('Missing complete independent 48-target GPU DS results');
  var modes={},rows=[];
  NODES.forEach(function(mode){
    var gpu=run[mode].traces,stats={targets:COUNT,converged:0,unresolved:0,
      comparableAngles:0,withinHalfPixel:0,overHalfPixel:0,overOnePixel:0,
      maxAngleDifferenceRadians:null,maxPixelDisplacementPx:null,
      candidateVisibilityDisagreements:0,uncertainOrUnresolvedVisibility:0,
      cpuVisible:0,cpuBlocked:0,cpuIndeterminate:0,cpuFailed:0};
    gpu.forEach(function(g,i){
      var c=cpu.results[i],point=inputs.selected[i],cpuPoint=c.angle===null?null:pixels.project(camera,c.angle),
        gpuPoint=g.status==='converged'?pixels.project(camera,g.angleRadians):null,
        error=c.angle!==null&&g.status==='converged'?Math.abs(g.angleRadians-c.angle):null,
        shift=cpuPoint&&gpuPoint?Math.hypot(gpuPoint.xPx-cpuPoint.xPx,gpuPoint.yPx-cpuPoint.yPx):null,
        gpuClass=classifyGpu(g),cpuClass=c.status,
        mismatch=(cpuClass==='visible'&&gpuClass==='candidate_blocked')||
          (cpuClass==='blocked'&&gpuClass==='candidate_clear');
      if(g.status==='converged')stats.converged++;else stats.unresolved++;
      stats['cpu'+(cpuClass==='visible'?'Visible':cpuClass==='blocked'?'Blocked':cpuClass==='indeterminate'?'Indeterminate':'Failed')]++;
      if(error!==null){stats.comparableAngles++;
        stats.maxAngleDifferenceRadians=Math.max(stats.maxAngleDifferenceRadians||0,error);}
      if(shift!==null){stats.maxPixelDisplacementPx=Math.max(stats.maxPixelDisplacementPx||0,shift);
        if(shift<=.5)stats.withinHalfPixel++;else stats.overHalfPixel++;
        if(shift>1)stats.overOnePixel++;}
      if(mismatch)stats.candidateVisibilityDisagreements++;
      if(['unresolved','uncertain'].includes(gpuClass)||
          ['solver_failed','indeterminate'].includes(cpuClass))stats.uncertainOrUnresolvedVisibility++;
      rows.push({mode:mode,index:i,sourceIndex:point.sourceIndex,placedObjectIndex:point.placedObjectIndex,
        layer:point.sourceLayer,authoredOpaque:point.authoredOpaque,
        edgeIndex:point.edgeIndex,edgeFraction:point.edgeFraction,
        target:point.target,physicalHeightMetres:point.heightMetres,distanceMetres:point.distanceMetres,
        gpuSeedRadians:inputs.angles[i],gpuStatus:g.status,gpuAngleRadians:g.status==='converged'?g.angleRadians:null,
        gpuResidualMetres:g.status==='converged'?g.residualMetres:null,gpuIterations:g.iterations,
        gpuCandidateVisibility:gpuClass,groundMarginMetres:g.groundMarginSurfaceMetres,
        cpuStatus:cpuClass,cpuAngleRadians:c.angle,cpuResidualMetres:c.residual,
        cpuGroundEvent:c.ground&&c.ground.event||null,
        absoluteAngleDifferenceRadians:error,pixelDisplacementPx:shift,
        gpuPixel:gpuPoint,cpuPixel:cpuPoint,candidateVisibilityMismatch:mismatch});
    });
    stats.dispatchToReadbackMs=run[mode].timing.dispatchToReadbackMs;
    modes[mode]=stats;
  });
  return {version:VERSION,kind:'real-scene GPU DS Bouguer vs CPU f64 RK4 shooting gate',
    verdict:'not_cpu_equivalent',eligibleForCpuPainter:false,
    cpuFrameParityAvailable:false,gpuDsFullFrameAvailable:false,
    explanation:'GPU DS uses a constrained radial Bouguer integral and secant iterations, not the CPU RK4 first-forward-x shooter or its certified ground-event detector. This experiment MUST NOT label its samples a CPU-equivalent GPU paint field.',
    originalScene:true,selection:inputs.selection,camera:camera,
    timings:timings,performanceLadder:[64,256,1024,4096].map(function(n){return {count:n,
      status:'not_supported_by_48_target_gpu_ds_session',durationMs:null};}),
    cpuFrame:{width:cpuFrame.width,height:cpuFrame.height,source:'real Compare A Canvas snapshot, no synthetic pixels'},
    modeSummary:modes,rows:rows,
    limitations:['48 bounded real authored object-edge targets, not all adaptive projection queries',
      'GPU double-single arithmetic is approximate, not true IEEE f64',
      'The GPU solver does not reproduce CPU RK4 equations, root bracketing, path-length endpoint refinement or event detector',
      'GPU classifications are only heuristic radial contact candidates; grazing or ambiguous contacts never count as certified visible',
      'Point overlays are NOT object silhouettes, polygon pixels, GPU DS-painted frames or GPU z-buffers',
      'Batch performance cannot be extrapolated to 64..4096 targets from a 48-target fixed kernel',
      'No modifications to production optical fields, adaptive geometry, CPU painter or WebGPU renderer']};
}
function imageFrame(w,h){var rgba=new Uint8ClampedArray(w*h*4);for(var i=0;i<rgba.length;i+=4){rgba[i]=rgba[i+1]=rgba[i+2]=255;rgba[i+3]=255;}return {width:w,height:h,rgba:rgba};}
function dotFrame(report,mode,kind){
  var w=report.camera.widthPx,h=report.camera.heightPx,frame=imageFrame(w,h),rows=report.rows.filter(function(r){return r.mode===mode;});
  rows.forEach(function(r){
    var p=kind==='cpu'?r.cpuPixel:kind==='gpu'?r.gpuPixel:r.cpuPixel,
      color=kind==='cpu'?[25,80,190]:kind==='gpu'?[225,110,30]:
        r.candidateVisibilityMismatch?[225,20,40]:
          r.pixelDisplacementPx!==null&&r.pixelDisplacementPx>.5?[255,155,0]:[50,160,70];
    if(!p||!p.inFrame)return;
    var cx=Math.round(p.xPx),cy=Math.round(p.yPx);
    for(var y=Math.max(0,cy-2);y<=Math.min(h-1,cy+2);y++)
      for(var x=Math.max(0,cx-2);x<=Math.min(w-1,cx+2);x++){
        var index=(y*w+x)*4;frame.rgba[index]=color[0];frame.rgba[index+1]=color[1];frame.rgba[index+2]=color[2];}
  });
  return frame;
}
function performanceFrame(report){
  var w=640,h=320,frame=imageFrame(w,h),values=[report.timings.gpuCompileMs,
    report.timings.gpu256Ms,report.timings.gpu512Ms,report.timings.cpuOracleMs],
    colors=[[100,100,130],[40,130,210],[220,145,35],[50,155,90]],
    max=Math.max(1,...values.filter(Number.isFinite));
  values.forEach(function(v,i){if(!Number.isFinite(v))return;
    var x=35+i*150,height=Math.min(240,Math.round(v/max*240));
    for(var py=274-height;py<274;py++)for(var px=x;px<x+100;px++){
      var offset=(py*w+px)*4;frame.rgba.set(colors[i],offset);frame.rgba[offset+3]=255;
    }
  });
  return frame;
}
function entries(report,cpuFrame,doc){
  var mode='classic_ds_512',files=[
    {name:'results.json',data:JSON.stringify(report,null,2)},
    {name:'cpu-reference.png',data:visual.png(cpuFrame,doc)},
    {name:'cpu-f64-ray-positions.png',data:visual.png(dotFrame(report,mode,'cpu'),doc)},
    {name:'gpu-ds-ray-positions-NOT-a-frame.png',data:visual.png(dotFrame(report,mode,'gpu'),doc)},
    {name:'visibility-and-pixel-disagreement-SAMPLES-ONLY.png',data:visual.png(dotFrame(report,mode,'mismatch'),doc)},
    {name:'performance-48-target-batch.png',data:visual.png(performanceFrame(report),doc)},
    {name:'README.txt',data:[
      'Curvature #140.12.40 · GPU double-single shooting feasibility gate · 48 actual authored scene targets',
      'IMPORTANT: NO CPU-equivalent GPU DS frame is produced. The original GPU DS solver is radial Bouguer quadrature, NOT CPU f64 RK4 shooting.',
      'cpu-reference.png is the actual live Compare A Canvas, unmodified.',
      'cpu-f64-ray-positions.png and gpu-ds-ray-positions-NOT-a-frame.png plot 48 launch-angle projections; white background is NOT the production frame.',
      'visibility-and-pixel-disagreement-SAMPLES-ONLY.png: red = robust candidate status mismatch; orange = >0.5 pixel displacement; green = remaining sample.',
      'performance-48-target-batch.png: bars in order compile, GPU DS 256 nodes, GPU DS 512 nodes, CPU f64 shooting. Exact timings are in results.json.',
      'The 64/256/1024/4096 batch timing ladder is not supported by the existing bounded 48-target shader; results.json explicitly marks all as NOT RUN.',
      'GPU candidate visibility is NOT CPU-certified ground contact; do NOT inject into adaptive polygon generation.',
      'This is a gate against incorrectly claiming DS pixel parity. A follow-up true GPU DS RK4 and ground-event port is required for full-frame parity.',
      ''
    ].join('\n')}
  ];return files;
}
return Object.freeze({VERSION:VERSION,COUNT:COUNT,NODES:NODES,
  requestFromScene:requestFromScene,classifyGpu:classifyGpu,makeReport:makeReport,
  dotFrame:dotFrame,performanceFrame:performanceFrame,entries:entries});
}));
