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
  const calls={strokes:[],fills:0,lines:[],moves:[],arcs:[],closes:0,clears:0};
  const ctx={lineWidth:1,globalAlpha:1,strokeStyle:'black',_scale:1,
    setTransform(x){this._scale=x;},clearRect(){calls.clears++;},fillRect(){calls.fills++;},
    beginPath(){},closePath(){calls.closes++;},arc(x,y,r,a,b){calls.arcs.push([x*this._scale,y*this._scale,r*this._scale,a,b]);},moveTo(x,y){calls.moves.push([x*this._scale,y*this._scale]);},
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

test('the file is standalone and all profiles cover the intended independent factors',()=>{
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

test('workaround modes compare original, union polygon, and thin stroke without changing source paths',()=>{
  for (const profile of ['alternatives','alternatives-scene']) {
    const modes=api.modesFor(profile);
    assert.equal(modes.length,profile==='alternatives'?9:6);
    assert.deepEqual(Array.from(new Set(modes.map(m=>m.method))),['stroke','polygon','thin']);
    assert.equal(new Set(modes.map(m=>m.id)).size,modes.length);
    assert.ok(modes.every(m=>m.comparison && m.geometry==='polyline' && (m.fills === (profile==='alternatives-scene'))));
    assert.ok(modes.every(m=>m.label.includes(' · ')));
  }
  const paths=api.geometry();
  const modes=api.modesFor('alternatives');
  const original=mockCanvas(),poly=mockCanvas(),thin=mockCanvas();
  const r0=api.paint(original.ctx,modes.find(m=>m.width===1.125&&m.method==='stroke'),paths);
  const rp=api.paint(poly.ctx,modes.find(m=>m.width===1.125&&m.method==='polygon'),paths);
  const rt=api.paint(thin.ctx,modes.find(m=>m.width===1.125&&m.method==='thin'),paths);
  assert.equal(r0.strokeCalls,1221);assert.equal(r0.polygonFillCalls,0);
  assert.equal(rp.strokeCalls,0);assert.equal(rp.polygonFillCalls,1221);
  assert.equal(rp.fillCalls,1222,'one union fill per contour plus canvas background');
  assert.equal(rp.polygonLineToCalls,3*7326);
  assert.equal(rp.polygonArcCalls,5*1221);
  assert.equal(poly.calls.strokes.length,0);
  assert.equal(poly.calls.fills,1222);
  assert.equal(poly.calls.arcs.length,5*1221);
  assert.equal(poly.calls.closes,6*1221);
  assert.equal(rt.strokeCalls,1221);assert.equal(rt.effectiveStrokeWidthPx,1);
  assert.equal(rt.requestedStrokeWidthPx,1.125);
  assert.equal(thin.calls.strokes[0].width,1);
  assert.equal(original.calls.strokes[0].width,1.125);
  assert.equal(rp.sourceSegments,r0.sourceSegments);
  const sceneMode=api.modesFor('alternatives-scene').find(m=>m.width===2.5&&m.method==='polygon');
  const sceneCanvas=mockCanvas();const rs=api.paint(sceneCanvas.ctx,sceneMode,paths);
  assert.equal(rs.fillCalls,1+1189+1221);
  assert.equal(rs.polygonFillCalls,1221);
});

test('outline uses non-zero compatible same-winding rectangles and one fill for translucent joins',()=>{
  const pts=[[0,0],[12,0],[12,10]];
  const mock=mockCanvas();
  const result=api.fillStrokeOutline(mock.ctx,pts,2);
  assert.equal(result.lines,6);
  assert.equal(result.arcs,1);
  assert.equal(mock.calls.fills,1);
  assert.deepEqual(mock.calls.arcs[0],[12,0,2,0,Math.PI*2]);
  assert.deepEqual(mock.calls.moves.slice(0,2),[[0,-2],[14,0]]);
  assert.equal(mock.calls.closes,2);
  assert.deepEqual(mock.calls.lines.slice(0,3),[[12,-2],[12,2],[0,2]]);
  const ignored=api.fillStrokeOutline(mock.ctx,pts,0);
  assert.equal(ignored.lines,0);
  assert.equal(mock.calls.fills,1);
});

test('pixel difference measures image discrepancy on ink pixels without diluting by blank area',()=>{
  const ref=new Uint8ClampedArray([252,253,255,255, 0,0,0,255, 252,253,255,255]);
  const same=new Uint8ClampedArray(ref);
  const zero=api.comparePixels(ref,same);
  assert.equal(zero.inkPixels,1);assert.equal(zero.changedInkPixels,0);
  assert.equal(zero.meanAbsRGBPerChannel,0);
  assert.equal(zero.heatmap.length,ref.length);
  const altered=new Uint8ClampedArray(ref);
  altered[4]=50;altered[5]=30;altered[6]=20;
  const changed=api.comparePixels(ref,altered);
  assert.equal(changed.inkPixels,1);assert.equal(changed.changedInkPixels,1);
  assert.equal(changed.changedInkPercent,100);
  assert.equal(changed.maxChannelDifference,50);
  assert.equal(changed.meanAbsRGBPerChannel,(50+30+20)/3);
  assert.equal(changed.heatmap[4],250,'heatmap exaggerates differences fivefold');
  assert.throws(()=>api.comparePixels(ref,new Uint8ClampedArray(4)),/matching dimensions/);
});

test('CTM bypass profile controls the assigned line width at fixed backing-store geometry',()=>{
  const modes=api.modesFor('ctm-bypass');
  const widths=[0.99,1.005,1.125,2.5];
  assert.equal(modes.length,widths.length*3);
  assert.equal(new Set(modes.map(m=>m.id)).size,modes.length);
  const all=api.modesFor('all');
  for (const m of modes) assert.ok(all.some(a=>a.id===m.id));
  const paths=api.geometry();
  for (const width of widths) {
    const variants=modes.filter(m=>m.width===width);
    assert.deepEqual(Array.from(variants,m=>m.transformVariant),['native','unit','half']);
    assert.deepEqual(Array.from(variants,m=>m.transform),[1,width,2*width]);
    const control=mockCanvas();
    const controlStats=api.paint(control.ctx,variants[0],paths);
    assert.equal(controlStats.strokeCalls,1221);
    assert.equal(controlStats.sourceSegments,7326);
    assert.equal(controlStats.lineToCalls,7326);
    assert.equal(controlStats.assignedLineWidth,width);
    assert.equal(controlStats.effectiveStrokeWidthPx,width);
    for (let i=1;i<variants.length;i++) {
      const alt=mockCanvas();
      const stats=api.paint(alt.ctx,variants[i],paths);
      const assigned=i===1?1:0.5;
      assert.ok(Math.abs(stats.assignedLineWidth-assigned)<1e-12);
      assert.equal(stats.effectiveStrokeWidthPx,width);
      assert.equal(stats.transformScale,variants[i].transform);
      assert.equal(stats.strokeCalls,controlStats.strokeCalls);
      assert.equal(stats.lineToCalls,controlStats.lineToCalls);
      assert.equal(stats.fillCalls,controlStats.fillCalls);
      assert.equal(alt.calls.strokes.length,control.calls.strokes.length);
      assert.equal(alt.calls.lines.length,control.calls.lines.length);
      for (let k=0;k<alt.calls.lines.length;k++) {
        assert.ok(Math.abs(alt.calls.lines[k][0]-control.calls.lines[k][0])<1e-9);
        assert.ok(Math.abs(alt.calls.lines[k][1]-control.calls.lines[k][1])<1e-9);
      }
      for (let k=0;k<alt.calls.strokes.length;k++) {
        assert.ok(Math.abs(alt.calls.strokes[k].width-width)<1e-12);
        assert.equal(alt.calls.strokes[k].alpha,control.calls.strokes[k].alpha);
        assert.equal(alt.calls.strokes[k].join,control.calls.strokes[k].join);
        assert.equal(alt.calls.strokes[k].color,control.calls.strokes[k].color);
      }
    }
  }
});

test('CTM bypass runs export each transform variant and separate measured widths',()=>{
  const selected=api.modesFor('ctm-bypass').filter(m=>m.width===1.125);
  const h=scheduledHarness();
  h.runner.start({warmup:2,samples:10,passes:3,modes:selected,profile:'ctm-bypass',environment:{devicePixelRatio:1.5}});
  for(let i=0;h.runner.running()&&i<1000;i++)h.tick();
  assert.ok(h.result);
  const r=h.result;
  assert.equal(r.config.profile,'ctm-bypass');
  assert.equal(r.config.modes.length,3);
  assert.equal(r.runs.length,9);
  assert.ok(r.runs.every(run=>run.rows.every(row=>row.assignedLineWidth>0)));
  assert.equal(r.environment.devicePixelRatio,1.5);
  assert.deepEqual(Array.from(r.config.modes,m=>m.transformVariant),['native','unit','half']);
  assert.deepEqual(Array.from(r.config.modes,m=>m.transform),[1,1.125,2.25]);
});
