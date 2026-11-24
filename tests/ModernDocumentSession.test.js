const test=require('node:test');
const assert=require('node:assert/strict');
const contract=require('../src/storage/ModernDocumentSession');
function bound(mode='scene',id='work-a',revision='digest:abc'){
  return contract.select(contract.empty('tab-a'),mode,{id,revision,recovery:null});
}
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
test('historical recovery plan verifies document and base revision',async()=>{
  const s=recoverable();
  await assert.rejects(contract.planRestore(s,{readDocument,
    readRecovery:async(kind,id)=>({...await readRecovery(kind,id),documentId:'wrong'})}),/recovery missing/);
  const plan=await contract.planRestore(s,{readDocument,readRecovery});
  assert.equal(plan.source,'recovery');
  assert.equal(plan.document.recovery.id,'recover-a');
  assert.equal(contract.createSaveTracker,undefined);
  let live=true;
  await assert.rejects(contract.planRestore(s,{readDocument,isCurrent:()=>live,
    readRecovery:async(kind,id)=>{live=false;return readRecovery(kind,id);}}),/stale restore generation/);
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
  assert.equal(first.documents.experiment.revision,'r1');
  assert.equal(second.documents.experiment.revision,'r1');
});

function atomicControllerFixture(){
  const copy=v=>JSON.parse(JSON.stringify(v));
  const base={display:{mode:'scene'},height:1};
  let durable={revision:1,envelope:contract.select(contract.emptyShared(),'scene',
    {id:'shared-experiment',revision:'checkpoint:1',recovery:null}),experiment:base,draft:null,digest:'initial'};
  let pause=null,fault=null,reads=0;
  function open({lease={sessionId:'shared',check(){}},prepare=()=>{throw Error('unexpected migration');},isCurrent=()=>true}={}){
    let seen;
    const checkpoint={
      async read(){reads++;seen=copy(durable);return copy(seen);},
      async stage(experiment,revision){
        if(JSON.stringify(seen)!==JSON.stringify(durable)||revision!==durable.revision)throw Error('CAS conflict');
        if(fault==='stage')throw Error('stage failure');
        durable={...durable,revision:revision+1,draft:copy(experiment),digest:'stage:'+revision};
        seen=copy(durable);return copy(seen);
      },
      async promote(revision){
        if(pause)await pause;
        if(JSON.stringify(seen)!==JSON.stringify(durable)||revision!==durable.revision)throw Error('CAS conflict');
        if(fault==='before')throw Error('promotion failure');
        durable={revision:revision+1,envelope:contract.select(durable.envelope,durable.draft.display.mode,
          {id:'shared-experiment',revision:'checkpoint:'+(revision+1),recovery:null}),
          experiment:durable.draft,draft:null,digest:'promote:'+revision};
        if(fault==='after')throw Error('lost acknowledgement');
        seen=copy(durable);return copy(seen);
      }};
    return contract.createAtomicExperimentController({lease,checkpoint,prepare,isCurrent});
  }
  return {base,open,reads:()=>reads,fault(value){fault=value;},hold(){let release;pause=new Promise(resolve=>{release=resolve;});return ()=>{pause=null;release();};}};
}
test('atomic controller coalesces later edits during promotion and rejects stale writer',async()=>{
  const f=atomicControllerFixture(),a=f.open(),b=f.open();
  await a.open();await b.open();
  const first={...f.base,height:2},last={...f.base,height:3,display:{mode:'compare'}};
  a.markDirty(first);await a.flushCheckpoint();
  const release=f.hold(),pending=a.save();
  while(a.state().status!=='saving')await Promise.resolve();
  a.markDirty(last);release();await pending;await a.flushCheckpoint();
  assert.equal(a.state().status,'dirty');
  assert.deepEqual(a.state().bound.experiment,first);
  assert.deepEqual(a.state().draft.experiment,last);
  await a.save();
  assert.equal(a.state().status,'committed');assert.equal(a.state().draft,null);
  assert.deepEqual(a.state().bound.experiment,last);
  b.markDirty({...f.base,height:9});
  await assert.rejects(b.flushCheckpoint(),/CAS conflict/);
  assert.equal(b.state().latestInput.height,9);
  const c=f.open();await c.open();assert.deepEqual(c.state().bound.experiment,last);
});
test('atomic controller explicitly restores a durable draft without changing the committed payload',async()=>{
  const f=atomicControllerFixture(),a=f.open();await a.open();
  const edit={...f.base,height:2};a.markDirty(edit);await a.flushCheckpoint();
  const b=f.open();await b.open();
  assert.equal(b.state().status,'recovering');
  assert.deepEqual(b.state().bound.experiment,f.base);
  const offer=b.draftOffer();assert.deepEqual(await b.loadDraft(offer),edit);
  assert.equal(b.state().status,'dirty');await b.save();
  assert.deepEqual(b.state().bound.experiment,edit);assert.equal(b.state().draft,null);
});

