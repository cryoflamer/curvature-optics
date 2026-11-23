/* Opt-in IndexedDB adapter for future Modern UI sessions.
 * Not loaded by Modern: no live schema, restore priority or URL changes.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernUiSessionStore=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DATABASE='curvature-modern-ui-state',VERSION=1;
  const TAB_KEY='curvature-modern-ui-tab-id-v1';
  const PENDING_PREFIX='curvature-modern-ui-pending-v1:';
  const FORMAT='curvature-modern-ui-state';
  const ID=/^[A-Za-z0-9_-]{1,128}$/;
  function check(ok,reason){if(!ok)throw Error('UI Session Store: '+reason);}
  function create(env){
    check(env&&env.indexedDB&&typeof env.indexedDB.open==='function'&&
      env.sessionStorage&&typeof env.sessionStorage.getItem==='function'&&
      env.crypto&&typeof env.crypto.randomUUID==='function',
      'IndexedDB, sessionStorage and UUID generator required');
    const {indexedDB,sessionStorage,crypto}=env;
    // Web Locks owns the opaque tab ID for this document lifetime. A duplicated
    // tab inherits sessionStorage, so its token alone is not proof of identity.
    let claimPromise=null,resumePromise=null,owner=null,forkedFrom=null;
    let lifecycleAttached=false;
    function tabId(){
      const existing=sessionStorage.getItem(TAB_KEY);
      if(existing!==null){
        check(ID.test(existing),'invalid existing tab token; legacy evidence preserved');
        return existing;
      }
      const id=crypto.randomUUID();
      check(ID.test(id),'invalid generated tab token');
      sessionStorage.setItem(TAB_KEY,id);
      return id;
    }
    function attemptLock(id){
      return new Promise((resolve,reject)=>{
        let settled=false;
        const finish=value=>{if(settled)return;settled=true;resolve(value);};
        try{
          const task=env.navigator.locks.request('curvature-modern-ui-tab:'+id,
            {mode:'exclusive',ifAvailable:true},lock=>{
              if(!lock){finish(null);return;}
              // Keep the lock until the document leaves. Do not await this
              // promise from claimTab(), which must return while it is held.
              return new Promise(release=>finish(release));
            });
          Promise.resolve(task).catch(error=>{
            if(!settled){settled=true;reject(error);}
            else if(owner&&owner.id===id){
              owner.active=false;owner.writable=false;
            }
          });
        }catch(error){if(!settled){settled=true;reject(error);}}
      });
    }
    function claimTab(){
      if(claimPromise)return claimPromise;
      claimPromise=(async()=>{
        // Fail closed rather than accepting a cloned ID when the browser
        // cannot coordinate live tab ownership. Normal Modern never calls this.
        check(env.navigator&&env.navigator.locks&&
          typeof env.navigator.locks.request==='function',
          'exclusive tab ownership unavailable (Web Locks required)');
        const original=tabId();
        let candidate=original;
        for(let attempt=0;attempt<4;attempt++){
          const release=await attemptLock(candidate);
          if(release){
            owner={id:candidate,active:true,writable:true,release};
            if(!lifecycleAttached&&typeof env.addEventListener==='function'){
              lifecycleAttached=true;
              // A cached document is NOT destroyed at pagehide. Release the
              // lock on every departure, not just the first one.
              env.addEventListener('pagehide',()=>{
                if(owner&&owner.active){
                  const old=owner;
                  old.active=false;old.writable=false;
                  old.release();
                }
                claimPromise=null;
                resumePromise=null;
              });
            }
            return Object.freeze({tabId:candidate,forkedFrom});
          }
          if(!forkedFrom)forkedFrom=original;
          candidate=crypto.randomUUID();
          check(ID.test(candidate)&&candidate!==original,
            'invalid forked tab token');
          // Only overwrite our own copied opaque token. Legacy backups,
          // another tab's IndexedDB rows and domain-specific IDs are untouched.
          sessionStorage.setItem(TAB_KEY,candidate);
        }
        throw Error('UI Session Store: unable to claim a unique tab identity');
      })().catch(error=>{claimPromise=null;throw error;});
      return claimPromise;
    }
    // BFCache restores the SAME document heap: never invoke claimTab()'s
    // duplicate-tab forking algorithm on this path. A conflicting claimant
    // must cause an explicit error and preserve both stores unchanged.
    function reclaimTab(){
      if(resumePromise)return resumePromise;
      check(owner&&!owner.active&&tabId()===owner.id,
        'tab identity cannot be resumed; reload to recover');
      const old=owner;
      resumePromise=(async()=>{
        const release=await attemptLock(old.id);
        check(!!release,
          'tab identity was claimed while this page was cached; reload to recover');
        owner={id:old.id,active:true,writable:false,release};
        claimPromise=Promise.resolve(
          Object.freeze({tabId:owner.id,forkedFrom}));
        return Object.freeze({tabId:owner.id,forkedFrom});
      })().catch(error=>{resumePromise=null;throw error;});
      return resumePromise;
    }
    function finishResume(){
      check(owner&&owner.active&&!owner.writable,
        'tab is not awaiting resume validation');
      owner.writable=true;
      return owner.id;
    }
    function address(scope,context){
      check(['per-tab','per-tab-and-workspace','global'].includes(scope),
        'invalid state scope');
      if(scope==='global')return {store:'preferences',id:'global'};
      const id=context&&context.tabId||tabId();
      check(typeof id==='string'&&ID.test(id),'invalid tab identity');
      if(scope==='per-tab')return {store:'sessions',id:'tab:'+id};
      const workspace=context&&context.workspace;
      check(typeof workspace==='string'&&ID.test(workspace),
        'workspace identity required');
      return {store:'sessions',id:'workspace:'+id+':'+workspace};
    }
    // A tiny synchronous write-ahead intent is scoped to this browser tab.
    // IndexedDB remains authoritative; no experiment, draft or project is
    // serialized here. A copied tab has a new ID and cannot replay its parent.
    function pendingKey(scope,context){
      if(scope==='global')return null;
      return PENDING_PREFIX+address(scope,context).id;
    }
    function validatePending(scope,context,entry){
      const id=address(scope,context).id;
      check(entry&&entry.format===FORMAT&&entry.version===1&&
        entry.target===id&&entry.scope===scope&&
        Number.isSafeInteger(entry.expectedRevision)&&entry.expectedRevision>=0&&
        entry.envelope&&entry.envelope.format===FORMAT&&
        entry.envelope.version===1&&entry.envelope.scope===scope&&
        entry.envelope.values&&typeof entry.envelope.values==='object'&&
        !Array.isArray(entry.envelope.values),
        'unsupported or corrupt pending UI write; original bytes retained');
      return entry;
    }
    function readPending(scope,context){
      const key=pendingKey(scope,context);
      if(!key)return null;
      const raw=sessionStorage.getItem(key);
      if(raw===null)return null;
      let parsed;
      try{parsed=JSON.parse(raw);}
      catch(error){throw Error('UI Session Store: corrupt pending UI write; original bytes retained');}
      return validatePending(scope,context,parsed);
    }
    function stage(scope,context,envelope,expectedRevision){
      const key=pendingKey(scope,context);
      if(!key)return false;
      check(owner&&owner.active&&owner.writable&&context.tabId===owner.id,
        'tab ownership required for pending UI write');
      check(typeof sessionStorage.removeItem==='function',
        'sessionStorage removeItem required for pending UI write');
      // Refuse to overwrite corrupt evidence even when the new UI value is valid.
      readPending(scope,context);
      const entry=validatePending(scope,context,{
        format:FORMAT,version:1,target:address(scope,context).id,scope,
        expectedRevision,envelope
      });
      sessionStorage.setItem(key,JSON.stringify(entry));
      return true;
    }
    function acknowledge(scope,context,envelope,revision){
      const key=pendingKey(scope,context);
      if(!key)return false;
      check(owner&&owner.active&&owner.writable&&context.tabId===owner.id,
        'tab ownership lost before acknowledgement');
      const pending=readPending(scope,context);
      if(!pending)return false;
      check(Number.isSafeInteger(revision)&&revision>=1,
        'invalid pending acknowledgement');
      if(revision<=pending.expectedRevision)return false;
      check(revision===pending.expectedRevision+1,
        'pending UI revision jump; original bytes retained');
      if(JSON.stringify(pending.envelope)===JSON.stringify(envelope)){
        sessionStorage.removeItem(key);
      }else{
        // A later UI edit was staged while an earlier write completed.
        // Keep the later intent, but advance its acknowledged base revision.
        pending.expectedRevision=revision;
        sessionStorage.setItem(key,JSON.stringify(pending));
      }
      return true;
    }
    function connect(){
      return new Promise((resolve,reject)=>{
        let req,settled=false;
        function fail(error){if(settled)return;settled=true;reject(error||Error('IndexedDB open failed'));}
        try{req=indexedDB.open(DATABASE,VERSION);}catch(error){fail(error);return;}
        req.onblocked=()=>fail(Error('UI Session Store: IndexedDB open blocked'));
        req.onerror=()=>fail(req.error);
        req.onupgradeneeded=e=>{
          if(e.oldVersion!==0){try{req.transaction.abort();}catch(ignore){}
            fail(Error('UI Session Store: incompatible schema upgrade'));return;}
          const db=req.result;
          db.createObjectStore('sessions',{keyPath:'id'});
          db.createObjectStore('preferences',{keyPath:'id'});
        };
        req.onsuccess=()=>{
          const db=req.result;
          if(settled){db.close();return;}
          settled=true;db.onversionchange=()=>db.close();resolve(db);
        };
      });
    }
    async function transact(storeName,mode,action){
      const db=await connect();
      return new Promise((resolve,reject)=>{
        let tx,done=false,output=null,reportedError=null;
        const fail=error=>{
          if(done)return;
          done=true;db.close();reject(error||reportedError||Error('IndexedDB transaction failed'));
        };
        try{
          tx=db.transaction(storeName,mode);
          tx.oncomplete=()=>{if(done)return;done=true;db.close();resolve(output);};
          tx.onerror=()=>{reportedError=reportedError||tx.error||Error('IndexedDB transaction failed');};
          tx.onabort=()=>fail(reportedError||tx.error||Error('IndexedDB transaction aborted'));
          action(tx.objectStore(storeName),{
            result(value){output=value;},
            reject(error){reportedError=error;try{tx.abort();}catch(ignore){fail(error);}}
          });
        }catch(error){
          reportedError=error;
          if(tx){try{tx.abort();}catch(ignore){fail(error);}}
          else fail(error);
        }
      });
    }
    async function read(scope,context){
      const target=address(scope,context);
      return transact(target.store,'readonly',(store,reply)=>{
        function accept(value,id,inherited){
          if(!value){reply.result({revision:0,envelope:null});return;}
          if(value.version!==1||value.id!==id||
            !Number.isSafeInteger(value.revision)||value.revision<1||
            !value.envelope||value.envelope.format!==FORMAT||
            value.envelope.version!==1||value.envelope.scope!==scope){
            reply.reject(Error('UI Session Store: unsupported/corrupt stored record'));return;
          }
          // A copied tab starts at revision zero in its OWN namespace.
          // Its initial UI is read from the parent but never backfilled.
          reply.result({revision:inherited?0:value.revision,envelope:value.envelope});
        }
        const req=store.get(target.id);
        req.onsuccess=()=>{
          if(req.result){accept(req.result,target.id,false);return;}
          if(scope==='global'||!forkedFrom||!owner||!owner.active||
             context?.tabId!==owner.id){
            accept(null,target.id,false);return;
          }
          const inherited=address(scope,{...context,tabId:forkedFrom});
          const source=store.get(inherited.id);
          source.onsuccess=()=>accept(source.result,inherited.id,true);
        };
      });
    }
    async function write(scope,context,envelope,expectedRevision){
      check(envelope&&envelope.format===FORMAT&&envelope.version===1&&
        envelope.scope===scope&&envelope.values&&
        typeof envelope.values==='object'&&!Array.isArray(envelope.values),
        'invalid registry snapshot');
      check(Number.isSafeInteger(expectedRevision)&&expectedRevision>=0,
        'expected revision required');
      const target=address(scope,context);
      // Diagnostic adapters may be unclaimed, but a claimed lease can never
      // write after suspension or while a BFCache restore is unvalidated.
      const lease=owner;
      if(scope!=='global'&&(claimPromise||lease))
        check(lease&&lease.active&&lease.writable&&context&&context.tabId===lease.id,
          'tab ownership lost; reload before writing UI state');
      return transact(target.store,'readwrite',(store,reply)=>{
        const req=store.get(target.id);
        req.onsuccess=()=>{
          if(scope!=='global'&&lease&&
             (!lease.active||!lease.writable||owner!==lease)){
            reply.reject(Error('UI Session Store: tab ownership lost during write'));return;
          }
          const before=req.result,revision=before?before.revision:0;
          if(before&&(before.version!==1||!Number.isSafeInteger(before.revision)||
            before.revision<1)){
            reply.reject(Error('UI Session Store: incompatible stored revision'));return;
          }
          if(revision!==expectedRevision){
            reply.reject(Error('UI Session Store: revision conflict'));return;
          }
          const row={id:target.id,version:1,revision:revision+1,envelope};
          try{store.put(row);reply.result({revision:row.revision});}
          catch(error){reply.reject(error);}
        };
      });
    }
    return Object.freeze({tabId,claimTab,reclaimTab,finishResume,
      read,write,stage,readPending,acknowledge});
  }
  return Object.freeze({DATABASE,VERSION,TAB_KEY,create});
}));