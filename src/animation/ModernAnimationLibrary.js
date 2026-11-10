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
  var api=factory(projects,thumbnails,compatibility);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationLibrary=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,thumbnails,compatibility){
  'use strict';
  var VERSION=1,DATABASE='curvature-modern-animation-library',STORE='projects';
  var PORTABLE_FORMAT='curvature-modern-animations',PORTABLE_VERSION=1;
  var MAX_PORTABLE_ITEMS=200,MAX_PORTABLE_LENGTH=50000000;
  function validId(id){
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id))
      throw RangeError('Invalid animation library ID');
    return id;
  }
  function quality(value){
    if(!['auto','accurate','fast'].includes(value))throw RangeError('Invalid animation library optics');
    return value;
  }
  function stamp(value){
    if(!Number.isSafeInteger(value)||value<=0)throw RangeError('Invalid animation library timestamp');
    return value;
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
    return {version:VERSION,id:id,createdAt:createdAt,updatedAt:updatedAt,
      quality:quality(value.quality),project:project,
      thumbnail:thumbnails.validate(value.thumbnail||null,project.baseExperiment.display.mode)};
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
    if(p.mode==='camera')delete fixed.camera;
    return JSON.stringify({mode:p.mode,target:p.target,fixed:fixed,
      keyframes:p.keyframes.map(function(frame){return {
        value:frame.value,travelMs:frame.travelMs,holdMs:frame.holdMs,easing:frame.easing
      };})});
  }
  // Portable files own complete projects (including all keyframe physics).
  // Browser-local record IDs are only source provenance: importing always
  // assigns fresh IDs, so a file cannot overwrite existing named animations.
  function portableItem(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).some(function(key){return ![
        'project','quality','thumbnail','createdAt','updatedAt'].includes(key);}))
      throw RangeError('Invalid portable animation entry');
    var project=projects.validate(value.project);
    var createdAt=value.createdAt==null?null:stamp(value.createdAt);
    var updatedAt=value.updatedAt==null?null:stamp(value.updatedAt);
    if((createdAt===null)!==(updatedAt===null)||
      (createdAt!==null&&updatedAt<createdAt))
      throw RangeError('Invalid portable animation timestamps');
    return {project:project,quality:quality(value.quality),
      thumbnail:thumbnails.validate(value.thumbnail||null,project.baseExperiment.display.mode),
      createdAt:createdAt,updatedAt:updatedAt};
  }
  function exportPortable(entries){
    if(!Array.isArray(entries)||!entries.length||entries.length>MAX_PORTABLE_ITEMS)
      throw RangeError('Select 1–'+MAX_PORTABLE_ITEMS+' animations to export');
    var animations=entries.map(function(entry){
      var normalized=normalize(entry);
      return portableItem({project:normalized.project,quality:normalized.quality,
        thumbnail:normalized.thumbnail,createdAt:normalized.createdAt,
        updatedAt:normalized.updatedAt});
    });
    var result=JSON.stringify({format:PORTABLE_FORMAT,version:PORTABLE_VERSION,
      animations:animations},null,2)+'\n';
    if(result.length>MAX_PORTABLE_LENGTH)throw RangeError('Animation JSON export is too large');
    return result;
  }
  function parsePortable(text){
    if(typeof text!=='string'||text.length>MAX_PORTABLE_LENGTH)
      throw RangeError('Animation JSON file too large');
    var value=JSON.parse(text);
    // Accept a standalone validated v1 Animation Project for convenient
    // interoperability; a portable bundle is the canonical export format.
    if(value&&value.version===projects.VERSION&&value.keyframes&&value.baseExperiment)
      return [portableItem({project:value,quality:'auto'})];
    if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).sort().join(',')!=='animations,format,version'||
      value.format!==PORTABLE_FORMAT||value.version!==PORTABLE_VERSION||
      !Array.isArray(value.animations)||!value.animations.length||
      value.animations.length>MAX_PORTABLE_ITEMS)
      throw RangeError('Unsupported animation JSON format');
    return value.animations.map(portableItem);
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
          var entry=record(project,item.quality,id,createdAt,updatedAt,item.thumbnail);
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
  function record(project,optics,id,createdAt,updatedAt,thumbnail){
    var valid=projects.validate(project);
    return normalize({version:VERSION,id:id||valid.id,createdAt:createdAt||Date.now(),
      updatedAt:updatedAt||Date.now(),quality:optics,project:valid,thumbnail:thumbnail||null});
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
  function create(indexedDB,project,optics,now,thumbnail,allowDuplicate){
    var time=stamp(now||Date.now()),data=record(project,optics,project.id,time,time,thumbnail);
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
    var valid=projects.validate(project);stamp(expectedRevision);
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      var read=store.get(valid.id);
      read.onsuccess=function(){try{
        if(!read.result)throw Error('Animation Library project was deleted');
        var old=normalize(read.result);
        if(old.updatedAt!==expectedRevision)
          throw Error('Animation Library project changed in another tab; reopen it or use Save As');
        // Preserve the old screenshot only while the initial physical state
        // is identical. An edited first frame must not retain a misleading image.
        var image=thumbnail||((JSON.stringify(valid.baseExperiment)===
          JSON.stringify(old.project.baseExperiment))?old.thumbnail:null);
        var next=record(valid,optics,valid.id,old.createdAt,
          Math.max(stamp(now||Date.now()),old.updatedAt+1),image);
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
          Math.max(stamp(now||Date.now()),old.updatedAt+1),old.thumbnail);
        store.put(next);finish(next);
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
    PORTABLE_FORMAT:PORTABLE_FORMAT,PORTABLE_VERSION:PORTABLE_VERSION,
    MAX_PORTABLE_ITEMS:MAX_PORTABLE_ITEMS,MAX_PORTABLE_LENGTH:MAX_PORTABLE_LENGTH,
    exportPortable:exportPortable,parsePortable:parsePortable,importEntries:importEntries,
    list:list,get:get,create:create,update:update,rename:rename,remove:remove});
}));
