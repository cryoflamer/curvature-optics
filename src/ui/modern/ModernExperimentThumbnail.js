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
  function capture(doc,mode,views){
    if(!doc||typeof doc.createElement!=='function'||
      !['scene','compare'].includes(mode)||!Array.isArray(views)||
      views.length!==(mode==='scene'?1:2))return null;
    try{
      var canvas=doc.createElement('canvas');
      if(!canvas||!canvas.getContext||!canvas.toDataURL)return null;
      var ctx=canvas.getContext('2d');
      if(!ctx||typeof ctx.drawImage!=='function')return null;
      canvas.width=VIEW_WIDTH*views.length;canvas.height=VIEW_HEIGHT;
      for(var i=0;i<views.length;i++){
        var view=views[i];
        if(!view||!Array.isArray(view.layers)||!view.layers.length)return null;
        var primary=view.layers[0];
        if(!primary||!(primary.width>0)||!(primary.height>0))return null;
        var x=i*VIEW_WIDTH,scale=Math.min(VIEW_WIDTH/primary.width,VIEW_HEIGHT/primary.height);
        var width=Math.max(1,Math.round(primary.width*scale));
        var height=Math.max(1,Math.round(primary.height*scale));
        var left=x+Math.floor((VIEW_WIDTH-width)/2),top=Math.floor((VIEW_HEIGHT-height)/2);
        ctx.fillStyle='#192d47';ctx.fillRect(x,0,VIEW_WIDTH,VIEW_HEIGHT);
        view.layers.forEach(function(layer){
          if(!layer||layer.width!==primary.width||layer.height!==primary.height)
            throw RangeError('Screenshot layers must have matching dimensions');
          ctx.drawImage(layer,left,top,width,height);
        });
        if(mode==='compare'){
          ctx.fillStyle='rgba(12,31,54,.86)';ctx.fillRect(x+6,6,24,22);
          ctx.fillStyle='#fff';ctx.font='bold 14px Arial';ctx.fillText(i===0?'A':'B',x+13,22);
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
