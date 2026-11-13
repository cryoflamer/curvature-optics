'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');
const studio=require('../src/animation/ModernAnimationStudio');
const projects=require('../src/animation/ModernAnimationProject');
const playback=require('../src/animation/ModernAnimationPlayback');
const experiments=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');

function scene(){
  const model={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:1,DemoText:'Saved studio',Description:'',
    ObjType:[3,3],NObjects:[2,0],ObjDist:[50,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[10,10],ObjSizeVar:[0,0]};
  return experiments.capture(model,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'custom',resetPreset:'single'},compare.preset('globe-flat-vacuum'),
  {mode:'scene',eyeLevel:true,horizon:true,selected:'A'});
}
function storage(){
  const data=new Map();
  return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v),
    removeItem:k=>data.delete(k)};
}
function memoryIndexedDB(){
  const records=new Map();
  return {open(name,version){
    assert.equal(name,autosave.DATABASE);assert.equal(version,1);
    const request={result:null,error:null};
    queueMicrotask(()=>{
      const upgrade=!records.has('created');
      const db={objectStoreNames:{contains:k=>k===autosave.STORE&&records.has('created')},
        createObjectStore:k=>{assert.equal(k,autosave.STORE);records.set('created',true);},
        close(){},transaction(k,mode){
          assert.equal(k,autosave.STORE);
          const tx={oncomplete:null,onerror:null,onabort:null,error:null};
          const done=()=>queueMicrotask(()=>tx.oncomplete&&tx.oncomplete());
          tx.objectStore=()=>({
            get(key){const op={result:undefined};queueMicrotask(()=>{
              op.result=records.get(key);done();});return op;},
            put(value,key){assert.equal(mode,'readwrite');records.set(key,structuredClone(value));done();},
          });return tx;
        }};
      request.result=db;
      if(upgrade)request.onupgradeneeded();
      request.onsuccess();
    });
    return request;
  }};
}
function physicalDraft(){
  const a=scene(),b=structuredClone(a);b.scene.surface.showModel=2;
  const draft=studio.history([41,42],[{id:41,name:'Globe',experiment:a},
    {id:42,name:'Flat',experiment:b}]);
  return studio.editFrame(studio.edit(draft,'name','Globe → Flat'),'history-42','travelMs','7.5');
}

test('versioned checkpoint restores independent Globe → Flat draft, prepared project and paused seek',()=>{
  const draft=physicalDraft(),project=studio.build(draft,'studio_draft');
  assert.equal(project.mode,'physical');
  const before=structuredClone(draft),local=storage();
  const checkpoint=autosave.checkpoint({draft,selectedKey:'history-42',quality:'accurate',
    prepared:true,positionMs:3750},1000);
  assert.equal(autosave.writeLocal(local,checkpoint),true);
  const restored=autosave.readLocal(local);
  assert.deepEqual(restored,checkpoint);
  const rebuilt=studio.build(restored.draft,'studio_draft');
  const player=playback.create(rebuilt);
  player.seek(restored.positionMs,10000);
  assert.equal(player.status().playing,false);
  assert.equal(player.status().positionMs,3750);
  assert.equal(player.sample().scene.surface.showModel,1);
  assert.ok(player.sample().scene.surface.rEarth>6371000);
  player.seek(7500,10000);
  assert.equal(player.sample().scene.surface.showModel,2);
  assert.equal(restored.draft.frames[1].name,'Flat');
  assert.deepEqual(draft,before,'autosave does not mutate source draft');
});

test('an incompatible or unfinished draft is still recovered without forced preparation',()=>{
  const draft=physicalDraft();
  draft.frames[1].experiment.scene.camera.Height=99;
  assert.equal(studio.inspect(draft).compatible,false);
  let checkpoint=autosave.checkpoint({draft,selectedKey:'history-41',quality:'fast',
    prepared:false,positionMs:0},2000);
  assert.equal(autosave.normalize(checkpoint).draft.frames.length,2);
  assert.throws(()=>studio.build(checkpoint.draft,'broken'),/incompatible/i);
  checkpoint=autosave.checkpoint({draft:studio.blank(),selectedKey:null,quality:'auto',
    prepared:false,positionMs:0},2001);
  assert.equal(checkpoint.draft.frames.length,0);
});

