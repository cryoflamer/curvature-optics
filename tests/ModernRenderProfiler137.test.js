'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const profile=require('../src/ui/modern/ModernRenderProfiler');

test('137: Scene and Compare keep separate bounded renderer and redraw measurements',()=>{
  const p=profile.create({capacity:3});
  for(let i=0;i<5;i++){
    p.recordRender({viewport:'Scene',totalMs:i+1,rendererMs:i,overlayMs:1,
      cacheReused:i>0,stages:{composeMs:i,opticsMs:20-i,paintMs:3,canvasMs:2,projectionMs:1}});
  }
  p.recordRender({viewport:'A',totalMs:18,stages:{opticsMs:15},cacheReused:false});
  p.recordRender({viewport:'B',totalMs:9,stages:{opticsMs:4},cacheReused:true});
  p.recordBatch({mode:'scene',totalMs:12,queueMs:1,Scene:{totalMs:12,resizeMs:2,redrawMs:10}});
  p.recordBatch({mode:'compare',totalMs:27,queueMs:2,
    A:{totalMs:17,resizeMs:1,redrawMs:16},B:{totalMs:10,resizeMs:1,redrawMs:9}});
  const s=p.summary();
  assert.equal(s.renders.Scene.count,3);
  assert.equal(s.renders.Scene.median.totalMs,4);
  assert.equal(s.renders.Scene.p95.totalMs,5);
  assert.equal(s.renders.Scene.stages.p95.opticsMs,18);
  assert.equal(s.renders.A.latest.cacheReused,false);
  assert.equal(s.renders.B.latest.cacheReused,true);
  assert.equal(s.batches.compare.A.latest.redrawMs,16);
  assert.equal(s.batches.compare.B.latest.totalMs,10);
  assert.equal(s.batches.scene.Scene.latest.resizeMs,2);
  s.renders.Scene.latest.stages.opticsMs=12345;
  assert.notEqual(p.summary().renders.Scene.latest.stages.opticsMs,12345);
  p.clear();
  assert.equal(p.summary().renders.Scene.count,0);
  assert.equal(p.summary().batches.compare.count,0);
});
test('137: profiler skips missing and invalid optional timings without distorting aggregates',()=>{
  const p=profile.create();
  p.recordRender({viewport:'A',totalMs:9,stages:{opticsMs:NaN,canvasMs:-2,composeMs:3}});
  p.recordRender({viewport:'A',rendererMs:6,stages:null});
  const s=p.summary().renders.A;
  assert.equal(s.count,2);
  assert.equal(s.stages.count,1);
  assert.equal(s.stages.latest.composeMs,3);
  assert.equal('opticsMs' in s.stages.latest,false);
  assert.equal('totalMs' in s.latest,false);
  assert.throws(()=>p.recordRender({viewport:'unknown'}),RangeError);
  assert.throws(()=>p.recordBatch({mode:'unknown'}),RangeError);
  assert.throws(()=>profile.create({capacity:0}),RangeError);
});
