/* Compact DOM-only editor for an autosaved animation draft. The filmstrip
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
  function field(doc,label,value,kind,action,options,liveAction){
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
    // Persist valid in-progress edits before blur/F5 without rebuilding the
    // form on every keystroke (which would lose input focus/caret position).
    if(liveAction&&kind!=='select')control.addEventListener('input',function(){liveAction(control.value);});
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
  // Native drag-and-drop has a keyboard/button fallback and an explicit
  // Pointer Events path for touch/pen (HTML5 DnD is unreliable on touch).
  // Only handles initiate touch drags, so ordinary timeline scrolling remains.
  function touchSource(doc,handle,payload,actions){
    if(!handle||!doc||!doc.addEventListener||!doc.elementFromPoint)return;
    handle.addEventListener('pointerdown',function(down){
      if(!down||!['touch','pen'].includes(down.pointerType))return;
      var pointerId=down.pointerId,startX=down.clientX,startY=down.clientY,moved=false,target=null;
      function findTarget(event){
        var element=doc.elementFromPoint(event.clientX,event.clientY);
        var slot=element&&typeof element.closest==='function'&&
          element.closest('[data-animation-gap]');
        if(slot&&slot.classList&&slot.classList.contains('modern-studio-filmstrip-item'))
          setCardDropSide(slot,event);
        return slot||null;
      }
      function move(event){
        if(event.pointerId!==pointerId)return;
        if(!moved&&Math.hypot(event.clientX-startX,event.clientY-startY)<9)return;
        if(!moved){moved=true;actions.dragStart(payload,event);handle.classList&&handle.classList.add('is-dragging');}
        if(event.preventDefault)event.preventDefault();
        var next=findTarget(event);
        var scroller=next&&typeof next.closest==='function'&&next.closest('.modern-studio-filmstrip');
        if(scroller&&typeof scroller.getBoundingClientRect==='function'){
          var r=scroller.getBoundingClientRect();
          if(event.clientX<r.left+38)scroller.scrollLeft-=22;
          else if(event.clientX>r.right-38)scroller.scrollLeft+=22;
        }
        if(target!==next){if(target&&target.classList)target.classList.remove('is-drop-target');
          target=next;if(target&&target.classList)target.classList.add('is-drop-target');}
      }
      function finish(event){
        if(event.pointerId!==pointerId)return;
        if(target&&target.classList)target.classList.remove('is-drop-target');
        if(handle.classList)handle.classList.remove('is-dragging');
        doc.removeEventListener('pointermove',move);
        doc.removeEventListener('pointerup',finish);
        doc.removeEventListener('pointercancel',finish);
        if(moved){
          if(event.type!=='pointercancel'&&target)actions.drop(Number(target.getAttribute('data-animation-gap')),event);
          actions.dragEnd();
          if(event.preventDefault)event.preventDefault();
        }
      }
      doc.addEventListener('pointermove',move,{passive:false});
      doc.addEventListener('pointerup',finish);
      doc.addEventListener('pointercancel',finish);
    });
  }
  function makeDragSource(doc,node,handle,payload,actions){
    if(!actions.dragStart)return;
    node.draggable=true;
    node.addEventListener('dragstart',function(event){actions.dragStart(payload,event);});
    node.addEventListener('dragend',function(){actions.dragEnd();});
    touchSource(doc,handle||node,payload,actions);
  }
  function setCardDropSide(node,event){
    var bounds=typeof node.getBoundingClientRect==='function'&&node.getBoundingClientRect();
    var before=!bounds||!Number.isFinite(event.clientX)||event.clientX<bounds.left+bounds.width/2;
    var original=Number(node.getAttribute('data-frame-index'));
    node.setAttribute('data-animation-gap',String(original+(before?0:1)));
    if(node.classList){node.classList.toggle('is-drop-before',before);
      node.classList.toggle('is-drop-after',!before);}
  }
  function makeDropTarget(node,index,actions,card){
    node.setAttribute('data-animation-gap',String(index));
    if(card)node.setAttribute('data-frame-index',String(index));
    if(!actions.drop)return;
    node.addEventListener('dragover',function(event){
      if(!actions.dragOver(event))return;
      var scroller=typeof node.closest==='function'&&node.closest('.modern-studio-filmstrip');
      if(scroller&&typeof scroller.getBoundingClientRect==='function'){
        var r=scroller.getBoundingClientRect();
        if(event.clientX<r.left+38)scroller.scrollLeft-=18;
        else if(event.clientX>r.right-38)scroller.scrollLeft+=18;
      }
      if(card)setCardDropSide(node,event);
      if(event.preventDefault)event.preventDefault();
      if(node.classList)node.classList.add('is-drop-target');
    });
    node.addEventListener('dragleave',function(event){
      if(node.classList&&(!event.relatedTarget||!node.contains||!node.contains(event.relatedTarget))){
        node.classList.remove('is-drop-target');
        node.classList.remove('is-drop-before');node.classList.remove('is-drop-after');
      }
    });
    node.addEventListener('drop',function(event){
      if(card)setCardDropSide(node,event);
      if(node.classList){node.classList.remove('is-drop-target');
        node.classList.remove('is-drop-before');node.classList.remove('is-drop-after');}
      if(event.preventDefault)event.preventDefault();
      actions.drop(Number(node.getAttribute('data-animation-gap')),event);
    });
  }
  function dropSlot(doc,index,actions,selectedCount){
    var slot=el(doc,'li','modern-studio-drop-slot');
    makeDropTarget(slot,index,actions);
    var add=button(doc,'+','Insert checked snapshots at timeline position '+(index+1),function(){
      if(actions.insertChecked)actions.insertChecked(index);
    });
    add.className='modern-studio-drop-button';add.disabled=!selectedCount;
    add.title=selectedCount?'Insert '+selectedCount+' selected snapshots':'Drop a frame or snapshot here';
    slot.appendChild(add);
    return slot;
  }
  // A compact visual library, not another keyframe editor. Preview images are
  // persisted screenshots when available; never pretend a placeholder was
  // calculated from a saved physical project.
  function renderLibrary(doc,host,entries,options,actions){
    if(!host||!doc)return;
    options=options||{};entries=entries||[];host.textContent='';
    var head=el(doc,'div','modern-animation-library-heading');
    head.appendChild(el(doc,'strong','','Animation Library'));
    head.appendChild(el(doc,'small','',entries.length+' saved '+(entries.length===1?'project':'projects')));
    if(entries.length){
      var fold=button(doc,options.expanded===false?'Show projects':'Hide projects',
        'Toggle saved animation gallery',actions.toggleExpanded);
      fold.className+=' modern-animation-library-fold';
      fold.setAttribute('aria-expanded',String(options.expanded!==false));
      head.appendChild(fold);
    }
    host.appendChild(head);
    var row=el(doc,'div','modern-animation-library-controls');
    function action(label,description,callback,disabled){
      var control=button(doc,label,description,callback);control.disabled=!!disabled;
      row.appendChild(control);return control;
    }
    action('New project','Start a separate empty animation without modifying saved projects',
      actions.newProject,options.busy);
    action('Save',options.activeId?'Save changes to the opened project':'Save draft as a named project',
      actions.save,options.busy||!options.canSave||!!options.activeId&&!options.dirty);
    action('Save As','Save an independent copy with a new project ID',actions.saveAs,
      options.busy||!options.canSave);
    var exportSelected=action('Export selected','Export the selected named animation as portable JSON',actions.exportSelected,
      options.busy||!entries.some(function(e){return e.id===options.selectedId;}));
    exportSelected.className+=' modern-animation-library-export-selected';
    action('Export all','Export all saved animations as portable JSON',actions.exportAll,
      options.busy||!entries.length);
    var importInput=el(doc,'input');importInput.type='file';importInput.accept='.json,application/json';
    importInput.hidden=true;importInput.setAttribute('aria-label','Import animation JSON file');
    importInput.addEventListener('change',function(){
      var file=importInput.files&&importInput.files[0];if(file)actions.importFile(file);
      importInput.value='';
    });
    action('Import JSON','Import saved animations from a JSON file',function(){importInput.click();},options.busy);
    row.appendChild(importInput);
    if((options.duplicateGroups||[]).length){
      action(options.showDuplicates?'Hide duplicates':'Find duplicates ('+options.duplicateGroups.length+')',
        'Review identical saved animations without deleting anything',actions.toggleDuplicates,options.busy);
    }
    host.appendChild(row);
    var message=el(doc,'p','modern-animation-library-note',options.activeId?
      'Editing: '+(options.activeName||'saved project')+
        (options.dirty?' · Unsaved changes':' · All changes saved'):
      'New draft'+(options.unsaved?' · Unsaved changes':'')+
        ' · Not linked to any saved animation');
    host.appendChild(message);
    if(options.pendingChange){
      var pending=el(doc,'div','modern-animation-library-pending');
      pending.setAttribute('role','group');
      pending.setAttribute('aria-label','Unsaved animation changes');
      pending.appendChild(el(doc,'strong','','Unsaved changes'));
      pending.appendChild(el(doc,'p','',options.pendingChange==='new'?
        'Save the current animation before creating a new project?':
        'Save the current animation before opening another project?'));
      var choices=el(doc,'div','modern-animation-library-pending-actions');
      var save=button(doc,'Save and continue','Save current work before switching projects',
        actions.saveBeforeSwitch);
      save.disabled=!!options.busy||!options.canSave;
      choices.appendChild(save);
      var discard=button(doc,'Discard and continue','Discard current unsaved changes',
        actions.discardSwitch);
      discard.disabled=!!options.busy;choices.appendChild(discard);
      var cancel=button(doc,'Cancel','Stay with the current animation',actions.cancelSwitch);
      cancel.disabled=!!options.busy;choices.appendChild(cancel);
      pending.appendChild(choices);
      if(!options.canSave)pending.appendChild(el(doc,'small','',
        'This draft cannot be saved as a project yet; complete its keyframes or cancel.'));
      host.appendChild(pending);
    }
    if(options.message){var note=el(doc,'p','modern-animation-library-message'+
      (options.error?' is-error':''),options.message);note.setAttribute('role','status');host.appendChild(note);}
    if(options.duplicate){
      var warning=el(doc,'div','modern-animation-library-duplicate-warning');
      warning.appendChild(el(doc,'strong','','Identical animation already saved: '+options.duplicate.name));
      var duplicateActions=el(doc,'div','modern-animation-library-duplicate-actions');
      var openExisting=button(doc,'Open existing','Open identical saved animation',actions.openDuplicate);
      openExisting.disabled=!!options.busy;duplicateActions.appendChild(openExisting);
      var forceCopy=button(doc,'Save copy anyway','Explicitly save a duplicate animation',actions.forceCopy);
      forceCopy.disabled=!!options.busy;duplicateActions.appendChild(forceCopy);
      warning.appendChild(duplicateActions);host.appendChild(warning);
    }
    if(options.showDuplicates&&(options.duplicateGroups||[]).length){
      var review=el(doc,'div','modern-animation-library-duplicate-review');
      review.appendChild(el(doc,'strong','','Existing identical projects — none will be deleted automatically'));
      options.duplicateGroups.forEach(function(group,index){
        var section=el(doc,'div','modern-animation-library-duplicate-group');
        section.appendChild(el(doc,'small','',
          'Group '+(index+1)+' · '+group.length+' identical animations'));
        group.forEach(function(entry){
          var item=el(doc,'div','modern-animation-library-duplicate-entry');
          item.appendChild(el(doc,'span','',entry.project.name));
          var open=button(doc,'Open','Open '+entry.project.name,function(){actions.open(entry.id);});
          open.disabled=!!options.busy;item.appendChild(open);
          var remove=button(doc,'Delete','Delete '+entry.project.name+' after confirmation',function(){actions.remove(entry.id);});
          remove.disabled=!!options.busy;item.appendChild(remove);
          section.appendChild(item);
        });
        review.appendChild(section);
      });
      host.appendChild(review);
    }
    if(!entries.length){host.appendChild(el(doc,'p','modern-animation-library-empty',
      'No saved animations yet. Prepare an animation and use Save animation to keep it here.'));return;}
    if(options.expanded===false)return;
    host.appendChild(el(doc,'p','modern-animation-library-hint',
      'Click a card to select · Double-click to open · Enter to open · Space to select'));
    var list=el(doc,'div','modern-animation-library-gallery');
    list.setAttribute('aria-label','Saved animation projects');
    entries.forEach(function(entry){
      var p=entry.project,selected=entry.id===options.selectedId;
      var card=el(doc,'article','modern-animation-library-card'+(selected?' is-selected':'')+
        (entry.id===options.activeId?' is-editing':''));
      card.setAttribute('data-animation-id',entry.id);
      card.setAttribute('tabindex','0');
      card.setAttribute('role','group');
      card.setAttribute('aria-label',(selected?'Selected animation: ':'Animation: ')+p.name+
        '. Click to select, double-click or press Enter to open.');
      function insideControl(event){
        var target=event&&event.target;
        while(target&&target!==card){
          if(/^(BUTTON|INPUT|TEXTAREA|SELECT)$/.test(String(target.tagName||'').toUpperCase()))return true;
          target=target.parentNode;
        }
        return false;
      }
      card.addEventListener('click',function(event){
        if(!insideControl(event))actions.select(entry.id);
      });
      card.addEventListener('dblclick',function(event){
        if(!insideControl(event)&&!options.busy)actions.open(entry.id);
      });
      card.addEventListener('keydown',function(event){
        if(insideControl(event))return;
        if(event.key==='Enter'&&!options.busy){
          if(event.preventDefault)event.preventDefault();actions.open(entry.id);
        }else if(event.key===' '||event.key==='Spacebar'){
          if(event.preventDefault)event.preventDefault();actions.select(entry.id);
        }
      });
      var visual=historyUI.frameVisual(doc,{name:p.name,experiment:p.baseExperiment,
        thumbnail:entry.thumbnail},'modern-animation-library-visual');
      if(!entry.thumbnail)visual.appendChild(el(doc,'small','modern-animation-library-no-preview',
        'No saved screenshot'));
      card.appendChild(visual);
      var info=el(doc,'div','modern-animation-library-card-info');
      var title=el(doc,'strong','modern-animation-library-card-title',p.name);
      title.title=p.name;info.appendChild(title);
      var duration=p.keyframes.reduce(function(sum,frame){return sum+frame.travelMs+frame.holdMs;},0)/1000;
      info.appendChild(el(doc,'small','modern-animation-library-card-meta',
        (p.mode==='camera'?'Camera motion':p.target.parameter==='surface.curvature'?
          'Earth curvature':'Temperature gradient')+' · '+p.keyframes.length+
        ' frames · '+duration.toFixed(1)+' s'));
      var summary=el(doc,'small','modern-animation-library-card-summary',
        historyUI.frameSummary({experiment:p.baseExperiment}));
      summary.title=summary.textContent;info.appendChild(summary);
      if(p.description){var desc=el(doc,'small','modern-animation-library-card-summary',p.description);
        desc.title=p.description;info.appendChild(desc);}
      info.appendChild(el(doc,'small','modern-animation-library-card-updated',
        'Updated '+new Date(entry.updatedAt).toLocaleString()));
      card.appendChild(info);
      if(options.renameId===entry.id){
        var editor=el(doc,'div','modern-animation-library-rename');
        var name=el(doc,'input');name.type='text';name.value=p.name;name.maxLength=120;
        name.setAttribute('aria-label','New name for '+p.name);editor.appendChild(name);
        function submit(){if(!options.busy)actions.rename(entry.id,name.value);}
        name.addEventListener('keydown',function(event){
          if(event.key==='Enter'){if(event.preventDefault)event.preventDefault();submit();}
          if(event.key==='Escape')actions.renameCancel();
        });
        var submitButton=button(doc,'Save name','Save renamed animation',submit);
        submitButton.disabled=!!options.busy;editor.appendChild(submitButton);
        editor.appendChild(button(doc,'Cancel','Cancel animation rename',actions.renameCancel));
        card.appendChild(editor);
      }else{
        var controls=el(doc,'div','modern-animation-library-card-actions');
        var rename=button(doc,'Rename','Rename saved animation '+p.name,function(){actions.renameStart(entry.id);});
        rename.disabled=!!options.busy;controls.appendChild(rename);
        var remove=button(doc,'Delete','Delete saved animation '+p.name,function(){actions.remove(entry.id);});
        remove.disabled=!!options.busy;controls.appendChild(remove);
        card.appendChild(controls);
      }
      list.appendChild(card);
    });
    host.appendChild(list);
  }
  function renderPicker(doc,host,entries,actions,options){
    if(!host||!doc)return;
    options=options||{};
    host.hidden=!options.open;
    if(!options.open){host.textContent='';return;}
    host.textContent='';
    var head=el(doc,'div','modern-studio-picker-head');
    head.appendChild(el(doc,'strong','','Snapshot Picker'));
    head.appendChild(button(doc,'×','Close Snapshot Picker',actions.pickerClose));
    host.appendChild(head);
    host.appendChild(el(doc,'p','modern-studio-hint',
      'Drag saved snapshots to a gap in the timeline. Check several to insert them together.'));
    var search=el(doc,'input','modern-studio-picker-search');
    search.type='search';search.maxLength=160;search.value=options.search||'';
    search.placeholder='Search saved snapshots…';search.setAttribute('aria-label','Find saved snapshots');
    search.addEventListener('input',function(){
      var offset=search.selectionStart;
      actions.pickerSearch(search.value,offset);
    });host.appendChild(search);
    var selected=options.checked||{},n=entries.filter(function(e){return !!selected[e.id];}).length;
    var tools=el(doc,'div','modern-studio-picker-tools');
    tools.appendChild(el(doc,'small','',n+' selected · '+entries.length+' found'));
    var add=button(doc,'Add checked','Add checked snapshots after selected frame',function(){actions.insertChecked();});
    add.disabled=n===0;tools.appendChild(add);
    tools.appendChild(button(doc,'Full History','Open complete History management',actions.pickerFullHistory));
    host.appendChild(tools);
    var list=el(doc,'ol','modern-studio-picker-list');
    if(!entries.length)list.appendChild(el(doc,'li','modern-history-empty','No matching snapshots.'));
    entries.forEach(function(entry){
      var item=el(doc,'li','modern-studio-picker-card');
      item.setAttribute('data-picker-id',String(entry.id));
      var check=el(doc,'input','modern-studio-picker-checkbox');check.type='checkbox';
      check.checked=!!selected[entry.id];check.setAttribute('aria-label','Select snapshot '+entry.id);
      check.addEventListener('change',function(){actions.pickerToggle(entry.id,check.checked);});
      item.appendChild(check);
      var visual=historyUI.frameVisual(doc,entry,'modern-studio-picker-visual');item.appendChild(visual);
      var info=el(doc,'div','modern-studio-picker-info');
      var title=el(doc,'strong','',historyUI.displayName(entry));title.title=title.textContent;
      info.appendChild(title);
      var summary=el(doc,'small','',historyUI.frameSummary(entry));
      summary.title=summary.textContent;info.appendChild(summary);item.appendChild(info);
      var handle=el(doc,'span','modern-studio-drag-handle','⠿');
      handle.title='Drag snapshot into timeline';handle.setAttribute('aria-label','Drag snapshot '+entry.id);
      item.appendChild(handle);
      makeDragSource(doc,item,handle,{kind:'snapshots',id:entry.id},actions);
      list.appendChild(item);
    });
    host.appendChild(list);
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
      'Drag frames to reorder, or drag saved snapshots from the picker into the timeline. Changes never alter the live experiment.'));
    var toolbar=el(doc,'div','modern-studio-toolbar');
    toolbar.appendChild(button(doc,'Choose from History','Open saved experiments to select animation keyframes',actions.choose));
    var load=button(doc,'Load staged snapshots'+(options.stagedCount?' ('+options.stagedCount+')':''),
      'Replace draft with ordered saved snapshot selection',actions.load);
    load.disabled=!options.stagedCount;toolbar.appendChild(load);
    toolbar.appendChild(button(doc,'Import Camera Animation','Import existing camera keyframes into draft',actions.importCamera));
    host.appendChild(toolbar);
    var basics=el(doc,'div','modern-studio-basics');
    basics.appendChild(field(doc,'Project name',draft.name,'text',function(value){actions.edit('name',value);},null,
      function(value){if(actions.liveEdit)actions.liveEdit('name',value);}));
    basics.appendChild(field(doc,'Description',draft.description,'textarea',function(value){actions.edit('description',value);},null,
      function(value){if(actions.liveEdit)actions.liveEdit('description',value);}));
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
        'Saved thumbnail · use the independent optical viewport above to play a prepared project.'));
      preview.appendChild(previewCaption);host.appendChild(preview);
    }

    var filmstrip=el(doc,'ol','modern-studio-filmstrip');
    filmstrip.setAttribute('aria-label','Animation keyframe timeline');
    draft.frames.forEach(function(frame,i){
      filmstrip.appendChild(dropSlot(doc,i,actions,options.pickerSelectedCount||0));
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
      item.appendChild(pick);
      makeDropTarget(item,i,actions,true);
      var handle=el(doc,'span','modern-studio-drag-handle','⠿');
      handle.title='Drag keyframe to reorder';
      handle.setAttribute('aria-label','Drag keyframe '+(i+1)+' to reorder');
      item.appendChild(handle);
      makeDragSource(doc,item,handle,{kind:'frame',key:frame.key},actions);
      filmstrip.appendChild(item);
    });
    filmstrip.appendChild(dropSlot(doc,draft.frames.length,actions,options.pickerSelectedCount||0));
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
        selected.sourceSnapshotId===null?'Self-contained animation keyframe':
          'History snapshot #'+selected.sourceSnapshotId));
      var fields=el(doc,'div','modern-studio-frame-fields');
      fields.appendChild(field(doc,'Frame name',selected.name,'text',function(value){actions.frame(selected.key,'name',value);},null,
        function(value){if(actions.liveFrame)actions.liveFrame(selected.key,'name',value);}));
      if(index>0)fields.appendChild(field(doc,'Travel to frame (s)',selected.travelMs/1000,'number',
        function(value){actions.frame(selected.key,'travelMs',value);},null,
        function(value){if(actions.liveFrame)actions.liveFrame(selected.key,'travelMs',value);}));
      fields.appendChild(field(doc,'Hold after arrival (s)',selected.holdMs/1000,'number',
        function(value){actions.frame(selected.key,'holdMs',value);},null,
        function(value){if(actions.liveFrame)actions.liveFrame(selected.key,'holdMs',value);}));
      if(index>0)fields.appendChild(field(doc,'Easing',selected.easing,'select',function(value){
        actions.frame(selected.key,'easing',value);
      },[['linear','Linear'],['smoothstep','Ease in / out']]));
      panel.appendChild(fields);host.appendChild(panel);
    }
    var footer=el(doc,'div','modern-studio-toolbar');
    var prepare=button(doc,'Prepare project','Validate and prepare an in-memory animation project',actions.prepare);
    prepare.disabled=!result.compatible;footer.appendChild(prepare);
    if(prepared)footer.appendChild(el(doc,'span','modern-studio-prepared',
      'Prepared · Draft autosaved; save a named copy in Animation Library above'));
    host.appendChild(footer);
    host.appendChild(el(doc,'p','modern-studio-hint',
      'Prepare a compatible Camera or Physical Animation to play in the independent optical viewport above. ' +
      'Draft autosave restores your work after F5; use Animation Library above for named saves and portable JSON sharing.'));
  }
  return Object.freeze({render:render,renderPicker:renderPicker,renderLibrary:renderLibrary});
}));
