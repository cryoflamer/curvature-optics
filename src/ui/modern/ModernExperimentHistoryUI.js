/* Visual History: DOM-only gallery and unified screenshot / physics inspector.
 * Rendering a card MUST NOT restore, recalculate or alter experiment physics.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernExperimentHistoryUI=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function label(entry){
    var f=entry.features||{},mode=f.mode||entry.experiment.display.mode;
    if(mode==='compare'){
      var r=f.relations||{};
      return 'Compare A/B · '+(r.physicsSame?'Identical physics':
        r.geometrySame?'Same geometry':'Different geometry');
    }
    return 'Scene · '+(f.scene&&f.scene.geometry&&f.scene.geometry.kind==='flat'?'Flat':'Globe');
  }
  function displayName(entry){return entry.name&&entry.name.trim()?entry.name:label(entry);}
  // Shared compact identity for the shortlist and Animation Studio. This is
  // presentation only: never capture a fresh thumbnail or mutate experiment state.
  function frameSummary(entry){
    var e=entry.experiment||{},scene=e.scene||{},camera=scene.camera||{};
    var mode=(entry.features&&entry.features.mode)||(e.display&&e.display.mode)||'scene';
    function model(surface,atmosphere,radius,profile){
      var name=surface==='flat'?'Flat':'Globe';
      if(surface!=='flat'&&Number.isFinite(radius))name+=' R '+Math.round(radius)+' km';
      name+=' · '+(atmosphere||'Atmosphere ?');
      if(atmosphere==='temperature-lapse'&&profile&&Number.isFinite(profile.gradientKPerKm))
        name+=' '+Number(profile.gradientKPerKm.toFixed(2))+' K/km';
      return name;
    }
    var parts=[];
    if(mode==='compare'&&e.compare&&e.compare.A&&e.compare.B){
      ['A','B'].forEach(function(side){
        var p=e.compare[side];
        parts.push(side+': '+model(p.surface,p.atmosphere,p.radiusKm,p.temperatureProfile));
      });
    }else if(mode==='scene'&&scene.surface){
      parts.push(model(scene.surface.showModel===2?'flat':'globe',scene.atmosphere,
        Number(scene.surface.rEarth)/1000,scene.temperatureProfile));
    }else parts.push(label(entry));
    if(Number.isFinite(camera.Height))parts.push('Camera '+Number(camera.Height.toFixed(2))+' m');
    return parts.join(' | ');
  }
  function frameVisual(doc,entry,className){
    var visual=el(doc,'div',className);
    if(entry.thumbnail&&entry.thumbnail.dataUrl){
      var img=el(doc,'img','modern-storyboard-image');
      img.src=entry.thumbnail.dataUrl;img.alt=displayName(entry)+' saved screenshot';
      img.loading='lazy';visual.appendChild(img);
    }else visual.appendChild(el(doc,'span','modern-storyboard-no-image','No screenshot'));
    return visual;
  }
  // The inspector reads the already loaded validated experiment. No IndexedDB
  // query, experiment mutation or optical work is performed while hovering.
  function number(value,digits){
    return Number(value).toLocaleString('en-US',{maximumFractionDigits:digits===undefined?2:digits});
  }
  function inspect(entry){
    var e=entry.experiment,mode=(entry.features&&entry.features.mode)||e.display.mode;
    function physics(p,geometry){
      var rows=[['Surface',geometry.kind==='flat'?'Flat':
        'Globe · R '+number(geometry.radiusKm,3)+' km']];
      var names={'vacuum':'Vacuum','standard':'Standard',
        'temperature-lapse':'Temperature lapse','profile-transition':'Profile transition',
        'inverse-temperature':'Inverse temperature','inverse-spherical':'Inverse spherical',
        'exponential-occlusion':'Exponential occlusion'};
      rows.push(['Atmosphere',names[p.atmosphere]||p.atmosphere]);
      if(['temperature-lapse','profile-transition','inverse-temperature','exponential-occlusion'].includes(p.atmosphere)){
        var t=p.temperatureProfile;
        if(t){
          rows.push(['Temperature',number(t.temperatureC)+' °C']);
          rows.push(['Gradient',number(t.gradientKPerKm)+' K/km']);
          rows.push(['Pressure',number(t.pressureHpa)+' hPa']);
        }
      }
      if(p.atmosphere==='profile-transition'&&p.transitionProfile)
        rows.push(['Transition',p.transitionProfile.source+' · weight '+number(p.transitionProfile.weight,3)]);
      if(p.atmosphere==='inverse-temperature'&&p.inverseProfile)
        rows.push(['Inversion',p.inverseProfile.source+' · weight '+number(p.inverseProfile.weight,3)]);
      if(['profile-transition','inverse-temperature','inverse-spherical','exponential-occlusion'].includes(p.atmosphere))
        rows.push(['Occlusion radius',number(p.occlusionRadius/1000,3)+' km']);
      return rows;
    }
    var a,b,relations=[];
    if(mode==='compare'){
      a=physics(e.compare.A,{kind:e.compare.A.surface,radiusKm:e.compare.A.radiusKm});
      b=physics(e.compare.B,{kind:e.compare.B.surface,radiusKm:e.compare.B.radiusKm});
      var r=entry.features&&entry.features.relations;
      if(r){
        if(r.physicsSame)relations.push('Identical physical settings');
        else{
          relations.push(r.geometrySame?'Same geometry':'Different geometry');
          relations.push(r.atmosphereSame?'Same atmosphere model':'Different atmosphere models');
          if(!r.refractionSame&&r.atmosphereSame)relations.push('Different refraction parameters');
        }
      }
    }else{
      var s=e.scene;
      a=physics(s,{kind:s.surface.showModel===2?'flat':'globe',radiusKm:s.surface.rEarth/1000});
    }
    var camera=e.scene.camera,objects=e.scene.objects,names=['Bedford marker','measuring rod','ship','transmission tower'];
    var groups=[];
    for(var i=0;i<2;i++){
      var count=objects.NObjects[i];
      if(count)groups.push(number(count,0)+' × '+(names[objects.ObjType[i]]||'object'));
    }
    return {mode:mode,title:displayName(entry),classification:label(entry),
      description:entry.description||'',A:a,B:b,relations:relations,
      shared:[['Camera height',number(camera.Height)+' m'],
        ['Camera orientation',number(camera.Pan)+'° pan · '+number(camera.Nick)+'° nick'],
        ['Objects',groups.join(' · ')||'No objects']]};
  }
  function inspectorMarkup(doc,entry){
    var data=inspect(entry),card=el(doc,'div','modern-history-inspector-inner');
    if(entry.thumbnail&&entry.thumbnail.dataUrl){
      var image=el(doc,'img','modern-history-preview-image');
      image.src=entry.thumbnail.dataUrl;image.alt=data.title+' saved physical render';
      card.appendChild(image);
    }else card.appendChild(el(doc,'p','modern-history-empty',
      'No screenshot saved; physical settings and Restore are still available.'));
    card.appendChild(el(doc,'strong','modern-history-inspector-title',data.title));
    if(data.title!==data.classification)
      card.appendChild(el(doc,'span','modern-history-inspector-kind',data.classification));
    if(data.description)
      card.appendChild(el(doc,'p','modern-history-inspector-description',data.description));
    card.appendChild(el(doc,'span','modern-history-inspector-time',
      new Date(entry.createdAt).toLocaleString()+' · '+entry.source));
    var columns=el(doc,'div','modern-history-inspector-columns');
    function column(name,rows){
      var container=el(doc,'section','modern-history-inspector-column');
      container.appendChild(el(doc,'strong','modern-history-inspector-heading',name));
      rows.forEach(function(row){
        var line=el(doc,'div','modern-history-inspector-row');
        line.appendChild(el(doc,'span','',row[0]));
        line.appendChild(el(doc,'strong','',row[1]));
        container.appendChild(line);
      });
      columns.appendChild(container);
    }
    column(data.mode==='compare'?'Model A':'Scene',data.A);
    if(data.B)column('Model B',data.B);
    card.appendChild(columns);
    if(data.relations.length){
      var diff=el(doc,'div','modern-history-inspector-differences');
      diff.appendChild(el(doc,'strong','','A/B comparison'));
      diff.appendChild(el(doc,'span','',data.relations.join(' · ')));
      card.appendChild(diff);
    }
    var shared=el(doc,'div','modern-history-inspector-shared');
    data.shared.forEach(function(row){
      shared.appendChild(el(doc,'span','',row[0]+': '+row[1]));
    });
    card.appendChild(shared);
    return card;
  }
  function createInspector(doc,host){
    // A shared floating overlay avoids clipping by the scrolling gallery and
    // prevents 200 separate tooltip nodes from being created for 200 cards.
    if(!doc.body||typeof doc.addEventListener!=='function')return null;
    var node=el(doc,'div','modern-history-inspector');
    node.hidden=true;node.setAttribute('role','tooltip');
    doc.body.appendChild(node);
    var timer=null,pinned=false,anchor=null,infoTrigger=null,suppressFocus=false;
    function cancel(){if(timer!==null){clearTimeout(timer);timer=null;}}
    function restoreFocus(trigger){
      if(trigger&&typeof trigger.focus==='function'){
        suppressFocus=true;try{trigger.focus();}finally{suppressFocus=false;}
      }
    }
    function hide(){cancel();if(pinned)return;node.hidden=true;anchor=null;}
    function position(){
      if(!anchor||typeof anchor.getBoundingClientRect!=='function')return;
      var viewport=doc.defaultView||{},w=viewport.innerWidth||1024,h=viewport.innerHeight||768;
      var r=anchor.getBoundingClientRect(),rect=node.getBoundingClientRect();
      var width=rect.width||480,height=rect.height||260,pad=12;
      var x=r.right+10;
      if(x+width>w-pad)x=r.left-width-10;
      if(x<pad)x=Math.max(pad,Math.min(r.left,w-width-pad));
      node.style.left=Math.round(x)+'px';
      node.style.top=Math.round(Math.max(pad,Math.min(r.top,h-height-pad)))+'px';
    }
    function show(entry,card,lock,trigger){
      cancel();pinned=!!lock;anchor=card;infoTrigger=trigger||null;
      node.textContent='';node.appendChild(inspectorMarkup(doc,entry));
      var keep=button(doc,pinned?'Kept open':'Keep open','Keep preview open',function(){
        pinned=true;node.setAttribute('role','dialog');keep.textContent='Kept open';
        keep.setAttribute('aria-pressed','true');
        infoTrigger=trigger||anchor;
      });
      keep.className='modern-history-inspector-keep';
      keep.setAttribute('aria-pressed',String(pinned));node.appendChild(keep);
      var close=button(doc,'×','Close experiment preview',function(){
        var returnFocus=infoTrigger;pinned=false;hide();restoreFocus(returnFocus);
      });
      close.className='modern-history-inspector-close';node.appendChild(close);
      node.setAttribute('role',pinned?'dialog':'tooltip');
      node.setAttribute('aria-label','Experiment preview and physical settings');
      node.hidden=false;position();
      if(pinned&&typeof close.focus==='function')close.focus({preventScroll:true});
    }
    function hover(entry,card,trigger){
      if(pinned)return;
      cancel();timer=setTimeout(function(){timer=null;show(entry,card,false,trigger);},400);
    }
    function leave(){
      if(pinned)return;
      cancel();timer=setTimeout(function(){timer=null;hide();},140);
    }
    node.addEventListener('mouseenter',cancel);
    node.addEventListener('mouseleave',leave);
    function scrolled(){if(pinned)position();else hide();}
    function resized(){if(!node.hidden)position();}
    host.addEventListener('scroll',scrolled);
    var viewport=doc.defaultView;
    if(viewport&&typeof viewport.addEventListener==='function')viewport.addEventListener('resize',resized);
    function keydown(event){if(event.key==='Escape'&&!node.hidden){
      var returnFocus=infoTrigger;pinned=false;hide();
      restoreFocus(returnFocus);
    }}
    function click(event){
      if(!pinned||!anchor)return;
      if(event.target===anchor||
        (typeof anchor.contains==='function'&&anchor.contains(event.target))||
        event.target===node||(typeof node.contains==='function'&&node.contains(event.target)))return;
      pinned=false;hide();
    }
    doc.addEventListener('keydown',keydown);
    doc.addEventListener('click',click);
    return {hover:hover,leave:leave,show:show,
      focus:function(entry,card,trigger){if(!suppressFocus)show(entry,card,false,trigger);},
      hide:function(){pinned=false;hide();},
      destroy:function(){
        cancel();doc.removeEventListener('keydown',keydown);doc.removeEventListener('click',click);
        host.removeEventListener('scroll',scrolled);
        if(viewport&&typeof viewport.removeEventListener==='function')viewport.removeEventListener('resize',resized);
        if(node.parentNode)node.parentNode.removeChild(node);
      }};
  }
  function el(doc,name,className,text){
    var node=doc.createElement(name);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function button(doc,text,title,handler){
    var node=el(doc,'button','modern-history-action',text);
    node.type='button';node.title=title;node.setAttribute('aria-label',title);
    node.addEventListener('click',function(event){
      if(event&&event.stopPropagation)event.stopPropagation();handler();
    });
    // Double-clicking a card action must never bubble into snapshot restore.
    node.addEventListener('dblclick',function(event){
      if(event&&event.stopPropagation)event.stopPropagation();
    });
    return node;
  }
  function setSize(host,size){
    if(!host)return;
    host.setAttribute('data-size',['small','medium','large'].includes(size)?size:'small');
  }
  // Pinned are presented first, but each record occurs in exactly one section.
  // Layout state belongs to application preferences, never to snapshot metadata.
  function render(doc,host,entries,selectedId,actions,multi,options){
    if(!host||!doc)return;
    if(host.__historyInspector){host.__historyInspector.destroy();host.__historyInspector=null;}
    host.textContent='';
    var inspector=entries.length?createInspector(doc,host):null;host.__historyInspector=inspector;
    if(!entries.length){
      host.appendChild(el(doc,'p','modern-history-empty',
        options&&options.emptyFiltered?'No snapshots match these filters. Clear filters to see your saved experiments.':
          'No snapshots yet. Save a snapshot to start your visual history.'));
      return;
    }
    var pinned=entries.filter(function(entry){return !!entry.pinned;});
    var recent=entries.filter(function(entry){return !entry.pinned;});
    function makeCard(entry){
      var card=el(doc,'article','modern-history-card'+(String(entry.id)===String(selectedId)?' is-selected':''));
      card.setAttribute('data-snapshot-id',String(entry.id));
      card.addEventListener('click',function(event){
        if(event&&event.target&&typeof event.target.closest==='function'&&
          event.target.closest('.modern-history-multi, .modern-history-pin, .modern-history-delete, .modern-history-rename'))return;
        actions.select(entry.id);
      });
      card.addEventListener('dblclick',function(event){
        if(event&&event.target&&typeof event.target.closest==='function'&&
          event.target.closest('.modern-history-multi, .modern-history-pin, .modern-history-delete, .modern-history-rename'))return;
        if(inspector)inspector.hide();
        if(actions.restore)actions.restore(entry.id);
      });
      var select=button(doc,'','Select snapshot '+entry.id,function(){actions.select(entry.id);});
      select.className='modern-history-card-select';
      select.title=''; // Native tooltips should not obscure the rich preview.
      select.setAttribute('aria-label','Select snapshot '+entry.id+'; double-click or Enter to restore; Space to open preview');
      select.setAttribute('aria-pressed',String(String(entry.id)===String(selectedId)));
      select.addEventListener('dblclick',function(event){
        if(event&&event.stopPropagation)event.stopPropagation();
        if(inspector)inspector.hide();
        if(actions.restore)actions.restore(entry.id);
      });
      select.addEventListener('keydown',function(event){
        if(!event)return;
        if(event.key==='Enter'&&actions.restore){
          if(event.preventDefault)event.preventDefault();
          if(inspector)inspector.hide();actions.restore(entry.id);
        }else if((event.key===' '||event.key==='Spacebar')&&inspector){
          if(event.preventDefault)event.preventDefault();
          inspector.show(entry,card,true,select);
        }
      });
      if(inspector){
        select.addEventListener('mouseenter',function(){inspector.hover(entry,card,select);});
        select.addEventListener('mouseleave',function(){inspector.leave();});
        select.addEventListener('focus',function(){inspector.focus(entry,card,select);});
        select.addEventListener('blur',function(){inspector.leave();});
        // On touch, a single tap selects and opens a persistent preview. Desktop
        // keeps single-click selection / double-click restore unchanged.
        select.addEventListener('click',function(event){
          if(event&&(event.pointerType==='touch'||event.pointerType==='pen'))
            inspector.show(entry,card,true,select);
        });
      }
      if(entry.thumbnail&&entry.thumbnail.dataUrl){
        var image=el(doc,'img','modern-history-image');
        image.src=entry.thumbnail.dataUrl;image.alt=displayName(entry)+' thumbnail';image.loading='lazy';
        select.className+=' has-preview';select.appendChild(image);
      }else select.appendChild(el(doc,'span','modern-history-no-image','No preview available'));
      card.appendChild(select);
      var pin=button(doc,'',(entry.pinned?'Unpin':'Pin')+' snapshot '+entry.id,function(){
        if(inspector)inspector.hide();
        actions.pin(entry.id,!entry.pinned);
      });
      pin.className='modern-history-pin'+(entry.pinned?' is-pinned':'');
      pin.setAttribute('aria-pressed',String(!!entry.pinned));
      card.appendChild(pin);
      var remove=button(doc,'',entry.pinned?'Unpin snapshot before deleting':'Delete snapshot '+entry.id,function(){
        if(entry.pinned)return;
        if(inspector)inspector.hide();
        actions.remove(entry.id);
      });
      remove.className='modern-history-delete';
      remove.disabled=!!entry.pinned;
      card.appendChild(remove);
      var body=el(doc,'div','modern-history-card-body');
      var title=el(doc,'strong','modern-history-card-title',displayName(entry));
      title.title=entry.name?label(entry):'';
      body.appendChild(title);
      body.appendChild(el(doc,'span','modern-history-card-meta',
        new Date(entry.createdAt).toLocaleString()+' · '+entry.source));
      var footer=el(doc,'div','modern-history-card-footer');
      var multiLabel=el(doc,'label','modern-history-multi');
      multiLabel.title='Select for storyboard / bulk actions';
      var check=el(doc,'input');check.type='checkbox';check.checked=!!(multi&&multi[entry.id]);
      check.setAttribute('aria-label','Select snapshot '+entry.id+' for bulk actions');
      check.addEventListener('change',function(){actions.multi(entry.id,check.checked);});
      check.addEventListener('click',function(event){if(event&&event.stopPropagation)event.stopPropagation();});
      check.addEventListener('dblclick',function(event){if(event&&event.stopPropagation)event.stopPropagation();});
      multiLabel.appendChild(check);
      multiLabel.appendChild(el(doc,'span','','Select'));
      footer.appendChild(multiLabel);
      var rename=button(doc,'✎','Edit snapshot name and description',function(){
        if(inspector)inspector.hide();
        if(actions.edit)actions.edit(entry.id);
      });
      rename.className='modern-history-rename';
      footer.appendChild(rename);body.appendChild(footer);
      card.appendChild(body);
      return card;
    }
    function section(name,items,collapsible,collapsed){
      var section=el(doc,'section','modern-history-section');
      section.setAttribute('aria-label',name+' experiments');
      var heading=el(doc,'div','modern-history-section-heading');
      if(collapsible){
        var toggle=button(doc,(collapsed?'▸ ':'▾ ')+name+' · '+items.length,
          (collapsed?'Expand ':'Collapse ')+name+' experiments',function(){
            if(actions.setPinnedCollapsed)actions.setPinnedCollapsed(!collapsed);
          });
        toggle.className='modern-history-section-toggle';
        toggle.setAttribute('aria-expanded',String(!collapsed));
        heading.appendChild(toggle);
      }else heading.appendChild(el(doc,'strong','',name+' · '+items.length));
      section.appendChild(heading);
      if(!collapsed){
        var grid=el(doc,'div','modern-history-section-grid');
        items.forEach(function(entry){grid.appendChild(makeCard(entry));});
        if(!items.length)grid.appendChild(el(doc,'p','modern-history-empty',
          options&&options.filtersActive&&options.hasPinned?
            'No pinned snapshots match these filters.':
            'Pin an experiment to keep it here for future Storyboards.'));
        section.appendChild(grid);
      }
      host.appendChild(section);
    }
    section('Pinned',pinned,true,!!(options&&options.pinnedCollapsed));
    section('Recent',recent,false,false);
  }
  // A Storyboard shortlist is an ordered list of stable History IDs, not an
  // animation and not a second snapshot store. Refresh always resolves labels
  // from the current records, so renaming cannot stale the display.
  function renderStoryboardQueue(doc,host,ids,entries,actions){
    if(!host||!doc)return;
    host.textContent='';
    var records=new Map(entries.map(function(entry){return [entry.id,entry];}));
    ids.forEach(function(id,index){
      var entry=records.get(id);
      if(!entry)return;
      var item=el(doc,'li','modern-history-storyboard-item');
      item.appendChild(frameVisual(doc,entry,'modern-history-storyboard-visual'));
      var title=el(doc,'strong','modern-history-storyboard-name',(index+1)+'. '+displayName(entry));
      title.title=displayName(entry);item.appendChild(title);
      var detail=el(doc,'span','modern-history-storyboard-detail',frameSummary(entry));
      detail.title=detail.textContent;item.appendChild(detail);
      var line=el(doc,'div','modern-history-storyboard-frame');
      function action(symbol,title,disabled,fn){
        var control=button(doc,symbol,title,fn);control.disabled=disabled;
        control.className='modern-history-storyboard-control';
        line.appendChild(control);
      }
      action('↑','Move frame '+(index+1)+' earlier',index===0,function(){actions.move(id,-1);});
      action('↓','Move frame '+(index+1)+' later',index===ids.length-1,function(){actions.move(id,1);});
      action('×','Remove frame '+(index+1)+' from shortlist',false,function(){actions.remove(id);});
      item.appendChild(line);host.appendChild(item);
    });
  }
  function hideInspector(host){if(host&&host.__historyInspector)host.__historyInspector.hide();}
  function select(host,id){
    if(!host)return;
    var cards=host.querySelectorAll?host.querySelectorAll('.modern-history-card'):[];
    Array.prototype.forEach.call(cards,function(card){
      var active=String(card.getAttribute('data-snapshot-id'))===String(id);
      if(card.classList)card.classList.toggle('is-selected',active);
      else card.className=card.className.replace(/\s+is-selected/g,'')+(active?' is-selected':'');
      var control=card.querySelector&&card.querySelector('.modern-history-card-select');
      if(control)control.setAttribute('aria-pressed',String(active));
    });
  }
  return Object.freeze({render:render,select:select,label:label,displayName:displayName,inspect:inspect,
    hideInspector:hideInspector,setSize:setSize,renderStoryboardQueue:renderStoryboardQueue,frameSummary:frameSummary,frameVisual:frameVisual});
}));
