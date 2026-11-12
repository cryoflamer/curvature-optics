/* One non-rendering, reusable snapshot preview controller for Modern History,
 * Animation Library, snapshot queues, picker and keyframe timeline.
 * Receives persisted image/experiment data; never captures optics or writes state.
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
  function button(doc,text,title,handler){
    var node=doc.createElement('button');node.type='button';node.textContent=text;
    node.title=title;node.setAttribute('aria-label',title);
    node.addEventListener('click',function(event){
      if(event&&event.stopPropagation)event.stopPropagation();handler();
    });
    node.addEventListener('dblclick',function(event){
      if(event&&event.stopPropagation)event.stopPropagation();
    });
    return node;
  }
  function create(doc,host,render){
    // A shared floating overlay avoids clipping by the scrolling gallery and
    // prevents 200 separate tooltip nodes from being created for 200 cards.
    if(!doc.body||typeof doc.addEventListener!=='function')return null;
    var node=el(doc,'div','modern-history-inspector');
    node.hidden=true;node.setAttribute('role','tooltip');
    doc.body.appendChild(node);
    var timer=null,pinned=false,anchor=null,infoTrigger=null,suppressFocus=false;
    var controller=null,destroyed=false;
    function cancel(){if(timer!==null){clearTimeout(timer);timer=null;}pendingCard=null;}
    function restoreFocus(trigger){
      if(trigger&&typeof trigger.focus==='function'){
        suppressFocus=true;try{trigger.focus();}finally{suppressFocus=false;}
      }
    }
    function hide(){cancel();if(pinned)return;node.hidden=true;anchor=null;
      if(current.get(doc)===controller)current.delete(doc);}
    function forceHide(){pinned=false;hide();}
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
    function show(entry,card,lock,trigger){
      if(destroyed)return;
      cancel();pinned=!!lock;anchor=card;infoTrigger=trigger||null;
      var previous=current.get(doc);
      if(previous&&previous!==controller)previous.hide();
      current.set(doc,controller);
      node.textContent='';node.appendChild(render(doc,entry));
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
    var pendingCard=null;
    function hover(entry,card,trigger){
      if(destroyed||pinned)return;
      if(card===anchor&&!node.hidden)return;
      if(card===pendingCard&&timer!==null)return;
      cancel();pendingCard=card;
      timer=setTimeout(function(){timer=null;pendingCard=null;show(entry,card,false,trigger);},350);
    }
    function leave(){
      if(pinned)return;
      cancel();timer=setTimeout(function(){timer=null;hide();},140);
    }
    node.addEventListener('mouseenter',cancel);
    node.addEventListener('mouseleave',leave);
    function scrolled(event){
      if(event&&(event.target===node||node.contains&&node.contains(event.target)))return;
      if(pinned)position();else hide();
    }
    function resized(){if(!node.hidden)position();}
    host.addEventListener('scroll',scrolled);
    doc.addEventListener('scroll',scrolled,true);
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
    // A card (or image surface) can be reused anywhere. Controls such as Delete,
    // checkboxes and drag handles never initiate a preview. Keyboard focus and
    // pen/touch previews are supported without changing the card's click action.
    function bind(surface,entry,card,options){
      if(!surface)return;
      options=options||{};card=card||surface;
      function isControl(target){
        while(target&&target!==surface){
          var name=String(target.tagName||'').toUpperCase();
          if(['BUTTON','INPUT','SELECT','TEXTAREA'].includes(name)||
            target.getAttribute&&target.getAttribute('data-no-thumbnail-preview')==='true')return true;
          target=target.parentNode;
        }
        return false;
      }
      surface.addEventListener('mouseover',function(event){
        if(isControl(event&&event.target)){leave();return;}
        hover(entry,card,surface);
      });
      surface.addEventListener('mouseenter',function(event){
        if(!isControl(event&&event.target))hover(entry,card,surface);
      });
      surface.addEventListener('mouseleave',leave);
      if(options.focusPreview!==false)surface.addEventListener('focus',function(){
        if(!suppressFocus)show(entry,card,false,surface);
      });
      surface.addEventListener('blur',leave);
      surface.addEventListener('focusout',leave);
      surface.addEventListener('keydown',function(event){
        if(!event||event.target&&event.target!==surface)return;
        var explicit=options.keyboardPin===false&&(event.key==='p'||event.key==='P');
        if(explicit||options.keyboardPin!==false&&
          (event.key===' '||event.key==='Spacebar')){
          if(event.preventDefault)event.preventDefault();show(entry,card,true,surface);
        }
      });
      surface.addEventListener('click',function(event){
        if(event&&(event.pointerType==='touch'||event.pointerType==='pen')&&
          !isControl(event.target))show(entry,card,true,surface);
      });
    }
    controller={hover:hover,leave:leave,show:show,bind:bind,
      focus:function(entry,card,trigger){if(!suppressFocus)show(entry,card,false,trigger);},
      hide:forceHide,
      destroy:function(){
        destroyed=true;forceHide();cancel();doc.removeEventListener('keydown',keydown);doc.removeEventListener('click',click);
        host.removeEventListener('scroll',scrolled);
        doc.removeEventListener('scroll',scrolled,true);
        if(viewport&&typeof viewport.removeEventListener==='function')viewport.removeEventListener('resize',resized);
        if(current.get(doc)===controller)current.delete(doc);
        if(node.parentNode)node.parentNode.removeChild(node);
      }};
    return controller;
  }
  return Object.freeze({create:create});
}));
