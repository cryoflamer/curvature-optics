'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const shimmer=require('../src/ui/modern/ModernAtmosphericShimmer');
const visibility=require('../src/renderers/CurvatureAtmosphericVisibility');
const sceneState=require('../src/ui/modern/ModernSceneState');
const compareState=require('../src/ui/modern/ModernCompareState');
const compareModel=require('../src/ui/modern/ModernCompareModel');
const curvature=require('../src/app/CurvaturePhysicalCurvature');
const html=read('CurvatureModern.html');

function boot(){
  const nodes=new Map();
  for(const [,id] of html.matchAll(/id="([^"]+)"/g)){
    assert.ok(!nodes.has(id),'duplicate id '+id);
    nodes.set(id,{id,value:'',checked:false,disabled:false,hidden:false,
      textContent:'',attributes:{},listeners:{},tabIndex:0,
      classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},
      getAttribute(k){return this.attributes[k]||null;},
      addEventListener(event,fn){(this.listeners[event]||=[]).push(fn);},
      dispatch(event){for(const fn of this.listeners[event]||[])fn.call(this,{key:'',preventDefault(){}});},
      querySelector(){return null;},querySelectorAll(){return [];},
      closest(){return {hidden:false};},focus(){}});
  }
  for(const n of ['ModernObjectFields0','ModernObjectFields1']){
    const list=[],group=Number(n.at(-1));nodes.get(n).querySelectorAll=()=>list;
    for(const key of Object.keys(sceneState.OBJECT)){
      const original=nodes.get(n);
      const field={...original,id:`ModernObject${group}${key}`,listeners:{},
        attributes:{'data-group':String(group),'data-field':key},
        tagName:['ObjType','ObjSideType','ObjSizeType'].includes(key)?'SELECT':'INPUT'};
      nodes.set(field.id,field);list.push(field);
    }
  }
  nodes.get('ModernPreset').value='pontchartrain';
  nodes.get('ModernCameraAim').value='3';
  nodes.get('ModernCompareHorizon').checked=true;
  const registered=[],frameTasks=new Map();let counter=0,physics=0,shimmerFrames=0;const renderOptions=[];
  const presentation={
    enabled(name){return !!this.active[name];},active:{Scene:false,A:false,B:false},
    captured:{Scene:false,A:false,B:false},
    setEnabled(name,enabled){if(this.active[name]===enabled)return false;
      this.active[name]=enabled;this.captured[name]=false;return true;},
    capture(name,g){if(this.active[name])this.captured[name]=true;return g;},
    ready(name){return this.active[name]&&this.captured[name];},
    frame(){shimmerFrames++;return true;},suspend(){},resume(){}
  };
  function Model(){Object.assign(this,{Height:15,FocalLengthField:2000,Pan:0.0464,Nick:0.0121,
    Roll:0,rEarth:6371000,showModel:1,viewcenterHorizon:3,deviceRatio:1.5,showGrid:1,
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSideType:[0,0],ObjSidePos:[35,25.4],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0],
    Update(){this.ViewAngle=1.2375;this.camViewAngle=.0216;this.FocalLength=this.FocalLengthField;}});}
  const window={CurveAppClass:Model,CurvatureModernSceneState:sceneState,
    CurvatureModernCompareModel:compareModel,CurvatureModernCompareState:compareState,
    CurvaturePhysicalCurvature:curvature,
    CurvaturePhysicalSceneOptics:{create(){return {};}},
    CurvatureModernAtmosphericShimmer:shimmer,CurvatureAtmosphericVisibility:visibility,
    CurvatureModernAtmosphericPresentation:{create(){return presentation;}},
    CurvatureMainCanvasRenderer:{renderPhysical(_graph,_model,options){physics++;renderOptions.push(options);
      return {drawn:12,fillTriangles:6,unresolved:0};}},
    NewGraphX3D(spec){return {Canvas:{},UpdateCanvasSize(){},Redraw(){spec.DrawFunc({Canvas:{}});}};},
    xOnLoad(fn){registered.push(fn);},
    console:{error(error){throw error;}}};
  const document={hidden:false,getElementById(id){return nodes.get(id)||null;},
    querySelector(){return null;},createElement(){return {setAttribute(){},addEventListener(){}};},
    addEventListener(){},documentElement:{}};
  const context={window,document,console,
    requestAnimationFrame(fn){const id=++counter;frameTasks.set(id,fn);return id;},
    cancelAnimationFrame(id){frameTasks.delete(id);},
    setTimeout(){return 777;},clearTimeout(){}};
  window.window=window;
  vm.runInNewContext(read('src/ui/modern/ModernApp.js'),context);
  const app=window.CurvatureModernApp;
  for(const side of ['A','B'])app.registerCompareGraph(side,{UpdateCanvasSize(){},
    Redraw(){app.drawCompare(side,{Canvas:{}});}});
  registered[0]();
  function flushAt(timestamp){const batch=[...frameTasks.values()];frameTasks.clear();
    batch.forEach(fn=>fn(timestamp));}
  function flush(){flushAt(1000+counter*16);}
  flush();
  return {nodes,app,presentation,flush,flushAt,renderOptions,
    get physics(){return physics;},get shimmerFrames(){return shimmerFrames;},
    get pendingFrames(){return frameTasks.size;}};
}

