/* Phase 8: opt-in pixel replay experiment. A fresh detached graph is used;
 * any mismatch is diagnostic, NOT evidence of a faulty legacy renderer.
 * The command stream excludes some graph state mutations.
 */
(function(root,factory){
  var api=factory(root.LegacySceneAdapter || (typeof require==='function'?require('./LegacySceneAdapter'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.LegacyCanvasReplayProbe=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(adapter){
  'use strict';
  // One immutable RGBA read per source, shared by comparison and evidence.
  function readPixels(canvas){
    if(!canvas)return null;
    var data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    return {width:canvas.width,height:canvas.height,data:new Uint8ClampedArray(data)};
  }
  function fingerprint(bytes){
    var value=2166136261;
    for(var i=0;i<bytes.length;i++)value=Math.imul(value^bytes[i],16777619)>>>0;
    return ('00000000'+value.toString(16)).slice(-8);
  }
  function compareReadings(a,b,limit){
    if(!a||!b||a.width!==b.width||a.height!==b.height){
      return {comparison:{ok:false,reason:'Canvas dimensions differ',
        originalSize:{width:a&&a.width,height:a&&a.height},
        replaySize:{width:b&&b.width,height:b&&b.height}},pixelEvidence:null};
    }
    var mismatched=0,maxDifference=0,bounds=null,samples=[],w=a.width;
    for(var i=0;i<a.data.length;i+=4){
      var maximum=0;
      for(var k=0;k<4;k++)maximum=Math.max(maximum,Math.abs(a.data[i+k]-b.data[i+k]));
      if(!maximum)continue;
      mismatched++;maxDifference=Math.max(maxDifference,maximum);
      var index=i/4,x=index%w,y=Math.floor(index/w);
      if(!bounds)bounds={minX:x,minY:y,maxX:x,maxY:y};
      else {bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);
        bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);}
      if(samples.length<(limit===undefined?16:limit))samples.push({x:x,y:y,
        original:Array.prototype.slice.call(a.data,i,i+4),
        replay:Array.prototype.slice.call(b.data,i,i+4)});
    }
    return {comparison:{ok:true,width:a.width,height:a.height,mismatchedPixels:mismatched,
      totalPixels:a.width*a.height,maxChannelDifference:maxDifference,identical:mismatched===0},
      pixelEvidence:{hashAlgorithm:'fnv1a32-rgba',originalHash:fingerprint(a.data),
        replayHash:fingerprint(b.data),mismatchedPixels:mismatched,bounds:bounds,firstDifferences:samples}};
  }
  function comparePair(a,b,limit){return compareReadings(readPixels(a),readPixels(b),limit);}
  function comparePixels(a,b){return comparePair(a,b).comparison;}
  function pixelEvidence(a,b,limit){return comparePair(a,b,limit).pixelEvidence;}
  function snapshotCanvas(source){
    if(!source)return null;
    var copy=document.createElement('canvas');
    copy.width=source.width;copy.height=source.height;
    copy.getContext('2d').putImageData(
      source.getContext('2d').getImageData(0,0,source.width,source.height),0,0);
    return copy;
  }
  function snapshotTimeline(captureEnd,beforeReplay,afterReplay){
    return {captureEndToBeforeReplay:comparePair(captureEnd,beforeReplay),
      beforeReplayToAfterReplay:comparePair(beforeReplay,afterReplay),
      captureEndToAfterReplay:comparePair(captureEnd,afterReplay),
      note:'Each comparison and its evidence derive from the same immutable RGBA readings'};
  }
  function captureFingerprint(canvas){
    var reading=readPixels(canvas);
    return reading?{width:reading.width,height:reading.height,
      hashAlgorithm:'fnv1a32-rgba',hash:fingerprint(reading.data)}:null;
  }
  function frameFingerprint(frame){
    if(!frame)return null;
    var encoded=JSON.stringify(frame),bytes=[];
    // Hash UTF-8 bytes, including non-ASCII command arguments.
    if(typeof TextEncoder!=='undefined')bytes=new TextEncoder().encode(encoded);
    else bytes=Buffer.from(encoded,'utf8');
    return {hashAlgorithm:'fnv1a32-utf8-json',hash:fingerprint(bytes),
      commandCount:frame.commands&&frame.commands.length||0};
  }
  // Diagnostic-only: preserve the source pixels and paint differences onto a
  // separate canvas. Never modify the production or detached replay canvas.
  function analyzePixels(a,b,thresholds){
    var basic=comparePixels(a,b);
    if(!basic.ok)return {comparison:basic,images:null};
    thresholds=thresholds||[0,2,8,32];
    var w=a.width,h=a.height;
    var left=a.getContext('2d').getImageData(0,0,w,h);
    var right=b.getContext('2d').getImageData(0,0,w,h);
    var diff=document.createElement('canvas');diff.width=w;diff.height=h;
    var ctx=diff.getContext('2d');
    var pixels=ctx.createImageData(w,h),boxes=[null,null,null,null];
    var counts=thresholds.map(function(t){return {threshold:t,count:0};});
    var bounds=null;
    for(var y=0;y<h;y++)for(var x=0;x<w;x++){
      var i=(y*w+x)*4,maximum=0;
      for(var k=0;k<4;k++)maximum=Math.max(maximum,Math.abs(left.data[i+k]-right.data[i+k]));
      for(var t=0;t<counts.length;t++)if(maximum>counts[t].threshold)counts[t].count++;
      var region=(y>=h/2?2:0)+(x>=w/2?1:0);
      if(maximum){
        if(!bounds)bounds={minX:x,minY:y,maxX:x,maxY:y};
        else {bounds.minX=Math.min(bounds.minX,x);bounds.minY=Math.min(bounds.minY,y);
          bounds.maxX=Math.max(bounds.maxX,x);bounds.maxY=Math.max(bounds.maxY,y);}
        if(!boxes[region])boxes[region]=0;
        boxes[region]++;
        // Magenta mismatch, grayscale original elsewhere.
        pixels.data[i]=255;pixels.data[i+1]=0;pixels.data[i+2]=255;pixels.data[i+3]=255;
      }else{
        var gray=Math.round(.2126*left.data[i]+.7152*left.data[i+1]+.0722*left.data[i+2]);
        pixels.data[i]=gray;pixels.data[i+1]=gray;pixels.data[i+2]=gray;pixels.data[i+3]=255;
      }
    }
    ctx.putImageData(pixels,0,0);
    return {comparison:basic,diagnostics:{bounds:bounds,
      quadrants:{topLeft:boxes[0]||0,topRight:boxes[1]||0,
        bottomLeft:boxes[2]||0,bottomRight:boxes[3]||0},thresholds:counts},
      images:{original:a.toDataURL('image/png'),replay:b.toDataURL('image/png'),
        diff:diff.toDataURL('image/png')}};
  }
  // Count actual Canvas2D painting operations during replay. A polygon command
  // reaching the graph API does not necessarily reach fill()/stroke().
  function observePaint(context,draw){
    var counts={fill:0,stroke:0,fillRect:0,strokeRect:0,clearRect:0};
    var saved=[];
    Object.keys(counts).forEach(function(name){
      if(typeof context[name]!=='function')return;
      var own=Object.prototype.hasOwnProperty.call(context,name),original=context[name];
      try{
        context[name]=function(){counts[name]++;return original.apply(this,arguments);};
        saved.push({name:name,own:own,original:original});
      }catch(error){ /* Some Canvas2D implementations disallow overrides. */ }
    });
    try{draw();}finally{
      saved.forEach(function(item){
        if(item.own)context[item.name]=item.original;
        else delete context[item.name];
      });
    }
    return counts;
  }
  // Observe the same internal pipeline on the live graph and on replay.
  // Instrument instance methods only, restoring every override even on error.
  // Counts describe method entry/output, not visibility or pixel equivalence.
  // Bounded, JSON-safe snapshots at the clipping boundary. Record all calls
  // so the first differing call can be located without guessing its index.
  function diagnosticValue(value,depth){
    if(value===null||typeof value==='boolean'||typeof value==='string')return value;
    if(typeof value==='number')return Number.isFinite(value)?value:String(value);
    if(depth<=0)return '[depth limit]';
    if(Array.isArray(value))return value.slice(0,16).map(function(v){return diagnosticValue(v,depth-1);});
    if(!value||typeof value!=='object')return null;
    var result={};
    Object.keys(value).slice(0,20).forEach(function(key){
      if(typeof value[key]!=='function')result[key]=diagnosticValue(value[key],depth-1);
    });
    return result;
  }
  function clippingSnapshot(graph,poly,mode,output){
    function polygonSample(p){
      if(!p||typeof p.Size!=='number')return null;
      var sample={size:p.Size};
      if(p.PolyList)sample.firstPolygon=polygonSample(p.PolyList[0]);
      else ['X','Y','Z'].forEach(function(k){if(p[k])sample[k]=Array.prototype.slice.call(p[k],0,Math.max(0,p.Size));});
      return sample;
    }
    var state={};
    ['Trans3D','CameraClipNear','CameraClipFar','GraphClipEnabled',
      'IsPath3DOpen','ApplyTransToPath3D','VpXmin','VpYmin','VpWidth','VpHeight',
      'WinXmin','WinXmax','WinYmin','WinYmax'].forEach(function(k){
      state[k]=diagnosticValue(graph[k],3);
    });
    if(graph.Camera){
      state.Camera={};
      Object.keys(graph.Camera).forEach(function(k){
        if(typeof graph.Camera[k]!=='function' && !/graph|canvas|context/i.test(k))
          state.Camera[k]=diagnosticValue(graph.Camera[k],2);
      });
    }
    return {mode:mode,input:polygonSample(poly),output:polygonSample(output),state:state};
  }
  function firstClippingDifference(original,replay){
    if(!original||!replay)return null;
    var length=Math.max(original.length,replay.length);
    for(var i=0;i<length;i++){
      var a=original[i],b=replay[i];
      if(JSON.stringify(a)!==JSON.stringify(b))return {callIndex:i+1,original:a||null,replay:b||null};
    }
    return null;
  }
  function observePipeline(graph,draw,clippingTrace){
    var names=['DrawPoly3D','Polygon3D','TransClipPolygon3D','TransPolys3D',
      'ClipPolygon3D','CameraTrans3D','DrawPolygonList3D','Polygon','DriverDrawPoly'];
    var stages={},saved=[];
    function sizeOf(value){
      if(!value||typeof value!=='object')return null;
      if(typeof value.Size==='number')return value.Size;
      return null;
    }
    try{
      names.forEach(function(name){
        if(typeof graph[name]!=='function')return;
        var own=Object.prototype.hasOwnProperty.call(graph,name),original=graph[name];
        stages[name]={calls:0,inputItems:0,outputItems:0,emptyOutputs:0,
          modes:{},fillCalls:0,outlineCalls:0};
        var stat=stages[name];
        graph[name]=function(){
          stat.calls++;
          var input=sizeOf(arguments[0]);
          if(input!==null)stat.inputItems+=input;
          var modeIndex=name==='DrawPoly3D'?0:name==='Polygon3D'?1:
            name==='TransClipPolygon3D'?1:name==='DrawPolygonList3D'?1:
            name==='Polygon'?2:null;
          if(modeIndex!==null){
            var mode=arguments[modeIndex];
            var key=mode===undefined?'default':String(mode);
            stat.modes[key]=(stat.modes[key]||0)+1;
          }
          if(name==='DriverDrawPoly'){
            if(arguments[3])stat.fillCalls++;else stat.outlineCalls++;
          }
          var output=original.apply(this,arguments);
          if(name==='TransClipPolygon3D'&&clippingTrace)
            clippingTrace.push(clippingSnapshot(this,arguments[0],arguments[1],output));
          var count=sizeOf(output);
          if(count!==null){stat.outputItems+=count;if(count===0)stat.emptyOutputs++;}
          return output;
        };
        saved.push({name:name,own:own,original:original});
      });
      draw();
    }finally{
      for(var i=saved.length-1;i>=0;i--){
        var item=saved[i];
        if(item.own)graph[item.name]=item.original;
        else delete graph[item.name];
      }
    }
    return stages;
  }
  function bootstrapValues(original,overrides){
    overrides=overrides||{};
    return {MaxCurveSegments:Object.prototype.hasOwnProperty.call(overrides,'MaxCurveSegments')?
      overrides.MaxCurveSegments:original.MaxCurveSegments,
      AngleMeasure:Object.prototype.hasOwnProperty.call(overrides,'AngleMeasure')?
      overrides.AngleMeasure:original.AngleMeasure};
  }
  function run(original,trace,GraphCtor,polygonCtor,exportImages,options){
    options=options||{};
    var frame=null;
    if(trace && trace.kind==='scene-command-frame'){
      frame=trace;
      trace=(typeof globalThis!=='undefined'&&globalThis.SceneFrame?globalThis.SceneFrame:require('./SceneFrame')).toTrace(trace);
    }
    if(!trace||!trace.complete)return {ok:false,reason:'Incomplete trace'};
    if(!original||!original.Canvas||typeof GraphCtor!=='function')
      return {ok:false,reason:'Graph or constructor missing'};
    // Never call replay on the production graph. Detached DOM nodes only.
    var canvas=document.createElement('canvas');
    canvas.width=original.Canvas.width;canvas.height=original.Canvas.height;
    var host=document.createElement('div');
    var clip=document.createElement('div');
    host.appendChild(clip);clip.appendChild(canvas);
    host.style.width=original.CanvasWidth+'px';
    clip.style.width=original.CanvasWidth+'px';
    clip.style.height=original.CanvasHeight+'px';
    var prototype=GraphCtor.prototype, create=prototype.CreateDomObjects;
    var shadow;
    try{
      // Constructor uses document.writeln otherwise; override only during the
      // synchronous construction of this detached diagnostic graph.
      prototype.CreateDomObjects=function(){
        this.ContainerDiv=host;this.ClippingDiv=clip;this.Canvas=canvas;
        this.LastContWidth=original.CanvasWidth+2*(original.BorderWidth||0);
        // Use logical graph dimensions, not device-pixel canvas dimensions.
        this.CanvasRatioHW=original.CanvasHeight/original.CanvasWidth;
      };
      try{
        shadow=new GraphCtor({Width:original.CanvasWidth,Height:original.CanvasHeight,
          AutoReset:true,AutoClear:true,AutoScalePix:original.AutoScalePix});
      }finally{prototype.CreateDomObjects=create;}
      // The graph constructor initializes a logical viewport but may resize
      // the backing store during its own setup (especially on HiDPI screens).
      // Match the live graph's logical size through the normal sizing path
      // so its pixel ratio, transforms and backing dimensions stay coherent.
      shadow.UpdateCanvasSize(original.CanvasWidth+2*shadow.BorderWidth);
      // Reset like the normal graph Draw() entry point; never draw live model.
      shadow.Reset(true);
      if(shadow.ClientResetFunc)shadow.ClientResetFunc(shadow);
      // Known direct assignments still omitted from the command stream.
      var bootstrap=bootstrapValues(original,options.bootstrapOverrides);
      if(options.restoreFrameBootstrap && frame && frame.bootstrap){
        bootstrap=(typeof globalThis!=='undefined'&&globalThis.SceneFrame?
          globalThis.SceneFrame:require('./SceneFrame')).validateBootstrap(frame.bootstrap);
      }
      if(options.restoreFrameBootstrap && frame && frame.bootstrap){
        bootstrap=(typeof globalThis!=='undefined'&&globalThis.SceneFrame?
          globalThis.SceneFrame:require('./SceneFrame')).validateBootstrap(frame.bootstrap);
      }
      shadow.MaxCurveSegments=bootstrap.MaxCurveSegments;
      shadow.SetAngleMeasure(bootstrap.AngleMeasure);
      // Camera and viewport changes are replayed in trace order, not inferred
      // from the final state of the live graph.
      var pipeline,clippingTrace=[];
      var paintOperations=observePaint(shadow.Context2D,function(){
        pipeline=observePipeline(shadow,function(){
          if(frame){
            var renderer=typeof globalThis!=='undefined'&&globalThis.SceneFrameRenderer?
              globalThis.SceneFrameRenderer:require('./SceneFrameRenderer');
            renderer.render(shadow,frame,{JsgPolygon:polygonCtor});
          }else adapter.replay(shadow,trace,{JsgPolygon:polygonCtor});
        },clippingTrace);
      });
      var analysis=exportImages?analyzePixels(original.Canvas,canvas):null;
      var paired=comparePair(original.Canvas,canvas);
      return {ok:true,comparison:paired.comparison,
        diagnostics:analysis?analysis.diagnostics:null,images:analysis?analysis.images:null,
        paintOperations:paintOperations,pipeline:pipeline,clippingTrace:clippingTrace,
        bootstrap:bootstrap,
        pixelEvidence:paired.pixelEvidence,
        replayVerified:false,
        reason:'Detached canvas compared; uncaptured graph state prevents a parity guarantee'};
    }catch(error){
      return {ok:false,reason:String(error&&error.message||error),replayVerified:false};
    }finally{
      prototype.CreateDomObjects=create;
      if(shadow&&shadow.DrawTimer)clearTimeout(shadow.DrawTimer);
      if(shadow&&shadow.ResizeTimer)clearTimeout(shadow.ResizeTimer);
    }
  }
  return {comparePixels:comparePixels,pixelEvidence:pixelEvidence,snapshotCanvas:snapshotCanvas,snapshotTimeline:snapshotTimeline,comparePair:comparePair,captureFingerprint:captureFingerprint,frameFingerprint:frameFingerprint,analyzePixels:analyzePixels,observePaint:observePaint,observePipeline:observePipeline,firstClippingDifference:firstClippingDifference,bootstrapValues:bootstrapValues,run:run};
}));
