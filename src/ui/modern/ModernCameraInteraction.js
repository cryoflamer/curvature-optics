/* Pointer-independent drag transaction for Modern Scene and Compare.
 * The same interaction represents a shared camera regardless of which
 * viewport originated the gesture. No DOM, geometry or optical side effects.
 * Pointer event wiring belongs to ModernApp; angle mapping is shared here.
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
    var fov=spec.fovRadians,aspect=spec.aspectRatio;
    if(fov!==undefined&&!(finite(fov,'field of view')>0&&fov<Math.PI))
      throw RangeError('Invalid drag field of view');
    if(aspect!==undefined&&!(finite(aspect,'aspect ratio')>0))
      throw RangeError('Invalid drag aspect ratio');
    return {viewport:spec.viewport,width:width,height:height,origin:origin,
      fovRadians:fov,aspectRatio:aspect,
      camera:{Pan:finite(camera.Pan,'Pan'),Nick:finite(camera.Nick,'Nick'),
        Roll:finite(camera.Roll,'Roll')}};
  }
  // Grab-the-picture convention: dragging right looks left, dragging down
  // looks up. PhysicalCamera's diagonal FOV and deviceRatio set the *true*
  // angular scale; client pixels (not HiDPI backing pixels) set the gesture.
  // Tangent mapping is accurate at the centre and well-behaved for large drags;
  // final image rendering always uses the authoritative camera model.
  function angles(sample){
    if(!sample||!(sample.width>0&&sample.height>0)||
       !(sample.fovRadians>0&&sample.fovRadians<Math.PI)||
       !(sample.aspectRatio>0))throw RangeError('Missing drag angular calibration');
    var halfTangent=Math.tan(sample.fovRadians/2)/Math.hypot(1,sample.aspectRatio);
    var h=Math.atan(2*halfTangent*sample.aspectRatio*sample.dx/sample.width)*180/Math.PI;
    var v=Math.atan(2*halfTangent*sample.dy/sample.height)*180/Math.PI;
    var roll=sample.camera.Roll*Math.PI/180,co=Math.cos(roll),si=Math.sin(roll);
    var pan=sample.camera.Pan-h*co+v*si;
    var nick=sample.camera.Nick+h*si+v*co;
    return Object.freeze({Pan:Math.max(-360,Math.min(360,pan)),
      Nick:Math.max(-90,Math.min(90,nick)),Roll:sample.camera.Roll});
  }
  function create(handlers){
    handlers=handlers||{};
    var active=null,latest=null;
    function sample(position){
      var p=point(position),origin=active.origin;
      return Object.freeze({viewport:active.viewport,width:active.width,height:active.height,
        origin:Object.freeze({x:origin.x,y:origin.y}),
        pointer:Object.freeze(p),dx:p.x-origin.x,dy:p.y-origin.y,
        fovRadians:active.fovRadians,aspectRatio:active.aspectRatio,
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
  return Object.freeze({create:create,angles:angles});
}));
