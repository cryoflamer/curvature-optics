'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const studio=require('../src/animation/ModernAnimationStudio');
const editing=require('../src/animation/ModernAnimationStudioEditing');
const root=path.resolve(__dirname,'..');

function harness(){
  const effects=[];
  let state={draft:studio.blank(),selectedKey:null,history:studio.createEditHistory(),
    diagnosticTransition:null};
  const options={studio,
    read:()=>state,
    write:changes=>{state={...state,...changes};},
    suggestName:draft=>draft,
    invalidate:()=>effects.push('invalidate'),
    checkpoint:()=>effects.push('checkpoint'),
    clearStatus:()=>effects.push('clear'),
    render:()=>effects.push('render'),
    refreshControls:()=>effects.push('controls'),
    refreshLibrary:()=>effects.push('library')};
  const controller=editing.create(options);
  return {effects,controller,get state(){return state;},
    replaceState(next){state={...state,...next};}};
}
function frame(key){return {key,sourceSnapshotId:null,name:key,experiment:null,
  travelMs:0,holdMs:0,easing:'linear'};}
function twoFrames(){
  return {...studio.blank(),frames:[frame('a'),frame('b')]};
}

test('classic browser script exposes coordinator before ModernApp',()=>{
  const filename='src/animation/ModernAnimationStudioEditing.js';
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  assert.ok(html.indexOf(filename)>=0&&html.indexOf(filename)<html.indexOf('src/ui/modern/ModernApp.js'));
  const browser=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,filename),'utf8'),browser);
  assert.equal(typeof browser.CurvatureModernAnimationStudioEditing.create,'function');
  assert.equal(vm.runInContext('typeof require',browser),'undefined');
});

test('commit checkpoints a draft, updates selected key, and records one undo',()=>{
  const h=harness();h.replaceState({draft:twoFrames(),selectedKey:'b',diagnosticTransition:0});
  const next=studio.edit(h.state.draft,'description','Committed');
  assert.equal(h.controller.commit(next,{group:'project:description',endGroup:true}),true);
  assert.equal(h.state.draft.description,'Committed');
  assert.equal(h.state.selectedKey,'b');
  assert.equal(h.state.diagnosticTransition,null);
  assert.deepEqual(h.effects,['invalidate','checkpoint','clear','render']);
  assert.equal(h.state.history.past.length,1);
  assert.equal(h.controller.step('undo'),true);
  assert.equal(h.state.draft.description,'');
  assert.equal(h.state.selectedKey,'b');
  assert.equal(h.controller.step('redo'),true);
  assert.equal(h.state.draft.description,'Committed');
});

test('live input coalesces changes, final blur is a no-op, and redo is retained',()=>{
  const h=harness();
  for(const value of ['Cam','Camera','Camera study'])
    h.controller.live(studio.edit(h.state.draft,'name',value),'project:name');
  assert.equal(h.state.history.past.length,1);
  assert.deepEqual(h.effects.slice(-4),['invalidate','checkpoint','controls','library']);
  const count=h.effects.length;
  assert.equal(h.controller.commit(studio.edit(h.state.draft,'name','Camera study'),
    {group:'project:name',endGroup:true}),false);
  assert.equal(h.effects.length,count,'change after input does not rebuild form or checkpoint');
  h.controller.step('undo');assert.equal(h.state.draft.name,'Animation study');
  h.controller.step('redo');assert.equal(h.state.draft.name,'Camera study');
  assert.equal(h.state.history.future.length,0);
});

test('remove selected frame chooses its surviving neighbor and Undo restores selection',()=>{
  const h=harness();h.replaceState({draft:twoFrames(),selectedKey:'b'});
  assert.equal(h.controller.remove('b'),true);
  assert.deepEqual(h.state.draft.frames.map(f=>f.key),['a']);
  assert.equal(h.state.selectedKey,'a');
  assert.equal(h.controller.step('undo'),true);
  assert.deepEqual(h.state.draft.frames.map(f=>f.key),['a','b']);
  assert.equal(h.state.selectedKey,'b');
  assert.equal(h.controller.remove('missing'),false);
});

test('selection checkpoints, transition focus renders without saving, invalid indices are ignored',()=>{
  const h=harness();h.replaceState({draft:twoFrames()});
  h.controller.select('a');
  assert.equal(h.state.selectedKey,'a');
  assert.deepEqual(h.effects,['checkpoint','render']);
  h.effects.length=0;
  assert.equal(h.controller.focusTransition(0),true);
  assert.equal(h.state.selectedKey,'b');assert.equal(h.state.diagnosticTransition,0);
  assert.deepEqual(h.effects,['render']);
  h.effects.length=0;
  assert.equal(h.controller.focusTransition(-1),false);
  assert.equal(h.controller.focusTransition(1),false);
  assert.deepEqual(h.effects,[]);
});

test('coordinator reads current workspace each time instead of reviving a prior draft',()=>{
  const h=harness();
  h.controller.live(studio.edit(h.state.draft,'name','Workspace A'),'project:name');
  h.replaceState({draft:studio.blank(),history:studio.createEditHistory(),selectedKey:null});
  assert.equal(h.controller.step('undo'),false);
  assert.equal(h.state.draft.name,'Animation study');
  h.controller.commit(studio.edit(h.state.draft,'name','Workspace B'));
  assert.equal(h.controller.step('undo'),true);
  assert.equal(h.state.draft.name,'Animation study');
});

test('invalid dependencies fail explicitly',()=>{
  assert.throws(()=>editing.create({}),/requires live state/);
});
