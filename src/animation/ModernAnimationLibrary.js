/* Durable, explicitly saved Modern Animation Projects. Unlike the autosaved
 * working draft, named projects own their base experiment and keyframe values.
 * Revision checks prevent an older browser tab from silently overwriting work.
 */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject;
  var thumbnails=root.CurvatureModernExperimentThumbnail;
  if(typeof module==='object'&&module.exports)
    projects=require('./ModernAnimationProject');
    thumbnails=require('../ui/modern/ModernExperimentThumbnail');
  var api=factory(projects,thumbnails);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationLibrary=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,thumbnails){
  'use strict';
  var VERSION=1,DATABASE='curvature-modern-animation-library',STORE='projects';
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
  function create(indexedDB,project,optics,now,thumbnail){
    var time=stamp(now||Date.now()),data=record(project,optics,project.id,time,time,thumbnail);
    return transaction(indexedDB,'readwrite',function(store,finish,abort){
      var read=store.get(data.id);
      read.onsuccess=function(){if(read.result){abort(Error('Animation Library project already exists'));return;}
        try{store.add(data);finish(data);}catch(error){abort(error);}};
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
    list:list,get:get,create:create,update:update,rename:rename,remove:remove});
}));
