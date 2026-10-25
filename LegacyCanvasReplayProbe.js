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
  function comparePixels(a,b){
    if(!a||!b||a.width!==b.width||a.height!==b.height)
      return {ok:false,reason:'Canvas dimensions differ',
        originalSize:{width:a&&a.width,height:a&&a.height},
        replaySize:{width:b&&b.width,height:b&&b.height}};
    var left=a.getContext('2d').getImageData(0,0,a.width,a.height).data;
    var right=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
    var mismatched=0,maxDifference=0;
    for(var i=0;i<left.length;i+=4){
      var different=false;
      for(var k=0;k<4;k++){
        var delta=Math.abs(left[i+k]-right[i+k]);
        if(delta){different=true;maxDifference=Math.max(maxDifference,delta);}
      }
      if(different)mismatched++;
    }
    return {ok:true,width:a.width,height:a.height,mismatchedPixels:mismatched,
      totalPixels:a.width*a.height,maxChannelDifference:maxDifference,
      identical:mismatched===0};
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
  function run(original,trace,GraphCtor,polygonCtor,exportImages){
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
      shadow.MaxCurveSegments=original.MaxCurveSegments;
      shadow.SetAngleMeasure(original.AngleMeasure);
      // Camera and viewport changes are replayed in trace order, not inferred
      // from the final state of the live graph.
      var paintOperations=observePaint(shadow.Context2D,function(){
        adapter.replay(shadow,trace,{JsgPolygon:polygonCtor});
      });
      var analysis=exportImages?analyzePixels(original.Canvas,canvas):null;
      return {ok:true,comparison:analysis?analysis.comparison:comparePixels(original.Canvas,canvas),
        diagnostics:analysis?analysis.diagnostics:null,images:analysis?analysis.images:null,
        paintOperations:paintOperations,
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
  return {comparePixels:comparePixels,analyzePixels:analyzePixels,observePaint:observePaint,run:run};
}));
