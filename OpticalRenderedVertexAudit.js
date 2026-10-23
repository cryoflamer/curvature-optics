/* Read-only audit of actual transmission-tower polygon vertices as DrawShape renders them.
 * Unlike axis calibration, the reference comes from PolygonOnPlane calls in the renderer.
 */
(function (root) {
  'use strict';
  var samples = {1:true,11:true,21:true,31:true,41:true,51:true,61:true,71:true,81:true,85:true};
  var vertices = {}, localAxes = {}, lastKey = null;
  function screen(g, world) {
    var camera = g.Camera.Trans(world);
    return [g.WinTrans.TransX(camera[0]), g.WinTrans.TransY(camera[1])];
  }
  function beginTower(g, m, objIx) {
    if (objIx !== 0 || m.ObjType[0] !== 3 || m.showModel !== 1 || m.opticsMode !== 'ray-tracing') return null;
    var distance = m.aObjCurr[0] * m.geometryRadius;
    var index = Math.round((distance - m.ObjDist[0]) / m.ObjDeltaDist[0]) + 1;
    // Capture every rendered tower, not only the ten diagnostic samples.
    // The vacuum overlay needs the original local axis for each marker.
    // Capture the object-local axis while Bislin's plane and transforms are
    // active. This is independent of both polygon section averaging and RK4.
    var localBase = g.GetTransPointOnPlane(0, 0, [0,0,0]).slice();
    var localTop = g.GetTransPointOnPlane(0, 1, [0,0,0]).slice();
    localAxes[index] = {tower:index, base:localBase, top:localTop};
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
    var rows = [], markerWorld = root.CurvatureTowerOverlay.markerWorld;
    snapshot.vacuum.forEach(function (ray) {
      var drawn = vertices[ray.index];
      if (!drawn) return;
      [['base','bottom',0],['top','top',snapshot.towerHeight]].forEach(function (spec) {
        var angle = ray[spec[1]];
        if (angle === null || !isFinite(angle)) return;
        var world = markerWorld('globe',ray.distance,spec[2],angle,m.rEarth,snapshot.side,m.Height);
        if (!world) return;
        var marker = screen(g,world);
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
  // Independent axis reference: use the midpoint of the leftmost and
  // rightmost *actually rendered* vertices at the exact local base/top level.
  // This does not reuse towerAnchor() to construct the reference.
  function sectionCenter(points, level, tolerance) {
    var section = points.filter(function (p) { return Math.abs(p.y-level) <= tolerance; });
    if (section.length < 2) return null;
    var left = section.reduce(function (a,b) { return a.x < b.x ? a : b; });
    var right = section.reduce(function (a,b) { return a.x > b.x ? a : b; });
    if (right.x-left.x < 1e-10) return null;
    // Average the *world-space* endpoints, then project the actual center.
    return left.world.map(function (v,i) { return (v+right.world[i])/2; });
  }
  function compareCenters(g,m,snapshot) {
    if (!snapshot || snapshot.geometry !== 'globe' || !root.CurvatureTowerOverlay) return [];
    var rows = [], markerWorld = root.CurvatureTowerOverlay.markerWorld;
    snapshot.vacuum.forEach(function (ray) {
      var drawn = vertices[ray.index];
      if (!drawn) return;
      [['base','bottom',0],['top','top',1]].forEach(function (spec) {
        var level = spec[2], angle = ray[spec[1]];
        if (angle === null || !isFinite(angle)) return;
        var centerWorld = sectionCenter(drawn.points,level,1e-8);
        if (!centerWorld) return;
        var actual = screen(g,centerWorld);
        var height = level * snapshot.towerHeight;
        var world = markerWorld('globe',ray.distance,height,angle,m.rEarth,snapshot.side,m.Height);
        if (!world) return;
        var marker = screen(g,world);
        var dx = marker[0]-actual[0], dy = marker[1]-actual[1];
        rows.push({tower:ray.index,point:spec[0],
          actualCenterX:+actual[0].toFixed(3),actualCenterY:+actual[1].toFixed(3),
          markerX:+marker[0].toFixed(3),markerY:+marker[1].toFixed(3),
          dx:+dx.toFixed(3),dy:+dy.toFixed(3),errorPx:+Math.hypot(dx,dy).toFixed(3),
          capturedVertices:drawn.points.length});
      });
    });
    return rows;
  }
  // Compare the actual 2D driver stroke centers (not pre-projection 3D
  // coordinates) with independent centers from captured tower polygons.
  // Visual reference independent of the optical angle solver: actual
  // polygon section midpoints captured while Bislin draws each tower.
  function drawActualAxes(g, m) {
    var enabled = typeof document !== 'undefined' && document.getElementById('TowerAuditAxesEnabled');
    if (!enabled || !enabled.checked || m.opticsMode !== 'ray-tracing' ||
        m.showModel !== 1 || m.ObjType[0] !== 3) return 0;
    var count = 0;
    g.ResetTrans3D();
    g.SetAlpha(1);
    g.SetClipping('canvas');
    g.SetLineAttr('#00b9ff', 3);
    Object.keys(vertices).forEach(function (index) {
      var pts = vertices[index].points;
      var base = sectionCenter(pts, 0, 1e-8);
      var top = sectionCenter(pts, 1, 1e-8);
      if (!base || !top) return;
      g.Line3D(base, top);
      count++;
    });
    g.ResetTrans3D();
    return count;
  }
  function drawLocalAxes(g, m) {
    var enabled = typeof document !== 'undefined' && document.getElementById('TowerAuditLocalAxesEnabled');
    if (!enabled || !enabled.checked || m.opticsMode !== 'ray-tracing' ||
        m.showModel !== 1 || m.ObjType[0] !== 3) return 0;
    var count = 0;
    g.ResetTrans3D();
    g.SetAlpha(1);
    g.SetClipping('canvas');
    g.SetLineAttr('#ffbf00', 3);
    Object.keys(localAxes).forEach(function (index) {
      var axis = localAxes[index];
      g.Line3D(axis.base, axis.top);
      count++;
    });
    g.ResetTrans3D();
    return count;
  }
  function compareAxisMethods(g) {
    return Object.keys(localAxes).map(function (index) {
      var axis = localAxes[index], drawn = vertices[index];
      if (!drawn) return null;
      var base = sectionCenter(drawn.points, 0, 1e-8);
      var top = sectionCenter(drawn.points, 1, 1e-8);
      if (!base || !top) return null;
      var a = screen(g, axis.base), b = screen(g, axis.top);
      var c = screen(g, base), d = screen(g, top);
      return {tower:+index, baseDeltaPx:+Math.hypot(a[0]-c[0],a[1]-c[1]).toFixed(3),
        topDeltaPx:+Math.hypot(b[0]-d[0],b[1]-d[1]).toFixed(3)};
    }).filter(Boolean);
  }
  function compareCanvasStrokes(g, m, snapshot, rendered) {
    if (!snapshot || snapshot.geometry !== 'globe') return [];
    var rows = [];
    (rendered || []).forEach(function (mark) {
      if (mark.atmosphere !== 'vacuum') return;
      var drawn = vertices[mark.tower];
      if (!drawn) return;
      var center = sectionCenter(drawn.points, mark.point === 'base' ? 0 : 1, 1e-8);
      if (!center) return;
      var reference = screen(g, center);
      var strokes = mark.strokes || [];
      var centers = strokes.filter(function (poly) { return poly.length >= 2; })
        .map(function (poly) {
          var first = poly[0], last = poly[poly.length - 1];
          return [(first[0] + last[0])/2, (first[1] + last[1])/2];
        });
      if (!centers.length) {
        rows.push({tower: mark.tower, point: mark.point, status: 'not drawn / clipped'});
        return;
      }
      var canvas = centers.reduce(function (acc, p) {
        return [acc[0] + p[0]/centers.length, acc[1] + p[1]/centers.length];
      }, [0, 0]);
      rows.push({tower: mark.tower, point: mark.point,
        referenceX: +reference[0].toFixed(3), referenceY: +reference[1].toFixed(3),
        canvasX: +canvas[0].toFixed(3), canvasY: +canvas[1].toFixed(3),
        dx: +(canvas[0]-reference[0]).toFixed(3),
        dy: +(canvas[1]-reference[1]).toFixed(3),
        errorPx: +Math.hypot(canvas[0]-reference[0],canvas[1]-reference[1]).toFixed(3),
        strokeCount: centers.length, status: 'drawn'});
    });
    return rows;
  }
  // Independent geometry reference and viewport classification.
  function viewportStatus(g, pixel) {
    if (!pixel || !pixel.every(isFinite)) return 'INVALID_REFERENCE';
    if (!(g.CanvasWidth > 0 && g.CanvasHeight > 0)) return 'UNKNOWN_VIEWPORT';
    return pixel[0] < 0 || pixel[0] > g.CanvasWidth ||
      pixel[1] < 0 || pixel[1] > g.CanvasHeight ? 'OFFSCREEN' : 'ONSCREEN';
  }
  function independentReference(g, tower, point) {
    var captured = vertices[tower];
    if (!captured) return null;
    var center = sectionCenter(captured.points, point === 'base' ? 0 : 1, 1e-8);
    if (!center) return null;
    var axis = localAxes[tower];
    return {pixel:screen(g,center),
      localAxisPixel:axis ? screen(g,point === 'base' ? axis.base : axis.top) : null,
      capturedVertices:captured.points.length,capturedTower:captured.tower};
  }
  // Compare actual intercepted canvas strokes with independently captured geometry.
  // Offscreen discrepancies remain failures; occluded points are explicitly skipped.
  function vacuumCalibration(g, m, snapshot, rendered, thresholdPx) {
    var threshold = thresholdPx === undefined ? 0.5 : thresholdPx;
    if (!snapshot || snapshot.geometry !== 'globe') return null;
    var byKey = {};
    (rendered || []).forEach(function (mark) {
      if (mark.atmosphere !== 'vacuum') return;
      var key = mark.tower + ':' + mark.point;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(mark);
    });
    var rows = [], sumSq = 0, max = 0, passed = 0, failed = 0,
      skipped = 0, offscreen = 0, offscreenMismatch = 0, geometryMismatch = 0;
    snapshot.vacuum.forEach(function (ray) {
      [['base','bottom'],['top','top']].forEach(function (part) {
        var point = part[0], angle = ray[part[1]], key = ray.index + ':' + point;
        if (angle === null || !isFinite(angle)) {
          rows.push({tower:ray.index,point:point,status:'OCCLUDED',result:'SKIP'});
          skipped++;return;
        }
        var reference = independentReference(g,ray.index,point);
        if (!reference) {
          rows.push({tower:ray.index,point:point,status:'MISSING_GEOMETRY',result:'FAIL'});
          failed++;return;
        }
        var vp = viewportStatus(g,reference.pixel), marks = byKey[key] || [];
        var axisError = reference.localAxisPixel ?
          Math.hypot(reference.pixel[0]-reference.localAxisPixel[0],
            reference.pixel[1]-reference.localAxisPixel[1]) : null;
        var row = {tower:ray.index,point:point,viewport:vp,
          referenceX:+reference.pixel[0].toFixed(3),referenceY:+reference.pixel[1].toFixed(3),
          capturedTower:reference.capturedTower,capturedVertices:reference.capturedVertices,
          localAxisErrorPx:axisError === null ? null : +axisError.toFixed(3),
          markerRecords:marks.length};
        if (vp === 'OFFSCREEN') offscreen++;
        if (marks.length !== 1 || reference.capturedTower !== ray.index) {
          row.status=marks.length !== 1?'MISSING_OR_DUPLICATE_MARKER':'WRONG_TOWER';
          row.result='FAIL';failed++;rows.push(row);return;
        }
        var centers = (marks[0].strokes || []).filter(function(poly){return poly.length>=2;})
          .map(function(poly){var a=poly[0],b=poly[poly.length-1];
            return [(a[0]+b[0])/2,(a[1]+b[1])/2];});
        row.strokeCount=centers.length;
        if (!centers.length) {
          row.status='NO_CANVAS_STROKES';row.result='FAIL';failed++;rows.push(row);return;
        }
        var canvas=centers.reduce(function(acc,p){
          acc[0]+=p[0]/centers.length;acc[1]+=p[1]/centers.length;return acc;
        },[0,0]);
        var dx=canvas[0]-reference.pixel[0],dy=canvas[1]-reference.pixel[1];
        var error=Math.hypot(dx,dy),geometryOK=axisError!==null && axisError<threshold;
        row.canvasX=+canvas[0].toFixed(3);row.canvasY=+canvas[1].toFixed(3);
        row.dx=+dx.toFixed(3);row.dy=+dy.toFixed(3);row.errorPx=+error.toFixed(3);
        if(!geometryOK)geometryMismatch++;
        var ok=error<threshold && geometryOK;
        row.status=vp==='OFFSCREEN'?(ok?'OFFSCREEN_ALIGNED':'OFFSCREEN_MISMATCH'):
          (ok?'ALIGNED':(!geometryOK?'AXIS_MISMATCH':'STROKE_MISMATCH'));
        row.result=ok?'PASS':'FAIL';
        if(vp==='OFFSCREEN'&&!ok)offscreenMismatch++;
        sumSq+=error*error;max=Math.max(max,error);
        if(ok)passed++;else failed++;
        rows.push(row);
      });
    });
    return {rows:rows,summary:{thresholdPx:threshold,passed:passed,failed:failed,
      skippedOccluded:skipped,offscreen:offscreen,offscreenMismatch:offscreenMismatch,
      geometryMismatch:geometryMismatch,tested:passed+failed,
      maxErrorPx:+max.toFixed(3),rmsErrorPx:passed+failed?
        +Math.sqrt(sumSq/(passed+failed)).toFixed(3):null,
      result:failed===0&&passed>0?'PASS':'FAIL'}};
  }
  function onDraw(g,m) {
    // Draw every frame, including camera movement and zoom.
    drawActualAxes(g,m);
    drawLocalAxes(g,m);
    var overlay = root.CurvatureTowerOverlay;
    var snapshot = overlay && overlay.getData && overlay.getData();
    if (!snapshot || !Object.keys(vertices).length) return;
    var key = [m.Height,m.geometryRadius,m.ObjDist[0],m.ObjDeltaDist[0],m.ObjSize[0],
      m.ObjSidePos[0],m.ObjSideVar && m.ObjSideVar[0],m.ObjSideType && m.ObjSideType[0],m.ObjSizeVar && m.ObjSizeVar[0],m.ObjSizeType && m.ObjSizeType[0],JSON.stringify(m.camPos),JSON.stringify(m.camViewCenter),
      m.camSceneSize,snapshot.geometry,snapshot.firstDistance,snapshot.spacing].join('|');
    if (key === lastKey) return;
    var rows = compare(g,m,snapshot);
    if (!rows.length) return;
    var centers = compareCenters(g,m,snapshot);
    var strokes = compareCanvasStrokes(g,m,snapshot,overlay.getRenderedStrokes && overlay.getRenderedStrokes());
    var calibration = vacuumCalibration(g,m,snapshot,overlay.getRenderedStrokes && overlay.getRenderedStrokes());
    lastKey = key;
    if (root.console) {
      if (calibration) {
        root.console.group('AUTOMATED VACUUM CALIBRATION (actual canvas strokes vs rendered tower sections)');
        root.console.table(calibration.rows);
        root.console.log(calibration.summary);
        root.console.groupEnd();
      }
      root.console.group('Local object axes vs polygon-section axes (yellow vs cyan)');
      root.console.table(compareAxisMethods(g));
      root.console.groupEnd();
      root.console.group('Actual rendered tower vertices vs vacuum markers (nearest vertex, NOT zero-error test)');
      root.console.table(rows);
      root.console.log('The reference vertices were captured from actual DrawShape PolygonOnPlane calls.');
      root.console.log('Nearest-vertex distance can be nonzero even with correct axis alignment.');
      root.console.groupEnd();
      root.console.group('Actual tower section centers vs vacuum markers (independent geometry)');
      root.console.table(centers);
      root.console.log('Centers come from captured left/right polygon vertices at local y=0 and y=1; missing sections are omitted.');
      root.console.log('Marker positions are now computed by the exact same markerWorld() used by the live overlay. This tests marker-to-rendered-center agreement, not RK4 accuracy.');
      root.console.groupEnd();
      root.console.group('Actual canvas marker strokes vs rendered tower centers (post projection)');
      root.console.table(strokes);
      root.console.log('Canvas coordinates are intercepted at DriverDrawPoly after the full drawing transform. Missing/clipped strokes are reported separately.');
      root.console.groupEnd();
    }
    return {nearestVertices:rows, sectionCenters:centers, canvasStrokes:strokes, calibration:calibration};
  }
  function getLocalAxis(tower) { return localAxes[tower] || null; }
  function reset() { vertices = {}; localAxes = {}; lastKey = null; }
  root.CurvatureRenderedVertexAudit = {beginTower:beginTower,getLocalAxis:getLocalAxis,onDraw:onDraw,compare:compare,compareCenters:compareCenters,compareCanvasStrokes:compareCanvasStrokes,vacuumCalibration:vacuumCalibration,sectionCenter:sectionCenter,drawActualAxes:drawActualAxes,drawLocalAxes:drawLocalAxes,compareAxisMethods:compareAxisMethods,reset:reset};
  if (typeof module === 'object' && module.exports) module.exports = root.CurvatureRenderedVertexAudit;
}(typeof globalThis !== 'undefined' ? globalThis : this));
