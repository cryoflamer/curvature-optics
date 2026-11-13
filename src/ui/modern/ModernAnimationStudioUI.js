/* Compact DOM-only editor for an autosaved animation draft. The filmstrip
 * resolves saved thumbnails from History but never captures or renders optics.
 */
(function(root,factory){
  var historyUI=root.CurvatureModernExperimentHistoryUI;
  var thumbnailPreview=root.CurvatureModernThumbnailPreview;
  if(typeof module==='object'&&module.exports){
    historyUI=require('./ModernExperimentHistoryUI');
    thumbnailPreview=require('./ModernThumbnailPreview');
  }
  var api=factory(historyUI,thumbnailPreview);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationStudioUI=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(historyUI,thumbnailPreview){
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
  // A destructive-looking card action must never also select or drag its card.
  // It only removes a keyframe from the current draft, never from History.
  function cardRemove(doc,description,action){
    var remove=button(doc,'×',description,function(event){
      if(event&&event.stopPropagation)event.stopPropagation();
      action();
    });
    remove.className='modern-studio-card-remove';
    remove.title=description;remove.draggable=false;
    ['pointerdown','mousedown','dblclick','dragstart'].forEach(function(type){
      remove.addEventListener(type,function(event){
        if(event&&event.stopPropagation)event.stopPropagation();
        // Cancel the default mouse drag from the draggable parent <li> too.
        // Avoid preventDefault on pointerdown: touch needs a normal tap/click.
        if((type==='mousedown'||type==='dragstart')&&event&&event.preventDefault)
          event.preventDefault();
      });
    });
    return remove;
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
  // Exactly one reusable preview controller per rendered gallery, not one DOM
  // overlay per card. Re-rendering destroys the previous controller and timer.
  function galleryPreview(doc,host,enabled){
    if(host.__thumbnailPreview){host.__thumbnailPreview.destroy();host.__thumbnailPreview=null;}
    if(enabled===false||!thumbnailPreview)return null;
    var controller=thumbnailPreview.create(doc,host,historyUI.inspectorMarkup);
    host.__thumbnailPreview=controller;
    return controller;
  }
  function libraryPreviewEntry(entry){
    var project=entry.project;
    return {name:project.name,description:project.description||'',
      experiment:project.baseExperiment,thumbnail:entry.thumbnail,
      createdAt:entry.updatedAt,source:'Animation Library'};
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
    if(handle&&handle!==node)handle.setAttribute('data-no-thumbnail-preview','true');
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
    options=options||{};entries=entries||[];
    var inspector=galleryPreview(doc,host,entries.length>0&&options.expanded!==false);
    host.textContent='';
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
    var projectActions=el(doc,'div','modern-animation-library-action-group');
    projectActions.appendChild(el(doc,'span','modern-animation-library-action-label','Projects'));
    var fileActions=el(doc,'div','modern-animation-library-action-group');
    fileActions.appendChild(el(doc,'span','modern-animation-library-action-label','JSON backup'));
    function action(group,label,description,callback,disabled){
      var control=button(doc,label,description,callback);control.disabled=!!disabled;
      group.appendChild(control);return control;
    }
    action(projectActions,'New project','Start a separate, autosaved working draft; previous drafts remain available',
      actions.newProject,options.busy);
    action(projectActions,options.activeId?'Save changes':'Save project',
      options.activeId?'Update the opened project in Animation Library':'Add this draft to Animation Library',
      actions.save,options.busy||!options.canSave||!!options.activeId&&!options.dirty);
    action(projectActions,'Save As','Save an independent project with a new ID',actions.saveAs,
      options.busy||!options.canSave);
    var exportSelected=action(fileActions,'Export selected','Back up the selected saved project as JSON (not video)',
      actions.exportSelected,options.busy||!entries.some(function(e){return e.id===options.selectedId;}));
    exportSelected.className+=' modern-animation-library-export-selected';
    action(fileActions,'Export all','Back up all saved projects as JSON (not video)',actions.exportAll,
      options.busy||!entries.length);
    var importInput=el(doc,'input');importInput.type='file';importInput.accept='.json,application/json';
    importInput.hidden=true;importInput.setAttribute('aria-label','Import animation JSON file');
    importInput.addEventListener('change',function(){
      var file=importInput.files&&importInput.files[0];if(file)actions.importFile(file);
      importInput.value='';
    });
    action(fileActions,'Import JSON','Restore saved projects from a JSON backup',function(){importInput.click();},options.busy);
    fileActions.appendChild(importInput);
    row.appendChild(projectActions);row.appendChild(fileActions);
    host.appendChild(row);
    if((options.duplicateGroups||[]).length){
      action(fileActions,options.showDuplicates?'Hide duplicates':'Find duplicates ('+options.duplicateGroups.length+')',
        'Review identical saved animations without deleting anything',actions.toggleDuplicates,options.busy);
    }
    var message=el(doc,'p','modern-animation-library-note',options.activeId?
      'Editing: '+(options.activeName||'saved project')+
        (options.dirty?' · Working edits autosaved separately · Save changes updates library':
         ' · Library version saved · Local working copy retained'):
      'Independent working draft · Autosaved in this browser · Save project adds it to Animation Library');
    host.appendChild(message);
    if(options.message){var note=el(doc,'p','modern-animation-library-message'+
      (options.error?' is-error':''),options.message);note.setAttribute('role','status');host.appendChild(note);}
    if((options.draftWorkspaces||[]).length){
      var drafts=el(doc,'section','modern-animation-workspace-list');
      drafts.appendChild(el(doc,'strong','','Working drafts (not saved projects)'));
      drafts.appendChild(el(doc,'p','modern-animation-library-hint',
        'Each draft is kept independently. Open any draft to resume; only Delete draft removes it.'));
      (options.draftWorkspaces||[]).forEach(function(draft){
        var item=el(doc,'div','modern-animation-workspace-item'+(draft.active?' is-active':''));
        item.appendChild(el(doc,'span','',draft.name+' · '+draft.frames+' keyframes'+
          ' · '+new Date(draft.savedAt).toLocaleString()+
          (draft.active?' · Editing':'')));
        var open=button(doc,draft.active?'Current':'Open draft','Resume this local draft',function(){
          actions.openDraft(draft.id);
        });
        open.disabled=!!options.busy||draft.active;item.appendChild(open);
        if(!draft.active){
          var remove=button(doc,'Delete draft','Permanently remove this local draft',function(){
            actions.removeDraft(draft.id);
          });
          remove.disabled=!!options.busy;item.appendChild(remove);
        }
        drafts.appendChild(item);
      });
      host.appendChild(drafts);
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
      'No saved projects yet. Add keyframes and click Save project; Preview animation never adds a project.'));return;}
    if(options.expanded===false)return;
    host.appendChild(el(doc,'p','modern-animation-library-hint',
      'Single-click selects for JSON backup (blue outline) · Open or double-click loads for editing (Editing badge)'));
    var list=el(doc,'div','modern-animation-library-gallery');
    list.setAttribute('aria-label','Saved animation projects');
    entries.forEach(function(entry){
      var p=entry.project,selected=entry.id===options.selectedId,editing=entry.id===options.activeId;
      var card=el(doc,'article','modern-animation-library-card'+(selected?' is-selected':'')+
        (editing?' is-editing':''));
      card.setAttribute('data-animation-id',entry.id);
      card.setAttribute('tabindex','0');
      card.setAttribute('role','group');
      card.setAttribute('aria-label',(editing?'Editing animation: ':selected?'Selected animation: ':'Animation: ')+p.name+
        (selected?' · Selected for JSON backup.':'')+
        '. Click to select for backup; choose Open to edit.');
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
      // Keep the selection badge in the stable card DOM. Its visibility follows
      // is-selected, which the click handler updates without swallowing dblclick.
      var statuses=el(doc,'div','modern-animation-library-card-status');
      statuses.appendChild(el(doc,'span','modern-animation-library-status-selected',
        'Selected for backup'));
      if(editing)statuses.appendChild(el(doc,'span','modern-animation-library-status-editing',
        'Editing'));
      info.appendChild(statuses);
      if((options.editedIds||[]).includes(entry.id))
        info.appendChild(el(doc,'small','modern-animation-library-local-edits',
          'Local draft edits · not yet saved to Library'));
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
        var open=button(doc,'Open','Open saved animation '+p.name+' for editing',function(){actions.open(entry.id);});
        open.disabled=!!options.busy;controls.appendChild(open);
        var rename=button(doc,'Rename','Rename saved animation '+p.name,function(){actions.renameStart(entry.id);});
        rename.disabled=!!options.busy;controls.appendChild(rename);
        var remove=button(doc,'Delete','Delete saved animation '+p.name,function(){actions.remove(entry.id);});
        remove.disabled=!!options.busy;controls.appendChild(remove);
        card.appendChild(controls);
      }
      if(inspector)inspector.bind(card,libraryPreviewEntry(entry),card,
        {keyboardPin:false,focusPreview:false});
      card.setAttribute('aria-keyshortcuts','P');
      list.appendChild(card);
    });
    host.appendChild(list);
  }
  function renderPicker(doc,host,entries,actions,options){
    if(!host||!doc)return;
    options=options||{};
    var inspector=galleryPreview(doc,host,options.open);
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
      item.tabIndex=0;item.setAttribute('aria-label','Preview snapshot '+historyUI.displayName(entry));
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
      if(inspector)inspector.bind(item,entry,item);
      list.appendChild(item);
    });
    host.appendChild(list);
  }
  var CAMERA_NAMES={CameraEast:'East position',CameraNorth:'North position',
    Height:'Camera height (m)',Pan:'Pan',Nick:'Nick',Roll:'Roll',
    FocalLengthField:'Focal length'};
  function friendlyPath(path){
    if(path==='mode')return 'Scene mode';
    if(path.indexOf('camera.')===0)return 'Camera · '+(CAMERA_NAMES[path.slice(7)]||path.slice(7));
    if(path.indexOf('scene.objects.')===0)return 'Objects · '+path.slice(14).replace(/\.(\d+)/g,function(_,n){return ' · item '+(Number(n)+1);});
    if(path==='scene.surface.curvature'||/compare\.[AB]\.surface\.curvature/.test(path))
      return path.replace('surface.curvature','Earth curvature');
    return path.replace(/^display\./,'Display · ').replace(/^scene\./,'Scene · ')
      .replace(/^compare\.([AB])\./,'Compare $1 · ').replace(/\./g,' · ');
  }
  function valueText(value,path){
    if(value===undefined)return '(not active in this mode)';
    if(value===null)return 'null';
    if(path==='mode')return value==='scene'?'Scene':value==='compare'?'Compare':String(value);
    if(/surface\.curvature$/.test(path)&&typeof value==='number')
      return value===0?'Flat (zero curvature)':'Globe (radius '+Number((1/value/1000).toPrecision(12))+' km)';
    if(typeof value==='boolean')return value?'On':'Off';
    if(typeof value==='number')return Number.isFinite(value)?String(Number(value.toPrecision(12))):String(value);
    if(typeof value==='string')return value;
    var json=JSON.stringify(value);
    return json.length>160?json.slice(0,157)+'…':json;
  }
  function issueDescription(issue){
    var explanations={
      'missing-target':'Choose the single physical parameter to animate.',
      'inactive-target':'The selected physical parameter is not active in the initial frame.',
      'ambiguous-unchanged':'All frames are identical; select Camera motion to hold a static view.',
      'missing-name':'Give the project a name.',
      'missing-frame-name':'Give this keyframe a name.',
      'invalid-duration':'Use an incoming travel duration of at least 0.2 seconds.',
      'insufficient-frames':'Add at least two keyframes.',
      'invalid-draft':'The current draft contains invalid data.'};
    return explanations[issue.code]||'This value cannot vary in the selected animation mode.';
  }
  function changeExplanation(change,result){
    var path=change.path,issue=result.issues.find(function(item){return item.path===path;});
    var camera=path.indexOf('camera.')===0&&
      ['CameraEast','CameraNorth','Height','Pan','Nick','Roll','FocalLengthField'].includes(path.slice(7));
    var physical=/^(scene|compare\.[AB])\.(surface\.curvature|temperatureProfile\.gradientKPerKm)$/.test(path);
    if(!issue)return {label:'Interpolated',reason:camera?'Camera motion interpolates this parameter.':
      physical?'The selected physical channel interpolates this value.':'No blocker detected.',blocked:false};
    if(path==='mode')return {label:'Unsupported switch',reason:
      'Scene and Compare cannot be switched inside one continuous animation. Use separate projects.',blocked:true};
    if(issue.code==='camera-change'||issue.code==='physical-change'||
      issue.code==='multiple-physical-channels'||issue.code==='mixed-or-unsupported-change'&&(camera||physical)){
      return {label:'Channel conflict',reason:camera?
        'Camera values can interpolate in Camera motion, but this animation also changes optics or fixed scene settings.':
        'A physical parameter needs one Physical animation channel, with camera and all other parameters fixed.',blocked:true};
    }
    return {label:'Not interpolated',reason:/^camera\./.test(path)?
      'This camera setting is fixed during animation.':'This scene/display setting is fixed during animation; a discrete switch is not supported.',blocked:true};
  }
  function compatibilityDiagnostics(doc,result,draft,actions,options){
    var panel=el(doc,'section','modern-studio-compatibility');
    panel.setAttribute('aria-label','Keyframe transition diagnostics');
    panel.appendChild(el(doc,'strong','','Changes between adjacent keyframes'));
    panel.appendChild(el(doc,'p','modern-studio-hint',
      'Each transition compares the actual keyframe values. One animation supports either camera motion or one physical parameter. Scene/Compare switches are not supported. Globe/Flat can vary as the single Earth-curvature channel.'));
    var firstBlocking=(result.transitions||[]).findIndex(function(transition){
      return transition.changes.some(function(change){return changeExplanation(change,result).blocked;});
    });
    (result.transitions||[]).forEach(function(transition){
      var i=transition.fromIndex,from=draft.frames[i],to=draft.frames[transition.toIndex];
      var blocked=transition.changes.filter(function(change){return changeExplanation(change,result).blocked;});
      var wrapper=el(doc,'div','modern-studio-transition'+(options.diagnosticTransition===i?' is-focused':''));
      var header=el(doc,'div','modern-studio-transition-header');
      header.appendChild(el(doc,'strong','',(i+1)+' → '+(i+2)+' · '+from.name+' → '+to.name));
      header.appendChild(el(doc,'span','modern-studio-transition-count',
        transition.changes.length+' changed · '+blocked.length+' blocking'));
      header.appendChild(button(doc,'Show on timeline',
        'Highlight keyframes '+(i+1)+' and '+(i+2)+' in the timeline',function(){
          if(actions.focusTransition)actions.focusTransition(i);
        }));
      wrapper.appendChild(header);
      var details=el(doc,'details','modern-studio-transition-details');
      if(options.diagnosticTransition===i||
        (options.diagnosticTransition==null&&i===firstBlocking))details.open=true;
      details.appendChild(el(doc,'summary','',
        transition.changes.length?'Show changed parameters and values':'No effective scene or camera changes'));
      if(transition.changes.length){
        var table=el(doc,'table','modern-studio-transition-table');
        var thead=el(doc,'thead'),head=el(doc,'tr');
        ['Parameter','From frame '+(i+1),'To frame '+(i+2),'Handling / reason'].forEach(function(label){
          head.appendChild(el(doc,'th','',label));
        });
        thead.appendChild(head);table.appendChild(thead);
        var tbody=el(doc,'tbody');
        transition.changes.forEach(function(change){
          var info=changeExplanation(change,result),row=el(doc,'tr',info.blocked?'is-blocking':'is-interpolated');
          var field=el(doc,'td','',friendlyPath(change.path));field.title=change.path;
          row.appendChild(field);
          row.appendChild(el(doc,'td','modern-studio-transition-value',valueText(change.from,change.path)));
          row.appendChild(el(doc,'td','modern-studio-transition-value',valueText(change.to,change.path)));
          var why=el(doc,'td');why.appendChild(el(doc,'strong','',info.label));
          why.appendChild(el(doc,'span','modern-studio-transition-reason',info.reason));
          row.appendChild(why);tbody.appendChild(row);
        });
        table.appendChild(tbody);details.appendChild(table);
      }
      wrapper.appendChild(details);panel.appendChild(wrapper);
    });
    var transitionPaths=new Set();(result.transitions||[]).forEach(function(pair){
      pair.changes.forEach(function(item){transitionPaths.add(item.path);});
    });
    var other=result.issues.filter(function(issue){return !transitionPaths.has(issue.path);});
    if(other.length){
      var general=el(doc,'div','modern-studio-general-issues');
      general.appendChild(el(doc,'strong','','Project-wide requirements'));
      var list=el(doc,'ul');other.forEach(function(issue){
        list.appendChild(el(doc,'li','',issueDescription(issue)));
      });general.appendChild(list);panel.appendChild(general);
    }
    return panel;
  }
  function sequenceTitle(item){
    if(item.mode==='camera')return 'Camera motion';
    return (item.target.scope==='scene'?'Scene':'Compare '+item.target.scope)+' · '+
      (item.target.parameter==='surface.curvature'?'Earth curvature':'Temperature gradient');
  }
  function sequenceChooser(doc,draft,options,actions){
    var variants=options.sequences||[];
    var area=el(doc,'section','modern-studio-sequences');
    area.setAttribute('aria-label','Compatible animation sequences');
    area.appendChild(el(doc,'strong','','Compatible sequences'));
    area.appendChild(el(doc,'p','modern-studio-hint',
      'Choose a ready-to-preview sequence for the selected Animation mode. All original keyframes stay in the timeline and working draft; only chosen frames are used for Preview and project/video export. Other frames remain in this local draft, not in exported project JSON.'));
    if(!variants.length){
      area.appendChild(el(doc,'p','modern-studio-hint',draft.frames.length<2?
        'Add at least two keyframes to find sequences.':
        'No compatible sequence with changing values was found for this mode. Change Animation mode or choose other snapshots.'));
    }
    var groups=new Map();
    variants.forEach(function(item){
      var title=sequenceTitle(item);
      if(!groups.has(title))groups.set(title,[]);
      groups.get(title).push(item);
    });
    groups.forEach(function(items,title){
      var group=el(doc,'div','modern-studio-sequence-group');
      group.appendChild(el(doc,'strong','',title+' · '+items.length+' option'+(items.length===1?'':'s')));
      items.forEach(function(item){
        var active=!!draft.activeFrameKeys&&draft.activeFrameKeys.length===item.keys.length&&
          draft.activeFrameKeys.every(function(key){return item.keys.includes(key);})&&
          draft.mode===item.mode&&(item.mode==='camera'||
            draft.target===item.target.scope+'|'+item.target.parameter);
        var card=el(doc,'div','modern-studio-sequence-option'+(active?' is-chosen':''));
        var detail=el(doc,'div','modern-studio-sequence-description');
        detail.appendChild(el(doc,'strong','',item.keys.length+' of '+draft.frames.length+' frames'+
          (active?' · Selected':'')));
        detail.appendChild(el(doc,'span','',item.indices.map(function(i){
          return (i+1)+'. '+draft.frames[i].name;
        }).join(' → ')));
        detail.appendChild(el(doc,'small','',
          (draft.frames.length-item.keys.length)+' other frames retained in draft'));
        card.appendChild(detail);
        var choose=button(doc,active?'Selected':'Use sequence',
          'Use '+sequenceTitle(item)+' from frames '+item.indices.map(function(i){return i+1;}).join(', '),
          function(){if(actions.selectSequence)actions.selectSequence(item.id);});
        choose.disabled=active;card.appendChild(choose);
        group.appendChild(card);
      });
      area.appendChild(group);
    });
    if(draft.activeFrameKeys){
      var clear=button(doc,'Use all keyframes',
        'Clear selected sequence and inspect the entire timeline',function(){
          if(actions.clearSequence)actions.clearSequence();
        });
      area.appendChild(clear);
    }
    return area;
  }
  // Navigation is requested only by an explicit Preview click. A later user
  // scroll/gesture cancels it, so an expensive first RK4 paint cannot yank the
  // viewport away from wherever the user chose to go in the meantime.
  function createPreviewNavigation(view,doc){
    var pending=false;
    var manualKeys=['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '];
    var events=['wheel','touchstart','pointerdown','mousedown'];
    function onKey(event){if(event&&manualKeys.includes(event.key))cancel();}
    function cancel(){
      if(pending&&view&&typeof view.removeEventListener==='function'){
        events.forEach(function(name){view.removeEventListener(name,cancel,true);});
        view.removeEventListener('keydown',onKey,true);
      }
      pending=false;
    }
    function start(){
      cancel();pending=true;
      if(view&&typeof view.addEventListener==='function'){
        events.forEach(function(name){view.addEventListener(name,cancel,true);});
        view.addEventListener('keydown',onKey,true);
      }
    }
    function finish(target){
      if(!pending)return false;
      cancel();
      if(!target||target.hidden||typeof target.scrollIntoView!=='function'||doc&&doc.hidden)return false;
      var reduced=view&&typeof view.matchMedia==='function'&&
        view.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
      return true;
    }
    return Object.freeze({start:start,finish:finish,cancel:cancel,isPending:function(){return pending;}});
  }
  function previewBar(doc,result,actions,prepared,options,atEnd){
    var bar=el(doc,'div','modern-studio-preview-bar'+(atEnd?' is-bottom':''));
    var preview=button(doc,'Preview animation',
      'Prepare in-memory playback without adding a saved project',actions.prepare);
    preview.disabled=!result.compatible;
    bar.appendChild(preview);
    bar.appendChild(el(doc,'span','',prepared?
      'Preview ready above · '+(options.activeId?'Saved project linked':'Working draft; not saved to library'):
      'Prepare the preview to play above; Save project is a separate action.'));
    return bar;
  }
  function render(doc,host,draft,result,actions,prepared,options){
    if(!host||!doc)return;
    var inspector=galleryPreview(doc,host);
    options=options||{};
    var entries=options.entries||[];
    var selected=draft.frames.find(function(f){return f.key===options.selectedKey;})||draft.frames[0];
    host.textContent='';
    var heading=el(doc,'div','modern-studio-header');
    heading.appendChild(el(doc,'strong','','Edit animation · Working draft'));
    heading.appendChild(el(doc,'span','',draft.frames.length+' frames'));
    host.appendChild(heading);
    host.appendChild(el(doc,'p','modern-studio-hint',
      'Edit keyframes below. Preview does not save a project; use Save project in Animation Library above to keep it. Changes never alter the live experiment.'));
    host.appendChild(previewBar(doc,result,actions,prepared,options,false));
    var toolbar=el(doc,'div','modern-studio-toolbar');
    toolbar.appendChild(button(doc,'Choose from History','Open saved experiments to select animation keyframes',actions.choose));
    toolbar.appendChild(button(doc,'Replace with Camera Animation…',
      'Replace ALL current keyframes with the Camera Animation after confirmation',actions.importCamera));
    host.appendChild(toolbar);
    var basics=el(doc,'div','modern-studio-basics');
    basics.appendChild(field(doc,'Project name',draft.name,'text',function(value){actions.edit('name',value);},null,
      function(value){if(actions.liveEdit)actions.liveEdit('name',value);}));
    basics.appendChild(field(doc,'Description',draft.description,'textarea',function(value){actions.edit('description',value);},null,
      function(value){if(actions.liveEdit)actions.liveEdit('description',value);}));
    basics.appendChild(field(doc,'Animation mode',draft.mode,'select',function(value){actions.edit('mode',value);},
      [['auto','Auto-detect'],['camera','Camera motion'],['physical','One physical parameter']]));
    if(draft.mode==='physical'){
      var scopes=[];
      draft.frames.forEach(function(frame){
        var mode=frame.experiment.display.mode;
        (mode==='compare'?['A','B']:['scene']).forEach(function(scope){
          if(!scopes.includes(scope))scopes.push(scope);
        });
      });
      if(!scopes.length)scopes=['scene'];
      var choices=[['auto','Choose physical parameter…']];
      scopes.forEach(function(scope){
        choices.push([scope+'|surface.curvature',scope+' · Earth curvature']);
        choices.push([scope+'|temperatureProfile.gradientKPerKm',scope+' · Temperature gradient']);
      });
      basics.appendChild(field(doc,'Variable to animate',draft.target,'select',function(value){actions.edit('target',value);},choices));
    }
    host.appendChild(basics);
    host.appendChild(sequenceChooser(doc,draft,options,actions));
    var status=el(doc,'div','modern-studio-status');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    if(draft.frames.length<2){
      status.textContent='Choose at least two snapshots to start an animation.';
    }else if(result.compatible){
      status.className+=' is-ready';
      status.textContent='Compatible · '+(result.mode==='camera'?'Camera motion':
        'Physical: '+result.target.scope+' · '+result.target.parameter)+
        ' · '+(options.activeFrames||draft.frames).length+' of '+draft.frames.length+' frames'+
        ' · '+((options.activeFrames||draft.frames).reduce(function(total,f){return total+f.travelMs+f.holdMs;},0)/1000).toFixed(1)+' s'+
        (draft.activeFrameKeys?' · Other frames retained in working draft':'');
    }else{
      status.className+=' is-invalid';
      status.appendChild(el(doc,'strong','','Cannot preview this sequence'));
      status.appendChild(el(doc,'p','',
        'One animation supports camera motion OR one physical parameter; all other scene settings must stay fixed. Inspect the exact transitions below.'));
    }
    host.appendChild(status);
    if(draft.frames.length>=2&&(!result.compatible||options.diagnosticTransition!==null&&
      options.diagnosticTransition!==undefined))
      host.appendChild(compatibilityDiagnostics(doc,result,draft,actions,options));

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

    // Inclusion in the playback sequence and selection for editing are separate states.
    // State labels deliberately do not depend on thumbnail opacity or color alone.
    if(draft.activeFrameKeys){
      var includedCount=draft.frames.filter(function(frame){
        return draft.activeFrameKeys.includes(frame.key);
      }).length;
      var legend=el(doc,'div','modern-studio-filmstrip-legend');
      legend.setAttribute('aria-label','Keyframe timeline legend');
      legend.appendChild(el(doc,'span','modern-studio-legend-included',
        '✓ '+includedCount+' in preview'));
      legend.appendChild(el(doc,'span','modern-studio-legend-excluded',
        '− '+(draft.frames.length-includedCount)+' excluded'));
      if(selected)legend.appendChild(el(doc,'span','modern-studio-legend-editing',
        'Editing: '+selected.name));
      host.appendChild(legend);
    }
    var filmstrip=el(doc,'ol','modern-studio-filmstrip');
    filmstrip.setAttribute('aria-label','Animation keyframe timeline');
    draft.frames.forEach(function(frame,i){
      filmstrip.appendChild(dropSlot(doc,i,actions,options.pickerSelectedCount||0));
      var entry=frameEntry(frame,entries),item=el(doc,'li','modern-studio-filmstrip-item');
      var hasSelection=Array.isArray(draft.activeFrameKeys);
      var inPreview=!hasSelection||draft.activeFrameKeys.includes(frame.key);
      var pick=button(doc,'','Edit animation frame '+(i+1)+': '+frame.name+
        (hasSelection?(inPreview?' (in preview)':' (excluded from preview)'):'')+
        (frame===selected?' (currently editing)':''),function(){
        if(actions.select)actions.select(frame.key);
      });
      pick.className='modern-studio-keyframe'+(frame===selected?' is-active':'')+
        (hasSelection?(inPreview?' is-in-sequence':' is-outside-sequence'):'')+
        (options.diagnosticTransition===i?' is-transition-from':'')+
        (options.diagnosticTransition===i-1?' is-transition-to':'');
      pick.setAttribute('aria-pressed',String(frame===selected));
      if(hasSelection)pick.appendChild(el(doc,'span','modern-studio-sequence-status'+
        (inPreview?' is-included':' is-excluded'),inPreview?'✓ IN PREVIEW':'− EXCLUDED'));
      if(frame===selected&&hasSelection)pick.appendChild(el(doc,'span','modern-studio-editing-status','EDITING'));
      pick.appendChild(historyUI.frameVisual(doc,entry,'modern-studio-keyframe-visual'));
      var name=el(doc,'strong','modern-studio-keyframe-name',(i+1)+'. '+frame.name);
      name.title=frame.name;pick.appendChild(name);
      var summary=el(doc,'small','modern-studio-keyframe-summary',historyUI.frameSummary(entry));
      summary.title=summary.textContent;pick.appendChild(summary);
      item.appendChild(pick);
      if(inspector)inspector.bind(pick,{name:frame.name,description:'Animation keyframe '+(i+1),
        experiment:frame.experiment,thumbnail:entry.thumbnail,
        source:'Animation Studio',createdAt:entry.createdAt},pick,
        {keyboardPin:false,focusPreview:false});
      pick.setAttribute('aria-keyshortcuts','P');
      item.appendChild(cardRemove(doc,'Remove animation frame '+(i+1)+': '+frame.name,function(){
        if(actions.remove)actions.remove(frame.key);
      }));
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
    if(options.undoRemoval){
      var undoBar=el(doc,'div','modern-studio-undo-removal');
      undoBar.setAttribute('role','status');
      undoBar.appendChild(el(doc,'span','',
        'Removed keyframe “'+options.undoRemoval+'” from this animation.'));
      undoBar.appendChild(button(doc,'Undo','Restore the last removed animation keyframe',
        function(){if(actions.undoRemove)actions.undoRemove();}));
      host.appendChild(undoBar);
    }
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
    host.appendChild(previewBar(doc,result,actions,prepared,options,true));
    host.appendChild(el(doc,'p','modern-studio-hint',
      'After a successful Preview, the page moves to Playback above. Edits require another Preview. ' +
      'Export PNG/video from Playback; JSON backup and permanent project saves are in Animation Library.'));
  }
  return Object.freeze({render:render,renderPicker:renderPicker,renderLibrary:renderLibrary,
    createPreviewNavigation:createPreviewNavigation});
}));
