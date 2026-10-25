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
  function opticalVertex(world, m, solver) {
    // The physical vertex is already in the observer's tangent coordinate frame.
    // Use its actual radial altitude and central angle, not a tower-axis height.
    var horizontal = Math.hypot(world[0], world[1]);
    var radial = Math.hypot(horizontal, world[2] + m.rEarth + m.Height);
    var altitude = radial - m.rEarth;
    var distance = m.rEarth * Math.atan2(horizontal, world[2] + m.rEarth + m.Height);
    if (!(distance > 0) || !(altitude >= 0)) return null;
    var result = solver.solveAngle({ geometry:'globe', atmosphere:'standard',
      observerHeight:m.Height, radius:m.rEarth, distance:distance,
      targetHeight:altitude, step:25 });
    if (result.status !== 'visible') return null;
    return [world[0], world[1], horizontal * Math.tan(result.angle)];
  }
  // Sample an original straight structural member in physical world space.
  // Refraction acts on every sampled point, not on its endpoints alone.
  function interpolateWorld(a, b, t) {
    return a.map(function (v, k) { return v + (b[k] - v) * t; });
  }
  function adaptiveEdge(a, b, sample, maxDepth, tolerance) {
    var out = [], solved = 0;
    function emit(point) {
      // A null separates visible pieces; never connect across occlusion.
      if (point === null && (!out.length || out[out.length - 1] === null)) return;
      out.push(point);
    }
    function subdivide(t0, p0, t1, p1, depth) {
      var mid = (t0 + t1) / 2;
      var pm = sample(mid); solved++;
      var transition = (p0 === null || pm === null || p1 === null);
      var curved = !transition && Math.hypot(
        pm[0] - (p0[0] + p1[0]) / 2,
        pm[1] - (p0[1] + p1[1]) / 2,
        pm[2] - (p0[2] + p1[2]) / 2) > tolerance;
      if (depth < maxDepth && (transition || curved)) {
        subdivide(t0, p0, mid, pm, depth + 1);
        subdivide(mid, pm, t1, p1, depth + 1);
      } else {
        // If visibility changes inside this terminal interval, keep the
        // visible samples separated instead of drawing through the ground.
        emit(p0);
        if (transition) { emit(null); emit(pm); emit(null); }
        emit(p1);
      }
    }
    var first = sample(0), last = sample(1);
    subdivide(0, first, 1, last, 0);
    return {points:out, evaluations:solved + 2};
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
        // Keep each original member separate, even if the source paths join.
        if (output[edge.path].length) output[edge.path].push(null);
        Array.prototype.push.apply(output[edge.path], result.points);
        atmosphere21.message = i + ' / ' + edges.length + ' edges';
        onProgress(atmosphere21.message);
        setTimeout(batch, 0);
      } else {
        atmosphere21 = {state:'ready', paths:output, samples:samples, key:key,
          message:'Calculated ' + edges.length + ' edges, ' + evaluations + ' ray samples'};
        onDone(atmosphere21);
      }
    }
    setTimeout(batch, 0);
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
      invalidProjections:0, rows:[]};
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
      result.maxAngleArcsec = Math.max(result.maxAngleArcsec,angleError);
      result.maxPixelError = Math.max(result.maxPixelError,pixelError);
      result.maxHorizontalPixelShift = Math.max(result.maxHorizontalPixelShift,horizontalShift);
      result.rows.push({physical:physical,apparent:apparent,
        physicalPx:physicalPx,apparentPx:actualPx,expectedPx:expectedPx,
        angleErrorArcsec:angleError,pixelError:pixelError});
    });
    result.passed = result.mismatches===0 && result.invalidProjections===0 &&
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
    if ((!checkbox || !checkbox.checked) && !(atmosphere21.state === 'ready' && atmosphere21.key === modelKey(m))) return report;
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
    g.ResetTrans3D();
    return report;
  }
  return {vacuumDirection:vacuumDirection, directionAtRange:directionAtRange,
    compareTower:compareTower, draw:draw, calculateAtmosphere21:calculateAtmosphere21,
    getAtmosphere21:function () { return atmosphere21; },
    adaptiveEdge:adaptiveEdge, auditVertices21:auditVertices21,
    auditAtmosphere21:auditAtmosphere21};
}));
