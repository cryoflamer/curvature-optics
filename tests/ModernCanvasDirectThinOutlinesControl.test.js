'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
const html=fs.readFileSync('CurvatureModern.html','utf8');
const controlsApi=require('../src/animation/ModernAnimationPlaybackControls');
function harness(){
  const elements=new Map(),stats={render:0,stop:0,prefs:0,save:0};
  function node(id){
    if(!elements.has(id))elements.set(id,{id,hidden:false,disabled:false,checked:false,value:'',textContent:'',
      listeners:new Map(),addEventListener(type,fn){
        if(!this.listeners.has(type))this.listeners.set(type,[]);
        this.listeners.get(type).push(fn);},
      emit(type){for(const fn of (this.listeners.get(type)||[]).slice())fn();},
      count(type){return (this.listeners.get(type)||[]).length;}});
    return elements.get(id);
  }
  const context=vm.createContext({studioActiveDemo:null,newUiEl:node,studioPrepared:{mode:'camera'},
    studioPlayback:{status:()=>({durationMs:59100,positionMs:28100,playing:false})},
    studioDraft:{interpolation:'linear'},studioPlaybackDetail:'full',
    studioPlaybackQuality:'canvas-direct',studioPlaybackLastPaint:100,
    studioPlaybackFps:'auto',studioPlaybackFpsMeter:controlsApi.createPreviewFpsMeter(),
    studioPlaybackRenderedAt:28100,profileNow:()=>1000,
    studioPlaybackControlsApi:{describe:()=>({seek:'475',time:'28.1 / 59.1 s',playing:false})},
    ensureStudioPlaybackControls:()=>({play(){},pause(){},stop(){},seek(){},visibility(){}}),
    syncStudioHudAppearance(){},syncStudioFrameExportControls(){},
    saveApplicationPreferences(){stats.prefs++;},saveStudioDraft(){stats.save++;},renderStudioLibrary(){},
    renderStudioPlaybackSample(force){assert.equal(force,true);stats.render++;},
    stopStudioPlayback(){stats.stop++;},
    bindStudioPresentation(){},syncStudioPresentation(){},bindStudioQualityAudit(){},bindStudioCameraHud(){},bindStudioTargetIndicator(){},
    bindStudioFrameExport(){},bindStudioVideoExport(){},observeStudioPreviewSize(){},
    scheduleStudioInitialPaint(){},setStudioPreviewInterpolation(){},
    root:{},document:{hidden:false,addEventListener(){}},studioPreviewRenderer:null});
  const begin=app.indexOf('  function syncCanvasDirectDiagnostics(){');
  const end=app.indexOf('  function previewGraphsReady(){',begin);
  const bind=app.indexOf('  function bindStudioPlayback(){');
  const tail=app.indexOf('  function animationPickerAllEntries(',bind);
  assert.ok(begin>=0&&end>begin&&bind>end&&tail>bind);
  vm.runInContext(app.slice(begin,end)+app.slice(bind,tail)+
    '\nthis.bind=bindStudioPlayback;this.sync=syncStudioPlaybackControls;',context);
  context.bind();return {context,node,stats};
}

test('temporary profiler and benchmark markup are absent; FPS and Thin outlines remain',()=>{
  for(const tag of ['ModernAnimationPlaybackFps','ModernAnimationPlaybackActualFps',
    'ModernCanvasDirectThinOutlines'])assert.match(html,new RegExp('id="'+tag+'"'));
  for(const removed of ['ModernAnimationPlaybackProfiler','ModernAnimationFrameTimingSection',
    'ModernAnimationBenchmarkRun','ModernCanvasDirectFills','ModernDemoBenchmarkRun'])
    assert.doesNotMatch(html,new RegExp('id="'+removed+'"'));
});

test('Thin outlines toggles once without altering playback or saved projects',()=>{
  const h=harness(),box=h.node('ModernCanvasDirectThinOutlines');
  for(let i=0;i<2500;i++)h.context.sync();
  assert.equal(box.count('change'),1);
  assert.equal(h.node('ModernCanvasDirectThinOutlinesControl').hidden,false);
  box.checked=true;box.emit('change');
  assert.equal(h.stats.render,1);
  assert.equal(h.stats.stop,0,'display-only option does not pause the playback clock');
  assert.equal(h.stats.save,0);assert.equal(h.stats.prefs,0);
  assert.equal(h.context.studioPlaybackLastPaint,-Infinity);
  h.context.studioPlaybackQuality='fast';h.context.sync();
  assert.equal(h.node('ModernCanvasDirectThinOutlinesControl').hidden,true);
  box.emit('change');assert.equal(h.stats.render,1,'no Canvas Direct render outside Canvas Direct');
  h.context.studioPlaybackQuality='canvas-direct';h.context.sync();
  box.checked=false;box.emit('change');
  assert.equal(h.stats.render,2,'disabled switch redraws original lines');
  assert.equal(box.count('change'),1);
});
