/* Curvature-independent physical viewport. This is an observer-fixed angular
 * camera, NOT the legacy horizon-distance bootstrap. The same local arrival
 * direction has the same pixels at all surface curvatures.
 */
(function(root,factory){
  var api=factory(root.CurvatureSurfaceGeometry||(typeof require==='function'?require('../geometry/CurvatureSurfaceGeometry'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePhysicalCamera=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(surfaces){
  'use strict';
  if(!surfaces)throw Error('Curvature surface geometry required');
  var REFERENCE_DISTANCE=1000;
  function radians(x){return x*Math.PI/180;}
  function finite(x,name){if(!Number.isFinite(x))throw RangeError('Invalid physical camera '+name);return x;}
  function create(m){
    if(!m)throw TypeError('Physical camera model required');
    var angle=finite(m.camViewAngle,'view angle'),ratio=finite(m.deviceRatio,'aspect ratio'),
      pan=radians(finite(m.Pan,'pan')),nick=radians(finite(m.Nick,'nick')),
      roll=radians(finite(m.Roll,'roll'));
    if(!(angle>0&&angle<Math.PI&&ratio>0))throw RangeError('Invalid physical camera field of view');
    var mode=m.viewcenterHorizon,eye=finite(m.Height,'eye height'),
      flat=m.showModel===2,R=finite(m.rEarth,'radius');
    if(eye<0||!(R>0))throw RangeError('Invalid physical camera geometry');
    var dip=flat?0:surfaces.createFromCurvature(1/R).geometricHorizon(eye).dipAngle;
    var fe=Math.atan(eye/finite(m.rFEarth,'flat reference radius'));
    var aim=mode===0?dip:mode===1?fe:mode===2?(dip+fe)/2:0;
    // With no finite horizon, "Horizon" means local eye level. Other legacy
    // aiming controls remain optional and intentionally act on camera tilt.
    var elevation=nick-aim,ce=Math.cos(elevation),se=Math.sin(elevation),
      sp=Math.sin(pan),cp=Math.cos(pan);
    var dir=[sp*ce,cp*ce,se];
    var side=[cp,-sp,0];
    var up=[-sp*se,-cp*se,ce];
    var rolled=up.map(function(v,i){return v*Math.cos(roll)+side[i]*Math.sin(roll);});
    // Keep the historical FOV/aspect convention without using geometric
    // horizon, R, or an infinitely distant camera target.
    var h=2*REFERENCE_DISTANCE*Math.tan(angle/2)/Math.sqrt(1+ratio*ratio),w=ratio*h;
    var sceneSize=ratio>1.5?w/1.5:h;
    return {pos:[0,0,0],center:dir.map(function(v){return v*REFERENCE_DISTANCE;}),
      up:rolled,sceneSize:sceneSize,aimDip:aim,
      referenceDistance:REFERENCE_DISTANCE,fieldOfViewRadians:angle};
  }
  return Object.freeze({create:create,REFERENCE_DISTANCE:REFERENCE_DISTANCE});
}));
