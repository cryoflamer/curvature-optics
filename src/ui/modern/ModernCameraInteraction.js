/* Pointer-independent drag transaction for Modern Scene and Compare.
 * The same interaction represents a shared camera regardless of which
 * viewport originated the gesture. No DOM, geometry or optical side effects.
 * Pointer event wiring and camera-angle mapping belong to patch 137.1.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCameraInteraction=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function finite(value,name){
    if(typeof value!=='number'||!Number.isFinite(value))throw RangeError('Invalid drag '+name);
    return value;
  }
  function point(value){
    if(!value)throw TypeError('Drag pointer required');
    return {x:finite(value.x,'x'),y:finite(value.y,'y')};
  }
  function startData(spec){
    if(!spec||!['Scene','A','B'].includes(spec.viewport))
      throw RangeError('Drag viewport must be Scene, A or B');
    var origin=point(spec),width=finite(spec.width,'width'),height=finite(spec.height,'height');
    if(width<=0||height<=0)throw RangeError('Drag viewport must have positive dimensions');
    var camera=spec.camera;
    if(!camera)throw TypeError('Drag camera required');
    return {viewport:spec.viewport,width:width,height:height,origin:origin,
      camera:{Pan:finite(camera.Pan,'Pan'),Nick:finite(camera.Nick,'Nick'),
        Roll:finite(camera.Roll,'Roll')}};
  }
  function create(handlers){
    handlers=handlers||{};
    var active=null,latest=null;
    function sample(position){
      var p=point(position),origin=active.origin;
      return Object.freeze({viewport:active.viewport,width:active.width,height:active.height,
        origin:Object.freeze({x:origin.x,y:origin.y}),
        pointer:Object.freeze(p),dx:p.x-origin.x,dy:p.y-origin.y,
        camera:Object.freeze(Object.assign({},active.camera))});
    }
    return Object.freeze({
      begin:function(spec){
        if(active)throw Error('Camera drag already active');
        active=startData(spec);
        latest=sample(active.origin);
        return latest;
      },
      move:function(position){
        if(!active)return null;
        latest=sample(position);
        if(typeof handlers.onPreview==='function')handlers.onPreview(latest);
        return latest;
      },
      end:function(position){
        if(!active)return null;
        if(position!==undefined)latest=sample(position);
        var result=latest;
        active=null;latest=null;
        if((result.dx!==0||result.dy!==0)&&typeof handlers.onCommit==='function')
          handlers.onCommit(result);
        return result;
      },
      cancel:function(){
        if(!active)return null;
        var result=latest;
        active=null;latest=null;
        if(typeof handlers.onCancel==='function')handlers.onCancel(result);
        return result;
      },
      isActive:function(){return active!==null;},
      snapshot:function(){return latest;}
    });
  }
  return Object.freeze({create:create});
}));
