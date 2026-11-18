'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('tools/canvas-stroke-benchmark.html','utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(inline,'self-contained benchmark must have an inline script');
const sandbox = {Math,Date,Number,Error};
vm.runInNewContext(inline[1],sandbox,{filename:'canvas-stroke-benchmark.html'});
const api=sandbox.CanvasStrokeMicrobenchmark;

function mockCanvas() {
  const calls={strokes:[],fills:0,lines:[],moves:[],clears:0};
  const ctx={lineWidth:1,globalAlpha:1,strokeStyle:'black',_scale:1,
    setTransform(x){this._scale=x;},clearRect(){calls.clears++;},fillRect(){calls.fills++;},
    beginPath(){},moveTo(x,y){calls.moves.push([x*this._scale,y*this._scale]);},
    lineTo(x,y){calls.lines.push([x*this._scale,y*this._scale]);},
    fill(){calls.fills++;},
    stroke(){calls.strokes.push({width:this.lineWidth*this._scale,alpha:this.globalAlpha,
      color:this.strokeStyle,join:this.lineJoin});}};
  return {ctx,calls};
}

function scheduledHarness(failAt=0) {
  let currentTime=100,serial=0,finished=null,error=null;
  const scheduled=new Map();const progress=[];
  const runner=api.makeRunner({
    requestFrame(cb){const id=++serial;scheduled.set(id,cb);return id;},
    cancelFrame(id){scheduled.delete(id);},now(){return currentTime;},
    paint(m){if(failAt&&serial>=failAt)throw Error('synthetic failure');currentTime+=m.width;
      return {strokeCalls:1221,fillCalls:1,assignedLineWidth:m.width/m.transform};},
    progress(state){progress.push({done:state.doneFrames,pass:state.passIndex});},
    completed(report){finished=report;},failed(err){error=err;}
  });
  function tick(){assert.equal(scheduled.size,1);const [[id,cb]]=scheduled;
    scheduled.delete(id);currentTime+=16;cb(currentTime);}
  return {runner,tick,scheduled,progress,get result(){return finished;},get error(){return error;}};
}

test('the file is standalone and the five profiles cover the intended independent factors',()=>{
  assert.match(html,/Canvas 2D Stroke Threshold/);
  assert.doesNotMatch(html,/<script\s+src=/);
  assert.doesNotMatch(html,/CurvatureModern\.html|ModernAnimationPlaybackBenchmark\.js/);
  const threshold=api.modesFor('threshold');
  assert.deepEqual(Array.from(threshold,m=>m.width),[.95,.99,1,1.005,1.01,1.025,1.05,1.075,1.1,1.125,1.25]);
  assert.equal(new Set(threshold.map(m=>m.id)).size,threshold.length);
  assert.deepEqual(Array.from(new Set(api.modesFor('geometry').map(m=>m.geometry))),['straight','polyline']);
  assert.deepEqual(Array.from(new Set(api.modesFor('transform').map(m=>m.transform))),[1,1.125]);
  assert.deepEqual(Array.from(new Set(api.modesFor('context').map(m=>m.context))),['default','read-frequently']);
  assert.ok(api.modesFor('scene').every(m=>m.fills));
  const all=api.modesFor('all');
  assert.equal(all.length,new Set(all.map(m=>m.id)).size,'All must not repeat modes');
  assert.throws(()=>api.modesFor('unknown'),/Unknown profile/);
});

test('deterministic 1,221 contour geometry and identical device coordinates across transforms',()=>{
  const paths=api.geometry();
  assert.equal(paths.length,1221);
  assert.equal(paths[0].length,7);
  assert.deepEqual(JSON.stringify(paths),JSON.stringify(api.geometry()));
  const modes=api.modesFor('transform');
  const plain=mockCanvas(),scaled=mockCanvas();
  const p=api.paint(plain.ctx,modes.find(m=>m.width===1.125&&m.transform===1),paths);
  const s=api.paint(scaled.ctx,modes.find(m=>m.width===1.125&&m.transform===1.125),paths);
  assert.equal(p.strokeCalls,1221);assert.equal(s.strokeCalls,1221);
  assert.equal(p.lineToCalls,7326);assert.equal(p.fillCalls,1);
  assert.equal(plain.calls.strokes.length,1221);
  assert.equal(scaled.calls.strokes.length,1221);
  assert.equal(s.assignedLineWidth,1);
  assert.equal(s.effectiveStrokeWidthPx,1.125);
  for(let i=0;i<plain.calls.lines.length;i++) {
    assert.ok(Math.abs(plain.calls.lines[i][0]-scaled.calls.lines[i][0])<1e-9);
    assert.ok(Math.abs(plain.calls.lines[i][1]-scaled.calls.lines[i][1])<1e-9);
  }
  for(let i=0;i<plain.calls.strokes.length;i++) {
    assert.equal(plain.calls.strokes[i].width,scaled.calls.strokes[i].width);
    assert.equal(plain.calls.strokes[i].alpha,scaled.calls.strokes[i].alpha);
    assert.equal(plain.calls.strokes[i].color,scaled.calls.strokes[i].color);
    assert.equal(plain.calls.strokes[i].join,scaled.calls.strokes[i].join);
  }
});

