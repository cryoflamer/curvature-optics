'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const profiler=require('../src/animation/ModernAnimationPlaybackProfiler');
const controls=require('../src/animation/ModernAnimationPlaybackControls');
const html=fs.readFileSync('CurvatureModern.html','utf8');
const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
function paint(at,canvas=6){
  return {atMs:at,clockMs:1,syncMs:4,otherMs:2,loopMs:24+canvas,
    preview:{painted:true,prepareMs:2,rendererMs:13+canvas,postMs:3,
      A:{totalMs:12+canvas,composeMs:1,geometryMs:1,
        projectionMs:8,canvasMs:canvas}}};
}
test('profiling is opt-in, bounded and does not retain source geometry',()=>{
  const p=profiler.create({capacity:3,refreshMs:10});
  assert.equal(p.enabled(),false);
  assert.equal(p.record(paint(100)),null);
  assert.equal(p.snapshot().ticks,0);
  p.setEnabled(true);
  assert.match(p.record(paint(100)),/Canvas Direct A/);
  assert.match(p.record({atMs:116,loopMs:1,clockMs:0,syncMs:1,otherMs:0}),/1 painted \/ 2 RAF ticks/);
  assert.match(p.record(paint(133,12)),/Recent: 2 painted \/ 3 RAF ticks/);
  const s=p.snapshot();
  assert.equal(s.ticks,3);assert.equal(s.skipped,1);
  assert.equal(s.paintGap.p50,33);assert.equal(s.gap.p50,16);
  assert.equal(s.A.count,2);
  assert.equal(s.A.projection.p95,8);assert.equal(s.A.canvas.p95,12);
  assert.equal(s.A.rest.p95,2);
  assert.equal(s.renderer.p95,25);
  assert.match(p.report(),/Canvas 2D calls: 6\.0 \/ 12\.0/);
  p.record({atMs:150,loopMs:1});
  assert.equal(p.snapshot().ticks,3,'old RAF ticks are discarded');
  p.record(paint(10));
  assert.equal(p.snapshot().ticks,1,'a backwards clock starts a fresh window');
  p.setEnabled(false);assert.equal(p.snapshot().ticks,0);
  assert.equal(p.record(paint(20)),null);
});
test('report keeps render time separate from presentation gaps',()=>{
  const p=profiler.create({capacity:5,refreshMs:10});p.setEnabled(true);
  p.record(paint(100));p.record(paint(200));
  const report=p.report();
  assert.match(report,/Paint-to-paint gap: 100\.0 \/ 100\.0/);
  assert.match(report,/RAF callback CPU \(all ticks\): 30\.0 \/ 30\.0/);
  assert.match(report,/Projection \+ clipping/);
  assert.match(report,/excludes deferred GPU\/compositor work/);
  assert.doesNotMatch(report,/100\.0.*Renderer A\/B/);
});
test('live Playback profiler measures tick/render/sync/save, skips and opt-out without touching physics',()=>{
  let clock=1000,frame=null,active=true;const recorded=[];
  const player={running:false,status(){return {playing:this.running,durationMs:10000,positionMs:0};},
    start(){this.running=true;},pause(){this.running=false;},stop(){this.running=false;},
    tick(){return this.status();}};
  const c=controls.create({
    player:()=>player,now:()=>clock,open:()=>true,pending:()=>false,mode:()=> 'camera',
    requestFrame:fn=>{frame=fn;return 1;},cancelFrame:()=>{frame=null;},cancelInitial(){},
    render(force){clock+=12;return force?null:{painted:true,prepareMs:2,rendererMs:8,postMs:2};},
    sync(){clock+=3;},save(){clock+=2;},scheduleInitial(){},announce(){},
    profiler:{enabled:()=>active,record:r=>recorded.push(r)}
  });
  c.play();clock=1100;frame(1100);
  assert.equal(recorded.length,1);
  assert.deepEqual(recorded[0].preview,{painted:true,prepareMs:2,rendererMs:8,postMs:2});
  assert.equal(recorded[0].syncMs,3);assert.equal(recorded[0].otherMs,2);
  assert.equal(recorded[0].loopMs,17);
  active=false;clock=1200;frame(1200);
  assert.equal(recorded.length,1,'disabled profiler never records');
});
test('browser module and controls are wired before ModernApp; HTML is opt-in',()=>{
  const script='src/animation/ModernAnimationPlaybackProfiler.js';
  assert.ok(html.indexOf(script)>html.indexOf('src/animation/ModernAnimationPlaybackControls.js'));
  assert.ok(html.indexOf(script)<html.indexOf('src/ui/modern/ModernApp.js'));
  assert.match(html,/id="ModernAnimationPlaybackProfileEnabled"/);
  assert.match(html,/id="ModernAnimationPlaybackProfileReport"/);
  assert.doesNotMatch(html,/id="ModernAnimationPlaybackProfileEnabled"[^>]*checked/);
  assert.match(app,/studioPlaybackProfileEnabled=false/);
  assert.match(app,/var rendererEnd=profiling\?profileNow\(\):0/);
  assert.match(app,/profiler:\{enabled:function\(\)/);
  const browser=vm.createContext({});
  vm.runInContext(fs.readFileSync(script,'utf8'),browser);
  assert.equal(typeof browser.CurvatureModernAnimationPlaybackProfiler.create,'function');
});
