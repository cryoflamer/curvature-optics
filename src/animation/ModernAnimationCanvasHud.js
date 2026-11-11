/* Optional, deterministic telemetry burn-in for Animation PNG and video frames.
 * Draw AFTER opaque background compositing, BEFORE PNG serialization/VideoFrame.
 * Read the same updated model used by the physical painter; never trace rays.
 */
(function(root,factory){
  var telemetry=root.CurvatureModernCameraTelemetry;
  if(typeof module==='object'&&module.exports)
    telemetry=require('../camera/ModernCameraTelemetry');
  var api=factory(telemetry);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationCanvasHud=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(telemetry){
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
  function paint(canvas,model){
    if(!canvas||!(canvas.width>0&&canvas.height>0)||
      typeof canvas.getContext!=='function')
      throw TypeError('Fixed-size Canvas required for camera telemetry');
    // Validate the model first, before touching the Canvas. An invalid model
    // must abort the export rather than silently produce unlabelled frames.
    var text=rows(model),ctx=canvas.getContext('2d');
    if(!ctx||typeof ctx.save!=='function'||typeof ctx.restore!=='function'||
      typeof ctx.fillRect!=='function'||typeof ctx.fillText!=='function'||
      typeof ctx.setTransform!=='function'||typeof ctx.measureText!=='function')
      throw TypeError('Canvas 2D text rendering required for camera telemetry');
    var scale=Math.max(0.72,Math.min(1.5,canvas.width/960));
    var pad=10*scale,line=18*scale,top=9*scale;
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
      ctx.textAlign='left';ctx.textBaseline='top';
      ctx.font='600 '+Math.round(12*scale)+'px Arial, sans-serif';
      var max=0;
      text.forEach(function(row){max=Math.max(max,ctx.measureText(row).width);});
      var width=Math.min(canvas.width-2*top,max+2*pad),height=text.length*line+pad*2;
      ctx.fillStyle='rgba(12,24,38,0.88)';ctx.fillRect(top,top,width,height);
      ctx.fillStyle='#d6e8f6';
      text.forEach(function(row,index){
        ctx.fillStyle=index===0?'#b9d8ef':'#d6e8f6';
        ctx.fillText(row,top+pad,top+pad+index*line,Math.max(1,width-2*pad));
      });
    }finally{ctx.restore();}
    return canvas;
  }
  return Object.freeze({rows:rows,paint:paint});
}));
