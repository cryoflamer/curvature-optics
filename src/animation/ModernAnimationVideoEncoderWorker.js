/* Dedicated offline VP9/WebM or H.264/MP4 encoder and muxer. VideoFrames arrive transferred
 * from isolated Accurate RK4 render workers via a bounded controller window.
 * decode-order output is kept compressed; RGBA frames are closed immediately
 * after WebCodecs accepts them. Cancel terminates this entire worker.
 */
'use strict';
importScripts(
  '../ui/modern/ModernExperimentState.js',
  '../ui/modern/ModernExperimentFingerprint.js',
  '../camera/ModernCameraInterpolator.js',
  'ModernAnimationCompatibility.js',
  'ModernAnimationProject.js',
  'ModernAnimationFrameExport.js',
  'ModernAnimationVideoPipeline.js',
  'ModernAnimationVideoCapabilities.js',
  'ModernAnimationWebMMuxer.js',
  'ModernAnimationMP4Muxer.js'
);
var session=null,initializing=false,failed=false;
var MAX_ENCODER_QUEUE=3;
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
    self.postMessage({type:'muxing',total:current.plan.frameCount});
    await Promise.all(current.encoders.map(function(encoder){return encoder.flush();}));
    if(failed||session!==current)return;
    var files=current.plan.sides.map(function(side){
      return {side:side,blob:current.muxers[side].finish(),
        bytes:current.muxers[side].bytes()};
    });
    var p=current.plan,manifest={schema:'curvature-animation-'+current.format,version:1,
      projectId:p.project.id,projectName:p.project.name,animationMode:p.project.mode,
      physicalTarget:p.project.target,codec:current.codec,format:current.format,quality:'accurate',
      width:p.width,height:p.height,fps:p.fps,frameCount:p.frameCount,
      durationUs:p.durationUs,sides:p.sides.slice(),
      endSampleTimeMs:p.frames[p.frameCount-1].sampleTimeMs,
      bitrate:current.bitrate,renderWorkers:current.workers,
      elapsedMs:performance.now()-current.start};
    var blob,filename;
    if(files.length===1){blob=files[0].blob;filename='curvature-animation.'+current.format;}
    else{
      // One user gesture and one download for Compare A/B, not two potentially
      // blocked simultaneous browser downloads. ZIP is assembled in this Worker.
      var entries=[];
      for(var i=0;i<files.length;i++){
        entries.push({name:'curvature-animation-'+files[i].side+'.'+current.format,
          data:new Uint8Array(await files[i].blob.arrayBuffer())});
      }
      entries.push({name:'manifest.json',data:new TextEncoder().encode(
        JSON.stringify(manifest,null,2)+'\n')});
      blob=self.CurvatureModernAnimationFrameExport.zip(entries);
      filename='curvature-animation-'+current.format+'-compare.zip';
    }
    if(failed||session!==current)return;
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
    var format=data.format===undefined?'webm':data.format;
    if(format!=='webm'&&format!=='mp4')throw RangeError('Unsupported video format');
    var codec=format==='mp4'?'avc1.42E01F':'vp09.00.10.08';
    var multiplier=data.quality==='high'?2:data.quality==='standard'?1:null;
    if(multiplier===null)throw RangeError('Unsupported video quality preset');
    var bitrate=Math.round(Math.max(400000,Math.min(8000000,
      2500000*(plan.width*plan.height)/(960*540)*plan.fps/25*multiplier)));
    var config={codec:codec,width:plan.width,height:plan.height,
      framerate:plan.fps,bitrate:bitrate};
    if(format==='mp4')config.avc={format:'avc'};
    var supported=await VideoEncoder.isConfigSupported(config);
    if(!supported||!supported.supported)throw Error(codec+' WebCodecs configuration unavailable');
    var muxers={},encoders=[],durations=new Map();
    plan.frames.forEach(function(t){durations.set(t.timestampUs,t.durationUs);});
    plan.sides.forEach(function(side){
      muxers[side]=(format==='mp4'?self.CurvatureModernAnimationMP4Muxer:
        self.CurvatureModernAnimationWebMMuxer).create(plan);
      var encoder=new VideoEncoder({
        output:function(chunk,metadata){
          try{
            var duration=durations.get(chunk.timestamp);
            if(duration===undefined)throw Error('Unexpected encoded video timestamp');
            muxers[side].add(chunk,duration,metadata);
          }catch(error){fail(error);}
        },
        error:function(error){fail(error);}
      });
      encoder.configure(config);
      if(typeof encoder.addEventListener==='function')encoder.addEventListener('dequeue',onDequeue);
      encoders.push(encoder);
    });
    var gate=pipeline.orderedGate(plan,{
      capacity:8,
      canConsume:function(){
        return encoders.every(function(encoder){return encoder.encodeQueueSize<MAX_ENCODER_QUEUE;});
      },
      consume:function(bundle){
        plan.sides.forEach(function(side,i){
          encoders[i].encode(bundle.frames[side],{
            keyFrame:bundle.index%(plan.fps*2)===0});
        });
        self.postMessage({type:'progress',submitted:bundle.index+1,
          total:plan.frameCount,timeMs:bundle.sampleTimeMs,
          elapsedMs:performance.now()-session.start});
      }
    });
    session={plan:plan,workers:data.workers,gate:gate,encoders:encoders,
      muxers:muxers,bitrate:bitrate,format:format,codec:codec,
      finishing:false,start:performance.now()};
    self.postMessage({type:'ready',total:plan.frameCount,sides:plan.sides.length,
      workers:data.workers,codec:config.codec,format:format,bitrate:bitrate});
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
      session.gate.offer(data.frame);
      maybeFinish();
    }catch(error){
      // offer() rejects ownership on validation/capacity failure.
      self.CurvatureModernAnimationVideoPipeline.closeFrames(data.frame);
      fail(error);
    }
  }
};
