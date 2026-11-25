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
    var uses=[],seen=new Map(),target=identityKey(selectedIdentity);
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
    // A calibration origin is historical evidence, not an attached image ID.
    // Report it separately, even if the same frame also attaches this image.
    function origin(experiment,ownerId,title,revision,source,frame,index,content){
      if(!target||identityKey(experiment?.calibrationOrigin?.photo)!==target)return;
      add({type:'experiment-provenance',ownerId,title,revision,source,
        frameIndex:index===undefined?null:index+1,
        frameKey:frame?.key||null,frameName:frame?.name||null,
        draftContent:content||''});
    }
    function projectOrigins(project,id,revision,source){
      var title=project.name||id;
      origin(project.baseExperiment,id,title,revision,source+' · base experiment');
      (project.keyframes||[]).forEach((frame,index)=>{
        // Only Experimental values contain full portable experiments.
        if(project.mode==='experimental')
          origin(frame.value,id,title,revision,source+' · frame provenance',frame,index);
      });
    }
    function draftOrigins(draft,id,revision,source){
      var content=JSON.stringify(draft);
      (draft.frames||[]).forEach((frame,index)=>{
        origin(frame.experiment,id,draft.name||id,revision,source+' · frame provenance',frame,index,content);
      });
    }
    (sources.physical||[]).forEach(row=>{
      origin(row.experiment,'physical:'+row.key,row.title,row.revision,row.key);
    });
    // Current-tab Undo/Redo and unresolved edits can retain originals
    // after a frame has been unlinked. These are not navigation authorities.
    (sources.liveEvidence?.drafts||[]).forEach(row=>{
      var draft=row.draft,content=JSON.stringify(draft);
      imagesFromFrames(draft.frames,selectedId,'live-recovery',row.id,
        draft.name||row.id,null,row.source).forEach(use=>{use.draftContent=content;add(use);});
      draftOrigins(draft,row.id,null,row.source);
    });
    (sources.liveEvidence?.physical||[]).forEach(row=>{
      origin(row.experiment,'live-editor:'+row.key,row.title,null,row.key);
    });
    (sources.legacyHistory||[]).forEach(row=>{
      origin(row.experiment,'legacy-library:'+row.name,row.name,null,'retained legacy Library evidence');
    });
    (sources.history||[]).forEach(row=>{
      origin(row.experiment,'history:'+row.id,row.name||'Snapshot '+row.id,null,'History snapshot '+row.id);
    });
    (sources.animations||[]).forEach(function(row){
      if(!row||!row.project)return;
      imagesFromFrames(row.project.keyframes,selectedId,'animation',row.id,
        row.project.name||row.id,row.updatedAt,'saved').forEach(add);
      projectOrigins(row.project,row.id,row.updatedAt,'saved Animation');
    });
    (sources.drafts||[]).forEach(function(row){
      if(!row||!row.checkpoint||!row.checkpoint.draft)return;
      var draft=row.checkpoint.draft;
      var content=JSON.stringify(draft);
      imagesFromFrames(draft.frames,selectedId,'draft',row.id,
        draft.name||row.id,row.checkpoint.savedAt,row.source||'recoverable')
        .forEach(function(use){use.draftContent=content;add(use);});
      draftOrigins(draft,row.id,row.checkpoint.savedAt,row.source||'recoverable');
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
        draftOrigins(draft,row.id,'rev:'+shared.revisions[index].revision,'shared checkpoint');
      });
      // An interrupted named save owns both exact versions until it is
      // resolved; neither can be inferred solely from the current Library.
      if(shared.namedSave){
        ['before','after'].forEach(function(side){
          var row=shared.namedSave.plan[side];
          imagesFromFrames(row.project.keyframes,selectedId,'animation-intent',row.id,
            row.project.name||row.id,row.updatedAt,'pending Save Changes · '+side)
            .forEach(add);
          projectOrigins(row.project,row.id,row.updatedAt,'pending Save Changes · '+side);
        });
      }
      if(shared.keyframeEdit){
        var edit=shared.keyframeEdit,session=edit.session;
        var owner=session.projectId,revision=edit.reference.revision;
        var title='Temporary keyframe edit '+session.frameKey;
        ['original','workspace','candidate'].forEach(side=>{
          origin(session[side],owner,title,revision,'temporary edit · '+side);
        });
        ['past','future'].forEach(side=>{
          session[side].forEach((snapshot,index)=>{
            origin(snapshot,owner,title,revision,'temporary edit · '+side+' '+(index+1));
          });
        });
        if(edit.history)origin(edit.history.experiment,owner,title,revision,'temporary edit · pending History');
      }
    }
    if(sources.legacyKeyframe){
      const {draft,session}=sources.legacyKeyframe,owner='legacy-keyframe:'+session.projectId,
        title=draft.name||'Legacy keyframe recovery';
      imagesFromFrames(draft.frames,selectedId,'keyframe-recovery',owner,title,null,'retained temporary editor')
        .forEach(add);
      draftOrigins(draft,owner,null,'legacy temporary edit entry draft');
      ['original','workspace','candidate'].forEach(side=>origin(session[side],owner,title,null,'legacy temporary edit · '+side));
      ['past','future'].forEach(side=>session[side].forEach((snapshot,index)=>
        origin(snapshot,owner,title,null,'legacy temporary edit · '+side+' '+(index+1))));
    }
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
    if(target&&identityKey(sources.legacyCalibration?.identity)===target)
      add({type:'calibration-recovery',ownerId:'legacy-calibration-active',
        title:sources.legacyCalibration.title||'Standalone Calibration draft',
        revision:null,source:'legacy standalone recovery'});
    if(sources.currentCalibration&&sources.currentCalibration.referenceImageId===selectedId)
      add({type:'calibration-draft',ownerId:sources.currentCalibration.projectId||'current',
        title:'Current Calibration working session',revision:null,source:'current'});
    if(sources.currentStudio&&sources.currentStudio.draft&&sources.currentStudioWorkspaceId){
      var draftContent=JSON.stringify(sources.currentStudio.draft);
      imagesFromFrames(sources.currentStudio.draft.frames,selectedId,'draft',
        sources.currentStudioWorkspaceId,
        sources.currentStudio.draft.name||'Current Storyboard',sources.currentStudio.savedAt,
        'current').forEach(function(use){use.draftContent=draftContent;add(use);});
      draftOrigins(sources.currentStudio.draft,sources.currentStudioWorkspaceId,sources.currentStudio.savedAt,'current');
    }
    uses.sort(function(a,b){
      var groups=['animation','animation-intent','calibration','archive','draft','calibration-draft','calibration-recovery','keyframe-recovery','live-recovery','experiment-provenance'];
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
      note:'Known uses in accessible local projects, local archived Calibration results, History and recovery snapshots only. Foreign browsers, external exports, removed records and inaccessible tabs are not covered; never authorize deletion from this list.'};
  }
  // Read only the current tab's retained legacy editor evidence. It is not
  // a shared selection key and must not be restored implicitly or consumed.
  function inspectLegacyKeyframe(env){
    const raw=env.sessionStorage.getItem('curvature-modern-keyframe-edit-recovery-v1');
    if(raw===null)return null;
    if(typeof raw!=='string'||raw.length>3000000)throw Error('Invalid legacy temporary editor recovery size');
    const saved=JSON.parse(raw),session=saved?.session;
    if(saved?.version!==1||typeof saved.draftAtEntry!=='string'||session?.version!==1||
       typeof session.projectId!=='string'||!session.projectId||
       typeof session.frameKey!=='string'||!session.frameKey||
       !['scene','compare'].includes(session.mode)||
       !Array.isArray(session.past)||!Array.isArray(session.future)||
       session.past.length>30||session.future.length>30)
      throw Error('Invalid legacy temporary editor recovery');
    const draft=env.CurvatureModernAnimationDraftAutosave.checkpoint({
      draft:JSON.parse(saved.draftAtEntry),selectedKey:null,quality:'auto',prepared:false,positionMs:0},1).draft;
    const codec=env.CurvatureModernExperimentState;
    const frame=draft.frames.find(item=>item.key===session.frameKey);
    const original=codec.validate(session.original);
    if(!frame||JSON.stringify(frame.experiment)!==JSON.stringify(original)||
       original.display.mode!==session.mode)
      throw Error('Legacy temporary editor original does not match entry draft');
    const candidate=value=>{
      const experiment=codec.validate(value);
      if(experiment.display.mode!==session.mode)throw Error('Invalid legacy temporary editor mode');
      return experiment;
    };
    return {draft,session:{projectId:session.projectId,frameKey:session.frameKey,original,
      workspace:codec.validate(session.workspace),candidate:candidate(session.candidate),
      past:session.past.map(candidate),future:session.future.map(candidate)}};
  }
  async function discover(env,row){
    var failures=[],sources={animations:[],calibrations:[],archives:[],drafts:[]};
    async function read(name,fn,set){try{set(await fn());}
      catch(error){failures.push(name+': '+(error&&error.message||String(error)));}}
    var db=env.indexedDB;
    await Promise.all([
      read('Physical experiment provenance',()=>env.CurvatureModernSessionAutosave.inspectProvenance(db,{
        storage:env.localStorage,codec:env.CurvatureModernExperimentState,
        crypto:env.crypto,contract:env.CurvatureModernDocumentSession}),inventory=>{
        sources.physical=inventory.entries;
        inventory.issues.forEach(issue=>failures.push('Physical experiment provenance: '+issue));
      }),
      read('Legacy named Library evidence',()=>env.CurvatureModernExperimentLibrary.read(env.localStorage),v=>{sources.legacyHistory=v;}),
      read('Legacy temporary keyframe recovery',()=>inspectLegacyKeyframe(env),v=>{sources.legacyKeyframe=v;}),
      read('History provenance',()=>env.CurvatureModernExperimentHistory.inspectProvenance(db),inventory=>{
        sources.history=inventory.entries;
        inventory.issues.forEach(issue=>failures.push('History provenance: '+issue));
      }),
      read('Animation Library',function(){return env.CurvatureModernAnimationLibrary.inspectUsage(db);},v=>{sources.animations=v;}),
      read('Calibration Projects and legacy draft',function(){return env.CurvatureModernCalibrationProjectStore.inspectUsage(db);},
        v=>{sources.calibrations=v.projects;sources.rawLegacyCalibration=v.legacy;}),
      read('Calibration result archive',function(){return env.CurvatureModernCalibrationResultArchive.inspectUsage(db);},v=>{sources.archives=v;}),
      read('Shared Animation recovery',function(){
        return env.CurvatureModernAnimationDraftAutosave.inspectSharedCollection(db,env.crypto);
      },v=>{sources.sharedAnimation=v;}),
      read('Legacy Animation recovery',function(){
        return env.CurvatureModernAnimationDraftAutosave.inspectLegacySources(env);
      },inventory=>{
        inventory.issues.forEach(issue=>failures.push('Legacy Animation '+issue.source+': '+issue.message));
        var all=[];
        // Keep the established collection navigation contract, but never
        // treat a V1 standalone checkpoint as a loaded workspace.
        inventory.sources.forEach(source=>{
          var collection=source.kind==='collection';
          var remote=source.source.startsWith('idb:');
          var items=collection?source.value.workspaces:
            [{id:'legacy-single:'+source.source,checkpoint:source.value}];
          items.forEach(item=>{
            if(!all.some(existing=>existing.id===item.id&&
              JSON.stringify(existing.checkpoint.draft)===JSON.stringify(item.checkpoint.draft)))
              all.push({...item,source:collection?(remote?'recoverable':'recoverable local backup'):'legacy single draft'});
          });
        });
        sources.drafts=all;
      })
    ]);
    // Standalone Calibration owns its own original bytes, not the Library
    // alias alone. Keep reporting it after adoption; check retained inline
    // evidence separately and never interpret it as a new editable project.
    if(sources.rawLegacyCalibration){
      await read('Legacy Calibration original',async()=>{
        var raw=sources.rawLegacyCalibration;
        if(!raw.record)return null;
        return {identity:await env.CurvatureModernReferenceImageImport.identify(raw.record,env),
          title:raw.record.title||'Standalone Calibration draft'};
      },v=>{sources.legacyCalibration=v;});
      await read('Legacy Calibration recovery',async()=>{
        var migration=env.CurvatureModernCalibrationProjectMigration;
        var draft=migration.normalizeLegacy(sources.rawLegacyCalibration);
        migration.matchingInline(env.localStorage,draft);
        return true;
      },()=>{});
    }
    await read('Legacy Calibration inline evidence',async()=>{
      var key='curvature-calibration-inline-v2',raw=env.localStorage.getItem(key);
      if(raw===null)return;
      var inline=JSON.parse(raw),draft=sources.rawLegacyCalibration;
      if(!inline||typeof inline!=='object'||Array.isArray(inline)||
         !draft||inline.id!==(draft.physicalSessionId??draft.magnifierSessionId)||
         inline.photo!==(draft.record?.id||null))
        throw Error('Unbound legacy inline evidence; raw recovery retained');
    },()=>{});
    try{
      sources.currentStudio=env.CurvatureModernApp?.getBuiltInDemo?.()?null:
        env.CurvatureModernApp?.getAnimationStudioDraft?.()||null;
      sources.currentStudioWorkspaceId=env.CurvatureModernApp?.getAnimationStudioWorkspaceId?.()||null;
      if(sources.currentStudio&&!sources.currentStudioWorkspaceId)
        failures.push('Current Storyboard workspace identity unavailable');
    }catch(error){failures.push('Current Storyboard: '+error.message);}
    if(env.CurvatureModernApp)await read('Live Animation recovery and Undo/Redo',()=>{
      const evidence=env.CurvatureModernApp.getImageUsageEvidence();
      if(!evidence||!Array.isArray(evidence.drafts)||!Array.isArray(evidence.physical)||
         evidence.drafts.some(row=>!row||!Array.isArray(row.draft?.frames)||
           typeof row.id!=='string'||typeof row.source!=='string')||
         evidence.physical.some(row=>!row||typeof row.key!=='string'||!row.experiment))
        throw Error('Invalid live recovery evidence');
      return evidence;
    },value=>{sources.liveEvidence=value;});
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
    if(!source||typeof source.inspectOriginal!=='function')
      issues.push('Original store unavailable for revision recheck');
    else{
      try{before=await source.inspectOriginal(env.indexedDB,selected.id);}
      catch(error){issues.push('Original read failed: '+(error.message||error));}
      if(!before)issues.push('Original missing or inaccessible; refresh Image Library');
      else{
        try{report=await discover(env,before);}
        catch(error){issues.push('Usage scan failed: '+(error.message||error));}
        try{after=await source.inspectOriginal(env.indexedDB,selected.id);}
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
    inspectLegacyKeyframe, deletionReview:deletionReview});
}));