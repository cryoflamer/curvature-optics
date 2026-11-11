/* Optional, deterministic telemetry burn-in for Animation PNG and video frames.
 * Draw AFTER opaque background compositing, BEFORE PNG serialization/VideoFrame.
 * Read the same updated model used by the physical painter; never trace rays.
 */
(function(root,factory){
  var telemetry=root.CurvatureModernCameraTelemetry;
  var appearanceApi=root.CurvatureModernCameraHud;
  if(typeof module==='object'&&module.exports){
    telemetry=require('../camera/ModernCameraTelemetry');
    appearanceApi=require('../ui/modern/ModernCameraHud');
  }
  var api=factory(telemetry,appearanceApi);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationCanvasHud=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(telemetry,appearanceApi){
  'use strict';
  function rows(model){
    var value=telemetry.format(telemetry.measure(model));
    return Object.freeze([
      'CAMERA · '+(value.geometry==='flat'?'FLAT':'GLOBE'),
      'Height '+value.height+'  ·  Origin '+value.distance,
      'East '+value.east+'  ·  North '+value.north,
      'Heading '+value.heading+'  ·  Pitch '+value.pitch,
      'Roll '+value.roll+'  ·  FOV '+value.fov
    ]);
  }
  function paint(canvas,model,appearance){
    if(!canvas||!(canvas.width>0&&canvas.height>0)||
      typeof canvas.getContext!=='function')
      throw TypeError('Fixed-size Canvas required for camera telemetry');
    // Validate the model first, before touching the Canvas. An invalid model
    // must abort the export rather than silently produce unlabelled frames.
    var a=appearance===undefined?appearanceApi.normalizeAppearance():
      appearanceApi.validateAppearance(appearance);
    var text=rows(model),ctx=canvas.getContext('2d'),contrast=appearanceApi.textAppearance(a);
    if(!ctx||typeof ctx.save!=='function'||typeof ctx.restore!=='function'||
      typeof ctx.fillRect!=='function'||typeof ctx.fillText!=='function'||
      typeof ctx.setTransform!=='function'||typeof ctx.measureText!=='function'||
      typeof ctx.strokeText!=='function')
      throw TypeError('Canvas 2D text rendering required for camera telemetry');
    var scale=Math.max(0.72,Math.min(1.5,canvas.width/960))*a.size/100;
    var pad=10*scale,line=18*scale,margin=9*scale;
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
      ctx.textAlign='left';ctx.textBaseline='top';
      ctx.font='600 '+Math.round(12*scale)+'px Arial, sans-serif';
      var max=0;
      text.forEach(function(row){max=Math.max(max,ctx.measureText(row).width);});
      var width=Math.max(1,Math.min(canvas.width-2*margin,max+2*pad));
      var height=Math.max(1,Math.min(canvas.height-2*margin,text.length*line+pad*2));
      var x=a.position.endsWith('right')?canvas.width-margin-width:margin;
      var y=a.position.startsWith('bottom')?canvas.height-margin-height:margin;
      ctx.fillStyle='rgba(17,41,59,'+(a.opacity/100)+')';
      ctx.fillRect(x,y,width,height);
      ctx.lineJoin='round';ctx.lineWidth=Math.max(2,2.5*scale);
      ctx.strokeStyle=contrast.outline;
      text.forEach(function(row,index){
        ctx.fillStyle=index===0?contrast.heading:contrast.body;
        if(y+pad+index*line<y+height){
          var tx=x+pad,ty=y+pad+index*line,maxWidth=Math.max(1,width-2*pad);
          ctx.strokeText(row,tx,ty,maxWidth);
          ctx.fillText(row,tx,ty,maxWidth);
        }
      });
    }finally{ctx.restore();}
    return canvas;
  }
  return Object.freeze({rows:rows,paint:paint,
    normalizeAppearance:appearanceApi.normalizeAppearance,
    validateAppearance:appearanceApi.validateAppearance});
}));
