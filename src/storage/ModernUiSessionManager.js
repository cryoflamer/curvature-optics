/* Opt-in, domain-agnostic UI session controller.
 * Page owners register state; no individual IndexedDB or unload code.
 * Not mounted by the production Modern entrypoint yet.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernUiSessionManager=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const SCOPES=['global','workspace','per-tab','per-tab-and-workspace'];
  function check(ok,reason){if(!ok)throw Error('UI Session Manager: '+reason);}
  function create({registry,store,workspace=null}={}){
    check(registry&&typeof registry.register==='function'&&
      typeof registry.snapshot==='function'&&
      typeof registry.hydrate==='function'&&
      store&&typeof store.read==='function'&&
      typeof store.write==='function',
      'registry and session-store adapters required');
    const specs=new Map(),revisions=new Map(),queues=new Map(),errors=new Map(),
      incompatible=new Map(),failedWrites=new Map(),locations=new Map();
    let ready=false,restoring=false;
    function register(spec){
      check(!ready&&!restoring,'register before restore');
      if(spec&&(spec.scope==='per-tab'||spec.scope==='per-tab-and-workspace'))
        check(typeof store.tabId==='function','tab identity adapter required for legacy scope');
      const registered=registry.register(spec);
      specs.set(spec.key,registered);
      return registered;
    }
    function context(scope){
      if(scope==='global')return {};
      if(scope==='workspace'||scope==='per-tab-and-workspace')
        check(typeof workspace==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(workspace),
          'workspace name required');
      if(scope==='workspace')return {workspace};
      const id=store.tabId();
      if(scope==='per-tab')return {tabId:id};
      return {tabId:id,workspace};
    }
    function group(scope){return scope+':'+JSON.stringify(context(scope));}
    async function restore(){
      check(!ready&&!restoring,'restore can run only once');
      restoring=true;
      const warnings=[];
      try{
        // One claim per underlying store, shared across all workspace managers.
        // The session ID must be unique BEFORE reading any per-tab records.
        if([...specs.values()].some(x=>x.scope==='per-tab'||x.scope==='per-tab-and-workspace')&&
           typeof store.claimTab==='function')await store.claimTab();
        for(const scope of SCOPES){
          if(![...specs.values()].some(x=>x.scope===scope))continue;
          const ctx=context(scope);
          let row=await store.read(scope,ctx);
          check(row&&Number.isSafeInteger(row.revision)&&row.revision>=0,
            'invalid stored revision for '+scope);
          if(row.envelope){
            const report=registry.hydrate(row.envelope,ctx);
            if(report.rejected.length){
              // Never replay a pending older snapshot over a future schema.
              incompatible.set(group(scope),report.rejected.slice());
              for(const key of report.rejected)warnings.push(key);
              revisions.set(group(scope),row.revision);
              continue;
            }
          }
          const pending=typeof store.readPending==='function'?
            store.readPending(scope,ctx):null;
          if(pending){
            const report=registry.hydrate(pending.envelope,ctx);
            if(report.rejected.length){
              incompatible.set(group(scope),report.rejected.slice());
              for(const key of report.rejected)warnings.push(key);
              revisions.set(group(scope),row.revision);
              continue;
            }
            const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
            if(row.revision===pending.expectedRevision){
              // No acknowledged write reached IndexedDB before F5. Commit
              // the exact synchronous intent using the original CAS revision.
              const saved=await store.write(scope,ctx,pending.envelope,row.revision);
              check(saved&&saved.revision===row.revision+1,
                'missing recovery acknowledgement');
              row={revision:saved.revision,envelope:pending.envelope};
            }else if(row.revision!==pending.expectedRevision+1||
                     !same(row.envelope,pending.envelope)){
              // A different revision exists. Leave the pending bytes intact
              // instead of rebasing an older writer or replacing the project.
              throw Error('UI Session Manager: pending UI revision conflict; original intent preserved');
            }
            if(typeof store.acknowledge==='function')
              store.acknowledge(scope,ctx,pending.envelope,row.revision);
          }
          revisions.set(group(scope),row.revision);
        }
        ready=true;
        return Object.freeze({ready:true,unrecognizedKeys:warnings});
      }finally{restoring=false;}
    }
    function specFor(key){
      check(specs.has(key),'unregistered state: '+key);
      return specs.get(key);
    }
    function get(key){const spec=specFor(key);return registry.get(key,context(spec.scope));}
    function subscribe(key,handler){specFor(key);return registry.subscribe(key,handler);}
    function ensureWritable(scope){
      const rejected=incompatible.get(group(scope));
      check(!rejected,
        'stored state contains unsupported keys: '+(rejected||[]).join(', '));
    }
    function schedule(scope,ctx){
      const id=group(scope),previous=queues.get(id)||Promise.resolve();
      locations.set(id,{scope,ctx});
      const pending=previous.catch(()=>{}).then(async()=>{
        // Snapshot at commit time: rapid changes in one scope never
        // replay an old copy over later UI choices.
        const frame=registry.snapshot(scope,ctx);
        const revision=revisions.get(id)||0;
        try{
          const saved=await store.write(scope,ctx,frame,revision);
          check(saved&&Number.isSafeInteger(saved.revision)&&
            saved.revision===revision+1,'missing acknowledged revision');
          if(typeof store.acknowledge==='function')
            store.acknowledge(scope,ctx,frame,saved.revision);
          revisions.set(id,saved.revision);
          errors.delete(id);failedWrites.delete(id);
          return true;
        }catch(error){
          failedWrites.set(id,{revision,frame});
          errors.set(id,error);throw error;
        }
      });
      queues.set(id,pending);
      return pending;
    }
    function commitChanged(scope,ctx){
      const id=group(scope),revision=revisions.get(id)||0;
      if(typeof store.stage==='function'){
        const frame=registry.snapshot(scope,ctx);
        try{store.stage(scope,ctx,frame,revision);}
        catch(error){
          // A disabled/full sessionStorage cannot promise survival through F5.
          // Report the failure, retain prior evidence and refuse a write that
          // would silently appear durable without a recoverable intent.
          locations.set(id,{scope,ctx});
          failedWrites.set(id,{revision,frame,stagingFailed:true});
          errors.set(id,error);
          return Promise.reject(error);
        }
      }
      return schedule(scope,ctx);
    }
    function set(key,value){
      check(ready&&!restoring,'restore state before user changes');
      const spec=specFor(key),ctx=context(spec.scope);
      ensureWritable(spec.scope);
      const changed=registry.set(key,value,ctx);
      return changed?commitChanged(spec.scope,ctx):Promise.resolve(false);
    }
    // Preflight the entire patch before changing any registered state. A
    // multi-key layout reset makes ONE acknowledged transaction per scope.
    // Other pages can reuse this without inventing their own bulk writer.
    function setMany(patch){
      check(ready&&!restoring,'restore state before user changes');
      check(patch&&typeof patch==='object'&&!Array.isArray(patch),
        'state patch must be an object');
      const entries=Object.entries(patch);
      check(entries.length>0,'state patch must not be empty');
      let scope=null;
      const validated=entries.map(([key,value])=>{
        const spec=specFor(key);
        if(scope===null)scope=spec.scope;
        check(spec.scope===scope,'state patch must use one scope');
        let clean;
        try{
          const encoded=JSON.stringify(value);
          check(typeof encoded==='string','state must be JSON-compatible');
          clean=JSON.parse(encoded);
          check(spec.validate(clean)===true,'invalid value for '+key);
        }catch(error){
          throw Error('UI Session Manager: invalid value for '+key+': '+error.message);
        }
        return [key,clean];
      });
      ensureWritable(scope);
      const ctx=context(scope);
      let changed=false;
      for(const [key,value] of validated)
        changed=registry.set(key,value,ctx)||changed;
      return changed?commitChanged(scope,ctx):Promise.resolve(false);
    }
    function reset(key){return set(key,specFor(key).defaultValue);}
    async function flush(){await Promise.all([...queues.values()]);}
    function lastErrors(){return [...errors.entries()].map(([scope,error])=>({
      scope,message:String(error&&error.message||error)
    }));}
    // Explicit recovery only. A stale writer can never silently rebase over
    // a newer saved envelope in another tab. Reads are durable IDB checks.
    async function retryFailed(){
      check(ready&&!restoring,'restore state before retry');
      await Promise.allSettled([...queues.values()]);
      let resolved=0;
      for(const id of [...errors.keys()]){
        const target=locations.get(id),failed=failedWrites.get(id);
        check(target&&failed,'failed write evidence required');
        check(!failed.stagingFailed,
          'pending UI staging failed; original evidence preserved');
        const expected=revisions.get(id)||0;
        let remote;
        try{remote=await store.read(target.scope,target.ctx);}
        catch(error){errors.set(id,error);throw error;}
        const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
        if(remote.revision===expected+1&&failed.revision===expected&&
           same(remote.envelope,failed.frame)){
          // IDB committed, but the acknowledgement failed. Re-read confirms
          // exact bytes and revision; do not write a second copy.
          if(typeof store.acknowledge==='function')
            store.acknowledge(target.scope,target.ctx,failed.frame,remote.revision);
          revisions.set(id,remote.revision);
          errors.delete(id);failedWrites.delete(id);
          queues.set(id,Promise.resolve(true));
          if(same(remote.envelope,registry.snapshot(target.scope,target.ctx))){
            resolved++;continue;
          }
          // An additional in-memory edit still needs its own CAS write.
        }else if(remote.revision!==expected){
          const error=Error('UI Session Manager: revision conflict; newer saved state preserved');
          errors.set(id,error);throw error;
        }
        await schedule(target.scope,target.ctx);
        resolved++;
      }
      return resolved;
    }
    // BFCache restores the live JS heap, not the database revision map.
    // Verify every registered scope before re-enabling writes. A pending
    // journal or failed write requires explicit recovery/reload, not a
    // silent rebase over a record written while this page was suspended.
    async function verifyResumed(){
      check(ready&&!restoring,'restore state before resume');
      for(const scope of SCOPES){
        if(![...specs.values()].some(x=>x.scope===scope))continue;
        const ctx=context(scope),id=group(scope);
        check(!errors.has(id),'failed UI write; export recovery JSON and reload');
        const pending=typeof store.readPending==='function'?
          store.readPending(scope,ctx):null;
        check(!pending,'unacknowledged UI write; export recovery JSON and reload');
        const row=await store.read(scope,ctx);
        check(row&&row.revision===(revisions.get(id)||0),
          'BFCache revision conflict; newer UI state preserved');
        if(row.envelope){
          const current=registry.snapshot(scope,ctx);
          for(const [key,value] of Object.entries(row.envelope.values)){
            check(JSON.stringify(current.values[key])===JSON.stringify(value),
              'BFCache UI state conflict; newer UI state preserved');
          }
        }
      }
      return true;
    }
    // Bind only after restoration, so applying a restored open state is
    // not mistaken for a user edit. The browser's delayed native toggle
    // event is also harmless because equal values create no write.
    function bindDetails(key,element,{onError}={}){
      check(ready,'restore state before binding');
      const spec=specFor(key);
      check(spec.validate(true)===true&&spec.validate(false)===true,
        'details binding requires a boolean state');
      if(!element)return ()=>{};
      check(typeof element.addEventListener==='function'&&
        typeof element.removeEventListener==='function'&&'open' in element,
        'details element required');
      let applying=false;
      const sync=value=>{
        applying=true;
        try{element.open=value;}finally{applying=false;}
      };
      sync(get(key));
      const off=subscribe(key,sync);
      const toggle=()=>{
        if(applying||element.open===get(key))return;
        set(key,element.open).catch(error=>{
          if(onError)onError(error);
        });
      };
      element.addEventListener('toggle',toggle);
      return ()=>{off();element.removeEventListener('toggle',toggle);};
    }
    // A generic selectable control group (tabs, views, radio-like buttons).
    // Each item is {element, value}; page code declares values, not storage.
    function bindChoices(key,items,{onError}={}){
      check(ready,'restore state before binding');
      specFor(key);
      check(Array.isArray(items),'choices must be an array');
      const pairs=items.filter(item=>item&&item.element);
      const sync=value=>{
        for(const {element,value:option} of pairs)
          element.setAttribute('aria-pressed',value===option?'true':'false');
      };
      sync(get(key));
      const off=subscribe(key,sync),cleanup=[];
      for(const {element,value} of pairs){
        check(typeof element.addEventListener==='function'&&
          typeof element.removeEventListener==='function'&&
          typeof element.setAttribute==='function','invalid choice element');
        const handler=()=>set(key,value).catch(error=>{if(onError)onError(error);});
        element.addEventListener('click',handler);
        cleanup.push(()=>element.removeEventListener('click',handler));
      }
      return ()=>{off();for(const fn of cleanup)fn();};
    }
    return Object.freeze({register,restore,get,set,setMany,reset,subscribe,flush,
      lastErrors,retryFailed,verifyResumed,bindDetails,bindChoices,isReady:()=>ready});
  }
  return Object.freeze({create});
}));