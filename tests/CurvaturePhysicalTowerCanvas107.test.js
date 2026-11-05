'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const physical=require('../src/renderers/CurvaturePhysicalTowerCanvas');
const perspective=require('../src/renderers/CurvaturePerspectivePreview');
const main=require('../src/app/CurvatureMainCanvasRenderer');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const R=6371000;
const base={rEarth:R,geometryRadius:R,Height:15,showModel:2,ObjType:[3,3],NObjects:[1,1],
  ObjDist:[3000,5000],ObjDeltaDist:[200,200],ObjSidePos:[0,10],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[35,35],ObjSizeVar:[0,0],ObjSizeType:[0,0]};
const camera={pos:[0,0,0],center:[0,1,0],up:[0,0,1],sceneSize:1,screenSize:1,
  objectZExtend:0,zoom:1,near:1e-6};
function angle(v){return [Math.atan2(v[0],v[1]),Math.atan2(v[2],Math.hypot(v[0],v[1]))];}
function outline(a,b,status='visible'){
  return {segments:[{points:[a,b],visibility:status,source:{primitiveIndex:0}}],unresolved:[],stats:{}};
}
function drawing(){
  const events=[];
  const ctx={fillRect(){events.push('background')},beginPath(){events.push('begin')},
    moveTo(x,y){events.push(['move',x,y])},lineTo(x,y){events.push(['line',x,y])},
    stroke(){events.push('stroke')}};
  return {canvas:{width:400,height:300,getContext(){return ctx}},events};
}
test('107: physical arrival-angle pixels equal independent vacuum perspective at observer origin',()=>{
  for(const c of [camera,{...camera,center:[0.3,1,0.15],up:[0.04,0.1,1]}]){
    const a=[-0.1,1,0.01],b=[0.15,1,0.04];
    const pixels=physical.pixelSegments(outline(angle(a),angle(b)),c,400,300).segments;
    const scene={primitives:[{type:'line',points:[a,b],mode:1}]};
    const direct=perspective.project(scene,c,400,300).segments;
    assert.equal(pixels.length,1);assert.equal(direct.length,1);
    for(let i=0;i<2;i++)for(let j=0;j<2;j++)
      assert.ok(Math.abs(pixels[0].points[i][j]-direct[0].points[i][j])<1e-8,
        `camera ${JSON.stringify(c.center)} endpoint ${i}, dimension ${j}`);
  }
});
test('107: physical projection follows camera pan and optical elevation, not a flat azimuth-as-pixels shortcut',()=>{
  const a=[0.02,-0.01],b=[0.03,0.015];
  const straight=physical.pixelSegments(outline(a,b),camera,400,300).segments[0].points;
  const turned=physical.pixelSegments(outline(a,b),{...camera,center:[0.05,1,0]},400,300).segments[0].points;
  assert.notDeepEqual(straight,turned);
  assert.ok(straight[1][1]<straight[0][1]);
});
test('107: near/viewport clipping prevents drawing behind camera or outside pixel frame',()=>{
  const c={...camera};
  assert.equal(physical.pixelSegments(outline([0,Math.PI/4],[0,Math.PI/3]),
    {...c,center:[0,-1,0]},400,300).segments.length,0);
  const clipped=physical.pixelSegments(outline([-Math.PI/3,0],[Math.PI/3,0]),c,400,300);
  assert.ok(clipped.segments.length===1);
  assert.ok(clipped.segments[0].points.every(p=>p[0]>=0&&p[0]<=400&&p[1]>=0&&p[1]<=300));
});
test('107: Canvas draws only visible outlines on a blank physical background',()=>{
  const {canvas,events}=drawing();
  const data=physical.paint(canvas,camera,outline([0,-0.01],[0,0.02]));
  assert.equal(data.statistics.drawn,1);
  assert.equal(events.filter(x=>x==='stroke').length,1);
  assert.equal(events[0],'background');
  assert.throws(()=>physical.paint(canvas,camera,outline([0,0],[0,0.01],'blocked')),/Non-visible/);
});
test('107: unsupported object types and Both do not silently disappear in physical preview',()=>{
  assert.equal(physical.availability({...base,showModel:3}).supported,false);
  assert.equal(physical.availability({...base,ObjType:[3,1]}).supported,false);
  assert.equal(physical.availability({...base,ObjType:[3,1],NObjects:[1,0]}).supported,true);
  assert.equal(main.supportPhysical({...base,showModel:1}).supported,true);
  assert.throws(()=>physical.cameraBasis({...camera,pos:[0,-10,0]}),/observer origin/);
});
test('107: physical field is reused after camera-only changes and invalidated after geometry or R changes',()=>{
  const painter=physical.create();
  const empty={...base,NObjects:[0,0]};
  const first=painter.outlines(empty,{atmosphere:'vacuum'});
  const second=painter.outlines(empty,{atmosphere:'vacuum'});
  assert.equal(first.reused,false);assert.equal(second.reused,true);
  assert.strictEqual(first.data,second.data);
  assert.equal(painter.outlines({...empty,Height:16},{atmosphere:'vacuum'}).reused,false);
  assert.equal(painter.outlines(empty,{atmosphere:'inverse-spherical',occlusionRadius:R}).reused,false);
  assert.equal(painter.outlines(empty,{atmosphere:'inverse-spherical',occlusionRadius:R/2}).reused,false);
  assert.throws(()=>painter.outlines(empty,{atmosphere:'inverse-spherical',occlusionRadius:0}),/radius/);
});
test('107: actual geometry for two tower banks is consumed without legacy radius deformation',()=>{
  const painter=physical.create();
  const model={...base,geometryRadius:R/2}; // legacy-k effective geometry must not leak
  const reference=geometry.towerSequence({...base,geometryRadius:R},0,false);
  assert.ok(reference.length>0);
  const result=painter.outlines(model,{atmosphere:'vacuum',settings:{
    maxSamples:180,maximumDepth:2,step:5000,fieldTolerance:2e-5}});
  assert.equal(result.data.towers,2);
  assert.equal(result.data.primitives,geometry.localTowerType1().length+geometry.localTowerType2().length);
  assert.ok(result.data.stats.evaluations<=180);
  assert.ok(result.data.segments.length>0);
  assert.equal(result.data.fieldStats!==null,true);
});
test('107: entrypoint loads optical modules before main Canvas adapter; physical preview is opt-in',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../CurvatureApp.html'),'utf8');
  for(const module of ['OpticalTargetProjection','OpticalSharedRayField','OpticalTowerSilhouette','CurvaturePhysicalTowerCanvas']){
    assert.ok(html.includes('src/'+(module.startsWith('Curvature')?'renderers/':'optics/')+module+'.js'));
    assert.ok(html.indexOf(module+'.js')<html.indexOf('CurvatureMainCanvasRenderer.js'));
  }
  assert.match(html,/<option value="legacy" selected>Legacy/);
  assert.match(html,/<option value="physical">Physical optics/);
  assert.match(html,/PhysicalCanvasOcclusionRadius/);
});
test('107: runtime dispatches physical mode and preserves Legacy fallback and audit protections',()=>{
  const calls=[],controls=new Map();let opts;
  function el(id){if(!controls.has(id))controls.set(id,{value:id==='MainCanvasRenderer'?'legacy':
    id==='PhysicalCanvasAtmosphere'?'inverse-spherical':id==='PhysicalCanvasOcclusionRadius'?'4000000':'original',
    textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return controls.get(id);}
  const context=vm.createContext({window:{CurvatureMainCanvasRenderer:{
    supportPhysical(m){return {supported:m.showModel===2,reason:'Globe unavailable in test'};},
    support(){return {supported:true};},renderPhysical(_g,_m,o){calls.push('physical:'+o.atmosphere+':'+o.occlusionRadius);
      return {drawn:3,unresolved:0,buildMs:12,cacheReused:false,warning:'outline only'};},
    render(){calls.push('independent');return {warning:'painter'};}}},
    document:{getElementById:el},CurveAppClass:function(){this.showModel=2;},
    xDefBool(v,f){return v===undefined?f:v;},xOnLoad(){},
    NewGraphX3D(o){opts=o;return {Redraw(){calls.push('redraw')}};},
    DrawModelWithOptionalAudit(){calls.push('legacy')},Demos:{Reset(){},PlayStop(){}},
    ControlPanels:{Update(){}},ShowMoreInfos(){},console:{error(){calls.push('error')}},
    legacyFrameAuditRequested:false,legacyFrameAuditInProgress:false});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/app/LegacyAppContext.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/app/CurvatureAppRuntime.js'),'utf8'),context);
  const g={Reset(){calls.push('reset')}};
  opts.DrawFunc(g);assert.deepEqual(calls,['legacy']);calls.length=0;
  el('MainCanvasRenderer').value='physical';opts.DrawFunc(g);
  assert.deepEqual(calls,['physical:inverse-spherical:4000000']);calls.length=0;
  assert.match(el('MainCanvasRendererStatus').textContent,/3 lines/);
  context.legacyFrameAuditRequested=true;opts.DrawFunc(g);assert.deepEqual(calls,['legacy']);calls.length=0;
  context.legacyFrameAuditRequested=false;context.CurveApp.showModel=1;opts.DrawFunc(g);
  assert.deepEqual(calls,['legacy']);calls.length=0;
  context.CurveApp.showModel=2;
  el('PhysicalCanvasOcclusionRadius').listeners.change();assert.deepEqual(calls,['redraw']);
});

test('108: physical main Canvas shares painter and restores the scaled GraphX context',()=>{
  const events=[];
  const ctx={save(){events.push('save');},restore(){events.push('restore');},
    setTransform(...a){events.push(['transform',...a]);},fillRect(){events.push('background');},clearRect(){events.push('clear');},
    beginPath(){events.push('begin');},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){events.push('stroke');}};
  const g={Canvas:{width:400,height:300,getContext(){return ctx;}},Camera:{},
    WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:200,OffsetY:150},ContextScale:1,
    AutoScalePix:true,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},SetCameraClipping(v){this.CameraClipPlaneDist=v;},
    SetWindowToCameraScreen(){},SetCamera(c){this.Camera={...c,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
  const m={...base,NObjects:[0,0],rFEarth:10007543,showGrid:0,camPos:[0,0,0],camViewCenter:[0,1,0],
    camUp:[0,0,1],camSceneSize:1,camViewAngle:1*Math.PI/180,
    deviceRatio:1.5,Pan:0,Nick:0,Roll:0,viewcenterHorizon:3};
  const r=main.renderPhysical(g,m,{atmosphere:'vacuum'});
  assert.equal(r.mode,'physical-scene');
  assert.equal(r.drawn,0);assert.equal(r.unresolved,0);
  assert.ok(events.includes('save'));
  assert.ok(events.includes('restore'));
  assert.deepEqual(events.filter(x=>Array.isArray(x)&&x[0]==='transform')[0],
    ['transform',1,0,0,1,0,0]);
});
test('107: exhausted physical preview budget omits unknown fragments, never paints them',()=>{
  const bounded=physical.create().outlines(base,{atmosphere:'standard',settings:{
    maxBuildMs:0,maxSamples:100,maximumDepth:2}}).data;
  assert.equal(bounded.budgetExceeded,true);
  assert.equal(bounded.segments.length,0);
  assert.ok(bounded.unresolved.length>0);
});
