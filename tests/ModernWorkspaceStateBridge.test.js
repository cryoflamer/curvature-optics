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


const FOLD_SECTIONS=[
  'camera.pose','camera.navigation','camera.animation','camera.savedViews',
  'camera.frameName','surface.geometry','atmosphere.profile',
  'atmosphere.explanation','atmosphere.visibility','atmosphere.shimmer',
  'objects.group1','objects.group2','objects.group1.variations',
  'objects.group2.variations','display.advanced','display.diagnostics',
  'display.gpu','display.profiler'
];
function fullBridge({rows=new Map(),tab='first',legacy}={}){
  const defaults=Object.fromEntries(
    ['scene','compare'].flatMap(mode=>
      FOLD_SECTIONS.map((suffix,i)=>[mode+'.'+suffix,mode==='scene'?i%2===0:i%2===1])));
  const source=legacy||defaults,store=memoryStore(tab,rows);
  const bridge=bridgeApi.create({registryApi,managerApi,env:{},
    sessionStoreApi:{create(){return store;}},
    suffixes:FOLD_SECTIONS,legacyValue:(mode,suffix)=>source[mode+'.'+suffix]});
  return {bridge,store,source,rows};
}

test('all 18 declared folds preserve independent Scene/Compare legacy defaults on first restore',async()=>{
  const {bridge,source,rows}=fullBridge();
  const state=await bridge.restore();
  assert.deepEqual(state.warnings,[]);
  assert.equal(bridge.sections.length,18);
  for(const suffix of FOLD_SECTIONS){
    assert.equal(bridge.supports(suffix),true);
    assert.equal(bridge.get('scene',suffix),source['scene.'+suffix]);
    assert.equal(bridge.get('compare',suffix),source['compare.'+suffix]);
  }
  assert.equal(rows.size,0,'the 36 fallback values must not be backfilled on read');
  assert.equal(bridge.supports('object-explorer.tree.expanded'),false);
});

test('grouped section reset uses at most one acknowledged record per mode',async()=>{
  const {bridge,rows}=fullBridge();
  await bridge.restore();
  await bridge.set('scene','surface.geometry',true);
  await bridge.set('compare','atmosphere.profile',true);
  await bridge.flush();
  const before=Object.fromEntries([...rows.entries()].map(([key,value])=>[key,value.revision]));
  assert.equal(rows.size,2);
  await bridge.reset(()=>false);
  await bridge.flush();
  for(const mode of ['scene','compare']){
    for(const suffix of FOLD_SECTIONS)assert.equal(bridge.get(mode,suffix),false);
    const key='per-tab-and-workspace:first:'+mode;
    assert.equal(rows.get(key).revision,before[key]+1,
      'a layout reset must not write 18 snapshots per mode');
  }
  const revisions=[...rows.values()].map(x=>x.revision);
  await bridge.reset(()=>false);
  assert.deepEqual([...rows.values()].map(x=>x.revision),revisions);
});

test('unknown/newer persisted fold version is left untouched and cannot be overwritten',async()=>{
  const stored={format:registryApi.FORMAT,version:registryApi.VERSION,
    scope:'per-tab-and-workspace',
    values:{'workspace.section.camera.navigation':{version:99,value:true}}};
  const key='per-tab-and-workspace:first:scene';
  const rows=new Map([[key,{revision:5,envelope:structuredClone(stored)}]]);
  const {bridge}=fullBridge({rows});
  const report=await bridge.restore();
  assert.deepEqual(report.warnings,['scene:workspace.section.camera.navigation']);
  assert.throws(()=>bridge.set('scene','camera.pose',false),/unsupported keys/);
  assert.equal(rows.get(key).revision,5);
  assert.deepEqual(rows.get(key).envelope,stored);
});

test('preflight rejects invalid full-layout reset without changing the other mode',async()=>{
  const {bridge,rows}=fullBridge();
  await bridge.restore();
  await assert.rejects(bridge.reset((mode,suffix)=>
    mode==='compare'&&suffix==='atmosphere.profile'?'not boolean':false
  ),/invalid reset default/);
  assert.equal(rows.size,0);
});
