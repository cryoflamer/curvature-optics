/* Opt-in live Playback timing diagnostics. All measurements are synchronous
 * main-thread wall time; browser scheduling/compositing is not attributed to
 * Canvas just because the observed interval between paints is long.
 * This module does not know about the DOM, scene, camera or export pipeline.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPlaybackProfiler=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function quantile(values,q){
    var sorted=values.filter(Number.isFinite).sort(function(a,b){return a-b;});
    if(!sorted.length)return null;
    return sorted[Math.ceil(q*sorted.length)-1];
  }
  function stats(rows,key){
    var values=rows.map(function(row){return row[key];}).filter(Number.isFinite);
    return {p50:quantile(values,.5),p95:quantile(values,.95)};
  }
  function direct(row,side){
    var timing=row.preview&&row.preview[side];
    if(!timing)return null;
    var total=timing.totalMs,compose=timing.composeMs,geometry=timing.geometryMs;
    var projection=timing.projectionMs,canvas=timing.canvasMs;
    if(![total,compose,geometry,projection,canvas].every(Number.isFinite))return null;
    return {totalMs:total,composeMs:compose,geometryMs:geometry,
      projectionMs:projection,canvasMs:canvas,
      remainderMs:Math.max(0,total-compose-geometry-projection-canvas)};
  }
  function create(options){
    options=options||{};
    var capacity=options.capacity||120,refreshMs=options.refreshMs||1000;
    if(!Number.isInteger(capacity)||capacity<2||!(refreshMs>0))throw RangeError('Invalid profiler window');
    var enabled=false,rows=[],lastTick=null,lastPaint=null,lastWork=null,lastReport=null;
    function reset(){rows=[];lastTick=null;lastPaint=null;lastWork=null;lastReport=null;}
    function setEnabled(value){enabled=!!value;reset();}
    function snapshot(){
      var painted=rows.filter(function(row){return row.painted;});
      var processed=rows.filter(function(row){return row.processed;});
      function phase(key){return stats(processed,key);}
      function directSide(side){
        var timing=painted.map(function(row){return row[side];}).filter(Boolean);
        if(!timing.length)return null;
        return {count:timing.length,total:stats(timing,'totalMs'),
          setup:stats(timing,'composeMs'),mesh:stats(timing,'geometryMs'),
          projection:stats(timing,'projectionMs'),canvas:stats(timing,'canvasMs'),
          rest:stats(timing,'remainderMs')};
      }
      return {ticks:rows.length,paints:painted.length,samples:processed.length,
        mode:processed.length?processed[0].mode:'normal',
        skipped:rows.length-processed.length,
        gap:stats(rows,'gapMs'),paintGap:stats(painted,'paintGapMs'),
        workGap:phase('workGapMs'),loop:stats(rows,'loopMs'),
        clock:phase('clockMs'),prepare:phase('prepareMs'),renderer:phase('rendererMs'),
        post:phase('postMs'),sync:phase('syncMs'),other:phase('otherMs'),
        A:directSide('A'),B:directSide('B')};
    }
    function record(row){
      if(!enabled)return null;
      var now=row.atMs;
      if(!Number.isFinite(now))return null;
      if(lastTick!==null&&now<=lastTick)reset();
      var painted=!!(row.preview&&row.preview.painted);
      var processed=painted||!!(row.preview&&row.preview.sampled);
      var entry={painted:painted,processed:processed,
        mode:row.preview&&row.preview.mode||'normal',
        gapMs:lastTick===null?null:now-lastTick,
        paintGapMs:painted&&lastPaint!==null?now-lastPaint:null,
        workGapMs:processed&&lastWork!==null?now-lastWork:null,
        loopMs:row.loopMs,clockMs:row.clockMs,syncMs:row.syncMs,
        otherMs:row.otherMs};
      if(processed){
        entry.prepareMs=row.preview.prepareMs;
        entry.rendererMs=row.preview.rendererMs;
        entry.postMs=row.preview.postMs;
        entry.A=direct(row,'A');entry.B=direct(row,'B');
        if(painted)lastPaint=now;
        lastWork=now;
      }
      lastTick=now;
      rows.push(entry);
      if(rows.length>capacity)rows.shift();
      if(lastReport===null||now-lastReport>=refreshMs){
        lastReport=now;
        return format(snapshot());
      }
      return null;
    }
    return Object.freeze({setEnabled:setEnabled,enabled:function(){return enabled;},
      reset:reset,record:record,snapshot:snapshot,
      report:function(){return format(snapshot());}});
  }
  function format(report){
    if(!report.samples)return 'Measuring… play the animation to collect frames or samples.';
    function ms(pair){return pair.p50===null?'—':pair.p50.toFixed(1)+' / '+pair.p95.toFixed(1);}
    var mode=report.mode||'normal';
    var countLabel=mode==='compute'?' sampled':mode==='replay'?' replayed':' painted';
    var gapLabel=mode==='compute'?'Sample-to-sample gap':
      mode==='replay'?'Replay-to-replay gap':'Paint-to-paint gap';
    var lines=[
      'Mode: '+(mode==='compute'?'Compute only · no Canvas drawing':
        mode==='replay'?'Canvas replay · fixed sample':'Normal · animated Canvas'),
      'Recent: '+report.samples+countLabel+' / '+report.ticks+' RAF ticks ('+report.skipped+' skipped)',
      'p50 / p95 in ms · gaps are wall-clock intervals, not render time',
      gapLabel+': '+ms(mode==='normal'?report.paintGap:report.workGap)+
        ' · RAF tick gap: '+ms(report.gap),
      'RAF callback CPU (all ticks): '+ms(report.loop),
      (mode==='compute'?'Sample stages (no Canvas or compositor work):':
        'Painted frame stages (not including browser compositing):'),
      '  Clock advance: '+ms(report.clock),
      '  Sample + prepare: '+ms(report.prepare),
      '  Renderer A/B: '+ms(report.renderer),
      '  Preview HUD + audit + diagnostics: '+ms(report.post),
      '  Playback controls sync: '+ms(report.sync),
      '  Save + scheduling + other: '+ms(report.other)
    ];
    ['A','B'].forEach(function(side){
      var d=report[side];if(!d)return;
      lines.push('Canvas Direct '+side+' ('+d.count+' paints; renderer breakdown):',
        '  Total: '+ms(d.total)+' · setup: '+ms(d.setup)+' · mesh: '+ms(d.mesh),
        '  Projection + clipping: '+ms(d.projection)+' · Canvas 2D calls: '+ms(d.canvas),
        '  Remaining renderer work: '+ms(d.rest));
    });
    lines.push('Individual p95 stages need not sum to total p95. Canvas 2D timing excludes deferred GPU/compositor work.');
    if(mode==='compute')lines.push('Canvas remains unchanged; Actual FPS counts paints only.');
    if(mode==='replay')lines.push('Playback clock advances; renderer redraws the same sampled camera/scene each tick.');
    return lines.join('\n');
  }
  return Object.freeze({create:create,format:format});
}));
