/* Physical-only metric world authoring. Ranges are ground arc metres, not
 * fractions of the geometric horizon. The same continuous-curvature surface
 * defines ground guides, tower bases and the local outward vertical.
 * Legacy scene authoring is intentionally untouched.
 */
(function(root,factory){
  var api=factory(root.CurvatureSurfaceGeometry||(typeof require==='function'?require('./CurvatureSurfaceGeometry'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePhysicalWorldGeometry=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(surfaceApi){
  'use strict';
  if(!surfaceApi)throw Error('Continuous-curvature surface geometry required');
  // Explicit metric landmarks, independent of R, h, camera, and horizon.
  // Enough near-observer detail without millions of distant grid elements.
  var RINGS=Object.freeze([100,250,500,1000,2000,3000,5000,7500,10000,
    12500,15000,20000,30000,40000,50000,75000,100000,
    125000,150000,200000,250000,300000,400000,500000,600000,750000,1000000]);
  function valid(k,h){
    if(!Number.isFinite(k)||k<0||!Number.isFinite(h)||h<0)
      throw RangeError('Finite nonnegative curvature and observer height required');
    return surfaceApi.createFromCurvature(k);
  }
  function world(surface,e,n,h,eye){
    var p=surface.surfacePoint3(e,n,h);
    p[2]-=eye;
    return p;
  }
  // Modern view settings choose a drawing limit, not a horizon or an object
  // visibility range. Missing settings retain the historical 100 km default
  // for standalone adapters and Legacy preservation tests.
  var EXTENT_CHOICES=Object.freeze([10000,20000,30000,50000,75000,100000,
    150000,200000,250000,300000,400000,500000,600000,750000,1000000]);
  function guideExtent(model){
    var selected=model&&model.metricGridExtentKm;
    if(selected===undefined)return 100000;
    if(!Number.isFinite(selected)||selected<0||selected>1000)
      throw RangeError('Metric grid extent must be Auto or 1–1000 km');
    if(selected>0)return selected*1000;
    var max=0;
    for(var i=0;i<2;i++){
      var count=model.NObjects&&model.NObjects[i]||0;
      if(!count)continue;
      var first=model.ObjDist[i],step=model.ObjDeltaDist[i];
      if(!Number.isFinite(first)||!Number.isFinite(step))continue;
      // The farthest authored group endpoint, including camera translation.
      // Variation is a conservative envelope, not an optical visibility test.
      var north=model.CameraNorth||0,east=model.CameraEast||0;
      var lateral=(model.ObjSidePos&&model.ObjSidePos[i]||0);
      var sideSwing=Math.abs(model.ObjSideVar&&model.ObjSideVar[i]||0);
      var d0=Math.hypot(first-north,lateral-east)+sideSwing;
      var d1=Math.hypot(first+(count-1)*step-north,lateral-east)+sideSwing;
      max=Math.max(max,d0,d1);
    }
    if(!max)return 100000;
    var needed=Math.min(1000000,Math.max(10000,max*1.1));
    return EXTENT_CHOICES.find(function(d){return d>=needed;})||1000000;
  }
  function metricGuides(options){
    options=options||{};
    var s=valid(options.curvature,options.observerHeight),eye=options.observerHeight;
    var limit=options.maxDistance===undefined?100000:options.maxDistance;
    if(!Number.isFinite(limit)||!(limit>0)||limit>1000000)
      throw RangeError('Rendering extent must be in (0, 1000000] metres');
    var primitives=[],radii=RINGS.filter(function(r){return r<=limit;});
    // Explicit manual extents are surface landmarks too, even when the
    // selected distance lies between the standard ring radii (e.g. 25 km).
    if(!radii.length||radii[radii.length-1]<limit)radii.push(limit);
    function at(r,a){return world(s,r*Math.sin(a),r*Math.cos(a),0,eye);}
    function add(points,type,kind,meta){
      primitives.push({type:type,mode:1,points:points,style:{stroke:options.stroke||'blue',alpha:0.7},
        metadata:Object.assign({kind:kind,metricSurface:true},meta)});
    }
    if(options.showGrid&1){
      var segments=64;
      radii.forEach(function(r){
        var pts=[];
        for(var i=0;i<segments;i++)pts.push(at(r,2*Math.PI*i/segments));
        add(pts,'polygon','metric-ring',{radius:r,angle:r});
      });
      // Spokes are split at the same physical landmarks as the rings, so a
      // nearby horizon cannot erase the whole 100 km segment.
      var marks=[0].concat(radii);
      if(marks[marks.length-1]<limit)marks.push(limit);
      for(var az=0;az<24;az++){
        var theta=2*Math.PI*az/24;
        for(var j=1;j<marks.length;j++){
          add([at(marks[j-1],theta),at(marks[j],theta)],'line','metric-spoke',
            {angle:theta,fromMetres:marks[j-1],toMetres:marks[j]});
        }
      }
    }
    return {primitives:primitives,metadata:{generator:'CurvaturePhysicalWorldGeometry',
      layer:'metric-surface-guides',curvature:options.curvature,
      gridRadiiMetres:radii,renderExtentMetres:limit,groundMetric:'surface-arc-metres'}};
  }
  // Reproduce the authored globe's latitude-then-longitude orientation in
  // local tangent axes, but place its anchor using the stable shared kernel.
  // No (R+h)*cos(theta)-R cancellation, even as R -> Infinity.
  function placement(params){
    if(!params||!Number.isFinite(params.geometryRadius)||params.geometryRadius<=0||
        !['height','objectSize','longitude','latitude','verticalScale','horizontalScale'].every(function(key){return Number.isFinite(params[key]);}))
      throw TypeError('Finite physical placement parameters required');
    // Physical scenes author surface coordinates in metres. The historical
    // FlatEarth drawing reverses the horizontal basis, but the continuous
    // physical limit must retain the SAME east/north axes and object azimuth.
    // Curvature is independent of that legacy drawing-mode switch.
    var k=params.curvature===undefined?(params.globe?1/params.geometryRadius:0):params.curvature,
      s=valid(k,params.height),R=params.geometryRadius,
      os=params.objectSize,lat=params.latitude*R*k,lng=params.longitude*R*k,
      side=params.planeOffset||0,alt=params.altitude||0;
    if(!Number.isFinite(side)||!Number.isFinite(alt))throw TypeError('Finite offsets required');
    if(!params.globe){
      return {origin:world(s,-params.latitude*R-os*side,params.longitude*R,alt,params.height),
        xAxis:[-os*params.horizontalScale,0,0],
        yAxis:[0,0,os*params.verticalScale]};
    }
    if(k===0){
      return {origin:world(s,params.latitude*R+os*side,params.longitude*R,alt,params.height),
        xAxis:[os*params.horizontalScale,0,0],
        yAxis:[0,0,os*params.verticalScale]};
    }
    var sl=Math.sin(lat),cl=Math.cos(lat),
      sg=Math.sin(lng),cg=Math.cos(lng);
    var radial=Math.hypot(sl,cl*sg),central=Math.atan2(radial,cl*cg);
    var ratio=radial?central/radial:1;
    var east=sl*ratio/k,north=cl*sg*ratio/k;
    var base=world(s,east,north,alt,params.height);
    var horizontal=[cl,-sl*sg,-sl*cg],vertical=[sl,cl*sg,cl*cg];
    var origin=base.map(function(v,i){return v+os*side*horizontal[i];});
    return {origin:origin,
      xAxis:horizontal.map(function(v){return os*params.horizontalScale*v;}),
      yAxis:vertical.map(function(v){return os*params.verticalScale*v;})};
  }
  return Object.freeze({metricGuides:metricGuides,guideExtent:guideExtent,
    placement:placement,RINGS:RINGS});
}));
