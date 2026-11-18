/* Opt-in diagnosis of Canvas Direct's real Animation Studio render path.
 * Counts input handlers and synchronous render calls separately from RAF
 * callbacks. None of these counters claims that a frame reached the display.
 * The automatic sweep invokes the same seek handler as manual input.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationFrameTiming=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function quantile(values,fraction){
    var sorted=values.filter(Number.isFinite).sort(function(a,b){return a-b;});
    return sorted.length?sorted[Math.ceil(sorted.length*fraction)-1]:null;
  }
  function distribution(values){
    return {count:values.filter(Number.isFinite).length,
      p50:quantile(values,.5),p95:quantile(values,.95),p99:quantile(values,.99)};
  }
  function summarize(inputs,renders,ticks){
    var groups={};
    ['manual','auto','playback'].forEach(function(source){
      var a=inputs.filter(function(e){return e.source===source;});
      var b=renders.filter(function(e){return e.source===source;});
      var painted=b.filter(function(e){return e.painted;});
      function gaps(items,key){return items.slice(1).map(function(e,i){return e[key]-items[i][key];});}
      groups[source]={inputs:a.length,renderCalls:b.length,paints:painted.length,
        skipped:b.filter(function(e){return !e.painted&&!e.error;}).length,
        errors:b.filter(function(e){return !!e.error;}).length,
        inputGapMs:distribution(gaps(a,'atMs')),
        paintStartGapMs:distribution(gaps(painted,'atMs')),
        renderCpuMs:distribution(b.map(function(e){return e.cpuMs;})),
        inputToRenderStartMs:distribution(b.map(function(e){return e.inputToStartMs;})),
        inputToRenderEndMs:distribution(b.map(function(e){return e.inputToEndMs;})),
        eventHandlerCpuMs:distribution(a.map(function(e){return e.handlerMs;}))};
    });
    return {manual:groups.manual,auto:groups.auto,playback:groups.playback,
      rafCallbacks:ticks.length,rafGapMs:distribution(ticks.slice(1).map(function(t,i){
        return t.atMs-ticks[i].atMs;
      })),rafRequestToCallbackMs:distribution(ticks.map(function(t){
        return t.atMs-t.requestAtMs;
      }))};
  }
  function create(options){
    if(!options||typeof options.now!=='function'||typeof options.requestFrame!=='function'||
       typeof options.cancelFrame!=='function')throw TypeError('Frame timing requires an explicit clock and RAF');
    var enabled=false,frame=null,activeInput=null,automatic=null;
    var inputs=[],renders=[],ticks=[],serial=0,lastReport=0;
    var maxRecords=options.maxRecords||2400,refreshMs=options.refreshMs||500;
    function bounded(rows,item){rows.push(item);if(rows.length>maxRecords)rows.shift();}
    function snapshot(){return {enabled:enabled,autoRunning:!!automatic,
      summary:summarize(inputs,renders,ticks)};}
    function notify(force){
      if(typeof options.onUpdate!=='function')return;
      var now=options.now();
      if(force||now-lastReport>=refreshMs){lastReport=now;options.onUpdate(snapshot());}
    }
    function clear(){inputs=[];renders=[];ticks=[];serial=0;lastReport=0;notify(true);}
    function stopAutomatic(){
      if(automatic){automatic=null;notify(true);}
    }
    function queue(){
      if(!enabled||frame!==null)return;
      var requestedAt=options.now();
      frame=options.requestFrame(function(timestamp){beat(timestamp,requestedAt);});
    }
    function beat(timestamp,requestedAt){
      frame=null;
      if(!enabled)return;
      var at=options.now();
      bounded(ticks,{atMs:at,rafTimestampMs:Number.isFinite(timestamp)?timestamp:null,
        requestAtMs:requestedAt});
      var run=automatic;
      // The before/after variant measures only the placement of the next RAF
      // request. Neither variant changes the actual renderer or its inputs.
      if(run&&run.requestOrder==='before')queue();
      if(run){
        try{
          if(run.startMs===null)run.startMs=at;
          var fraction=Math.min(1,Math.max(0,(at-run.startMs)/run.durationMs));
          var value=Math.round(1000*fraction);
          if(value!==run.lastValue){run.lastValue=value;run.seek(value);}
          if(fraction>=1)stopAutomatic();
        }catch(error){
          automatic=null;
          if(typeof options.onError==='function')options.onError(error);
          notify(true);
        }
      }
      notify(false);
      queue();
    }
    function setEnabled(value){
      if(!!value===enabled)return;
      enabled=!!value;
      stopAutomatic();
      if(frame!==null){options.cancelFrame(frame);frame=null;}
      clear();
      if(enabled)queue();
    }
    function input(source,value,fn){
      if(typeof fn!=='function')throw TypeError('Input requires the actual seek handler');
      if(!enabled)return fn();
      if(source!=='manual'&&source!=='auto')throw RangeError('Unknown seek source');
      var entry={id:++serial,source:source,value:Number(value),atMs:options.now(),handlerMs:null,
        autoRequestOrder:source==='auto'&&automatic?automatic.requestOrder:null};
      bounded(inputs,entry);
      var previous=activeInput;activeInput=entry;
      try{return fn();}
      finally{entry.handlerMs=options.now()-entry.atMs;activeInput=previous;}
    }
    function render(fn,wasPainted){
      if(typeof fn!=='function')throw TypeError('Render requires a real paint callback');
      if(!enabled)return fn();
      var inputEvent=activeInput,started=options.now();
      var entry={source:inputEvent?inputEvent.source:'playback',
        inputId:inputEvent?inputEvent.id:null,
        requestedSeek:inputEvent?inputEvent.value:null,
        atMs:started,inputToStartMs:inputEvent?started-inputEvent.atMs:null,
        inputToEndMs:null,cpuMs:null,painted:false,error:null};
      bounded(renders,entry);
      try{
        var result=fn();
        entry.painted=typeof wasPainted==='function'?!!wasPainted():
          !!(result&&result.painted===true);
        return result;
      }catch(error){entry.error=String(error&&error.message||error);throw error;}
      finally{
        entry.cpuMs=options.now()-started;
        if(inputEvent)entry.inputToEndMs=options.now()-inputEvent.atMs;
      }
    }
    function startAutomatic(seek,settings){
      if(!enabled)throw Error('Enable frame timing before starting the sweep');
      if(typeof seek!=='function')throw TypeError('Automatic sweep requires the same seek path');
      var durationMs=settings&&settings.durationMs||4000;
      var requestOrder=settings&&settings.requestOrder||'after';
      if(!(durationMs>=500&&durationMs<=30000)||!['before','after'].includes(requestOrder))
        throw RangeError('Invalid automatic sweep configuration');
      stopAutomatic();
      automatic={seek:seek,durationMs:durationMs,requestOrder:requestOrder,
        startMs:null,lastValue:null};
      notify(true);
      queue();
    }
    function exportData(environment){
      return {schema:'curvature-canvas-direct-frame-timing/1',createdAt:new Date().toISOString(),
        environment:environment||{},config:{maxRecords:maxRecords,rafMonitor:'opt-in',
          notes:'RAF callback cadence, input handler timings, and synchronous paint calls are not presented-frame FPS or GPU completion time.'},
        summary:summarize(inputs,renders,ticks),measurements:{inputs:inputs.slice(),
          renders:renders.slice(),rafCallbacks:ticks.slice()}};
    }
    return Object.freeze({setEnabled:setEnabled,enabled:function(){return enabled;},
      clear:clear,stopAutomatic:stopAutomatic,autoRunning:function(){return !!automatic;},
      input:input,render:render,startAutomatic:startAutomatic,snapshot:snapshot,
      exportData:exportData});
  }
  return Object.freeze({create:create,summarize:summarize});
}));
