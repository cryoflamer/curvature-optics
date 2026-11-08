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
  var MAX_AUTO=200,MAX_NAME=120,MAX_DESCRIPTION=1000;
  var PORTABLE_FORMAT='curvature-modern-history',PORTABLE_VERSION=1;
  var MAX_PORTABLE_ITEMS=1000,MAX_PORTABLE_LENGTH=200000000;
  function portableItem(value){
    if(!value||typeof value!=='object'||Array.isArray(value))
      throw RangeError('Invalid portable snapshot');
    var allowed=['experiment','name','description','pinned','thumbnail','createdAt'];
    if(Object.keys(value).some(function(key){return !allowed.includes(key);}))
      throw RangeError('Unknown portable snapshot field');
    var experiment=state.validate(value.experiment);
    var metadata=validatedMetadata(value.name===undefined?'':value.name,
      value.description===undefined?'':value.description);
    if(value.pinned!==undefined&&typeof value.pinned!=='boolean')
      throw RangeError('Invalid portable pin');
    var createdAt=value.createdAt;
    if(createdAt!==undefined&&(!Number.isSafeInteger(createdAt)||createdAt<0))
      throw RangeError('Invalid portable timestamp');
    return {experiment:experiment,name:metadata.name,description:metadata.description,
      pinned:value.pinned===true,thumbnail:thumbnailApi.validate(value.thumbnail||null,
        experiment.display.mode),createdAt:createdAt};
  }
  // Portable History preserves user annotations, pins and saved screenshots.
  // Plain v1 experiment JSON from the former Library is also accepted.
  function parsePortable(text){
    if(typeof text!=='string'||text.length>MAX_PORTABLE_LENGTH)
      throw RangeError('History JSON file too large');
    var value=JSON.parse(text);
    if(value&&value.version===state.VERSION&&value.scene&&value.compare&&value.display)
      return [portableItem({experiment:value})];
    if(!value||typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).sort().join(',')!=='format,snapshots,version'||
      value.format!==PORTABLE_FORMAT||value.version!==PORTABLE_VERSION||
      !Array.isArray(value.snapshots)||!value.snapshots.length||
      value.snapshots.length>MAX_PORTABLE_ITEMS)
      throw RangeError('Unsupported History JSON format');
    return value.snapshots.map(portableItem);
  }
  function exportPortable(entries){
    if(!Array.isArray(entries)||!entries.length||entries.length>MAX_PORTABLE_ITEMS)
      throw RangeError('Select 1–'+MAX_PORTABLE_ITEMS+' snapshots to export');
    var snapshots=entries.map(function(entry){
      return portableItem({experiment:entry.experiment,name:entry.name||'',
        description:entry.description||'',pinned:entry.pinned===undefined?false:entry.pinned,
        thumbnail:entry.thumbnail||null,createdAt:entry.createdAt});
    });
    var text=JSON.stringify({format:PORTABLE_FORMAT,version:PORTABLE_VERSION,
      snapshots:snapshots},null,2)+'\n';
    if(text.length>MAX_PORTABLE_LENGTH)throw RangeError('History export is too large');
    return text;
  }
  function validatedMetadata(name,description){
    if(typeof name!=='string'||typeof description!=='string')
      throw TypeError('Snapshot name and description must be text');
    var cleanName=name.trim(),cleanDescription=description.replace(/\r\n?/g,'\n').trim();
    if(cleanName.length>MAX_NAME)throw RangeError('Snapshot name exceeds '+MAX_NAME+' characters');
    if(cleanDescription.length>MAX_DESCRIPTION)
      throw RangeError('Snapshot description exceeds '+MAX_DESCRIPTION+' characters');
    return {name:cleanName,description:cleanDescription};
  }
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
            name:'',description:'',experiment:snapshot,signature:signature,physicalSignature:physical,
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
    // Import a whole archive atomically in one IndexedDB transaction. Unlike
    // manual Save, differently named records with identical physics remain
    // separate so old Library bookmarks do not silently lose their names.
    // Re-importing the same (full state + name + notes) is idempotent.
    function importEntries(items){
      if(!Array.isArray(items)||!items.length||items.length>MAX_PORTABLE_ITEMS)
        throw RangeError('Invalid History import list');
      var prepared=items.map(function(raw){
        var item=portableItem(raw);
        item.signature=fp.exactSignature(item.experiment);
        item.physicalSignature=fp.physicalSignature(item.experiment);
        item.features=fp.features(item.experiment);
        return item;
      });
      return serialize(function(){return transact('readwrite',function(store,set){
        var allRecords=store.getAll();
        allRecords.onsuccess=function(){
          var records=allRecords.result||[],created=0,reused=0;
          prepared.forEach(function(item){
            var match=records.find(function(entry){return entry.signature===item.signature&&
              (entry.name||'')===item.name&&(entry.description||'')===item.description;});
            if(match){
              reused++;
              var changed=false;
              if(match.source==='auto'){match.source='manual';changed=true;}
              if(item.pinned&&!match.pinned){match.pinned=true;changed=true;}
              if(item.thumbnail&&!match.thumbnail){match.thumbnail=item.thumbnail;changed=true;}
              if(changed)store.put(match);
              return;
            }
            var record={version:VERSION,createdAt:item.createdAt===undefined?now():item.createdAt,
              source:'manual',pinned:item.pinned,name:item.name,description:item.description,
              experiment:item.experiment,signature:item.signature,
              physicalSignature:item.physicalSignature,features:item.features,
              thumbnail:item.thumbnail};
            // Add the prepared record to the transaction and to the local
            // deduplication index before processing the next imported item.
            store.add(record);records.push(record);created++;
          });
          set({created:created,reused:reused});
        };
      });});
    }
    // Edit user annotations only. Keep the validated experiment and its stable
    // signature, thumbnail, pin, timestamps and history identity untouched.
    // Named automatic entries are promoted to manual retention (not pinned).
    function updateMetadata(id,name,description){
      var metadata=validatedMetadata(name,description);
      if(!Number.isSafeInteger(Number(id))||Number(id)<1)
        return Promise.reject(RangeError('Invalid snapshot id'));
      return serialize(function(){return transact('readwrite',function(store,set){
        var request=store.get(Number(id));
        request.onsuccess=function(){
          var entry=request.result;
          if(!entry){set(null);return;}
          entry.name=metadata.name;entry.description=metadata.description;
          // An annotated automatic entry becomes a deliberate long-lived
          // record. Pin remains an independent gallery/Storyboard choice.
          if((entry.name||entry.description)&&entry.source==='auto')entry.source='manual';
          store.put(entry);set(entry);
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
    return Object.freeze({open:open,list:list,get:get,record:record,importEntries:importEntries,updateMetadata:updateMetadata,remove:remove,pin:pin,clearAuto:clearAuto,clearAll:clearAll});
  }
  return Object.freeze({DATABASE:DATABASE,VERSION:VERSION,STORE:STORE,
    MAX_AUTO:MAX_AUTO,MAX_NAME:MAX_NAME,MAX_DESCRIPTION:MAX_DESCRIPTION,
    PORTABLE_FORMAT:PORTABLE_FORMAT,MAX_PORTABLE_ITEMS:MAX_PORTABLE_ITEMS,
    MAX_PORTABLE_LENGTH:MAX_PORTABLE_LENGTH,parsePortable:parsePortable,
    exportPortable:exportPortable,create:create});
}));
