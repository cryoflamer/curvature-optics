'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const controls=require('../src/animation/ModernAnimationPlaybackControls');
const preferences=require('../src/ui/modern/ModernApplicationPreferences');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');

function rendererHarness(target='60'){
  let time=1000,playing=true,renderCost=14;
  const paints=[],nodes=new Map();
  function node(id){
    if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,checked:true,
      classList:{toggle(){}}});
    return nodes.get(id);
  }
  const graph=()=>({Canvas:{width:900,height:600}});
  const graphs={A:graph(),B:graph()};
  const fakeRenderer={render(){paints.push(time);time+=renderCost;
    return {quality:'canvas-direct',result:{drawn:128},overlays:{}};}};
  const meter=controls.createPreviewFpsMeter();
  const context=vm.createContext({
    studioPlayback:{status:()=>({playing,positionMs:time-1000,durationMs:100000}),
      sample:()=>({display:{mode:'scene'}})},
    studioPrepared:{mode:'camera',id:'fps_test'},animationWorkspaceOpen:true,
    studioPlaybackFps:target,studioPlaybackLastPaint:-Infinity,studioPlaybackNextDue:-Infinity,
    studioPlaybackRenderedAt:null,
    studioPlaybackFpsMeter:meter,studioPlaybackControlsApi:controls,
    studioPlaybackProfileEnabled:false,studioPlaybackProfiler:null,
    studioPlaybackExperiment:null,
    studioPlaybackQuality:'canvas-direct',studioPlaybackDetail:'full',
    studioPreviewApi:{create:()=>fakeRenderer},studioPreviewRenderer:null,
    studioQualityAudit:null,studioLastParity:null,studioLastQualityFrame:null,
    studioPlaybackApi:{describeSample:()=>''},
    root:{CurvatureModernAnimationGraphs:graphs},
    profileNow:()=>time,newUiEl:node,attachStudioPreviewGraphs:()=>true,
    syncStudioCameraHud(){},studioFrameLoading(){}
  });
  const start=app.indexOf('  function renderStudioPlaybackSample(force,benchmark){');
  const end=app.indexOf('  function syncStudioQualitySummary(){',start);
  assert.ok(start>0&&end>start,'extract real renderer orchestration');
  vm.runInContext(app.slice(start,end)+'\nthis.paint=renderStudioPlaybackSample;',context);
  return {context,meter,paints,node,
    frame(at,forced=false){time=at;context.paint(forced);},
    playing(value){playing=value;},
    cost(value){renderCost=value;}};
}

test('preview caps use paint START timestamps rather than paint completion',()=>{
  assert.equal(controls.previewFrameAllowed('60',1000,1016.667,1016.667,false),true);
  assert.equal(controls.previewFrameAllowed('60',1000,1016.667,1014,false),false);
  assert.equal(controls.previewFrameAllowed('30',1000,1033.333,1016.667,false),false);
  assert.equal(controls.previewFrameAllowed('30',1000,1033.333,1033.333,false),true);
  assert.equal(controls.previewFrameAllowed('15',1000,1066.667,1066.667,false),true);
  assert.equal(controls.previewFrameAllowed('10',1000,1100,1100,false),true);
  assert.equal(controls.previewFrameAllowed('auto',1000,1001,1001,false),true);
  assert.equal(controls.previewFrameAllowed('10',1000,1100,1001,true),true);
  assert.equal(controls.previewFrameAllowed('60',-Infinity,-Infinity,1000,false),true);
  assert.throws(()=>controls.previewFrameAllowed('120',0,1000,1000,false),/Invalid preview FPS/);
});

