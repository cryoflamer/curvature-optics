/* Browser-only vacuum calibration against Bislin's actual SetTrans and camera.
 * No rendering changes. Results are logged once to the browser console.
 */
(function (root) {
  'use strict';
  var lastKey = null;
  function run(g, m, setTrans) {
    if (!g || !m || !setTrans || !root.CurvatureTowerOverlay ||
        m.opticsMode !== 'ray-tracing' || m.showModel !== 1 ||
        m.ObjType[0] !== 3 || !m.NObjects[0]) return null;
    var overlay = root.CurvatureTowerOverlay;
    var radius = m.geometryRadius;
    var side = m.ObjSidePos[0];
    var samples = [0, 10, 20, 30, 40, 50, 60, 70, 80, m.NObjects[0] - 1];
    var rows = [], seen = {};
    var originalTrans = g.Trans3D;
    try {
      samples.forEach(function (i) {
        if (i < 0 || i >= m.NObjects[0] || seen[i]) return;
        seen[i] = true;
        var distance = m.ObjDist[0] + i * m.ObjDeltaDist[0];
        // SetTrans is the scene's actual geometry transform; local z=1 is
        // the tower-axis top at ObjSize. Compare the same anchor, not the
        // decorative silhouette or the foundation's lateral vertices.
        setTrans(0, g, m, distance / radius, side / radius,
          m.ObjSize[0], 0, true);
        [0, 1].forEach(function (localZ) {
          var referenceWorld = g.GetTransPoint3D(0, 0, localZ, [0, 0, 0]).slice();
          var height = localZ * m.ObjSize[0];
          var reconstructed = overlay.towerAnchor('globe', distance, height,
            m.rEarth, side, m.Height);
          var horizontal = Math.hypot(reconstructed[0], reconstructed[1]);
          var angle = Math.atan2(reconstructed[2], horizontal);
          var opticalWorld = [reconstructed[0], reconstructed[1],
            horizontal * Math.tan(angle)];
          var a = g.Camera.Trans(referenceWorld);
          var b = g.Camera.Trans(opticalWorld);
          // Both points pass through Bislin's real camera and window-to-canvas
          // mapping, so the reported error is in CSS canvas pixels.
          var ax = g.WinTrans.TransX(a[0]), ay = g.WinTrans.TransY(a[1]);
          var bx = g.WinTrans.TransX(b[0]), by = g.WinTrans.TransY(b[1]);
          var error = Math.hypot(ax - bx, ay - by);
          rows.push({tower: i + 1, point: localZ ? 'top' : 'base',
            referenceX: +ax.toFixed(3), referenceY: +ay.toFixed(3),
            opticalX: +bx.toFixed(3), opticalY: +by.toFixed(3),
            errorPx: +error.toFixed(4), pass: error < 0.5});
        });
      });
    } finally {
      g.SetTrans3D(originalTrans, true);
    }
    var failures = rows.filter(function (r) { return !r.pass; });
    if (root.console) {
      root.console.group('Vacuum calibration: real SetTrans + Bislin camera');
      root.console.table(rows);
      root.console.log('Points:', rows.length, 'Failed (>= 0.5 px):', failures.length);
      root.console.log('This checks axis-anchor geometry and camera mapping, not tower silhouette or numerical solver.');
      root.console.groupEnd();
    }
    return {rows: rows, failures: failures};
  }
  function onDraw(g, m, setTrans) {
    var key = [m.opticsMode, m.showModel, m.ObjType[0], m.Height,
      m.geometryRadius, m.ObjDist[0], m.ObjDeltaDist[0], m.ObjSize[0],
      m.ObjSidePos[0], m.NObjects[0], JSON.stringify(m.camPos),
      JSON.stringify(m.camViewCenter), m.camSceneSize].join('|');
    if (key === lastKey) return;
    var result = run(g, m, setTrans);
    if (result) lastKey = key;
  }
  root.CurvatureProjectionCalibration = {run: run, onDraw: onDraw};
}(typeof globalThis !== 'undefined' ? globalThis : this));
