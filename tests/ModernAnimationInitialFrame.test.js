'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const lifecycle=require('../src/animation/ModernAnimationPreviewLifecycle');
const playbackControls=require('../src/animation/ModernAnimationPlaybackControls');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');

// Run ModernApp's real lifecycle wiring over the extracted coordinator with
// a deterministic RAF clock, no physical renderer and no Scene dependency.
function harness(){
  const begin=app.indexOf('  function cancelStudioInitialPaint(){');
  const end=app.indexOf('  function syncStudioCameraHud(',begin);
  assert.ok(begin>0&&end>begin);
  const queue=new Map(),elements=new Map(),paints=[],navigation=[];
  let id=0,position=0,fail=false,modeOpen=true,width=640,visible=true,pending=false,playing=false;
  let observerCallback=null;
  const node=name=>{
    if(!elements.has(name))elements.set(name,{hidden:name!=='ModernAnimationStudioMessage',textContent:'',
      classList:{add(){},toggle(){}},getBoundingClientRect(){return {width};}});
    return elements.get(name);
  };
  const context={
    studioPreviewLifecycleApi:lifecycle,
    studioPreviewLifecycle:null,studioRestorePreviewPending:false,
    studioPlaybackLastPaint:0,studioPlaybackRenderedAt:null,
    studioPreviewNavigation:{start(){pending=true;},cancel(){pending=false;},
      finish(target){if(!pending)return false;pending=false;navigation.push(target);return true;},
      isPending(){return pending;}},
    studioPlayback:{status(){return {positionMs:position,playing};}},
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
    root:{ResizeObserver:class{
      constructor(fn){observerCallback=fn;}
      observe(){}
    },addEventListener(){}}
  };
  Object.defineProperty(context,'animationWorkspaceOpen',{get(){return modeOpen;}});
  vm.runInNewContext(app.slice(begin,end),context,{filename:'preview-lifecycle.js'});
  function frame(){const batch=[...queue.values()];queue.clear();batch.forEach(cb=>cb());}
  function flush(){for(let i=0;i<3;i++)frame();}
  return {ctx:context,node,paints,navigation,frame,flush,queued:()=>queue.size,
    resized:()=>observerCallback(),
    setPosition(ms){position=ms;},setWidth(value){width=value;},
    setVisible(value){visible=value;},setOpen(value){modeOpen=value;},
    setFail(value){fail=value;},setPlaying(value){playing=value;}};
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
  h.ctx.observeStudioPreviewSize();
  h.resized();h.flush();assert.deepEqual(h.paints,[0]);
  h.resized();h.flush();assert.deepEqual(h.paints,[0]);
  h.setWidth(400);h.resized();h.flush();assert.deepEqual(h.paints,[0,0]);
});

test('Prepare, restoration, Stop, Seek and workspace entry are connected to frame rendering',()=>{
  assert.match(app,/if\(studioPlayback\)\{[\s\S]{0,165}scheduleStudioInitialPaint\('prepared'\)/);
  assert.match(app,/if\(studioPlayback&&animationWorkspaceOpen\)scheduleStudioInitialPaint\('restored'\)/);
  assert.match(app,/controls.stop\(\)/);
  assert.match(playbackControls.create.toString(),/player.stop\(\)/);
  assert.match(app,/studioPlayback\.seek\(saved\.positionMs,profileNow\(\)\)/);
  assert.match(app,/animationWorkspaceOpen=true;syncWorkspaceVisibility\(\);\s*if\(studioPlayback\)scheduleStudioInitialPaint\('opened'\)/);
  assert.match(app,/controls.seek\(seek.value\)/);
  assert.match(playbackControls.create.toString(),/player.seek\(player.status\(\).durationMs\*Number\(raw\)\/1000,options.now\(\)\)/);
  assert.match(app,/render:function\(force\)/);
  assert.match(app,/return renderStudioPlaybackSample\(force\)/);
  assert.match(app,/sync:syncStudioPlaybackControls/);
  assert.match(html,/id="ModernAnimationFrameLoadingA"/);
  assert.match(html,/id="ModernAnimationFrameLoadingB"/);
  assert.match(html,/id="ModernAnimationPlaybackRetry"/);
});


test('new preview lifecycle loads as a classic script before ModernApp',()=>{
  const filename='src/animation/ModernAnimationPreviewLifecycle.js';
  assert.ok(html.indexOf(filename)>html.indexOf('src/animation/ModernAnimationPreview.js'));
  assert.ok(html.indexOf(filename)<html.indexOf('src/ui/modern/ModernApp.js'));
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,filename),'utf8'),context);
  assert.equal(typeof context.CurvatureModernAnimationPreviewLifecycle.create,'function');
  assert.equal(vm.runInContext('typeof require',context),'undefined');
  assert.match(app,/studioPreviewLifecycleApi\.create\(/);
  assert.match(app,/studioPreviewLifecycle\.hasFrame\(\)/);
});

