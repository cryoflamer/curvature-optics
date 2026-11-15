/* DOM-only five-step Animation Project v2 wizard. No optical rendering,
 * project-library writes, or mutation of the live experiment.
 */
(function(root,factory){
  var workflow=root.CurvatureModernAnimationProjectWizard;
  var presentation=root.CurvatureModernSnapshotPresentation;
  var filters=root.CurvatureModernExperimentHistoryFilters;
  if(typeof module==='object'&&module.exports){
    workflow=require('../../animation/ModernAnimationProjectWizard');
    presentation=require('./ModernSnapshotPresentation');
    filters=require('./ModernExperimentHistoryFilters');
  }
  var api=factory(workflow,presentation,filters);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationProjectWizardUI=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(workflow,presentation,filters){
  'use strict';
  var LABELS=['Animation type','Reference experiment','Allowed changes',
    'Initial keyframes','Project details'];
  function el(doc,tag,cls,label){
    var node=doc.createElement(tag);if(cls)node.className=cls;
    if(label!==undefined)node.textContent=label;
    return node;
  }
  function button(doc,label,action,disabled){
    var node=el(doc,'button','modern-project-wizard-button',label);
    node.type='button';node.disabled=!!disabled;
    if(action)node.addEventListener('click',action);
    return node;
  }
  function choice(doc,label,active,action){
    var item=button(doc,label,action);
    item.className+=' modern-project-wizard-choice'+(active?' is-active':'');
    item.setAttribute('aria-pressed',String(active));return item;
  }
  function input(doc,label,value,max,onChange,multiline,onSearch){
    var wrap=el(doc,'label','modern-project-wizard-field');
    wrap.appendChild(el(doc,'span','',label));
    var control=el(doc,multiline?'textarea':'input');
    if(!multiline)control.type='text';else control.rows=3;
    control.value=value;control.maxLength=max;
    control.addEventListener('input',function(){onChange(control.value,true);});
    control.addEventListener('change',function(){onChange(control.value,true);});
    control.addEventListener('keydown',function(event){
      if(!multiline&&label.toLowerCase().includes('search')&&event.key==='Enter'){
        if(event.preventDefault)event.preventDefault();
        // The value has already been committed without destroying focus.
        if(onSearch)onSearch();
      }
    });
    wrap.appendChild(control);return wrap;
  }
  function explanation(check){
    if(check.allowed)return 'Compatible';
    var issue=(check.issues||[]).slice(0,3).map(function(x){return x.path;}).join(', ');
    return issue?'Incompatible: '+issue:'Incompatible with this project';
  }
  function render(doc,host,w,entries,current,actions,options){
    if(!host||!doc)return;
    host.textContent='';
    if(!w){host.hidden=true;return;}
    host.hidden=false;options=options||{};
    var title=el(doc,'div','modern-project-wizard-heading');
    title.appendChild(el(doc,'strong','','New Animation Project · v2'));
    title.appendChild(button(doc,'Cancel',actions.cancel));host.appendChild(title);
    var progress=el(doc,'p','modern-project-wizard-progress',
      'Step '+(w.step+1)+' of 5 · '+LABELS[w.step]);
    host.appendChild(progress);
    var content=el(doc,'section','modern-project-wizard-content');
    if(w.step===0){
      content.appendChild(el(doc,'p','modern-studio-hint',
        'Choose what may change between keyframes. The renderer enforces the resulting constraints.'));
      [['camera','Camera Motion — move or zoom camera; scene and physics stay fixed'],
       ['physical','Physics Transition — one physical channel changes; camera stays fixed'],
       ['experimental','Unrestricted / Experimental — preserve arbitrary snapshots; no video export']]
        .forEach(function(item){content.appendChild(choice(doc,item[1],w.mode===item[0],function(){actions.mode(item[0]);}));});
    }else if(w.step===1){
      content.appendChild(el(doc,'p','modern-studio-hint',
        'The chosen experiment becomes the immutable project reference. Selecting it never restores the live scene.'));
      if(current){
        content.appendChild(choice(doc,'Use current Scene/Compare as reference',
          w.referenceId===null&&!!w.reference,function(){actions.referenceCurrent();}));
      }
      content.appendChild(input(doc,'Search History references',w.query,160,
        function(value,live){actions.field('query',value,live);},false,actions.refresh));
      content.appendChild(button(doc,'Search references',actions.refresh));
      var visible=filters.filter(entries,{query:w.query});
      var list=el(doc,'div','modern-project-wizard-snapshots');
      visible.forEach(function(entry){
        var card=el(doc,'div','modern-project-wizard-snapshot');
        var label=presentation.displayName(entry);
        card.appendChild(choice(doc,label+(w.referenceId===entry.id&&w.reference?' · Reference':''),
          w.referenceId===entry.id&&!!w.reference,function(){actions.reference(entry.id);}));
        card.appendChild(el(doc,'small','',presentation.frameSummary(entry)));
        list.appendChild(card);
      });
      if(!visible.length)list.appendChild(el(doc,'p','modern-studio-hint','No matching History snapshots.'));
      content.appendChild(list);
      if(w.reference)content.appendChild(el(doc,'p','modern-project-wizard-status',
        'Reference selected: '+(w.referenceName||'Current experiment')));
    }else if(w.step===2){
      if(w.mode==='physical'){
        content.appendChild(el(doc,'p','modern-studio-hint',
          'Select exactly one active physical channel. Other physics, camera and object layout stay fixed.'));
        workflow.targets(w).forEach(function(option){
          content.appendChild(choice(doc,option.label,
            !!w.target&&w.target.scope===option.target.scope&&w.target.parameter===option.target.parameter,
            function(){actions.target(option.value);}));
        });
      }else content.appendChild(el(doc,'p','modern-studio-hint',w.mode==='camera'?
        'Locked: scene objects, Earth geometry, atmosphere and presentation. Allowed: camera position, orientation and zoom.':
        'No scene or physical constraints. Full snapshots are retained. Experimental projects cannot be previewed or exported as video.'));
    }else if(w.step===3){
      content.appendChild(el(doc,'p','modern-studio-hint',
        'Choose any number of initial keyframes (including zero). Later additions will be checked against the project contract.'));
      var include=el(doc,'label','modern-project-wizard-include');
      var checkbox=el(doc,'input');checkbox.type='checkbox';checkbox.checked=w.includeReference;
      checkbox.addEventListener('change',function(){actions.field('includeReference',checkbox.checked);});
      include.appendChild(checkbox);include.appendChild(el(doc,'span','',
        'Include reference as first keyframe'));content.appendChild(include);
      content.appendChild(input(doc,'Search additional History frames',w.query,160,
        function(value,live){actions.field('query',value,live);},false,actions.refresh));
      content.appendChild(button(doc,'Search frames',actions.refresh));
      var show=el(doc,'label','modern-project-wizard-include');
      var showCheck=el(doc,'input');showCheck.type='checkbox';showCheck.checked=w.showIncompatible;
      showCheck.addEventListener('change',function(){actions.field('showIncompatible',showCheck.checked);});
      show.appendChild(showCheck);show.appendChild(el(doc,'span','','Show incompatible snapshots and reasons'));
      content.appendChild(show);
      var shown=filters.filter(entries,{query:w.query}).filter(function(entry){return entry.id!==w.referenceId;});
      var compatible=0,choices=[];
      shown.forEach(function(entry){
        var verdict=workflow.check(w,entry);
        if(verdict.allowed)compatible++;
        if(!verdict.allowed&&!w.showIncompatible)return;
        choices.push({entry:entry,verdict:verdict});
      });
      content.appendChild(el(doc,'p','modern-project-wizard-status',
        compatible+' compatible found · '+w.selectedIds.length+' additional selected'));
      var available=el(doc,'div','modern-project-wizard-snapshots');
      choices.forEach(function(row){
        var entry=row.entry,verdict=row.verdict;
        var card=el(doc,'label','modern-project-wizard-snapshot'+(verdict.allowed?'':' is-incompatible'));
        var check=el(doc,'input');check.type='checkbox';check.disabled=!verdict.allowed;
        check.checked=w.selectedIds.includes(entry.id);
        check.addEventListener('change',function(){actions.toggle(entry.id);});
        card.appendChild(check);
        var info=el(doc,'div');
        info.appendChild(el(doc,'strong','',presentation.displayName(entry)));
        info.appendChild(el(doc,'small','',explanation(verdict)));
        card.appendChild(info);available.appendChild(card);
      });
      if(!choices.length)available.appendChild(el(doc,'p','modern-studio-hint',
        'No snapshots match the current search and compatibility settings.'));
      content.appendChild(available);
    }else{
      content.appendChild(input(doc,'Project name',w.name,120,
        function(value,live){actions.field('name',value,live);},false));
      content.appendChild(input(doc,'Description (optional)',w.description,1000,
        function(value,live){actions.field('description',value,live);},true));
      content.appendChild(el(doc,'p','modern-project-wizard-status',
        (w.mode==='camera'?'Camera Motion':w.mode==='physical'?'Physics Transition':'Experimental')+
        ' · '+(w.referenceName||'Current experiment')+
        (w.target?' · '+w.target.scope+' / '+w.target.parameter:'')+
        ' · '+(w.selectedIds.length+(w.includeReference?1:0))+' keyframes'));
      content.appendChild(el(doc,'p','modern-studio-hint',
        'Create saves an independent v2 project in Animation Library; unfinished projects can be edited later.'));
    }
    host.appendChild(content);
    if(options.error){
      var error=el(doc,'p','modern-project-wizard-error',options.error);
      error.setAttribute('role','alert');host.appendChild(error);
    }
    var nav=el(doc,'div','modern-project-wizard-navigation');
    nav.appendChild(button(doc,'Back',actions.back,w.step===0));
    var next=button(doc,w.step===4?'Create project':'Next',
      w.step===4?actions.finish:actions.next,
      w.step===1&&!w.reference||w.step===2&&w.mode==='physical'&&!w.target||
      w.step===4&&!w.name.trim()||!!options.busy);
    if(w.step===4)next.className+=' modern-project-wizard-create';
    nav.appendChild(next);
    host.appendChild(nav);
  }
  return Object.freeze({render:render});
}));
