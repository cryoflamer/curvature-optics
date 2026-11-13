/* UI-thread coordinator for parallel, deterministic PNG frame export.
 * Every optical frame is rendered in an isolated Worker. A separate archive
 * Worker holds PNG buffers and builds the ZIP; no optics, PNG encoding or ZIP
 * checksum work is performed on the main thread. Cancel terminates ALL workers.
 */
(function(root,factory){
  var frameExport=root.CurvatureModernAnimationFrameExport;
  var projects=root.CurvatureModernAnimationProject;
  if(typeof module==='object'&&module.exports){
    frameExport=require('./ModernAnimationFrameExport');
    projects=require('./ModernAnimationProject');
  }
  var api=factory(frameExport,projects);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationBackgroundExport=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(frameExport,projects){
  'use strict';
  function countFor(value,hardware,total){
    if(value===undefined||value==='auto'){
      var cores=Number.isInteger(hardware)&&hardware>0?hardware:4;
      value=Math.max(1,Math.min(4,Math.floor(cores/2)));
    }
    if(!Number.isInteger(value)||value<1||value>4)
      throw RangeError('PNG export worker count must be Auto or 1–4');
    return Math.min(value,total);
  }
  function create(settings){
    settings=settings||{};
    var WorkerCtor=settings.WorkerCtor;
    var workerUrl=settings.workerUrl||'src/animation/ModernAnimationFrameWorker.js?spline-export=1&spline-parity=1';
    var archiveUrl=settings.archiveUrl||'src/animation/ModernAnimationArchiveWorker.js?studio-hud-fix=1&target-indicator=1&spline-core=1&spline-parity=1';
    var active=null;
    function isBusy(){return !!active;}
    function cancel(){
      if(!active)return false;
      active.finish(null,{cancelled:true});
      return true;
    }
    function start(options){
      if(active)throw Error('PNG export is already running');
      if(typeof WorkerCtor!=='function')throw Error('Web Workers are unavailable in this browser');
      var plan=frameExport.plan(options.project,options);
      var count=countFor(options.workerCount,settings.hardwareConcurrency,plan.timesMs.length);
      return new Promise(function(resolve,reject){
        var workers=[],renderers=[],archive=null,done=false;
        var ready=0,archiveReady=false,running=false,nextIndex=0;
        function finish(error,result){
          if(done)return;
          done=true;
          if(active&&active.finish===finish)active=null;
          workers.forEach(function(worker){
            worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
            worker.terminate();
          });
          if(error)reject(error);else resolve(result);
        }
        active={finish:finish};
        function fail(message){finish(Error(message));}
        function wireErrors(worker,role){
          worker.onerror=function(event){
            if(event&&typeof event.preventDefault==='function')event.preventDefault();
            fail(role+' failed to load or execute. Check browser console and script paths.');
          };
          worker.onmessageerror=function(){fail(role+' sent an undecodable message');};
        }
        function dispatch(slot){
          if(done||nextIndex>=plan.timesMs.length)return;
          slot.index=nextIndex++;
          try{slot.worker.postMessage({type:'render',index:slot.index});}
          catch(error){finish(error);}
        }
        function launch(){
          if(done||running||!archiveReady||ready!==count)return;
          running=true;
          try{
            if(typeof options.onReady==='function')options.onReady({
              type:'ready',total:plan.timesMs.length,sides:plan.sides.length,workers:count});
            renderers.forEach(dispatch);
          }catch(error){finish(error);}
        }
        try{
          archive=new WorkerCtor(archiveUrl);workers.push(archive);
          wireErrors(archive,'PNG archive worker');
          archive.onmessage=function(event){
            if(done)return;
            var value=event&&event.data||{};
            if(value.type==='ready'){
              if(archiveReady||value.total!==plan.timesMs.length){
                fail('Archive worker returned an invalid ready message');return;
              }
              archiveReady=true;launch();
            }else if(value.type==='progress'){
              if(!Number.isInteger(value.completed)||value.completed<1||
                value.completed>plan.timesMs.length||value.total!==plan.timesMs.length){
                fail('Archive worker returned invalid PNG progress');return;
              }
              try{if(typeof options.onProgress==='function')
                options.onProgress(Object.assign({},value,{workers:count}));}
              catch(error){finish(error);}
            }else if(value.type==='packing'){
              try{if(typeof options.onPacking==='function')options.onPacking(value);}
              catch(error){finish(error);}
            }else if(value.type==='complete'){
              if(!value.blob||value.blob.type!=='application/zip'||!value.manifest||
                value.manifest.frameCount!==plan.timesMs.length||
                value.manifest.cameraInterpolation!==(plan.project.mode==='camera'?
                  (plan.project.interpolation||'linear'):null)||
                !Array.isArray(value.manifest.sides)||
                value.manifest.sides.join(',')!==plan.sides.join(','))
                fail('Archive worker returned an incomplete PNG sequence');
              else finish(null,{cancelled:false,blob:value.blob,manifest:value.manifest,
                workers:count});
            }else if(value.type==='error'){
              fail('PNG archive failed: '+String(value.message||'unknown error'));
            }
          };
          for(var i=0;i<count;i++){
            var worker=new WorkerCtor(workerUrl);workers.push(worker);
            var slot={worker:worker,index:null,ready:false};renderers.push(slot);
            wireErrors(worker,'PNG render worker');
            (function(current){
              worker.onmessage=function(event){
                if(done)return;
                var value=event&&event.data||{};
                if(value.type==='ready'){
                  if(current.ready||value.total!==plan.timesMs.length||
                    value.sides!==plan.sides.length){
                    fail('Renderer returned an invalid ready message');return;
                  }
                  if(plan.project.interpolation==='spline' &&
                    JSON.stringify(value.splineProof)!==JSON.stringify(projects.splineProof(plan.project))){
                    fail('PNG renderer Spline interpolation mismatch (stale Worker?). Reload the page and retry.');
                    return;
                  }
                  current.ready=true;ready++;launch();
                }else if(value.type==='frame'){
                  if(!running||current.index===null||value.index!==current.index||
                    !value.frame||!Array.isArray(value.frame.entries)||
                    value.frame.entries.length!==plan.sides.length){
                    fail('Renderer returned an unexpected PNG frame');return;
                  }
                  var transfer=[];
                  for(var j=0;j<value.frame.entries.length;j++){
                    var bytes=value.frame.entries[j].data;
                    if(!(bytes instanceof Uint8Array)){
                      fail('Renderer returned missing PNG data');return;
                    }
                    transfer.push(bytes.buffer);
                  }
                  try{
                    archive.postMessage({type:'frame',index:current.index,
                      frame:value.frame},transfer);
                    current.index=null;
                    dispatch(current);
                  }catch(error){finish(error);}
                }else if(value.type==='error'){
                  fail('Background render failed: '+String(value.message||'unknown error'));
                }
              };
            })(slot);
          }
          archive.postMessage({type:'init',project:plan.project,fps:plan.fps,
            width:plan.width,height:plan.height,workers:count,
            cameraHud:plan.cameraHud,cameraHudAppearance:plan.cameraHudAppearance,
            targetIndicator:plan.targetIndicator,targetSelection:plan.targetSelection});
          renderers.forEach(function(slot){slot.worker.postMessage({type:'init',
            project:plan.project,fps:plan.fps,width:plan.width,height:plan.height,
            cameraHud:plan.cameraHud,cameraHudAppearance:plan.cameraHudAppearance,
            targetIndicator:plan.targetIndicator,targetSelection:plan.targetSelection});});
        }catch(error){finish(error);}
      });
    }
    return Object.freeze({start:start,cancel:cancel,isBusy:isBusy});
  }
  return Object.freeze({create:create,countFor:countFor});
}));
