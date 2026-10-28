'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('CurvatureModern.html');
const adapter=require('../src/ui/modern/ModernSceneState');
const physics=require('../src/ui/modern/ModernCompareState');
const clone=require('../src/ui/modern/ModernCompareModel');
const curvature=require('../src/app/CurvaturePhysicalCurvature');

function boot(){
  const nodes=new Map();
  const found=Array.from(html.matchAll(/id="([^"]+)"/g),x=>x[1]);
  for(const id of found){
    const node={id,value:'',min:'',max:'',checked:false,hidden:false,disabled:false,
      textContent:'',tabIndex:0,listeners:{},attributes:{},classList:{toggle(){}},
      addEventListener(event,fn){(this.listeners[event]??=[]).push(fn);},
      dispatch(event,data={}){for(const fn of (this.listeners[event]||[]))fn.call(this,{key:'',preventDefault(){},...data});},
      setAttribute(k,v){this.attributes[k]=v;},
      getAttribute(k){return this.attributes[k]??null;},
      closest(){return this.parentPanel??{hidden:false};},
      querySelectorAll(){return [];},
      querySelector(){return null;},focus(){this.focused=true;}};
    nodes.set(id,node);
  }
  for(const id of ['ModernObjectFields0','ModernObjectFields1']){
    const fields=[];
    nodes.get(id).querySelectorAll=()=>fields;
    const group=Number(id.slice(-1));
    for(const key of Object.keys(adapter.OBJECT)){
      const field={...nodes.get(id),id:`ModernObject${group}${key}`,
        attributes:{'data-group':String(group),'data-field':key},listeners:{},
        getAttribute(k){return this.attributes[k]??null;},
        addEventListener(event,fn){(this.listeners[event]??=[]).push(fn);},
        dispatch(event){for(const fn of (this.listeners[event]||[]))fn.call(this);},
        tagName:['ObjType','ObjSideType','ObjSizeType'].includes(key)?'SELECT':'INPUT'};
      nodes.set(field.id,field);fields.push(field);
    }
  }
  // Inputs' types and values are read from the authored document where useful.
  nodes.get('ModernPreset').value='pontchartrain';
  nodes.get('ModernCameraAim').value='3';
  nodes.get('ModernModelTabA').attributes['aria-pressed']='true';
  nodes.get('ModernCompareHorizon').checked=true;
  let renderCount=0;
  const renders=[];
  const timers=new Map();
  let nextTimer=0;
  function Model(){Object.assign(this,{
    Height:15,FocalLengthField:2000,Pan:0.0464,Nick:0.0121,Roll:0,
    rEarth:6371000,showModel:1,viewcenterHorizon:3,deviceRatio:1.5,showGrid:1,
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSideType:[0,0],ObjSidePos:[35,25.4],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0],
    Update(){this.ViewAngle=1.2375;this.camViewAngle=.0216;this.FocalLength=this.FocalLengthField;}
  });}
  const callbacks=[];
  const window={CurveAppClass:Model,CurvatureModernSceneState:adapter,
    CurvatureModernCompareState:physics,CurvatureModernCompareModel:clone,
    CurvaturePhysicalSceneOptics:{create(){return {}}},
    CurvaturePhysicalCurvature:curvature,
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,options){renderCount++;
      renders.push({surface:m.showModel,radius:m.rEarth,options:{...options}});
      return {drawn:12,fillTriangles:6,unresolved:0};}},
    NewGraphX3D(spec){return {UpdateCanvasSize(){},Redraw(){spec.DrawFunc({})}}},
    xOnLoad(fn){callbacks.push(fn);},console:{error(e){throw e;}}};
  window.window=window;
  const document={getElementById(id){return nodes.get(id)||null;},
    querySelector(){return null;},createElement(){return {setAttribute(){},addEventListener(){}};}};
  vm.runInNewContext(read('src/ui/modern/ModernApp.js'),{
    window,document,console,requestAnimationFrame(fn){fn();return 1},
    cancelAnimationFrame(){},setTimeout(fn){const id=++nextTimer;timers.set(id,fn);return id},
    clearTimeout(id){timers.delete(id)}
  });
  const app=window.CurvatureModernApp;
  for(const side of ['A','B'])app.registerCompareGraph(side,{UpdateCanvasSize(){},
    Redraw(){app.drawCompare(side,{})}});
  callbacks[0]();
  return {nodes,app,renders,getRenderCount(){return renderCount;},
    flushTimers(){const scheduled=[...timers.values()];timers.clear();scheduled.forEach(fn=>fn());},
    pendingTimers(){return timers.size;}};
}

