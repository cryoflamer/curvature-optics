/* Viewer-only layout for the existing Animation Studio stage. No player state. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPresentation=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function frameIndex(times,position){
    if(!times||!times.length||!Number.isFinite(position))return -1;
    var i=0;
    while(i+1<times.length&&position>=times[i+1].arrivalMs)i++;
    return i;
  }
  function frameLabel(times,position){
    var i=frameIndex(times,position);if(i<0)return '';
    if(i+1<times.length&&position>times[i].departureMs)
      return (i+1)+' → '+(i+2)+' · '+times[i].name+' → '+times[i+1].name;
    return (i+1)+' / '+times.length+' · '+times[i].name;
  }
  // Outgoing caption remains readable during travel; next arrival replaces it
  // even when the destination has no description. The painted clock is authoritative.
  function narrativeAt(times,position){
    var i=frameIndex(times,position);
    if(i<0||!(times[i].description||times[i].narrativeTitle))return null;
    return {label:(i+1)+' / '+times.length+' · '+(times[i].narrativeTitle||times[i].name),text:times[i].description||''};
  }
  function syncNarrative(panel,label,body,times,position,visible){
    var caption=narrativeAt(times,position);
    panel.hidden=visible===false||!times||!times.some(function(t){return !!(t.description||t.narrativeTitle);});
    var nextLabel=caption?caption.label:'',nextText=caption?caption.text:'';
    if(label.textContent!==nextLabel){label.textContent=nextLabel;body.scrollTop=0;}
    if(body.textContent!==nextText){body.textContent=nextText;body.scrollTop=0;}
  }
  // Navigation uses the prepared timeline, with no clock or project mutation.
  function syncNavigation(doc,select,times,position){
    if(select.__times!==times){
      select.__times=times;select.replaceChildren();
      var placeholder=element(doc,'option','Rendering frame…',select);placeholder.value='';placeholder.disabled=true;
      (times||[]).forEach(function(t,i){
        var option=element(doc,'option',(i+1)+' · '+(t.narrativeTitle||t.name),select);option.value=String(i);
      });
    }
    var i=frameIndex(times,position);select.value=i<0?'':String(i);
  }
  function navigationTarget(times,value){
    if(typeof value!=='string'||!/^\d+$/.test(value))return null;
    var t=times&&times[Number(value)];return t?t.arrivalMs:null;
  }
  // Observation identity follows completed physical pixels, never the advancing
  // clock. A zero-duration hold is visible only at its exact arrival.
  function referencesAt(times,position){
    var i=frameIndex(times,position);
    if(i<0)return {index:-1,ids:[],reserve:false};
    var t=times[i],ids=t.referenceImageIds||[];
    if(position<t.arrivalMs)return {index:-1,ids:[],reserve:false};
    if(i+1<times.length&&position>t.departureMs)
      return {index:-1,ids:[],reserve:!!(ids.length||(times[i+1].referenceImageIds||[]).length)};
    return {index:i,ids:ids,reserve:!!ids.length};
  }
  function element(doc,tag,text,parent){
    var n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(parent)parent.appendChild(n);return n;
  }
  // Native modal remains inside the stage (including native Fullscreen).
  // It is explicitly requested, never opens during playback or hover.
  async function showReference(doc,host,id,get){
    var dialog=host.querySelector('.modern-reference-dialog');
    if(!dialog){dialog=element(doc,'dialog',undefined,host);dialog.className='modern-reference-dialog';
      dialog.setAttribute('aria-label','Reference photograph details');
      dialog.addEventListener('close',function(){if(!dialog.open){dialog.__request=null;dialog.replaceChildren();}});}
    var token={};dialog.__request=token;dialog.replaceChildren();
    var close=element(doc,'button','Close photograph',dialog);close.type='button';close.addEventListener('click',function(){dialog.close();});
    var body=element(doc,'div','Loading original…',dialog);
    if(!dialog.open)dialog.showModal();
    try{
      var row=await get(id);if(dialog.__request!==token||!dialog.open||!dialog.isConnected)return;
      if(!row){body.textContent='Missing local photograph: '+id;return;}
      var r=row.record;body.textContent='';element(doc,'h3',r.title,body);
      var image=element(doc,'img',undefined,body);image.src=r.original.dataUrl;image.alt=r.title;
      element(doc,'p',r.original.width+' × '+r.original.height+' pixels',body);
      [['Author',r.author],['License',r.license],['Description',r.description],['Notes',r.notes]].forEach(function(p){
        if(p[1]||p[0]==='Author'||p[0]==='License')element(doc,'p',p[0]+': '+(p[1]||'Unknown'),body);
      });
      if(r.sourceUrl){var a=element(doc,'a','Source photograph ↗',body);a.href=r.sourceUrl;a.target='_blank';a.rel='noopener noreferrer';}
      else element(doc,'p','Source: Unknown',body);
      var facts=element(doc,'dl',undefined,body);
      Object.keys(r.cameraMetadata||{}).forEach(function(k){var f=r.cameraMetadata[k];
        element(doc,'dt',k,facts);element(doc,'dd',f.status+(f.value===undefined?'':': '+f.value)+
          (f.uncertainty===undefined?'':' ± '+f.uncertainty)+(f.notes?' · '+f.notes:''),facts);});
      var download=element(doc,'a','Download original',body);download.href=r.original.dataUrl;
      download.download=r.id+'.'+r.original.dataUrl.split('/')[1].split(';')[0].replace('jpeg','jpg');
    }catch(error){if(dialog.__request===token&&dialog.open)body.textContent='Cannot load photograph: '+(error.message||error);}
  }
  function createReferences(options){
    var panel=options.panel,panels=options.panels,control=options.control,splitter=options.splitter;
    var select=options.select,image=options.image,status=options.status,title=options.title,view=options.view;
    var prev=options.prev,next=options.next,meta=options.meta;
    var project=null,layoutProject=null,index=-2,ids=[],choice=0,generation=0,available=false,reserve=false;
    var size={side:33,below:32},lastLayout=null,lastMode=select.value;
    function layout(){
      var mode=select.value,visible=available&&reserve&&mode!=='hidden';
      var key=[mode,visible,available,size[mode]].join(':');
      if(key===lastLayout)return;lastLayout=key;
      panel.hidden=!visible;splitter.hidden=!visible;control.hidden=!available;
      panels.classList.toggle('has-reference-side',visible&&mode==='side');
      panels.classList.toggle('has-reference-below',visible&&mode==='below');
      if(visible){panels.style.setProperty('--reference-share',size[mode]+'%');
        if(mode==='below')panels.style.setProperty('--reference-height',size[mode]+'dvh');
        splitter.setAttribute('aria-orientation',mode==='side'?'vertical':'horizontal');
        splitter.setAttribute('aria-valuenow',String(size[mode]));}
    }
    function clearImage(){image.hidden=true;image.removeAttribute('src');title.textContent='';meta.textContent='';view.disabled=true;}
    function paint(){
      var token=++generation,id=ids[choice];clearImage();
      prev.disabled=choice===0;next.disabled=choice>=ids.length-1;
      prev.hidden=next.hidden=ids.length<2;
      if(!id){status.textContent='No observation at this camera position';return;}
      status.textContent='Loading reference '+(choice+1)+' / '+ids.length+'…';
      if(select.value==='hidden')return;
      Promise.resolve().then(function(){return options.get(id);}).then(function(row){
        if(token!==generation)return;
        if(!row){status.textContent='Missing local photograph: '+id;return;}
        var r=row.record;title.textContent=r.title;
        meta.textContent=(r.author||'Unknown author')+' · '+(r.sourceUrl?'Source recorded':'Source unknown');
        image.src=r.original.dataUrl;image.alt=r.title;image.hidden=false;view.disabled=false;
        status.textContent='Reference '+(choice+1)+' / '+ids.length+' · real photograph';
      }).catch(function(error){if(token===generation)status.textContent='Cannot load photograph: '+(error.message||error);});
    }
    image.addEventListener('error',function(){if(!image.hidden){image.hidden=true;status.textContent='Cannot decode local photograph';}});
    // Commit geometry before either physical renderer measures its Canvas.
    // This does not publish photographs for a frame that has not painted yet.
    function prepare(p,times,position){
      var changed=layoutProject!==p;layoutProject=p;
      if(changed)available=!!(times&&times.some(function(t){return (t.referenceImageIds||[]).length;}));
      if(Number.isFinite(position))reserve=referencesAt(times,position).reserve;
      else if(changed)reserve=available;
      // A failed/pending frame clears its photograph, not its reserved geometry.
      if(!available)reserve=false;
      layout();
    }
    function sync(p,times,position){
      prepare(p,times,position);
      var changed=project!==p;project=p;
      var frame=referencesAt(times,position);
      if(changed||index!==frame.index||ids.length!==frame.ids.length||ids.some(function(id,i){return id!==frame.ids[i];})){
        index=frame.index;ids=frame.ids;choice=0;paint();
      }
    }
    select.addEventListener('change',function(){var wasHidden=lastMode==='hidden';lastMode=select.value;layout();
      if(wasHidden||lastMode==='hidden')paint();});
    prev.addEventListener('click',function(){if(choice>0){choice--;paint();}});
    next.addEventListener('click',function(){if(choice+1<ids.length){choice++;paint();}});
    view.addEventListener('click',function(){if(ids[choice]&&!view.disabled)showReference(options.document,options.stage,ids[choice],options.get);});
    function resize(value){var mode=select.value;if(mode==='hidden')return;
      size[mode]=Math.max(20,Math.min(60,Math.round(value)));layout();}
    var dragStart=null;
    function drag(event){if(!dragStart)return;var r=panels.getBoundingClientRect();
      if(select.value==='side'&&r.width)resize(dragStart.size+100*(event.clientX-dragStart.x)/r.width);
      else if(select.value==='below'){var h=options.document.documentElement.clientHeight||1;resize(dragStart.size-100*(event.clientY-dragStart.y)/h);}}
    splitter.addEventListener('pointerdown',function(event){dragStart={size:size[select.value],x:event.clientX,y:event.clientY};splitter.setPointerCapture(event.pointerId);event.preventDefault();});
    splitter.addEventListener('lostpointercapture',function(){dragStart=null;});
    splitter.addEventListener('pointermove',function(event){if(splitter.hasPointerCapture(event.pointerId))drag(event);});
    splitter.addEventListener('keydown',function(event){var mode=select.value;
      var delta=mode==='side'?{ArrowLeft:-2,ArrowRight:2}:{ArrowUp:2,ArrowDown:-2};
      if(delta[event.key]){resize(size[mode]+delta[event.key]);event.preventDefault();}
    });
    return Object.freeze({prepare:prepare,sync:sync});
  }
  function create(options){
    var doc=options.document,stage=options.stage,bar=options.bar,active=false;
    var previousFocus=null,previousOverflow='',blocked=[];
    var disclosures=(options.disclosures||[]).filter(Boolean);
    function closeDisclosures(){disclosures.forEach(function(button){button.setAttribute('aria-expanded','false');});}
    disclosures.forEach(function(button){button.addEventListener('click',function(){
      if(!active)return;
      button.setAttribute('aria-expanded',button.getAttribute('aria-expanded')==='true'?'false':'true');
    });});
    function enter(){
      if(active||!options.ready())return false;
      active=true;closeDisclosures();previousFocus=doc.activeElement;
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
      active=false;closeDisclosures();
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
      if(!active||event.defaultPrevented||stage.querySelector&&stage.querySelector('dialog[open]'))return;
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
  return Object.freeze({create:create,frameLabel:frameLabel,narrativeAt:narrativeAt,syncNarrative:syncNarrative,syncNavigation:syncNavigation,navigationTarget:navigationTarget,referencesAt:referencesAt,createReferences:createReferences,showReference:showReference});
}));
