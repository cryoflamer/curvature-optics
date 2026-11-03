'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const main=require('../src/app/CurvatureMainCanvasRenderer');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const tower=require('../src/optics/OpticalTowerSilhouette');
const fills=require('../src/optics/CurvaturePhysicalPolygonFills');
const geometry=require('../src/diagnostics/CurvatureGeometryDifferenceAttribution141237');
const R=6371000;
function model(){return {
  rEarth:R,geometryRadius:R,Height:15,showModel:2,ObjType:[3,3],NObjects:[1,1],
  ObjDist:[50,25000],ObjDeltaDist:[300,373],ObjSidePos:[32,22],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],ObjSizeType:[0,0],
  rDisk:1000,zDisk:999,hDip:1,hDisk:R/2,aDip:.065,aDelta:.025,
  showGrid:0,rFEarth:10007543,PanRad:0,sceneWidth:5000,
  GlobeGridCol:'green',GlobeFGridCol:'yellow',TangentCol:'red',FEGridCol:'gray',FEEqCol:'blue',
  showTangent:true,showData:false,camPos:[0,0,0],camViewCenter:[0,1,0],
  camUp:[0,0,1],camSceneSize:1,camViewAngle:Math.PI/180,deviceRatio:1.5,
  Pan:0,Nick:0,Roll:0,viewcenterHorizon:3
};}
function graph(){
  const ctx={save(){},restore(){},setTransform(){},clearRect(){},beginPath(){},
    moveTo(){},lineTo(){},stroke(){},closePath(){},fill(){},setLineDash(){},
    measureText(){return {width:0};},fillText(){}};
  return {Canvas:{width:320,height:240,getContext(){return ctx;}},Camera:{},
    WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:160,OffsetY:120},
    ContextScale:1,AutoScalePix:true,MinLineWidth:1,ScalePixInt:false,
    DevicePixelRatio:1,GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(n){this.CameraClipPlaneDist=n;},SetWindowToCameraScreen(){},
    SetCamera(c){this.Camera={...c,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(n){this.Camera.Zoom=n;}};
}
test('140.12.37.2: real physical Canvas painter feeds geometry collector camera AND scene',()=>{
  const m=model(),g=graph(),session=optics.create();
  for(const variant of ['cpu','baseline']){
    const collector=geometry.collector('actual-camera',variant);
    const rendered=main.renderPhysical(g,m,{atmosphere:'vacuum',cacheSession:session,
      interactive:false,geometryAudit:collector});
    assert.equal(rendered.mode,'physical-scene');
    const captured=collector.result();
    assert.equal(captured.width,320);
    assert.equal(captured.height,240);
    assert.equal(captured.variant,variant);
    assert.ok(captured.camera&&Array.isArray(captured.camera.pos));
    assert.ok(captured.objects.length>0,'real physical primitives were captured');
  }
});
test('140.12.37.2: absent data yields actionable capture diagnostics',()=>{
  const collector=geometry.collector('tilt-up','baseline');
  assert.throws(()=>collector.result(),/scene=false, camera=false, size=0x0/);
  collector.onCamera({pos:[0,0,0]},320,240);
  assert.throws(()=>collector.result(),/scene=false, camera=true, size=320x240/);
});
