'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const compare=require('../src/ui/modern/ModernCompareModel');

function actualModel(){
  const vec={Norm:a=>{const n=Math.hypot(...a);return a.map(x=>x/n);},
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    Scale:(a,t)=>a.map(x=>x*t),Add:(a,b)=>a.map((x,i)=>x+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
  const c=vm.createContext({JsgVect3:vec});
  vm.runInContext(source('src/app/CurvatureModel.js'),c);
  const model=vm.runInContext('new CurveAppClass()',c);
  Object.assign(model,{Height:15,FocalLengthField:2000,Nick:0.0121,Pan:0.0464,
    Roll:0,showModel:1,showGrid:1,viewcenterHorizon:0,
    ObjType:[3,3],NObjects:[3,2],ObjDist:[1200,3000],ObjDeltaDist:[380,500],
    ObjSidePos:[35,25.4],ObjSize:[23,64]});
  model.Update();
  return model;
}

test('132: physical A/B models keep one observer/camera and authored scene without mutating source',()=>{
  const original=actualModel(),oldMode=original.showModel,oldAim=original.viewcenterHorizon;
  const result=compare.pair(original);
  assert.notStrictEqual(result.A,original);
  assert.notStrictEqual(result.B,original);
  assert.notStrictEqual(result.A,result.B);
  assert.equal(result.A.showModel,1);
  assert.equal(result.B.showModel,2);
  assert.equal(original.showModel,oldMode);
  assert.equal(original.viewcenterHorizon,oldAim);
  assert.equal(result.A.viewcenterHorizon,3);
  assert.equal(result.B.viewcenterHorizon,3);
  assert.ok(compare.invariant(result));
  for(const key of ['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSidePos','ObjSize']){
    assert.notStrictEqual(result.A[key],result.B[key],key+' must have independent arrays');
    assert.deepEqual(Array.from(result.A[key]),Array.from(result.B[key]));
  }
  result.B.ObjSize[0]=999;
  assert.equal(original.ObjSize[0],23);
  assert.equal(result.A.ObjSize[0],23);
});

test('132: observer-fixed physical cameras agree across surface curvature and preserve FOV',()=>{
  const camera=require('../src/app/CurvaturePhysicalCamera');
  const sourceModel=actualModel(),{A,B}=compare.pair(sourceModel);
  const a=camera.create(A),b=camera.create(B);
  assert.deepEqual(a.center,b.center);
  assert.deepEqual(a.up,b.up);
  assert.equal(a.sceneSize,b.sceneSize);
  assert.equal(a.fieldOfViewRadians,b.fieldOfViewRadians);
  assert.notEqual(A.showModel,B.showModel);
  assert.ok(compare.invariant({A,B}));
});

test('132: Compare markup creates two actual independent GraphX3DX canvases and tooltip has no native duplicate',()=>{
  const html=source('CurvatureModern.html'),code=source('src/ui/modern/ModernApp.js');
  const graphCode=source('src/ui/modern/ModernCompareGraph.js');
  const css=source('src/ui/modern/ModernApp.css');
  assert.match(html,/id="ModernCompareViews"/);
  assert.match(html,/ModernCompareGraph\.js" data-compare-side="A"/);
  assert.match(html,/ModernCompareGraph\.js" data-compare-side="B"/);
  assert.match(graphCode,/root\.NewGraphX3D\(/);
  assert.match(graphCode,/app\.drawCompare\(side,g\)/);
  assert.match(code,/CurvatureMainCanvasRenderer\.renderPhysical\(g,m/);
  assert.match(code,/compareAdapter\.pair\(model\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/modern-compare-viewports:not\(\.is-active\)/);
  assert.doesNotMatch(code,/help\.title\s*=\s*message/);
  assert.match(code,/ObjType:'Selects the actual 3D object shape/);
});

test('132: each Compare viewport invokes Physical renderer separately with shared optics and camera inputs',()=>{
  const names=['ModernStatus','ModernCurvatureLabel','ModernViewInfo','ModernModePill',
    'ModernOcclusionWrap','ModernSceneTab','ModernCompareTab','ModernCompareMessage',
    'ModernGraphHost','ModernCompareViews','ModernBackToScene','ModernHeight','ModernFocal',
    'ModernPan','ModernNick','ModernOcclusion','ModernCameraAim','ModernAtmosphere',
    'ModernGrid','ModernCurvature','ModernEarth','ModernRender','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernPreset','ModernResetPreset','ModernObjectFields0',
    'ModernObjectFields1','ModernSceneTitle','ModernSceneDescription','ModernCompareLabelA',
    'ModernCompareLabelB','ModernCompareStatusA','ModernCompareStatusB'];
  const nodes=new Map(names.map(id=>[id,{id,value:'',min:'',max:'',checked:true,hidden:false,
    textContent:'',listeners:{},classList:{toggle(){}},
    addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},
    closest(){return {set hidden(value){this.value=value;}};}}]));
  const renders=[],callbacks=[];
  function FakeModel(){this.Update=function(){};this.showModel=1;this.rEarth=6371000;}
  const ctx={window:{CurveAppClass:FakeModel,
    CurvatureModernSceneState:null,CurvatureModernCompareModel:compare,
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,options){renders.push({g,m,options});
      return {drawn:28,fillTriangles:11,unresolved:0,cacheReused:false,timings:{totalMs:5}};}},
    CurvaturePhysicalCurvature:{modelStep(){return 164;},label(){return 'Earth';}},
    NewGraphX3D(params){return {Redraw(){params.DrawFunc({id:'Scene'});}};},
    xOnLoad(fn){callbacks.push(fn);},console:{error(e){throw e;}}},
    document:{getElementById(id){assert.ok(nodes.has(id),'missing '+id);return nodes.get(id);}},
    requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){},
    setTimeout(fn){fn();return 1;},clearTimeout(){},console};
  ctx.window.window=ctx.window;
  vm.runInNewContext(source('src/ui/modern/ModernApp.js'),ctx);
  const app=ctx.window.CurvatureModernApp;
  for(const side of ['A','B'])app.registerCompareGraph(side,{
    UpdateCanvasSize(){},Redraw(){app.drawCompare(side,{id:'compare-'+side});}
  });
  callbacks[0]();
  assert.equal(renders.length,1,'only one Scene render before switching');
  nodes.get('ModernCompareTab').listeners.click();
  assert.equal(app.getMode(),'compare');
  assert.equal(renders.length,3,'two real Compare render calls');
  assert.equal(renders[1].g.id,'compare-A');
  assert.equal(renders[2].g.id,'compare-B');
  assert.equal(renders[1].m.showModel,1);
  assert.equal(renders[2].m.showModel,2);
  assert.equal(renders[1].m.viewcenterHorizon,3);
  assert.equal(renders[2].m.viewcenterHorizon,3);
  assert.equal(renders[1].options.atmosphere,renders[2].options.atmosphere);
  assert.equal(app.getModel().showModel,1,'Compare must not modify Scene');
  assert.match(nodes.get('ModernCompareStatusA').textContent,/28 contours/);
  assert.match(nodes.get('ModernCompareStatusB').textContent,/28 contours/);
  nodes.get('ModernBackToScene').listeners.click();
  assert.equal(app.getMode(),'scene');
  assert.equal(renders.length,4);
});
