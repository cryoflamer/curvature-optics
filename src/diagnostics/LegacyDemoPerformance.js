/* Live draw-rate telemetry for isolated Legacy Demos.
 * Count GraphX3DX DrawFunc completions, not RAF callbacks or draw requests.
 */
(function(root){
  'use strict';
  function create(ports){
    if(!ports||!ports.graph||typeof ports.graph.Draw!=='function'||
       typeof ports.graph.DrawFunc!=='function'||typeof ports.now!=='function'||
       typeof ports.onUpdate!=='function'||typeof ports.setInterval!=='function'||
       typeof ports.clearInterval!=='function')
      throw new TypeError('Legacy FPS telemetry requires a graph and timing ports');
    var graph=ports.graph,originalDraw=graph.Draw,originalFunc=graph.DrawFunc;
    var draws=[],disposed=false,drew=false;
    var intervalId=null,windowMs=2000,windowStart=ports.now();
    graph.DrawFunc=function(){drew=true;return originalFunc.apply(this,arguments);};
    graph.Draw=function(){
      drew=false;
      try{return originalDraw.apply(this,arguments);}
      finally{if(drew)draws.push(ports.now());}
    };
    function reset(){
      draws=[];windowStart=ports.now();update();
    }
    function update(){
      if(disposed)return;
      var now=ports.now();
      if(now<windowStart){draws=[];windowStart=now;}
      while(draws.length&&draws[0]<now-windowMs)draws.shift();
      var elapsed=Math.min(windowMs,Math.max(1,now-windowStart));
      ports.onUpdate({drawFps:draws.length*1000/elapsed,
        drawCount:draws.length,playing:!!ports.isPlaying()});
    }
    intervalId=ports.setInterval(update,350);
    update();
    return {reset:reset,refresh:update,
      dispose:function(){
        if(disposed)return;
        disposed=true;ports.clearInterval(intervalId);
        graph.Draw=originalDraw;graph.DrawFunc=originalFunc;
      }};
  }
  root.CurvatureLegacyDemoPerformance={create:create};
  if(!root.document||!root.document.documentElement||
     !root.document.documentElement.hasAttribute('data-direct-demos-host')||
     !root.graph||!root.CurvatureLegacyDemosRuntime)return;
  var runtime=root.CurvatureLegacyDemosRuntime;
  // The parent can repair an older cached host; never install two wrappers.
  if(typeof runtime.performanceStatus==='function'&&runtime.performanceStatus().attached)return;
  var meter=create({graph:root.graph,now:function(){return root.performance.now();},
    setInterval:function(fn,ms){return root.setInterval(fn,ms);},
    clearInterval:function(id){return root.clearInterval(id);},
    isPlaying:function(){return !!root.Demos&&root.Demos.IsPlaying();},
    onUpdate:function(metrics){runtime.publishPerformance(metrics);}});
  if(!runtime.attachPerformance(meter)){meter.dispose();return;}
  root.addEventListener('pagehide',function(){meter.dispose();});
}(typeof window==='undefined'?globalThis:window));
