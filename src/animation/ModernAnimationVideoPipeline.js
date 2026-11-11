/* Deterministic offline video timeline, opaque Accurate RK4 Canvas ->
 * transferable VideoFrame, and bounded ordered encoding handoff. PNG's
 * inclusive endpoint timeline remains independent and untouched.
 */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject;
  var png=root.CurvatureModernAnimationFrameExport;
  if(typeof module==='object'&&module.exports){
    projects=require('./ModernAnimationProject');
    png=require('./ModernAnimationFrameExport');
  }
  var target=root.CurvatureModernTargetIndicator;
  if(typeof module==='object'&&module.exports)target=require('../ui/modern/ModernTargetIndicator');
  var api=factory(projects,png,target);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationVideoPipeline=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,png,target){
  'use strict';
  var MAX_VIDEO_FRAMES=36000,MAX_PENDING=16;
  // Lightweight layout description shared by export planning and the Studio UI.
  // Bytes cover transferred RGBA VideoFrames only, not optics Canvas or codec memory.
  function outputLayout(mode,width,height,requestedLayout){
    if(!['scene','compare'].includes(mode)||!Number.isInteger(width)||width<=0||
      !Number.isInteger(height)||height<=0)
      throw RangeError('Invalid video output layout dimensions');
    var isCompare=mode==='compare';
    var layout=isCompare?(requestedLayout==null?'side-by-side':requestedLayout):null;
    if(layout!==null&&!['side-by-side','separate'].includes(layout))
      throw RangeError('Unsupported Compare video layout');
    if(!isCompare&&requestedLayout!=null)
      throw RangeError('Compare layout requires a Compare project');
    var combined=layout==='side-by-side';
    var streams=layout==='separate'?2:1;
    var outputWidth=width*(combined?2:1),outputHeight=height*(combined?2:1);
    return Object.freeze({compareLayout:layout,outputWidth:outputWidth,
      outputHeight:outputHeight,outputSides:Object.freeze(combined?['COMBINED']:
        isCompare?['A','B']:['A']),
      rawFrameBytes:outputWidth*outputHeight*4*streams});
  }
  function plan(project,options){
    var owned=projects.validate(project),settings=png.exportSettings(options);
    if(options&&options.cameraHud!==undefined&&typeof options.cameraHud!=='boolean')
      throw RangeError('Invalid camera HUD export setting');
    if(options&&options.targetIndicator!==undefined&&typeof options.targetIndicator!=='boolean')
      throw RangeError('Invalid target indicator export setting');
    if(options&&options.targetIndicator===true&&(!target||typeof target.paint!=='function'))
      throw Error('Target indicator painter unavailable');
    // Keep the optical views independent, but encode one presentation frame
    // per timestamp by default in Compare. 'separate' preserves the legacy
    // two-stream protocol when the user selects separate A/B output.
    var isCompare=owned.baseExperiment.display.mode==='compare';
    var layout=outputLayout(owned.baseExperiment.display.mode,settings.width,
      settings.height,options&&options.compareLayout);
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
      height:settings.height,cameraHud:!!(options&&options.cameraHud===true),
      cameraHudAppearance:png.resolveHudAppearance(owned,options),
      targetIndicator:!!(options&&options.targetIndicator===true),
      targetSelection:target?target.selection(options&&options.targetSelection):'scene',
      durationMs:totalMs,durationUs:durationUs,
      frameCount:count,sides:Object.freeze(isCompare?['A','B']:['A']),
      outputSides:layout.outputSides,
      outputWidth:layout.outputWidth,outputHeight:layout.outputHeight,
      compareLayout:layout.compareLayout,frames:Object.freeze(times)});
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
  async function renderTimestamp(p,index,render,FrameCtor,cancel,compose){
    if(!p||!Array.isArray(p.frames)||!Number.isInteger(index)||
      index<0||index>=p.frameCount||typeof render!=='function'||
      typeof FrameCtor!=='function')throw RangeError('Invalid video frame request');
    var timing=p.frames[index],result={index:index,timestampUs:timing.timestampUs,
      durationUs:timing.durationUs,sampleTimeMs:timing.sampleTimeMs,frames:{},stats:{}};
    var sources=p.compareLayout==='side-by-side'?{}:null;
    if(sources&&typeof compose!=='function')
      throw TypeError('Compare video composition callback required');
    try{
      if(cancel&&cancel.cancelled)return null;
      var sample=projects.sampleAt(p.project,timing.sampleTimeMs);
      for(var j=0;j<p.sides.length;j++){
        if(cancel&&cancel.cancelled){closeFrames(result);return null;}
        var side=p.sides[j],renderStarted=performance.now();
        var image=await render(sample,side,{width:p.width,height:p.height,index:index,
          timeMs:timing.sampleTimeMs,timestampUs:timing.timestampUs,durationUs:timing.durationUs});
        png.prepareCanvas(image,p.width,p.height,p.cameraHud,p.cameraHudAppearance,
          p.targetIndicator,p.targetSelection);
        // A standalone view gets its own VideoFrame. Compare instead retains
        // two independent source canvases until they are composed into one
        // presentation frame, then snapshots only that completed Canvas.
        if(sources)sources[side]=image;
        else result.frames[side]=new FrameCtor(image.canvas,{timestamp:timing.timestampUs,
          duration:timing.durationUs});
        // Per-side wall time includes painting and opaque compositing, plus
        // VideoFrame construction for the non-combined path. The optics timer
        // is an independent, nested diagnostic;
        // they must not be added to one another.
        var m=image.metrics||{},t=m.timings||{};
        result.stats[side]={renderMs:Math.max(0,performance.now()-renderStarted),
          opticsMs:Number.isFinite(t.opticsMs)&&t.opticsMs>=0?t.opticsMs:null,
          unresolved:Number.isFinite(m.unresolved)?m.unresolved:null,
          fillUnresolved:Number.isFinite(m.fillUnresolved)?m.fillUnresolved:null,
          budgetExceeded:!!m.budgetExceeded,cacheReused:!!m.cacheReused};
      }
      if(cancel&&cancel.cancelled){closeFrames(result);return null;}
      if(sources){
        var startComposition=performance.now();
        var canvas=compose(sources,{timeMs:timing.sampleTimeMs,
          durationMs:p.durationMs,animationMode:p.project.mode});
        if(!canvas||canvas.width!==p.outputWidth||canvas.height!==p.outputHeight)
          throw Error('Incorrect Compare video composition dimensions');
        result.frames.COMBINED=new FrameCtor(canvas,{timestamp:timing.timestampUs,
          duration:timing.durationUs});
        result.stats.compositionMs=Math.max(0,performance.now()-startComposition);
      }
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
    function buffered(){return pending.size;}
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
        !value.frames||Object.keys(value.frames).sort().join(',')!==p.outputSides.slice().sort().join(',')||
        p.outputSides.some(function(side){return !value.frames[side]||
          typeof value.frames[side].close!=='function';}))
        throw Error('Unexpected, duplicate or incomplete video frame');
      // Never block the missing head frame: it can release the entire queue.
      if(!available()&&value.index!==next)
        throw Error('Video reorder buffer full: apply backpressure');
      pending.set(value.index,value);
      return drain();
    }
    return Object.freeze({offer:offer,drain:drain,cancel:cancel,available:available,
      buffered:buffered,completed:completed,nextIndex:function(){return next;}});
  }
  return Object.freeze({plan:plan,outputLayout:outputLayout,renderTimestamp:renderTimestamp,
    closeFrames:closeFrames,orderedGate:orderedGate,MAX_VIDEO_FRAMES:MAX_VIDEO_FRAMES});
}));
