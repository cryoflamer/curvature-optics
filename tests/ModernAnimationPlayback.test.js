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
test('Physical gradient uses the same absolute-time player and retains the fixed camera',()=>{
  const a=snapshot(),b=structuredClone(a),camera=structuredClone(a.scene.camera);
  a.scene.atmosphere='temperature-lapse';b.scene.atmosphere='temperature-lapse';
  a.scene.temperatureProfile.gradientKPerKm=-6.5;
  b.scene.temperatureProfile.gradientKPerKm=10;
  const original=structuredClone([a,b]);
  const p=project.create([{experiment:a,holdMs:500},{experiment:b,travelMs:4000,holdMs:500}],
    {id:'physical_gradient',name:'Temperature study'});
  const controller=playback.create(p);
  controller.start(100);controller.tick(2600);
  assert.equal(controller.status().positionMs,2500);
  const sample=controller.sample();
  assert.ok(Math.abs(sample.scene.temperatureProfile.gradientKPerKm-1.75)<1e-10);
  assert.deepEqual(sample.scene.camera,camera,'camera must remain fixed');
  assert.match(playback.describeSample(p,sample),/Temperature gradient 1.75 K\/km/);
  controller.pause(2600);controller.tick(6500);
  assert.equal(controller.status().positionMs,2500,'pause freezes physical changes');
  controller.seek(5000,6500);
  assert.equal(controller.sample().scene.temperatureProfile.gradientKPerKm,10);
  controller.stop();
  assert.equal(controller.sample().scene.temperatureProfile.gradientKPerKm,-6.5);
  assert.deepEqual([a,b],original,'neither history source snapshot is modified');
  assert.equal(playback.describeSample(cameraProject(),snapshot()),'');
});
test('Globe to exact Flat and reverse can be played/seeked without moving the camera',()=>{
  const a=snapshot(),flat=structuredClone(a);
  flat.scene.surface.showModel=2;
  const p=project.create([{experiment:a},{experiment:flat,travelMs:5000}],
    {id:'physical_curvature',name:'Curvature'});
  const controller=playback.create(p),camera=structuredClone(a.scene.camera);
  controller.seek(2500,0);
  const middle=controller.sample();
  assert.equal(middle.scene.surface.showModel,1);
  assert.ok(Math.abs(middle.scene.surface.rEarth-12742000)<1e-5);
  assert.match(playback.describeSample(p,middle),/Globe R = 12,742 km/);
  controller.seek(5000,0);
  const final=controller.sample();
  assert.equal(final.scene.surface.showModel,2,'exact zero curvature is Flat');
  assert.match(playback.describeSample(p,final),/Flat \(curvature = 0\)/);
  assert.deepEqual(final.scene.camera,camera);
  const reverse=playback.create(project.create([{experiment:flat},{experiment:a}],
    {id:'physical_reverse',name:'Flat to globe'}));
  assert.equal(reverse.sample().scene.surface.showModel,2);
  reverse.seek(2500,0);
  assert.equal(reverse.sample().scene.surface.showModel,1);
});
test('Physical Compare playback changes only chosen A while B/camera are fixed',()=>{
  const a=snapshot('compare'),b=structuredClone(a);
  b.compare.A.radiusKm=12742;
  const p=project.create([{experiment:a},{experiment:b}],{id:'compare_curvature',name:'Compare curvature'});
  const controller=playback.create(p);
  controller.seek(2500,0);
  const sample=controller.sample();
  assert.equal(sample.display.mode,'compare');
  assert.ok(Math.abs(sample.compare.A.radiusKm-8494.666666666666)<1e-9);
  assert.deepEqual(sample.compare.B,a.compare.B);
  assert.deepEqual(sample.scene.camera,a.scene.camera);
  assert.match(playback.describeSample(p,sample),/^Model A · Globe R/);
});
test('Near-flat physical samples reject unsupported radii, not silently switch to Flat',()=>{
  const a=snapshot(),b=structuredClone(a);
  a.scene.surface.rEarth=1e16;b.scene.surface.showModel=2;
  const p=project.create([{experiment:a},{experiment:b}],{id:'extreme_case',name:'Extreme'});
  const controller=playback.create(p);
  controller.seek(2500,0);
  assert.throws(()=>controller.sample(),/supported radius/);
  controller.seek(5000,0);
  assert.equal(controller.sample().scene.surface.showModel,2);
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
test('Physical intermediate samples are mapped to separate production preview models',()=>{
  const scene=snapshot(),flat=structuredClone(scene),calls=[];
  flat.scene.surface.showModel=2;
  const p=project.create([{experiment:scene},{experiment:flat}],
    {id:'physical_scene_render',name:'Curvature'});
  const controller=playback.create(p);
  class FakeModel { Update(){} }
  const renderer=preview.create({Model:FakeModel,renderer:{renderPhysical:(graph,model,options)=>{
    calls.push({model,options,geometry:model.showModel,radius:model.rEarth,graph});
    return {drawn:true};
  }}});
  const graph={Canvas:{}};
  controller.seek(2500,0);renderer.render(controller.sample(),'A',graph);
  controller.seek(5000,0);renderer.render(controller.sample(),'A',graph);
  assert.equal(calls[0].geometry,1);
  assert.ok(Math.abs(calls[0].radius-12742000)<1e-5);
  assert.equal(calls[1].geometry,2);
  assert.equal(calls[0].model,calls[1].model,'isolated model is reused, not live model');
  assert.equal(scene.scene.surface.showModel,1);
});
test('Compare gradient playback sends only A changing lapse to Accurate renderer',()=>{
  const a=snapshot('compare'),b=structuredClone(a),calls=[];
  a.compare.A.atmosphere=b.compare.A.atmosphere='temperature-lapse';
  a.compare.A.temperatureProfile.gradientKPerKm=-6;
  b.compare.A.temperatureProfile.gradientKPerKm=8;
  const p=project.create([{experiment:a},{experiment:b}],
    {id:'compare_gradient',name:'Compare A gradient'});
  const clock=playback.create(p),before=structuredClone(a);
  clock.seek(2500,0);
  const sampled=clock.sample();
  class FakeModel { Update(){} }
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical:(graph,model,options)=>{
    calls.push({options,model});return {};
  }}});
  view.render(sampled,'A',{Canvas:{}});
  view.render(sampled,'B',{Canvas:{}});
  assert.equal(calls[0].options.opticalQuality,'accurate');
  assert.equal(calls[0].options.atmosphere,'temperature-lapse');
  assert.equal(calls[0].options.temperatureProfile.gradientKPerKm,1);
  assert.equal(calls[1].options.atmosphere,a.compare.B.atmosphere);
  assert.equal(calls[1].options.temperatureProfile.gradientKPerKm,
    a.compare.B.temperatureProfile.gradientKPerKm);
  assert.deepEqual(sampled.scene.camera,a.scene.camera);
  assert.deepEqual(a,before);
  assert.match(playback.describeSample(p,sampled),/Model A · Temperature gradient 1.00 K\/km/);
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
  assert.match(app,/studioPlaybackApi\.describeSample\(studioPrepared,sampled\)/);
  assert.match(html,/id="ModernAnimationPlaybackParameter"/);
  assert.match(app,/studioPreviewRenderer\.render\(sampled,'A',graphs\.A,renderOptions\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderStudioPlaybackSample('),app.indexOf('function studioPlaybackTick(')),
    /applyExperiment\(|redraw\(|scheduleExperimentSave\(|queueHistoryAuto\(/);
});


test('Physical Globe/Flat sample at 0.2 seconds uses curvature and the same displayed time',()=>{
  const globe=snapshot(),flat=structuredClone(globe);
  flat.scene.surface.showModel=2;
  const p=project.create([{experiment:globe},{experiment:flat,travelMs:5000}],
    {id:'clock_diagnostic',name:'Clock parity'});
  const c=playback.create(p);
  c.start(1000);c.tick(1200);
  assert.equal(c.status().positionMs,200);
  const sampled=c.sample();
  assert.ok(Math.abs(sampled.scene.surface.rEarth-6371000/0.96)<0.000001);
  assert.match(playback.describeSample(p,sampled),/Globe R = 6,636.5 km/);
});

test('Physical optics defaults to Accurate even when Fast supports the profile',()=>{
  const e=snapshot();
  class FakeModel { Update(){} }
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical:()=>({})}});
  assert.equal(view.build(e,'A',{animationMode:'physical'}).quality,'accurate');
  assert.equal(view.build(e,'A',{animationMode:'camera'}).quality,'fast');
  assert.equal(view.build(e,'A',{animationMode:'physical',quality:'fast'}).quality,'fast');
  assert.equal(view.build(e,'A',{animationMode:'camera',quality:'accurate'}).quality,'accurate');
  assert.equal(view.build(e,'A',{animationMode:'physical'}).options.previewLod.stride,1);
  e.scene.atmosphere='temperature-lapse';
  assert.equal(view.build(e,'A',{animationMode:'physical',quality:'fast'}).quality,'accurate');
  assert.throws(()=>view.build(e,'A',{quality:'invented'}),/optics choice/);
});

test('Independent animation overlays draw eye-level and certified traced horizon only on Accurate',()=>{
  const e=snapshot(),drawn=[],calls=[];
  e.display.eyeLevel=true;const before=structuredClone(e);
  class FakeModel { Update(){this.camViewAngle=.25;this.rFEarth=6371000;} }
  const ctx={save(){},restore(){},setTransform(){},setLineDash(){},beginPath(){},
    moveTo(){},lineTo(){},stroke(){drawn.push('stroke');},fillText(text){drawn.push(text);}};
  const graph={Canvas:{width:900,height:600,getContext(){return ctx;}}};
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical:(g,m,o)=>{
    calls.push(o.opticalQuality);return {};}},horizon:{diagnose(args){
    calls.push(args);return {status:'resolved',angleDegrees:-.12};
  }}});
  const a=view.render(e,'A',graph,{animationMode:'physical'});
  assert.equal(a.quality,'accurate');
  assert.equal(a.overlays.eyeLevel,'drawn');
  assert.match(a.overlays.horizon,/drawn/);
  assert.ok(drawn.includes('Eye level · 0°'));
  assert.ok(drawn.includes('Traced horizon · -0.1200°'));
  assert.equal(calls.filter(c=>typeof c==='object').length,1);
  view.render(e,'A',graph,{animationMode:'physical'});
  assert.equal(calls.filter(c=>typeof c==='object').length,1,'cached per viewport');
  drawn.length=0;
  const fast=view.render(e,'A',graph,{animationMode:'physical',quality:'fast'});
  assert.equal(fast.overlays.eyeLevel,'drawn');
  assert.equal(fast.overlays.horizon,'disabled in Fast Preview');
  assert.ok(!drawn.some(s=>s.startsWith('Traced horizon')),'no false horizon in Fast');
  assert.deepEqual(e,before,'rendering never changes saved experiment');
});

