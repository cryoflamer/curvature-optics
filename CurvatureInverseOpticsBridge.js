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
  function calculateAtmosphere21(m, audit, solver, onProgress, onDone) {
    var paths = audit && audit.getTowerPaths(21);
    if (!paths || !paths.length || !solver) {
      atmosphere21 = {state:'error', paths:null, key:null,
        message:'Tower #21 geometry or ray solver is unavailable'};
      onDone(atmosphere21); return;
    }
    var key = modelKey(m);
    var items = [], cache = Object.create(null), output = paths.map(function () { return []; });
    paths.forEach(function (path, pi) { path.forEach(function (world) {
      items.push({path:pi, world:world});
    }); });
    atmosphere21 = {state:'working', paths:null, key:key, message:'0 / ' + items.length};
    var i = 0;
    function batch() {
      // Yield to the browser between vertices; keep the renderer responsive.
      var stop = Math.min(items.length, i + 2);
      for (; i < stop; i++) {
        var item = items[i];
        var cacheKey = item.world.map(function (v) { return v.toFixed(5); }).join(',');
        if (!Object.prototype.hasOwnProperty.call(cache, cacheKey))
          cache[cacheKey] = opticalVertex(item.world, m, solver);
        output[item.path].push(cache[cacheKey]);
      }
      atmosphere21.message = i + ' / ' + items.length;
      onProgress(atmosphere21.message);
      if (i < items.length) setTimeout(batch, 0);
      else {
        atmosphere21 = {state:'ready', paths:output, key:key,
          message:'Calculated ' + items.length + ' vertices'};
        onDone(atmosphere21);
      }
    }
    setTimeout(batch, 0);
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
    getAtmosphere21:function () { return atmosphere21; }};
}));
