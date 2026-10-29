/* Reproject a cached camera Canvas after an observer-fixed rotation.
 * No scene geometry or optical field is sampled. A perspective homography
 * maps OLD raster pixel directions to their NEW projected positions.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCameraPerspectiveWarp=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var RAD=Math.PI/180;
  function finite(x){return typeof x==='number'&&Number.isFinite(x);}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function unit(a){var n=Math.hypot(a[0],a[1],a[2]);return a.map(function(x){return x/n;});}
  // Match CurvaturePhysicalCamera.create's forward and rolled-up directions.
  // The painter derives screen right from cross(up, backward).
  function basis(camera,aimRadians){
    var pan=camera.Pan*RAD,nick=camera.Nick*RAD-(aimRadians||0),roll=camera.Roll*RAD;
    var ce=Math.cos(nick),se=Math.sin(nick),cp=Math.cos(pan),sp=Math.sin(pan);
    var forward=[sp*ce,cp*ce,se],side=[cp,-sp,0],up=[-sp*se,-cp*se,ce];
    var rolled=up.map(function(v,i){return v*Math.cos(roll)+side[i]*Math.sin(roll);});
    var right=unit(cross(forward,rolled));
    return {forward:forward,right:right,up:unit(cross(right,forward))};
  }
  function point(matrix,x,y){
    var z=matrix[6]*x+matrix[7]*y+matrix[8];
    if(!(z>1e-8))return null;
    return [(matrix[0]*x+matrix[1]*y+matrix[2])/z,
      (matrix[3]*x+matrix[4]*y+matrix[5])/z];
  }
  function transform(spec,target){
    if(!spec||!target||![spec.width,spec.height,spec.fovRadians,spec.aspectRatio,
      spec.aimRadians||0].every(finite)||!(spec.width>0&&spec.height>0)||
      !(spec.fovRadians>0&&spec.fovRadians<Math.PI)||!(spec.aspectRatio>0)||
      !spec.camera||!['Pan','Nick','Roll'].every(function(k){return finite(spec.camera[k])&&finite(target[k]);}))
      throw RangeError('Invalid camera perspective preview parameters');
    var cx=spec.width/2,cy=spec.height/2;
    var halfY=Math.tan(spec.fovRadians/2)/Math.hypot(1,spec.aspectRatio);
    var fx=spec.width/(2*halfY*spec.aspectRatio),fy=spec.height/(2*halfY);
    var old=basis(spec.camera,spec.aimRadians),next=basis(target,spec.aimRadians);
    // A world-space ray from an old raster pixel is B0*x + B1*y + B2.
    var B0=old.right.map(function(v){return v/fx;});
    var B1=old.up.map(function(v){return -v/fy;});
    var B2=old.forward.map(function(v,i){return v-cx*B0[i]-cy*B1[i];});
    var columns=[B0,B1,B2],h=[[],[],[]];
    columns.forEach(function(col,j){
      var z=dot(next.forward,col);
      h[0][j]=fx*dot(next.right,col)+cx*z;
      h[1][j]=-fy*dot(next.up,col)+cy*z;
      h[2][j]=z;
    });
    var matrix=h.flat();
    // CSS treats all old raster corners as a single textured plane. A corner
    // passing behind the new camera cannot be represented by that plane.
    var corners=[[0,0],[spec.width,0],[0,spec.height],[spec.width,spec.height],[cx,cy]];
    if(corners.some(function(p){return point(matrix,p[0],p[1])===null;}))return null;
    var normal=matrix[8];
    if(!(normal>1e-8))return null;
    matrix=matrix.map(function(x){return x/normal;});
    // CSS matrix3d uses column-major layout and homogeneous division.
    var css=[matrix[0],matrix[3],0,matrix[6],
      matrix[1],matrix[4],0,matrix[7],
      0,0,1,0,
      matrix[2],matrix[5],0,matrix[8]];
    if(css.some(function(v){return !finite(v);}))return null;
    return Object.freeze({matrix:Object.freeze(matrix),css:'matrix3d('+css.join(', ')+')',
      point:function(x,y){return point(matrix,x,y);}});
  }
  return Object.freeze({transform:transform,basis:basis});
}));
