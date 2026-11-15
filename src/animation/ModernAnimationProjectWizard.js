/* Pure, transient creation workflow for constrained Animation Project v2.
 * History remains read-only. The new contract is always derived from a
 * validated reference snapshot and checked by the rendering engine.
 */
(function(root,factory){
  var state=root.CurvatureModernExperimentState;
  var contracts=root.CurvatureModernAnimationContract;
  var projects=root.CurvatureModernAnimationProject;
  if(typeof module==='object'&&module.exports){
    state=require('../ui/modern/ModernExperimentState');
    contracts=require('./ModernAnimationContract');
    projects=require('./ModernAnimationProject');
  }
  var api=factory(state,contracts,projects);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationProjectWizard=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state,contracts,projects){
  'use strict';
  var MODES=['camera','physical','experimental'];
  var PARAMETERS=[['surface.curvature','Earth curvature'],
    ['temperatureProfile.gradientKPerKm','Temperature gradient']];
  function initial(){return {step:0,mode:'camera',reference:null,referenceId:null,
    referenceName:'',target:null,includeReference:true,selectedIds:[],
    name:'',description:'',query:'',showIncompatible:false};}
  function clone(w){return Object.assign({},w,{selectedIds:w.selectedIds.slice()});}
  function mode(w,value){
    if(!MODES.includes(value))throw RangeError('Unknown animation type');
    var result=clone(w);result.mode=value;result.target=null;result.selectedIds=[];
    return result;
  }
  function reference(w,experiment,id,name){
    if(id!==null&&!(Number.isSafeInteger(id)&&id>0)&&
      !(typeof id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(id)))
      throw RangeError('Invalid reference snapshot ID');
    var result=clone(w);
    result.reference=state.validate(experiment);result.referenceId=id;
    result.referenceName=typeof name==='string'?name.slice(0,120):'';
    result.target=null;result.selectedIds=[];result.query='';
    return result;
  }
  function targets(w){
    if(!w.reference)return [];
    var scope=w.reference.display.mode==='compare'?['A','B']:['scene'];
    var list=[];
    scope.forEach(function(s){PARAMETERS.forEach(function(p){
      var target={scope:s,parameter:p[0]};
      try{contracts.create(w.reference,{mode:'physical',target:target});
        list.push({value:s+'|'+p[0],target:target,label:s+' · '+p[1]});
      }catch(_error){/* An inactive channel must not be offered. */}
    });});
    return list;
  }
  function chooseTarget(w,value){
    if(w.mode!=='physical')throw RangeError('Physical target only');
    var found=targets(w).find(function(t){return t.value===value;});
    if(!found)throw RangeError('Physical channel is not active for this reference');
    var result=clone(w);result.target=found.target;result.selectedIds=[];
    return result;
  }
  function contract(w){
    if(!w.reference)throw RangeError('Choose a reference experiment first');
    if(w.mode==='physical'&&!w.target)throw RangeError('Choose a physical channel first');
    return contracts.create(w.reference,{mode:w.mode,target:w.mode==='physical'?w.target:null});
  }
  function check(w,entry){
    var c=contract(w);
    try{return contracts.inspectCandidate(c,entry.experiment);}
    catch(error){return {allowed:false,issues:[{code:'invalid-snapshot',path:error.message}]};}
  }
  function toggle(w,id,entries){
    var record=entries.find(function(item){return item.id===id;});
    if(!record||id===w.referenceId)throw RangeError('Unknown or reference snapshot');
    var result=clone(w),index=result.selectedIds.indexOf(id);
    if(index>=0)result.selectedIds.splice(index,1);
    else{
      if(!check(w,record).allowed)throw RangeError('Snapshot violates project constraints');
      if(result.selectedIds.length+(w.includeReference?1:0)>=200)
        throw RangeError('Project allows at most 200 keyframes');
      result.selectedIds.push(id);
    }
    return result;
  }
  function patch(w,key,value){
    if(!['name','description','query','includeReference','showIncompatible'].includes(key))
      throw RangeError('Invalid wizard property');
    var result=clone(w);
    if(key==='includeReference'||key==='showIncompatible')result[key]=!!value;
    else if(typeof value==='string'){
      var limit=key==='description'?1000:key==='query'?160:120;
      if(value.length>limit)throw RangeError('Wizard text is too long');
      result[key]=value;
    }else throw RangeError('Invalid wizard text');
    return result;
  }
  function navigate(w,step){
    if(!Number.isInteger(step)||step<0||step>4||step>w.step+1)
      throw RangeError('Invalid wizard step');
    if(step>1&&!w.reference)throw RangeError('Choose a reference experiment');
    if(step>2&&w.mode==='physical'&&!w.target)
      throw RangeError('Choose a physical animation channel');
    var result=clone(w);result.step=step;return result;
  }
  function chosen(w,entries){
    var lookup=new Map(entries.map(function(e){return [e.id,e];}));
    var frames=[];
    if(w.includeReference)frames.push({id:w.referenceId,name:w.referenceName||'Reference',
      experiment:w.reference});
    w.selectedIds.forEach(function(id){
      var entry=lookup.get(id);
      if(!entry)throw RangeError('A selected History snapshot is no longer available');
      if(!check(w,entry).allowed)throw RangeError('A selected History snapshot is no longer compatible');
      frames.push({id:id,name:entry.name||'Snapshot '+id,experiment:entry.experiment});
    });
    return frames;
  }
  function build(w,entries){
    if(!w.reference||!w.name.trim())throw RangeError('Choose a reference and name the project');
    if(w.name.length>120||w.description.length>1000)
      throw RangeError('Project metadata is too long');
    var c=contract(w),frames=chosen(w,entries);
    return projects.createV2(c,frames,{id:'wizard_draft',name:w.name.trim(),
      description:w.description.trim()});
  }
  return Object.freeze({initial:initial,mode:mode,reference:reference,
    targets:targets,chooseTarget:chooseTarget,contract:contract,check:check,
    toggle:toggle,patch:patch,navigate:navigate,chosen:chosen,build:build});
}));
