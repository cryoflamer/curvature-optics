/* Physical ground-occluded tower outlines in angular coordinates.
 * Inputs are independent GeometryEngine world-space tower edges; outputs are
 * visible line pieces only.  No horizon mask, Legacy drawing or Canvas.
 * Units: metres, radians. Earth is centred on [0,0,-R-observerHeight].
 */
(function (root, factory) {
  var api = factory(root.CurvatureGeometryEngine ||
    (typeof module === 'object' && module.exports ? require('../geometry/CurvatureGeometryEngine') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureOpticalTowerSilhouette = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (engine) {
  'use strict';
  if (!engine) throw Error('Independent geometry engine required');
  var STATUSES = ['visible','blocked','indeterminate','solver_failed'];
  function finite3(p) { return Array.isArray(p) && p.length === 3 && p.every(Number.isFinite); }
  function lerp(a,b,t) { return a+(b-a)*t; }
  function between(a,b,t) { return a.map(function (v,i) { return lerp(v,b[i],t); }); }
  function separation(a,b) { return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]); }
  function angularDelta(a,b) { return Math.atan2(Math.sin(a-b),Math.cos(a-b)); }
  function coordinate(point,geometry,radius,observerHeight) {
    if (!finite3(point)) throw TypeError('Finite world-space [x,y,z] required');
    var lateral=Math.hypot(point[0],point[1]);
    var azimuth=Math.atan2(point[0],point[1]);
    if (geometry === 'flat') return {distance:lateral,height:point[2]+observerHeight,azimuth:azimuth};
    var radial=point[2]+radius+observerHeight;
    return {distance:radius*Math.atan2(lateral,radial),
      height:Math.hypot(lateral,radial)-radius,azimuth:azimuth};
  }
  function projectPrimitives(options) {
    options=options||{};
    var primitives=options.primitives, field=options.field;
    var geometry=options.geometry, radius=options.radius === undefined ? 6371000 : options.radius;
    var observerHeight=options.observerHeight;
    var angularTolerance=options.angularTolerance === undefined ? 1e-5 : options.angularTolerance;
    var minimumDepth=options.minimumDepth === undefined ? 2 : options.minimumDepth;
    var maximumDepth=options.maximumDepth === undefined ? 16 : options.maximumDepth;
    var boundaryTolerance=options.boundaryTolerance === undefined ? 0.1 : options.boundaryTolerance;
    var maxSamples=options.maxSamples === undefined ? 40000 : options.maxSamples;
    if (!Array.isArray(primitives) || !field || typeof field.sample !== 'function' ||
        !['flat','globe'].includes(geometry) || !Number.isFinite(radius) || radius<=0 ||
        !Number.isFinite(observerHeight) || observerHeight<0 ||
        !Number.isFinite(angularTolerance) || angularTolerance<=0 || angularTolerance>0.1 ||
        !Number.isInteger(minimumDepth) || minimumDepth<0 || minimumDepth>6 ||
        !Number.isInteger(maximumDepth) || maximumDepth<minimumDepth || maximumDepth>24 ||
        !Number.isFinite(boundaryTolerance) || boundaryTolerance<=0 ||
        !Number.isInteger(maxSamples) || maxSamples<1)
      throw TypeError('Invalid physical tower outline projection options');
    var segments=[], unresolved=[];
    var stats={edges:0,evaluations:0,visiblePieces:0,hiddenLeaves:0,
      unresolvedLeaves:0,depthLimitedLeaves:0,interpolated:0,exact:0,
      unresolvedReasons:{},sampleStatuses:{}};
    var samples=new Map();
    function sample(p) {
      var key=p.join(',');
      if(samples.has(key)) return samples.get(key);
      var coord=coordinate(p,geometry,radius,observerHeight);
      var record={world:p,coordinate:coord,status:'solver_failed',angle:null,method:null,reason:null};
      if (stats.evaluations<maxSamples) {
        stats.evaluations++;
        // A point strictly inside the physical surface cannot be drawn.
        if (coord.height < -1e-6) record.status='blocked';
        else if (coord.distance>0 && (geometry==='flat' || coord.distance<radius*Math.PI/2)) {
          var projected;
          try { projected=field.sample(coord.distance,Math.max(0,coord.height)); }
          catch (error) { projected=null; }
          if (projected && STATUSES.includes(projected.status)) {
            record.status=projected.status;
            record.method=projected.method||'unknown';
            record.reason=projected.reason||null;
            if (projected.status==='visible' && Number.isFinite(projected.angle)) {
              record.angle=projected.angle;
              if(projected.method==='interpolated') stats.interpolated++;
              else stats.exact++;
            } else if(projected.status==='visible') record.status='solver_failed';
          }
        }
      }
      stats.sampleStatuses[record.status]=(stats.sampleStatuses[record.status]||0)+1;
      samples.set(key,record);
      return record;
    }
    function emit(a,b,source) {
      segments.push({points:[[a.coordinate.azimuth,a.angle],[b.coordinate.azimuth,b.angle]],
        world:[a.world.slice(),b.world.slice()],source:source,
        units:'radians',visibility:'visible'});
      stats.visiblePieces++;
    }
    function error(a,b,m) {
      var aAz=a.coordinate.azimuth,bAz=b.coordinate.azimuth;
      return Math.max(Math.abs(m.angle-(a.angle+b.angle)/2),
        Math.abs(angularDelta(m.coordinate.azimuth,aAz+angularDelta(bAz,aAz)/2)));
    }
    function noteUnresolved(source,reason,points) {
      stats.unresolvedLeaves++;
      stats.unresolvedReasons[reason]=(stats.unresolvedReasons[reason]||0)+1;
      unresolved.push({source:source,reason:reason,
        statuses:points.map(function(p){return p.status;}),
        details:points.filter(function(p){return p.reason;}).map(function(p){return p.reason;})});
    }
    function clipEdge(start,end,source) {
      var a=sample(start),b=sample(end);
      function visit(left,right,depth) {
        var mid=sample(between(left.world,right.world,0.5));
        var statuses=[left.status,mid.status,right.status];
        var visible=statuses.every(function (s) {return s==='visible';});
        var blocked=statuses.every(function (s) {return s==='blocked';});
        var uncertain=statuses.every(function (s) {return s==='indeterminate'||s==='solver_failed';});
        var length=separation(left.world,right.world);
        if(depth>=minimumDepth) {
          if(blocked){stats.hiddenLeaves++;return;}
          if(uncertain){noteUnresolved(source,
            statuses.includes('solver_failed')?'optical-solver':'grazing-uncertainty',
            [left,mid,right]);return;}
          if(visible && error(left,right,mid)<=angularTolerance){emit(left,right,source);return;}
        }
        if(depth>=maximumDepth || length<=boundaryTolerance || stats.evaluations>=maxSamples) {
          if(visible && error(left,right,mid)<=angularTolerance)emit(left,right,source);
          else if(blocked)stats.hiddenLeaves++;
          else {
            var reason=stats.evaluations>=maxSamples?'sample-budget':
              statuses.includes('solver_failed')?'optical-solver':
              statuses.includes('indeterminate')?'grazing-uncertainty':'visibility-boundary';
            noteUnresolved(source,reason,[left,mid,right]);
          }
          if(depth>=maximumDepth)stats.depthLimitedLeaves++;
          return;
        }
        visit(left,mid,depth+1);
        visit(mid,right,depth+1);
      }
      visit(a,b,0);
    }
    primitives.forEach(function (primitive,index) {
      if(!primitive || !['line','polygon'].includes(primitive.type) ||
          !Array.isArray(primitive.points) || primitive.points.length<2 ||
          !primitive.points.every(finite3)) throw TypeError('3D line/polygon tower primitives required');
      if(primitive.type==='line' && primitive.points.length!==2)throw TypeError('Line needs two points');
      var points=primitive.points;
      var count=primitive.type==='polygon' ? points.length : 2;
      for(var edge=0;edge<count-1;edge++) {
        if(separation(points[edge],points[edge+1])===0)continue;
        stats.edges++;
        clipEdge(points[edge],points[edge+1],{
          primitiveIndex:index,edgeIndex:edge,tower:primitive.tower||null,
          mode:primitive.mode,style:primitive.style||null});
      }
      // Explicitly close open polygon rings. Already-closed outlines are not doubled.
      if(primitive.type==='polygon' && separation(points[count-1],points[0])>0) {
        stats.edges++;
        clipEdge(points[count-1],points[0],{
          primitiveIndex:index,edgeIndex:count-1,tower:primitive.tower||null,
          mode:primitive.mode,style:primitive.style||null});
      }
    });
    return {segments:segments,unresolved:unresolved,stats:stats,
      scope:'Ground-occluded outline segments only; no polygon fills, mesh self-occlusion, or Canvas pixel projection'};
  }
  function projectTowerScene(options) {
    options=options||{};
    var model=options.model;
    if(!model || !Number.isFinite(model.Height) || model.Height<0 ||
        !Number.isFinite(model.geometryRadius) || model.geometryRadius<=0 ||
        !Array.isArray(model.ObjType))throw TypeError('Tower model required');
    var geometry=options.geometry;
    if(!['globe','flat'].includes(geometry))throw TypeError('Explicit Globe/Flat geometry required');
    var banks=options.banks === undefined ? [0,1].filter(function (b) {return model.ObjType[b]===3;}) : options.banks;
    if(!Array.isArray(banks) || banks.some(function (b) {return ![0,1].includes(b)||model.ObjType[b]!==3;}) || new Set(banks).size!==banks.length)
      throw TypeError('Only distinct tower banks 0 and 1 are supported');
    if(options.radius !== undefined && options.radius !== model.geometryRadius)
      throw Error('Tower geometry and optical radius must match');
    if(options.observerHeight !== undefined && options.observerHeight !== model.Height)
      throw Error('Tower geometry and optical observer height must match');
    var primitives=[],towers=0;
    banks.forEach(function (bank) {
      engine.towerSequence(model,bank,geometry==='globe').forEach(function (entry) {
        towers++;
        var metadata=entry.scene.metadata;
        entry.scene.primitives.forEach(function (primitive) {
          primitives.push(Object.assign({},primitive,{tower:{bank:bank,
            sequenceIndex:metadata.sequenceIndex,column:metadata.column}}));
        });
      });
    });
    var result=projectPrimitives(Object.assign({},options,{primitives:primitives,
      radius:model.geometryRadius,observerHeight:model.Height}));
    result.towers=towers;
    result.primitives=primitives.length;
    return result;
  }
  return {coordinate:coordinate,projectPrimitives:projectPrimitives,
    projectTowerScene:projectTowerScene};
}));
