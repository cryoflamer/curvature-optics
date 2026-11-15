'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const pickerUI=require('../src/ui/modern/ModernAnimationStudioUI');
const read=file=>fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');

function mockDom(){
  const doc={createElement(tag){return {
    tagName:tag,children:[],listeners:{},textContent:'',className:'',hidden:false,
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);},
    appendChild(child){this.children.push(child);return child;},
    setAttribute(key,value){this[key]=value;},
    getAttribute(key){return this[key]??null;},
    dispatch(type){const event={stopped:false,prevented:false,
      stopPropagation(){this.stopped=true;},preventDefault(){this.prevented=true;}};
      for(const listener of this.listeners[type]||[])listener(event);
      return event;}
  };}};
  return {doc,host:doc.createElement('aside')};
}
function collect(node,predicate){
  return [node,...node.children.flatMap(child=>collect(child,predicate))].filter(predicate);
}

test('Picker card navigates to its exact History ID without checking or dragging the card',()=>{
  const {doc,host}=mockDom();
  const events=[];
  const entry={id:42,name:'Source snapshot',experiment:{display:{mode:'scene'},
    scene:{surface:{showModel:1,rEarth:6371000},atmosphere:'standard',camera:{Height:15}}}};
  pickerUI.renderPicker(doc,host,[entry],{
    pickerClose(){},pickerFilter(){},pickerFiltersClear(){},pickerAdvancedToggle(){},
    insertChecked(){},pickerToggle(){events.push('checked');},
    dragStart(){events.push('drag');},dragEnd(){},
    pickerOpenHistory(id){events.push(['open',id]);}
  },{open:true,checked:{},selectedCount:0,totalEntries:1});
  const nav=collect(host,n=>n.className==='modern-studio-picker-open-history');
  assert.equal(nav.length,1);
  assert.equal(nav[0].textContent,'Open in History');
  assert.match(nav[0]['aria-label'],/without restoring/);
  assert.equal(nav[0].draggable,false);
  assert.equal(nav[0].dispatch('pointerdown').stopped,true);
  const drag=nav[0].dispatch('dragstart');
  assert.equal(drag.stopped,true);assert.equal(drag.prevented,true);
  assert.equal(nav[0].dispatch('click').stopped,true);
  assert.deepEqual(events,[['open',42]]);
  const checks=collect(host,n=>n.className==='modern-studio-picker-checkbox');
  assert.equal(checks.length,1);assert.equal(checks[0].checked,false);
  assert.equal(collect(host,n=>n.textContent==='Full History').length,0);
});

