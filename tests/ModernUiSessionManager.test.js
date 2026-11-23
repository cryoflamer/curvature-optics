'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const registry=require('../src/storage/ModernStateRegistry.js');
const managerApi=require('../src/storage/ModernUiSessionManager.js');

function store(tab,records=new Map()){
  function id(scope,context){
    return scope==='global'?'global':
      scope==='per-tab'?'tab:'+context.tabId:
        'workspace:'+context.tabId+':'+context.workspace;
  }
  return {
    tabId:()=>tab,
    records,
    async read(scope,context){
      return records.get(id(scope,context))||{revision:0,envelope:null};
    },
    async write(scope,context,envelope,revision){
      const name=id(scope,context),before=records.get(name);
      const current=before?before.revision:0;
      if(current!==revision)throw Error('UI Session Store: revision conflict');
      const result={revision:current+1,envelope:structuredClone(envelope)};
      records.set(name,result);
      return {revision:result.revision};
    }
  };
}
function specs(manager){
  manager.register({
    key:'object-explorer.tree.open',scope:'per-tab-and-workspace',version:1,
    defaultValue:false,validate:v=>typeof v==='boolean'
  });
  manager.register({
    key:'object-explorer.active-panel',scope:'per-tab-and-workspace',version:1,
    defaultValue:'tree',validate:v=>['tree','details'].includes(v)
  });
  manager.register({
    key:'application.theme',scope:'global',version:1,defaultValue:'light',
    validate:v=>['light','dark'].includes(v)
  });
}
function create(storeInstance,workspace='object-explorer'){
  const manager=managerApi.create({registry:registry.create(),store:storeInstance,workspace});
  specs(manager);
  return manager;
}
function element(initial=false){
  const callbacks=new Map(),attributes=new Map();
  return {
    open:initial,
    addEventListener(name,handler){
      if(!callbacks.has(name))callbacks.set(name,new Set());
      callbacks.get(name).add(handler);
    },
    removeEventListener(name,handler){callbacks.get(name)?.delete(handler);},
    setAttribute(name,value){attributes.set(name,value);},
    getAttribute(name){return attributes.get(name);},
    emit(name){for(const cb of callbacks.get(name)||[])cb();},
    listeners(name){return callbacks.get(name)?.size||0}
  };
}
test('new Object Explorer details panel persists without custom storage or lifecycle logic',async()=>{
  const data=new Map(),first=create(store('one-tab',data));
  assert.equal((await first.restore()).ready,true);
  const details=element();
  const off=first.bindDetails('object-explorer.tree.open',details);
  assert.equal(details.open,false);
  details.open=true;details.emit('toggle');
  await first.flush();
  assert.equal(data.get('workspace:one-tab:object-explorer').revision,1);
  off();assert.equal(details.listeners('toggle'),0);
  const resumed=create(store('one-tab',data));
  let restoresWritten=0;
  const original=data.get('workspace:one-tab:object-explorer').revision;
  await resumed.restore();
  const restored=element(false);
  resumed.bindDetails('object-explorer.tree.open',restored);
  assert.equal(restored.open,true);
  restored.emit('toggle');await resumed.flush();
  assert.equal(data.get('workspace:one-tab:object-explorer').revision,original);
  assert.equal(restoresWritten,0);
});
test('one registration and generic choices binding support a new view without manual saves',async()=>{
  const data=new Map(),manager=create(store('one-tab',data));
  await manager.restore();
  const tree=element(),details=element();
  manager.bindChoices('object-explorer.active-panel',[
    {element:tree,value:'tree'},{element:details,value:'details'}
  ]);
  assert.equal(tree.getAttribute('aria-pressed'),'true');
  assert.equal(details.getAttribute('aria-pressed'),'false');
  details.emit('click');await manager.flush();
  assert.equal(manager.get('object-explorer.active-panel'),'details');
  assert.equal(tree.getAttribute('aria-pressed'),'false');
  assert.equal(details.getAttribute('aria-pressed'),'true');
  assert.equal(data.get('workspace:one-tab:object-explorer').revision,1);
});
test('tab/workspace scopes remain independent while globals are shared',async()=>{
  const data=new Map();
  const tab1=create(store('tab1',data)),tab2=create(store('tab2',data));
  await tab1.restore();await tab2.restore();
  await tab1.set('object-explorer.tree.open',true);
  assert.equal(tab2.get('object-explorer.tree.open'),false);
  await tab1.set('application.theme','dark');
  const refreshed=create(store('tab2',data));
  await refreshed.restore();
  assert.equal(refreshed.get('application.theme'),'dark');
  assert.equal(refreshed.get('object-explorer.tree.open'),false);
  const otherSpace=create(store('tab1',data),'scene');
  await otherSpace.restore();
  assert.equal(otherSpace.get('object-explorer.tree.open'),false);
});
test('stale revision conflicts are reported and never overwrite another record',async()=>{
  const data=new Map(),instance=create(store('tab1',data));
  await instance.restore();
  data.set('workspace:tab1:object-explorer',
    {revision:1,envelope:registry.create().snapshot('global')});
  await assert.rejects(instance.set('object-explorer.tree.open',true),
    /revision conflict/);
  assert.equal(data.get('workspace:tab1:object-explorer').revision,1);
  assert.match(instance.lastErrors()[0].message,/revision conflict/);
  await assert.rejects(instance.flush(),/revision conflict/);
});
test('missing UI nodes are ignored and invalid state never reaches the store',async()=>{
  const data=new Map(),instance=create(store('tab1',data));
  await instance.restore();
  assert.equal(typeof instance.bindDetails('object-explorer.tree.open',null),'function');
  assert.throws(()=>instance.get('missing.field'),/unregistered state/);
  await assert.rejects(async()=>instance.set('object-explorer.active-panel','invalid'),
    /invalid value/);
  assert.equal(data.size,0);
});
test('restore must precede edits and register must precede restore',async()=>{
  const instance=create(store('tab1'));
  await assert.rejects(async()=>instance.set('object-explorer.tree.open',true),
    /restore state before user changes/);
  await instance.restore();
  assert.throws(()=>instance.register({key:'future.new',scope:'global',
    version:1,defaultValue:true,validate:()=>true}),/register before restore/);
  await assert.rejects(instance.restore(),/restore can run only once/);
});


