'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const experiment=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const audit=require('../src/animation/ModernAnimationQualityAudit');
function scene(){
  const m={Height:15,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Scene',Description:'View',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return experiment.capture(m,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
  compare.preset('globe-flat-vacuum'),{mode:'scene',eyeLevel:true,horizon:true,selected:'A'});
}
function pixels(width,height,values){return {width,height,data:Uint8ClampedArray.from(values)};}
test('exact pixel parity requires matching backing dimensions and compares alpha too',()=>{
  const a=pixels(2,1,[30,40,50,255,100,110,120,255]);
  assert.deepEqual(audit.comparePixels(a,pixels(2,1,Array.from(a.data))),{
    width:2,height:1,pixels:2,differentPixels:0,differentFraction:0,
    pixelsOverTolerance:0,overToleranceFraction:0,
    meanAbsoluteChannelError:0,maxChannelError:0,tolerance:2,exact:true});
  const b=pixels(2,1,[33,40,50,255,100,110,120,254]);
  const r=audit.comparePixels(a,b);
  assert.equal(r.differentPixels,2);
  assert.equal(r.pixelsOverTolerance,1);
  assert.equal(r.meanAbsoluteChannelError,4/8);
  assert.equal(r.maxChannelError,3);
  assert.equal(r.exact,false);
  assert.equal(audit.comparePixels(a,b,{threshold:3}).pixelsOverTolerance,0);
  assert.throws(()=>audit.comparePixels(a,pixels(1,2,Array.from(a.data))),/identical/);
  assert.throws(()=>audit.comparePixels(a,pixels(2,1,[3,4,5])),/RGBA/);
  assert.throws(()=>audit.comparePixels(a,b,{threshold:256}),/tolerance/);
});
test('Canvas comparison uses actual RGBA readback and never resizes or redraws',()=>{
  let read=0;
  const make=(a)=>({width:1,height:1,getContext(kind){
    assert.equal(kind,'2d');return {getImageData(x,y,w,h){
      assert.deepEqual([x,y,w,h],[0,0,1,1]);read++;
      return {data:Uint8ClampedArray.from(a)};}};}});
  assert.equal(audit.compareCanvases(make([1,2,3,255]),make([1,2,3,255])).exact,true);
  assert.equal(read,2);
  assert.throws(()=>audit.compareCanvases(make([1,2,3,255]),
    {width:2,height:2,getContext(){throw Error('should not read mismatched Canvas');}}),/identical/);
  assert.throws(()=>audit.readPixels({width:1,height:1,getContext(){throw Error('SecurityError');}}),/SecurityError/);
});
test('parity preflight rejects changed state, quality, backend and missing reference',()=>{
  const a=scene(),b=structuredClone(a);
  const input={reference:a,sample:b,mode:'scene',referenceRendered:true,
    referenceQuality:'accurate',animationQuality:'accurate',
    referenceBackend:'Canvas 2D',animationBackend:'Canvas 2D',shimmer:false};
  assert.equal(audit.conditions(input),null);
  b.compare.selected='B'; // non-rendered selection is not physical variation
  assert.equal(audit.conditions(input),null);
  b.scene.camera.Height=16;
  assert.match(audit.conditions(input),/differs/);
  b.scene.camera.Height=15;
  b.scene.title='Changed caption';assert.match(audit.conditions(input),/differs/);
  b.scene.title=a.scene.title;
  input.referenceQuality='fast';assert.match(audit.conditions(input),/Optical quality/);
  input.referenceQuality='accurate';input.animationBackend='WebGL2';
  assert.match(audit.conditions(input),/Canvas 2D/);
  input.animationBackend='Canvas 2D';input.shimmer=true;
  assert.match(audit.conditions(input),/shimmer/);
  input.shimmer=false;input.referenceRendered=false;
  assert.match(audit.conditions(input),/not rendered/);
});
test('bounded frame profiler distinguishes measured cold/warm optics, A/B, p50/p95',()=>{
  const p=audit.create({capacity:4});
  const render=(ms,cached)=>({timings:{totalMs:ms,opticsMs:ms-2,composeMs:1,paintMs:1,canvasMs:.5},
    cacheReused:cached,unresolved:0,fillUnresolved:2});
  for(let i=1;i<=5;i++)p.record({timeMs:i*100,frameMs:i*10,quality:i===5?'fast':'accurate',
    A:render(i*10,i%2===0),B:i===5?render(15,true):null});
  const s=p.summary();
  assert.equal(s.count,4);
  assert.equal(s.frameMs.p50,30);
  assert.equal(s.frameMs.p95,50);
  assert.equal(s.A.opticsMs.p95,48);
  assert.equal(s.A.cacheHits,2);
  assert.equal(s.A.cold.count,2);
  assert.equal(s.A.warm.count,2);
  assert.equal(s.A.fillUnresolved,8);
  assert.equal(s.B.count,1);
  assert.equal(s.fastFrames,1);
  assert.equal(s.mixedFrames,0);
  p.record({timeMs:600,frameMs:10,quality:'mixed',A:render(10,false)});
  assert.equal(p.summary().mixedFrames,1);
  assert.equal(p.snapshot()[0].projectId,null);
  const saved=p.snapshot();saved[0].A.opticsMs=999;
  assert.notEqual(p.snapshot()[0].A.opticsMs,999);
  assert.throws(()=>p.record({timeMs:1,frameMs:-1,quality:'fast'}),/Invalid/);
  p.clear();assert.equal(p.summary().frameMs.p95,null);
});
test('browser script loads without CommonJS and uses supplied globals',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../src/animation/ModernAnimationQualityAudit.js'),'utf8');
  const root={CurvatureModernExperimentState:experiment,
    CurvatureModernExperimentFingerprint:require('../src/ui/modern/ModernExperimentFingerprint')};
  vm.runInNewContext(code,vm.createContext(root),{filename:'ModernAnimationQualityAudit.js'});
  assert.equal(typeof root.CurvatureModernAnimationQualityAudit.comparePixels,'function');
  assert.equal(root.CurvatureModernAnimationQualityAudit.signature(scene()),audit.signature(scene()));
});
test('quality audit stays within Modern and does not drive Scene/Compare or History',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const source=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/src="src\/animation\/ModernAnimationQualityAudit\.js"/);
  assert.ok(html.indexOf('ModernAnimationQualityAudit.js')<html.indexOf('src/ui/modern/ModernApp.js'));
  assert.match(html,/id="ModernAnimationQualityCompare"/);
  assert.match(source,/studioQualityAudit\.record\(/);
  assert.match(source,/studioQualityApi\.compareCanvases/);
  const body=source.slice(source.indexOf('function compareStudioToWorkingFrame()'),
    source.indexOf('function bindStudioQualityAudit()'));
  assert.doesNotMatch(body,/applyExperiment\(|redraw\(|scheduleExperimentSave\(|queueHistoryAuto\(/);
});
