'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const store=require('../src/storage/ModernUiSessionStore.js');
const registry=require('../src/storage/ModernStateRegistry.js');
const documents=require('../src/storage/ModernDocumentSession');
function storage(initial={}){
  const data=new Map(Object.entries(initial));
  return {
    getItem(key){return data.has(key)?data.get(key):null;},
    setItem(key,value){data.set(key,String(value));},
    removeItem(key){data.delete(key);},
    keys(){return [...data.keys()];}
  };
}
function env(tabStorage=storage()){
  let opened=0;
  const result={indexedDB:{open(){opened++;throw Error('unexpected new DB open');}},
    sessionStorage:tabStorage,crypto:{randomUUID(){return '11111111-2222-4333-8444-555555555555';}}};
  return {result,get opened(){return opened;}};
}
test('session adapter is opt-in: no DB is opened merely by construction or tab identity',()=>{
  const state=env(storage({'curvature-old-recovery':'retain-it'}));
  const adapter=store.create(state.result);
  assert.equal(state.opened,0);
  assert.equal(adapter.tabId(),'11111111-2222-4333-8444-555555555555');
  assert.equal(adapter.tabId(),'11111111-2222-4333-8444-555555555555');
  assert.deepEqual(state.result.sessionStorage.keys().sort(),
    ['curvature-old-recovery',store.TAB_KEY].sort());
  assert.equal(state.opened,0);
});
test('invalid tab identity is rejected without resetting legacy or creating a database',()=>{
  const state=env(storage({[store.TAB_KEY]:'not valid token',
    'curvature-modern-old-draft':'recovery JSON'}));
  const adapter=store.create(state.result);
  assert.throws(()=>adapter.tabId(),/invalid existing tab token/);
  assert.equal(state.result.sessionStorage.getItem('curvature-modern-old-draft'),'recovery JSON');
  assert.equal(state.opened,0);
});
test('invalid or unguarded writes do not open a store',async()=>{
  const state=env(),adapter=store.create(state.result);
  const ui=registry.create();
  ui.register({key:'object-explorer.tree.expanded',scope:'per-tab-and-workspace',
    version:1,defaultValue:[],validate:v=>Array.isArray(v)});
  const ctx={tabId:adapter.tabId(),workspace:'object-explorer'};
  const frame=ui.snapshot('per-tab-and-workspace',ctx);
  await assert.rejects(adapter.write('per-tab-and-workspace',ctx,frame,undefined),
    /expected revision required/);
  await assert.rejects(adapter.write('global',{},frame,0),
    /invalid registry snapshot/);
  await assert.rejects(adapter.write('unknown',ctx,frame,0),
    /invalid state scope|invalid registry snapshot/);
  assert.equal(state.opened,0);
});
test('store cannot be used without supported explicit browser dependencies',()=>{
  assert.throws(()=>store.create({}),/IndexedDB required/);
  const adapter=store.create({indexedDB:{open(){throw Error('unexpected DB open');}}});
  assert.throws(()=>adapter.tabId(),/sessionStorage and UUID generator required/);
  assert.equal(adapter.readPending('workspace',{workspace:'scene'}),null);
  assert.equal(adapter.stage('workspace',{workspace:'scene'},null,0),false);
  assert.equal(store.DATABASE,'curvature-modern-ui-state');
});

function lockFixture(){
  const held=new Set();
  return {held,locks:{
    request(name,options,callback){
      assert.equal(options.mode,'exclusive');
      assert.equal(options.ifAvailable,true);
      if(held.has(name))return Promise.resolve(callback(null));
      held.add(name);
      return Promise.resolve(callback({name})).finally(()=>held.delete(name));
    }
  }};
}
function ownedEnv(locking,session=storage(),uuid='00000000-0000-4000-8000-000000000001'){
  const listeners=new Map();
  return {indexedDB:{open(){throw Error('UI IDB should not open while claiming identity');}},
    sessionStorage:session,crypto:{randomUUID(){return uuid;}},
    navigator:{locks:locking.locks},
    addEventListener(name,fn){listeners.set(name,fn);},
    leave(){listeners.get('pagehide')?.();}};
}
test('copied tab token forks only the new tab while original lease is live',async()=>{
  const locks=lockFixture(),parentEnv=ownedEnv(locks),parent=store.create(parentEnv);
  const first=await parent.claimTab();
  assert.equal(first.forkedFrom,null);
  const copied=storage({[store.TAB_KEY]:first.tabId,
    'legacy-animation-recovery':'keep-untouched'});
  const childEnv=ownedEnv(locks,copied,'00000000-0000-4000-8000-000000000002');
  const child=store.create(childEnv);
  const second=await child.claimTab();
  assert.equal(second.forkedFrom,first.tabId);
  assert.notEqual(second.tabId,first.tabId);
  assert.equal(parent.tabId(),first.tabId);
  assert.equal(child.tabId(),second.tabId);
  assert.equal(copied.getItem('legacy-animation-recovery'),'keep-untouched');
  assert.equal(locks.held.size,2,'both independent tokens remain leased');
  parentEnv.leave();childEnv.leave();
  await Promise.resolve();await Promise.resolve();
  assert.equal(locks.held.size,0);
});
test('tab ownership is required and a released lease cannot write stale UI state',async()=>{
  const missing=env();
  await assert.rejects(store.create(missing.result).claimTab(),
    /exclusive tab ownership unavailable/);
  assert.equal(missing.opened,0);
  const locks=lockFixture(),ownerEnv=ownedEnv(locks);
  const adapter=store.create(ownerEnv),identity=await adapter.claimTab();
  const ui=registry.create();
  ui.register({key:'workspace.view',scope:'per-tab-and-workspace',
    version:1,defaultValue:'editor',validate:v=>v==='editor'});
  const ctx={tabId:identity.tabId,workspace:'calibration'};
  ownerEnv.leave();
  await assert.rejects(adapter.write('per-tab-and-workspace',ctx,
    ui.snapshot('per-tab-and-workspace',ctx),0),
    /tab ownership lost/);
});