test('138.3: separate accessible Atmosphere controls for Scene and selected Compare model',()=>{
  for(const group of ['Scene','Compare']){
    for(const key of ['Enabled','Intensity','Scale','Drift','Pause','Options']){
      assert.match(html,new RegExp('id="ModernShimmer'+group+key+'"'));
    }
  }
  assert.match(html,/visual approximation, not Cₙ²-calibrated/);
  assert.match(read('src/ui/modern/ModernApp.css'),/modern-shimmer-switch input\[type=checkbox\]/);
  assert.match(html,/ModernApp\.css\?v=(?:138\.3|140\.1)/);
});

test('138.3: toggling captures once; range updates and Pause/Resume never rerender physics',()=>{
  const t=boot(),n=t.nodes,s=t.app.getAtmosphericShimmer();
  assert.equal(t.presentation.enabled('Scene'),false);
  const initial=t.physics;
  n.get('ModernShimmerSceneEnabled').checked=true;
  n.get('ModernShimmerSceneEnabled').dispatch('change');
  t.flush();
  assert.equal(t.physics,initial+1,'one cached redraw separates source from captions');
  assert.equal(t.presentation.ready('Scene'),true);
  const before=t.physics;
  const intensity=n.get('ModernShimmerSceneIntensity');
  intensity.value='12';intensity.dispatch('input');
  const scale=n.get('ModernShimmerSceneScale');scale.value='60';scale.dispatch('input');
  const drift=n.get('ModernShimmerSceneDrift');drift.value='25';drift.dispatch('input');
  assert.deepEqual(s.getSettings('Scene'),{intensity:12,scale:60,drift:25,seed:0});
  assert.equal(n.get('ModernShimmerSceneIntensityValue').textContent,'12 px');
  assert.equal(t.physics,before,'UI sliders do not call redraw');
  t.flush();assert.ok(t.shimmerFrames>0);
  const pause=n.get('ModernShimmerScenePause');pause.dispatch('click');
  assert.equal(pause.textContent,'Resume animation');
  const pausedFrames=t.shimmerFrames;
  t.flush();assert.equal(t.shimmerFrames,pausedFrames,'paused animation schedules no more frames');
  assert.equal(t.pendingFrames,0);
  pause.dispatch('click');t.flush();
  assert.ok(t.shimmerFrames>pausedFrames,'resume restarts GPU frames');
  assert.equal(t.physics,before,'Pause/Resume do not touch optics');
  n.get('ModernShimmerSceneEnabled').checked=false;
  n.get('ModernShimmerSceneEnabled').dispatch('change');t.flush();
  assert.equal(t.presentation.enabled('Scene'),false);
  assert.equal(t.pendingFrames,0,'OFF leaves no active animation frame');
});

test('138.3: Compare model A and B settings and pause states remain independent',()=>{
  const t=boot(),n=t.nodes,s=t.app.getAtmosphericShimmer();
  n.get('ModernCompareTab').dispatch('click');t.flush();
  assert.equal(n.get('ModernShimmerCompareTarget').textContent,'model A');
  n.get('ModernShimmerCompareEnabled').checked=true;n.get('ModernShimmerCompareEnabled').dispatch('change');t.flush();
  n.get('ModernShimmerCompareIntensity').value='9';n.get('ModernShimmerCompareIntensity').dispatch('input');
  n.get('ModernShimmerComparePause').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  assert.equal(n.get('ModernShimmerCompareTarget').textContent,'model B');
  assert.equal(n.get('ModernShimmerCompareEnabled').checked,false);
  assert.equal(n.get('ModernShimmerCompareIntensity').value,'3');
  n.get('ModernShimmerCompareEnabled').checked=true;n.get('ModernShimmerCompareEnabled').dispatch('change');t.flush();
  n.get('ModernShimmerCompareScale').value='110';n.get('ModernShimmerCompareScale').dispatch('input');
  assert.equal(s.getSettings('A').intensity,9);
  assert.equal(s.getSettings('B').intensity,3);
  assert.equal(s.getSettings('B').scale,110);
  n.get('ModernModelTabA').dispatch('click');
  assert.equal(n.get('ModernShimmerCompareIntensity').value,'9');
  assert.equal(n.get('ModernShimmerComparePause').textContent,'Resume animation');
  n.get('ModernModelTabB').dispatch('click');
  assert.equal(n.get('ModernShimmerComparePause').textContent,'Pause animation');
  assert.equal(t.presentation.enabled('Scene'),false);
});

