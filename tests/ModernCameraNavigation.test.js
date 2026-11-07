'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const nav=require('../src/ui/modern/ModernCameraNavigation');
const interaction=require('../src/ui/modern/ModernCameraInteraction');
const interpolator=require('../src/camera/ModernCameraInterpolator');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const compareModel=require('../src/ui/modern/ModernCompareModel');
const scene=require('../src/ui/modern/ModernSceneState');
const read=file=>fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');
const approx=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
const pose={Height:15,CameraEast:0,CameraNorth:0,Pan:0,Nick:0,Roll:0,
  FocalLengthField:1000,viewcenterHorizon:3,deviceRatio:1.5};

test('keyboard navigation uses local horizontal axes; diagonal speed is normalized',()=>{
  const straight=nav.move(pose,{forward:true},2,{speed:10,turnRate:1});
  approx(straight.CameraEast,0);approx(straight.CameraNorth,20);
  approx(straight.Height,15);approx(straight.Pan,0);
  const sideways=nav.move(pose,{right:true,up:true},1,{speed:10,turnRate:1});
  approx(sideways.CameraEast,10/Math.sqrt(2));approx(sideways.Height,15+10/Math.sqrt(2));
  const facingEast=nav.move({...pose,Pan:90},{forward:true},1,{speed:10,turnRate:1});
  approx(facingEast.CameraEast,10);approx(facingEast.CameraNorth,0);
  const reverse=nav.move(pose,{backward:true,left:true,down:true},1,{speed:10,turnRate:1});
  assert.ok(reverse.CameraNorth<0&&reverse.CameraEast<0&&reverse.Height<15);
  assert.equal(nav.action('KeyW'),'forward');assert.equal(nav.action('ArrowUp'),'nickUp');
  assert.equal(nav.action('KeyX'),null);
});

test('movement and turn rates respect fast/precise modifiers and bounds',()=>{
  const base=nav.move(pose,{forward:true,panRight:true,nickUp:true},1,{speed:10,turnRate:5});
  const fast=nav.move(pose,{forward:true,panRight:true,nickUp:true},1,{speed:10,turnRate:5},{fast:true});
  const slow=nav.move(pose,{forward:true,panRight:true,nickUp:true},1,{speed:10,turnRate:5},{precise:true});
  approx(base.CameraNorth,10);approx(fast.CameraNorth,50);approx(slow.CameraNorth,2);
  approx(base.Pan,5);approx(fast.Nick,25);approx(slow.Pan,1);
  const limits=nav.move({...pose,Height:.001,Pan:359.9,Nick:89.9},
    {down:true,panRight:true,nickUp:true},100,{speed:10000,turnRate:20});
  assert.equal(limits.Height,.001);assert.equal(limits.Pan,360);assert.equal(limits.Nick,90);
  assert.throws(()=>nav.move(pose,{},NaN),RangeError);
  assert.equal(nav.settings({speed:NaN,turnRate:100,wheelStep:'broken'}).speed,10);
});

test('Alt wheel can use an explicit step without changing its default behavior',()=>{
  const camera={...pose};
  const auto=interaction.dolly(camera,-100,0,10000);
  const unit=interaction.dolly(camera,-100,0,10000,1);
  assert.ok(auto.CameraNorth>unit.CameraNorth);
  approx(unit.CameraNorth,1);
  assert.deepEqual(interaction.dolly(camera,-100,0,10000,'auto'),auto);
  assert.throws(()=>interaction.dolly(camera,-100,0,10000,-1),RangeError);
});

function experiment(positions){
  const model={...pose,showModel:1,rEarth:6371000,showGrid:1,DemoText:'Test',Description:'',
    NObjects:[1,0],ObjType:[3,3],ObjDist:[1000,2000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[20,20],ObjSizeVar:[0,0]};
  return codec.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'custom',resetPreset:'pontchartrain'},compare.preset('standard-vacuum'),
    {mode:'compare',eyeLevel:true,horizon:true,selected:'A',cameraPositions:positions});
}

