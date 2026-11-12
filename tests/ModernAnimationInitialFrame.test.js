'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');

// Run the actual startup/resize coordinator with a deterministic paint clock.
// It must not depend on the full physical renderer or the live Scene state.
function harness(){
  const begin=app.indexOf('  function cancelStudioInitialPaint(){');
  const end=app.indexOf('  function renderStudioPlaybackSample(force){');
  assert.ok(begin>0&&end>begin);
  const queue=new Map(),elements=new Map(),paints=[],navigation=[];
  let id=0,position=0,fail=false,modeOpen=true,width=640,visible=true,pending=false;
  const node=name=>{
    if(!elements.has(name))elements.set(name,{hidden:name!=='ModernAnimationStudioMessage',textContent:'',
      classList:{add(){}},getBoundingClientRect(){return {width};}});
    return elements.get(name);
  };
  const context={
    studioInitialPaintFrame:null,studioInitialPaintToken:0,studioRestorePreviewPending:false,
    studioPlaybackLastPaint:0,studioPlaybackRenderedAt:null,
    studioPreviewObservedWidths:{A:0,B:0},
    studioPreviewNavigation:{start(){pending=true;},cancel(){pending=false;},
      finish(target){if(!pending)return false;pending=false;navigation.push(target);return true;},
      isPending(){return pending;}},
    studioPlayback:{status(){return {positionMs:position,playing:false};}},
    studioPrepared:{mode:'physical'},
    newUiEl:node,
    document:{get hidden(){return !visible;}},
    requestAnimationFrame(fn){const key=++id;queue.set(key,fn);return key;},
    cancelAnimationFrame(key){queue.delete(key);},
    renderStudioPlaybackSample(force){
      assert.equal(force,true);
      if(fail)throw Error('simulated renderer fault');
      paints.push(position);context.studioPlaybackRenderedAt=position;
    },
    syncStudioPlaybackControls(){},
    ResizeObserver:null,
    root:{addEventListener(){}}
  };
  Object.defineProperty(context,'animationWorkspaceOpen',{get(){return modeOpen;}});
  vm.runInNewContext(app.slice(begin,end),context,{filename:'preview-lifecycle.js'});
  function frame(){const batch=[...queue.values()];queue.clear();batch.forEach(cb=>cb());}
  function flush(){for(let i=0;i<3;i++)frame();}
  return {ctx:context,node,paints,navigation,frame,flush,queued:()=>queue.size,
    setPosition(ms){position=ms;},setWidth(value){width=value;},
    setVisible(value){visible=value;},setOpen(value){modeOpen=value;},
    setFail(value){fail=value;}};
}

test('a restored prepared project paints its exact paused position after two layout frames',()=>{
  const h=harness();h.setPosition(3100);
  h.ctx.scheduleStudioInitialPaint('restored');
  assert.equal(h.paints.length,0,'do not paint during state restoration / hidden layout');
  assert.equal(h.node('ModernAnimationFrameLoadingA').hidden,false);
  assert.match(h.node('ModernAnimationPlaybackStatus').textContent,/saved frame/);
  h.frame();assert.equal(h.paints.length,0,'wait for layout to settle');
  h.frame();assert.deepEqual(h.paints,[3100]);
  assert.equal(h.ctx.studioRestorePreviewPending,false);
  assert.equal(h.node('ModernAnimationFrameLoadingA').hidden,true);
  assert.match(h.node('ModernAnimationPlaybackStatus').textContent,/3\.10 s ready/);
  assert.deepEqual(h.navigation,[],
    'project restoration must not automatically scroll the editor');
  assert.equal(h.ctx.studioPlayback.status().playing,false);
});

test('a new prepare cancels an older queued paint; first keyframe renders at t=0',()=>{
  const h=harness();h.setPosition(3100);h.ctx.scheduleStudioInitialPaint('restored');
  h.frame();h.setPosition(0);h.ctx.studioPreviewNavigation.start();
  h.ctx.scheduleStudioInitialPaint('prepared');
  h.flush();assert.deepEqual(h.paints,[0]);
  assert.deepEqual(h.navigation,[h.node('ModernAnimationPlaybackStage')],
    'explicit Preview scrolls only once after the new frame paints successfully');
  h.ctx.cancelStudioInitialPaint();assert.equal(h.queued(),0);
});

