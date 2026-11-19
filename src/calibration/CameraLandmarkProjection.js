/* Headless calibration projection. Coordinates are authored metric metres;
 * pixels are continuous backing-store coordinates, not CSS coordinates.
 * No mesh self-occlusion, lens distortion or global multipath certification.
 */
(function(root,factory){
  var api=factory(
    root.CurvatureGeometryEngine||require('../geometry/CurvatureGeometryEngine'),
    root.CurvatureSurfaceGeometry||require('../geometry/CurvatureSurfaceGeometry'),
    root.CurvatureCameraTranslation||require('../geometry/CurvatureCameraTranslation'),
    root.CurvatureOpticalTowerSilhouette||require('../optics/OpticalTowerSilhouette'),
    root.CurvaturePhysicalSceneOptics||require('../optics/CurvaturePhysicalSceneOptics'),
    root.CurvatureTargetProjection||require('../optics/OpticalTargetProjection'),
    root.CurvatureOpticalEffectiveRadiusPreview||require('../optics/OpticalEffectiveRadiusPreview'),
    root.CurvatureCanvasDirectPreview||require('../renderers/CurvatureCanvasDirectPreview'),
    root.CurvatureCanvasProjection||require('../renderers/CurvatureCanvasProjection'),
    root.CurvatureCameraMaterialAnchorResolver||require('./CameraMaterialAnchorResolver'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureCameraLandmarkProjection=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(engine,surfaces,translation,silhouette,physical,shoot,effective,direct,viewport,materialResolver){
  'use strict';
  function sub(a,b){return a.map(function(v,i){return v-b[i];});}
  function dot(a,b){return a.reduce(function(s,v,i){return s+v*b[i];},0);}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function unit(v){var n=Math.hypot.apply(null,v);if(!Number.isFinite(n)||!(n>0))throw RangeError('Degenerate camera');return v.map(function(x){return x/n;});}
  function vector(v){return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);}
  function cameraProjector(camera,width,height){
    if(!camera||!vector(camera.pos)||!vector(camera.center)||!vector(camera.up)||camera.pos.some(function(v){return v!==0;})||
      ![camera.sceneSize,camera.screenSize,camera.objectZExtend,camera.zoom].every(Number.isFinite)||
      !(camera.sceneSize>0&&camera.screenSize>0&&camera.zoom>0))throw TypeError('Invalid projection camera');
    var pos=camera.pos.slice(),back=unit(sub(pos,camera.center)),right=unit(cross(unit(camera.up),back)),up=unit(cross(back,right));
    var focal=camera.screenSize/camera.sceneSize*(Math.hypot.apply(null,sub(camera.center,pos))-camera.objectZExtend)*camera.zoom;
    var window=viewport.resolve(camera,width,height),near=camera.near>0?camera.near:1e-6;
    if(!Number.isFinite(focal)||!(focal>0))throw RangeError('Invalid camera focal scale');
    return function(point){
      var d=sub(point,pos),z=-dot(d,back);
      if(z<=near)return {status:z<=0?'behind_camera':'near_plane',pixel:null};
      var pixel=viewport.point(window,dot(d,right)*focal/z,dot(d,up)*focal/z);
      if(!pixel.every(Number.isFinite))return {status:'solver_failed',pixel:null};
      return {status:pixel[0]>=0&&pixel[0]<width&&pixel[1]>=0&&pixel[1]<height?'visible':'out_of_frame',pixel:pixel};
    };
  }
  function create(model,camera,width,height,options){
    options=options||{};
    if(!model||![1,2].includes(model.showModel)||!Number.isFinite(model.rEarth)||!(model.rEarth>0)||
      !Number.isFinite(model.Height)||model.Height<0||model.viewcenterHorizon!==3||
      !Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1)
      throw RangeError('Globe or Flat eye-level model and original raster dimensions required');
    var m=Object.assign({},model);Object.keys(m).forEach(function(k){if(Array.isArray(m[k]))m[k]=m[k].slice();});
    var method=options.method===undefined?'accurate':options.method,atmosphere=options.atmosphere||'vacuum';
    if(!['accurate','canvas-direct'].includes(method)||!['vacuum','standard','temperature-lapse'].includes(atmosphere))
      throw RangeError('Unsupported landmark projection method or atmosphere');
    var globe=m.showModel===1,geometry=globe?'globe':'flat',eye=m.Height;
    var east=m.CameraEast===undefined?0:m.CameraEast,north=m.CameraNorth===undefined?0:m.CameraNorth;
    var params=method==='canvas-direct'?effective.canvasDirectParameters(m,{atmosphere:atmosphere,temperatureProfile:options.temperatureProfile}):null;
    var radius=params&&globe?params.effectiveRadius:m.rEarth,k=globe?1/radius:0;
    var surface=surfaces.createFromCurvature(k),basis=translation.frame(east,north,eye,k),project=cameraProjector(camera,width,height);
    var profileOptions=options.temperatureProfile&&Object.assign({},options.temperatureProfile),step=options.step===undefined?200:options.step;
    if(!Number.isFinite(step)||step<=0)throw RangeError('Invalid RK4 step');
    var source=Object.assign({},m,{Height:params?0:eye,geometryRadius:params&&!globe?m.geometryRadius:radius}),banks=new Map();
    function bank(index){
      if(![0,1].includes(index))throw RangeError('Invalid landmark bank');
      if(!banks.has(index)){
        var scene=engine.createObjectSequenceScene(source,index,globe,params&&globe?{opticsNeutral:true}:
          {opticsNeutral:true,physicalSurface:true,curvature:k});
        if(scene.metadata.objectCount!==m.NObjects[index]*(m.ObjSideType[index]===1?2:1))
          throw RangeError('Landmark identities unavailable for truncated object sequence');
        banks.set(index,scene.primitives);
      }
      return banks.get(index);
    }
    function result(id,status,pixel,reason){return {id:id,method:method,status:status,pixel:pixel||null,reason:reason||null,meshOcclusion:'not-tested'};}
    function finish(id,point){var p=project(point);return result(id,p.status,p.pixel);}
    function fromWorld(id,world){
      // Accurate geometry has Height already subtracted. Direct authors at
      // zero height and applies the virtual surface at projection time.
      if(params&&!globe&&world[2]<-1e-6)return result(id,'blocked',null,'below physical surface');
      var local=params&&!globe?direct.flatRefractionPoint(world[0]-east,world[1]-north,world[2],eye,params.effectiveCurvature):
        translation.pointAt(params?[world[0],world[1],world[2]-eye]:world,basis);
      var q=silhouette.coordinate(local,geometry,radius,eye,surface);
      if(params){
        // Approximate terrain visibility, NOT a guarantee of painter masking.
        if(!globe&&params.effectiveCurvature>0){
          var virtual=surfaces.createFromCurvature(params.effectiveCurvature);
          q=silhouette.coordinate(local,'globe',params.effectiveRadius,eye,virtual);
        }
        if(q.distance>0&&(globe||params.effectiveCurvature>0)){
          if(q.height< -1e-6)return result(id,'blocked');
          var mask=physical.vacuumSample('globe',params.effectiveRadius,eye,q.distance,Math.max(0,q.height),true);
          if(mask.status!=='visible')return result(id,mask.status,null,'effective-surface terrain');
        }
        return finish(id,local);
      }
      if(q.height< -1e-6)return result(id,'blocked',null,'below physical surface');
      if(!(q.distance>0)||globe&&q.distance>=Math.PI*radius/2)
        return result(id,'solver_failed',null,'outside forward shooting domain');
      var h=Math.max(0,q.height),shot=atmosphere==='vacuum'?physical.vacuumSample(geometry,radius,eye,q.distance,h,true):
        shoot.solve({geometry:geometry,radius:radius,observerHeight:eye,target:surface.surfacePoint2(q.distance,h),
          atmosphere:atmosphere,profileOptions:profileOptions,step:step});
      if(shot.status!=='visible')return result(id,shot.status,null,shot.reason||'terrain or unresolved ray');
      return finish(id,physical.arrivalPoint([q.azimuth,shot.angle]));
    }
    function idOf(p){if(!p||typeof p.id!=='string'||!p.id.trim())throw TypeError('Landmark ID required');return p.id;}
    function metric(p){
      var id=idOf(p);
      if(![p.east,p.north,p.height].every(Number.isFinite)||p.height<0)throw RangeError('Invalid metric landmark');
      if(globe&&Math.hypot(p.east,p.north)*k>=Math.PI/2)
        return result(id,'solver_failed',null,'outside local landmark domain');
      var w=surface.surfacePoint3(p.east,p.north,p.height);if(!params)w[2]-=eye;
      return fromWorld(id,w);
    }
    // Physical topology authenticates identity; the method-specific bank
    // supplies coordinates with the existing Height convention.
    var resolver=null,materialBanks=new Map();
    function material(kind,p){
      var id=idOf(p);
      if(!globe)return result(id,'invalid_anchor',null,'Material anchors require Globe');
      var world;
      try{
        if(!p.anchor)throw TypeError('Material anchor required');
        var b=p.anchor.owner&&p.anchor.owner.bank;
        if(!resolver)resolver=materialResolver.create(m);
        if(!materialBanks.has(b))materialBanks.set(b,resolver.bindProjectionBank(b,bank(b)));
        world=materialBanks.get(b).point(kind,p);
      }catch(error){
        if(!(error instanceof TypeError||error instanceof RangeError))throw error;
        return result(id,'invalid_anchor',null,error.message);
      }
      return fromWorld(id,world);
    }
    function vertex(p){
      if(p&&Object.prototype.hasOwnProperty.call(p,'anchor'))return material('vertex',p);
      var id=idOf(p),primitives=bank(p.bank);
      if(p.objectType!==m.ObjType[p.bank]||!Number.isInteger(p.primitive)||p.primitive<0||
        !Number.isInteger(p.vertex)||p.vertex<0||!primitives[p.primitive]||!primitives[p.primitive].points[p.vertex])
        throw RangeError('Landmark does not match authored mesh topology');
      return fromWorld(id,primitives[p.primitive].points[p.vertex]);
    }
    return Object.freeze({metric:metric,vertex:vertex,
      edge:function(p){return material('edge',p);},surface:function(p){return material('surface',p);}});
  }
  // Characteristic horizontal ranges for the numerical coordinate scale,
  // measured on the fixed authored physical scene, not from its origin.
  // Use physical topology (independent of the effective optical radius).
  function authoredVertexRanges(model,pose,landmarks){
    if(!landmarks.length)return [];
    var globe=model.showModel===1,k=globe?1/model.rEarth:0,basis;
    try{basis=translation.frame(pose.CameraEast,pose.CameraNorth,pose.Height,k);}
    catch(e){if(!(e instanceof RangeError))throw e;return [];} // evaluator reports invalid initial pose
    var banks=new Map(),source=Object.assign({},model,{Height:0,geometryRadius:model.rEarth});
    return landmarks.map(function(p){
      if(!banks.has(p.bank)){
        var scene=engine.createObjectSequenceScene(source,p.bank,globe,
          {opticsNeutral:true,physicalSurface:true,curvature:k});
        if(scene.metadata.objectCount!==model.NObjects[p.bank]*(model.ObjSideType[p.bank]===1?2:1))
          throw RangeError('Landmark identities unavailable for truncated object sequence');
        banks.set(p.bank,scene.primitives);
      }
      var primitive=banks.get(p.bank)[p.primitive];
      if(p.objectType!==model.ObjType[p.bank]||!primitive||!primitive.points[p.vertex])
        throw RangeError('Landmark does not match authored mesh topology');
      var w=primitive.points[p.vertex],local=translation.pointAt([w[0],w[1],w[2]-pose.Height],basis);
      return Math.hypot(local[0],local[1]);
    });
  }
  return Object.freeze({create:create,authoredVertexRanges:authoredVertexRanges});
}));
