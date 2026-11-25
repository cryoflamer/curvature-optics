/* Explicit opt-in cooperation barrier for Modern storage writes.
 * Working-session, History and named Animation adapters participate. This is not a complete
 * migration safety gate; unregistered writers remain outside its scope.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernBackupWriteBarrier=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LOCK_NAME='curvature-optics-modern-backup-writers-v1';
  const OWNER=/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
  function ensure(ok,reason){
    if(!ok)throw Error('Modern backup write barrier: '+reason);
  }
  function create(lockManager){
    ensure(lockManager&&typeof lockManager.request==='function',
      'Web Locks unavailable; coordinated capture cannot proceed');
    const registered=new Set();
    async function underLock(mode,operation){
      ensure(typeof operation==='function','operation must be callable');
      return lockManager.request(LOCK_NAME,{mode},async lock=>{
        ensure(lock&&lock.name===LOCK_NAME&&lock.mode===mode,
          'required origin lock was not granted');
        // The callback must not finish until its IndexedDB transaction's
        // oncomplete/onabort has acknowledged durable success/failure.
        return operation();
      });
    }
    function registerWriter(owner){
      ensure(typeof owner==='string'&&OWNER.test(owner)&&owner.length<=100,
        'invalid writer owner');
      ensure(!registered.has(owner),'writer already registered: '+owner);
      registered.add(owner);
      return Object.freeze({
        owner,
        commit(operation){return underLock('shared',operation);}
      });
    }
    async function snapshot(readOnlyOperation){
      const value=await underLock('exclusive',readOnlyOperation);
      // Same-origin Web Locks only cover callers participating in this
      // protocol. Other tabs can have unflushed in-memory edits, and legacy
      // IndexedDB/localStorage writers are still unregistered.
      return Object.freeze({
        value,localRegisteredWriters:[...registered].sort(),
        coordination:'participating-writers-only',
        eligibleForMigration:false
      });
    }
    return Object.freeze({registerWriter,snapshot});
  }
  return Object.freeze({LOCK_NAME,create});
}));