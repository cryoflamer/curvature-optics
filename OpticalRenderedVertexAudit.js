/* Read-only audit of actual transmission-tower polygon vertices as DrawShape renders them.
 * Unlike axis calibration, the reference comes from PolygonOnPlane calls in the renderer.
 */
(function (root) {
  'use strict';
  var samples = {1:true,11:true,21:true,31:true,41:true,51:true,61:true,71:true,81:true,85:true};
  var vertices = {}, lastKey = null;
  function screen(g, world) {
    var camera = g.Camera.Trans(world);
    return [g.WinTrans.TransX(camera[0]), g.WinTrans.TransY(camera[1])];
  }
  function beginTower(g, m, objIx) {
    if (objIx !== 0 || m.ObjType[0] !== 3 || m.showModel !== 1 || m.opticsMode !== 'ray-tracing') return null;
    var distance = m.aObjCurr[0] * m.geometryRadius;
    var index = Math.round((distance - m.ObjDist[0]) / m.ObjDeltaDist[0]) + 1;
    if (!samples[index]) return null;
    var original = g.PolygonOnPlane, captured = [];
    g.PolygonOnPlane = function (xs, ys, mode, size) {
      if (Array.isArray(xs) && Array.isArray(ys)) {
        var n = Math.min(xs.length, ys.length, typeof size === 'number' ? size : xs.length);
        for (var i = 0; i < n; i++) {
          var world = g.GetTransPointOnPlane(xs[i], ys[i], [0,0,0]).slice();
          captured.push({x:xs[i], y:ys[i], world:world, pixel:screen(g,world)});
        }
      }
      return original.apply(this, arguments);
    };
    return function () {
      g.PolygonOnPlane = original;
      if (captured.length) vertices[index] = {tower:index, distance:distance, points:captured};
    };
  }
  function nearest(points, pixel) {
    var best = null;
    points.forEach(function (p) {
      var d = Math.hypot(p.pixel[0]-pixel[0],p.pixel[1]-pixel[1]);
      if (!best || d < best.distancePx) best = {vertex:p, distancePx:d};
    });
    return best;
  }
  function compare(g, m, snapshot) {
    if (!snapshot || snapshot.geometry !== 'globe' || !root.CurvatureTowerOverlay) return [];
    var rows = [], anchor = root.CurvatureTowerOverlay.towerAnchor;
    snapshot.vacuum.forEach(function (ray) {
      var drawn = vertices[ray.index];
      if (!drawn) return;
      [['base','bottom',0],['top','top',snapshot.towerHeight]].forEach(function (spec) {
        var angle = ray[spec[1]];
        if (angle === null || !isFinite(angle)) return;
        var world = anchor('globe',ray.distance,spec[2],m.rEarth,snapshot.side,m.Height);
        var range = Math.hypot(world[0],world[1]);
        var marker = screen(g,[world[0],world[1],range*Math.tan(angle)]);
        // These are genuine rendered polygon vertices, not axis points. Their
        // nearest distance need NOT be zero: the axis may lie between vertices.
        var candidates = drawn.points.filter(function (p) {
          return spec[0] === 'top' ? p.y >= 0.97 : p.y <= 0.14;
        });
        var closest = nearest(candidates,marker);
        if (!closest) return;
        rows.push({tower:ray.index, point:spec[0], markerX:+marker[0].toFixed(2),
          markerY:+marker[1].toFixed(2), vertexX:+closest.vertex.pixel[0].toFixed(2),
          vertexY:+closest.vertex.pixel[1].toFixed(2), nearestVertexPx:+closest.distancePx.toFixed(2),
          vertexLocalX:closest.vertex.x,vertexLocalY:closest.vertex.y,
          vertexCount:drawn.points.length});
      });
    });
    return rows;
  }
  function onDraw(g,m) {
    var overlay = root.CurvatureTowerOverlay;
    var snapshot = overlay && overlay.getData && overlay.getData();
    if (!snapshot || !Object.keys(vertices).length) return;
    var key = [m.Height,m.geometryRadius,m.ObjDist[0],m.ObjDeltaDist[0],m.ObjSize[0],
      m.ObjSidePos[0],m.ObjSideVar && m.ObjSideVar[0],m.ObjSideType && m.ObjSideType[0],m.ObjSizeVar && m.ObjSizeVar[0],m.ObjSizeType && m.ObjSizeType[0],JSON.stringify(m.camPos),JSON.stringify(m.camViewCenter),
      m.camSceneSize,snapshot.geometry,snapshot.firstDistance,snapshot.spacing].join('|');
    if (key === lastKey) return;
    var rows = compare(g,m,snapshot);
    if (!rows.length) return;
    lastKey = key;
    if (root.console) {
      root.console.group('Actual rendered tower vertices vs vacuum markers (nearest vertex, NOT zero-error test)');
      root.console.table(rows);
      root.console.log('The reference vertices were captured from actual DrawShape PolygonOnPlane calls.');
      root.console.log('Nearest-vertex distance can be nonzero even with correct axis alignment.');
      root.console.groupEnd();
    }
    return rows;
  }
  function reset() { vertices = {}; lastKey = null; }
  root.CurvatureRenderedVertexAudit = {beginTower:beginTower,onDraw:onDraw,compare:compare,reset:reset};
  if (typeof module === 'object' && module.exports) module.exports = root.CurvatureRenderedVertexAudit;
}(typeof globalThis !== 'undefined' ? globalThis : this));