test('Unresolved or outside-view traced horizon is diagnosed without a fabricated stripe',()=>{
  const e=snapshot(),drawn=[];e.display.eyeLevel=true;
  class FakeModel {Update(){this.camViewAngle=.25;this.rFEarth=6371000;}}
  const ctx={save(){},restore(){},setTransform(){},setLineDash(){},beginPath(){},
    moveTo(){},lineTo(){},stroke(){},fillText(text){drawn.push(text);}};
  const graph={Canvas:{width:900,height:600,getContext:()=>ctx}};
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical:()=>({})},
    horizon:{diagnose:()=>({status:'unresolved',reason:'No tangent'})}});
  const out=view.render(e,'A',graph,{animationMode:'physical'});
  assert.match(out.overlays.horizon,/unresolved/);
  assert.ok(!drawn.some(text=>text.startsWith('Traced horizon')));
  e.display.eyeLevel=false;
  const out2=view.render(e,'B',graph,{animationMode:'physical'});
  assert.equal(out2.overlays.eyeLevel,'disabled');
});

test('Playback quality and rendered frame time are displayed distinctly from the clock',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/id="ModernAnimationPlaybackOptics"/);
  assert.match(html,/id="ModernAnimationPlaybackDiagnostics"/);
  assert.match(app,/var renderedAt=studioPlayback.status\(\).positionMs/);
  assert.match(app,/studioPlaybackRenderedAt=renderedAt/);
  assert.match(app,/image at /);
  assert.match(app,/studioPrepared.mode/);
});

