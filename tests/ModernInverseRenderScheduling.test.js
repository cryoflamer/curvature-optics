'use strict';
// Inverse slider edits must be light drafts. Physical A/B redraws are isolated
// and explicit shared edits must still invalidate both viewports.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const compare=require('../src/ui/modern/ModernCompareState');
const modelAdapter=require('../src/ui/modern/ModernCompareModel');
const scene=require('../src/ui/modern/ModernSceneState');
const tracer=require('../src/optics/OpticalRayTracer');

function boot(delayedFrames=false){
  const nodes=new Map(),renders=[];
  for(const id of [...read('CurvatureModern.html').matchAll(/id="([^"]+)"/g)].map(m=>m[1])){
    const el={id,hidden:false,value:'',checked:false,disabled:false,textContent:'',
      attributes:{},listeners:{},tabIndex:0,
      classList:{toggle(){},add(){},remove(){}},
      addEventListener(ev,fn){(this.listeners[ev]??=[]).push(fn);},
      dispatch(ev,detail={}){for(const fn of this.listeners[ev]||[])fn.call(this,{key:'',...detail,preventDefault(){}});},
      setAttribute(name,value){this.attributes[name]=value;},
      getAttribute(name){return this.attributes[name]??null;},
      closest(){return {hidden:false};},
      querySelector(){return null;},querySelectorAll(){return [];},
      focus(){},parentElement:null};
    el.parentElement=el;
    nodes.set(id,el);
  }
  for(let group=0;group<2;group++){
    const container=nodes.get('ModernObjectFields'+group),fields=[];
    for(const name of Object.keys(scene.OBJECT)){
      const node={...container,id:`Object${group}${name}`,listeners:{},attributes:{'data-group':String(group),'data-field':name},
        getAttribute(k){return this.attributes[k]??null;},
        addEventListener(ev,fn){(this.listeners[ev]??=[]).push(fn);},
        dispatch(ev){for(const fn of this.listeners[ev]||[])fn.call(this);},
        tagName:['ObjType','ObjSideType','ObjSizeType'].includes(name)?'SELECT':'INPUT'};
      fields.push(node);
    }
    container.querySelectorAll=()=>fields;
  }
  nodes.get('ModernPreset').value='pontchartrain';
  nodes.get('ModernCameraAim').value='3';
  nodes.get('ModernCompareHorizon').checked=false;
  let seq=0;
  const timers=new Map(),frames=new Map(),onLoad=[];
  function Model(){Object.assign(this,{Height:15,FocalLengthField:2000,Pan:0.0464,Nick:.0121,Roll:0,
    showModel:1,rEarth:6371000,viewcenterHorizon:3,deviceRatio:1.5,showGrid:1,
    NObjects:[85,2],ObjType:[3,3],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSideType:[0,0],ObjSidePos:[35,25.4],ObjSideVar:[0,0],
    ObjSizeType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],
    Update(){this.ViewAngle=1.2375;this.camViewAngle=.0216;this.FocalLength=this.FocalLengthField;}});}
  const window={CurveAppClass:Model,CurvatureModernSceneState:scene,
    CurvatureModernCompareState:compare,CurvatureModernCompareModel:modelAdapter,
    CurvatureRayTracer:tracer,
    CurvaturePhysicalSceneOptics:{create(){return {}; }},
    CurvaturePhysicalCurvature:require('../src/app/CurvaturePhysicalCurvature'),
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,opts){renders.push({side:g.side||'Scene',
      atmosphere:opts.atmosphere,weight:opts.inverseProfile.weight});
      return {drawn:12,fillTriangles:6,unresolved:0,cacheReused:false,
        timings:{opticsMs:7,canvasMs:3}};}},
    NewGraphX3D(spec){return {UpdateCanvasSize(){},Redraw(){spec.DrawFunc({side:'Scene'});}};},
    xOnLoad(fn){onLoad.push(fn);},console:{error(err){throw err;}}};
  window.window=window;
  const context={window,document:{
    getElementById(id){return nodes.get(id)||null;},querySelector(){return null;},
    createElement(){return {setAttribute(){},addEventListener(){}};}
  },requestAnimationFrame(fn){const id=++seq;if(delayedFrames)frames.set(id,fn);else fn();return id;},
    cancelAnimationFrame(id){frames.delete(id);},
    setTimeout(fn){const id=++seq;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},console};
  vm.runInNewContext(read('src/ui/modern/ModernApp.js'),context);
  const app=window.CurvatureModernApp;
  for(const side of ['A','B'])app.registerCompareGraph(side,{UpdateCanvasSize(){},
    Redraw(){app.drawCompare(side,{side});}});
  onLoad[0]();
  function flush(queue){const work=[...queue.values()];queue.clear();for(const fn of work)fn();}
  return {nodes,renders,app,flushTimers:()=>flush(timers),flushFrames:()=>flush(frames),
    pendingTimers:()=>timers.size};
}

