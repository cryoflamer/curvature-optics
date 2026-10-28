'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const detector=require('../src/optics/OpticalRayHorizon1332');
const tracer=require('../src/optics/OpticalRayTracer');
const R=6371000,H=15;
function measure(geometry,atmosphere,extras={}){
  return detector.diagnose({geometry,atmosphere,radius:R,observerHeight:H,
    profileOptions:{occlusionRadius:R},...extras});
}
test('133.2: sphere vacuum first-contact tangent agrees with independent geometry',()=>{
  const d=measure('globe','vacuum');
  assert.equal(d.status,'resolved',JSON.stringify(d));
  // Independent analytical calibration; NOT used inside horizon solver.
  const expected=-Math.acos(R/(R+H))*180/Math.PI;
  assert.ok(Math.abs(d.angleDegrees-expected)<0.0002,`${d.angleDegrees} vs ${expected}`);
  assert.ok(Math.abs(d.tangentDistance-Math.sqrt(H*(2*R+H)))<600);
  assert.ok(d.bracketDegrees[1]-d.bracketDegrees[0]<=0.00005);
  const low=tracer.trace({geometry:'globe',radius:R,observerHeight:H,
    atmosphere:'vacuum',angle:(d.angleDegrees-.001)*Math.PI/180,length:100000,step:200});
  const high=tracer.trace({geometry:'globe',radius:R,observerHeight:H,
    atmosphere:'vacuum',angle:(d.angleDegrees+.001)*Math.PI/180,length:100000,step:200});
  assert.equal(low.hitGround,true);
  assert.equal(high.hitGround,false);
});
test('133.2: refraction changes the computed globe horizon angle',()=>{
  const vacuum=measure('globe','vacuum');
  const standard=measure('globe','standard');
  assert.equal(standard.status,'resolved');
  assert.ok(standard.dipDegrees<vacuum.dipDegrees);
  assert.ok(standard.tangentDistance>vacuum.tangentDistance);
});
test('133.2: engineered flat profiles are traced, not substituted with a horizon formula',()=>{
  const target=measure('globe','vacuum');
  for(const kind of ['inverse-spherical','exponential-occlusion']){
    const value=measure('flat',kind);
    assert.equal(value.status,'resolved',kind+': '+JSON.stringify(value));
    assert.ok(Math.abs(value.angleDegrees-target.angleDegrees)<0.0003);
  }
});
test('133.2: finite distance cutoff alone never manufactures a flat horizon',()=>{
  for(const atmosphere of ['vacuum','standard']){
    const r=measure('flat',atmosphere);
    assert.equal(r.status,'unresolved',atmosphere);
    assert.equal(r.angleDegrees,undefined);
    assert.match(r.reason,/bracket/);
  }
  const truncated=measure('globe','vacuum',{maxDistance:5000});
  assert.equal(truncated.status,'unresolved',JSON.stringify(truncated));
});
test('133.2: independent RK4 step refinements preserve angular result',()=>{
  const a=measure('globe','standard',{step:300});
  const b=measure('globe','standard',{step:80});
  assert.equal(a.status,'resolved');
  assert.equal(b.status,'resolved');
  assert.ok(Math.abs(a.angleDegrees-b.angleDegrees)<0.0003);
});
test('133.2: invalid search ranges and dimensions are rejected',()=>{
  for(const config of [{observerHeight:0},{radius:0},{maxDistance:Infinity},
    {step:1},{geometry:'cube'}]){
    assert.throws(()=>measure('globe','vacuum',config),RangeError);
  }
});
test('133.2: Modern Compare integrates the diagnostic without touching Legacy',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const code=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp130.js'),'utf8');
  assert.match(html,/src\/optics\/OpticalRayHorizon1332.js/);
  for(const id of ['ModernCompareHorizon','ModernHorizonStatusA','ModernHorizonStatusB'])
    assert.ok(html.includes('id="'+id+'"'));
  assert.match(code,/detector\.diagnose\(arguments_\)/);
  assert.match(code,/horizonCache\[side\]/);
  assert.match(code,/overlay omitted for camera roll/);
  assert.doesNotMatch(code,/geometricHorizon\(/);
});

