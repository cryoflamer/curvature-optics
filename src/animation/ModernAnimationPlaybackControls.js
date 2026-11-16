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
      time:(status.positionMs/1000).toFixed(1)+' / '+
        (status.durationMs/1000).toFixed(1)+' s'+
        (renderedAt!==null&&Math.abs(status.positionMs-renderedAt)>500?
          ' (image at '+(renderedAt/1000).toFixed(1)+'s)':''),
      playing:!!status.playing};
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
      play:play,pause:pause,stop:stop,seek:seek,visibility:visibility,
      hasFrame:function(){return frame!==null;}});
  }
  return Object.freeze({create:create,describe:describe});
}));
