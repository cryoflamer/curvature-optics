'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const probe=require('../src/animation/ModernAnimationFrameTiming');

function harness(){
  let now=1000,id=0;
  const callbacks=new Map(),updates=[];
  const p=probe.create({now:()=>now,requestFrame:fn=>{const key=++id;callbacks.set(key,fn);return key;},
    cancelFrame:key=>callbacks.delete(key),onUpdate:report=>updates.push(report)});
  function tick(ms=16){assert.equal(callbacks.size,1);
    const [[key,fn]]=callbacks;callbacks.delete(key);now+=ms;fn(now);}
  return {p,tick,updates,callbacks,advance:ms=>{now+=ms;}};
}

test('disabled frame timing leaves the actual seek and renderer path alone',()=>{
  const h=harness();let seeks=0,paints=0;
  h.p.input('manual',450,()=>{seeks++;h.p.render(()=>{paints++;return {painted:true};});});
  assert.equal(seeks,1);assert.equal(paints,1);
  assert.equal(h.p.exportData().summary.manual.inputs,0);
  assert.equal(h.callbacks.size,0);
});

test('manual seek counts input, painted render and real timings independently',()=>{
  const h=harness();h.p.setEnabled(true);
  for(let i=0;i<3;i++){
    h.p.input('manual',100+i*200,()=>{
      h.advance(2);
      h.p.render(()=>{h.advance(5);return {painted:true};});
      h.advance(1);
    });
    h.tick(16);
  }
  const result=h.p.exportData({quality:'canvas-direct'});
  assert.equal(result.summary.manual.inputs,3);
  assert.equal(result.summary.manual.paints,3);
  assert.equal(result.summary.manual.renderCpuMs.p50,5);
  assert.equal(result.summary.manual.inputToRenderStartMs.p50,2);
  assert.equal(result.summary.manual.inputToRenderEndMs.p50,7);
  assert.equal(result.summary.rafCallbacks,3);
  assert.equal(result.environment.quality,'canvas-direct');
  assert.equal(result.measurements.renders[0].requestedSeek,100);
  h.p.setEnabled(false);
  assert.equal(h.callbacks.size,0);
});

test('an automatic sweep uses exactly the caller seek handler, preserves manual measurements and stops',()=>{
  const h=harness();h.p.setEnabled(true);
  h.p.input('manual',300,()=>h.p.render(()=>({painted:true})));
  const values=[];
  h.p.startAutomatic(value=>h.p.input('auto',value,()=>{
    values.push(value);h.advance(2);h.p.render(()=>{h.advance(3);return {painted:true};});
  }),{durationMs:500,requestOrder:'before'});
  for(let i=0;h.p.autoRunning()&&i<100;i++)h.tick(20);
  assert.equal(h.p.autoRunning(),false);
  assert.equal(values[0],0);
  assert.equal(values.at(-1),1000);
  assert.ok(values.length>10);
  assert.equal(h.p.exportData().summary.manual.inputs,1);
  assert.equal(h.p.exportData().summary.auto.inputs,values.length);
  assert.equal(h.p.exportData().summary.auto.paints,values.length);
  assert.equal(h.callbacks.size,1,'the lightweight RAF observer remains active until disabled');
});

test('skipped paints and exceptions are counted without swallowing errors',()=>{
  const h=harness();h.p.setEnabled(true);
  h.p.input('manual',10,()=>h.p.render(()=>null));
  assert.throws(()=>h.p.input('manual',20,()=>h.p.render(()=>{throw Error('paint failed');})),
    /paint failed/);
  const stats=h.p.exportData().summary.manual;
  assert.equal(stats.paints,0);assert.equal(stats.skipped,1);assert.equal(stats.errors,1);
  h.p.clear();assert.equal(h.p.exportData().summary.manual.inputs,0);
});

test('HTML loads probe before ModernApp and a real seek callback is used for automatic motion',()=>{
  const html=fs.readFileSync('CurvatureModern.html','utf8');
  const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
  assert.ok(html.indexOf('src/animation/ModernAnimationFrameTiming.js')>0);
  assert.ok(html.indexOf('src/animation/ModernAnimationFrameTiming.js')<html.indexOf('src/ui/modern/ModernApp.js'));
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync('src/animation/ModernAnimationFrameTiming.js','utf8'),context);
  assert.equal(typeof context.CurvatureModernAnimationFrameTiming.create,'function');
  assert.match(app,/studioFrameTiming\.input\(source,seek\.value/);
  assert.match(app,/ensureStudioFrameTiming\(\)\.startAutomatic\(/);
  assert.match(app,/studioFrameTiming\.render\(/);
});
