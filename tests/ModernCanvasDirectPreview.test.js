'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const direct=require('../src/renderers/CurvatureCanvasDirectPreview');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const preview=require('../src/animation/ModernAnimationPreview');
const experiment=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const state=require('../src/ui/modern/ModernSceneState');
const R=6371000;
function model(){
  const ctx=vm.createContext({JsgVect3:{
    Norm:a=>a.map(v=>v/Math.hypot(...a)),
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((v,i)=>v+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0)}});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),ctx);
  return vm.runInContext('new CurveAppClass()',ctx);
}
function graph(trackPaths=false){
  let filled=0,stroked=0,paths=0,activePath=[];
  const fillColors=[],paintedPaths=[];
  const ctx={save(){},restore(){},setTransform(){},fillRect(){},clearRect(){},
    beginPath(){paths++;if(trackPaths)activePath=[];},
    moveTo(x,y){if(trackPaths)activePath.push([x,y]);},
    lineTo(x,y){if(trackPaths)activePath.push([x,y]);},closePath(){},
    fill(){filled++;fillColors.push(this.fillStyle);
      if(trackPaths)paintedPaths.push({color:this.fillStyle,points:activePath.slice()});},
    stroke(){stroked++;}};
  const g={Canvas:{width:800,height:500,getContext(){return ctx;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:500,ScaleY:-500,OffsetX:400,OffsetY:250},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
  return {g,stats:()=>({filled,stroked,paths,fillColors,paintedPaths})};
}
function soundly(){const m=model();state.applyPreset(m,'soundly');m.Height=8.55;
  m.FocalLengthField=2038;m.Pan=.49;m.Nick=-.006;
  m.CameraEast=-36;m.CameraNorth=399;m.Update();return m;}
function draw(m,opts={}){return renderer.renderPhysical(graph().g,m,
  {atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true,...opts});}
test('geometric preview uses the same k profile as Effective Radius, but never mutates model',()=>{
  const m=soundly(),before=JSON.stringify(m),params=require('../src/optics/OpticalEffectiveRadiusPreview').parameters(m,{atmosphere:'standard'});
  const g=direct.geometricModel(m,params);
  assert.equal(g.geometryRadius,params.effectiveRadius);
  assert.ok(g.rDisk>0&&g.zDisk>0&&g.aDip>0);
  assert.equal(g.Height,m.Height);
  assert.equal(JSON.stringify(m),before);
  assert.ok(direct.geometricModel(m,{geometry:'globe',effectiveRadius:R}).rDisk>0);
});
test('Soundly lamp shafts keep their authored fill in both directions and hidden styles',()=>{
  for(const type of [8,9]){
    for(const hidden of [false,true]){
      const source=geometry.localObject(type,0,hidden,{drawn:type===8?39:88,total:128,variation:0,sidePos:0});
      const shafts=source.filter(p=>p.type==='polygon'&&p.mode===2);
      assert.equal(shafts.length,3,'legacy Soundly has three fill-only lamp pieces');
      assert.ok(shafts.every(p=>p.style&&p.style.fill===(hidden?'#bbbbbb':'#aaaaaa')),
        'mode 2 must preserve the actual background fill, not fall back to white');
      assert.ok(shafts.every(p=>p.style.stroke===undefined),
        'mode 2 lamps have no invented outline');
      const lattice=source.filter(p=>p.type==='polygon'&&p.mode===1);
      assert.ok(lattice.length>0&&lattice.every(p=>p.style.stroke==='black'),
        'mode 1 uses the authored stroke colour');
    }
  }
});
test('Canvas Direct paints Soundly fill-only lamp shafts with their authored colour',()=>{
  const g=graph(),m=soundly();
  const result=renderer.renderPhysical(g.g,m,
    {atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(result.opticalQuality,'canvas-direct');
  assert.ok(g.stats().fillColors.includes('#aaaaaa'),
    'lamp shafts must be visible against the white background');
});
test('real Soundly source renders all 128 object packages with native polygon fills and one mask',()=>{
  const m=soundly(),g=graph(),before=JSON.stringify(Array.from(m.ObjDist));
  const r=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(r.opticalQuality,'canvas-direct');
  assert.equal(r.geometryBackend,'Canvas Direct 2D');
  assert.equal(r.previewLod.original,128);assert.equal(r.previewLod.selected,128);
  assert.equal(r.directStats.horizonMasks,1);
  assert.ok(r.directStats.fillCalls>500&&r.directStats.strokeCalls>500);
  assert.equal(r.fillTriangles,0,'Canvas Direct must not pre-triangulate bridge fills');
  assert.equal(g.stats().filled,r.directStats.fillCalls);
  assert.equal(g.stats().stroked,r.directStats.strokeCalls);
  assert.ok(r.timings.totalMs>=0&&r.timings.geometryMs>=0);
  assert.equal(JSON.stringify(Array.from(m.ObjDist)),before);
});
test('moving observer and changing height reuse immutable authored geometry',()=>{
  const m=soundly(),g=graph();
  const first=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(first.cacheReused,false);
  m.Height=3.5;m.CameraEast=51.2;m.CameraNorth=496;m.Update();
  const next=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(next.cacheReused,true);
  assert.equal(next.directStats.horizonMasks,1);
  assert.equal(next.previewLod.selected,128);
});
test('distinct Animation canvases have independent cached object meshes',()=>{
  const m=soundly(),a=graph(),b=graph();
  const options={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  assert.equal(renderer.renderPhysical(a.g,m,options).cacheReused,false);
  assert.equal(renderer.renderPhysical(b.g,m,options).cacheReused,false);
  assert.equal(renderer.renderPhysical(a.g,m,options).cacheReused,true);
  assert.equal(renderer.renderPhysical(b.g,m,options).cacheReused,true);
  assert.equal(renderer.renderPhysical(a.g,m,{...options,forceColdOptics:true}).cacheReused,false);
  assert.equal(renderer.renderPhysical(b.g,m,options).cacheReused,true);
});
test('a changed source bridge geometry invalidates the cache while camera-only changes do not',()=>{
  const m=soundly(),g=graph();
  draw(m);m.ObjDist[0]+=1;m.Update();
  const changed=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(changed.cacheReused,false);
  const repeated=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(repeated.cacheReused,true);
});
test('distant support stays in far painter group and is covered by horizon mask',()=>{
  const m=soundly();m.NObjects[0]=1;m.ObjDist[0]=60000;m.Height=3;
  m.CameraEast=0;m.CameraNorth=0;m.Update();
  const r=draw(m);
  assert.equal(r.previewLod.original,1);
  assert.equal(r.directStats.horizonMasks,1);
});
test('all-near supports do not trigger a false white horizon mask',()=>{
  const m=soundly();m.NObjects[0]=1;m.ObjDist[0]=1000;m.Height=200;
  m.CameraEast=0;m.CameraNorth=0;m.Update();
  const r=draw(m);
  assert.equal(r.directStats.horizonMasks,0);
  assert.equal(r.previewLod.original,1);
  // The camera looks almost horizontally from 200 m at an object only 1 km
  // away: its geometry is outside the viewport and must not be painted.
  assert.equal(r.directStats.strokeCalls,0);
});
test('non-vacuum Globe and Flat Vacuum work; refracted Flat and unsupported profiles reject',()=>{
  const m=soundly();
  const r=draw(m,{atmosphere:'standard'});
  assert.ok(r.refractionK>0&&r.effectiveRadiusMeters>m.rEarth);
  assert.equal(r.opticalQuality,'canvas-direct');
  assert.throws(()=>draw(m,{atmosphere:'inverse-temperature'}),/supports/);
  m.showModel=2;m.Update();
  assert.equal(draw(m).opticalQuality,'canvas-direct');
  assert.throws(()=>draw(m,{atmosphere:'standard'}),/Flat/);
});
test('Animation Preview routes explicit Canvas Direct without affecting Fast / Accurate / Auto',()=>{
  const m=soundly();const snap=experiment.capture(m,{atmosphere:'vacuum',occlusionRadius:R,preset:'soundly',resetPreset:'soundly'},
    compare.preset('globe-flat-vacuum'),{mode:'scene',eyeLevel:false,horizon:false,selected:'A'});
  const previous=structuredClone(snap);let received;
  class FakeModel{Update(){}}
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical(_g,_m,o){received=o;return {previewLod:{original:128,selected:128}};}}});
  const r=view.render(snap,'A',{Canvas:{}},{quality:'canvas-direct',sceneDetail:'performance'});
  assert.equal(r.quality,'canvas-direct');assert.equal(received.opticalQuality,'canvas-direct');
  assert.equal(received.previewLod.stride,1,'never thin bridge parts');
  assert.equal(view.build(snap,'A',{quality:'accurate'}).quality,'accurate');
  assert.equal(view.build(snap,'A',{quality:'fast'}).quality,'fast');
  assert.equal(view.build(snap,'A',{quality:'auto',animationMode:'physical'}).quality,'accurate');
  assert.deepEqual(snap,previous);
});
test('browser script order and Modern-only isolation of Canvas Direct',()=>{
  const html=fs.readFileSync('CurvatureModern.html','utf8');
  const code=fs.readFileSync('src/renderers/CurvatureCanvasDirectPreview.js','utf8');
  assert.ok(html.indexOf('src/renderers/CurvatureCanvasDirectPreview.js')<
    html.indexOf('src/app/CurvatureMainCanvasRenderer.js'));
  assert.ok(html.indexOf('src/optics/OpticalEffectiveRadiusPreview.js')<
    html.indexOf('src/renderers/CurvatureCanvasDirectPreview.js'));
  assert.match(html,/value="canvas-direct"/);
  assert.doesNotMatch(code,/\bGraphX3DX\s*\(|\bDrawModel\s*\(/);
  const browser=vm.createContext({CurvatureGeometryEngine:require('../src/geometry/CurvatureGeometryEngine'),
    CurvatureOpticalEffectiveRadiusPreview:require('../src/optics/OpticalEffectiveRadiusPreview'),
    CurvatureCameraTranslation:require('../src/geometry/CurvatureCameraTranslation'),
    CurvatureCanvasProjection:require('../src/renderers/CurvatureCanvasProjection')});
  vm.runInContext(code,browser);
  assert.equal(typeof browser.CurvatureCanvasDirectPreview.create,'function');
});

test('Canvas Direct diagnostics independently toggle fills, outlines and horizon mask',()=>{
  const m=soundly();
  const all=graph(),fillOff=graph(),strokeOff=graph(),maskOff=graph();
  const opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const base=renderer.renderPhysical(all.g,m,opts);
  const noFills=renderer.renderPhysical(fillOff.g,m,{...opts,canvasDirectDiagnostics:{fills:false}});
  const noStrokes=renderer.renderPhysical(strokeOff.g,m,{...opts,canvasDirectDiagnostics:{strokes:false}});
  const noMask=renderer.renderPhysical(maskOff.g,m,{...opts,canvasDirectDiagnostics:{horizonMask:false}});
  assert.ok(base.directStats.fillCalls>0&&base.directStats.strokeCalls>0);
  assert.equal(base.directStats.horizonMasks,1);
  assert.equal(noFills.directStats.fillCalls,1,'mask remains visible with object fills disabled');
  assert.ok(noFills.directStats.strokeCalls>0);
  assert.equal(noStrokes.directStats.strokeCalls,0);
  assert.ok(noStrokes.directStats.fillCalls>0);
  assert.equal(noMask.directStats.horizonMasks,0);
  assert.equal(noMask.directStats.fillCalls,base.directStats.fillCalls-1);
  assert.equal(noMask.previewLod.original,128);
});

test('Soundly moving-camera horizon mask is clipped to the Canvas viewport',()=>{
  const m=soundly();m.Height=9.41;m.CameraEast=-22.2;m.CameraNorth=247;
  m.Pan=.47;m.Nick=-.015;m.FocalLengthField=2098;m.Update();
  const g=graph(true),opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',
    deferDecorations:true,canvasDirectDiagnostics:{strokes:false}};
  const r=renderer.renderPhysical(g.g,m,opts);
  assert.equal(r.directStats.horizonMasks,1);
  const paths=g.stats().paintedPaths;
  const masks=paths.filter(p=>p.color==='white');
  assert.equal(masks.length,1,'horizon disk is the only opaque white path');
  const w=g.g.Canvas.width,h=g.g.Canvas.height,margin=2.001;
  for(const path of paths){
    for(const [x,y] of path.points){
      assert.ok(Number.isFinite(x)&&Number.isFinite(y),'finite Canvas coordinates');
      assert.ok(x>=-margin&&x<=w+margin&&y>=-margin&&y<=h+margin,
        'no path may submit off-viewport or enormous coordinates to Canvas');
    }
  }
  const disk=masks[0].points;
  assert.ok(disk.length>=4,'clipped disk retains an opaque horizon region');
  assert.ok(Math.max(...disk.map(p=>p[0]))-Math.min(...disk.map(p=>p[0]))>w-6,
    'the disk still masks the full width below the horizon');
  const unmasked=graph(true);
  const off=renderer.renderPhysical(unmasked.g,m,{...opts,
    canvasDirectDiagnostics:{strokes:false,horizonMask:false}});
  assert.equal(off.directStats.horizonMasks,0);
  assert.equal(unmasked.stats().paintedPaths.filter(p=>p.color==='white').length,0);
});
