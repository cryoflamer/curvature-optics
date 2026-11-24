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

function controllerFixture({existing=true}={}){
  const tabId='tab-a',id='working-'+tabId;
  const make=(revision,value)=>({kind:'experiment',id,revision,experiment:{value}});
  const revisions=new Map([['r1',make('r1',1)]]);
  let latest='r1',current=existing?{revision:1,
    envelope:contract.select(contract.empty(tabId),'scene',{id,revision:'r1',recovery:null})}:
    {revision:0,envelope:null};
  const faults={session:null,domain:null,valid:true,reads:0,prepares:0};
  const lease={tabId,check(){if(!faults.valid)throw Error('lease lost');}};
  const sessions={async read(){faults.reads++;return current;},
    async write(envelope,expected){
      if(current.revision!==expected)throw Error('foreign session CAS');
      if(faults.session==='before')throw Error('session failure');
      current={revision:expected+1,envelope};
      if(faults.session==='after')throw Error('lost session acknowledgement');
      return current;
    }};
  const working={id,async read(){return revisions.get(latest);},
    async readRevision(rev){return revisions.get(rev);},
    async write(experiment,expected){
      if(latest!==expected)throw Error('foreign domain CAS');
      if(faults.domain==='before')throw Error('domain failure');
      const revision='r'+(revisions.size+1);
      revisions.set(revision,make(revision,experiment.value));latest=revision;
      if(faults.domain==='after')throw Error('lost domain acknowledgement');
      return {kind:'experiment',id,revision};
    }};
  const makeController=()=>contract.createExperimentController({lease,sessions,working,
    isCurrent:()=>faults.valid,prepare:async()=>{
      faults.prepares++;return {status:'verified',workspace:'scene',
        document:{id,revision:'r1',recovery:null}};
    }});
  return {makeController,faults,working,sessions,lease,row:()=>current};
}
test('controller binds only verified migration and external intent skips private reads',async()=>{
  const f=controllerFixture({existing:false}),external=f.makeController();
  await external.open({explicitIntent:true});
  assert.equal(external.state().status,'external');assert.equal(f.faults.reads,0);
  const c=f.makeController();await c.open();
  assert.equal(c.state().status,'clean');assert.equal(f.row().revision,1);
  assert.equal(f.faults.prepares,1);
});
test('controller saves document then session and restores exact acknowledged revision',async()=>{
  const f=controllerFixture(),c=f.makeController();await c.open();c.markDirty();
  await c.save({value:2});assert.equal(c.state().status,'committed');
  assert.equal(f.row().envelope.documents.experiment.revision,'r2');
  const reopened=f.makeController();await reopened.open();
  assert.equal(reopened.state().bound.experiment.value,2);
});
test('controller requires explicit offer to advance a diverged session after reload',async()=>{
  const f=controllerFixture(),c=f.makeController();await c.open();c.markDirty();
  f.faults.session='before';await assert.rejects(c.save({value:2}),/session failure/);
  assert.equal(f.row().revision,1);
  const reopened=f.makeController();await reopened.open();
  assert.equal(reopened.state().status,'recovering');
  assert.equal(reopened.state().bound.experiment.value,1);
  assert.equal(reopened.state().head.experiment.value,2);
  assert.throws(()=>reopened.markDirty(),/resolve session recovery/);
  await assert.rejects(reopened.acceptHead({revision:'r2'}),/explicit current/);
  f.faults.session=null;await reopened.acceptHead(reopened.recoveryOffer());
  assert.equal(reopened.state().status,'clean');assert.equal(f.row().revision,2);
});
test('controller read-first recovery accepts exact lost session acknowledgement',async()=>{
  const f=controllerFixture(),c=f.makeController();await c.open();c.markDirty();
  f.faults.session='after';await assert.rejects(c.save({value:2}),/lost session/);
  f.faults.session=null;await c.recover();
  assert.equal(c.state().status,'clean');assert.equal(f.row().revision,2);
});
test('controller retains failure if domain did not commit, and offers lost domain commit',async()=>{
  const f=controllerFixture(),c=f.makeController();await c.open();c.markDirty();
  f.faults.domain='before';await assert.rejects(c.save({value:2}),/domain failure/);
  await assert.rejects(c.recover(),/retain unsaved input/);
  assert.equal(c.state().status,'failed');
  const g=controllerFixture(),d=g.makeController();await d.open();d.markDirty();
  g.faults.domain='after';await assert.rejects(d.save({value:2}),/lost domain/);
  await d.recover();assert.equal(d.state().status,'recovering');
  assert.equal(d.recoveryOffer().revision,'r2');
});
test('recovery offer fails closed if head changes before explicit acceptance',async()=>{
  const f=controllerFixture(),c=f.makeController();await f.working.write({value:2},'r1');
  await c.open();const offer=c.recoveryOffer();await f.working.write({value:3},'r2');
  await assert.rejects(c.acceptHead(offer),/offer changed/);
  assert.equal(f.row().revision,1);
});

