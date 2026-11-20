'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPairWorkflow}=require('../src/ui/modern/ModernPhotoCalibrationEditor');
const row=(id,x=1)=>({kind:'vertex',landmark:{id,bank:0,objectType:3,primitive:0,vertex:x},pixel:[x,2],weight:2,included:false});
test('Browse/Add accepts either point first and supports commit, cancel and undo',()=>{
  for(const modelFirst of [false,true]){
    const w=createPairWorkflow(),a=row('a');
    assert.equal(w.mode,'browse');w.beginAdd();assert.equal(w.mode,'add');assert.equal(w.canCommit,false);
    if(modelFirst){w.selectModel(a.landmark);w.selectPhoto(a.pixel);}
    else {w.selectPhoto(a.pixel);w.selectModel(a.landmark);}
    assert.equal(w.canCommit,true);assert.deepEqual(w.rows,[]);
    w.change([a],'a',{finish:true});assert.equal(w.mode,'browse');assert.equal(w.activePair,'a');
    w.selectPhoto([7,8]);assert.equal(w.mode,'add');w.cancel();assert.equal(w.mode,'browse');assert.deepEqual(w.rows,[a]);
    assert.equal(w.undo(),true);assert.deepEqual(w.rows,[]);assert.equal(w.undo(),false);
  }
});
test('Edit preserves saved rows and rejects switching target; sequential Undo',()=>{
  const w=createPairWorkflow(),a=row('a'),b=row('b',3);
  w.replaceAll([a,b]);assert.equal(w.beginEdit('missing'),false);assert.equal(w.beginEdit('a'),true);
  assert.equal(w.mode,'edit');assert.equal(w.canCommit,true);assert.equal(w.select('b'),false);assert.equal(w.activePair,'a');
  w.selectPhoto([8,9]);w.selectModel(row('a',7).landmark);assert.deepEqual(w.rows,[a,b]);
  w.cancel();assert.equal(w.activePair,'a');assert.equal(w.mode,'browse');assert.deepEqual(w.rows,[a,b]);
  w.beginEdit('a');w.selectPhoto([8,9]);const next={...a,pixel:w.pending};
  w.change([next,b],'a',{finish:true});assert.equal(w.mode,'browse');assert.deepEqual(w.rows,[next,b]);
  w.change([next],'a');assert.equal(w.undo(),true);assert.deepEqual(w.rows,[next,b]);assert.equal(w.undo(),true);assert.deepEqual(w.rows,[a,b]);
});
test('Legacy draft and history restoration, unrelated deletion preserves edit',()=>{
  const w=createPairWorkflow(),a=row('a'),b=row('b',3);w.replaceAll([a,b]);
  w.restoreDraft({editing:'a',activePair:'b',pending:[5,6],pendingModel:a.landmark});
  assert.equal(w.mode,'edit');assert.equal(w.activePair,'a');assert.deepEqual(w.pending,[5,6]);
  w.change([a]);assert.equal(w.mode,'edit');assert.equal(w.editing,'a');
  w.change([]);assert.equal(w.mode,'browse');assert.equal(w.activePair,null);
  w.restoreHistory([{rows:[a,b],activePair:'b'}]);assert.equal(w.undo(),true);assert.equal(w.activePair,'b');
  w.restoreDraft({editing:'missing',pending:[3,4]});assert.equal(w.mode,'add');assert.equal(w.canCommit,false);
  w.replaceAll();assert.equal(w.mode,'browse');assert.equal(w.undo(),false);
});
test('Legacy Flat edit may use selector instead of draft material point',()=>{
  const w=createPairWorkflow(),a=row('a');w.replaceAll([a]);w.beginEdit('a',{model:false});
  assert.equal(w.editing,'a');assert.equal(w.pendingModel,null);assert.deepEqual(w.pending,a.pixel);
  w.change([{...a,pixel:[4,5]}],'a',{finish:true});assert.equal(w.mode,'browse');
});

test('Shared toolbar reflects explicit add, edit, read-only and legacy readiness',()=>{
  const {pairToolbarState}=require('../src/ui/modern/ModernPhotoCalibrationEditor');
  const w=createPairWorkflow(),a=row('a'),ready={ready:true};
  assert.equal(pairToolbarState(w).addDisabled,true);
  assert.equal(pairToolbarState(w,ready).addDisabled,false);
  w.beginAdd();w.selectModel(null);assert.equal(w.mode,'add');assert.equal(w.explicitAdd,true);
  let t=pairToolbarState(w,ready);assert.equal(t.cancelDisabled,false);assert.equal(t.commitDisabled,true);
  w.selectPhoto([2,3]);assert.equal(pairToolbarState(w,ready).commitDisabled,true);
  assert.equal(pairToolbarState(w,{...ready,legacy:true,legacyModel:true}).commitDisabled,false);
  w.selectModel(a.landmark);assert.equal(pairToolbarState(w,ready).commitDisabled,false);
  assert.equal(pairToolbarState(w,{...ready,readOnly:true}).commitDisabled,true);
  w.cancel();w.replaceAll([a]);w.select('a');assert.equal(pairToolbarState(w,ready).editDisabled,false);
  w.beginEdit('a');t=pairToolbarState(w,ready);assert.equal(t.commitLabel,'Update pair');assert.equal(t.deleteDisabled,true);
  w.restoreDraft({explicitAdd:true});assert.equal(w.mode,'add');assert.equal(w.explicitAdd,true);
  w.cancel();w.selectPhoto([1,2]);assert.equal(w.explicitAdd,false);w.selectPhoto(null);assert.equal(w.mode,'browse');
});


test('implicit pairing links only a complete draft on its marker, in either order',()=>{
  const {linkDraftGesture,pairToolbarState}=require('../src/ui/modern/ModernPhotoCalibrationEditor');
  for(const modelFirst of [false,true]){
    const w=createPairWorkflow(),a=row('a'),existing=row('b',3);
    w.replaceAll([existing]);let calls=0;
    const commit=()=>{calls++;w.change([existing,a],null,{finish:true});};
    const dbl=target=>({kind:'double-click',target:{kind:target}});
    if(modelFirst)w.selectModel(a.landmark);else w.selectPhoto(a.pixel);
    assert.equal(linkDraftGesture(w,dbl('draft'),commit),true);assert.equal(calls,0);
    w.select('b');assert.equal(w.mode,'add');
    if(modelFirst)w.selectPhoto(a.pixel);else w.selectModel(a.landmark);
    assert.equal(w.canCommit,true);
    assert.equal(pairToolbarState(w,{ready:true,implicit:true}).hint,'Double-click either draft point to link the pair.');
    assert.equal(linkDraftGesture(w,dbl('saved'),commit),false);
    assert.equal(linkDraftGesture(w,dbl('background'),commit),false);
    assert.equal(linkDraftGesture(w,dbl('draft'),commit,false),false);
    assert.equal(linkDraftGesture(w,dbl('draft'),commit),true);assert.equal(calls,1);
    assert.equal(w.mode,'browse');assert.equal(w.rows.length,2);
    assert.equal(linkDraftGesture(w,dbl('draft'),commit),true);assert.equal(calls,1);
  }
  const w=createPairWorkflow(),a=row('a');w.selectPhoto(a.pixel);w.selectModel(a.landmark);
  linkDraftGesture(w,{kind:'double-click',target:{kind:'draft'}},()=>false);
  assert.equal(w.canCommit,true);assert.deepEqual(w.rows,[]);
});
