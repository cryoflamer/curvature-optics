/* Foundation for deterministic offline video: a video-specific timeline,
 * accurate opaque Canvas -> transferable VideoFrame, and a bounded ordered
 * handoff. No encoder, muxer or UI export is installed in this stage.
 * PNG's inclusive endpoint timeline remains untouched.
 */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject;
  var png=root.CurvatureModernAnimationFrameExport;
  if(typeof module==='object'&&module.exports){
    projects=require('./ModernAnimationProject');
    png=require('./ModernAnimationFrameExport');
  }
  var api=factory(projects,png);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationVideoPipeline=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,png){
  'use strict';
  var MAX_VIDEO_FRAMES=36000,MAX_PENDING=16;
  function plan(project,options){
    var owned=projects.validate(project),settings=png.exportSettings(options);
    var totalMs=projects.totalMs(owned),durationUs=Math.round(totalMs*1000);
    if(!Number.isSafeInteger(durationUs)||durationUs<=0)
      throw RangeError('Video animation must have positive finite duration');
    // Use the rounded microsecond duration for BOTH frame count and final
    // boundary; fractional-ms project inputs cannot produce zero-length tails.
    var count=Math.ceil(durationUs*settings.fps/1000000);
    if(count>MAX_VIDEO_FRAMES)throw RangeError('Video plan exceeds '+MAX_VIDEO_FRAMES+' frames');
    var times=[];
    for(var i=0;i<count;i++){
      // Round once at each boundary, so there is no accumulated 30-FPS drift.
      var timestampUs=Math.round(i*1000000/settings.fps);
      var nextUs=i===count-1?durationUs:Math.round((i+1)*1000000/settings.fps);
      if(timestampUs>=nextUs)throw RangeError('Video timing has a non-positive frame duration');
      // The final display interval is painted from the EXACT final physical
      // state, but displayed within the original duration (not an extra frame).
      var sampleTimeMs=(i===count-1 && count>1)?totalMs:timestampUs/1000;
      times.push(Object.freeze({index:i,timestampUs:timestampUs,
        durationUs:nextUs-timestampUs,sampleTimeMs:sampleTimeMs}));
    }
    return Object.freeze({project:owned,fps:settings.fps,width:settings.width,
      height:settings.height,durationMs:totalMs,durationUs:durationUs,
      frameCount:count,sides:Object.freeze(owned.baseExperiment.display.mode==='compare'?['A','B']:['A']),
      frames:Object.freeze(times)});
  }
  function closeFrames(result){
    if(!result||!result.frames)return;
    Object.keys(result.frames).forEach(function(side){
      var frame=result.frames[side];
      if(frame&&typeof frame.close==='function')frame.close();
    });
  }
  // FrameCtor is injectable for tests; normally a dedicated renderer worker
  // passes its own VideoFrame. PNG encoding is intentionally never invoked.
  async function renderTimestamp(p,index,render,FrameCtor,cancel){
    if(!p||!Array.isArray(p.frames)||!Number.isInteger(index)||
      index<0||index>=p.frameCount||typeof render!=='function'||
      typeof FrameCtor!=='function')throw RangeError('Invalid video frame request');
    var timing=p.frames[index],result={index:index,timestampUs:timing.timestampUs,
      durationUs:timing.durationUs,sampleTimeMs:timing.sampleTimeMs,frames:{},stats:{}};
    try{
      if(cancel&&cancel.cancelled)return null;
      var sample=projects.sampleAt(p.project,timing.sampleTimeMs);
      for(var j=0;j<p.sides.length;j++){
        if(cancel&&cancel.cancelled){closeFrames(result);return null;}
        var side=p.sides[j];
        var image=await render(sample,side,{width:p.width,height:p.height,index:index,
          timeMs:timing.sampleTimeMs,timestampUs:timing.timestampUs,durationUs:timing.durationUs});
        png.prepareCanvas(image,p.width,p.height);
        // A completed frame snapshots this worker's canvas; subsequent RK4
        // renders may safely reuse it after VideoFrame construction.
        result.frames[side]=new FrameCtor(image.canvas,{timestamp:timing.timestampUs,
          duration:timing.durationUs});
        if(image.metrics){
          // Raw optical diagnostics may contain large caches or uncloneable
          // references. Transfer only scalar telemetry with the VideoFrame.
          var m=image.metrics,t=m.timings||{};
          result.stats[side]={opticsMs:Number.isFinite(t.opticsMs)?t.opticsMs:null,
            unresolved:Number.isFinite(m.unresolved)?m.unresolved:null,
            fillUnresolved:Number.isFinite(m.fillUnresolved)?m.fillUnresolved:null,
            budgetExceeded:!!m.budgetExceeded,cacheReused:!!m.cacheReused};
        }
      }
      if(cancel&&cancel.cancelled){closeFrames(result);return null;}
      return result;
    }catch(error){closeFrames(result);throw error;}
  }
  // The receiver owns frames after offer(). The callback MUST enqueue each
  // frame synchronously (e.g. VideoEncoder.encode); the gate then closes it.
  // The controller must stop dispatching when capacity is zero: no unlimited
  // buffering of out-of-order RGBA frames or codec input is permitted.
  function orderedGate(p,options){
    options=options||{};
    if(!p||!Number.isInteger(p.frameCount)||!Array.isArray(p.frames)||
      typeof options.consume!=='function')throw TypeError('Ordered video consumer required');
    var capacity=options.capacity===undefined?8:options.capacity;
    if(!Number.isInteger(capacity)||capacity<1||capacity>MAX_PENDING)
      throw RangeError('Invalid video buffer capacity');
    var pending=new Map(),next=0,closed=false;
    function release(value){closeFrames(value);}
    function cancel(){
      if(closed)return;
      closed=true;pending.forEach(release);pending.clear();
    }
    function available(){return closed?0:capacity-pending.size;}
    function completed(){return !closed&&next===p.frameCount&&pending.size===0;}
    function drain(){
      if(closed)return {completed:next,total:p.frameCount,buffered:0,available:0};
      try{
        while(pending.has(next)){
          var current=pending.get(next);
          if(typeof options.canConsume==='function'&&!options.canConsume(current))break;
          pending.delete(next);
          try{options.consume(current);}finally{release(current);}
          next++;
        }
      }catch(error){cancel();throw error;}
      return {completed:next,total:p.frameCount,buffered:pending.size,
        available:available()};
    }
    function offer(value){
      if(closed)throw Error('Video frame buffer is closed');
      if(!value||!Number.isInteger(value.index)||value.index<next||
        value.index>=p.frameCount||pending.has(value.index)||
        value.timestampUs!==p.frames[value.index].timestampUs||
        value.durationUs!==p.frames[value.index].durationUs||
        !value.frames||Object.keys(value.frames).sort().join(',')!==p.sides.slice().sort().join(',')||
        p.sides.some(function(side){return !value.frames[side]||
          typeof value.frames[side].close!=='function';}))
        throw Error('Unexpected, duplicate or incomplete video frame');
      // Never block the missing head frame: it can release the entire queue.
      if(!available()&&value.index!==next)
        throw Error('Video reorder buffer full: apply backpressure');
      pending.set(value.index,value);
      return drain();
    }
    return Object.freeze({offer:offer,drain:drain,cancel:cancel,available:available,
      completed:completed,nextIndex:function(){return next;}});
  }
  return Object.freeze({plan:plan,renderTimestamp:renderTimestamp,
    closeFrames:closeFrames,orderedGate:orderedGate,MAX_VIDEO_FRAMES:MAX_VIDEO_FRAMES});
}));
