'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const compare132=require('../src/ui/modern/ModernCompareModel132');
const compare133=require('../src/ui/modern/ModernCompareState133');

function model(){
  const obj={Height:15,FocalLengthField:2000,Pan:.0464,Nick:.0121,Roll:0,
    showModel:1,rEarth:6371000,viewcenterHorizon:0,deviceRatio:1.5,
    camViewAngle:1,showGrid:1,ObjType:[3,3],NObjects:[85,2],
    ObjDist:[50,25550],ObjDeltaDist:[297.55,373],ObjSideType:[0,0],
    ObjSidePos:[35,25.4],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0],Update(){this.updated=(this.updated||0)+1;}};
  return obj;
}
test('133: all independent physics pairs retain shared camera and objects without changing Scene',()=>{
  const source=model(),snapshot=JSON.stringify(source);
  for(const name of Object.keys(compare133.PRESETS)){
    const spec=compare133.preset(name);
    const pair=compare133.pair(source,spec,compare132);
    assert.ok(compare132.invariant(pair),name);
    assert.equal(pair.A.viewcenterHorizon,3);
    assert.equal(pair.B.viewcenterHorizon,3);
    assert.equal(pair.A.showModel,spec.A.surface==='flat'?2:1);
    assert.equal(pair.B.showModel,spec.B.surface==='flat'?2:1);
    assert.equal(pair.A.rEarth,spec.A.radiusKm*1000);
    assert.equal(pair.B.rEarth,spec.B.radiusKm*1000);
    assert.equal(JSON.stringify(source),snapshot,'source must never change');
    assert.notStrictEqual(pair.A.ObjDist,pair.B.ObjDist);
    assert.notStrictEqual(pair.A.ObjDist,source.ObjDist);
  }
});
test('133: arbitrary near-flat/globe, equal and flat models and independent atmospheres',()=>{
  const scene=model();
  let config=compare133.initial(scene,'standard',6371000);
  assert.equal(config.B.surface,'flat');
  config=compare133.update(config,'A','radiusKm','10000000000000');
  config=compare133.update(config,'B','surface','globe');
  config=compare133.update(config,'B','radiusKm','987654321');
  config=compare133.update(config,'B','atmosphere','inverse-spherical');
  config=compare133.update(config,'B','occlusionRadius','8000000');
  const physical=compare133.pair(scene,config,compare132);
  assert.equal(physical.A.rEarth,1e16);
  assert.equal(physical.B.rEarth,987654321000);
  assert.equal(config.A.atmosphere,'standard');
  assert.equal(config.B.atmosphere,'inverse-spherical');
  assert.equal(config.B.occlusionRadius,8000000);
  assert.ok(compare132.invariant(physical));
  assert.equal(compare133.update(config,'A','surface','flat').A.surface,'flat');
  assert.equal(config.A.surface,'globe','immutable update');
});
test('133: invalid inputs fail atomically and do not change pair state',()=>{
  const state=compare133.initial(model(),'vacuum',6371000);
  const original=JSON.stringify(state);
  for(const [side,field,raw] of [
    ['A','radiusKm',''],['A','radiusKm','NaN'],['A','radiusKm','0'],
    ['B','radiusKm','Infinity'],['A','occlusionRadius',0],
    ['B','atmosphere','invented'],['B','surface','curved'],['C','surface','flat'],
    ['A','__proto__',2]
  ])assert.throws(()=>compare133.update(state,side,field,raw),RangeError);
  assert.equal(JSON.stringify(state),original);
  assert.throws(()=>compare133.preset('unrecognized'));
});
test('133: Modern document offers A/B input, explicit engineered physics and no legacy loaders',()=>{
  const html=source('CurvatureModern.html');
  assert.match(html,/ModernCompareState133.js/);
  for(const id of ['ModernPairPreset','ModernModelTabA','ModernModelTabB','ModernModelSurface',
    'ModernModelRadius','ModernModelAtmosphere','ModernModelOcclusion','ModernRecalculateCompare'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/Inverse spherical|inverse-spherical/);
  assert.doesNotMatch(html,/ControlPanelX\.js/);
});
test('133: real compare UI reuses independent optical caches and updates only selected side',()=>{
  const names=['ModernStatus','ModernCurvatureLabel','ModernViewInfo','ModernModePill',
    'ModernOcclusionWrap','ModernSceneTab','ModernCompareTab','ModernCompareMessage',
    'ModernGraphHost','ModernCompareViews','ModernBackToScene','ModernHeight','ModernFocal',
    'ModernPan','ModernNick','ModernOcclusion','ModernCameraAim','ModernAtmosphere',
    'ModernGrid','ModernCurvature','ModernEarth','ModernRender','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernPreset','ModernResetPreset','ModernObjectFields0',
    'ModernObjectFields1','ModernSceneTitle','ModernSceneDescription','ModernCompareLabelA',
    'ModernCompareLabelB','ModernCompareStatusA','ModernCompareStatusB',
    'ModernSceneSettings','ModernCompareSettings','ModernPairPreset','ModernModelTabA',
    'ModernModelTabB','ModernModelSurface','ModernModelRadius','ModernModelAtmosphere',
    'ModernModelOcclusionWrap','ModernModelOcclusion','ModernRecalculateCompare'];
  const nodes=new Map(names.map(id=>[id,{id,value:'',min:'',max:'',checked:true,hidden:false,
    textContent:'',listeners:{},classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},
    setAttribute(){},closest(){return {set hidden(value){this.value=value;}};}}]));
  const renders=[],callbacks=[],sessions=[];
  function Model(){Object.assign(this,model());}
  const ctx={window:{CurveAppClass:Model,
    CurvatureModernSceneState131:null,CurvatureModernCompareModel132:compare132,
    CurvatureModernCompareState133:compare133,
    CurvaturePhysicalSceneOptics:{create(){const value={id:sessions.length+1};sessions.push(value);return value;}},
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,options){renders.push({g,m,options});
      return {drawn:20,fillTriangles:10,unresolved:0,cacheReused:false};}},
    CurvaturePhysicalCurvature127:{modelStep(){return 164;},label(){return 'Earth';}},
    NewGraphX3D(params){return {Redraw(){params.DrawFunc({id:'scene'});}};},
    xOnLoad(fn){callbacks.push(fn);},console:{error(e){throw e;}}},
    document:{getElementById(id){assert.ok(nodes.has(id),'missing '+id);return nodes.get(id);}},
    requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){},
    setTimeout(fn){fn();return 1;},clearTimeout(){},console};
  ctx.window.window=ctx.window;
  vm.runInNewContext(source('src/ui/modern/ModernApp130.js'),ctx);
  const app=ctx.window.CurvatureModernApp130;
  for(const side of ['A','B'])app.registerCompareGraph(side,{UpdateCanvasSize(){},
    Redraw(){app.drawCompare(side,{id:side});}});
  callbacks[0]();
  const sourceBefore=JSON.stringify(app.getModel());
  nodes.get('ModernCompareTab').listeners.click();
  assert.equal(renders.length,3);
  assert.equal(sessions.length,2);
  assert.strictEqual(renders[1].options.cacheSession,sessions[0]);
  assert.strictEqual(renders[2].options.cacheSession,sessions[1]);
  nodes.get('ModernPairPreset').value='flat-inverse';
  nodes.get('ModernPairPreset').listeners.change.call(nodes.get('ModernPairPreset'));
  assert.equal(renders.length,5,'status: '+nodes.get('ModernStatus').textContent);
  assert.equal(renders[3].options.atmosphere,'standard');
  assert.equal(renders[4].options.atmosphere,'inverse-spherical');
  assert.equal(renders[4].m.showModel,2);
  assert.equal(renders[4].options.occlusionRadius,6371000);
  nodes.get('ModernModelTabB').listeners.click();
  nodes.get('ModernModelOcclusion').value='8000000';
  nodes.get('ModernModelOcclusion').listeners.change();
  assert.equal(app.getCompareConfig().B.occlusionRadius,8000000);
  assert.equal(app.getCompareConfig().A.occlusionRadius,6371000);
  assert.equal(renders.at(-1).options.occlusionRadius,8000000);
  assert.equal(nodes.get('ModernPairPreset').value,'custom');
  nodes.get('ModernModelSurface').value='globe';
  nodes.get('ModernModelSurface').listeners.change();
  assert.equal(renders.at(-1).m.showModel,1);
  const original=JSON.parse(sourceBefore),current=JSON.parse(JSON.stringify(app.getModel()));
  delete original.updated;delete current.updated;
  assert.deepEqual(current,original,'physical Scene controls must remain unchanged');
  nodes.get('ModernSceneTab').listeners.click();
  nodes.get('ModernCompareTab').listeners.click();
  assert.equal(app.getCompareConfig().B.surface,'globe','config persists across mode switches');
  assert.strictEqual(renders.at(-1).options.cacheSession,sessions[1]);
});
