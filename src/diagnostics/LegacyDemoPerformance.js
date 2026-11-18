/* Isolated Legacy Demos frame metrics. Counts actual GraphX3DX DrawFunc calls,
 * not animation timers or RAF requests. Does not alter authored scene code. */
(function(root){
  'use strict';
  function summary(values){
    if(!values.length)return {count:0,p50:null,p95:null,max:null};
    var sorted=values.slice().sort(function(a,b){return a-b;});
    return {count:sorted.length,p50:sorted[Math.ceil(sorted.length*0.5)-1],
      p95:sorted[Math.ceil(sorted.length*0.95)-1],max:sorted[sorted.length-1]};
  }
  function create(ports){
    if(!ports||!ports.graph||typeof ports.graph.Draw!=='function'||
       typeof ports.graph.DrawFunc!=='function'||typeof ports.now!=='function'||
       typeof ports.onUpdate!=='function'||typeof ports.onComplete!=='function')
      throw new TypeError('Legacy performance requires a graph and timing ports');
    var graph=ports.graph,originalDraw=graph.Draw,originalFunc=graph.DrawFunc;
    var draws=[],rafGaps=[],lastDraw=null,lastRaf=null,rafId=null,intervalId=null,
      finishTimer=null,benchmark=null,disposed=false,drew=false;
    var liveWindowMs=2000,lifetimeStart=ports.now();
    function dimensions(){
      var canvas=graph.Canvas;
      if(!canvas)return null;
      var rect=typeof canvas.getBoundingClientRect==='function'?canvas.getBoundingClientRect():{};
      return {width:canvas.width,height:canvas.height,
        cssWidth:rect.width||canvas.clientWidth||null,
        cssHeight:rect.height||canvas.clientHeight||null};
    }
    graph.DrawFunc=function(){drew=true;return originalFunc.apply(this,arguments);};
    graph.Draw=function(){
      var started=ports.now();drew=false;
      try{return originalDraw.apply(this,arguments);}
      finally{
        // GraphX3DX may defer/skip Draw(). Only count calls reaching DrawFunc.
        if(drew){
          var at=ports.now(),prev=lastDraw;
          var item={at:at,gap:prev===null?null:at-prev,cpu:at-started};
          lastDraw=at;draws.push(item);
          if(benchmark)benchmark.draws.push({atMs:at-benchmark.startedAt,
            gap:benchmark.lastDraw===null?null:at-benchmark.lastDraw,cpu:item.cpu});
          if(benchmark)benchmark.lastDraw=at;
        }
      }
    };
    function active(){return !!benchmark||!!ports.isPlaying();}
    function rafTick(stamp){
      rafId=null;
      if(disposed||!active())return;
      if(lastRaf!==null&&stamp>=lastRaf){
        var gap=stamp-lastRaf;
        rafGaps.push({at:ports.now(),gap:gap});
        if(benchmark)benchmark.rafGaps.push(gap);
      }
      lastRaf=stamp;
      rafId=ports.raf(rafTick);
    }
    function update(){
      if(disposed)return;
      var now=ports.now();
      while(draws.length&&draws[0].at<now-liveWindowMs)draws.shift();
      while(rafGaps.length&&rafGaps[0].at<now-liveWindowMs)rafGaps.shift();
      if(active()){
        if(rafId===null){lastRaf=null;rafId=ports.raf(rafTick);}
      }else if(rafId!==null){ports.cancelRaf(rafId);rafId=null;lastRaf=null;}
      // Count actual draws per wall-clock interval, including scripted pauses.
      // Never extrapolate a small burst over long periods of inactivity.
      var observed=Math.min(liveWindowMs,Math.max(1,now-lifetimeStart));
      var fps=draws.length*1000/observed;
      ports.onUpdate({drawFps:fps,drawCount:draws.length,
        drawGapMs:summary(draws.map(function(x){return x.gap;}).filter(function(x){return x!==null&&x<=liveWindowMs;})),
        drawCpuMs:summary(draws.map(function(x){return x.cpu;})),
        rafGapMs:summary(rafGaps.map(function(x){return x.gap;})),
        playing:!!ports.isPlaying(),benchmarking:!!benchmark});
    }
    function finish(){
      if(!benchmark)return null;
      var b=benchmark;benchmark=null;
      if(finishTimer!==null){ports.clearTimeout(finishTimer);finishTimer=null;}
      var elapsed=ports.now()-b.startedAt;
      var report={schema:'curvature-legacy-demo-benchmark/1',
        createdAt:new Date().toISOString(),environment:Object.assign({},b.environment,
          {endPlaying:!!ports.isPlaying(),canvasEnd:dimensions()}),
        elapsedMs:elapsed,drawCount:b.draws.length,
        drawFps:elapsed>0?b.draws.length*1000/elapsed:0,
        statistics:{drawGapMs:summary(b.draws.map(function(x){return x.gap;}).filter(function(x){return x!==null;})),
          drawCpuMs:summary(b.draws.map(function(x){return x.cpu;})),
          rafGapMs:summary(b.rafGaps)},
        samples:{draws:b.draws,rafGaps:b.rafGaps}};
      ports.onComplete(report);update();return report;
    }
    function start(durationMs){
      if(disposed||benchmark)return false;
      var duration=Number.isFinite(durationMs)?Math.max(1000,Math.min(60000,durationMs)):10000;
      benchmark={startedAt:ports.now(),lastDraw:null,draws:[],rafGaps:[],
        environment:Object.assign({},ports.metadata?ports.metadata():{},
          {canvasStart:dimensions(),devicePixelRatio:ports.devicePixelRatio?ports.devicePixelRatio():1,
            durationMs:duration,startPlaying:!!ports.isPlaying()})};
      finishTimer=ports.setTimeout(finish,duration);
      update();return true;
    }
    function cancel(){
      if(!benchmark)return false;
      benchmark=null;
      if(finishTimer!==null){ports.clearTimeout(finishTimer);finishTimer=null;}
      update();return true;
    }
    intervalId=ports.setInterval(update,350);
    update();
    return {start:start,cancel:cancel,refresh:update,running:function(){return !!benchmark;},
      reset:function(){draws=[];rafGaps=[];lastDraw=null;lastRaf=null;lifetimeStart=ports.now();update();},
      dispose:function(){
        if(disposed)return;
        cancel();disposed=true;
        ports.clearInterval(intervalId);
        if(rafId!==null)ports.cancelRaf(rafId);
        graph.Draw=originalDraw;graph.DrawFunc=originalFunc;
      }};
  }
  root.CurvatureLegacyDemoPerformance={create:create,summary:summary};
  if(!root.document||!root.document.documentElement||
     !root.document.documentElement.hasAttribute('data-direct-demos-host')||
     !root.graph||!root.CurvatureLegacyDemosRuntime)return;
  var runtime=root.CurvatureLegacyDemosRuntime;
  // The parent may retry loading this same host-local script if an old cached
  // iframe omitted it. Never wrap GraphX3DX twice.
  if(typeof runtime.performanceStatus==='function'&&runtime.performanceStatus().attached)return;
  var meter=create({graph:root.graph,now:function(){return root.performance.now();},
    raf:function(fn){return root.requestAnimationFrame(fn);},
    cancelRaf:function(id){root.cancelAnimationFrame(id);},
    setInterval:function(fn,ms){return root.setInterval(fn,ms);},
    clearInterval:function(id){root.clearInterval(id);},
    setTimeout:function(fn,ms){return root.setTimeout(fn,ms);},
    clearTimeout:function(id){root.clearTimeout(id);},
    isPlaying:function(){return !!root.Demos&&root.Demos.IsPlaying();},
    devicePixelRatio:function(){return root.devicePixelRatio||1;},
    metadata:function(){return {demo:root.Demos&&root.Demos.CurrDemo?root.Demos.CurrDemo.Name:null,
      position:root.Demos&&root.Demos.GetCurrPos?root.Demos.GetCurrPos():null,
      userAgent:root.navigator&&root.navigator.userAgent||null};},
    onUpdate:function(metrics){runtime.publishPerformance(metrics);},
    onComplete:function(report){runtime.publishPerformanceReport(report);}});
  if(!runtime.attachPerformance(meter)){
    meter.dispose();
    return;
  }
  root.addEventListener('pagehide',function(){meter.dispose();});
}(typeof window==='undefined'?globalThis:window));
