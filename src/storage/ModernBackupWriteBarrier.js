/* Explicit opt-in cooperation barrier for Modern storage writes.
 * Working-session, History, Animation, Calibration, Reference Image and UI
 * registry IDB adapters participate. This is not a complete migration safety gate.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernBackupWriteBarrier=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const LOCK_NAME='curvature-optics-modern-backup-writers-v1';
  const ROUTE_KEY='curvature-modern-storage-route-v1';
  const OWNER=/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
  function ensure(ok,reason){
    if(!ok)throw Error('Modern backup write barrier: '+reason);
  }
  // Absence preserves the opt-in rehearsal route. Once a cutover marker
  // exists, read it inside every granted writer lock, not at registration.
  function readRoute(storage){
    if(storage==null)return null;
    const raw=storage.getItem(ROUTE_KEY);
    if(raw===null)return null;
    let value;
    try{value=JSON.parse(raw);}catch(error){throw Error('Modern backup write barrier: invalid storage route');}
    ensure(value&&typeof value==='object'&&!Array.isArray(value)&&
      Object.keys(value).length===4&&value.format==='curvature-modern-storage-route'&&
      value.version===1&&['preparing','managed'].includes(value.state)&&
      typeof value.backupSha256==='string'&&/^[a-f0-9]{64}$/.test(value.backupSha256),
      'invalid storage route');
    return Object.freeze(value);
  }
  function create(lockManager,{routeStorage}={}){
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
        async commit(operation){
          ensure(typeof operation==='function','operation must be callable');
          return underLock('shared',()=>{
            const storage=routeStorage===undefined?
              (typeof window==='undefined'?null:window.localStorage):routeStorage;
            const route=readRoute(storage);
            ensure(!route||owner==='managed.objects'||
              (route.state==='managed'&&owner==='ui.registry'),
              'writer fenced by '+(route&&route.state)+' storage route: '+owner);
            return operation();
          });
        }
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
  return Object.freeze({LOCK_NAME,ROUTE_KEY,readRoute,create});
}));