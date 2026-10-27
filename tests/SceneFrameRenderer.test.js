'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const adapter=require('../src/legacy/LegacySceneAdapter');
const frames=require('../src/scene/SceneFrame');
const renderer=require('../src/scene/SceneFrameRenderer');

test('standalone scene frame renders to a caller-provided graph in order',()=>{
  const calls=[];
  const original={Text(...args){calls.push(['Text',...args]);},SetBgColor(...args){calls.push(['SetBgColor',...args]);}};
  const trace=adapter.record(original,g=>{g.SetBgColor('blue');g.Text('hello',3,4);});
  const expected=calls.splice(0);
  const frame=frames.fromTrace(trace);
  renderer.render(original,JSON.parse(JSON.stringify(frame)));
  assert.deepEqual(calls,expected);
  assert.deepEqual(frame.commands.map(c=>c.method),['SetBgColor','Text']);
});

test('invalid or incomplete frame is rejected before drawing',()=>{
  let called=false;
  const graph={Text(){called=true;}};
  assert.throws(()=>renderer.render(graph,{kind:'scene-command-frame',commands:[{method:'Text',args:['bad']}]}),/Invalid scene frame/);
  assert.equal(called,false);
  assert.throws(()=>renderer.render(null,{}),/Target graph required/);
});
