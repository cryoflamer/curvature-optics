/* Modern is the primary document. The historical CurvatureApp.html entry
 * remains a compatibility URL for original Legacy bookmarks and diagnostics.
 * Route before loading the Legacy script bundle, without interpreting its
 * saved state or importing its playback data into Modern.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernRoute=api;
  if(root.location&&root.location.pathname&&
     /CurvatureApp\.html$/.test(root.location.pathname))api.redirect(root.location);
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var legacyKeys=['state','demo','pos','play','tab','embed'];
  function legacyRequest(search){
    var params=new URLSearchParams(search||'');
    var ui=params.get('ui');
    // The explicit modern choice wins even if a stale Legacy field is present.
    if(ui==='modern')return false;
    // Preserve all explicit older shell choices, including unknown `ui` values.
    if(params.has('ui'))return true;
    // Bare entry is Modern, but a Legacy deep link must continue to boot the
    // original parser, state decoder and animation timeline without conversion.
    return legacyKeys.some(function(key){return params.has(key);});
  }
  function isModern(search){return !legacyRequest(search);}
  function target(location){
    var path=location.pathname;
    if(!/CurvatureApp\.html$/.test(path))throw Error('Unrecognized Curvature App entry URL');
    return path.replace(/CurvatureApp\.html$/,'CurvatureModern.html')+
      (location.search||'')+(location.hash||'');
  }
  function redirect(location){
    if(!isModern(location.search))return false;
    location.replace(target(location));
    return true;
  }
  return Object.freeze({legacyRequest:legacyRequest,isModern:isModern,
    target:target,redirect:redirect});
}));
