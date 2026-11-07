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
    var mode=spec.mode||'rotate';
    if(mode!=='rotate'&&mode!=='translate')throw RangeError('Unknown camera drag mode');
    if(!camera)throw TypeError('Drag camera required');
    var fov=spec.fovRadians,aspect=spec.aspectRatio;
    if(fov!==undefined&&!(finite(fov,'field of view')>0&&fov<Math.PI))
      throw RangeError('Invalid drag field of view');
    if(aspect!==undefined&&!(finite(aspect,'aspect ratio')>0))
      throw RangeError('Invalid drag aspect ratio');
    var heightMetres=mode==='translate'?finite(camera.Height,'height'):camera.Height;
    var east=mode==='translate'?finite(camera.CameraEast,'east'):camera.CameraEast;
    var north=mode==='translate'?finite(camera.CameraNorth,'north'):camera.CameraNorth;
    var reference=mode==='translate'?finite(spec.referenceDistance,'reference distance'):null;
    if(mode==='translate'&&!(reference>0&&fov>0&&aspect>0))
      throw RangeError('Translation requires calibrated viewport and positive reference distance');
    return {viewport:spec.viewport,width:width,height:height,origin:origin,
      mode:mode,referenceDistance:reference,
      fovRadians:fov,aspectRatio:aspect,
      camera:{Pan:finite(camera.Pan,'Pan'),Nick:finite(camera.Nick,'Nick'),
        Roll:finite(camera.Roll,'Roll'),Height:heightMetres,CameraEast:east,CameraNorth:north}};
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
  function translate(sample){
    if(!sample||sample.mode!=='translate'||!(sample.referenceDistance>0)||
       !(sample.fovRadians>0))throw RangeError('Translation drag calibration required');
    var m=sample.camera,pan=m.Pan*Math.PI/180;
    var scale=2*sample.referenceDistance*Math.tan(sample.fovRadians/2)/
      Math.hypot(sample.width,sample.height);
    var east=m.CameraEast+sample.dx*scale*Math.cos(pan);
    var north=m.CameraNorth-sample.dx*scale*Math.sin(pan);
    return Object.freeze({Height:Math.max(.001,Math.min(1e9,m.Height-sample.dy*scale)),
      CameraEast:Math.max(-1e7,Math.min(1e7,east)),
      CameraNorth:Math.max(-1e7,Math.min(1e7,north))});
  }
  function wheelSteps(deltaY,deltaMode){
    finite(deltaY,'wheel delta');
    if(deltaMode!==undefined&&![0,1,2].includes(deltaMode))
      throw RangeError('Invalid wheel delta mode');
    return Math.max(-4,Math.min(4,deltaY/(deltaMode===1?3:deltaMode===2?1:100)));
  }
  function dolly(camera,deltaY,deltaMode,referenceDistance,stepMetres){
    if(!camera)throw TypeError('Camera required for dolly');
    var pan=finite(camera.Pan,'pan')*Math.PI/180;
    var east=finite(camera.CameraEast,'east'),north=finite(camera.CameraNorth,'north');
    var depth=finite(referenceDistance,'dolly reference distance');
    if(!(depth>0))throw RangeError('Dolly reference distance must be positive');
    // At the default Pontchartrain distances this is ~100 metres per notch.
    var step=stepMetres===undefined||stepMetres==='auto'?
      Math.max(.1,Math.min(1000,depth/100)):stepMetres;
    if(typeof step!=='number'||!Number.isFinite(step)||step<=0)
      throw RangeError('Invalid dolly step');
    var metres=-wheelSteps(deltaY,deltaMode)*step;
    return Object.freeze({CameraEast:Math.max(-1e7,Math.min(1e7,east+metres*Math.sin(pan))),
      CameraNorth:Math.max(-1e7,Math.min(1e7,north+metres*Math.cos(pan)))});
  }
  // Focal length is the shared Scene/Compare camera parameter. Match the
  // actual CurveApp.Update FOV limits, rather than accepting a focal value
  // which the physical camera would immediately clamp to a different one.
  var focalMin=43.2/(2*Math.tan(160*Math.PI/360));
  var focalMax=43.2/(2*Math.tan(0.1*Math.PI/360));
  function focalWheel(current,deltaY,deltaMode){
    finite(current,'focal length');finite(deltaY,'wheel delta');
    if(current<=0)throw RangeError('Invalid focal length');
    if(deltaY===0)return current;
    // Opera/Chromium mice commonly report 100 px or three lines per notch.
    // Trackpads can report fractional pixel deltas; cap one event at four
    // notches so an unusually large OS delta cannot jump the whole range.
    var steps=wheelSteps(deltaY,deltaMode);
    var next=current*Math.pow(1.1,-steps);
    return Math.max(focalMin,Math.min(focalMax,next));
  }
  function focalViewAngle(focal){
    finite(focal,'focal length');
    if(focal<=0)throw RangeError('Invalid focal length');
    return 2*Math.atan(43.2/(2*focal))*180/Math.PI;
  }
  function create(handlers){
    handlers=handlers||{};
    var active=null,latest=null;
    function sample(position){
      var p=point(position),origin=active.origin;
      return Object.freeze({viewport:active.viewport,width:active.width,height:active.height,
        origin:Object.freeze({x:origin.x,y:origin.y}),mode:active.mode,
        referenceDistance:active.referenceDistance,
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
  return Object.freeze({create:create,angles:angles,focalWheel:focalWheel,
    focalViewAngle:focalViewAngle,translate:translate,dolly:dolly,focalLimits:Object.freeze({min:focalMin,max:focalMax})});
}));
