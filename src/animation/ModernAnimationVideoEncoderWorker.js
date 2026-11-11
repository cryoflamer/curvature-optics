/* Dedicated offline VP9/WebM or H.264/MP4 encoder and muxer. VideoFrames arrive transferred
 * from isolated Accurate RK4 render workers via a bounded controller window.
 * decode-order output is kept compressed; RGBA frames are closed immediately
 * after WebCodecs accepts them. Optional separate Compare archives use Blob-streamed CRC32,
 * avoiding copies of whole video files. Cancel terminates this worker.
 */
'use strict';
importScripts(
  '../ui/modern/ModernExperimentState.js',
  '../ui/modern/ModernCameraHud.js?studio-hud-fix=1&contrast=1',
  '../camera/ModernCameraTelemetry.js',
  '../ui/modern/ModernExperimentFingerprint.js',
  '../camera/ModernCameraInterpolator.js',
  'ModernAnimationCompatibility.js',
  'ModernAnimationProject.js?studio-hud-fix=1',
  'ModernAnimationCanvasHud.js?studio-hud-fix=1&contrast=1',
  'ModernAnimationFrameExport.js?studio-hud-fix=1',
  'ModernAnimationVideoPipeline.js?studio-hud-fix=1',
  'ModernAnimationVideoCapabilities.js',
  'ModernAnimationWebMMuxer.js',
  'ModernAnimationMP4Muxer.js',
  'ModernAnimationVideoArchive.js'
);
var session=null,initializing=false,failed=false;
var MAX_ENCODER_QUEUE=3;
// Wall-clock telemetry only. Worker timers, overlapped renderers and codec
// callbacks are NOT additive CPU-use measurements.
function mark(){return performance.now();}
function addTiming(target,ms){
  if(!Number.isFinite(ms)||ms<0)return;
  target.samples++;target.totalMs+=ms;target.maxMs=Math.max(target.maxMs,ms);
}
function metric(){return {samples:0,totalMs:0,maxMs:0};}
function summary(x){return {samples:x.samples,totalMs:x.totalMs,
  meanMs:x.samples?x.totalMs/x.samples:0,maxMs:x.maxMs};}