test('clearing a prepared preview cancels delayed RAF callbacks after a new generation',()=>{
  const h=harness();h.setPosition(500);
  h.ctx.scheduleStudioInitialPaint('prepared');
  h.frame();
  h.ctx.cancelStudioInitialPaint();
  assert.equal(h.queued(),0);
  h.flush();assert.deepEqual(h.paints,[]);
  assert.equal(h.ctx.studioPreviewLifecycle.hasFrame(),false);
  h.ctx.scheduleStudioInitialPaint('retry');
  h.flush();assert.deepEqual(h.paints,[500]);
});

test('scheduling a hidden preview invalidates a pending visible paint',()=>{
  const h=harness();h.ctx.scheduleStudioInitialPaint('prepared');
  h.setOpen(false);h.ctx.scheduleStudioInitialPaint('restored');
  h.flush();assert.deepEqual(h.paints,[]);
  assert.equal(h.ctx.studioRestorePreviewPending,true);
  h.setOpen(true);h.ctx.scheduleStudioInitialPaint('opened');
  h.flush();assert.deepEqual(h.paints,[0]);
});

test('invalid lifecycle dependencies fail explicitly instead of silently skipping frames',()=>{
  assert.throws(()=>lifecycle.create({}),/frame scheduling/);
});

test('rapid keyframe navigation paints only the latest arrival and does not scroll',()=>{
  const h=harness();h.setPosition(8500);h.setWidth(0);
  h.ctx.scheduleStudioInitialPaint('keyframe');h.frame();
  h.setWidth(640);h.setPosition(20950);h.ctx.scheduleStudioInitialPaint('keyframe');
  assert.match(h.node('ModernAnimationPlaybackStatus').textContent,/20\.95 s ready/);
  assert.deepEqual(h.paints,[20950],'visible keyframe paints without waiting for RAF');
  h.flush();assert.deepEqual(h.paints,[20950]);
  assert.deepEqual(h.navigation,[]);
  assert.equal(h.ctx.studioPlaybackRenderedAt,20950);
});

