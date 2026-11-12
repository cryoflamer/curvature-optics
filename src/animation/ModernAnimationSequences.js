/* Deterministic discovery of maximal compatible keyframe subsequences.
 * Only fixed-state signatures are grouped; every candidate is then checked
 * against the authoritative animation compatibility validator. No mutations.
 */
(function(root,factory){
  var compatibility=root.CurvatureModernAnimationCompatibility;
  if(typeof module==='object'&&module.exports)
    compatibility=require('./ModernAnimationCompatibility');
  var api=factory(compatibility);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationSequences=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(compatibility){
  'use strict';
  var CAMERA=['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'];
  var PHYSICAL=['surface.curvature','temperatureProfile.gradientKPerKm'];
  function clone(value){
    if(Array.isArray(value))return value.map(clone);
    if(value&&typeof value==='object'){
      var result={};Object.keys(value).forEach(function(key){result[key]=clone(value[key]);});
      return result;
    }
    return value;
  }
  function canonical(value){
    if(typeof value==='number'&&Object.is(value,-0))return '(-0)';
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(function(key){
      return JSON.stringify(key)+':'+canonical(value[key]);
    }).join(',')+'}';
    return JSON.stringify(value);
  }
  function signature(effective,mode,target){
    // The effective state has already discarded inactive editor presets. The
    // signature deliberately retains all *other* camera and display fields.
    var filtered=clone(effective);
    if(mode==='camera')CAMERA.forEach(function(field){delete filtered.camera[field];});
    else{
      var node=target.scope==='scene'?filtered.scene:filtered.compare[target.scope];
      var path=target.parameter.split('.');
      if(node&&node[path[0]])delete node[path[0]][path[1]];
    }
    return canonical(filtered);
  }
  function targetPath(target){
    return (target.scope==='scene'?'scene':'compare.'+target.scope)+'.'+target.parameter;
  }
  function discover(frames,filter){
    if(!Array.isArray(frames)||frames.length>200)throw RangeError('Invalid animation frames');
    if(filter!==undefined&&!['auto','camera','physical'].includes(filter))
      throw RangeError('Invalid sequence filter');
    var records=frames.map(function(frame,index){
      try{return {index:index,key:frame.key,experiment:frame.experiment,
        effective:compatibility.effective(frame.experiment)};}
      catch(error){return null;}
    }).filter(Boolean);
    var configurations=[];
    if(filter!=='physical')configurations.push({mode:'camera',target:null});
    if(filter!=='camera'){
      ['scene','A','B'].forEach(function(scope){PHYSICAL.forEach(function(parameter){
        configurations.push({mode:'physical',target:{scope:scope,parameter:parameter}});
      });});
    }
    var result=[];
    configurations.forEach(function(config){
      var groups=new Map();
      records.forEach(function(record){
        var scope=config.target&&config.target.scope;
        if(scope&&(record.effective.mode==='scene')!==(scope==='scene'))return;
        if(scope&&config.target.parameter==='temperatureProfile.gradientKPerKm'){
          var node=scope==='scene'?record.effective.scene:record.effective.compare[scope];
          if(!node||node.atmosphere!=='temperature-lapse')return;
        }
        var key=signature(record.effective,config.mode,config.target);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(record);
      });
      groups.forEach(function(group){
        if(group.length<2)return;
        var verdict;
        try{verdict=compatibility.inspect(group.map(function(record){return record.experiment;}),config);}
        catch(error){return;}
        if(!verdict.compatible)return;
        var changed=verdict.changedPaths;
        var meaningful=config.mode==='camera'?changed.some(function(path){
          return CAMERA.some(function(field){return path==='camera.'+field;});
        }):changed.includes(targetPath(config.target));
        if(!meaningful)return;
        result.push({id:config.mode+'|'+(config.target?config.target.scope+'|'+config.target.parameter:'')+
          '|'+group.map(function(r){return r.index;}).join(','),
          mode:config.mode,target:config.target,
          keys:group.map(function(record){return record.key;}),
          indices:group.map(function(record){return record.index;}),
          names:group.map(function(record){return frames[record.index].name;}),
          changedPaths:changed});
      });
    });
    // Largest useful sequence first; equal-length groups keep source order.
    result.sort(function(a,b){return b.keys.length-a.keys.length||a.indices[0]-b.indices[0]||
      a.mode.localeCompare(b.mode)||String(a.id).localeCompare(String(b.id));});
    return result;
  }
  return Object.freeze({discover:discover});
}));
