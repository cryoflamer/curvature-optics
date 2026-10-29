'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const interaction=require('../src/ui/modern/ModernCameraInteraction');
const compareModel=require('../src/ui/modern/ModernCompareModel');
const compareState=require('../src/ui/modern/ModernCompareState');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const camera={Pan:0.0464,Nick:0.0121,Roll:0};
function sample(override={}){
  return Object.assign({dx:80,dy:30,width:800,height:500,
    fovRadians:0.1,aspectRatio:1.5,camera},override);
}
function close(a,b){assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);}
test('137.1: grab-image mapping moves yaw left on rightward drag and pitch up on downward drag',()=>{
  const x=interaction.angles(sample({dy:0}));
  assert.ok(x.Pan<camera.Pan);close(x.Nick,camera.Nick);
  const y=interaction.angles(sample({dx:0}));
  close(y.Pan,camera.Pan);assert.ok(y.Nick>camera.Nick);
  const both=interaction.angles(sample());
  assert.ok(both.Pan<camera.Pan&&both.Nick>camera.Nick);
  const inverse=interaction.angles(sample({dx:-80,dy:-30}));
  close(both.Pan+inverse.Pan,2*camera.Pan);
  close(both.Nick+inverse.Nick,2*camera.Nick);
});
test('137.1: drag sensitivity follows diagonal FOV and viewport CSS dimensions',()=>{
  const normal=interaction.angles(sample());
  const zoom=interaction.angles(sample({fovRadians:0.01}));
  assert.ok(Math.abs(zoom.Pan-camera.Pan)<Math.abs(normal.Pan-camera.Pan)/9);
  const double=interaction.angles(sample({dx:160,dy:60,width:1600,height:1000}));
  close(normal.Pan,double.Pan);close(normal.Nick,double.Nick);
  const narrower=interaction.angles(sample({width:400,height:250}));
  assert.ok(Math.abs(narrower.Pan-camera.Pan)>Math.abs(normal.Pan-camera.Pan));
});
test('137.1: roll is preserved, screen motion rotates with the camera, limits are enforced',()=>{
  const rolled=interaction.angles(sample({camera:{Pan:0,Nick:0,Roll:90},dy:0}));
  close(rolled.Pan,0);assert.ok(rolled.Nick>0);close(rolled.Roll,90);
  const limits=interaction.angles(sample({camera:{Pan:359.99,Nick:89.99,Roll:0},dx:-1e7,dy:1e7}));
  assert.ok(limits.Pan<=360&&limits.Nick<=90);
  assert.throws(()=>interaction.angles(sample({fovRadians:0})),RangeError);
  assert.throws(()=>interaction.angles(sample({aspectRatio:0})),RangeError);
  const drag=interaction.create();
  assert.throws(()=>drag.begin({viewport:'A',x:1,y:1,width:200,height:100,
    camera,fovRadians:Math.PI}),RangeError);
  assert.equal(drag.isActive(),false);
});
function harness(options={}){
  const names=['ModernStatus','ModernCurvatureLabel','ModernViewInfo','ModernModePill',
    'ModernOcclusionWrap','ModernSceneTab','ModernCompareTab','ModernCompareMessage',
    'ModernGraphHost','ModernCompareViews','ModernBackToScene','ModernHeight','ModernFocal',
    'ModernPan','ModernNick','ModernOcclusion','ModernCameraAim','ModernAtmosphere',
    'ModernGrid','ModernCurvature','ModernEarth','ModernRender','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernPreset','ModernResetPreset','ModernObjectFields0',
    'ModernObjectFields1','ModernSceneTitle','ModernSceneDescription','ModernCompareLabelA',
    'ModernCompareLabelB','ModernCompareStatusA','ModernCompareStatusB',
    'ModernSceneSettings','ModernCompareSettings','ModernPairPreset','ModernModelTabA',
    'ModernModelTabB','ModernModelCurvature','ModernModelCurvatureLabel','ModernModelEarth',
    'ModernModelFlat','ModernModelRadius','ModernModelAtmosphere',
    'ModernModelOcclusionWrap','ModernModelOcclusion','ModernRecalculateCompare',
    'ModernCompareEyeLevel','ModernCompareHorizon'];
  const nodes=new Map(names.map(id=>[id,{id,value:'',min:'',max:'',checked:true,hidden:false,
    textContent:'',listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},
    setAttribute(){},closest(){return {set hidden(value){this.value=value;}};}}]));
  const draws=[],onloads=[],canvases={},graphs={};
  const frames=new Map();let frameId=0;
  function classes(){const set=new Set();return {add:value=>set.add(value),
    remove:value=>set.delete(value),contains:value=>set.has(value)};}
  function requestFrame(fn){const id=++frameId;
    if(options.deferred)frames.set(id,fn);else fn();return id;}
  function cancelFrame(id){frames.delete(id);}
  function makeCanvas(name,width=500,height=320){
    const host={appendChild(node){this.child=node;node.parentNode=this;}};
    const canvas={name,parentNode:host,listeners:{},classList:classes(),style:{transform:'',willChange:''},captures:new Set(),
      getBoundingClientRect(){return {width,height};},
      addEventListener(type,fn){this.listeners[type]=fn;},
      setPointerCapture(id){this.captures.add(id);},releasePointerCapture(id){this.captures.delete(id);},
      hasPointerCapture(id){return this.captures.has(id);},
      emit(type,data){const event=Object.assign({button:0,isPrimary:true,pointerId:1,clientX:40,
        clientY:70,preventDefault(){this.prevented=true;}},data);
        const fn=this.listeners[type];assert.ok(fn,`${name} handler ${type}`);fn(event);return event;}};
    canvases[name]=canvas;return canvas;
  }
  function Model(){Object.assign(this,{Height:15,FocalLengthField:2000,Pan:.0464,Nick:.0121,Roll:0,
    showModel:1,rEarth:6371000,viewcenterHorizon:3,deviceRatio:1.5,
    camViewAngle:0.1,showGrid:1,ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],
    ObjDeltaDist:[297.55,373],ObjSideType:[0,0],ObjSidePos:[35,25.4],ObjSideVar:[0,0],
    ObjSizeType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],
    Update(){this.updated=(this.updated||0)+1;}});}
  const window={CurveAppClass:Model,
    CurvatureModernSceneState:require('../src/ui/modern/ModernSceneState'),
    CurvatureModernCameraInteraction:interaction,
    CurvatureModernCameraDragPreview:require('../src/ui/modern/ModernCameraDragPreview'),
    CurvatureModernCameraPerspectiveWarp:options.perspective?require('../src/ui/modern/ModernCameraPerspectiveWarp'):null,
    CurvatureModernRenderProfiler:require('../src/ui/modern/ModernRenderProfiler'),
    CurvatureModernCompareModel:compareModel,CurvatureModernCompareState:compareState,
    CurvaturePhysicalSceneOptics:{create(){return {}; }},
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,opt){draws.push({g,m,opt});return {drawn:20,fillTriangles:10,unresolved:0};}},
    CurvaturePhysicalCurvature:require('../src/app/CurvaturePhysicalCurvature'),
    NewGraphX3D(params){const graph={Canvas:makeCanvas('Scene'),UpdateCanvasSize(){},
      Redraw(){params.DrawFunc({Canvas:graph.Canvas});}};graphs.Scene=graph;return graph;},
    xOnLoad(fn){onloads.push(fn);},console:{error(e){throw e;}}};
  const document={documentElement:{classList:classes()},getElementById(id){return nodes.get(id)||null;},
    createElement(){return {className:'',hidden:false,textContent:'',setAttribute(){}};}};
  const ctx={window,document,requestAnimationFrame:requestFrame,cancelAnimationFrame:cancelFrame,
    setTimeout(fn){fn();return 1;},clearTimeout(){},console};
  window.window=window;
  vm.runInNewContext(read('src/ui/modern/ModernApp.js'),ctx);
  const app=window.CurvatureModernApp;
  for(const name of ['A','B']){
    const graph={Canvas:makeCanvas(name,250,160),UpdateCanvasSize(){},
      Redraw(){app.drawCompare(name,{Canvas:graph.Canvas});}};
    graphs[name]=graph;app.registerCompareGraph(name,graph);
  }
  onloads[0]();
  return {app,window,nodes,draws,canvases,graphs,document,
    flush(){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());},
    get queuedFrames(){return frames.size;}};
}
test('137.1: Scene drag commits both axes once; no physical redraw on pointermove',()=>{
  const h=harness(),c=h.canvases.Scene,model=h.app.getModel();
  const initialDraws=h.draws.length,pan=model.Pan,nick=model.Nick;
  c.emit('pointerdown');assert.equal(h.app.getCameraInteraction().isActive(),true);
  c.emit('pointermove',{clientX:70,clientY:90});
  assert.equal(h.draws.length,initialDraws);
  assert.equal(model.Pan,pan,'camera remains unchanged before pointerup');
  assert.equal(c.parentNode.child.hidden,false);
  assert.match(c.parentNode.child.textContent,/Pan .*Nick/);
  c.emit('pointerup',{clientX:70,clientY:90});
  assert.equal(h.app.getCameraInteraction().isActive(),false);
  assert.equal(c.parentNode.child.hidden,true);
  assert.equal(c.captures.size,0);
  assert.equal(h.draws.length,initialDraws+1);
  assert.ok(model.Pan<pan&&model.Nick>nick);
  assert.equal(h.nodes.get('ModernPan').value,String(model.Pan));
  assert.equal(h.nodes.get('ModernNick').value,String(model.Nick));
  assert.equal(h.nodes.get('ModernPreset').value,'custom');
});
test('137.1: either Compare canvas commits shared camera and redraws A/B together',()=>{
  const h=harness(),a=h.canvases.A,b=h.canvases.B;
  h.nodes.get('ModernCompareTab').listeners.click();
  let before=h.draws.length;
  a.emit('pointerdown');a.emit('pointermove',{clientX:55,clientY:100});
  assert.equal(h.draws.length,before);
  a.emit('pointerup',{clientX:55,clientY:100});
  assert.equal(h.draws.length,before+2);
  assert.equal(h.draws.at(-2).m.Pan,h.draws.at(-1).m.Pan);
  assert.equal(h.draws.at(-2).m.Nick,h.draws.at(-1).m.Nick);
  before=h.draws.length;
  b.emit('pointerdown');b.emit('pointerup',{clientX:48,clientY:82});
  assert.equal(h.draws.length,before+2);
  assert.equal(h.draws.at(-2).m.Pan,h.draws.at(-1).m.Pan);
  assert.equal(h.draws.at(-2).m.Nick,h.draws.at(-1).m.Nick);
});
test('137.1: cancel, wrong pointer, small click, mode change and hidden canvas do not commit',()=>{
  const h=harness(),scene=h.canvases.Scene,a=h.canvases.A;
  let initial=h.draws.length;
  scene.emit('pointerdown');scene.emit('pointermove',{pointerId:7,clientX:200});
  assert.equal(scene.parentNode.child.hidden,true);
  scene.emit('pointercancel');assert.equal(h.draws.length,initial);
  scene.emit('pointerdown');scene.emit('pointerup',{clientX:41,clientY:70});
  assert.equal(h.draws.length,initial);
  h.nodes.get('ModernCompareTab').listeners.click();initial=h.draws.length;
  scene.emit('pointerdown');assert.equal(h.app.getCameraInteraction().isActive(),false);
  a.emit('pointerdown');a.emit('pointermove',{clientX:120,clientY:120});
  h.nodes.get('ModernSceneTab').listeners.click();
  assert.equal(h.app.getCameraInteraction().isActive(),false);
  initial=h.draws.length;
  a.emit('pointerup',{clientX:120,clientY:120});
  assert.equal(h.draws.length,initial);
});