test('Unsupported fast frame falls back to Accurate, then skips repeated failed fast attempts',()=>{
  const source=snapshot(),before=structuredClone(source),calls=[];
  class FakeModel {Update(){}}
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical:(graph,model,options)=>{
    calls.push({quality:options.opticalQuality,geometry:model.showModel});
    if(options.opticalQuality==='fast')throw RangeError(
      'Fast Preview is unavailable for standard on globe; select Accurate (RK4).');
    return {drawn:42};
  }}});
  const graph={Canvas:{}};
  const first=view.render(source,'A',graph,{quality:'fast',animationMode:'physical'});
  assert.equal(first.quality,'accurate');assert.equal(first.result.drawn,42);
  assert.match(first.fallback,/Fast Preview is unavailable/);
  assert.equal(first.fallbackCount,1);
  assert.deepEqual(calls.map(x=>x.quality),['fast','accurate']);
  const second=view.render(source,'A',graph,{quality:'fast',animationMode:'physical'});
  assert.equal(second.quality,'accurate');assert.ok(second.fallback);
  assert.equal(second.fallbackCount,1,'fallback should be counted once per failed probe');
  assert.deepEqual(calls.map(x=>x.quality),['fast','accurate','accurate']);
  assert.deepEqual(source,before,'recovery must not mutate source snapshot');
});