test('ModernApp keyframe routing prepares a compatible draft and leaves incompatible or excluded cards alone',()=>{
  const studio=require('../src/animation/ModernAnimationStudio');
  const projects=require('../src/animation/ModernAnimationProject');
  const playback=require('../src/animation/ModernAnimationPlayback');
  const [demo]=require('../src/animation/ModernDemoCatalog').load();
  const draft=studio.fromProject(demo.project),effects=[];
  const context={studioApi:studio,studioProjects:projects,studioPlaybackApi:playback,
    studioDraft:draft,studioPrepared:null,studioPlayback:null,studioActiveDemo:null,
    studioKeyframeThumbnails:null,
    studioPlaybackRenderedAt:0,studioPreviewNavigation:{cancel(){effects.push('cancel navigation');}},
    stopStudioPlayback(clear){assert.equal(clear,true);effects.push('stop');},
    ensureStudioPlaybackControls(){return {jumpTo(ms){
      assert.equal(context.studioPlaybackRenderedAt,null);
      context.studioPlayback.seek(ms,1000);effects.push(ms);
    }};}};
  const begin=app.indexOf('  function navigateStudioKeyframe(');
  const end=app.indexOf('  // Animation Studio owns',begin);
  assert.ok(begin>0&&end>begin);vm.runInNewContext(app.slice(begin,end),context);
  assert.equal(context.navigateStudioKeyframe(draft.frames[3].key),true);
  assert.deepEqual(effects,['stop','cancel navigation',20950]);
  assert.equal(context.studioPlayback.status().positionMs,20950);
  assert.equal(context.studioDraft,draft);
  context.studioActiveDemo=demo;context.studioPrepared=demo.project;
  assert.equal(context.navigateStudioKeyframe(draft.frames[0].key),false);
  assert.equal(context.studioPlayback.status().positionMs,0);
  effects.length=0;
  context.studioDraft={...draft,activeFrameKeys:[draft.frames[0].key,draft.frames[1].key]};
  assert.equal(context.navigateStudioKeyframe(draft.frames[3].key),false);
  assert.deepEqual(effects,[]);
  context.studioActiveDemo=null;context.studioPrepared=null;context.studioPlayback=null;
  context.studioDraft={...draft,frames:[draft.frames[0]]};
  assert.equal(context.navigateStudioKeyframe(draft.frames[0].key),false);
  assert.deepEqual(effects,[]);
});

// Exercise the real controls together with ModernApp's actual lifecycle wiring,
// rather than treating an enqueued paint as proof of a visible frame.
test('keyframe jumps paint before Play, after Pause, Stop and completion',()=>{
  const h=harness();
  const [demo]=require('../src/animation/ModernDemoCatalog').load();
  const player=require('../src/animation/ModernAnimationPlayback').create(demo.project);
  h.ctx.studioPlayback=player;
  // Keep the fake renderer's sampled time in step with the real player.
  const paint=h.ctx.renderStudioPlaybackSample;
  h.ctx.renderStudioPlaybackSample=force=>{h.setPosition(player.status().positionMs);paint(force);};
  const c=playbackControls.create({player:()=>player,now:()=>1000,open:()=>true,
    mode:()=> 'camera',pending:()=>h.ctx.studioRestorePreviewPending,
    requestFrame:h.ctx.requestAnimationFrame,cancelFrame:h.ctx.cancelAnimationFrame,
    cancelInitial:h.ctx.cancelStudioInitialPaint,render:h.ctx.renderStudioPlaybackSample,
    sync(){},save(){},scheduleInitial:h.ctx.scheduleStudioInitialPaint,announce(){}});
  function jump(ms){
    h.ctx.studioPlaybackRenderedAt=null;c.jumpTo(ms);
    assert.equal(player.status().playing,false);
    assert.equal(h.ctx.studioPlaybackRenderedAt,ms);
    assert.equal(h.paints.at(-1),ms);
    assert.equal(h.queued(),0);
  }
  jump(20950);c.play();c.pause();jump(8500);c.stop();jump(15000);
  player.seek(player.status().durationMs,1000);jump(35400);
});

test('a hidden or zero-width keyframe stage still defers until layout is available',()=>{
  const h=harness();h.setPosition(8500);h.setVisible(false);
  h.ctx.scheduleStudioInitialPaint('keyframe');assert.deepEqual(h.paints,[]);
  h.setVisible(true);h.setWidth(0);h.ctx.scheduleStudioInitialPaint('keyframe');
  h.frame();h.frame();assert.deepEqual(h.paints,[]);
  h.setWidth(640);h.frame();assert.deepEqual(h.paints,[8500]);
});

test('a paused render that produces no pixels is not announced as ready',()=>{
  const h=harness();h.setPosition(8500);h.ctx.renderStudioPlaybackSample=()=>{};
  h.ctx.scheduleStudioInitialPaint('keyframe');
  assert.match(h.node('ModernAnimationPlaybackStatus').textContent,/requested paused frame was not rendered/);
  assert.equal(h.ctx.studioRestorePreviewPending,true);
  assert.equal(h.node('ModernAnimationFrameLoadingA').hidden,false);
});

