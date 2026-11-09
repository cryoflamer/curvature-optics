/* Compact DOM-only editor for an in-memory animation draft. The filmstrip
 * resolves saved thumbnails from History but never captures or renders optics.
 */
(function(root,factory){
  var historyUI=root.CurvatureModernExperimentHistoryUI;
  if(typeof module==='object'&&module.exports)
    historyUI=require('./ModernExperimentHistoryUI');
  var api=factory(historyUI);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationStudioUI=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(historyUI){
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
  function frameEntry(frame,entries){
    var match=frame.sourceSnapshotId!==null&&entries.find(function(item){
      return item.id===frame.sourceSnapshotId;
    });
    // No thumbnail for imported camera frames: showing another frame's
    // screenshot would falsely imply the physical view had been rendered.
    return match||{name:frame.name,experiment:frame.experiment,thumbnail:null};
  }
  function render(doc,host,draft,result,actions,prepared,options){
    if(!host||!doc)return;
    options=options||{};
    var entries=options.entries||[];
    var selected=draft.frames.find(function(f){return f.key===options.selectedKey;})||draft.frames[0];
    host.textContent='';
    var heading=el(doc,'div','modern-studio-header');
    heading.appendChild(el(doc,'strong','','Animation Studio · Draft editor'));
    heading.appendChild(el(doc,'span','',draft.frames.length+' frames'));
    host.appendChild(heading);
    host.appendChild(el(doc,'p','modern-studio-hint',
      'Select a thumbnail to edit one keyframe. Changes stay inside this workspace, not the live experiment.'));
    var toolbar=el(doc,'div','modern-studio-toolbar');
    toolbar.appendChild(button(doc,'Choose from History','Open saved experiments to select animation keyframes',actions.choose));
    var load=button(doc,'Load staged snapshots'+(options.stagedCount?' ('+options.stagedCount+')':''),
      'Replace draft with ordered saved snapshot selection',actions.load);
    load.disabled=!options.stagedCount;toolbar.appendChild(load);
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

    if(selected){
      var previewEntry=frameEntry(selected,entries);
      var preview=el(doc,'section','modern-studio-preview');
      preview.setAttribute('aria-label','Selected saved keyframe preview');
      var previewVisual=historyUI.frameVisual(doc,previewEntry,'modern-studio-preview-visual');
      preview.appendChild(previewVisual);
      var previewCaption=el(doc,'div','modern-studio-preview-caption');
      previewCaption.appendChild(el(doc,'strong','',selected.name));
      previewCaption.appendChild(el(doc,'p','',historyUI.frameSummary(previewEntry)));
      previewCaption.appendChild(el(doc,'small','',
        'Saved thumbnail only · animated optical playback is not available yet.'));
      preview.appendChild(previewCaption);host.appendChild(preview);
    }

    var filmstrip=el(doc,'ol','modern-studio-filmstrip');
    filmstrip.setAttribute('aria-label','Animation keyframe timeline');
    draft.frames.forEach(function(frame,i){
      var entry=frameEntry(frame,entries),item=el(doc,'li','modern-studio-filmstrip-item');
      var pick=button(doc,'','Edit animation frame '+(i+1)+': '+frame.name,function(){
        if(actions.select)actions.select(frame.key);
      });
      pick.className='modern-studio-keyframe'+(frame===selected?' is-active':'');
      pick.setAttribute('aria-pressed',String(frame===selected));
      pick.appendChild(historyUI.frameVisual(doc,entry,'modern-studio-keyframe-visual'));
      var name=el(doc,'strong','modern-studio-keyframe-name',(i+1)+'. '+frame.name);
      name.title=frame.name;pick.appendChild(name);
      var summary=el(doc,'small','modern-studio-keyframe-summary',historyUI.frameSummary(entry));
      summary.title=summary.textContent;pick.appendChild(summary);
      item.appendChild(pick);filmstrip.appendChild(item);
    });
    host.appendChild(filmstrip);
    if(selected){
      var index=draft.frames.indexOf(selected);
      var panel=el(doc,'section','modern-studio-selected-frame');
      var header=el(doc,'div','modern-studio-frame-header');
      header.appendChild(el(doc,'strong','modern-studio-selected-heading',
        'Selected keyframe · '+(index+1)+' / '+draft.frames.length));
      var controls=el(doc,'div','modern-studio-toolbar');
      var earlier=button(doc,'↑','Move animation frame '+(index+1)+' earlier',function(){actions.move(selected.key,-1);});
      earlier.disabled=index===0;controls.appendChild(earlier);
      var later=button(doc,'↓','Move animation frame '+(index+1)+' later',function(){actions.move(selected.key,1);});
      later.disabled=index===draft.frames.length-1;controls.appendChild(later);
      controls.appendChild(button(doc,'×','Remove animation frame '+(index+1),function(){actions.remove(selected.key);}));
      header.appendChild(controls);panel.appendChild(header);
      panel.appendChild(el(doc,'small','modern-studio-frame-source',
        selected.sourceSnapshotId===null?'Imported camera view':
          'History snapshot #'+selected.sourceSnapshotId));
      var fields=el(doc,'div','modern-studio-frame-fields');
      fields.appendChild(field(doc,'Frame name',selected.name,'text',function(value){actions.frame(selected.key,'name',value);}));
      if(index>0)fields.appendChild(field(doc,'Travel to frame (s)',selected.travelMs/1000,'number',
        function(value){actions.frame(selected.key,'travelMs',value);}));
      fields.appendChild(field(doc,'Hold after arrival (s)',selected.holdMs/1000,'number',
        function(value){actions.frame(selected.key,'holdMs',value);}));
      if(index>0)fields.appendChild(field(doc,'Easing',selected.easing,'select',function(value){
        actions.frame(selected.key,'easing',value);
      },[['linear','Linear'],['smoothstep','Ease in / out']]));
      panel.appendChild(fields);host.appendChild(panel);
    }
    var footer=el(doc,'div','modern-studio-toolbar');
    var prepare=button(doc,'Prepare project','Validate and prepare an in-memory animation project',actions.prepare);
    prepare.disabled=!result.compatible;footer.appendChild(prepare);
    if(prepared)footer.appendChild(el(doc,'span','modern-studio-prepared',
      'Project prepared in memory · Playback and permanent saving come later'));
    host.appendChild(footer);
    host.appendChild(el(doc,'p','modern-studio-hint',
      'This draft cannot play, render, export or permanently save an animation yet. ' +
      'Snapshot selection in History is kept separately until loaded.'));
  }
  return Object.freeze({render:render});
}));
