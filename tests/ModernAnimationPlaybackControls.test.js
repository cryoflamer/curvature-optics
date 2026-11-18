'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const controlsApi=require('../src/animation/ModernAnimationPlaybackControls');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');

function player(durationMs=3000){
  let position=0,playing=false,last=0;
  const calls={start:0,pause:0,stop:0,seek:0};
  return {
    calls,
    status(){return {positionMs:position,durationMs,playing};},
    start(now){playing=position<durationMs;last=now;calls.start++;return this.status();},
    pause(now){if(playing)position=Math.min(durationMs,position+Math.max(0,now-last));
      playing=false;calls.pause++;return this.status();},
    stop(){position=0;playing=false;calls.stop++;return this.status();},
    seek(ms,now){position=Math.min(durationMs,Math.max(0,ms));last=now;calls.seek++;return this.status();},
    tick(now){position=Math.min(durationMs,position+Math.max(0,now-last));last=now;
      if(position>=durationMs)playing=false;return this.status();}
  };
}
function harness(){
  let now=1000,open=true,hidden=false,pending=false,current=player(),
    failRender=false,renderHook=null,nextId=0;
  const frames=new Map(),renders=[],saves=[],notices=[],initial=[],events=[];
  const options={
    player:()=>current,now:()=>now,open:()=>open,pending:()=>pending,mode:()=> 'camera',
    requestFrame(fn){const id=++nextId;frames.set(id,fn);return id;},
    cancelFrame(id){frames.delete(id);},
    cancelInitial(){events.push('cancel-initial');},
    render(force){if(failRender)throw Error('optics unavailable');
      renders.push({force,at:current.status().positionMs});if(renderHook)renderHook();},
    sync(){events.push('sync');},
    save(continuous){saves.push(continuous);},
    scheduleInitial(reason){initial.push(reason);},
    invalidatePaint(){events.push('invalidate');},
    announce(message,kind){notices.push({message,kind});}
  };
  const controls=controlsApi.create(options);
  function takeFrame(){const [id,fn]=frames.entries().next().value||[];
    assert.ok(fn,'an RAF callback is scheduled');frames.delete(id);return fn;}
  return {controls,frames,renders,saves,notices,initial,events,
    player:()=>current,setPlayer(next){current=next;},
    now(ms){now=ms;},open(value){open=value;},pending(value){pending=value;},
    failRender(value){failRender=value;},onRender(fn){renderHook=fn;},
    takeFrame,frame(ms){takeFrame()(ms);},hidden(value){hidden=value;controls.visibility(hidden);}};
}

test('play/tick/finish preserves the physical clock and allows one outstanding RAF',()=>{
  const h=harness();h.controls.play();
  assert.equal(h.frames.size,1);assert.equal(h.controls.hasFrame(),true);
  assert.deepEqual(h.renders,[{force:true,at:0}]);
  h.controls.schedule();assert.equal(h.frames.size,1,'duplicate scheduling is suppressed');
  h.frame(1500);assert.equal(h.player().status().positionMs,500);
  assert.equal(h.frames.size,1);assert.deepEqual(h.renders.at(-1),{force:false,at:500});
  h.frame(4000);assert.equal(h.player().status().positionMs,3000);
  assert.equal(h.frames.size,0);assert.deepEqual(h.renders.at(-1),{force:true,at:3000});
  assert.equal(h.notices.at(-1).kind,'success');
  assert.deepEqual(h.saves,[false,true,false]);
});

test('pause and stop cancel RAF; a previously captured callback cannot resume playback',()=>{
  const h=harness();h.controls.play();const stale=h.takeFrame();
  h.now(1200);h.controls.pause();
  assert.equal(h.controls.hasFrame(),false);assert.equal(h.player().status().playing,false);
  stale(2000);assert.equal(h.frames.size,0);
  assert.match(h.notices.at(-1).message,/Paused/);
  h.controls.play();h.now(1400);h.controls.stop();
  assert.equal(h.player().status().positionMs,0);
  assert.equal(h.player().calls.stop,1);
  assert.deepEqual(h.initial,['first']);
  assert.equal(h.frames.size,0);
});

test('seek redraws the exact sample while retaining the running clock',()=>{
  const h=harness();h.controls.play();
  h.now(1100);h.controls.seek(500);
  assert.equal(h.player().status().positionMs,1500);
  assert.equal(h.player().status().playing,true);
  assert.equal(h.frames.size,1,'seek reuses the outstanding playback tick');
  assert.deepEqual(h.renders.at(-1),{force:true,at:1500});
  assert.ok(h.events.includes('invalidate'));
  h.frame(1200);assert.equal(h.player().status().positionMs,1600);
  assert.equal(h.renders.at(-1).force,false);
});