test('camera positions survive JSON/URL round-trip without changing legacy experiment schema',()=>{
  const saved=experiment([{id:'camera-1',name:'Near bridge',camera:{...pose}},
    {id:'camera-2',name:'High view',camera:{...pose,Height:120,Pan:10,FocalLengthField:500}}]);
  assert.equal(saved.cameraPositions.length,2);
  assert.deepEqual(codec.decode(codec.encode(saved)),saved);
  assert.deepEqual(codec.readUrl(new URL(codec.urlWithExperiment('https://example.org/CurvatureModern.html',saved)).search),saved);
  const old=experiment([]);
  assert.equal('cameraPositions' in old,false,'empty lists do not alter historical URL payloads');
  assert.equal('cameraPositions' in codec.validate(old),false);
  assert.equal(codec.validate({...old,cameraPositions:[]}).cameraPositions,undefined);
  for(const invalid of [
    [{id:'camera-1',name:'',camera:{...pose}}],
    [{id:'camera-1',name:'x',camera:{...pose,Height:-1}}],
    [{id:'camera-1',name:'x',camera:{...pose,CameraEast:Infinity}}],
    [{id:'camera-1',name:'x',camera:{...pose}},{id:'camera-1',name:'y',camera:{...pose}}],
    [{id:'camera-1',name:'x',camera:{...pose,extraneous:10}}]
  ])assert.throws(()=>codec.validate({...old,cameraPositions:invalid}),RangeError);
});

function boot(){
  const ids=[...read('CurvatureModern.html').matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
  const nodes=new Map(),renders=[],globalListeners={},frames=new Map(),timers=new Map();
  let clock=100,seq=0,ons=[];
  function element(id,tag='DIV'){
    return {id,tagName:tag,hidden:false,disabled:false,checked:false,textContent:'',value:'',
      min:'',max:'',options:[],listeners:{},children:[],style:{},classList:{toggle(){},add(){},remove(){}},
      addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);},
      dispatch(name,options={}){const ev={key:'',code:'',target:this,preventDefault(){this.defaultPrevented=true;},...options};
        for(const fn of this.listeners[name]||[])fn.call(this,ev);return ev;},
      setAttribute(){},getAttribute(){return null;},closest(){return {hidden:false};},
      querySelector(){return null;},querySelectorAll(){return [];},
      appendChild(child){this.children.push(child);return child;},
      focus(){document.activeElement=this;},blur(){document.activeElement=document.body;}
    };
  }
  for(const id of ids)nodes.set(id,element(id,id==='ModernCameraPositions'?'SELECT':'DIV'));
  const preset=nodes.get('ModernPreset');preset.value='pontchartrain';
  nodes.get('ModernCameraAim').value='3';
  nodes.get('ModernCompareHorizon').checked=false;
  for(let group=0;group<2;group++){
    const el=nodes.get('ModernObjectFields'+group),items=[];
    for(const key of Object.keys(scene.OBJECT)){
      const field=element('object-'+group+'-'+key,'INPUT');field.getAttribute=key2=>
        key2==='data-field'?key:key2==='data-group'?String(group):null;
      items.push(field);
    }
    el.querySelectorAll=()=>items;
  }
  function canvas(name){const c=element(name,'CANVAS');c.parentNode={appendChild(){},querySelector(){return null;}};
    c.getBoundingClientRect=()=>({width:500,height:300});return c;}
  const sceneCanvas=canvas('scene');
  const document={body:element('body','BODY'),documentElement:element('document','HTML'),activeElement:null,
    getElementById(id){return nodes.get(id)||null;},querySelector(query){return query[0]==='#'?nodes.get(query.slice(1))||null:null;},
    createElement(tag){return element('',tag.toUpperCase());},addEventListener(){}};
  document.activeElement=document.body;
  function Model(){Object.assign(this,{...pose,Height:15,FocalLengthField:2000,Pan:.0464,Nick:.0121,
    showModel:1,rEarth:6371000,viewcenterHorizon:3,deviceRatio:1.5,showGrid:1,
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSideType:[0,0],ObjSidePos:[35,25.4],ObjSideVar:[0,0],
    ObjSizeType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],
    Update(){this.FocalLength=this.FocalLengthField;this.ViewAngleField=1.2;this.camViewAngle=.02;}});}
  const storage=new Map();
  const win={CurveAppClass:Model,CurvatureModernSceneState:scene,
    CurvatureCameraTranslation:require('../src/geometry/CurvatureCameraTranslation'),
    CurvatureModernCameraInteraction:interaction,CurvatureModernCameraNavigation:nav,
    CurvatureModernCameraInterpolator:interpolator,
    CurvatureModernExperimentState:codec,
    CurvatureModernCompareState:compare,CurvatureModernCompareModel:compareModel,
    CurvaturePhysicalCurvature:require('../src/app/CurvaturePhysicalCurvature'),
    CurvaturePhysicalSceneOptics:{create(){return {}; }},
    CurvatureOpticalPreviewLod:require('../src/optics/OpticalPreviewLod'),
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,opt){renders.push({...pose,East:m.CameraEast,North:m.CameraNorth,Height:m.Height,Pan:m.Pan,
      quality:opt.opticalQuality,stride:opt.previewLod.stride});
      return {drawn:12,fillTriangles:3,unresolved:0,timings:{opticsMs:1,canvasMs:1}};}},
    localStorage:{getItem(k){return storage.get(k)||null;},setItem(k,v){storage.set(k,v);}},
    performance:{now:()=>clock},
    addEventListener(name,fn){(globalListeners[name]??=[]).push(fn);},
    NewGraphX3D(args){return {Canvas:sceneCanvas,UpdateCanvasSize(){},Redraw(){args.DrawFunc({Canvas:sceneCanvas});}};},
    xOnLoad(fn){ons.push(fn);},console};
  win.window=win;
  const context={window:win,document,console,
    requestAnimationFrame(fn){const id=++seq;frames.set(id,fn);return id;},
    cancelAnimationFrame(id){frames.delete(id);},
    setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);}};
  vm.runInNewContext(read('src/ui/modern/ModernApp.js'),context);
  const app=win.CurvatureModernApp;
  for(const name of ['A','B'])app.registerCompareGraph(name,{
    UpdateCanvasSize(){},Redraw(){app.drawCompare(name,{Canvas:canvas(name)});}});
  ons[0]();
  function flushFrames(ms=16){clock+=ms;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(clock);}
  function dispatchGlobal(name,evt){const event={code:'',key:'',target:sceneCanvas,
    shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,
    preventDefault(){this.prevented=true;},...evt};
    for(const listener of globalListeners[name]||[])listener(event);return event;}
  return {app,win,document,nodes,renders,storage,canvas:sceneCanvas,flushFrames,dispatchGlobal,
    flushTimers(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},
    get pendingFrames(){return frames.size;}};
}

