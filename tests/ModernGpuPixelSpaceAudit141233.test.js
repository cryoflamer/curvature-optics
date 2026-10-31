'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const pixel=require('../src/diagnostics/CurvatureGpuPixelSpaceAudit141233');
const camera=require('../src/app/CurvaturePhysicalCamera');
const projection=require('../src/renderers/CurvatureCanvasProjection');
const perspective=require('../src/renderers/CurvaturePerspectivePreview');
function model(){return {camViewAngle:Math.PI/3,deviceRatio:1.5,Pan:10,Nick:0,Roll:0,
  Height:15,rEarth:6371000,rFEarth:6371000,viewcenterHorizon:3,showModel:1};}
function graph(m,width=900,height=600){
  const c=camera.create(m);
  return {Canvas:{width,height},Camera:{CamPos:c.pos,CamViewCenter:c.center,
      CamUp:c.up,SceneSize:c.sceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1},
    WinTrans:{ScaleX:width,ScaleY:-height,OffsetX:width/2,OffsetY:height/2},
    ContextScale:1,GetPixScaling:()=>1,AutoScalePix:false,MinLineWidth:1,
    ScalePixInt:false,DevicePixelRatio:1};
}
function stubReport(gpuOffset=1e-7){
  const perCase=[],summary={};
  for(const mode of pixel.MODES){
    summary[mode]={timing:{dispatchToReadbackMs:mode==='classic_ds_256'?71:131}};
    for(let i=0;i<48;i++){
      const angle=-0.12+i*0.005;
      perCase.push({mode,targetIndex:i,distanceMetres:60,heightMetres:1,
        gpuShooting:{status:'converged',angleRadians:angle+gpuOffset,
          groundPhase:'ground_reachable',groundMarginSurfaceMetres:-0.02,contactClassification:'after_target'},
        cpuF64BouguerRoot:{converged:true,angleRadians:angle},
        cpuF64Rk4ShootingAngleRadians:angle,cpuF64Rk4ShootingStatus:'visible'});
    }
  }
  return {version:'140.12.32',targets:48,geometry:'globe',modes:pixel.MODES.slice(),summary,perCase};
}
test('140.12.33: actual PhysicalCamera lens, compare canvas backing size, center and roll projection',()=>{
  const m=model(),v=pixel.capture(m,graph(m)),physical=camera.create(m);
  assert.equal(v.aimDipRadians,physical.aimDip);
  assert.equal(v.backingAspectRatio,1.5);
  assert.equal(v.verticalFovRadians,2*Math.atan(Math.tan(m.camViewAngle/2)/Math.sqrt(1+1.5**2)));
  const origin=pixel.project(v,0);
  assert.equal(origin.xPx,450);assert.equal(origin.yPx,300);assert.equal(origin.inFrame,true);
  const top=pixel.project(v,0.1);
  assert.equal(top.xPx,450);assert.ok(top.yPx<300);
  m.Roll=90;const rolled=pixel.project(pixel.capture(m,graph(m)),0.1);
  assert.ok(rolled.xPx<450);assert.ok(Math.abs(rolled.yPx-300)<1e-10);
  m.Nick=5;const aim=pixel.capture(m,graph(m));
  assert.ok(pixel.project(aim,5*Math.PI/180).yPx-300<1e-10);
  m.viewcenterHorizon=0;const dipped=pixel.capture(m,graph(m));
  assert.equal(dipped.cameraElevationRadians,m.Nick*Math.PI/180-camera.create(m).aimDip);
  assert.ok(Math.abs(pixel.project(dipped,dipped.cameraElevationRadians).yPx-300)<1e-10);
  assert.throws(()=>pixel.capture(m,graph(m,0,600)),/camera and canvas backing/);
});
test('140.12.33: projected pixels agree with the independent physical painter at pan, tilt and roll',()=>{
  for(const roll of [0,33,-80]){
    const m=model();m.Pan=13;m.Nick=5;m.Roll=roll;
    const g=graph(m),view=pixel.capture(m,g),angle=.09,pan=m.Pan*Math.PI/180;
    // Build an actual world-space ray along the original shooting azimuth.
    const at=[1000*Math.sin(pan)*Math.cos(angle),1000*Math.cos(pan)*Math.cos(angle),1000*Math.sin(angle)];
    const cam={pos:g.Camera.CamPos,center:g.Camera.CamViewCenter,up:g.Camera.CamUp,
      sceneSize:g.Camera.SceneSize,screenSize:g.Camera.ScreenSize,objectZExtend:0,zoom:1,
      pixelTransform:projection.capture(g,g.Canvas.width,g.Canvas.height)};
    const rendered=perspective.project({primitives:[{type:'line',points:[at,at.map(x=>x*1.1)]}]},
      cam,g.Canvas.width,g.Canvas.height);
    assert.equal(rendered.segments.length,1);
    const exact=rendered.segments[0].points[0],sample=pixel.project(view,angle);
    assert.ok(Math.abs(sample.xPx-exact[0])<1e-9,'x matches physical painter');
    assert.ok(Math.abs(sample.yPx-exact[1])<1e-9,'y matches physical painter');
  }
});
test('140.12.33: pixel budget, actual discrete cells and robust visibility are counted independently',()=>{
  const sample=stubReport(1e-7),view=pixel.capture(model(),graph(model()));
  const result=pixel.analyze(sample,view);
  assert.equal(result.actualRenderedImageCompared,false);
  assert.equal(result.fullFramePixelParityEstablished,false);
  assert.equal(result.productionAuthorized,false);
  for(const mode of pixel.MODES){
    const v=result.summary[mode];
    assert.equal(v.counts.targets,48);assert.equal(v.counts.inFrameBoth,48);
    assert.equal(v.counts.subHalfPixel,48);assert.equal(v.counts.overHalfPixel,0);
    assert.equal(v.counts.visibilityAgree,48);assert.equal(v.counts.visibilityMismatch,0);
    assert.ok(v.maxPixelDisplacementPx>0&&v.maxPixelDisplacementPx<.5);
    assert.equal(v.counts.visibleSamplesCompared,48);
  }
  const stronger=pixel.analyze(stubReport(.002),view);
  assert.ok(stronger.summary.classic_ds_256.counts.overHalfPixel>0);
  assert.ok(stronger.summary.classic_ds_256.counts.changedPixelCell>0);
  const changed=stubReport(0);
  changed.perCase[0].gpuShooting.groundMarginSurfaceMetres=.5;
  changed.perCase[0].gpuShooting.contactClassification='before_target';
  changed.perCase[1].gpuShooting.groundMarginSurfaceMetres=.0001;
  changed.perCase[1].gpuShooting.contactClassification='within_1cm_uncertain';
  const classified=pixel.analyze(changed,view).summary.classic_ds_256.counts;
  assert.equal(classified.visibilityMismatch,1);
  assert.equal(classified.visibilityUncertain,1);
  assert.equal(classified.visibleSamplesCompared,47);
});
test('140.12.33: camera changes, outside view and invalid measurements cannot masquerade as pixel parity',()=>{
  const m=model(),v=pixel.capture(m,graph(m));
  const stale=graph(m);stale.Camera.CamViewCenter[2]+=.01;
  assert.throws(()=>pixel.capture(m,stale),/graph camera is stale/);
  assert.ok(pixel.sameCamera(v,pixel.capture(m,graph(m))));
  assert.equal(pixel.sameCamera(v,pixel.capture(m,graph(m,901,600))),false);
  m.Nick=1;assert.equal(pixel.sameCamera(v,pixel.capture(m,graph(m))),false);
  const out=stubReport(0);out.perCase[2].cpuF64Rk4ShootingAngleRadians=.8;
  const result=pixel.analyze(out,v);
  assert.equal(result.summary.classic_ds_256.counts.edgeOfFrameMismatch,1);
  assert.ok(result.perSample.find(x=>x.mode==='classic_ds_256'&&x.targetIndex===2).cpuRk4Projected.inFrame===false);
  const bad=stubReport();bad.perCase[0].gpuShooting.status='unresolved';
  assert.throws(()=>pixel.analyze(bad,v),/Invalid\/unresolved/);
  const missing=stubReport();missing.perCase.pop();
  assert.throws(()=>pixel.analyze(missing,v),/Complete independent/);
});
test('140.12.33: UI wires one GPU-owned DS run, actual camera, versioned JSON and explicit non-frame caveat',()=>{
  const app=fs.readFileSync(path.resolve(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const html=fs.readFileSync(path.resolve(__dirname,'../CurvatureModern.html'),'utf8');
  assert.match(app,/runGpuHighPrecisionShooting141232\(\{pixelSpace:true\}\)/);
  assert.match(app,/pixelAudit\.capture\(model,state\.compareGraphs\.A\)/);
  assert.match(app,/pixelAudit\.sameCamera\(pixelCamera,current\)/);
  assert.match(app,/pixelAudit\.analyze\(report,pixelCamera\)/);
  assert.match(app,/curvature-compare-140\.12\.33-pixel-space-audit\.json/);
  assert.match(app,/numericAuditFailed\(pixelMode\?'140\.12\.33'/);
  assert.match(html,/CurvatureGpuPixelSpaceAudit141233\.js\?v=140\.12\.33/);
  assert.match(html,/ModernGpuPixelSpaceAuditRun/);
  assert.match(html,/not rendered CPU\/GPU images or a full-frame pixel diff/);
});
