/* Draft preparation for Animation Studio. Nothing is written to History,
 * preferences or the live experiment; the editor uses owned experiment states.
 */
(function(root,factory){
  var state=root.CurvatureModernExperimentState;
  var sequence=root.CurvatureModernCameraSequence;
  var compatibility=root.CurvatureModernAnimationCompatibility;
  var projects=root.CurvatureModernAnimationProject;
  if(typeof module==='object'&&module.exports){
    state=require('../ui/modern/ModernExperimentState');
    sequence=require('../camera/ModernCameraSequence');
    compatibility=require('./ModernAnimationCompatibility');
    projects=require('./ModernAnimationProject');
  }
  var api=factory(state,sequence,compatibility,projects);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationStudio=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state,sequence,compatibility,projects){
  'use strict';
  var MAX_FRAMES=200;
  function cleanText(text,max){
    if(typeof text!=='string'||text.length>max)throw RangeError('Invalid Studio text');
    return text;
  }
  function blank(){return {name:'Animation study',description:'',mode:'auto',target:'auto',
    source:'none',frames:[]};}
  function copy(draft){return {name:draft.name,description:draft.description,mode:draft.mode,
    target:draft.target,source:draft.source,frames:draft.frames.map(function(frame){
      return Object.assign({},frame);
    })};}
  function history(ids,entries,previous){
    if(!Array.isArray(ids)||ids.length>MAX_FRAMES)throw RangeError('Too many selected snapshots');
    var found=new Map(entries.map(function(entry){return [entry.id,entry];}));
    var old=previous&&previous.source==='history'?new Map(previous.frames.map(function(f){
      return [f.key,f];
    })):new Map();
    var draft=previous?copy(previous):blank(),seen=new Set();
    draft.frames=ids.filter(function(id){
      if(seen.has(id))return false;seen.add(id);return found.has(id);
    }).map(function(id,i){
      var entry=found.get(id),before=old.get('history-'+id);
      return {key:'history-'+id,sourceSnapshotId:id,
        name:before?before.name:(entry.name||'Frame '+(i+1)),
        experiment:state.validate(entry.experiment),
        travelMs:i===0?0:before&&before.travelMs?before.travelMs:5000,
        holdMs:before?before.holdMs:0,
        easing:before?before.easing:'linear'};
    });
    draft.source='history';return draft;
  }
  function importCamera(experiment,frames,previous){
    var validated=sequence.validate(frames);
    if(validated.length<2)throw RangeError('Camera Animation needs at least two keyframes');
    var base=state.validate(experiment),draft=previous?copy(previous):blank();
    draft.mode='camera';draft.target='auto';draft.source='camera-sequence';
    draft.frames=validated.map(function(frame,i){
      var snapshot=state.validate(base);
      snapshot.scene.camera=Object.assign({},frame.camera);
      return {key:'camera-'+i,sourceSnapshotId:null,name:frame.name,
        experiment:state.validate(snapshot),travelMs:frame.travelMs,holdMs:frame.holdMs,
        easing:frame.easing};
    });
    return draft;
  }
  function target(value){
    if(value==='auto')return null;
    var parts=String(value).split('|');
    if(parts.length!==2||!['scene','A','B'].includes(parts[0])||
      !['surface.curvature','temperatureProfile.gradientKPerKm'].includes(parts[1]))
      throw RangeError('Invalid Studio target');
    return {scope:parts[0],parameter:parts[1]};
  }
  function edit(draft,property,value){
    var next=copy(draft);
    if(property==='name')next.name=cleanText(value,120);
    else if(property==='description')next.description=cleanText(value,1000);
    else if(property==='mode'){
      if(!['auto','camera','physical'].includes(value))throw RangeError('Invalid mode');
      next.mode=value;next.target='auto';
    }else if(property==='target'){target(value);next.target=value;}
    else throw RangeError('Invalid editor property');
    return next;
  }
  function editFrame(draft,key,property,value){
    var next=copy(draft),frame=next.frames.find(function(f){return f.key===key;});
    if(!frame)throw RangeError('Unknown Studio frame');
    if(property==='name'){
      frame.name=cleanText(value,120);
    }else if(property==='easing'){
      if(!['linear','smoothstep'].includes(value))throw RangeError('Invalid easing');
      frame.easing=value;
    }else if(property==='travelMs'||property==='holdMs'){
      // Editors receive seconds. Reject bad entries rather than silently
      // rounding, coercing empty text to zero or clipping to a legal range.
      if(typeof value!=='string'||!value.trim())throw RangeError('Enter a duration in seconds');
      var seconds=Number(value),ms=seconds*1000;
      if(!Number.isFinite(ms)||ms<0||ms>120000||
        (property==='travelMs'&&next.frames.indexOf(frame)>0&&ms<200))
        throw RangeError('Duration out of range');
      frame[property]=ms;
    }else throw RangeError('Invalid frame property');
    if(next.frames[0])next.frames[0].travelMs=0;
    return next;
  }
  function move(draft,key,step){
    var next=copy(draft),index=next.frames.findIndex(function(f){return f.key===key;});
    if(index<0||![1,-1].includes(step)||index+step<0||index+step>=next.frames.length)
      return next;
    var item=next.frames.splice(index,1)[0];next.frames.splice(index+step,0,item);
    next.frames[0].travelMs=0;
    // A frame previously at index 0 needs an inbound duration when moved.
    for(var i=1;i<next.frames.length;i++)if(next.frames[i].travelMs<200)next.frames[i].travelMs=5000;
    return next;
  }
  function remove(draft,key){
    var next=copy(draft);next.frames=next.frames.filter(function(f){return f.key!==key;});
    if(next.frames.length)next.frames[0].travelMs=0;
    return next;
  }
  function inspect(draft){
    if(draft.frames.length<2)return {compatible:false,mode:null,target:null,changedPaths:[],
      issues:[{code:'insufficient-frames',path:'keyframes'}]};
    try{
      var options={};
      if(draft.mode!=='auto')options.mode=draft.mode;
      if(draft.target!=='auto')options.target=target(draft.target);
      var result=compatibility.inspect(draft.frames.map(function(frame){return frame.experiment;}),options);
      var issues=result.issues.slice();
      if(!draft.name.trim())issues.push({code:'missing-name',path:'name'});
      draft.frames.forEach(function(f,i){
        if(!f.name.trim())issues.push({code:'missing-frame-name',path:'keyframes.'+i+'.name'});
        if(i&&f.travelMs<200)issues.push({code:'invalid-duration',path:'keyframes.'+i+'.travelMs'});
      });
      return Object.assign({},result,{compatible:issues.length===0,issues:issues});
    }catch(error){return {compatible:false,mode:null,target:null,changedPaths:[],
      issues:[{code:'invalid-draft',path:error.message}]};}
  }
  function build(draft,id){
    var result=inspect(draft);
    if(!result.compatible){
      var error=new RangeError('Animation draft is incompatible');error.issues=result.issues;
      throw error;
    }
    return projects.create(draft.frames.map(function(f){
      return {id:f.sourceSnapshotId===null?undefined:f.sourceSnapshotId,
        name:f.name,experiment:f.experiment,travelMs:f.travelMs,
        holdMs:f.holdMs,easing:f.easing};
    }),{id:id,name:draft.name,description:draft.description,
      mode:result.mode,target:result.target});
  }
  return Object.freeze({blank:blank,history:history,importCamera:importCamera,
    edit:edit,editFrame:editFrame,move:move,remove:remove,inspect:inspect,build:build});
}));