function createHistoryNavigationHarness(){
  const source=read('src/ui/modern/ModernApp.js');
  function region(start,end){
    const a=source.indexOf(start),b=source.indexOf(end,a);
    assert.ok(a>=0&&b>a,'Function boundaries must remain available for navigation tests');
    return source.slice(a,b);
  }
  const code=[
    region('  function syncHistoryNavigation(){','  function syncWorkspaceVisibility(){'),
    region('  function openHistoryFromPicker(id){','  function updateHistorySelection(entry){'),
    region('  function refreshHistoryList(selectedId){','  var historyRestoreBusy=false;'),
    region('  function setHistoryOpen(open){','  function bindHistory(){')
  ].join('\n');
  const records=[
    {id:1,name:'Compare match',pinned:false,signature:'a'},
    {id:2,name:'Pinned and filtered-out target',pinned:true,signature:'b'},
    {id:3,name:'Other scene',pinned:false,signature:'c'}
  ];
  const nodes=new Map();
  for(const id of ['ModernHistoryPanel','ModernHistoryToggle','ModernHistoryBackdrop',
    'ModernHistoryReturnToAnimation','ModernHistoryClose','ModernHistoryFocusNotice',
    'ModernReturnToAnimation','ModernHistoryFilterCount','ModernHistorySort',
    'ModernHistoryGallery'])nodes.set(id,{
      hidden:true,textContent:'',value:'newest',classList:{toggle(){}},
      setAttribute(){},focus(){this.focused=true;}
    });
  let render,renderCount=0,preferencesWrites=0,physicsRestores=0;
  const state={physics:{height:15},draft:{frames:['existing']}};
  const ctx={
    ...state,Promise,Map,Set,Object,String,Array,Number,RangeError,Error,
    historyFocusFromPickerId:'',historyOpenedFromPicker:false,
    historyWizardReferenceChoosing:false,
    animationReturnAfterRestore:false,animationWorkspaceOpen:true,
    historyPanelOpen:false,historyGallerySize:'medium',historyPinnedCollapsed:true,
    historyManageMode:false,historyMultiSelection:Object.create(null),
    historyShownIds:[],historySelectedId:'',savedHistorySignatures:new Map(),
    historyLoadError:null,snapshotSaveError:null,studioHistoryEntries:[],
    historyFilters:{query:'Only compare',mode:'compare'},
    historyFiltersApi:{filter(entries){return entries.filter(e=>e.id===1);},active(){return true;}},
    experimentHistory:{get:async id=>records.find(e=>e.id===id)||null,
      list:async()=>records},
    newUiEl:id=>nodes.get(id)||null,
    historyUI:{setSize(){},render(_doc,_gallery,items,selectedId,_actions,_multi,options){
      render={items,selectedId,options,actions:_actions};renderCount++;
    }},
    document:{},root:{},
    saveApplicationPreferences(){preferencesWrites++;},
    updateSnapshotSaveAction(){},renderAnimationStudio(){},
    historySelectedIds(){return [];},historyMultiCount(){},
    updateHistorySelection(entry){ctx.historySelectedId=entry?String(entry.id):'';},
    setHistoryManageMode(){},historyStatus(){},
    restoreHistorySnapshot(){physicsRestores++;},
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {ctx,nodes,records,get render(){return render;},get renderCount(){return renderCount;},
    get writes(){return preferencesWrites;},get restores(){return physicsRestores;}};
}

test('Open in History focuses filtered-out pinned snapshot without changing saved filters or Studio draft',async()=>{
  const h=createHistoryNavigationHarness(),{ctx,nodes}=h;
  ctx.historySelectedId='1'; // The previously inspected History card must not win over the Picker target.
  const oldFilters=JSON.stringify(ctx.historyFilters);
  const oldDraft=JSON.stringify(ctx.draft);
  const oldPhysics=JSON.stringify(ctx.physics);
  await ctx.openHistoryFromPicker(2);
  await new Promise(setImmediate);
  assert.equal(nodes.get('ModernHistoryPanel').hidden,false);
  assert.equal(nodes.get('ModernHistoryBackdrop').hidden,false);
  assert.equal(nodes.get('ModernHistoryReturnToAnimation').hidden,false);
  assert.equal(nodes.get('ModernHistoryClose').hidden,true);
  assert.equal(ctx.historySelectedId,'2');
  assert.equal(h.render.selectedId,2);
  assert.deepEqual(Array.from(h.render.items,e=>e.id),[2,1]);
  assert.equal(h.render.options.pinnedCollapsed,false,
    'the focused pinned snapshot is temporarily shown even with Pinned collapsed');
  assert.equal(ctx.historyPinnedCollapsed,true,
    'the user-preferred collapse setting is not persisted differently');
  assert.equal(nodes.get('ModernHistoryFocusNotice').hidden,false);
  assert.match(nodes.get('ModernHistoryFocusNotice').textContent,/filters have not changed/);
  assert.match(nodes.get('ModernHistoryFilterCount').textContent,/1 of 3 snapshots \+ selected/);
  assert.equal(JSON.stringify(ctx.historyFilters),oldFilters);
  assert.equal(JSON.stringify(ctx.draft),oldDraft);
  assert.equal(JSON.stringify(ctx.physics),oldPhysics);
  assert.equal(h.restores,0,'navigation must never restore an experiment');
  ctx.setHistoryOpen(false);
  assert.equal(nodes.get('ModernHistoryPanel').hidden,true);
  assert.equal(ctx.historyFocusFromPickerId,'');
  assert.equal(ctx.historyOpenedFromPicker,false);
  assert.equal(ctx.animationWorkspaceOpen,true);
  assert.equal(nodes.get('ModernHistoryReturnToAnimation').hidden,true);
  ctx.setHistoryOpen(true);
  await new Promise(setImmediate);
  assert.equal(nodes.get('ModernHistoryClose').hidden,false,
    'normal History navigation must not reuse stale Animation handoff context');
  assert.equal(ctx.historySelectedId,'1','normal History follows the saved filter again');
});

test('A new History selection or explicit Pinned collapse ends temporary focus, not the return route',async()=>{
  const h=createHistoryNavigationHarness(),{ctx,nodes}=h;
  await ctx.openHistoryFromPicker(2);await new Promise(setImmediate);
  h.render.actions.select(1);
  await new Promise(setImmediate);
  assert.equal(ctx.historyFocusFromPickerId,'');
  assert.equal(ctx.historySelectedId,'1');
  assert.deepEqual(Array.from(h.render.items,e=>e.id),[1]);
  assert.equal(ctx.historyOpenedFromPicker,true);
  assert.equal(nodes.get('ModernHistoryReturnToAnimation').hidden,false);

  await ctx.openHistoryFromPicker(2);await new Promise(setImmediate);
  assert.equal(h.render.options.pinnedCollapsed,false);
  h.render.actions.setPinnedCollapsed(true);
  await new Promise(setImmediate);
  assert.equal(ctx.historyFocusFromPickerId,'');
  assert.equal(ctx.historyPinnedCollapsed,true);
  assert.equal(h.render.options.pinnedCollapsed,true);
  assert.deepEqual(Array.from(h.render.items,e=>e.id),[1]);
  assert.equal(nodes.get('ModernHistoryReturnToAnimation').hidden,false);
});

test('Deleted Picker target is rejected rather than opening an unrelated History selection',async()=>{
  const h=createHistoryNavigationHarness();
  await assert.rejects(h.ctx.openHistoryFromPicker(999),/no longer in History/);
  assert.equal(h.nodes.get('ModernHistoryPanel').hidden,true);
  assert.equal(h.ctx.historyOpenedFromPicker,false);
  assert.equal(h.renderCount,0);
});

test('UI contract keeps Return to Animation near Save after an explicit Restore',()=>{
  const html=read('CurvatureModern.html');
  const app=read('src/ui/modern/ModernApp.js');
  const ui=read('src/ui/modern/ModernAnimationStudioUI.js');
  assert.doesNotMatch(html,/id="ModernAnimationChooseSnapshots"/);
  assert.match(html,/id="ModernHistoryReturnToAnimation"/);
  assert.match(html,/id="ModernReturnToAnimation"/);
  assert.ok(html.indexOf('id="ModernSnapshotSave"')<html.indexOf('id="ModernReturnToAnimation"'));
  assert.match(app,/if\(historyOpenedFromPicker\)animationReturnAfterRestore=true;/);
  assert.match(app,/if\(mode==='animation'\)animationReturnAfterRestore=false;/);
  assert.match(app,/returnToStudio\.addEventListener\('click',function\(\)\{/);
  assert.match(app,/setMode\('animation'\);[\s\S]*timeline\.scrollIntoView/);
  assert.match(ui,/pickerOpenHistory\)actions\.pickerOpenHistory\(entry\.id\)/);
});

test('Explicit Restore after Picker navigation switches to physical workspace and offers return without rewriting Studio draft',async()=>{
  const source=read('src/ui/modern/ModernApp.js');
  const a=source.indexOf('  var historyRestoreBusy=false;');
  const b=source.indexOf('  function handleHistoryRestore(id){',a);
  assert.ok(a>=0&&b>a);
  const draft={frames:[{key:'existing',sourceSnapshotId:5,travelMs:2000}]};
  const original=JSON.stringify(draft);
  let physics={marker:'current'},recoveries=0,changedModes=[];
  const target={marker:'restored-source'};
  const nodes=new Map([['ModernHistoryPanel',{hidden:false}],
    ['ModernHistoryReturnToAnimation',{hidden:false}],
    ['ModernHistoryClose',{hidden:true}],
    ['ModernReturnToAnimation',{hidden:true}]]);
  const ctx={
    Promise,JSON,Error,RangeError,historyRestoreBusy:false,
    historyOpenedFromPicker:true,historyFocusFromPickerId:'42',
    historyWizardReferenceChoosing:false,
    animationReturnAfterRestore:false,animationWorkspaceOpen:true,
    studioDraft:draft,historyStatus(){},
    historyFingerprint:{exactSignature:JSON.stringify},
    experiments:{validate:input=>input},
    experimentHistory:{get:async id=>id===42?{experiment:target}:null,
      record:async()=>{recoveries++;return {created:true};}},
    experimentSnapshot:()=>physics,historyThumbnail(){return null;},
    cancelEdits(){},stopCameraTransition(){},stopCameraKeyboard(){},
    abortCameraDrag(){},cancelPending(){},cancelHistoryAuto(){},
    persistence:{timer:null},clearTimeout(){},
    applyExperiment:next=>{physics=next;},syncNumericInputs(){},syncCompareEditor(){},
    state:{mode:'scene'},resetHistoryBaseline(){},
    newUiEl:id=>nodes.get(id)||null,
    setMode(mode){changedModes.push(mode);ctx.animationWorkspaceOpen=(mode==='animation');
      ctx.syncHistoryNavigation();},
    refreshHistoryList:async()=>[],
    setHistoryOpen(open){nodes.get('ModernHistoryPanel').hidden=!open;
      if(!open){ctx.historyOpenedFromPicker=false;ctx.historyFocusFromPickerId='';}
      ctx.syncHistoryNavigation();}
  };
  const syncStart=source.indexOf('  function syncHistoryNavigation(){');
  const syncEnd=source.indexOf('  function syncWorkspaceVisibility(){',syncStart);
  vm.createContext(ctx);
  vm.runInContext(source.slice(syncStart,syncEnd)+'\n'+source.slice(a,b),ctx);
  assert.equal(ctx.animationReturnAfterRestore,false,
    'merely navigating to History did not prepare a return-from-Restore action');
  await ctx.restoreHistorySnapshot(42);
  assert.equal(physics,target);
  assert.deepEqual(changedModes,['scene']);
  assert.equal(recoveries,1,'Restore keeps the existing recovery-copy contract');
  assert.equal(nodes.get('ModernHistoryPanel').hidden,true);
  assert.equal(nodes.get('ModernReturnToAnimation').hidden,false,
    'after a physical Restore, the user can continue editing and return to Studio');
  assert.equal(JSON.stringify(ctx.studioDraft),original,'the autosaved Animation timeline remains unchanged');
  ctx.setMode('animation');
  // Production setMode clears the temporary return state when Animation opens.
  assert.match(source,/if\(mode==='animation'\)animationReturnAfterRestore=false;/);
});
