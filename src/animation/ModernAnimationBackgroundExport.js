/* Main-thread controller for the one-worker deterministic export. No optical
 * computation or PNG encoding ever runs here. Cancellation terminates the
 * current synchronous RK4 frame instead of waiting for its completion. */
(function(root,factory){
  var frameExport=root.CurvatureModernAnimationFrameExport;
  if(typeof module==='object'&&module.exports)frameExport=require('./ModernAnimationFrameExport');
  var api=factory(frameExport);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationBackgroundExport=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(frameExport){
  'use strict';
  function create(settings){
    settings=settings||{};
    var WorkerCtor=settings.WorkerCtor;
    var workerUrl=settings.workerUrl||'src/animation/ModernAnimationFrameWorker.js';
    var active=null;
    function isBusy(){return !!active;}
    function cancel(){
      if(!active)return false;
      // Resolve, do not reject: cancelling is a deliberate user action.
      active.finish(null,{cancelled:true});
      return true;
    }
    function start(options){
      if(active)throw Error('PNG export is already running');
      if(typeof WorkerCtor!=='function')throw Error('Web Workers are unavailable in this browser');
      var plan=frameExport.plan(options.project,options);
      var worker=new WorkerCtor(workerUrl);
      return new Promise(function(resolve,reject){
        var finished=false;
        function finish(error,result){
          if(finished)return;
          finished=true;
          if(active&&active.worker===worker)active=null;
          worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
          worker.terminate();
          if(error)reject(error);else resolve(result);
        }
        active={worker:worker,finish:finish};
        worker.onmessage=function(event){
          var value=event&&event.data||{};
          if(value.type==='ready'){
            if(typeof options.onReady==='function')options.onReady(value);
          }else if(value.type==='progress'){
            if(typeof options.onProgress==='function')options.onProgress(value);
          }else if(value.type==='complete'){
            if(!value.blob||!value.manifest||value.manifest.frameCount!==plan.timesMs.length)
              finish(Error('Worker returned an incomplete PNG sequence'));
            else finish(null,{cancelled:false,blob:value.blob,manifest:value.manifest});
          }else if(value.type==='error'){
            finish(Error('Background render failed: '+String(value.message||'unknown error')));
          }
        };
        worker.onerror=function(event){
          if(event&&typeof event.preventDefault==='function')event.preventDefault();
          finish(Error('PNG render worker failed to load or execute. Check the browser console and server script paths.'));
        };
        worker.onmessageerror=function(){finish(Error('PNG render worker response could not be decoded'));};
        try{worker.postMessage({type:'start',project:plan.project,fps:plan.fps,
          width:plan.width,height:plan.height});}
        catch(error){finish(error);}
      });
    }
    return Object.freeze({start:start,cancel:cancel,isBusy:isBusy});
  }
  return Object.freeze({create:create});
}));