test('Fast recovery does not mask arbitrary errors or a failing Accurate retry',()=>{
  const source=snapshot(),graph={Canvas:{}};
  class FakeModel {Update(){}}
  const unexpected=preview.create({Model:FakeModel,renderer:{renderPhysical:()=>{
    throw RangeError('Unexpected optical failure');
  }}});
  assert.throws(()=>unexpected.render(source,'A',graph,{quality:'fast'}),
    /Unexpected optical failure/);
  let attempts=0;
  const brokenAccurate=preview.create({Model:FakeModel,renderer:{renderPhysical:(g,m,o)=>{
    attempts++;
    if(o.opticalQuality==='fast')throw RangeError(
      'Fast Preview is unavailable for standard on globe; select Accurate (RK4).');
    throw Error('RK4 solver failed');
  }}});
  assert.throws(()=>brokenAccurate.render(source,'A',graph,{quality:'fast'}),/RK4 solver failed/);
  assert.equal(attempts,2,'exactly one Accurate retry');
});

test('Playback status reports the actual rendered quality and fallback count',()=>{
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(app,/Fast fallback\(s\):/);
  assert.match(app,/b&&b\.fallback&&a\.quality==='fast'/);
  assert.match(app,/quality:'accurate',animationMode:studioPrepared\.mode/);
});

test('Globe to Flat reaches the terminal frame after a fast rejection without clock mutation',()=>{
  const globe=snapshot(),flat=structuredClone(globe);
  flat.scene.surface.showModel=2;
  const p=project.create([{experiment:globe},{experiment:flat,travelMs:5000}],
    {id:'fallback_terminal',name:'Curvature recovery'});
  const controller=playback.create(p),seen=[];
  class FakeModel {Update(){}}
  const renderer=preview.create({Model:FakeModel,renderer:{renderPhysical:(g,m,o)=>{
    seen.push({quality:o.opticalQuality,flat:m.showModel===2});
    if(o.opticalQuality==='fast')throw RangeError(
      'Fast Preview is unavailable for standard on globe; select Accurate (RK4).');
    return {drawn:12};
  }}});
  controller.start(100);
  controller.tick(3600);
  const intermediate=renderer.render(controller.sample(),'A',{Canvas:{}},
    {quality:'fast',animationMode:'physical'});
  assert.equal(intermediate.quality,'accurate');
  controller.tick(5100);
  assert.equal(controller.status().playing,false);
  assert.equal(controller.status().positionMs,5000);
  const terminal=renderer.render(controller.sample(),'A',{Canvas:{}},
    {quality:'fast',animationMode:'physical'});
  assert.equal(terminal.quality,'accurate');
  assert.equal(seen.at(-1).flat,true);
  assert.equal(controller.sample().scene.surface.showModel,2);
});
