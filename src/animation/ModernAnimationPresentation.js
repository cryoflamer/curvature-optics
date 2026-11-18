/* Viewer-only layout for the existing Animation Studio stage. No player state. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPresentation=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function frameLabel(times,position){
    if(!times||!times.length||!Number.isFinite(position))return '';
    var i=0;
    while(i+1<times.length&&position>=times[i+1].arrivalMs)i++;
    if(i+1<times.length&&position>times[i].departureMs)
      return (i+1)+' → '+(i+2)+' · '+times[i].name+' → '+times[i+1].name;
    return (i+1)+' / '+times.length+' · '+times[i].name;
  }
  function create(options){
    var doc=options.document,stage=options.stage,bar=options.bar,active=false;
    var previousFocus=null,previousOverflow='',blocked=[];
    function enter(){
      if(active||!options.ready())return false;
      active=true;previousFocus=doc.activeElement;
      previousOverflow=doc.body.style.overflow;doc.body.style.overflow='hidden';
      // Keep the one stage mounted. Disable every sibling on its ancestor path.
      for(var node=stage;node&&node!==doc.body;node=node.parentElement){
        if(!node.parentElement)break;
        Array.from(node.parentElement.children).forEach(function(sibling){
          if(sibling!==node){blocked.push([sibling,sibling.inert]);sibling.inert=true;}
        });
      }
      stage.classList.add('is-presenting');stage.setAttribute('role','dialog');
      stage.setAttribute('aria-modal','true');bar.hidden=false;
      options.sync();options.exitButton.focus({preventScroll:true});options.resize();return true;
    }
    function leave(){
      if(!active)return false;
      active=false;
      if(doc.fullscreenElement===stage&&doc.exitFullscreen){
        try{Promise.resolve(doc.exitFullscreen()).catch(options.fullscreenError);}catch(error){options.fullscreenError(error);}
      }
      stage.classList.remove('is-presenting');stage.removeAttribute('role');stage.removeAttribute('aria-modal');
      bar.hidden=true;blocked.forEach(function(item){item[0].inert=item[1];});blocked=[];
      doc.body.style.overflow=previousOverflow;
      if(previousFocus&&previousFocus.isConnected)previousFocus.focus({preventScroll:true});
      previousFocus=null;options.sync();options.resize();return true;
    }
    function fullscreen(){
      if(!active)return;
      try{
        var result=doc.fullscreenElement===stage?doc.exitFullscreen():stage.requestFullscreen();
        return Promise.resolve(result).catch(options.fullscreenError);
      }catch(error){options.fullscreenError(error);}
    }
    function key(event){
      if(!active||event.defaultPrevented)return;
      if(event.key==='Escape'&&doc.fullscreenElement!==stage){event.preventDefault();leave();return;}
      if(event.key==='Tab'){
        var focusable=Array.from(stage.querySelectorAll('button,input,select,summary,a[href],[tabindex]')).filter(function(el){return !el.disabled&&el.tabIndex>=0&&el.getClientRects().length;});
        if(!focusable.length)return;
        var first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}
      }
    }
    doc.addEventListener('keydown',key);
    doc.addEventListener('fullscreenchange',function(){if(active){options.sync();options.resize();}});
    return Object.freeze({enter:enter,leave:leave,fullscreen:fullscreen,isActive:function(){return active;}});
  }
  return Object.freeze({create:create,frameLabel:frameLabel});
}));
