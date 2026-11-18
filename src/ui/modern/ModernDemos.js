/* Modern controls for the original Legacy demonstration catalog. The Legacy
 * engine remains in a separate browser realm until its global model and Canvas
 * can be instantiated safely in this document. Prefer a narrow, direct
 * same-origin runtime port; retain the message bridge for older embed hosts. */
(function(root){
  'use strict';
  var protocol='curvature-demos-v1';
  var frame,ready=false,started=false,selected='TransLine';
  var directRuntime=null,unsubscribeDirect=null,directGeneration=0;
  var names=[],lastBenchmarkReport=null,benchmarkRunning=false,telemetryConnected=false;
  function el(id){return root.document.getElementById(id);}
  function status(message,kind){
    var node=el('ModernDemoStatus');if(!node)return;
    if(root.CurvatureModernStatusMessage)root.CurvatureModernStatusMessage.set(node,message,kind||'info');
    else node.textContent=message;
  }
  function enable(available){
    ['ModernDemoPlay','ModernDemoPrev','ModernDemoNext','ModernDemoReset'].forEach(function(id){
      var node=el(id);if(node)node.disabled=!available||benchmarkRunning;
    });
    var benchmark=el('ModernDemoBenchmarkRun');
    if(benchmark)benchmark.disabled=!available||!directRuntime||!telemetryConnected||benchmarkRunning;
  }
  function send(command,name){
    if(!ready||!frame)return;
    if(directRuntime){directRuntime.command(command,name);return;}
    if(frame.contentWindow)
      frame.contentWindow.postMessage({protocol:protocol,type:'command',command:command,
        ...(name?{name:name}:{})},root.location.origin==='null'?'*':root.location.origin);
  }
  function trusted(event){
    return frame&&event.source===frame.contentWindow&&
      (root.location.origin==='null'||event.origin===root.location.origin)&&
      event.data&&event.data.protocol===protocol;
  }
  function onCatalog(data){
    if(!Array.isArray(data.names))return;
    var seen=Object.create(null);
    var available=data.names.filter(function(name){
      if(typeof name!=='string'||!name||name.length>64||seen[name])return false;
      seen[name]=true;return true;
    });
    if(!available.length||available.length>32||available.indexOf('TransLine')<0)return;
    names=available;
    var picker=el('ModernDemoSelect');
    if(!picker)return;
    while(picker.firstChild)picker.removeChild(picker.firstChild);
    names.forEach(function(name){
      var option=root.document.createElement('option');
      option.value=name;option.textContent=name==='TransLine'?'TrnsmLine':name;
      picker.appendChild(option);
    });
    picker.value=selected;
    picker.disabled=false;
  }
  function onState(data){
    if(typeof data.demo!=='string'||data.demo!==selected||
       !Number.isInteger(data.position)||!Number.isInteger(data.total)||
       data.total<=0||data.position<0||data.position>=data.total)return;
    ready=true;
    enable(true);
    var picker=el('ModernDemoSelect');if(picker&&names.length)picker.value=selected;
    var heading=el('ModernDemoTitle');if(heading)heading.textContent='Demos · '+(selected==='TransLine'?'Transmission Line':selected);
    var play=el('ModernDemoPlay');if(play)play.textContent=data.playing?'Pause':'Play';
    var count=el('ModernDemoProgress');
    if(count)count.textContent='Step '+(data.position+1)+' / '+data.total;
    status(data.playing?'Playing original Legacy animation.':'Ready · Original Legacy renderer.');
  }
  function metric(value,precision){
    return typeof value==='number'&&Number.isFinite(value)?value.toFixed(precision||1):'—';
  }
  function telemetryStatus(message,state){
    var node=el('ModernDemoTelemetryStatus');
    if(node){node.textContent=message;node.dataset.state=state||'waiting';}
  }
  function onPerformance(data){
    telemetryConnected=true;
    enable(ready);
    telemetryStatus(data.playing?(data.drawCount?'Connected · Legacy draws measured.':
      'Connected · waiting for Legacy draws.'):'Connected · animation paused.','connected');
    var draw=el('ModernDemoDrawFps');
    if(draw)draw.textContent=metric(data.drawFps,1);
    var gap=el('ModernDemoDrawGap');
    if(gap)gap.textContent=metric(data.drawGapMs&&data.drawGapMs.p50,1)+' ms';
    var cpu=el('ModernDemoDrawCpu');
    if(cpu)cpu.textContent=metric(data.drawCpuMs&&data.drawCpuMs.p50,1)+' ms';
    var raf=el('ModernDemoRafGap');
    if(raf)raf.textContent=metric(data.rafGapMs&&data.rafGapMs.p50,1)+' ms';
  }
  function benchmarkStatus(message){
    var node=el('ModernDemoBenchmarkStatus');if(node)node.textContent=message;
  }
  function downloadBenchmark(report){
    if(!report||report.schema!=='curvature-legacy-demo-benchmark/1')return;
    var blob=new root.Blob([JSON.stringify(report,null,2)],{type:'application/json'});
    var url=root.URL.createObjectURL(blob);
    var link=root.document.createElement('a');
    link.href=url;
    link.download='curvature-legacy-benchmark-'+report.createdAt.replace(/[:.]/g,'-')+'.json';
    link.style.display='none';
    root.document.body.appendChild(link);
    try{link.click();}finally{
      root.document.body.removeChild(link);
      if(typeof root.setTimeout==='function')root.setTimeout(function(){root.URL.revokeObjectURL(url);},1000);
      else root.URL.revokeObjectURL(url);
    }
  }
  function onBenchmarkStarted(){
    benchmarkRunning=true;enable(ready);
    var picker=el('ModernDemoSelect');if(picker)picker.disabled=true;
    var run=el('ModernDemoBenchmarkRun'),cancel=el('ModernDemoBenchmarkCancel');
    if(run)run.disabled=true;
    if(cancel){cancel.hidden=false;cancel.disabled=false;}
    benchmarkStatus('Recording 10 seconds of actual Legacy draws…');
  }
  function onBenchmarkEnd(cancelled,report){
    benchmarkRunning=false;enable(ready);
    var picker=el('ModernDemoSelect');if(picker)picker.disabled=!ready;
    var run=el('ModernDemoBenchmarkRun'),cancel=el('ModernDemoBenchmarkCancel');
    if(run)run.disabled=!ready||!telemetryConnected;
    if(cancel)cancel.hidden=true;
    if(cancelled){benchmarkStatus('Recording cancelled.');return;}
    if(!report||report.schema!=='curvature-legacy-demo-benchmark/1')return;
    lastBenchmarkReport=report;
    var download=el('ModernDemoBenchmarkDownload');if(download)download.hidden=false;
    benchmarkStatus('Recorded '+report.drawCount+' Legacy draws in '+
      metric(report.elapsedMs/1000,1)+' seconds · '+metric(report.drawFps,1)+' draw FPS. JSON exported.');
    downloadBenchmark(report);
  }
  function onPerformanceStatus(data){
    if(data.state==='connected'){
      telemetryConnected=true;
      enable(ready);
      telemetryStatus('Connected · waiting for Legacy draws.','connected');
    }
  }
  function onMessage(event){
    if(directRuntime||!trusted(event))return;
    accept(event.data);
  }
  function accept(data){
    if(!data||typeof data!=='object')return;
    if(data.type==='catalog')onCatalog(data);
    else if(data.type==='state')onState(data);
    else if(data.type==='performance')onPerformance(data);
    else if(data.type==='performance-status')onPerformanceStatus(data);
    else if(data.type==='benchmark-started')onBenchmarkStarted();
    else if(data.type==='benchmark-cancelled')onBenchmarkEnd(true);
    else if(data.type==='performance-report')onBenchmarkEnd(false,data.report);
  }
  function ensureTelemetry(candidate,generation){
    function current(){return generation===directGeneration&&directRuntime===candidate;}
    function attached(){return typeof candidate.performanceStatus==='function'&&
      candidate.performanceStatus().attached===true;}
    function unavailable(message){
      if(!current())return;
      telemetryConnected=false;
      enable(ready);
      telemetryStatus(message,'error');
      benchmarkStatus('Legacy FPS telemetry unavailable. Benchmark cannot record until connected.');
    }
    if(attached()){
      telemetryConnected=true;
      enable(ready);
      telemetryStatus('Connected · waiting for Legacy draws.','connected');
      return;
    }
    if(typeof candidate.attachPerformance!=='function'){
      unavailable('Legacy host is outdated (telemetry runtime missing). Reload the page.');
      return;
    }
    // A cached host document may omit the new instrumentation script while
    // still exposing the controller. Load it only inside that same-origin iframe.
    var childDocument;
    try{childDocument=frame.contentWindow.document;}catch(error){
      unavailable('Cannot access the Legacy telemetry host.');return;
    }
    if(!childDocument||!childDocument.head||typeof childDocument.createElement!=='function'){
      unavailable('Legacy iframe cannot initialize FPS telemetry.');return;
    }
    telemetryStatus('Installing missing Legacy FPS telemetry…');
    var script=childDocument.createElement('script');
    script.src='src/diagnostics/LegacyDemoPerformance.js?telemetry-recovery=1';
    script.onload=function(){
      if(!current())return;
      if(attached()){
        telemetryConnected=true;enable(ready);
        telemetryStatus('Connected · waiting for Legacy draws.','connected');
      }else unavailable('Legacy FPS script loaded but did not attach to GraphX3DX.');
    };
    script.onerror=function(){unavailable('Legacy FPS script failed to load. Check the local server.');};
    childDocument.head.appendChild(script);
  }
  function attachDirect(){
    // A replaced or reloaded host is a new engine instance, so no previous
    // state or event stream may keep the controls enabled.
    var generation=++directGeneration;
    if(unsubscribeDirect){unsubscribeDirect();unsubscribeDirect=null;}
    directRuntime=null;
    ready=false;
    names=[];
    benchmarkRunning=false;
    telemetryConnected=false;
    telemetryStatus('Connecting Legacy FPS telemetry…');
    lastBenchmarkReport=null;
    var download=el('ModernDemoBenchmarkDownload');if(download)download.hidden=true;
    var cancel=el('ModernDemoBenchmarkCancel');if(cancel)cancel.hidden=true;
    benchmarkStatus('Start Soundly, then record a 10-second benchmark.');
    selected='TransLine';
    enable(false);
    var picker=el('ModernDemoSelect');if(picker)picker.disabled=true;
    status('Connecting to the Legacy demonstration engine…');
    if(!frame)return;
    var candidate;
    try{
      // The dedicated host is same-origin. Never read the child's Legacy
      // globals or inject its script bundle into Modern's own window.
      candidate=frame.contentWindow&&frame.contentWindow.CurvatureLegacyDemosRuntime;
    }catch(error){return;} // A foreign origin must not leak access.
    if(!candidate||typeof candidate.subscribe!=='function'||
       typeof candidate.command!=='function'){
      telemetryStatus('Legacy host controller unavailable. Reload the page.','error');
      return;
    }
    directRuntime=candidate;
    try{
      unsubscribeDirect=candidate.subscribe(function(data){
        if(directGeneration===generation&&directRuntime===candidate)accept(data);
      });
    }catch(error){directRuntime=null;status('Unable to connect to Demos host.','error');return;}
    ensureTelemetry(candidate,generation);
    // The child may initialize before or after iframe load. Subscription
    // replays state when available; a not-yet-started manager publishes later.
    if(ready)send('status');
  }
  function changeDemo(name){
    if(names.indexOf(name)<0||name===selected||!ready)return;
    selected=name;
    enable(false);
    var heading=el('ModernDemoTitle');if(heading)heading.textContent='Demos · '+(name==='TransLine'?'Transmission Line':name);
    var count=el('ModernDemoProgress');if(count)count.textContent='Loading first step…';
    status('Switching to '+name+'…');
    send('select',name);
  }
  function init(){
    frame=el('ModernDemoFrame');if(!frame)return;
    root.addEventListener('message',onMessage);
    frame.addEventListener('load',attachDirect);
    [['ModernDemoPlay','play'],['ModernDemoPrev','previous'],
      ['ModernDemoNext','next'],['ModernDemoReset','reset']].forEach(function(pair){
      var node=el(pair[0]);if(node)node.addEventListener('click',function(){send(pair[1]);});
    });
    var picker=el('ModernDemoSelect');
    if(picker){picker.disabled=true;picker.addEventListener('change',function(){changeDemo(picker.value);});}
    var run=el('ModernDemoBenchmarkRun');
    if(run)run.addEventListener('click',function(){send('benchmark-start');});
    var cancel=el('ModernDemoBenchmarkCancel');
    if(cancel)cancel.addEventListener('click',function(){send('benchmark-cancel');});
    var download=el('ModernDemoBenchmarkDownload');
    if(download)download.addEventListener('click',function(){
      if(lastBenchmarkReport)downloadBenchmark(lastBenchmarkReport);
    });
    enable(false);
  }
  function activate(){
    if(!frame)return;
    if(!started){
      started=true;
      status('Loading isolated Legacy demonstration engine…');
      frame.src='CurvatureDemosHost.html?embed=demos&telemetry=connected';
    }else if(ready)send('status');
  }
  function deactivate(){send('pause');}
  root.CurvatureModernDemos={init:init,activate:activate,deactivate:deactivate};
}(window));