test('Soundly explicit jump requests and captures an exact paused thumbnail through ModernApp',()=>{
  const studio=require('../src/animation/ModernAnimationStudio');
  const projects=require('../src/animation/ModernAnimationProject');
  const playback=require('../src/animation/ModernAnimationPlayback');
  const thumbnails=require('../src/ui/modern/ModernExperimentThumbnail');
  const [demo]=require('../src/animation/ModernDemoCatalog').load();
  const draft=studio.fromProject(demo.project),cache=thumbnails.createKeyframeCache();
  const graphs={A:{Canvas:{width:800,height:500}},B:{Canvas:{width:800,height:500}}};
  let captures=0,refreshes=0;
  const context={studioApi:studio,studioProjects:projects,studioPlaybackApi:playback,
    studioDraft:draft,studioPrepared:demo.project,studioPlayback:playback.create(demo.project),studioActiveDemo:demo,
    studioSelectedKey:draft.frames[3].key,studioKeyframeThumbnails:cache,
    studioThumbnailProject:null,studioThumbnailExperiments:null,studioHistoryEntries:[],
    studioPlaybackRenderedAt:null,studioPreviewNavigation:null,document:{activeElement:null},newUiEl:()=>null,
    renderAnimationStudio(){refreshes++;},
    thumbnailApi:{...thumbnails,capture(doc,mode,views){captures++;assert.equal(mode,'compare');
      assert.equal(views.length,2);assert.equal(views[0].layers[0],graphs.A.Canvas);
      assert.equal(views[1].layers[0],graphs.B.Canvas);
      return {mode,width:960,height:300,dataUrl:'data:image/webp;base64,YQ=='};}},
    ensureStudioPlaybackControls(){return {jumpTo(ms){
      context.studioPlayback.seek(ms,1000);
      assert.equal(ms,20950);
    }};}};
  const begin=app.indexOf('  function studioKeyframeExperiment(');
  const end=app.indexOf('  // Animation Studio owns',begin);
  vm.runInNewContext(app.slice(begin,end),context);
  const expected=projects.frameExperiment(demo.project,3);
  assert.equal(context.resolveStudioKeyframe(draft.frames[3],[]).thumbnail,null);
  context.navigateStudioKeyframe(context.studioSelectedKey);
  assert.equal(captures,0);assert.equal(cache.hasPending(),true);
  context.captureStudioKeyframeThumbnail(projects.sampleAt(demo.project,0),0,graphs);
  assert.equal(captures,0);assert.equal(cache.get(expected),null);
  context.navigateStudioKeyframe(context.studioSelectedKey);
  context.captureStudioKeyframeThumbnail(context.studioPlayback.sample(),20950,graphs);
  assert.equal(captures,1);assert.equal(refreshes,1);assert.ok(cache.get(expected));
  context.navigateStudioKeyframe(context.studioSelectedKey);
  assert.equal(cache.hasPending(),false);
  context.navigateStudioKeyframe(context.studioSelectedKey,true);
  context.captureStudioKeyframeThumbnail(context.studioPlayback.sample(),20950,graphs);
  assert.equal(captures,2);assert.equal(refreshes,2);
  assert.equal(context.studioDraft,draft);
});


test('resize compares against the actual last painted width, including live paints and pause',()=>{
  const h=harness();h.ctx.observeStudioPreviewSize();
  h.resized();h.flush();assert.deepEqual(h.paints,[0]);
  h.setPlaying(true);h.setWidth(400);h.resized();assert.equal(h.queued(),0);
  h.ctx.studioPreviewLifecycle.markPainted({A:400,B:400});
  h.setWidth(640);h.resized();assert.equal(h.queued(),0);
  h.setPlaying(false);h.ctx.studioPreviewLifecycle.checkSize();h.flush();
  assert.deepEqual(h.paints,[0,0],'return to old observed width still requires repaint');
  h.ctx.studioPreviewLifecycle.markPainted({A:640,B:640});h.resized();h.flush();
  assert.deepEqual(h.paints,[0,0],'no redundant paint after matching paired render');
});
