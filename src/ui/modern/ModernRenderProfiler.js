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
    ['stages','Scene','A','B'].forEach(function(key){
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
    var renders={Scene:[],A:[],B:[]},batches={scene:[],compare:[]};
    function keep(queue,entry){queue.push(entry);if(queue.length>capacity)queue.shift();}
    return Object.freeze({
      recordRender:function(input){
        if(!input||!Object.prototype.hasOwnProperty.call(renders,input.viewport))
          throw RangeError('Unknown render viewport');
        var entry=numeric(input,MEASURES);
        var stages=numeric(input.stages,STAGES);
        if(Object.keys(stages).length)entry.stages=stages;
        entry.cacheReused=!!input.cacheReused;
        keep(renders[input.viewport],entry);
        return Object.assign({},entry);
      },
      recordBatch:function(input){
        if(!input||!Object.prototype.hasOwnProperty.call(batches,input.mode))
          throw RangeError('Unknown redraw mode');
        var entry=numeric(input,MEASURES);
        if(input.mode==='compare'){
          entry.A=numeric(input.A,MEASURES);
          entry.B=numeric(input.B,MEASURES);
        }else entry.Scene=numeric(input.Scene,MEASURES);
        keep(batches[input.mode],entry);
        return Object.assign({},entry);
      },
      summary:function(){
        return {capacity:capacity,
          renders:{Scene:aggregate(renders.Scene),A:aggregate(renders.A),B:aggregate(renders.B)},
          batches:{scene:aggregate(batches.scene),compare:aggregate(batches.compare)}};
      },
      clear:function(){renders.Scene.length=0;renders.A.length=0;renders.B.length=0;
        batches.scene.length=0;batches.compare.length=0;}
    });
  }
  return Object.freeze({create:create});
}));
