'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const experiment=require('../src/animation/ModernAnimationPlaybackExperiment');
const profiler=require('../src/animation/ModernAnimationPlaybackProfiler');
const controls=require('../src/animation/ModernAnimationPlaybackControls');
const html=fs.readFileSync('CurvatureModern.html','utf8');
const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');

function previewHarness(){
  let time=1000,positionMs=25000,playing=true;
  const samples=[],renders=[],graph={Canvas:{width:1200,height:800}},nodes=new Map();
  const probe=experiment.create();
  function ui(id){
    if(!nodes.has(id))nodes.set(id,{checked:true,textContent:'',hidden:false,
      classList:{toggle(){}}});
    return nodes.get(id);
  }
  const fakeRenderer={render(sample){renders.push({position:sample.cameraFrame});
    time+=11;
    return {quality:'canvas-direct',result:{drawn:128,timings:{totalMs:11,
      composeMs:0.2,geometryMs:0,projectionMs:5,canvasMs:4}},overlays:{}};}};
  const player={status(){return {playing,positionMs,durationMs:59000};},sample(){
    const sample={display:{mode:'scene'},cameraFrame:positionMs};
    samples.push(sample);
    return sample;
  }};
  const ctx=vm.createContext({
    studioPlayback:player,studioPrepared:{mode:'camera',id:'probe'},animationWorkspaceOpen:true,
    studioPlaybackFps:'auto',studioPlaybackLastPaint:-Infinity,
    studioPlaybackNextDue:-Infinity,studioPlaybackRenderedAt:null,
    studioPlaybackFpsMeter:controls.createPreviewFpsMeter(),
    studioPlaybackControlsApi:controls,studioPlaybackProfileEnabled:true,
    studioPlaybackProfiler:{},studioPlaybackExperiment:probe,
    studioPlaybackQuality:'canvas-direct',studioPlaybackDetail:'full',
    studioPreviewApi:{create:()=>fakeRenderer},studioPreviewRenderer:null,
    studioQualityAudit:null,studioLastParity:null,studioLastQualityFrame:null,
    studioPlaybackApi:{describeSample:()=>''},
    root:{CurvatureModernAnimationGraphs:{A:graph,B:graph}},
    profileNow:()=>time,newUiEl:ui,attachStudioPreviewGraphs:()=>true,
    syncStudioCameraHud(){},studioFrameLoading(){}
  });
  const start=app.indexOf('  function renderStudioPlaybackSample(force){');
  const end=app.indexOf('  function syncStudioQualitySummary(){',start);
  assert.ok(start>0&&end>start);
  vm.runInContext(app.slice(start,end)+'\nthis.paint=renderStudioPlaybackSample;',ctx);
  return {probe,player,renders,samples,ctx,
    move(frame,at){positionMs=frame;time=at;return ctx.paint(false);},
    setPlaying(v){playing=v;},
    ui};
}

test('experiment plans live Normal/Compute and one frozen Replay sample without modifying data',()=>{
  const x=experiment.create(),s=[];
  const factory=()=>{const obj={i:s.length};s.push(obj);return obj;};
  const normal=x.plan(factory,100);
  assert.equal(normal.paint,true);assert.equal(normal.sample.i,0);
  x.setMode('compute');
  const compute=x.plan(factory,200);
  assert.equal(compute.paint,false);assert.equal(compute.sample.i,1);
  x.setMode('replay');
  const frame=x.plan(factory,300);
  const same=x.plan(factory,400);
  assert.equal(same.sample,frame.sample);assert.equal(same.timeMs,300);
  assert.equal(s.length,3,'only the first Replay frame calls live sample');
  x.clear();assert.equal(x.plan(factory,500).timeMs,500);
  assert.throws(()=>x.setMode('skia'),/Invalid Playback experiment mode/);
  assert.throws(()=>x.plan(null,200),/requires a live sample/);
});

