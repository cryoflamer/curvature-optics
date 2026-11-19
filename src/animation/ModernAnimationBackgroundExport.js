/* UI-thread coordinator for parallel, deterministic PNG frame export.
 * Render workers own optics and PNG encoding; the archive worker owns ZIP
 * checksums and assembly. Disk mode drains ordered chunks with backpressure.
 * Cancel terminates all workers and aborts uncommitted disk writes.
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
    var workerUrl=settings.workerUrl||'src/animation/ModernAnimationFrameWorker.js?spline-export=1&spline-parity=1&presentation-png=1&png-project-fields=1&png-stream=1&projection-fix=1&presentation-hud=1&adaptive-layout=1&topology=1&content-layout=1&guide-labels=1';
    var archiveUrl=settings.archiveUrl||'src/animation/ModernAnimationArchiveWorker.js?spline-parity=1&presentation-png=1&png-project-fields=1&png-stream=1&presentation-hud=1&adaptive-layout=1&topology=1&content-layout=1&guide-labels=1';
    var active=null;
    function isBusy(){return !!active;}
    function cancel(){
      if(!active||active.committing())return false;
      active.finish(null,{cancelled:true});
      return true;
    }
    function start(options){
      if(active)throw Error('PNG export is already running');
      if(typeof WorkerCtor!=='function')throw Error('Web Workers are unavailable in this browser');
      var revision=projects&&projects.FIELDS_REVISION;
      if(!revision)throw Error('PNG project fields revision unavailable. Reload the page and retry.');
      var sink=options.sink||null;
      if(sink&&['write','close','abort'].some(function(k){return typeof sink[k]!=='function';}))throw Error('Invalid PNG disk writer');
      if(sink&&options.previewTimeMs!==undefined)throw Error('PNG preview uses memory');
      var plan=frameExport.plan(options.project,Object.assign({},options,{streaming:!!sink}));
      var extra=plan.presentation?{presentation:{referenceLayout:plan.presentation.referenceLayout,layoutMode:plan.presentation.layoutMode,showNarrative:plan.presentation.showNarrative},referenceImages:plan.referenceImages,previewTimeMs:plan.previewTimeMs}:{};
      var outputSides=frameExport.outputSides(plan);
      var count=countFor(options.workerCount,settings.hardwareConcurrency,plan.timesMs.length);
      // Bound simultaneous decoded originals and UHD render surfaces.
      if(plan.presentation){var pixels=plan.referenceImages.reduce(function(max,r){return Math.max(max,r.original.width*r.original.height);},0);
        count=Math.min(count,Math.max(1,Math.floor(64000000/Math.max(1,pixels+3*plan.width*plan.height))));}

      return new Promise(function(resolve,reject){
        var workers=[],renderers=[],archive=null,done=false;
        var ready=0,archiveReady=false,running=false,nextIndex=0;
        var waiting=new Map(),written=0,writing=false,receiving=false,bytesWritten=0,committing=false;
        var startedAt=0;
        function stopWorkers(){
          workers.forEach(function(worker){
            worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
            worker.terminate();
          });workers.length=0;
        }
        function finish(error,result){
          if(done)return;
          done=true;
          waiting.clear();stopWorkers();
          function settle(){
            if(active&&active.finish===finish)active=null;
            if(error)reject(error);else resolve(result);
          }
          if(sink&&(error||result&&result.cancelled)){
            Promise.resolve().then(function(){return sink.abort();}).then(settle,function(abortError){
              error=Error((error?error.message:'PNG export cancelled')+'; disk abort failed: '+String(abortError&&abortError.message||abortError));settle();
            });
          }else settle();
        }
        active={finish:finish,committing:function(){return done||committing;}};
        function fail(message){finish(Error(message));}
        function wireErrors(worker,role){
          worker.onerror=function(event){
            if(event&&typeof event.preventDefault==='function')event.preventDefault();
            fail(role+' failed to load or execute. Check browser console and script paths.');
          };
          worker.onmessageerror=function(){fail(role+' sent an undecodable message');};
        }
        function dispatch(slot){
          if(done||slot.index!==null||nextIndex>=plan.timesMs.length||sink&&nextIndex>=written+count)return;
          slot.index=nextIndex++;
          try{slot.worker.postMessage({type:'render',index:slot.index});}
          catch(error){finish(error);}
        }
        function launch(){
          if(done||running||!archiveReady||ready!==count)return;
          running=true;startedAt=performance.now();
          try{
            if(typeof options.onReady==='function')options.onReady({
              type:'ready',total:plan.timesMs.length,sides:plan.sides.length,workers:count});
            renderers.forEach(dispatch);
          }catch(error){finish(error);}
        }
        function pump(){
          if(done||writing||!waiting.has(written))return;
          var frame=waiting.get(written);waiting.delete(written);writing=true;
          try{archive.postMessage({type:'frame',index:written,frame:frame},frame.entries.map(function(e){return e.data.buffer;}));}
          catch(error){finish(error);}
        }
        function validManifest(manifest){return manifest&&manifest.frameCount===plan.timesMs.length&&
          manifest.cameraInterpolation===(plan.project.mode==='camera'?(plan.project.interpolation||'linear'):null)&&
          Array.isArray(manifest.sides)&&manifest.sides.join(',')===outputSides.join(',');}
        async function writeChunk(value){
          if(!sink||!writing||receiving||value.index!==written||!Array.isArray(value.parts)||!value.parts.length||
            value.parts.some(function(part){return !(part instanceof Uint8Array);})||
            (written===plan.timesMs.length-1?!validManifest(value.manifest):!!value.manifest)){
            fail('Archive worker returned an invalid streaming PNG chunk');return;
          }
          receiving=true;
          try{
            for(var part of value.parts){if(done)return;await sink.write(part);bytesWritten+=part.byteLength;}
            if(done)return;
            written++;writing=false;receiving=false;
            if(typeof options.onProgress==='function')options.onProgress({type:'progress',completed:written,
              total:plan.timesMs.length,timeMs:plan.timesMs[written-1],elapsedMs:performance.now()-startedAt,
              workers:count,bytesWritten:bytesWritten,estimatedBytes:Math.round(bytesWritten/written*plan.timesMs.length)});
            if(done)return;
            if(value.manifest){
              if(typeof options.onPacking==='function')options.onPacking({type:'packing',total:written,streaming:true});
              if(done)return;
              committing=true;stopWorkers();await sink.close();
              finish(null,{cancelled:false,streamed:true,manifest:value.manifest,workers:count,bytesWritten:bytesWritten});
            }else{pump();renderers.forEach(dispatch);}
          }catch(error){finish(error);}
        }
        try{
          archive=new WorkerCtor(archiveUrl);workers.push(archive);
          wireErrors(archive,'PNG archive worker');
          archive.onmessage=function(event){
            if(done)return;
            var value=event&&event.data||{};
            if(value.type==='ready'){
              if(value.projectFieldsRevision!==revision){fail('PNG archive project fields revision mismatch (stale Worker scripts). Reload the page and retry.');return;}
              if(archiveReady||value.total!==plan.timesMs.length||sink&&value.streaming!==true){
                fail('Archive worker returned an invalid ready message');return;
              }
              archiveReady=true;launch();
            }else if(value.type==='chunk'){
              writeChunk(value);
            }else if(value.type==='progress'){
              if(sink){fail('Unexpected in-memory PNG progress');return;}
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
              if(sink||!value.blob||value.blob.type!=='application/zip'||!value.manifest||
                value.manifest.frameCount!==plan.timesMs.length||
                value.manifest.cameraInterpolation!==(plan.project.mode==='camera'?
                  (plan.project.interpolation||'linear'):null)||
                !Array.isArray(value.manifest.sides)||
                value.manifest.sides.join(',')!==outputSides.join(',')||
                (plan.previewTimeMs!==undefined&&(!value.previewBlob||value.previewBlob.type!=='image/png')))
                fail('Archive worker returned an incomplete PNG sequence');
              else finish(null,{cancelled:false,blob:value.blob,manifest:value.manifest,
                workers:count,previewBlob:value.previewBlob});
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
                  if(value.projectFieldsRevision!==revision){fail('PNG renderer project fields revision mismatch (stale Worker scripts). Reload the page and retry.');return;}
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
                    value.frame.entries.length!==outputSides.length){
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
                    if(sink){waiting.set(current.index,value.frame);current.index=null;pump();}
                    else{archive.postMessage({type:'frame',index:current.index,frame:value.frame},transfer);
                      current.index=null;dispatch(current);}
                  }catch(error){finish(error);}
                }else if(value.type==='error'){
                  fail('Background render failed: '+String(value.message||'unknown error'));
                }
              };
            })(slot);
          }
          archive.postMessage({type:'init',projectFieldsRevision:revision,project:plan.project,fps:plan.fps,
            width:plan.width,height:plan.height,workers:count,streaming:!!sink,
            cameraHud:plan.cameraHud,cameraHudAppearance:plan.cameraHudAppearance,
            targetIndicator:plan.targetIndicator,targetSelection:plan.targetSelection,...extra});
          renderers.forEach(function(slot){slot.worker.postMessage({type:'init',projectFieldsRevision:revision,
            project:plan.project,fps:plan.fps,width:plan.width,height:plan.height,streaming:!!sink,
            cameraHud:plan.cameraHud,cameraHudAppearance:plan.cameraHudAppearance,
            targetIndicator:plan.targetIndicator,targetSelection:plan.targetSelection,...extra});});
        }catch(error){finish(error);}
      });
    }
    return Object.freeze({start:start,cancel:cancel,isBusy:isBusy});
  }
  return Object.freeze({create:create,countFor:countFor});
}));
