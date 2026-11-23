'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const registryApi=require('../src/storage/ModernStateRegistry.js');
const managerApi=require('../src/storage/ModernUiSessionManager.js');
const bridgeApi=require('../src/storage/ModernWorkspaceStateBridge.js');
function memoryStore(id,rows=new Map()){
  function address(scope,context){
    return scope==='global'?'global':scope+':'+context.tabId+':'+(context.workspace||'');
  }
  return {tabId(){return id;},rows,
    async read(scope,context){return rows.get(address(scope,context))||{revision:0,envelope:null};},
    async write(scope,context,envelope,expectedRevision){
      const key=address(scope,context),prior=rows.get(key),revision=prior?prior.revision:0;
      if(expectedRevision!==revision)throw Error('revision conflict');
      const saved={revision:revision+1,envelope:structuredClone(envelope)};
      rows.set(key,saved);return {revision:saved.revision};
    }
  };
}
function setup({tab='first',rows=new Map(),legacy={
  'scene.camera.navigation':true,'compare.camera.navigation':false
}}={}){
  const store=memoryStore(tab,rows);
  const bridge=bridgeApi.create({registryApi,managerApi,env:{},
    sessionStoreApi:{create(){return store;}},
    suffixes:['camera.navigation'],
    legacyValue:(scope,suffix)=>legacy[scope+'.'+suffix]});
  return {bridge,store,rows,legacy};
}
test('read-first Scene and Compare defaults preserve old preferences without writing',async()=>{
  const fixture=setup();
  assert.equal(fixture.rows.size,0);
  assert.deepEqual((await fixture.bridge.restore()).warnings,[]);
  assert.equal(fixture.bridge.get('scene','camera.navigation'),true);
  assert.equal(fixture.bridge.get('compare','camera.navigation'),false);
  assert.equal(fixture.rows.size,0,'first restore must never migrate/write automatically');
  assert.equal(fixture.legacy['scene.camera.navigation'],true);
  assert.deepEqual(fixture.bridge.sections,['camera.navigation']);
  assert.equal(fixture.bridge.supports('camera.pose'),false);
});
test('Scene/Compare write independently, with no new source-specific persistence handler',async()=>{
  const {bridge,rows}=setup();await bridge.restore();
  await bridge.set('scene','camera.navigation',false);
  await bridge.flush();
  assert.equal(rows.size,1);
  assert.equal(bridge.get('scene','camera.navigation'),false);
  assert.equal(bridge.get('compare','camera.navigation'),false);
  await bridge.set('compare','camera.navigation',true);
  await bridge.flush();
  assert.equal(rows.size,2);
  assert.equal(bridge.get('compare','camera.navigation'),true);
  assert.equal(bridge.get('scene','camera.navigation'),false);
  assert.deepEqual([...rows.values()].map(x=>x.revision),[1,1]);
});
test('existing registry keys win on F5 over stale legacy layout without rewriting it',async()=>{
  const rows=new Map(),first=setup({rows});
  await first.bridge.restore();await first.bridge.set('scene','camera.navigation',false);
  await first.bridge.flush();
  const next=setup({rows,legacy:{
    'scene.camera.navigation':true,'compare.camera.navigation':true
  }});
  await next.bridge.restore();
  assert.equal(next.bridge.get('scene','camera.navigation'),false);
  assert.equal(next.bridge.get('compare','camera.navigation'),true);
  assert.equal(rows.size,1,'restore is read-only and does not backfill missing workspace');
});
test('reset returns registered section choices to known defaults',async()=>{
  const {bridge}=setup();
  await bridge.restore();
  await bridge.set('scene','camera.navigation',false);
  await bridge.set('compare','camera.navigation',true);
  await bridge.reset(()=>false);await bridge.flush();
  assert.equal(bridge.get('scene','camera.navigation'),false);
  assert.equal(bridge.get('compare','camera.navigation'),false);
});
test('new and corrupt data fail closed without deleting legacy settings',async()=>{
  const legacy={'scene.camera.navigation':true,'compare.camera.navigation':false};
  assert.throws(()=>bridgeApi.create({registryApi,managerApi,
    sessionStoreApi:{create(){return memoryStore('t');}},env:{},
    suffixes:['camera.navigation','camera.navigation'],
    legacyValue:(m,s)=>legacy[m+'.'+s]}),/invalid section declarations/);
  const {bridge}=setup({legacy});
  await bridge.restore();
  assert.throws(()=>bridge.get('scene','camera.pose'),/unregistered workspace section/);
  assert.throws(()=>bridge.set('scene','camera.navigation','false'),/invalid section state/);
  assert.deepEqual(legacy,{'scene.camera.navigation':true,'compare.camera.navigation':false});
});