test('the real preview path sustains 60 FPS with a 14 ms Canvas Direct painter',()=>{
  const h=rendererHarness('60');
  for(let i=0;i<60;i++)h.frame(1000+i*1000/60);
  assert.equal(h.paints.length,60,
    '60 Hz input with a 14 ms painter must not be throttled to 30 FPS');
  assert.ok(Math.abs(h.meter.fps(2000)-60)<0.1);
  assert.equal(h.context.studioPlaybackLastPaint,1000+59*1000/60,
    'stored paint time is the start, not the end of the render');
  h.playing(false);h.frame(2000,true);
  assert.equal(h.meter.fps(2014),null,'paused forced redraw does not count as playback');
});

test('30, 15 and 10 FPS caps skip excess browser ticks without changing the playhead',()=>{
  for(const [target,expected] of [['30',30],['15',15],['10',10]]){
    const h=rendererHarness(target);
    for(let i=0;i<60;i++)h.frame(1000+i*1000/60);
    assert.equal(h.paints.length,expected,target+' FPS from a 60 Hz refresh');
    assert.ok(Math.abs(h.meter.fps(2000)-expected)<0.1,target+' actual FPS');
  }
  const highRefresh=rendererHarness('60');
  highRefresh.cost(5);
  for(let i=0;i<144;i++)highRefresh.frame(1000+i*1000/144);
  assert.ok(highRefresh.paints.length>=59&&highRefresh.paints.length<=61,
    '60 FPS on a 144 Hz screen must alternate frame gaps instead of falling to 48');
  const auto=rendererHarness('auto');
  for(let i=0;i<12;i++)auto.frame(1000+i*1000/120);
  assert.equal(auto.paints.length,12,'Auto follows display refresh without an artificial 120 ms delay');
});

test('FPS meter uses a recent window, discards stale samples and resets on a time jump',()=>{
  const meter=controls.createPreviewFpsMeter();
  for(let i=0;i<31;i++)meter.record(i*1000/30);
  assert.ok(Math.abs(meter.fps(1000)-30)<0.1);
  assert.equal(meter.fps(2000),null,'an old reading cannot masquerade as live FPS');
  meter.record(500);
  assert.equal(meter.fps(500),null,'backward clocks discard the previous window');
  meter.reset();
  assert.equal(meter.fps(1000),null);
});

test('preview FPS belongs to browser preferences and is independent of PNG/video export',()=>{
  assert.match(html,/id="ModernAnimationPlaybackFps"/);
  assert.match(html,/id="ModernAnimationPlaybackActualFps"/);
  for(const value of ['auto','10','15','30','60'])
    assert.match(html,new RegExp('<option value="'+value+'"'));
  assert.equal(preferences.defaults().studioPlaybackFps,'auto');
  for(const value of ['10','15','30','60']){
    let data;
    const storage={getItem:()=>data||null,setItem:(key,val)=>{data=val;}};
    preferences.write(storage,{studioPlaybackFps:value});
    assert.equal(preferences.read(storage).studioPlaybackFps,value);
  }
  assert.equal(preferences.normalize({studioPlaybackFps:'300'}).studioPlaybackFps,'auto');
  assert.match(app,/studioPlaybackFps=remembered.studioPlaybackFps/);
  assert.match(app,/studioPlaybackFps:studioPlaybackFps/);
  assert.doesNotMatch(app,/studioDraft\.studioPlaybackFps\s*=/);
  assert.doesNotMatch(app,/studioPrepared\.studioPlaybackFps\s*=/);
});

test('profiled preview returns measurable stages without changing the sample or pacing',()=>{
  const h=rendererHarness('30');
  h.context.studioPlaybackProfileEnabled=true;
  h.context.studioPlaybackProfiler={};
  h.frame(1000);
  const report=h.context.paint(true);
  assert.equal(report.painted,true);
  assert.ok(report.rendererMs>=14);
  assert.ok(report.prepareMs>=0&&report.postMs>=0);
  assert.equal(report.A,null,'missing backend timings stay unknown, never invented');
  assert.equal(h.paints.length,2);
  h.context.studioPlaybackProfileEnabled=false;
  assert.equal(h.context.paint(true),undefined);
});
