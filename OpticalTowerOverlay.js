/* Experimental diagnostic markers for apparent tower positions.
 * No legacy scene geometry or clipping rules are modified.
 */
(function (root) {
  'use strict';
  var snapshot = null;
  function setData(data) { snapshot = data; }
  function clear() { snapshot = null; }
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
    g.ResetTrans3D();
    g.SetAlpha(1);
    g.SetClipping('canvas');
    var vacuumOnly = !!(document.getElementById('TowerOverlayVacuumOnly') || {}).checked;
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
          if (angle === null || !isFinite(angle)) return;
          var targetHeight = index === 0 ? 0 : snapshot.towerHeight;
          var marker = markerWorld(snapshot.geometry, distance, targetHeight,
            angle, m.rEarth, side, m.Height);
          if (!marker) return;
          g.Line3D([marker[0] - size, marker[1], marker[2]],
            [marker[0] + size, marker[1], marker[2]]);
          g.Line3D([marker[0], marker[1], marker[2] - size],
            [marker[0], marker[1], marker[2] + size]);
        });
      });
    });
    g.ResetTrans3D();
  }
  root.CurvatureTowerOverlay = { setData: setData, clear: clear, getData: function () { return snapshot; }, draw: draw, towerAnchor: towerAnchor, markerWorld: markerWorld };
}(typeof globalThis !== 'undefined' ? globalThis : this));
