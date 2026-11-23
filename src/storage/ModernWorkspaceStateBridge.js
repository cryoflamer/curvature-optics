/* Compatibility bridge for gradual Modern workspace-section migration.
 * Uses the generic session manager; owns no storage keys or DOM event handlers.
 * Activates only when explicitly requested by Modern's preview gate.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernWorkspaceStateBridge=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEY_PREFIX='workspace.section.';
  const MODES=Object.freeze(['scene','compare']);
  const SUFFIX=/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
  function check(ok,what){if(!ok)throw Error('Workspace State Bridge: '+what);}
  function create({registryApi,sessionStoreApi,managerApi,env,
    suffixes,legacyValue}={}){
    check(registryApi&&typeof registryApi.create==='function'&&
      sessionStoreApi&&typeof sessionStoreApi.create==='function'&&
      managerApi&&typeof managerApi.create==='function'&&
      typeof legacyValue==='function','generic registry/store/manager and legacy reader required');
    check(Array.isArray(suffixes)&&suffixes.length&&new Set(suffixes).size===suffixes.length&&
      suffixes.every(x=>typeof x==='string'&&SUFFIX.test(x)),
      'invalid section declarations');
    const supported=new Set(suffixes),store=sessionStoreApi.create(env);
    const managers=new Map();
    for(const mode of MODES){
      const manager=managerApi.create({registry:registryApi.create(),store,workspace:mode});
      for(const suffix of suffixes){
        const initial=legacyValue(mode,suffix);
        check(typeof initial==='boolean','invalid legacy section default: '+mode+'.'+suffix);
        manager.register({key:KEY_PREFIX+suffix,scope:'per-tab-and-workspace',
          version:1,defaultValue:initial,validate:v=>typeof v==='boolean'});
      }
      managers.set(mode,manager);
    }
    let ready=false;
    function selected(mode,suffix){
      check(MODES.includes(mode)&&supported.has(suffix),'unregistered workspace section');
      return managers.get(mode);
    }
    async function restore(){
      check(!ready,'already restored');
      // Never write during a read-first import. Unsupported/corrupt newer
      // records fail without rewriting the original legacy preferences.
      const results=await Promise.all(MODES.map(mode=>managers.get(mode).restore()));
      ready=true;
      return Object.freeze({ready:true,
        warnings:results.flatMap((r,i)=>r.unrecognizedKeys.map(key=>MODES[i]+':'+key))});
    }
    function get(mode,suffix){
      check(ready,'restore first');
      return selected(mode,suffix).get(KEY_PREFIX+suffix);
    }
    function set(mode,suffix,value){
      check(ready,'restore first');
      check(typeof value==='boolean','invalid section state');
      return selected(mode,suffix).set(KEY_PREFIX+suffix,value);
    }
    async function reset(values){
      check(ready,'restore first');
      check(typeof values==='function','default reader required');
      // Preflight every scope before touching either one. A reset should
      // acknowledge one versioned snapshot per workspace, not N writes for
      // each of the N registered disclosure sections.
      const patches=new Map();
      for(const mode of MODES){
        const patch=Object.create(null);
        for(const suffix of suffixes){
          const value=values(mode,suffix);
          check(typeof value==='boolean','invalid reset default');
          patch[KEY_PREFIX+suffix]=value;
        }
        patches.set(mode,patch);
      }
      await Promise.all(MODES.map(mode=>managers.get(mode).setMany(patches.get(mode))));
    }
    async function flush(){await Promise.all([...managers.values()].map(m=>m.flush()));}
    function lastErrors(){return MODES.flatMap(mode=>managers.get(mode).lastErrors().map(
      entry=>({mode,scope:entry.scope,message:entry.message})));
    }
    return Object.freeze({restore,get,set,reset,flush,lastErrors,
      supports:suffix=>supported.has(suffix),isReady:()=>ready,
      tabId:()=>store.tabId(),modes:MODES.slice(),sections:suffixes.slice()});
  }
  return Object.freeze({KEY_PREFIX,MODES,create});
}));