test('inverse drag updates thermodynamic preview but traces only selected Compare model once on release',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernModelAtmosphere').value='inverse-temperature';
  n.get('ModernModelAtmosphere').dispatch('change');
  const before=h.renders.length;
  const slider=n.get('ModernInverseCompareWeight');
  slider.value='37';slider.dispatch('input');
  slider.value='69';slider.dispatch('input');
  assert.equal(h.renders.length,before,'draft must not invoke the physical renderer');
  assert.match(n.get('ModernInverseCompareStatus').textContent,/Preview — release slider/);
  assert.match(n.get('ModernInverseCompareWeightValue').textContent,/69/);
  assert.ok(Number(n.get('ModernInverseCompareGradient').value)<-100);
  assert.equal(h.app.getCompareConfig().B.inverseProfile.weight,0,'draft is not persisted as physics');
  slider.dispatch('pointerup');
  assert.equal(h.renders.length,before+1);
  assert.equal(h.renders.at(-1).side,'B');
  assert.equal(h.renders.at(-1).weight,.69);
  assert.equal(h.app.getCompareConfig().B.inverseProfile.weight,.69);
  assert.equal(h.app.getCompareConfig().A.inverseProfile.weight,0);
  assert.match(n.get('ModernComputeTiming').textContent,/Model A unchanged/);
  assert.doesNotMatch(n.get('ModernInverseCompareStatus').textContent,/Preview/);
  slider.dispatch('change');h.flushTimers();
  assert.equal(h.renders.length,before+1,'pointerup followed by change must not trace again');
});

test('keyboard changes coalesce, and shared camera input still redraws A and B',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernModelAtmosphere').value='inverse-temperature';
  n.get('ModernModelAtmosphere').dispatch('change');
  const before=h.renders.length,slider=n.get('ModernInverseCompareWeight');
  for(const value of [10,25,50]){slider.value=String(value);slider.dispatch('input');slider.dispatch('change');}
  assert.equal(h.renders.length,before);
  h.flushTimers();
  assert.equal(h.renders.length,before+1);
  assert.equal(h.renders.at(-1).weight,.5);
  assert.equal(h.renders.at(-1).side,'B');
  const camera=n.get('ModernHeight');camera.value='40';camera.dispatch('change');
  assert.deepEqual(h.renders.slice(-2).map(r=>r.side),['A','B']);
});

test('pending shared redraw is never replaced by an isolated B redraw',()=>{
  const h=boot(true),n=h.nodes;
  h.flushFrames();
  n.get('ModernCompareTab').dispatch('click');h.flushFrames();
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernModelAtmosphere').value='inverse-temperature';
  n.get('ModernModelAtmosphere').dispatch('change');h.flushFrames();
  const start=h.renders.length;
  const camera=n.get('ModernHeight');camera.value='40';camera.dispatch('change');
  const slider=n.get('ModernInverseCompareWeight');slider.value='50';slider.dispatch('input');slider.dispatch('pointerup');
  h.flushFrames();
  assert.deepEqual(h.renders.slice(start).map(r=>r.side),['A','B']);
  assert.equal(h.renders.at(-1).weight,.5);
});

test('editing inverse A redraws A only and preserves the completed B frame',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernModelAtmosphere').value='inverse-temperature';
  n.get('ModernModelAtmosphere').dispatch('change');
  const before=h.renders.length;
  const slider=n.get('ModernInverseCompareWeight');
  slider.value='35';slider.dispatch('input');slider.dispatch('pointerup');
  assert.deepEqual(h.renders.slice(before).map(r=>r.side),['A']);
  assert.match(n.get('ModernComputeTiming').textContent,/Model B unchanged/);
  assert.equal(h.app.getCompareConfig().A.inverseProfile.weight,.35);
  assert.equal(h.app.getCompareConfig().B.inverseProfile.weight,0);
});
