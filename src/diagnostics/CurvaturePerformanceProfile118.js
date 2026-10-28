/* Opt-in browser performance capture. Only invoked by the existing ZIP export.
 * Measures the real Physical pipeline and records disjoint wall-clock stages.
 * Never changes the live model; samples are rendered before the legacy export
 * redraw restores the visible scene. No synthetic percentages are invented.
 */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePerformanceProfile118=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function summarize(values){
    var sorted=values.slice().sort(function(a,b){return a-b;});
    if(!sorted.length)return {count:0,medianMs:null,p95Ms:null,minMs:null,maxMs:null};
    var mid=Math.floor(sorted.length/2);
    return {count:sorted.length,medianMs:sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2,
      p95Ms:sorted[Math.ceil(sorted.length*.95)-1],minMs:sorted[0],maxMs:sorted[sorted.length-1]};
  }
  function sample(label,result,wallMs){
    var t=result.timings||{};
    return {scenario:label,wallMs:wallMs,composeMs:t.composeMs,opticsMs:t.opticsMs,
      snapshotMs:t.frameMs,screenLodMs:t.screenLodMs,snapshotOnlyMs:t.snapshotOnlyMs,
      screenLodStats:result.guideScreenLod||null,painterMs:t.paintMs,validationMs:t.validationMs,
      fillGeometryMs:t.projectionMs,canvasPaintMs:t.canvasMs,
      decorationsMs:t.decorationsMs,strokeCalls:t.strokeCalls,
      opticalCacheReused:!!result.cacheReused,guidePrimitives:result.primitiveCount,
      interactivePreview:!!result.interactiveGuidePreview,
      exactRaySolves:result.fieldStats&&result.fieldStats.solves,
      unresolved:result.unresolved};
  }
  // Optional dependencies permit isolated Node tests with injected renderer.
  async function run(options){
    if(!options||typeof options.render!=='function'||!options.model)
      throw new TypeError('render and model required');
    var pause=options.pause||function(){return new Promise(function(resolve){setTimeout(resolve,0);});};
    var base=options.model,clone=function(changes){return Object.assign({},base,changes||{});};
    var records=[],failures=[];
    async function measure(name,model,interactive){
      await pause();
      var start=now();
      try {var result=options.render(model,{interactive:interactive});
        records.push(sample(name,result,now()-start));
      }catch(error){failures.push({scenario:name,error:String(error)});}
    }
    if(typeof options.reset==='function')options.reset();
    await measure('cold-full',clone(),false);
    for(var i=0;i<3;i++)await measure('cached-full',clone(),false);
    for(var j=0;j<3;j++)await measure('grid-off',clone({showGrid:0}),false);
    for(var k=0;k<3;k++)await measure('interactive-guides',clone(),true);
    // Rotate only the camera view vector, not the world scene or physical optics.
    // A fresh immutable model clone avoids mutating CurveApp/Pan slider state.
    var v=base.camViewCenter;
    if(Array.isArray(v)&&v.length>=3){
      for(var p=0;p<5;p++){
        var radians=([-.1,-.05,0,.05,.1][p])*Math.PI/180;
        var view=[v[0]*Math.cos(radians)-v[1]*Math.sin(radians),
          v[0]*Math.sin(radians)+v[1]*Math.cos(radians),v[2]];
        await measure('pan-sweep',clone({camViewCenter:view}),false);
      }
    }else failures.push({scenario:'pan-sweep',error:'Camera vector unavailable'});
    var names=Array.from(new Set(records.map(function(r){return r.scenario;})));
    var groups={};names.forEach(function(name){
      var group=records.filter(function(r){return r.scenario===name;});
      groups[name]={wall:summarize(group.map(function(r){return r.wallMs;})),
        compose:summarize(group.map(function(r){return r.composeMs;})),
        optics:summarize(group.map(function(r){return r.opticsMs;})),
        snapshot:summarize(group.map(function(r){return r.snapshotMs;})),
        screenLod:summarize(group.map(function(r){return r.screenLodMs;}).filter(Number.isFinite)),
        snapshotOnly:summarize(group.map(function(r){return r.snapshotOnlyMs;}).filter(Number.isFinite)),
        painter:summarize(group.map(function(r){return r.painterMs;})),
        canvas:summarize(group.map(function(r){return r.canvasPaintMs;}))};
    });
    return {profile:{schema:'curvature-performance-profile-v118',timestamp:new Date().toISOString(),
      scenarios:groups,failures:failures,limitations:[
        'Browser main-thread timings; not GPU presentation/FPS measurements',
        'Painter contains validation, fill geometry and Canvas paint; do not sum nested times twice',
        'Render wall time includes graph configuration; frame is a subset of wall time',
        'Grid-off intentionally changes visual guides only, not physics or tower geometry',
        'Warm and cold samples are order-dependent; compare medians and raw samples',
        'The legacy geometry ZIP capture is separate from these Physical samples']},samples:records};
  }
  return {run:run,summarize:summarize,sample:sample};
}));
