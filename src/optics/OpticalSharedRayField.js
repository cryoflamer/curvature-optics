/* Shared, explicitly scoped, 2D optical projection cache for the tower prism.
 * No Canvas/legacy dependencies. Distances are flat horizontal ranges or
 * Globe surface arc lengths; heights are above their respective surfaces.
 * Only independently checked smooth visible cells may be interpolated.
 */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports
    ? require('./OpticalTargetProjection') : root.CurvatureTargetProjection);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureSharedRayField = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (projection) {
  'use strict';
  function axis(values, name, positive) {
    if (!Array.isArray(values) || values.length < 2 ||
        values.some(function (v, i) { return !Number.isFinite(v) ||
          (positive && v <= 0) || (i > 0 && v <= values[i - 1]); }))
      throw Error('Invalid increasing ' + name + ' axis');
    return values.slice();
  }
  function target(distance, height, geometry, radius) {
    if (geometry === 'flat') return [distance, height];
    var theta = distance / radius;
    return [(radius + height) * Math.sin(theta),
      (radius + height) * Math.cos(theta) - radius];
  }
  function interval(values, x) {
    if (x < values[0] || x > values[values.length - 1]) return -1;
    if (x === values[values.length - 1]) return values.length - 2;
    var lo=0, hi=values.length-1;
    while (hi-lo>1) {
      var mid=(lo+hi)>>1;
      if (values[mid] <= x) lo=mid; else hi=mid;
    }
    return lo;
  }
  function create(options) {
    options=options || {};
    var distances=axis(options.distances,'distance',true);
    var heights=axis(options.heights,'height',false);
    if (heights[0] < 0) throw Error('Field heights cannot be negative');
    var geometry=options.geometry === undefined ? 'flat' : options.geometry;
    var radius=options.radius === undefined ? 6371000 : options.radius;
    if ((geometry !== 'flat' && geometry !== 'globe') ||
        !Number.isFinite(radius) || radius <= 0 ||
        (geometry === 'globe' && distances[distances.length-1] >= radius * Math.PI / 2))
      throw Error('Invalid shared-field geometry or range');
    var angleTolerance=options.angleTolerance === undefined ? 1e-7 : options.angleTolerance;
    if (!Number.isFinite(angleTolerance) || angleTolerance <= 0 || angleTolerance > 0.1)
      throw Error('Invalid angular interpolation tolerance');
    var solverOptions=Object.assign({},options);
    delete solverOptions.distances;
    delete solverOptions.heights;
    delete solverOptions.angleTolerance;
    if (solverOptions.profileOptions)
      solverOptions.profileOptions=Object.assign({},solverOptions.profileOptions);
    // Cache lifetime is the returned field: changing atmosphere, camera height,
    // or R means constructing a new field. No hidden cross-configuration cache.
    var cache=new Map();
    var statistics={solves:0,hits:0,interpolations:0,fallbacks:0};
    function exact(d,h) {
      var key=d+','+h;
      if (cache.has(key)) {statistics.hits++;return cache.get(key);}
      var result=projection.solve(Object.assign({},solverOptions,{
        geometry:geometry,radius:radius,target:target(d,h,geometry,radius)
      }));
      var record={status:result.status,angle:result.angle,
        residual:result.residual,method:'exact',reason:result.reason};
      Object.freeze(record);
      cache.set(key,record);
      statistics.solves++;
      return record;
    }
    var cells=new Map();
    function linear(a,b,t) {return a+(b-a)*t;}
    function bilinear(corners,u,v) {
      return linear(linear(corners[0].angle,corners[1].angle,u),
        linear(corners[2].angle,corners[3].angle,u),v);
    }
    function prepare(i,j) {
      var key=i+','+j;
      if (cells.has(key)) return cells.get(key);
      var d0=distances[i], d1=distances[i+1], h0=heights[j], h1=heights[j+1];
      var corners=[exact(d0,h0),exact(d1,h0),exact(d0,h1),exact(d1,h1)];
      var accepted=corners.every(function (c) {return c.status === 'visible' && Number.isFinite(c.angle);});
      // Four edge midpoints and the centre detect common curvature missed by
      // corner-only interpolation. This is empirical, not a global error bound.
      var check=[[0.5,0],[0.5,1],[0,0.5],[1,0.5],[0.5,0.5]];
      var error=0;
      if (accepted) {
        for (var k=0;k<check.length;k++) {
          var u=check[k][0],v=check[k][1];
          var observed=exact(linear(d0,d1,u),linear(h0,h1,v));
          if (observed.status !== 'visible' || !Number.isFinite(observed.angle)) {
            accepted=false; break;
          }
          error=Math.max(error,Math.abs(observed.angle-bilinear(corners,u,v)));
        }
      }
      accepted=accepted && error <= angleTolerance;
      var cell={accepted:accepted,checkedError:error,corners:corners};
      cells.set(key,cell);
      return cell;
    }
    function sample(d,h) {
      if (!Number.isFinite(d) || !Number.isFinite(h) || d <= 0 || h < 0)
        throw Error('Invalid shared-field target coordinates');
      var i=interval(distances,d),j=interval(heights,h);
      if (i < 0 || j < 0) {
        statistics.fallbacks++;
        return exact(d,h);
      }
      var cell=prepare(i,j);
      if (!cell.accepted) {
        statistics.fallbacks++;
        return exact(d,h);
      }
      var u=(d-distances[i])/(distances[i+1]-distances[i]);
      var v=(h-heights[j])/(heights[j+1]-heights[j]);
      statistics.interpolations++;
      return {status:'visible',angle:bilinear(cell.corners,u,v),
        residual:null,method:'interpolated',checkedError:cell.checkedError,
        reason:null};
    }
    // Explicit eager qualification is optional; cells also build lazily.
    function warm() {
      for(var i=0;i<distances.length-1;i++)
        for(var j=0;j<heights.length-1;j++) prepare(i,j);
      return stats();
    }
    function stats() {return Object.assign({cells:cells.size,points:cache.size},statistics);}
    return {sample:sample,exact:exact,warm:warm,stats:stats,
      distances:distances.slice(),heights:heights.slice()};
  }
  return {create:create};
}));