function fakeGpu(){
  const calls=[],gl={VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,
    LINK_STATUS:35714,ARRAY_BUFFER:34962,STATIC_DRAW:35044,FLOAT:5126,
    TEXTURE0:33984,TEXTURE_2D:3553,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,
    LINEAR:9729,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,CLAMP_TO_EDGE:33071,
    UNPACK_FLIP_Y_WEBGL:37440,RGBA:6408,UNSIGNED_BYTE:5121,TRIANGLE_STRIP:5,NO_ERROR:0};
  for(const method of ['shaderSource','compileShader','deleteShader','attachShader','linkProgram',
    'deleteTexture','deleteBuffer','deleteProgram','useProgram','bindBuffer','bufferData',
    'enableVertexAttribArray','vertexAttribPointer','activeTexture','bindTexture',
    'texParameteri','pixelStorei','uniform1i','texImage2D','viewport','uniform2f',
    'uniform1f','drawArrays'])gl[method]=function(...args){calls.push([method,...args]);};
  for(const method of ['createShader','createProgram','createBuffer','createTexture'])
    gl[method]=()=>({});
  gl.getShaderParameter=()=>true;gl.getProgramParameter=()=>true;
  gl.getAttribLocation=()=>0;gl.getUniformLocation=(_p,name)=>name;gl.getError=()=>0;
  return {calls,target:{width:800,height:400,offsetWidth:400,
    getContext(){return gl;},addEventListener(){}}};
}
function uniformCalls(gpu,key){return gpu.calls.filter(call=>call[0]==='uniform1f'&&call[1]===key).map(call=>call[2]);}
test('138.3: independent shader uniforms, resumable phase, no texture uploads on slider edits',()=>{
  const a=fakeGpu(),b=fakeGpu(),effect=shimmer.create();
  const source={width:800,height:400,offsetWidth:400};
  effect.configure({intensity:12,scale:35,drift:25},'A');
  effect.configure({intensity:2,scale:60,drift:5},'B');
  effect.present(source,a.target,'A',{capture:true});
  effect.present(source,b.target,'B',{capture:true});
  effect.present(source,a.target,'A',{timeMs:1000});
  effect.present(source,a.target,'A',{timeMs:1032});
  effect.present(source,b.target,'B',{timeMs:1000});
  effect.present(source,b.target,'B',{timeMs:1032});
  assert.equal(effect.getStats('A').effectiveIntensity,5.6000000000000005);
  assert.equal(effect.getStats('B').effectiveIntensity,2);
  assert.equal(uniformCalls(a,'uScale').at(-1),70);
  assert.equal(uniformCalls(b,'uScale').at(-1),120);
  assert.ok(Math.abs(uniformCalls(a,'uTime').at(-1)-0.032)<1e-9);
  effect.resetClock('A');
  effect.present(source,a.target,'A',{timeMs:9000});
  assert.ok(Math.abs(uniformCalls(a,'uTime').at(-1)-0.032)<1e-9,
    'first resumed frame retains its previous phase');
  effect.present(source,a.target,'A',{timeMs:9016});
  assert.ok(Math.abs(uniformCalls(a,'uTime').at(-1)-0.048)<1e-9);
  effect.configure({intensity:4},'B');
  effect.present(source,b.target,'B',{});
  assert.equal(effect.getSettings('A').intensity,12);
  assert.equal(effect.getSettings('B').intensity,4);
  assert.equal(a.calls.filter(call=>call[0]==='texImage2D').length,1);
  assert.equal(b.calls.filter(call=>call[0]==='texImage2D').length,1);
  assert.deepEqual(effect.getSettings(),{intensity:3,scale:54,drift:18,seed:0});
  assert.throws(()=>effect.configure({intensity:4},'C'),/Unknown shimmer viewport/);
});


test('138.4: static settings stop GPU animation; changing settings previews once and resumes',()=>{
  const t=boot(),n=t.nodes;
  n.get('ModernShimmerSceneEnabled').checked=true;
  n.get('ModernShimmerSceneEnabled').dispatch('change');t.flush();
  assert.equal(t.pendingFrames,1,'an animated viewport requests one next RAF');
  const intensity=n.get('ModernShimmerSceneIntensity');
  intensity.value='0';intensity.dispatch('input');
  assert.equal(t.pendingFrames,0,'zero strength must cancel the ongoing loop');
  const staticFrames=t.shimmerFrames;
  t.flush();assert.equal(t.shimmerFrames,staticFrames);
  intensity.value='8';intensity.dispatch('input');
  assert.equal(t.pendingFrames,1,'nonzero intensity restarts the animation');
  t.flush();assert.ok(t.shimmerFrames>staticFrames);
  const drift=n.get('ModernShimmerSceneDrift');
  drift.value='0';drift.dispatch('input');
  assert.equal(t.pendingFrames,0,'frozen drift requires no repeated GPU work');
  const frozenFrames=t.shimmerFrames;
  t.flush();assert.equal(t.shimmerFrames,frozenFrames);
  drift.value='20';drift.dispatch('input');
  assert.equal(t.pendingFrames,1);
  t.flush();assert.ok(t.shimmerFrames>frozenFrames);
});

