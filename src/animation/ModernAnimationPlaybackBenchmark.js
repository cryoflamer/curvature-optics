/* One-click, opt-in Canvas Direct comparisons. Most profiles use one fixed
 * sample; the canvas-pipeline and moving stroke-width profiles advance
 * identical sampled frames for controlled comparisons. Only browser RAF callbacks
 * contribute measured rows; initial setup and transitions are warmed up.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPlaybackBenchmark=api;
}(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var MODES=Object.freeze(['normal','canvas_only','dom_only','bitmap_replay','compute_only']);
  // The same project, viewport and direct painter are exercised in three
  // independent RAF-controlled pipelines; no live Play timer is needed.
  var PIPELINE_MODES=Object.freeze(['pipeline_full','pipeline_projection_only',
    'pipeline_fixed_redraw']);
  var LAYER_MODES=Object.freeze(['canvas_full','canvas_no_fills','canvas_no_strokes','canvas_no_mask']);
  var STROKE_MODES=Object.freeze(['stroke_baseline','stroke_path_only','stroke_simple','stroke_batched']);
  var STROKE_STYLE_MODES=Object.freeze(['stroke_baseline','stroke_opaque','stroke_black',
    'stroke_width_one','stroke_miter','stroke_simple']);
  // Values are Canvas backing-store pixels (not CSS pixels). Baseline retains
  // all authored widths; the other modes override only the width.
  var STROKE_WIDTH_MODES=Object.freeze(['stroke_baseline','stroke_width_0_5',
    'stroke_width_0_75','stroke_width_1','stroke_width_1_125','stroke_width_1_25',
    'stroke_width_1_5','stroke_width_2','stroke_width_3','stroke_width_4']);
  // Moving-camera, equal-frame comparisons. The no-stroke control still
  // builds every path; the empty-stroke control calls stroke() on an empty path.
  var MOVING_STROKE_WIDTH_MODES=Object.freeze(['motion_baseline',
    'motion_width_0_25','motion_width_0_5','motion_width_0_75',
    'motion_width_1','motion_width_1_125','motion_width_1_25',
    'motion_width_1_5','motion_width_2','motion_width_3',
    'motion_path_only','motion_empty_stroke']);
  var METRICS=['gapMs','callbackMs','rendererMs','postMs','projectionMs','canvasMs',
    'sampleMs','geometryMs','timelineMs','painted',
    'fillCalls','strokeCalls','strokePrimitives',
    'strokeTranslucent','strokeNonUnitWidth','strokeNonBlack','strokeRoundJoin',
    'strokeWidthMinPx','strokeWidthMaxPx',
    'horizonMasks','sourceObjects','primitivesProjected',
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
            passes:config.passes,modes:config.modes.slice(),camera:config.profile==='canvas-pipeline'?'moving for full/projection, frozen for redraw':
              config.profile==='canvas-stroke-width-motion'?'identical moving camera for all stroke widths and controls':'fixed for every mode',
            profile:config.profile,
            widthSweepUnits:['canvas-stroke-widths','canvas-stroke-width-motion'].includes(config.profile)?
              'Canvas backing-store pixels':undefined},
          environment:config.environment,runs:runs,summary:summary,
          notes:['RAF intervals include browser scheduling and deferred graphics work.',
            'JavaScript timings do not include deferred GPU or compositor time.',
            'DOM only reuses the last rendered result; bitmap replay uses one drawImage.',
            config.profile==='canvas-pipeline'?
              'Canvas pipeline: Full and Projection only use identical advancing animation samples; Fixed redraw reuses one frozen sample, reprojects and repaints it.':
              'All modes use a frozen camera/sample, including Normal.',
            config.profile==='canvas-pipeline'?
              'Projection only runs Canvas Direct geometry, projection, clipping and visibility classification, but deliberately emits no Canvas paint commands, screen guides or decorations.':
              'The existing benchmark modes are fixed-frame measurements.',
            'RAF callback gaps are not presented-frame FPS; Canvas CPU time excludes deferred rasterization.',
            'Canvas operation counts cover only the Canvas Direct painter (excluding decorations).',
            'Layer and stroke passes force fills, outlines, and horizon mask on.',
            'Stroke path-only builds the same paths and suppresses only stroke() calls.',
            'Stroke simple uses an opaque black 1px miter-joined outline; its image differs.',
            'Stroke batched merges only consecutive same-style outlines, flushing before fills; overlaps may differ.',
            'Stroke style modes each change only opacity, color, width, or join; simple changes all four.',
            'Stroke width sweep preserves each authored path, fill, mask, color, alpha, join and stroke() call; only lineWidth varies.',
            'Moving stroke-width variants sample the same camera path at the same normalized times for each mode and pass.',
            'Motion path-only builds paths and fills but omits stroke(); motion empty-stroke submits one empty stroke() per original outline, preserving fill operations.',
            'Sweep widths are Canvas backing-store pixels under an identity 2D transform, not CSS pixels; compare canvas and cssWidth in environment.',
            'The baseline has authored widths; strokeWidthMinPx/MaxPx record submitted effective widths.',
            'Stroke style counts describe submitted strokes, not prepared paths or deferred browser work.',
            'Single-factor results may interact: do not sum their RAF differences as independent costs.',
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
        var payload=options.step(current.mode,{pass:current.pass,
          iteration:iteration,modeIndex:current.orderInPass,
          warmup:iteration<config.warmupFrames,
          totalFrames:config.warmupFrames+config.sampleFrames})||{};
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
      if(!['playback','canvas-layers','canvas-strokes','canvas-stroke-styles',
        'canvas-stroke-widths','canvas-pipeline','canvas-stroke-width-motion'].includes(config.profile))
        throw RangeError('Invalid benchmark profile');
      config.modes=config.profile==='canvas-pipeline'?PIPELINE_MODES:
        config.profile==='canvas-stroke-width-motion'?MOVING_STROKE_WIDTH_MODES:
        config.profile==='canvas-layers'?LAYER_MODES:
        config.profile==='canvas-strokes'?STROKE_MODES:
        config.profile==='canvas-stroke-styles'?STROKE_STYLE_MODES:
        config.profile==='canvas-stroke-widths'?STROKE_WIDTH_MODES:MODES;
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
  return Object.freeze({MODES:MODES,PIPELINE_MODES:PIPELINE_MODES,
    LAYER_MODES:LAYER_MODES,STROKE_MODES:STROKE_MODES,
    STROKE_STYLE_MODES:STROKE_STYLE_MODES,STROKE_WIDTH_MODES:STROKE_WIDTH_MODES,
    MOVING_STROKE_WIDTH_MODES:MOVING_STROKE_WIDTH_MODES,
    percentiles:percentiles,order:order,create:create});
}));