test('137.2: Scene preview follows both axes without a redraw, then stays until final paint',()=>{
  const h=harness({deferred:true}),c=h.canvases.Scene;
  h.flush();const before=h.draws.length,pan=h.app.getModel().Pan;
  assert.equal(c.classList.contains('modern-camera-draggable'),true);
  c.emit('pointerdown');
  assert.equal(c.classList.contains('is-camera-dragging'),true);
  assert.equal(h.document.documentElement.classList.contains('modern-camera-dragging-global'),true);
  c.emit('pointermove',{clientX:100,clientY:105});
  assert.equal(h.draws.length,before);assert.equal(h.app.getModel().Pan,pan);
  h.flush();
  assert.equal(c.style.transform,'translate3d(60px, 35px, 0)');
  c.emit('pointerup',{clientX:110,clientY:110});
  assert.equal(c.style.transform,'translate3d(70px, 40px, 0)',
    'old image remains positioned until physical renderer completes');
  assert.equal(h.document.documentElement.classList.contains('modern-camera-dragging-global'),false);
  assert.equal(h.draws.length,before);
  h.flush();assert.equal(h.draws.length,before+1);
  assert.equal(c.style.transform,'');
  assert.equal(c.classList.contains('is-camera-dragging'),false);
});
test('137.2: Compare drag from B moves both canvases with shared normalized displacement',()=>{
  const h=harness({deferred:true});h.flush();
  h.nodes.get('ModernCompareTab').listeners.click();h.flush();
  const a=h.canvases.A,b=h.canvases.B;
  const before=h.draws.length;
  b.emit('pointerdown');b.emit('pointermove',{clientX:90,clientY:100});
  h.flush();
  assert.equal(a.style.transform,'translate3d(50px, 30px, 0)');
  assert.equal(b.style.transform,'translate3d(50px, 30px, 0)');
  assert.equal(h.draws.length,before);
  b.emit('pointerup',{clientX:90,clientY:100});
  assert.equal(b.style.transform,'translate3d(50px, 30px, 0)');
  h.flush();
  assert.equal(h.draws.length,before+2);
  assert.equal(a.style.transform,'');assert.equal(b.style.transform,'');
  assert.equal(h.draws.at(-1).m.Pan,h.draws.at(-2).m.Pan);
  assert.equal(h.draws.at(-1).m.Nick,h.draws.at(-2).m.Nick);
});
test('137.2: cancelled drag and mode changes restore pixels and cursor without commit',()=>{
  const h=harness({deferred:true});h.flush();
  const c=h.canvases.Scene,initial=h.draws.length;
  c.emit('pointerdown');c.emit('pointermove',{clientX:90,clientY:90});h.flush();
  c.emit('pointercancel');
  assert.equal(c.style.transform,'');
  assert.equal(h.document.documentElement.classList.contains('modern-camera-dragging-global'),false);
  assert.equal(h.draws.length,initial);
  c.emit('pointerdown');c.emit('pointermove',{clientX:100});h.flush();
  h.nodes.get('ModernCompareTab').listeners.click();
  assert.equal(c.style.transform,'');assert.equal(h.app.getCameraInteraction().isActive(),false);
  h.flush();
});