test('138.4: Scene 60Hz and Compare 30Hz GPU draw caps leave physical optics unchanged',()=>{
  const t=boot(),n=t.nodes;
  n.get('ModernShimmerSceneEnabled').checked=true;
  n.get('ModernShimmerSceneEnabled').dispatch('change');t.flushAt(1000);
  t.flushAt(1008); // the first frame after physical capture initializes the cadence
  const sceneBase=t.shimmerFrames;
  t.flushAt(1016);assert.equal(t.shimmerFrames,sceneBase,'8ms is faster than 60Hz');
  t.flushAt(1025);assert.equal(t.shimmerFrames,sceneBase+1,'17ms allows next scene frame');
  n.get('ModernCompareTab').dispatch('click');t.flushAt(2000);
  n.get('ModernShimmerCompareEnabled').checked=true;
  n.get('ModernShimmerCompareEnabled').dispatch('change');t.flushAt(2016);
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernShimmerCompareEnabled').checked=true;
  n.get('ModernShimmerCompareEnabled').dispatch('change');t.flushAt(2032);
  const optics=t.physics;
  const before=t.shimmerFrames;
  t.flushAt(3000);
  assert.equal(t.shimmerFrames,before+2,'both views draw on the first eligible Compare frame');
  t.flushAt(3016);
  assert.equal(t.shimmerFrames,before+2,'two GPU draws are skipped on a 16ms interval');
  t.flushAt(3033);
  assert.equal(t.shimmerFrames,before+4,'both draw again at 33ms');
  assert.equal(t.physics,optics,'the GPU scheduler never retraces physical rays');
});

test('Atmospheric extinction controls retain independent Scene and Compare A/B ranges',()=>{
  const t=boot(),n=t.nodes;
  for(const prefix of ['ModernVisibility','ModernModelVisibility']){
    for(const suffix of ['Enabled','Range','Options'])assert.ok(n.has(prefix+suffix),prefix+suffix);
  }
  assert.equal(n.get('ModernVisibilityEnabled').checked,false,'default remains unchanged');
  const sceneOn=n.get('ModernVisibilityEnabled');sceneOn.checked=true;sceneOn.dispatch('change');t.flush();
  assert.equal(n.get('ModernVisibilityOptions').hidden,false);
  assert.equal(t.renderOptions.at(-1).visibility.enabled,true);
  const range=n.get('ModernVisibilityRange');range.value='25';range.dispatch('change');t.flush();
  assert.equal(t.renderOptions.at(-1).visibility.rangeKm,25);
  range.value='0';range.dispatch('change');
  assert.equal(range.value,'25','invalid edit restores the accepted range');
  n.get('ModernCompareTab').dispatch('click');t.flush();
  assert.equal(n.get('ModernModelVisibilityEnabled').checked,false);
  const compareOn=n.get('ModernModelVisibilityEnabled');compareOn.checked=true;compareOn.dispatch('change');t.flush();
  const compareRange=n.get('ModernModelVisibilityRange');compareRange.value='12';compareRange.dispatch('change');t.flush();
  assert.equal(t.app.getCompareConfig().A.visibility.rangeKm,12);
  assert.equal(t.app.getCompareConfig().A.visibility.enabled,true);
  n.get('ModernModelTabB').dispatch('click');
  assert.equal(n.get('ModernModelVisibilityEnabled').checked,false);
  assert.equal(n.get('ModernModelVisibilityRange').value,'60');
  n.get('ModernModelVisibilityEnabled').checked=true;n.get('ModernModelVisibilityEnabled').dispatch('change');t.flush();
  const config=t.app.getCompareConfig();
  assert.equal(config.A.visibility.rangeKm,12);
  assert.equal(config.B.visibility.rangeKm,60);
  assert.equal(t.renderOptions.at(-1).visibility.rangeKm,60);
  n.get('ModernModelTabA').dispatch('click');
  assert.equal(n.get('ModernModelVisibilityRange').value,'12');
  n.get('ModernSceneTab').dispatch('click');
  assert.equal(n.get('ModernVisibilityRange').value,'25');
});
