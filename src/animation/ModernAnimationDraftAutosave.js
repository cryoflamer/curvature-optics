/* Crash/reload recovery for Animation Studio workspaces, independent of the
 * named Animation Library. V1 single-draft checkpoints remain readable for
 * migration; a V2 collection owns one checkpoint per working project/draft.
 * LocalStorage supports synchronous pagehide recovery; IndexedDB mirrors it.
 */
(function(root,factory){
  var experiment=root.CurvatureModernExperimentState;
  var hud=root.CurvatureModernCameraHud;
  var contracts=root.CurvatureModernAnimationContract;
  var projects=root.CurvatureModernAnimationProject;
  if(typeof module==='object'&&module.exports){
    experiment=require('../ui/modern/ModernExperimentState');
    hud=require('../ui/modern/ModernCameraHud');
    contracts=require('./ModernAnimationContract');
    projects=require('./ModernAnimationProject');
  }
  // Library is loaded after this module by the browser entry point. Resolve
  // it lazily only when validating a shared named-save intent.
  var getLibrary=()=>typeof module==='object'&&module.exports?
    require('./ModernAnimationLibrary'):root.CurvatureModernAnimationLibrary;
  var getStudio=()=>typeof module==='object'&&module.exports?
    require('./ModernAnimationStudio'):root.CurvatureModernAnimationStudio;
  var api=factory(root,experiment,hud,contracts,projects,getLibrary,getStudio);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationDraftAutosave=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(root,experiment,hud,contracts,projects,getLibrary,getStudio){
  'use strict';
  var VERSION=1,STORAGE_KEY='curvature-modern-animation-draft-v1';
  var DATABASE='curvature-modern-animation-draft',STORE='draft',KEY='current';
  var COLLECTION_VERSION=2,COLLECTION_KEY='curvature-modern-animation-workspaces-v2';
  var COLLECTION_DB_KEY='workspaces';
  var SESSION_LOCAL_PREFIX=COLLECTION_KEY+'-session-';
  var TAB_SESSION_KEY=COLLECTION_KEY+'-tab-id';
  // A page load is not a new tab. Reuse the same recovery slot across F5 so
  // an earlier pagehide checkpoint cannot masquerade as another tab's edits.
  function workspaceSessionId(tabStorage,crypto,tabWindow){
    var existing=null;
    try{existing=tabStorage&&tabStorage.getItem(TAB_SESSION_KEY);}catch(error){}
    if(typeof existing==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(existing))
      return existing;
    // Some file:// or privacy-restricted contexts deny sessionStorage.
    // window.name is scoped to the browsing context and survives F5.
    var windowName=null;
    try{windowName=tabWindow&&tabWindow.name;}catch(error){}
    if(typeof windowName==='string'&&
       /^curvature_optics_(session_[A-Za-z0-9_-]{8,92})$/.test(windowName))
      return windowName.slice('curvature_optics_'.length);
    var token=crypto&&typeof crypto.randomUUID==='function'?
      crypto.randomUUID().replace(/-/g,''):
      Math.random().toString(36).slice(2)+Date.now().toString(36);
    var id='session_'+token,stored=false;
    try{if(tabStorage){tabStorage.setItem(TAB_SESSION_KEY,id);stored=true;}}catch(error){}
    if(!stored&&tabWindow&&!windowName){
      try{tabWindow.name='curvature_optics_'+id;}catch(error){}
    }
    return id;
  }
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function string(v,max){if(typeof v!=='string'||v.length>max)throw RangeError('Invalid animation draft text');return v;}
  function number(v,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)
    throw RangeError('Invalid animation draft number');return v;}
  function normalize(input){
    if(!object(input)||input.version!==VERSION||!Number.isSafeInteger(input.savedAt)||input.savedAt<=0)
      throw RangeError('Invalid animation checkpoint');
    var draft=input.draft;
    if(!object(draft)||!['auto','camera','physical','experimental'].includes(draft.mode)||
      !['none','history','camera-sequence','mixed'].includes(draft.source)||
      typeof draft.target!=='string'||draft.target.length>90||
      !Array.isArray(draft.frames)||draft.frames.length>200)
      throw RangeError('Invalid animation draft');
    if(draft.target!=='auto'&&!/^(scene|A|B)\|(surface\.curvature|temperatureProfile\.gradientKPerKm)$/.test(draft.target))
      throw RangeError('Invalid animation physical target');
    var contract=draft.contract==null?null:contracts.validate(draft.contract);
    if(contract&&(contract.mode!==draft.mode||
      (contract.target?contract.target.scope+'|'+contract.target.parameter:'auto')!==draft.target))
      throw RangeError('Animation draft contract disagrees with mode or target');
    var interpolation=draft.interpolation===undefined?'linear':draft.interpolation;
    if(!['linear','spline'].includes(interpolation))throw RangeError('Invalid animation interpolation');
    var keys=new Set(),frames=draft.frames.map(function(frame,i){
      if(!object(frame))throw RangeError('Invalid animation frame');
      var key=string(frame.key,140);
      if(!key||keys.has(key))throw RangeError('Duplicate or empty animation frame key');
      keys.add(key);
      var id=frame.sourceSnapshotId;
      if(id!==null&&!(Number.isSafeInteger(id)&&id>0)&&
        !(typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id)))
        throw RangeError('Invalid animation source snapshot');
      if(!['linear','smoothstep'].includes(frame.easing))throw RangeError('Invalid animation easing');
      var result={key:key,sourceSnapshotId:id,name:string(frame.name,120),
        experiment:experiment.validate(frame.experiment),
        travelMs:number(frame.travelMs,i===0?0:200,i===0?0:120000),
        holdMs:number(frame.holdMs,0,120000),easing:frame.easing};
      if(frame.narrativeTitle!==undefined)result.narrativeTitle=string(frame.narrativeTitle,120);
      if(frame.description!==undefined)result.description=string(frame.description,1000);
      if(frame.referenceImageIds!==undefined){var refs=projects.validateReferenceIds(frame.referenceImageIds);if(refs.length)result.referenceImageIds=refs;}
      return result;
    });
    var active=draft.activeFrameKeys==null?null:draft.activeFrameKeys;
    if(active!==null&&(!Array.isArray(active)||active.length<2||active.length>frames.length||
      new Set(active).size!==active.length||active.some(function(key){return !keys.has(key);})))
      throw RangeError('Invalid selected animation sequence');
    var selected=input.selectedKey;
    if(selected!==null&&(!keys.has(selected)||typeof selected!=='string'))selected=null;
    var quality=input.quality;
    if(!['auto','accurate','fast','effective-radius','canvas-direct'].includes(quality))
      throw RangeError('Invalid playback quality');
    if(typeof input.prepared!=='boolean')throw RangeError('Invalid prepared flag');
    // Optional association with a named project; older v1 checkpoints stay valid.
    var libraryId=input.libraryId===undefined?null:input.libraryId;
    var libraryRevision=input.libraryRevision===undefined?null:input.libraryRevision;
    if(libraryId!==null&&(typeof libraryId!=='string'||
      !/^[A-Za-z0-9_-]{1,80}$/.test(libraryId)))throw RangeError('Invalid saved animation ID');
    if(libraryId===null){libraryRevision=null;}
    else if(!Number.isSafeInteger(libraryRevision)||libraryRevision<=0)
      throw RangeError('Invalid saved animation revision');
    return {version:VERSION,savedAt:input.savedAt,
      draft:{name:string(draft.name,120),description:string(draft.description,1000),
        mode:draft.mode,target:draft.target,interpolation:interpolation,contract:contract,
        source:draft.source,frames:frames,
        activeFrameKeys:active?active.slice():null,
        cameraHudAppearance:draft.cameraHudAppearance==null?null:
          hud.validateAppearance(draft.cameraHudAppearance)},
      selectedKey:selected,quality:quality,prepared:input.prepared,
      libraryId:libraryId,libraryRevision:libraryRevision,
      positionMs:number(input.positionMs,0,48000000)};
  }
  function checkpoint(value,savedAt){
    return normalize(Object.assign({version:VERSION,savedAt:savedAt},value));
  }
  function readLocal(storage){
    if(!storage||typeof storage.getItem!=='function')return null;
    try{var raw=storage.getItem(STORAGE_KEY);return raw===null?null:normalize(JSON.parse(raw));}
    catch(error){return null;}
  }
  function writeLocal(storage,record){
    if(!storage||typeof storage.setItem!=='function')return false;
    storage.setItem(STORAGE_KEY,JSON.stringify(normalize(record)));
    return true;
  }
  function newer(local,remote){
    if(!local)return remote||null;
    if(!remote)return local;
    return remote.savedAt>local.savedAt?remote:local;
  }
  function workspaceId(value){
    if(typeof value!=='string'||value.length>110||
      !/^(draft|project)_[A-Za-z0-9_-]{1,100}$/.test(value))
      throw RangeError('Invalid animation workspace ID');
    return value;
  }
  function makeWorkspaceId(crypto,now){
    var token=crypto&&typeof crypto.randomUUID==='function'?crypto.randomUUID().replace(/-/g,''):
      Math.floor(Math.random()*0x100000000).toString(36)+
      Math.floor(Math.random()*0x100000000).toString(36);
    return workspaceId('draft_'+(now||Date.now()).toString(36)+'_'+token);
  }
  function projectWorkspaceId(id){
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id))
      throw RangeError('Invalid animation project ID');
    return workspaceId('project_'+id);
  }
  function normalizeCollection(input){
    if(!object(input)||input.version!==COLLECTION_VERSION||
      !Number.isSafeInteger(input.savedAt)||input.savedAt<=0||
      !Array.isArray(input.workspaces)||input.workspaces.length>256)
      throw RangeError('Invalid animation workspace collection');
    var ids=new Set();
    var workspaces=input.workspaces.map(function(item){
      if(!object(item))throw RangeError('Invalid animation workspace');
      var id=workspaceId(item.id);
      if(ids.has(id))throw RangeError('Duplicate animation workspace ID');
      ids.add(id);
      var saved=normalize(item.checkpoint);
      if(id.indexOf('project_')===0&&saved.libraryId!==id.slice(8))
        throw RangeError('Animation workspace and library ID disagree');
      if(id.indexOf('draft_')===0&&saved.libraryId!==null)
        throw RangeError('Unlinked draft must not reference a library project');
      return {id:id,checkpoint:saved};
    });
    var activeId=workspaceId(input.activeId);
    if(!ids.has(activeId))throw RangeError('Active animation workspace missing');
    // Deletion markers stop stale tabs or old local backups resurrecting a draft.
    // Omit the field for untouched v2 collections to retain legacy JSON parity.
    var removed=input.removed===undefined?[]:input.removed;
    if(!Array.isArray(removed)||removed.length>512)throw RangeError('Invalid removed workspaces');
    var deleted=new Set(),tombstones=removed.map(function(item){
      if(!object(item))throw RangeError('Invalid workspace deletion marker');
      var id=workspaceId(item.id),when=number(item.removedAt,1,Number.MAX_SAFE_INTEGER);
      if(deleted.has(id)||ids.has(id)||!Number.isSafeInteger(when))
        throw RangeError('Conflicting workspace deletion marker');
      deleted.add(id);
      return {id:id,removedAt:when};
    });
    var normalized={version:COLLECTION_VERSION,savedAt:input.savedAt,activeId:activeId,
      workspaces:workspaces};
    if(tombstones.length)normalized.removed=tombstones;
    return normalized;
  }
  function collection(id,checkpoint,savedAt){
    return normalizeCollection({version:COLLECTION_VERSION,activeId:id,
      savedAt:savedAt||Date.now(),workspaces:[{id:id,checkpoint:checkpoint}]});
  }
  function withWorkspace(collectionValue,id,checkpoint,savedAt){
    var original=normalizeCollection(collectionValue),next=original.workspaces.filter(function(item){
      return item.id!==id;
    });
    next.push({id:workspaceId(id),checkpoint:normalize(checkpoint)});
    return normalizeCollection({version:COLLECTION_VERSION,activeId:id,
      savedAt:Math.max(savedAt||Date.now(),original.savedAt+1),workspaces:next,
      removed:(original.removed||[]).filter(function(item){return item.id!==id;})});
  }
  function withoutWorkspace(collectionValue,id,activeId,savedAt){
    var original=normalizeCollection(collectionValue);
    var removed=(original.removed||[]).filter(function(item){return item.id!==id;});
    removed.push({id:workspaceId(id),removedAt:Math.max(savedAt||Date.now(),original.savedAt+1)});
    return normalizeCollection({version:COLLECTION_VERSION,
      savedAt:Math.max(savedAt||Date.now(),original.savedAt+1),activeId:activeId,
      workspaces:original.workspaces.filter(function(item){return item.id!==id;}),removed:removed});
  }
  // Batch-delete only inactive unlinked drafts. Saved Library project slots
  // are always retained. Replacing an active draft must happen beforehand.
  function withoutDrafts(value,savedAt){
    var original=normalizeCollection(value),active=original.activeId;
    var victims=original.workspaces.filter(function(item){
      return item.id.indexOf('draft_')===0&&item.id!==active;
    });
    if(!victims.length)return {collection:original,deletedIds:[]};
    var when=Math.max(savedAt||Date.now(),original.savedAt+1);
    original.workspaces.forEach(function(item){when=Math.max(when,item.checkpoint.savedAt+1);});
    var ids=new Set(victims.map(function(item){return item.id;}));
    var removed=(original.removed||[]).concat(victims.map(function(item){
      return {id:item.id,removedAt:when};
    }));
    // Validation refuses partial deletion if tombstone capacity is exceeded.
    var next=normalizeCollection({version:COLLECTION_VERSION,
      savedAt:when,activeId:active,
      workspaces:original.workspaces.filter(function(item){return !ids.has(item.id);}),
      removed:removed});
    return {collection:next,deletedIds:Array.from(ids)};
  }
  // Prepare the next durable workspace collection before changing the live
  // editor. A stash is an independent draft, never the named project's slot.
  function restoreSavedProject(value,projectId,savedCheckpoint,stashId,savedAt){
    var current=normalizeCollection(value);
    if(projectId!==current.activeId||projectId.indexOf('project_')!==0)
      throw RangeError('Only the active saved project can be restored');
    var prior=getWorkspace(current,projectId),clean=normalize(savedCheckpoint);
    if(!prior||clean.libraryId!==projectId.slice(8)||
      !Number.isSafeInteger(clean.libraryRevision)||clean.libraryRevision<=0)
      throw RangeError('Saved project checkpoint does not match the active workspace');
    var next=current;
    if(stashId!==null){
      if(typeof stashId!=='string'||stashId.indexOf('draft_')!==0||
        current.workspaces.some(function(item){return item.id===stashId;}))
        throw RangeError('Stash must have a fresh independent draft ID');
      var stashed=checkpoint(Object.assign({},prior,{
        libraryId:null,libraryRevision:null
      }),Math.max(savedAt||Date.now(),prior.savedAt+1));
      next=withWorkspace(next,stashId,stashed);
    }
    // withWorkspace sets activeId to the updated ID, which must be the saved
    // project. Later autosaves therefore cannot overwrite the independent stash.
    return withWorkspace(next,projectId,clean,savedAt);
  }
  function getWorkspace(value,id){
    var entry=normalizeCollection(value).workspaces.find(function(item){return item.id===id;});
    return entry?entry.checkpoint:null;
  }
  function readCollectionLocal(storage){
    if(!storage||typeof storage.getItem!=='function')return null;
    try{var raw=storage.getItem(COLLECTION_KEY);return raw===null?null:
      normalizeCollection(JSON.parse(raw));}catch(error){return null;}
  }
  function writeCollectionLocal(storage,record){
    if(!storage||typeof storage.setItem!=='function')return false;
    storage.setItem(COLLECTION_KEY,JSON.stringify(normalizeCollection(record)));
    return true;
  }
  function migrate(checkpoint,crypto){
    var saved=normalize(checkpoint),id=saved.libraryId?
      projectWorkspaceId(saved.libraryId):makeWorkspaceId(crypto,saved.savedAt);
    return collection(id,saved,saved.savedAt);
  }
  function newerCollection(local,remote){
    if(!local)return remote?normalizeCollection(remote):null;
    if(!remote)return normalizeCollection(local);
    var a=normalizeCollection(local),b=normalizeCollection(remote);
    return b.savedAt>a.savedAt?b:a;
  }
  // A tab may know only a subset of the latest workspaces. Treat the delta
  // against its last IndexedDB snapshot as an operation, not as a replacement
  // for the complete database. Simultaneous edits of one ID are forked instead
  // of allowing last-writer-wins to destroy either draft.
  function reconcileCollection(staged,base,remote,crypto){
    var next=normalizeCollection(staged),prior=base?normalizeCollection(base):null;
    var stored=remote?normalizeCollection(remote):null;
    var originals=new Map((prior?prior.workspaces:[]).map(function(e){return [e.id,e.checkpoint];}));
    var latest=new Map((stored?stored.workspaces:[]).map(function(e){return [e.id,e.checkpoint];}));
    var deletions=new Map((stored&&stored.removed||[]).map(function(e){return [e.id,e.removedAt];}));
    var previouslyDeleted=new Map((prior&&prior.removed||[]).map(function(e){return [e.id,e.removedAt];}));
    var conflicts=[],lostDeletes=[];
    function equal(a,b){return JSON.stringify(a)===JSON.stringify(b);}
    function sameContent(a,b){return a&&b&&equal(a.draft,b.draft)&&
      a.quality===b.quality&&a.libraryId===b.libraryId&&
      a.libraryRevision===b.libraryRevision;}
    function fork(id,saved){
      var copy=checkpoint(Object.assign({},saved,{libraryId:null,libraryRevision:null}),saved.savedAt);
      // Replaying an old tab checkpoint on every F5 must not mint another
      // independent draft when the exact recovery copy is already durable.
      // Compare the entire normalized checkpoint (not just its visible name
      // or timestamp), so genuinely different unsent edits remain recoverable.
      var existing=Array.from(latest).find(function(entry){
        return entry[0].indexOf('draft_')===0&&equal(entry[1],copy);
      });
      var forkId=existing?existing[0]:makeWorkspaceId(crypto);
      if(!existing){
        while(latest.has(forkId)||deletions.has(forkId))forkId=makeWorkspaceId(crypto);
        latest.set(forkId,copy);
      }
      conflicts.push({id:id,forkId:forkId});
      return forkId;
    }
    // Only an explicit tombstone is evidence of deletion. A queued snapshot
    // captured before a concurrent merge may omit newly recovered drafts:
    // absence alone must never delete those remote workspaces.
    var removalIds=new Set();
    (next.removed||[]).forEach(function(item){
      if(!previouslyDeleted.has(item.id))removalIds.add(item.id);
    });
    removalIds.forEach(function(id){
      var old=originals.get(id),live=latest.get(id);
      if(live&&!equal(old,live)){
        lostDeletes.push(id);return;
      }
      latest.delete(id);
      deletions.set(id,Math.max(next.savedAt,deletions.get(id)||0));
    });
    next.workspaces.forEach(function(entry){
      var old=originals.get(entry.id),live=latest.get(entry.id);
      // The writer can queue a snapshot before a newer local transaction
      // updates its baseline. Never replay that older checkpoint as an edit,
      // even if the remote record still matches the *new* baseline.
      if(old&&entry.checkpoint.savedAt<old.savedAt)return;
      // Untouched workspaces belong to the durable version, not the stale tab.
      if(equal(entry.checkpoint,old))return;
      if((live&&!equal(live,old))||(!live&&deletions.has(entry.id))){
        // A position-only autosave must not produce spurious duplicate drafts.
        if(sameContent(entry.checkpoint,live)){
          if(entry.checkpoint.savedAt>live.savedAt)latest.set(entry.id,entry.checkpoint);
        }else fork(entry.id,entry.checkpoint);
        return;
      }
      latest.set(entry.id,entry.checkpoint);deletions.delete(entry.id);
    });
    // An older queued writer must also not revert the selected workspace
    // after a newer acknowledged transaction switched to a recovered fork.
    var active=prior&&next.savedAt<prior.savedAt&&latest.has(prior.activeId)?
      prior.activeId:next.activeId;
    var conflict=conflicts.find(function(item){return item.id===active;});
    // Even a tab that has not edited since its last backup can have an open
    // editor on a now-deleted/changed project. Do not silently switch its
    // backing workspace underneath the live editor on a later flush.
    if(!conflict&&originals.has(active)){
      var opened=next.workspaces.find(function(e){return e.id===active;});
      var remoteOpened=latest.get(active);
      if(opened&&equal(opened.checkpoint,originals.get(active))&&
        ((!remoteOpened&&deletions.has(active))||
          (remoteOpened&&!sameContent(opened.checkpoint,remoteOpened)))){
        conflict={id:active,forkId:fork(active,opened.checkpoint)};
      }
    }
    if(conflict)active=conflict.forkId;
    if(!latest.has(active))active=stored&&latest.has(stored.activeId)?stored.activeId:
      latest.keys().next().value;
    if(!active)throw Error('No animation workspaces remain');
    var result=normalizeCollection({version:COLLECTION_VERSION,activeId:active,
      savedAt:Math.max(Date.now(),next.savedAt,(stored?stored.savedAt:0)+1),
      workspaces:Array.from(latest,function(pair){return {id:pair[0],checkpoint:pair[1]};}),
      removed:Array.from(deletions,function(pair){return {id:pair[0],removedAt:pair[1]};})});
    return {collection:result,conflicts:conflicts,protectedDeletes:lostDeletes};
  }
  // Each tab owns an independent synchronous fallback, so another tab cannot
  // erase its most recent unsent work while IndexedDB is still committing.
  function writeSessionLocal(storage,value,sessionId){
    if(!storage||typeof storage.setItem!=='function')return false;
    if(!/^[A-Za-z0-9_-]{8,100}$/.test(sessionId||''))throw RangeError('Invalid workspace session');
    storage.setItem(SESSION_LOCAL_PREFIX+sessionId,JSON.stringify(normalizeCollection(value)));
    return true;
  }
  function readSessionLocals(storage){
    if(!storage||typeof storage.key!=='function'||!Number.isSafeInteger(storage.length))return [];
    var values=[];
    try{
      for(var i=0;i<storage.length;i++){
        var key=storage.key(i);
        if(typeof key!=='string'||key.indexOf(SESSION_LOCAL_PREFIX)!==0)continue;
        var raw=storage.getItem(key);
        if(raw!==null)try{
          var snapshot=normalizeCollection(JSON.parse(raw));
          Object.defineProperty(snapshot,'sessionId',{value:key.slice(SESSION_LOCAL_PREFIX.length)});
          values.push(snapshot);
        }catch(error){}
      }
    }catch(error){}
    return values;
  }
  // A committed checkpoint can supersede a previous page's backup even if
  // its savedAt/playhead changed during normal autosave. Compare *draft data*
  // instead of full checkpoint JSON; never discard a distinct edited draft.
  function backedUpCheckpoint(source,stored){
    if(JSON.stringify(source.draft)!==JSON.stringify(stored.draft)||
       source.quality!==stored.quality||source.prepared!==stored.prepared)
      return false;
    return source.libraryId===stored.libraryId&&
      source.libraryRevision===stored.libraryRevision||
      // Recovery forks intentionally detach a saved project from its Library ID.
      stored.libraryId===null&&stored.libraryRevision===null;
  }
  // Remove old tab snapshots only when their data is durably represented.
  // Never remove the current tab's synchronous backup or an unsent branch.
  function pruneSessionLocals(storage,durable,currentSessionId){
    if(!storage||typeof storage.key!=='function'||
      typeof storage.removeItem!=='function'||!Number.isSafeInteger(storage.length))return 0;
    var stored=normalizeCollection(durable),entries=stored.workspaces;
    var removed=new Map((stored.removed||[]).map(function(e){return [e.id,e.removedAt];}));
    var discarded=0,keys=[];
    try{
      for(var i=0;i<storage.length;i++){
        var key=storage.key(i);
        if(typeof key==='string'&&key.indexOf(SESSION_LOCAL_PREFIX)===0&&
          key!==SESSION_LOCAL_PREFIX+currentSessionId)keys.push(key);
      }
      keys.forEach(function(key){
        var source;
        try{source=normalizeCollection(JSON.parse(storage.getItem(key)));}catch(error){return;}
        var backed=source.workspaces.every(function(item){
          // A durable tombstone also makes a stale backup safe to discard,
          // provided that its content was saved before the deletion.
          return entries.some(function(entry){
            return entry.checkpoint.savedAt>=item.checkpoint.savedAt&&
              backedUpCheckpoint(item.checkpoint,entry.checkpoint);
          })||(removed.get(item.id)||0)>=item.checkpoint.savedAt;
        });
        var deletions=(source.removed||[]).every(function(item){
          return (removed.get(item.id)||0)>=item.removedAt;
        });
        if(backed&&deletions){storage.removeItem(key);discarded++;}
      });
    }catch(error){/* Leave recovery copies in place if browser storage denies cleanup. */}
    return discarded;
  }
  // Pure recovery merge. Tombstones outrank older workspaces, and later
  // checkpoints win for an identical ID. All unrelated drafts survive.
  function combineCollections(values){
    var sources=values.filter(Boolean).map(function(value){
      return {collection:normalizeCollection(value),sessionId:value.sessionId||null};
    });
    if(!sources.length)return null;
    var entries=new Map(),removed=new Map(),active=sources[0].collection.activeId;
    sources.sort(function(a,b){return a.collection.savedAt-b.collection.savedAt;});
    function keyForRecovery(id,session){
      var text=id+'|'+session,hash=2166136261;
      for(var i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
      return workspaceId('draft_recovered_'+(hash>>>0).toString(36));
    }
    // Gather all deletion markers first. The previous single-pass merge
    // could fork an obsolete draft before encountering its tombstone.
    sources.forEach(function(source){
      (source.collection.removed||[]).forEach(function(t){
        if(t.removedAt>(removed.get(t.id)||0))removed.set(t.id,t.removedAt);
      });
    });
    sources.forEach(function(source){
      var current=source.collection;
      active=current.activeId;
      current.workspaces.forEach(function(e){
        if((removed.get(e.id)||0)>=e.checkpoint.savedAt)return;
        var previous=entries.get(e.id);
        if(previous&&source.sessionId&&previous.sessionId&&
          source.sessionId!==previous.sessionId&&
          JSON.stringify(previous.checkpoint.draft)!==JSON.stringify(e.checkpoint.draft)){
          // Both tabs may have crashed before their IndexedDB flush. Recover
          // the older divergent branch under a stable independent draft ID.
          var recoveryId=keyForRecovery(e.id,previous.sessionId);
          var recovered=checkpoint(Object.assign({},previous.checkpoint,{
            libraryId:null,libraryRevision:null
          }),previous.checkpoint.savedAt);
          if(!entries.has(recoveryId)||
            entries.get(recoveryId).checkpoint.savedAt<recovered.savedAt)
            entries.set(recoveryId,{id:recoveryId,checkpoint:recovered,sessionId:null});
        }
        if(!previous||e.checkpoint.savedAt>previous.checkpoint.savedAt)
          entries.set(e.id,{id:e.id,checkpoint:e.checkpoint,sessionId:source.sessionId});
      });
    });
    removed.forEach(function(when,id){
      if(!entries.has(id))return; // retain the durable marker across reloads
      if(entries.get(id).checkpoint.savedAt<=when)entries.delete(id);
      else removed.delete(id); // a genuinely newer edit outranks deletion
    });
    if(!entries.size)return null;
    if(!entries.has(active))active=entries.keys().next().value;
    return normalizeCollection({version:COLLECTION_VERSION,activeId:active,
      savedAt:Math.max.apply(null,sources.map(function(s){return s.collection.savedAt;})),
      workspaces:Array.from(entries.values(),function(e){return {id:e.id,checkpoint:e.checkpoint};}),
      removed:Array.from(removed,function(t){return {id:t[0],removedAt:t[1]};})});
  }
  // An Apply session carries the draft content observed at entry. Unlike a
  // normal autosave, a no-op checkpoint must not acknowledge a newer remote
  // draft and then apply an old keyframe to the still-open editor.
  // Check inside the SAME readwrite transaction that reconciles the collection.
  // IDB writes (including legacy merges) use the same origin-wide
  // barrier. Synchronous old Web Storage fallbacks remain outside it.
  function coordinateIDB(operation){
    const locks=root.navigator?.locks;
    if(!locks)return operation();
    const barrier=typeof module==='object'&&module.exports?
      require('../storage/ModernBackupWriteBarrier'):root.CurvatureModernBackupWriteBarrier;
    if(!barrier)return Promise.reject(Error('Animation draft write barrier unavailable'));
    return barrier.create(locks).registerWriter('animation.draft').commit(operation);
  }
  function writeCollectionMerged(indexedDB,staged,baseline,crypto,unchangedDraft){
    return coordinateIDB(()=>writeCollectionMergedRaw(indexedDB,staged,baseline,crypto,unchangedDraft));
  }
  function writeCollectionMergedRaw(indexedDB,staged,baseline,crypto,unchangedDraft){
    var next=normalizeCollection(staged),before=baseline?normalizeCollection(baseline):null;
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.resolve(null);
    return new Promise(function(resolve,reject){
      var db=null,settled=false,request,result,failure=null,tx;
      function fail(error){if(settled)return;settled=true;if(db)db.close();reject(error);}
      try{request=indexedDB.open(DATABASE,1);}catch(error){fail(error);return;}
      request.onupgradeneeded=function(){if(settled){request.transaction.abort();return;}db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};
      request.onerror=function(){fail(request.error||Error('Workspace database unavailable'));};
      request.onblocked=function(){fail(Error('Workspace database blocked'));};
      request.onsuccess=function(){
        if(settled){request.result.close();return;}
        db=request.result;
        try{
          tx=db.transaction(STORE,'readwrite');var store=tx.objectStore(STORE);
          var read=store.get(COLLECTION_DB_KEY);
          read.onsuccess=function(){
            try{
              var remote=read.result==null?null:normalizeCollection(read.result);
              if(unchangedDraft){
                if(!unchangedDraft||typeof unchangedDraft.id!=='string'||
                   typeof unchangedDraft.serializedDraft!=='string')
                  throw TypeError('Invalid keyframe Apply revision guard');
                var row=remote&&remote.workspaces.find(function(item){
                  return item.id===unchangedDraft.id;});
                var prior=before&&before.workspaces.find(function(item){
                  return item.id===unchangedDraft.id;});
                if((row&&JSON.stringify(row.checkpoint.draft)!==unchangedDraft.serializedDraft)||
                   (!row&&(prior||remote&&remote.removed&&
                     remote.removed.some(function(item){return item.id===unchangedDraft.id;})))){
                  // A blocked Apply is not a writer: leave the complete remote
                  // collection and the protected drafts of other tabs intact.
                  result={collection:remote,conflicts:[],protectedDeletes:[],staleWorkspace:true};
                  return;
                }
              }
              result=reconcileCollection(next,before,remote,crypto);
              store.put(result.collection,COLLECTION_DB_KEY);
            }catch(error){failure=error;try{tx.abort();}catch(ignore){fail(error);}}
          };
          read.onerror=function(){failure=read.error||Error('Workspace read failed');};
          tx.oncomplete=function(){if(settled)return;if(failure){fail(failure);return;}settled=true;db.close();resolve(result);};
          tx.onerror=function(){failure=failure||tx.error||Error('Workspace write failed');};
          tx.onabort=function(){fail(failure||tx.error||Error('Workspace write aborted'));};
        }catch(error){
          failure=error;
          if(tx){tx.onabort=()=>fail(failure);try{tx.abort();}catch(ignore){fail(error);}}
          else fail(error);
        }
      };
    });
  }
  function withStore(indexedDB,mode,act){
    return coordinateIDB(()=>withStoreRaw(indexedDB,mode,act));
  }
  function withStoreRaw(indexedDB,mode,act){
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.resolve(null);
    return new Promise(function(resolve,reject){
      var db=null,settled=false,request;
      function fail(error){if(settled)return;settled=true;if(db)db.close();reject(error);}
      try{request=indexedDB.open(DATABASE,1);}catch(error){fail(error);return;}
      request.onupgradeneeded=function(){if(settled){request.transaction.abort();return;}db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};
      request.onerror=function(){fail(request.error||Error('Animation draft database unavailable'));};
      request.onblocked=function(){fail(Error('Animation draft database blocked'));};
      request.onsuccess=function(){
        if(settled){request.result.close();return;}
        db=request.result;
        var tx,result,failure=null;
        try{tx=db.transaction(STORE,mode);}catch(error){fail(error);return;}
        tx.oncomplete=function(){if(settled)return;if(failure){fail(failure);return;}settled=true;db.close();resolve(result?result.result:null);};
        tx.onerror=function(){failure=failure||tx.error||Error('Animation draft transaction failed');};
        tx.onabort=function(){fail(failure||tx.error||Error('Animation draft transaction aborted'));};
        try{result=act(tx.objectStore(STORE));}
        catch(error){failure=error;try{tx.abort();}catch(ignore){fail(error);}}
      };
    });
  }
  // Shared migration inventories the actual old sources, not the legacy
  // timestamp-based merged view. Read-only inspection must not create a
  // missing database or discard corrupt/unsupported evidence.
  async function readExistingLegacy(indexedDB){
    if(!indexedDB||typeof indexedDB.databases!=='function')
      throw Error('Animation legacy database inventory unavailable');
    const entries=await indexedDB.databases();
    if(!entries.some(row=>row.name===DATABASE))return {current:null,workspaces:null,
      present:{current:false,workspaces:false}};
    return new Promise((resolve,reject)=>{
      let req,db,done=false;
      function finish(error,value){
        if(done)return;done=true;if(db)db.close();
        if(error)reject(error);else resolve(value);
      }
      try{req=indexedDB.open(DATABASE,1);}catch(error){finish(error);return;}
      req.onupgradeneeded=()=>{
        try{req.transaction.abort();}catch(ignore){}
        finish(Error('Animation legacy database changed during inspection'));
      };
      req.onerror=()=>finish(req.error||Error('Animation legacy database unavailable'));
      req.onblocked=()=>finish(Error('Animation legacy database blocked'));
      req.onsuccess=()=>{
        db=req.result;if(done){db.close();return;}
        try{
          const tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE);
          const one=store.get(KEY),many=store.get(COLLECTION_DB_KEY);
          const oneKey=store.getKey(KEY),manyKey=store.getKey(COLLECTION_DB_KEY);
          tx.oncomplete=()=>finish(null,{current:one.result??null,workspaces:many.result??null,
            present:{current:oneKey.result!==undefined,workspaces:manyKey.result!==undefined}});
          tx.onabort=tx.onerror=()=>finish(tx.error||Error('Animation legacy inspection failed'));
        }catch(error){finish(error);}
      };
    });
  }
  function legacyLocalEvidence(storage){
    if(!storage||typeof storage.getItem!=='function'||typeof storage.key!=='function'||
       !Number.isSafeInteger(storage.length))
      throw Error('Animation legacy localStorage inventory unavailable');
    const keys=new Set([STORAGE_KEY,COLLECTION_KEY]);
    for(let i=0;i<storage.length;i++){
      const key=storage.key(i);
      if(typeof key==='string'&&key.startsWith(SESSION_LOCAL_PREFIX))keys.add(key);
    }
    return [...keys].sort().map(key=>({key,raw:storage.getItem(key)})).filter(item=>item.raw!==null);
  }
  function planLegacySources(remote,local){
    const sources=[],issues=[];
    function collect(source,kind,raw,serialized,present=raw!==null&&raw!==undefined){
      if(!present)return;
      try{
        const value=(kind==='collection'?normalizeCollection:normalize)(serialized?JSON.parse(raw):raw);
        sources.push({source,kind,value});
      }catch(error){
        issues.push({source,message:String(error.message||error)});
      }
    }
    collect('idb:'+COLLECTION_DB_KEY,'collection',remote.workspaces,false,remote.present?.workspaces);
    collect('idb:'+KEY,'checkpoint',remote.current,false,remote.present?.current);
    for(const entry of local)
      collect('local:'+entry.key,entry.key===STORAGE_KEY?'checkpoint':'collection',entry.raw,true);
    // Exact variants, including presentation, timestamps and associations,
    // are deliberately not collapsed by draft name or savedAt.
    const variants=[];
    for(const source of sources){
      const items=source.kind==='collection'?source.value.workspaces:
        [{id:source.value.libraryId?projectWorkspaceId(source.value.libraryId):null,checkpoint:source.value}];
      for(const item of items){
        const existing=variants.find(v=>v.id===item.id&&
          JSON.stringify(v.checkpoint)===JSON.stringify(item.checkpoint));
        if(existing)existing.sources.push(source.source);
        else variants.push({id:item.id,checkpoint:item.checkpoint,sources:[source.source]});
      }
    }
    return {sources,variants,issues};
  }
  async function inspectLegacySources(env){
    // Read local bytes before and after the async remote inventory. A
    // changed source must be inspected again, not mixed into an old plan.
    const local=legacyLocalEvidence(env?.localStorage);
    const remote=await readExistingLegacy(env?.indexedDB);
    if(JSON.stringify(local)!==JSON.stringify(legacyLocalEvidence(env.localStorage)))
      throw Error('Animation legacy local evidence changed during inspection');
    return {...planLegacySources(remote,local),evidence:{remote,local}};
  }
  // One shared domain row in the existing draft store. Legacy keys remain
  // read-only migration evidence in this preview, not a second live owner.
  const SHARED_COLLECTION_KEY='shared-workspaces-v1';
  const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function exact(value,keys){
    return object(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
  }
  function requireLease(lease,write=false){
    if(!lease||lease.sessionId!=='shared'||'tabId' in lease||
       typeof lease.check!=='function'||typeof lease.track!=='function')
      throw Error('Shared Animation lifetime required');
    lease.check(write);
  }
  function positive(value){return Number.isSafeInteger(value)&&value>0;}
  function reference(id,revision){
    if(!positive(revision))throw Error('Invalid Animation workspace revision');
    return {id:workspaceId(id),revision:'rev:'+revision,recovery:null};
  }
  function validateReference(value){
    if(!exact(value,['id','revision','recovery'])||value.recovery!==null||
       typeof value.revision!=='string'||!/^rev:[1-9][0-9]*$/.test(value.revision))
      throw Error('Invalid shared Animation reference');
    return reference(value.id,Number(value.revision.slice(4)));
  }
  function selectionBase(value){
    if(!exact(value,['revision','digest'])||!positive(value.revision)||
       value.revision>=Number.MAX_SAFE_INTEGER||typeof value.digest!=='string'||
       !/^sha256:[0-9a-f]{64}$/.test(value.digest))
      throw Error('Invalid Animation selection base');
    return {revision:value.revision,digest:value.digest};
  }
  function validateReceipt(value){
    if(!exact(value,['version','base','previous','current','status'])||
       value.version!==1||value.status!=='updated')
      throw Error('Invalid shared Animation receipt');
    const base=selectionBase(value.base),previous=validateReference(value.previous),
      current=validateReference(value.current);
    if(previous.id!==current.id||Number(previous.revision.slice(4))>=Number(current.revision.slice(4)))
      throw Error('Invalid Animation receipt transition');
    return {version:1,base,previous,current,status:'updated'};
  }
  // A downloaded recovery file is a portable checkpoint, never a replay
  // authority for another browser's session, local History or pending write.
  const MAX_SHARED_RECOVERY_LENGTH=80000000;
  function recoveryEntries(cp){return [{project:{keyframes:cp.draft.frames}}];}
  function recoveryReferenceIds(cp){
    const ids=new Set();
    for(const frame of cp.draft.frames)
      for(const id of frame.referenceImageIds||[])ids.add(id);
    return [...ids];
  }
  function canonicalRecovery(value){
    if(Array.isArray(value))return value.map(canonicalRecovery);
    if(object(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalRecovery(value[k])]));
    return value;
  }
  async function recoveryAssets(cp,records){
    const ids=recoveryReferenceIds(cp),library=getLibrary();
    if(!library)throw Error('Animation Library asset validator unavailable');
    if(!Array.isArray(records)||records.length!==ids.length||!records.length||
       records.some(record=>!record||typeof record.id!=='string')||
       new Set(records.map(record=>record.id)).size!==records.length)
      throw Error('Recovery originals must match all frame links exactly');
    const byId=new Map(records.map(record=>[record.id,record]));
    const checked=await library.collectReferences(recoveryEntries(cp),id=>{
      if(!byId.has(id))throw Error('Missing recovery original: '+id);
      return {record:byId.get(id)};
    });
    for(const record of checked)
      if(!equal(canonicalRecovery(record),canonicalRecovery(byId.get(record.id))))
        throw Error('Noncanonical recovery original');
    return checked.slice().sort((a,b)=>a.id.localeCompare(b.id));
  }
  async function prepareRecoveryImport(text,crypto){
    if(typeof text!=='string'||text.length>MAX_SHARED_RECOVERY_LENGTH)
      throw Error('Animation recovery JSON is too large or invalid');
    const envelope=JSON.parse(text);
    const bundled=envelope?.version===2;
    if(!exact(envelope,bundled?['format','version','recovery','referenceImages']:['format','version','recovery'])||
       envelope.format!=='curvature-shared-animation-recovery'||![1,2].includes(envelope.version))
      throw Error('Unsupported shared Animation recovery file');
    const recovery=envelope.recovery;
    if(!exact(recovery,['version','reference','checkpoint','receipt'])||recovery.version!==1||
       recovery.checkpoint===null)throw Error('Animation recovery contains no importable checkpoint');
    const ref=validateReference(recovery.reference),cp=normalize(recovery.checkpoint);
    // Reject lossy normalization, including unknown future fields, but do
    // not interpret JSON property ordering as a semantic change.
    if(!equal(canonicalRecovery(cp),canonicalRecovery(recovery.checkpoint)))
      throw Error('Noncanonical Animation recovery checkpoint');
    if(recovery.receipt!==null){
      const receipt=validateReceipt(recovery.receipt);
      if(!equal(receipt.previous,ref))throw Error('Animation recovery receipt does not match its reference');
    }
    const ids=recoveryReferenceIds(cp);
    if(ids.length&&!bundled)
      throw Error('Recovery contains only reference image IDs. Re-export with verified originals from the source browser; raw evidence was not imported.');
    const referenceImages=bundled?await recoveryAssets(cp,envelope.referenceImages):null;
    const source={id:ref.id,checkpoint:cp};
    if(referenceImages)source.referenceImages=referenceImages;
    const identity=await seal(source,crypto);
    // Like named portable imports, a recovery import cannot treat a
    // foreign numeric (or shipped string) History ID as a local owner.
    // Keep frame keys, experiment values and external raw evidence intact.
    const draft={...cp.draft,frames:cp.draft.frames.map(frame=>({...frame,sourceSnapshotId:null}))};
    return {id:workspaceId('draft_imported_'+identity.digest.slice(7)),
      checkpoint:normalize({...cp,draft,libraryId:null,libraryRevision:null}),
      ...(referenceImages?{referenceImages}:{})};
  }
  async function exportRecovery(recovery,getOriginal,verifyOriginal,crypto){
    const cp=normalize(recovery?.checkpoint),ids=recoveryReferenceIds(cp);
    const envelope={format:'curvature-shared-animation-recovery',version:1,recovery};
    if(ids.length){
      if(typeof getOriginal!=='function'||typeof verifyOriginal!=='function')
        throw Error('Verified recovery originals required');
      const records=await getLibrary().collectReferences(recoveryEntries(cp),getOriginal);
      for(const record of records)await verifyOriginal(record);
      envelope.version=2;envelope.referenceImages=await recoveryAssets(cp,records);
    }
    const text=JSON.stringify(envelope,null,2)+'\n';
    await prepareRecoveryImport(text,crypto);
    return text;
  }
  function remapRecoveryReferences(checkpoint,mapping){
    const cp=normalize(checkpoint);
    if(!mapping||typeof mapping.get!=='function'||typeof mapping.has!=='function')
      throw Error('Verified recovery original mapping required');
    const draft={...cp.draft,frames:cp.draft.frames.map(frame=>{
      if(!frame.referenceImageIds)return frame;
      return {...frame,referenceImageIds:frame.referenceImageIds.map(id=>{
        if(!mapping.has(id))throw Error('Unresolved recovery original: '+id);
        return mapping.get(id);
      })};
    })};
    return normalize({...cp,draft});
  }
  function documentReference(row,id){
    const item=row.revisions.find(x=>x.id===id);
    if(!item)throw Error('Animation workspace missing');
    return reference(item.id,item.revision);
  }
  function validateNamedSave(value,row){
    if(!exact(value,['version','reference','plan'])||value.version!==1)
      throw Error('Invalid shared named Animation save intent');
    const ref=validateReference(value.reference),api=getLibrary();
    if(!api)throw Error('Named Animation Library validator unavailable');
    const plan=api.validateUpdatePlan(value.plan);
    const cp=getWorkspace(row.collection,ref.id);
    if(row.receipt||!equal(documentReference(row,ref.id),ref)||!cp||
       cp.libraryId!==plan.before.id||cp.libraryRevision!==plan.before.updatedAt)
      throw Error('Named Animation save intent does not match the working checkpoint');
    return {version:1,reference:ref,plan};
  }
  // Temporary physical editing owns only a bounded recovery journal. The
  // acknowledged Scene/Compare checkpoint and Animation draft remain separate.
  function validateKeyframeEdit(value,row){
    const fields=['version','reference','base','returnView','compareSelected','session'];
    if(object(value)&&Object.hasOwn(value,'history'))fields.push('history');
    if(!exact(value,fields)||
       value.version!==1||!['library','editor','preview'].includes(value.returnView)||
       !['A','B'].includes(value.compareSelected))
      throw Error('Invalid shared keyframe edit intent');
    const ref=validateReference(value.reference),base=selectionBase(value.base),s=value.session;
    if(row.receipt||row.namedSave||!equal(documentReference(row,ref.id),ref)||
       !exact(s,['version','projectId','frameKey','mode','original','workspace','candidate','past','future'])||
       s.version!==1||s.projectId!==ref.id||!['scene','compare'].includes(s.mode)||
       !Array.isArray(s.past)||!Array.isArray(s.future)||s.past.length>30||s.future.length>30)
      throw Error('Invalid shared keyframe recovery identity or history');
    const cp=getWorkspace(row.collection,ref.id),contract=cp?.draft.contract;
    const frame=cp?.draft.frames.find(item=>item.key===s.frameKey);
    if(!contract||!['camera','physical'].includes(contract.mode)||!frame||
       frame.experiment.display.mode!==s.mode)
      throw Error('Keyframe edit requires the exact contracted working frame');
    function candidate(raw){
      const result=experiment.validate(raw);
      if(result.display.mode!==s.mode||!contracts.inspectCandidate(contract,result).allowed)
        throw Error('Keyframe recovery contains a contract-incompatible state');
      return result;
    }
    const original=candidate(s.original);
    if(!equal(original,frame.experiment))throw Error('Keyframe original changed; recovery retained');
    const session={version:1,projectId:ref.id,frameKey:frame.key,mode:s.mode,original,
      workspace:experiment.validate(s.workspace),candidate:candidate(s.candidate),
      past:s.past.map(candidate),future:s.future.map(candidate)};
    const result={version:1,reference:ref,base,returnView:value.returnView,
      compareSelected:value.compareSelected,session};
    if(Object.hasOwn(value,'history')){
      const history=value.history;
      if(!exact(history,['version','experiment'])||history.version!==1)
        throw Error('Invalid temporary keyframe History intent');
      const studio=getStudio();
      if(!studio)throw Error('Animation Studio replacement validator unavailable');
      const draft=studio.replaceFrameExperiment(cp.draft,session.frameKey,session.candidate);
      const snapshot=draft.frames.find(item=>item.key===session.frameKey).experiment;
      if(!equal(snapshot,experiment.validate(history.experiment)))
        throw Error('History intent does not match canonical keyframe');
      result.history={version:1,experiment:snapshot};
    }
    return result;
  }
  function normalizeSharedRow(raw){
    const keys=['version','revision','collection','revisions','receipt','digest'];
    if(object(raw)&&Object.hasOwn(raw,'namedSave'))keys.push('namedSave');
    if(object(raw)&&Object.hasOwn(raw,'keyframeEdit'))keys.push('keyframeEdit');
    if(!exact(raw,keys)||
       raw.version!==1||!positive(raw.revision)||!Array.isArray(raw.revisions)||
       typeof raw.digest!=='string'||!/^sha256:[0-9a-f]{64}$/.test(raw.digest))
      throw Error('Invalid shared Animation collection');
    const collection=normalizeCollection(raw.collection);
    if(!equal(raw.collection,collection)||raw.revisions.length!==collection.workspaces.length)
      throw Error('Invalid shared Animation collection payload');
    const revisions=raw.revisions.map((item,i)=>{
      if(!exact(item,['id','revision'])||item.id!==collection.workspaces[i].id||
         !positive(item.revision)||item.revision>raw.revision)
        throw Error('Invalid Animation workspace revision inventory');
      return {id:item.id,revision:item.revision};
    });
    const receipt=raw.receipt===null?null:validateReceipt(raw.receipt);
    const row={version:1,revision:raw.revision,collection,revisions,receipt};
    if(Object.hasOwn(raw,'namedSave'))row.namedSave=validateNamedSave(raw.namedSave,row);
    if(Object.hasOwn(raw,'keyframeEdit'))row.keyframeEdit=validateKeyframeEdit(raw.keyframeEdit,row);
    row.digest=raw.digest;
    if(receipt&&!equal(documentReference(row,receipt.current.id),receipt.current))
      throw Error('Animation receipt does not match durable workspace');
    if(!equal(row,raw))throw Error('Noncanonical shared Animation row');
    return row;
  }
  async function seal(data,crypto){
    if(!crypto?.subtle||typeof crypto.subtle.digest!=='function')
      throw Error('Web Crypto SHA-256 required for shared Animation');
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)));
    const digest='sha256:'+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
    return {...data,digest};
  }
  async function verifySharedRow(raw,crypto){
    const row=normalizeSharedRow(raw),{digest,...data}=row;
    if((await seal(data,crypto)).digest!==digest)
      throw Error('Shared Animation digest mismatch; evidence retained');
    return row;
  }
  function sharedTransaction(db,lease,mode,action,allowCreate=false){
    const operation=()=>sharedTransactionRaw(db,lease,mode,action,allowCreate);
    // The shared reader already opens only existing schema and must remain
    // callable under an exclusive observational lock.
    return mode==='readwrite'?coordinateIDB(operation):operation();
  }
  function sharedTransactionRaw(db,lease,mode,action,allowCreate=false){
    return new Promise((resolve,reject)=>{
      let req,connection,tx,untrack=null,finished=false,value,error;
      const write=mode==='readwrite';
      function finish(failure){
        if(finished)return;finished=true;if(untrack)untrack();if(connection)connection.close();
        if(failure)reject(failure);else resolve(value);
      }
      function abort(cause){
        error=cause;
        try{tx.abort();}catch(ignore){finish(cause);}
      }
      try{requireLease(lease,write);req=db.open(DATABASE,1);}catch(cause){finish(cause);return;}
      req.onupgradeneeded=()=>{
        try{
          requireLease(lease,write);
          if(finished||!allowCreate)throw Error('Shared Animation database changed during read');
          if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);
        }catch(cause){error=cause;try{req.transaction.abort();}catch(ignore){finish(cause);}}
      };
      req.onerror=()=>finish(error||req.error||Error('Shared Animation database unavailable'));
      req.onblocked=()=>finish(Error('Shared Animation database blocked'));
      req.onsuccess=()=>{
        connection=req.result;if(finished){connection.close();return;}
        try{
          requireLease(lease,write);tx=connection.transaction(STORE,mode);
          tx.onabort=()=>finish(error||tx.error||Error('Shared Animation transaction aborted'));
          tx.onerror=()=>{error=error||tx.error||Error('Shared Animation transaction failed');};
          tx.oncomplete=()=>{
            try{requireLease(lease,write);finish(error);}catch(cause){finish(cause);}
          };
          untrack=lease.track(tx,write);
          const store=tx.objectStore(STORE);
          const read=(key,callback)=>{
            const op=store.get(key),presence=store.getKey(key);
            presence.onsuccess=()=>{
              if(finished||error)return;
              try{requireLease(lease,write);callback(op.result,presence.result!==undefined);}catch(cause){abort(cause);}
            };
          };
          action(store,read,v=>{value=v;});
        }catch(cause){if(tx)abort(cause);else finish(cause);}
      };
    });
  }
  // Bounded observational read for the Image Library, including the ordinary
  // route. Reuse the verified reader without acquiring a document selection
  // or granting a mutation capability.
  async function inspectSharedCollection(db,crypto){
    const lease=Object.freeze({sessionId:'shared',
      check(write=false){if(write)throw Error('Shared Animation inspection is read-only');},
      track(_tx,write=false){if(write)throw Error('Shared Animation inspection is read-only');return ()=>{};}
    });
    return openSharedCollection(db,{lease,crypto}).read();
  }
  function openSharedCollection(db,options={}){
    const {lease,crypto}=options;
    requireLease(lease);
    // Inject only a managed backend. All transition builders, validators,
    // journals and digest computation remain the single existing contract.
    let managed=null;
    if(Object.hasOwn(options,'managedResources')){
      if(typeof options.managedResources?.createAnimationWorkingPort!=='function')
        throw Error('Explicit managed Animation working port required');
      managed=options.managedResources.createAnimationWorkingPort(db,lease);
    }
    if(!db||typeof db.databases!=='function')throw Error('Shared Animation inventory unavailable');
    let observed,loaded=false,busy=false;
    async function fetch(){
      requireLease(lease);
      if(managed)return (await managed.read())??undefined;
      const all=await db.databases();requireLease(lease);
      const existing=all.find(x=>x.name===DATABASE);
      if(!existing)return undefined;
      if(existing.version!==1)throw Error('Unsupported Animation database version');
      return sharedTransaction(db,lease,'readonly',(_store,read,finish)=>read(SHARED_COLLECTION_KEY,(raw,present)=>{
        if(present&&raw===undefined)throw Error('Invalid shared Animation collection; evidence retained');
        finish(raw);
      }));
    }
    async function read(){
      if(busy)throw Error('Shared Animation operation pending');
      busy=true;loaded=false;observed=undefined;
      try{
        const raw=await fetch();
        const row=raw===undefined?null:await verifySharedRow(raw,crypto);
        requireLease(lease);observed=row;loaded=true;
        return row===null?null:JSON.parse(JSON.stringify(row));
      }finally{busy=false;}
    }
    async function commit(expected,build,guard=()=>true,legacy=null){
      if(busy||!loaded||!equal(observed,expected))
        throw Error('Read exact shared Animation row before write');
      const prior=observed;
      const check=()=>{
        requireLease(lease,true);
        if(guard()!==true)throw Error('Stale shared Animation operation');
      };
      busy=true;loaded=false;observed=undefined;
      try{
        check();
        const data=build(prior),row=await seal(data,crypto);check();
        await verifySharedRow(row,crypto);check();
        if(managed){
          if(legacy)throw Error('Managed Animation legacy adoption requires coordinated cutover');
          await managed.commit(prior,row,check);
        }else await sharedTransaction(db,lease,'readwrite',(store,read,finish)=>{
          read(SHARED_COLLECTION_KEY,(raw,present)=>{
            if(present!==(prior!==null)||!equal(present?raw:null,prior))
              throw Error('Shared Animation collection CAS conflict; evidence retained');
            function put(){
              check();
              if(legacy&&!equal(legacy.local,legacyLocalEvidence(legacy.storage)))
                throw Error('Animation legacy local evidence changed during adoption');
              store.put(row,SHARED_COLLECTION_KEY);finish(row);
            }
            if(legacy){
              read(KEY,(one,onePresent)=>read(COLLECTION_DB_KEY,(many,manyPresent)=>{
                if(onePresent!==legacy.remote.present.current||manyPresent!==legacy.remote.present.workspaces||
                   !equal(one??null,legacy.remote.current)||!equal(many??null,legacy.remote.workspaces))
                  throw Error('Animation legacy IndexedDB evidence changed during adoption');
                put();
              }));
            }else put();
          });
        },prior===null);
        const saved=await fetch(),verified=await verifySharedRow(saved,crypto);check();
        if(!equal(verified,row))throw Error('Shared Animation readback conflict');
        observed=verified;loaded=true;return JSON.parse(JSON.stringify(verified));
      }finally{busy=false;}
    }
    function initial(collection){
      const normalized=normalizeCollection(collection);
      return {version:1,revision:1,collection:normalized,
        revisions:normalized.workspaces.map(item=>({id:item.id,revision:1})),receipt:null};
    }
    function initializeManaged(collection,guard){
      if(!managed)throw Error('Explicit managed Animation backend required');
      return commit(null,()=>initial(collection),guard);
    }
    function adoption(plan,storage){
      if(managed)throw Error('Managed Animation legacy adoption requires coordinated cutover');
      if(!plan?.evidence)throw Error('Explicit Animation source inventory required');
      // Capture the evidence at invocation, not a mutable caller-owned plan.
      const {remote,local}=structuredClone(plan.evidence);
      if(!exact(remote,['current','workspaces','present'])||!exact(remote.present,['current','workspaces'])||
         typeof remote.present.current!=='boolean'||typeof remote.present.workspaces!=='boolean')
        throw Error('Exact Animation legacy record presence required');
      const checked=planLegacySources(remote,local);
      if(checked.issues.length)throw Error('Invalid Animation migration evidence; resolve or export it first');
      if(!equal(local,legacyLocalEvidence(storage)))
        throw Error('Animation legacy local evidence changed during adoption');
      return {checked,legacy:{remote,local,storage}};
    }
    function initializeFromLegacy(plan,source,storage,guard){
      const {checked,legacy}=adoption(plan,storage);
      const selected=checked.sources.find(item=>item.source===source);
      if(!selected)throw Error('Select an exact Animation legacy source');
      const value=selected.kind==='collection'?selected.value:migrate(selected.value,crypto);
      return commit(null,()=>initial(value),guard,legacy);
    }
    function initializeEmpty(plan,value,storage,guard){
      const {checked,legacy}=adoption(plan,storage);
      if(checked.sources.length)throw Error('Animation legacy sources require explicit adoption');
      return commit(null,()=>initial(value),guard,legacy);
    }
    function nextRevision(row){
      if(!row||row.revision>=Number.MAX_SAFE_INTEGER)throw Error('Shared Animation revision exhausted');
      if(row.receipt)throw Error('Resolve pending Animation selection receipt before writing');
      if(row.namedSave)throw Error('Resolve pending named Animation save before writing');
      if(row.keyframeEdit)throw Error('Resolve pending temporary keyframe edit before writing');
      return row.revision+1;
    }
    // An explicitly chosen alternative becomes an independent working
    // draft. Its stable ID makes the same historical variant non-repeatable,
    // even after editing or removing the recovered document.
    async function adoptLegacyVariant(expected,plan,choice,storage,guard){
      if(!choice||!exact(choice,['id','checkpoint','source'])||typeof choice.source!=='string')
        throw Error('Select an exact Animation legacy variant');
      const {checked,legacy}=adoption(plan,storage);
      const wanted=normalize(choice.checkpoint);
      const candidate=checked.variants.find(item=>item.id===choice.id&&
        item.sources.includes(choice.source)&&equal(item.checkpoint,wanted));
      if(!candidate)throw Error('Animation legacy variant changed or missing');
      const identity=await seal({id:candidate.id,checkpoint:candidate.checkpoint},crypto);
      const id=workspaceId('draft_recovered_'+identity.digest.slice(7));
      const cp=normalize({...candidate.checkpoint,libraryId:null,libraryRevision:null});
      return commit(expected,row=>{
        const revision=nextRevision(row);
        if(row.collection.workspaces.some(item=>item.id===id)||
           (row.collection.removed||[]).some(item=>item.id===id))
          throw Error('Animation legacy variant was already recovered; no duplicate created');
        if(candidate.id!==null&&row.collection.workspaces.some(item=>
            item.id===candidate.id&&equal(item.checkpoint,candidate.checkpoint)))
          throw Error('Animation legacy variant is already represented by the original workspace');
        const next=withWorkspace(row.collection,id,cp);
        const collection=normalizeCollection({...next,activeId:row.collection.activeId});
        return {version:1,revision,collection,revisions:collection.workspaces.map(item=>
          ({id:item.id,revision:item.id===id?revision:
            row.revisions.find(x=>x.id===item.id).revision})),receipt:null};
      },guard,legacy);
    }
    function createDraft(expected,id,checkpoint,guard){
      workspaceId(id);
      const cp=normalize(checkpoint);
      if(!id.startsWith('draft_')||cp.libraryId!==null)
        throw Error('New Animation draft must be independent');
      return commit(expected,row=>{
        const revision=nextRevision(row);
        if(row.collection.workspaces.some(item=>item.id===id)||
           (row.collection.removed||[]).some(item=>item.id===id))
          throw Error('Animation draft identity is already used');
        const next=withWorkspace(row.collection,id,cp);
        const collection=normalizeCollection({...next,activeId:row.collection.activeId});
        return {version:1,revision,collection,revisions:collection.workspaces.map(item=>
          ({id:item.id,revision:item.id===id?revision:
            row.revisions.find(x=>x.id===item.id).revision})),receipt:null};
      },guard);
    }
    // Only explicitly inspected, inactive independent drafts may be removed.
    // The caller owns the shared document-operation lock and verifies the
    // current session reference; neither the named store nor the session is
    // changed by this single collection CAS.
    function removeInactiveDrafts(expected,refs,selected,guard){
      return removeInactiveWorkspaces(expected,refs,selected,guard,null);
    }
    // A linked copy is a separate explicitly confirmed operation. The
    // managed adapter also checks the exact named and physical owner inventories.
    function removeInactiveLinkedWorkspace(expected,ref,selected,libraryId,libraryRevision,guard){
      if(!managed||!Number.isSafeInteger(libraryRevision)||libraryRevision<=0)
        throw Error('Exact managed named Animation revision required');
      return removeInactiveWorkspaces(expected,[ref],selected,guard,
        {id:libraryId,revision:libraryRevision,workspace:projectWorkspaceId(libraryId)});
    }
    function removeInactiveWorkspaces(expected,refs,selected,guard,linked){
      const keep=validateReference(selected);
      if(!Array.isArray(refs)||!refs.length)throw Error('Exact inactive Animation draft references required');
      const wanted=refs.map(validateReference),ids=new Set(wanted.map(ref=>ref.id));
      if(ids.size!==wanted.length||ids.has(keep.id)||wanted.some(ref=>
        linked?ref.id!==linked.workspace:!ref.id.startsWith('draft_')))
        throw Error(linked?'Only the inspected inactive linked working copy may be discarded':
          'Only inactive independent Animation drafts may be deleted');
      return commit(expected,row=>{
        const revision=nextRevision(row);
        if(!equal(documentReference(row,keep.id),keep))
          throw Error('Selected Animation revision changed');
        for(const ref of wanted){
          if(!equal(documentReference(row,ref.id),ref))
            throw Error('Inactive Animation draft revision changed');
          const cp=getWorkspace(row.collection,ref.id);
          if(linked){
            if(!cp||cp.libraryId!==linked.id||cp.libraryRevision!==linked.revision)
              throw Error('Linked working copy no longer matches the inspected saved revision');
          }else if(!cp||cp.libraryId!==null)throw Error('Only independent Animation drafts may be deleted');
        }
        const when=Math.max(Date.now(),row.collection.savedAt+1,
          ...row.collection.workspaces.map(item=>item.checkpoint.savedAt+1));
        const collection=normalizeCollection({...row.collection,savedAt:when,
          activeId:ids.has(row.collection.activeId)?keep.id:row.collection.activeId,
          workspaces:row.collection.workspaces.filter(item=>!ids.has(item.id)),
          removed:[...(row.collection.removed||[]),...wanted.map(ref=>({id:ref.id,removedAt:when}))]});
        return {version:1,revision,collection,
          revisions:row.revisions.filter(item=>!ids.has(item.id)),receipt:null};
      },guard);
    }
    // The caller verifies the exact named Library record under the shared
    // operation lock. This creates only a working checkpoint, never mutates
    // the named owner or implicitly switches the session.
    function createLinkedWorkspace(expected,checkpoint,guard){
      const cp=normalize(checkpoint);
      if(cp.libraryId===null)throw Error('Named Animation revision required');
      const id=projectWorkspaceId(cp.libraryId);
      return commit(expected,row=>{
        const revision=nextRevision(row);
        if(row.collection.workspaces.some(item=>item.id===id))
          throw Error('Named Animation working copy already exists');
        // Explicitly reopening a saved project may replace an old deletion
        // marker; its new monotonic revision cannot match a stale reference.
        const next=withWorkspace(row.collection,id,cp);
        const collection=normalizeCollection({...next,activeId:row.collection.activeId});
        return {version:1,revision,collection,revisions:collection.workspaces.map(item=>
          ({id:item.id,revision:item.id===id?revision:
            row.revisions.find(x=>x.id===item.id).revision})),receipt:null};
      },guard);
    }
    // The shared row stores an exact write-ahead intent without changing
    // any workspace revision or the shared session reference. Ordinary draft
    // writes cannot discard or overwrite it. Old rows without an intent
    // retain their original shape and digest.
    function stageNamedSave(expected,ref,plan,guard){
      return commit(expected,row=>{
        const revision=nextRevision(row);
        const namedSave=validateNamedSave({version:1,reference:ref,plan},row);
        return {version:1,revision,collection:row.collection,revisions:row.revisions,
          receipt:null,namedSave};
      },guard);
    }
    // The caller must have read back the exact named target under the shared
    // operation lock. Convert the intent to the existing selection receipt
    // atomically with relinking only the checkpoint's Library revision.
    function finishNamedSave(expected,intent,confirmed,base,guard){
      const bound=selectionBase(base);
      return commit(expected,row=>{
        if(!row?.namedSave||!equal(row.namedSave,intent)||
           !equal(intent.plan.after,confirmed))
          throw Error('Exact named Animation save readback required');
        if(row.revision>=Number.MAX_SAFE_INTEGER)throw Error('Shared Animation revision exhausted');
        const previous=intent.reference,revision=row.revision+1;
        const prior=getWorkspace(row.collection,previous.id);
        const value=normalize({...prior,savedAt:prior.savedAt+1,
          libraryRevision:intent.plan.after.updatedAt});
        const next=withWorkspace(row.collection,previous.id,value,value.savedAt);
        const collection=normalizeCollection({...next,activeId:row.collection.activeId});
        const current=reference(previous.id,revision);
        return {version:1,revision,collection,revisions:collection.workspaces.map(item=>
          ({id:item.id,revision:item.id===previous.id?revision:
            row.revisions.find(x=>x.id===item.id).revision})),
          receipt:{version:1,base:bound,previous,current,status:'updated'}};
      },guard);
    }
    // Explicit abandonment is a metadata-only operation. The caller may
    // export the intent first; no named record or checkpoint is rolled back.
    function abandonNamedSave(expected,intent,guard){
      return commit(expected,row=>{
        if(!row?.namedSave||!equal(row.namedSave,intent))
          throw Error('Named Animation save intent changed; evidence retained');
        if(row.revision>=Number.MAX_SAFE_INTEGER)throw Error('Shared Animation revision exhausted');
        return {version:1,revision:row.revision+1,collection:row.collection,
          revisions:row.revisions,receipt:null};
      },guard);
    }
    function stageKeyframeEdit(expected,intent,guard){
      return commit(expected,row=>{
        const revision=nextRevision(row),keyframeEdit=validateKeyframeEdit(intent,row);
        return {version:1,revision,collection:row.collection,revisions:row.revisions,
          receipt:null,keyframeEdit};
      },guard);
    }
    function pendingKeyframeRevision(row,intent){
      if(!row?.keyframeEdit||!equal(row.keyframeEdit,intent))
        throw Error('Temporary keyframe edit changed; recovery retained');
      if(row.revision>=Number.MAX_SAFE_INTEGER)throw Error('Shared Animation revision exhausted');
      return row.revision+1;
    }
    function updateKeyframeEdit(expected,intent,session,compareSelected,guard){
      return commit(expected,row=>{
        const revision=pendingKeyframeRevision(row,intent);
        if(intent.history)throw Error('Resolve pending keyframe History intent before editing');
        const keyframeEdit=validateKeyframeEdit({...intent,session,compareSelected},row);
        const before=intent.session,after=keyframeEdit.session;
        if(before.frameKey!==after.frameKey||!equal(before.original,after.original)||
           !equal(before.workspace,after.workspace))
          throw Error('Temporary keyframe edit origin changed; recovery retained');
        return {version:1,revision,collection:row.collection,revisions:row.revisions,
          receipt:null,keyframeEdit};
      },guard);
    }
    function cancelKeyframeEdit(expected,intent,guard){
      return commit(expected,row=>({version:1,revision:pendingKeyframeRevision(row,intent),
        collection:row.collection,revisions:row.revisions,receipt:null}),guard);
    }
    // Stage the exact canonical frame before a separate History transaction.
    // Once staged it cannot be edited or applied without the requested link.
    function stageKeyframeHistory(expected,intent,base,guard){
      const bound=selectionBase(base);
      return commit(expected,row=>{
        const revision=pendingKeyframeRevision(row,intent);
        if(intent.history||!equal(bound,intent.base))
          throw Error('Cannot stage History for a changed temporary keyframe or session');
        const cp=getWorkspace(row.collection,intent.reference.id),s=intent.session,studio=getStudio();
        if(!studio)throw Error('Animation Studio replacement validator unavailable');
        const draft=studio.replaceFrameExperiment(cp.draft,s.frameKey,s.candidate);
        const snapshot=draft.frames.find(item=>item.key===s.frameKey).experiment;
        const keyframeEdit=validateKeyframeEdit({...intent,history:{version:1,experiment:snapshot}},row);
        return {version:1,revision,collection:row.collection,revisions:row.revisions,receipt:null,keyframeEdit};
      },guard);
    }
    function historyMatch(a,b){
      // History's established exact signature ignores only the A/B editor
      // selection. Both physical models and every authored field must agree.
      const left=experiment.validate(a),right=experiment.validate(b);
      left.compare.selected='A';right.compare.selected='A';
      return equal(left,right);
    }
    // Applying a temporary edit and removing its journal are one domain CAS.
    // Only the existing canonical Studio replacement may generate frame bytes.
    // The original shared session checkpoint must still be the captured base.
    function applyKeyframeEdit(expected,intent,base,guard){
      return applyKeyframe(expected,intent,base,null,guard);
    }
    function applyKeyframeEditWithHistory(expected,intent,base,confirmed,guard){
      if(!confirmed||!Number.isSafeInteger(confirmed.id)||confirmed.id<1||confirmed.pinned!==true||
         !intent?.history||!historyMatch(confirmed.experiment,intent.history.experiment))
        throw Error('Exact pinned History readback required for temporary keyframe');
      return applyKeyframe(expected,intent,base,confirmed.id,guard);
    }
    function applyKeyframe(expected,intent,base,historyId,guard){
      const bound=selectionBase(base);
      return commit(expected,row=>{
        const revision=pendingKeyframeRevision(row,intent);
        if(!equal(bound,intent.base))throw Error('Shared session changed during keyframe edit');
        if(!!intent.history!==(historyId!==null))
          throw Error('Resolve pending keyframe History intent before Apply');
        const previous=intent.reference,prior=getWorkspace(row.collection,previous.id),s=intent.session;
        const studio=getStudio();
        if(!studio)throw Error('Animation Studio replacement validator unavailable');
        let draft=studio.replaceFrameExperiment(prior.draft,s.frameKey,s.candidate);
        if(historyId!==null)draft=studio.attachFrameHistory(draft,s.frameKey,historyId,intent.history.experiment);
        const value=normalize({...prior,draft,savedAt:prior.savedAt+1,
          selectedKey:s.frameKey,prepared:false,positionMs:0});
        if(equal(value.draft,prior.draft))
          return {version:1,revision,collection:row.collection,revisions:row.revisions,receipt:null};
        const next=withWorkspace(row.collection,previous.id,value,value.savedAt);
        const collection=normalizeCollection({...next,activeId:row.collection.activeId});
        const current=reference(previous.id,revision);
        return {version:1,revision,collection,revisions:collection.workspaces.map(item=>
          ({id:item.id,revision:item.id===previous.id?revision:
            row.revisions.find(x=>x.id===item.id).revision})),
          receipt:{version:1,base:bound,previous,current,status:'updated'}};
      },guard);
    }
    function saveSelected(expected,ref,checkpoint,base,guard){
      const previous=validateReference(ref),bound=selectionBase(base),value=normalize(checkpoint);
      return commit(expected,row=>{
        const revision=nextRevision(row);
        if(!equal(documentReference(row,previous.id),previous))
          throw Error('Animation selected revision changed');
        const prior=getWorkspace(row.collection,previous.id);
        if(value.savedAt<=prior.savedAt)throw Error('Animation checkpoint timestamp must advance');
        const next=withWorkspace(row.collection,previous.id,value,value.savedAt);
        // The shared envelope, not the historical collection activeId,
        // owns navigation. Save must not alter that compatibility field.
        const collection=normalizeCollection({...next,activeId:row.collection.activeId});
        const current=reference(previous.id,revision);
        return {version:1,revision,collection,revisions:collection.workspaces.map(item=>
          ({id:item.id,revision:item.id===previous.id?revision:
            row.revisions.find(x=>x.id===item.id).revision})),
          receipt:{version:1,base:bound,previous,current,status:'updated'}};
      },guard);
    }
    function retire(expected,receipt,guard){
      const acknowledged=validateReceipt(receipt);
      return commit(expected,row=>{
        if(!row||!equal(row.receipt,acknowledged)||
           !equal(documentReference(row,acknowledged.current.id),acknowledged.current))
          throw Error('Animation selection receipt changed; evidence retained');
        if(row.revision>=Number.MAX_SAFE_INTEGER)throw Error('Shared Animation revision exhausted');
        return {version:1,revision:row.revision+1,collection:row.collection,
          revisions:row.revisions,receipt:null};
      },guard);
    }
    async function prepareReference(ref){
      const expected=validateReference(ref),row=await read();
      if(!row||!equal(documentReference(row,expected.id),expected))
        throw Error('Animation workspace revision changed; activation blocked');
      return {reference:expected,checkpoint:getWorkspace(row.collection,expected.id)};
    }
    return Object.freeze({read,initializeFromLegacy,initializeEmpty,adoptLegacyVariant,createDraft,removeInactiveDrafts,createLinkedWorkspace,stageNamedSave,finishNamedSave,abandonNamedSave,stageKeyframeEdit,updateKeyframeEdit,cancelKeyframeEdit,stageKeyframeHistory,applyKeyframeEdit,applyKeyframeEditWithHistory,saveSelected,retire,prepareReference,
      ...(managed?{storageKind:'managed',initializeManaged,removeInactiveLinkedWorkspace}:{})});
  }
  function read(indexedDB){return withStore(indexedDB,'readonly',function(store){return store.get(KEY);})
    .then(function(record){return record===null||record===undefined?null:normalize(record);});}
  function write(indexedDB,record){var valid=normalize(record);
    return withStore(indexedDB,'readwrite',function(store){store.put(valid,KEY);return null;});}
  function readCollection(indexedDB){
    return withStore(indexedDB,'readonly',function(store){return store.get(COLLECTION_DB_KEY);})
      .then(function(value){return value==null?null:normalizeCollection(value);});
  }
  function writeCollection(indexedDB,value){var valid=normalizeCollection(value);
    return withStore(indexedDB,'readwrite',function(store){
      store.put(valid,COLLECTION_DB_KEY);return null;
    });
  }
  return Object.freeze({VERSION:VERSION,STORAGE_KEY:STORAGE_KEY,DATABASE:DATABASE,STORE:STORE,
    COLLECTION_VERSION:COLLECTION_VERSION,COLLECTION_KEY:COLLECTION_KEY,
    checkpoint:checkpoint,normalize:normalize,readLocal:readLocal,writeLocal:writeLocal,
    newer:newer,read:read,write:write,workspaceId:workspaceId,
    makeWorkspaceId:makeWorkspaceId,projectWorkspaceId:projectWorkspaceId,
    normalizeCollection:normalizeCollection,collection:collection,
    withWorkspace:withWorkspace,withoutWorkspace:withoutWorkspace,
    withoutDrafts:withoutDrafts,
    restoreSavedProject:restoreSavedProject,
    getWorkspace:getWorkspace,readCollectionLocal:readCollectionLocal,
    writeCollectionLocal:writeCollectionLocal,readCollection:readCollection,
    writeCollection:writeCollection,migrate:migrate,newerCollection:newerCollection,
    reconcileCollection:reconcileCollection,writeCollectionMerged:writeCollectionMerged,
    writeSessionLocal:writeSessionLocal,readSessionLocals:readSessionLocals,
    combineCollections:combineCollections,pruneSessionLocals:pruneSessionLocals,
    SESSION_LOCAL_PREFIX:SESSION_LOCAL_PREFIX,workspaceSessionId:workspaceSessionId,
    inspectLegacySources,planLegacySources,SHARED_COLLECTION_KEY,openSharedCollection,inspectSharedCollection,documentReference,
    MAX_SHARED_RECOVERY_LENGTH,prepareRecoveryImport,exportRecovery,remapRecoveryReferences,recoveryReferenceIds,
    normalizeSharedRow,verifySharedRow});
}));
