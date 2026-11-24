const test=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../src/storage/ModernDocumentSession');
function bound(mode='scene',id='work-a',revision='digest:abc'){
  return contract.select(contract.empty('tab-a'),mode,{id,revision,recovery:null});
}
function tracker(session=bound()){
  return contract.createSaveTracker({session,sessionRevision:4});
}
function receipt(t,revision='digest:def'){return {kind:t.kind,id:t.id,revision};}
function recoverable(){
  return contract.select(bound(),'scene',{id:'work-a',revision:'digest:abc',
    recovery:{id:'recover-a',revision:'digest:draft',baseRevision:'digest:abc'}});
}
const readDocument=async(kind,id)=>({kind,id,revision:'digest:abc'});
const readRecovery=async(kind,id)=>({kind,id,documentId:'work-a',
  baseRevision:'digest:abc',revision:'digest:draft'});

test('independent session slots: Scene/Compare share the working experiment',()=>{
  let s=bound();
  s=contract.select(s,'calibration',{id:'cal-a',revision:'rev:4',recovery:null});
  s=contract.select(s,'animation',{id:'draft-a',revision:'digest:22',recovery:null});
  s=contract.select(s,'compare');
  assert.equal(s.workspace,'compare');
  assert.equal(s.documents.experiment.id,'work-a');
  assert.equal(s.documents.calibration.id,'cal-a');
  assert.equal(s.documents.animation.id,'draft-a');
  assert.equal(contract.select(s,'images').documents.animation.id,'draft-a');
  assert.equal(contract.empty('tab-b').documents.experiment,null);
  assert.ok(Object.isFrozen(s.documents.experiment));
});
test('rejects future schemas, payload fields, invalid revisions and wrong recovery base',()=>{
  const s=bound();
  assert.throws(()=>contract.normalize({...s,version:2}),/unsupported/);
  assert.throws(()=>contract.normalize({...s,photo:'bytes'}),/fields/);
  assert.throws(()=>contract.select(s,'scene',{...s.documents.experiment,experiment:{}}),/fields/);
  assert.throws(()=>contract.select(s,'scene',{id:'a',revision:123,recovery:null}),/revision/);
  assert.throws(()=>contract.select(s,'scene',{id:'a',revision:'r1',
    recovery:{id:'draft',revision:'r2',baseRevision:'wrong'}}),/base revision/);
  assert.throws(()=>contract.select(s,'images',s.documents.experiment),/no editable/);
});
test('explicit external intent outranks private state without reading documents',async()=>{
  let reads=0;
  const plan=await contract.planRestore({version:99},{explicitIntent:true,
    readDocument:()=>{reads++;throw Error('must not read');}});
  assert.deepEqual(plan,{source:'external'});assert.equal(reads,0);
});
test('restore verifies exact identity and revision, never arbitrary last-used fallback',async()=>{
  const s=bound('calibration','cal-a','rev:7');
  const plan=await contract.planRestore(s,{readDocument:async(kind,id)=>({kind,id,revision:'rev:7'})});
  assert.equal(plan.source,'session');assert.equal(plan.document.id,'cal-a');
  for(const wrong of [null,{kind:'calibration',id:'other',revision:'rev:7'},
    {kind:'calibration',id:'cal-a',revision:'rev:8'}]){
    await assert.rejects(contract.planRestore(s,{readDocument:async()=>wrong}),/missing or revision changed/);
  }
  assert.deepEqual(await contract.planRestore(contract.empty('tab-a')),
    {source:'empty',workspace:'scene'});
});
test('late restore fails after generation change',async()=>{
  let current=true;
  await assert.rejects(contract.planRestore(bound(),{
    isCurrent:()=>current,readDocument:async(kind,id)=>{
      current=false;return {kind,id,revision:'digest:abc'};
    }}),/stale restore generation/);
});
test('recovery matches document and base revision; forged plans cannot load it',async()=>{
  const s=recoverable();
  await assert.rejects(contract.planRestore(s,{readDocument,
    readRecovery:async(kind,id)=>({...await readRecovery(kind,id),documentId:'wrong'})}),/recovery missing/);
  const plan=await contract.planRestore(s,{readDocument,readRecovery});
  const m=tracker(s);assert.equal(m.state().status,'recovering');
  assert.equal(m.canSwitch(),false);
  assert.throws(()=>m.recoveryLoaded({...plan}),/verified recovery/);
  m.recoveryLoaded(plan);assert.equal(m.state().status,'dirty');
  assert.equal(m.state().session.documents.experiment.recovery.id,'recover-a');
});
test('recovery activation rechecks guard and session identity',async()=>{
  const s=recoverable();let live=true;
  const plan=await contract.planRestore(s,{readDocument,readRecovery,isCurrent:()=>live});
  const other=tracker({...s,tabId:'tab-b'});
  assert.throws(()=>other.recoveryLoaded(plan),/verified recovery/);
  live=false;
  assert.throws(()=>tracker(s).recoveryLoaded(plan),/verified recovery/);
});
test('domain receipt alone never commits the session pointer',()=>{
  const m=tracker();assert.equal(m.canSwitch(),true);
  m.markDirty();assert.equal(m.canSwitch(),false);const t=m.beginSave();
  assert.throws(()=>m.acknowledgeSession(t,{revision:5,envelope:bound()}),/document commit/);
  const p=m.acknowledgeDocument(t,receipt(t));
  assert.equal(p.expectedRevision,4);
  assert.equal(p.envelope.documents.experiment.revision,'digest:def');
  assert.equal(m.state().session.documents.experiment.revision,'digest:abc');
  assert.equal(m.state().status,'saving');
  assert.equal(m.acknowledgeSession(t,{revision:5,envelope:p.envelope}),true);
  assert.equal(m.state().status,'committed');assert.equal(m.state().sessionRevision,5);
  assert.equal(m.canSwitch(),true);
});
test('session receipt checks CAS revision and exact candidate',()=>{
  const m=tracker();m.markDirty();const t=m.beginSave();
  const p=m.acknowledgeDocument(t,receipt(t));
  assert.throws(()=>m.acknowledgeSession(t,{revision:6,envelope:p.envelope}),/CAS/);
  assert.throws(()=>m.acknowledgeSession(t,{revision:5,envelope:bound('compare')}),/CAS/);
  assert.equal(m.state().sessionRevision,4);assert.equal(m.state().status,'saving');
  assert.equal(m.state().pending,p);
});
test('late receipts cannot acknowledge a newer edit',()=>{
  const m=tracker();m.markDirty();const a=m.beginSave();
  const p=m.acknowledgeDocument(a,receipt(a));m.markDirty();
  assert.equal(m.acknowledgeSession(a,{revision:5,envelope:p.envelope}),true);
  assert.equal(m.state().status,'dirty');assert.equal(m.canSwitch(),false);
  const b=m.beginSave();assert.equal(b.baseRevision,'digest:def');
  assert.equal(b.sessionRevision,5);
  assert.equal(m.acknowledgeDocument(a,receipt(a)),null);
  assert.equal(m.fail(a,'late error'),false);assert.equal(m.state().status,'saving');
});
test('cross-document or fork receipts never redirect current edits',()=>{
  const m=tracker();m.markDirty();const t=m.beginSave();
  assert.throws(()=>m.acknowledgeDocument(t,{kind:'calibration',id:t.id,revision:'rev:2'}),/match/);
  assert.throws(()=>m.acknowledgeDocument(t,{kind:t.kind,id:'fork-a',revision:'rev:2'}),/match/);
  assert.throws(()=>m.acknowledgeDocument(t,receipt(t,t.baseRevision)),/match/);
  assert.equal(m.state().pending,null);
});
test('failure before or after domain commit requires reconciliation, never blind retry',()=>{
  for(const after of [false,true]){
    const m=tracker();m.markDirty();const t=m.beginSave();
    const p=after?m.acknowledgeDocument(t,receipt(t)):null;
    assert.equal(m.fail(t,'quota or conflict'),true);
    assert.equal(m.state().status,'failed');assert.equal(m.state().pending,p);
    assert.equal(m.state().sessionRevision,4);assert.equal(m.canSwitch(),false);
    assert.throws(()=>m.beginSave(),/dirty document/);
    assert.equal(m.acknowledgeSession(t,{revision:5,envelope:bound()}),false);
    assert.equal(m.beginRecovery().status,'recovering');assert.equal(m.state().pending,p);
  }
});
test('recovery pointer is retired only on acknowledged replacement',async()=>{
  const s=recoverable();
  const plan=await contract.planRestore(s,{readDocument,readRecovery});
  const m=tracker(s);m.recoveryLoaded(plan);const t=m.beginSave();
  const p=m.acknowledgeDocument(t,receipt(t));
  assert.equal(m.state().session.documents.experiment.recovery.id,'recover-a');
  assert.equal(p.envelope.documents.experiment.recovery,null);
  m.acknowledgeSession(t,{revision:5,envelope:p.envelope});
  assert.equal(m.state().session.documents.experiment.recovery,null);
});
