/* Compact DOM-only editor for an autosaved animation draft. The filmstrip
 * uses the shared saved-snapshot presentation; never captures or renders optics.
 */
(function(root,factory){
  var snapshotPresentation=root.CurvatureModernSnapshotPresentation;
  var thumbnailPreview=root.CurvatureModernThumbnailPreview;
  var thumbnailApi=root.CurvatureModernExperimentThumbnail;
  var statusMessages=root.CurvatureModernStatusMessage;
  if(typeof module==='object'&&module.exports){
    snapshotPresentation=require('./ModernSnapshotPresentation');
    thumbnailPreview=require('./ModernThumbnailPreview');
    statusMessages=require('./ModernStatusMessage');
    thumbnailApi=require('./ModernExperimentThumbnail');
  }
  var refs=root.CurvatureModernAnimationPresentation;
  if(typeof module==='object'&&module.exports)refs=require('../../animation/ModernAnimationPresentation');
  var api=factory(snapshotPresentation,thumbnailPreview,statusMessages,thumbnailApi,refs);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationStudioUI=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(snapshotPresentation,thumbnailPreview,statusMessages,thumbnailApi,refs){
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
    var remove=button(doc,'',description,function(event){
      if(event&&event.stopPropagation)event.stopPropagation();
      action();
    });
    remove.className='modern-studio-card-remove modern-card-delete';
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
  // Same isolated control for saved projects and independent working drafts.
  function libraryDelete(doc,description,action,extraClass){
    var remove=cardRemove(doc,description,action);
    remove.className='modern-animation-library-delete modern-card-delete'+(extraClass?' '+extraClass:'');
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
    var controller=thumbnailPreview.create(doc,host,snapshotPresentation.inspectorMarkup);
    host.__thumbnailPreview=controller;
    return controller;
  }
  function libraryPreviewEntry(entry){
    var project=entry.project;
    return {name:project.name,description:project.description||'',
      experiment:project.baseExperiment,thumbnail:entry.thumbnail,
      createdAt:entry.updatedAt,source:'Animation Library'};
  }
  function libraryCardVisual(doc,entry,coverImage,coverLabel){
    var p=entry.project;
    var visual=snapshotPresentation.frameVisual(doc,{name:p.name,experiment:p.baseExperiment,
      thumbnail:entry.thumbnail},'modern-animation-library-visual');
    if(!entry.thumbnail)visual.appendChild(el(doc,'small','modern-animation-library-no-preview',
      'No saved screenshot'));
    if(!coverImage)return visual;
    var wrapper=el(doc,'div','modern-animation-library-visual modern-animation-library-cover');
    var image=el(doc,'img','modern-animation-library-cover-image');
    image.src=coverImage;image.alt=p.name+' cover';image.loading='lazy';
    image.addEventListener('error',function(){image.hidden=true;label.hidden=true;visual.hidden=false;});
    var label=el(doc,'small','modern-animation-library-cover-label',coverLabel||'Project cover');
    visual.hidden=true;wrapper.appendChild(visual);wrapper.appendChild(image);wrapper.appendChild(label);
    return wrapper;
  }
  function libraryCardMeta(project){
    var duration=project.keyframes.reduce(function(sum,frame){return sum+frame.travelMs+frame.holdMs;},0)/1000;
    return (project.mode==='experimental'?'Experimental · no playback':
      project.mode==='camera'?'Camera motion':project.target.parameter==='surface.curvature'?
      'Earth curvature':'Temperature gradient')+' · '+project.keyframes.length+
      ' frames · '+duration.toFixed(1)+' s';
  }
  function renderDemoGallery(doc,host,options,actions,inspector){
    var section=el(doc,'section','modern-animation-library-category modern-demo-category');
    section.setAttribute('aria-label','Built-in Demos');
    var demos=options.demos||[];
    section.appendChild(el(doc,'strong','modern-animation-library-category-title','Built-in Demos · '+demos.length));
    if(options.catalogError)section.appendChild(el(doc,'p','modern-animation-library-message is-error',
      'Built-in demos unavailable: '+options.catalogError));
    else if(!demos.length)section.appendChild(el(doc,'p','modern-animation-library-empty','No built-in demos available.'));
    var gallery=el(doc,'div','modern-animation-library-gallery modern-demo-gallery');
    gallery.setAttribute('aria-label','Built-in demo projects');
    demos.forEach(function(demo){
      var p=demo.project,active=!!options.activeDemo&&options.activeDemo.id===demo.id;
      var card=el(doc,'article','modern-animation-library-card modern-demo-card'+(active?' is-editing':''));
      card.setAttribute('data-demo-id',demo.id);card.setAttribute('role','group');
      card.setAttribute('aria-label',p.name+' · Built-in demo · Read-only');
      card.appendChild(libraryCardVisual(doc,demo,demo.cover?'demos/modern/'+demo.cover.asset:null,
        'Reference image'));
      var info=el(doc,'div','modern-animation-library-card-info');
      var title=el(doc,'strong','modern-animation-library-card-title',p.name);
      title.title=p.name;info.appendChild(title);
      info.appendChild(el(doc,'span','modern-demo-card-status',active?'Opened · Read-only':'Built-in · Read-only'));
      info.appendChild(el(doc,'small','modern-animation-library-card-meta',libraryCardMeta(p)));
      var summary=el(doc,'small','modern-animation-library-card-summary',
        snapshotPresentation.frameSummary({experiment:p.baseExperiment}));
      summary.title=summary.textContent;info.appendChild(summary);
      if(p.description){var description=el(doc,'small','modern-animation-library-card-summary',p.description);
        description.title=p.description;info.appendChild(description);}
      card.appendChild(info);
      var controls=el(doc,'div','modern-animation-library-card-actions');
      function add(label,description,callback,disabled){
        var control=button(doc,label,description,callback);control.disabled=!!disabled;
        controls.appendChild(control);
      }
      add(active?'Opened':'Open demo','Open read-only built-in demo '+p.name,
        function(){actions.openDemo(demo.id);},options.busy||active);
      add('Create copy','Create editable copy of '+p.name,function(){actions.copyDemo(demo.id);},options.busy);
      add('Export demo','Export built-in demo '+p.name,function(){actions.exportDemo(demo.id);},options.busy);
      card.appendChild(controls);
      if(inspector){var preview=libraryPreviewEntry(demo);preview.source='Built-in Demo';
        inspector.infoButton(card,preview,card,p.name);}
      gallery.appendChild(card);
    });
    if(demos.length)section.appendChild(gallery);
    host.appendChild(section);
  }
  function frameEntry(frame,entries,resolve){
    if(resolve)return resolve(frame);
    // Source IDs are provenance, not proof that an image matches the current view.
    var image=thumbnailApi&&thumbnailApi.historyThumbnail(frame,frame.experiment,entries);
    return {name:frame.name,experiment:frame.experiment,thumbnail:image||null};
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
    var inspector=galleryPreview(doc,host,(entries.length>0&&options.expanded!==false)||(options.demos||[]).length>0);
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
    if(options.activeDemo){
      action(projectActions,'Close demo','Return to the previous working draft',actions.closeDemo,options.busy);
    }else action(projectActions,options.activeId?'Save changes':'Save project',
      options.activeId?'Update the opened project in Animation Library':'Add this draft to Animation Library',
      actions.save,options.busy||!options.canSave||!!options.activeId&&!options.dirty);
    if(options.activeId)action(projectActions,'Duplicate',
      'Create and open an independent copy with a new project ID; keep the original unchanged',
      actions.saveAs,options.busy||!options.canSave);
    if(options.activeId){
      action(projectActions,'Stash & restore',
        'Keep the current working changes as a separate draft and reload the saved Library version',
        actions.stashRestore,options.busy||!options.dirty);
      action(projectActions,'Discard changes',
        'Restore the saved Library version without keeping current changes (requires confirmation)',
        actions.discardChanges,options.busy||!options.dirty);
    }
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
    if(entries.some(function(entry){return entry.project.keyframes.some(function(frame){return !!frame.referenceImageIds;});}))
      host.appendChild(el(doc,'p','modern-animation-library-note','JSON backups include all linked original photographs and metadata. Unlinked observations are not included. Keep original files separately.'));
    if((options.duplicateGroups||[]).length){
      action(fileActions,options.showDuplicates?'Hide duplicates':'Find duplicates ('+options.duplicateGroups.length+')',
        'Review identical saved animations without deleting anything',actions.toggleDuplicates,options.busy);
    }
    renderDemoGallery(doc,host,options,actions,inspector);
    var userHeading=el(doc,'div','modern-animation-library-category modern-my-projects-category');
    userHeading.appendChild(el(doc,'strong','modern-animation-library-category-title','My Projects · '+entries.length));
    userHeading.appendChild(el(doc,'small','modern-animation-library-hint',
      'Working drafts ('+(options.draftWorkspaces||[]).length+')'));
    host.appendChild(userHeading);
    var message=el(doc,'p','modern-animation-library-note',options.activeDemo?
      'Opened built-in demo: '+options.activeDemo.project.name+' · Read-only · Create copy to edit.':options.activeId?
      'Opened: '+(options.activeName||'saved project')+
        (options.dirty?' · Working edits autosaved separately · Save changes updates library':
         ' · Saved · Local draft retained'):
      'Independent working draft · Autosaved in this browser · Save project adds it to Animation Library');
    host.appendChild(message);
    if(options.message){
      var note=el(doc,'p','modern-animation-library-message',options.message);
      // Reuse the same presentation as History and the export tools. Library
      // messages are rebuilt with the panel, not replaced by background writes.
      if(statusMessages&&statusMessages.decorate)
        statusMessages.decorate(note,options.error?'error':'info');
      else if(options.error&&note.classList)note.classList.add('is-error');
      note.setAttribute('role',options.error?'alert':'status');host.appendChild(note);
    }
    if((options.draftWorkspaces||[]).length){
      var drafts=el(doc,'section','modern-animation-workspace-list');
      drafts.appendChild(el(doc,'strong','','Working drafts ('+options.draftWorkspaces.length+') · not saved projects'));
      drafts.appendChild(el(doc,'p','modern-animation-library-hint',
        'Autosaved drafts are independent. Cleanup never removes saved Library projects, History or photos.'));
      var cleanup=el(doc,'div','modern-animation-workspace-cleanup');
      var keepLabel=el(doc,'label','modern-animation-workspace-keep-current');
      var keep=el(doc,'input');keep.type='checkbox';keep.checked=true;
      keep.setAttribute('aria-label','Keep current working draft');
      keepLabel.appendChild(keep);keepLabel.appendChild(el(doc,'span','','Keep current draft'));
      cleanup.appendChild(keepLabel);
      var removeAll=button(doc,'Delete all drafts','Delete working drafts after confirmation',
        function(){if(actions.removeAllDrafts)actions.removeAllDrafts(keep.checked);});
      removeAll.className+=' modern-animation-workspace-clear';
      var currentDraft=options.draftWorkspaces.some(function(item){return item.active;});
      function eligible(){removeAll.disabled=!!options.busy||
        (options.draftWorkspaces.length===1&&currentDraft&&keep.checked);}
      keep.addEventListener('change',eligible);eligible();
      cleanup.appendChild(removeAll);drafts.appendChild(cleanup);
      (options.draftWorkspaces||[]).forEach(function(draft){
        var item=el(doc,'div','modern-animation-workspace-item'+(draft.active?' is-active':''));
        item.appendChild(el(doc,'span','',draft.name+' · '+draft.frames+' keyframes'+
          ' · '+new Date(draft.savedAt).toLocaleString()+
          (draft.active?' · Opened':'')));
        var open=button(doc,draft.active?'Current':'Open draft','Resume this local draft',function(){
          actions.openDraft(draft.id);
        });
        open.disabled=!!options.busy||draft.active;item.appendChild(open);
        if(!draft.active){
          var remove=libraryDelete(doc,'Delete draft: '+draft.name,function(){
            actions.removeDraft(draft.id);
          },'modern-animation-workspace-delete');
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
    var filters=options.filters||{};
    var filterbar=el(doc,'div','modern-animation-library-filters');
    var search=el(doc,'input','modern-animation-library-search');
    search.type='search';search.maxLength=160;search.value=options.search===undefined?(filters.query||''):options.search;
    search.placeholder='Search project names, notes and physics…';
    search.setAttribute('aria-label','Find animation projects');
    search.addEventListener('input',function(){
      if(actions.filter)actions.filter('query',search.value,search.selectionStart);
    });
    filterbar.appendChild(search);
    function selector(label,key,choices){
      var field=el(doc,'label','modern-animation-library-filter');
      field.appendChild(el(doc,'span','',label));
      var control=el(doc,'select','modern-animation-library-filter-'+key);
      control.setAttribute('aria-label','Filter animation projects by '+label);
      choices.forEach(function(pair){
        var option=el(doc,'option','',pair[1]);option.value=pair[0];control.appendChild(option);
      });
      control.value=filters[key]||choices[0][0];
      control.addEventListener('change',function(){if(actions.filter)actions.filter(key,control.value);});
      field.appendChild(control);return field;
    }
    filterbar.appendChild(selector('Animation','type',[
      ['all','All types'],['camera','Camera Motion'],['physical','Physics Transition'],
      ['experimental','Experimental']]));
    filterbar.appendChild(selector('Sort','sort',[
      ['updated-desc','Recently updated'],['updated-asc','Oldest updated'],
      ['name-asc','Name A–Z'],['name-desc','Name Z–A']]));
    var advanced=el(doc,'details','modern-animation-library-filter-details');
    advanced.open=!!options.filtersAdvancedOpen;
    advanced.addEventListener('toggle',function(){
      if(actions.toggleFilterDetails)actions.toggleFilterDetails(advanced.open);
    });
    advanced.appendChild(el(doc,'summary','', 'Advanced filters'+(options.filtersActive?' · active':'')));
    var extra=el(doc,'div','modern-animation-library-filter-grid');
    extra.appendChild(selector('Physical channel','channel',[
      ['any','Any channel'],['curvature','Curvature'],['gradient','Temperature gradient']]));
    extra.appendChild(selector('Reference mode','baseMode',[
      ['all','Scene + Compare'],['scene','Scene'],['compare','Compare A/B']]));
    extra.appendChild(selector('Reference geometry','geometry',[
      ['any','Any'],['globe','Globe (either A/B)'],['flat','Flat (either A/B)']]));
    extra.appendChild(selector('Reference atmosphere','atmosphere',[
      ['any','Any'],['vacuum','Vacuum'],['standard','Standard'],
      ['temperature-lapse','Temperature lapse'],['profile-transition','Profile transition'],
      ['inverse-temperature','Inverse temperature'],['inverse-spherical','Inverse spherical'],
      ['exponential-occlusion','Exponential occlusion']]));
    if(filters.baseMode==='compare'){
      extra.appendChild(selector('Geometry A/B','geometryRelation',[
        ['any','Any'],['same','Same'],['different','Different']]));
      extra.appendChild(selector('Refraction A/B','refractionRelation',[
        ['any','Any'],['same','Same'],['different','Different']]));
    }
    extra.appendChild(selector('Scene objects','objects',[
      ['any','Any count'],['none','No objects'],['1-5','1–5 objects'],['6+','6+ objects']]));
    extra.appendChild(selector('Keyframes','frames',[
      ['any','Any'],['zero','0'],['one','1'],['2-5','2–5'],
      ['6-10','6–10'],['11+','11+']]));
    extra.appendChild(selector('Duration','duration',[
      ['any','Any'],['under10','Under 10 s'],['10-30','10–30 s'],['over30','Over 30 s']]));
    advanced.appendChild(extra);filterbar.appendChild(advanced);
    var found=options.visibleEntries||entries;
    var results=el(doc,'div','modern-animation-library-filter-results');
    results.setAttribute('role','status');
    results.appendChild(el(doc,'small','',found.length+' of '+entries.length+' projects found'+
      (options.selectedId&&!found.some(function(e){return e.id===options.selectedId;})?
        ' · selected backup project hidden by filters':'')));
    var clear=button(doc,'Clear filters','Reset Animation Library search and filters',actions.clearFilters||function(){});
    clear.disabled=!options.filtersActive;results.appendChild(clear);
    filterbar.appendChild(results);host.appendChild(filterbar);
    host.appendChild(el(doc,'p','modern-animation-library-hint',
      'Single-click selects for JSON backup (blue outline) · Open or double-click opens a project (Opened badge)'));
    var list=el(doc,'div','modern-animation-library-gallery');
    list.setAttribute('aria-label','Saved animation projects');
    found.forEach(function(entry){
      var p=entry.project,selected=entry.id===options.selectedId,editing=entry.id===options.activeId;
      var card=el(doc,'article','modern-animation-library-card'+(selected?' is-selected':'')+
        (editing?' is-editing':''));
      card.setAttribute('data-animation-id',entry.id);
      card.setAttribute('tabindex','0');
      card.setAttribute('role','group');
      card.setAttribute('aria-label',(editing?'Opened animation: ':selected?'Selected animation: ':'Animation: ')+p.name+
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
      var visual=libraryCardVisual(doc,entry,entry.cover,'Project cover');
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
        'Opened'));
      info.appendChild(statuses);
      if((options.editedIds||[]).includes(entry.id))
        info.appendChild(el(doc,'small','modern-animation-library-local-edits',
          'Local draft edits · not yet saved to Library'));
      info.appendChild(el(doc,'small','modern-animation-library-card-meta',libraryCardMeta(p)));
      var summary=el(doc,'small','modern-animation-library-card-summary',
        snapshotPresentation.frameSummary({experiment:p.baseExperiment}));
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

        if(actions.uploadCover){
          var input=el(doc,'input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
          input.hidden=true;input.setAttribute('aria-label','Cover image for '+p.name);
          input.addEventListener('change',function(){
            var file=input.files&&input.files[0];if(file)actions.uploadCover(entry.id,file);
            input.value='';
          });
          var upload=button(doc,'Upload cover','Choose or replace a project cover',function(){input.click();});
          upload.disabled=!!options.busy||!!options.activeDemo;controls.appendChild(upload);controls.appendChild(input);
          var capture=button(doc,'Capture frame','Use the current paused preview frame as cover',function(){actions.captureCover(entry.id);});
          capture.disabled=!!options.busy||!!options.activeDemo||!editing;controls.appendChild(capture);
          if(entry.cover){
            var clear=button(doc,'Remove cover','Remove custom cover and show the saved thumbnail',function(){actions.removeCover(entry.id);});
            clear.disabled=!!options.busy||!!options.activeDemo;controls.appendChild(clear);
          }
        }
        card.appendChild(controls);
      }
      var remove=libraryDelete(doc,'Delete saved animation '+p.name,function(){actions.remove(entry.id);});
      remove.disabled=!!options.busy;card.appendChild(remove);
      if(inspector)inspector.infoButton(card,libraryPreviewEntry(entry),card,p.name);
      list.appendChild(card);
    });
    if(!found.length)list.appendChild(el(doc,'p','modern-animation-library-empty',
      'No saved projects match these filters. Clear filters to see all projects.'));
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
    head.appendChild(el(doc,'strong','',options.wizard?'Choose initial keyframes':'Snapshot Picker'));
    if(!options.wizard)head.appendChild(button(doc,'×','Close Snapshot Picker',actions.pickerClose));
    host.appendChild(head);
    host.appendChild(el(doc,'p','modern-studio-hint',
      options.wizard?'Check compatible snapshots to include in the new project. Selection is not added to the current timeline.':
      'Drag saved snapshots to a gap in the timeline. Check several to insert them together.'));
    if(options.contractMode&&!options.wizard){
      var contract=el(doc,'div','modern-studio-picker-contract');
      contract.appendChild(el(doc,'strong','',options.contractMode));
      contract.appendChild(el(doc,'small','',
        'Project compatibility is required for both checked frames and drag-and-drop.'));
      var show=el(doc,'label','modern-studio-picker-show-incompatible');
      var showCheck=el(doc,'input');showCheck.type='checkbox';
      showCheck.checked=!!options.showIncompatible;
      showCheck.setAttribute('aria-label','Show incompatible project snapshots');
      showCheck.addEventListener('change',function(){
        if(actions.pickerShowIncompatible)actions.pickerShowIncompatible(showCheck.checked);
      });
      show.appendChild(showCheck);
      show.appendChild(el(doc,'span','','Show incompatible ('+(options.incompatibleCount||0)+')'));
      contract.appendChild(show);host.appendChild(contract);
    }
    var filters=options.filters||{query:options.search||'',mode:'all',geometry:'any',
      atmosphere:'any',geometryRelation:'any',refractionRelation:'any'};
    var search=el(doc,'input','modern-studio-picker-search');
    search.type='search';search.maxLength=160;search.value=options.search===undefined?filters.query||'':options.search;
    search.placeholder='Name, notes, physics…';search.setAttribute('aria-label','Find saved snapshots');
    search.addEventListener('input',function(){
      actions.pickerFilter('query',search.value,search.selectionStart);
    });host.appendChild(search);
    function selector(label,key,choices,description){
      var wrapper=el(doc,'label','modern-studio-picker-filter');
      wrapper.appendChild(el(doc,'span','',label));
      var select=el(doc,'select','modern-studio-picker-filter-'+key);
      if(description)select.title=description;
      select.setAttribute('aria-label','Filter picker by '+label);
      choices.forEach(function(pair){
        var opt=el(doc,'option','',pair[1]);opt.value=pair[0];select.appendChild(opt);
      });
      select.value=filters[key]||choices[0][0];
      select.addEventListener('change',function(){actions.pickerFilter(key,select.value);});
      wrapper.appendChild(select);return wrapper;
    }
    var advanced=el(doc,'details','modern-studio-picker-filter-details');
    advanced.open=!!options.advancedOpen;
    advanced.addEventListener('toggle',function(){
      if(actions.pickerAdvancedToggle)actions.pickerAdvancedToggle(advanced.open);
    });
    var advancedActive=filters.mode!=='all'||filters.geometry!=='any'||
      filters.atmosphere!=='any'||filters.geometryRelation!=='any'||
      filters.refractionRelation!=='any';
    advanced.appendChild(el(doc,'summary','','Advanced filters'+(advancedActive?' · active':'')));
    var controls=el(doc,'div','modern-studio-picker-filters');
    controls.appendChild(selector('Type','mode',[
      ['all','Scene + Compare'],['scene','Scene only'],['compare','Compare A/B only']]));
    controls.appendChild(selector('Geometry','geometry',[
      ['any','Any geometry'],['globe','Globe (either A/B)'],['flat','Flat (either A/B)']],
      'In Compare, matches either A or B'));
    controls.appendChild(selector('Atmosphere','atmosphere',[
      ['any','Any atmosphere'],['vacuum','Vacuum'],['standard','Standard'],
      ['temperature-lapse','Temperature lapse'],['profile-transition','Profile transition'],
      ['inverse-temperature','Inverse temperature'],['inverse-spherical','Inverse spherical'],
      ['exponential-occlusion','Exponential occlusion']],
      'In Compare, matches either A or B'));
    if(filters.mode==='compare'){
      var relations=el(doc,'div','modern-studio-picker-relations');
      relations.appendChild(el(doc,'strong','modern-studio-picker-relations-title',
        'A/B differences · active physics only'));
      relations.appendChild(selector('Geometry A/B','geometryRelation',[
        ['any','Any'],['same','Same'],['different','Different']],
        'Compare active geometry including Globe radius; Flat radius is ignored'));
      relations.appendChild(selector('Refraction A/B','refractionRelation',[
        ['any','Any'],['same','Same'],['different','Different']],
        'Compare active refraction including gradients and profiles'));
      controls.appendChild(relations);
    }
    controls.appendChild(button(doc,'Clear filters','Clear Snapshot Picker filters',actions.pickerFiltersClear));
    advanced.appendChild(controls);host.appendChild(advanced);
    var selected=options.checked||{};
    var n=options.selectedCount===undefined?
      entries.filter(function(e){return !!selected[e.id];}).length:options.selectedCount;
    var total=options.totalEntries===undefined?entries.length:options.totalEntries;
    var hidden=Math.max(0,n-entries.filter(function(e){return !!selected[e.id];}).length);
    var eligible=options.wizard?entries.filter(function(e){
      return !options.compatibility||options.compatibility(e).allowed;
    }):[];
    var tools=el(doc,'div','modern-studio-picker-tools');
    tools.appendChild(el(doc,'small','',n+' selected'+(hidden?' ('+hidden+' hidden)':'')+
      ' · '+entries.length+' of '+total+' found'+
      (options.wizard?' · '+eligible.length+' compatible':
        options.contractMode?' · '+(options.compatibleCount||0)+' compatible':'')));
    if(hidden)tools.appendChild(el(doc,'small','modern-studio-picker-hidden-note',
      options.wizard?'Hidden selections remain selected for project creation.':
      'Add checked and dragging a checked card include hidden selections.'));
    if(options.wizard){
      var unselected=eligible.filter(function(e){return !selected[e.id];});
      var selectAll=button(doc,'Select all matching',
        'Select all compatible snapshots matching the current filters',actions.pickerSelectMatching);
      selectAll.disabled=!unselected.length;tools.appendChild(selectAll);
      var selectedVisible=entries.some(function(e){return !!selected[e.id];});
      var deselect=button(doc,'Deselect matching',
        'Deselect matching snapshots without changing hidden selections',actions.pickerDeselectMatching);
      deselect.disabled=!selectedVisible;tools.appendChild(deselect);
    }else{
      var add=button(doc,'Add checked','Add checked snapshots after selected frame',function(){actions.insertChecked();});
      add.disabled=n===0;tools.appendChild(add);
    }
    if(n)tools.appendChild(button(doc,options.wizard?'Clear selection':'Clear selected',
      'Uncheck all selected snapshots',actions.pickerClearSelection));
    host.appendChild(tools);
    var list=el(doc,'ol','modern-studio-picker-list');
    if(!entries.length)list.appendChild(el(doc,'li','modern-history-empty',
      options.contractMode&&!options.showIncompatible?
        'No compatible snapshots match these filters. Show incompatible to inspect why.':
        'No matching snapshots.'));
    entries.forEach(function(entry){
      var item=el(doc,'li','modern-studio-picker-card');
      item.setAttribute('data-picker-id',String(entry.id));
      item.tabIndex=0;item.setAttribute('aria-label','Preview snapshot '+snapshotPresentation.displayName(entry));
      var check=el(doc,'input','modern-studio-picker-checkbox');check.type='checkbox';
      var verdict=options.compatibility?options.compatibility(entry):null;
      check.checked=!!selected[entry.id]&&(!verdict||verdict.allowed);
      // A previously chosen History record may have changed. Keep it
      // uncheckable even if it is no longer eligible for new selection.
      check.disabled=!!verdict&&!verdict.allowed;
      check.setAttribute('aria-label','Select snapshot '+entry.id);
      if(check.disabled)item.className+=' is-incompatible';
      check.addEventListener('change',function(){actions.pickerToggle(entry.id,check.checked);});
      item.appendChild(check);
      var visual=snapshotPresentation.frameVisual(doc,entry,'modern-studio-picker-visual');item.appendChild(visual);
      var info=el(doc,'div','modern-studio-picker-info');
      var title=el(doc,'strong','',snapshotPresentation.displayName(entry));title.title=title.textContent;
      info.appendChild(title);
      var summary=el(doc,'small','',snapshotPresentation.frameSummary(entry));
      summary.title=summary.textContent;info.appendChild(summary);
      if(verdict&&!verdict.allowed){
        var issue=(verdict.issues||[]).slice(0,3).map(function(x){
          return friendlyPath(x.path||'snapshot');
        }).join(', ');
        info.appendChild(el(doc,'small','modern-studio-picker-incompatibility',
          'Incompatible: '+(issue||'does not satisfy project constraints')));
      }
      var openHistory=button(doc,'Open in History',
        'Open '+snapshotPresentation.displayName(entry)+' in History without restoring it',function(event){
          if(event&&event.stopPropagation)event.stopPropagation();
          if(actions.pickerOpenHistory)actions.pickerOpenHistory(entry.id);
        });
      openHistory.className='modern-studio-picker-open-history';
      openHistory.draggable=false;
      // Picker cards are draggable. Their navigation buttons must not start a
      // card drag or change the checked snapshot selection.
      ['pointerdown','mousedown','dblclick','dragstart'].forEach(function(type){
        openHistory.addEventListener(type,function(event){
          if(event&&event.stopPropagation)event.stopPropagation();
          if((type==='mousedown'||type==='dragstart')&&event&&event.preventDefault)
            event.preventDefault();
        });
      });
      info.appendChild(openHistory);item.appendChild(info);
      if(!options.wizard&&(!verdict||verdict.allowed)){
        var handle=el(doc,'span','modern-studio-drag-handle','⠿');
        handle.title='Drag snapshot into timeline';handle.setAttribute('aria-label','Drag snapshot '+entry.id);
        item.appendChild(handle);
        makeDragSource(doc,item,handle,{kind:'snapshots',id:entry.id},actions);
      }
      if(inspector)inspector.infoButton(item,entry,item,snapshotPresentation.displayName(entry));
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
    if(draft.contract){
      area.appendChild(el(doc,'strong','','Project compatibility contract'));
      area.appendChild(el(doc,'p','modern-studio-hint',
        draft.contract.mode==='experimental'?
          'Experimental keeps full snapshots; it can be saved without a playable sequence.':
          'All saved keyframes must match the locked reference experiment. '+
          'Preview becomes available when at least two compatible frames are present.'));
      return area;
    }
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
  // Navigation only: the prepared sequence and exact arrival times belong to
  // the player. The editor below retains all draft frames and mutation controls.
  function renderStoryboard(doc,host,draft,frames,times,selectedKey,select,options){
    options=options||{};
    if(!host)return;
    var previous=host.querySelector&&host.querySelector('.modern-animation-storyboard-list');
    var scroll=previous?previous.scrollLeft:0;
    var previousKey=host.__storyboardSelectedKey;
    host.textContent='';
    host.hidden=!frames.length||frames.length!==times.length;
    host.__storyboardSelectedKey=selectedKey;
    if(host.hidden)return;
    var header=el(doc,'div','modern-animation-storyboard-heading');
    header.appendChild(el(doc,'strong','','Storyboard · Keyframes'));
    header.appendChild(el(doc,'small','',frames.length+' of '+draft.frames.length+' · Click to pause and jump'));
    if(options.refresh){
      var refresh=button(doc,'Capture thumbnail','Capture selected keyframe thumbnail',function(){options.refresh(selectedKey);});
      refresh.className='modern-studio-action modern-animation-storyboard-capture modern-animation-author-only';
      refresh.disabled=!frames.some(function(frame){return frame.key===selectedKey;});
      header.appendChild(refresh);
    }
    if(options.batch){
      [['Capture all keyframes','missing'],['Regenerate all thumbnails','refresh'],
       ['Export with thumbnails','export'],['Export without thumbnails','compact']].forEach(function(item){
        var control=button(doc,item[0],item[0],function(){options.batch(item[1]);});
        control.className='modern-studio-action modern-animation-author-only';
        var exportAction=item[1]==='export'||item[1]==='compact';
        control.disabled=!!options.batchBusy;
        if(exportAction&&options.exportVariant){
          var label=item[0]+' ('+options.exportVariant+')';
          control.textContent=label;control.title=label+' · authored project unchanged';
          control.setAttribute('aria-label',label);
        }
        header.appendChild(control);
      });
      if(options.batchBusy){
        var cancel=button(doc,'Cancel capture','Cancel storyboard capture',options.cancelBatch);
        cancel.className='modern-studio-action modern-animation-author-only';header.appendChild(cancel);
      }
      var status=el(doc,'small','modern-animation-storyboard-status modern-animation-author-only',options.batchStatus||'');
      status.setAttribute('role','status');header.appendChild(status);
    }
    host.appendChild(header);
    if(frames.some(function(frame){return !!frame.referenceImageIds;}))
      host.appendChild(el(doc,'p','modern-studio-hint modern-animation-author-only','Both Storyboard JSON options include linked original photographs and metadata. Only simulated keyframe thumbnails are optional.'));
    var list=el(doc,'ol','modern-animation-storyboard-list');
    list.setAttribute('aria-label','Playback keyframes');
    var active=null;
    frames.forEach(function(frame,i){
      var index=draft.frames.findIndex(function(f){return f.key===frame.key;})+1;
      var time=(times[i].arrivalMs/1000).toFixed(2)+' s';
      var item=el(doc,'li','modern-animation-storyboard-item');
      var control=button(doc,'','Jump to keyframe '+index+': '+frame.name+' · '+time,function(){select(frame.key,'storyboard');});
      control.className='modern-animation-storyboard-card'+(frame.key===selectedKey?' is-active':'');
      control.setAttribute('aria-pressed',String(frame.key===selectedKey));
      control.title=frame.name+' · '+time+(frame.narrativeTitle?'\n'+frame.narrativeTitle:'')+(frame.description?'\n'+frame.description:'');
      if(options.resolve)control.appendChild(snapshotPresentation.frameVisual(doc,options.resolve(frame),'modern-animation-storyboard-visual'));
      control.appendChild(el(doc,'strong','modern-animation-storyboard-name',index+'. '+frame.name));
      control.appendChild(el(doc,'small','modern-animation-storyboard-time',time));
      item.appendChild(control);list.appendChild(item);
      if(frame.key===selectedKey)active=control;
    });
    host.appendChild(list);
    list.scrollLeft=scroll;
    // Do not scroll the page: reveal selection only within the horizontal strip.
    if(active&&previousKey!==selectedKey&&list.getBoundingClientRect&&active.getBoundingClientRect){
      var bounds=list.getBoundingClientRect(),card=active.getBoundingClientRect();
      if(card.left<bounds.left)list.scrollLeft+=card.left-bounds.left-4;
      else if(card.right>bounds.right)list.scrollLeft+=card.right-bounds.right+4;
    }
  }
  // Selected-frame authoring only. Originals load only on explicit inspection.
  function renderReferenceLinks(doc,panel,frame,actions,list,get){
    var ids=frame.referenceImageIds||[],rows=null,busy=false;
    var section=el(doc,'section','modern-studio-reference-links');
    section.appendChild(el(doc,'strong','','Reference photographs ('+ids.length+')'));
    section.appendChild(el(doc,'p','modern-studio-hint',
      'Local observation links only. JSON exports retain IDs, not photographs yet. Unlinking never deletes the original.'));
    var status=el(doc,'p','modern-studio-hint');status.setAttribute('role','status');
    var linked=el(doc,'div','modern-studio-reference-list');
    var tools=el(doc,'div','modern-studio-toolbar');
    var picker=el(doc,'div','modern-studio-reference-gallery');picker.setAttribute('role','group');picker.setAttribute('aria-label','Reference photograph to attach');
    var selectedId='',choices=[];
    function thumb(row){
      var visual=el(doc,'span','modern-reference-thumb');
      if(row&&row.thumbnail){var img=el(doc,'img');img.src=row.thumbnail.dataUrl;img.alt=row.title;img.loading='lazy';visual.appendChild(img);}
      else visual.textContent='No thumbnail';
      return visual;
    }
    function inspect(id){if(refs&&get)refs.showReference(doc,section,id,get);}
    function pick(id){selectedId=id;choices.forEach(function(c){c.button.setAttribute('aria-pressed',String(c.id===id));});attach.disabled=!id||busy||ids.length>=100;}
    function change(next){if(section.isConnected===false)return;actions.frame(frame.key,'referenceImageIds',next);}
    function move(i,step){var next=ids.slice(),other=next[i+step];next[i+step]=next[i];next[i]=other;change(next);}
    var attach=button(doc,'Attach','Attach selected reference photograph',function(){
      var id=selectedId;if(rows&&rows.some(function(row){return row.id===id;})&&!ids.includes(id)&&ids.length<100)change(ids.concat([id]));
    });
    var refresh=button(doc,'Load photographs','Load local reference photographs',load);
    function paint(){
      linked.textContent='';picker.textContent='';choices=[];
      if(!ids.length)linked.appendChild(el(doc,'p','modern-studio-hint','No reference photographs linked.'));
      ids.forEach(function(id,i){
        var row=rows&&rows.find(function(item){return item.id===id;});
        var item=el(doc,'div','modern-studio-reference-row');
        var label=el(doc,'span','',row?row.title:rows?'Missing local photograph: '+id:'Unresolved local photograph: '+id);
        var visual=button(doc,'','View original photograph '+(i+1),function(){inspect(id);});
        visual.className+=' modern-reference-thumb-button';visual.appendChild(thumb(row));visual.disabled=!row||typeof get!=='function';
        item.appendChild(visual);label.title=id;item.appendChild(label);
        var up=button(doc,'↑','Move reference photograph '+(i+1)+' earlier',function(){move(i,-1);});up.disabled=i===0;item.appendChild(up);
        var down=button(doc,'↓','Move reference photograph '+(i+1)+' later',function(){move(i,1);});down.disabled=i===ids.length-1;item.appendChild(down);
        item.appendChild(button(doc,'Unlink','Unlink reference photograph '+(i+1),function(){change(ids.filter(function(x){return x!==id;}));}));
        linked.appendChild(item);
      });
      var candidates=(rows||[]).filter(function(row){return !ids.includes(row.id);});
      if(!candidates.length)picker.appendChild(el(doc,'p','modern-studio-hint',rows?'No unlinked photographs.':'Load the local library first'));
      candidates.forEach(function(row){
        var option=button(doc,'','Select photograph '+row.title,function(){pick(row.id);});
        option.className+=' modern-reference-choice';choices.push({id:row.id,button:option});option.disabled=busy||ids.length>=100;
        option.appendChild(thumb(row));option.appendChild(el(doc,'span','',row.title));option.title=row.id;picker.appendChild(option);
      });
      pick('');refresh.disabled=busy||typeof list!=='function';
    }
    async function load(){
      if(busy||typeof list!=='function')return;
      busy=true;refresh.disabled=true;choices.forEach(function(c){c.button.disabled=true;});attach.disabled=true;status.textContent='Loading local photographs…';
      try{var found=await list();if(section.isConnected===false)return;rows=found;
        status.textContent=rows.length?'Local library loaded.':'No local photographs. Import one in Reference Image Library.';
      }catch(error){rows=null;status.textContent='Cannot resolve local photographs: '+(error.message||error);}
      finally{busy=false;if(section.isConnected!==false)paint();}
    }
    tools.appendChild(refresh);tools.appendChild(attach);
    section.appendChild(status);section.appendChild(linked);section.appendChild(tools);section.appendChild(picker);panel.appendChild(section);paint();
    if(ids.length)load();
  }
  function render(doc,host,draft,result,actions,prepared,options){
    if(!host||!doc)return;
    var inspector=galleryPreview(doc,host);
    options=options||{};
    var entries=options.entries||[];
    var selected=draft.frames.find(function(f){return f.key===options.selectedKey;})||draft.frames[0];
    if(host.__studioLastSelectedKey!==(selected&&selected.key))
      host.__studioInspectorMode=selected?'frame':'project';
    host.__studioLastSelectedKey=selected&&selected.key;
    host.textContent='';
    var heading=el(doc,'div','modern-studio-header');
    heading.appendChild(el(doc,'strong','',options.readOnly?'Built-in demo · Read-only':'Edit animation · Working draft'));
    heading.appendChild(el(doc,'span','',draft.frames.length+' frames'));
    host.appendChild(heading);
    if(options.readOnly){
      host.appendChild(el(doc,'strong','',draft.name));
      host.appendChild(el(doc,'p','modern-studio-hint',draft.description));
      host.appendChild(el(doc,'p','modern-studio-hint',
        'Select a keyframe to pause and jump to its arrival time, or play and seek above. Create copy in Animation Library to change this project.'));
      if(options.storyboard)return; // navigation is adjacent to the player
      var list=el(doc,'ol','modern-studio-filmstrip');
      list.setAttribute('aria-label','Read-only keyframes');
      draft.frames.forEach(function(frame,i){
        var item=el(doc,'li','modern-studio-filmstrip-item');
        var control=button(doc,(i+1)+' · '+frame.name,'Jump to keyframe '+(i+1),function(){actions.select(frame.key);});
        control.className+=' modern-studio-keyframe'+(frame===selected?' is-active':'');
        control.setAttribute('aria-pressed',String(frame===selected));
        item.appendChild(control);list.appendChild(item);
      });
      host.appendChild(list);
      if(selected){
        var details=el(doc,'section','modern-studio-selected-frame');
        details.appendChild(el(doc,'strong','',selected.name));
        details.appendChild(el(doc,'p','', 'Travel: '+selected.travelMs/1000+' s · Hold: '+selected.holdMs/1000+' s · Easing: '+selected.easing));
        var entry=frameEntry(selected,entries,options.resolveFrame);
        details.appendChild(el(doc,'p','',snapshotPresentation.frameSummary(entry)));
        host.appendChild(details);
      }
      return;
    }
    host.appendChild(el(doc,'p','modern-studio-hint',
      'Select a timeline keyframe to edit it in the Inspector. Preview does not save a project; use Library for permanent saves. Changes never alter the live experiment.'));
    host.appendChild(previewBar(doc,result,actions,prepared,options,false));
    var toolbar=el(doc,'div','modern-studio-toolbar');
    var undo=button(doc,'Undo','Undo the last animation draft edit',function(){if(actions.undo)actions.undo();});
    undo.className+=' modern-studio-edit-undo';undo.disabled=!options.canUndo;
    toolbar.appendChild(undo);
    var redo=button(doc,'Redo','Redo the last undone animation draft edit',function(){if(actions.redo)actions.redo();});
    redo.className+=' modern-studio-edit-redo';redo.disabled=!options.canRedo;
    toolbar.appendChild(redo);
    toolbar.appendChild(button(doc,'Choose from History','Open saved experiments to select animation keyframes',actions.choose));
    if(!draft.contract)toolbar.appendChild(button(doc,'Replace with Camera Animation…',
      'Replace ALL current keyframes with the Camera Animation after confirmation',actions.importCamera));
    host.appendChild(toolbar);
    // Both Inspector modes reuse existing controllers; switching does not rerender inputs.
    var workspace=el(doc,'div','modern-studio-editor-workspace');
    var timelinePane=el(doc,'section','modern-studio-timeline-pane');
    timelinePane.setAttribute('aria-label','Animation keyframe timeline workspace');
    var inspectorPane=el(doc,'aside','modern-studio-inspector-pane');
    inspectorPane.setAttribute('aria-label','Animation inspector');
    var nav=el(doc,'div','modern-studio-inspector-nav');
    nav.setAttribute('role','group');nav.setAttribute('aria-label','Inspector modes');
    var framePane=el(doc,'section','modern-studio-frame-panel');
    framePane.id='modern-studio-frame-inspector';
    var projectPane=el(doc,'section','modern-studio-project-panel');
    projectPane.id='modern-studio-project-inspector';
    function showInspector(mode){
      var isProject=mode==='project'||!selected;
      host.__studioInspectorMode=isProject?'project':'frame';
      framePane.hidden=isProject;projectPane.hidden=!isProject;
      frameTab.setAttribute('aria-pressed',String(!isProject));
      projectTab.setAttribute('aria-pressed',String(isProject));
    }
    var frameTab=button(doc,'Keyframe','Inspect selected keyframe',function(){showInspector('frame');});
    frameTab.disabled=!selected;frameTab.setAttribute('aria-controls',framePane.id);
    var projectTab=button(doc,'Project settings','Inspect project settings',function(){showInspector('project');});
    projectTab.setAttribute('aria-controls',projectPane.id);
    nav.appendChild(frameTab);nav.appendChild(projectTab);
    inspectorPane.appendChild(nav);inspectorPane.appendChild(framePane);inspectorPane.appendChild(projectPane);
    workspace.appendChild(timelinePane);workspace.appendChild(inspectorPane);host.appendChild(workspace);
    var basics=el(doc,'div','modern-studio-basics');
    basics.appendChild(field(doc,'Project name',draft.name,'text',function(value){actions.edit('name',value);},null,
      function(value){if(actions.liveEdit)actions.liveEdit('name',value);}));
    basics.appendChild(field(doc,'Description',draft.description,'textarea',function(value){actions.edit('description',value);},null,
      function(value){if(actions.liveEdit)actions.liveEdit('description',value);}));
    if(draft.contract){
      basics.appendChild(el(doc,'p','modern-studio-hint',
        'Locked project contract: '+(draft.mode==='experimental'?'Experimental · snapshots retained, video not supported':
          draft.mode==='camera'?'Camera motion':'One physical parameter')+
        '. Project mode and physical channel cannot be changed here.'));
    }else basics.appendChild(field(doc,'Animation mode',draft.mode,'select',function(value){actions.edit('mode',value);},
      [['auto','Auto-detect'],['camera','Camera motion'],['physical','One physical parameter']]));
    if(draft.mode==='physical'&&draft.contract){
      basics.appendChild(el(doc,'p','modern-studio-hint',
        'Locked physical target: '+draft.target.replace('|',' · ')));
    }else if(draft.mode==='physical'){
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
    projectPane.appendChild(basics);
    projectPane.appendChild(sequenceChooser(doc,draft,options,actions));
    var status=el(doc,'div','modern-studio-status');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    if(draft.frames.length<2){
      status.textContent=draft.contract&&draft.contract.mode==='experimental'?
        'Experimental project · complete snapshots can be saved, but video playback is not available.':
        'Choose at least two snapshots to start an animation.';
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
        draft.contract&&draft.contract.mode==='experimental'?
          'Experimental projects preserve all valid snapshots. No interpolation or video export is supported.':
          'One animation supports camera motion OR one physical parameter; all other scene settings must stay fixed. Inspect the exact transitions below.'));
    }
    timelinePane.appendChild(status);
    var disclosure=null;
    if(draft.frames.length>=2&&!(draft.contract&&draft.contract.mode==='experimental')&&
      (!result.compatible||options.diagnosticTransition!==null&&
      options.diagnosticTransition!==undefined)){
      disclosure=el(doc,'details','modern-studio-diagnostics-disclosure');
      disclosure.open=options.diagnosticTransition!==null&&options.diagnosticTransition!==undefined;
      disclosure.appendChild(el(doc,'summary','',
        'Transition diagnostics · '+(result.transitions||[]).length+' transitions'+
        (!result.compatible?' · preview blocked':'')));
      disclosure.appendChild(compatibilityDiagnostics(doc,result,draft,actions,options));
    }

    if(selected){
      var previewEntry=frameEntry(selected,entries,options.resolveFrame);
      var preview=el(doc,'section','modern-studio-preview');
      preview.setAttribute('aria-label','Selected saved keyframe preview');
      var previewVisual=snapshotPresentation.frameVisual(doc,previewEntry,'modern-studio-preview-visual');
      preview.appendChild(previewVisual);
      var previewCaption=el(doc,'div','modern-studio-preview-caption');
      previewCaption.appendChild(el(doc,'strong','',selected.name));
      previewCaption.appendChild(el(doc,'p','',snapshotPresentation.frameSummary(previewEntry)));
      previewCaption.appendChild(el(doc,'small','',
        'Keyframe thumbnail · use the independent optical viewport above to play a prepared project.'));
      preview.appendChild(previewCaption);framePane.appendChild(preview);
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
      timelinePane.appendChild(legend);
    }
    var filmstrip=el(doc,'ol','modern-studio-filmstrip');
    filmstrip.setAttribute('aria-label','Animation keyframe timeline');
    draft.frames.forEach(function(frame,i){
      filmstrip.appendChild(dropSlot(doc,i,actions,options.pickerSelectedCount||0));
      var entry=frameEntry(frame,entries,options.resolveFrame),item=el(doc,'li','modern-studio-filmstrip-item');
      var hasSelection=Array.isArray(draft.activeFrameKeys);
      var inPreview=!hasSelection||draft.activeFrameKeys.includes(frame.key);
      var pick=button(doc,'','Edit animation frame '+(i+1)+': '+frame.name+
        (hasSelection?(inPreview?' (in preview)':' (excluded from preview)'):'')+
        (frame===selected?' (currently editing)':''),function(){
        host.__studioInspectorMode='frame';
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
      pick.appendChild(snapshotPresentation.frameVisual(doc,entry,'modern-studio-keyframe-visual'));
      var name=el(doc,'strong','modern-studio-keyframe-name',(i+1)+'. '+frame.name);
      name.title=frame.name;pick.appendChild(name);
      var summary=el(doc,'small','modern-studio-keyframe-summary',snapshotPresentation.frameSummary(entry));
      summary.title=summary.textContent;pick.appendChild(summary);
      item.appendChild(pick);
      if(inspector)inspector.infoButton(item,{name:frame.name,description:'Animation keyframe '+(i+1),
        experiment:frame.experiment,thumbnail:entry.thumbnail,
        source:'Animation Studio',createdAt:entry.createdAt},item,frame.name);
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
    timelinePane.appendChild(filmstrip);
    // Detailed diagnostics follow the timeline, even when a focused transition is expanded.
    if(disclosure)timelinePane.appendChild(disclosure);
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
      // Keep Undo/Redo near the reordering controls as well as in the toolbar
      // above the long keyframe strip. Both locations use one shared history.
      var undoHere=button(doc,'Undo','Undo the last animation draft edit',function(){if(actions.undo)actions.undo();});
      undoHere.className+=' modern-studio-edit-undo';
      undoHere.disabled=!options.canUndo;controls.appendChild(undoHere);
      var redoHere=button(doc,'Redo','Redo the last undone animation draft edit',function(){if(actions.redo)actions.redo();});
      redoHere.className+=' modern-studio-edit-redo';
      redoHere.disabled=!options.canRedo;controls.appendChild(redoHere);
      header.appendChild(controls);panel.appendChild(header);
      panel.appendChild(el(doc,'small','modern-studio-frame-source',
        selected.sourceSnapshotId===null?'Self-contained animation keyframe':
          'History snapshot #'+selected.sourceSnapshotId));
      var fields=el(doc,'div','modern-studio-frame-fields');
      fields.appendChild(field(doc,'Frame name',selected.name,'text',function(value){actions.frame(selected.key,'name',value);},null,
        function(value){if(actions.liveFrame)actions.liveFrame(selected.key,'name',value);}));
      fields.appendChild(field(doc,'Presentation title (optional)',selected.narrativeTitle||'','text',
        function(value){actions.frame(selected.key,'narrativeTitle',value);},null,
        function(value){if(actions.liveFrame)actions.liveFrame(selected.key,'narrativeTitle',value);}));
      var narrative=field(doc,'Frame explanation (optional)',selected.description||'','textarea',
        function(value){actions.frame(selected.key,'description',value);},null,
        function(value){if(actions.liveFrame)actions.liveFrame(selected.key,'description',value);});
      narrative.className+=' modern-studio-frame-narrative';fields.appendChild(narrative);
      if(index>0)fields.appendChild(field(doc,'Travel to frame (s)',selected.travelMs/1000,'number',
        function(value){actions.frame(selected.key,'travelMs',value);},null,
        function(value){if(actions.liveFrame)actions.liveFrame(selected.key,'travelMs',value);}));
      fields.appendChild(field(doc,'Hold after arrival (s)',selected.holdMs/1000,'number',
        function(value){actions.frame(selected.key,'holdMs',value);},null,
        function(value){if(actions.liveFrame)actions.liveFrame(selected.key,'holdMs',value);}));
      if(index>0){
        var spline=draft.interpolation==='spline';
        var easing=field(doc,'Easing',selected.easing,'select',function(value){
          if(!spline)actions.frame(selected.key,'easing',value);
        },[['linear','Linear'],['smoothstep','Ease in / out']]);
        if(spline){
          var easingControl=easing.children[1];
          easingControl.disabled=true;
          var explanation=el(doc,'small','modern-studio-field-note',
            'Spline ignores per-frame easing. This value is kept for Linear.');
          explanation.id='modern-studio-easing-note';
          easingControl.setAttribute('aria-describedby',explanation.id);
          easing.appendChild(explanation);
        }
        fields.appendChild(easing);
      }
      panel.appendChild(fields);
      renderReferenceLinks(doc,panel,selected,actions,options.listReferenceImages,options.getReferenceImage);
      framePane.appendChild(panel);
    }
    timelinePane.appendChild(previewBar(doc,result,actions,prepared,options,true));
    timelinePane.appendChild(el(doc,'p','modern-studio-hint',
      'Preview opens playback in its own view; return to Editor to continue editing. '+
      'PNG/video export is in Preview, permanent project saves are in Library.'));
    showInspector(host.__studioInspectorMode);
  }
  return Object.freeze({render:render,renderPicker:renderPicker,renderLibrary:renderLibrary,
    renderStoryboard:renderStoryboard,createPreviewNavigation:createPreviewNavigation});
}));
