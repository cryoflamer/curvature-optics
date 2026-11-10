/* Reproducible performance samples and strict pixel comparisons for Animation.
 * Comparison never resizes, redraws, or writes to the live Scene/Compare graph.
 * A comparison is meaningful only for the SAME state, optics and bitmap size.
 */
(function(root,factory){
  var experiment=root.CurvatureModernExperimentState;
  var fingerprint=root.CurvatureModernExperimentFingerprint;
  if(typeof module==='object'&&module.exports){
    experiment=require('../ui/modern/ModernExperimentState');
    fingerprint=require('../ui/modern/ModernExperimentFingerprint');
  }
  var api=factory(experiment,fingerprint);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationQualityAudit=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(experiment,fingerprint){
  'use strict';
  function signature(input){
    var e=experiment.validate(input);
    // A History physical fingerprint alone misses camera position, overlays
    // and presentation. Captions are pixels too; do not silently ignore them.
    return JSON.stringify({physics:fingerprint.physicalSignature(e),
      camera:e.scene.camera,title:e.scene.title,description:e.scene.description,
      display:{eyeLevel:e.display.eyeLevel,horizon:e.display.horizon,
        showTemperatureProfile:e.display.showTemperatureProfile,
        temperaturePlacement:e.display.temperaturePlacement}});
  }
  function conditions(options){
    if(!options||!options.reference||!options.sample)return 'Missing experiment state';
    if(signature(options.reference)!==signature(options.sample))
      return 'Working experiment differs from the sampled animation frame';
    if(options.mode!==options.sample.display.mode)
      return 'Working Scene/Compare mode differs';
    if(!options.referenceRendered)return 'Working frame was not rendered';
    if(options.referenceQuality!==options.animationQuality)
      return 'Optical quality differs (Fast and Accurate are not comparable)';
    if(options.referenceBackend!=='Canvas 2D'||options.animationBackend!=='Canvas 2D')
      return 'Pixel parity requires Canvas 2D on both sides';
    if(options.shimmer) return 'Atmospheric presentation/shimmer must be disabled';
    return null;
  }
  function readPixels(canvas){
    if(!canvas||!Number.isInteger(canvas.width)||!Number.isInteger(canvas.height)||
      canvas.width<1||canvas.height<1)throw RangeError('Invalid Canvas dimensions');
    var ctx=canvas.getContext&&canvas.getContext('2d');
    if(!ctx||typeof ctx.getImageData!=='function')throw Error('Readable 2D Canvas required');
    return {width:canvas.width,height:canvas.height,
      data:ctx.getImageData(0,0,canvas.width,canvas.height).data};
  }
  function comparePixels(a,b,options){
    options=options||{};
    if(!a||!b||!Number.isInteger(a.width)||!Number.isInteger(a.height)||
      a.width<1||a.height<1||a.width!==b.width||a.height!==b.height)
      throw RangeError('Pixel parity needs identical nonzero backing-store dimensions');
    var threshold=options.threshold===undefined?2:options.threshold;
    if(!Number.isInteger(threshold)||threshold<0||threshold>255)
      throw RangeError('Invalid pixel tolerance');
    var count=a.width*a.height,n=count*4;
    if(!a.data||!b.data||a.data.length!==n||b.data.length!==n)
      throw RangeError('Invalid RGBA pixel buffers');
    var different=0,overTolerance=0,channelError=0,largest=0;
    // Compare every RGBA channel, including alpha. No unexplained mask,
    // subsampling, rescaling or automatic acceptance threshold.
    for(var i=0;i<n;i+=4){
      var peak=0;
      for(var c=0;c<4;c++){
        var av=a.data[i+c],bv=b.data[i+c];
        if(!Number.isInteger(av)||!Number.isInteger(bv)||av<0||av>255||bv<0||bv>255)
          throw RangeError('Invalid RGBA channel');
        var delta=Math.abs(av-bv);channelError+=delta;
        if(delta>peak)peak=delta;
      }
      if(peak>0)different++;
      if(peak>threshold)overTolerance++;
      if(peak>largest)largest=peak;
    }
    return {width:a.width,height:a.height,pixels:count,
      differentPixels:different,differentFraction:different/count,
      pixelsOverTolerance:overTolerance,overToleranceFraction:overTolerance/count,
      meanAbsoluteChannelError:channelError/n,maxChannelError:largest,
      tolerance:threshold,exact:largest===0};
  }
  function compareCanvases(reference,animation,options){
    // A backing-size mismatch fails BEFORE either expensive/synchronous readback.
    if(!reference||!animation||!Number.isInteger(reference.width)||
      !Number.isInteger(reference.height)||reference.width<1||reference.height<1||
      reference.width!==animation.width||reference.height!==animation.height)
      throw RangeError('Pixel parity needs identical nonzero backing-store dimensions');
    // readback is intentionally opt-in; getImageData can stall the browser.
    return comparePixels(readPixels(reference),readPixels(animation),options);
  }
  function percentile(sorted,p){return sorted[Math.ceil(sorted.length*p)-1];}
  function stats(rows,key){
    var values=rows.map(function(row){return row[key];}).filter(function(v){
      return typeof v==='number'&&Number.isFinite(v)&&v>=0;
    }).sort(function(a,b){return a-b;});
    if(!values.length)return {count:0,p50:null,p95:null,max:null};
    return {count:values.length,p50:percentile(values,.5),
      p95:percentile(values,.95),max:values[values.length-1]};
  }
  function create(options){
    options=options||{};
    var limit=options.capacity===undefined?120:options.capacity;
    if(!Number.isInteger(limit)||limit<1||limit>1000)throw RangeError('Invalid audit capacity');
    var rows=[];
    function record(input){
      if(!input||!Number.isFinite(input.timeMs)||input.timeMs<0||
        !Number.isFinite(input.frameMs)||input.frameMs<0||
        !['fast','accurate','mixed'].includes(input.quality))throw RangeError('Invalid animation frame audit');
      function side(value){
        if(!value)return null;
        var timings=value.timings||{};
        var keys=['totalMs','composeMs','opticsMs','paintMs','canvasMs'];
        var out={cacheReused:!!value.cacheReused,
          unresolved:Number.isFinite(value.unresolved)?value.unresolved:null,
          fillUnresolved:Number.isFinite(value.fillUnresolved)?value.fillUnresolved:null};
        keys.forEach(function(k){
          if(typeof timings[k]==='number'&&Number.isFinite(timings[k])&&timings[k]>=0)
            out[k]=timings[k];
        });
        return out;
      }
      var row={timeMs:input.timeMs,frameMs:input.frameMs,quality:input.quality,
        projectId:typeof input.projectId==='string'?input.projectId:null,
        viewportA:input.viewportA||null,viewportB:input.viewportB||null,
        A:side(input.A),B:side(input.B)};
      rows.push(row);if(rows.length>limit)rows.shift();
      return row;
    }
    function aggregate(samples){
      var all=samples.filter(Boolean);
      return {count:all.length,totalMs:stats(all,'totalMs'),
        composeMs:stats(all,'composeMs'),opticsMs:stats(all,'opticsMs'),
        paintMs:stats(all,'paintMs'),canvasMs:stats(all,'canvasMs'),
        cacheHits:all.filter(function(s){return s.cacheReused;}).length,
        cold:stats(all.filter(function(s){return !s.cacheReused;}),'opticsMs'),
        warm:stats(all.filter(function(s){return s.cacheReused;}),'opticsMs'),
        unresolved:all.some(function(s){return s.unresolved!==null;})?
          all.reduce(function(n,s){return n+(s.unresolved===null?0:s.unresolved);},0):null,
        fillUnresolved:all.some(function(s){return s.fillUnresolved!==null;})?
          all.reduce(function(n,s){return n+(s.fillUnresolved===null?0:s.fillUnresolved);},0):null};
    }
    return Object.freeze({record:record,clear:function(){rows.length=0;},
      summary:function(){return {count:rows.length,frameMs:stats(rows,'frameMs'),
        A:aggregate(rows.map(function(r){return r.A;})),
        B:aggregate(rows.map(function(r){return r.B;})),
        fastFrames:rows.filter(function(r){return r.quality==='fast';}).length,
        accurateFrames:rows.filter(function(r){return r.quality==='accurate';}).length,
        mixedFrames:rows.filter(function(r){return r.quality==='mixed';}).length};},
      snapshot:function(){return rows.map(function(r){return JSON.parse(JSON.stringify(r));});}});
  }
  return Object.freeze({signature:signature,conditions:conditions,
    readPixels:readPixels,comparePixels:comparePixels,compareCanvases:compareCanvases,
    create:create});
}));
