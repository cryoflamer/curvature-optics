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
  const TAB_KEY='workspace.settingsTab',ACTIVE_KEY='workspace.active';
  const TABS=Object.freeze(['Camera','Surface','Atmosphere','Objects','Display']);
  const WORKSPACES=Object.freeze(['scene','compare','animation','calibration','images','demos']);
  const MODES=Object.freeze(['scene','compare']);
  const SUFFIX=/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
  function check(ok,what){if(!ok)throw Error('Workspace State Bridge: '+what);}
  function create({registryApi,sessionStoreApi,managerApi,env,
    suffixes,legacyValue,legacyTab,legacyMode}={}){
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
      // Tab selection belongs to this same workspace snapshot, not to a new
      // DOM listener or a second storage controller.
      const tab=legacyTab?legacyTab(mode):'Camera';
      check(TABS.includes(tab),'invalid legacy settings tab: '+mode);
      manager.register({key:TAB_KEY,scope:'per-tab-and-workspace',
        version:1,defaultValue:tab,validate:v=>TABS.includes(v)});
      if(mode==='scene'){
        const active=legacyMode?legacyMode():null;
        check(active===null||WORKSPACES.includes(active),'invalid legacy workspace');
        manager.register({key:ACTIVE_KEY,scope:'per-tab',version:1,
          defaultValue:active,validate:v=>v===null||WORKSPACES.includes(v)});
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
    function tabManager(mode){
      check(MODES.includes(mode),'unknown workspace settings tab');
      return managers.get(mode);
    }
    function getTab(mode){check(ready,'restore first');return tabManager(mode).get(TAB_KEY);}
    function setTab(mode,value){
      check(ready&&TABS.includes(value),'invalid settings tab');
      return tabManager(mode).set(TAB_KEY,value);
    }
    function getMode(){check(ready,'restore first');return managers.get('scene').get(ACTIVE_KEY);}
    function setMode(value){
      check(ready&&(value===null||WORKSPACES.includes(value)),'invalid workspace');
      return managers.get('scene').set(ACTIVE_KEY,value);
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
        patch[TAB_KEY]='Camera';
        patches.set(mode,patch);
      }
      // Scopes are independently acknowledged, not falsely atomic.
      await Promise.all(MODES.map(mode=>managers.get(mode).setMany(patches.get(mode))));
      await managers.get('scene').set(ACTIVE_KEY,null);
    }
    async function flush(){await Promise.all([...managers.values()].map(m=>m.flush()));}
    function lastErrors(){return MODES.flatMap(mode=>managers.get(mode).lastErrors().map(
      entry=>({mode,scope:entry.scope,message:entry.message})));
    }
    return Object.freeze({restore,get,set,getTab,setTab,getMode,setMode,reset,flush,lastErrors,
      supports:suffix=>supported.has(suffix),isReady:()=>ready,
      tabId:()=>store.tabId(),modes:MODES.slice(),sections:suffixes.slice()});
  }
  return Object.freeze({KEY_PREFIX,MODES,create});
}));