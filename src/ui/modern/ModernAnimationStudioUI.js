/* DOM-only editor for an in-memory Animation Studio draft. History remains
 * authoritative for choosing snapshots; building does not trigger playback.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationStudioUI=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function el(doc,tag,className,text){
    var node=doc.createElement(tag);if(className)node.className=className;
    if(text!==undefined)node.textContent=text;return node;
  }
  function button(doc,label,description,action){
    var node=el(doc,'button','modern-studio-action',label);
    node.type='button';node.setAttribute('aria-label',description);node.addEventListener('click',action);
    return node;
  }
  function field(doc,label,value,kind,action,options){
    var wrapper=el(doc,'label','modern-studio-field');
    wrapper.appendChild(el(doc,'span','',label));
    var control=el(doc,kind==='textarea'?'textarea':kind==='select'?'select':'input');
    if(kind==='select'){
      options.forEach(function(pair){
        var option=el(doc,'option','',pair[1]);option.value=pair[0];control.appendChild(option);
      });
    }else if(kind==='textarea'){control.rows=2;control.maxLength=1000;}
    else control.type=kind==='number'?'number':'text';
    if(kind==='number'){
      control.min='0';control.max='120';control.step='0.1';
    }else if(kind==='text')control.maxLength=120;
    control.value=String(value);
    control.addEventListener('change',function(){action(control.value);});
    wrapper.appendChild(control);return wrapper;
  }
  function render(doc,host,draft,result,actions,prepared){
    if(!host||!doc)return;
    host.textContent='';
    var heading=el(doc,'div','modern-studio-header');
    heading.appendChild(el(doc,'strong','','Animation Studio · Draft editor'));
    heading.appendChild(el(doc,'span','',draft.frames.length+' frames'));
    host.appendChild(heading);
    host.appendChild(el(doc,'p','modern-studio-hint',
      'Load your ordered History shortlist, or import the current Camera Animation. ' +
      'Editing this draft does not change saved snapshots or your current experiment.'));
    var toolbar=el(doc,'div','modern-studio-toolbar');
    toolbar.appendChild(button(doc,'Load History shortlist','Replace draft with ordered History shortlist',actions.load));
    toolbar.appendChild(button(doc,'Import Camera Animation','Import existing camera keyframes into draft',actions.importCamera));
    host.appendChild(toolbar);
    var basics=el(doc,'div','modern-studio-basics');
    basics.appendChild(field(doc,'Project name',draft.name,'text',function(value){actions.edit('name',value);}));
    basics.appendChild(field(doc,'Description',draft.description,'textarea',function(value){actions.edit('description',value);}));
    basics.appendChild(field(doc,'Animation mode',draft.mode,'select',function(value){actions.edit('mode',value);},
      [['auto','Auto-detect'],['camera','Camera motion'],['physical','One physical parameter']]));
    if(draft.mode==='physical'){
      var mode=draft.frames.length&&draft.frames[0].experiment.display.mode||'scene';
      var scopes=mode==='compare'?['A','B']:['scene'];
      var choices=[['auto','Choose physical parameter…']];
      scopes.forEach(function(scope){
        choices.push([scope+'|surface.curvature',scope+' · Earth curvature']);
        choices.push([scope+'|temperatureProfile.gradientKPerKm',scope+' · Temperature gradient']);
      });
      basics.appendChild(field(doc,'Variable to animate',draft.target,'select',function(value){actions.edit('target',value);},choices));
    }
    host.appendChild(basics);
    var status=el(doc,'div','modern-studio-status');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    if(draft.frames.length<2){
      status.textContent='Choose at least two snapshots to start an animation.';
    }else if(result.compatible){
      status.className+=' is-ready';
      status.textContent='Compatible · '+(result.mode==='camera'?'Camera motion':
        'Physical: '+result.target.scope+' · '+result.target.parameter)+
        ' · '+(draft.frames.reduce(function(total,f){return total+f.travelMs+f.holdMs;},0)/1000).toFixed(1)+' s';
    }else{
      status.className+=' is-invalid';
      status.appendChild(el(doc,'strong','','Incompatible keyframes. Resolve:'));
      var list=el(doc,'ul');
      result.issues.forEach(function(issue){
        list.appendChild(el(doc,'li','',issue.path+' ('+issue.code+')'));
      });
      status.appendChild(list);
    }
    host.appendChild(status);
    var frames=el(doc,'ol','modern-studio-frames');
    draft.frames.forEach(function(frame,i){
      var item=el(doc,'li','modern-studio-frame');
      var header=el(doc,'div','modern-studio-frame-header');
      header.appendChild(el(doc,'strong','',(i+1)+'. '+frame.name));
      var controls=el(doc,'div','modern-studio-toolbar');
      var earlier=button(doc,'↑','Move animation frame '+(i+1)+' earlier',function(){actions.move(frame.key,-1);});
      earlier.disabled=i===0;controls.appendChild(earlier);
      var later=button(doc,'↓','Move animation frame '+(i+1)+' later',function(){actions.move(frame.key,1);});
      later.disabled=i===draft.frames.length-1;controls.appendChild(later);
      controls.appendChild(button(doc,'×','Remove animation frame '+(i+1),function(){actions.remove(frame.key);}));
      header.appendChild(controls);item.appendChild(header);
      if(frame.sourceSnapshotId!==null)item.appendChild(el(doc,'small','','History snapshot #'+frame.sourceSnapshotId));
      else item.appendChild(el(doc,'small','','Imported camera view'));
      var fields=el(doc,'div','modern-studio-frame-fields');
      fields.appendChild(field(doc,'Frame name',frame.name,'text',function(value){actions.frame(frame.key,'name',value);}));
      if(i>0)fields.appendChild(field(doc,'Travel to frame (s)',frame.travelMs/1000,'number',
        function(value){actions.frame(frame.key,'travelMs',value);}));
      fields.appendChild(field(doc,'Hold after arrival (s)',frame.holdMs/1000,'number',
        function(value){actions.frame(frame.key,'holdMs',value);}));
      if(i>0)fields.appendChild(field(doc,'Easing',frame.easing,'select',function(value){
        actions.frame(frame.key,'easing',value);
      },[['linear','Linear'],['smoothstep','Ease in / out']]));
      item.appendChild(fields);frames.appendChild(item);
    });
    host.appendChild(frames);
    var footer=el(doc,'div','modern-studio-toolbar');
    var prepare=button(doc,'Prepare project','Validate and prepare an in-memory animation project',actions.prepare);
    prepare.disabled=!result.compatible;footer.appendChild(prepare);
    if(prepared)footer.appendChild(el(doc,'span','modern-studio-prepared',
      'Project prepared in memory · Playback and permanent saving come later'));
    host.appendChild(footer);
    host.appendChild(el(doc,'p','modern-studio-hint',
      'This editor is a draft: it does not play, render, export or permanently save an animation. ' +
      'The History shortlist remains separate and unchanged.'));
  }
  return Object.freeze({render:render});
}));