test('hidden workspaces do not paint, and opening/visibility can explicitly repaint',()=>{
  const h=harness();h.setOpen(false);h.setPosition(2200);
  h.ctx.scheduleStudioInitialPaint('restored');h.flush();assert.deepEqual(h.paints,[]);
  h.setOpen(true);h.setVisible(false);h.ctx.scheduleStudioInitialPaint('opened');
  h.flush();assert.deepEqual(h.paints,[]);
  h.setVisible(true);h.ctx.scheduleStudioInitialPaint('visible');h.flush();
  assert.deepEqual(h.paints,[2200]);
});

test('missing layout width is retried; failed painting remains explicit and retryable',()=>{
  const h=harness();h.setWidth(0);h.ctx.scheduleStudioInitialPaint('prepared');
  h.frame();h.frame();assert.deepEqual(h.paints,[]);
  assert.equal(h.queued(),1);
  h.setWidth(800);h.setFail(true);h.ctx.studioPreviewNavigation.start();h.frame();
  assert.match(h.node('ModernAnimationPlaybackStatus').textContent,/simulated renderer fault/);
  assert.deepEqual(h.navigation,[h.node('ModernAnimationStudioMessage')],
    'a failed physical paint does not navigate to stale playback');
  assert.match(h.node('ModernAnimationStudioMessage').textContent,/Preview frame failed/);
  assert.equal(h.node('ModernAnimationFrameLoadingA').hidden,false);
  h.setFail(false);h.ctx.scheduleStudioInitialPaint('retry');h.flush();
  assert.deepEqual(h.paints,[0]);
  assert.equal(h.navigation.length,1,
    'retry redraw without a Preview click never navigates again');
  assert.equal(h.node('ModernAnimationFrameLoadingA').hidden,true);
});

test('resize observer requests paused-frame repaint only on actual visible width changes',()=>{
  const h=harness();
  let observerCallback=null;
  h.ctx.root.ResizeObserver=class{constructor(fn){observerCallback=fn;}observe(){} };
  h.ctx.observeStudioPreviewSize();
  observerCallback();h.flush();assert.deepEqual(h.paints,[0]);
  observerCallback();h.flush();assert.deepEqual(h.paints,[0]);
  h.setWidth(400);observerCallback();h.flush();assert.deepEqual(h.paints,[0,0]);
});

test('Prepare, restoration, Stop, Seek and workspace entry are connected to frame rendering',()=>{
  assert.match(app,/if\(studioPlayback\)\{[\s\S]{0,165}scheduleStudioInitialPaint\('prepared'\)/);
  assert.match(app,/if\(studioPlayback&&animationWorkspaceOpen\)scheduleStudioInitialPaint\('restored'\)/);
  assert.match(app,/studioPlayback\.stop\(\);[\s\S]{0,110}scheduleStudioInitialPaint\('first'\)/);
  assert.match(app,/studioPlayback\.seek\(saved\.positionMs,profileNow\(\)\)/);
  assert.match(app,/animationWorkspaceOpen=true;syncWorkspaceVisibility\(\);\s*if\(studioPlayback\)scheduleStudioInitialPaint\('opened'\)/);
  assert.match(app,/studioPlayback\.seek\(studioPlayback\.status\(\).durationMs\*Number\(seek\.value\)\/1000,profileNow\(\)\)/);
  assert.match(app,/renderStudioPlaybackSample\(true\);syncStudioPlaybackControls\(\)/);
  assert.match(html,/id="ModernAnimationFrameLoadingA"/);
  assert.match(html,/id="ModernAnimationFrameLoadingB"/);
  assert.match(html,/id="ModernAnimationPlaybackRetry"/);
});
