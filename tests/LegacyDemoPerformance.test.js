'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/diagnostics/LegacyDemoPerformance.js'),'utf8');

function harness(){
  let now=0,playing=true,draws=0,timerId=0;
  const timers=new Map(),rafs=new Map(),updates=[],reports=[];
  const canvas={width:1334,height:889,getBoundingClientRect(){return {width:1186,height:791};}};
  const graph={Canvas:canvas,drawEnabled:true,DrawFunc(){draws++;now+=2;},
    Draw(){if(this.drawEnabled)this.DrawFunc();}};
  const original=graph.Draw,originalFunc=graph.DrawFunc;
  const root={};
  vm.runInNewContext(source,{window:root});
  const meter=root.CurvatureLegacyDemoPerformance.create({
    graph,now:()=>now,isPlaying:()=>playing,devicePixelRatio:()=>1.125,
    metadata:()=>({demo:'Soundly',position:2}),
    onUpdate:value=>updates.push(value),onComplete:value=>reports.push(value),
    raf:fn=>{const id=++timerId;rafs.set(id,fn);return id;},
    cancelRaf:id=>rafs.delete(id),
    setInterval:fn=>{const id=++timerId;timers.set(id,fn);return id;},
    clearInterval:id=>timers.delete(id),
    setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},
    clearTimeout:id=>timers.delete(id)
  });
  function tick(){const [id,fn]=rafs.entries().next().value||[];
    if(fn){rafs.delete(id);fn(now);}}
  function finish(){for(const [id,fn] of timers){if(fn!==undefined&&id!==1){timers.delete(id);fn();break;}}}
  return {meter,graph,updates,reports,rafs,timers,tick,finish,original,originalFunc,
    setNow:v=>now=v,advance:v=>{now+=v;},playing:v=>{playing=v;},get draws(){return draws;}};
}

test('Legacy performance counts completed scene renders, not skipped GraphX3DX draw requests',()=>{
  const h=harness();
  h.graph.drawEnabled=false;h.graph.Draw();
  assert.equal(h.updates.at(-1).drawCount,0);
  h.graph.drawEnabled=true;
  h.graph.Draw();h.advance(16);h.graph.Draw();h.advance(16);h.graph.Draw();
  h.meter.refresh();
  assert.equal(h.draws,3);
  const data=h.updates.at(-1);
  assert.equal(data.drawCount,3);
  assert.ok(data.drawFps>70&&data.drawFps<90);
  assert.equal(data.drawCpuMs.count,3);
  assert.equal(data.drawCpuMs.p50,2);
  assert.equal(data.drawGapMs.count,2);
  h.meter.dispose();
  assert.equal(h.graph.Draw,h.original);
  assert.equal(h.graph.DrawFunc,h.originalFunc);
});

test('Benchmark records a ten-second wall-clock window, draw gaps, CPU and RAF intervals',()=>{
  const h=harness();
  assert.equal(h.meter.start(10000),true);
  assert.equal(h.meter.start(10000),false,'cannot start a second recording');
  h.tick();
  h.advance(6);h.tick();
  h.graph.Draw();h.advance(20);h.graph.Draw();
  h.advance(20);h.graph.Draw();
  h.finish();
  assert.equal(h.reports.length,1);
  const report=h.reports[0];
  assert.equal(report.schema,'curvature-legacy-demo-benchmark/1');
  assert.equal(report.drawCount,3);
  assert.equal(report.samples.draws.length,3);
  assert.equal(report.statistics.drawGapMs.count,2);
  assert.equal(report.statistics.drawCpuMs.p50,2);
  assert.equal(report.environment.demo,'Soundly');
  assert.equal(report.environment.canvasStart.width,1334);
  assert.equal(report.environment.canvasStart.cssWidth,1186);
  assert.equal(report.environment.devicePixelRatio,1.125);
  assert.equal(report.statistics.rafGapMs.count,1);
  assert.equal(h.meter.running(),false);
  h.meter.dispose();
});

test('Cancelled recording has no report; resetting live counters retains wrapping',()=>{
  const h=harness();
  h.graph.Draw();h.meter.refresh();assert.equal(h.updates.at(-1).drawCount,1);
  h.meter.reset();assert.equal(h.updates.at(-1).drawCount,0);
  assert.equal(h.meter.start(10000),true);
  h.graph.Draw();assert.equal(h.meter.cancel(),true);
  h.finish();assert.equal(h.reports.length,0);
  h.graph.Draw();h.meter.refresh();assert.equal(h.updates.at(-1).drawCount,2);
  h.playing(false);h.meter.refresh();assert.equal(h.rafs.size,0);
  h.meter.dispose();assert.equal(h.timers.size,0);
});

test('Only the dedicated Demos host loads instrumentation',()=>{
  const html=fs.readFileSync(require('node:path').join(__dirname,'../CurvatureDemosHost.html'),'utf8');
  const legacy=fs.readFileSync(require('node:path').join(__dirname,'../CurvatureApp.html'),'utf8');
  assert.match(html,/src="src\/diagnostics\/LegacyDemoPerformance\.js"/);
  assert.doesNotMatch(legacy,/LegacyDemoPerformance\.js/);
});
