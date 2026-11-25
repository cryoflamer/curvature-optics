/* Durable, explicitly saved Modern Animation Projects. Unlike the autosaved
 * working draft, named projects own their base experiment and keyframe values.
 * Revision checks prevent an older browser tab from silently overwriting work.
 */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject;
  var thumbnails=root.CurvatureModernExperimentThumbnail;
  var compatibility=root.CurvatureModernAnimationCompatibility;
  if(typeof module==='object'&&module.exports){
    projects=require('./ModernAnimationProject');
    thumbnails=require('../ui/modern/ModernExperimentThumbnail');
    compatibility=require('./ModernAnimationCompatibility');
  }
  var images=typeof module==='object'&&module.exports?require('./ModernReferenceImage'):root.CurvatureModernReferenceImage;
  var api=factory(projects,thumbnails,compatibility,images);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationLibrary=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,thumbnails,compatibility,images){
  'use strict';
  var VERSION=1,DATABASE='curvature-modern-animation-library',STORE='projects';
  var PORTABLE_FORMAT='curvature-modern-animations',PORTABLE_VERSION=1;
  var MAX_PORTABLE_ITEMS=200,MAX_PORTABLE_LENGTH=80000000;
  function validId(id){
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id))
      throw RangeError('Invalid animation library ID');
    return id;
  }
  function quality(value){
    if(!['auto','accurate','fast','effective-radius','canvas-direct'].includes(value))throw RangeError('Invalid animation library optics');
    return value;
  }
  function stamp(value){
    if(!Number.isSafeInteger(value)||value<=0)throw RangeError('Invalid animation library timestamp');
    return value;
  }
  function cover(value){
    if(value==null)return null;
    if(typeof value!=='string'||value.length>750000||
      !/^data:image\/(png|webp|jpeg);base64,[a-z\d+/=]+$/i.test(value))
      throw RangeError('Invalid animation cover');
    return value;
  }
  function withCover(record,value){
    var image=cover(value);if(image!==null)record.cover=image;return record;
  }
  function normalize(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==VERSION)
      throw RangeError('Unsupported animation library record');
    var project=projects.validate(value.project),id=validId(value.id);
    if(project.id!==id)throw RangeError('Animation library ID does not match project');
    var createdAt=stamp(value.createdAt),updatedAt=stamp(value.updatedAt);
    if(updatedAt<createdAt)throw RangeError('Invalid animation library revision');
    // Optional preview is a saved screenshot, never a synthesized render.
    // Old records without it remain compatible.
    return withCover({version:VERSION,id:id,createdAt:createdAt,updatedAt:updatedAt,
      quality:quality(value.quality),project:project,
      thumbnail:thumbnails.validate(value.thumbnail||null,project.baseExperiment.display.mode)},value.cover);
  }
  function makeId(crypto,now){
    var token=crypto&&typeof crypto.randomUUID==='function'?crypto.randomUUID().replace(/-/g,''):
      Math.floor(Math.random()*0x100000000).toString(36)+Math.floor(Math.random()*0x100000000).toString(36);
    return validId('animation_'+(now||Date.now()).toString(36)+'_'+token);
  }
  // Semantic identity: the complete animation, NOT its title, browser ID,
  // source History IDs, screenshot, optics preference, or current playback time.
  // The existing compatibility normalizer removes inactive physical controls.
  // Camera pose lives in keyframe values for camera-motion projects, so the
  // otherwise irrelevant base camera is excluded only in that mode.
  function fingerprint(project){
    var p=projects.validate(project),fixed=compatibility.effective(p.baseExperiment);
    var reference=p.version===projects.VERSION_V2?
      compatibility.effective(p.contract.referenceExperiment):null;
    // The animated channel lives in keyframe values, not in the contract's
    // reference pose/value. References with different initial values but the
    // same fixed environment and the same keyframes render the same movie.
    function omitAnimatedChannel(e){
      if(p.mode==='camera'){delete e.camera;return;}
      if(p.mode==='physical'){
        var keys=compatibility.targetPath(p.target).split('.'),owner=e;
        for(var i=0;i<keys.length-1;i++)owner=owner[keys[i]];
        delete owner[keys[keys.length-1]];
      }
    }
    omitAnimatedChannel(fixed);
    if(reference)omitAnimatedChannel(reference);
    // Playback interpolation changes the rendered trajectory even when all
    // keyframes, timing and physical endpoints are identical. Old projects
    // without the optional v1 field are semantically equivalent to Linear.
    return JSON.stringify({mode:p.mode,target:p.target,
      // V2 contracts are semantic data; Experimental owns whole scenes rather
      // than scalar or camera-pose values. Source IDs remain provenance only.
      contract:reference?{mode:p.contract.mode,target:p.contract.target,
        reference:reference}:null,
      interpolation:p.interpolation||'linear',fixed:fixed,
      keyframes:p.keyframes.map(function(frame){
        var item={value:frame.value,travelMs:frame.travelMs,holdMs:frame.holdMs,easing:frame.easing};
        // A distinct authored narrative must not be discarded by import deduplication.
        if(frame.narrativeTitle)item.narrativeTitle=frame.narrativeTitle;
        if(frame.description)item.description=frame.description;
        // Keep projects citing different evidence distinct during import deduplication.
        if(frame.referenceImageIds)item.referenceImageIds=frame.referenceImageIds;
        return item;
      })});
  }
  // Portable files own complete projects (including all keyframe physics).
  // Browser-local record IDs are only source provenance: importing always
  // assigns fresh IDs, so a file cannot overwrite existing named animations.
  function portableItem(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).some(function(key){return ![
        'project','quality','thumbnail','createdAt','updatedAt','cover','keyframeThumbnails'].includes(key);}))
      throw RangeError('Invalid portable animation entry');
    var project=projects.validate(value.project);
    var createdAt=value.createdAt==null?null:stamp(value.createdAt);
    var updatedAt=value.updatedAt==null?null:stamp(value.updatedAt);
    if((createdAt===null)!==(updatedAt===null)||
      (createdAt!==null&&updatedAt<createdAt))
      throw RangeError('Invalid portable animation timestamps');
    var result=withCover({project:project,quality:quality(value.quality),
      thumbnail:thumbnails.validate(value.thumbnail||null,project.baseExperiment.display.mode),
      createdAt:createdAt,updatedAt:updatedAt},value.cover);
    if(value.keyframeThumbnails!==undefined){
      var items=value.keyframeThumbnails,seen=new Set(),chars=0;
      if(!Array.isArray(items)||items.length>project.keyframes.length)throw RangeError('Invalid keyframe thumbnails');
      var frames=projects.frameExperiments(project);
      result.keyframeThumbnails=items.map(function(item){
        if(!item||Object.keys(item).sort().join(',')!=='image,index'||!Number.isInteger(item.index)||
           item.index<0||item.index>=frames.length||seen.has(item.index))throw RangeError('Invalid keyframe thumbnail index');
        seen.add(item.index);
        var image=thumbnails.validate(item.image,frames[item.index].display.mode);
        if(!image||(chars+=image.dataUrl.length)>12000000)throw RangeError('Invalid or oversized keyframe thumbnails');
        return {index:item.index,image:image};
      });
    }
    return result;
  }
  function keyframeImages(project,lookup,complete){
    if(typeof lookup!=='function')return undefined;
    var images=[],chars=0;
    projects.frameExperiments(project).forEach(function(experiment,index){
      var image=lookup(experiment);
      if(image&&chars+image.dataUrl.length<=12000000){chars+=image.dataUrl.length;images.push({index:index,image:image});}
      else if(complete)throw RangeError('Complete storyboard unavailable at keyframe '+(index+1));
    });
    return images.length?images:undefined;
  }
  function referenceIds(entries){
    var ids=new Set();entries.forEach(function(entry){entry.project.keyframes.forEach(function(frame){
      (frame.referenceImageIds||[]).forEach(function(id){ids.add(id);});
    });});return Array.from(ids);
  }
  function checkedAssets(entries,assets){
    var ids=referenceIds(entries);
    if(!Array.isArray(assets)||assets.length>100)throw RangeError('Invalid portable reference assets');
    var records=images.validateCollection(assets),byId=new Map(records.map(function(record){return [record.id,record];}));
    if(ids.length!==records.length||ids.some(function(id){return !byId.has(id);}))
      throw RangeError('Portable reference assets must match all keyframe links exactly');
    if(JSON.stringify(records).length>64*1024*1024)throw RangeError('Portable reference assets exceed limit');
    return records;
  }
  // A missing original is an export error, not permission to strip evidence.
  async function collectReferences(entries,get){
    var ids=referenceIds(entries),records=[];
    for(var id of ids){
      var row=await get(id);
      if(!row||!row.record||row.record.id!==id)throw Error('Missing reference photograph: '+id);
      records.push(row.record);
    }
    return checkedAssets(entries,records);
  }
  function remapReferences(entry,mapping){
    var project=projects.validate(Object.assign({},entry.project,{keyframes:entry.project.keyframes.map(function(frame){
      if(!frame.referenceImageIds)return frame;
      return Object.assign({},frame,{referenceImageIds:frame.referenceImageIds.map(function(id){
        if(!mapping.has(id))throw Error('Unresolved reference photograph: '+id);return mapping.get(id);
      })});
    })}));return Object.assign({},entry,{project:project});
  }
  function exportPortable(entries,lookup,options){
    if(options&&options.complete&&typeof lookup!=='function')throw RangeError('Complete storyboard lookup required');
    if(!Array.isArray(entries)||!entries.length||entries.length>MAX_PORTABLE_ITEMS)
      throw RangeError('Select 1–'+MAX_PORTABLE_ITEMS+' animations to export');
    var animations=entries.map(function(entry){
      var normalized=normalize(entry);
      return portableItem({project:normalized.project,quality:normalized.quality,
        thumbnail:normalized.thumbnail,cover:normalized.cover,createdAt:normalized.createdAt,
        updatedAt:normalized.updatedAt,keyframeThumbnails:keyframeImages(normalized.project,lookup,options&&options.complete)});
    });
    var payload={format:PORTABLE_FORMAT,version:PORTABLE_VERSION,animations:animations};
    if(referenceIds(animations).length){
      payload.version=2;payload.referenceImages=checkedAssets(animations,options&&options.referenceImages);
    }else if(options&&options.referenceImages&&options.referenceImages.length)throw RangeError('Unreferenced portable assets');
    var result=JSON.stringify(payload,null,2)+'\n';
    if(result.length>MAX_PORTABLE_LENGTH)throw RangeError('Animation JSON export is too large');
    return result;
  }
  function parseBundle(text){
    if(typeof text!=='string'||text.length>MAX_PORTABLE_LENGTH)
      throw RangeError('Animation JSON file too large');
    var value=JSON.parse(text);
    // Accept standalone validated v1 or v2 Animation Projects for convenient
    // interoperability; a portable bundle is the canonical export format.
    if(value&&(value.version===projects.VERSION||value.version===projects.VERSION_V2)&&
      Array.isArray(value.keyframes)&&value.baseExperiment)
      return {animations:[portableItem({project:value,quality:'auto'})],referenceImages:[]};
    if(!value||typeof value!=='object'||Array.isArray(value)||
      value.format!==PORTABLE_FORMAT||![1,2].includes(value.version)||
      Object.keys(value).sort().join(',')!==(value.version===2?'animations,format,referenceImages,version':'animations,format,version')||
      !Array.isArray(value.animations)||!value.animations.length||
      value.animations.length>MAX_PORTABLE_ITEMS)
      throw RangeError('Unsupported animation JSON format');
    var entries=value.animations.map(portableItem);
    return {animations:entries,referenceImages:value.version===2?checkedAssets(entries,value.referenceImages):[]};
  }
  function parsePortable(text){
    var bundle=parseBundle(text);
    if(bundle.referenceImages.length)throw Error('Reference bundle requires parseBundle');
    return bundle.animations;
  }
  // A single IndexedDB transaction checks all existing projects and adds
  // new ones. Duplicate animations, including repetitions inside the file,
  // are reused by content; neither their metadata nor the active draft changes.
  function importEntries(indexedDB,items,now,crypto){
    if(!Array.isArray(items)||!items.length||items.length>MAX_PORTABLE_ITEMS)
      throw RangeError('Import needs 1–'+MAX_PORTABLE_ITEMS+' animations');
    var incoming=items.map(portableItem); // all validation BEFORE storage writes
    var time=stamp(now||Date.now());
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      var read=store.getAll();
      read.onsuccess=function(){try{
        var current=(read.result||[]).map(normalize),seen=new Map();
        var ids=new Set(),created=[],reused=[];
        current.forEach(function(entry){
          ids.add(entry.id);var key=fingerprint(entry.project);
          if(!seen.has(key))seen.set(key,entry.id);
        });
        incoming.forEach(function(item,index){
          var key=fingerprint(item.project),existingId=seen.get(key);
          if(existingId){reused.push(existingId);return;}
          var id,attempt=0;
          do{
            id=makeId(crypto,time+index+attempt);
            if(++attempt>100)throw Error('Cannot allocate a unique animation ID');
          }while(ids.has(id));
          ids.add(id);seen.set(key,id);
          // History IDs are browser-local and can point at unrelated scenes
          // on the destination machine. Clear provenance to prevent Studio
          // from presenting someone else's screenshot as an imported frame.
          var project=projects.validate(Object.assign({},item.project,{id:id,
            keyframes:item.project.keyframes.map(function(frame){
              return Object.assign({},frame,{sourceSnapshotId:null});
            })}));
          var createdAt=item.createdAt===null?time:item.createdAt;
          var updatedAt=item.updatedAt===null?time:item.updatedAt;
          var entry=record(project,item.quality,id,createdAt,updatedAt,item.thumbnail,item.cover);
          store.add(entry);created.push(entry);
        });
        finish({created:created.length,reused:reused.length,
          createdIds:created.map(function(entry){return entry.id;}),reusedIds:reused});
      }catch(error){abort(error);}};
    });
  }
  function findDuplicates(entries){
    var buckets=new Map();
    (entries||[]).forEach(function(entry){
      var normalized=normalize(entry),key=fingerprint(normalized.project);
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(normalized);
    });
    return Array.from(buckets.values()).filter(function(group){return group.length>1;});
  }
  function duplicateError(existing){
    var error=Error('Identical animation already saved: '+existing.project.name);
    error.code='ANIMATION_DUPLICATE';
    error.existingId=existing.id;
    error.existingName=existing.project.name;
    return error;
  }
  // A V2 reference experiment is NOT necessarily the first animation frame.
  // Thumbnails depict the first playable keyframe, not the immutable reference.
  // Comparing only baseExperiment would retain stale pictures after a camera
  // move, or after removing/replacing the first frame of a V2 project.
  function thumbnailMatchesFirstFrame(project,experiment){
    if(!project||!Array.isArray(project.keyframes)||!project.keyframes.length)return false;
    return JSON.stringify(projects.frameExperiment(project,0))===JSON.stringify(experiment);
  }
  function sameFirstFrame(a,b){
    return !!(a&&b&&Array.isArray(a.keyframes)&&a.keyframes.length&&
      Array.isArray(b.keyframes)&&b.keyframes.length&&
      thumbnailMatchesFirstFrame(a,projects.frameExperiment(b,0)));
  }
  function record(project,optics,id,createdAt,updatedAt,thumbnail,coverImage){
    var valid=projects.validate(project);
    return normalize({version:VERSION,id:id||valid.id,createdAt:createdAt||Date.now(),
      updatedAt:updatedAt||Date.now(),quality:optics,project:valid,thumbnail:thumbnail||null,cover:coverImage});
  }
  // All results are resolved on transaction completion, not request success.
  // A failed or aborted transaction never reports a successful save/delete.
  function transaction(indexedDB,mode,action){
    if(!indexedDB||typeof indexedDB.open!=='function')
      return Promise.reject(Error('Animation Library requires IndexedDB'));
    return new Promise(function(resolve,reject){
      var db=null,tx=null,request,done=false,result;
      function fail(error){if(done)return;done=true;try{if(db)db.close();}catch(ignore){}
        reject(error instanceof Error?error:Error(String(error||'Animation Library unavailable')));}
      try{request=indexedDB.open(DATABASE,1);}catch(error){fail(error);return;}
      request.onupgradeneeded=function(){
        db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
      };
      request.onerror=function(){fail(request.error||Error('Animation Library database unavailable'));};
      request.onblocked=function(){fail(Error('Animation Library database upgrade blocked'));};
      request.onsuccess=function(){
        if(done){request.result.close();return;}
        db=request.result;
        try{tx=db.transaction(STORE,mode);}
        catch(error){fail(error);return;}
        tx.oncomplete=function(){if(done)return;done=true;db.close();resolve(result);};
        tx.onerror=function(){fail(tx.error||Error('Animation Library transaction failed'));};
        tx.onabort=function(){fail(tx.error||Error('Animation Library transaction aborted'));};
        function finish(value){result=value;}
        function abort(error){
          if(done)return;
          try{tx.abort();}catch(ignore){}
          fail(error);
        }
        try{action(tx.objectStore(STORE),finish,abort);}catch(error){abort(error);}
      };
    });
  }
  function list(indexedDB){
    return transaction(indexedDB,'readonly',function(store,finish,abort){
      var req=store.getAll();
      req.onsuccess=function(){try{
        var entries=(req.result||[]).map(normalize);
        entries.sort(function(a,b){return b.updatedAt-a.updatedAt||a.id.localeCompare(b.id);});
        finish(entries);
      }catch(error){abort(error);}};
    });
  }
  function get(indexedDB,id){
    validId(id);
    return transaction(indexedDB,'readonly',function(store,finish,abort){
      var req=store.get(id);
      req.onsuccess=function(){try{finish(req.result?normalize(req.result):null);}catch(error){abort(error);}};
    });
  }
  function create(indexedDB,project,optics,now,thumbnail,allowDuplicate,coverImage){
    var time=stamp(now||Date.now()),data=record(project,optics,project.id,time,time,thumbnail,coverImage);
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      // Check ALL existing rows in the same readwrite transaction as add().
      // A second tab cannot race this check and silently create a copy.
      var read=store.getAll();
      read.onsuccess=function(){try{
        var entries=(read.result||[]).map(normalize);
        if(entries.some(function(entry){return entry.id===data.id;}))
          throw Error('Animation Library project already exists');
        if(!allowDuplicate){
          var key=fingerprint(data.project);
          var existing=entries.find(function(entry){return fingerprint(entry.project)===key;});
          if(existing)throw duplicateError(existing);
        }
        store.add(data);finish(data);
      }catch(error){abort(error);}};
    });
  }
  function update(indexedDB,project,optics,expectedRevision,now,thumbnail){
    return updateRecord(indexedDB,project,optics,expectedRevision,now,thumbnail,null);
  }
  // Shared mutations require the complete inspected record, not just a timestamp.
  function updateExact(indexedDB,project,optics,expected,now,thumbnail){
    var wanted=normalize(expected),valid=projects.validate(project);
    if(valid.id!==wanted.id)throw Error('Saved Animation identity does not match the inspected record');
    return updateRecord(indexedDB,valid,optics,wanted.updatedAt,now,thumbnail,wanted);
  }
  function nextRecord(old,valid,optics,now,thumbnail){
    // Preserve a screenshot only when its first physical frame still matches.
    var image=thumbnail||(sameFirstFrame(valid,old.project)?old.thumbnail:null);
    return record(valid,optics,valid.id,old.createdAt,
      Math.max(stamp(now||Date.now()),old.updatedAt+1),image,old.cover);
  }
  // Fix the target timestamp and full bytes before entering the named DB.
  // Recovery may recognize exactly those bytes, never generate a later revision.
  function planExactUpdate(project,optics,expected,now,thumbnail){
    var before=normalize(expected),valid=projects.validate(project);
    if(valid.id!==before.id)throw Error('Saved Animation identity does not match the inspected record');
    return validateUpdatePlan({version:1,before,after:nextRecord(before,valid,optics,now,thumbnail)});
  }
  function validateUpdatePlan(value){
    if(!value||Object.keys(value).sort().join(',')!=='after,before,version'||value.version!==1)
      throw Error('Invalid named Animation update plan');
    var before=normalize(value.before),after=normalize(value.after);
    if(JSON.stringify(before)!==JSON.stringify(value.before)||
       JSON.stringify(after)!==JSON.stringify(value.after)||before.id!==after.id||
       before.createdAt!==after.createdAt||after.updatedAt<=before.updatedAt||
       (before.cover||null)!==(after.cover||null))
      throw Error('Invalid named Animation update transition');
    return {version:1,before,after};
  }
  function commitPlannedUpdate(indexedDB,plan,guard=()=>{}){
    var wanted=validateUpdatePlan(plan),before=wanted.before,after=wanted.after;
    guard();
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      var read=store.get(before.id);
      read.onsuccess=function(){try{
        guard();
        if(!read.result)throw Error('Saved Animation was deleted; update plan retained');
        var current=normalize(read.result),bytes=JSON.stringify(current);
        if(bytes===JSON.stringify(after)){finish(after);return;}
        if(bytes!==JSON.stringify(before))
          throw Error('Saved Animation changed since update was prepared; update plan retained');
        store.put(after);finish(after);
      }catch(error){abort(error);}};
    });
  }
  function updateRecord(indexedDB,project,optics,expectedRevision,now,thumbnail,wanted){
    var valid=projects.validate(project);stamp(expectedRevision);
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      var read=store.get(valid.id);
      read.onsuccess=function(){try{
        if(!read.result)throw Error('Animation Library project was deleted');
        var old=normalize(read.result);
        if(old.updatedAt!==expectedRevision||
           (wanted&&JSON.stringify(old)!==JSON.stringify(wanted)))
          throw Error('Animation Library project changed in another tab; reopen it or use Save As');
        // Preserve the old screenshot only while the initial physical state
        // is identical. An edited first frame must not retain a misleading image.
        var next=nextRecord(old,valid,optics,now,thumbnail);
        store.put(next);finish(next);
      }catch(error){abort(error);}};
    });
  }
  // Rename only the library's saved metadata. Unsaved draft physics remains
  // independent and cross-tab revisions are checked just like Save Changes.
  function rename(indexedDB,id,name,expectedRevision,now){
    validId(id);stamp(expectedRevision);
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      var read=store.get(id);
      read.onsuccess=function(){try{
        if(!read.result)throw Error('Animation Library project was deleted');
        var old=normalize(read.result);
        if(old.updatedAt!==expectedRevision)
          throw Error('Animation Library project changed in another tab; reopen it before renaming');
        var project=projects.validate(Object.assign({},old.project,{name:name}));
        var next=record(project,old.quality,id,old.createdAt,
          Math.max(stamp(now||Date.now()),old.updatedAt+1),old.thumbnail,old.cover);
        store.put(next);finish(next);
      }catch(error){abort(error);}};
    });
  }
  // Cover changes are metadata-only and use the same optimistic revision as rename.
  function setCover(indexedDB,id,image,expectedRevision,now){
    validId(id);stamp(expectedRevision);image=cover(image);
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      var read=store.get(id);
      read.onsuccess=function(){try{
        if(!read.result)throw Error('Animation Library project was deleted');
        var old=normalize(read.result);
        if(old.updatedAt!==expectedRevision)
          throw Error('Animation Library project changed in another tab; reopen it before changing the cover');
        var next=record(old.project,old.quality,id,old.createdAt,
          Math.max(stamp(now||Date.now()),old.updatedAt+1),old.thumbnail,image);
        store.put(next);finish(next);
      }catch(error){abort(error);}};
    });
  }
  // Shared preview deletion is authorized for one exact inspected record.
  // Never delete a changed revision, even if its ID is still present.
  function removeExact(indexedDB,expected){
    var wanted=normalize(expected);
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      var read=store.get(wanted.id);
      read.onsuccess=function(){try{
        if(!read.result||JSON.stringify(normalize(read.result))!==JSON.stringify(wanted))
          throw Error('Saved Animation changed or was removed; reload the Library before deleting');
        store.delete(wanted.id);finish(true);
      }catch(error){abort(error);}};
    });
  }
  function remove(indexedDB,id){
    validId(id);
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      var read=store.get(id);
      read.onsuccess=function(){if(!read.result){finish(false);return;}
        store.delete(id);finish(true);};
    });
  }
  return Object.freeze({VERSION:VERSION,DATABASE:DATABASE,STORE:STORE,
    normalize:normalize,makeId:makeId,record:record,
    fingerprint:fingerprint,findDuplicates:findDuplicates,
    thumbnailMatchesFirstFrame:thumbnailMatchesFirstFrame,sameFirstFrame:sameFirstFrame,
    PORTABLE_FORMAT:PORTABLE_FORMAT,PORTABLE_VERSION:PORTABLE_VERSION,
    MAX_PORTABLE_ITEMS:MAX_PORTABLE_ITEMS,MAX_PORTABLE_LENGTH:MAX_PORTABLE_LENGTH,
    exportPortable:exportPortable,parsePortable:parsePortable,parseBundle:parseBundle,referenceIds:referenceIds,
    collectReferences:collectReferences,remapReferences:remapReferences,importEntries:importEntries,
    list:list,get:get,create:create,update:update,updateExact:updateExact,planExactUpdate,validateUpdatePlan,commitPlannedUpdate,rename:rename,setCover:setCover,remove:remove,removeExact:removeExact});
}));
