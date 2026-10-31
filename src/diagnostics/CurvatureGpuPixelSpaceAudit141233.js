/* #140.12.33: Pixel-space ray-sample accuracy for independent GPU DS shooting.
 * Project the SAME 48 CPU f64 and GPU DS launch directions through Compare A's
 * actual observer-fixed PhysicalCamera and canvas backing-store dimensions.
 * This is a point-sample / central-meridian audit, NOT a GPU frame renderer,
 * rasterized horizon, silhouette or full-frame pixel difference.
 * Diagnostic only; nothing here changes production shooting or painting.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('../app/CurvaturePhysicalCamera'):root.CurvaturePhysicalCamera,
    typeof module==='object'&&module.exports?
    require('../renderers/CurvatureCanvasProjection'):root.CurvatureCanvasProjection);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuPixelSpaceAudit141233=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(physicalCamera,canvasProjection){
  'use strict';
  if(!physicalCamera||!canvasProjection)throw Error('PhysicalCamera and CanvasProjection required for pixel-space audit');
  var VERSION='140.12.33',MODES=['classic_ds_256','classic_ds_512'],PIXEL_BUDGET=.5;
  var RAD=Math.PI/180;
  function capture(model,graph){
    var canvas=graph&&graph.Canvas;
    if(!model||!canvas||!Number.isInteger(canvas.width)||!Number.isInteger(canvas.height)||
       canvas.width<1||canvas.height<1||!graph.Camera)
      throw RangeError('Actual Compare A camera and canvas backing dimensions required');
    var view=physicalCamera.create(model),camera=graph.Camera,
      origin=camera.CamPos,center=camera.CamViewCenter,up=camera.CamUp;
    if(!Array.isArray(origin)||!Array.isArray(center)||!Array.isArray(up)||
       ![origin,center,up].every(function(v){return v.length===3&&v.every(Number.isFinite);})||
       !(Number.isFinite(camera.ScreenSize)&&camera.ScreenSize>0&&
         Number.isFinite(camera.SceneSize)&&camera.SceneSize>0&&
         Number.isFinite(camera.Zoom)&&camera.Zoom>0&&
         Number.isFinite(camera.ObjectZExtend)))
      throw RangeError('Compare A graph has no valid physical camera snapshot');
    // The live graph MUST still be configured to this physical camera.
    // Otherwise a stale comparison would silently use the wrong image plane.
    if(Math.abs(camera.SceneSize-view.sceneSize)>1e-8 ||
       ![origin,center,up].every(function(v,i){
         var expected=[view.pos,view.center,view.up][i];
         return v.every(function(value,j){return Math.abs(value-expected[j])<=1e-8;});
       }))throw RangeError('Compare A graph camera is stale; redraw before audit');
    var plane=canvasProjection.capture(graph,canvas.width,canvas.height),
      distance=Math.hypot(center[0]-origin[0],center[1]-origin[1],center[2]-origin[2]),
      focal=camera.ScreenSize/camera.SceneSize*(distance-camera.ObjectZExtend)*camera.Zoom;
    if(!(focal>0&&Number.isFinite(focal)))throw RangeError('Invalid actual image-plane focal distance');
    var ratio=Number(model.deviceRatio),diagonal=Number(model.camViewAngle);
    return Object.freeze({widthPx:canvas.width,heightPx:canvas.height,
      modelAspectRatio:ratio,backingAspectRatio:canvas.width/canvas.height,
      diagonalFovRadians:diagonal,panDegrees:Number(model.Pan),
      nickDegrees:Number(model.Nick),rollDegrees:Number(model.Roll),
      aimDipRadians:view.aimDip,cameraElevationRadians:Number(model.Nick)*RAD-view.aimDip,
      observerHeightMetres:Number(model.Height),radiusMetres:Number(model.rEarth),
      viewcenterHorizon:model.viewcenterHorizon,
      verticalFovRadians:2*Math.atan(Math.tan(diagonal/2)/Math.sqrt(1+ratio*ratio)),
      imagePlaneFocal:focal,pixelScaleX:plane.scaleX,pixelScaleY:plane.scaleY,
      pixelOffsetX:plane.offsetX,pixelOffsetY:plane.offsetY,
      pixelBudgetPx:PIXEL_BUDGET});
  }
  function sameCamera(a,b){
    return !!a&&!!b&&Object.keys(a).every(function(key){return Object.is(a[key],b[key]);})&&
      Object.keys(a).length===Object.keys(b).length;
  }
  // The target rays occupy the camera's vertical meridian (same pan azimuth).
  // The camera roll rotates that meridian in the REAL physical image plane.
  // Both axes are in backing-store pixels (not CSS/display pixels).
  function project(snapshot,angle){
    if(!Number.isFinite(angle))return null;
    var relative=angle-snapshot.cameraElevationRadians;
    if(Math.abs(relative)>=Math.PI/2)return null;
    // Right-axis orientation is derived from the SAME rolled camera basis
    // used by the independent physical painter (not an FOV-only approximation).
    var offset=snapshot.imagePlaneFocal*Math.tan(relative),roll=snapshot.rollDegrees*RAD,
      x=snapshot.pixelOffsetX-offset*Math.sin(roll)*snapshot.pixelScaleX,
      y=snapshot.pixelOffsetY+offset*Math.cos(roll)*snapshot.pixelScaleY;
    if(!Number.isFinite(x)||!Number.isFinite(y))return null;
    return {xPx:x,yPx:y,inFrame:x>=0&&x<snapshot.widthPx&&y>=0&&y<snapshot.heightPx,
      pixelColumn:x>=0&&x<snapshot.widthPx?Math.floor(x):null,
      pixelRow:y>=0&&y<snapshot.heightPx?Math.floor(y):null};
  }
  function gpuVisibility(t){
    if(!t||t.status!=='converged')return 'unresolved';
    if(t.contactClassification==='within_1cm_uncertain')return 'uncertain';
    if(t.groundPhase==='no_ground')return 'clear';
    if(t.groundPhase==='ground_reachable'&&Number.isFinite(t.groundMarginSurfaceMetres)){
      if(t.groundMarginSurfaceMetres>.01)return 'blocked';
      if(t.groundMarginSurfaceMetres<-.01)return 'clear';
      return 'uncertain';
    }
    return 'unresolved';
  }
  function cpuVisibility(status){
    return status==='visible'?'clear':status==='blocked'?'blocked':'unresolved';
  }
  function quantile(values,fraction){
    if(!values.length)return null;
    var sorted=values.slice().sort(function(a,b){return a-b;});
    var rank=(sorted.length-1)*fraction,lo=Math.floor(rank),hi=Math.ceil(rank);
    return sorted[lo]+(sorted[hi]-sorted[lo])*(rank-lo);
  }
  function analyze(shooting,snapshot){
    if(!shooting||shooting.version!=='140.12.32'||shooting.targets!==48||
       !Array.isArray(shooting.perCase)||shooting.perCase.length!==96||!snapshot||
       shooting.modes.length!==2||!MODES.every(function(mode){return shooting.modes.includes(mode);}))
      throw RangeError('Complete independent #140.12.32 GPU/CPU shooting report required');
    var modes={},records=[];
    MODES.forEach(function(mode){
      var samples=shooting.perCase.filter(function(r){return r.mode===mode;});
      var seen=new Set(),shifts=[],bouguerShifts=[],rowsCpu=new Set(),rowsGpu=new Set();
      var counts={targets:48,inFrameBoth:0,outOfFrameBoth:0,edgeOfFrameMismatch:0,
        projectionUnavailable:0,subHalfPixel:0,overHalfPixel:0,overOnePixel:0,
        changedPixelCell:0,visibilityAgree:0,visibilityMismatch:0,
        visibilityUncertain:0,visibilityUnresolved:0,visibleSamplesCompared:0};
      if(samples.length!==48)throw RangeError('Incomplete pixel audit mode '+mode);
      samples.forEach(function(r){
        if(!Number.isInteger(r.targetIndex)||r.targetIndex<0||r.targetIndex>=48||seen.has(r.targetIndex)||
           !r.gpuShooting||r.gpuShooting.status!=='converged'||
           !r.cpuF64BouguerRoot||!r.cpuF64BouguerRoot.converged||
           !Number.isFinite(r.cpuF64Rk4ShootingAngleRadians))
          throw RangeError('Invalid/unresolved GPU or CPU angle at '+mode+' target '+r.targetIndex);
        seen.add(r.targetIndex);
        var cpu=project(snapshot,r.cpuF64Rk4ShootingAngleRadians),
          bouguer=project(snapshot,r.cpuF64BouguerRoot.angleRadians),
          gpu=project(snapshot,r.gpuShooting.angleRadians);
        var inBoth=!!cpu&&!!gpu&&cpu.inFrame&&gpu.inFrame,
          separation=cpu&&gpu?Math.hypot(cpu.xPx-gpu.xPx,cpu.yPx-gpu.yPx):null,
          bouguerGap=bouguer&&gpu?Math.hypot(bouguer.xPx-gpu.xPx,bouguer.yPx-gpu.yPx):null;
        if(!cpu||!gpu)counts.projectionUnavailable++;
        else if(cpu.inFrame!==gpu.inFrame)counts.edgeOfFrameMismatch++;
        else if(!cpu.inFrame)counts.outOfFrameBoth++;
        if(inBoth){
          counts.inFrameBoth++;shifts.push(separation);
          if(bouguer&&bouguer.inFrame)bouguerShifts.push(bouguerGap);
          if(separation<=PIXEL_BUDGET)counts.subHalfPixel++;
          else counts.overHalfPixel++;
          if(separation>1)counts.overOnePixel++;
          if(cpu.pixelRow!==gpu.pixelRow||cpu.pixelColumn!==gpu.pixelColumn)counts.changedPixelCell++;
          rowsCpu.add(cpu.pixelRow);rowsGpu.add(gpu.pixelRow);
        }
        var gStatus=gpuVisibility(r.gpuShooting),cStatus=cpuVisibility(r.cpuF64Rk4ShootingStatus);
        if(inBoth){
          if(gStatus==='uncertain')counts.visibilityUncertain++;
          else if(gStatus==='unresolved'||cStatus==='unresolved')counts.visibilityUnresolved++;
          else {counts.visibleSamplesCompared++;
            if(gStatus===cStatus)counts.visibilityAgree++;else counts.visibilityMismatch++;}
        }
        records.push({mode:mode,targetIndex:r.targetIndex,
          distanceMetres:r.distanceMetres,heightMetres:r.heightMetres,
          cpuF64BouguerAngleRadians:r.cpuF64BouguerRoot.angleRadians,
          gpuDsAngleRadians:r.gpuShooting.angleRadians,
          cpuF64Rk4AngleRadians:r.cpuF64Rk4ShootingAngleRadians,
          cpuRk4Projected:cpu,cpuBouguer2048Projected:bouguer,gpuProjected:gpu,inFrameBoth:inBoth,
          pixelDisplacementFromCpuRk4Px:separation,
          pixelDisplacementFromCpuBouguer2048Px:bouguerGap,
          pixelCellChanged:inBoth&&(cpu.pixelColumn!==gpu.pixelColumn||cpu.pixelRow!==gpu.pixelRow),
          cpuRk4Visibility:cStatus,gpuDsVisibility:gStatus,
          groundMarginMetres:r.gpuShooting.groundMarginSurfaceMetres});
      });
      var occupiedDiff=0;
      rowsCpu.forEach(function(row){if(!rowsGpu.has(row))occupiedDiff++;});
      rowsGpu.forEach(function(row){if(!rowsCpu.has(row))occupiedDiff++;});
      modes[mode]={counts:counts,
        maxPixelDisplacementPx:shifts.length?Math.max.apply(null,shifts):null,
        meanPixelDisplacementPx:shifts.length?shifts.reduce(function(a,b){return a+b;},0)/shifts.length:null,
        rmsPixelDisplacementPx:shifts.length?Math.sqrt(shifts.reduce(function(a,b){return a+b*b;},0)/shifts.length):null,
        p95PixelDisplacementPx:quantile(shifts,.95),
        maxPixelDisplacementFromCpuBouguer2048Px:bouguerShifts.length?Math.max.apply(null,bouguerShifts):null,
        sampledVerticalRowOccupancySymmetricDifference:occupiedDiff,
        distinctCpuSampleRows:rowsCpu.size,distinctGpuSampleRows:rowsGpu.size,
        stageGpuDispatchToReadbackMs:shooting.summary[mode].timing.dispatchToReadbackMs};
    });
    return {version:VERSION,kind:'actual-camera pixel-space projected GPU DS ray-sample audit',
      sourceShootingVersion:shooting.version,geometry:shooting.geometry,targets:48,
      modes:MODES.slice(),camera:snapshot,summary:modes,perSample:records,
      pixelMeaning:'backing-store pixel center of ray launch direction relative to independent CPU f64 RK4 shooting, projected through the actual Compare A PhysicalCamera + captured GraphX3DX window transform (pitch, aim, pan meridian, roll and device scale); separate CPU f64 2048-node Bouguer comparison',
      classificationMeaning:'GPU same-angle contact vs independent CPU RK4 status; 1 cm contact boundary excluded from robust comparison',
      limitations:[
        'Only 48 isolated vertical-meridian target rays; targets are not a raster grid or rendered object boundaries',
        'Real Compare A physical camera and backing resolution, but NO GPU DS-painted frame and NO actual CPU/GPU image pixel diff',
        'Quantized pixel-cell and occupied-row differences concern ONLY the sampled launch directions, never the total number of incorrect rendered pixels',
        'In-frame status mismatch is sampled visibility evidence, not a full occlusion or silhouette test',
        'A half-pixel angle shift does not prove that horizon, terrain coverage or visual color is correct',
        'Out-of-frame rays are excluded from shift statistics; edge-of-frame differences reported separately',
        'First-forward monotone radial branch; no turning rays or mathematically certified visibility'],
      actualRenderedImageCompared:false,fullFramePixelParityEstablished:false,
      shootingChanged:false,framePaintingChanged:false,productionAuthorized:false};
  }
  return Object.freeze({VERSION:VERSION,MODES:MODES,PIXEL_BUDGET:PIXEL_BUDGET,
    capture:capture,sameCamera:sameCamera,project:project,
    gpuVisibility:gpuVisibility,cpuVisibility:cpuVisibility,analyze:analyze});
}));
