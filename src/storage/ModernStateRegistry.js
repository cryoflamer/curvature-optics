/* Declarative, host-agnostic UI state registry.
 * Opt-in foundation: no Modern entrypoint loads this module yet.
 * Domain projects/photos/drafts must never be registered as UI state.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernStateRegistry=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='curvature-modern-ui-state',VERSION=1;
  const SCOPES=Object.freeze(['per-tab','per-tab-and-workspace','global','workspace']);
  const KEY=/^[a-z][a-zA-Z0-9-]*(?:\.[a-z][a-zA-Z0-9-]*)+$/;
  const ID=/^[A-Za-z0-9_-]{1,128}$/;
  function check(ok,message){if(!ok)throw Error('State Registry: '+message);}
  function clone(value){
    let text;
    try{text=JSON.stringify(value);}catch(ignore){}
    check(typeof text==='string','state must be JSON-compatible');
    const result=JSON.parse(text);
    return result;
  }
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function create(){
    const specs=new Map(),values=new Map(),listeners=new Map(),unrecognized=[];
    function validContext(scope,context){
      if(scope==='global')return 'global';
      if(scope==='workspace'){
        check(context&&typeof context.workspace==='string'&&ID.test(context.workspace),
          'workspace ID required');
        return JSON.stringify(['shared-workspace',context.workspace]);
      }
      check(context&&typeof context.tabId==='string'&&ID.test(context.tabId),
        'tab ID required for '+scope);
      if(scope==='per-tab')return JSON.stringify(['tab',context.tabId]);
      check(typeof context.workspace==='string'&&ID.test(context.workspace),
        'workspace ID required');
      return JSON.stringify(['workspace',context.tabId,context.workspace]);
    }
    function bucket(scope,context){return scope+':'+validContext(scope,context);}
    function register(spec){
      check(spec&&typeof spec==='object'&&KEY.test(spec.key||''),'invalid state key');
      check(SCOPES.includes(spec.scope),'invalid scope for '+spec.key);
      check(Number.isSafeInteger(spec.version)&&spec.version>=1,'invalid schema version');
      check(typeof spec.validate==='function','validator required for '+spec.key);
      check(spec.migrate===undefined||typeof spec.migrate==='function',
        'migration must be a function');
      check(!spec.documentData,'UI registry cannot own document data');
      check(!specs.has(spec.key),'duplicate state owner: '+spec.key);
      const initial=clone(spec.defaultValue);
      check(spec.validate(clone(initial))===true,'default rejected: '+spec.key);
      const frozen=Object.freeze({key:spec.key,scope:spec.scope,
        version:spec.version,defaultValue:initial,validate:spec.validate,
        migrate:spec.migrate||null});
      specs.set(spec.key,frozen);
      return frozen;
    }
    function specFor(key){
      check(specs.has(key),'unregistered state: '+key);
      return specs.get(key);
    }
    function group(spec,context){
      const id=bucket(spec.scope,context);
      if(!values.has(id))values.set(id,new Map());
      return values.get(id);
    }
    function get(key,context){
      const spec=specFor(key),data=group(spec,context);
      return clone(data.has(key)?data.get(key):spec.defaultValue);
    }
    function set(key,value,context){
      const spec=specFor(key),clean=clone(value);
      check(spec.validate(clone(clean))===true,'invalid value for '+key);
      const before=get(key,context);
      if(same(before,clean))return false;
      group(spec,context).set(key,clean);
      const current=clone(clean);
      for(const listener of listeners.get(key)||[])
        listener(clone(current),clone(before),context);
      return true;
    }
    function reset(key,context){return set(key,specFor(key).defaultValue,context);}
    function subscribe(key,listener){
      specFor(key);
      check(typeof listener==='function','subscriber must be a function');
      if(!listeners.has(key))listeners.set(key,new Set());
      listeners.get(key).add(listener);
      return ()=>listeners.get(key).delete(listener);
    }
    function snapshot(scope,context){
      check(SCOPES.includes(scope),'unsupported scope');
      const result=Object.create(null);
      for(const spec of specs.values()){
        if(spec.scope!==scope)continue;
        result[spec.key]={version:spec.version,value:get(spec.key,context)};
      }
      return {format:FORMAT,version:VERSION,scope,values:result};
    }
    function hydrate(envelope,context){
      check(envelope&&envelope.format===FORMAT&&envelope.version===VERSION&&
        SCOPES.includes(envelope.scope)&&envelope.values&&
        typeof envelope.values==='object'&&!Array.isArray(envelope.values),
        'invalid snapshot envelope');
      // Validate context even for an empty envelope before applying any key.
      const id=bucket(envelope.scope,context);
      const accepted=new Map(),rejected=[];
      for(const [key,row] of Object.entries(envelope.values)){
        const spec=specs.get(key);
        if(!spec||spec.scope!==envelope.scope||!row||
          !Number.isSafeInteger(row.version)||row.version<1||
          row.version>spec.version){
          rejected.push(key);unrecognized.push({key,scope:envelope.scope,
            context:id,raw:row===undefined?null:clone(row)});continue;
        }
        try{
          if(row.version!==spec.version&&!spec.migrate)throw Error('missing migration');
          const value=row.version===spec.version?clone(row.value):
            clone(spec.migrate(clone(row.value),row.version));
          if(spec.validate(clone(value))!==true)throw Error('unusable state');
          accepted.set(key,value);
        }catch(ignore){
          rejected.push(key);unrecognized.push({key,scope:envelope.scope,
            context:id,raw:row===undefined?null:clone(row)});
        }
      }
      // No change events while programmatically hydrating DOM state.
      const groupMap=values.get(id)||new Map();
      for(const [key,value] of accepted)groupMap.set(key,value);
      values.set(id,groupMap);
      return Object.freeze({applied:[...accepted.keys()],rejected});
    }
    function evidence(){return clone(unrecognized);}
    return Object.freeze({register,get,set,reset,subscribe,snapshot,hydrate,
      evidence,keys:()=>[...specs.keys()]});
  }
  return Object.freeze({FORMAT,VERSION,SCOPES,create});
}));