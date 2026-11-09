'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const experiment=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const project=require('../src/animation/ModernAnimationProject');
const playback=require('../src/animation/ModernAnimationPlayback');
const preview=require('../src/animation/ModernAnimationPreview');
function snapshot(mode='scene'){
  const m={Height:10,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Standalone',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return experiment.capture(m,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('globe-flat-vacuum'),
    {mode,eyeLevel:false,horizon:true,selected:'A'});
}
function cameraProject(mode='scene'){
  const a=snapshot(mode),b=structuredClone(a),c=structuredClone(a);
  b.scene.camera.Height=50;c.scene.camera.Height=90;
  return project.create([{experiment:a,name:'Start',holdMs:1000},
    {experiment:b,name:'Middle',travelMs:4000,holdMs:2000,easing:'linear'},
    {experiment:c,name:'End',travelMs:3000,easing:'linear'}],{id:'camera_playback',name:'Camera study'});
}
test('Absolute-time playback respects holds, pause, resume, seek and ending',()=>{
  const p=cameraProject(),t=playback.create(p),original=structuredClone(p);
  assert.equal(t.status().durationMs,10000);
  assert.equal(t.status().positionMs,0);
  t.start(100);t.tick(600);assert.equal(t.status().positionMs,500);
  assert.equal(t.sample().scene.camera.Height,10,'first frame holds still');
  t.tick(3100);assert.equal(t.status().positionMs,3000);
  assert.equal(t.sample().scene.camera.Height,30);
  t.pause(4100);assert.equal(t.status().positionMs,4000);
  assert.equal(t.status().playing,false);
  t.tick(7000);assert.equal(t.status().positionMs,4000,'paused clock is frozen');
  t.start(7000);t.tick(8000);assert.equal(t.status().positionMs,5000);
  t.seek(6500,8000);assert.equal(t.sample().scene.camera.Height,50);
  t.tick(9000);assert.ok(Math.abs(t.sample().scene.camera.Height-(50+40/6))<1e-10);
  t.tick(12500);assert.equal(t.status().completed,true);
  assert.equal(t.status().playing,false);assert.equal(t.sample().scene.camera.Height,90);
  t.start(13000);assert.equal(t.status().positionMs,0,'play after completion restarts');
  t.stop();assert.equal(t.status().positionMs,0);
  assert.deepEqual(p,original,'controller does not modify the project');
});
test('Seek is clamped and invalid clocks are rejected without mutation',()=>{
  const t=playback.create(cameraProject());
  assert.equal(t.seek(-120,0).positionMs,0);
  assert.equal(t.seek(1e6,0).positionMs,10000);
  assert.throws(()=>t.start(Infinity),/clock/);
  assert.throws(()=>t.seek(NaN),/time/);
  assert.throws(()=>t.tick(NaN),/clock/);
  t.start(100);t.seek(2000,500);assert.equal(t.tick(1500).positionMs,3000);
});
test('Physical projects are explicitly excluded from camera playback',()=>{
  const a=snapshot(),b=structuredClone(a);
  b.scene.temperatureProfile.gradientKPerKm=7;
  a.scene.atmosphere='temperature-lapse';b.scene.atmosphere='temperature-lapse';
  const physical=project.create([{experiment:a},{experiment:b}],{id:'physical_case',name:'Physical'});
  assert.throws(()=>playback.create(physical),/Only Camera Animation/);
});
test('Independent preview models retain source physics and separate optical sessions',()=>{
  const source=snapshot('compare'),before=structuredClone(source),calls=[];
  class FakeModel { Update(){this.updated=(this.updated||0)+1;} }
  let sessions=0;
  const engine=preview.create({Model:FakeModel,optics:{create:()=>({id:++sessions})},
    renderer:{renderPhysical:(graph,model,options)=>{
      calls.push({model,options,graph});return {drawn:123};
    }}});
  const fakeGraph=()=>({Canvas:{},UpdateCanvasSize(){this.resizeCount=(this.resizeCount||0)+1;}});
  const graphA=fakeGraph(),graphB=fakeGraph();
  const a=engine.render(source,'A',graphA),b=engine.render(source,'B',graphB);
  assert.equal(a.result.drawn,123);assert.equal(b.result.drawn,123);
  assert.equal(calls[0].model.showModel,1);assert.equal(calls[1].model.showModel,2);
  assert.equal(calls[0].model.viewcenterHorizon,3);
  assert.notEqual(calls[0].options.cacheSession,calls[1].options.cacheSession);
  assert.equal(calls[0].options.opticalQuality,'fast');
  assert.equal(calls[1].options.opticalQuality,'fast');
  assert.equal(calls[0].options.geometryBackend,'canvas');
  assert.equal(graphA.resizeCount,1);assert.equal(graphB.resizeCount,1);
  assert.deepEqual(source,before,'preview cannot mutate source experiment');
  const c=structuredClone(source);c.scene.camera.Height=120;
  engine.render(c,'A',graphA);
  assert.equal(calls[0].model,calls[2].model,'preview reuses only its own physical model');
  assert.notEqual(calls[0].model,calls[1].model);
  assert.equal(calls[2].model.Height,120);
  assert.equal(calls[0].options.cacheSession,calls[2].options.cacheSession);
});
test('Temperature-lapse preview uses accurate optics, not a false fast approximation',()=>{
  const e=snapshot();e.scene.atmosphere='temperature-lapse';
  class FakeModel {Update(){}}
  const engine=preview.create({Model:FakeModel,
    renderer:{renderPhysical:()=>({})}});
  assert.equal(engine.build(e,'A').options.opticalQuality,'accurate');
  assert.equal(preview.fastEligible({atmosphere:'vacuum',surface:'globe'}),true);
  assert.equal(preview.fastEligible({atmosphere:'temperature-lapse',surface:'globe'}),false);
});
test('Animation uses distinct parser-time Canvas graphs, not live Scene/Compare canvases',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/id="ModernAnimationCanvasA"/);
  assert.match(html,/id="ModernAnimationCanvasB"/);
  assert.match(html,/src="src\/ui\/modern\/ModernAnimationPreviewGraph.js" data-animation-side="A"/);
  assert.match(html,/src="src\/ui\/modern\/ModernAnimationPreviewGraph.js" data-animation-side="B"/);
  assert.match(app,/studioPlaybackApi\.create\(studioPrepared\)/);
  assert.match(app,/studioPreviewRenderer\.render\(sampled,'A',graphs\.A\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderStudioPlaybackSample('),app.indexOf('function studioPlaybackTick(')),
    /applyExperiment\(|redraw\(|scheduleExperimentSave\(|queueHistoryAuto\(/);
});