test('bulk state updates write a single revision and preflight all values',async()=>{
  const data=new Map(),manager=create(store('tab1',data));
  await manager.restore();
  assert.equal(await manager.setMany({
    'object-explorer.tree.open':true,
    'object-explorer.active-panel':'details'
  }),true);
  const key='workspace:tab1:object-explorer';
  assert.equal(data.get(key).revision,1,'one IDB transaction per scope');
  assert.equal(manager.get('object-explorer.tree.open'),true);
  assert.equal(manager.get('object-explorer.active-panel'),'details');
  assert.equal(await manager.setMany({
    'object-explorer.tree.open':true,
    'object-explorer.active-panel':'details'
  }),false,'unchanged values never trigger a write');
  assert.equal(data.get(key).revision,1);
  assert.throws(()=>manager.setMany({
    'object-explorer.tree.open':false,
    'object-explorer.active-panel':'invalid'
  }),/invalid value/);
  assert.equal(manager.get('object-explorer.tree.open'),true,
    'failed preflight must not partially change memory');
  assert.equal(data.get(key).revision,1);
  assert.throws(()=>manager.setMany({
    'object-explorer.tree.open':false,
    'application.theme':'dark'
  }),/one scope/);
  assert.equal(manager.get('object-explorer.tree.open'),true);
});

test('unknown/newer stored UI keys remain intact and prevent whole-envelope replacement',async()=>{
  const old={format:registry.FORMAT,version:registry.VERSION,
    scope:'per-tab-and-workspace',
    values:{
      'object-explorer.tree.open':{version:2,value:true},
      'future.object-explorer.panel':{version:1,value:'future-version'}
    }};
  const data=new Map([['workspace:tab1:object-explorer',{
    revision:8,envelope:structuredClone(old)
  }]]);
  const manager=create(store('tab1',data));
  const report=await manager.restore();
  assert.deepEqual(report.unrecognizedKeys,
    ['object-explorer.tree.open','future.object-explorer.panel']);
  assert.throws(()=>manager.set('object-explorer.active-panel','details'),
    /unsupported keys/);
  assert.throws(()=>manager.setMany({
    'object-explorer.active-panel':'details'
  }),/unsupported keys/);
  assert.deepEqual(data.get('workspace:tab1:object-explorer').envelope,old);
  assert.equal(data.get('workspace:tab1:object-explorer').revision,8);
});

