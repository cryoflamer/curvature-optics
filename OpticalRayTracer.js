/* Independent 2D geometrical-optics integrator. No changes to the legacy renderer.
 * x is horizontal, z is height above the observer's tangent plane.
 * For a globe the centre is (0,-radius); for flat Earth h=z.
 * Angles are radians, distances are metres.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureRayTracer = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DEFAULT_RADIUS = 6371000;

  function atmosphere(kind, options) {
    options = options || {};
    if (kind === 'vacuum') return { n: function () { return 1; }, dn: function () { return 0; } };
    if (kind === 'standard') {
      // Exponential refractivity, representative near-surface standard profile.
      // Not a full meteorological model; both constants are configurable.
      var N0 = options.refractivity === undefined ? 0.000293 : options.refractivity;
      var H = options.scaleHeight === undefined ? 7350 : options.scaleHeight;
      if (!(H > 0) || !(N0 >= 0)) throw Error('Invalid atmospheric constants');
      return {
        n: function (h) { return 1 + N0 * Math.exp(-h / H); },
        dn: function (h) { return -N0 * Math.exp(-h / H) / H; }
      };
    }
    if (kind === 'custom') {
      if (typeof options.n !== 'function' || typeof options.dn !== 'function')
        throw Error('Custom profile requires n(h) and dn(h) functions');
      return { n: options.n, dn: options.dn };
    }
    throw Error('Unknown atmosphere: ' + kind);
  }

  function height(x, z, geometry, radius) {
    return geometry === 'flat' ? z : Math.hypot(x, z + radius) - radius;
  }
  function normal(x, z, geometry, radius) {
    if (geometry === 'flat') return [0, 1];
    var d = Math.hypot(x, z + radius);
    return [x / d, (z + radius) / d];
  }
  function derivative(s, geometry, radius, profile) {
    var h = height(s[0], s[1], geometry, radius);
    var n = profile.n(h), dn = profile.dn(h);
    if (!(n > 0) || !isFinite(n) || !isFinite(dn)) throw Error('Invalid refractive index');
    var v = normal(s[0], s[1], geometry, radius);
    var dot = s[2] * v[0] + s[3] * v[1];
    var q = dn / n;
    return [s[2], s[3], q * (v[0] - dot * s[2]), q * (v[1] - dot * s[3])];
  }
  function add(s, k, dt) { return s.map(function (v, i) { return v + dt * k[i]; }); }
  function step(s, ds, geometry, radius, profile) {
    var a = derivative(s, geometry, radius, profile);
    var b = derivative(add(s, a, ds / 2), geometry, radius, profile);
    var c = derivative(add(s, b, ds / 2), geometry, radius, profile);
    var d = derivative(add(s, c, ds), geometry, radius, profile);
    var out = s.map(function (v, i) { return v + ds * (a[i] + 2*b[i] + 2*c[i] + d[i]) / 6; });
    var norm = Math.hypot(out[2], out[3]);
    out[2] /= norm; out[3] /= norm;
    return out;
  }

  function trace(options) {
    options = options || {};
    var geometry = options.geometry || 'globe';
    if (geometry !== 'globe' && geometry !== 'flat') throw Error('Unknown geometry');
    var radius = options.radius || DEFAULT_RADIUS;
    var profile = options.profile || atmosphere(options.atmosphere || 'standard', options.profileOptions);
    var angle = options.angle || 0, observerHeight = options.observerHeight || 0;
    var length = options.length === undefined ? 50000 : options.length;
    var ds = options.step === undefined ? 20 : options.step;
    if (!(radius > 0) || !(length >= 0) || !(ds > 0) || !isFinite(angle) || observerHeight < 0)
      throw Error('Invalid ray parameters');
    var count = Math.ceil(length / ds);
    if (count > 1000000) throw Error('Too many integration steps');
    var state = [0, observerHeight, Math.cos(angle), Math.sin(angle)];
    var points = options.collect ? [[state[0], state[1]]] : null;
    var hitGround = false, travelled = 0;
    for (var i = 0; i < count; i++) {
      var delta = Math.min(ds, length - travelled);
      var next = step(state, delta, geometry, radius, profile);
      travelled += delta;
      if (height(next[0], next[1], geometry, radius) < 0) {
        // First-order interpolation of the ground crossing for diagnostics.
        var h0 = height(state[0], state[1], geometry, radius);
        var h1 = height(next[0], next[1], geometry, radius);
        var t = h0 / (h0 - h1);
        next = state.map(function (v, j) { return v + t * (next[j] - v); });
        hitGround = true;
      }
      state = next;
      if (points) points.push([state[0], state[1]]);
      if (hitGround) break;
    }
    return { x: state[0], z: state[1], angle: Math.atan2(state[3], state[2]),
      height: height(state[0], state[1], geometry, radius),
      hitGround: hitGround, travelled: travelled, points: points };
  }
  return { atmosphere: atmosphere, height: height, trace: trace };
}));
