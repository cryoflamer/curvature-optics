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
    auditAtmosphere21:auditAtmosphere21,
    projectArrivalDirection:projectArrivalDirection,
    auditCameraOrigin:auditCameraOrigin, auditArrival3D:auditArrival3D};
}));