test('controller does not clear later edits when a save fails',async()=>{
  const f=controllerFixture(),c=f.makeController();await c.open();c.markDirty();
  const original=f.working.write;
  f.working.write=async(...args)=>{const receipt=await original(...args);c.markDirty();return receipt;};
  f.faults.session='before';
  await assert.rejects(c.save({value:2}),/session failure/);
  assert.equal(c.state().unsavedAfterAttempt,true);
  assert.equal(c.state().busy,false);
  await assert.rejects(c.recover(),/later unsaved edits/);
  assert.equal(c.state().status,'failed');
  assert.equal(f.row().revision,1);
});
test('controller keeps a later edit dirty after successful acknowledgement',async()=>{
  const f=controllerFixture(),c=f.makeController();await c.open();c.markDirty();
  const original=f.working.write;
  f.working.write=async(...args)=>{const receipt=await original(...args);c.markDirty();return receipt;};
  await c.save({value:2});
  assert.equal(c.state().status,'dirty');
  assert.equal(c.state().busy,false);
  assert.equal(f.row().revision,2);
});

test('document acknowledgement can select another workspace only for the same document kind',()=>{
  const m=tracker();m.markDirty();const token=m.beginSave();
  assert.throws(()=>m.acknowledgeDocument(token,receipt(token),'calibration'),/workspace mismatch/);
  const p=m.acknowledgeDocument(token,receipt(token),'compare');
  assert.equal(p.envelope.workspace,'compare');
  m.acknowledgeSession(token,{revision:5,envelope:p.envelope});
  assert.equal(m.state().session.workspace,'compare');
});
test('controller verifies an unchanged edit without creating a revision',async()=>{
  const f=controllerFixture(),c=f.makeController();await c.open();c.markDirty();
  await c.save({value:1});assert.equal(c.state().status,'clean');
  assert.equal(f.row().revision,1);
});


