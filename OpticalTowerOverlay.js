/* Experimental diagnostic markers for apparent tower positions.
 * No legacy scene geometry or clipping rules are modified.
 */
(function (root) {
  'use strict';
  var snapshot = null;
  var renderedStrokes = [];
  function setData(data) { snapshot = data; }
  function clear() { snapshot = null; renderedStrokes = []; }
  // Reconstruct the tower-axis anchor using the same rotations/translations
  // as SetTrans() in CurvatureApp.html (for the default linear tower layout).
  function towerAnchor(geometry, distance, height, radius, side, observerHeight) {
    if (geometry === 'flat') return [-side, distance, height - observerHeight];
    var lng = distance / radius, lat = side / radius;
    var r = radius + height;
    return [r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lng),
      r * Math.cos(lat) * Math.cos(lng) - radius - observerHeight];
  }
  // Single source of truth for the world-space position used by the
  // diagnostic marker and by the rendered-vertex audit.  The returned point
  // is on the observer's straight viewing ray at the target's horizontal
  // range; it is not the curved ray path itself.
  function markerWorld(geometry, distance, height, angle, radius, side, observerHeight) {
    if (angle === null || !isFinite(angle)) return null;
    var physical = towerAnchor(geometry, distance, height, radius, side, observerHeight);
    var horizontal = Math.hypot(physical[0], physical[1]);
    if (!(horizontal > 0)) return null;
    return [physical[0], physical[1], horizontal * Math.tan(angle)];
  }
  function draw(g, m) {
    var checkbox = typeof document !== 'undefined' && document.getElementById('TowerOverlayEnabled');
    if (!checkbox || !checkbox.checked || !snapshot || m.opticsMode !== 'ray-tracing') return;
    // This first diagnostic supports a single visible Earth model only.
    var model = snapshot.geometry === 'globe' ? 1 : 2;
    if (m.showModel !== model || m.ObjType[0] !== 3 || m.NObjects[0] < 1) return;
    if (snapshot.height !== m.Height || snapshot.radius !== m.rEarth ||
        snapshot.firstDistance !== m.ObjDist[0] || snapshot.spacing !== m.ObjDeltaDist[0] ||
        snapshot.count !== m.NObjects[0] || snapshot.towerHeight !== m.ObjSize[0] ||
        snapshot.side !== m.ObjSidePos[0]) return;
    renderedStrokes = [];
    g.ResetTrans3D();
    g.SetAlpha(1);
    g.SetClipping('canvas');
    var vacuumOnly = !!(document.getElementById('TowerOverlayVacuumOnly') || {}).checked;
    var showNumbers = !!(document.getElementById('TowerOverlayTowerNumbers') || {}).checked;
    var labels = [];
    var datasets = [
      { rows: snapshot.vacuum, color: '#d62728' },
      { rows: snapshot.standard, color: '#008f55' }
    ];
    if (vacuumOnly) datasets = datasets.slice(0, 1);
    datasets.forEach(function (dataset) {
      g.SetLineAttr(dataset.color, 2);
      dataset.rows.forEach(function (row) {
        var distance = row.distance;
        // The marker is placed on the camera ray at the target's horizontal
        // range. This preserves the camera's own perspective, pan and zoom.
        var side = snapshot.side;
        var anchor = towerAnchor(snapshot.geometry, distance, 0, m.rEarth, side, m.Height);
        var y = anchor[1];
        if (!(y > 0)) return;
        var size = Math.max(0.2, y * 0.00028);
        [row.bottom, row.top].forEach(function (angle, index) {
          // Vacuum markers are geometric references, not ray-solver results.
          if (!(dataset.color === '#d62728' && snapshot.geometry === 'globe') &&
              (angle === null || !isFinite(angle))) return;
          var targetHeight = index === 0 ? 0 : snapshot.towerHeight;
          var marker;
          if (dataset.color === '#d62728' && snapshot.geometry === 'globe') {
            // Vacuum is the unmodified Bislin projection: use the EXACT
            // object-local axis captured while DrawShape was rendering.
            // No angle solver, approximate side position or reconstruction.
            var audit = root.CurvatureRenderedVertexAudit;
            var axis = audit && audit.getLocalAxis && audit.getLocalAxis(row.index);
            marker = axis && (index === 0 ? axis.base : axis.top).slice();
            // In the browser, missing captured geometry must not be guessed.
            // Standalone unit tests without the audit retain the old stub path.
            if (!audit) marker = towerAnchor(snapshot.geometry, distance, targetHeight,
              m.rEarth, side, m.Height);
          } else {
            marker = markerWorld(snapshot.geometry, distance, targetHeight,
              angle, m.rEarth, side, m.Height);
          }
          if (!marker) return;
          // Capture the actual canvas coordinates passed to the 2D driver,
          // AFTER 3D transforms, camera projection, clipping and 2D transforms.
          // This wrapper is active only for the two strokes of this marker.
          var originalDriver = g.DriverDrawPoly;
          var strokes = [];
          if (typeof originalDriver === 'function') {
            g.DriverDrawPoly = function (xs, ys, count, fill, close, poly) {
              if (!fill && count >= 2 && this.CurrTrans && this.GetObjTrans) {
                var coords = [], ctr = this.CurrTrans, obj = this.GetObjTrans();
                for (var k = 0; k < count; k++) {
                  ctr.ObjTransXY(obj, xs[k], ys[k]);
                  coords.push([ctr.x, ctr.y]);
                }
                strokes.push(coords);
              }
              return originalDriver.apply(this, arguments);
            };
          }
          try {
            g.Line3D([marker[0] - size, marker[1], marker[2]],
              [marker[0] + size, marker[1], marker[2]]);
            g.Line3D([marker[0], marker[1], marker[2] - size],
              [marker[0], marker[1], marker[2] + size]);
          } finally {
            if (typeof originalDriver === 'function') g.DriverDrawPoly = originalDriver;
          }
          // Derive the label position from the ACTUAL rendered cross strokes,
          // never from an independently projected tower position.
          if (showNumbers && index === 1 && strokes.length) {
            var ends = strokes.reduce(function (all, stroke) { return all.concat(stroke); }, []);
            if (ends.length) {
              var centerX = ends.reduce(function (sum, p) { return sum + p[0]; }, 0) / ends.length;
              var topY = Math.min.apply(null, ends.map(function (p) { return p[1]; }));
              labels.push({tower: row.index, x: centerX, y: topY - 5, color: dataset.color});
            }
          }
          renderedStrokes.push({tower: row.index, point: index === 0 ? 'base' : 'top',
            atmosphere: dataset.color === '#d62728' ? 'vacuum' : 'standard',
            strokes: strokes});
        });
      });
    });
    // Draw in canvas pixel space after the 3D strokes; this also works when
    // the camera, viewport or device pixel ratio changes.
    if (showNumbers && g.Context2D) {
      var ctx = g.Context2D;
      ctx.save();
      ctx.setTransform(g.ContextScale || 1, 0, 0, g.ContextScale || 1, 0, 0);
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#171717';
      labels.forEach(function (label) {
        ctx.strokeText(String(label.tower), label.x, label.y);
        ctx.fillStyle = label.color;
        ctx.fillText(String(label.tower), label.x, label.y);
      });
      ctx.restore();
    }
    g.ResetTrans3D();
  }
  root.CurvatureTowerOverlay = { setData: setData, clear: clear, getData: function () { return snapshot; }, getRenderedStrokes: function () { return renderedStrokes; }, draw: draw, towerAnchor: towerAnchor, markerWorld: markerWorld };
}(typeof globalThis !== 'undefined' ? globalThis : this));
