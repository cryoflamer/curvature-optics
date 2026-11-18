/* One-click, opt-in Canvas Direct comparison. A fixed experiment sample is
 * provided by the app: the benchmark neither ticks the player nor mutates its
 * project. Only browser RAF callbacks contribute measured rows; first-frame
 * setup and mode transitions are explicitly warmed up.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPlaybackBenchmark=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var MODES=Object.freeze(['normal','canvas_only','dom_only','bitmap_replay','compute_only']);
  var LAYER_MODES=Object.freeze(['canvas_full','canvas_no_fills','canvas_no_strokes','canvas_no_mask']);
  var METRICS=['gapMs','callbackMs','rendererMs','postMs','projectionMs','canvasMs',
    'fillCalls','strokeCalls','horizonMasks','sourceObjects','primitivesProjected',
    'visibleSegments','beginPathCalls','moveToCalls','lineToCalls','closePathCalls',
    'clearRectCalls','fillRectCalls','clipCalls','drawImageCalls'];
  function percentiles(values){
    var a=values.filter(Number.isFinite).sort(function(x,y){return x-y;});
    return {count:a.length,p50:a.length?a[Math.ceil(a.length*.5)-1]:null,
      p95:a.length?a[Math.ceil(a.length*.95)-1]:null,
      max:a.length?a[a.length-1]:null};
  }
  function order(pass,modes){
    modes=modes||MODES;
    var shift=(pass*2)%modes.length;
    return modes.slice(shift).concat(modes.slice(0,shift));
  }
  function create(options){
    if(!options||!['requestFrame','cancelFrame','now','step','progress','completed','failed','cancelled']
      .every(function(key){return typeof options[key]==='function';}))
      throw TypeError('Benchmark requires RAF, clock, rendering and lifecycle callbacks');
    var active=false,frame=null,config=null,runs=null,current=null,pass=0,modeIndex=0,
      lastAt=null,iteration=0,completed=0;
    function isRunning(){return active;}
    function release(){
      active=false;
      if(frame!==null){options.cancelFrame(frame);frame=null;}
    }
    function stop(){
      if(!active)return false;
      release();options.cancelled();return true;
    }
    function next(){
      if(pass>=config.passes){
        // Keep a cross-pass summary for quick comparison while retaining every
        // measured row for later scrutiny of stutters and scheduling artifacts.
        var summary={};
        config.modes.forEach(function(mode){
          var rows=[];
          runs.forEach(function(run){if(run.mode===mode)rows.push.apply(rows,run.rows);});
          var entry={frames:rows.length};
          METRICS.forEach(function(key){entry[key]=percentiles(rows.map(function(row){return row[key];}));});
          summary[mode]=entry;
        });
        var report={schema:'curvature-playback-benchmark/1',createdAt:new Date().toISOString(),
          config:{warmupFrames:config.warmupFrames,sampleFrames:config.sampleFrames,
            passes:config.passes,modes:config.modes.slice(),camera:'fixed for every mode',
            profile:config.profile},
          environment:config.environment,runs:runs,summary:summary,
          notes:['RAF intervals include browser scheduling and deferred graphics work.',
            'JavaScript timings do not include deferred GPU or compositor time.',
            'DOM only reuses the last rendered result; bitmap replay uses one drawImage.',
            'All modes use a frozen camera/sample, including Normal.',
            'Canvas operation counts cover only the Canvas Direct painter (excluding decorations).',
            'Layer passes force the baseline layers on before disabling only the named layer.',
            'Instrumentation adds a small amount of synchronous work to the painter.']};
        release();options.completed(report);return;
      }
      var mode=order(pass,config.modes)[modeIndex];
      current={pass:pass+1,mode:mode,orderInPass:modeIndex+1,rows:[],statistics:null};
      runs.push(current);lastAt=null;iteration=0;
      options.progress({mode:mode,pass:pass+1,passes:config.passes,
        measured:0,total:config.sampleFrames,completed:completed});
    }
    function schedule(){frame=options.requestFrame(tick);}
    function tick(){
      frame=null;if(!active)return;
      try{
        var at=options.now();
        var payload=options.step(current.mode)||{};
        var elapsed=options.now()-at;
        var gap=lastAt===null?null:at-lastAt;
        lastAt=at;iteration++;
        if(iteration>config.warmupFrames){
          current.rows.push(Object.assign({gapMs:gap,callbackMs:elapsed},payload));
        }
        if(iteration===config.warmupFrames+config.sampleFrames){
          var rows=current.rows;
          var measurements={};METRICS.forEach(function(k){
            measurements[k]=percentiles(rows.map(function(r){return r[k];}));
          });
          current.statistics=measurements;
          completed++;modeIndex++;
          if(modeIndex>=config.modes.length){modeIndex=0;pass++;}
          next();
          if(!active)return;
        }else if(iteration===config.warmupFrames||iteration%30===0){
          options.progress({mode:current.mode,pass:current.pass,passes:config.passes,
            measured:current.rows.length,total:config.sampleFrames,completed:completed});
        }
        schedule();
      }catch(error){release();options.failed(error);}
    }
    function start(settings){
      if(active)throw Error('Benchmark already running');
      settings=settings||{};
      config={passes:settings.passes===undefined?3:settings.passes,
        warmupFrames:settings.warmupFrames===undefined?30:settings.warmupFrames,
        sampleFrames:settings.sampleFrames===undefined?120:settings.sampleFrames,
        environment:settings.environment||{},
        profile:settings.profile||'playback',modes:null};
      if(!['playback','canvas-layers'].includes(config.profile))
        throw RangeError('Invalid benchmark profile');
      config.modes=config.profile==='canvas-layers'?LAYER_MODES:MODES;
      if(!Number.isInteger(config.passes)||config.passes<1||config.passes>10||
        !Number.isInteger(config.warmupFrames)||config.warmupFrames<1||config.warmupFrames>1000||
        !Number.isInteger(config.sampleFrames)||config.sampleFrames<2||config.sampleFrames>10000)
        throw RangeError('Invalid benchmark frame counts');
      active=true;runs=[];pass=0;modeIndex=0;completed=0;
      try{next();schedule();}
      catch(error){release();throw error;}
    }
    return Object.freeze({start:start,cancel:stop,running:isRunning});
  }
  return Object.freeze({MODES:MODES,LAYER_MODES:LAYER_MODES,
    percentiles:percentiles,order:order,create:create});
}));