test('134.2: one set of Camera, Objects and Display controls; tab panels match mode',()=>{
  for(const id of ['ModernHeight','ModernNick','ModernObjectFields0','ModernObjectFields1','ModernGrid',
    'ModernSettingsCamera','ModernSettingsSurface','ModernSettingsAtmosphere','ModernSettingsObjects','ModernSettingsDisplay']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  const h=boot(),n=h.nodes;
  assert.equal(n.get('ModernPanelCamera').hidden,false);
  n.get('ModernSettingsSurface').dispatch('click');
  assert.equal(n.get('ModernPanelSurface').hidden,false);
  assert.equal(n.get('ModernComparePanelSurface').hidden,true);
  const before=h.getRenderCount();
  n.get('ModernCompareTab').dispatch('click');
  assert.equal(n.get('ModernPanelSurface').hidden,true);
  assert.equal(n.get('ModernComparePanelSurface').hidden,false);
  assert.equal(n.get('ModernSettingsSurface').attributes['aria-controls'],'ModernComparePanelSurface');
  assert.equal(n.get('ModernCompareSettings').hidden,false);
  assert.equal(n.get('ModernRender').hidden,true);
  assert.equal(n.get('ModernRecalculateCompare').hidden,false);
  assert.equal(h.getRenderCount(),before+2,'mode change renders each physical comparison');
  const rendered=h.getRenderCount();
  n.get('ModernSettingsAtmosphere').dispatch('click');
  assert.equal(n.get('ModernPanelAtmosphere').hidden,true);
  assert.equal(n.get('ModernComparePanelAtmosphere').hidden,false);
  n.get('ModernSettingsDisplay').dispatch('click');
  assert.equal(n.get('ModernCompareDisplayOptions').hidden,false);
  assert.equal(h.getRenderCount(),rendered,'tab changes must not retrace');
  n.get('ModernSceneTab').dispatch('click');
  assert.equal(n.get('ModernCompareSettings').hidden,true);
  assert.equal(n.get('ModernCompareDisplayOptions').hidden,false);
  assert.equal(n.get('ModernSettingsDisplay').attributes['aria-controls'],'ModernPanelDisplay');
});

test('134.2: shared camera, objects and grid edit both Compare models without changing A/B atmosphere',()=>{
  const {nodes:n,app}=boot();
  const m=app.getModel();
  n.get('ModernPairPreset').value='flat-inverse';
  n.get('ModernPairPreset').dispatch('change');
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernSettingsCamera').dispatch('click');
  const height=n.get('ModernHeight');height.value='45';height.dispatch('change');
  assert.equal(m.Height,45);
  assert.equal(app.getCompareModels().A.Height,45);
  assert.equal(app.getCompareModels().B.Height,45);
  assert.equal(n.get('ModernCameraAim').disabled,true);
  assert.equal(n.get('ModernCameraAim').value,'3');
  n.get('ModernSettingsObjects').dispatch('click');
  const distance=n.get('ModernObject0ObjDist');distance.value='1400';distance.dispatch('change');
  assert.equal(app.getCompareModels().A.ObjDist[0],1400);
  assert.equal(app.getCompareModels().B.ObjDist[0],1400);
  n.get('ModernSettingsDisplay').dispatch('click');
  n.get('ModernGrid').checked=false;n.get('ModernGrid').dispatch('change');
  assert.equal(app.getCompareModels().A.showGrid,0);
  assert.equal(app.getCompareModels().B.showGrid,0);
  assert.equal(app.getCompareConfig().A.atmosphere,'standard');
  assert.equal(app.getCompareConfig().B.atmosphere,'inverse-spherical');
  n.get('ModernSettingsAtmosphere').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernModelAtmosphere').value='exponential-occlusion';
  n.get('ModernModelAtmosphere').dispatch('change');
  assert.equal(app.getCompareConfig().A.atmosphere,'standard');
  assert.equal(app.getCompareConfig().B.atmosphere,'exponential-occlusion');
  n.get('ModernSceneTab').dispatch('click');
  assert.equal(n.get('ModernCameraAim').disabled,false);
  assert.equal(m.Height,45);
  assert.equal(m.ObjDist[0],1400);
});

test('134.2: keyboard settings navigation works in Compare and leaves optics untouched',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  const rendered=h.getRenderCount();
  n.get('ModernSettingsCamera').dispatch('keydown',{key:'ArrowRight'});
  assert.equal(n.get('ModernPanelSurface').hidden,true);
  assert.equal(n.get('ModernComparePanelSurface').hidden,false);
  assert.equal(n.get('ModernSettingsSurface').focused,true);
  n.get('ModernSettingsSurface').dispatch('keydown',{key:'End'});
  assert.equal(n.get('ModernPanelDisplay').hidden,false);
  assert.equal(h.getRenderCount(),rendered);
});


