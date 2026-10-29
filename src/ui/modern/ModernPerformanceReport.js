/* Read-only #140.1 performance report: wall-clock JS timings vs GPU timer queries.
 * No measurements or rendering happen in this formatter.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernPerformanceReport=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function value(n){return typeof n==='number'&&Number.isFinite(n)?n.toFixed(2):'—';}
  function metric(group,key,label){
    if(!group||!group.median||!Number.isFinite(group.median[key]))return null;
    return '  '+label+': '+value(group.median[key])+' / '+value(group.p95&&group.p95[key])+' ms';
  }
  function format(summary){
    if(!summary)return 'Render profiler is unavailable.';
    var out=['CPU wall-clock timings · median / p95 (ms)',
      'Measurements are synchronous JavaScript/Canvas times; not GPU completion times.',
      'Cached optics and fresh optics must be compared in separate recordings.',''];
    ['Scene','A','B'].forEach(function(name){
      var r=summary.renders&&summary.renders[name];
      if(!r||!r.count)return;
      out.push(name+' · '+r.count+' physical redraw(s) · latest rays '+(r.latest.cacheReused?'cached':'computed'));
      [['totalMs','UI total'],['rendererMs','Physical renderer'],['overlayMs','Post-render overlays']].forEach(function(pair){
        var line=metric(r,pair[0],pair[1]);if(line)out.push(line);
      });
      var stages=r.stages;
      [['composeMs','Scene composition'],['opticsMs','Optical transform'],
        ['frameMs','Frame / screen LOD'],['projectionMs','Geometry projection'],
        ['canvasMs','Canvas 2D painting'],['decorationsMs','Canvas decorations']].forEach(function(pair){
        var line=metric(stages,pair[0],pair[1]);if(line)out.push(line);
      });
      out.push('');
    });
    ['scene','compare'].forEach(function(name){
      var b=summary.batches&&summary.batches[name];
      if(!b||!b.count)return;
      out.push(name+' redraw batches · '+b.count);
      [['setupMs','Pre-RAF setup'],['queueMs','RAF wait (not rendering)'],['totalMs','RAF callback CPU']].forEach(function(pair){
        var line=metric(b,pair[0],pair[1]);if(line)out.push(line);
      });
      out.push('');
    });
    out.push('Optional Atmospheric Shimmer GPU pass (when enabled):');
    var any=false;
    ['Scene','A','B'].forEach(function(name){
      var cpu=summary.presentations&&summary.presentations[name];
      var gpu=summary.gpuDraws&&summary.gpuDraws[name];
      if((!cpu||!cpu.count)&&(!gpu||!gpu.count))return;
      any=true;
      out.push(name+' · '+(cpu?cpu.count:0)+' CPU samples, '+(gpu?gpu.count:0)+' GPU timer results');
      [['cpuTotalMs','JS WebGL pass'],['cpuUploadMs','Canvas→texture upload call'],
        ['cpuSubmitMs','State setup + draw submission']].forEach(function(pair){
        var line=metric(cpu,pair[0],pair[1]);if(line)out.push(line);
      });
      var gpuLine=metric(gpu,'gpuDrawMs','GPU draw execution (timer extension)');
      if(gpuLine)out.push(gpuLine);
    });
    if(!any)out.push('  No GPU samples. Enable shimmer and start recording.');
    out.push('','GPU execution uses EXT_disjoint_timer_query only when available.',
      'If no GPU timer results appear, GPU execution time is unknown (not zero).',
      'Browser compositing, screen refresh, readback and memory usage are not timed.');
    return out.join('\n');
  }
  return Object.freeze({format:format});
}));
