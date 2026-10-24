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
  function draw(g, m) {
    var checkbox = typeof document !== 'undefined' && document.getElementById('InverseVacuumTower21');
    if (!checkbox || !checkbox.checked || m.opticsMode !== 'ray-tracing' || m.showModel !== 1) return null;
    var audit = typeof globalThis !== 'undefined' && globalThis.CurvatureRenderedVertexAudit;
    var capture = audit && audit.getCapturedGroups().primary[21];
    var paths = audit && audit.getTowerPaths(21);
    if (!capture || !paths) return null;
    var report = compareTower(g, capture);
    g.ResetTrans3D();
    g.SetAlpha(1);
    g.SetClipping('canvas');
    g.SetLineAttr('#a020f0', 2.5);
    paths.forEach(function (path) {
      for (var i = 1; i < path.length; i++) {
        var a = directionAtRange(vacuumDirection(path[i-1]));
        var b = directionAtRange(vacuumDirection(path[i]));
        if (a && b) g.Line3D(a, b);
      }
    });
    g.ResetTrans3D();
    return report;
  }
  return {vacuumDirection:vacuumDirection, directionAtRange:directionAtRange,
    compareTower:compareTower, draw:draw};
}));
