/* Draft preparation for Animation Studio. Nothing is written to History,
 * preferences or the live experiment; the editor uses owned experiment states.
 */
(function(root,factory){
  var state=root.CurvatureModernExperimentState;
  var sequence=root.CurvatureModernCameraSequence;
  var compatibility=root.CurvatureModernAnimationCompatibility;
  var projects=root.CurvatureModernAnimationProject;
  var sequences=root.CurvatureModernAnimationSequences;
  var naming=root.CurvatureModernSemanticNaming;
  if(typeof module==='object'&&module.exports){
    state=require('../ui/modern/ModernExperimentState');
    sequence=require('../camera/ModernCameraSequence');
    compatibility=require('./ModernAnimationCompatibility');
    projects=require('./ModernAnimationProject');
    sequences=require('./ModernAnimationSequences');
    naming=require('../ui/modern/ModernSemanticNaming');
  }
  var api=factory(state,sequence,compatibility,projects,sequences,naming);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationStudio=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(state,sequence,compatibility,projects,sequences,naming){
  'use strict';
  var MAX_FRAMES=200;
  function cleanText(text,max){
    if(typeof text!=='string'||text.length>max)throw RangeError('Invalid Studio text');
    return text;
  }
  function blank(){return {name:'Animation study',description:'',mode:'auto',target:'auto',
    source:'none',frames:[],activeFrameKeys:null,cameraHudAppearance:null};}
  function copy(draft){return {name:draft.name,description:draft.description,mode:draft.mode,
    target:draft.target,source:draft.source,
    activeFrameKeys:draft.activeFrameKeys?draft.activeFrameKeys.slice():null,
    cameraHudAppearance:draft.cameraHudAppearance||null,
    frames:draft.frames.map(function(frame){
      return Object.assign({},frame);
    })};}
  function history(ids,entries,previous){
    if(!Array.isArray(ids)||ids.length>MAX_FRAMES)throw RangeError('Too many selected snapshots');
    var found=new Map(entries.map(function(entry){return [entry.id,entry];}));
    var old=previous?new Map(previous.frames.map(function(f){
      return [f.key,f];
    })):new Map();
    var draft=previous?copy(previous):blank(),seen=new Set();
    draft.frames=ids.filter(function(id){
      if(seen.has(id))return false;seen.add(id);return found.has(id);
    }).map(function(id,i){
      var entry=found.get(id),before=old.get('history-'+id);
      return {key:'history-'+id,sourceSnapshotId:id,
        name:before?before.name:(entry.name||naming.snapshot(entry.experiment)),
        experiment:state.validate(entry.experiment),
        travelMs:i===0?0:before&&before.travelMs?before.travelMs:5000,
        holdMs:before?before.holdMs:0,
        easing:before?before.easing:'linear'};
    });
    draft.source='history';draft.activeFrameKeys=null;return draft;
  }
  function importCamera(experiment,frames,previous){
    var validated=sequence.validate(frames);
    if(validated.length<2)throw RangeError('Camera Animation needs at least two keyframes');
    var base=state.validate(experiment),draft=previous?copy(previous):blank();
    draft.mode='camera';draft.target='auto';draft.source='camera-sequence';draft.activeFrameKeys=null;
    draft.frames=validated.map(function(frame,i){
      var snapshot=state.validate(base);
      snapshot.scene.camera=Object.assign({},frame.camera);
      return {key:'camera-'+i,sourceSnapshotId:null,name:frame.name,
        experiment:state.validate(snapshot),travelMs:frame.travelMs,holdMs:frame.holdMs,
        easing:frame.easing};
    });
    return draft;
  }
  // Reconstruct an editable, owned draft from a named Animation Project.
  // History IDs are provenance only; all image-producing physics comes from
  // the embedded project, so deleted History snapshots cannot break playback.
  function fromProject(input){
    var project=projects.validate(input),arrivals=projects.timeline(project);
    var draft=blank();
    draft.name=project.name;draft.description=project.description;draft.mode=project.mode;
    draft.cameraHudAppearance=project.cameraHudAppearance||null;
    draft.target=project.target?project.target.scope+'|'+project.target.parameter:'auto';
    draft.source='mixed';
    draft.frames=project.keyframes.map(function(frame,i){
      return {key:'library-'+i,sourceSnapshotId:frame.sourceSnapshotId,
        name:frame.name,experiment:projects.sampleAt(project,arrivals[i].arrivalMs),
        travelMs:frame.travelMs,holdMs:frame.holdMs,easing:frame.easing};
    });
    if(!inspect(draft).compatible)throw RangeError('Saved animation project cannot be edited');
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
      next.mode=value;next.target='auto';next.activeFrameKeys=null;
    }else if(property==='target'){target(value);next.target=value;next.activeFrameKeys=null;}
    else if(property==='cameraHudAppearance'){
      next.cameraHudAppearance=projects.validateHudAppearance(value);
    }else throw RangeError('Invalid editor property');
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
  // A drop index addresses a gap in the original timeline (0…length).
  // Moving a frame past itself changes the destination by one after removal.
  function reorder(draft,key,gap){
    var next=copy(draft),from=next.frames.findIndex(function(f){return f.key===key;});
    if(from<0||!Number.isInteger(gap)||gap<0||gap>next.frames.length)
      throw RangeError('Invalid animation drop target');
    if(gap===from||gap===from+1)return next;
    var frame=next.frames.splice(from,1)[0];
    next.frames.splice(gap>from?gap-1:gap,0,frame);
    normalizeTravel(next);
    return next;
  }
  function normalizeTravel(draft){
    if(draft.frames.length)draft.frames[0].travelMs=0;
    for(var i=1;i<draft.frames.length;i++)
      if(draft.frames[i].travelMs<200)draft.frames[i].travelMs=5000;
  }
  // Copy only the requested snapshots into an existing draft. Unlike history(),
  // insertion must not replace imported camera frames or edited keyframe timing.
  // Re-selecting a snapshot does not duplicate its stable source ID.
  function insertSnapshots(draft,ids,entries,gap){
    if(!Array.isArray(ids)||!Array.isArray(entries)||!Number.isInteger(gap)||
      gap<0||gap>draft.frames.length)throw RangeError('Invalid animation insertion');
    var found=new Map(entries.map(function(entry){return [entry.id,entry];}));
    var existing=new Set(draft.frames.map(function(frame){return frame.sourceSnapshotId;}));
    var seen=new Set(),next=copy(draft),incoming=[];
    ids.forEach(function(id){
      if(seen.has(id)||existing.has(id)||!found.has(id))return;
      seen.add(id);
      var entry=found.get(id);
      incoming.push({key:'history-'+id,sourceSnapshotId:id,
        name:entry.name||naming.snapshot(entry.experiment),
        experiment:state.validate(entry.experiment),travelMs:5000,holdMs:0,easing:'linear'});
    });
    if(next.frames.length+incoming.length>MAX_FRAMES)
      throw RangeError('Animation has a maximum of '+MAX_FRAMES+' keyframes');
    if(!incoming.length)return next;
    next.frames.splice.apply(next.frames,[gap,0].concat(incoming));
    next.activeFrameKeys=null;
    next.source=next.source==='none'||next.source==='history'?'history':'mixed';
    normalizeTravel(next);
    return next;
  }
  function remove(draft,key){
    var next=copy(draft);next.frames=next.frames.filter(function(f){return f.key!==key;});
    if(next.frames.length)next.frames[0].travelMs=0;
    next.activeFrameKeys=null;
    return next;
  }
  function activeFrames(draft){
    if(!draft.activeFrameKeys)return draft.frames;
    var keys=new Set(draft.activeFrameKeys);
    if(keys.size<2||keys.size!==draft.activeFrameKeys.length||
      draft.frames.filter(function(frame){return keys.has(frame.key);}).length!==keys.size)
      throw RangeError('Selected animation frames no longer exist');
    return draft.frames.filter(function(frame){return keys.has(frame.key);});
  }
  function findSequences(draft){return sequences.discover(draft.frames,draft.mode);}
  function selectSequence(draft,id){
    var found=findSequences(draft).find(function(item){return item.id===id;});
    if(!found)throw RangeError('Selected animation sequence is no longer available');
    var next=copy(draft);
    next.mode=found.mode;
    next.target=found.target?found.target.scope+'|'+found.target.parameter:'auto';
    next.activeFrameKeys=found.keys.slice();
    // Channel validity was checked by discover(); unrelated editor text is
    // validated by inspect() when Preview or Save is requested.
    return next;
  }
  function clearSequence(draft){var next=copy(draft);next.activeFrameKeys=null;return next;}
  function inspect(draft){
    var frames;try{frames=activeFrames(draft);}catch(error){return {compatible:false,mode:null,target:null,changedPaths:[],
      issues:[{code:'invalid-selection',path:error.message}]};}
    if(frames.length<2)return {compatible:false,mode:null,target:null,changedPaths:[],
      issues:[{code:'insufficient-frames',path:'keyframes'}]};
    try{
      var options={};
      if(draft.mode!=='auto')options.mode=draft.mode;
      if(draft.target!=='auto')options.target=target(draft.target);
      var result=compatibility.inspect(frames.map(function(frame){return frame.experiment;}),options);
      var issues=result.issues.slice();
      if(!draft.name.trim())issues.push({code:'missing-name',path:'name'});
      frames.forEach(function(f,i){
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
    return projects.create(activeFrames(draft).map(function(f){
      return {id:f.sourceSnapshotId===null?undefined:f.sourceSnapshotId,
        name:f.name,experiment:f.experiment,travelMs:f.travelMs,
        holdMs:f.holdMs,easing:f.easing};
    }),Object.assign({id:id,name:draft.name,description:draft.description,
      mode:result.mode,target:result.target},draft.cameraHudAppearance?
      {cameraHudAppearance:draft.cameraHudAppearance}:{}));
  }
  // Suggest names only for usable sequences; invalid mixed sequences retain the
  // neutral placeholder until the user chooses a compatible variant.
  function suggestName(draft){
    try{
      var assessment=inspect(draft);
      if(!assessment.compatible)return 'Animation study';
      var project=build(Object.assign({},draft,{name:'Semantic name'}),'semantic_name');
      return naming.animation(project);
    }catch(_error){return 'Animation study';}
  }
  return Object.freeze({suggestName:suggestName,blank:blank,history:history,importCamera:importCamera,fromProject:fromProject,
    edit:edit,editFrame:editFrame,move:move,reorder:reorder,insertSnapshots:insertSnapshots,remove:remove,inspect:inspect,build:build,
    activeFrames:activeFrames,
    findSequences:findSequences,selectSequence:selectSequence,clearSequence:clearSequence});
}));
