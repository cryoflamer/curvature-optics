/* Diagnostic angular positions of selected Pontchartrain transmission towers.
 * Independent of the legacy renderer. Angles are measured relative to the
 * observer's local horizontal, NOT screen pixel positions.
 */
(function (root, factory) {
  var api = factory(root.CurvatureRayTracer, root);
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./OpticalRayTracer'), root);
  root.CurvatureTowerDiagnostics = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (rt, root) {
  'use strict';
  var R = 6371000;
  function target(geometry, distance, height, radius) {
    if (geometry === 'flat') return { x: distance, z: height };
    var theta = distance / radius;
    return { x: (radius + height) * Math.sin(theta), z: (radius + height) * Math.cos(theta) - radius };
  }
  function sampleAtX(ray, x) {
    var p = ray.points;
    if (!p || p[p.length - 1][0] < x) return null;
    var lo = 0, hi = p.length - 1;
    while (hi - lo > 1) {
      var mid = (hi + lo) >> 1;
      if (p[mid][0] < x) lo = mid; else hi = mid;
    }
    var t = (x - p[lo][0]) / (p[hi][0] - p[lo][0]);
    return p[lo][1] + t * (p[hi][1] - p[lo][1]);
  }
  // Return a status instead of conflating a blocked ray with a failed solver.
  function solveAngle(options) {
    var geometry = options.geometry, distance = options.distance;
    var observerHeight = options.observerHeight, height = options.targetHeight;
    var radius = options.radius || R;
    if (!(distance > 0) || !(observerHeight > 0) || !(height >= 0)) throw Error('Invalid diagnostic geometry');
    var p = target(geometry, distance, height, radius);
    var profile = rt.atmosphere(options.atmosphere || 'vacuum', options.atmosphereOptions);
    var lineAngle = Math.atan2(p.z - observerHeight, p.x);
    var step = options.step || 25;
    // Vacuum is exact: avoid a numerical root search at the ground boundary.
    var vacuum = (options.atmosphere || 'vacuum') === 'vacuum';
    function shoot(angle) {
      var length = p.x / Math.cos(angle) + Math.max(4 * step, 10);
      var ray = rt.trace({ geometry: geometry, radius: radius, profile: profile,
        observerHeight: observerHeight, angle: angle, length: length, step: step,
        collect: true, stopAtGround: false });
      var z = sampleAtX(ray, p.x);
      return { residual: z === null ? NaN : z - p.z, ray: ray };
    }
    var angle = lineAngle;
    if (!vacuum) {
      // The true angle can be steeper than 0.25 rad for a nearby ground target.
      var low = Math.max(-Math.PI / 2 + 0.01, lineAngle - 0.05);
      var high = Math.min(Math.PI / 2 - 0.01, lineAngle + 0.05);
      var fl = shoot(low).residual, fh = shoot(high).residual;
      if (!(isFinite(fl) && isFinite(fh) && fl <= 0 && fh >= 0))
        return { status: 'no solution', angle: null };
      for (var i = 0; i < 34; i++) {
        var mid = (low + high) / 2, fm = shoot(mid).residual;
        if (!isFinite(fm)) return { status: 'no solution', angle: null };
        if (fm < 0) low = mid; else high = mid;
      }
      angle = (low + high) / 2;
      if (Math.abs(shoot(angle).residual) > 0.02)
        return { status: 'no solution', angle: null };
    }
    // Inspect the complete path, excluding the endpoint: ground-level targets
    // legitimately terminate on the surface. Sampling must not flag that contact.
    var ray = shoot(angle).ray, points = ray.points;
    var clearanceTolerance = options.clearanceTolerance === undefined ? 0.03 : options.clearanceTolerance; // metres; default RK4/interpolation allowance
    if (!(isFinite(clearanceTolerance) && clearanceTolerance >= 0)) throw Error('Invalid clearance tolerance');
    for (var j = 1; j < points.length; j++) {
      var a = points[j - 1], b = points[j];
      if (a[0] >= p.x) break;
      var x = Math.min(b[0], p.x);
      var fraction = (x - a[0]) / (b[0] - a[0]);
      var z = a[1] + fraction * (b[1] - a[1]);
      // For a ground target the endpoint itself is allowed to touch the surface.
      if (x >= p.x - 1e-6 && height === 0) continue;
      if (rt.height(x, z, geometry, radius) < -clearanceTolerance)
        return { status: 'occluded', angle: null };
    }
    return { status: 'visible', angle: angle };
  }
  function apparentAngle(options) {
    return solveAngle(options).angle;
  }
  function towerRows(options) {
    var rows = [], count = options.count || 85;
    for (var i = 0; i < count; i += Math.max(1, Math.floor((count - 1) / 8))) {
      var distance = options.firstDistance + i * options.spacing;
      var base = { geometry: options.geometry, atmosphere: options.atmosphere,
        observerHeight: options.observerHeight, radius: options.radius,
        distance: distance, step: options.step || 25 };
      var bottomResult = solveAngle(Object.assign({}, base, { targetHeight: 0 }));
      var topResult = solveAngle(Object.assign({}, base, { targetHeight: options.towerHeight }));
      rows.push({ index: i + 1, distance: distance, bottom: bottomResult.angle, top: topResult.angle, bottomStatus: bottomResult.status, topStatus: topResult.status });
    }
    if (rows[rows.length - 1].index !== count) {
      var last = options.firstDistance + (count - 1) * options.spacing;
      var args = { geometry: options.geometry, atmosphere: options.atmosphere,
        observerHeight: options.observerHeight, radius: options.radius, distance: last, step: options.step || 25 };
      var lastBottom = solveAngle(Object.assign({}, args, { targetHeight: 0 }));
      var lastTop = solveAngle(Object.assign({}, args, { targetHeight: options.towerHeight }));
      rows.push({ index: count, distance: last, bottom: lastBottom.angle, top: lastTop.angle,
        bottomStatus: lastBottom.status, topStatus: lastTop.status });
    }
    return rows;
  }
  function render() {
    var panel = document.getElementById('OpticsTowerDiagnostic');
    if (!panel || typeof CurveApp === 'undefined') return;
    var m = CurveApp;
    var geometry = document.getElementById('TowerDiagnosticGeometry').value;
    var atmosphere = document.getElementById('TowerDiagnosticAtmosphere').value;
    var output = document.getElementById('TowerDiagnosticOutput');
    if (!m.NObjects || m.NObjects[0] < 1 || m.ObjType[0] !== 3) {
      output.textContent = 'Select the TrnsmLine demo first (tower object group 0).';
      return;
    }
    if (m.Height <= 0) { output.textContent = 'Observer height must be positive.'; return; }
    output.textContent = 'Computing…';
    // Explicit button-driven calculation: never block the regular redraw loop.
    setTimeout(function () {
      try {
        var rows = towerRows({ geometry: geometry, atmosphere: atmosphere,
          observerHeight: m.Height, radius: m.rEarth, firstDistance: m.ObjDist[0],
          spacing: m.ObjDeltaDist[0], count: m.NObjects[0], towerHeight: m.ObjSize[0] });
        var format = function (a, status) { return a === null ? status : (a * 180 / Math.PI).toFixed(5) + '&deg;'; };
        var html = '<table style="border-collapse:collapse;font:13px monospace"><thead><tr><th>Tower</th><th>Distance</th><th>Base angle</th><th>Top angle</th></tr></thead><tbody>';
        rows.forEach(function (r) {
          html += '<tr><td>' + r.index + '</td><td>' + (r.distance/1000).toFixed(2) + ' km</td><td>' + format(r.bottom, r.bottomStatus) + '</td><td>' + format(r.top, r.topStatus) + '</td></tr>';
        });
        if (root.CurvatureTowerOverlay) {
          var overlayOptions = { geometry: geometry, observerHeight: m.Height,
            radius: m.rEarth, firstDistance: m.ObjDist[0], spacing: m.ObjDeltaDist[0],
            count: m.NObjects[0], towerHeight: m.ObjSize[0] };
          var vacuumRows = atmosphere === 'vacuum' ? rows : towerRows(Object.assign({}, overlayOptions, { atmosphere: 'vacuum' }));
          var standardRows = atmosphere === 'standard' ? rows : towerRows(Object.assign({}, overlayOptions, { atmosphere: 'standard' }));
          root.CurvatureTowerOverlay.setData({ geometry: geometry, height: m.Height,
            radius: m.rEarth, firstDistance: m.ObjDist[0], spacing: m.ObjDeltaDist[0],
            count: m.NObjects[0], towerHeight: m.ObjSize[0], side: m.ObjSidePos[0],
            vacuum: vacuumRows, standard: standardRows });
          if (typeof graph !== 'undefined') graph.Redraw();
        }
        output.innerHTML = html + '</tbody></table><small>Angles relative to local horizontal. "occluded" means the connecting ray intersects the ground; "no solution" means the angle solver did not converge. Independent diagnostic, not the scene renderer.</small>';
      } catch (e) { output.textContent = 'Diagnostic error: ' + e.message; }
    }, 0);
  }
  function bind() {
    var button = document.getElementById('TowerDiagnosticRun');
    if (button) button.addEventListener('click', render);
    var overlay = document.getElementById('TowerOverlayEnabled');
    if (overlay) overlay.addEventListener('change', function () {
      if (typeof graph !== 'undefined') graph.Redraw();
    });
    var vacuumOnly = document.getElementById('TowerOverlayVacuumOnly');
    if (vacuumOnly) vacuumOnly.addEventListener('change', function () {
      if (typeof graph !== 'undefined') graph.Redraw();
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }
  return { target: target, apparentAngle: apparentAngle, solveAngle: solveAngle, towerRows: towerRows };
}));
