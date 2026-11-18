'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const workspaceSwitch=require('../src/animation/ModernAnimationWorkspaceSwitch');

function deferred(){
  let resolve,reject;
  const promise=new Promise((a,b)=>{resolve=a;reject=b;});
  return {promise,resolve,reject};
}
function harness(settings={}){
  const events=[],state={busy:!!settings.busy,ready:settings.ready!==false,
    hasStudio:settings.hasStudio!==false,id:settings.id||'draft_current',
    generation:0,unsaved:settings.unsaved!==false};
  const records=new Map([['stored',{id:'stored',project:{name:'Saved'}}]]);
  const drafts=new Set(['draft_other']);
  const options={
    busy:()=>state.busy,ready:()=>state.ready,hasStudio:()=>state.hasStudio,
    hasProject:id=>records.has(id),hasDraft:id=>drafts.has(id),
    workspaceId:()=>state.id,projectWorkspaceId:id=>'project_'+id,
    generation:()=>state.generation,hasUnsavedWork:()=>state.unsaved,
    setBusy:v=>{state.busy=v;events.push('busy '+v);},
    renderLibrary:()=>events.push('render library'),
    renderWizard:()=>events.push('render wizard'),
    saveDraft:()=>{events.push('checkpoint');if(settings.saveFails)return false;
      state.generation++;return true;},
    persist:()=>{events.push('persist');return settings.persist||Promise.resolve(settings.persistOK!==false);},
    fetchProject:id=>{events.push('fetch '+id);return settings.fetch||Promise.resolve(records.get(id));},
    activate:(kind,value)=>{events.push('activate '+kind);state.id=kind==='open'?
      'project_'+value.id:kind==='draft'?value:'draft_created';},
    dropWorkspace:id=>events.push('drop '+id),
    notice:(msg,error)=>events.push('notice '+error+' '+msg),
    fail:msg=>events.push('fail '+msg),
    resetWizard:()=>events.push('reset wizard'),
    saveNamed:()=>{events.push('save named');return Promise.resolve(settings.namedSaved!==false);}
  };
  return {events,state,records,drafts,options,request:workspaceSwitch.create(options).request};
}

test('module loads as classic browser script before ModernApp without CommonJS',()=>{
  const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const file='src/animation/ModernAnimationWorkspaceSwitch.js';
  assert.ok(html.indexOf(file)>=0&&html.indexOf(file)<html.indexOf('ModernApp.js'));
  const browser=vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),browser);
  assert.equal(typeof browser.CurvatureModernAnimationWorkspaceSwitch.create,'function');
  assert.equal(vm.runInContext('typeof require',browser),'undefined');
});

test('invalid or already active target never checkpoints or toggles busy',()=>{
  const h=harness();
  assert.equal(h.request('open','missing'),undefined);
  assert.equal(h.request('draft','missing'),undefined);
  assert.equal(h.request('draft','draft_current'),undefined);
  h.state.id='project_stored';
  assert.equal(h.request('open','stored'),undefined);
  h.state.busy=true;
  assert.equal(h.request('draft','draft_other'),undefined);
  h.state.busy=false;h.state.ready=false;
  assert.equal(h.request('draft','draft_other'),undefined);
  h.state.ready=true;h.state.hasStudio=false;
  assert.equal(h.request('draft','draft_other'),undefined);
  assert.deepEqual(h.events,[]);
});

test('new draft activates only after a durable outgoing checkpoint',async()=>{
  const write=deferred(),h=harness({persist:write.promise,unsaved:false});
  const pending=h.request('new');
  assert.equal(h.state.id,'draft_current');
  assert.deepEqual(h.events.slice(0,4),['busy true','render library','checkpoint','persist']);
  write.resolve(true);await pending;
  assert.equal(h.state.id,'draft_created');
  assert.ok(h.events.indexOf('persist')<h.events.indexOf('activate new'));
  assert.ok(h.events.indexOf('activate new')<h.events.indexOf('drop draft_current'));
  assert.equal(h.state.busy,false);
});

test('switching to a saved project waits for lookup and retains unrelated drafts',async()=>{
  const fetched=deferred(),h=harness({fetch:fetched.promise});
  const pending=h.request('open','stored');
  await Promise.resolve();
  assert.equal(h.state.id,'draft_current');
  assert.ok(h.events.includes('fetch stored'));
  fetched.resolve({id:'stored',project:{name:'Latest'}});await pending;
  assert.equal(h.state.id,'project_stored');
  assert.equal(h.events.includes('drop draft_current'),false);
  assert.equal(h.state.busy,false);
});

test('checkpoint failure never starts IndexedDB write or replaces editor',()=>{
  const h=harness({saveFails:true});
  h.request('new');
  assert.equal(h.state.id,'draft_current');
  assert.equal(h.events.includes('persist'),false);
  assert.match(h.events.join('\n'),/failed validation or storage/);
  assert.equal(h.state.busy,false);
});

test('failed durable write cannot replace current project',async()=>{
  const h=harness({persistOK:false});
  await h.request('draft','draft_other');
  assert.equal(h.state.id,'draft_current');
  assert.equal(h.events.includes('activate draft'),false);
  assert.match(h.events.join('\n'),/protect your work/);
  assert.equal(h.state.busy,false);
});

test('a user edit during persistence cancels the switch',async()=>{
  const write=deferred(),h=harness({persist:write.promise});
  const pending=h.request('new');
  h.state.generation++;
  write.resolve(true);await pending;
  assert.equal(h.state.id,'draft_current');
  assert.match(h.events.join('\n'),/draft changed while switching/);
});

test('a user edit while Library lookup is pending cancels opening',async()=>{
  const fetched=deferred(),h=harness({fetch:fetched.promise});
  const pending=h.request('open','stored');
  await Promise.resolve();
  h.state.generation++;
  fetched.resolve({id:'stored'});await pending;
  assert.equal(h.state.id,'draft_current');
  assert.match(h.events.join('\n'),/draft changed while opening/);
});

test('removed Library project never replaces the active editor',async()=>{
  const h=harness({fetch:Promise.resolve(null)});
  await h.request('open','stored');
  assert.equal(h.state.id,'draft_current');
  assert.match(h.events.join('\n'),/no longer exists/);
});

test('a Wizard project is saved only after switching, with retry notice on failure',async()=>{
  const h=harness({namedSaved:false});
  await h.request('wizard',{name:'New animated model'});
  assert.equal(h.state.id,'draft_created');
  assert.ok(h.events.indexOf('activate wizard')<h.events.indexOf('save named'));
  assert.ok(h.events.indexOf('reset wizard')<h.events.indexOf('save named'));
  assert.match(h.events.join('\n'),/use Save project to retry/);
  assert.equal(h.state.busy,false);
});


test('a detached viewer can leave without ever checkpointing its content',async()=>{
  const h=harness();h.options.detached=()=>true;
  h.drafts.add('draft_current');
  await h.request('draft','draft_current');
  assert.ok(h.events.includes('activate draft'));
  assert.ok(!h.events.includes('checkpoint'));assert.ok(!h.events.includes('persist'));
});

test('pristine workspace permits a built-in view without writable storage',async()=>{
  const h=harness({saveFails:true,persistOK:false});
  h.options.hasDemo=id=>id==='soundly';h.options.fetchDemo=id=>({id});
  h.options.canSkipDemoCheckpoint=()=>true;
  await h.request('demo','soundly');
  assert.ok(h.events.includes('activate demo'));
  assert.ok(!h.events.includes('checkpoint'));assert.ok(!h.events.includes('persist'));
});
