/* Recenter authored optical objects around a movable observer. The physical
 * renderer and ray field still operate in their observer-local tangent frame:
 * on a globe this is an exact rigid rotation of the spherical world, not a
 * flat displacement of tower bases. Surface guides remain observer-centred.
 * No Legacy scene state or camera orientation is changed here.
 */
(function(root,factory){
  var api=factory(root.CurvatureSceneContract||(typeof require==='function'?require('../scene/CurvatureSceneContract'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCameraTranslation=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  if(!contract)throw Error('Scene contract required for camera translation');
  function finite(x,label){
    if(typeof x!=='number'||!Number.isFinite(x))throw RangeError('Invalid '+label);
    return x;
  }
  function frame(east,north,height,curvature){
    finite(east,'camera east');finite(north,'camera north');
    if(Math.abs(east)>1e7||Math.abs(north)>1e7)throw RangeError('Camera offset exceeds 10000 km');
    if(finite(height,'observer height')<0)throw RangeError('Negative observer height');
    if(finite(curvature,'curvature')<0)throw RangeError('Negative surface curvature');
    var d=Math.hypot(east,north);
    if(curvature===0||d===0){
      return {origin:[east,north,0],right:[1,0,0],forward:[0,1,0],up:[0,0,1]};
    }
    var theta=d*curvature;
    if(theta>=Math.PI/2)throw RangeError('Camera is too far from the scene origin on this globe');
    var a=east/d,b=north/d,s=Math.sin(theta),c=Math.cos(theta),one=1-c;
    // Parallel-transport the original east/north basis along the observer's
    // shortest surface geodesic. This leaves local Pan/Nick/Roll unchanged.
    var right=[1-a*a*one,-a*b*one,-a*s];
    var forward=[-a*b*one,1-b*b*one,-b*s];
    var up=[a*s,b*s,c];
    var radius=1/curvature+height;
    // cos(theta)-1 is computed without catastrophic subtraction at large R.
    var origin=[radius*s*a,radius*s*b,-2*radius*Math.sin(theta/2)**2];
    return {origin:origin,right:right,forward:forward,up:up};
  }
  function pointAt(point,basis){
    var x=point[0]-basis.origin[0],y=point[1]-basis.origin[1],z=point[2]-basis.origin[2];
    function dot(axis){return x*axis[0]+y*axis[1]+z*axis[2];}
    return [dot(basis.right),dot(basis.forward),dot(basis.up)];
  }
  function apply(composed,options){
    if(!composed||!composed.scene||!Array.isArray(composed.ranges))
      throw TypeError('Optical composition required');
    var east=finite(options.east,'camera east'),north=finite(options.north,'camera north');
    if(east===0&&north===0)return composed;
    var basis=frame(east,north,options.height,options.curvature);
    var primitives=composed.scene.primitives.slice();
    composed.ranges.forEach(function(range){
      if(range.role!=='objects')return;
      for(var i=range.start;i<range.end;i++){
        var p=primitives[i];
        primitives[i]=Object.assign({},p,{points:p.points.map(function(v){return pointAt(v,basis);})});
      }
    });
    var metadata=Object.assign({},composed.scene.metadata,
      {cameraPosition:{east:east,north:north,height:options.height}});
    return Object.assign({},composed,{scene:contract.createScene(composed.scene.source,primitives,metadata)});
  }
  return Object.freeze({frame:frame,pointAt:pointAt,apply:apply});
}));