test('real Preview orchestration: Compute only runs sampling but never touches graphs or Canvas',()=>{
  const h=previewHarness();h.probe.setMode('compute');
  h.ctx.attachStudioPreviewGraphs=()=>{throw Error('Unexpected graph setup');};
  const first=h.move(26000,1000),second=h.move(27000,1090);
  assert.equal(first.painted,false);assert.equal(first.sampled,true);
  assert.equal(first.rendererMs,null);assert.equal(second.mode,'compute');
  assert.equal(h.samples.length,2,'interpolation still follows advancing playhead');
  assert.equal(h.renders.length,0,'no Canvas rendering or renderer setup');
  assert.equal(h.ctx.studioPlaybackRenderedAt,null,'unchanged pixels are not falsely timestamped');
  assert.equal(h.ctx.studioPlaybackFpsMeter.fps(1090),null,'Actual FPS counts real paints only');
  assert.equal(h.ctx.studioPlaybackLastPaint,1090,'compute ticks retain the same target FPS pacing');
  h.ctx.attachStudioPreviewGraphs=()=>true;
  h.setPlaying(false);
  h.move(28000,1190);
  assert.equal(h.renders.length,1,'paused forced Preview still paints and remains retryable');
});

test('real Preview orchestration: Replay redraws identical sample even when timeline advances',()=>{
  const h=previewHarness();h.probe.setMode('replay');
  const a=h.move(26000,1000),b=h.move(35000,1090),c=h.move(41000,1180);
  assert.equal(a.painted,true);assert.equal(b.mode,'replay');
  assert.equal(c.painted,true);
  assert.deepEqual(h.renders.map(r=>r.position),[26000,26000,26000]);
  assert.equal(h.samples.length,1,'static replay bypasses repeated spline/sample calculation');
  assert.equal(h.ctx.studioPlaybackRenderedAt,26000,'rendered timestamp reflects frozen pixels');
  h.probe.clear();h.move(42000,1270);
  assert.equal(h.renders[3].position,42000,'seeking/start invalidates the frozen sample');
  h.probe.setMode('normal');h.move(43000,1360);
  assert.equal(h.renders[4].position,43000,'normal preview follows live camera again');
});

test('profiler distinguishes compute samples from paints and reports the replay mode',()=>{
  const p=profiler.create({capacity:8,refreshMs:1});p.setEnabled(true);
  p.record({atMs:100,loopMs:4,clockMs:0,syncMs:1,otherMs:0,
    preview:{painted:false,sampled:true,mode:'compute',prepareMs:2,rendererMs:null,postMs:null}});
  p.record({atMs:190,loopMs:4,clockMs:0,syncMs:1,otherMs:0,
    preview:{painted:false,sampled:true,mode:'compute',prepareMs:2,rendererMs:null,postMs:null}});
  assert.equal(p.snapshot().paints,0);assert.equal(p.snapshot().samples,2);
  assert.match(p.report(),/Recent: 2 sampled \/ 2 RAF ticks/);
  assert.match(p.report(),/Sample-to-sample gap: 90\.0 \/ 90\.0/);
  assert.match(p.report(),/Renderer A\/B: —/);
  p.reset();p.record({atMs:300,loopMs:15,clockMs:0,syncMs:1,
    preview:{painted:true,mode:'replay',prepareMs:0,rendererMs:12,postMs:1}});
  assert.match(p.report(),/Mode: Canvas replay/);
  assert.match(p.report(),/Recent: 1 replayed \/ 1 RAF ticks/);
  assert.match(p.report(),/renderer redraws the same sampled camera\/scene/);
});

test('opt-in UI exposes diagnostic controls only on the Modern page and before app bootstrap',()=>{
  assert.match(html,/id="ModernAnimationPlaybackExperiment" disabled/);
  for(const val of ['normal','compute','replay'])
    assert.match(html,new RegExp('<option value="'+val+'"'));
  const marker='src/animation/ModernAnimationPlaybackExperiment.js';
  assert.ok(html.indexOf(marker)>html.indexOf('src/animation/ModernAnimationPlaybackProfiler.js'));
  assert.ok(html.indexOf(marker)<html.indexOf('src/ui/modern/ModernApp.js'));
  assert.match(app,/probe.disabled=!studioPlaybackProfileEnabled/);
  assert.match(app,/studioPlaybackQuality!=='canvas-direct'/);
  assert.match(app,/studioPlaybackExperiment.setMode\('normal'\)/);
  assert.match(app,/studioPlaybackExperiment\.clear\(\)/);
  assert.doesNotMatch(app,/studioDraft\.studioPlaybackExperiment\s*=/);
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(marker,'utf8'),context);
  assert.equal(typeof context.CurvatureModernAnimationPlaybackExperiment.create,'function');
});
