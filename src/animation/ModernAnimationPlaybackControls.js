/* Animation Studio playback control lifecycle.
 * Owns playhead actions and the single live RAF tick. The application owns
 * physical rendering, UI messages, draft persistence and the active player.
 * All player reads are live so a workspace switch cannot revive an old clock.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPlaybackControls=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function describe(status,renderedAt){
    return {seek:String(status.durationMs?
      Math.round(1000*status.positionMs/status.durationMs):0),
      time:(status.positionMs/1000).toFixed(2)+' / '+
        (status.durationMs/1000).toFixed(2)+' s'+
        (renderedAt!==null&&Math.abs(status.positionMs-renderedAt)>500?
          ' (image at '+(renderedAt/1000).toFixed(2)+'s)':''),
      playing:!!status.playing};
  }
  // Pace preview paints by their START times and a phase-preserving deadline.
  // From render completion, a 14 ms painter on 60 Hz drops to 30 FPS; from
  // last start alone, a 60 FPS target on 144 Hz can be stuck near 48 FPS.
  function previewFrameAllowed(targetFps,lastStart,nextDue,now,force){
    if(force||targetFps==='auto'||!Number.isFinite(lastStart)||
      !Number.isFinite(nextDue))return true;
    if(![10,15,30,60].includes(Number(targetFps)))throw RangeError('Invalid preview FPS');
    // RAF timestamps have small scheduling jitter around refresh boundaries.
    return now>=nextDue-1;
  }
  function nextPreviewDue(targetFps,lastStart,previousDue,now,force){
    if(targetFps==='auto')return now;
    var fps=Number(targetFps);
    if(![10,15,30,60].includes(fps))throw RangeError('Invalid preview FPS');
    var interval=1000/fps;
    // Forced redraws and frames delayed by more than one interval start a new
    // cadence; never produce a burst of obsolete catch-up frames.
    if(force||!Number.isFinite(lastStart)||!Number.isFinite(previousDue)||
      now-previousDue>interval)return now+interval;
    return previousDue+interval;
  }
  function createPreviewFpsMeter(){
    var starts=[];
    function reset(){starts=[];}
    function record(now){
      if(!Number.isFinite(now))return;
      if(starts.length&&now<=starts[starts.length-1])reset();
      starts.push(now);
      while(starts.length>2&&now-starts[0]>1000)starts.shift();
    }
    function fps(now){
      if(starts.length<4||now-starts[starts.length-1]>500)return null;
      var elapsed=starts[starts.length-1]-starts[0];
      return elapsed>0?1000*(starts.length-1)/elapsed:null;
    }
    return Object.freeze({record:record,fps:fps,reset:reset});
  }
  function create(options){
    if(!options||typeof options.player!=='function'||
       typeof options.now!=='function'||typeof options.open!=='function'||
       typeof options.mode!=='function'||typeof options.pending!=='function'||
       typeof options.requestFrame!=='function'||typeof options.cancelFrame!=='function'||
       typeof options.cancelInitial!=='function'||typeof options.render!=='function'||
       typeof options.sync!=='function'||typeof options.save!=='function'||
       typeof options.scheduleInitial!=='function'||typeof options.announce!=='function')
      throw TypeError('Animation playback controls require live player and UI callbacks');
    var frame=null,generation=0;
    function cancel(){
      generation++;
      if(frame!==null){options.cancelFrame(frame);frame=null;}
    }
    function halt(){
      cancel();
      var player=options.player();
      if(player)player.pause(options.now());
    }
    function schedule(){
      var player=options.player();
      if(frame===null&&player&&options.open()&&player.status().playing){
        var current=generation;
        frame=options.requestFrame(function(now){tick(now,current);});
      }
    }
    function tick(timestamp,expectedGeneration){
      if(expectedGeneration!==undefined&&expectedGeneration!==generation)return;
      frame=null;
      var player=options.player();
      if(!player||!options.open())return;
      try{
        if(!player.status().playing)return;
        var next=player.tick(Number.isFinite(timestamp)?timestamp:options.now());
        options.render(!next.playing);
        options.sync();
        // A render may replace the active player or stop playback. Never
        // schedule a frame for a clock that no longer owns this tick.
        if(player!==options.player()||
           (expectedGeneration!==undefined&&expectedGeneration!==generation))return;
        if(next.playing)schedule();
        options.save(!!next.playing);
        if(!next.playing)options.announce('Animation finished · live Scene / Compare unchanged.','success');
      }catch(error){
        halt();options.sync();
        options.announce('Playback failed: '+error.message,'error');
      }
    }
    function play(){
      var player=options.player();
      if(!player)throw Error('Prepare a compatible animation project first');
      options.cancelInitial();
      player.start(options.now());
      options.announce((options.mode()==='camera'?'Camera':'Physical')+
        ' animation playing in an independent optical viewport.','info');
      options.render(true);options.sync();options.save(false);
      schedule();
    }
    function pause(){halt();options.sync();options.save(false);options.announce('Paused.','info');}
    function stop(){
      halt();
      var player=options.player();
      if(player)player.stop();
      options.save(false);options.sync();options.scheduleInitial('first');
    }
    function seek(raw){
      var player=options.player();
      if(!player)return;
      player.seek(player.status().durationMs*Number(raw)/1000,options.now());
      options.cancelInitial();options.save(false);
      if(typeof options.invalidatePaint==='function')options.invalidatePaint();
      options.render(true);options.sync();
    }
    // Keyframe navigation is a paused, exact-time operation. Unlike slider
    // scrubbing, it cancels the live clock and uses the layout-aware paint path.
    function jumpTo(ms){
      var player=options.player();
      if(!player)return;
      if(!Number.isFinite(ms)||ms<0||ms>player.status().durationMs)
        throw RangeError('Invalid keyframe time');
      halt();options.cancelInitial();
      player.seek(ms,options.now());
      if(typeof options.invalidatePaint==='function')options.invalidatePaint();
      options.save(false);options.sync();options.scheduleInitial('keyframe');
    }
    function visibility(hidden){
      var player=options.player();
      if(hidden&&player){
        halt();options.sync();options.save(false);
        options.announce('Paused while the tab is hidden.','info');
      }else if(!hidden&&player&&options.open()&&options.pending()){
        options.scheduleInitial('visible');
      }
    }
    return Object.freeze({cancel:cancel,halt:halt,schedule:schedule,tick:tick,
      play:play,pause:pause,stop:stop,seek:seek,jumpTo:jumpTo,visibility:visibility,
      hasFrame:function(){return frame!==null;}});
  }
  return Object.freeze({create:create,describe:describe,
    previewFrameAllowed:previewFrameAllowed,nextPreviewDue:nextPreviewDue,
    createPreviewFpsMeter:createPreviewFpsMeter});
}));
