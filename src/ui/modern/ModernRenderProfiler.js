/* Bounded, opt-in-to-read Modern rendering diagnostics.
 * Records actual measured UI redraw work, in addition to the physical
 * renderer's existing compose/optics/frame/paint stage timings.
 * No model, Canvas, persistence, console or optical cache side effects.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernRenderProfiler=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var STAGES=['composeMs','opticsMs','frameMs','screenLodMs','snapshotOnlyMs',
    'paintMs','validationMs','projectionMs','canvasMs','decorationsMs','totalMs'];
  var MEASURES=['totalMs','rendererMs','overlayMs','queueMs','setupMs','resizeMs','redrawMs'];
  var PRESENTATION=['cpuTotalMs','cpuUploadMs','cpuSubmitMs'];
  // These are already collected by CurvaturePhysicalSceneOptics on a fresh
  // solve; no new ray tracing or additional solver work is performed here.
  var OPTICAL_STAGES=['fieldSetupMs','groundGuidesMs','outlinesMs','fillsMs',
    'assemblyMs','sceneAdoptionMs','exactSolveMs'];
  var OPTICAL_COUNTS=['solves','hits','interpolations','fallbacks',
    'shootEvaluations','shootRK4Calls','predictorAttempts','predictorAccepted',
    'predictorFallbacks','warmStartAttempts','warmStartAccepted',
    'warmStartMisses','clearGroundSteps','fullGroundEventSteps','exactSolveMs'];
  var FIELD_COUNTS=OPTICAL_COUNTS.concat(['cells','roots','points']);
  function finiteNonnegative(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0;}
  function numeric(source,fields){
    var output={};
    fields.forEach(function(key){if(finiteNonnegative(source&&source[key]))output[key]=source[key];});
    return output;
  }
  function aggregate(records){
    if(!records.length)return {count:0,latest:null};
    var keys=new Set(),latest=records[records.length-1];
    records.forEach(function(r){Object.keys(r).forEach(function(k){
      if(typeof r[k]==='number'&&Number.isFinite(r[k]))keys.add(k);
    });});
    var median={},p95={},max={};
    keys.forEach(function(key){
      var sorted=records.map(function(r){return r[key];})
        .filter(function(n){return typeof n==='number'&&Number.isFinite(n);})
        .sort(function(a,b){return a-b;});
      if(!sorted.length)return;
      median[key]=sorted[Math.floor((sorted.length-1)/2)];
      p95[key]=sorted[Math.ceil(sorted.length*.95)-1];
      max[key]=sorted[sorted.length-1];
    });
    var result={count:records.length,latest:Object.assign({},latest),median:median,p95:p95,max:max};
    ['stages','Scene','A','B','opticalStages','opticalWork','fieldStats',
      'ground','outlines','fills'].forEach(function(key){
      var nested=records.map(function(r){return r[key];}).filter(function(r){return r&&typeof r==='object';});
      if(nested.length)result[key]=aggregate(nested);
      if(result.latest[key])result.latest[key]=Object.assign({},result.latest[key]);
    });
    return result;
  }
  function create(options){
    options=options||{};
    var capacity=options.capacity===undefined?60:options.capacity;
    if(!Number.isInteger(capacity)||capacity<1||capacity>1000)
      throw RangeError('Render profile capacity must be 1..1000');
    var renders={Scene:[],A:[],B:[]},batches={scene:[],compare:[]},
      presentations={Scene:[],A:[],B:[]},gpuDraws={Scene:[],A:[],B:[]};
    var enabled=true;
    function keep(queue,entry){queue.push(entry);if(queue.length>capacity)queue.shift();}
    return Object.freeze({
      recordRender:function(input){
        if(!input||!Object.prototype.hasOwnProperty.call(renders,input.viewport))
          throw RangeError('Unknown render viewport');
        if(!enabled)return null;
        var entry=numeric(input,MEASURES);
        var stages=numeric(input.stages,STAGES);
        if(Object.keys(stages).length)entry.stages=stages;
        entry.cacheReused=!!input.cacheReused;
        entry.opticalSample=input.opticalSample==='cold'||input.opticalSample==='warm'?
          input.opticalSample:'normal';
        if(!entry.cacheReused){
          var phases=numeric(input.opticalStages,OPTICAL_STAGES);
          if(Object.keys(phases).length)entry.opticalStages=phases;
          var work={};['ground','outlines','fills'].forEach(function(phase){
            var counts=numeric(input.opticalWork&&input.opticalWork[phase],OPTICAL_COUNTS);
            if(Object.keys(counts).length)work[phase]=counts;
          });
          if(Object.keys(work).length)entry.opticalWork=work;
          var field=numeric(input.fieldStats,FIELD_COUNTS);
          if(Object.keys(field).length)entry.fieldStats=field;
        }
        if(input.backend==='WebGL2'||input.backend==='Canvas 2D')entry.backend=input.backend;
        keep(renders[input.viewport],entry);
        return Object.assign({},entry);
      },
      recordBatch:function(input){
        if(!input||!Object.prototype.hasOwnProperty.call(batches,input.mode))
          throw RangeError('Unknown redraw mode');
        if(!enabled)return null;
        var entry=numeric(input,MEASURES);
        if(input.mode==='compare'){
          entry.A=numeric(input.A,MEASURES);
          entry.B=numeric(input.B,MEASURES);
        }else entry.Scene=numeric(input.Scene,MEASURES);
        keep(batches[input.mode],entry);
        return Object.assign({},entry);
      },
      recordPresentation:function(input){
        if(!input||!Object.prototype.hasOwnProperty.call(presentations,input.viewport))
          throw RangeError('Unknown presentation viewport');
        if(!enabled)return null;
        var entry=numeric(input,PRESENTATION);
        entry.uploaded=!!input.uploaded;
        keep(presentations[input.viewport],entry);
        return Object.assign({},entry);
      },
      recordGpuDraw:function(input){
        if(!input||!Object.prototype.hasOwnProperty.call(gpuDraws,input.viewport))
          throw RangeError('Unknown GPU viewport');
        if(!enabled)return null;
        var entry=numeric(input,['gpuDrawMs']);
        if(!Object.keys(entry).length)return null;
        keep(gpuDraws[input.viewport],entry);
        return Object.assign({},entry);
      },
      setEnabled:function(value){enabled=!!value;},
      isEnabled:function(){return enabled;},
      summary:function(){
        // Partition requested cold/warm samples by what ACTUALLY happened;
        // a warm request that missed the cache must never contaminate warm
        // medians or be misrepresented as a successful cache hit.
        var opticalSamples={};
        Object.keys(renders).forEach(function(name){
          var queue=renders[name];
          opticalSamples[name]={
            cold:aggregate(queue.filter(function(r){return r.opticalSample==='cold'&&!r.cacheReused;})),
            warm:aggregate(queue.filter(function(r){return r.opticalSample==='warm'&&r.cacheReused;})),
            coldUnexpectedHits:queue.filter(function(r){return r.opticalSample==='cold'&&r.cacheReused;}).length,
            warmCacheMisses:queue.filter(function(r){return r.opticalSample==='warm'&&!r.cacheReused;}).length
          };
        });
        return {capacity:capacity,enabled:enabled,opticalSamples:opticalSamples,
          presentations:{Scene:aggregate(presentations.Scene),A:aggregate(presentations.A),B:aggregate(presentations.B)},
          gpuDraws:{Scene:aggregate(gpuDraws.Scene),A:aggregate(gpuDraws.A),B:aggregate(gpuDraws.B)},
          renders:{Scene:aggregate(renders.Scene),A:aggregate(renders.A),B:aggregate(renders.B)},
          batches:{scene:aggregate(batches.scene),compare:aggregate(batches.compare)}};
      },
      clear:function(){renders.Scene.length=0;renders.A.length=0;renders.B.length=0;
        batches.scene.length=0;batches.compare.length=0;
        Object.keys(presentations).forEach(function(key){presentations[key].length=0;gpuDraws[key].length=0;});}
    });
  }
  return Object.freeze({create:create});
}));
