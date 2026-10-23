/* Diagnostic angular positions of selected Pontchartrain transmission towers.
 * Independent of the legacy renderer. Angles are measured relative to the
 * observer's local horizontal, NOT screen pixel positions.
 */
(function (root, factory) {
  var api = factory(root.CurvatureRayTracer);
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./OpticalRayTracer'));
  root.CurvatureTowerDiagnostics = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (rt) {
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
  function apparentAngle(options) {
    var geometry = options.geometry, distance = options.distance;
    var observerHeight = options.observerHeight, height = options.targetHeight;
    var radius = options.radius || R;
    if (!(distance > 0) || !(observerHeight > 0) || !(height >= 0)) throw Error('Invalid diagnostic geometry');
    var p = target(geometry, distance, height, radius);
    var profile = rt.atmosphere(options.atmosphere || 'vacuum');
    var lineAngle = Math.atan2(p.z - observerHeight, p.x);
    var low = Math.max(-0.25, lineAngle - 0.03), high = Math.min(0.25, lineAngle + 0.03);
    var step = options.step || 25;
    function difference(angle) {
      var length = p.x / Math.cos(angle) + Math.max(2 * step, 3);
      var ray = rt.trace({ geometry: geometry, radius: radius, profile: profile,
        observerHeight: observerHeight, angle: angle, length: length, step: step, collect: true });
      var z = sampleAtX(ray, p.x);
      // A ray that hits the ground before reaching the target is below it.
      return z === null ? -Infinity : z - p.z;
    }
    if (difference(low) > 0 || difference(high) < 0) return null;
    for (var i = 0; i < 25; i++) {
      var mid = (low + high) / 2;
      if (difference(mid) < 0) low = mid; else high = mid;
    }
    var result = (low + high) / 2;
    // Re-check for ground interception on the selected branch.
    if (!isFinite(difference(result)) || Math.abs(difference(result)) > 0.05) return null;
    return result;
  }
  function towerRows(options) {
    var rows = [], count = options.count || 85;
    for (var i = 0; i < count; i += Math.max(1, Math.floor((count - 1) / 8))) {
      var distance = options.firstDistance + i * options.spacing;
      var base = { geometry: options.geometry, atmosphere: options.atmosphere,
        observerHeight: options.observerHeight, radius: options.radius,
        distance: distance, step: options.step || 25 };
      var bottom = apparentAngle(Object.assign({}, base, { targetHeight: 0 }));
      var top = apparentAngle(Object.assign({}, base, { targetHeight: options.towerHeight }));
      rows.push({ index: i + 1, distance: distance, bottom: bottom, top: top });
    }
    if (rows[rows.length - 1].index !== count) {
      var last = options.firstDistance + (count - 1) * options.spacing;
      var args = { geometry: options.geometry, atmosphere: options.atmosphere,
        observerHeight: options.observerHeight, radius: options.radius, distance: last, step: options.step || 25 };
      rows.push({ index: count, distance: last,
        bottom: apparentAngle(Object.assign({}, args, { targetHeight: 0 })),
        top: apparentAngle(Object.assign({}, args, { targetHeight: options.towerHeight })) });
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
        var format = function (a) { return a === null ? 'occluded' : (a * 180 / Math.PI).toFixed(5) + '°'; };
        var html = '<table style="border-collapse:collapse;font:13px monospace"><thead><tr><th>Tower</th><th>Distance</th><th>Base angle</th><th>Top angle</th></tr></thead><tbody>';
        rows.forEach(function (r) {
          html += '<tr><td>' + r.index + '</td><td>' + (r.distance/1000).toFixed(2) + ' km</td><td>' + format(r.bottom) + '</td><td>' + format(r.top) + '</td></tr>';
        });
        output.innerHTML = html + '</tbody></table><small>Angles relative to local horizontal. "occluded" means no direct unblocked ray found in the searched angular interval. Independent diagnostic, not the scene renderer.</small>';
      } catch (e) { output.textContent = 'Diagnostic error: ' + e.message; }
    }, 0);
  }
  function bind() {
    var button = document.getElementById('TowerDiagnosticRun');
    if (button) button.addEventListener('click', render);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }
  return { target: target, apparentAngle: apparentAngle, towerRows: towerRows };
}));
