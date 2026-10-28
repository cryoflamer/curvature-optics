/* Named local experiments; always reuse the versioned experiment validator. */
(function(root,factory){
  var validator=root.CurvatureModernExperimentState;
  if(!validator&&typeof module==='object'&&module.exports)validator=require('./ModernExperimentState');
  var api=factory(validator);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernExperimentLibrary=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state){
  'use strict';
  var KEY='curvature-modern-library-v1',MAX_ENTRIES=50,MAX_JSON=200000;
  function requireState(){if(!state||!state.validate)throw Error('Experiment validator unavailable');}
  function nameOf(name){
    if(typeof name!=='string')throw RangeError('Experiment name must be text');
    name=name.trim();
    if(!name||name.length>100||/[\u0000-\u001f\u007f]/.test(name))throw RangeError('Invalid experiment name');
    return name;
  }
  function clean(value){
    requireState();
    if(!Array.isArray(value)||value.length>MAX_ENTRIES)throw RangeError('Invalid experiment library');
    var seen=new Set();
    return value.map(function(entry){
      if(!entry||typeof entry!=='object'||Array.isArray(entry)||
          Object.keys(entry).sort().join(',')!=='experiment,name')throw RangeError('Invalid library entry');
      var name=nameOf(entry.name),key=name.toLocaleLowerCase();
      if(seen.has(key))throw RangeError('Duplicate experiment name');
      seen.add(key);
      return {name:name,experiment:state.validate(entry.experiment)};
    });
  }
  function read(storage){
    if(!storage)throw Error('Browser storage unavailable');
    var value=storage.getItem(KEY);
    return value===null?[]:clean(JSON.parse(value));
  }
  function write(storage,entries){
    if(!storage)throw Error('Browser storage unavailable');
    var valid=clean(entries);
    storage.setItem(KEY,JSON.stringify(valid));
    return valid;
  }
  function save(storage,name,experiment){
    name=nameOf(name);
    var entries=read(storage),key=name.toLocaleLowerCase(),index=entries.findIndex(function(e){return e.name.toLocaleLowerCase()===key;});
    var entry={name:name,experiment:state.validate(experiment)};
    if(index===-1){if(entries.length>=MAX_ENTRIES)throw RangeError('Experiment library is full');entries.push(entry);}
    else entries[index]=entry;
    return write(storage,entries);
  }
  function remove(storage,name){
    var key=nameOf(name).toLocaleLowerCase(),entries=read(storage);
    var filtered=entries.filter(function(e){return e.name.toLocaleLowerCase()!==key;});
    if(filtered.length===entries.length)throw RangeError('Experiment not found');
    return write(storage,filtered);
  }
  function importJson(text){
    if(typeof text!=='string'||text.length>MAX_JSON)throw RangeError('JSON file too large');
    var parsed=JSON.parse(text);
    // A plain exported experiment is intentionally compatible with URL state.
    return state.validate(parsed);
  }
  function exportJson(experiment){return JSON.stringify(state.validate(experiment),null,2)+'\n';}
  return Object.freeze({KEY:KEY,MAX_ENTRIES:MAX_ENTRIES,read:read,write:write,save:save,
    remove:remove,importJson:importJson,exportJson:exportJson,nameOf:nameOf});
}));
