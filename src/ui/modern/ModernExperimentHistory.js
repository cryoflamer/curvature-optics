/* Browser-local Modern experiment history. IndexedDB writes are transactional,
 * serialized, allowlist-validated and independent of URL/localStorage saves.
 * Bounded thumbnail data is stored alongside snapshots (never in experiment JSON).
 */
(function(root,factory){
  var state=root.CurvatureModernExperimentState;
  var fp=root.CurvatureModernExperimentFingerprint;
  if(typeof module==='object'&&module.exports){
    if(!state)state=require('./ModernExperimentState');
    if(!fp)fp=require('./ModernExperimentFingerprint');
  }
  var thumbnail=root.CurvatureModernExperimentThumbnail;
  if(!thumbnail&&typeof module==='object'&&module.exports)thumbnail=require('./ModernExperimentThumbnail');
  var api=factory(state,fp,thumbnail);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernExperimentHistory=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state,fp,thumbnailApi){
  'use strict';
  var DATABASE='curvature-modern-experiment-history',VERSION=1,STORE='snapshots';
  var MAX_AUTO=200;
  function create(options){
    options=options||{};
    var factory=options.indexedDB,now=options.now||Date.now;
    var maxAuto=options.maxAutoEntries===undefined?MAX_AUTO:options.maxAutoEntries;
    if(!Number.isInteger(maxAuto)||maxAuto<1||maxAuto>10000)throw RangeError('Invalid auto-history limit');
    var connection=null,opening=null,chain=Promise.resolve();
    function open(){
      if(connection)return Promise.resolve(connection);
      if(opening)return opening;
      if(!factory||typeof factory.open!=='function')return Promise.reject(Error('IndexedDB unavailable'));
      opening=new Promise(function(resolve,reject){
        var request;
        try{request=factory.open(DATABASE,VERSION);}catch(error){reject(error);return;}
        request.onupgradeneeded=function(){
          var db=request.result;
          if(!db.objectStoreNames.contains(STORE)){
            var store=db.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});
            store.createIndex('createdAt','createdAt',{unique:false});
          }
        };
        request.onsuccess=function(){
          connection=request.result;
          connection.onversionchange=function(){connection.close();connection=null;opening=null;};
          resolve(connection);
        };
        request.onerror=function(){reject(request.error||Error('IndexedDB open failed'));};
        request.onblocked=function(){reject(Error('IndexedDB upgrade blocked by another tab'));};
      }).catch(function(error){opening=null;throw error;});
      return opening;
    }
    function serialize(operation){
      var next=chain.then(operation);
      chain=next.catch(function(){});
      return next;
    }
    function transact(mode,work){
      return open().then(function(db){return new Promise(function(resolve,reject){
        var tx;
        try{tx=db.transaction(STORE,mode);}catch(error){reject(error);return;}
        var store=tx.objectStore(STORE),result;
        tx.oncomplete=function(){resolve(result);};
        tx.onerror=function(){reject(tx.error||Error('History transaction failed'));};
        tx.onabort=function(){reject(tx.error||Error('History transaction aborted'));};
        try{work(store,function(value){result=value;},tx);}catch(error){tx.abort();reject(error);}
      });});
    }
    function all(){return transact('readonly',function(store,set){
      var request=store.getAll();
      request.onsuccess=function(){set(request.result||[]);};
    });}
    function ordered(records){return records.sort(function(a,b){return b.id-a.id;});}
    function list(){return serialize(function(){return all().then(ordered);});}
    function get(id){return serialize(function(){return transact('readonly',function(store,set){
      var request=store.get(Number(id));
      request.onsuccess=function(){set(request.result||null);};
    });});}
    function record(experiment,source,thumbnail){
      if(!['manual','auto','recovery'].includes(source))throw RangeError('Invalid history source');
      // Validate synchronously before any database mutation. Persist copies,
      // never references to the mutable live Compare/Scene model.
      var snapshot=state.validate(experiment);
      var signature=fp.exactSignature(snapshot),physical=fp.physicalSignature(snapshot);
      var metadata=fp.features(snapshot);
      var image=thumbnailApi.validate(thumbnail||null,metadata.mode);
      return serialize(function(){return transact('readwrite',function(store,set){
        var getAll=store.getAll();
        getAll.onsuccess=function(){
          var existing=ordered(getAll.result||[]),latest=existing[0];
          // A deliberate manual save and a recovery checkpoint reuse ANY
          // identical full experiment, even if newer entries exist. Automatic
          // history still deduplicates only adjacent identical renders.
          var match=source!=='auto'?existing.find(function(item){
            return item.signature===signature;
          }):latest&&latest.signature===signature?latest:null;
          if(match){
            // A deliberate Save Now or a pre-restore checkpoint must protect
            // an otherwise disposable automatic entry, even on deduplication.
            var changed=false;
            if(source!=='auto'&&!match.pinned){
              match.pinned=true;match.source=source;changed=true;
            }
            if(image&&!match.thumbnail){match.thumbnail=image;changed=true;}
            if(changed)store.put(match);
            set({created:false,entry:match});return;
          }
          var entry={version:VERSION,createdAt:now(),source:source,pinned:source!=='auto',
            experiment:snapshot,signature:signature,physicalSignature:physical,
            features:metadata,thumbnail:image};
          var add=store.add(entry);
          add.onsuccess=function(){
            entry.id=add.result;set({created:true,entry:entry});
          };
          // Only auto records are garbage-collected, oldest first. Manual
          // and pre-restore recovery points must never be silently purged.
          var auto=existing.filter(function(item){return item.source==='auto'&&!item.pinned;});
          var overflow=auto.length+(source==='auto'?1:0)-maxAuto;
          for(var i=auto.length-1;i>=0&&overflow>0;i--,overflow--)store.delete(auto[i].id);
        };
      });});
    }
    function remove(id){return serialize(function(){return transact('readwrite',function(store,set){
      var request=store.get(Number(id));
      request.onsuccess=function(){
        if(!request.result){set(false);return;}
        store.delete(Number(id));set(true);
      };
    });});}
    function pin(id,pinned){return serialize(function(){return transact('readwrite',function(store,set){
      var request=store.get(Number(id));
      request.onsuccess=function(){
        var entry=request.result;if(!entry){set(false);return;}
        entry.pinned=!!pinned;store.put(entry);set(true);
      };
    });});}
    function clearAll(){return serialize(function(){return transact('readwrite',function(store,set){
      var request=store.getAll();
      request.onsuccess=function(){
        var entries=request.result||[];
        entries.forEach(function(entry){store.delete(entry.id);});
        set(entries.length);
      };
    });});}
    function clearAuto(){return serialize(function(){return transact('readwrite',function(store,set){
      var request=store.getAll();
      request.onsuccess=function(){
        var entries=request.result||[],removed=0;
        entries.forEach(function(entry){if(entry.source==='auto'&&!entry.pinned){store.delete(entry.id);removed++;}});
        set(removed);
      };
    });});}
    return Object.freeze({open:open,list:list,get:get,record:record,remove:remove,pin:pin,clearAuto:clearAuto,clearAll:clearAll});
  }
  return Object.freeze({DATABASE:DATABASE,VERSION:VERSION,STORE:STORE,
    MAX_AUTO:MAX_AUTO,create:create});
}));
