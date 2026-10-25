/* Vacuum coordinate bridge for the independent inverse-optics integration.
 * The ray solver's vacuum branch is analytic: the arrival direction is the
 * straight line from the observer to the physical vertex. No marker axis,
 * towerAnchor(), or existing overlay projection is reused here.
 * Atmospheric shooting and visibility are deliberately NOT implemented yet.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureInverseOpticsBridge = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function vacuumDirection(world) {
    if (!Array.isArray(world) || world.length !== 3 || !world.every(Number.isFinite)) return null;
    var horizontal = Math.hypot(world[0], world[1]);
    if (!(horizontal > 0)) return null;
    var azimuth = Math.atan2(world[0], world[1]);
    var elevation = Math.atan2(world[2], horizontal);
    return { azimuth: azimuth, elevation: elevation, range: horizontal };
  }
  function directionAtRange(direction) {
    if (!direction || !(direction.range > 0)) return null;
    var h = direction.range;
    return [h * Math.sin(direction.azimuth), h * Math.cos(direction.azimuth),
      h * Math.tan(direction.elevation)];
  }
  function project(g, world) {
    var c = g.Camera.Trans(world);
    return [g.WinTrans.TransX(c[0]), g.WinTrans.TransY(c[1])];
  }
  // Project a physical arrival direction directly through the camera basis,
  // independently of Camera.Trans() and the cached apparent vertex.  The ray
  // originates at the observer (world origin), not at the graphics camera.
  function projectArrivalDirection(g, physical, angle, rangeScale) {
    var camera = g && g.Camera, mat = camera && camera.CamTrans;
    if (!camera || !Array.isArray(camera.CamPos) || !mat ||
        !Number.isFinite(camera.ScreenDist) || !Number.isFinite(camera.Zoom)) return null;
    var horizontal = Math.hypot(physical[0], physical[1]);
    if (!(horizontal > 0) || !Number.isFinite(angle)) return null;
    var scale = rangeScale === undefined ? 1 : rangeScale;
    var ray = [physical[0]*scale, physical[1]*scale,
      horizontal*scale*Math.tan(angle)];
    var relative = ray.map(function (v,i) { return v-camera.CamPos[i]; });
    var c = mat.map(function (row) {
      return row[0]*relative[0]+row[1]*relative[1]+row[2]*relative[2];
    });
    var depth = -c[0];
    if (!(depth > 0)) return null;
    var factor = camera.ScreenDist*camera.Zoom/depth;
    return [g.WinTrans.TransX(c[1]*factor),g.WinTrans.TransY(c[2]*factor)];
  }
  // The ray solver uses the observer at world origin. Verify that the
  // graphics camera has the same center, and that a ray's image does not
  // depend on the arbitrary distance used to represent its direction.
  function auditCameraOrigin(g, m) {
    var camera = g && g.Camera;
    if (!camera || !Array.isArray(camera.CamPos) ||
        !camera.CamPos.every(Number.isFinite)) return null;
    var originDistance = Math.hypot.apply(Math, camera.CamPos);
    var modelDistance = m && Array.isArray(m.camPos) && m.camPos.every(Number.isFinite) ?
      Math.hypot.apply(Math, m.camPos) : NaN;
    var directions = [[0,1,0],[0.02,1,0.01],[-0.03,1,-0.015]];
    var maxRangeShift = 0, checked = 0;
    directions.forEach(function (v) {
      var angle = Math.atan2(v[2], Math.hypot(v[0],v[1]));
      var near = projectArrivalDirection(g,v,angle,100);
      var far = projectArrivalDirection(g,v,angle,10000);
      if (!near || !far) return;
      checked++;
      maxRangeShift = Math.max(maxRangeShift,
        Math.hypot(near[0]-far[0],near[1]-far[1]));
    });
    return {cameraPos:camera.CamPos.slice(),modelCamPos:m && m.camPos && m.camPos.slice(),
      originDistance:originDistance,modelDistance:modelDistance,
      directionsChecked:checked,maxRangeShift:maxRangeShift,
      passed:originDistance<1e-9 && modelDistance<1e-9 &&
        checked===directions.length && maxRangeShift<0.001};
  }
  function compareTower(g, capture) {
    if (!capture || !Array.isArray(capture.points)) return null;
    var rows = [], sumSquares = 0, maxPx = 0;
    capture.points.forEach(function (vertex) {
      var direction = vacuumDirection(vertex.world);
      var reconstructed = directionAtRange(direction);
      if (!reconstructed) return;
      var original = project(g, vertex.world);
      var optical = project(g, reconstructed);
      var errorPx = Math.hypot(optical[0] - original[0], optical[1] - original[1]);
      rows.push({localX:vertex.x, localY:vertex.y, original:original,
        optical:optical, errorPx:errorPx});
      sumSquares += errorPx * errorPx;
      maxPx = Math.max(maxPx, errorPx);
    });
    return {tower:capture.tower, count:rows.length, maxPx:maxPx,
      rmsPx:rows.length ? Math.sqrt(sumSquares / rows.length) : null, rows:rows};
  }
  // Independent numerical audit: compare the solver arrival direction with the
  // actual camera projection of physical and apparent vertices. This does not
  // modify the cached orange overlay or the scene.
  function auditVertices21(g, m, capture, solver) {
    if (!capture || !Array.isArray(capture.points) || !solver ||
        typeof solver.solveAngle !== 'function') return null;
    var unique = [], seen = Object.create(null);
    capture.points.forEach(function (p) {
      var key = p.world.map(function (x) { return x.toFixed(7); }).join(',');
      if (!seen[key]) { seen[key] = true; unique.push(p); }
    });
    if (!unique.length) return null;
    unique.sort(function (a,b) { return a.y-b.y; });
    var picks = [unique[0], unique[Math.floor((unique.length-1)/2)], unique[unique.length-1]];
    var rows = picks.map(function (vertex, i) {
      var world = vertex.world, horizontal = Math.hypot(world[0],world[1]);
      var radialZ = world[2]+m.rEarth+m.Height;
      var altitude = Math.hypot(horizontal,radialZ)-m.rEarth;
      var distance = m.rEarth*Math.atan2(horizontal,radialZ);
      var vacuum = Math.atan2(world[2],horizontal);
      var physicalPx = project(g,world);
      var result = solver.solveAngle({geometry:'globe',atmosphere:'standard',
        observerHeight:m.Height,radius:m.rEarth,distance:distance,
        targetHeight:altitude,step:25});
      var row = {level:['base','middle','top'][i],height:altitude,
        distance:distance,vacuumDeg:vacuum*180/Math.PI,
        status:result.status,physicalPx:physicalPx};
      if (result.status === 'visible' && Number.isFinite(result.angle)) {
        var apparent = [world[0],world[1],horizontal*Math.tan(result.angle)];
        var opticalPx = project(g,apparent);
        var recovered = Math.atan2(apparent[2],horizontal);
        row.opticalDeg=result.angle*180/Math.PI;
        row.deltaArcsec=(result.angle-vacuum)*180/Math.PI*3600;
        row.reconstructionArcsec=(recovered-result.angle)*180/Math.PI*3600;
        row.opticalPx=opticalPx;
        row.deltaPx=[opticalPx[0]-physicalPx[0],opticalPx[1]-physicalPx[1]];
      }
      return row;
    });
    return {tower:21,rows:rows};
  }
  // A separately computed, explicit diagnostic; never solve RK4 in Redraw().
  var atmosphere21 = { state: 'idle', paths: null, key: null, message: '' };
  function modelKey(m) {
    return [m.rEarth, m.Height, m.ObjDist[0], m.ObjDeltaDist[0],
      m.ObjSize[0], m.ObjSidePos[0], m.NObjects[0]].join('|');
  }
  // In a radially symmetric atmosphere the shooting problem depends only on
  // central distance and radial altitude, not the vertex's azimuth. Keep the
  // projected point's original x/y, but reuse the expensive elevation solve.
  function rayParameters(world, m) {
    var horizontal = Math.hypot(world[0], world[1]);
    var radialZ = world[2] + m.rEarth + m.Height;
    var altitude = Math.hypot(horizontal, radialZ) - m.rEarth;
    var distance = m.rEarth * Math.atan2(horizontal, radialZ);
    if (!(distance > 0) || !(altitude >= 0)) return null;
    return {horizontal:horizontal, altitude:altitude, distance:distance};
  }
  // Fast preview: effective-radius approximation, with exact shooting near
  // the estimated horizon. This is deliberately NOT the validated exact mode.
  function fastRay(p, m, solver, stats) {
    var R=m.rEarth, observer=m.Height, d=p.distance, h=p.altitude;
    var n0=0.000293, scale=7350;
    var effective=R/(1-R*n0/scale);
    var horizon=Math.sqrt(Math.max(0,2*effective*observer+observer*observer));
    var remaining=Math.max(0,d-horizon);
    var boundary=Math.sqrt(effective*effective+remaining*remaining)-effective;
    // Exact solver is mandatory near the horizon. The guard is deliberately
    // wider than the millimetre-scale error measured for this atmosphere.
    if (Math.abs(h-boundary)<3 || d<1000) {
      if(stats)stats.fastFallbacks++;
      return solver.solveAngle({geometry:'globe',atmosphere:'standard',
        observerHeight:observer,radius:R,distance:d,targetHeight:h,step:25});
    }
    if(h<boundary-3) {
      if(stats)stats.fastRejected++;
      return {status:'occluded'};
    }
    // Local tangent-frame chord angle on a sphere with effective radius.
    var central=d/effective;
    var x=(effective+h)*Math.sin(central);
    var z=(effective+h)*Math.cos(central)-(effective+observer);
    if(stats)stats.fastApproximated++;
    return {status:'visible',angle:Math.atan2(z,x)};
  }
  // Calibrated polynomial: quadratic in altitude, linear in distance for the
  // small correction to the effective-radius analytic angle. Visibility is
  // independently calibrated against the exact solver, never inferred from
  // the polynomial angle. Designed for the standard n(h) profile only.
  function createPolynomialApproximation(m, solver, stats, options) {
    options=options||{};
    var R=m.rEarth, observer=m.Height;
    var effective=R/(1-R*0.000293/7350);
    var distances=options.distances||[3000,6000,10000,14000,18000,22000,26000];
    var heights=[10,25,45];
    var rows=[], boundaries=[];
    function exact(d,h) {
      if(stats) stats.polyExact++;
      return solver.solveAngle({geometry:'globe',atmosphere:'standard',
        observerHeight:observer,radius:R,distance:d,targetHeight:h,step:25});
    }
    function analytic(d,h) {
      var a=d/effective;
      return Math.atan2((effective+h)*Math.cos(a)-(effective+observer),
        (effective+h)*Math.sin(a));
    }
    function boundaryEstimate(d) {
      var horizon=Math.sqrt(2*effective*observer+observer*observer);
      var remaining=Math.max(0,d-horizon);
      return Math.hypot(effective,remaining)-effective;
    }
    function interpolate(d, values) {
      var j=1;
      while(j<distances.length-1 && distances[j]<d) j++;
      var t=(d-distances[j-1])/(distances[j]-distances[j-1]);
      return values[j-1]+t*(values[j]-values[j-1]);
    }
    function correctionAt(h, values) {
      var sum=0;
      for(var i=0;i<3;i++) {
        var factor=1;
        for(var j=0;j<3;j++) if(j!==i) factor*=(h-heights[j])/(heights[i]-heights[j]);
        sum+=factor*values[i];
      }
      return sum;
    }
    // Lazily calibrate once, rather than blocking the UI on mode selection.
    function calibrate() {
      if(rows.length) return;
      distances.forEach(function(d) {
        var values=heights.map(function(h) {
          var result=exact(d,h);
          return result.status==='visible'?result.angle-analytic(d,h):null;
        });
        rows.push(values);
        var guess=boundaryEstimate(d);
        // When ground level is visible, the visibility boundary is exactly 0.
        if(exact(d,0).status==='visible') {boundaries.push(-guess);return;}
        var low=Math.max(0,guess-1), high=guess+1;
        // Expand if the effective-radius estimate is unexpectedly inaccurate.
        while(low>0 && exact(d,low).status==='visible') low=Math.max(0,low-1);
        while(exact(d,high).status!=='visible' && high<100) high+=1;
        for(var k=0;k<11;k++) {
          var mid=(low+high)/2;
          if(exact(d,mid).status==='visible') high=mid;
          else low=mid;
        }
        boundaries.push(high-boundaryEstimate(d));
      });
      if(stats) stats.polyCalibration=stats.polyExact;
    }
    function get(d,h) {
      if(!(d>=distances[0] && d<=distances[distances.length-1]) || h>55 || h<0)
        {if(stats)stats.polyDirect++;return exact(d,h);}
      calibrate();
      var estimated=boundaryEstimate(d);
      // Boundaries store a correction except for ground-visible anchors.
      var boundary=Math.max(0,estimated+interpolate(d,boundaries));
      // Conservative guard against boundary interpolation and bisection error.
      // Never declare visibility based on an unverified polynomial near contact.
      if(Math.abs(h-boundary)<0.15) {
        if(stats)stats.polyDirect++;
        return exact(d,h);
      }
      if(h<boundary-0.15) {if(stats)stats.polyRejected++;return {status:'occluded'};}
      var corrections=rows.map(function(row){return row.every(Number.isFinite)?correctionAt(h,row):null;});
      if(corrections.some(function(v){return v===null;})) {
        if(stats)stats.polyDirect++;
        return exact(d,h);
      }
      if(stats)stats.polyInterpolated++;
      return {status:'visible',angle:analytic(d,h)+interpolate(d,corrections)};
    }
    return {get:get,calibrate:calibrate};
  }
  // Experimental lazy optical map. Interpolate the *correction* to the
  // effective-radius preview rather than the absolute angle. A cell is used
  // only after exact corners and its centre agree within an angular budget.
  // Cells crossing the horizon are never interpolated.
  function createOpticalMap(m, solver, stats, options) {
    options=options||{};
    var dStep=options.distanceStep||250, hStep=options.heightStep||2;
    var maxErrorArcsec=options.maxErrorArcsec||0.15;
    var cells=Object.create(null), nodes=Object.create(null);
    var radians=maxErrorArcsec*Math.PI/(180*3600);
    function exact(d,h) {
      var key=d.toFixed(5)+'|'+h.toFixed(5);
      if (!Object.prototype.hasOwnProperty.call(nodes,key)) {
        nodes[key]=solver.solveAngle({geometry:'globe',atmosphere:'standard',
          observerHeight:m.Height,radius:m.rEarth,distance:d,targetHeight:h,step:25});
        if(stats)stats.mapExact++;
      }
      return nodes[key];
    }
    function approx(d,h) {
      return fastRay({distance:d,altitude:h},m,solver,null);
    }
    function correction(d,h) {
      var r=exact(d,h), a=approx(d,h);
      return r && a && r.status==='visible' && a.status==='visible' ? r.angle-a.angle : null;
    }
    function get(d,h) {
      // The near-tangent region is ill-conditioned: always shoot exactly.
      var R=m.rEarth, eff=R/(1-R*0.000293/7350);
      var horizon=Math.sqrt(2*eff*m.Height+m.Height*m.Height);
      var rest=Math.max(0,d-horizon);
      var boundary=Math.hypot(eff,rest)-eff;
      if (Math.abs(h-boundary)<0.35 || d<1000) {
        if(stats)stats.mapDirect++;
        return exact(d,h);
      }
      if (h<boundary-3) return {status:'occluded'};
      if (h<boundary+0.35) { if(stats)stats.mapDirect++;return exact(d,h); }
      var di=Math.floor(d/dStep), hi=Math.floor(h/hStep);
      var key=di+'|'+hi, cell=cells[key];
      var d0=di*dStep,d1=d0+dStep,h0=hi*hStep,h1=h0+hStep;
      if (!cell) {
        var corners=[[d0,h0],[d1,h0],[d0,h1],[d1,h1]];
        var values=corners.map(function(q){return correction(q[0],q[1]);});
        if(values.some(function(v){return v===null;})) cell={valid:false};
        else {
          var center=correction((d0+d1)/2,(h0+h1)/2);
          var predicted=(values[0]+values[1]+values[2]+values[3])/4;
          cell={valid:center!==null && Math.abs(center-predicted)<=radians, values:values};
        }
        cells[key]=cell;
        if(stats)stats.mapCells++;
      }
      if (!cell.valid) {if(stats)stats.mapDirect++;return exact(d,h);}
      var u=(d-d0)/dStep,v=(h-h0)/hStep, q=cell.values;
      var delta=(1-u)*(1-v)*q[0]+u*(1-v)*q[1]+(1-u)*v*q[2]+u*v*q[3];
      var a=approx(d,h);
      if(a.status!=='visible') {if(stats)stats.mapDirect++;return exact(d,h);}
      if(stats)stats.mapInterpolated++;
      return {status:'visible',angle:a.angle+delta};
    }
    return {get:get, stats:stats};
  }
  // Forward ray bundle: trace each launch angle ONCE across all distances.
  // A ray stopped by ground is never extrapolated behind the horizon.
  // Ambiguous cases use the exact shooting solver, preserving visibility.
  function createForwardBundle(m, tracer, solver, stats, options) {
    options=options||{};
    if (!tracer || typeof tracer.trace!=='function') throw Error('Forward ray tracer missing');
    var maxDistance=options.maxDistance||30000;
    var spacing=options.angleSpacing||0.00010;
    var step=options.step||25;
    var minAngle=options.minAngle===undefined?-0.015:options.minAngle;
    var maxAngle=options.maxAngle===undefined?0.015:options.maxAngle;
    var rays=[], exactCache=Object.create(null);
    function addRay(angle) {
      var result=tracer.trace({geometry:'globe',atmosphere:'standard',
        observerHeight:m.Height,radius:m.rEarth,angle:angle,
        length:maxDistance+100,step:step,collect:true});
      if(stats)stats.bundleTraces++;
      return {angle:angle,points:result.points};
    }
    for(var i=0,n=Math.ceil((maxAngle-minAngle)/spacing);i<=n;i++)
      rays.push(addRay(minAngle+(maxAngle-minAngle)*i/n));
    function heightAt(ray,d) {
      var x=m.rEarth*Math.sin(d/m.rEarth), pts=ray.points;
      if(!pts || pts.length<2 || pts[pts.length-1][0]<x) return null;
      var lo=0,hi=pts.length-1;
      while(hi-lo>1) {var mid=(lo+hi)>>1;if(pts[mid][0]<x)lo=mid;else hi=mid;}
      var a=pts[lo],b=pts[hi],t=(x-a[0])/(b[0]-a[0]);
      var z=a[1]+(b[1]-a[1])*t;
      return Math.hypot(x,z+m.rEarth)-m.rEarth;
    }
    function exact(d,h) {
      var key=d.toPrecision(14)+'|'+h.toPrecision(14);
      if(!Object.prototype.hasOwnProperty.call(exactCache,key)) {
        exactCache[key]=solver.solveAngle({geometry:'globe',atmosphere:'standard',
          observerHeight:m.Height,radius:m.rEarth,distance:d,targetHeight:h,step:25});
        if(stats)stats.bundleExact++;
      }
      return exactCache[key];
    }
    function get(d,h) {
      if(!(d>0) || d>maxDistance || h<0) return exact(d,h);
      // Each ray gives a height at the target's central distance. Find
      // adjacent rays bracketing the target; do not interpolate across a
      // ground hit, an unbracketed target, or a near-ground tangent.
      var previous=null;
      for(var j=0;j<rays.length;j++) {
        var value=heightAt(rays[j],d);
        if(value===null) {previous=null;continue;}
        if(previous && previous.value<=h && h<=value) {
          if(previous.value<0.75 || value<0.75 ||
              value-previous.value>Math.max(3,0.002*d)) return exact(d,h);
          var u=(h-previous.value)/(value-previous.value);
          if(stats)stats.bundleInterpolated++;
          return {status:'visible',angle:previous.angle+u*(rays[j].angle-previous.angle)};
        }
        previous={angle:rays[j].angle,value:value};
      }
      return exact(d,h);
    }
    return {get:get,rays:rays.length,heightAt:heightAt};
  }
  function opticalVertex(world, m, solver, rayCache, stats, fast, opticalMap, forwardBundle, polynomial) {
    var p = rayParameters(world, m);
    if (!p) return null;
    var result;
    if (rayCache) {
      // 14 significant digits keep sub-nanometre precision at these ranges.
      // Quantization is only for identifying equivalent physical rays.
      var key = p.distance.toPrecision(14) + '|' + p.altitude.toPrecision(14);
      if (Object.prototype.hasOwnProperty.call(rayCache, key)) {
        result = rayCache[key];
        if (stats) stats.rayHits++;
      } else {
        result = polynomial ? polynomial.get(p.distance,p.altitude) : forwardBundle ? forwardBundle.get(p.distance,p.altitude) : opticalMap ? opticalMap.get(p.distance,p.altitude) : fast ? fastRay(p,m,solver,stats) : solver.solveAngle({geometry:'globe', atmosphere:'standard',
          observerHeight:m.Height, radius:m.rEarth, distance:p.distance,
          targetHeight:p.altitude, step:25});
        rayCache[key] = result;
        if (stats) stats.raySolves++;
      }
    } else {
      result = solver.solveAngle({geometry:'globe', atmosphere:'standard',
        observerHeight:m.Height, radius:m.rEarth, distance:p.distance,
        targetHeight:p.altitude, step:25});
    }
    if (!result || result.status !== 'visible') return null;
    return [world[0], world[1], p.horizontal * Math.tan(result.angle)];
  }
  // Sample an original straight structural member in physical world space.
  // Refraction acts on every sampled point, not on its endpoints alone.
  function interpolateWorld(a, b, t) {
    return a.map(function (v, k) { return v + (b[k] - v) * t; });
  }
  // Bisect a visibility transition. A segment is never allowed to span an
  // unsolved interval; the visible endpoint approaches the boundary from its
  // visible side. This is a geometric approximation, not a proof of occlusion.
  function adaptiveEdge(a, b, sample, maxDepth, tolerance) {
    var out = [], solved = 0, transitions = 0, unresolved = 0;
    var boundaryTolerance = 1 / 65536;
    function probe(t) { solved++; return sample(t); }
    function emit(p) {
      if (p === null && (!out.length || out[out.length - 1] === null)) return;
      out.push(p);
    }
    function boundary(tVisible, pVisible, tHidden) {
      for (var k = 0; k < 20 && Math.abs(tVisible - tHidden) > boundaryTolerance; k++) {
        var mid = (tVisible + tHidden) / 2, pm = probe(mid);
        if (pm) { tVisible = mid; pVisible = pm; }
        else tHidden = mid;
      }
      transitions++;
      return pVisible;
    }
    function terminal(t0, p0, tm, pm, t1, p1) {
      // Process two halves separately: a hidden midpoint must never be
      // connected to visible endpoints, even when both ends are visible.
      [[t0,p0,tm,pm],[tm,pm,t1,p1]].forEach(function (half) {
        var x=half[0], px=half[1], y=half[2], py=half[3];
        if (px && py) { emit(px); emit(py); }
        else if (px) { emit(px); emit(boundary(x,px,y)); emit(null); }
        else if (py) { emit(null); emit(boundary(y,py,x)); emit(py); }
        else emit(null);
      });
    }
    function subdivide(t0, p0, t1, p1, depth) {
      var mid = (t0 + t1) / 2, pm = probe(mid);
      var transition = !p0 || !pm || !p1;
      var curved = !transition && Math.hypot(
        pm[0] - (p0[0] + p1[0]) / 2,
        pm[1] - (p0[1] + p1[1]) / 2,
        pm[2] - (p0[2] + p1[2]) / 2) > tolerance;
      if (depth < maxDepth && (transition || curved)) {
        subdivide(t0, p0, mid, pm, depth + 1);
        subdivide(mid, pm, t1, p1, depth + 1);
      } else {
        if (transition && depth === maxDepth) unresolved++;
        terminal(t0,p0,mid,pm,t1,p1);
      }
    }
    var first = probe(0), last = probe(1);
    subdivide(0, first, 1, last, 0);
    return {points:out, evaluations:solved, transitions:transitions,
      terminalTransitions:unresolved};
  }
  function calculateAtmosphere21(m, audit, solver, onProgress, onDone) {
    var paths = audit && audit.getTowerPaths(21);
    if (!paths || !paths.length || !solver) {
      atmosphere21 = {state:'error', paths:null, key:null,
        message:'Tower #21 geometry or ray solver is unavailable'};
      onDone(atmosphere21); return;
    }
    var key = modelKey(m), output = paths.map(function () { return []; });
    var edges = [], cache = Object.create(null), samples = [], evaluations = 0;
    var transitions = 0, terminalTransitions = 0, segments = [];
    paths.forEach(function (path, pi) {
      for (var j = 1; j < path.length; j++)
        edges.push({path:pi, a:path[j-1], b:path[j]});
    });
    var generation = {};
    atmosphere21 = {state:'working', paths:null, key:key, message:'0 / ' + edges.length,
      generation:generation};
    var i = 0;
    function sample(world) {
      var cacheKey = world.map(function (v) { return v.toFixed(7); }).join(',');
      if (!Object.prototype.hasOwnProperty.call(cache, cacheKey)) {
        cache[cacheKey] = opticalVertex(world, m, solver);
        samples.push({physical:world.slice(), apparent:cache[cacheKey] && cache[cacheKey].slice()});
        evaluations++;
      }
      return cache[cacheKey];
    }
    function batch() {
      // A newer request supersedes this one; stale results must not redraw.
      if (atmosphere21.generation !== generation) return;
      if (i < edges.length) {
        var edge = edges[i++];
        var result = adaptiveEdge(edge.a, edge.b, function (t) {
          return sample(interpolateWorld(edge.a, edge.b, t));
        }, 5, 0.10);
        transitions += result.transitions;
        terminalTransitions += result.terminalTransitions;
        segments.push({path:edge.path, points:result.points, transitions:result.transitions});
        // Keep each original member separate, even if the source paths join.
        if (output[edge.path].length) output[edge.path].push(null);
        Array.prototype.push.apply(output[edge.path], result.points);
        atmosphere21.message = i + ' / ' + edges.length + ' edges';
        onProgress(atmosphere21.message);
        setTimeout(batch, 0);
      } else {
        atmosphere21 = {state:'ready', paths:output, samples:samples, segments:segments,
          transitions:transitions, terminalTransitions:terminalTransitions, key:key,
          message:'Calculated ' + edges.length + ' edges, ' + evaluations + ' ray samples'};
        onDone(atmosphere21);
      }
    }
    setTimeout(batch, 0);
  }
  // Experimental whole-line overlay. It never replaces the original renderer.
  var lineAtmosphere = {state:'idle', paths:null, key:null, message:''};
  function getLineAtmosphere() { return lineAtmosphere; }
  function calculateAtmosphereLine(m, audit, solver, onProgress, onDone, options) {
    options = options || {};
    onProgress = onProgress || function(){};
    onDone = onDone || function(){};
    var groups = audit && audit.getCapturedGroups();
    var primary = groups && groups.primary;
    if (!primary || !solver || typeof solver.solveAngle !== 'function') {
      lineAtmosphere = {state:'error',paths:null,key:null,message:'Missing captured towers or solver'};
      onDone(lineAtmosphere); return;
    }
    var indices = Object.keys(primary).filter(function(k) {
      return /^\d+$/.test(k) && audit.getTowerPaths(Number(k));
    }).map(Number).sort(function(a,b){return a-b;});
    // Select towers before constructing edges or starting expensive ray solves.
    // Selection uses actual captured tower IDs, not assumed contiguous numbering.
    var mode=options.mode || 'sample';
    if (mode === 'single') {
      indices=indices.filter(function(i){return i===21;});
    } else if (mode === 'sample') {
      var count=Math.max(1,Math.min(15,Math.floor(Number(options.count)||5)));
      if (indices.length>count) {
        var chosen=[];
        for(var n=0;n<count;n++) {
          var position=count===1?Math.floor((indices.length-1)/2):Math.round(n*(indices.length-1)/(count-1));
          chosen.push(indices[position]);
        }
        indices=chosen;
      }
    } else if (mode !== 'all') {
      lineAtmosphere={state:'error',paths:null,key:null,message:'Unknown tower selection mode'};
      onDone(lineAtmosphere); return;
    }
    var edges = [];
    indices.forEach(function(index) {
      audit.getTowerPaths(index).forEach(function(path) {
        for (var j=1;j<path.length;j++) edges.push({tower:index,a:path[j-1],b:path[j]});
      });
    });
    if (!edges.length) {
      lineAtmosphere = {state:'error',paths:null,key:null,message:'No tower edges captured'};
      onDone(lineAtmosphere); return;
    }
    var generation = {}, key=modelKey(m), paths=[], cache=Object.create(null);
    var rayCache=Object.create(null), stats={raySolves:0,rayHits:0,fastFallbacks:0,fastRejected:0,fastApproximated:0};
    var fast=options.quality==='fast';
    var mapped=options.quality==='map';
    var bundled=options.quality==='bundle';
    var poly=options.quality==='poly';
    stats.polyExact=0;stats.polyCalibration=0;stats.polyDirect=0;stats.polyInterpolated=0;stats.polyRejected=0;
    var polynomial=poly?createPolynomialApproximation(m,solver,stats):null;
    stats.mapExact=0;stats.mapDirect=0;stats.mapCells=0;stats.mapInterpolated=0;
    var opticalMap=mapped?createOpticalMap(m,solver,stats,options.mapOptions):null;
    stats.bundleTraces=0;stats.bundleExact=0;stats.bundleInterpolated=0;
    var forwardBundle=null;
    if(bundled) {
      var maxDistance=0;
      edges.forEach(function(e){[e.a,e.b].forEach(function(w){var p=rayParameters(w,m);if(p)maxDistance=Math.max(maxDistance,p.distance);});});
      var tracer=typeof globalThis!=='undefined' && globalThis.CurvatureRayTracer;
      tracer=options.tracer||tracer;
      if(!tracer || typeof tracer.trace!=='function') {
        lineAtmosphere={state:'error',paths:null,key:key,message:'Forward ray tracer missing'};
        onDone(lineAtmosphere);return;
      }
      forwardBundle=createForwardBundle(m,tracer,solver,stats,{maxDistance:maxDistance+100});
    }
    var started=Date.now();
    var i=0, evaluations=0, visible=0, hidden=0, transitions=0;
    lineAtmosphere = {state:'working',paths:null,key:key,generation:generation,
      message:'0 / '+edges.length+' edges'};
    function sample(world) {
      var k=world.map(function(v){return v.toFixed(7);}).join(',');
      if (!Object.prototype.hasOwnProperty.call(cache,k)) {
        cache[k]=opticalVertex(world,m,solver,rayCache,stats,fast,opticalMap,forwardBundle,polynomial);
        evaluations++;
        if (cache[k]) visible++; else hidden++;
      }
      return cache[k];
    }
    function batch() {
      if (lineAtmosphere.generation!==generation) return;
      // Limit each turn so the browser remains responsive.
      var end=Math.min(i+8,edges.length);
      for (;i<end;i++) {
        var e=edges[i];
        var result=adaptiveEdge(e.a,e.b,function(t){
          return sample(interpolateWorld(e.a,e.b,t));
        },5,0.10);
        transitions+=result.transitions;
        paths.push({tower:e.tower,points:result.points});
      }
      lineAtmosphere.message=i+' / '+edges.length+' edges';
      onProgress(lineAtmosphere.message);
      if (i<edges.length) setTimeout(batch,0);
      else {
        lineAtmosphere={state:'ready',paths:paths,key:key,towers:indices.length,
          edges:edges.length,evaluations:evaluations,visible:visible,hidden:hidden,
          transitions:transitions,raySolves:stats.raySolves,rayHits:stats.rayHits,
          selection:mode, quality:poly?'poly':bundled?'bundle':mapped?'map':fast?'fast':'exact', elapsedMs:Date.now()-started,
          fastFallbacks:stats.fastFallbacks,fastRejected:stats.fastRejected,fastApproximated:stats.fastApproximated,
          mapExact:stats.mapExact,mapDirect:stats.mapDirect,mapCells:stats.mapCells,mapInterpolated:stats.mapInterpolated,
          bundleTraces:stats.bundleTraces,bundleExact:stats.bundleExact,bundleInterpolated:stats.bundleInterpolated,
          polyExact:stats.polyExact,polyCalibration:stats.polyCalibration,polyDirect:stats.polyDirect,polyInterpolated:stats.polyInterpolated,polyRejected:stats.polyRejected,
          selectedTowerIds:indices.slice(),
          message:'Calculated '+indices.length+' towers ('+mode+'), '+
            edges.length+' edges, '+evaluations+' ray samples, '+
            stats.raySolves+' unique rays ('+stats.rayHits+' reused); hidden='+hidden+
            ', transitions='+transitions+', elapsed='+ (Date.now()-started)+'ms'+
            (fast?', approximate='+stats.fastApproximated+', horizon exact='+stats.fastFallbacks+', rejected='+stats.fastRejected:'')+
            (mapped?', map cells='+stats.mapCells+', map exact='+stats.mapExact+', interpolated='+stats.mapInterpolated+', direct='+stats.mapDirect:'')+
            (bundled?', forward traces='+stats.bundleTraces+', bundle exact='+stats.bundleExact+', interpolated='+stats.bundleInterpolated:'')+
            (poly?', calibration='+stats.polyCalibration+', exact='+stats.polyExact+', interpolated='+stats.polyInterpolated+', rejected='+stats.polyRejected+', direct='+stats.polyDirect:'')};
        onDone(lineAtmosphere);
      }
    }
    setTimeout(batch,0);
  }
  // In a spherically symmetric n(h), a ray stays in the plane through the
  // observer, Earth's centre, and the target. Its horizontal azimuth is
  // therefore conserved. Audit full 3D unit vectors, not just elevation.
  function auditArrival3D(physical, apparent, elevation) {
    if (!Array.isArray(physical) || !Array.isArray(apparent) ||
        physical.length !== 3 || apparent.length !== 3 ||
        !physical.every(Number.isFinite) || !apparent.every(Number.isFinite) ||
        !Number.isFinite(elevation)) return null;
    var h = Math.hypot(physical[0],physical[1]);
    var ha = Math.hypot(apparent[0],apparent[1]);
    if (!(h > 0) || !(ha > 0)) return null;
    var ux=physical[0]/h, uy=physical[1]/h;
    var norm=Math.hypot.apply(Math,apparent);
    if (!(norm > 0)) return null;
    var actual=apparent.map(function(v){return v/norm;});
    var expected=[ux*Math.cos(elevation),uy*Math.cos(elevation),Math.sin(elevation)];
    var dot=Math.max(-1,Math.min(1,actual.reduce(function(sum,v,i){return sum+v*expected[i];},0)));
    var cross=[actual[1]*expected[2]-actual[2]*expected[1],
      actual[2]*expected[0]-actual[0]*expected[2],
      actual[0]*expected[1]-actual[1]*expected[0]];
    var directionError=Math.atan2(Math.hypot.apply(Math,cross),dot);
    var azimuthError=Math.atan2(physical[0]*apparent[1]-physical[1]*apparent[0],
      physical[0]*apparent[0]+physical[1]*apparent[1]);
    return {directionErrorArcsec:directionError*180/Math.PI*3600,
      azimuthErrorArcsec:Math.abs(azimuthError)*180/Math.PI*3600,
      expectedDirection:expected,actualDirection:actual};
  }
  // Compare matched physical/apparent vertices in screen space. A translation
  // removes only the mean displacement; residuals quantify real image warping.
  // Original members are evaluated by their endpoints, not by an arbitrary
  // nearest-neighbour match among subdivided apparent samples.
  function compareShape(g, samples, edges) {
    if (!g || !Array.isArray(samples)) return null;
    var points=[], lookup=Object.create(null);
    function key(v) { return v.map(function(x){return x.toFixed(7);}).join(','); }
    samples.forEach(function(s) {
      if (!s || !s.apparent || !s.physical) return;
      var p=project(g,s.physical), a=project(g,s.apparent);
      if (!p.concat(a).every(Number.isFinite)) return;
      var entry={physical:s.physical,apparent:s.apparent,physicalPx:p,apparentPx:a,
        dx:a[0]-p[0],dy:a[1]-p[1]};
      points.push(entry);
      lookup[key(s.physical)]=entry;
    });
    if (!points.length) return null;
    var meanDx=0,meanDy=0;
    points.forEach(function(p){meanDx+=p.dx;meanDy+=p.dy;});
    meanDx/=points.length;meanDy/=points.length;
    var rms=0,maxResidual=0,minDy=Infinity,maxDy=-Infinity;
    points.forEach(function(p){
      var residual=Math.hypot(p.dx-meanDx,p.dy-meanDy);
      rms+=residual*residual;maxResidual=Math.max(maxResidual,residual);
      minDy=Math.min(minDy,p.dy);maxDy=Math.max(maxDy,p.dy);
    });
    var edgeRows=[], maxLengthChangePercent=0,maxTiltChangeDeg=0;
    (edges||[]).forEach(function(e){
      var u=lookup[key(e.a)],v=lookup[key(e.b)];
      if (!u || !v) return;
      var px=v.physicalPx[0]-u.physicalPx[0],py=v.physicalPx[1]-u.physicalPx[1];
      var ax=v.apparentPx[0]-u.apparentPx[0],ay=v.apparentPx[1]-u.apparentPx[1];
      var lp=Math.hypot(px,py),la=Math.hypot(ax,ay);
      if (lp<1e-9 || la<1e-9) return;
      var lengthChangePercent=100*(la/lp-1);
      var tiltChangeDeg=Math.atan2(px*ay-py*ax,px*ax+py*ay)*180/Math.PI;
      maxLengthChangePercent=Math.max(maxLengthChangePercent,Math.abs(lengthChangePercent));
      maxTiltChangeDeg=Math.max(maxTiltChangeDeg,Math.abs(tiltChangeDeg));
      edgeRows.push({lengthChangePercent:lengthChangePercent,tiltChangeDeg:tiltChangeDeg});
    });
    return {points:points.length,meanDx:meanDx,meanDy:meanDy,
      rmsNonRigidPx:Math.sqrt(rms/points.length),maxNonRigidPx:maxResidual,
      verticalShiftRangePx:maxDy-minDy,edges:edgeRows.length,
      maxLengthChangePercent:maxLengthChangePercent,maxTiltChangeDeg:maxTiltChangeDeg,
      edgeRows:edgeRows};
  }
  function auditShape21(g,m,audit) {
    if (atmosphere21.state!=='ready' || atmosphere21.key!==modelKey(m)) return null;
    var paths=audit && audit.getTowerPaths(21);
    if (!paths) return null;
    var edges=[];
    paths.forEach(function(path){for(var i=1;i<path.length;i++)
      edges.push({a:path[i-1],b:path[i]});});
    return compareShape(g,atmosphere21.samples,edges);
  }
  // Audit the ACTUAL cached orange overlay, not a newly reconstructed tower.
  // Re-solve each physical sample and check that the stored 3D point projects
  // to the same camera pixel as the independently reconstructed arrival ray.
  // This is a consistency check, not an independent validation of the solver.
  function auditAtmosphere21(g, m, solver) {
    if (atmosphere21.state !== 'ready' || atmosphere21.key !== modelKey(m) ||
        !Array.isArray(atmosphere21.samples) || !solver) return null;
    var result = {count:0, visible:0, hidden:0, mismatches:0,
      maxAngleArcsec:0, maxPixelError:0, maxHorizontalPixelShift:0,
      invalidProjections:0, independentProjectionCount:0,
      maxIndependentPixelError:0, maxRangeDependentPixelShift:0,
      maxDirectionErrorArcsec:0, maxAzimuthErrorArcsec:0, invalidDirections:0,
      cameraNotAtObserver:false, rows:[]};
    atmosphere21.samples.forEach(function (sample) {
      var physical = sample.physical, apparent = sample.apparent;
      var horizontal = Math.hypot(physical[0], physical[1]);
      var radialZ = physical[2] + m.rEarth + m.Height;
      var altitude = Math.hypot(horizontal, radialZ) - m.rEarth;
      var distance = m.rEarth * Math.atan2(horizontal, radialZ);
      var solved = solver.solveAngle({geometry:'globe', atmosphere:'standard',
        observerHeight:m.Height, radius:m.rEarth, distance:distance,
        targetHeight:altitude, step:25});
      var expectedVisible = solved.status === 'visible' && Number.isFinite(solved.angle);
      var actualVisible = !!apparent;
      result.count++;
      if (expectedVisible !== actualVisible) { result.mismatches++; return; }
      if (!actualVisible) { result.hidden++; return; }
      result.visible++;
      var vectorAudit=auditArrival3D(physical,apparent,solved.angle);
      if (!vectorAudit) { result.invalidDirections++; return; }
      result.maxDirectionErrorArcsec=Math.max(result.maxDirectionErrorArcsec,vectorAudit.directionErrorArcsec);
      result.maxAzimuthErrorArcsec=Math.max(result.maxAzimuthErrorArcsec,vectorAudit.azimuthErrorArcsec);
      var actualAngle = Math.atan2(apparent[2], Math.hypot(apparent[0],apparent[1]));
      var angleError = Math.abs(actualAngle-solved.angle)*180/Math.PI*3600;
      var expected = [physical[0],physical[1],horizontal*Math.tan(solved.angle)];
      var actualPx = project(g,apparent), expectedPx = project(g,expected);
      var physicalPx = project(g,physical);
      var pixelError = Math.hypot(actualPx[0]-expectedPx[0],actualPx[1]-expectedPx[1]);
      var horizontalShift = Math.abs(actualPx[0]-physicalPx[0]);
      if (![angleError,pixelError,horizontalShift].every(Number.isFinite)) {
        result.invalidProjections++; return;
      }
      // Camera-space projection derived from the arrival ray and the camera
      // basis, without calling Camera.Trans.  Scaling a ray must not change
      // its image for a camera at the physical observer; a displaced graphics
      // camera can violate that assumption even with a correct solver.
      var independentPx = projectArrivalDirection(g,physical,solved.angle);
      var scaledPx = projectArrivalDirection(g,physical,solved.angle,2);
      if (independentPx) {
        var independentError = Math.hypot(independentPx[0]-actualPx[0],
          independentPx[1]-actualPx[1]);
        result.independentProjectionCount++;
        result.maxIndependentPixelError = Math.max(result.maxIndependentPixelError,independentError);
        if (scaledPx) result.maxRangeDependentPixelShift = Math.max(
          result.maxRangeDependentPixelShift,
          Math.hypot(scaledPx[0]-independentPx[0],scaledPx[1]-independentPx[1]));
      }
      result.maxAngleArcsec = Math.max(result.maxAngleArcsec,angleError);
      result.maxPixelError = Math.max(result.maxPixelError,pixelError);
      result.maxHorizontalPixelShift = Math.max(result.maxHorizontalPixelShift,horizontalShift);
      result.rows.push({physical:physical,apparent:apparent,
        physicalPx:physicalPx,apparentPx:actualPx,expectedPx:expectedPx,
        angleErrorArcsec:angleError,pixelError:pixelError});
    });
    // Verify that every rendered member is made only of visible samples.
    // Cached segments retain their original boundaries so we can detect
    // accidental joins across hidden spans without relying on screenshots.
    result.edgesChecked = 0;
    result.hiddenBridges = 0;
    result.transitions = atmosphere21.transitions || 0;
    result.terminalTransitions = atmosphere21.terminalTransitions || 0;
    (atmosphere21.segments || []).forEach(function (segment) {
      var points = segment.points;
      for (var j=1; j<points.length; j++) {
        if (!points[j-1] || !points[j]) continue;
        result.edgesChecked++;
        if (!points[j-1].every(Number.isFinite) || !points[j].every(Number.isFinite))
          result.hiddenBridges++;
      }
    });
    result.cameraNotAtObserver = result.maxRangeDependentPixelShift > 0.01;
    result.passed = result.maxIndependentPixelError < 0.01 &&
      result.hiddenBridges===0 && result.mismatches===0 && result.invalidProjections===0 &&
      result.invalidDirections===0 && result.maxDirectionErrorArcsec<0.001 &&
      result.maxAzimuthErrorArcsec<0.001 &&
      result.maxAngleArcsec<0.001 && result.maxPixelError<0.01;
    return result;
  }
  function draw(g, m) {
    var checkbox = typeof document !== 'undefined' && document.getElementById('InverseVacuumTower21');
    if (m.opticsMode !== 'ray-tracing' || m.showModel !== 1) return null;
    var audit = typeof globalThis !== 'undefined' && globalThis.CurvatureRenderedVertexAudit;
    var capture = audit && audit.getCapturedGroups().primary[21];
    var paths = audit && audit.getTowerPaths(21);
    if (!capture || !paths) return null;
    var report = compareTower(g, capture);
    if ((!checkbox || !checkbox.checked) && !(atmosphere21.state === 'ready' && atmosphere21.key === modelKey(m)) && !(typeof document !== 'undefined' && document.getElementById('InverseAtmosphereLineShow') && document.getElementById('InverseAtmosphereLineShow').checked && lineAtmosphere.state === 'ready' && lineAtmosphere.key === modelKey(m))) return report;
    g.ResetTrans3D();
    g.SetAlpha(1);
    g.SetClipping('canvas');
    g.SetLineAttr('#a020f0', 2.5);
    if (checkbox && checkbox.checked) paths.forEach(function (path) {
      for (var i = 1; i < path.length; i++) {
        var a = directionAtRange(vacuumDirection(path[i-1]));
        var b = directionAtRange(vacuumDirection(path[i]));
        if (a && b) g.Line3D(a, b);
      }
    });
    if (atmosphere21.state === 'ready' && atmosphere21.key === modelKey(m)) {
      g.SetLineAttr('#ff8800', 2.5);
      atmosphere21.paths.forEach(function (path) {
        for (var j = 1; j < path.length; j++) {
          // Never join across a hidden/unsolved vertex.
          if (path[j-1] && path[j]) g.Line3D(path[j-1], path[j]);
        }
      });
    }
    var allCheckbox = typeof document !== 'undefined' && document.getElementById('InverseAtmosphereLineShow');
    if (allCheckbox && allCheckbox.checked && lineAtmosphere.state==='ready' &&
        lineAtmosphere.key===modelKey(m)) {
      g.SetLineAttr('#ff8800', 1.25);
      lineAtmosphere.paths.forEach(function(member) {
        var points=member.points;
        for (var j=1;j<points.length;j++)
          if (points[j-1] && points[j]) g.Line3D(points[j-1],points[j]);
      });
    }
    g.ResetTrans3D();
    return report;
  }
  return {vacuumDirection:vacuumDirection, directionAtRange:directionAtRange,
    compareTower:compareTower, draw:draw, calculateAtmosphere21:calculateAtmosphere21,
    getAtmosphere21:function () { return atmosphere21; },
    calculateAtmosphereLine:calculateAtmosphereLine,getLineAtmosphere:getLineAtmosphere,
    adaptiveEdge:adaptiveEdge, fastRay:fastRay, createOpticalMap:createOpticalMap, createForwardBundle:createForwardBundle, createPolynomialApproximation:createPolynomialApproximation, auditVertices21:auditVertices21,
    auditAtmosphere21:auditAtmosphere21, compareShape:compareShape, auditShape21:auditShape21,
    projectArrivalDirection:projectArrivalDirection,
    auditCameraOrigin:auditCameraOrigin, auditArrival3D:auditArrival3D};
}));
