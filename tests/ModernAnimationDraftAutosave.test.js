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
  return {databases:async()=>records.has('created')?[{name:autosave.DATABASE,version:1}]:[],open(name,version){
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
              op.result=records.get(key);
              if(typeof op.onsuccess==='function')op.onsuccess();
              done();});return op;},
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

test('Canvas Direct and Effective Radius choices round-trip while old Auto stays unchanged',()=>{
  const draft=studio.blank(),local=storage();
  for(const quality of ['canvas-direct','effective-radius','auto','fast','accurate']){
    const cp=autosave.checkpoint({draft,selectedKey:null,quality,
      prepared:false,positionMs:0},1000);
    assert.equal(cp.quality,quality);
    assert.equal(autosave.writeLocal(local,cp),true);
    assert.equal(autosave.readLocal(local).quality,quality);
  }
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
  assert.match(app,/getGeneration:function\(\)\{return studioDraftGeneration;\}/);
  assert.match(app,/studioPlayback\.seek\(saved\.positionMs,profileNow\(\)\)/);
  assert.match(app,/save:saveStudioDraft/);
  assert.match(fs.readFileSync(path.join(root,'src/animation/ModernAnimationPlaybackControls.js'),'utf8'),
    /options.save\(!!next.playing\)/);
  assert.match(fs.readFileSync(path.join(root,'src/animation/ModernAnimationWorkspaceRecovery.js'),'utf8'),/win\.addEventListener\('pagehide'/);
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
  const end=source.indexOf('  function requestStudioSwitch(kind,id){',start);
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
    let persistCount=0,failSecond=false,stale=false,permission=true,modifyLate=false,conflictSecond=false;
    const ctx={Promise,Date,Error,Math,Object,studioDraftAutosave:autosave,
      studioLibraryActive:record,studioLibraryBusy:false,studioWorkspaceReady:true,
      studioWorkspaceId:'project_saved_project',studioWorkspaces:workspaces,
      studioWorkspaceLocalSaved:true,studioWorkspaceSessionId:'tab_restore_test',
      studioDraftSavedAt:1001,
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
        if(persistCount===2&&conflictSecond){
          const current=autosave.getWorkspace(ctx.studioWorkspaces,'project_saved_project');
          const independent=autosave.checkpoint({...current,libraryId:null,libraryRevision:null},
            current.savedAt+1);
          ctx.studioWorkspaces=autosave.withWorkspace(ctx.studioWorkspaces,
            'draft_conflict',independent,current.savedAt+2);
          ctx.studioWorkspaceId='draft_conflict';
        }
        return Promise.resolve(!(persistCount===2&&(failSecond||conflictSecond)));},
      studioLibrary:{get(){events.push('get');return Promise.resolve(stale?{...record,updatedAt:52}:record);}},
      performStudioSwitch(kind,updated){events.push('switch '+kind);
        assert.equal(kind,'restore');assert.equal(updated.updatedAt,51);
        ctx.studioDraft=autosave.getWorkspace(ctx.studioWorkspaces,'project_saved_project').draft;
      }};
    vm.runInNewContext(code,ctx);
    return {ctx,events,record,configure(o){
      failSecond=!!o.failSecond;stale=!!o.stale;
      permission=o.permission!==false;modifyLate=!!o.modifyLate;
      conflictSecond=!!o.conflictSecond;
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
  const conflict=setup();conflict.configure({conflictSecond:true});
  assert.equal(await conflict.ctx.restoreSavedAnimation(true),false);
  assert.equal(conflict.ctx.studioWorkspaceId,'project_saved_project');
  assert.equal(conflict.ctx.studioWorkspaces.activeId,'project_saved_project');
  assert.equal(conflict.ctx.studioDraft.name,'Unsaved camera project');
  assert.ok(autosave.getWorkspace(conflict.ctx.studioWorkspaces,'draft_conflict'));
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

test('batch deletes only inactive independent working drafts, never named project workspaces',()=>{
  const make=(name,when,libraryId=null)=>autosave.checkpoint({
    draft:studio.edit(studio.blank(),'name',name),selectedKey:null,
    quality:'auto',prepared:false,positionMs:0,libraryId,
    libraryRevision:libraryId?4:null},when);
  let collection=autosave.collection('project_saved_one',make('Named',101,'saved_one'),105);
  collection=autosave.withWorkspace(collection,'draft_first',make('First',107),108);
  collection=autosave.withWorkspace(collection,'draft_second',make('Second',109),110);
  collection=autosave.withWorkspace(collection,'draft_current',make('Current',111),112);
  const original=structuredClone(collection);
  const outcome=autosave.withoutDrafts(collection,120);
  assert.deepEqual(collection,original);
  assert.deepEqual(outcome.deletedIds,['draft_first','draft_second']);
  assert.deepEqual(outcome.collection.workspaces.map(e=>e.id),['project_saved_one','draft_current']);
  assert.equal(outcome.collection.removed.length,2);
  assert.equal(autosave.withoutDrafts(outcome.collection,121).deletedIds.length,0);
  assert.equal(autosave.getWorkspace(outcome.collection,'project_saved_one').libraryId,'saved_one');
});
test('bulk tombstones block recovery forks from older tab snapshots and clean obsolete backups',()=>{
  const data=new Map(),storage={
    get length(){return data.size;},key:i=>[...data.keys()][i]||null,
    getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),
    removeItem:k=>data.delete(k)
  };
  const cp=(name,when)=>autosave.checkpoint({draft:studio.edit(studio.blank(),'name',name),
    selectedKey:null,quality:'auto',prepared:false,positionMs:0},when);
  const base=autosave.collection('draft_current',cp('Opened',100),101);
  const old=autosave.normalizeCollection({...autosave.withWorkspace(
    base,'draft_second',cp('Other draft',150),151),activeId:'draft_current'});
  const different=autosave.normalizeCollection({...autosave.withWorkspace(
    base,'draft_second',cp('Diverged in another tab',152),153),activeId:'draft_current'});
  autosave.writeSessionLocal(storage,old,'tab_aaaaaaaa');
  autosave.writeSessionLocal(storage,different,'tab_bbbbbbbb');
  const before=autosave.combineCollections(autosave.readSessionLocals(storage));
  assert.ok(before.workspaces.some(e=>e.id.startsWith('draft_recovered_')));
  const cleaned=autosave.withoutDrafts(old,200).collection;
  autosave.writeSessionLocal(storage,cleaned,'tab_cccccccc');
  const replay=autosave.combineCollections([cleaned,...autosave.readSessionLocals(storage)]);
  assert.deepEqual(replay.workspaces.map(e=>e.id),['draft_current']);
  assert.ok(replay.removed.some(item=>item.id==='draft_second'));
  // A second reload with the old backup must *still* respect the marker.
  const twice=autosave.combineCollections([replay,old]);
  assert.deepEqual(twice.workspaces.map(e=>e.id),['draft_current']);
  assert.ok(twice.removed.some(item=>item.id==='draft_second'));
  assert.equal(autosave.pruneSessionLocals(storage,cleaned,'tab_cccccccc'),2);
  assert.equal(storage.getItem(autosave.SESSION_LOCAL_PREFIX+'tab_aaaaaaaa'),null);
});

test('F5 reuses the tab recovery slot instead of creating a new independent draft',()=>{
  const tabValues=new Map(),localValues=new Map();
  const tabStorage={getItem:key=>tabValues.get(key)||null,
    setItem:(key,value)=>tabValues.set(key,String(value))};
  const localStorage={get length(){return localValues.size;},
    key:i=>[...localValues.keys()][i]||null,
    getItem:key=>localValues.get(key)||null,
    setItem:(key,value)=>localValues.set(key,String(value)),
    removeItem:key=>localValues.delete(key)};
  let uuid=0;
  const crypto={randomUUID:()=>String(++uuid).padStart(32,'0')};
  const id=autosave.workspaceSessionId(tabStorage,crypto);
  assert.equal(autosave.workspaceSessionId(tabStorage,crypto),id);
  assert.equal(uuid,1,'reload must not allocate a second session ID');
  const otherTab=autosave.workspaceSessionId({
    getItem:()=>null,setItem:()=>{}},crypto);
  assert.notEqual(otherTab,id,'another browser tab gets a distinct session');

  const draft=(name,when)=>autosave.checkpoint({
    draft:studio.edit(studio.blank(),'name',name),selectedKey:null,
    quality:'auto',prepared:false,positionMs:0},when);
  const initial=autosave.collection('draft_original',draft('First edit',100),100);
  let durable=initial;
  for(let reload=0;reload<8;reload++){
    // F5 starts another page instance but shares tab-scoped sessionStorage.
    const resumed=autosave.workspaceSessionId(tabStorage,crypto);
    assert.equal(resumed,id);
    const current=autosave.collection('draft_original',
      draft('Edit '+reload,200+reload),200+reload);
    autosave.writeSessionLocal(localStorage,current,resumed);
    const recovered=autosave.combineCollections([
      durable,...autosave.readSessionLocals(localStorage)]);
    assert.equal(recovered.workspaces.length,1,
      'reload '+reload+' must not fork the current tab into an extra draft');
    assert.equal(recovered.workspaces[0].id,'draft_original');
    durable=recovered;
  }
});

test('restricted sessionStorage uses the same browsing-context identity across F5',()=>{
  const restricted={getItem(){throw Error('sessionStorage denied');},
    setItem(){throw Error('sessionStorage denied');}};
  const tab={name:''},anotherTab={name:''};
  let number=0;
  const crypto={randomUUID:()=>String(++number).padStart(32,'0')};
  const first=autosave.workspaceSessionId(restricted,crypto,tab);
  assert.equal(autosave.workspaceSessionId(restricted,crypto,tab),first);
  assert.equal(number,1);
  assert.notEqual(autosave.workspaceSessionId(restricted,crypto,anotherTab),first);
});

test('durable backup absorbs older page checkpoints even with changed save metadata',()=>{
  const map=new Map(),storage={
    get length(){return map.size;},key:i=>[...map.keys()][i]||null,
    getItem:key=>map.get(key)||null,
    setItem:(key,value)=>map.set(key,String(value)),
    removeItem:key=>map.delete(key)};
  const make=(name,when,positionMs)=>autosave.checkpoint({
    draft:studio.edit(studio.blank(),'name',name),selectedKey:null,
    quality:'auto',prepared:false,positionMs},when);
  const durable=autosave.collection('draft_first',make('Unchanged work',600,2000),601);
  autosave.writeSessionLocal(storage,autosave.collection('draft_first',
    make('Unchanged work',150,0),151),'tab_old_reload');
  autosave.writeSessionLocal(storage,autosave.collection('draft_first',
    make('Distinct unsent edits',160,0),161),'tab_other_tab');
  assert.equal(autosave.pruneSessionLocals(storage,durable,'tab_current'),1);
  const backups=autosave.readSessionLocals(storage);
  assert.equal(backups.length,1);
  assert.equal(backups[0].workspaces[0].checkpoint.draft.name,'Distinct unsent edits');
});

test('queued old checkpoint cannot roll back committed concurrent edits or drop a fork',()=>{
  const cp=(name,when)=>autosave.checkpoint({
    draft:studio.edit(studio.blank(),'name',name),selectedKey:null,
    quality:'auto',prepared:false,positionMs:0,
    libraryId:'saved',libraryRevision:4},when);
  const base=autosave.collection('project_saved',cp('Original',100),101);
  const a=autosave.withWorkspace(base,'project_saved',cp('Tab A edit',200),201);
  const b=autosave.withWorkspace(base,'project_saved',cp('Tab B edit',210),211);
  let generated=0;
  const crypto={randomUUID:()=>String(++generated).padStart(32,'0')};
  assert.equal(autosave.getWorkspace(a,'project_saved').draft.name,'Tab A edit');
  const conflict=autosave.reconcileCollection(b,base,a,crypto);
  assert.equal(conflict.conflicts.length,1);
  const forkId=conflict.conflicts[0].forkId;
  assert.equal(autosave.getWorkspace(conflict.collection,'project_saved').draft.name,'Tab A edit');
  assert.equal(autosave.getWorkspace(conflict.collection,forkId).draft.name,'Tab B edit');
  // A slow queued save still owns the original bytes but may execute after
  // the baseline was advanced to the A+B merge. It must be a no-op, not
  // replace A with Original or infer deletion of the newly created fork.
  const late=autosave.reconcileCollection(base,conflict.collection,conflict.collection,crypto);
  const durable=late.collection;
  assert.equal(autosave.getWorkspace(durable,'project_saved').draft.name,'Tab A edit');
  assert.equal(autosave.getWorkspace(durable,forkId).draft.name,'Tab B edit');
  assert.equal(durable.workspaces.length,conflict.collection.workspaces.length);
  assert.equal(durable.activeId,forkId,'stale writer cannot select the old project over the recovered fork');
  assert.deepEqual(late.protectedDeletes,[]);
  // Deliberate deletion uses a tombstone and must continue to work.
  const removed=autosave.withoutWorkspace(durable,forkId,'project_saved',350);
  const deletion=autosave.reconcileCollection(removed,durable,durable,crypto);
  assert.equal(autosave.getWorkspace(deletion.collection,forkId),null);
  assert.ok(deletion.collection.removed.some(x=>x.id===forkId));
});

test('replayed stale project conflicts reuse the durable draft instead of growing after every F5',()=>{
  // Browser evidence from #24: same project stays active, while each reload
  // previously appended a draft_* ID with the identical old savedAt.
  const cp=(name,when)=>autosave.checkpoint({
    draft:studio.edit(studio.blank(),'name',name),selectedKey:null,
    quality:'auto',prepared:false,positionMs:0,
    libraryId:'saved',libraryRevision:40},when);
  const base=autosave.collection('project_saved',cp('Initial revision',100),100);
  const stale=autosave.collection('project_saved',cp('Unsent revision',150),150);
  let durable=autosave.collection('project_saved',cp('Current project',300),300);
  let created=0;
  const crypto={randomUUID:()=>String(++created).padStart(32,'0')};
  let recoveryId=null;
  for(let reload=0;reload<10;reload++){
    const result=autosave.reconcileCollection(stale,base,durable,crypto);
    durable=result.collection;
    const copies=durable.workspaces.filter(e=>e.id.startsWith('draft_'));
    assert.equal(copies.length,1,'F5 '+reload+' must not append an identical recovery draft');
    if(recoveryId===null)recoveryId=copies[0].id;
    assert.equal(copies[0].id,recoveryId);
    assert.equal(copies[0].checkpoint.savedAt,150);
    assert.equal(copies[0].checkpoint.draft.name,'Unsent revision');
    assert.equal(durable.workspaces.find(e=>e.id==='project_saved').checkpoint.draft.name,
      'Current project','the named project must remain unchanged');
  }
  assert.equal(created,1,'only the first conflict needs a recovery ID');
  const another=autosave.collection('project_saved',cp('Different unsent revision',175),175);
  const independent=autosave.reconcileCollection(another,base,durable,crypto);
  assert.equal(independent.collection.workspaces.filter(e=>e.id.startsWith('draft_')).length,2,
    'distinct conflicting edits must still be protected as a separate draft');
  assert.equal(created,2);
});


test('atomic unchanged-draft Apply guard rejects a stale remote while preserving its exact bytes',async()=>{
  const db=memoryIndexedDB(),a=autosave.checkpoint({draft:studio.blank(),selectedKey:null,
    quality:'fast',prepared:false,positionMs:0},2000);
  const base=autosave.collection('draft_atomic_a',a,2000);
  await autosave.writeCollection(db,base);
  const updated=structuredClone(a);
  updated.draft.name='Other-tab mutation';
  updated.savedAt=3000;
  const remote=autosave.withWorkspace(base,'draft_atomic_a',updated,3000);
  await autosave.writeCollection(db,remote);
  const guard={id:'draft_atomic_a',serializedDraft:JSON.stringify(a.draft)};
  const result=await autosave.writeCollectionMerged(db,base,base,{randomUUID(){
    return '11111111111144448888111111111111';}},guard);
  assert.equal(result.staleWorkspace,true);
  assert.equal(result.conflicts.length,0);
  assert.deepEqual(await autosave.readCollection(db),remote,
    'failed Apply may not write any changed or unchanged project payload');
  const permitted=await autosave.writeCollectionMerged(db,remote,remote,{randomUUID(){
    return '22222222222244448888222222222222';}},
    {id:'draft_atomic_a',serializedDraft:JSON.stringify(updated.draft)});
  assert.equal(permitted.staleWorkspace,undefined);
});

function inventoryStorage(){
  const data=new Map();
  return {get length(){return data.size;},key:i=>Array.from(data.keys())[i]??null,
    getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),
    removeItem:k=>data.delete(k)};
}
test('shared Animation legacy inventory is read-only, does not create absent databases and reports corrupt sources',async()=>{
  const db=memoryIndexedDB(),local=inventoryStorage();
  const cp=autosave.checkpoint({draft:physicalDraft(),selectedKey:null,quality:'auto',
    prepared:false,positionMs:0},100);
  local.setItem(autosave.STORAGE_KEY,JSON.stringify(cp));
  local.setItem(autosave.SESSION_LOCAL_PREFIX+'broken','{invalid');
  local.setItem('unrelated','unchanged');
  const plan=await autosave.inspectLegacySources({indexedDB:db,localStorage:local});
  assert.deepEqual(await db.databases(),[]);
  assert.equal(plan.sources.length,1);
  assert.deepEqual(plan.sources[0].value,cp);
  assert.equal(plan.issues.length,1);
  assert.equal(plan.issues[0].source,'local:'+autosave.SESSION_LOCAL_PREFIX+'broken');
  assert.equal(plan.evidence.local.find(x=>x.key.endsWith('broken')).raw,'{invalid');
  assert.equal(local.getItem('unrelated'),'unchanged');
  assert.equal(local.length,3);
});
test('shared Animation legacy inventory retains divergent equal-timestamp checkpoints and all raw sources',async()=>{
  const db=memoryIndexedDB(),local=inventoryStorage(),id='draft_example';
  const cp=autosave.checkpoint({draft:physicalDraft(),selectedKey:null,quality:'auto',
    prepared:false,positionMs:0},100);
  const altered=structuredClone(cp);altered.draft.name='Divergent same timestamp';
  const old=autosave.collection(id,cp,100),other=autosave.collection(id,altered,100);
  await autosave.write(db,cp);await autosave.writeCollection(db,old);
  local.setItem(autosave.COLLECTION_KEY,JSON.stringify(old));
  local.setItem(autosave.SESSION_LOCAL_PREFIX+'alternate',JSON.stringify(other));
  const plan=await autosave.inspectLegacySources({indexedDB:db,localStorage:local});
  assert.equal(plan.sources.length,4);assert.equal(plan.issues.length,0);
  const variants=plan.variants.filter(v=>v.id===id);
  assert.equal(variants.length,2);
  assert.equal(variants.find(v=>v.checkpoint.draft.name===cp.draft.name).sources.length,2);
  assert.equal(variants.find(v=>v.checkpoint.draft.name===altered.draft.name).sources.length,1);
  assert.deepEqual(plan.evidence.remote.workspaces,old);
  assert.deepEqual(await autosave.readCollection(db),old);
  assert.equal(local.getItem(autosave.SESSION_LOCAL_PREFIX+'alternate'),JSON.stringify(other));
});
test('shared Animation inspection refuses changing or inaccessible legacy evidence',async()=>{
  const db=memoryIndexedDB(),local=inventoryStorage();
  const changing={databases:async()=>{local.setItem(autosave.STORAGE_KEY,'changed');return [];}};
  await assert.rejects(autosave.inspectLegacySources({indexedDB:changing,localStorage:local}),/changed during inspection/);
  await assert.rejects(autosave.inspectLegacySources({indexedDB:{},localStorage:local}),/database inventory unavailable/);
  await assert.rejects(autosave.inspectLegacySources({indexedDB:db,localStorage:null}),/localStorage inventory unavailable/);
});

function sharedAnimationDB(){
  const records=new Map();let created=false;
  const db={records,databases:async()=>created?[{name:autosave.DATABASE,version:1}]:[],
    open(name,version){
      assert.equal(name,autosave.DATABASE);assert.equal(version,1);
      const req={};
      queueMicrotask(()=>{
        const connection={objectStoreNames:{contains:()=>created},
          createObjectStore(){created=true;},close(){},
          transaction(_name,mode){
            let pending=0,aborted=false,completed=false;
            const staged=new Map(),tx={error:null,abort(){
              if(aborted||completed)return;aborted=true;
              queueMicrotask(()=>tx.onabort?.());
            }};
            function done(){
              if(!pending&&!aborted&&!completed){
                completed=true;for(const [k,v] of staged)records.set(k,v);
                tx.oncomplete?.();
              }
            }
            tx.objectStore=()=>({
              get(key){
                pending++;const op={};
                queueMicrotask(()=>{
                  if(aborted)return;
                  op.result=structuredClone(staged.has(key)?staged.get(key):records.get(key));
                  op.onsuccess?.();pending--;done();
                });return op;
              },
              put(value,key){
                assert.equal(mode,'readwrite');pending++;
                queueMicrotask(()=>{if(aborted)return;
                  staged.set(key,structuredClone(value));pending--;done();
                });
              }
            });
            return tx;
          }};
        req.result=connection;
        if(!created)req.onupgradeneeded?.();
        req.onsuccess?.();
      });return req;
    }};
  return db;
}
function animationSharedLease(){
  let active=true;const tracked=new Set();
  return {sessionId:'shared',check(){if(!active)throw Error('Animation lifetime ended');},
    track(tx){tracked.add(tx);return ()=>tracked.delete(tx);},
    end(){active=false;for(const tx of tracked)tx.abort();}};
}
function sharedAnimationFixture(){
  const db=sharedAnimationDB(),local=inventoryStorage(),lease=animationSharedLease(),
    crypto=require('node:crypto').webcrypto;
  const cp=autosave.checkpoint({draft:physicalDraft(),selectedKey:null,quality:'auto',
    prepared:false,positionMs:0},100),id='draft_shared',other='draft_other';
  const collection=autosave.withWorkspace(autosave.collection(id,cp,100),other,cp,101);
  const open=()=>autosave.openSharedCollection(db,{lease,crypto});
  const inspect=()=>autosave.inspectLegacySources({indexedDB:db,localStorage:local});
  const base={revision:7,digest:'sha256:'+'a'.repeat(64)};
  return {db,local,lease,crypto,cp,id,other,collection,open,inspect,base};
}
test('shared Animation adoption selects only explicit verified evidence and preserves old bytes',async()=>{
  const f=sharedAnimationFixture(),a=f.open();
  const divergent=structuredClone(f.collection);divergent.workspaces[0].checkpoint.draft.name='other variant';
  await autosave.writeCollection(f.db,f.collection);
  f.local.setItem(autosave.COLLECTION_KEY,JSON.stringify(divergent));
  const plan=await f.inspect();assert.equal(await a.read(),null);
  await assert.rejects(async()=>a.initializeFromLegacy(plan,'missing',f.local),/exact Animation legacy source/);
  const row=await a.initializeFromLegacy(plan,'idb:workspaces',f.local);
  assert.deepEqual(row.collection,f.collection);assert.equal(row.revision,1);
  assert.equal(row.receipt,null);assert.deepEqual(await f.open().read(),row);
  assert.deepEqual(await autosave.readCollection(f.db),f.collection);
  assert.equal(f.local.getItem(autosave.COLLECTION_KEY),JSON.stringify(divergent));
  assert.deepEqual(await f.open().prepareReference(autosave.documentReference(row,f.id)),
    {reference:autosave.documentReference(row,f.id),checkpoint:f.cp});
});
test('shared Animation initialization refuses stale sources and existing shared rows',async()=>{
  const f=sharedAnimationFixture(),a=f.open();assert.equal(await a.read(),null);
  const empty=await f.inspect();
  f.local.setItem(autosave.STORAGE_KEY,JSON.stringify(f.cp));
  await assert.rejects(async()=>a.initializeEmpty(empty,f.collection,f.local),/local evidence changed/);
  const plan=await f.inspect();
  await assert.rejects(async()=>a.initializeEmpty(plan,f.collection,f.local),/explicit adoption/);
  await autosave.write(f.db,f.cp);
  await assert.rejects(a.initializeFromLegacy(plan,'local:'+autosave.STORAGE_KEY,f.local),/IndexedDB evidence changed/);
  assert.equal(await a.read(),null);
  const fresh=await f.inspect(),row=await a.initializeFromLegacy(fresh,'idb:current',f.local);
  assert.equal(row.revision,1);assert.equal(row.collection.workspaces.length,1);
  await assert.rejects(a.initializeFromLegacy(fresh,'idb:current',f.local),/Read exact/);
});
test('shared Animation save atomically carries receipt, preserves other revisions, and rejects stale writer',async()=>{
  const f=sharedAnimationFixture(),a=f.open(),b=f.open();await a.read();
  const row=await a.initializeEmpty(await f.inspect(),f.collection,f.local);
  assert.deepEqual(await b.read(),row);
  const ref=autosave.documentReference(row,f.id),other=autosave.documentReference(row,f.other);
  const next=structuredClone(f.cp);next.savedAt=200;next.draft.name='New animation';
  const saved=await a.saveSelected(row,ref,next,f.base);
  assert.equal(saved.revision,2);assert.equal(saved.collection.activeId,f.other);
  assert.deepEqual(saved.receipt,{version:1,base:f.base,previous:ref,
    current:autosave.documentReference(saved,f.id),status:'updated'});
  assert.deepEqual(autosave.documentReference(saved,f.other),other);
  assert.deepEqual(await f.open().read(),saved);
  await assert.rejects(b.saveSelected(row,ref,next,f.base),/CAS conflict/);
  await assert.rejects(a.saveSelected(saved,saved.receipt.current,{...next,savedAt:201},f.base),/pending Animation/);
  assert.deepEqual(await a.read(),saved);
  await assert.rejects(f.open().prepareReference(ref),/revision changed/);
  const cleared=await a.retire(saved,saved.receipt);
  assert.equal(cleared.revision,3);assert.equal(cleared.receipt,null);
  assert.deepEqual(cleared.revisions,saved.revisions);assert.deepEqual(cleared.collection,saved.collection);
  assert.deepEqual(await f.open().prepareReference(saved.receipt.current),
    {reference:saved.receipt.current,checkpoint:next});
});
test('shared Animation rejects corrupted rows and stale lifetime without replacing evidence',async()=>{
  const f=sharedAnimationFixture(),a=f.open();await a.read();
  const row=await a.initializeEmpty(await f.inspect(),f.collection,f.local);
  const bad=structuredClone(row);bad.collection.workspaces[0].checkpoint.draft.name='tampered';
  f.db.records.set(autosave.SHARED_COLLECTION_KEY,bad);
  await assert.rejects(f.open().read(),/digest mismatch/);
  assert.deepEqual(f.db.records.get(autosave.SHARED_COLLECTION_KEY),bad);
  f.db.records.set(autosave.SHARED_COLLECTION_KEY,row);
  f.lease.end();
  await assert.rejects(a.saveSelected(row,autosave.documentReference(row,f.id),
    {...f.cp,savedAt:200},f.base),/lifetime ended/);
  assert.deepEqual(f.db.records.get(autosave.SHARED_COLLECTION_KEY),row);
});

async function sharedWriterFixture(){
  const f=sharedAnimationFixture(),storage=f.open();await storage.read();
  const row=await storage.initializeEmpty(await f.inspect(),f.collection,f.local);
  let pointer=autosave.documentReference(row,f.id),captureCount=0,acks=0,domainWrites=0;
  let failAck=false,failRetirement=false,hold=null;
  const selection={
    check:()=>f.lease.check(true),coordinate:async action=>action(),
    async captureBase(ref){
      assert.deepEqual(ref,pointer);captureCount++;return f.base;
    },
    async acknowledge(receipt){
      acks++;if(hold)await hold;
      if(failAck)throw Error('injected pointer failure');
      assert.deepEqual(receipt.previous,pointer);pointer=receipt.current;
    }
  };
  const adapter={read:()=>storage.read(),
    saveSelected(...args){domainWrites++;return storage.saveSelected(...args);},
    async retire(...args){
      if(failRetirement==='before')throw Error('injected retirement failure');
      const result=await storage.retire(...args);
      if(failRetirement==='after')throw Error('retirement acknowledgement lost');
      return result;
    }};
  const coordinator=require('../src/animation/ModernAnimationWorkspacePersistence').createShared({
    autosave,storage:adapter,selection});
  await coordinator.bind(pointer);
  const changed=(name,savedAt)=>({...structuredClone(f.cp),savedAt,draft:{...f.cp.draft,name}});
  return {...f,row,coordinator,storage,changed,counts:()=>({captureCount,acks,domainWrites}),
    pointer:()=>pointer,setAckFailure:v=>{failAck=v;},setRetireFailure:v=>{failRetirement=v;},
    holdAck:()=>{let release;hold=new Promise(resolve=>{release=resolve;});return ()=>{hold=null;release();};}};
}
test('shared Animation coordinator does not save viewport-independent timestamp-only hydration',async()=>{
  const h=await sharedWriterFixture(),c=h.coordinator;
  c.mark({...h.cp,savedAt:200});await c.save();
  assert.equal(h.counts().domainWrites,0);assert.equal(c.state().unsaved,false);
  assert.deepEqual(await h.storage.read(),h.row);
});
test('shared Animation coordinator retains later edits and acknowledges them in order',async()=>{
  const h=await sharedWriterFixture(),c=h.coordinator,release=h.holdAck();
  c.mark(h.changed('First',200));const saving=c.save();
  while(!h.counts().acks)await new Promise(setImmediate);
  c.mark(h.changed('Second',201));
  assert.equal(c.state().unsaved,true);
  release();await saving;
  assert.equal(h.counts().domainWrites,2);assert.equal(h.counts().acks,2);
  assert.equal(c.state().unsaved,false);assert.equal(c.state().selectionPending,null);
  const row=await h.storage.read();
  assert.equal(autosave.getWorkspace(row.collection,h.id).draft.name,'Second');
  assert.deepEqual(h.pointer(),autosave.documentReference(row,h.id));
  assert.equal(row.receipt,null);
});
test('shared Animation coordinator retries exact receipt, not the domain write',async()=>{
  const h=await sharedWriterFixture(),c=h.coordinator;
  h.setAckFailure(true);c.mark(h.changed('Pending',200));
  await assert.rejects(c.save(),/pointer failure/);
  const durable=await h.storage.read();
  assert.ok(durable.receipt);assert.deepEqual(c.state().selectionPending,durable.receipt);
  assert.equal(c.recovery().checkpoint.draft.name,'Pending');
  await assert.rejects(c.save(),/Explicit Animation save retry/);
  h.setAckFailure(false);await c.retry();
  assert.equal(h.counts().domainWrites,1);assert.equal(h.counts().acks,2);
  assert.equal(c.state().error,null);assert.equal(c.recovery(),null);
  assert.equal((await h.storage.read()).receipt,null);
});
test('shared Animation coordinator proves exact retirement after lost acknowledgement',async()=>{
  for(const fault of ['before','after']){
    const h=await sharedWriterFixture(),c=h.coordinator;
    h.setRetireFailure(fault);c.mark(h.changed('Linked',200));
    await assert.rejects(c.save(),/retirement/);
    assert.equal(h.counts().acks,1);assert.equal(h.counts().domainWrites,1);
    h.setRetireFailure(false);await c.retry();
    assert.equal(h.counts().acks,1);assert.equal(h.counts().domainWrites,1);
    assert.equal(c.state().unsaved,false);
    assert.equal((await h.storage.read()).receipt,null);
  }
});
test('shared Animation coordinator refuses stale collection without losing unsaved draft',async()=>{
  const h=await sharedWriterFixture(),c=h.coordinator,other=h.open();
  const row=await other.read(),ref=autosave.documentReference(row,h.other);
  const saved=await other.saveSelected(row,ref,h.changed('Competing',200),h.base);
  await other.retire(saved,saved.receipt);
  c.mark(h.changed('Unsent',201));
  await assert.rejects(c.save(),/collection changed/);
  assert.equal(h.counts().domainWrites,0);assert.equal(c.recovery().checkpoint.draft.name,'Unsent');
  await assert.rejects(c.bind(h.pointer()),/Resolve shared Animation edits/);
  assert.equal(autosave.getWorkspace((await other.read()).collection,h.other).draft.name,'Competing');
});
