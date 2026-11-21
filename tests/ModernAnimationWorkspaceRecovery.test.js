'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');
const studio=require('../src/animation/ModernAnimationStudio');
const recovery=require('../src/animation/ModernAnimationWorkspaceRecovery');

function memoryStorage(){
  const data=new Map();return {
    get length(){return data.size;},key(n){return [...data.keys()][n]||null;},
    getItem(k){return data.has(k)?data.get(k):null;},
    setItem(k,v){data.set(k,String(v));},removeItem(k){data.delete(k);}
  };
}
function checkpoint(name,when,libraryId=null){
  return autosave.checkpoint({draft:studio.edit(studio.blank(),'name',name),
    selectedKey:null,quality:'auto',prepared:false,positionMs:0,
    libraryId,libraryRevision:libraryId?20:null},when);
}
function collection(name,id,when){return autosave.collection(id,checkpoint(name,when,
  id.startsWith('project_')?id.slice(8):null),when);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
async function settle(){await new Promise(setImmediate);}
function harness({local=null,legacy=null,remote=null,pending=null,generation=0,indexed=true}={}){
  const storage=memoryStorage(),calls=[],events=new Map(),docEvents=new Map();
  if(local)autosave.writeSessionLocal(storage,local,'tab_aaaaaaaa');
  if(legacy)autosave.writeLocal(storage,legacy);
  const win={crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},
    addEventListener:(name,fn)=>events.set(name,fn)};
  if(indexed)win.indexedDB={};
  const doc={hidden:false,addEventListener:(name,fn)=>docEvents.set(name,fn)};
  const fake=Object.assign({},autosave,{
    readCollection:()=>pending?pending.promise:Promise.resolve(remote),
    read:()=>Promise.resolve(null)
  });
  let active=null,baseline=null,lastCheckpoint=null;
  const owner=recovery.create({autosave:fake,root:win,document:doc,
    sessionId:'tab_aaaaaaaa',storage:()=>storage,
    getDraft:()=>studio.blank(),getGeneration:()=>generation,
    restoreCollection:value=>{active=value;calls.push('restore '+value.activeId);},
    setIndexedBaseline:value=>{baseline=value;calls.push('baseline');},
    setCheckpoint:value=>{lastCheckpoint=value;},
    status:(message,isError)=>calls.push('status '+isError+': '+message),
    absorbLate:value=>calls.push('late '+(value?.activeId||'none')),
    onRemoteRestored:()=>calls.push('notify'),
    persist:()=>{calls.push('persist');return Promise.resolve(true);},
    saveDraft:value=>calls.push('save '+value),
    writeDraft:()=>{calls.push('write');return Promise.resolve(true);}
  });
  owner.bind();
  return {calls,storage,events,docEvents,doc,active:()=>active,baseline:()=>baseline,
    lastCheckpoint:()=>lastCheckpoint,setGeneration:n=>{generation=n;}};
}

test('fresh startup registers lifecycle handlers and never flushes an unchanged draft',async()=>{
  const h=harness({indexed:false});
  assert.equal(h.active().workspaces.length,1);
  assert.match(h.calls.join('\n'),/Animation workspaces restored/);
  h.events.get('pagehide')();h.events.get('beforeunload')();
  h.doc.hidden=true;h.docEvents.get('visibilitychange')();
  assert.equal(h.calls.filter(s=>s.startsWith('save ')).length,0);
  h.setGeneration(1);
  h.events.get('pagehide')();h.events.get('beforeunload')();
  h.doc.hidden=false;h.docEvents.get('visibilitychange')();
  assert.deepEqual(h.calls.slice(-4),['save false','write','save false','write']);
  h.doc.hidden=true;h.docEvents.get('visibilitychange')();
  assert.deepEqual(h.calls.slice(-2),['save false','write']);
});

test('a v1 local checkpoint is migrated without losing the draft or selection',()=>{
  const legacy=checkpoint('Previous Studio draft',410);
  const h=harness({legacy,indexed:false});
  assert.equal(h.active().workspaces.length,1);
  assert.equal(autosave.getWorkspace(h.active(),h.active().activeId).draft.name,
    'Previous Studio draft');
  assert.match(h.active().activeId,/^draft_/);
  assert.equal(h.calls.filter(x=>x.startsWith('restore ')).length,1);
});

test('durable workspace is restored over a fresh placeholder without unnecessary rewrite',async()=>{
  const remote=collection('Saved tab','project_saved',300);
  const h=harness({remote});await settle();
  assert.equal(h.active().activeId,'project_saved');
  assert.equal(h.baseline(),remote);
  assert.deepEqual(h.lastCheckpoint(),autosave.getWorkspace(remote,'project_saved'));
  assert.equal(h.calls.filter(x=>x==='notify').length,1);
  assert.equal(h.calls.includes('persist'),false);
});

test('a local-only workspace is reconciled with the remote collection',async()=>{
  const local=collection('Unsaved local','draft_local',400);
  const remote=collection('Other tab','project_other',350);
  const h=harness({local,remote});await settle();
  assert.ok(autosave.getWorkspace(h.active(),'draft_local'));
  assert.ok(autosave.getWorkspace(h.active(),'project_other'));
  assert.equal(h.calls.filter(x=>x==='notify').length,1);
  assert.equal(h.calls.filter(x=>x==='persist').length,1);
});

test('a delayed IndexedDB read never overwrites edits made after startup',async()=>{
  const pending=deferred(),local=collection('Active edit','draft_edit',400);
  const h=harness({local,pending});
  assert.equal(h.active().activeId,'draft_edit');
  h.setGeneration(1);
  pending.resolve(collection('Remote edit','project_remote',500));await settle();
  assert.equal(h.active().activeId,'draft_edit');
  assert.ok(h.calls.includes('late project_remote'));
  assert.equal(h.calls.includes('notify'),false);
  assert.equal(h.calls.includes('persist'),false);
});

test('a failed remote read leaves the local working draft intact',async()=>{
  const pending=deferred(),local=collection('Local retained','draft_local',300);
  const h=harness({local,pending});
  pending.reject(Error('IndexedDB denied'));await settle();
  assert.equal(h.active().activeId,'draft_local');
  assert.equal(h.calls.includes('notify'),false);
  assert.equal(h.calls.includes('persist'),false);
});

test('Modern loads recovery before the editor bootstrap and keeps UI state in ModernApp',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const location='src/animation/ModernAnimationWorkspaceRecovery.js';
  assert.ok(html.indexOf('ModernAnimationDraftAutosave.js')<html.indexOf(location));
  assert.ok(html.indexOf(location)<html.indexOf('src/ui/modern/ModernApp.js'));
  assert.match(app,/studioRecoveryApi\.create\(/);
  assert.match(app,/restoreStudioCollection/);
  assert.match(app,/function persistStudioWorkspace\(\)/);
  assert.doesNotMatch(app,/root\.addEventListener\('beforeunload',function/);
});

test('bulk cleanup UI and host use the existing serialized workspace writer',()=>{
  const root=path.resolve(__dirname,'..');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'src/ui/modern/ModernAnimationStudioUI.js'),'utf8');
  assert.match(app,/function deleteAllStudioDrafts\(keepCurrent\)/);
  assert.match(app,/withoutDrafts\(studioWorkspaces/);
  assert.match(app,/persistStudioWorkspace\(\{requireDurable:true\}\)/);
  assert.match(app,/removeAllDrafts:function\(keepCurrent\)/);
  assert.match(ui,/Working drafts \('/);
  assert.match(ui,/Keep current draft/);
  assert.match(ui,/Delete all drafts/);
});
