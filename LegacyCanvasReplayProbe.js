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
      return {ok:false,reason:'Canvas dimensions differ'};
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
  function run(original,trace,GraphCtor,polygonCtor){
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
        this.CanvasRatioHW=canvas.height/canvas.width;
      };
      try{
        shadow=new GraphCtor({Width:original.CanvasWidth,Height:original.CanvasHeight,
          AutoReset:true,AutoClear:true,AutoScalePix:original.AutoScalePix});
      }finally{prototype.CreateDomObjects=create;}
      // Reset like the normal graph Draw() entry point; never draw live model.
      shadow.Reset(true);
      if(shadow.ClientResetFunc)shadow.ClientResetFunc(shadow);
      // Explicit known direct assignments omitted from the command stream.
      shadow.MaxCurveSegments=original.MaxCurveSegments;
      shadow.SetAngleMeasure(original.AngleMeasure);
      shadow.SetCameraClipping(original.CameraClipNear || 0.001);
      shadow.SetWindowToCameraScreen();
      adapter.replay(shadow,trace,{JsgPolygon:polygonCtor});
      return {ok:true,comparison:comparePixels(original.Canvas,canvas),
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
  return {comparePixels:comparePixels,run:run};
}));