test('atomic controller external intent and stale generation do not read private data',async()=>{
  const f=atomicControllerFixture();
  const a=f.open();await a.open({explicitIntent:true});
  assert.equal(a.state().status,'external');assert.equal(f.reads(),0);
  const b=f.open({isCurrent:()=>false});
  await assert.rejects(b.open(),/stale controller generation/);
  assert.equal(f.reads(),0);
  assert.throws(()=>f.open({lease:{sessionId:'shared',tabId:'old',check(){}}}),/dependencies required/);
});
test('atomic controller refuses stale draft writers and obsolete draft offers',async()=>{
  const f=atomicControllerFixture(),a=f.open(),b=f.open();await a.open();await b.open();
  a.markDirty({...f.base,height:2});await a.flushCheckpoint();
  const c=f.open();await c.open();const offer=c.draftOffer();
  b.markDirty({...f.base,height:9});await assert.rejects(b.flushCheckpoint(),/CAS conflict/);
  assert.equal(b.state().latestInput.height,9);
  a.markDirty({...f.base,height:3});await a.flushCheckpoint();
  await assert.rejects(c.loadDraft(offer),/draft offer changed/);
  const fresh=f.open();await fresh.open();assert.equal(fresh.state().draft.experiment.height,3);
  assert.equal(fresh.state().bound.experiment.height,1);
});
test('atomic controller failed stage retains input and cannot promote',async()=>{
  const f=atomicControllerFixture(),a=f.open();await a.open();
  f.fault('stage');a.markDirty({...f.base,height:2});
  await assert.rejects(a.flushCheckpoint(),/stage failure/);
  await assert.rejects(a.save(),/dirty experiment required/);
  assert.equal(a.state().latestInput.height,2);
  const b=f.open();await b.open();assert.equal(b.state().status,'clean');
  assert.equal(b.state().bound.experiment.height,1);
});
test('atomic controller failed promotion retains draft and later input; lost ack requires fresh read',async()=>{
  for(const fault of ['before','after']){
    const f=atomicControllerFixture(),a=f.open();await a.open();
    a.markDirty({...f.base,height:2});await a.flushCheckpoint();
    const release=f.hold(),saving=a.save();
    while(a.state().status!=='saving')await Promise.resolve();
    a.markDirty({...f.base,height:3});f.fault(fault);release();
    await assert.rejects(saving,/promotion failure|lost acknowledgement/);
    assert.equal(a.state().status,'failed');assert.equal(a.state().latestInput.height,3);
    assert.equal(a.state().bound.experiment.height,1);assert.equal(a.state().draft.experiment.height,2);
    f.fault(null);
    const b=f.open();await b.open();
    if(fault==='before'){
      assert.equal(b.state().status,'recovering');assert.equal(b.state().draft.experiment.height,2);
      await b.loadDraft(b.draftOffer());await b.save();
    }else assert.equal(b.state().status,'clean');
    assert.equal(b.state().bound.experiment.height,2);
    assert.equal(b.state().draft,null);
  }
});
