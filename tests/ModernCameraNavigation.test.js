'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const nav=require('../src/ui/modern/ModernCameraNavigation');
const preferences=require('../src/ui/modern/ModernApplicationPreferences');
const interaction=require('../src/ui/modern/ModernCameraInteraction');
const interpolator=require('../src/camera/ModernCameraInterpolator');
const sequence=require('../src/camera/ModernCameraSequence');
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

function boot(savedExperiment, initialPreferences){
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
  const storage=new Map(savedExperiment?[[codec.STORAGE_KEY,JSON.stringify(savedExperiment)]]:[]);
  for(const [key,value] of Object.entries(initialPreferences||{}))storage.set(key,value);
  const win={CurveAppClass:Model,CurvatureModernSceneState:scene,
    CurvatureCameraTranslation:require('../src/geometry/CurvatureCameraTranslation'),
    CurvatureModernCameraInteraction:interaction,CurvatureModernCameraNavigation:nav,
    CurvatureModernApplicationPreferences:preferences,
    CurvatureModernCameraInterpolator:interpolator,CurvatureModernCameraSequence:sequence,
    CurvatureModernExperimentState:codec,
    CurvatureModernCompareState:compare,CurvatureModernCompareModel:compareModel,
    CurvaturePhysicalCurvature:require('../src/app/CurvaturePhysicalCurvature'),
    CurvaturePhysicalSceneOptics:{create(){return {}; }},
    CurvatureOpticalPreviewLod:require('../src/optics/OpticalPreviewLod'),
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,opt){renders.push({...pose,East:m.CameraEast,North:m.CameraNorth,Height:m.Height,Pan:m.Pan,
      quality:opt.opticalQuality,stride:opt.previewLod.stride});
      return {drawn:12,fillTriangles:3,unresolved:0,timings:{opticsMs:1,canvasMs:1}};}},
    localStorage:{getItem(k){return storage.get(k)||null;},setItem(k,v){storage.set(k,v);},removeItem(k){storage.delete(k);}},
    performance:{now:()=>clock},
    addEventListener(name,fn){(globalListeners[name]??=[]).push(fn);},
    NewGraphX3D(args){return {Canvas:sceneCanvas,UpdateCanvasSize(){},Redraw(){args.DrawFunc({Canvas:sceneCanvas});}};},
    xOnLoad(fn){ons.push(fn);},console};
  if(savedExperiment)win.location={href:'https://example.org/CurvatureModern.html',search:''};
  win.window=win;
  const context={window:win,document,console,URL,URLSearchParams,
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
  assert.ok(h.storage.has(preferences.STORAGE_KEY));
  assert.equal(JSON.parse(h.storage.get(preferences.STORAGE_KEY)).navigation.speed,100);
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

function addCurrent(h,overrides){
  const model=h.app.getModel();Object.assign(model,overrides||{});
  h.nodes.get('ModernSequenceAdd').dispatch('click');
}
function twoFrameAnimation(h){
  addCurrent(h,{CameraNorth:0,CameraEast:0,Height:15,Pan:0,Nick:0,Roll:0,FocalLengthField:2000});
  addCurrent(h,{CameraNorth:400,CameraEast:100,Height:100,Pan:30,Nick:-5,Roll:10,FocalLengthField:800});
}
test('new camera animation needs no saved positions or names and displays an ordered two-frame transition',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();
  assert.equal(n.get('ModernSequenceAdd').disabled,false,'primary button must work with no saved views');
  assert.equal(n.get('ModernSequenceEmpty').hidden,false);
  twoFrameAnimation(h);
  const frames=h.app.getCameraSequence();
  assert.equal(frames.map(f=>f.name).join(','),'Frame 1,Frame 2');
  assert.equal(frames[1].travelMs,5000);
  assert.equal(h.app.getCameraPositions().length,0,'no saved-view dependency');
  assert.equal(n.get('ModernSequenceEmpty').hidden,true);
  assert.equal(n.get('ModernSequencePlay').disabled,false);
  assert.match(n.get('ModernSequenceKeyframes').children.at(-1).textContent,/→ 5.0 s/);
  const snapshots=JSON.stringify(frames);
  n.get('ModernSequenceEasing').value='linear';n.get('ModernSequenceEasing').dispatch('change');
  assert.equal(h.app.getCameraSequence()[1].easing,'linear');
  n.get('ModernSequencePlay').dispatch('click');
  assert.equal(h.app.getCameraAnimation().playing,true);
  approx(m.CameraNorth,0);
  h.flushFrames(2500);
  approx(m.CameraNorth,200);approx(m.CameraEast,50);approx(m.Height,57.5);
  approx(m.FocalLengthField,Math.sqrt(2000*800));
  h.flushFrames();assert.ok(h.renders.some(r=>r.quality==='fast'));
  h.flushFrames(2600);h.flushFrames();
  assert.equal(h.app.getCameraAnimation().playing,false);
  approx(m.CameraNorth,400);approx(m.Height,100);
  assert.equal(h.renders.at(-1).quality,'accurate');
  assert.equal(h.renders.at(-1).stride,1);
  assert.equal(n.get('ModernSequenceStop').disabled,true);
  assert.notEqual(JSON.stringify(h.app.getCameraSequence()),snapshots,'timing edit was stored');
});

