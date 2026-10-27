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
      if (!(H > 0) || !(N0 >= 0) || !Number.isFinite(H) || !Number.isFinite(N0))
        throw Error('Invalid atmospheric constants');
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
    if (!(norm > 0) || !Number.isFinite(norm) ||
        !Number.isFinite(out[0]) || !Number.isFinite(out[1]))
      throw Error('Non-finite ray state');
    out[2] /= norm; out[3] /= norm;
    return out;
  }

  function validateSetup(options) {
    options = options || {};
    var geometry = options.geometry === undefined ? 'globe' : options.geometry;
    if (geometry !== 'globe' && geometry !== 'flat') throw Error('Unknown geometry');
    var radius = options.radius === undefined ? DEFAULT_RADIUS : options.radius;
    if (!(radius > 0) || !Number.isFinite(radius)) throw Error('Invalid ray radius');
    var profile = options.profile || atmosphere(options.atmosphere || 'standard', options.profileOptions);
    if (!profile || typeof profile.n !== 'function' || typeof profile.dn !== 'function')
      throw Error('Invalid ray profile');
    return {geometry:geometry,radius:radius,profile:profile};
  }

  // One signed RK4 path-length step, available for convergence and reciprocal
  // integration tests. State is [x,z,vx,vz] in the observer tangent frame;
  // direction must be unit length, but ds may be negative for reverse stepping.
  function advanceState(state, ds, options) {
    var setup = validateSetup(options);
    if (!Array.isArray(state) || state.length !== 4 ||
        !state.every(Number.isFinite) ||
        Math.abs(Math.hypot(state[2],state[3]) - 1) > 1e-8 ||
        !Number.isFinite(ds)) throw Error('Invalid ray state or signed step');
    return step(state,ds,setup.geometry,setup.radius,setup.profile);
  }

  // Refine a BRACKETED first crossing with the same RK4 trajectory used by
  // trace(). Do not interpolate positions or directions across a curved step.
  // Tangential contacts without a sign change are not detected here; robust
  // grazing/multiple-event handling is deliberately left to patch 101.
  function groundCrossing(state, delta, geometry, radius, profile) {
    var lo = 0, hi = delta;
    for (var j = 0; j < 52; j++) {
      var mid = (lo + hi) / 2;
      var candidate = step(state, mid, geometry, radius, profile);
      if (height(candidate[0],candidate[1],geometry,radius) < 0) hi = mid;
      else lo = mid;
      if (hi - lo <= Math.max(1e-10,delta * 1e-12)) break;
    }
    var distance = (lo + hi) / 2;
    return {state:step(state,distance,geometry,radius,profile),distance:distance};
  }

  function trace(options) {
    options = options || {};
    var setup=validateSetup(options);
    var geometry=setup.geometry, radius=setup.radius, profile=setup.profile;
    var angle = options.angle === undefined ? 0 : options.angle;
    var observerHeight = options.observerHeight === undefined ? 0 : options.observerHeight;
    var length = options.length === undefined ? 50000 : options.length;
    var ds = options.step === undefined ? 20 : options.step;
    if (!Number.isFinite(angle) || !Number.isFinite(observerHeight) || observerHeight < 0 ||
        !Number.isFinite(length) || length < 0 || !Number.isFinite(ds) || ds <= 0)
      throw Error('Invalid ray parameters');
    var count = Math.ceil(length / ds);
    if (count > 1000000) throw Error('Too many integration steps');
    var state = [0, observerHeight, Math.cos(angle), Math.sin(angle)];
    var points = options.collect ? [[state[0], state[1]]] : null;
    var hitGround = false, travelled = 0;
    for (var i = 0; i < count; i++) {
      var delta = Math.min(ds, length - travelled);
      var next = step(state, delta, geometry, radius, profile);
      if (options.stopAtGround !== false && height(next[0], next[1], geometry, radius) < 0 &&
          height(state[0], state[1], geometry, radius) >= 0) {
        var impact = groundCrossing(state,delta,geometry,radius,profile);
        next = impact.state;
        travelled += impact.distance;
        hitGround = true;
      } else travelled += delta;
      state = next;
      if (points) points.push([state[0], state[1]]);
      if (hitGround) break;
    }
    return { x: state[0], z: state[1], angle: Math.atan2(state[3], state[2]),
      height: height(state[0], state[1], geometry, radius),
      hitGround: hitGround, travelled: travelled, points: points };
  }
  return { atmosphere: atmosphere, height: height, trace: trace, advanceState: advanceState };
}));
