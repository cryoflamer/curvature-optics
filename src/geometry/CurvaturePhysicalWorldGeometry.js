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
    12500,15000,20000,30000,40000,50000,75000,100000]);
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
  function metricGuides(options){
    options=options||{};
    var s=valid(options.curvature,options.observerHeight),eye=options.observerHeight;
    var limit=options.maxDistance===undefined?100000:options.maxDistance;
    if(!Number.isFinite(limit)||!(limit>0)||limit>100000)
      throw RangeError('Rendering extent must be in (0, 100000] metres');
    var primitives=[],radii=RINGS.filter(function(r){return r<=limit;});
    // Ensure a useful nearby guide when the requested extent is tiny.
    if(!radii.length)radii.push(limit);
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
    var k=params.globe?1/params.geometryRadius:0,
      s=valid(k,params.height),R=params.geometryRadius,
      os=params.objectSize,lat=params.latitude,lng=params.longitude,
      side=params.planeOffset||0,alt=params.altitude||0;
    if(!Number.isFinite(side)||!Number.isFinite(alt))throw TypeError('Finite offsets required');
    if(!params.globe){
      return {origin:world(s,-lat*R-os*side,lng*R,alt,params.height),
        xAxis:[-os*params.horizontalScale,0,0],
        yAxis:[0,0,os*params.verticalScale]};
    }
    var sl=Math.sin(lat),cl=Math.cos(lat),
      sg=Math.sin(lng),cg=Math.cos(lng);
    var radial=Math.hypot(sl,cl*sg),central=Math.atan2(radial,cl*cg);
    var distance=R*central,ratio=radial?central/radial:1;
    var east=R*sl*ratio,north=R*cl*sg*ratio;
    var base=world(s,east,north,alt,params.height);
    var horizontal=[cl,-sl*sg,-sl*cg],vertical=[sl,cl*sg,cl*cg];
    var origin=base.map(function(v,i){return v+os*side*horizontal[i];});
    return {origin:origin,
      xAxis:horizontal.map(function(v){return os*params.horizontalScale*v;}),
      yAxis:vertical.map(function(v){return os*params.verticalScale*v;})};
  }
  return Object.freeze({metricGuides:metricGuides,placement:placement,RINGS:RINGS});
}));
