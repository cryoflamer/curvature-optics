/* Real WebCodecs capability discovery in a DEDICATED worker. Availability of
 * interfaces is not evidence of codec support: ask isConfigSupported for the
 * requested output. WebCodecs does not mux WebM/MP4 on its own.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationVideoCapabilities=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // H.264 level bounds (macroblocks per picture / per second). A fixed
  // 3.1 codec string cannot represent a 1920x1080 Compare presentation.
  // Require the smallest sufficient level; the browser still decides support.
  function h264Codec(width,height,fps){
    if(!Number.isInteger(width)||!Number.isInteger(height)||
      !Number.isFinite(fps)||width<=0||height<=0||fps<=0)
      throw RangeError('Invalid H.264 video dimensions');
    var blocks=Math.ceil(width/16)*Math.ceil(height/16),rate=blocks*fps;
    for(var levels of [
      {id:'1F',frame:3600,rate:108000},
      {id:'28',frame:8192,rate:245760},
      {id:'32',frame:22080,rate:589824},
      {id:'33',frame:36864,rate:983040}
    ]){
      if(blocks<=levels.frame&&rate<=levels.rate)return 'avc1.42E0'+levels.id;
    }
    throw RangeError('H.264 output resolution exceeds supported profile levels');
  }
  function configs(settings){
    settings=settings||{};
    var width=settings.width===undefined?960:settings.width;
    var height=settings.height===undefined?540:settings.height;
    var fps=settings.fps===undefined?25:settings.fps;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<320||
      height<180||width>3840||height>2160||![5,10,25,30].includes(fps))
      throw RangeError('Unsupported video capability probe dimensions or FPS');
    var base={width:width,height:height,bitrate:2500000,framerate:fps};
    return [
      {format:'webm',name:'VP9',config:Object.assign({codec:'vp09.00.10.08'},base)},
      {format:'mp4',name:'H.264',config:Object.assign({codec:h264Codec(width,height,fps),
        avc:{format:'avc'}},base)}
    ];
  }
  async function inspectWorker(runtime,settings){
    var variants=configs(settings),canvas2d=false;
    if(runtime&&typeof runtime.OffscreenCanvas==='function'){
      try{canvas2d=!!new runtime.OffscreenCanvas(2,2).getContext('2d');}
      catch(_error){canvas2d=false;}
    }
    var frame=!!(runtime&&typeof runtime.VideoFrame==='function');
    var encoder=!!(runtime&&runtime.VideoEncoder&&
      typeof runtime.VideoEncoder.isConfigSupported==='function');
    var results=[];
    for(var i=0;i<variants.length;i++){
      var item=variants[i],supported=false,reason=null;
      if(canvas2d&&frame&&encoder){
        try{
          var report=await runtime.VideoEncoder.isConfigSupported(item.config);
          supported=!!(report&&report.supported);
          if(!supported)reason='Codec configuration not supported';
        }catch(error){reason=String(error&&error.message||error);}
      }else reason='Dedicated worker requires OffscreenCanvas 2D, VideoFrame and VideoEncoder';
      results.push({format:item.format,codec:item.config.codec,
        supported:supported,reason:reason});
    }
    return {offscreenCanvas2d:canvas2d,videoFrame:frame,videoEncoder:encoder,
      codecs:results,containerMuxerInstalled:!!(runtime&&
        runtime.CurvatureModernAnimationWebMMuxer&&
        typeof runtime.CurvatureModernAnimationWebMMuxer.create==='function'),
      mp4MuxerInstalled:!!(runtime&&runtime.CurvatureModernAnimationMP4Muxer&&
        typeof runtime.CurvatureModernAnimationMP4Muxer.create==='function')};
  }
  function probe(settings){
    settings=settings||{};
    var WorkerCtor=settings.WorkerCtor===undefined?
      (typeof Worker!=='undefined'?Worker:null):settings.WorkerCtor;
    if(typeof WorkerCtor!=='function')
      return Promise.reject(Error('Dedicated Web Workers are unavailable'));
    var variants=configs(settings);
    return new Promise(function(resolve,reject){
      var worker,done=false,timer;
      function finish(error,result){
        if(done)return;
        done=true;
        if(timer!==undefined)clearTimeout(timer);
        if(worker){worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;
          worker.terminate();}
        if(error)reject(error);else resolve(result);
      }
      try{
        worker=new WorkerCtor(settings.workerUrl||'src/animation/ModernAnimationVideoProbeWorker.js');
        worker.onerror=function(event){
          if(event&&typeof event.preventDefault==='function')event.preventDefault();
          finish(Error('Video capability worker could not load or execute'));
        };
        worker.onmessageerror=function(){finish(Error('Invalid video capability response'));};
        worker.onmessage=function(event){
          var data=event&&event.data;
          if(!data||data.type!=='video-capabilities'||!data.report||
            !Array.isArray(data.report.codecs)||data.report.codecs.length!==variants.length){
            finish(Error('Invalid video capability response'));return;
          }
          finish(null,data.report);
        };
        timer=setTimeout(function(){finish(Error('Video capability worker timed out'));},10000);
        worker.postMessage({type:'probe',settings:{width:variants[0].config.width,
          height:variants[0].config.height,fps:variants[0].config.framerate}});
      }catch(error){finish(error);}
    });
  }
  return Object.freeze({configs:configs,h264Codec:h264Codec,inspectWorker:inspectWorker,probe:probe});
}));
