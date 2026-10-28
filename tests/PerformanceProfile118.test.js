'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const profile=require('../src/diagnostics/CurvaturePerformanceProfile118');
const fs=require('node:fs');
const path=require('node:path');
test('profile collects disjoint stages and restores immutable model',async()=>{
  const model={showGrid:1,camViewCenter:[0,1,0]};
  const seen=[];let cold=0;
  const result=await profile.run({model,reset(){cold++;},pause:()=>Promise.resolve(),
    render(m,opts){seen.push({m,opts});return {cacheReused:seen.length>1,
      primitiveCount:m.showGrid?10:5,unresolved:0,
      timings:{composeMs:1,opticsMs:2,frameMs:3,paintMs:4,validationMs:1,
        projectionMs:1,canvasMs:2,decorationsMs:0,strokeCalls:5},fieldStats:{solves:7}};}});
  assert.equal(cold,1);
  assert.equal(result.samples.length,15);
  assert.equal(result.profile.failures.length,0);
  assert.equal(result.profile.scenarios['grid-off'].wall.count,3);
  assert.equal(result.profile.scenarios['pan-sweep'].wall.count,5);
  assert.ok(seen.filter(x=>x.m.showGrid===0).length===3);
  assert.deepEqual(model,{showGrid:1,camViewCenter:[0,1,0]});
  assert.ok(seen.some(x=>x.opts.interactive===true));
});
test('median and p95 calculated from sorted samples',()=>{
  assert.deepEqual(profile.summarize([]),{count:0,medianMs:null,p95Ms:null,minMs:null,maxMs:null});
  const s=profile.summarize([10,1,9,4,7]);
  assert.equal(s.medianMs,7);assert.equal(s.p95Ms,10);
});
test('existing exporter retains its original zip path and adds profile files',()=>{
  const controller=fs.readFileSync(path.join(__dirname,'../src/diagnostics/CurvatureLegacyFrameCaptureController.js'),'utf8');
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureApp.html'),'utf8');
  assert.match(controller,/performance-profile\.json/);
  assert.match(controller,/performance-samples\.json/);
  assert.match(controller,/browser-info\.json/);
  assert.match(controller,/DrawModelWithOptionalAudit\(graph\)/);
  assert.match(html,/CurvaturePerformanceProfile118\.js/);
});
