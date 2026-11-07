'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const composer=require('../src/scene/CurvatureIndependentComposition');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const projection=require('../src/optics/OpticalTargetProjection');

function scene(shape){
  const m=model(10,shape);
  m.rEarth=6371000;m.geometryRadius=6371000;m.Height=15;m.showGrid=0;
  return {model:m,composed:composer.composeOpticalMain(m,shape==='globe',{physicalWorld:true})};
}

test('Fast Preview renders real Modern Globe/Flat geometry without invoking RK4 or the Legacy renderer',()=>{
  const original=projection.solve;
  projection.solve=()=>{throw Error('RK4 reached during Fast Preview');};
  try{
    for(const shape of ['flat','globe']){
      const s=scene(shape),session=optics.create();
      const args={atmosphere:'standard',opticalQuality:'fast'};
      const first=session.transform(s.composed,s.model,args);
      assert.equal(first.stats.opticalQuality,'fast');
      assert.equal(first.stats.fieldStats.shootRK4Calls,0);
      assert.equal(first.stats.fieldStats.mode,'local-conformal-gradient');
      assert.ok(first.stats.visibleSegments>100);
      assert.ok(first.stats.fillTriangles>100);
      assert.equal(first.stats.fillUnresolved,0,'ground-contact band must not erase most foundations');
      assert.ok(first.composition.scene.primitives.some(p=>p.metadata?.kind==='physical-object-fill'));
      assert.equal(session.transform(s.composed,s.model,args).reused,true);
      // A quality switch must not serve approximate composition as Accurate.
      assert.notEqual(first.composition.scene.metadata.composition,'optics-neutral-main');
    }
  }finally{projection.solve=original;}
});

test('Fast Preview qualifies analytic Flat endpoints and rejects unsupported profiles without RK4 fallback',()=>{
  const s=scene('flat');
  for(const [atmosphere,profile] of [
    ['exponential-occlusion',null],
    ['inverse-temperature',{weight:1,source:'standard'}]]){
    const opts={atmosphere,opticalQuality:'fast',occlusionRadius:6371000};
    if(profile)opts.inverseProfile=profile;
    const result=optics.create().transform(s.composed,s.model,opts);
    assert.equal(result.stats.opticalQuality,'fast');
    assert.equal(result.stats.fieldStats.mode,'analytic');
    assert.equal(result.stats.fieldStats.shootRK4Calls,0);
    assert.ok(result.stats.visibleSegments>0);
  }
  for(const opts of [
    {atmosphere:'temperature-lapse'},
    {atmosphere:'inverse-temperature',inverseProfile:{weight:0.5,source:'standard'}},
    {atmosphere:'exponential-occlusion',shape:'globe'}]){
    const current=opts.shape==='globe'?scene('globe'):s;
    assert.throws(()=>optics.create().transform(current.composed,current.model,
      {atmosphere:opts.atmosphere,inverseProfile:opts.inverseProfile,
        opticalQuality:'fast',occlusionRadius:6371000}),/Fast Preview is unavailable/);
  }
  assert.throws(()=>optics.create().transform(s.composed,s.model,
    {atmosphere:'vacuum',opticalQuality:'ultra'}),/Unknown optical quality/);
});

test('Accurate/Preview cache keys are isolated and switching back recovers full RK4',()=>{
  const s=scene('flat'),session=optics.create();
  const accurate={atmosphere:'standard',opticalQuality:'accurate'};
  const fast={atmosphere:'standard',opticalQuality:'fast'};
  const baseline=session.transform(s.composed,s.model,accurate);
  assert.ok(baseline.stats.fieldStats.shootRK4Calls>0);
  assert.equal(session.transform(s.composed,s.model,accurate).reused,true);
  const approximation=session.transform(s.composed,s.model,fast);
  assert.equal(approximation.reused,false);
  assert.equal(approximation.stats.fieldStats.shootRK4Calls,0);
  const restored=session.transform(s.composed,s.model,accurate);
  assert.equal(restored.reused,false);
  assert.ok(restored.stats.fieldStats.shootRK4Calls>0);
  assert.equal(restored.stats.opticalQuality,'accurate');
});

