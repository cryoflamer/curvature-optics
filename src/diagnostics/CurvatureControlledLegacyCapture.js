/* Synchronous legacy reference capture. The caller supplies a temporary model
 * binding and a draw callback; the original binding and framebuffer MUST be
 * restored even if rendering or snapshotting fails. Never invoke asynchronously.
 */
(function(root,factory){
 var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 root.CurvatureControlledLegacyCapture=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function capture(options){
  if(!options||typeof options.install!=='function'||typeof options.draw!=='function'||typeof options.snapshot!=='function'||typeof options.restore!=='function')
   throw new TypeError('Synchronous install, draw, snapshot and restore callbacks required');
  var installed=false;
  try {
   // Mark before invoking install: even a partially failed installation must be undone.
   installed=true;options.install(options.model);
   options.draw();
   return options.snapshot();
  } finally {if(installed)options.restore();}
 }
 return {capture:capture};
}));