test('Modern UI saves, renames, updates, restores and deletes camera-only poses',()=>{
  const h=boot(),m=h.app.getModel(),n=h.nodes;
  const name=n.get('ModernCameraPositionName'),select=n.get('ModernCameraPositions');
  name.value='Initial bridge';n.get('ModernCameraSave').dispatch('click');
  assert.equal(h.app.getCameraPositions().length,1);
  assert.equal(h.app.getCameraPositions()[0].name,'Initial bridge');
  assert.equal(select.value,'camera-1');
  m.Height=30;m.Pan=12;m.CameraEast=25;m.FocalLengthField=500;
  n.get('ModernCameraUpdate').dispatch('click');
  assert.equal(h.app.getCameraPositions()[0].camera.CameraEast,25);
  name.value='High bridge';n.get('ModernCameraRename').dispatch('click');
  assert.equal(h.app.getCameraPositions()[0].name,'High bridge');
  m.Height=100;m.Pan=90;m.CameraEast=70;
  n.get('ModernCameraGo').dispatch('click');
  assert.equal(m.Height,30);assert.equal(m.Pan,12);assert.equal(m.CameraEast,25);
  assert.equal(m.FocalLengthField,500);
  n.get('ModernCameraDelete').dispatch('click');
  assert.equal(h.app.getCameraPositions().length,0);
});

test('keyboard navigation is not blocked by optics and does not intercept form editing',()=>{
  const h=boot(),m=h.app.getModel();
  const draw0=h.renders.length;
  h.nodes.get('ModernHeight').tagName='INPUT';
  const typed=h.dispatchGlobal('keydown',{code:'KeyW',target:h.nodes.get('ModernHeight')});
  assert.equal(typed.prevented,undefined);
  const began=h.dispatchGlobal('keydown',{code:'KeyW'});
  assert.equal(began.prevented,true);
  h.flushFrames(100);h.flushFrames(100);
  assert.ok(m.CameraNorth>0);
  assert.equal(h.renders.length,draw0,'movement drafts must not trigger optical redraw');
  h.dispatchGlobal('keyup',{code:'KeyW'});
  h.flushFrames();
  assert.equal(h.renders.length,draw0+1,'one Scene render on release');
  assert.equal(h.nodes.get('ModernCameraNorth').value,String(m.CameraNorth));
  assert.equal(h.nodes.get('ModernPreset').value,'custom');
});