test('135: exponential scale radius edits use kilometres in Scene and Compare while preserving metres in model',()=>{
  const {nodes:n,app}=boot();
  assert.match(html,/for="ModernOcclusion">Refraction scale radius \(km\)/);
  assert.match(html,/for="ModernModelOcclusion">Refraction scale radius \(km\)/);
  n.get('ModernAtmosphere').value='exponential-occlusion';
  n.get('ModernAtmosphere').dispatch('change');
  assert.equal(n.get('ModernOcclusionWrap').hidden,false);
  assert.equal(n.get('ModernOcclusion').value,'6371');
  n.get('ModernOcclusion').value='8000.5';
  n.get('ModernOcclusion').dispatch('change');
  assert.equal(n.get('ModernOcclusion').value,'8000.5');
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernSettingsAtmosphere').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernModelAtmosphere').value='exponential-occlusion';
  n.get('ModernModelAtmosphere').dispatch('change');
  assert.equal(n.get('ModernModelOcclusionWrap').hidden,false);
  const originalA=app.getCompareConfig().A.occlusionRadius;
  n.get('ModernModelOcclusion').value='12345.25';
  n.get('ModernModelOcclusion').dispatch('change');
  assert.equal(app.getCompareConfig().B.occlusionRadius,12345250);
  assert.equal(app.getCompareConfig().A.occlusionRadius,originalA);
  assert.equal(n.get('ModernModelOcclusion').value,'12345.25');
  n.get('ModernModelTabA').dispatch('click');
  assert.equal(n.get('ModernModelOcclusion').value,String(originalA/1000));
  n.get('ModernModelTabB').dispatch('click');
  assert.equal(n.get('ModernModelOcclusion').value,'12345.25');
  n.get('ModernModelOcclusion').value='';
  n.get('ModernModelOcclusion').dispatch('change');
  assert.equal(app.getCompareConfig().B.occlusionRadius,12345250,'invalid edits are rejected');
});


test('135.1: Compare radius drafts never trace intermediate digits and commit to selected physical model',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernSettingsAtmosphere').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernModelAtmosphere').value='exponential-occlusion';
  n.get('ModernModelAtmosphere').dispatch('change');
  const count=h.getRenderCount(),prior=h.app.getCompareConfig().B.occlusionRadius;
  const field=n.get('ModernModelOcclusion');
  for(const value of ['1','10','100','10000']){
    field.value=value;field.dispatch('input');
    assert.equal(h.getRenderCount(),count,'typing '+value+' must not retrace');
    assert.equal(h.app.getCompareConfig().B.occlusionRadius,prior,'draft not committed');
    assert.equal(n.get('ModernModelOcclusionDraft').hidden,false);
  }
  field.dispatch('keydown',{key:'Enter'});
  assert.equal(n.get('ModernModelOcclusionDraft').hidden,true);
  assert.equal(h.app.getCompareConfig().B.occlusionRadius,1e7);
  assert.equal(h.getRenderCount(),count+2,'Enter commits exactly one A/B redraw');
  assert.equal(h.renders.at(-1).options.occlusionRadius,1e7,'renderer receives new B optical radius');
  assert.equal(h.renders.at(-2).options.occlusionRadius,prior,'A retains its old atmospheric radius');
  field.dispatch('change');
  assert.equal(h.getRenderCount(),count+2,'native change after Enter must not redraw twice');
  field.value='8000';field.dispatch('input');field.dispatch('change');
  assert.equal(h.app.getCompareConfig().B.occlusionRadius,8e6);
  assert.equal(h.renders.at(-1).options.occlusionRadius,8e6);
  assert.equal(h.getRenderCount(),count+4,'blur/change also commits');
});