test('animation Stop holds interpolated pose, Cancel restores the pre-Play camera',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();twoFrameAnimation(h);
  m.CameraNorth=23;
  n.get('ModernSequencePlay').dispatch('click');h.flushFrames(1250);h.flushFrames();
  const held=m.CameraNorth;assert.ok(held>0&&held<400);
  n.get('ModernSequenceStop').dispatch('click');h.flushFrames();
  approx(m.CameraNorth,held);
  assert.equal(h.renders.at(-1).quality,'accurate');
  h.flushFrames(6000);approx(m.CameraNorth,held);
  n.get('ModernSequencePlay').dispatch('click');h.flushFrames(2000);
  n.get('ModernSequenceCancel').dispatch('click');h.flushFrames();
  approx(m.CameraNorth,held);
});

test('unsupported optics and mismatched aim modes prevent animation without moving camera',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();twoFrameAnimation(h);
  const original=m.CameraNorth;
  n.get('ModernAtmosphere').value='temperature-lapse';n.get('ModernAtmosphere').dispatch('change');h.flushFrames();
  n.get('ModernSequencePlay').dispatch('click');
  assert.equal(h.app.getCameraAnimation().playing,false);
  assert.match(n.get('ModernSequenceStatus').textContent,/Fast Preview/i);
  n.get('ModernAtmosphere').value='standard';n.get('ModernAtmosphere').dispatch('change');h.flushFrames();
  const mismatch=boot(),v=mismatch.app.getModel(),controls=mismatch.nodes;
  mismatch.flushFrames();
  addCurrent(mismatch,{CameraNorth:0,viewcenterHorizon:3});
  addCurrent(mismatch,{CameraNorth:400,viewcenterHorizon:0});
  assert.equal(mismatch.app.getCameraSequence().length,1,'a mismatched camera is rejected when adding it');
  assert.match(controls.get('ModernSequenceStatus').textContent,/aim mode/i);
  assert.equal(m.CameraNorth,original);
});

