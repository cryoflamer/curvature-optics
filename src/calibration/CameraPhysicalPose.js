/* Bridge between Cartesian perspective seeds and the Eye-Lvl physical camera.
 * Calibration raster: centered, square pixels, existing full-canvas projection
 * convention (no graph viewport margins). No refraction or pose optimization. */
(function(root,factory){
  var api=factory(root.CurvatureSurfaceGeometry||require('../geometry/CurvatureSurfaceGeometry'),
    root.CurvatureCameraTranslation||require('../geometry/CurvatureCameraTranslation'),
    root.CurvaturePhysicalCamera||require('../app/CurvaturePhysicalCamera'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCameraPhysicalPose=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(surfaces,translation,physical){
  'use strict';
  const SENSOR_DIAGONAL=43.2,DEG=180/Math.PI;
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=a=>a.map(x=>x/Math.hypot(...a));
  const vector=a=>Array.isArray(a)&&a.length===3&&a.every(Number.isFinite);
  function context(model,width,height){
    if(!model||![1,2].includes(model.showModel)||!Number.isFinite(model.rEarth)||model.rEarth<=0||
      !Number.isFinite(model.rFEarth)||model.rFEarth<=0||!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)
      throw RangeError('Globe or Flat model and raster dimensions required');
    const k=model.showModel===1?1/model.rEarth:0,ratio=width/height;
    return {k,surface:surfaces.createFromCurvature(k),ratio,diagonal:Math.hypot(width,height),aspectFactor:Math.max(1,ratio/1.5)};
  }
  function bounded(v,min,max,name){
    if(!Number.isFinite(v)||v<min||v>max)throw RangeError(name+' outside physical camera domain');
    return v;
  }
  function validateRotation(R){
    if(!Array.isArray(R)||R.length!==3||!R.every(vector)||R.some((a,i)=>R.some((b,j)=>Math.abs(dot(a,b)-(i===j?1:0))>1e-7))||
      Math.abs(dot(cross(R[0],R[1]),R[2])-1)>1e-7)throw RangeError('Expected proper world-to-camera rotation');
  }
  function photoCamera(model,width,height){
    const c=context(model,width,height);
    if(model.viewcenterHorizon!==3)throw RangeError('Eye-Lvl camera required');
    bounded(model.Height,.001,1e9,'Height');bounded(model.Pan,-180,180,'Pan');
    bounded(model.Nick,-85,45,'Nick');bounded(model.Roll,-180,180,'Roll');
    const f=model.FocalLengthField;
    if(!Number.isFinite(f)||f<=0)throw RangeError('Positive FocalLengthField required');
    const angle=2*Math.atan(SENSOR_DIAGONAL/(2*f));bounded(angle*DEG,.1,160,'Field of view');
    translation.frame(model.CameraEast??0,model.CameraNorth??0,model.Height,c.k);
    const view=physical.create({...model,camViewAngle:angle,deviceRatio:c.ratio});
    return {...view,screenSize:1,objectZExtend:0,zoom:1,near:.001};
  }
  function fromPerspective(seed,model,width,height){
    const c=context(model,width,height);
    if(!seed||!vector(seed.position)||!Number.isFinite(seed.focalPx)||!(seed.focalPx>0))throw RangeError('Finite perspective position and positive focalPx required');
    validateRotation(seed.rotation);
    const [x,y,z]=seed.position,d=Math.hypot(x,y),h=bounded(c.surface.height3(x,y,z),.001,1e9,'Height');
    let east=x,north=y;
    if(c.k){
      const theta=Math.atan2(c.k*d,1+c.k*z);
      if(theta>=Math.PI/2)throw RangeError('Camera outside local Globe domain');
      const factor=d===0?1:theta/(c.k*d);east=x*factor;north=y*factor;
    }
    const b=translation.frame(east,north,h,c.k),local=v=>[dot(v,b.right),dot(v,b.forward),dot(v,b.up)];
    const dir=local(seed.rotation[2]),down=local(seed.rotation[1]);
    const pan=Math.atan2(dir[0],dir[1]),nick=Math.atan2(dir[2],Math.hypot(dir[0],dir[1]));
    const sp=Math.sin(pan),cp=Math.cos(pan),se=Math.sin(nick),ce=Math.cos(nick);
    const side=[cp,-sp,0],up=[-sp*se,-cp*se,ce];
    const roll=Math.atan2(-dot(down,side),-dot(down,up));
    // The physical camera retains a 3:2 scene-size convention for wider
    // rasters. Invert its actual centered full-canvas pixel scale, not just
    // the nominal diagonal FOV. This field is not EXIF lens focal length.
    const f=SENSOR_DIAGONAL*seed.focalPx/c.diagonal*c.aspectFactor;
    const pose={CameraEast:east,CameraNorth:north,Height:h,Pan:pan*DEG,Nick:nick*DEG,Roll:roll*DEG,
      FocalLengthField:f,deviceRatio:c.ratio,viewcenterHorizon:3};
    const camera=photoCamera({...model,...pose},width,height);
    return {pose,camera,focalPx:height*physical.REFERENCE_DISTANCE/camera.sceneSize,
      diagonalEquivalentMm:SENSOR_DIAGONAL*seed.focalPx/c.diagonal,viewport:'centered-full-canvas'};
  }
  function toPerspective(model,width,height){
    const c=context(model,width,height),camera=photoCamera(model,width,height),east=model.CameraEast??0,north=model.CameraNorth??0;
    const b=translation.frame(east,north,model.Height,c.k),axes=[b.right,b.forward,b.up];
    const dir=unit(camera.center),right=unit(cross(dir,camera.up)),down=cross(dir,right);
    const global=v=>axes[0].map((_,i)=>v.reduce((s,x,j)=>s+x*axes[j][i],0));
    return {position:c.surface.surfacePoint3(east,north,model.Height),rotation:[right,down,dir].map(global),
      focalPx:height*physical.REFERENCE_DISTANCE/camera.sceneSize};
  }
  return Object.freeze({fromPerspective,toPerspective,photoCamera});
}));
