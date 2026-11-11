/* Deterministic, pixel-preserving Compare A/B video composition.
 * The two already painted, opaque Accurate RK4 view canvases (including
 * optional camera telemetry) are placed 1:1 inside a presentation frame
 * with the same aspect ratio as each view (16:9 for standard export presets).
 * This module deliberately does NOT encode VideoFrames, change the existing
 * two-video ZIP export, or perform optical calculations. Those integrations
 * belong to the subsequent single-video pipeline stage.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationCompareComposition=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function layout(viewWidth,viewHeight){
    // Match the validated export resolution envelope, not the display CSS size.
    if(!Number.isInteger(viewWidth)||!Number.isInteger(viewHeight)||
      viewWidth<320||viewHeight<180||viewWidth>1920||viewHeight>1080||
      viewWidth*viewHeight>2073600)
      throw RangeError('Invalid Compare composition view dimensions');
    var y=Math.floor(viewHeight/2);
    return Object.freeze({width:viewWidth*2,height:viewHeight*2,
      viewWidth:viewWidth,viewHeight:viewHeight,
      panels:Object.freeze({
        A:Object.freeze({x:0,y:y,width:viewWidth,height:viewHeight}),
        B:Object.freeze({x:viewWidth,y:y,width:viewWidth,height:viewHeight})
      })});
  }
  function view(source,side,dimensions,target){
    if(!source||source.quality!=='accurate'||
      (source.metrics&&source.metrics.opticalQuality&&
      source.metrics.opticalQuality!=='accurate')||
      !source.canvas||source.canvas===target||
      source.canvas.width!==dimensions.viewWidth||
      source.canvas.height!==dimensions.viewHeight||
      !source.cameraModel||![1,2].includes(source.cameraModel.showModel))
      throw RangeError('Compare '+side+' requires an independent, painted Globe/Flat view');
    return {canvas:source.canvas,
      label:side+' · '+(source.cameraModel.showModel===2?'FLAT':'GLOBE')};
  }
  function clock(ms){
    var centiseconds=Math.round(ms/10),minutes=Math.floor(centiseconds/6000),
      seconds=Math.floor((centiseconds%6000)/100),fraction=centiseconds%100;
    return String(minutes).padStart(2,'0')+':'+String(seconds).padStart(2,'0')+
      '.'+String(fraction).padStart(2,'0');
  }
  function timing(options){
    if(options.timeMs===undefined&&options.durationMs===undefined)return null;
    var t=options.timeMs,d=options.durationMs;
    if(typeof t!=='number'||!Number.isFinite(t)||typeof d!=='number'||
      !Number.isFinite(d)||!(d>0)||t<0||t>d)
      throw RangeError('Invalid Compare composition presentation time');
    return clock(t)+' / '+clock(d);
  }
  // The target is a distinct OffscreenCanvas (or compatible fixed-size Canvas).
  // Inputs must already have opaque backing and optional HUD painted; neither
  // is modified, cropped, scaled or resampled here. Calls are independent and
  // deterministic for a fixed pair of view pixels, models and presentation time.
  function paint(target,images,options){
    options=options||{};
    if(!target||!Number.isInteger(target.width)||!Number.isInteger(target.height)||
      typeof target.getContext!=='function')
      throw TypeError('Fixed-size Compare composition Canvas required');
    var dimensions=layout(target.width/2,target.height/2);
    var a=view(images&&images.A,'A',dimensions,target);
    var b=view(images&&images.B,'B',dimensions,target);
    var time=timing(options),mode=options.animationMode;
    if(mode!==undefined&&mode!=='camera'&&mode!=='physical')
      throw RangeError('Invalid Compare composition animation mode');
    var ctx=target.getContext('2d');
    if(!ctx||typeof ctx.save!=='function'||typeof ctx.restore!=='function'||
      typeof ctx.setTransform!=='function'||typeof ctx.fillRect!=='function'||
      typeof ctx.drawImage!=='function'||typeof ctx.fillText!=='function')
      throw TypeError('Canvas 2D Compare composition unavailable');
    var scale=Math.max(0.7,Math.min(2,dimensions.viewWidth/960));
    var top=dimensions.panels.A.y,bottom=top+dimensions.viewHeight;
    var pad=Math.round(22*scale),titleSize=Math.round(22*scale),
      labelSize=Math.round(19*scale),footerSize=Math.round(18*scale);
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalAlpha=1;
      ctx.globalCompositeOperation='source-over';
      ctx.imageSmoothingEnabled=false;
      ctx.fillStyle='#101923';
      ctx.fillRect(0,0,dimensions.width,dimensions.height);
      // A/B pixels are deliberately copied at integer coordinates 1:1.
      // Labels and timing only occupy the otherwise empty letterbox areas.
      ctx.drawImage(a.canvas,dimensions.panels.A.x,top);
      ctx.drawImage(b.canvas,dimensions.panels.B.x,top);
      ctx.textAlign='left';ctx.textBaseline='top';
      ctx.fillStyle='#d9e8f3';
      ctx.font='600 '+titleSize+'px Arial, sans-serif';
      ctx.fillText('COMPARE A / B',pad,pad);
      ctx.font='600 '+labelSize+'px Arial, sans-serif';
      ctx.fillText(a.label,pad,top-labelSize-pad);
      ctx.fillText(b.label,dimensions.viewWidth+pad,top-labelSize-pad);
      ctx.font='400 '+footerSize+'px Arial, sans-serif';
      ctx.fillStyle='#aac2d5';
      var detail=mode==='camera'?'CAMERA ANIMATION':
        mode==='physical'?'PHYSICAL ANIMATION':'ANIMATION';
      ctx.fillText(detail,pad,bottom+pad);
      if(time!==null)ctx.fillText(time,dimensions.viewWidth+pad,bottom+pad);
    }finally{ctx.restore();}
    return target;
  }
  return Object.freeze({layout:layout,paint:paint});
}));
