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
  function collect(selectedId,selectedIdentity,sources){
    if(typeof selectedId!=='string'||!selectedId)throw TypeError('Selected original ID required');
    sources=sources||{};
    var uses=[],seen=new Set();
    function add(use){
      var key=[use.type,use.ownerId,use.frameKey||'',use.source].join('|');
      if(!seen.has(key)){seen.add(key);uses.push(use);}
    }
    (sources.animations||[]).forEach(function(row){
      if(!row||!row.project)return;
      imagesFromFrames(row.project.keyframes,selectedId,'animation',row.id,
        row.project.name||row.id,row.updatedAt,'saved').forEach(add);
    });
    (sources.drafts||[]).forEach(function(row){
      if(!row||!row.checkpoint||!row.checkpoint.draft)return;
      var draft=row.checkpoint.draft;
      imagesFromFrames(draft.frames,selectedId,'draft',row.id,
        draft.name||row.id,row.checkpoint.savedAt,row.source||'recoverable').forEach(add);
    });
    var target=identityKey(selectedIdentity);
    if(target)(sources.calibrations||[]).forEach(function(row){
      if(row&&identityKey(row.photo)===target)add({type:'calibration',ownerId:row.id,
        title:row.title||row.id,revision:row.revision,source:'saved'});
    });
    if(sources.currentCalibration&&sources.currentCalibration.referenceImageId===selectedId)
      add({type:'calibration-draft',ownerId:sources.currentCalibration.projectId||'current',
        title:'Current Calibration working session',revision:null,source:'current'});
    if(sources.currentStudio&&sources.currentStudio.draft){
      imagesFromFrames(sources.currentStudio.draft.frames,selectedId,'draft',
        sources.currentStudio.libraryId?'project_'+sources.currentStudio.libraryId:'current',
        sources.currentStudio.draft.name||'Current Storyboard',sources.currentStudio.savedAt,
        'current').forEach(add);
    }
    uses.sort(function(a,b){
      var groups=['animation','calibration','draft','calibration-draft'];
      return groups.indexOf(a.type)-groups.indexOf(b.type)||
        a.title.localeCompare(b.title)||a.frameIndex-b.frameIndex;
    });
    return uses;
  }
  function report(selectedId,selectedIdentity,sources,failures){
    var uses=collect(selectedId,selectedIdentity,sources),unavailable=(failures||[]).slice();
    return {uses:uses,count:uses.length,complete:unavailable.length===0,
      unavailable:unavailable,
      note:'Known uses in accessible local records only. Other browsers, removed projects, archives and inaccessible tabs are not included; never authorize deletion from this list.'};
  }
  async function discover(env,row){
    var failures=[],sources={animations:[],calibrations:[],drafts:[]};
    async function read(name,fn,set){try{set(await fn());}
      catch(error){failures.push(name+': '+(error&&error.message||String(error)));}}
    var db=env.indexedDB;
    await Promise.all([
      read('Animation Library',function(){return env.CurvatureModernAnimationLibrary.list(db);},v=>{sources.animations=v;}),
      read('Calibration Projects',function(){return env.CurvatureModernCalibrationProjectStore.list(db);},v=>{sources.calibrations=v;}),
      read('Recoverable Storyboards',function(){return env.CurvatureModernAnimationDraftAutosave.readCollection(db);},
        v=>{sources.drafts=v?v.workspaces.map(function(w){return {...w,source:'recoverable'};}):[];})
    ]);
    try{
      var autosave=env.CurvatureModernAnimationDraftAutosave;
      if(autosave){
        var local=autosave.readCollectionLocal(env.localStorage);
        var sessions=autosave.readSessionLocals(env.localStorage);
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
      }
    }catch(error){failures.push('Local workspace recovery: '+error.message);}
    try{sources.currentStudio=env.CurvatureModernApp?.getAnimationStudioDraft?.()||null;}
    catch(error){failures.push('Current Storyboard: '+error.message);}
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
  return Object.freeze({identityKey:identityKey,imagesFromFrames:imagesFromFrames,
    collect:collect,report:report,discover:discover});
}));