test('Modern Display optical selector routes Scene and Compare to an explicit quality without storing it as experiment physics',()=>{
  const html=source('CurvatureModern.html');
  const scripts=[...html.matchAll(/<script src="([^"]+)"/g)].map(x=>x[1].split('?')[0]);
  assert.ok(scripts.indexOf('src/optics/OpticalFastRayField.js')<
    scripts.indexOf('src/optics/CurvaturePhysicalSceneOptics.js'));
  assert.ok(html.includes('id="ModernOpticalQuality"'));
  assert.ok(html.includes('id="ModernPreviewDetail"'));
  assert.ok(scripts.indexOf('src/optics/OpticalPreviewLod.js')<
    scripts.indexOf('src/optics/CurvaturePhysicalSceneOptics.js'));
  const names=['ModernStatus','ModernCurvatureLabel','ModernViewInfo','ModernModePill',
    'ModernOcclusionWrap','ModernSceneTab','ModernCompareTab','ModernCompareMessage',
    'ModernGraphHost','ModernCompareViews','ModernBackToScene','ModernHeight','ModernFocal',
    'ModernPan','ModernNick','ModernOcclusion','ModernCameraAim','ModernAtmosphere',
    'ModernGrid','ModernCurvature','ModernEarth','ModernRender','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernPreset','ModernResetPreset',
    'ModernObjectFields0','ModernObjectFields1','ModernSceneTitle','ModernSceneDescription',
    'ModernCompareLabelA','ModernCompareLabelB','ModernCompareStatusA','ModernCompareStatusB',
    'ModernOpticalQuality','ModernOpticalQualityStatus','ModernPreviewDetail','ModernPreviewDetailStatus',
    'ModernHorizonStatusA','ModernHorizonStatusB','ModernHorizonStatusScene'];
  const nodes=new Map(names.map(id=>[id,{id,value:'',checked:true,hidden:false,
    textContent:'',listeners:{},classList:{toggle(){}},
    addEventListener(name,fn){this.listeners[name]=fn;},setAttribute(){},
    closest(){return {set hidden(v){this.value=v;}};}}]));
  const call=[],callbacks=[];let horizonCalls=0;
  function FakeModel(){this.Update=function(){};this.showModel=1;this.rEarth=6371000;}
  const win={CurveAppClass:FakeModel,
    CurvatureModernSceneState:null,
    CurvatureModernCompareModel:require('../src/ui/modern/ModernCompareModel'),
    CurvatureOpticalPreviewLod:require('../src/optics/OpticalPreviewLod'),
    CurvaturePhysicalSceneOptics:{create(){return {clearCache(){}};}},
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,options){call.push({g,m,options});
      return {drawn:12,fillTriangles:6,unresolved:0,cacheReused:false,timings:{totalMs:1}};}},
    CurvatureRayHorizon:{diagnose(){horizonCalls++;return {status:'unresolved'};}},
    CurvaturePhysicalCurvature:{modelStep(){return 164;},label(){return 'Earth';}},
    NewGraphX3D(params){return {Redraw(){params.DrawFunc({id:'Scene'});}};},
    xOnLoad(fn){callbacks.push(fn);},console:{error(e){throw e;}}};
  win.window=win;
  const context={window:win,document:{
    getElementById(id){return nodes.get(id)||null;},
    querySelector(selector){return ['#ModernOpticalQuality','#ModernPreviewDetail'].includes(selector)?
      nodes.get(selector.slice(1)):null;},
    createElement(){return {setAttribute(){},addEventListener(){}};}
  },requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){},
  setTimeout(fn){fn();return 1;},clearTimeout(){},console};
  vm.runInNewContext(source('src/ui/modern/ModernApp.js'),context);
  const app=win.CurvatureModernApp;
  for(const side of ['A','B'])app.registerCompareGraph(side,{UpdateCanvasSize(){},
    Redraw(){app.drawCompare(side,{id:'compare-'+side});}});
  callbacks[0]();
  assert.equal(app.getOpticalQuality(),'accurate');
  assert.equal(call.at(-1).options.opticalQuality,'accurate');
  const selector=nodes.get('ModernOpticalQuality');
  selector.value='fast';selector.listeners.change();
  assert.equal(app.getOpticalQuality(),'fast');
  assert.equal(call.at(-1).options.opticalQuality,'fast');
  const detail=nodes.get('ModernPreviewDetail');
  detail.value='8';detail.listeners.change();
  assert.equal(app.getPreviewDetail(),'8');
  assert.equal(call.at(-1).options.previewLod.stride,8);
  assert.match(nodes.get('ModernStatus').textContent,/Fast Preview/);
  const horizonBefore=horizonCalls;
  nodes.get('ModernCompareTab').listeners.click();
  assert.equal(horizonCalls,horizonBefore,'Fast mode must not call accurate traced horizon');
  assert.deepEqual(call.slice(-2).map(x=>x.options.opticalQuality),['fast','fast']);
  assert.deepEqual(call.slice(-2).map(x=>x.options.previewLod.stride),[8,8]);
  assert.notEqual(call.at(-2).options.cacheSession,call.at(-1).options.cacheSession);
  selector.value='accurate';selector.listeners.change();
  assert.equal(app.getOpticalQuality(),'accurate');
  assert.equal(detail.disabled,true);
  assert.deepEqual(call.slice(-2).map(x=>x.options.opticalQuality),['accurate','accurate']);
  assert.notEqual(call.at(-2).options.cacheSession,call.at(-1).options.cacheSession);
});
