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
    CurvaturePhysicalCurvature:{modelStep(){return 164},label(){return 'R = 6371 km'},
      resetEarth(m){m.rEarth=6371000;m.showModel=1;},applyStep(m){}},
    CurvatureMainCanvasRenderer:{renderPhysical(){renderCount++;return {drawn:12,fillTriangles:6,unresolved:0};}},
    NewGraphX3D(spec){return {UpdateCanvasSize(){},Redraw(){spec.DrawFunc({})}}},
    xOnLoad(fn){callbacks.push(fn);},console:{error(e){throw e;}}};
  window.window=window;
  const document={getElementById(id){return nodes.get(id)||null;},
    querySelector(){return null;},createElement(){return {setAttribute(){},addEventListener(){}};}};
  vm.runInNewContext(read('src/ui/modern/ModernApp.js'),{
    window,document,console,requestAnimationFrame(fn){fn();return 1},
    cancelAnimationFrame(){},setTimeout(){return 1},clearTimeout(){}
  });
  const app=window.CurvatureModernApp;
  for(const side of ['A','B'])app.registerCompareGraph(side,{UpdateCanvasSize(){},
    Redraw(){app.drawCompare(side,{})}});
  callbacks[0]();
  return {nodes,app,getRenderCount(){return renderCount;}};
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
  assert.equal(n.get('ModernCompareDisplayOptions').hidden,true);
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
