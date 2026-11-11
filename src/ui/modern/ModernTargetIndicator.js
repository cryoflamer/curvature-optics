/* Geometric, optics-independent direction indicator for Modern Scene, Compare,
 * Animation Studio playback and deterministic PNG/video burn-in. Never traces
 * rays and never claims that an object is optically visible. */
(function(root,factory){
  var direction=root.CurvatureModernTargetDirection;
  if(typeof module==='object'&&module.exports)
    direction=require('../../camera/ModernTargetDirection');
  var api=factory(direction);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernTargetIndicator=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(direction){
  'use strict';
  var VIEWS=['Scene','A','B'];
  var ARROWS={left:'\u2190',right:'\u2192',above:'\u2191',below:'\u2193',behind:'\u21b6'};
  function selection(value){
    if(value===undefined||value===null)return 'scene';
    if(!['scene','group-0','group-1'].includes(value))
      throw RangeError('Invalid target indicator selection');
    return value;
  }
  function choose(value){
    var chosen=selection(value);
    return chosen==='scene'?{kind:'scene'}:{kind:'group',groupIndex:Number(chosen.slice(-1))};
  }
  function description(model,value){
    if(!direction||typeof direction.measure!=='function')
      throw Error('Target direction geometry unavailable');
    var chosen=selection(value),sample=direction.measure(model,choose(chosen));
    // The target can be inside the camera frustum but blocked by curvature,
    // terrain or refraction. That is NOT an off-screen geometric direction.
    if(!sample||sample.inView||sample.direction==='here'||sample.direction==='ahead')return null;
    var label=chosen==='scene'?'Towers':chosen==='group-0'?'Group 1':'Group 2';
    var distance=sample.distanceMeters>=1000?
      (sample.distanceMeters/1000).toFixed(1)+' km':Math.round(sample.distanceMeters)+' m';
    return Object.freeze({direction:sample.direction,
      arrow:ARROWS[sample.direction],label:label,
      text:label+' \u00b7 '+sample.direction.toUpperCase()+' \u00b7 '+distance,
      distanceMeters:sample.distanceMeters});
  }
  function create(options){
    var doc=options&&options.document;
    if(!doc||typeof doc.createElement!=='function')
      throw TypeError('Target indicator requires a document');
    var entries=Object.create(null);
    function ensure(view,canvas){
      if(!VIEWS.includes(view)||!canvas||!canvas.parentNode)return null;
      var parent=canvas.parentNode,entry=entries[view];
      if(entry&&entry.parent===parent&&entry.node.parentNode===parent)return entry;
      if(entry&&entry.node.parentNode)entry.node.parentNode.removeChild(entry.node);
      var node=doc.createElement('div');
      node.className='modern-target-direction';
      node.setAttribute('role','status');node.setAttribute('aria-live','off');
      node.setAttribute('aria-label','Geometric direction to towers');
      var arrow=doc.createElement('strong'),caption=doc.createElement('span');
      node.appendChild(arrow);node.appendChild(caption);parent.appendChild(node);
      entry={parent:parent,node:node,arrow:arrow,caption:caption};entries[view]=entry;
      return entry;
    }
    function update(view,canvas,model,value){
      var entry=ensure(view,canvas);if(!entry)return false;
      try{
        var status=description(model,value);
        if(!status){entry.node.hidden=true;return false;}
        entry.node.setAttribute('data-direction',status.direction);
        entry.arrow.textContent=status.arrow;
        entry.caption.textContent=status.text;
        entry.node.hidden=false;return true;
      }catch(error){entry.node.hidden=true;return false;}
    }
    function hide(view){if(entries[view])entries[view].node.hidden=true;}
    function hideAll(){VIEWS.forEach(hide);}
    return Object.freeze({update:update,hide:hide,hideAll:hideAll});
  }
  // A small bottom-centred pill. Same descriptor, layout and typography in
  // playback/DOM and exported pixels. On-screen DOM scales with its viewport;
  // exported Canvas scales with the independently selected output resolution.
  function paint(canvas,model,value){
    if(!canvas||!(canvas.width>0&&canvas.height>0)||typeof canvas.getContext!=='function')
      throw TypeError('Target indicator requires a fixed-size Canvas');
    var status=description(model,value);
    if(!status)return canvas;
    var ctx=canvas.getContext('2d');
    if(!ctx||typeof ctx.save!=='function'||typeof ctx.restore!=='function'||
      typeof ctx.setTransform!=='function'||typeof ctx.measureText!=='function'||
      typeof ctx.fillRect!=='function'||typeof ctx.fillText!=='function')
      throw TypeError('Target indicator Canvas text rendering unavailable');
    var scale=Math.max(.72,Math.min(1.5,canvas.width/960));
    var margin=9*scale,pad=10*scale,line=20*scale;
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
      ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.font='600 '+Math.round(12*scale)+'px Arial, sans-serif';
      var full=status.arrow+'  '+status.text;
      var width=Math.min(canvas.width-2*margin,Math.max(1,ctx.measureText(full).width+2*pad));
      var height=Math.min(canvas.height-2*margin,line+2*pad);
      var x=(canvas.width-width)/2,y=canvas.height-margin-height;
      ctx.fillStyle='rgba(17,41,59,.85)';ctx.fillRect(x,y,width,height);
      ctx.fillStyle='#ffffff';ctx.fillText(full,x+pad,y+height/2,Math.max(1,width-2*pad));
    }finally{ctx.restore();}
    return canvas;
  }
  return Object.freeze({selection:selection,description:description,create:create,paint:paint});
}));