test('pending UI intent is staged synchronously and acknowledged only for its scope',async()=>{
  const locks=lockFixture(),session=storage({'legacy-recovery':'must survive'});
  const ctxEnv=ownedEnv(locks,session),adapter=store.create(ctxEnv);
  const claimed=await adapter.claimTab(),ctx={tabId:claimed.tabId,workspace:'scene'};
  const entry={format:registry.FORMAT,version:registry.VERSION,
    scope:'per-tab-and-workspace',values:{
      'workspace.settingsTab':{version:1,value:'Objects'}}};
  assert.equal(adapter.stage('per-tab-and-workspace',ctx,entry,0),true);
  assert.deepEqual(adapter.readPending('per-tab-and-workspace',ctx),
    {format:'curvature-modern-ui-state',version:1,
      target:'workspace:'+ctx.tabId+':scene',scope:'per-tab-and-workspace',
      expectedRevision:0,envelope:entry});
  assert.equal(adapter.readPending('per-tab-and-workspace',
    {...ctx,workspace:'compare'}),null);
  assert.equal(adapter.acknowledge('per-tab-and-workspace',ctx,entry,1),true);
  assert.equal(adapter.readPending('per-tab-and-workspace',ctx),null);
  assert.equal(session.getItem('legacy-recovery'),'must survive');
  ctxEnv.leave();
});
test('pending intent remains across an earlier in-flight acknowledgement',async()=>{
  const locks=lockFixture(),ctxEnv=ownedEnv(locks),adapter=store.create(ctxEnv);
  const claimed=await adapter.claimTab(),ctx={tabId:claimed.tabId,workspace:'scene'};
  const before={format:registry.FORMAT,version:registry.VERSION,
    scope:'per-tab-and-workspace',values:{
      'workspace.settingsTab':{version:1,value:'Objects'}}};
  const after=structuredClone(before);
  after.values['workspace.settingsTab'].value='Display';
  adapter.stage('per-tab-and-workspace',ctx,before,0);
  adapter.stage('per-tab-and-workspace',ctx,after,0);
  adapter.acknowledge('per-tab-and-workspace',ctx,before,1);
  const staged=adapter.readPending('per-tab-and-workspace',ctx);
  assert.equal(staged.expectedRevision,1);
  assert.equal(staged.envelope.values['workspace.settingsTab'].value,'Display');
  adapter.acknowledge('per-tab-and-workspace',ctx,after,2);
  assert.equal(adapter.readPending('per-tab-and-workspace',ctx),null);
  ctxEnv.leave();
});
test('unsupported pending UI bytes fail closed without deleting the original evidence',async()=>{
  const locks=lockFixture(),session=storage(),ctxEnv=ownedEnv(locks,session);
  const adapter=store.create(ctxEnv),claimed=await adapter.claimTab();
  const ctx={tabId:claimed.tabId,workspace:'scene'};
  const key='curvature-modern-ui-pending-v1:workspace:'+claimed.tabId+':scene';
  session.setItem(key,'not valid JSON');
  assert.throws(()=>adapter.readPending('per-tab-and-workspace',ctx),
    /corrupt pending UI write/);
  assert.throws(()=>adapter.stage('per-tab-and-workspace',ctx,{
    format:registry.FORMAT,version:1,scope:'per-tab-and-workspace',
    values:{}},0),/corrupt pending UI write/);
  assert.equal(session.getItem(key),'not valid JSON');
  ctxEnv.leave();
});

