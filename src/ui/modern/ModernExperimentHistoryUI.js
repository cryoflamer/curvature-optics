/* Visual History: DOM-only gallery and read-only enlarged screenshot preview.
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
    return {mode:mode,title:label(entry),A:a,B:b,relations:relations,
      shared:[['Camera height',number(camera.Height)+' m'],
        ['Camera orientation',number(camera.Pan)+'° pan · '+number(camera.Nick)+'° nick'],
        ['Objects',groups.join(' · ')||'No objects']]};
  }
  function inspectorMarkup(doc,entry){
    var data=inspect(entry),card=el(doc,'div','modern-history-inspector-inner');
    card.appendChild(el(doc,'strong','modern-history-inspector-title',data.title));
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
    var timer=null,pinned=false,anchor=null,infoTrigger=null;
    function cancel(){if(timer!==null){clearTimeout(timer);timer=null;}}
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
      var close=button(doc,'×','Close snapshot information',function(){
        pinned=false;hide();if(trigger&&typeof trigger.focus==='function')trigger.focus();
      });
      close.className='modern-history-inspector-close';node.appendChild(close);
      node.setAttribute('role',pinned?'dialog':'tooltip');
      node.setAttribute('aria-label','Snapshot physical settings');
      node.hidden=false;position();
      if(pinned&&typeof close.focus==='function')close.focus({preventScroll:true});
    }
    function hover(entry,card){
      if(pinned)return;
      cancel();timer=setTimeout(function(){timer=null;show(entry,card,false);},350);
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
      if(returnFocus&&typeof returnFocus.focus==='function')returnFocus.focus();
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
    return {hover:hover,leave:leave,show:show,hide:function(){pinned=false;hide();},
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
  function render(doc,host,entries,selectedId,actions,multi){
    if(!host||!doc)return;
    if(host.__historyInspector){host.__historyInspector.destroy();host.__historyInspector=null;}
    host.textContent='';
    var inspector=entries.length?createInspector(doc,host):null;host.__historyInspector=inspector;
    if(!entries.length){
      host.appendChild(el(doc,'p','modern-history-empty',
        'No snapshots yet. Save a snapshot to start your visual history.'));
      return;
    }
    entries.forEach(function(entry){
      var card=el(doc,'article','modern-history-card'+(String(entry.id)===String(selectedId)?' is-selected':''));
      card.setAttribute('data-snapshot-id',String(entry.id));
      if(inspector){
        card.addEventListener('mouseenter',function(){inspector.hover(entry,card);});
        card.addEventListener('mouseleave',function(){inspector.leave();});
        card.addEventListener('focusin',function(event){
          // Only the thumbnail is a keyboard hover target. Bulk/action controls
          // must not open the inspector merely because they receive focus.
          if(event.target===select)inspector.show(entry,card,false);
        });
        card.addEventListener('focusout',function(){inspector.leave();});
      }
      card.addEventListener('click',function(event){
        if(event&&event.target&&typeof event.target.closest==='function'&&
          event.target.closest('.modern-history-card-menu, .modern-history-multi, .modern-history-pin'))return;
        actions.select(entry.id);
      });
      card.addEventListener('dblclick',function(event){
        // An explicit control, bulk-selection checkbox or actions menu is not
        // an experiment gesture. Only the card image/text restores.
        if(event&&event.target&&typeof event.target.closest==='function'&&
          event.target.closest('.modern-history-card-menu, .modern-history-multi, .modern-history-pin'))return;
        if(actions.restore)actions.restore(entry.id);
      });
      var select=button(doc,'','Select snapshot '+entry.id,function(){actions.select(entry.id);});
      select.className='modern-history-card-select';
      // Avoid a second native tooltip obscuring the richer snapshot inspector.
      select.title='';
      select.setAttribute('aria-label','Select snapshot '+entry.id+'; double-click to restore');
      // The thumbnail is itself a button; stopPropagation on ordinary action
      // buttons must not swallow this dedicated double-click restore.
      select.addEventListener('dblclick',function(event){
        if(event&&event.stopPropagation)event.stopPropagation();
        if(actions.restore)actions.restore(entry.id);
      });
      select.addEventListener('keydown',function(event){
        if(event&&event.key==='Enter'&&actions.restore){
          if(event.preventDefault)event.preventDefault();
          actions.restore(entry.id);
        }
      });
      select.setAttribute('aria-pressed',String(String(entry.id)===String(selectedId)));
      if(entry.thumbnail&&entry.thumbnail.dataUrl){
        var image=el(doc,'img','modern-history-image');
        image.src=entry.thumbnail.dataUrl;image.alt=label(entry)+' thumbnail';image.loading='lazy';
        // Old transparent snapshots can also be displayed over the same white
        // background as their original physical view, without rewriting IDB.
        select.className+=' has-preview';select.appendChild(image);
      }else{
        select.appendChild(el(doc,'span','modern-history-no-image','No preview available'));
      }
      card.appendChild(select);
      var body=el(doc,'div','modern-history-card-body');
      body.appendChild(el(doc,'strong','modern-history-card-title',label(entry)));
      var meta=el(doc,'span','modern-history-card-meta',
        new Date(entry.createdAt).toLocaleString()+' · '+entry.source+
        (entry.pinned?' · pinned':''));
      body.appendChild(meta);
      var footer=el(doc,'div','modern-history-card-footer');
      var menu=el(doc,'details','modern-history-card-menu');
      var summary=el(doc,'summary','modern-history-card-menu-toggle','⋯');
      summary.setAttribute('aria-label','Snapshot actions');
      summary.title='Snapshot actions';
      summary.addEventListener('dblclick',function(event){
        if(event&&event.stopPropagation)event.stopPropagation();
      });
      menu.appendChild(summary);
      var menuActions=el(doc,'div','modern-history-card-menu-actions');
      menuActions.appendChild(button(doc,'View','Quick view snapshot '+entry.id,function(){
        actions.preview(entry.id);menu.open=false;
      }));
      var info=button(doc,'Info','Show physical settings for snapshot '+entry.id,function(){
        menu.open=false;
        if(inspector)inspector.show(entry,card,true,summary);
      });
      menuActions.appendChild(info);
      menuActions.appendChild(button(doc,'Delete','Delete snapshot '+entry.id,function(){
        actions.remove(entry.id);menu.open=false;
      }));
      menu.appendChild(menuActions);footer.appendChild(menu);
      var multiLabel=el(doc,'label','modern-history-multi');
      multiLabel.title='Select for storyboard / bulk actions';
      var check=el(doc,'input');check.type='checkbox';check.checked=!!(multi&&multi[entry.id]);
      check.setAttribute('aria-label','Select snapshot '+entry.id+' for bulk actions');
      check.addEventListener('change',function(){actions.multi(entry.id,check.checked);});
      check.addEventListener('click',function(event){if(event&&event.stopPropagation)event.stopPropagation();});
      check.addEventListener('dblclick',function(event){if(event&&event.stopPropagation)event.stopPropagation();});
      multiLabel.appendChild(check);
      multiLabel.appendChild(el(doc,'span','', 'Select'));
      footer.appendChild(multiLabel);
      var pin=button(doc,'📌',
        (entry.pinned?'Unpin':'Pin')+' snapshot '+entry.id,function(){
          actions.pin(entry.id,!entry.pinned);
      });
      // The pin is visually over the thumbnail, but is not nested in the
      // thumbnail's button (nested buttons would be invalid HTML).
      pin.className='modern-history-pin'+(entry.pinned?' is-pinned':'');
      pin.setAttribute('aria-pressed',String(!!entry.pinned));
      pin.textContent='';
      footer.appendChild(pin);
      body.appendChild(footer);
      card.appendChild(body);host.appendChild(card);
    });
  }
  function hideInspector(host){if(host&&host.__historyInspector)host.__historyInspector.hide();}
  function select(host,id){
    if(!host)return;
    Array.prototype.forEach.call(host.children||[],function(card){
      var active=String(card.getAttribute&&card.getAttribute('data-snapshot-id'))===String(id);
      if(card.classList)card.classList.toggle('is-selected',active);
      else card.className=card.className.replace(/\s+is-selected/g,'')+(active?' is-selected':'');
      var control=card.querySelector?card.querySelector('.modern-history-card-select'):
        (card.children&&card.children[0]);
      if(control)control.setAttribute('aria-pressed',String(active));
    });
  }
  function preview(doc,dialog,entry){
    if(!doc||!dialog||!entry)return;
    dialog.textContent='';
    var header=el(doc,'div','modern-history-preview-head');
    header.appendChild(el(doc,'strong','',label(entry)));
    header.appendChild(button(doc,'Close','Close quick view',function(){close(dialog);}));
    dialog.appendChild(header);
    if(entry.thumbnail&&entry.thumbnail.dataUrl){
      var img=el(doc,'img','modern-history-preview-image');
      img.src=entry.thumbnail.dataUrl;img.alt=label(entry)+' physical render';
      dialog.appendChild(img);
    }else dialog.appendChild(el(doc,'p','modern-history-empty',
      'No accurate screenshot is available for this snapshot. The complete experiment can still be restored.'));
    dialog.appendChild(el(doc,'p','modern-history-preview-meta',
      new Date(entry.createdAt).toLocaleString()+' · '+entry.source+
      (entry.pinned?' · Pinned':'')+' · ID '+entry.id));
    dialog.hidden=false;
    if(typeof dialog.showModal==='function'&&!dialog.open)dialog.showModal();
  }
  function close(dialog){
    if(!dialog)return;
    if(typeof dialog.close==='function'&&dialog.open)dialog.close();
    dialog.hidden=true;
  }
  return Object.freeze({render:render,select:select,preview:preview,close:close,label:label,inspect:inspect,hideInspector:hideInspector,
    setSize:setSize});
}));