function recoverableFixture(){
  const f=controllerFixture(),{working,sessions,lease}=f;
  const copy=v=>JSON.parse(JSON.stringify(v));
  let draft=null,number=0;
  const faults={stage:null,retire:null,staged:[],retired:[],reads:0};
  working.readRecovery=async()=>{faults.reads++;return copy(draft);};
  working.stageRecovery=async(experiment,base,expected)=>{
    faults.staged.push(experiment.value);
    if(faults.stage)await faults.stage(experiment);
    assert.equal(expected,draft?draft.revision:null);
    draft={kind:'experiment',id:'recovery-'+lease.tabId,documentId:working.id,
      revision:'draft-'+(++number),baseRevision:base,experiment:copy(experiment)};
    return copy(draft);
  };
  working.retireRecovery=async(expected,ack)=>{
    if(faults.retire)await faults.retire();
    assert.equal(draft.revision,expected);
    assert.deepEqual((await working.readRevision(ack)).experiment,draft.experiment);
    faults.retired.push(expected);draft=null;return true;
  };
  const make=()=>contract.createRecoverableExperimentController({lease,sessions,working,
    isCurrent:()=>f.faults.valid,prepare:async()=>{throw Error('unexpected migration');}});
  return {...f,make,recovery:faults,draft:()=>copy(draft)};
}
function deferredRecovery(){
  let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};
}
test('recoverable controller checkpoints early, coalesces and explicitly restores exact draft',async()=>{
  const f=recoverableFixture(),c=f.make();await c.open();
  const gate=deferredRecovery();f.recovery.stage=()=>gate.promise;
  const input={value:2};c.markDirty(input);input.value=99;
  c.markDirty({value:3});c.markDirty({value:4});
  assert.equal(c.state().checkpoint,'pending');
  assert.equal(f.row().revision,1);
  gate.resolve();await c.flushCheckpoint();
  assert.deepEqual(f.recovery.staged,[2,4]);
  assert.equal(c.state().checkpoint,'durable');
  assert.equal(f.draft().experiment.value,4);
  const reopened=f.make();await reopened.open();
  assert.equal(reopened.state().status,'recovering');
  assert.equal(reopened.state().bound.experiment.value,1);
  await assert.rejects(reopened.loadDraft({recoveryRevision:'wrong'}),/explicit current/);
  assert.deepEqual(await reopened.loadDraft(reopened.draftOffer()),{value:4});
  assert.equal(reopened.state().status,'dirty');assert.equal(f.row().revision,1);
  await reopened.save();
  assert.equal(reopened.state().status,'committed');
  assert.equal(f.row().revision,2);assert.equal(f.draft(),null);
});
test('recoverable controller stages before CAS and preserves later edits during older commit',async()=>{
  const f=recoverableFixture(),c=f.make();await c.open();
  const gate=deferredRecovery(),entered=deferredRecovery(),original=f.working.write;
  f.working.write=async(...args)=>{
    assert.equal(f.draft().experiment.value,2);entered.resolve();await gate.promise;
    return original(...args);
  };
  c.markDirty({value:2});const saving=c.save();await entered.promise;
  c.markDirty({value:3});await c.flushCheckpoint();
  const later=f.draft();gate.resolve();await saving;
  assert.equal(c.state().status,'dirty');
  assert.equal(f.row().envelope.documents.experiment.revision,'r2');
  assert.deepEqual(f.draft(),later);assert.deepEqual(f.recovery.retired,[]);
  const reopened=f.make();await reopened.open();
  assert.equal(reopened.state().bound.experiment.value,2);
  assert.deepEqual(await reopened.loadDraft(reopened.draftOffer()),{value:3});
});
test('recoverable controller serializes retirement against an edit arriving during retirement',async()=>{
  const f=recoverableFixture(),c=f.make();await c.open();
  const gate=deferredRecovery(),entered=deferredRecovery();
  f.recovery.retire=()=>{entered.resolve();return gate.promise;};
  c.markDirty({value:2});const saving=c.save();await entered.promise;
  c.markDirty({value:3});
  assert.equal(c.state().checkpoint,'pending');
  gate.resolve();await saving;await c.flushCheckpoint();
  assert.equal(c.state().status,'dirty');
  assert.equal(f.draft().experiment.value,3);
  assert.equal(f.draft().baseRevision,'r2');
  assert.equal(f.recovery.retired.length,1);
});
test('recoverable controller retains draft after domain failure and reconciles divergent head first',async()=>{
  const f=recoverableFixture(),c=f.make();await c.open();c.markDirty({value:2});
  f.faults.domain='before';await assert.rejects(c.save(),/domain failure/);
  assert.equal(f.draft().experiment.value,2);
  f.faults.domain=null;
  const reopened=f.make();await reopened.open();
  await reopened.loadDraft(reopened.draftOffer());
  f.faults.session='before';await assert.rejects(reopened.save(),/session failure/);
  assert.equal(f.row().revision,1);
  const retry=f.make();await retry.open();
  assert.equal(retry.state().status,'recovering');assert.equal(retry.draftOffer(),null);
  assert.equal(retry.recoveryOffer().revision,'r2');
  f.faults.session=null;await retry.acceptHead(retry.recoveryOffer());
  assert.equal(retry.state().status,'clean');assert.equal(f.draft(),null);
});
test('recoverable controller does not erase newer draft when acknowledging divergent head',async()=>{
  const f=recoverableFixture(),c=f.make();await c.open();c.markDirty({value:2});
  const original=f.working.write;
  f.working.write=async(...args)=>{const receipt=await original(...args);
    c.markDirty({value:3});await c.flushCheckpoint();return receipt;};
  f.faults.session='before';await assert.rejects(c.save(),/session failure/);
  const reopened=f.make();await reopened.open();
  assert.equal(reopened.draftOffer(),null);
  f.faults.session=null;await reopened.acceptHead(reopened.recoveryOffer());
  assert.equal(reopened.state().status,'recovering');
  assert.equal(reopened.state().bound.experiment.value,2);
  assert.deepEqual(await reopened.loadDraft(reopened.draftOffer()),{value:3});
});
test('recoverable controller fails closed on checkpoint failure, retains input and external priority',async()=>{
  const f=recoverableFixture(),external=f.make();await external.open({explicitIntent:true});
  assert.equal(f.recovery.reads,0);assert.equal(f.faults.reads,0);
  const c=f.make();await c.open();
  f.recovery.stage=()=>{throw Error('quota');};c.markDirty({value:2});
  await assert.rejects(c.flushCheckpoint(),/quota/);
  assert.equal(c.state().status,'failed');assert.deepEqual(c.state().latestInput,{value:2});
  await assert.rejects(c.save(),/dirty recoverable/);assert.equal(f.row().revision,1);
});
test('recoverable controller retires matching post-CAS draft on F5 and rejects changed offer',async()=>{
  const f=recoverableFixture(),c=f.make();await c.open();c.markDirty({value:2});
  f.faults.session='after';await assert.rejects(c.save(),/lost session/);
  assert.equal(f.row().revision,2);assert.ok(f.draft());
  f.faults.session=null;const reopened=f.make();await reopened.open();
  assert.equal(reopened.state().status,'clean');assert.equal(f.draft(),null);
  reopened.markDirty({value:3});await reopened.flushCheckpoint();
  const next=f.make();await next.open();const selection=next.draftOffer();
  await f.working.stageRecovery({value:4},'r2',f.draft().revision);
  await assert.rejects(next.loadDraft(selection),/offer changed/);
  assert.equal(f.draft().experiment.value,4);
});

