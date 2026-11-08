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
    host.textContent='';
    if(!entries.length){
      host.appendChild(el(doc,'p','modern-history-empty',
        'No snapshots yet. Save a snapshot to start your visual history.'));
      return;
    }
    entries.forEach(function(entry){
      var card=el(doc,'article','modern-history-card'+(String(entry.id)===String(selectedId)?' is-selected':''));
      card.setAttribute('data-snapshot-id',String(entry.id));
      card.addEventListener('click',function(event){
        if(event&&event.target&&typeof event.target.closest==='function'&&
          event.target.closest('.modern-history-card-actions, .modern-history-card-menu, .modern-history-multi'))return;
        actions.select(entry.id);
      });
      card.addEventListener('dblclick',function(event){
        // An explicit control, bulk-selection checkbox or actions menu is not
        // an experiment gesture. Only the card image/text restores.
        if(event&&event.target&&typeof event.target.closest==='function'&&
          event.target.closest('.modern-history-card-actions, .modern-history-card-menu, .modern-history-multi'))return;
        if(actions.restore)actions.restore(entry.id);
      });
      var select=button(doc,'','Select snapshot '+entry.id,function(){actions.select(entry.id);});
      select.className='modern-history-card-select';
      select.title='Select snapshot; double-click to restore';
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
        select.appendChild(image);
      }else{
        select.appendChild(el(doc,'span','modern-history-no-image','No preview available'));
      }
      card.appendChild(select);
      var body=el(doc,'div','modern-history-card-body');
      body.appendChild(el(doc,'strong','modern-history-card-title',label(entry)));
      body.appendChild(el(doc,'span','modern-history-card-meta',
        new Date(entry.createdAt).toLocaleString()+' · '+entry.source+
        (entry.pinned?' · pinned':'')));
      var controls=el(doc,'div','modern-history-card-actions');
      controls.appendChild(button(doc,'View','Quick view snapshot '+entry.id,function(){actions.preview(entry.id);}));
      controls.appendChild(button(doc,entry.pinned?'Unpin':'Pin',
        (entry.pinned?'Unpin':'Pin')+' snapshot '+entry.id,function(){actions.pin(entry.id,!entry.pinned);}));
      controls.appendChild(button(doc,'Delete','Delete snapshot '+entry.id,function(){actions.remove(entry.id);}));
      body.appendChild(controls);
      var menu=el(doc,'details','modern-history-card-menu');
      var summary=el(doc,'summary','modern-history-card-menu-toggle','⋯ Actions');
      summary.setAttribute('aria-label','Snapshot actions');
      menu.appendChild(summary);
      var menuActions=el(doc,'div','modern-history-card-menu-actions');
      menuActions.appendChild(button(doc,'View','Quick view snapshot '+entry.id,function(){actions.preview(entry.id);menu.open=false;}));
      menuActions.appendChild(button(doc,entry.pinned?'Unpin':'Pin',
        (entry.pinned?'Unpin':'Pin')+' snapshot '+entry.id,function(){actions.pin(entry.id,!entry.pinned);menu.open=false;}));
      menuActions.appendChild(button(doc,'Delete','Delete snapshot '+entry.id,function(){actions.remove(entry.id);menu.open=false;}));
      menu.appendChild(menuActions);body.appendChild(menu);
      var multiLabel=el(doc,'label','modern-history-multi');
      multiLabel.title='Select for storyboard / bulk actions';
      var check=el(doc,'input');check.type='checkbox';check.checked=!!(multi&&multi[entry.id]);
      check.addEventListener('change',function(){actions.multi(entry.id,check.checked);});
      multiLabel.appendChild(check);
      multiLabel.appendChild(el(doc,'span','', 'Select'));
      body.appendChild(multiLabel);
      card.appendChild(body);host.appendChild(card);
    });
  }
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
  return Object.freeze({render:render,select:select,preview:preview,close:close,label:label,
    setSize:setSize});
}));