test('UI manager must claim tab identity before reading any scoped registry state',async()=>{
  const data=new Map(),backend=store('one-tab',data);
  let release,reads=0,claims=0;
  const deferred=new Promise(resolve=>{release=resolve;});
  const read=backend.read;
  backend.claimTab=async()=>{claims++;await deferred;};
  backend.read=async(...args)=>{reads++;return read(...args);};
  const manager=create(backend);
  const pending=manager.restore();
  await Promise.resolve();await Promise.resolve();
  assert.equal(claims,1);
  assert.equal(reads,0,'copied-tab state cannot be consumed before ownership check');
  release();await pending;
  assert.equal(reads,2,'global and per-workspace records read after identity claim');
});

test('a transient IDB failure can be retried without another UI edit',async()=>{
  const rows=new Map(),backend=store('tab1',rows),write=backend.write;
  let failures=1;
  backend.write=async(...args)=>{
    if(failures-- > 0)throw Error('simulated temporary quota fault');
    return write(...args);
  };
  const manager=create(backend);await manager.restore();
  await assert.rejects(manager.set('object-explorer.tree.open',true),
    /temporary quota fault/);
  assert.equal(manager.get('object-explorer.tree.open'),true);
  assert.equal(rows.size,0,'failure is not a durability acknowledgement');
  assert.equal(manager.lastErrors().length,1);
  assert.equal(await manager.retryFailed(),1);
  await manager.flush();
  assert.equal(rows.get('workspace:tab1:object-explorer').revision,1);
  assert.equal(rows.get('workspace:tab1:object-explorer').envelope
    .values['object-explorer.tree.open'].value,true);
  assert.deepEqual(manager.lastErrors(),[]);
  assert.equal(await manager.retryFailed(),0,'clean state is not rewritten');
});
test('a lost write acknowledgement is reconciled by reread without a double write',async()=>{
  const rows=new Map(),backend=store('tab1',rows),write=backend.write;
  let loseAck=true,writes=0;
  backend.write=async(...args)=>{
    writes++;
    const saved=await write(...args);
    if(loseAck){loseAck=false;throw Error('simulated acknowledgement loss');}
    return saved;
  };
  const manager=create(backend);await manager.restore();
  await assert.rejects(manager.set('object-explorer.active-panel','details'),
    /acknowledgement loss/);
  assert.equal(rows.get('workspace:tab1:object-explorer').revision,1);
  assert.equal(await manager.retryFailed(),1);
  assert.equal(writes,1,'a verified commit must not be duplicated');
  await manager.flush();
  assert.deepEqual(manager.lastErrors(),[]);
  assert.equal(await manager.set('object-explorer.tree.open',true),true);
  assert.equal(rows.get('workspace:tab1:object-explorer').revision,2);
});
test('a foreign revision cannot be overwritten by failed-write retry',async()=>{
  const rows=new Map(),backend=store('tab1',rows);
  backend.write=async()=>{throw Error('simulated temporary failure');};
  const manager=create(backend);await manager.restore();
  await assert.rejects(manager.set('object-explorer.tree.open',true),
    /temporary failure/);
  const foreign={revision:1,envelope:{format:registry.FORMAT,
    version:registry.VERSION,scope:'per-tab-and-workspace',
    values:{'object-explorer.tree.open':{version:1,value:false},
      'object-explorer.active-panel':{version:1,value:'details'}}}};
  rows.set('workspace:tab1:object-explorer',structuredClone(foreign));
  await assert.rejects(manager.retryFailed(),/revision conflict/);
  assert.deepEqual(rows.get('workspace:tab1:object-explorer'),foreign);
  assert.match(manager.lastErrors()[0].message,/revision conflict/);
});

