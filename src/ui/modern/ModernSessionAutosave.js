/* Single working-session checkpoint, independent of History and Library.
 * IndexedDB retains the durable copy; the existing localStorage experiment
 * remains a synchronous reload/pagehide fallback and compatibility path.
 * No snapshot, thumbnail or History record is created here.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernSessionAutosave=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var DATABASE='curvature-modern-working-session',STORE='session',KEY='current';
  var META_KEY='curvature-modern-working-session-timestamp-v1';
  function withStore(indexedDB,mode,perform){
    if(!indexedDB||typeof indexedDB.open!=='function')return Promise.resolve(null);
    return new Promise(function(resolve,reject){
      var request,settled=false,db=null;
      function rejectOnce(error){if(settled)return;settled=true;if(db)db.close();reject(error);}
      try{request=indexedDB.open(DATABASE,1);}catch(error){rejectOnce(error);return;}
      request.onupgradeneeded=function(){
        db=request.result;
        if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
      };
      request.onerror=function(){rejectOnce(request.error||Error('Working-session database unavailable'));};
      request.onblocked=function(){rejectOnce(Error('Working-session database blocked by another tab'));};
      request.onsuccess=function(){
        if(settled){request.result.close();return;}
        db=request.result;
        var tx,result=null;
        try{
          tx=db.transaction(STORE,mode);
          result=perform(tx.objectStore(STORE));
        }catch(error){rejectOnce(error);return;}
        tx.oncomplete=function(){if(settled)return;settled=true;db.close();resolve(result&&result.result!==undefined?result.result:null);};
        tx.onerror=function(){rejectOnce(tx.error||Error('Working-session transaction failed'));};
        tx.onabort=function(){rejectOnce(tx.error||Error('Working-session transaction aborted'));};
      };
    });
  }
  function read(indexedDB){
    return withStore(indexedDB,'readonly',function(store){return store.get(KEY);});
  }
  function write(indexedDB,experiment,savedAt){
    if(!Number.isSafeInteger(savedAt)||savedAt<=0)throw RangeError('Invalid working-session timestamp');
    return withStore(indexedDB,'readwrite',function(store){
      store.put({version:1,savedAt:savedAt,experiment:experiment},KEY);
      return null;
    });
  }
  function clear(indexedDB){
    return withStore(indexedDB,'readwrite',function(store){store.delete(KEY);return null;});
  }
  function normalize(record,validate){
    if(!record||record.version!==1||!Number.isSafeInteger(record.savedAt)||record.savedAt<=0)
      throw RangeError('Invalid working-session checkpoint');
    return {savedAt:record.savedAt,experiment:validate(record.experiment)};
  }
  function newer(local,remote){
    if(!local)return remote||null;
    if(!remote)return local;
    // Old localStorage experiments have no timestamp; keep them rather than
    // silently replacing a potentially newer legacy edit with stale IDB.
    if(local.savedAt===null)return local;
    return remote.savedAt>local.savedAt?remote:local;
  }
  return Object.freeze({DATABASE:DATABASE,STORE:STORE,META_KEY:META_KEY,
    read:read,write:write,clear:clear,normalize:normalize,newer:newer});
}));
