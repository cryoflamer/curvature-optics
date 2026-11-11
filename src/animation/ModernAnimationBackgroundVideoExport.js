/* Main-thread coordinator only; offline Accurate RK4 rendering happens in
 * independent workers, encoding/muxing in one additional worker. Dispatch is
 * credit-bounded by contiguous frames submitted to WebCodecs. A blocked first
 * timestamp therefore cannot accumulate unlimited later RGBA VideoFrames.
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
      if(!['standard','high'].includes(quality))throw RangeError('Invalid WebM quality preset');
      // At most 2 frames per renderer may be outstanding, up to eight total.
      // Each Compare slot contains A and B; the entire bundle gets one credit.
      var window=Math.min(8,count*2);
      return new Promise(function(resolve,reject){
        var workers=[],renderers=[],encoder=null,done=false,ready=0,
          encoderReady=false,running=false,next=0,submitted=0;
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
            slot.index=index;
            try{slot.worker.postMessage({type:'video-render',index:index});}
            catch(error){finish(error);return;}
          }
        }
        function launch(){
          if(done||running||!encoderReady||ready!==count)return;
          running=true;
          try{
            if(typeof options.onReady==='function')options.onReady({
              total:plan.frameCount,workers:count,sides:plan.sides.length});
            pump();
          }catch(error){finish(error);}
        }
        try{
          encoder=new WorkerCtor(encoderUrl);workers.push(encoder);
          wireErrors(encoder,'WebM encoder worker');
          encoder.onmessage=function(event){
            if(done)return;
            var value=event&&event.data||{};
            if(value.type==='ready'){
              if(encoderReady||value.total!==plan.frameCount||
                value.sides!==plan.sides.length||value.workers!==count){
                fail('WebM encoder returned invalid initialization');return;
              }
              encoderReady=true;launch();
            }else if(value.type==='progress'){
              if(!Number.isInteger(value.submitted)||value.submitted<=submitted||
                value.submitted>plan.frameCount||value.total!==plan.frameCount){
                fail('WebM encoder returned invalid sequential progress');return;
              }
              submitted=value.submitted;
              try{if(typeof options.onProgress==='function')options.onProgress(
                Object.assign({},value,{workers:count}));}
              catch(error){finish(error);return;}
              pump();
            }else if(value.type==='muxing'){
              try{if(typeof options.onMuxing==='function')options.onMuxing(value);}
              catch(error){finish(error);}
            }else if(value.type==='complete'){
              if(!value.blob||!value.manifest||
                value.manifest.frameCount!==plan.frameCount||
                value.manifest.durationUs!==plan.durationUs||
                !Array.isArray(value.manifest.sides)||
                value.manifest.sides.join(',')!==plan.sides.join(',')||
                value.blob.type!==(plan.sides.length===1?'video/webm':'application/zip')){
                fail('Encoder returned an incomplete WebM export');return;
              }
              finish(null,{cancelled:false,blob:value.blob,filename:value.filename,
                manifest:value.manifest,workers:count});
            }else if(value.type==='error')fail('WebM encoder failed: '+String(value.message||'unknown error'));
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
                    current.index=null;pump();
                  }catch(error){video.closeFrames(frame);finish(error);}
                }else if(value.type==='error'){
                  fail('Accurate RK4 video render failed: '+String(value.message||'unknown error'));
                }
              };
            })(slot);
          }
          encoder.postMessage({type:'init',project:plan.project,width:plan.width,
            height:plan.height,fps:plan.fps,workers:count,quality:quality});
          renderers.forEach(function(slot){slot.worker.postMessage({type:'video-init',
            project:plan.project,width:plan.width,height:plan.height,fps:plan.fps});});
        }catch(error){finish(error);}
      });
    }
    return Object.freeze({start:start,cancel:cancel,isBusy:isBusy});
  }
  return Object.freeze({create:create});
}));