test('135.1: flat surface reference radius is distinguished from atmospheric radius',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernSettingsSurface').dispatch('click');
  assert.equal(n.get('ModernModelRadiusWrap').hidden,true);
  const count=h.getRenderCount();
  const field=n.get('ModernModelRadius');
  field.value='63713';field.dispatch('input');
  assert.equal(h.getRenderCount(),count);
  assert.equal(n.get('ModernModelRadiusDraft').hidden,false);
  field.dispatch('change');
  assert.equal(h.app.getCompareConfig().B.radiusKm,63713);
  assert.equal(h.app.getCompareConfig().B.occlusionRadius,6371000,
    'changing the flat reference radius is not changing the optical atmosphere');
  assert.equal(h.getRenderCount(),count+2);
  n.get('ModernModelEarth').dispatch('click');
  assert.equal(n.get('ModernModelRadiusWrap').hidden,false);
});

test('135.1: Scene engineered radius is applied only after editing is finished',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernAtmosphere').value='exponential-occlusion';
  n.get('ModernAtmosphere').dispatch('change');
  const count=h.getRenderCount();
  const field=n.get('ModernOcclusion');
  for(const value of ['1','10','10000']){
    field.value=value;field.dispatch('input');
    assert.equal(h.getRenderCount(),count);
  }
  field.dispatch('keydown',{key:'Enter'});
  assert.equal(h.getRenderCount(),count+1);
  assert.equal(h.renders.at(-1).options.occlusionRadius,1e7);
  field.dispatch('change');
  assert.equal(h.getRenderCount(),count+1,'Enter followed by change is idempotent');
});


test('135.2: surface radius controls are hidden on flat models without losing their values',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernSettingsSurface').dispatch('click');
  assert.equal(n.get('ModernModelRadiusWrap').hidden,true);
  const old=h.app.getCompareConfig().B.radiusKm;
  n.get('ModernModelEarth').dispatch('click');
  assert.equal(n.get('ModernModelRadiusWrap').hidden,false);
  assert.equal(Number(n.get('ModernModelRadius').value),old);
  const field=n.get('ModernModelRadius');field.value='8000';field.dispatch('change');
  n.get('ModernModelFlat').dispatch('click');
  assert.equal(n.get('ModernModelRadiusWrap').hidden,true);
  assert.equal(h.app.getCompareConfig().B.radiusKm,8000);
  n.get('ModernModelEarth').dispatch('click');
  assert.equal(n.get('ModernModelRadiusWrap').hidden,false);
  assert.equal(Number(n.get('ModernModelRadius').value),6371,'Earth R resets the radius');
  n.get('ModernSceneTab').dispatch('click');
  n.get('ModernFlat').checked=true;n.get('ModernFlat').dispatch('change');
  for(const id of ['ModernSceneRadiusWrap','ModernSceneEarthWrap'])
    assert.equal(n.get(id).hidden,true,id+' hidden for exact flat');
  assert.equal(n.get('ModernSceneCurvatureWrap').hidden,false,'curvature slider remains available on flat');
  n.get('ModernFlat').checked=false;n.get('ModernFlat').dispatch('change');
  for(const id of ['ModernSceneCurvatureWrap','ModernSceneRadiusWrap','ModernSceneEarthWrap'])
    assert.equal(n.get(id).hidden,false,id+' visible for sphere');
});

test('135.3: logarithmic Compare curvature slider keeps exact flat endpoint and independent A/B',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernSettingsSurface').dispatch('click');
  assert.equal(Number(n.get('ModernModelCurvature').value),1000);
  assert.match(n.get('ModernModelCurvatureLabel').textContent,/Flat/);
  const before=h.getRenderCount();
  const slider=n.get('ModernModelCurvature');
  slider.value='500';slider.dispatch('input');
  assert.equal(h.getRenderCount(),before,'dragging should not trigger optical tracing');
  assert.equal(h.app.getCompareConfig().B.surface,'globe');
  assert.equal(h.app.getCompareConfig().A.radiusKm,6371);
  const radius=h.app.getCompareConfig().B.radiusKm;
  assert.ok(radius>100&&radius<1e13);
  slider.dispatch('change');
  assert.equal(h.getRenderCount(),before+2);
  assert.equal(Number(n.get('ModernModelRadius').value),radius);
  n.get('ModernModelFlat').dispatch('click');
  assert.equal(h.app.getCompareConfig().B.surface,'flat');
  assert.equal(h.app.getCompareConfig().B.radiusKm,radius,'flat preserves previous spherical radius');
  assert.equal(Number(slider.value),1000);
  n.get('ModernModelEarth').dispatch('click');
  assert.equal(h.app.getCompareConfig().B.surface,'globe');
  assert.equal(h.app.getCompareConfig().B.radiusKm,6371);
  assert.equal(h.app.getCompareConfig().A.surface,'globe');
});