test('two-frame animation keeps Compare A/B poses and Fast LOD synchronized',()=>{
  const h=boot(),n=h.nodes;h.flushFrames();twoFrameAnimation(h);
  n.get('ModernCompareTab').dispatch('click');h.flushFrames();
  n.get('ModernSequencePlay').dispatch('click');h.flushFrames(1500);h.flushFrames();
  const pair=h.app.getCompareModels();
  assert.equal(pair.A.CameraNorth,pair.B.CameraNorth);
  assert.equal(pair.A.Pan,pair.B.Pan);
  const fast=h.renders.filter(r=>r.quality==='fast');
  assert.ok(fast.length>=2);assert.equal(fast.at(-1).stride,fast.at(-2).stride);
  h.flushFrames(4000);h.flushFrames();
  assert.equal(h.app.getCameraAnimation().playing,false);
  approx(h.app.getCompareModels().A.CameraNorth,400);
  approx(h.app.getCompareModels().B.CameraNorth,400);
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('manual keyboard, pointer, wheel and workspace switches interrupt animation safely',()=>{
  for(const gesture of ['keyboard','pointer','wheel','workspace']){
    const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();twoFrameAnimation(h);
    n.get('ModernSequencePlay').dispatch('click');h.flushFrames(1200);h.flushFrames();
    const current=m.CameraNorth,renderCount=h.renders.length;
    if(gesture==='keyboard'){
      h.dispatchGlobal('keydown',{code:'KeyW'});
      assert.equal(h.renders.length,renderCount);
      h.flushFrames(100);h.dispatchGlobal('keyup',{code:'KeyW'});
    }else if(gesture==='pointer'){
      const pointer={button:0,pointerId:3,isPrimary:true,clientX:20,clientY:20};
      h.canvas.dispatch('pointerdown',pointer);
      h.canvas.dispatch('pointermove',{...pointer,clientX:90,clientY:60});
      h.canvas.dispatch('pointerup',{...pointer,clientX:90,clientY:60});
    }else if(gesture==='wheel'){
      h.canvas.dispatch('wheel',{deltaY:-100,deltaX:0,deltaMode:0,shiftKey:true});h.flushTimers();
    }else n.get('ModernCompareTab').dispatch('click');
    assert.equal(h.app.getCameraAnimation().playing,false,gesture);
    h.flushFrames();assert.equal(h.renders.at(-1).quality,'accurate');
    const stopped=m.CameraNorth;h.flushFrames(8000);
    approx(m.CameraNorth,stopped);
    if(gesture==='workspace')approx(stopped,current);
  }
});

test('losing browser focus stops playback and restores idle optics',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();twoFrameAnimation(h);
  n.get('ModernSequencePlay').dispatch('click');h.flushFrames(500);h.flushFrames();
  const north=m.CameraNorth;
  h.dispatchGlobal('blur',{});h.flushFrames();
  assert.equal(h.app.getCameraAnimation().playing,false);
  approx(m.CameraNorth,north);
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('selected animation frame can be viewed and replaced with current camera without changing timing',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();twoFrameAnimation(h);
  n.get('ModernSequenceKeyframes').value='0';n.get('ModernSequenceKeyframes').dispatch('change');
  n.get('ModernSequenceGo').dispatch('click');approx(m.CameraNorth,0);
  m.CameraNorth=850;
  n.get('ModernSequenceReplace').dispatch('click');
  const frames=h.app.getCameraSequence();
  approx(frames[0].camera.CameraNorth,850);
  assert.equal(frames[0].travelMs,0);assert.equal(frames[1].travelMs,5000);
});

function savedSequence(h){
  const n=h.nodes,m=h.app.getModel();
  n.get('ModernCameraPositionName').value='Bridge A';n.get('ModernCameraSave').dispatch('click');
  m.Height=100;m.CameraNorth=400;m.CameraEast=100;m.Pan=30;m.Nick=-5;
  m.FocalLengthField=800;m.Roll=10;
  n.get('ModernCameraPositionName').value='Bridge B';n.get('ModernCameraSave').dispatch('click');
  m.CameraNorth=800;m.CameraEast=250;m.Height=50;m.Pan=50;
  n.get('ModernCameraPositionName').value='Bridge C';n.get('ModernCameraSave').dispatch('click');
  n.get('ModernSequencePosition').value='camera-1';
  n.get('ModernSequenceAddSaved').dispatch('click');
  n.get('ModernSequenceHold').value='1';n.get('ModernSequenceHold').dispatch('change');
  n.get('ModernSequencePosition').value='camera-2';n.get('ModernSequencePosition').dispatch('change');
  n.get('ModernSequenceAddSaved').dispatch('click');
  n.get('ModernSequenceTravel').value='4';n.get('ModernSequenceTravel').dispatch('change');
  n.get('ModernSequenceHold').value='2';n.get('ModernSequenceHold').dispatch('change');
  n.get('ModernSequenceEasing').value='linear';n.get('ModernSequenceEasing').dispatch('change');
  n.get('ModernSequencePosition').value='camera-3';n.get('ModernSequencePosition').dispatch('change');
  n.get('ModernSequenceAddSaved').dispatch('click');
  n.get('ModernSequenceTravel').value='3';n.get('ModernSequenceTravel').dispatch('change');
  n.get('ModernSequenceHold').value='0.5';n.get('ModernSequenceHold').dispatch('change');
}
test('keyframe sequence UI snapshots positions and saves an independent timeline',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedSequence(h);
  assert.equal(h.app.getCameraSequence().length,3);
  assert.equal(sequence.totalMs(h.app.getCameraSequence()),10500);
  assert.equal(h.app.getCameraSequence()[1].camera.CameraNorth,400);
  n.get('ModernCameraPositions').value='camera-2';
  m.CameraNorth=1550;n.get('ModernCameraUpdate').dispatch('click');
  assert.equal(h.app.getCameraPositions()[1].camera.CameraNorth,1550);
  assert.equal(h.app.getCameraSequence()[1].camera.CameraNorth,400,
    'sequence owns an immutable snapshot independent of Camera Positions');
  const saved=experiment([]);
  saved.cameraSequence={keyframes:h.app.getCameraSequence()};
  const roundtrip=codec.decode(codec.encode(saved));
  assert.equal(roundtrip.cameraSequence.keyframes.length,3);
  assert.equal(roundtrip.cameraSequence.keyframes[1].camera.CameraNorth,400);
});

test('camera sequence plays holds and travel using Fast, then restores Accurate in Scene',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedSequence(h);
  const initialPosition=m.CameraNorth;
  n.get('ModernSequencePlay').dispatch('click');
  assert.equal(h.app.getCameraTransition().playing,true);
  approx(m.CameraNorth,0);
  h.flushFrames(500);approx(m.CameraNorth,0);
  h.flushFrames(2500);approx(m.CameraNorth,200);
  h.flushFrames();assert.ok(h.renders.some(r=>r.quality==='fast'));
  h.flushFrames(2000);approx(m.CameraNorth,400);
  h.flushFrames(1000);approx(m.CameraNorth,400);
  h.flushFrames(4500);h.flushFrames();
  assert.equal(h.app.getCameraTransition().playing,false);
  approx(m.CameraNorth,800);
  assert.equal(h.renders.at(-1).quality,'accurate');
  assert.equal(h.renders.at(-1).stride,1);
  assert.equal(initialPosition,800,'Play starts from the first snapshot regardless of the pre-play camera');
});

