'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const controlsApi=require('../src/animation/ModernAnimationPlaybackControls');

// Run the actual application sync and binding functions against DOM-like nodes.
// In the regression, every playback tick called sync(), which attached three
// more change handlers. A click after a long animation invoked all of them.
function harness(){
  const elements=new Map(),stats={render:0,stop:0,save:0,preferences:0},calls=[];
  function node(id){
    if(!elements.has(id))elements.set(id,{
      id,hidden:false,disabled:false,checked:true,value:'',textContent:'',
      listeners:new Map(),
      addEventListener(type,fn){
        if(!this.listeners.has(type))this.listeners.set(type,[]);
        this.listeners.get(type).push(fn);
      },
      emit(type){
        const handlers=this.listeners.get(type)||[];
        // Browser event dispatch snapshots the listener list at dispatch start.
        for(const fn of handlers.slice())fn({type,target:this});
      },
      count(type){return (this.listeners.get(type)||[]).length;}
    });
    return elements.get(id);
  }
  const prepared={mode:'camera'};
  const playback={status:()=>({durationMs:59100,positionMs:28100,playing:false})};
  const controls={play(){},pause(){},stop(){},seek(){},visibility(){}};
  const context=vm.createContext({
    newUiEl:node,studioPrepared:prepared,studioPlayback:playback,
    studioDraft:{interpolation:'spline'},studioPlaybackDetail:'full',
    studioPlaybackQuality:'canvas-direct',studioPlaybackLastPaint:42,
    studioPlaybackFps:'auto',studioPlaybackFpsMeter:controlsApi.createPreviewFpsMeter(),
    studioPlaybackRenderedAt:28100,profileNow:()=>1000,
    studioPlaybackControlsApi:{describe:()=>({seek:'475',time:'28.1 / 59.1 s',playing:false})},
    ensureStudioPlaybackControls:()=>controls,
    syncStudioHudAppearance(){},syncStudioFrameExportControls(){},
    saveApplicationPreferences(){stats.preferences++;},saveStudioDraft(){stats.save++;},renderStudioLibrary(){},
    renderStudioPlaybackSample(force){assert.equal(force,true);stats.render++;calls.push('render');},
    stopStudioPlayback(clear){assert.equal(clear,false);stats.stop++;calls.push('stop');context.sync();},
    bindStudioQualityAudit(){},bindStudioCameraHud(){},bindStudioTargetIndicator(){},
    bindStudioFrameExport(){},bindStudioVideoExport(){},observeStudioPreviewSize(){},
    scheduleStudioInitialPaint(){},setStudioPreviewInterpolation(){},
    root:{},document:{hidden:false,addEventListener(){}},
    studioPreviewRenderer:null
  });
  const syncStart=app.indexOf('  function syncCanvasDirectDiagnostics(){');
  const syncEnd=app.indexOf('  function previewGraphsReady(){',syncStart);
  const bindStart=app.indexOf('  function bindStudioPlayback(){');
  const bindEnd=app.indexOf('  function animationPickerAllEntries(',bindStart);
  assert.ok(syncStart>=0&&syncEnd>syncStart&&bindStart>syncEnd&&bindEnd>bindStart);
  vm.runInContext(app.slice(syncStart,syncEnd)+app.slice(bindStart,bindEnd)+
    '\nthis.bind=bindStudioPlayback;this.sync=syncStudioPlaybackControls;',context);
  context.bind();
  return {context,node,stats,calls};
}

const diagnostics=['ModernCanvasDirectFills','ModernCanvasDirectStrokes','ModernCanvasDirectMask'];

test('thousands of playback syncs do not accumulate checkbox listeners',()=>{
  const h=harness();
  for(let i=0;i<2500;i++)h.context.sync();
  assert.equal(h.node('ModernCanvasDirectDiagnostics').hidden,false);
  for(const id of diagnostics)assert.equal(h.node(id).count('change'),1,id);
  h.node('ModernCanvasDirectStrokes').checked=false;
  h.node('ModernCanvasDirectStrokes').emit('change');
  assert.equal(h.stats.stop,1,'one input event pauses the player once');
  assert.equal(h.stats.render,1,'one input event renders precisely one paused frame');
  assert.equal(h.context.studioPlaybackLastPaint,-Infinity);
  for(const id of diagnostics)assert.equal(h.node(id).count('change'),1,id);
  h.node('ModernCanvasDirectFills').checked=false;
  h.node('ModernCanvasDirectFills').emit('change');
  h.node('ModernCanvasDirectMask').checked=false;
  h.node('ModernCanvasDirectMask').emit('change');
  assert.equal(h.stats.render,3,'the three diagnostics redraw once each');
});

test('optics switching keeps diagnostics visible only for Canvas Direct and never throws',()=>{
  const h=harness(),optics=h.node('ModernAnimationPlaybackOptics');
  assert.equal(optics.count('change'),1);
  h.context.sync();
  optics.value='fast';
  optics.emit('change');
  assert.equal(h.context.studioPlaybackQuality,'fast');
  assert.equal(h.node('ModernCanvasDirectDiagnostics').hidden,true);
  h.node('ModernCanvasDirectFills').emit('change');
  assert.equal(h.stats.render,1,'diagnostic checkbox does nothing outside Canvas Direct');
  optics.value='canvas-direct';
  optics.emit('change');
  assert.equal(h.context.studioPlaybackQuality,'canvas-direct');
  assert.equal(h.node('ModernCanvasDirectDiagnostics').hidden,false);
  assert.equal(h.stats.render,2);
  for(const id of diagnostics)assert.equal(h.node(id).count('change'),1,id);
});

test('diagnostics do not start playback or repaint without an active preview',()=>{
  const h=harness();
  h.context.studioPlayback=null;
  h.node('ModernCanvasDirectStrokes').emit('change');
  assert.equal(h.stats.stop,0);
  assert.equal(h.stats.render,0);
  for(let i=0;i<50;i++)h.context.sync();
  for(const id of diagnostics)assert.equal(h.node(id).count('change'),1,id);
});

test('Preview FPS changes once after thousands of syncs and never restart the animation',()=>{
  const h=harness(),fps=h.node('ModernAnimationPlaybackFps');
  for(let i=0;i<2500;i++)h.context.sync();
  assert.equal(fps.count('change'),1,'FPS listener is bound once at startup');
  assert.equal(fps.value,'auto');
  assert.equal(h.node('ModernAnimationPlaybackActualFps').textContent,'Actual: — FPS');
  fps.value='30';fps.emit('change');
  assert.equal(h.context.studioPlaybackFps,'30');
  assert.equal(h.context.studioPlaybackLastPaint,-Infinity);
  assert.equal(h.stats.preferences,1,'local preview preference is saved');
  assert.equal(h.stats.stop,0,'FPS switching must not pause playback');
  assert.equal(h.stats.render,0,'FPS switching must not force a paused redraw');
  assert.equal(h.stats.save,0,'FPS selection must not alter the project draft');
  fps.value='invalid';fps.emit('change');
  assert.equal(fps.value,'auto','unknown values are rejected');
  assert.equal(h.stats.preferences,2);
  assert.equal(fps.count('change'),1);
});
