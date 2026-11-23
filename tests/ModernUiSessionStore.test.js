'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const store=require('../src/storage/ModernUiSessionStore.js');
const registry=require('../src/storage/ModernStateRegistry.js');
function storage(initial={}){
  const data=new Map(Object.entries(initial));
  return {
    getItem(key){return data.has(key)?data.get(key):null;},
    setItem(key,value){data.set(key,String(value));},
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
  assert.throws(()=>store.create({}),/IndexedDB, sessionStorage and UUID generator required/);
  assert.equal(store.DATABASE,'curvature-modern-ui-state');
});
