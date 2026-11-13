/* Crash/reload recovery for Animation Studio workspaces, independent of the
 * named Animation Library. V1 single-draft checkpoints remain readable for
 * migration; a V2 collection owns one checkpoint per working project/draft.
 * LocalStorage supports synchronous pagehide recovery; IndexedDB mirrors it.
 */
(function(root,factory){
  var experiment=root.CurvatureModernExperimentState;
  var hud=root.CurvatureModernCameraHud;
  if(typeof module==='object'&&module.exports){
    experiment=require('../ui/modern/ModernExperimentState');
    hud=require('../ui/modern/ModernCameraHud');
  }
  var api=factory(experiment,hud);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationDraftAutosave=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(experiment,hud){
  'use strict';
  var VERSION=1,STORAGE_KEY='curvature-modern-animation-draft-v1';
  var DATABASE='curvature-modern-animation-draft',STORE='draft',KEY='current';
  var COLLECTION_VERSION=2,COLLECTION_KEY='curvature-modern-animation-workspaces-v2';
  var COLLECTION_DB_KEY='workspaces';
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function string(v,max){if(typeof v!=='string'||v.length>max)throw RangeError('Invalid animation draft text');return v;}
  function number(v,min,max){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)
    throw RangeError('Invalid animation draft number');return v;}
  function normalize(input){
    if(!object(input)||input.version!==VERSION||!Number.isSafeInteger(input.savedAt)||input.savedAt<=0)
      throw RangeError('Invalid animation checkpoint');
    var draft=input.draft;
    if(!object(draft)||!['auto','camera','physical'].includes(draft.mode)||
      !['none','history','camera-sequence','mixed'].includes(draft.source)||
      typeof draft.target!=='string'||draft.target.length>90||
      !Array.isArray(draft.frames)||draft.frames.length>200)
      throw RangeError('Invalid animation draft');
    if(draft.target!=='auto'&&!/^(scene|A|B)\|(surface\.curvature|temperatureProfile\.gradientKPerKm)$/.test(draft.target))
      throw RangeError('Invalid animation physical target');
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
      return {key:key,sourceSnapshotId:id,name:string(frame.name,120),
        experiment:experiment.validate(frame.experiment),
        travelMs:number(frame.travelMs,i===0?0:200,i===0?0:120000),
        holdMs:number(frame.holdMs,0,120000),easing:frame.easing};
    });
    var active=draft.activeFrameKeys==null?null:draft.activeFrameKeys;
    if(active!==null&&(!Array.isArray(active)||active.length<2||active.length>frames.length||
      new Set(active).size!==active.length||active.some(function(key){return !keys.has(key);})))
      throw RangeError('Invalid selected animation sequence');
    var selected=input.selectedKey;
    if(selected!==null&&(!keys.has(selected)||typeof selected!=='string'))selected=null;
    var quality=input.quality;
    if(!['auto','accurate','fast'].includes(quality))throw RangeError('Invalid playback quality');
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
        mode:draft.mode,target:draft.target,interpolation:interpolation,
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
    return {version:COLLECTION_VERSION,savedAt:input.savedAt,activeId:activeId,
      workspaces:workspaces};
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
      savedAt:Math.max(savedAt||Date.now(),original.savedAt+1),workspaces:next});
  }
  function withoutWorkspace(collectionValue,id,activeId,savedAt){
    var original=normalizeCollection(collectionValue);
    return normalizeCollection({version:COLLECTION_VERSION,
      savedAt:Math.max(savedAt||Date.now(),original.savedAt+1),activeId:activeId,
      workspaces:original.workspaces.filter(function(item){return item.id!==id;})});
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
  function withStore(indexedDB,mode,act){
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.resolve(null);
    return new Promise(function(resolve,reject){
      var db=null,settled=false,request;
      function fail(error){if(settled)return;settled=true;if(db)db.close();reject(error);}
      try{request=indexedDB.open(DATABASE,1);}catch(error){fail(error);return;}
      request.onupgradeneeded=function(){db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);};
      request.onerror=function(){fail(request.error||Error('Animation draft database unavailable'));};
      request.onblocked=function(){fail(Error('Animation draft database blocked'));};
      request.onsuccess=function(){
        if(settled){request.result.close();return;}
        db=request.result;
        var tx,result;
        try{tx=db.transaction(STORE,mode);result=act(tx.objectStore(STORE));}
        catch(error){fail(error);return;}
        tx.oncomplete=function(){if(settled)return;settled=true;db.close();resolve(result?result.result:null);};
        tx.onerror=function(){fail(tx.error||Error('Animation draft transaction failed'));};
        tx.onabort=function(){fail(tx.error||Error('Animation draft transaction aborted'));};
      };
    });
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
    getWorkspace:getWorkspace,readCollectionLocal:readCollectionLocal,
    writeCollectionLocal:writeCollectionLocal,readCollection:readCollection,
    writeCollection:writeCollection,migrate:migrate,newerCollection:newerCollection});
}));
