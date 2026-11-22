/* Internal Animation Studio navigation. Project and playback state stay in ModernApp. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationWorkspaceViews=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var names=['library','editor','preview'];
  function bind(doc,onActivate){
    if(!doc||typeof doc.getElementById!=='function')return null;
    var tabs=Object.create(null),panels=Object.create(null);
    for(var i=0;i<names.length;i++){
      var name=names[i],title=name.charAt(0).toUpperCase()+name.slice(1);
      tabs[name]=doc.getElementById('ModernAnimationView'+title);
      panels[name]=doc.getElementById('ModernAnimation'+title+'View');
      if(!tabs[name]||!panels[name])return null;
    }
    function show(view,focus){
      if(!Object.prototype.hasOwnProperty.call(tabs,view))return false;
      names.forEach(function(name){
        var active=name===view;
        panels[name].hidden=!active;
        tabs[name].setAttribute('aria-selected',String(active));
        tabs[name].tabIndex=active?0:-1;
      });
      if(focus&&typeof tabs[view].focus==='function')tabs[view].focus({preventScroll:true});
      return true;
    }
    function activate(view,focus){
      if(typeof onActivate==='function')onActivate(view,!!focus);
      else show(view,focus);
    }
    names.forEach(function(name,index){
      var tab=tabs[name];
      tab.addEventListener('click',function(){activate(name,false);});
      tab.addEventListener('keydown',function(event){
        var next;
        if(event.key==='ArrowRight')next=names[(index+1)%names.length];
        else if(event.key==='ArrowLeft')next=names[(index+names.length-1)%names.length];
        else if(event.key==='Home')next=names[0];
        else if(event.key==='End')next=names[names.length-1];
        else return;
        if(event.preventDefault)event.preventDefault();
        activate(next,true);
      });
    });
    return Object.freeze({show:show});
  }
  // UI-only query route; never write to experiment/project data.
  var routeKey='studioView';
  function route(href){
    try{var v=new URL(href).searchParams.get(routeKey);return names.includes(v)?v:null;}
    catch(error){return null;}
  }
  function address(href,view){
    if(!names.includes(view))throw RangeError('Unknown Studio view');
    var url=new URL(href);url.searchParams.set(routeKey,view);return url.href;
  }
  function navigate(root,view,replace){
    if(!root||!root.history||!root.location)return false;
    try{
      var href=address(root.location.href,view);
      if(href===root.location.href)return true;
      var previous=root.history.state,state=Object.assign({},
        previous&&typeof previous==='object'?previous:{});
      var method=replace?'replaceState':'pushState';
      if(typeof root.history[method]!=='function')return false;
      root.history[method](state,'',href);return true;
    }catch(error){return false;}
  }
  return Object.freeze({bind:bind,names:names.slice(),route:route,address:address,navigate:navigate});
}));