test('interpolation or workspace switching cancels an old clock callback',()=>{
  const h=harness();h.controls.play();const stale=h.takeFrame();
  const newClock=player(2000);newClock.seek(700,1500);newClock.start(1500);
  h.controls.cancel();h.setPlayer(newClock);h.controls.schedule();
  stale(1600);
  assert.equal(h.frames.size,1);
  assert.equal(newClock.status().positionMs,700);
  h.frame(1600);assert.equal(newClock.status().positionMs,800);
  h.controls.halt();h.setPlayer(null);
  assert.equal(h.frames.size,0);
  assert.equal(h.controls.hasFrame(),false);
});

test('a render-triggered replacement cannot schedule another tick for the obsolete player',()=>{
  const h=harness();h.controls.play();
  const newClock=player();
  h.onRender(()=>{h.controls.cancel();h.setPlayer(newClock);});
  h.frame(1400);
  assert.equal(h.frames.size,0);
  assert.equal(newClock.calls.start,0);
});

test('visibility pauses playback without auto-resume; pending paused frame is retried',()=>{
  const h=harness();h.controls.play();h.now(1250);h.hidden(true);
  assert.equal(h.player().status().playing,false);
  assert.equal(h.frames.size,0);
  assert.match(h.notices.at(-1).message,/hidden/);
  h.pending(true);h.hidden(false);
  assert.deepEqual(h.initial,['visible']);
  h.open(false);h.hidden(false);
  assert.deepEqual(h.initial,['visible']);
});

test('a rendering failure halts the player, cancels scheduled frames and reports error',()=>{
  const h=harness();h.controls.play();h.failRender(true);
  h.frame(1400);
  assert.equal(h.player().status().playing,false);
  assert.equal(h.frames.size,0);
  assert.match(h.notices.at(-1).message,/Playback failed: optics unavailable/);
  assert.equal(h.notices.at(-1).kind,'error');
});

test('clock display distinguishes sampled frame and supports zero-duration playheads',()=>{
  assert.deepEqual(controlsApi.describe({positionMs:1500,durationMs:3000,playing:true},800),
    {seek:'500',time:'1.50 / 3.00 s (image at 0.80s)',playing:true});
  assert.deepEqual(controlsApi.describe({positionMs:0,durationMs:0,playing:false},null),
    {seek:'0',time:'0.00 / 0.00 s',playing:false});
});

test('browser UMD loads before ModernApp and Play/Pause/Stop/Seek are wired to controller',()=>{
  const filename='src/animation/ModernAnimationPlaybackControls.js';
  assert.ok(html.indexOf(filename)>html.indexOf('src/animation/ModernAnimationPlayback.js'));
  assert.ok(html.indexOf(filename)<html.indexOf('src/ui/modern/ModernApp.js'));
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,filename),'utf8'),context);
  assert.equal(typeof context.CurvatureModernAnimationPlaybackControls.create,'function');
  assert.equal(vm.runInContext('typeof require',context),'undefined');
  for(const method of ['play','pause','stop','seek'])
    assert.match(app,new RegExp('controls\\.'+method+'\\('));
  assert.match(app,/ensureStudioPlaybackControls\(\)\.halt\(\)/);
  assert.match(app,/ensureStudioPlaybackControls\(\)\.cancel\(\)/);
  assert.match(app,/ensureStudioPlaybackControls\(\)\.schedule\(\)/);
});

test('missing coordinator dependencies are rejected, not silently replaced by a stale player',()=>{
  assert.throws(()=>controlsApi.create({}),/live player and UI callbacks/);
});

test('keyframe jump pauses and cancels stale RAF, seeking exact milliseconds independent of slider',()=>{
  const h=harness();h.controls.play();const stale=h.takeFrame();
  h.now(1250);h.events.length=0;
  h.controls.jumpTo(1234.5);
  assert.equal(h.player().status().positionMs,1234.5);
  assert.equal(h.player().status().playing,false);
  assert.equal(h.controls.hasFrame(),false);
  assert.deepEqual(h.events,['cancel-initial','invalidate','sync']);
  assert.deepEqual(h.initial,['keyframe']);
  assert.equal(h.saves.at(-1),false);
  stale(1800);assert.equal(h.player().status().positionMs,1234.5);
  h.controls.play();assert.deepEqual(h.renders.at(-1),{force:true,at:1234.5});
  h.frame(1500);assert.equal(h.player().status().positionMs,1484.5);
  assert.throws(()=>h.controls.jumpTo(-1),/Invalid keyframe time/);
  assert.throws(()=>h.controls.jumpTo(3001),/Invalid keyframe time/);
});