test('numeric East/North controls and camera reset preserve object/atmosphere inputs',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();
  const initialObj=m.ObjDist.slice(),initialPan=m.Pan;
  n.get('ModernCameraEast').value='123.456';
  n.get('ModernCameraEast').dispatch('change');
  assert.equal(m.CameraEast,123.456);
  n.get('ModernCameraNorth').value='-50';
  n.get('ModernCameraNorth').dispatch('change');
  assert.equal(m.CameraNorth,-50);
  n.get('ModernCameraReset').dispatch('click');
  assert.equal(m.CameraEast,0);assert.equal(m.CameraNorth,0);assert.equal(m.Pan,initialPan);
  assert.deepEqual(m.ObjDist,initialObj);
  assert.equal(m.Height,15);
});

test('saved pose restoration updates the shared camera in both Compare viewports',()=>{
  const h=boot(),m=h.app.getModel(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernCameraPositionName').value='Shared view';
  n.get('ModernCameraSave').dispatch('click');
  m.Height=80;m.Pan=45;m.CameraNorth=300;
  n.get('ModernCameraGo').dispatch('click');
  assert.equal(m.Height,15);
  assert.equal(m.CameraNorth,0);
  const pair=h.app.getCompareModels();
  assert.ok(pair&&pair.A&&pair.B);
  assert.equal(pair.A.Height,m.Height);
  assert.equal(pair.B.Height,m.Height);
  assert.equal(pair.A.CameraNorth,0);
  assert.equal(pair.B.CameraNorth,0);
  assert.equal(pair.A.Pan,pair.B.Pan);
});

test('keyboard speed preferences are separate from captured camera poses',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCameraMoveSpeed').value='100';n.get('ModernCameraMoveSpeed').dispatch('change');
  n.get('ModernCameraTurnRate').value='0.05';n.get('ModernCameraTurnRate').dispatch('change');
  n.get('ModernCameraWheelStep').value='10';n.get('ModernCameraWheelStep').dispatch('change');
  assert.equal(h.app.getNavigationPrefs().speed,100);
  assert.equal(h.app.getNavigationPrefs().turnRate,.05);
  assert.equal(h.app.getNavigationPrefs().wheelStep,10);
  assert.ok(h.storage.has('curvature-modern-camera-navigation-v1'));
  n.get('ModernCameraPositionName').value='Without speed';n.get('ModernCameraSave').dispatch('click');
  const entry=h.app.getCameraPositions()[0];
  assert.ok(!Object.hasOwn(entry.camera,'speed'));
  assert.deepEqual(Object.keys(entry.camera).sort(),Object.keys(pose).sort());
});


test('Auto navigation samples Fast with bounded RAF work and restores Accurate on key release',()=>{
  const h=boot(),selector=h.nodes.get('ModernOpticalQuality'),r=h.renders;
  selector.value='auto';selector.dispatch('change');h.flushFrames();
  assert.equal(h.app.getOpticalQuality(),'auto');
  assert.equal(h.app.getEffectiveOpticalQuality(),'accurate');
  assert.equal(r.at(-1).quality,'accurate');
  const begin=r.length;
  h.dispatchGlobal('keydown',{code:'KeyW'});
  for(let i=0;i<15;i++){
    h.flushFrames(25);
    assert.ok(h.pendingFrames<=2,'navigation plus at most one pending render');
  }
  const fast=r.slice(begin).filter(x=>x.quality==='fast');
  assert.ok(fast.length>=2,'camera motion should paint multiple optical Preview samples');
  assert.ok(fast.length<15,'Fast frames must be throttled');
  assert.equal(fast[0].stride,8,'Auto LOD must begin coarse on dense scenes');
  assert.ok(h.app.getModel().CameraNorth>0);
  h.dispatchGlobal('keyup',{code:'KeyW'});h.flushFrames(16);
  assert.equal(h.app.getEffectiveOpticalQuality(),'accurate');
  assert.equal(r.at(-1).quality,'accurate');
  assert.equal(r.at(-1).stride,1,'final frame must retain all towers');
});

