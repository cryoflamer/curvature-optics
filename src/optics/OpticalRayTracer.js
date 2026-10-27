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

  // A first-event search uses integrated intermediate states, not a chord
  // between the outer RK4 nodes. Sampling remains bounded: it cannot prove
  // that an arbitrary rapidly varying n(h) has no hidden events.
  var DEFAULT_EVENT_SUBSTEPS = 8;
  var DEFAULT_CONTACT_TOLERANCE = 1e-6; // metres, in h(x,z)

  function altitudeSlope(state, geometry, radius) {
    var n = normal(state[0], state[1], geometry, radius);
    return n[0] * state[2] + n[1] * state[3];
  }
  function sample(state, distance, geometry, radius, profile) {
    var s = distance === 0 ? state : step(state,distance,geometry,radius,profile);
    return {distance:distance,state:s,
      altitude:height(s[0],s[1],geometry,radius),
      slope:altitudeSlope(s,geometry,radius)};
  }
  // Precondition: there is a strictly below-ground sample at hi and an
  // above-ground (or exactly surface) sample at lo. Always choose the first
  // positive-to-negative crossing, never the far-side exit from a sphere.
  function crossing(state, lo, hi, geometry, radius, profile) {
    for (var j=0; j<60 && hi-lo>Math.max(1e-10,hi*1e-13); j++) {
      var mid=(lo+hi)/2;
      var candidate=sample(state,mid,geometry,radius,profile);
      if (candidate.altitude < 0) hi=mid;
      else lo=mid;
    }
    return sample(state,(lo+hi)/2,geometry,radius,profile);
  }
  // Find a local minimum of physical altitude inside a bracket in which
  // dh/ds changes from negative to positive (including a zero at the end).
  function minimum(state, lo, hi, geometry, radius, profile) {
    for (var j=0; j<60 && hi-lo>Math.max(1e-10,hi*1e-13); j++) {
      var mid=(lo+hi)/2;
      if (sample(state,mid,geometry,radius,profile).slope < 0) lo=mid;
      else hi=mid;
    }
    return sample(state,(lo+hi)/2,geometry,radius,profile);
  }
  function groundEvent(state, delta, geometry, radius, profile, substeps, tolerance) {
    var previous=sample(state,0,geometry,radius,profile);
    // Avoid a spurious event for a ray *departing* tangentially from the
    // surface. A ray launched into the surface is an immediate impact.
    if (previous.altitude <= 0 && previous.slope < -1e-12)
      return {contact:'crossing',point:previous};
    for (var i=1; i<=substeps; i++) {
      var current=sample(state,delta*i/substeps,geometry,radius,profile);
      if (previous.altitude >= 0 && current.altitude < 0) {
        return {contact:'crossing',point:crossing(state,previous.distance,
          current.distance,geometry,radius,profile)};
      }
      if (previous.slope < 0 && current.slope >= 0) {
        var lowest=minimum(state,previous.distance,current.distance,geometry,radius,profile);
        if (lowest.altitude < -tolerance) {
          // The endpoints can both be above ground. A local minimum below
          // ground still implies an entry and exit within this RK4 step.
          return {contact:'crossing',point:crossing(state,previous.distance,
            lowest.distance,geometry,radius,profile)};
        }
        if (Math.abs(lowest.altitude) <= tolerance)
          return {contact:'grazing',point:lowest};
      }
      // The minimum can coincide with the *last* sample of the requested
      // path, leaving no right-hand derivative bracket for the loop above.
      if (i===substeps && previous.slope<0 &&
          Math.abs(current.slope)<=1e-10 && Math.abs(current.altitude)<=tolerance)
        return {contact:'grazing',point:current};
      previous=current;
    }
    return null;
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
    var substeps=options.eventSubsteps===undefined?DEFAULT_EVENT_SUBSTEPS:options.eventSubsteps;
    var contactTolerance=options.contactTolerance===undefined?DEFAULT_CONTACT_TOLERANCE:options.contactTolerance;
    if (!Number.isInteger(substeps) || substeps<2 || substeps>64 ||
        !Number.isFinite(contactTolerance) || contactTolerance<=0 || contactTolerance>0.01)
      throw Error('Invalid ground event search parameters');
    var count = Math.ceil(length / ds);
    if (count > 1000000) throw Error('Too many integration steps');
    var state = [0, observerHeight, Math.cos(angle), Math.sin(angle)];
    var points = options.collect ? [[state[0], state[1]]] : null;
    var hitGround = false, travelled = 0, event = null;
    for (var i = 0; i < count; i++) {
      var delta = Math.min(ds, length - travelled);
      var impact=options.stopAtGround===false?null:
        groundEvent(state,delta,geometry,radius,profile,substeps,contactTolerance);
      if (impact) {
        state=impact.point.state;
        travelled+=impact.point.distance;
        hitGround=true;
        event={kind:'ground',contact:impact.contact,pathLength:travelled,
          x:state[0],z:state[1],height:height(state[0],state[1],geometry,radius),
          tolerance:contactTolerance};
      } else {
        state=step(state,delta,geometry,radius,profile);
        travelled+=delta;
      }
      if (points) points.push([state[0], state[1]]);
      if (hitGround) break;
    }
    return { x: state[0], z: state[1], angle: Math.atan2(state[3], state[2]),
      height: height(state[0], state[1], geometry, radius),
      hitGround: hitGround, travelled: travelled, points: points,
      termination:hitGround?'ground':(options.stopAtGround===false?'range-unchecked':'range'),
      event:event };
  }

  // A deliberately restricted target-point visibility query. Since n=1,
  // there is exactly one straight observer-to-target ray. In an atmosphere,
  // finding *all* connecting rays needs a separate shooting solver: do not
  // infer occlusion from its absence.
  function vacuumTargetVisibility(options) {
    options=options||{};
    if (options.profile!==undefined || options.atmosphere!==undefined ||
        options.profileOptions!==undefined)
      throw Error('Vacuum target visibility does not accept atmospheric profiles');
    var target=options.target;
    if (!Array.isArray(target)||target.length!==2 || !target.every(Number.isFinite))
      throw Error('Target must be a finite [x,z] in the observer tangent plane');
    var observerHeight=options.observerHeight===undefined?0:options.observerHeight;
    if (!Number.isFinite(observerHeight)||observerHeight<0)throw Error('Invalid observer height');
    var distance=Math.hypot(target[0],target[1]-observerHeight);
    if (!(distance>0)||!Number.isFinite(distance))
      throw Error('Distinct finite target point required');
    var tolerance=options.contactTolerance===undefined?DEFAULT_CONTACT_TOLERANCE:options.contactTolerance;
    var ray=trace({geometry:options.geometry,radius:options.radius,
      profile:atmosphere('vacuum'),observerHeight:observerHeight,
      angle:Math.atan2(target[1]-observerHeight,target[0]),length:distance,
      step:options.step===undefined?20:options.step,
      eventSubsteps:options.eventSubsteps,contactTolerance:tolerance});
    // A surface endpoint can be seen; the terrain is blocking only if it
    // is encountered *before* the target. Grazing is tolerance-dependent,
    // so a ray that may just touch the surface is not asserted visible.
    var priorHit=ray.hitGround && ray.travelled < distance-1e-7;
    var status= !priorHit?'visible':
      ray.event.contact==='crossing'?'blocked':'indeterminate';
    return {status:status,ray:ray,target:target.slice(),
      caveat:'Vacuum straight ray only; no atmospheric shooting or 3D mesh intersection'};
  }

  return { atmosphere: atmosphere, height: height, trace: trace, advanceState: advanceState,
    vacuumTargetVisibility:vacuumTargetVisibility };
}));