test('checkpoint validation rejects corrupt records and duplicate IDs without overwriting data',()=>{
  const checkpoint=autosave.checkpoint({draft:physicalDraft(),selectedKey:'missing',
    quality:'auto',prepared:false,positionMs:0},30);
  assert.equal(checkpoint.selectedKey,null,'missing selected key is cleared');
  assert.throws(()=>autosave.normalize({...checkpoint,version:2}),/checkpoint/);
  assert.throws(()=>autosave.normalize({...checkpoint,positionMs:Infinity}),/number/);
  assert.throws(()=>autosave.normalize({...checkpoint,quality:'unsupported'}),/quality/);
  const corrupted=structuredClone(checkpoint);
  corrupted.draft.frames[1].key=corrupted.draft.frames[0].key;
  assert.throws(()=>autosave.normalize(corrupted),/Duplicate/);
  const old=storage();old.setItem(autosave.STORAGE_KEY,'{"version":99}');
  assert.equal(autosave.readLocal(old),null);
  old.setItem(autosave.STORAGE_KEY,'{broken');
  assert.equal(autosave.readLocal(old),null);
  assert.equal(autosave.readLocal(null),null);
  assert.equal(autosave.writeLocal(null,checkpoint),false);
  const denied={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
  assert.equal(autosave.readLocal(denied),null);
  assert.throws(()=>autosave.writeLocal(denied,checkpoint),/quota/);
  assert.equal(autosave.newer({...checkpoint,savedAt:20},checkpoint).savedAt,30);
  assert.equal(autosave.newer(checkpoint,{...checkpoint,savedAt:20}).savedAt,30);
});

test('IndexedDB retains a single durable animation checkpoint independent of localStorage',async()=>{
  const db=memoryIndexedDB(),local=storage();
  assert.equal(await autosave.read(db),null);
  const first=autosave.checkpoint({draft:physicalDraft(),selectedKey:'history-41',
    quality:'accurate',prepared:true,positionMs:1000},100);
  await autosave.write(db,first);
  const newer=autosave.checkpoint({draft:physicalDraft(),selectedKey:'history-42',
    quality:'fast',prepared:true,positionMs:7400},200);
  await autosave.write(db,newer);
  assert.deepEqual(await autosave.read(db),newer);
  assert.equal(autosave.readLocal(local),null);
  assert.deepEqual(autosave.newer(first,await autosave.read(db)),newer);
  assert.deepEqual(autosave.newer(null,newer),newer);
  assert.deepEqual(autosave.newer(first,null),first);
  assert.equal(await autosave.read(null),null);
  assert.equal(await autosave.write(null,newer),null);
  await assert.rejects(autosave.read({open(){throw Error('blocked');}}),/blocked/);
});

test('Modern entrypoint wires draft recovery separately from physical session and History',()=>{
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.indexOf('ModernAnimationStudio.js')<html.indexOf('ModernAnimationDraftAutosave.js'));
  assert.ok(html.indexOf('ModernAnimationDraftAutosave.js')<html.indexOf('ModernApp.js'));
  assert.match(html,/id="ModernAnimationDraftStatus"/);
  assert.match(app,/bindStudioDraftPersistence\(\)/);
  assert.match(app,/studioDraftGeneration!==generation/);
  assert.match(app,/studioPlayback\.seek\(saved\.positionMs,profileNow\(\)\)/);
  assert.match(app,/saveStudioDraft\(!!next\.playing\)/);
  assert.match(app,/root\.addEventListener\('pagehide'/);
});

test('V2 working collection preserves multiple independent edited projects across reload',async()=>{
  const db=memoryIndexedDB(),local=storage();
  const first=autosave.checkpoint({draft:physicalDraft(),selectedKey:'history-41',
    quality:'accurate',prepared:true,positionMs:1200,
    libraryId:'project_a',libraryRevision:17},100);
  const secondDraft=studio.edit(physicalDraft(),'name','Alternate edits');
  const second=autosave.checkpoint({draft:secondDraft,selectedKey:'history-42',
    quality:'fast',prepared:true,positionMs:4300,
    libraryId:'project_b',libraryRevision:29},200);
  const third=autosave.checkpoint({draft:studio.edit(physicalDraft(),'name','Unnamed draft'),
    selectedKey:'history-41',quality:'auto',prepared:false,positionMs:0},300);
  const a=autosave.projectWorkspaceId('project_a');
  const b=autosave.projectWorkspaceId('project_b');
  const draft='draft_temp';
  let collection=autosave.collection(a,first,101);
  collection=autosave.withWorkspace(collection,b,second,201);
  collection=autosave.withWorkspace(collection,draft,third,301);
  assert.equal(collection.activeId,draft);
  assert.equal(collection.workspaces.length,3);
  assert.deepEqual(autosave.getWorkspace(collection,a),first);
  assert.deepEqual(autosave.getWorkspace(collection,b),second);
  assert.deepEqual(autosave.getWorkspace(collection,draft),third);
  autosave.writeCollectionLocal(local,collection);
  await autosave.writeCollection(db,collection);
  assert.deepEqual(autosave.readCollectionLocal(local),collection);
  assert.deepEqual(await autosave.readCollection(db),collection);
  let without=autosave.withoutWorkspace(collection,draft,b,450);
  assert.equal(without.activeId,b);
  assert.equal(autosave.getWorkspace(without,draft),null);
  assert.deepEqual(autosave.getWorkspace(without,a),first);
  assert.deepEqual(autosave.getWorkspace(without,b),second);
  assert.equal(autosave.newerCollection(collection,without).activeId,b);
  assert.equal(autosave.newerCollection(without,collection).activeId,b);
});

test('V1 single draft migrates without deleting saved content or changing library association',()=>{
  const original=autosave.checkpoint({draft:physicalDraft(),selectedKey:'history-42',
    quality:'fast',prepared:true,positionMs:4500,
    libraryId:'saved_one',libraryRevision:27},900);
  const moved=autosave.migrate(original);
  assert.equal(moved.version,2);
  assert.equal(moved.activeId,'project_saved_one');
  assert.deepEqual(autosave.getWorkspace(moved,'project_saved_one'),original);
  const untitled=autosave.checkpoint({draft:physicalDraft(),selectedKey:null,
    quality:'auto',prepared:false,positionMs:0},901);
  const migrated=autosave.migrate(untitled);
  assert.match(migrated.activeId,/^draft_/);
  assert.deepEqual(autosave.getWorkspace(migrated,migrated.activeId),untitled);
});

test('corrupted workspace collections are rejected and never erase valid backups',async()=>{
  const db=memoryIndexedDB(),local=storage();
  const record=autosave.checkpoint({draft:physicalDraft(),selectedKey:null,
    quality:'auto',prepared:false,positionMs:0},500);
  const correct=autosave.collection('draft_one',record,501);
  await autosave.writeCollection(db,correct);
  assert.throws(()=>autosave.withWorkspace(correct,'draft_one',{...record,version:3}),/checkpoint/);
  assert.throws(()=>autosave.normalizeCollection({...correct,activeId:'draft_missing'}),/missing/);
  assert.throws(()=>autosave.normalizeCollection({...correct,workspaces:[
    ...correct.workspaces,...correct.workspaces]}),/Duplicate/);
  assert.throws(()=>autosave.normalizeCollection({...correct,workspaces:[{
    id:'project_wrong',checkpoint:record}]}),/disagree/);
  local.setItem(autosave.COLLECTION_KEY,'{broken');
  assert.equal(autosave.readCollectionLocal(local),null);
  assert.deepEqual(await autosave.readCollection(db),correct);
  assert.throws(()=>autosave.writeCollectionLocal({setItem(){throw Error('quota');}},correct),/quota/);
});

test('Spline workspace restores mode, keyframe timings, playhead and named-project association',async()=>{
  const sample=physicalDraft();
  // Camera-only edits preserve the existing frame and source object geometry.
  const a=structuredClone(sample.frames[0].experiment);
  const b=structuredClone(a),c=structuredClone(a);
  b.scene.camera.Height=40;c.scene.camera.Height=20;
  let draft=studio.history([301,302,303],[a,b,c].map((experiment,i)=>({
    id:301+i,name:'Camera '+i,experiment
  })));
  draft=studio.edit(draft,'name','Recovered spline');
  draft=studio.edit(draft,'interpolation','spline');
  draft=studio.editFrame(draft,'history-302','travelMs','2.5');
  draft=studio.editFrame(draft,'history-303','holdMs','1.75');
  const initial=studio.build(draft,'saved_flight');
  const checkpoint=autosave.checkpoint({draft,selectedKey:'history-302',
    quality:'accurate',prepared:true,positionMs:1320,
    libraryId:'saved_flight',libraryRevision:300},1000);
  const local=storage(),db=memoryIndexedDB();
  const projectId=autosave.projectWorkspaceId('saved_flight');
  let workspaces=autosave.collection(projectId,checkpoint,1001);
  const oldDraft={...draft,interpolation:'linear'};
  const other=autosave.checkpoint({draft:oldDraft,selectedKey:'history-303',
    quality:'fast',prepared:false,positionMs:0},1002);
  workspaces=autosave.withWorkspace(workspaces,'draft_linear',other,1003);
  autosave.writeCollectionLocal(local,workspaces);
  await autosave.writeCollection(db,workspaces);
  for(const restored of [autosave.readCollectionLocal(local),await autosave.readCollection(db)]){
    assert.equal(restored.activeId,'draft_linear');
    const saved=autosave.getWorkspace(restored,projectId);
    assert.equal(saved.draft.interpolation,'spline');
    assert.equal(saved.selectedKey,'history-302');
    assert.equal(saved.libraryId,'saved_flight');
    assert.equal(saved.libraryRevision,300);
    assert.equal(saved.positionMs,1320);
    assert.deepEqual(studio.build(saved.draft,'saved_flight'),initial);
    assert.equal(autosave.getWorkspace(restored,'draft_linear').draft.interpolation,'linear');
  }
  // Checkpoints made by releases before the interpolation field remain Linear.
  const preSpline=structuredClone(checkpoint);delete preSpline.draft.interpolation;
  assert.equal(autosave.normalize(preSpline).draft.interpolation,'linear');
  const broken=structuredClone(checkpoint);broken.draft.interpolation='unknown';
  assert.throws(()=>autosave.normalize(broken),/interpolation/);
});


test('Stash restores a saved project while preserving an independent editable draft across autosaves',async()=>{
  const original=physicalDraft();
  const edited=studio.edit(original,'name','Unsaved spline changes');
  const current=autosave.checkpoint({draft:edited,selectedKey:'history-42',
    quality:'accurate',prepared:true,positionMs:3400,
    libraryId:'saved_flight',libraryRevision:31},1000);
  const pristine=autosave.checkpoint({draft:original,selectedKey:'history-41',
    quality:'auto',prepared:true,positionMs:0,
    libraryId:'saved_flight',libraryRevision:31},1010);
  const other=autosave.checkpoint({draft:studio.edit(original,'name','Another draft'),
    selectedKey:'history-41',quality:'auto',prepared:false,positionMs:100},1002);
  let workspaces=autosave.collection('project_saved_flight',current,1001);
  workspaces=autosave.withWorkspace(workspaces,'draft_other',other,1003);
  workspaces=autosave.withWorkspace(workspaces,'project_saved_flight',current,1004);
  const before=structuredClone(workspaces),local=storage(),db=memoryIndexedDB();
  const staged=autosave.restoreSavedProject(workspaces,'project_saved_flight',pristine,
    'draft_stash_1',1011);
  assert.deepEqual(workspaces,before,'staging never mutates original workspaces');
  assert.equal(staged.activeId,'project_saved_flight');
  assert.deepEqual(autosave.getWorkspace(staged,'project_saved_flight'),pristine);
  const stash=autosave.getWorkspace(staged,'draft_stash_1');
  assert.equal(stash.libraryId,null);
  assert.equal(stash.libraryRevision,null);
  assert.equal(stash.draft.name,'Unsaved spline changes');
  assert.equal(stash.quality,'accurate');
  assert.equal(stash.positionMs,3400);
  assert.deepEqual(autosave.getWorkspace(staged,'draft_other'),other);
  await autosave.writeCollection(db,staged);
  autosave.writeCollectionLocal(local,staged);
  const recovered=autosave.newerCollection(autosave.readCollectionLocal(local),
    await autosave.readCollection(db));
  assert.equal(autosave.getWorkspace(recovered,'draft_stash_1').draft.name,'Unsaved spline changes');
  const nextAutosave=autosave.checkpoint({...pristine,positionMs:2100},1100);
  const newer=autosave.withWorkspace(recovered,'project_saved_flight',nextAutosave,1101);
  assert.deepEqual(autosave.getWorkspace(newer,'draft_stash_1'),stash,
    'autosave of restored project does not overwrite stash');
  assert.equal(autosave.getWorkspace(newer,'draft_other').draft.name,'Another draft');
  // Opening the stash does not pop it or modify the saved Library version.
  assert.equal(autosave.getWorkspace(newer,'draft_stash_1').draft.name,'Unsaved spline changes');
  assert.deepEqual(autosave.getWorkspace(newer,'project_saved_flight'),nextAutosave);
});

test('Discard restores saved project without deleting unrelated drafts or creating stash',()=>{
  const draft=physicalDraft();
  const dirty=autosave.checkpoint({draft:studio.edit(draft,'name','Uncommitted'),
    selectedKey:'history-41',quality:'fast',prepared:true,positionMs:3500,
    libraryId:'existing',libraryRevision:12},1000);
  const clean=autosave.checkpoint({draft,selectedKey:'history-41',quality:'auto',
    prepared:true,positionMs:0,libraryId:'existing',libraryRevision:12},1001);
  const independent=autosave.checkpoint({draft:studio.edit(draft,'name','Keep me'),
    selectedKey:null,quality:'auto',prepared:false,positionMs:0},1003);
  let state=autosave.collection('project_existing',dirty,1001);
  state=autosave.withWorkspace(state,'draft_independent',independent,1004);
  state=autosave.withWorkspace(state,'project_existing',dirty,1005);
  const restored=autosave.restoreSavedProject(state,'project_existing',clean,null,1010);
  assert.equal(restored.workspaces.length,2);
  assert.deepEqual(autosave.getWorkspace(restored,'draft_independent'),independent);
  assert.deepEqual(autosave.getWorkspace(restored,'project_existing'),clean);
  assert.throws(()=>autosave.restoreSavedProject(state,'draft_independent',clean,null,1010),/active saved project/);
  assert.throws(()=>autosave.restoreSavedProject(state,'project_existing',clean,'draft_independent',1010),/fresh independent/);
  assert.throws(()=>autosave.restoreSavedProject(state,'project_existing',
    {...clean,libraryId:'wrong'},null,1010),/match the active/);
});


test('Stash/Discard app flow commits backups before switching, rejects failed writes and stale revisions',async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  const start=source.indexOf('  function restoreSavedAnimation(stash){');
  const end=source.indexOf('  // Switching workspaces',start);
  assert.ok(start>=0&&end>start);
  const code=source.slice(start,end);
  const initial=physicalDraft();
  const saved=studio.build(initial,'saved_project');
  function setup(){
    const dirty=studio.edit(initial,'name','Unsaved camera project');
    const original=autosave.checkpoint({draft:dirty,selectedKey:dirty.frames[1].key,
      quality:'fast',prepared:true,positionMs:1750,
      libraryId:'saved_project',libraryRevision:51},1000);
    const record={id:'saved_project',updatedAt:51,project:saved,quality:'auto'};
    const workspaces=autosave.collection('project_saved_project',original,1001);
    const local=storage(),events=[];
    let persistCount=0,failSecond=false,stale=false,permission=true,modifyLate=false;
    const ctx={Promise,Date,Error,Math,Object,studioDraftAutosave:autosave,
      studioLibraryActive:record,studioLibraryBusy:false,studioWorkspaceReady:true,
      studioWorkspaceId:'project_saved_project',studioWorkspaces:workspaces,
      studioWorkspaceLocalSaved:true,studioDraftSavedAt:1001,
      studioDraftGeneration:0,studioDraft:dirty,studioPlaybackApi:{},
      studioApi:studio,studioLibraryMessage:'',studioLibraryError:false,
      root:{indexedDB:{},crypto:{randomUUID:()=> '11112222333344445555666677778888'},
        confirm(){events.push('confirm');return permission;}},
      preferencesStorage:()=>local,renderStudioLibrary(){events.push('render');},
      studioLibraryDirty:()=>true,
      saveStudioDraft(){ctx.studioDraftGeneration++;
        const checkpoint=autosave.checkpoint({draft:ctx.studioDraft,
          selectedKey:ctx.studioDraft.frames[0].key,quality:'fast',prepared:true,
          positionMs:1750,libraryId:'saved_project',libraryRevision:51},
          1100+ctx.studioDraftGeneration);
        ctx.studioWorkspaces=autosave.withWorkspace(ctx.studioWorkspaces,
          'project_saved_project',checkpoint,1100+ctx.studioDraftGeneration);
        return true;},
      persistStudioWorkspace(){persistCount++;events.push('persist '+persistCount);
        if(persistCount===2&&modifyLate){
          ctx.studioDraft=studio.edit(ctx.studioDraft,'name','Very late changes');
          ctx.studioDraftGeneration++;
        }
        return Promise.resolve(!(persistCount===2&&failSecond));},
      studioLibrary:{get(){events.push('get');return Promise.resolve(stale?{...record,updatedAt:52}:record);}},
      performStudioSwitch(kind,updated){events.push('switch '+kind);
        assert.equal(kind,'restore');assert.equal(updated.updatedAt,51);
        ctx.studioDraft=autosave.getWorkspace(ctx.studioWorkspaces,'project_saved_project').draft;
      }};
    vm.runInNewContext(code,ctx);
    return {ctx,events,record,configure(o){
      failSecond=!!o.failSecond;stale=!!o.stale;
      permission=o.permission!==false;modifyLate=!!o.modifyLate;
    }};
  }
  const kept=setup();
  assert.equal(await kept.ctx.restoreSavedAnimation(true),true);
  assert.ok(kept.events.indexOf('persist 2')<kept.events.indexOf('switch restore'));
  assert.equal(kept.ctx.studioDraft.name,initial.name);
  assert.equal(kept.ctx.studioWorkspaces.activeId,'project_saved_project');
  assert.equal(kept.ctx.studioWorkspaces.workspaces.length,2);
  const stashId=kept.ctx.studioWorkspaces.workspaces.find(entry=>entry.id.startsWith('draft_')).id;
  assert.equal(autosave.getWorkspace(kept.ctx.studioWorkspaces,stashId).draft.name,
    'Unsaved camera project');
  const rejected=setup();rejected.configure({failSecond:true});
  assert.equal(await rejected.ctx.restoreSavedAnimation(true),false);
  assert.equal(rejected.ctx.studioDraft.name,'Unsaved camera project');
  assert.equal(rejected.ctx.studioWorkspaces.workspaces.length,1);
  assert.ok(!rejected.events.includes('switch restore'));
  const obsolete=setup();obsolete.configure({stale:true});
  assert.equal(await obsolete.ctx.restoreSavedAnimation(true),false);
  assert.equal(obsolete.ctx.studioDraft.name,'Unsaved camera project');
  const ignored=setup();ignored.configure({permission:false});
  assert.equal(await ignored.ctx.restoreSavedAnimation(false),false);
  assert.deepEqual(ignored.events,['confirm']);
  const discarded=setup();
  assert.equal(await discarded.ctx.restoreSavedAnimation(false),true);
  assert.equal(discarded.ctx.studioWorkspaces.workspaces.length,1);
  assert.ok(discarded.events.includes('confirm'));
  const racing=setup();racing.configure({modifyLate:true});
  assert.equal(await racing.ctx.restoreSavedAnimation(true),false);
  assert.equal(racing.ctx.studioDraft.name,'Very late changes');
  assert.ok(!racing.events.includes('switch restore'));
  assert.equal(autosave.getWorkspace(racing.ctx.studioWorkspaces,
    'project_saved_project').draft.name,'Very late changes');
});
