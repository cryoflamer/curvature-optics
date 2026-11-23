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
  const SCOPES=['global','per-tab','per-tab-and-workspace'];
  function check(ok,reason){if(!ok)throw Error('UI Session Manager: '+reason);}
  function create({registry,store,workspace=null}={}){
    check(registry&&typeof registry.register==='function'&&
      typeof registry.snapshot==='function'&&
      typeof registry.hydrate==='function'&&
      store&&typeof store.read==='function'&&
      typeof store.write==='function'&&typeof store.tabId==='function',
      'registry and session-store adapters required');
    const specs=new Map(),revisions=new Map(),queues=new Map(),errors=new Map();
    let ready=false,restoring=false;
    function register(spec){
      check(!ready&&!restoring,'register before restore');
      const registered=registry.register(spec);
      specs.set(spec.key,registered);
      return registered;
    }
    function context(scope){
      if(scope==='global')return {};
      const id=store.tabId();
      if(scope==='per-tab')return {tabId:id};
      check(typeof workspace==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(workspace),
        'workspace name required');
      return {tabId:id,workspace};
    }
    function group(scope){return scope+':'+JSON.stringify(context(scope));}
    async function restore(){
      check(!ready&&!restoring,'restore can run only once');
      restoring=true;
      const warnings=[];
      try{
        for(const scope of SCOPES){
          if(![...specs.values()].some(x=>x.scope===scope))continue;
          const ctx=context(scope);
          const row=await store.read(scope,ctx);
          check(row&&Number.isSafeInteger(row.revision)&&row.revision>=0,
            'invalid stored revision for '+scope);
          revisions.set(group(scope),row.revision);
          if(row.envelope){
            const report=registry.hydrate(row.envelope,ctx);
            for(const key of report.rejected)warnings.push(key);
          }
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
    function set(key,value){
      check(ready&&!restoring,'restore state before user changes');
      const spec=specFor(key),ctx=context(spec.scope);
      const changed=registry.set(key,value,ctx);
      if(!changed)return Promise.resolve(false);
      const id=group(spec.scope);
      const previous=queues.get(id)||Promise.resolve();
      const pending=previous.catch(()=>{}).then(async()=>{
        // Snapshot at commit time: rapid changes in one scope never
        // replay a stale copy over a later UI choice.
        const frame=registry.snapshot(spec.scope,ctx);
        const revision=revisions.get(id)||0;
        try{
          const saved=await store.write(spec.scope,ctx,frame,revision);
          check(saved&&Number.isSafeInteger(saved.revision)&&
            saved.revision===revision+1,'missing acknowledged revision');
          revisions.set(id,saved.revision);errors.delete(id);
          return true;
        }catch(error){errors.set(id,error);throw error;}
      });
      queues.set(id,pending);
      return pending;
    }
    function reset(key){return set(key,specFor(key).defaultValue);}
    async function flush(){await Promise.all([...queues.values()]);}
    function lastErrors(){return [...errors.entries()].map(([scope,error])=>({
      scope,message:String(error&&error.message||error)
    }));}
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
    return Object.freeze({register,restore,get,set,reset,subscribe,flush,
      lastErrors,bindDetails,bindChoices,isReady:()=>ready});
  }
  return Object.freeze({create});
}));