function reportProfile(s,flushMs,muxMs,zipMs){
  return {schema:'curvature-video-profile-v1',units:'ms',
    render:summary(s.profile.render),reportedOptics:summary(s.profile.optics),
    encoderHandoffWait:summary(s.profile.handoff),
    outOfOrderArrivals:s.profile.outOfOrderArrivals,
    codecOutputLatency:summary(s.profile.codecLatency),
    compareComposition:summary(s.profile.composition),
    codecActiveWallMs:s.profile.firstEncodeAt===null?0:
      Math.max(0,s.profile.lastOutputAt-s.profile.firstEncodeAt),
    finalize:{flushMs:flushMs,muxMs:muxMs,zipMs:zipMs},
    encoderWorkerElapsedMs:Math.max(0,mark()-s.start)};
}
function textError(error){return String(error&&error.message||error);}
function shutdown(){
  if(!session)return;
  session.gate.cancel();
  session.encoders.forEach(function(e){try{e.close();}catch(_error){}});
  session=null;
}
function fail(error){
  if(failed)return;
  failed=true;shutdown();
  self.postMessage({type:'error',message:textError(error)});
}
function onDequeue(){
  if(!session||failed)return;
  try{session.gate.drain();maybeFinish();}catch(error){fail(error);}
}
async function maybeFinish(){
  if(!session||failed||!session.gate.completed()||session.finishing)return;
  var current=session;
  current.finishing=true;
  try{
    self.postMessage({type:'muxing',total:current.plan.frameCount,
      encodedBytes:current.encodedBytes});
    var flushStarted=mark();
    await Promise.all(current.encoders.map(function(encoder){return encoder.flush();}));
    var flushMs=mark()-flushStarted;
    if(failed||session!==current)return;
    var muxStarted=mark();
    var files=current.plan.outputSides.map(function(side){
      return {side:side,blob:current.muxers[side].finish(),
        bytes:current.muxers[side].bytes()};
    });
    var muxMs=mark()-muxStarted,zipMs=0;
    var p=current.plan,manifest={schema:'curvature-animation-'+current.format,version:1,
      projectId:p.project.id,projectName:p.project.name,animationMode:p.project.mode,
      physicalTarget:p.project.target,codec:current.codec,format:current.format,quality:'accurate',
      width:p.outputWidth,height:p.outputHeight,viewWidth:p.width,viewHeight:p.height,
      compareLayout:p.compareLayout,fps:p.fps,frameCount:p.frameCount,
      durationUs:p.durationUs,sides:p.sides.slice(),outputStreams:p.outputSides.length,
      endSampleTimeMs:p.frames[p.frameCount-1].sampleTimeMs,
      bitrate:current.bitrate,renderWorkers:current.workers,
      frameWindow:current.frameWindow,
      peakBufferedFrames:current.peakBuffered,
      peakEncoderQueue:current.peakEncoderQueue,
      encodedBytes:current.encodedBytes,
      elapsedMs:performance.now()-current.start};
    if(p.cameraHud){
      manifest.cameraHudIncluded=true;
      manifest.cameraHudAppearance=p.cameraHudAppearance;
    }
    manifest.profiling=reportProfile(current,flushMs,muxMs,null);
    var blob,filename;
    if(files.length===1){blob=files[0].blob;filename='curvature-animation'+
      (p.compareLayout==='side-by-side'?'-compare':'')+'.'+current.format;}
    else{
      // Blobs remain immutable file parts. ZIP CRC is read in small stream
      // chunks; no full file.arrayBuffer() copies are made for Compare A/B.
      var entries=[];
      for(var i=0;i<files.length;i++){
        entries.push({name:'curvature-animation-'+files[i].side+'.'+current.format,
          data:files[i].blob});
      }
      entries.push({name:'manifest.json',data:new Blob([JSON.stringify(manifest,null,2)+'\n'])});
      var zipStarted=mark();
      blob=await self.CurvatureModernAnimationVideoArchive.pack(entries,{
        onEntry:function(info){self.postMessage({type:'packing',completed:info.completed,
          total:info.total});}
      });
      zipMs=mark()-zipStarted;
      filename='curvature-animation-'+current.format+'-compare.zip';
    }
    if(failed||session!==current)return;
    // Compare's in-ZIP manifest is a snapshot BEFORE packaging, so its ZIP
    // duration is null; the returned controller profile includes measured zipMs.
    manifest.profiling=reportProfile(current,flushMs,muxMs,zipMs);
    self.postMessage({type:'complete',blob:blob,filename:filename,manifest:manifest});
    shutdown();
  }catch(error){fail(error);}
}
async function init(data){
  if(session||initializing||failed)throw Error('Video encoder already initialized');
  initializing=true;
  try{
    if(typeof VideoEncoder!=='function'||typeof VideoFrame!=='function')
      throw Error('WebCodecs VideoEncoder/VideoFrame unavailable in dedicated Worker');
    var pipeline=self.CurvatureModernAnimationVideoPipeline;
    var plan=pipeline.plan(data.project,data);
    if(!Number.isInteger(data.workers)||data.workers<1||data.workers>4)
      throw RangeError('Invalid video render worker count');
    if(!Number.isInteger(data.frameWindow)||data.frameWindow<1||data.frameWindow>8)
      throw RangeError('Invalid bounded video frame window');
    var format=data.format===undefined?'webm':data.format;
    if(format!=='webm'&&format!=='mp4')throw RangeError('Unsupported video format');
    var codec=format==='mp4'?self.CurvatureModernAnimationVideoCapabilities.h264Codec(
      plan.outputWidth,plan.outputHeight,plan.fps):'vp09.00.10.08';
    var multiplier=data.quality==='high'?2:data.quality==='standard'?1:null;
    if(multiplier===null)throw RangeError('Unsupported video quality preset');
    var bitrate=Math.round(Math.max(400000,Math.min(
      plan.compareLayout==='side-by-side'?16000000:8000000,
      2500000*(plan.outputWidth*plan.outputHeight)/(960*540)*plan.fps/25*multiplier)));
    var config={codec:codec,width:plan.outputWidth,height:plan.outputHeight,
      framerate:plan.fps,bitrate:bitrate};
    if(format==='mp4')config.avc={format:'avc'};
    var supported=await VideoEncoder.isConfigSupported(config);
    if(!supported||!supported.supported)throw Error(codec+' WebCodecs configuration unavailable at '+
      plan.outputWidth+'×'+plan.outputHeight);
    var muxers={},encoders=[],durations=new Map(),encodedBytes=0;
    var profiling={render:metric(),optics:metric(),composition:metric(),handoff:metric(),
      codecLatency:metric(),outOfOrderArrivals:0,firstEncodeAt:null,
      lastOutputAt:0};
    var encodedAtBySide={};
    plan.frames.forEach(function(t){durations.set(t.timestampUs,t.durationUs);});
    var muxPlan=Object.assign({},plan,{width:plan.outputWidth,height:plan.outputHeight});
    plan.outputSides.forEach(function(side){
      encodedAtBySide[side]=new Map();
      muxers[side]=(format==='mp4'?self.CurvatureModernAnimationMP4Muxer:
        self.CurvatureModernAnimationWebMMuxer).create(muxPlan);
      var encoder=new VideoEncoder({
        output:function(chunk,metadata){
          try{
            var finishedAt=mark(),queuedAt=encodedAtBySide[side].get(chunk.timestamp);
            if(queuedAt!==undefined){
              addTiming(profiling.codecLatency,finishedAt-queuedAt);
              encodedAtBySide[side].delete(chunk.timestamp);
            }
            profiling.lastOutputAt=Math.max(profiling.lastOutputAt,finishedAt);
            var duration=durations.get(chunk.timestamp);
            if(duration===undefined)throw Error('Unexpected encoded video timestamp');
            // Check combined Compare size before copying more encoded output.
            if(encodedBytes+chunk.byteLength>
              self.CurvatureModernAnimationVideoArchive.MAX_ARCHIVE_BYTES)
              throw RangeError('Video output exceeds 192 MiB total; reduce bitrate or duration');
            muxers[side].add(chunk,duration,metadata);
            encodedBytes+=chunk.byteLength;
            if(session)session.encodedBytes=encodedBytes;
          }catch(error){fail(error);}
        },
        error:function(error){fail(error);}
      });
      encoder.configure(config);
      if(typeof encoder.addEventListener==='function')encoder.addEventListener('dequeue',onDequeue);
      encoders.push(encoder);
    });
    var gate=pipeline.orderedGate(plan,{
      capacity:data.frameWindow,
      canConsume:function(){
        return encoders.every(function(encoder){return encoder.encodeQueueSize<MAX_ENCODER_QUEUE;});
      },
      consume:function(bundle){
        var enqueuedAt=mark();
        addTiming(profiling.handoff,enqueuedAt-bundle.profileReceivedAt);
        plan.outputSides.forEach(function(side,i){
          encodedAtBySide[side].set(bundle.timestampUs,enqueuedAt);
          if(profiling.firstEncodeAt===null)profiling.firstEncodeAt=enqueuedAt;
          encoders[i].encode(bundle.frames[side],{
            keyFrame:bundle.index%(plan.fps*2)===0});
        });
        plan.sides.forEach(function(side){
          var metrics=bundle.stats&&bundle.stats[side];
          if(metrics){
            addTiming(profiling.render,metrics.renderMs);
            addTiming(profiling.optics,metrics.opticsMs);
          }
        });
        if(bundle.stats)addTiming(profiling.composition,bundle.stats.compositionMs);
        var queued=Math.max.apply(null,encoders.map(function(e){return e.encodeQueueSize;}));
        session.peakEncoderQueue=Math.max(session.peakEncoderQueue,queued);
        self.postMessage({type:'progress',submitted:bundle.index+1,
          rendered:session.received,buffered:session.gate.buffered(),
          encodedBytes:session.encodedBytes,encodeQueue:queued,
          total:plan.frameCount,timeMs:bundle.sampleTimeMs,
          elapsedMs:performance.now()-session.start});
      }
    });
    session={plan:plan,workers:data.workers,gate:gate,encoders:encoders,
      muxers:muxers,bitrate:bitrate,format:format,codec:codec,
      frameWindow:data.frameWindow,received:0,peakBuffered:0,
      peakEncoderQueue:0,encodedBytes:0,profile:profiling,
      finishing:false,start:mark()};
    self.postMessage({type:'ready',total:plan.frameCount,sides:plan.sides.length,
      outputStreams:plan.outputSides.length,outputWidth:plan.outputWidth,
      outputHeight:plan.outputHeight,workers:data.workers,
      codec:config.codec,format:format,bitrate:bitrate});
  }finally{initializing=false;}
}
self.onmessage=function(event){
  var data=event&&event.data;
  if(!data||failed)return;
  if(data.type==='init'){
    init(data).catch(fail);return;
  }
  if(data.type==='frame'){
    if(!session||initializing){
      self.CurvatureModernAnimationVideoPipeline.closeFrames(data.frame);
      fail(Error('Video encoder received frames before initialization'));return;
    }
    try{
      // Count arrivals before drain invokes consume(), which synchronously
      // reports encoded-submission progress to the controller.
      session.received++;
      if(data.frame&&data.frame.index!==session.gate.nextIndex())
        session.profile.outOfOrderArrivals++;
      if(data.frame)data.frame.profileReceivedAt=mark();
      var state=session.gate.offer(data.frame);
      session.peakBuffered=Math.max(session.peakBuffered,state.buffered);
      maybeFinish();
    }catch(error){
      // offer() rejects ownership on validation/capacity failure.
      self.CurvatureModernAnimationVideoPipeline.closeFrames(data.frame);
      fail(error);
    }
  }
};
