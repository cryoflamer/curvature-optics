/* Phase 2: pure, opt-in world-space geometry for a type-2 transmission tower.
 * No GraphX3DX, DOM, canvas or legacy command recording is used here.
 * Other object types remain on the legacy path until independently ported.
 */
(function(root,factory){
  var api=factory(root.CurvatureSceneContract || (typeof require==='function'?require('./CurvatureSceneContract'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGeometryEngine=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  if(!contract)throw new Error('CurvatureSceneContract required');
  var shapes=[
    [[-.12,-.02,-.02,.02,.02,.12],[.08,.76,1,1,.76,.08],1],
    [[-.02,-.08,.08,.02],[1,.98,.98,1],1],
    [[-.02,-.07,.07,.02,-.02],[.94,.92,.92,.94,.94],1],
    [[-.02,-.07,.07,.02,-.02],[.86,.84,.84,.86,.86],1],
    [[-.02,-.07,.07,.02,-.02],[.78,.76,.76,.78,.78],1],
    [[-.12,.0906,-.0685,.0494,-.02],[.08,.28,.43,.56,.76],1],
    [[.12,-.0906,.0685,-.0494,.02],[.08,.28,.43,.56,.76],1],
    [[-.14,-.1,-.1,.1,.1,.14,.14,-.14,-.14],[0,0,.06,.06,0,0,.08,.08,0],3]
  ];
  var bars=[[-.0906,.28,.0906,.28],[-.0685,.43,.0685,.43],[-.0494,.56,.0494,.56]];
  function finite3(v){return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);}
  function localTowerType2(){
    var primitives=shapes.slice(0,7).map(function(s){return {type:'polygon',points:s[0].map(function(x,i){return [x,s[1][i]];}),mode:s[2]};});
    bars.forEach(function(b){primitives.push({type:'line',points:[[b[0],b[1]],[b[2],b[3]]]});});
    var foundation=shapes[7];
    primitives.push({type:'polygon',points:foundation[0].map(function(x,i){return [x,foundation[1][i]];}),mode:3,style:{fill:'#a38d60'}});
    return primitives;
  }
  // Explicit plane basis: pos + u*xAxis + v*yAxis. The axes carry size.
  // This keeps placement independent of GraphX3DX's mutable SetPlane/SetTrans.
  function placeOnPlane(primitives,plane){
    if(!plane||!finite3(plane.origin)||!finite3(plane.xAxis)||!finite3(plane.yAxis))throw new TypeError('Finite plane basis required');
    return primitives.map(function(p){
      var q=Object.assign({},p);
      q.points=p.points.map(function(v){return [0,1,2].map(function(i){return plane.origin[i]+v[0]*plane.xAxis[i]+v[1]*plane.yAxis[i];});});
      return q;
    });
  }
  // World placement corresponding to the legacy SetTrans transformation chain.
  // Angles are radians (DrawModel sets the graph angle measure to rad).
  // The returned basis is a value object; no mutable graph transform is needed.
  function towerPlacement(params){
    if(!params||!['geometryRadius','height','objectSize','longitude','latitude','verticalScale','horizontalScale'].every(function(k){return Number.isFinite(params[k]);}))
      throw new TypeError('Finite tower placement parameters required');
    if(params.geometryRadius<=0)throw new RangeError('Positive geometry radius required');
    var r=params.geometryRadius,h=params.height,os=params.objectSize;
    var xs=(params.globe?os:-os);
    var lat=params.latitude,lng=params.longitude;
    var cY=Math.cos(lat),sY=Math.sin(lat),cX=Math.cos(-lng),sX=Math.sin(-lng);
    var side=params.planeOffset||0,alt=params.altitude||0;
    if(!Number.isFinite(side)||!Number.isFinite(alt))throw new TypeError('Finite offset and altitude required');
    function point(u,v){
      var x=xs*(side+u*params.horizontalScale),y=0,z=os*v*params.verticalScale+r+alt;
      if(params.globe){
        var x1=cY*x+sY*z,z1=-sY*x+cY*z;
        x=x1;y=-sX*z1;z=cX*z1;
      }
      return [x+(params.globe?0:-lat*r),y+(params.globe?0:lng*r),z-r-h];
    }
    var origin=point(0,0),a=point(1,0),b=point(0,1);
    return {origin:origin,xAxis:a.map(function(n,i){return n-origin[i];}),yAxis:b.map(function(n,i){return n-origin[i];})};
  }
  function createPlacedTowerType2Scene(params,metadata){
    return createTowerType2Scene(towerPlacement(params),metadata);
  }
  function createTowerType2Scene(plane,metadata){
    return contract.createScene('legacy',placeOnPlane(localTowerType2(),plane),Object.assign({generator:'CurvatureGeometryEngine',objectType:3,towerVariant:2},metadata||{}));
  }
  // Opt-in sequence builder. It does not read CurveApp, invoke DrawModel, or
  // decide which towers are occluded by the horizon. Entries are far-to-near,
  // matching the legacy object's iteration order before horizon partitioning.
  function towerSequence(model,objIx,globe){
    if(!model||![0,1].includes(objIx))throw new TypeError('Model and object index required');
    var keys=['geometryRadius','Height','NObjects','ObjDist','ObjDeltaDist','ObjSidePos',
      'ObjSideVar','ObjSideType','ObjSize','ObjSizeVar','ObjSizeType','ObjType'];
    keys.forEach(function(k){
      var v=model[k];
      if(k==='geometryRadius'||k==='Height'){
        if(!Number.isFinite(v))throw new TypeError('Finite '+k+' required');
      }else if(!Array.isArray(v)||!Number.isFinite(v[objIx]))throw new TypeError('Finite '+k+' required');
    });
    var r=model.geometryRadius,n=model.NObjects[objIx];
    if(r<=0||!Number.isInteger(n)||n<0||n>500)throw new RangeError('Invalid tower count or radius');
    if(model.ObjType[objIx]!==3)throw new RangeError('Only type-2 transmission towers (ObjType 3) are supported');
    var delta=model.ObjDeltaDist[objIx]/r,first=model.ObjDist[objIx]/r;
    if(n>1&&delta<=0)throw new RangeError('Positive spacing required for multiple towers');
    var max=n;
    if(n&&first+(n-1)*delta>Math.PI){
      max=Math.max(0,Math.min(n,Math.floor(Math.PI/delta)));
    }
    var entries=[];
    for(var drawn=0;drawn<max;drawn++){
      var lng=first+(max-1-drawn)*delta;
      var variation=model.ObjSizeVar[objIx],size=1,sizeType=model.ObjSizeType[objIx];
      if(sizeType===0&&max>1)size=1+variation*(2*(max-1-drawn)/(max-1)-1);
      else if(sizeType===1)size=1+variation*Math.cos(Math.PI*drawn);
      else if(sizeType===2)size=1+variation*((64894678.9798467*Math.sqrt(drawn))%2-1);
      else if(sizeType===3)size=max>1?1-variation*Math.cos(2*Math.PI*drawn/(max-1)):1+variation;
      else if(sizeType===4)size=max>1?1-variation*Math.sin(2*Math.PI*drawn/(max-1)):1;
      else if(sizeType<0||sizeType>4)throw new RangeError('Unsupported size variation');
      size=(size+1-Math.abs(variation))/2;
      if(size<0)size=-size;
      var side=model.ObjSidePos[objIx]/r,sideVar=model.ObjSideVar[objIx]/r/2;
      var sideType=model.ObjSideType[objIx];
      if(sideType===0&&max>1)sideVar*=2*(max-1-drawn)/(max-1)-1;
      else if(sideType===2)sideVar*=(186573.6498496*Math.sqrt(drawn)%2)-1;
      else if(sideType===3&&max>1)sideVar*=Math.cos(2*Math.PI*drawn/(max-1));
      else if(sideType===4)sideVar=max>1?sideVar*Math.sin(2*Math.PI*drawn/(max-1)):0;
      else if(sideType<0||sideType>4)throw new RangeError('Unsupported side variation');
      var positions=sideType===1?[side-sideVar,side+sideVar]:[side+sideVar];
      if(sideType===1&&Math.abs(positions[0])<Math.abs(positions[1]))positions.reverse();
      positions.forEach(function(lat,col){
        var params={geometryRadius:r,height:model.Height,objectSize:model.ObjSize[objIx],
          longitude:lng,latitude:lat,globe:!!globe,verticalScale:size,horizontalScale:size,
          // Legacy SetPlane uses [side,0,0] for cosine/sine side modes.
          planeOffset:(sideType===3||sideType===4)?side:0};
        var scene=createPlacedTowerType2Scene(params,{objectIndex:objIx,sequenceIndex:drawn,
          column:sideType===1?col+1:0,longitude:lng,latitude:lat});
        entries.push({params:params,scene:scene});
      });
    }
    return entries;
  }
  function createTowerSequenceScene(model,objIx,globe){
    var entries=towerSequence(model,objIx,globe);
    var primitives=[];
    entries.forEach(function(entry){entry.scene.primitives.forEach(function(p){primitives.push(p);});});
    return contract.createScene('legacy',primitives,{generator:'CurvatureGeometryEngine',
      objectIndex:objIx,globe:!!globe,towerCount:entries.length,
      horizonPartitioned:false});
  }
  // Partition the far-to-near sequence using the same geometric cutoff as
  // DrawObjectsBehindHorizon. This is a drawing-order partition, NOT an
  // analytic per-vertex visibility test: the legacy white disk masks the
  // behind-horizon geometry after it is drawn.
  function towerHorizonPartition(model,objIx,globe){
    if(!model||!Number.isFinite(model.rDisk)||!Number.isFinite(model.hDip))
      throw new TypeError('Finite horizon disk radius and dip required');
    if(model.rDisk<0)throw new RangeError('Nonnegative horizon disk radius required');
    var entries=towerSequence(model,objIx,globe),aClip=0;
    if(globe){
      var r=model.geometryRadius,side=model.ObjSidePos[objIx]/r;
      var sideOnDisk=(r-model.hDip)*Math.tan(side);
      if(model.rDisk>Math.abs(sideOnDisk)){
        var ratio=Math.sqrt(model.rDisk*model.rDisk-sideOnDisk*sideOnDisk)/r;
        aClip=Math.asin(Math.min(1,ratio));
      }
    }
    var behind=[],before=[];
    entries.forEach(function(entry){
      (globe&&entry.params.longitude>aClip?behind:before).push(entry);
    });
    return {behind:behind,before:before,cutoffAngle:aClip,
      // The legacy masking circle is a renderer operation, not a tower.
      requiresHorizonMask:globe&&behind.length>0,
      total:entries.length};
  }
  function createHorizonPartitionedTowerScenes(model,objIx,globe){
    var partition=towerHorizonPartition(model,objIx,globe);
    function scene(entries,layer){
      var primitives=[];
      entries.forEach(function(entry){entry.scene.primitives.forEach(function(p){primitives.push(p);});});
      return contract.createScene('legacy',primitives,{generator:'CurvatureGeometryEngine',
        objectIndex:objIx,globe:!!globe,horizonPartitioned:true,layer:layer,
        towerCount:entries.length});
    }
    return {behind:scene(partition.behind,'behind'),before:scene(partition.before,'before'),
      cutoffAngle:partition.cutoffAngle,requiresHorizonMask:partition.requiresHorizonMask,
      total:partition.total};
  }
  // World-space horizon circle and white occlusion disk. Tessellation is an
  // explicit geometry resolution, not GraphX3DX's camera-dependent ellipse
  // sampling. The analytic circle is retained in metadata for exact tests.
  function horizonCircle(model,options){
    if(!model||!['rDisk','zDisk','Height'].every(function(k){return Number.isFinite(model[k]);}))
      throw new TypeError('Finite horizon radius, dip and height required');
    if(model.rDisk<0)throw new RangeError('Nonnegative horizon radius required');
    options=options||{};
    var segments=options.segments===undefined?128:options.segments;
    if(!Number.isInteger(segments)||segments<3||segments>8192)
      throw new RangeError('Horizon segments must be an integer from 3 to 8192');
    var globe=options.globe!==false;
    var z=globe?-model.zDisk:-model.Height;
    var points=[];
    for(var i=0;i<segments;i++){
      var angle=2*Math.PI*i/segments;
      points.push([model.rDisk*Math.cos(angle),model.rDisk*Math.sin(angle),z]);
    }
    return {center:[0,0,z],radius:model.rDisk,points:points,segments:segments,globe:globe};
  }
  function createHorizonScenes(model,options){
    options=options||{};
    var circle=horizonCircle(model,options);
    var metadata={generator:'CurvatureGeometryEngine',horizon:true,
      center:circle.center,radius:circle.radius,segments:circle.segments,
      globe:circle.globe,approximation:'fixed-world-polygon'};
    // A circle outline and the opaque white painter-order mask are distinct
    // operations. The mask must be composed BETWEEN behind and before towers.
    var outline=contract.createScene('legacy',[{type:'polygon',points:circle.points,mode:1}],
      Object.assign({},metadata,{layer:'horizon-outline'}));
    var mask=contract.createScene('legacy',circle.globe?[{type:'polygon',
      points:circle.points,mode:2,style:{fill:'white',alpha:1}}]:[],
      Object.assign({},metadata,{layer:'horizon-mask',maskColor:'white',
        maskRequired:circle.globe}));
    return {outline:outline,mask:mask,circle:circle};
  }
  function createTowerHorizonComposition(model,objIx,globe,options){
    var towers=createHorizonPartitionedTowerScenes(model,objIx,globe);
    var horizon=createHorizonScenes(model,Object.assign({},options,{globe:!!globe}));
    // Explicit painter order; consumer must not infer order from scene names.
    return {layers:[towers.behind,horizon.mask,horizon.outline,towers.before],
      behind:towers.behind,mask:horizon.mask,outline:horizon.outline,
      before:towers.before,cutoffAngle:towers.cutoffAngle,
      requiresHorizonMask:towers.requiresHorizonMask};
  }
  return {localTowerType2:localTowerType2,placeOnPlane:placeOnPlane,createTowerType2Scene:createTowerType2Scene,towerPlacement:towerPlacement,createPlacedTowerType2Scene:createPlacedTowerType2Scene,towerSequence:towerSequence,createTowerSequenceScene:createTowerSequenceScene,towerHorizonPartition:towerHorizonPartition,createHorizonPartitionedTowerScenes:createHorizonPartitionedTowerScenes,horizonCircle:horizonCircle,createHorizonScenes:createHorizonScenes,createTowerHorizonComposition:createTowerHorizonComposition};
}));