test('early reload restores staged UI intent with original CAS revision',async()=>{
  const data=new Map(),memory=store('tab1',data);
  const journal=new Map();
  const adapter={
    ...memory,
    stage(scope,ctx,envelope,revision){
      journal.set(ctx.workspace,{scope,ctx,envelope:structuredClone(envelope),
        expectedRevision:revision});
    },
    readPending(scope,ctx){return journal.get(ctx.workspace)||null;},
    acknowledge(scope,ctx,envelope,revision){
      const row=journal.get(ctx.workspace);
      if(row&&row.expectedRevision+1===revision&&
         JSON.stringify(row.envelope)===JSON.stringify(envelope))
        journal.delete(ctx.workspace);
    }
  };
  let release;
  adapter.write=async(...args)=>await new Promise(resolve=>{release=()=>resolve(memory.write(...args));});
  const first=create(adapter);await first.restore();
  // The UI gesture synchronously stages before its async IDB write begins.
  const pending=first.set('object-explorer.active-panel','details');
  assert.equal(journal.get('object-explorer').envelope.values
    ['object-explorer.active-panel'].value,'details');
  assert.equal(data.size,0);
  // Emulate F5: the old transaction never commits. New document gets a
  // working adapter with the same tab-scoped pending journal.
  const restarted={...memory,stage:adapter.stage,readPending:adapter.readPending,
    acknowledge:adapter.acknowledge};
  const next=create(restarted);await next.restore();
  assert.equal(next.get('object-explorer.active-panel'),'details');
  assert.equal(data.get('workspace:tab1:object-explorer').revision,1);
  assert.equal(journal.size,0);
  assert.equal(typeof release,'function',
    'the abandoned asynchronous write was started but never acknowledged');
  void pending.catch(()=>{});
});
test('reload accepts a previously committed matching pending intent without doubling revision',async()=>{
  const records=new Map(),frame={
    format:registry.FORMAT,version:registry.VERSION,scope:'per-tab-and-workspace',
    values:{'object-explorer.active-panel':{version:1,value:'details'}}};
  records.set('workspace:tab1:object-explorer',{
    revision:1,envelope:structuredClone(frame)});
  const pending={expectedRevision:0,envelope:structuredClone(frame)};
  let acknowledges=0,writes=0;
  const underlying=store('tab1',records);
  const manager=create({...underlying,
    readPending:scope=>scope==='per-tab-and-workspace'?pending:null,
    acknowledge(){acknowledges++;},
    async write(...args){writes++;return underlying.write(...args);}
  });
  await manager.restore();
  assert.equal(manager.get('object-explorer.active-panel'),'details');
  assert.equal(acknowledges,1);
  assert.equal(writes,0);
  assert.equal(records.get('workspace:tab1:object-explorer').revision,1);
});
test('early reload preserves conflicting journal and foreign durable revision',async()=>{
  const data=new Map(),foreign={format:registry.FORMAT,
    version:registry.VERSION,scope:'per-tab-and-workspace',
    values:{'object-explorer.active-panel':{version:1,value:'tree'}}};
  const ours=structuredClone(foreign);
  ours.values['object-explorer.active-panel'].value='details';
  data.set('workspace:tab1:object-explorer',{revision:1,envelope:foreign});
  let acknowledgements=0;
  const storage=store('tab1',data),manager=create({...storage,
    readPending:scope=>scope==='per-tab-and-workspace'?
      {expectedRevision:0,envelope:ours}:null,
    acknowledge(){acknowledgements++;}});
  await assert.rejects(manager.restore(),/pending UI revision conflict/);
  assert.equal(acknowledgements,0);
  assert.deepEqual(data.get('workspace:tab1:object-explorer'),
    {revision:1,envelope:foreign});
});

test('unavailable synchronous staging fails explicitly rather than claiming F5 safety',async()=>{
  const data=new Map(),underlying=store('tab1',data),manager=create({
    ...underlying,
    stage(){throw Error('simulated sessionStorage quota denied');}
  });
  await manager.restore();
  await assert.rejects(manager.set('object-explorer.tree.open',true),
    /sessionStorage quota denied/);
  assert.equal(data.size,0,'no IDB write after failed crash-recovery staging');
  assert.equal(manager.get('object-explorer.tree.open'),true,
    'user-selected UI remains in memory for manual recovery');
  assert.match(manager.lastErrors()[0].message,/sessionStorage quota denied/);
  await assert.rejects(manager.retryFailed(),/pending UI staging failed/);
});
