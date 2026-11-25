/* Visual History: DOM-only gallery and unified screenshot / physics inspector.
 * Rendering a card MUST NOT restore, recalculate or alter experiment physics.
 */
(function(root,factory){
  var presentation=root.CurvatureModernSnapshotPresentation;
  if(typeof module==='object'&&module.exports)
    presentation=require('./ModernSnapshotPresentation');
  var api=factory(presentation);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernExperimentHistoryUI=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(presentation){
  'use strict';
  // History owns the gallery and its actions; snapshot formatting is shared.
  var label=presentation.label,displayName=presentation.displayName,
    inspectorMarkup=presentation.inspectorMarkup;
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
    host.textContent='';
    if(!entries.length){
      host.appendChild(el(doc,'p','modern-history-empty',
        options&&options.emptyFiltered?'No snapshots match these filters. Clear filters to see your saved experiments.':
          'No snapshots yet. Save a snapshot to start your visual history.'));
      return;
    }
    var pinned=entries.filter(function(entry){return !!entry.pinned;});
    var recent=entries.filter(function(entry){return !entry.pinned;});
    function makeCard(entry){
      var active=String(entry.id)===String(selectedId);
      var card=el(doc,'article','modern-history-card'+(active?' is-selected':''));
      card.setAttribute('data-snapshot-id',String(entry.id));
      card.addEventListener('click',function(event){
        if(event&&event.target&&typeof event.target.closest==='function'&&
          event.target.closest('.modern-history-multi'))return;
        actions.select(entry.id);
      });
      // A card selects only. Restore is an explicit action in the details panel;
      // double-click/Enter must never change the current physical experiment.
      var select=button(doc,'','View snapshot '+entry.id,function(){actions.select(entry.id);});
      select.className='modern-history-card-select';
      select.title='';
      select.setAttribute('aria-label','View '+displayName(entry)+' and its physical settings');
      select.setAttribute('aria-pressed',String(active));
      if(entry.thumbnail&&entry.thumbnail.dataUrl){
        var image=el(doc,'img','modern-history-image');
        image.src=entry.thumbnail.dataUrl;image.alt=displayName(entry)+' thumbnail';image.loading='lazy';
        select.className+=' has-preview';select.appendChild(image);
      }else select.appendChild(el(doc,'span','modern-history-no-image','No preview available'));
      card.appendChild(select);
      var body=el(doc,'div','modern-history-card-body');
      var title=el(doc,'strong','modern-history-card-title',displayName(entry));
      title.title=entry.name?label(entry):'';
      body.appendChild(title);
      body.appendChild(el(doc,'span','modern-history-card-meta',
        new Date(entry.createdAt).toLocaleString()+' · '+entry.source));
      body.appendChild(el(doc,'span','modern-history-card-kind',label(entry)));
      if(entry.pinned)body.appendChild(el(doc,'span','modern-history-card-pinned','Pinned'));
      if(options&&options.manage){
        var multiLabel=el(doc,'label','modern-history-multi');
        multiLabel.title='Select for bulk History actions';
        var check=el(doc,'input');check.type='checkbox';check.checked=!!(multi&&multi[entry.id]);
        check.setAttribute('aria-label','Select snapshot '+entry.id+' for bulk actions');
        check.addEventListener('change',function(){actions.multi(entry.id,check.checked);});
        check.addEventListener('click',function(event){if(event&&event.stopPropagation)event.stopPropagation();});
        check.addEventListener('dblclick',function(event){if(event&&event.stopPropagation)event.stopPropagation();});
        multiLabel.appendChild(check);multiLabel.appendChild(el(doc,'span','','Select for bulk actions'));
        body.appendChild(multiLabel);
      }
      card.appendChild(body);
      // Primary card actions stay visible in every gallery size. They never
      // select a card or restore the current experiment as a side effect.
      var pin=button(doc,'',(entry.pinned?'Unpin ':'Pin ')+displayName(entry),function(){
        if(actions.pin)actions.pin(entry.id,entry);
      });
      pin.className='modern-history-pin'+(entry.pinned?' is-pinned':'');
      pin.setAttribute('aria-pressed',String(!!entry.pinned));
      pin.disabled=!!(options&&(options.readOnly||options.protectedManagement&&entry.pinned&&entry.source==='recovery'));
      if(pin.disabled&&options?.protectedManagement){pin.title='Recovery snapshot must remain protected';pin.setAttribute('aria-label',pin.title);}
      card.appendChild(pin);
      var deleteTitle=entry.pinned?'Unpin '+displayName(entry)+' before deleting':
        'Delete '+displayName(entry);
      var remove=button(doc,'',deleteTitle,function(){
        if(actions.remove)actions.remove(entry.id);
      });
      remove.className='modern-history-delete modern-card-delete';
      remove.disabled=!!entry.pinned||!!(options&&(options.readOnly||options.protectedManagement));
      card.appendChild(remove);
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
            'Pin an experiment to keep it in this section.'));
        section.appendChild(grid);
      }
      host.appendChild(section);
    }
    section('Pinned',pinned,true,!!(options&&options.pinnedCollapsed));
    section('Recent',recent,false,false);
  }
  // The selected snapshot is inspected in a stable, visible side panel rather
  // than in a hover popover that obscures the gallery.
  function renderDetails(doc,host,entry){
    if(!host||!doc)return;
    host.textContent='';
    if(entry)host.appendChild(inspectorMarkup(doc,entry));
    else host.appendChild(el(doc,'p','modern-history-empty',
      'No visible snapshots. Clear your filters or save a new experiment.'));
  }
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
  // Legacy read-only aliases remain for existing integrations. Animation Studio
  // imports the shared presentation module directly, not this History API.
  return Object.freeze({render:render,select:select,label:label,displayName:displayName,
    inspect:presentation.inspect,inspectorMarkup:inspectorMarkup,
    renderDetails:renderDetails,setSize:setSize,
    frameSummary:presentation.frameSummary,frameVisual:presentation.frameVisual});
}));