test('133.2: Compare horizon is cached independently per side and never recomputed by guide toggles',()=>{
  const vm=require('node:vm');
  const compare132=require('../src/ui/modern/ModernCompareModel132');
  const compare133=require('../src/ui/modern/ModernCompareState133');
  const src=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp130.js'),'utf8');
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
    'ModernModelOcclusionWrap','ModernModelOcclusion','ModernRecalculateCompare',
    'ModernCompareEyeLevel','ModernCompareHorizon','ModernHorizonStatusA','ModernHorizonStatusB'];
  const nodes=new Map(names.map(id=>[id,{id,value:'',min:'',max:'',checked:true,hidden:false,
    textContent:'',title:'',listeners:{},classList:{toggle(){}},addEventListener(t,fn){this.listeners[t]=fn;},
    setAttribute(){},closest(){return {hidden:false};}}]));
  const paths=[],listeners=[],drawCalls=[];
  function FakeModel(){Object.assign(this,{Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    showModel:1,rEarth:R,viewcenterHorizon:3,deviceRatio:1.5,camViewAngle:1,
    showGrid:1,ObjType:[3,3],NObjects:[3,2],ObjDist:[1200,3000],ObjDeltaDist:[380,500],
    ObjSideType:[0,0],ObjSidePos:[30,40],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]});}
  FakeModel.prototype.Update=function(){};
  const graphics={save(){},restore(){},setTransform(){},setLineDash(){},beginPath(){},
    moveTo(){},lineTo(){},stroke(){drawCalls.push('stroke');},fillText(t){drawCalls.push(t);}};
  const canvas={width:600,height:400,getContext(){return graphics;}};
  const browser={CurveAppClass:FakeModel,CurvatureModernSceneState131:null,
    CurvatureModernCompareModel132:compare132,CurvatureModernCompareState133:compare133,
    CurvatureRayHorizon1332:{diagnose(o){paths.push(o);return o.geometry==='globe'?{
      status:'resolved',angleDegrees:-.12,dipDegrees:.12,tangentDistance:14000,
      bracketDegrees:[-.12001,-.11999]}:{status:'unresolved',reason:'not tangent'};}},
    CurvaturePhysicalSceneOptics:{create(){return {}; }},
    CurvatureMainCanvasRenderer:{renderPhysical(){return {drawn:10,fillTriangles:10,unresolved:0};}},
    CurvaturePhysicalCurvature127:{modelStep(){return 164;},label(){return 'Earth';}},
    NewGraphX3D(params){return {Redraw(){params.DrawFunc({id:'scene'});}};},
    xOnLoad(fn){listeners.push(fn);},console:{error(e){throw e;}}};
  const ctx={window:browser,
    document:{getElementById(id){assert.ok(nodes.has(id),'missing '+id);return nodes.get(id);}},
    requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){},
    setTimeout(fn){fn();return 1;},clearTimeout(){},console};
  browser.window=browser;
  vm.runInNewContext(src,ctx);
  for(const side of ['A','B'])browser.CurvatureModernApp130.registerCompareGraph(side,{
    Canvas:canvas,UpdateCanvasSize(){},Redraw(){browser.CurvatureModernApp130.drawCompare(side,{Canvas:canvas});}});
  listeners[0]();
  nodes.get('ModernCompareTab').listeners.click();
  assert.equal(paths.length,2);
  assert.equal(nodes.get('ModernHorizonStatusA').textContent.includes('dip 0.1200°'),true);
  assert.match(nodes.get('ModernHorizonStatusB').textContent,/unresolved/);
  assert.ok(drawCalls.some(t=>t.includes('Traced horizon')));
  nodes.get('ModernRecalculateCompare').listeners.click();
  assert.equal(paths.length,2,'same physical configurations must reuse angular measurement');
  nodes.get('ModernCompareHorizon').checked=false;
  nodes.get('ModernCompareHorizon').listeners.change();
  assert.match(nodes.get('ModernHorizonStatusA').textContent,/hidden/);
  assert.equal(paths.length,2);
  nodes.get('ModernCompareHorizon').checked=true;
  nodes.get('ModernCompareHorizon').listeners.change();
  assert.equal(paths.length,2);
  nodes.get('ModernModelTabB').listeners.click();
  nodes.get('ModernModelAtmosphere').value='vacuum';
  nodes.get('ModernModelAtmosphere').listeners.change();
  assert.equal(paths.length,3,'only the changed side gets a new traced horizon');
});
