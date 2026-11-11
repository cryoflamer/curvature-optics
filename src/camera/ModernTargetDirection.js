/* Geometric target direction for the Modern camera compass (no UI or optics).
 * Targets come from the exact physical object placement and observer-frame
 * translation used by the optical painter, NOT from flat-screen or apparent
 * refracted positions. No visibility claim is made by this module.
 */
(function(root,factory){
  var api=factory(
    root.CurvatureGeometryEngine||(typeof require==='function'?require('../geometry/CurvatureGeometryEngine'):null),
    root.CurvatureCameraTranslation||(typeof require==='function'?require('../geometry/CurvatureCameraTranslation'):null),
    root.CurvaturePhysicalCamera||(typeof require==='function'?require('../app/CurvaturePhysicalCamera'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernTargetDirection=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(engine,translation,physicalCamera){
  'use strict';
  if(!engine||!translation||!physicalCamera)throw Error('Physical target-direction geometry dependencies required');
  var DEG=180/Math.PI, EPS=1e-9;
  function finite(v,label){
    if(typeof v!=='number'||!Number.isFinite(v))throw RangeError('Invalid target direction '+label);
    return v;
  }
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function signedAngle(a){return ((a+180)%360+360)%360-180;}
  function entry(kind,position,options){
    if(!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite))
      throw RangeError('Invalid authored target position');
    return Object.freeze(Object.assign({kind:kind,position:Object.freeze(position.slice())},options));
  }
  function average(items){
    // Sum actual authored geometry anchors, not the midpoint of nominal
    // ObjDist/ObjSidePos. The latter ignores per-object variation/twin columns.
    var sum=[0,0,0];
    items.forEach(function(item){for(var i=0;i<3;i++)sum[i]+=item.position[i];});
    return sum.map(function(v){return v/items.length;});
  }
  function validate(model){
    if(!model||typeof model!=='object')throw TypeError('Modern target direction model required');
    if(model.showModel!==1&&model.showModel!==2)
      throw RangeError('Target direction requires Globe or Flat');
    if(!(finite(model.rEarth,'Earth radius')>0))throw RangeError('Positive Earth radius required');
    finite(model.CameraEast,'camera East');finite(model.CameraNorth,'camera North');
    if(finite(model.Height,'camera height')<0)throw RangeError('Negative camera height');
    if(!Array.isArray(model.NObjects)||model.NObjects.length!==2||
        model.NObjects.some(function(n){return !Number.isInteger(n)||n<0||n>500;}))
      throw RangeError('Invalid target group object counts');
  }
  function collect(model){
    validate(model);
    var globe=model.showModel===1,curvature=globe?1/model.rEarth:0;
    // Also validates that the observer remains on the admissible hemisphere.
    var basis=translation.frame(model.CameraEast,model.CameraNorth,model.Height,curvature);
    var objects=[],groups=[];
    // Match CurvatureMainCanvasRenderer.renderPhysical: the active geometric
    // Earth radius is authoritative even if a legacy-derived cache is stale.
    var physicalModel=Object.assign({},model,{geometryRadius:model.rEarth});
    for(var group=0;group<2;group++){
      if(!(model.NObjects&&model.NObjects[group]>0))continue;
      // Reuse exactly the same object sequence/physical placement as the
      // painter. This is a target-list operation, not a per-ray computation.
      var sequence=engine.objectSequence(physicalModel,group,globe,{physicalSurface:true,curvature:curvature});
      var members=sequence.map(function(item,index){
        var plane=engine.towerPlacement(item.params);
        // Half-height anchor is stable for all currently supported silhouettes.
        var world=plane.origin.map(function(v,i){return v+0.5*plane.yAxis[i];});
        var local=translation.pointAt(world,basis);
        var meta=item.scene.metadata;
        return entry('object',local,{groupIndex:group,instanceIndex:index,
          sequenceIndex:meta.sequenceIndex,column:meta.column,objectType:model.ObjType[group],
          objectCount:1});
      });
      if(!members.length)continue;
      objects.push.apply(objects,members);
      groups.push(entry('group',average(members),{groupIndex:group,objectCount:members.length}));
    }
    var scene=objects.length?entry('scene',average(objects),{objectCount:objects.length}):null;
    return Object.freeze({objects:Object.freeze(objects),groups:Object.freeze(groups),scene:scene});
  }
  function select(targets,selection){
    if(!targets||!Array.isArray(targets.objects)||!Array.isArray(targets.groups))
      throw TypeError('Collected target list required');
    selection=selection||{kind:'scene'};
    if(selection.kind==='scene')return targets.scene;
    if(selection.kind==='group'){
      if(![0,1].includes(selection.groupIndex))throw RangeError('Target group must be 0 or 1');
      return targets.groups.find(function(t){return t.groupIndex===selection.groupIndex;})||null;
    }
    if(selection.kind==='object'){
      if(![0,1].includes(selection.groupIndex)||!Number.isInteger(selection.instanceIndex)||
          selection.instanceIndex<0)throw RangeError('Invalid target object selection');
      return targets.objects.find(function(t){return t.groupIndex===selection.groupIndex&&
        t.instanceIndex===selection.instanceIndex;})||null;
    }
    throw RangeError('Unknown target selection kind');
  }
  function point(model,target){
    validate(model);
    if(target===null)return null;
    if(!target||!Array.isArray(target.position)||target.position.length!==3)
      throw TypeError('A geometric target entry is required');
    var p=target.position;
    p.forEach(function(v){finite(v,'position');});
    var distance=Math.hypot(p[0],p[1],p[2]);
    var view=physicalCamera.create(model);
    var forward=view.center.map(function(v){return v/view.referenceDistance;});
    var up=view.up;
    var right=cross(forward,up);
    var horizontal=Math.hypot(p[0],p[1]);
    var bearing=horizontal>EPS?Math.atan2(p[0],p[1])*DEG:null;
    var relativeBearing=bearing===null?null:signedAngle(bearing-finite(model.Pan,'Pan'));
    if(distance<EPS)return Object.freeze({target:target,distanceMeters:0,
      bearingDegrees:null,relativeBearingDegrees:null,elevationDegrees:null,
      relativeVerticalDegrees:null,forwardMeters:0,rightMeters:0,upMeters:0,
      screenX:null,screenY:null,inView:false,direction:'here'});
    var z=dot(p,forward),x=dot(p,right),y=dot(p,up);
    // camViewAngle is DIAGONAL FOV. Match PhysicalCamera's viewport size;
    // interpreting it as horizontal FOV would misclassify edge targets.
    var halfTan=Math.tan(finite(model.camViewAngle,'view angle')/2)/
      Math.hypot(1,finite(model.deviceRatio,'aspect ratio'));
    var halfX=halfTan*model.deviceRatio,halfY=halfTan;
    if(!(halfX>0&&halfY>0))throw RangeError('Invalid target viewport FOV');
    var screenX=z>0?x/z/halfX:null,screenY=z>0?y/z/halfY:null;
    var inView=z>0&&Math.abs(screenX)<=1&&Math.abs(screenY)<=1;
    var direction;
    if(z<=0)direction='behind';
    else if(inView)direction='ahead';
    else if(Math.abs(screenX)>=Math.abs(screenY))direction=screenX<0?'left':'right';
    else direction=screenY<0?'below':'above';
    return Object.freeze({target:target,distanceMeters:distance,
      bearingDegrees:bearing,relativeBearingDegrees:relativeBearing,
      elevationDegrees:Math.atan2(p[2],horizontal)*DEG,
      relativeVerticalDegrees:Math.atan2(y,Math.hypot(x,z))*DEG,
      forwardMeters:z,rightMeters:x,upMeters:y,screenX:screenX,screenY:screenY,
      inView:inView,direction:direction});
  }
  function measure(model,selection){
    return point(model,select(collect(model),selection));
  }
  return Object.freeze({collect:collect,select:select,point:point,measure:measure});
}));