test('137.2: an unpainted committed frame is not cancelled by another immediate pointerdown',()=>{
  const h=harness({deferred:true}),c=h.canvases.Scene;h.flush();
  c.emit('pointerdown');c.emit('pointerup',{clientX:65,clientY:90});
  assert.equal(h.app.getCameraInteraction().isActive(),false);
  assert.match(c.style.transform,/translate3d/);
  c.emit('pointerdown');
  assert.equal(h.app.getCameraInteraction().isActive(),false,'a final frame must be allowed to paint first');
  h.flush();assert.equal(c.style.transform,'');
  c.emit('pointerdown');assert.equal(h.app.getCameraInteraction().isActive(),true);
  c.emit('pointercancel');
});

test('137.2.1: a middle click is suppressed on each camera Canvas without starting a gesture',()=>{
  const h=harness();
  for(const name of ['Scene','A','B']){
    const c=h.canvases[name];
    assert.match(c.style.cursor,/hand-open\.png/,name+' has a custom idle cursor without CSS');
    assert.equal(c.emit('mousedown',{button:1}).prevented,true);
    assert.equal(c.emit('pointerdown',{button:1}).prevented,true);
    assert.equal(c.emit('auxclick',{button:1}).prevented,true);
    assert.equal(c.emit('dragstart').prevented,true);
    assert.equal(c.emit('mousedown',{button:0}).prevented,undefined);
    assert.equal(h.app.getCameraInteraction().isActive(),false);
  }
  const scene=h.canvases.Scene;
  scene.emit('pointerdown');
  assert.match(scene.style.cursor,/hand-closed\.png/);
  scene.emit('pointercancel');
  assert.match(scene.style.cursor,/hand-open\.png/);
});


