'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/diagnostics/LegacyDemoPerformance.js'),'utf8');

function harness(){
  let now=0,playing=true,draws=0,timerId=0;
  const timers=new Map(),updates=[];
  const graph={drawEnabled:true,DrawFunc(){draws++;now+=2;},
    Draw(){if(this.drawEnabled)this.DrawFunc();}};
  const original=graph.Draw,originalFunc=graph.DrawFunc;
  const root={};vm.runInNewContext(source,{window:root});
  const meter=root.CurvatureLegacyDemoPerformance.create({graph,
    now:()=>now,isPlaying:()=>playing,onUpdate:v=>updates.push(v),
    setInterval:fn=>{const id=++timerId;timers.set(id,fn);return id;},
    clearInterval:id=>timers.delete(id)});
  return {meter,graph,original,originalFunc,updates,timers,
    setNow:v=>now=v,advance:v=>{now+=v;},playing:v=>{playing=v;},get draws(){return draws;}};
}

test('Legacy FPS counts completed scene draws rather than skipped GraphX3DX requests',()=>{
  const h=harness();h.graph.drawEnabled=false;h.graph.Draw();
  assert.equal(h.updates.at(-1).drawCount,0);
  h.graph.drawEnabled=true;
  h.graph.Draw();h.advance(16);h.graph.Draw();h.advance(16);h.graph.Draw();
  h.meter.refresh();
  assert.equal(h.draws,3);
  assert.equal(h.updates.at(-1).drawCount,3);
  assert.ok(h.updates.at(-1).drawFps>70&&h.updates.at(-1).drawFps<90);
  assert.equal(h.updates.at(-1).playing,true);
  h.meter.dispose();
  assert.equal(h.graph.Draw,h.original);
  assert.equal(h.graph.DrawFunc,h.originalFunc);
  assert.equal(h.timers.size,0);
});

test('Live FPS drops stale samples and resets without a recording mode',()=>{
  const h=harness();h.graph.Draw();h.meter.refresh();
  assert.equal(h.updates.at(-1).drawCount,1);
  h.meter.reset();assert.equal(h.updates.at(-1).drawCount,0);
  h.graph.Draw();h.advance(2400);h.meter.refresh();
  assert.equal(h.updates.at(-1).drawCount,0,'a stale draw is not a live frame');
  h.playing(false);h.meter.refresh();
  assert.equal(h.updates.at(-1).playing,false);
  h.setNow(10);h.meter.refresh();
  assert.equal(h.updates.at(-1).drawCount,0,'backwards clocks start a new window');
  assert.equal(typeof h.meter.start,'undefined');
  assert.equal(typeof h.meter.cancel,'undefined');
  h.meter.dispose();
});

test('Only the dedicated Demos host loads FPS telemetry',()=>{
  const html=fs.readFileSync(require('node:path').join(__dirname,'../CurvatureDemosHost.html'),'utf8');
  const legacy=fs.readFileSync(require('node:path').join(__dirname,'../CurvatureApp.html'),'utf8');
  assert.match(html,/src="src\/diagnostics\/LegacyDemoPerformance\.js"/);
  assert.doesNotMatch(legacy,/LegacyDemoPerformance\.js/);
});
