/* Shared, read-only Modern camera telemetry for Scene, Compare and Animation.
 * Inputs are the fully updated physical render model for the corresponding
 * viewport/frame, NOT DOM form fields or a separately sampled camera.
 * No ray tracing, renderer mutation, persistence or Legacy dependencies.
 */
(function(root,factory){
  var camera=root.CurvaturePhysicalCamera;
  if(typeof module==='object'&&module.exports)
    camera=require('../app/CurvaturePhysicalCamera');
  var api=factory(camera);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCameraTelemetry=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(physicalCamera){
  'use strict';
  var DEG=180/Math.PI;
  function finite(value,name){
    if(typeof value!=='number'||!Number.isFinite(value))
      throw RangeError('Invalid camera telemetry '+name);
    return value;
  }
  // East/North are the authored observer's surface-arc offsets from the
  // experiment origin. Their hypotenuse is a surface geodesic on Globe (as in
  // CurvatureCameraTranslation.frame), and planar distance on Flat. It is
  // neither slant range nor distance to any tower / optical horizon.
  function measure(model){
    if(!model||typeof model!=='object')throw TypeError('Updated physical camera model required');
    if(model.showModel!==1&&model.showModel!==2)
      throw RangeError('Camera telemetry requires Globe or Flat geometry');
    var height=finite(model.Height,'height'),east=finite(model.CameraEast,'east'),
      north=finite(model.CameraNorth,'north'),pan=finite(model.Pan,'pan'),
      nick=finite(model.Nick,'nick'),roll=finite(model.Roll,'roll'),
      fov=finite(model.camViewAngle,'view angle');
    if(height<0||!(fov>0&&fov<Math.PI))throw RangeError('Invalid physical camera telemetry geometry');
    if(!physicalCamera||typeof physicalCamera.create!=='function')
      throw Error('Physical camera is required for telemetry aim');
    // CurvaturePhysicalCamera.create owns the exact aim-mode mapping. Do not
    // approximate dip with a flat horizon, or derive pitch from Nick alone.
    var aim=finite(physicalCamera.create(model).aimDip,'aim dip')*DEG;
    return Object.freeze({
      geometry:model.showModel===2?'flat':'globe',
      heightMeters:height,eastMeters:east,northMeters:north,
      distanceFromOriginMeters:Math.hypot(east,north),
      headingDegrees:pan,nickDegrees:nick,aimDipDegrees:aim,
      pitchDegrees:nick-aim,rollDegrees:roll,fovDegrees:fov*DEG
    });
  }
  function trimZero(value){return Object.is(value,-0)?0:value;}
  function length(meters){
    finite(meters,'length');
    var distance=Math.abs(meters),km=distance>=1000;
    var value=km?meters/1000:meters;
    // Preserve centimetres at observer scale; use kilometres for long travel.
    var places=km?2:distance<10?2:1;
    var text=trimZero(Number(value.toFixed(places))).toFixed(places);
    return text+(km?' km':' m');
  }
  function angle(degrees){
    finite(degrees,'angle');
    var magnitude=Math.abs(degrees),places=magnitude>0&&magnitude<0.05?4:
      magnitude<1&&magnitude>0?2:1;
    return trimZero(Number(degrees.toFixed(places))).toFixed(places)+'°';
  }
  function format(sample){
    if(!sample||typeof sample!=='object')throw TypeError('Camera telemetry sample required');
    // The same text is suitable for a DOM overlay and Canvas fillText.
    return Object.freeze({geometry:sample.geometry,
      height:length(sample.heightMeters),distance:length(sample.distanceFromOriginMeters),
      east:length(sample.eastMeters),north:length(sample.northMeters),
      heading:angle(sample.headingDegrees),pitch:angle(sample.pitchDegrees),
      nick:angle(sample.nickDegrees),roll:angle(sample.rollDegrees),
      fov:angle(sample.fovDegrees)});
  }
  return Object.freeze({measure:measure,format:format,formatLength:length,formatAngle:angle});
}));
