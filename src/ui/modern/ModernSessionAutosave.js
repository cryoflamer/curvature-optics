/* Single working-session checkpoint, independent of History and Library.
 * IndexedDB retains the durable copy; the existing localStorage experiment
 * remains a synchronous reload/pagehide fallback and compatibility path.
 * No snapshot, thumbnail or History record is created here.
 */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const barrier=node?require('../../storage/ModernBackupWriteBarrier'):
    root.CurvatureModernBackupWriteBarrier;
  const api=factory(root,barrier);
  if(node)module.exports=api;
  root.CurvatureModernSessionAutosave=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(root,barrier){
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
  // Each browser tab uses the same origin-wide Web Lock. A protected writer
  // owns its SHARED lock until the underlying IndexedDB transaction completes,
  // not merely until the put/delete request succeeds. Old localStorage F5
  // recovery and source schemas remain unchanged.
  //
  // If Web Locks are unavailable, ordinary working-session editing must still
  // work using the legacy transaction path. Such writes are explicitly
  // *uncoordinated* and cannot qualify any backup for migration.
  function makeAdapter(lockManager){
    if(lockManager&&typeof lockManager.request!=='function')
      throw TypeError('Working-session Web Locks manager is invalid');
    if(lockManager&&(!barrier||typeof barrier.create!=='function'))
      throw Error('Working-session backup barrier dependency unavailable');
    const writer=lockManager?barrier.create(lockManager).registerWriter('working.session'):null;
    function transaction(indexedDB,perform){
      const action=function(){return withStore(indexedDB,'readwrite',perform);};
      return writer?writer.commit(action):action();
    }
    function write(indexedDB,experiment,savedAt){
      if(!Number.isSafeInteger(savedAt)||savedAt<=0)
        throw RangeError('Invalid working-session timestamp');
      return transaction(indexedDB,function(store){
        store.put({version:1,savedAt:savedAt,experiment:experiment},KEY);
        return null;
      });
    }
    function clear(indexedDB){
      return transaction(indexedDB,function(store){store.delete(KEY);return null;});
    }
    return Object.freeze({read,write,clear,
      coordination:writer?'participating-writer':'uncoordinated'});
  }
  const defaultAdapter=makeAdapter(root.navigator&&root.navigator.locks||null);
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
    read:defaultAdapter.read,write:defaultAdapter.write,clear:defaultAdapter.clear,
    coordination:defaultAdapter.coordination,makeAdapter,
    normalize:normalize,newer:newer});
}));