test('135.4: Compare curvature remains visibly pending until pointer release and redraws exactly once',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  n.get('ModernSettingsSurface').dispatch('click');
  const slider=n.get('ModernModelCurvature'),before=h.getRenderCount();
  slider.value='164';slider.dispatch('input');
  assert.equal(h.app.getCompareConfig().B.surface,'globe');
  assert.equal(h.getRenderCount(),before,'dragging should not trace intermediate radii');
  assert.match(n.get('ModernCompareStatusB').textContent,/Pending curvature change/);
  assert.equal(h.pendingTimers(),1,'a missing change event has an idle fallback');
  slider.dispatch('pointerup');
  assert.equal(h.getRenderCount(),before+2,'release must render both Compare views');
  assert.equal(h.renders.at(-1).surface,1);
  assert.equal(h.renders.at(-1).radius,h.app.getCompareConfig().B.radiusKm*1000);
  assert.equal(h.renders.at(-2).radius,6371000,'A physics is independent');
  assert.doesNotMatch(n.get('ModernCompareStatusB').textContent,/Pending/);
  slider.dispatch('change');
  assert.equal(h.getRenderCount(),before+2,'pointerup plus change must not render twice');
  h.flushTimers();
  assert.equal(h.getRenderCount(),before+2,'stale idle callback must be canceled');
});

test('135.4: keyboard-only change and idle fallback both commit physical radius',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  const slider=n.get('ModernModelCurvature');
  const before=h.getRenderCount();
  // Range controls may emit a change without a preceding input event.
  slider.value='164';slider.dispatch('change');
  assert.equal(h.getRenderCount(),before+2);
  assert.equal(h.renders.at(-1).surface,1);
  // Some embedded/touch controls emit only input; the idle fallback commits.
  const after=h.getRenderCount();
  slider.value='500';slider.dispatch('input');
  assert.equal(h.getRenderCount(),after);
  h.flushTimers();
  assert.equal(h.getRenderCount(),after+2);
  assert.equal(h.renders.at(-1).radius,h.app.getCompareConfig().B.radiusKm*1000);
  assert.ok(h.renders.at(-1).radius>1e10,'physically different radius reaches the renderer');
  slider.dispatch('pointerup');
  assert.equal(h.getRenderCount(),after+2,'late pointer event cannot retrace');
});

test('135.4: switching selected model commits pending curvature without stale view',()=>{
  const h=boot(),n=h.nodes;
  n.get('ModernCompareTab').dispatch('click');
  n.get('ModernModelTabB').dispatch('click');
  const slider=n.get('ModernModelCurvature'),before=h.getRenderCount();
  slider.value='164';slider.dispatch('input');
  n.get('ModernModelTabA').dispatch('click');
  assert.equal(h.getRenderCount(),before+2);
  assert.equal(h.renders.at(-1).surface,1);
  assert.equal(h.app.getCompareConfig().A.radiusKm,6371);
  assert.equal(h.app.getCompareConfig().B.surface,'globe');
  h.flushTimers();
  assert.equal(h.getRenderCount(),before+2);
});

test('135.5: Display toggles remain visible and shared while Scene and Compare switch',()=>{
  const {nodes:n,app,getRenderCount}=boot();
  n.get('ModernSettingsDisplay').dispatch('click');
  assert.equal(n.get('ModernCompareDisplayOptions').hidden,false);
  assert.equal(n.get('ModernCompareEyeLevel').checked,false);
  assert.equal(n.get('ModernCompareHorizon').checked,true);
  let before=getRenderCount();
  n.get('ModernCompareEyeLevel').checked=true;
  n.get('ModernCompareEyeLevel').dispatch('change');
  assert.equal(getRenderCount(),before+1,'Scene redraws after eye-level toggle');
  n.get('ModernCompareHorizon').checked=false;
  n.get('ModernCompareHorizon').dispatch('change');
  assert.equal(getRenderCount(),before+2,'Scene redraws after horizon toggle');
  n.get('ModernCompareTab').dispatch('click');
  assert.equal(n.get('ModernCompareDisplayOptions').hidden,false);
  assert.equal(n.get('ModernCompareEyeLevel').checked,true);
  assert.equal(n.get('ModernCompareHorizon').checked,false);
  n.get('ModernSceneTab').dispatch('click');
  assert.equal(n.get('ModernCompareDisplayOptions').hidden,false);
  assert.equal(n.get('ModernCompareEyeLevel').checked,true);
  assert.equal(n.get('ModernCompareHorizon').checked,false);
  assert.equal(app.getMode(),'scene');
});