test('Auto wheel renders Fast before a single deferred Accurate settle frame',()=>{
  const h=boot(),selector=h.nodes.get('ModernOpticalQuality'),r=h.renders;
  selector.value='auto';selector.dispatch('change');h.flushFrames();
  const begin=r.length;
  for(let i=0;i<3;i++)h.canvas.dispatch('wheel',{
    deltaY:-100,deltaX:0,deltaMode:0,altKey:true});
  h.flushFrames(16);
  assert.ok(r.slice(begin).some(x=>x.quality==='fast'));
  h.flushTimers();h.flushFrames(16);
  assert.equal(r.at(-1).quality,'accurate');
  assert.equal(r.at(-1).stride,1);
});

test('Auto pointer drag projects live Fast and commits an Accurate frame at release',()=>{
  const h=boot(),selector=h.nodes.get('ModernOpticalQuality'),r=h.renders;
  selector.value='auto';selector.dispatch('change');h.flushFrames();
  const pan=h.app.getModel().Pan,begin=r.length;
  const pointer={button:0,pointerId:2,isPrimary:true,clientX:20,clientY:20};
  h.canvas.dispatch('pointerdown',pointer);
  h.canvas.dispatch('pointermove',{...pointer,clientX:90,clientY:70});
  h.flushFrames(16);
  assert.notEqual(h.app.getModel().Pan,pan);
  assert.ok(r.slice(begin).some(x=>x.quality==='fast'));
  h.canvas.dispatch('pointerup',{...pointer,clientX:90,clientY:70});
  h.flushFrames(16);
  assert.equal(r.at(-1).quality,'accurate');
  assert.equal(h.app.getEffectiveOpticalQuality(),'accurate');
});

test('Auto never draws Fast for unqualified atmospheric profiles',()=>{
  const h=boot(),selector=h.nodes.get('ModernOpticalQuality'),r=h.renders;
  const atmosphere=h.nodes.get('ModernAtmosphere');
  atmosphere.value='temperature-lapse';atmosphere.dispatch('change');h.flushFrames();
  selector.value='auto';selector.dispatch('change');h.flushFrames();
  const begin=r.length;
  h.dispatchGlobal('keydown',{code:'KeyW'});
  for(let i=0;i<8;i++)h.flushFrames(50);
  assert.equal(r.length,begin,'no expensive rendering should run while an unsupported camera is moving');
  h.dispatchGlobal('keyup',{code:'KeyW'});h.flushFrames(16);
  assert.equal(r.at(-1).quality,'accurate');
  assert.ok(r.slice(begin).every(x=>x.quality==='accurate'));
});

test('Auto Compare uses the same Fast LOD for both sides and restores both Accurate',()=>{
  const h=boot(),selector=h.nodes.get('ModernOpticalQuality'),r=h.renders;
  h.nodes.get('ModernCompareTab').dispatch('click');h.flushFrames(16);
  selector.value='auto';selector.dispatch('change');h.flushFrames(16);
  const begin=r.length;
  h.dispatchGlobal('keydown',{code:'KeyW'});
  h.flushFrames(140);h.flushFrames(16);
  const fast=r.slice(begin).filter(x=>x.quality==='fast');
  assert.equal(fast.length,2,'A and B must render Fast in the same batch');
  assert.equal(fast[0].stride,fast[1].stride);
  h.dispatchGlobal('keyup',{code:'KeyW'});h.flushFrames(16);
  assert.deepEqual(r.slice(-2).map(x=>x.quality),['accurate','accurate']);
  assert.deepEqual(r.slice(-2).map(x=>x.stride),[1,1]);
});

test('Cancelling an Auto camera drag restores initial pose and Accurate optics',()=>{
  const h=boot(),selector=h.nodes.get('ModernOpticalQuality'),r=h.renders;
  selector.value='auto';selector.dispatch('change');h.flushFrames();
  const model=h.app.getModel(),originalPan=model.Pan;
  const pointer={button:0,pointerId:2,isPrimary:true,clientX:20,clientY:20};
  h.canvas.dispatch('pointerdown',pointer);
  h.canvas.dispatch('pointermove',{...pointer,clientX:140,clientY:100});
  h.flushFrames(16);
  assert.notEqual(model.Pan,originalPan);
  h.canvas.dispatch('pointercancel',pointer);h.flushFrames(16);
  assert.equal(model.Pan,originalPan);
  assert.equal(r.at(-1).quality,'accurate');
  assert.equal(h.app.getEffectiveOpticalQuality(),'accurate');
});

