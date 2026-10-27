/* Diagnostic orthographic viewer for world-space scene primitives.
 * Does not use GraphX3DX drawing, camera, clipping or style state.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureScenePreview=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var AXES={xy:[0,1],xz:[0,2],yz:[1,2]};
  function project(scene,view,width,height,padding,verticalFactor){
    verticalFactor=verticalFactor===undefined?1:verticalFactor;
    if(!Number.isFinite(verticalFactor)||verticalFactor<=0)throw new RangeError('Invalid vertical factor');
    if(!scene||!Array.isArray(scene.primitives))throw new TypeError('Scene primitives required');
    if(!Object.prototype.hasOwnProperty.call(AXES,view))throw new TypeError('Unknown orthographic view');
    if(!(width>0&&height>0))throw new RangeError('Positive dimensions required');
    padding=padding===undefined?16:padding;
    if(!(padding>=0&&2*padding<Math.min(width,height)))throw new RangeError('Invalid padding');
    var axes=AXES[view],raw=scene.primitives.map(function(p){
      if(p.type!=='line'&&p.type!=='polygon')throw new TypeError('Unknown primitive');
      return {type:p.type,commandIndex:p.commandIndex,points:p.points.map(function(v){
        if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw new TypeError('Invalid world point');
        return [v[axes[0]],v[axes[1]]*verticalFactor];
      })};
    });
    var all=raw.flatMap(function(p){return p.points;});
    if(!all.length)return {primitives:[],bounds:null,scale:1};
    var minX=Math.min.apply(null,all.map(function(p){return p[0];})),maxX=Math.max.apply(null,all.map(function(p){return p[0];}));
    var minY=Math.min.apply(null,all.map(function(p){return p[1];})),maxY=Math.max.apply(null,all.map(function(p){return p[1];}));
    var dx=maxX-minX,dy=maxY-minY;
    var scale=Math.min((width-2*padding)/(dx||1),(height-2*padding)/(dy||1));
    var midX=(minX+maxX)/2,midY=(minY+maxY)/2;
    return {bounds:{minX:minX,maxX:maxX,minY:minY,maxY:maxY},scale:scale,
      primitives:raw.map(function(p){return {type:p.type,commandIndex:p.commandIndex,points:p.points.map(function(v){
        return [width/2+(v[0]-midX)*scale,height/2-(v[1]-midY)*scale];
      })};})};
  }
  function draw(canvas,scene,view,verticalFactor){
    if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('Canvas required');
    var ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('2D context unavailable');
    var result=project(scene,view,canvas.width,canvas.height,undefined,verticalFactor);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle='#333';ctx.lineWidth=0.8;
    result.primitives.forEach(function(p){
      if(!p.points.length)return;
      ctx.beginPath();ctx.moveTo(p.points[0][0],p.points[0][1]);
      p.points.slice(1).forEach(function(v){ctx.lineTo(v[0],v[1]);});
      if(p.type==='polygon')ctx.closePath();
      ctx.stroke();
    });
    return result;
  }
  function bounds3D(scene){
    var b={x:[Infinity,-Infinity],y:[Infinity,-Infinity],z:[Infinity,-Infinity]};
    scene.primitives.forEach(function(p){p.points.forEach(function(v){
      if(!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite))throw new TypeError('Invalid world point');
      ['x','y','z'].forEach(function(k,i){b[k][0]=Math.min(b[k][0],v[i]);b[k][1]=Math.max(b[k][1],v[i]);});
    });});
    return scene.primitives.length?b:null;
  }
  function autoVerticalFactor(scene,view){
    var b=bounds3D(scene);if(!b)return 1;
    var horizontal=view==='xz'?'x':'y';
    var dx=b[horizontal][1]-b[horizontal][0],dz=b.z[1]-b.z[0];
    return dx>0&&dz>0?Math.max(1,Math.min(1000000,dx/dz)):1;
  }
  return {project:project,draw:draw,bounds3D:bounds3D,autoVerticalFactor:autoVerticalFactor};
}));
