/* One explicit, shared snapshot/project details dialog for History, Animation
 * Library, picker, storyboard and timeline. No hover or optics/render work.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernThumbnailPreview=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var current=new WeakMap();
  function el(doc,tag,className){
    var node=doc.createElement(tag);node.className=className;return node;
  }
  function create(doc,host,render){
    if(!doc.body||typeof doc.addEventListener!=='function')return null;
    var node=el(doc,'div','modern-history-inspector');
    node.hidden=true;node.setAttribute('role','dialog');
    node.setAttribute('aria-label','Saved snapshot or animation details');
    doc.body.appendChild(node);
    var anchor=null,infoTrigger=null,controller=null,destroyed=false;
    function restoreFocus(trigger){
      if(trigger&&typeof trigger.focus==='function')trigger.focus();
    }
    function hide(){
      if(infoTrigger&&infoTrigger.setAttribute)infoTrigger.setAttribute('aria-expanded','false');
      node.hidden=true;anchor=null;infoTrigger=null;
      if(current.get(doc)===controller)current.delete(doc);
    }
    function position(){
      if(!anchor||typeof anchor.getBoundingClientRect!=='function')return;
      var viewport=doc.defaultView||{},w=viewport.innerWidth||1024,h=viewport.innerHeight||768;
      var r=anchor.getBoundingClientRect(),rect=node.getBoundingClientRect();
      var width=rect.width||480,height=rect.height||260,pad=12;
      var maxX=Math.max(pad,w-width-pad),maxY=Math.max(pad,h-height-pad);
      var x,y=r.top;
      if(r.right+10+width<=w-pad)x=r.right+10;
      else if(r.left-width-10>=pad)x=r.left-width-10;
      else{
        x=Math.max(pad,Math.min(r.left,maxX));
        y=r.bottom+10;
        if(y+height>h-pad)y=r.top-height-10;
      }
      node.style.left=Math.round(Math.max(pad,Math.min(x,maxX)))+'px';
      node.style.top=Math.round(Math.max(pad,Math.min(y,maxY)))+'px';
    }
    function show(entry,card,trigger){
      if(destroyed)return;
      var previous=current.get(doc);
      if(previous&&previous!==controller)previous.hide();
      current.set(doc,controller);
      anchor=trigger||card;infoTrigger=trigger||card;
      if(infoTrigger&&infoTrigger.setAttribute)infoTrigger.setAttribute('aria-expanded','true');
      node.textContent='';node.appendChild(render(doc,entry));
      var close=el(doc,'button','modern-history-inspector-close');
      close.type='button';close.textContent='×';close.setAttribute('aria-label','Close details');
      close.addEventListener('click',function(event){
        if(event&&event.stopPropagation)event.stopPropagation();
        var focus=infoTrigger;hide();restoreFocus(focus);
      });
      node.appendChild(close);node.hidden=false;position();
    }
    function infoButton(parent,entry,card,label){
      if(!parent)return null;
      var trigger=el(doc,'button','modern-card-info-button');
      trigger.type='button';trigger.textContent='ⓘ';trigger.draggable=false;
      trigger.setAttribute('aria-label','Show details for '+(label||entry.name||'saved item'));
      trigger.setAttribute('aria-haspopup','dialog');
      trigger.setAttribute('aria-expanded','false');
      trigger.setAttribute('data-no-thumbnail-preview','true');
      ['pointerdown','mousedown','dblclick','dragstart'].forEach(function(type){
        trigger.addEventListener(type,function(event){
          if(event&&event.stopPropagation)event.stopPropagation();
          if(type==='dragstart'&&event&&event.preventDefault)event.preventDefault();
        });
      });
      trigger.addEventListener('click',function(event){
        if(event&&event.stopPropagation)event.stopPropagation();
        if(infoTrigger===trigger&&!node.hidden){hide();return;}
        show(entry,card||parent,trigger);
      });
      parent.appendChild(trigger);
      return trigger;
    }
    function scrolled(event){
      if(event&&(event.target===node||node.contains&&node.contains(event.target)))return;
      hide();
    }
    function resized(){if(!node.hidden)position();}
    host.addEventListener('scroll',scrolled);
    doc.addEventListener('scroll',scrolled,true);
    var viewport=doc.defaultView;
    if(viewport&&typeof viewport.addEventListener==='function')viewport.addEventListener('resize',resized);
    function keydown(event){if(event.key==='Escape'&&!node.hidden){
      var focus=infoTrigger;hide();restoreFocus(focus);
    }}
    function click(event){
      if(node.hidden)return;
      if(event.target===node||(node.contains&&node.contains(event.target))||
        event.target===infoTrigger)return;
      hide();
    }
    function dragstart(){hide();}
    doc.addEventListener('keydown',keydown);
    doc.addEventListener('click',click);
    doc.addEventListener('dragstart',dragstart,true);
    controller={show:show,infoButton:infoButton,hide:hide,
      destroy:function(){
        destroyed=true;hide();doc.removeEventListener('keydown',keydown);
        doc.removeEventListener('click',click);
        doc.removeEventListener('dragstart',dragstart,true);
        host.removeEventListener('scroll',scrolled);
        doc.removeEventListener('scroll',scrolled,true);
        if(viewport&&typeof viewport.removeEventListener==='function')viewport.removeEventListener('resize',resized);
        if(node.parentNode)node.parentNode.removeChild(node);
      }};
    return controller;
  }
  return Object.freeze({create:create});
}));
