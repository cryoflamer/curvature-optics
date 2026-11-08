/* Deterministic, bounded screenshots of completed physical Canvas frames.
 * Compare thumbnails contain BOTH distinct viewports. This module never
 * renders physics, reads the DOM UI, or modifies an experiment snapshot.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernExperimentThumbnail=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var MAX_DATA_LENGTH=750000,VIEW_WIDTH=480,VIEW_HEIGHT=300;
  // The physical painter intentionally clears its Canvas to transparent. In
  // the live Modern viewport CSS paints WHITE behind it; copying raw pixels
  // without that backdrop exposes the gallery's navy card background instead.
  var VIEWPORT_BACKGROUND='#fff';
  function capture(doc,mode,views){
    if(!doc||typeof doc.createElement!=='function'||
      !['scene','compare'].includes(mode)||!Array.isArray(views)||
      views.length!==(mode==='scene'?1:2))return null;
    try{
      var canvas=doc.createElement('canvas');
      if(!canvas||!canvas.getContext||!canvas.toDataURL)return null;
      var ctx=canvas.getContext('2d');
      if(!ctx||typeof ctx.drawImage!=='function')return null;
      // Fit the output to the source aspect ratio instead of adding artificial
      // dark bars inside a fixed 480 x 300 frame. All viewports share the
      // same source canvas geometry in the current Scene/Compare renderer.
      var first=views[0]&&views[0].layers&&views[0].layers[0];
      if(!first||!(first.width>0)||!(first.height>0))return null;
      var fit=Math.min(VIEW_WIDTH/first.width,VIEW_HEIGHT/first.height);
      var sideWidth=Math.max(1,Math.round(first.width*fit));
      var sideHeight=Math.max(1,Math.round(first.height*fit));
      canvas.width=sideWidth*views.length;canvas.height=sideHeight;
      // Recreate the actual displayed composition, not just the transparent
      // backing-store pixels: physical scene over white, then presentation
      // image and transparent guides, separately for both Compare viewports.
      // Draw the backing AFTER setting canvas dimensions (resizing resets 2D
      // state) and BEFORE any source/guide layers.
      if(typeof ctx.fillRect!=='function')return null;
      ctx.fillStyle=VIEWPORT_BACKGROUND;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      for(var i=0;i<views.length;i++){
        var view=views[i];
        if(!view||!Array.isArray(view.layers)||!view.layers.length)return null;
        var primary=view.layers[0];
        if(!primary||!(primary.width>0)||!(primary.height>0))return null;
        // Require consistent viewport proportions; otherwise fall back to a
        // thumbnail-less snapshot instead of misrepresenting either view.
        if(primary.width!==first.width||primary.height!==first.height)return null;
        var left=i*sideWidth,top=0,width=sideWidth,height=sideHeight;
        view.layers.forEach(function(layer){
          if(!layer||layer.width!==primary.width||layer.height!==primary.height)
            throw RangeError('Screenshot layers must have matching dimensions');
          ctx.drawImage(layer,left,top,width,height);
        });
        if(mode==='compare'){
          ctx.fillStyle='rgba(12,31,54,.86)';ctx.fillRect(left+6,6,24,22);
          ctx.fillStyle='#fff';ctx.font='bold 14px Arial';ctx.fillText(i===0?'A':'B',left+13,22);
        }
      }
      var dataUrl=canvas.toDataURL('image/webp',.72);
      if(!/^data:image\/(webp|png);base64,[a-z\d+/=]+$/i.test(dataUrl)||
        dataUrl.length>MAX_DATA_LENGTH)return null;
      return {dataUrl:dataUrl,width:canvas.width,height:canvas.height,mode:mode};
    }catch(error){return null;} // Tainted/non-exportable Canvas must not block save.
  }
  // A partial Compare redraw must not make an unchanged B appear stale when
  // only A physics changed; shared camera/objects invalidate both sides.
  function viewKey(snapshot,view){
    if(!snapshot||!snapshot.scene||!snapshot.compare||!snapshot.display)
      throw TypeError('A validated experiment is required');
    var common={eyeLevel:snapshot.display.eyeLevel,horizon:snapshot.display.horizon};
    if(view==='Scene')return JSON.stringify({scene:snapshot.scene,common:common});
    if(view!=='A'&&view!=='B')throw RangeError('Unknown screenshot viewport');
    return JSON.stringify({camera:snapshot.scene.camera,objects:snapshot.scene.objects,
      grid:snapshot.scene.showGrid,model:snapshot.compare[view],common:common});
  }
  function valid(value,mode){
    if(value===null||value===undefined)return null;
    if(!value||typeof value!=='object'||Array.isArray(value)||
      value.mode!==mode||!Number.isInteger(value.width)||!Number.isInteger(value.height)||
      value.width<1||value.width>1024||value.height<1||value.height>512||
      typeof value.dataUrl!=='string'||value.dataUrl.length>MAX_DATA_LENGTH||
      !/^data:image\/(webp|png);base64,[a-z\d+/=]+$/i.test(value.dataUrl))
      throw RangeError('Invalid experiment thumbnail');
    return {dataUrl:value.dataUrl,width:value.width,height:value.height,mode:mode};
  }
  return Object.freeze({capture:capture,validate:valid,viewKey:viewKey});
}));
