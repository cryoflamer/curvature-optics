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
      'Measurements are JavaScript wall times, not GPU completion times; WebGL calls only submit commands.',
      'Cached optics and fresh optics must be compared in separate recordings.',''];
    ['Scene','A','B'].forEach(function(name){
      var r=summary.renders&&summary.renders[name];
      if(!r||!r.count)return;
      out.push(name+' · '+r.count+' physical redraw(s) · latest rays '+
        (r.latest.cacheReused?'cached':'computed')+' · backend '+(r.latest.backend||'Canvas 2D'));
      [['totalMs','UI total'],['rendererMs','Physical renderer'],['overlayMs','Post-render overlays']].forEach(function(pair){
        var line=metric(r,pair[0],pair[1]);if(line)out.push(line);
      });
      var stages=r.stages;
      [['composeMs','Scene composition'],['opticsMs','Optical transform'],
        ['frameMs','Frame / screen LOD'],['projectionMs','Geometry projection'],
        ['canvasMs','Raster + Canvas presentation (CPU wall)'],['decorationsMs','Canvas decorations']].forEach(function(pair){
        var line=metric(stages,pair[0],pair[1]);if(line)out.push(line);
      });
      out.push('');
    });
    out.push('Cold / Warm optical sampling (explicit sample buttons only):');
    ['Scene','A','B'].forEach(function(name){
      var samples=summary.opticalSamples&&summary.opticalSamples[name];
      if(!samples)return;
      var cold=samples.cold,warm=samples.warm;
      if(!(cold.count||warm.count||samples.warmCacheMisses||samples.coldUnexpectedHits))return;
      out.push(name+' · cold '+cold.count+' · warm cache hits '+warm.count+
        ' · warm misses '+samples.warmCacheMisses+
        ' · unexpected cold hits '+samples.coldUnexpectedHits);
      [['cold',cold],['warm',warm]].forEach(function(pair){
        var label=pair[0],group=pair[1];
        if(!group.count)return;
        [['totalMs','UI redraw'],['opticsMs',null]].forEach(function(m){
          var target=m[1]===null?group.stages:group;
          var line=metric(target,m[0],label+(m[1]===null?' optical transform':' total'));
          if(line)out.push(line);
        });
      });
      if(cold.count){
        [['fieldSetupMs','field setup'],['groundGuidesMs','ground guides'],
          ['outlinesMs','outlines'],['fillsMs','fills'],
          ['assemblyMs','scene assembly'],['sceneAdoptionMs','scene adoption (inside assembly)'],
          ['exactSolveMs','exact solves (inside the projection stages)']].forEach(function(m){
          var line=metric(cold.opticalStages,m[0],'cold '+m[1]);if(line)out.push(line);
        });
        ['ground','outlines','fills'].forEach(function(phase){
          var groupWork=cold.opticalWork&&cold.opticalWork[phase];
          if(!groupWork||!groupWork.count)return;
          out.push('  '+phase+' · median new solves '+value(groupWork.median.solves)+
            ', RK4 steps '+value(groupWork.median.shootRK4Calls)+
            ', shooting evaluations '+value(groupWork.median.shootEvaluations));
        });
      }
    });
    out.push('  Warm misses excluded from warm medians. Cold clears only the optical scene cache.',
      '  Optical exact-solver time is nested within ground/outlines/fills; never sum it twice.','');
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