test('sequence Stop, Cancel and manual gesture preserve the same semantics as two-pose transition',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedSequence(h);
  m.CameraNorth=25;
  n.get('ModernSequencePlay').dispatch('click');h.flushFrames(3000);
  const paused=m.CameraNorth;assert.ok(paused>0&&paused<400);
  n.get('ModernSequenceStop').dispatch('click');h.flushFrames();
  approx(m.CameraNorth,paused);assert.equal(h.renders.at(-1).quality,'accurate');
  n.get('ModernSequencePlay').dispatch('click');h.flushFrames(4500);
  n.get('ModernSequenceCancel').dispatch('click');h.flushFrames();
  approx(m.CameraNorth,paused);assert.equal(h.app.getCameraTransition().playing,false);
  n.get('ModernSequencePlay').dispatch('click');h.flushFrames(2000);
  h.dispatchGlobal('keydown',{code:'KeyW'});
  assert.equal(h.app.getCameraTransition().playing,false);
  h.flushFrames(100);h.dispatchGlobal('keyup',{code:'KeyW'});h.flushFrames();
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('Compare sequence shares its pose and LOD between A/B',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedSequence(h);
  n.get('ModernCompareTab').dispatch('click');h.flushFrames();
  n.get('ModernSequencePlay').dispatch('click');h.flushFrames(3000);h.flushFrames();
  assert.equal(h.app.getCameraTransition().playing,true);
  const models=h.app.getCompareModels();
  assert.equal(models.A.CameraNorth,models.B.CameraNorth);
  const fast=h.renders.filter(r=>r.quality==='fast');
  assert.ok(fast.length>=2);assert.equal(fast.at(-1).stride,fast.at(-2).stride);
  h.flushFrames(9000);h.flushFrames();
  assert.equal(h.app.getCameraTransition().playing,false);
  const finalModels=h.app.getCompareModels();
  approx(finalModels.A.CameraNorth,800);approx(finalModels.B.CameraNorth,800);
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('sequence editing can reorder, rename, retime and reject invalid edits atomically',()=>{
  const h=boot(),n=h.nodes;h.flushFrames();savedSequence(h);
  const picker=n.get('ModernSequenceKeyframes');picker.value='1';picker.dispatch('change');
  n.get('ModernSequenceName').value='Middle';
  n.get('ModernSequenceTravel').value='2';n.get('ModernSequenceHold').value='0';
  n.get('ModernSequenceTravel').dispatch('change');
  assert.equal(h.app.getCameraSequence()[1].travelMs,2000);
  assert.equal(h.app.getCameraSequence()[1].name,'Middle');
  n.get('ModernSequenceDown').dispatch('click');
  assert.equal(h.app.getCameraSequence()[2].name,'Middle');
  n.get('ModernSequenceUp').dispatch('click');
  assert.equal(h.app.getCameraSequence()[1].name,'Middle');
  picker.value='2';picker.dispatch('change');
  n.get('ModernSequenceHold').value='-7';
  const before=JSON.stringify(h.app.getCameraSequence());
  n.get('ModernSequenceHold').dispatch('change');
  assert.equal(JSON.stringify(h.app.getCameraSequence()),before);
  assert.match(n.get('ModernSequenceStatus').textContent,/pause/i);
  n.get('ModernSequenceRemove').dispatch('click');
  assert.equal(h.app.getCameraSequence().length,2);
  n.get('ModernSequenceClear').dispatch('click');
  assert.equal(h.app.getCameraSequence().length,0);
});


test('restored camera sequence can be edited and persisted by the live Modern app',()=>{
  const original=experiment([]);
  const first={...pose},middle={...pose,CameraNorth:200},final={...pose,CameraNorth:400};
  original.cameraSequence={keyframes:[
    {name:'A',camera:first,travelMs:0,holdMs:0,easing:'linear'},
    {name:'B',camera:middle,travelMs:2000,holdMs:500,easing:'linear'},
    {name:'C',camera:final,travelMs:3000,holdMs:0,easing:'smoothstep'}
  ]};
  const h=boot(original),n=h.nodes;
  assert.equal(h.app.getCameraSequence().length,3);
  assert.equal(h.app.getCameraSequence()[2].camera.CameraNorth,400);
  n.get('ModernSequenceKeyframes').value='2';
  n.get('ModernSequenceKeyframes').dispatch('change');
  n.get('ModernSequenceHold').value='1.5';
  n.get('ModernSequenceHold').dispatch('change');
  h.flushTimers();
  const stored=codec.validate(JSON.parse(h.storage.get(codec.STORAGE_KEY)));
  assert.equal(stored.cameraSequence.keyframes.length,3);
  assert.equal(stored.cameraSequence.keyframes[2].holdMs,1500);
  assert.equal(stored.scene.camera.CameraNorth,0,'camera pose unchanged by keyframe editing');
});

test('invalid sequence inputs and unsupported atmosphere reject playback without camera mutation',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();savedSequence(h);
  const before=m.CameraNorth;
  n.get('ModernAtmosphere').value='temperature-lapse';n.get('ModernAtmosphere').dispatch('change');
  h.flushFrames();n.get('ModernSequencePlay').dispatch('click');
  assert.equal(h.app.getCameraTransition().playing,false);
  assert.equal(m.CameraNorth,before);
  assert.match(n.get('ModernSequenceStatus').textContent,/Fast Preview/i);
  n.get('ModernAtmosphere').value='standard';n.get('ModernAtmosphere').dispatch('change');
  n.get('ModernSequenceKeyframes').value='2';n.get('ModernSequenceKeyframes').dispatch('change');
  const old=JSON.stringify(h.app.getCameraSequence());
  n.get('ModernSequenceTravel').value='-1';n.get('ModernSequenceTravel').dispatch('change');
  assert.equal(JSON.stringify(h.app.getCameraSequence()),old);
});

test('three current-view captures play 1 → 2 → 3 without library or a required name',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();
  addCurrent(h,{CameraNorth:0});
  addCurrent(h,{CameraNorth:400});
  addCurrent(h,{CameraNorth:800});
  const frames=h.app.getCameraSequence();
  assert.equal(frames.length,3);
  assert.deepEqual(Array.from(frames,f=>f.name),['Frame 1','Frame 2','Frame 3']);
  assert.equal(h.app.getCameraPositions().length,0);
  assert.equal(sequence.totalMs(frames),10000);
  n.get('ModernSequencePlay').dispatch('click');
  h.flushFrames(2500);approx(m.CameraNorth,200);
  h.flushFrames(5000);approx(m.CameraNorth,600);
  h.flushFrames(2600);h.flushFrames();
  approx(m.CameraNorth,800);
  assert.equal(h.renders.at(-1).quality,'accurate');
});

