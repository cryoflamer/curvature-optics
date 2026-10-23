/* Experimental diagnostic markers for apparent tower positions.
 * No legacy scene geometry or clipping rules are modified.
 */
(function (root) {
  'use strict';
  var snapshot = null;
  function setData(data) { snapshot = data; }
  function clear() { snapshot = null; }
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
    var datasets = [
      { rows: snapshot.vacuum, color: '#d62728' },
      { rows: snapshot.standard, color: '#008f55' }
    ];
    datasets.forEach(function (dataset) {
      g.SetLineAttr(dataset.color, 2);
      dataset.rows.forEach(function (row) {
        var distance = row.distance;
        // The marker is placed on the camera ray at the target's horizontal
        // range. This preserves the camera's own perspective, pan and zoom.
        var p = root.CurvatureTowerDiagnostics.target(snapshot.geometry, distance, 0, m.rEarth);
        var y = p.x;
        if (!(y > 0)) return;
        var side = snapshot.side;
        var size = Math.max(0.2, y * 0.00028);
        [row.bottom, row.top].forEach(function (angle) {
          if (angle === null || !isFinite(angle)) return;
          var z = y * Math.tan(angle);
          g.Line3D([side - size, y, z], [side + size, y, z]);
          g.Line3D([side, y, z - size], [side, y, z + size]);
        });
      });
    });
    g.ResetTrans3D();
  }
  root.CurvatureTowerOverlay = { setData: setData, clear: clear, draw: draw };
}(typeof globalThis !== 'undefined' ? globalThis : this));