function savedTransition(h){
  const n=h.nodes,m=h.app.getModel();
  n.get('ModernCameraPositionName').value='Bridge A';n.get('ModernCameraSave').dispatch('click');
  m.Height=100;m.CameraNorth=400;m.CameraEast=100;m.Pan=30;m.Nick=-5;
  m.FocalLengthField=800;m.Roll=10;
  n.get('ModernCameraPositionName').value='Bridge B';n.get('ModernCameraSave').dispatch('click');
  n.get('ModernTransitionFrom').value='camera-1';
  n.get('ModernTransitionTo').value='camera-2';
  n.get('ModernTransitionDuration').value='5';
  n.get('ModernTransitionEasing').value='linear';
}

test('transition plays deterministic Fast samples and finishes at the exact saved pose with Accurate',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();
  savedTransition(h);
  const before=JSON.stringify(h.app.getCameraPositions());
  n.get('ModernTransitionPlay').dispatch('click');
  assert.equal(h.app.getCameraTransition().playing,true);
  assert.equal(m.CameraNorth,0);
  assert.equal(n.get('ModernTransitionStop').disabled,false);
  h.flushFrames(2500);
  approx(m.CameraNorth,200);approx(m.CameraEast,50);approx(m.Height,57.5);
  approx(m.FocalLengthField,Math.sqrt(2000*800));
  h.flushFrames();
  assert.ok(h.renders.some(r=>r.quality==='fast'),'Fast optical frame during movement');
  h.flushFrames(2600);h.flushFrames();
  assert.equal(h.app.getCameraTransition().playing,false);
  assert.equal(m.CameraNorth,400);assert.equal(m.Height,100);
  assert.equal(h.renders.at(-1).quality,'accurate');
  assert.equal(h.renders.at(-1).stride,1);
  assert.equal(n.get('ModernTransitionPlay').disabled,false);
  assert.equal(n.get('ModernTransitionStop').disabled,true);
  assert.equal(JSON.stringify(h.app.getCameraPositions()),before,'saved keyframes remain untouched');
});

