/* Read-only, bounded usage discovery for shared reference images.
 * Never use the result as proof that deleting an original is safe.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernImageUsageGraph=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function identityKey(value){
    if(!value||value.version!==1||typeof value.sha256!=='string'||
      !/^[0-9a-f]{64}$/.test(value.sha256)||
      !Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)||
      value.width<1||value.height<1)return null;
    return value.sha256+':'+value.width+'x'+value.height;
  }
  function imagesFromFrames(frames,id,ownerType,ownerId,title,revision,where){
    if(!Array.isArray(frames))return [];
    var found=[];
    frames.forEach(function(frame,index){
      if(!frame||!Array.isArray(frame.referenceImageIds))return;
      var keys=new Set(frame.referenceImageIds);
      if(!keys.has(id))return;
      found.push({type:ownerType,ownerId:ownerId,title:title,
        frameKey:frame.key||null,frameIndex:index+1,
        frameName:frame.name||'Frame '+(index+1),revision:revision,
        source:where});
    });
    return found;
  }
  // Shipped demo aliases have their own namespace. A matching bare string ID
  // is never evidence that a local original participates in a shipped frame.
  function demoReferences(demo,imageId){
    if(!demo||!demo.project||!Array.isArray(demo.referenceImages)||
       !demo.referenceImages.some(function(image){return image&&image.id===imageId;}))
      return [];
    return imagesFromFrames(demo.project.keyframes,imageId,'demo','demo_'+demo.id,
      demo.project.name||demo.id,null,'shipped');
  }
  function collect(selectedId,selectedIdentity,sources){
    if(typeof selectedId!=='string'||!selectedId)throw TypeError('Selected original ID required');
    sources=sources||{};
    var uses=[],seen=new Map();
    function add(use){
      // Distinct snapshots can share an ID AND timestamp across tabs.
      // The dedup key identifies a relation; the draft contents distinguish
      // divergent checkpoints even when their savedAt values coincide.
      var key=JSON.stringify([use.type,use.ownerId,use.frameIndex??null,
        use.frameKey??null,use.source,use.revision??null]);
      if(!seen.has(key))seen.set(key,new Set());
      var variants=seen.get(key),content=use.draftContent||'';
      if(!variants.has(content)){variants.add(content);uses.push(use);}
    }
    (sources.animations||[]).forEach(function(row){
      if(!row||!row.project)return;
      imagesFromFrames(row.project.keyframes,selectedId,'animation',row.id,
        row.project.name||row.id,row.updatedAt,'saved').forEach(add);
    });
    (sources.drafts||[]).forEach(function(row){
      if(!row||!row.checkpoint||!row.checkpoint.draft)return;
      var draft=row.checkpoint.draft;
      var content=JSON.stringify(draft);
      imagesFromFrames(draft.frames,selectedId,'draft',row.id,
        draft.name||row.id,row.checkpoint.savedAt,row.source||'recoverable')
        .forEach(function(use){use.draftContent=content;add(use);});
    });
    // The verified shared row is independent of the old recovery collection.
    // Its durable revision is not a legacy savedAt timestamp or a navigation
    // authority. Keep it visible even if the same draft exists in legacy data.
    var shared=sources.sharedAnimation;
    if(shared){
      shared.collection.workspaces.forEach(function(row,index){
        var draft=row.checkpoint.draft;
        imagesFromFrames(draft.frames,selectedId,'draft',row.id,
          draft.name||row.id,'rev:'+shared.revisions[index].revision,'shared checkpoint')
          .forEach(function(use){use.draftContent=JSON.stringify(draft);add(use);});
      });
      // An interrupted named save owns both exact versions until it is
      // resolved; neither can be inferred solely from the current Library.
      if(shared.namedSave){
        ['before','after'].forEach(function(side){
          var row=shared.namedSave.plan[side];
          imagesFromFrames(row.project.keyframes,selectedId,'animation-intent',row.id,
            row.project.name||row.id,row.updatedAt,'pending Save Changes · '+side)
            .forEach(add);
        });
      }
    }
    var target=identityKey(selectedIdentity);
    if(target){
      (sources.calibrations||[]).forEach(function(row){
        if(row&&identityKey(row.photo)===target)add({type:'calibration',ownerId:row.id,
          title:row.title||row.id,revision:row.revision,source:'saved'});
      });
      // Immutable calibration results live in a different IndexedDB store
      // and may outlive their owning project. Do not alias them by project ID.
      (sources.archives||[]).forEach(function(row){
        if(row&&identityKey(row.photo)===target)add({type:'archive',ownerId:row.id,
          title:'Calibration result '+row.id.slice(-12),revision:null,source:'archived'});
      });
    }
    if(sources.currentCalibration&&sources.currentCalibration.referenceImageId===selectedId)
      add({type:'calibration-draft',ownerId:sources.currentCalibration.projectId||'current',
        title:'Current Calibration working session',revision:null,source:'current'});
    if(sources.currentStudio&&sources.currentStudio.draft&&sources.currentStudioWorkspaceId){
      var draftContent=JSON.stringify(sources.currentStudio.draft);
      imagesFromFrames(sources.currentStudio.draft.frames,selectedId,'draft',
        sources.currentStudioWorkspaceId,
        sources.currentStudio.draft.name||'Current Storyboard',sources.currentStudio.savedAt,
        'current').forEach(function(use){use.draftContent=draftContent;add(use);});
    }
    uses.sort(function(a,b){
      var groups=['animation','animation-intent','calibration','archive','draft','calibration-draft'];
      return groups.indexOf(a.type)-groups.indexOf(b.type)||
        a.title.localeCompare(b.title)||a.frameIndex-b.frameIndex;
    });
    return uses;
  }
  // An inventory relation is not a selection authority. Validate the exact
  // checkpoint revision, whole draft and referenced frame again at opening.
  function resolveSharedDraft(row,use,imageId){
    if(!row||row.receipt||row.namedSave||row.keyframeEdit)
      throw Error('Resolve shared Animation recovery before opening a use');
    if(use?.type!=='draft'||use.source!=='shared checkpoint'||typeof imageId!=='string'||!imageId||
       !Number.isSafeInteger(use.frameIndex)||use.frameIndex<1)
      throw Error('Verified shared draft use required');
    var revision=row.revisions.find(item=>item.id===use.ownerId);
    var owner=row.collection.workspaces.find(item=>item.id===use.ownerId);
    var draft=owner?.checkpoint?.draft;
    if(!revision||'rev:'+revision.revision!==use.revision||!draft||
       JSON.stringify(draft)!==use.draftContent)
      throw Error('Shared Animation draft changed since usage inspection; refresh Where used?');
    var frame=draft.frames[use.frameIndex-1];
    if(!frame||frame.key!==use.frameKey||!frame.referenceImageIds?.includes(imageId))
      throw Error('Referenced shared frame changed; refresh Where used?');
    return {reference:{id:owner.id,revision:use.revision,recovery:null},frameKey:frame.key};
  }
  function report(selectedId,selectedIdentity,sources,failures){
    var uses=collect(selectedId,selectedIdentity,sources),unavailable=(failures||[]).slice();
    return {uses:uses,count:uses.length,complete:unavailable.length===0,
      unavailable:unavailable,
      note:'Known uses in accessible local projects, local archived Calibration results and recovery snapshots only. Foreign browsers, external exports, removed records and inaccessible tabs are not covered; never authorize deletion from this list.'};
  }
  async function discover(env,row){
    var failures=[],sources={animations:[],calibrations:[],archives:[],drafts:[]};
    async function read(name,fn,set){try{set(await fn());}
      catch(error){failures.push(name+': '+(error&&error.message||String(error)));}}
    var db=env.indexedDB;
    await Promise.all([
      read('Animation Library',function(){return env.CurvatureModernAnimationLibrary.list(db);},v=>{sources.animations=v;}),
      read('Calibration Projects',function(){return env.CurvatureModernCalibrationProjectStore.list(db);},v=>{sources.calibrations=v;}),
      read('Calibration result archive',function(){return env.CurvatureModernCalibrationResultArchive.list(db);},v=>{sources.archives=v;}),
      read('Shared Animation recovery',function(){
        return env.CurvatureModernAnimationDraftAutosave.inspectSharedCollection(db,env.crypto);
      },v=>{sources.sharedAnimation=v;}),
      read('Recoverable Storyboards',function(){return env.CurvatureModernAnimationDraftAutosave.readCollection(db);},
        v=>{sources.drafts=v?v.workspaces.map(function(w){return {...w,source:'recoverable'};}):[];})
    ]);
    try{
      var autosave=env.CurvatureModernAnimationDraftAutosave,storage=env.localStorage;
      if(autosave){
        if(!storage||typeof storage.getItem!=='function'||typeof storage.key!=='function')
          throw Error('Browser localStorage unavailable; session backups cannot be inspected');
        var local=autosave.readCollectionLocal(storage);
        // Recovery helpers intentionally skip corrupt backups so the app can
        // load. The usage inspector must not turn skipped records into a
        // misleading statement of complete coverage.
        if(storage.getItem(autosave.COLLECTION_KEY)!==null&&!local)
          failures.push('Local workspace recovery: unreadable collection backup');
        var sessions=autosave.readSessionLocals(storage),slots=0;
        if(!Number.isSafeInteger(storage.length))throw Error('Cannot enumerate local recovery backups');
        for(var si=0;si<storage.length;si++){
          var backupKey=storage.key(si);
          if(typeof backupKey==='string'&&
             backupKey.startsWith(autosave.SESSION_LOCAL_PREFIX))slots++;
        }
        if(slots>sessions.length)
          failures.push('Local workspace recovery: '+(slots-sessions.length)+
            ' unreadable session backup'+(slots-sessions.length===1?'':'s'));
        var all=[...sources.drafts];
        [local,...sessions].filter(Boolean).forEach(function(collection){
          collection.workspaces.forEach(function(item){
            // A second same-ID checkpoint is not necessarily identical; count
            // both if the draft content differs instead of silently dropping it.
            if(!all.some(function(existing){return existing.id===item.id&&
              JSON.stringify(existing.checkpoint.draft)===JSON.stringify(item.checkpoint.draft);}))
              all.push({...item,source:'recoverable local backup'});
          });
        });
        sources.drafts=all;
      }else failures.push('Local workspace recovery: backup reader unavailable');
    }catch(error){failures.push('Local workspace recovery: '+error.message);}
    try{
      sources.currentStudio=env.CurvatureModernApp?.getAnimationStudioDraft?.()||null;
      sources.currentStudioWorkspaceId=env.CurvatureModernApp?.getAnimationStudioWorkspaceId?.()||null;
      if(sources.currentStudio&&!sources.currentStudioWorkspaceId)
        failures.push('Current Storyboard workspace identity unavailable');
    }catch(error){failures.push('Current Storyboard: '+error.message);}
    try{
      var calibration=env.CurvatureModernPhotoCalibrationEditor?.mount?.(env.document);
      var current=calibration?.snapshot?.(),binding=calibration?.projectBinding?.();
      if(current)sources.currentCalibration={referenceImageId:current.referenceImageId,
        projectId:binding?.projectId||null};
    }catch(error){failures.push('Current Calibration: '+error.message);}
    var identity=null;
    try{identity=await env.CurvatureModernReferenceImageImport.identify(row.record,env);}
    catch(error){failures.push('Original identity: '+error.message);}
    if(!identity)failures.push('Original identity unavailable; Calibration matches were not checked');
    return report(row.id,identity,sources,failures);
  }
  // Deletion review is explicitly informational and read-only. Independent
  // IDB databases, foreign tabs' Undo buffers and portable exports cannot
  // participate in the Image Library transaction. Even a second zero-use
  // scan can never issue a physical-delete authorization.
  async function deletionReview(env,selected){
    if(!selected||typeof selected.id!=='string'||!selected.id)
      throw TypeError('Select an original photograph before checking deletion');
    var source=env.CurvatureModernReferenceImageLibrary,issues=[],report=null,
      before=null,after=null;
    if(!source||typeof source.get!=='function')
      issues.push('Original store unavailable for revision recheck');
    else{
      try{before=await source.get(env.indexedDB,selected.id);}
      catch(error){issues.push('Original read failed: '+(error.message||error));}
      if(!before)issues.push('Original missing or inaccessible; refresh Image Library');
      else{
        try{report=await discover(env,before);}
        catch(error){issues.push('Usage scan failed: '+(error.message||error));}
        try{after=await source.get(env.indexedDB,selected.id);}
        catch(error){issues.push('Original recheck failed: '+(error.message||error));}
        if(!after||before.revision!==selected.revision||
           after.revision!==before.revision)
          issues.push('Original changed during inspection; refresh Image Library');
      }
    }
    if(report){
      if(report.count)issues.push(report.count+' known linked use'+
        (report.count===1?'':'s')+' must be preserved');
      if(!report.complete)issues.push('Some sources could not be checked: '+
        report.unavailable.join('; '));
    }
    issues.push('Deletion is disabled: cross-database writes, unsaved Undo/recovery in other tabs and external backups cannot be atomically excluded');
    return {safe:false,knownUses:report?report.count:null,
      localScanComplete:!!report&&report.complete&&!!before&&!!after&&
        before.revision===selected.revision&&after.revision===before.revision,
      reasons:issues,unavailable:report?report.unavailable.slice():[]};
  }
  return Object.freeze({identityKey:identityKey,imagesFromFrames:imagesFromFrames,
    demoReferences:demoReferences,collect:collect,resolveSharedDraft,report:report,discover:discover,
    deletionReview:deletionReview});
}));