test('saved-view names are optional and can be reused without linking to animation frames',()=>{
  const h=boot(),n=h.nodes,m=h.app.getModel();h.flushFrames();
  n.get('ModernCameraPositionName').value='';n.get('ModernCameraSave').dispatch('click');
  assert.equal(h.app.getCameraPositions()[0].name,'View 1');
  n.get('ModernSequencePosition').value='camera-1';
  n.get('ModernSequenceAddSaved').dispatch('click');
  assert.equal(h.app.getCameraSequence()[0].camera.CameraNorth,m.CameraNorth);
  assert.equal(h.app.getCameraSequence()[0].name,'View 1');
  m.CameraNorth=800;
  n.get('ModernCameraPositions').value='camera-1';
  n.get('ModernCameraUpdate').dispatch('click');
  assert.equal(h.app.getCameraSequence()[0].camera.CameraNorth,0);
});

test('Camera Animation is the primary UI and the old two-position controls are retired',()=>{
  const html=read('CurvatureModern.html');
  assert.ok(html.indexOf('>Camera Animation<')<html.indexOf('>Saved views · optional library<'));
  for(const id of ['ModernSequenceAdd','ModernSequenceGo','ModernSequenceReplace',
    'ModernSequenceAddSaved','ModernSequencePlay','ModernCameraReset']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  for(const id of ['ModernTransitionPlay','ModernTransitionFrom','ModernTransitionTo','ModernSequenceUpdate'])
    assert.doesNotMatch(html,new RegExp('id="'+id+'"'),id);
  assert.match(html,/<details class="modern-camera-optional" id="ModernSavedCameraLibrary">/);
});


test('display and navigation preferences are immediately saved and restored independently of experiments',()=>{
  const h=boot(),nodes=h.nodes;
  nodes.get('ModernOpticalQuality').value='auto';nodes.get('ModernOpticalQuality').dispatch('change');
  nodes.get('ModernPreviewDetail').value='8';nodes.get('ModernPreviewDetail').dispatch('change');
  nodes.get('ModernGeometryBackend').value='webgl2';nodes.get('ModernGeometryBackend').dispatch('change');
  nodes.get('ModernCameraMoveSpeed').value='100';nodes.get('ModernCameraMoveSpeed').dispatch('change');
  const saved=h.storage.get(preferences.STORAGE_KEY);
  assert.deepEqual(JSON.parse(saved),{
    version:1,opticalQuality:'auto',previewDetail:'8',geometryBackend:'webgl2',
    navigation:{speed:100,turnRate:1,wheelStep:'auto'}
  });
  const reopened=boot(null,{[preferences.STORAGE_KEY]:saved});
  assert.equal(reopened.app.getOpticalQuality(),'auto');
  assert.equal(reopened.app.getGeometryBackend(),'webgl2');
  assert.equal(reopened.nodes.get('ModernPreviewDetail').value,'8');
  assert.equal(reopened.nodes.get('ModernOpticalQuality').value,'auto');
  assert.equal(reopened.nodes.get('ModernGeometryBackend').value,'webgl2');
  assert.equal(reopened.nodes.get('ModernCameraMoveSpeed').value,'100');
  assert.equal(reopened.app.getEffectiveOpticalQuality(),'accurate','Auto is Accurate at rest on reload');
  assert.ok(!JSON.stringify(experiment([])).includes('opticalQuality'));
  assert.equal(reopened.storage.has(codec.STORAGE_KEY),false);
});

test('reset application preferences also clears migrated navigation settings without erasing experiments',()=>{
  const h=boot(experiment([]),{[preferences.LEGACY_NAVIGATION_KEY]:JSON.stringify({speed:1000,turnRate:5,wheelStep:10})});
  assert.equal(h.app.getNavigationPrefs().speed,1000,'old camera settings migrate when new preferences do not exist');
  h.nodes.get('ModernOpticalQuality').value='fast';h.nodes.get('ModernOpticalQuality').dispatch('change');
  assert.ok(h.storage.has(preferences.STORAGE_KEY));
  h.nodes.get('ModernResetPreferences').dispatch('click');
  assert.equal(h.storage.has(preferences.STORAGE_KEY),false);
  assert.equal(h.storage.has(preferences.LEGACY_NAVIGATION_KEY),false);
  assert.equal(h.storage.has(codec.STORAGE_KEY),true,'reset must not clear experiment storage');
  assert.equal(h.app.getOpticalQuality(),'accurate');
  assert.equal(h.app.getGeometryBackend(),'canvas');
  assert.equal(h.app.getNavigationPrefs().speed,10);
  assert.equal(h.nodes.get('ModernCameraMoveSpeed').value,'10');
  assert.equal(h.nodes.get('ModernPreviewDetail').value,'auto');
  const reopened=boot(null,Object.fromEntries(h.storage));
  assert.equal(reopened.app.getNavigationPrefs().speed,10);
  assert.equal(reopened.app.getOpticalQuality(),'accurate');
});

test('app preferences override old camera preference key and experiment restoration stays independent',()=>{
  const sample=experiment([]);
  const prefs=preferences.normalize({opticalQuality:'fast',previewDetail:'16',geometryBackend:'canvas',
    navigation:{speed:1,turnRate:.2,wheelStep:100}});
  const h=boot(sample,{[preferences.STORAGE_KEY]:JSON.stringify(prefs),
    [preferences.LEGACY_NAVIGATION_KEY]:JSON.stringify({speed:10000})});
  assert.equal(h.app.getOpticalQuality(),'fast');
  assert.equal(h.app.getNavigationPrefs().speed,1);
  assert.equal(h.nodes.get('ModernPreviewDetail').value,'16');
  assert.equal(h.app.getMode(),'compare');
  assert.equal(h.app.getModel().Height,15);
});