test('transition Stop holds interpolated pose and Cancel restores the pre-play pose',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedTransition(h);
  n.get('ModernTransitionPlay').dispatch('click');h.flushFrames(1250);h.flushFrames();
  const held=m.CameraNorth;assert.ok(held>0&&held<400);
  n.get('ModernTransitionStop').dispatch('click');h.flushFrames();
  assert.equal(h.app.getCameraTransition().playing,false);
  approx(m.CameraNorth,held);
  assert.equal(h.renders.at(-1).quality,'accurate');
  h.flushFrames(6000);approx(m.CameraNorth,held);
  n.get('ModernTransitionPlay').dispatch('click');h.flushFrames(2000);
  assert.ok(m.CameraNorth>0&&m.CameraNorth<400);
  n.get('ModernTransitionCancel').dispatch('click');h.flushFrames();
  approx(m.CameraNorth,held);
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('keyboard interrupts playback and takes over camera without an expensive redraw on keydown',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedTransition(h);
  n.get('ModernTransitionPlay').dispatch('click');h.flushFrames(1100);h.flushFrames();
  const cameraBefore=m.CameraNorth,renders=h.renders.length;
  h.dispatchGlobal('keydown',{code:'KeyW'});
  assert.equal(h.app.getCameraTransition().playing,false);
  assert.equal(h.renders.length,renders);
  h.flushFrames(100);
  assert.ok(m.CameraNorth>cameraBefore);
  h.dispatchGlobal('keyup',{code:'KeyW'});h.flushFrames();
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('transition rejects unsupported optics, discrete pose mismatches and invalid durations without changing the camera',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedTransition(h);
  const original=m.CameraNorth;
  n.get('ModernTransitionDuration').value='0';n.get('ModernTransitionPlay').dispatch('click');
  assert.equal(h.app.getCameraTransition().playing,false);
  assert.match(n.get('ModernTransitionStatus').textContent,/duration/i);
  n.get('ModernTransitionDuration').value='5';
  n.get('ModernAtmosphere').value='temperature-lapse';n.get('ModernAtmosphere').dispatch('change');h.flushFrames();
  n.get('ModernTransitionPlay').dispatch('click');
  assert.equal(h.app.getCameraTransition().playing,false);
  assert.match(n.get('ModernTransitionStatus').textContent,/Fast Preview/i);
  n.get('ModernAtmosphere').value='standard';n.get('ModernAtmosphere').dispatch('change');h.flushFrames();
  const entries=h.app.getCameraPositions();entries[1].camera.viewcenterHorizon=2;
  // Editing saved positions through the public UI respects the same validation.
  m.viewcenterHorizon=2;n.get('ModernCameraPositions').value='camera-2';
  n.get('ModernCameraUpdate').dispatch('click');
  n.get('ModernTransitionPlay').dispatch('click');
  assert.equal(h.app.getCameraTransition().playing,false);
  assert.match(n.get('ModernTransitionStatus').textContent,/aim mode/i);
  assert.equal(m.CameraNorth,original);
});

test('Compare transition shares the same camera and Preview LOD in A/B, then restores Accurate',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedTransition(h);
  n.get('ModernCompareTab').dispatch('click');h.flushFrames();
  n.get('ModernTransitionPlay').dispatch('click');h.flushFrames(1500);h.flushFrames();
  assert.equal(h.app.getCameraTransition().playing,true);
  const pair=h.app.getCompareModels();
  assert.equal(pair.A.CameraNorth,pair.B.CameraNorth);
  assert.equal(pair.A.Pan,pair.B.Pan);
  const a=h.renders.filter(r=>r.quality==='fast');
  assert.ok(a.length>=2);assert.equal(a.at(-1).stride,a.at(-2).stride);
  h.flushFrames(4000);h.flushFrames();
  assert.equal(h.app.getCameraTransition().playing,false);
  assert.equal(h.app.getCompareModels().A.CameraNorth,400);
  assert.equal(h.app.getCompareModels().B.CameraNorth,400);
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('switching workspaces or pressing Cancel clears stale transition frames',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedTransition(h);
  n.get('ModernTransitionPlay').dispatch('click');h.flushFrames(1000);
  n.get('ModernCompareTab').dispatch('click');h.flushFrames();
  assert.equal(h.app.getCameraTransition().playing,false);
  const stopped=m.CameraNorth;h.flushFrames(8000);
  assert.equal(m.CameraNorth,stopped,'cancelled RAF must not move the camera later');
  n.get('ModernTransitionPlay').dispatch('click');h.flushFrames(2000);
  n.get('ModernTransitionCancel').dispatch('click');h.flushFrames();
  assert.equal(m.CameraNorth,stopped);
  h.flushFrames(8000);assert.equal(m.CameraNorth,stopped);
});


test('pointer navigation interrupts transition and retains immediate manual control',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedTransition(h);
  n.get('ModernTransitionPlay').dispatch('click');h.flushFrames(1000);h.flushFrames();
  const before=m.Pan;
  const pointer={button:0,pointerId:3,isPrimary:true,clientX:20,clientY:20};
  h.canvas.dispatch('pointerdown',pointer);
  assert.equal(h.app.getCameraTransition().playing,false);
  h.canvas.dispatch('pointermove',{...pointer,clientX:90,clientY:60});
  h.canvas.dispatch('pointerup',{...pointer,clientX:90,clientY:60});
  h.flushFrames();
  assert.notEqual(m.Pan,before);
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('wheel input interrupts transition and the resulting viewport shows manual zoom',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedTransition(h);
  n.get('ModernTransitionPlay').dispatch('click');h.flushFrames(1200);h.flushFrames();
  const focal=m.FocalLengthField;
  h.canvas.dispatch('wheel',{deltaY:-100,deltaX:0,deltaMode:0,shiftKey:true});
  assert.equal(h.app.getCameraTransition().playing,false);
  assert.notEqual(m.FocalLengthField,focal);
  h.flushTimers();h.flushFrames();
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('losing browser focus stops transition and returns to idle optics',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedTransition(h);
  n.get('ModernTransitionPlay').dispatch('click');h.flushFrames(500);h.flushFrames();
  const north=m.CameraNorth;
  h.dispatchGlobal('blur',{});h.flushFrames();
  assert.equal(h.app.getCameraTransition().playing,false);
  assert.equal(m.CameraNorth,north);
  assert.equal(h.renders.at(-1).quality,'accurate');
  h.flushFrames(10000);assert.equal(m.CameraNorth,north);
});