test('scene-like experiment has 1,189 additional fills without changing the 1,221 stroke calls',()=>{
  const paths=api.geometry();
  const {ctx,calls}=mockCanvas();
  const mode=api.modesFor('scene').find(m=>m.width===1.125);
  const result=api.paint(ctx,mode,paths);
  assert.equal(result.fillCalls,1190,'background + 1,189 shapes');
  assert.equal(result.strokeCalls,1221);
  assert.equal(calls.strokes.length,1221);
  assert.equal(calls.fills,1190);
  const straight=mockCanvas();
  assert.equal(api.paint(straight.ctx,api.modesFor('geometry')[0],paths).lineToCalls,1221);
});

test('runner rotates orders, excludes warm-up, and exports exact rows and aggregated stats',()=>{
  const h=scheduledHarness();const modes=api.modesFor('threshold').slice(0,3);
  h.runner.start({warmup:2,samples:10,passes:3,modes,profile:'threshold',environment:{devicePixelRatio:1.125}});
  for(let i=0;h.runner.running()&&i<200;i++)h.tick();
  const r=h.result;assert.ok(r);assert.equal(h.scheduled.size,0);
  assert.equal(r.config.profile,'threshold');assert.equal(r.runs.length,9);
  assert.equal(r.config.strokePrimitives,1221);
  assert.equal(r.environment.devicePixelRatio,1.125);
  assert.deepEqual(Array.from(r.runs.slice(0,3),x=>x.modeId),Array.from(modes,x=>x.id));
  assert.deepEqual(Array.from(r.runs.slice(3,6),x=>x.modeId),Array.from([modes[1],modes[2],modes[0]],x=>x.id));
  assert.deepEqual(Array.from(r.runs.slice(6,9),x=>x.modeId),Array.from([modes[2],modes[0],modes[1]],x=>x.id));
  for(const run of r.runs) {
    assert.equal(run.rows.length,10);
    assert.ok(run.rows.every(row=>row.gapMs>0&&row.drawMs>0));
    assert.equal(run.rows[0].strokeCalls,1221);
  }
  assert.equal(r.summary[modes[0].id].frames,30);
  assert.equal(r.summary[modes[0].id].gapMs.p50>0,true);
  assert.match(r.finishedAt,/^\d{4}-/);
});

test('validation, cancellation, error handling, and percentile calculation work independently',()=>{
  const modes=api.modesFor('threshold').slice(0,2);
  assert.equal(api.percentile([null,4,2,9,1],.5),2);
  assert.equal(api.percentile([],.5),null);
  const h=scheduledHarness();
  assert.throws(()=>h.runner.start({warmup:0,samples:10,passes:1,modes}),/Invalid/);
  h.runner.start({warmup:2,samples:10,passes:1,modes,profile:'threshold'});
  assert.throws(()=>h.runner.start({warmup:2,samples:10,passes:1,modes}),/already running/);
  h.tick();h.tick();
  assert.equal(h.runner.cancel(),true);assert.equal(h.runner.cancel(),false);
  assert.equal(h.scheduled.size,0);assert.equal(h.result,null);
  const failing=scheduledHarness(2);
  failing.runner.start({warmup:2,samples:10,passes:1,modes,profile:'threshold'});
  failing.tick();failing.tick();
  assert.match(failing.error.message,/synthetic failure/);
  assert.equal(failing.runner.running(),false);
  assert.equal(failing.scheduled.size,0);
});
