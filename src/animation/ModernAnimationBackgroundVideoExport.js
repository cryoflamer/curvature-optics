/* Main-thread coordinator for offline Accurate RK4 video. Scheduling is
 * credit-bounded by actual RGBA frame size (including Compare A/B), not just
 * a fixed number of frames. The encoder owns the same bounded reorder window
 * and runs asynchronously in its own Worker.
 */
(function(root,factory){
  var video=root.CurvatureModernAnimationVideoPipeline;
  var pngBackground=root.CurvatureModernAnimationBackgroundExport;
  if(typeof module==='object'&&module.exports){
    video=require('./ModernAnimationVideoPipeline');
    pngBackground=require('./ModernAnimationBackgroundExport');
  }
  var api=factory(video,pngBackground);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationBackgroundVideoExport=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(video,pngBackground){
  'use strict';
  var MAX_INFLIGHT_RGBA_BYTES=32*1024*1024;
  function frameWindow(plan,count){
    var frameBytes=plan.width*plan.height*4*plan.sides.length;
    return Math.min(8,count*2,Math.max(1,
      Math.floor(MAX_INFLIGHT_RGBA_BYTES/frameBytes)));
  }
  function create(settings){
    settings=settings||{};
    var WorkerCtor=settings.WorkerCtor;
    var rendererUrl=settings.rendererUrl||'src/animation/ModernAnimationFrameWorker.js';
    var encoderUrl=settings.encoderUrl||'src/animation/ModernAnimationVideoEncoderWorker.js';
    var active=null;
    function cancel(){
      if(!active)return false;
      active.finish(null,{cancelled:true});return true;
    }
    function isBusy(){return !!active;}
    function start(options){
      options=options||{};
      if(active)throw Error('Video export is already running');
      if(typeof WorkerCtor!=='function')throw Error('Web Workers unavailable for video export');
      var plan=video.plan(options.project,options);
      var count=pngBackground.countFor(options.workerCount,
        settings.hardwareConcurrency,plan.frameCount);
      var quality=options.quality===undefined?'standard':options.quality;
      var format=options.format===undefined?'webm':options.format;
      if(!['webm','mp4'].includes(format))throw RangeError('Invalid video export format');
      if(!['standard','high'].includes(quality))throw RangeError('Invalid video bitrate preset');
      // A Compare bundle counts both views. At 1280x720, four A/B frames
      // already represent ~28 MiB of RGBA before codec internals.
      var window=frameWindow(plan,count);
      return new Promise(function(resolve,reject){
        var workers=[],renderers=[],encoder=null,done=false,ready=0,
          encoderReady=false,running=false,next=0,submitted=0,rendered=0,peakInflight=0;
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
        function fail(reason){finish(reason instanceof Error?reason:Error(String(reason)));}
        function wireErrors(worker,label){
          worker.onerror=function(event){
            if(event&&typeof event.preventDefault==='function')event.preventDefault();
            fail(label+' could not load or execute. Check browser console and script paths.');
          };
          worker.onmessageerror=function(){fail(label+' sent an undecodable message');};
        }
        function pump(){
          if(done||!running)return;
          for(var i=0;i<renderers.length;i++){
            var slot=renderers[i];
            if(slot.index!==null||next>=plan.frameCount||next-submitted>=window)continue;
            var index=next++;
            slot.index=index;peakInflight=Math.max(peakInflight,next-submitted);
            try{slot.worker.postMessage({type:'video-render',index:index});}
            catch(error){finish(error);return;}
          }
        }
        function launch(){
          if(done||running||!encoderReady||ready!==count)return;
          running=true;
          try{
            if(typeof options.onReady==='function')options.onReady({
              total:plan.frameCount,workers:count,sides:plan.sides.length,
              frameWindow:window,rawFrameMiB:Math.round(plan.width*plan.height*4*plan.sides.length/1048576*10)/10});
            pump();
          }catch(error){finish(error);}
        }
        try{
          encoder=new WorkerCtor(encoderUrl);workers.push(encoder);
          wireErrors(encoder,'Video encoder worker');
          encoder.onmessage=function(event){
            if(done)return;
            var value=event&&event.data||{};
            if(value.type==='ready'){
              if(encoderReady||value.total!==plan.frameCount||
                value.sides!==plan.sides.length||value.workers!==count){
                fail('Video encoder returned invalid initialization');return;
              }
              encoderReady=true;launch();
            }else if(value.type==='progress'){
              if(!Number.isInteger(value.submitted)||value.submitted<=submitted||
                value.submitted>plan.frameCount||value.total!==plan.frameCount){
                fail('Video encoder returned invalid sequential progress');return;
              }
              submitted=value.submitted;
              if(!Number.isInteger(value.rendered)||value.rendered<submitted||
                value.rendered>plan.frameCount||!Number.isInteger(value.buffered)||
                value.buffered<0||value.buffered>window||
                !Number.isFinite(value.encodedBytes)||value.encodedBytes<0||
                !Number.isInteger(value.encodeQueue)||value.encodeQueue<0){
                fail('Video encoder returned invalid throughput telemetry');return;
              }
              try{if(typeof options.onProgress==='function')options.onProgress(
                Object.assign({},value,{workers:count,frameWindow:window,
                  peakInflightFrames:peakInflight}));}
              catch(error){finish(error);return;}
              pump();
            }else if(value.type==='muxing'){
              try{if(typeof options.onMuxing==='function')options.onMuxing(value);}
              catch(error){finish(error);}
            }else if(value.type==='packing'){
              try{if(typeof options.onPacking==='function')options.onPacking(value);}
              catch(error){finish(error);}
            }else if(value.type==='complete'){
              if(!value.blob||!value.manifest||
                value.manifest.frameCount!==plan.frameCount||
                value.manifest.durationUs!==plan.durationUs||
                !Array.isArray(value.manifest.sides)||
                value.manifest.sides.join(',')!==plan.sides.join(',')||
                value.blob.type!==(plan.sides.length===1?'video/'+format:'application/zip')||
                value.manifest.format!==format||
                !Number.isInteger(value.manifest.frameWindow)||
                value.manifest.frameWindow!==window||
                !Number.isInteger(value.manifest.peakBufferedFrames)||
                value.manifest.peakBufferedFrames<0||
                value.manifest.peakBufferedFrames>window){
                fail('Encoder returned an incomplete video export');return;
              }
              finish(null,{cancelled:false,blob:value.blob,filename:value.filename,
                manifest:value.manifest,peakInflightFrames:peakInflight,
                workers:count});
            }else if(value.type==='error')fail('Video encoder failed: '+String(value.message||'unknown error'));
          };
          for(var i=0;i<count;i++){
            var worker=new WorkerCtor(rendererUrl);
            var slot={worker:worker,index:null,ready:false};
            workers.push(worker);renderers.push(slot);
            wireErrors(worker,'Video render worker');
            (function(current){
              worker.onmessage=function(event){
                if(done)return;
                var value=event&&event.data||{};
                if(value.type==='ready'){
                  if(current.ready||value.total!==plan.frameCount||
                    value.sides!==plan.sides.length){
                    fail('Video renderer returned invalid initialization');return;
                  }
                  current.ready=true;ready++;launch();
                }else if(value.type==='video-frame'){
                  var frame=value.frame;
                  if(!running||current.index===null||value.index!==current.index||
                    !frame||frame.index!==current.index||!frame.frames||
                    plan.sides.some(function(side){return !frame.frames[side];})){
                    video.closeFrames(frame);
                    fail('Video renderer returned unexpected frame bundle');return;
                  }
                  try{
                    encoder.postMessage({type:'frame',frame:frame},
                      plan.sides.map(function(side){return frame.frames[side];}));
                    current.index=null;rendered++;
                  }catch(error){
                    try{video.closeFrames(frame);}catch(_closeError){}
                    finish(error);return;
                  }
                  try{
                    if(typeof options.onRendered==='function')options.onRendered({
                      rendered:rendered,total:plan.frameCount,workers:count,
                      frameWindow:window});
                    pump();
                  }catch(error){finish(error);}
                }else if(value.type==='error'){
                  fail('Accurate RK4 video render failed: '+String(value.message||'unknown error'));
                }
              };
            })(slot);
          }
          encoder.postMessage({type:'init',project:plan.project,width:plan.width,
            height:plan.height,fps:plan.fps,workers:count,quality:quality,format:format,
            frameWindow:window});
          renderers.forEach(function(slot){slot.worker.postMessage({type:'video-init',
            project:plan.project,width:plan.width,height:plan.height,fps:plan.fps});});
        }catch(error){finish(error);}
      });
    }
    return Object.freeze({start:start,cancel:cancel,isBusy:isBusy});
  }
  return Object.freeze({create:create,frameWindow:frameWindow,
    MAX_INFLIGHT_RGBA_BYTES:MAX_INFLIGHT_RGBA_BYTES});
}));