test('shared document envelope uses fixed identity and retains independent domain slots',async()=>{
  const empty=contract.emptyShared();
  assert.equal(empty.sessionId,'shared');
  assert.equal(empty.version,2);
  assert.equal(Object.hasOwn(empty,'tabId'),false);
  const first=contract.select(empty,'compare',{id:'working-shared',revision:'r1',recovery:null});
  const second=contract.select(first,'calibration',{id:'cal-a',revision:'r2',recovery:null});
  assert.equal(second.documents.experiment.id,'working-shared');
  assert.equal(second.documents.calibration.id,'cal-a');
  assert.throws(()=>contract.normalize({...second,sessionId:'other'}),/unsupported/);
  assert.throws(()=>contract.normalize({...second,tabId:'tab-a'}),/fields/);
  const plan=await contract.planRestore(second,{readDocument:async(kind,id)=>({kind,id,revision:'r2'})});
  assert.equal(plan.document.id,'cal-a');
  const m=tracker(first);m.markDirty();const token=m.beginSave();
  assert.equal(token.sessionId,'shared');
  assert.equal(Object.hasOwn(token,'tabId'),false);
  const pending=m.acknowledgeDocument(token,receipt(token,'r3'));
  assert.equal(pending.envelope.sessionId,'shared');
  assert.equal(m.acknowledgeSession(token,{revision:5,envelope:pending.envelope}),true);
  assert.equal(m.state().session.documents.experiment.revision,'r3');
});
