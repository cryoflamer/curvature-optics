'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const persistence=require('../src/animation/ModernAnimationWorkspacePersistence');

function deferred(){
  let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
async function tick(){await new Promise(setImmediate);}
function harness(config={}){
  const actions=[],waits=[],outcomes=[];
  let generation=1,workspaceId='project_alpha',collection={activeId:workspaceId,label:'local'},
    baseline={label:'baseline'},localSaved=config.localSaved!==false,
    forkId=null,named=true,storageFails=!!config.storageFails;
  const db=config.noDb?null:{id:'db'};
  const autosave={
    writeCollectionMerged:(_db,current,previous)=>{
      actions.push(['merge',current,previous]);
      const pending=deferred();waits.push(pending);return pending.promise;
    },
    pruneSessionLocals:(_storage,committed,sessionId)=>{
      actions.push(['prune',committed,sessionId]);
      if(config.pruneFails)throw Error('storage denied');
    },
    writeSessionLocal:()=>{actions.push(['local backup']);
      if(storageFails)throw Error('storage denied');return true;}
  };
  const coordinator=persistence.create({
    autosave,getCollection:()=>collection,setCollection:value=>{collection=value;actions.push(['committed']);},
    getBaseline:()=>baseline,setBaseline:value=>{baseline=value;actions.push(['baseline']);},
    getGeneration:()=>generation,workspaceId:()=>workspaceId,
    indexedDB:()=>db,crypto:()=>({}),storage:()=>({}),sessionId:()=> 'tab_aaaaaaaa',
    localSaved:()=>localSaved,setLocalSaved:v=>{localSaved=v;},
    onFork:(id,message)=>{workspaceId=id;forkId=id;named=false;actions.push(['fork',message]);},
    status:(text,error)=>actions.push(['status',text,error]),
    renderLibrary:()=>actions.push(['render']),
    absorbLate:value=>actions.push(['late',value])
  });
  const result=(overrides={})=>Object.assign({
    collection:{activeId:workspaceId,label:'durable'},conflicts:[],protectedDeletes:[]
  },overrides);
  return {actions,waits,outcomes,result,coordinator,get:()=>({generation,workspaceId,
    collection,baseline,localSaved,forkId,named}),
    edit:()=>{generation++;collection={activeId:workspaceId,label:'new edits'};},
    failLocal:()=>{storageFails=true;},setLocalSaved:v=>{localSaved=v;}};
}

test('classic browser script loads before ModernApp without CommonJS',()=>{
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const file='src/animation/ModernAnimationWorkspacePersistence.js';
  assert.ok(html.indexOf(file)>html.indexOf('ModernAnimationDraftAutosave.js'));
  assert.ok(html.indexOf(file)<html.indexOf('src/ui/modern/ModernApp.js'));
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  assert.equal(typeof context.CurvatureModernAnimationWorkspacePersistence.create,'function');
  assert.equal(vm.runInContext('typeof require',context),'undefined');
});

test('no workspace or IndexedDB cannot start a transaction',async()=>{
  const a=harness({noDb:true,localSaved:true});
  assert.equal(await a.coordinator.persist(),true);
  assert.equal(a.waits.length,0);
  a.setLocalSaved(false);
  assert.equal(await a.coordinator.persist(),false);
  assert.equal(a.waits.length,0);
  assert.throws(()=>persistence.create({}),/requires collection/);
});

test('successful commit refreshes baseline, prunes completed backups and keeps active editor',async()=>{
  const h=harness(),job=h.coordinator.persist();
  await tick();assert.equal(h.waits.length,1);
  const committed=h.result();h.waits[0].resolve(committed);
  assert.equal(await job,true);
  assert.equal(h.get().collection,committed.collection);
  assert.equal(h.get().baseline,committed.collection);
  assert.equal(h.get().workspaceId,'project_alpha');
  assert.ok(h.get().localSaved);
  assert.deepEqual(h.actions.map(a=>a[0]),['merge','baseline','prune','committed','local backup']);
});

test('same-workspace conflict forks the editor and blocks outgoing project switching',async()=>{
  const h=harness(),job=h.coordinator.persist();await tick();
  const conflict=h.result({collection:{activeId:'draft_fork',label:'two branches'},
    conflicts:[{id:'project_alpha',forkId:'draft_fork'}]});
  h.waits[0].resolve(conflict);
  assert.equal(await job,false);
  assert.equal(h.get().workspaceId,'draft_fork');
  assert.equal(h.get().named,false);
  assert.equal(h.get().collection,conflict.collection);
  assert.ok(h.actions.some(a=>a[0]==='fork'&&/separate draft/.test(a[1])));
  assert.ok(h.actions.some(a=>a[0]==='render'));
});

test('unrelated conflict does not block active project switching',async()=>{
  const h=harness(),job=h.coordinator.persist();await tick();
  h.waits[0].resolve(h.result({conflicts:[{id:'project_beta',forkId:'draft_beta'}]}));
  assert.equal(await job,true);
  assert.equal(h.get().workspaceId,'project_alpha');
  assert.equal(h.actions.filter(a=>a[0]==='render').length,0);
});

test('stale deletion is protected without replacing the active editor',async()=>{
  const h=harness(),job=h.coordinator.persist();await tick();
  h.waits[0].resolve(h.result({protectedDeletes:['project_beta']}));
  assert.equal(await job,true);
  assert.ok(h.actions.some(a=>a[0]==='status'&&/not deleted/.test(a[1])));
  assert.ok(!h.actions.some(a=>a[0]==='fork'));
});

test('new edits during commit keep live collection and trigger late recovery',async()=>{
  const h=harness(),job=h.coordinator.persist();await tick();
  h.edit();const live=h.get().collection,committed=h.result();
  h.waits[0].resolve(committed);
  assert.equal(await job,true);
  assert.equal(h.get().collection,live);
  assert.equal(h.get().baseline,committed.collection);
  assert.ok(h.actions.some(a=>a[0]==='late'&&a[1]===committed.collection));
  assert.ok(!h.actions.some(a=>a[0]==='committed'));
});

test('writes are serialized and second write uses updated baseline',async()=>{
  const h=harness(),first=h.coordinator.persist();
  h.edit();const second=h.coordinator.persist();
  await tick();assert.equal(h.waits.length,1);
  const durable=h.result({collection:{activeId:'project_alpha',label:'first committed'}});
  h.waits[0].resolve(durable);assert.equal(await first,true);
  await tick();assert.equal(h.waits.length,2);
  assert.equal(h.actions.filter(a=>a[0]==='merge')[1][2],durable.collection);
  h.waits[1].resolve(h.result());assert.equal(await second,true);
});

test('failed transaction keeps a valid local backup as fallback',async()=>{
  const h=harness(),job=h.coordinator.persist();await tick();
  h.waits[0].reject(Error('quota exceeded'));
  assert.equal(await job,true);
  assert.ok(h.actions.some(a=>a[0]==='status'&&/local backup retained/.test(a[1])));
});

test('failed transaction with no local backup blocks switching',async()=>{
  const h=harness({localSaved:false}),job=h.coordinator.persist();await tick();
  h.waits[0].reject(Error('denied'));
  assert.equal(await job,false);
  assert.ok(h.actions.some(a=>a[0]==='status'&&/switching blocked/.test(a[1])));
});

test('failed localStorage refresh after durable commit does not negate success',async()=>{
  const h=harness({storageFails:true}),job=h.coordinator.persist();await tick();
  h.waits[0].resolve(h.result());
  assert.equal(await job,true);
  assert.equal(h.get().localSaved,false);
});

test('failed first write cannot poison subsequent queued writes',async()=>{
  const h=harness(),first=h.coordinator.persist();
  h.edit();const second=h.coordinator.persist();await tick();
  h.waits[0].reject(Error('first failed'));
  assert.equal(await first,true);
  await tick();assert.equal(h.waits.length,2);
  h.waits[1].resolve(h.result());
  assert.equal(await second,true);
});

test('strict cleanup requires IndexedDB durability rather than local-only fallback',async()=>{
  const offline=harness({noDb:true});
  assert.equal(await offline.coordinator.persist({requireDurable:true}),false);
  const failure=harness(),pending=failure.coordinator.persist({requireDurable:true});
  await tick();failure.waits[0].reject(Error('quota'));
  assert.equal(await pending,false);
  assert.equal(failure.get().localSaved,true);
});
test('strict cleanup rejects protected concurrent deletion',async()=>{
  const h=harness(),pending=h.coordinator.persist({requireDurable:true});
  await tick();h.waits[0].resolve(h.result({protectedDeletes:['draft_changed']}));
  assert.equal(await pending,false);
});


test('strict keyframe guard blocks remote drift without adopting a competing baseline',async()=>{
  const h=harness();
  const expected={id:'project_alpha',serializedDraft:'{"name":"original"}'};
  const job=h.coordinator.persist({requireDurable:true,unchangedDraft:expected});
  await tick();
  assert.equal(h.actions.find(x=>x[0]==='merge').length,3);
  h.waits[0].resolve(h.result({staleWorkspace:true}));
  assert.equal(await job,false);
  assert.equal(h.get().baseline.label,'baseline',
    'blocked Apply does not acknowledge another tab as the current baseline');
  assert.equal(h.get().collection.label,'local');
  assert.equal(h.get().workspaceId,'project_alpha');
  assert.equal(h.actions.some(x=>x[0]==='local backup'),false);
});


function sharedKeyframeHarness(){
  const clone=v=>JSON.parse(JSON.stringify(v)),ref={id:'draft_keyframe',revision:'rev:1',recovery:null};
  const base={revision:7,digest:'sha256:'+'a'.repeat(64)};
  let active=true,liveBase=clone(base),writes=[],next=null;
  let row={revision:2,collection:{label:'unchanged'},revisions:[{id:ref.id,revision:1}],receipt:null,
    keyframeEdit:{version:1,reference:ref,base,returnView:'editor',compareSelected:'A',
      session:{projectId:ref.id,frameKey:'frame',candidate:10,past:[],future:[]}}};
  const storage={read:async()=>clone(row),async updateKeyframeEdit(expected,intent,session,compareSelected){
    assert.deepEqual(expected,row);assert.deepEqual(intent,row.keyframeEdit);
    const job={...row,revision:row.revision+1,keyframeEdit:{...intent,session,compareSelected}};
    writes.push(clone(job));
    if(next){const hook=next;next=null;await hook(job);}
    row=clone(job);return clone(row);
  }};
  const selection={coordinate:action=>action(),captureBase:async()=>clone(liveBase),
    check:()=>{if(!active)throw Error('lifetime ended');}};
  const writer=persistence.createSharedKeyframe({storage,selection});
  writer.bind(row);
  return {writer,writes,get:()=>clone(row),mark:(candidate,side='A')=>
    writer.mark({...row.keyframeEdit.session,candidate},side),
    hook:fn=>{next=fn;},commit:job=>{row=clone(job);},
    changeBase:()=>{liveBase={...base,revision:base.revision+1};},end:()=>{active=false;}};
}
test('shared temporary keyframe pump ignores hydration and drains newer snapshots in order',async()=>{
  const h=sharedKeyframeHarness(),w=h.writer;
  h.mark(10);await w.save();assert.equal(h.writes.length,0);
  const hold=deferred();h.hook(()=>hold.promise);h.mark(20);
  const first=w.save();await tick();assert.equal(h.writes.length,1);
  h.mark(30,'B');const joined=w.save();
  hold.resolve();await first;await joined;
  assert.equal(h.writes.length,2);assert.equal(h.writes[0].keyframeEdit.session.candidate,20);
  assert.equal(h.get().keyframeEdit.session.candidate,30);
  assert.equal(h.get().keyframeEdit.compareSelected,'B');
  assert.deepEqual(w.acknowledgedRow(),h.get());assert.equal(w.state().unsaved,false);
});
test('shared temporary keyframe retry accepts exact lost acknowledgement without rewriting',async()=>{
  const h=sharedKeyframeHarness(),w=h.writer;
  h.hook(job=>{h.commit(job);throw Error('lost acknowledgement');});
  h.mark(20);await assert.rejects(w.save(),/lost acknowledgement/);
  assert.equal(w.state().unsaved,true);assert.equal(w.recovery().attempt.session.candidate,20);
  h.mark(30);
  await assert.rejects(w.save(),/Explicit temporary keyframe retry/);
  await w.retry();
  assert.equal(h.writes.length,2);
  assert.equal(h.writes[1].keyframeEdit.session.candidate,30);
  assert.equal(h.get().revision,4);assert.equal(w.state().unsaved,false);
});
test('shared temporary keyframe retry refuses a foreign journal and preserves latest evidence',async()=>{
  const h=sharedKeyframeHarness(),w=h.writer;
  h.hook(job=>{h.commit({...job,keyframeEdit:{...job.keyframeEdit,
    session:{...job.keyframeEdit.session,candidate:99}}});throw Error('unknown outcome');});
  h.mark(20);await assert.rejects(w.save(),/unknown outcome/);
  h.mark(30);
  await assert.rejects(w.retry(),/journal changed/);
  assert.equal(h.writes.length,1);
  assert.equal(h.get().keyframeEdit.session.candidate,99);
  assert.equal(w.recovery().latest.session.candidate,30);
});
test('shared temporary keyframe pump blocks changed session base and ended lifetime',async()=>{
  const h=sharedKeyframeHarness(),w=h.writer;
  h.mark(20);h.changeBase();
  await assert.rejects(w.save(),/Shared session changed/);
  assert.equal(h.writes.length,0);assert.equal(w.recovery().latest.session.candidate,20);
  h.end();await assert.rejects(w.retry(),/lifetime ended/);
  assert.equal(h.writes.length,0);
});
