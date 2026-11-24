'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const registryApi=require('../src/storage/ModernStateRegistry.js');
const managerApi=require('../src/storage/ModernUiSessionManager.js');
const bridgeApi=require('../src/storage/ModernWorkspaceStateBridge.js');
function memoryStore(id,rows=new Map()){
  function address(scope,context){
    return scope==='global'?'global':scope==='workspace'?'workspace:'+context.workspace:
      scope+':'+context.tabId+':'+(context.workspace||'');
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

test('settings tabs and active workspace use separate validated scopes',async()=>{
  const rows=new Map(),first=fullBridge({rows});
  await first.bridge.restore();
  assert.equal(first.bridge.getTab('scene'),'Camera');
  assert.equal(first.bridge.getTab('compare'),'Camera');
  assert.equal(first.bridge.getMode(),null);
  assert.equal(rows.size,0,'read-first must not backfill');
  await first.bridge.setTab('scene','Objects');
  await first.bridge.setTab('compare','Atmosphere');
  await first.bridge.setMode('compare');
  await first.bridge.flush();
  assert.equal(rows.size,3);
  assert.equal(rows.get('per-tab:first:').envelope.values['workspace.active'].value,'compare');
  assert.equal(rows.get('per-tab-and-workspace:first:scene').envelope.values['workspace.settingsTab'].value,'Objects');
  assert.equal(rows.get('per-tab-and-workspace:first:compare').envelope.values['workspace.settingsTab'].value,'Atmosphere');
  const next=fullBridge({rows});
  await next.bridge.restore();
  assert.equal(next.bridge.getMode(),'compare');
  assert.equal(next.bridge.getTab('scene'),'Objects');
  assert.equal(next.bridge.getTab('compare'),'Atmosphere');
  assert.equal(rows.get('per-tab:first:').revision,1,'hydration must not write');
  const other=fullBridge({rows,tab:'other'});
  await other.bridge.restore();
  assert.equal(other.bridge.getMode(),null);
  assert.equal(other.bridge.getTab('scene'),'Camera');
  await other.bridge.setTab('scene','Display');
  assert.equal(next.bridge.getTab('scene'),'Objects','tabs must be independent');
  assert.throws(()=>first.bridge.setTab('scene','invalid'),/invalid settings tab/);
  assert.throws(()=>first.bridge.setMode('missing'),/invalid workspace/);
});
test('reset clears opt-in workspace and tabs with bounded scoped writes',async()=>{
  const {bridge,rows}=fullBridge();
  await bridge.restore();
  await bridge.setTab('scene','Surface');
  await bridge.setTab('compare','Display');
  await bridge.setMode('animation');
  await bridge.flush();
  await bridge.reset(()=>false);await bridge.flush();
  assert.equal(bridge.getMode(),null);
  assert.equal(bridge.getTab('scene'),'Camera');
  assert.equal(bridge.getTab('compare'),'Camera');
  assert.equal(rows.get('per-tab:first:').revision,2);
  assert.equal(rows.get('per-tab-and-workspace:first:scene').revision,2);
  assert.equal(rows.get('per-tab-and-workspace:first:compare').revision,2);
});
test('future workspace mode blocks writes without removing raw saved evidence',async()=>{
  const frame={format:registryApi.FORMAT,version:registryApi.VERSION,
    scope:'per-tab',values:{'workspace.active':{version:99,value:'calibration'}}};
  const key='per-tab:first:';
  const rows=new Map([[key,{revision:4,envelope:structuredClone(frame)}]]);
  const {bridge}=fullBridge({rows});
  assert.deepEqual((await bridge.restore()).warnings,['scene:workspace.active']);
  assert.throws(()=>bridge.setMode('scene'),/unsupported keys/);
  assert.equal(rows.get(key).revision,4);
  assert.deepEqual(rows.get(key).envelope,frame);
});


test('Animation and Calibration view choices use separate read-first per-tab workspace scopes',async()=>{
  const rows=new Map(),first=fullBridge({rows});
  assert.deepEqual((await first.bridge.restore()).warnings,[]);
  assert.equal(first.bridge.getView('animation'),'library');
  assert.equal(first.bridge.getView('calibration'),'editor');
  assert.equal(rows.size,0,'presentation hydration cannot create durable records');
  await first.bridge.setView('animation','editor');
  await first.bridge.setView('calibration','projects');
  await first.bridge.flush();
  assert.equal(rows.size,2);
  assert.equal(rows.get('per-tab-and-workspace:first:animation').envelope.values['workspace.view'].value,'editor');
  assert.equal(rows.get('per-tab-and-workspace:first:calibration').envelope.values['workspace.view'].value,'projects');
  const second=fullBridge({rows});await second.bridge.restore();
  assert.equal(second.bridge.getView('animation'),'editor');
  assert.equal(second.bridge.getView('calibration'),'projects');
  assert.equal(rows.get('per-tab-and-workspace:first:animation').revision,1,'F5 hydrate must not write');
  const other=fullBridge({rows,tab:'other'});await other.bridge.restore();
  assert.equal(other.bridge.getView('animation'),'library');
  assert.equal(other.bridge.getView('calibration'),'editor');
  assert.throws(()=>first.bridge.setView('animation','projects'),/invalid workspace view/);
  assert.throws(()=>first.bridge.setView('calibration','preview'),/invalid workspace view/);
  assert.throws(()=>first.bridge.getView('scene'),/invalid view workspace/);
});

test('unknown future Animation view is preserved read-only without affecting Calibration',async()=>{
  const frame={format:registryApi.FORMAT,version:registryApi.VERSION,
    scope:'per-tab-and-workspace',values:{'workspace.view':{version:99,value:'timeline'}}};
  const key='per-tab-and-workspace:first:animation';
  const rows=new Map([[key,{revision:6,envelope:structuredClone(frame)}]]);
  const {bridge}=fullBridge({rows});
  assert.deepEqual((await bridge.restore()).warnings,['animation:workspace.view']);
  assert.throws(()=>bridge.setView('animation','preview'),/unsupported keys/);
  assert.equal(rows.get(key).revision,6);
  assert.deepEqual(rows.get(key).envelope,frame);
  assert.equal(bridge.getView('calibration'),'editor');
});

test('bridge exposes explicit retry for failed Animation view without a second writer',async()=>{
  const {bridge,store:backend,rows}=fullBridge();
  await bridge.restore();
  const write=backend.write;let blocked=true;
  backend.write=async(...args)=>{
    if(blocked){blocked=false;throw Error('simulated unavailable storage');}
    return write(...args);
  };
  await assert.rejects(bridge.setView('animation','editor'),/unavailable storage/);
  assert.equal(bridge.getView('animation'),'editor');
  assert.equal(rows.size,0);
  assert.equal(bridge.lastErrors().length,1);
  assert.deepEqual(await bridge.retryFailed(),[{mode:'animation',retried:1}]);
  assert.equal(rows.get('per-tab-and-workspace:first:animation').revision,1);
  assert.deepEqual(bridge.lastErrors(),[]);
  assert.deepEqual(await bridge.retryFailed(),[]);
});

test('bridge resumes only after all workspace scopes validate their saved revisions',async()=>{
  const {bridge,store:backend,rows}=fullBridge();
  let claimed=false,completed=false;
  backend.reclaimTab=async()=>{claimed=true;return {tabId:backend.tabId()};};
  backend.finishResume=()=>{completed=true;};
  await bridge.restore();
  await bridge.setTab('scene','Objects');
  assert.equal(await bridge.resumeAfterPageShow(),true);
  assert.equal(claimed,true);assert.equal(completed,true);
  completed=false;
  const key='per-tab-and-workspace:first:scene';
  const prior=rows.get(key);
  rows.set(key,{revision:prior.revision+1,envelope:prior.envelope});
  await assert.rejects(bridge.resumeAfterPageShow(),/BFCache revision conflict/);
  assert.equal(completed,false,'a stale workspace must never re-enable the lease');
});

test('shared presentation has independent workspace rows and no tab or active workspace owner',async()=>{
  const rows=new Map();
  function open(){
    const store=memoryStore('unused',rows);
    store.tabId=()=>{throw Error('tab identity accessed');};
    store.claimTab=()=>{throw Error('tab lease accessed');};
    return bridgeApi.create({registryApi,managerApi,env:{},
      sessionStoreApi:{create:()=>store},sharedPresentation:true,
      suffixes:['camera.navigation'],legacyValue:()=>false,
      legacyMode:()=>{throw Error('legacy active workspace accessed');}});
  }
  const first=open(),stale=open();
  await first.restore();await stale.restore();
  assert.equal(rows.size,0);
  assert.equal(first.tabId(),null);
  assert.throws(()=>first.getMode(),/document session owns workspace/);
  assert.throws(()=>first.setMode('compare'),/document session owns workspace/);
  await first.setTab('scene','Objects');
  await first.set('scene','camera.navigation',true);
  await first.setTab('compare','Atmosphere');
  await first.setView('animation','preview');
  const reopened=open();await reopened.restore();
  assert.equal(reopened.getTab('scene'),'Objects');
  assert.equal(reopened.getTab('compare'),'Atmosphere');
  assert.equal(reopened.get('scene','camera.navigation'),true);
  assert.equal(reopened.get('compare','camera.navigation'),false);
  assert.equal(reopened.getView('animation'),'preview');
  assert.deepEqual([...rows.keys()].sort(),['workspace:animation','workspace:compare','workspace:scene']);
  const before=structuredClone(rows.get('workspace:scene'));
  await assert.rejects(stale.setTab('scene','Surface'),/revision conflict/);
  assert.deepEqual(rows.get('workspace:scene'),before);
  await assert.rejects(stale.retryFailed(),/revision conflict/);
  await assert.rejects(reopened.resumeAfterPageShow(),/reload before writing/);
  await reopened.reset(()=>false);
  assert.equal(reopened.getTab('scene'),'Camera');
  assert.equal(reopened.getView('animation'),'library');
  assert.equal([...rows.values()].some(row=>'workspace.active' in row.envelope.values),false);
});

test('explicit shared layout backfill verifies source once per missing scope and preserves existing rows',async()=>{
  const rows=new Map(),make=(value,tab='Camera')=>bridgeApi.create({
    registryApi,managerApi,env:{},sharedPresentation:true,
    sessionStoreApi:{create:()=>memoryStore('unused',rows)},
    suffixes:['camera.navigation'],legacyValue:()=>value,legacyTab:()=>tab});
  const a=make(true,'Objects');await a.restore();
  assert.equal(rows.size,0,'plain restore remains read-only');
  await assert.rejects(a.initializeSharedLayout(()=>{throw Error('legacy corrupt');}),/legacy corrupt/);
  assert.equal(rows.size,0);
  assert.deepEqual(await a.initializeSharedLayout(()=>{}),['scene','compare']);
  assert.equal(rows.size,2);
  const saved=structuredClone([...rows.entries()]);
  const b=make(false,'Display');await b.restore();
  assert.deepEqual(await b.initializeSharedLayout(()=>{throw Error('legacy must not be read');}),[]);
  assert.equal(b.get('scene','camera.navigation'),true);
  assert.equal(b.getTab('scene'),'Objects');
  assert.deepEqual([...rows.entries()],saved);
  rows.delete('workspace:compare');
  const c=make(false,'Surface');await c.restore();
  assert.deepEqual(await c.initializeSharedLayout(missing=>assert.deepEqual(missing,['compare'])),['compare']);
  assert.deepEqual(rows.get('workspace:scene'),saved[0][1]);
  assert.equal(c.getTab('compare'),'Surface');
  const bad=structuredClone(rows.get('workspace:compare'));
  delete bad.envelope.values['workspace.settingsTab'];
  rows.set('workspace:compare',bad);
  await assert.rejects(make(true).restore(),/unsupported or incomplete shared layout/);
  assert.deepEqual(rows.get('workspace:compare'),bad);
});