test('137.4: real ModernApp wiring perspective-warps both Compare images without optical redraw',()=>{
  const h=harness({deferred:true,perspective:true});h.flush();
  h.nodes.get('ModernCompareTab').listeners.click();h.flush();
  const a=h.canvases.A,b=h.canvases.B,before=h.draws.length;
  a.emit('pointerdown');a.emit('pointermove',{clientX:90,clientY:100});
  h.flush();
  assert.match(a.style.transform,/^matrix3d\(/);
  assert.match(b.style.transform,/^matrix3d\(/);
  assert.equal(a.style.transformOrigin,'0 0');
  assert.equal(h.draws.length,before);
  a.emit('pointerup',{clientX:90,clientY:100});
  assert.match(a.style.transform,/^matrix3d\(/);
  h.flush();
  assert.equal(h.draws.length,before+2);
  assert.equal(a.style.transform,'');assert.equal(b.style.transform,'');
  assert.equal(h.draws.at(-1).m.Pan,h.draws.at(-2).m.Pan);
  assert.equal(h.draws.at(-1).m.Nick,h.draws.at(-2).m.Nick);
});
test('137.4: Scene preview with roll restores prior raster orientation on pointercancel',()=>{
  const h=harness({deferred:true,perspective:true});h.flush();
  h.app.getModel().Roll=25;
  const c=h.canvases.Scene,before=h.draws.length;
  c.emit('pointerdown');c.emit('pointermove',{clientX:90,clientY:100});h.flush();
  assert.match(c.style.transform,/^matrix3d\(/);
  c.emit('pointercancel');
  assert.equal(c.style.transform,'');assert.equal(c.style.transformOrigin,'');
  assert.equal(h.draws.length,before);
});