test('suspended BFCache lease is reacquired with the same ID and is read-only until validated',async()=>{
  const locks=lockFixture(),session=storage({'legacy-draft':'untouched'});
  const env=ownedEnv(locks,session),adapter=store.create(env);
  const initial=await adapter.claimTab();
  const ctx={tabId:initial.tabId,workspace:'scene'},ui=registry.create();
  ui.register({key:'workspace.view',scope:'per-tab-and-workspace',
    version:1,defaultValue:'editor',validate:v=>v==='editor'});
  const snapshot=ui.snapshot('per-tab-and-workspace',ctx);
  env.leave();
  await Promise.resolve();await Promise.resolve();
  assert.equal(locks.held.size,0);
  await assert.rejects(adapter.write('per-tab-and-workspace',ctx,snapshot,0),
    /tab ownership lost/);
  const returned=await adapter.reclaimTab();
  assert.equal(returned.tabId,initial.tabId,'BFCache is the same document identity');
  assert.equal(returned.forkedFrom,null);
  await assert.rejects(adapter.write('per-tab-and-workspace',ctx,snapshot,0),
    /tab ownership lost/);
  assert.throws(()=>adapter.stage('per-tab-and-workspace',ctx,snapshot,0),
    /tab ownership required/);
  assert.equal(adapter.finishResume(),initial.tabId);
  assert.equal(adapter.stage('per-tab-and-workspace',ctx,snapshot,0),true);
  env.leave();
  await Promise.resolve();await Promise.resolve();
  assert.equal(locks.held.size,0,'second pagehide releases the new lease as well');
  assert.equal(session.getItem('legacy-draft'),'untouched');
});
test('BFCache collision fails closed without ever forking or changing the original token',async()=>{
  const locks=lockFixture(),originalSession=storage();
  const originEnv=ownedEnv(locks,originalSession);
  const original=store.create(originEnv),id=(await original.claimTab()).tabId;
  originEnv.leave();await Promise.resolve();await Promise.resolve();
  const otherEnv=ownedEnv(locks,storage({[store.TAB_KEY]:id}));
  const other=store.create(otherEnv);
  assert.equal((await other.claimTab()).tabId,id);
  await assert.rejects(original.reclaimTab(),/claimed while this page was cached/);
  assert.equal(original.tabId(),id,'original BFCache ID is not silently rotated');
  assert.equal(originalSession.getItem(store.TAB_KEY),id);
  otherEnv.leave();await Promise.resolve();await Promise.resolve();
  assert.equal((await original.reclaimTab()).tabId,id);
  original.finishResume();
  originEnv.leave();await Promise.resolve();await Promise.resolve();
  assert.equal(locks.held.size,0);
});

test('document adapter is dormant and unclaimed operations never open IndexedDB',async()=>{
  const state=env(),ui=store.create(state.result),doc=ui.documentSessions(documents);
  assert.equal(ui.documentSessions(documents),doc);
  await assert.rejects(doc.read(),/document session tab ownership/);
  await assert.rejects(doc.write(documents.empty('tab-a'),0),/document session tab ownership/);
  assert.equal(state.opened,0);
  assert.deepEqual(state.result.sessionStorage.keys(),[]);
  assert.throws(()=>ui.documentSessions({}),/document session contract required/);
});
test('document adapter requires a read in the current writable lease and exact tab identity',async()=>{
  const locks=lockFixture(),ctx=ownedEnv(locks),ui=store.create(ctx);
  const id=(await ui.claimTab()).tabId,doc=ui.documentSessions(documents);
  await assert.rejects(doc.write(documents.empty('other'),0),/tab identity mismatch/);
  await assert.rejects(doc.write(documents.empty(id),0),/read current document session/);
  ctx.leave();await Promise.resolve();await Promise.resolve();
  await assert.rejects(doc.read(),/document session tab ownership/);
  await ui.reclaimTab();
  await assert.rejects(doc.write(documents.empty(id),0),/not validated/);
  ui.finishResume();
  await assert.rejects(doc.write(documents.empty(id),0),/read current document session/);
  assert.deepEqual(ctx.sessionStorage.keys(),[store.TAB_KEY]);
  ctx.leave();
});

test('domain lease is generation-bound and tracks transactions until pagehide',async()=>{
  const locks=lockFixture(),ctx=ownedEnv(locks),ui=store.create(ctx);
  assert.throws(()=>ui.captureDocumentLease(),/ownership lost/);
  const id=(await ui.claimTab()).tabId,lease=ui.captureDocumentLease();
  assert.equal(lease.tabId,id);lease.check(true);
  let aborted=0;
  const remove=lease.track({abort(){aborted++;}},true);
  const removed=lease.track({abort(){aborted+=100;}},true);
  removed();ctx.leave();await Promise.resolve();await Promise.resolve();
  assert.equal(aborted,1);remove();
  assert.throws(()=>lease.check(),/ownership lost/);
  await ui.reclaimTab();
  const resumed=ui.captureDocumentLease();
  resumed.check();assert.throws(()=>resumed.check(true),/not validated/);
  ui.finishResume();resumed.check(true);
  assert.throws(()=>lease.check(true),/ownership lost/);
  ctx.leave();
});

test('document fork does not rotate the copied token if durable origin capture fails',async()=>{
  const locks=lockFixture(),parentEnv=ownedEnv(locks),parent=store.create(parentEnv);
  const first=await parent.claimTab();
  const copied=storage({[store.TAB_KEY]:first.tabId});
  const childEnv=ownedEnv(locks,copied,'00000000-0000-4000-8000-000000000002');
  const child=store.create(childEnv);
  await assert.rejects(child.claimTab({documentFork:true}),/UI IDB should not open/);
  assert.equal(copied.getItem(store.TAB_KEY),first.tabId);
  await Promise.resolve();await Promise.resolve();
  assert.equal(locks.held.size,1);
  parentEnv.leave();
});
