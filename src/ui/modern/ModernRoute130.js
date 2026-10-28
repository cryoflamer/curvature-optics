/* A separate document boots Modern UI without instantiating legacy controls.
 * The canonical public URL remains CurvatureApp.html?ui=modern.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernRoute130=api;
  if(root.location&&root.location.pathname){
    if(/CurvatureApp\.html$/.test(root.location.pathname))api.redirect(root.location);
    else if(/CurvatureModern\.html$/.test(root.location.pathname)){
      try{api.restoreCanonical(root.location,root.history);}
      catch(error){
        // Browser file:// policies can reject a same-directory URL rewrite.
        // The separate Modern document still works at CurvatureModern.html.
        root.CurvatureModernCanonicalWarning130=String(error.message||error);
      }
    }
  }
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function isModern(search){return new URLSearchParams(search||'').get('ui')==='modern';}
  function target(location){
    var path=location.pathname;
    if(!/CurvatureApp\.html$/.test(path))throw Error('Unrecognized Curvature App entry URL');
    return path.replace(/CurvatureApp\.html$/,'CurvatureModern.html')+
      (location.search||'')+(location.hash||'');
  }
  function canonical(location){
    var path=location.pathname;
    if(!/CurvatureModern\.html$/.test(path))throw Error('Unrecognized Modern entry URL');
    return path.replace(/CurvatureModern\.html$/,'CurvatureApp.html')+
      (location.search||'')+(location.hash||'');
  }
  function redirect(location){
    if(!isModern(location.search))return false;
    location.replace(target(location));
    return true;
  }
  function restoreCanonical(location,history){
    if(!isModern(location.search))return false;
    // The modern document has an explicit <base> so replacing the visible URL
    // does not alter where shared renderer assets are resolved.
    history.replaceState(history.state,'',canonical(location));
    return true;
  }
  return Object.freeze({isModern:isModern,target:target,canonical:canonical,
    redirect:redirect,restoreCanonical:restoreCanonical});
}));
