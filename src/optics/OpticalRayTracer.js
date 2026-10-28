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
        dn: function (h) { return -N0 * Math.exp(-h / H) / H; },
        // Conservative upper bound on |d(n)/dh / n| for altitudes >= h.
        // Used only to prove a whole RK4 segment remains above the ground;
        // arbitrary user profiles have no such shortcut.
        rayCurvatureUpperBound: function (lowestHeight) {
          return N0 * Math.exp(-lowestHeight / H) / H;
        }
      };
    }
    // Mathematical flat-surface occlusion models. The parameter
    // occlusionRadius is the radius of the *comparison sphere*, not the
    // radius of the actual Flat geometry (or the Globe geometry).
    // Ref: Maslovsky, Inverse Geometric Optics (2026), Eqs. (27) and (73).
    if (kind === 'exponential-occlusion' || kind === 'inverse-spherical') {
      var R = options.occlusionRadius;
      var n0 = options.n0 === undefined ? 1 : options.n0;
      if (!Number.isFinite(R) || !(R > 0) ||
          !Number.isFinite(n0) || !(n0 > 0))
        throw Error('A positive finite occlusionRadius and n0 are required');
      if (kind === 'exponential-occlusion') return {
        n: function (h) { return n0 * Math.exp(h / R); },
        dn: function (h) { return n0 * Math.exp(h / R) / R; }
      };
      // Let u=1+h/R. In the exact reconstruction,
      // n^2/n0^2 = 1 + u^4 - u^2 = 1 + t*(2+t)*(1+t)^2.
      // The t formulation avoids catastrophic cancellation near h=0.
      function shape(h) {
        var t = h / R, u = 1 + t;
        return Math.sqrt(1 + t * (2 + t) * u * u);
      }
      return {
        n: function (h) { return n0 * shape(h); },
        dn: function (h) {
          var u = 1 + h / R;
          return n0 * (2 * u * u * u - u) / (R * shape(h));
        }
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
    // Algebraically identical to normal(...), without the per-stage
    // temporary array (four derivative evaluations per RK4 step).
    var nx=0,nz=1;
    if(geometry!=='flat'){
      var d=Math.hypot(s[0],s[1]+radius);
      nx=s[0]/d;nz=(s[1]+radius)/d;
    }
    var dot = s[2] * nx + s[3] * nz;
    var q = dn / n;
    return [s[2], s[3], q * (nx - dot * s[2]), q * (nz - dot * s[3])];
  }
  function add(s, k, dt) {
    return [s[0]+dt*k[0],s[1]+dt*k[1],s[2]+dt*k[2],s[3]+dt*k[3]];
  }
  function step(s, ds, geometry, radius, profile) {
    var a = derivative(s, geometry, radius, profile);
    var b = derivative(add(s, a, ds / 2), geometry, radius, profile);
    var c = derivative(add(s, b, ds / 2), geometry, radius, profile);
    var d = derivative(add(s, c, ds), geometry, radius, profile);
    var out = [
      s[0]+ds*(a[0]+2*b[0]+2*c[0]+d[0])/6,
      s[1]+ds*(a[1]+2*b[1]+2*c[1]+d[1])/6,
      s[2]+ds*(a[2]+2*b[2]+2*c[2]+d[2])/6,
      s[3]+ds*(a[3]+2*b[3]+2*c[3]+d[3])/6
    ];
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

  // Prepared RK4 stepper for repeated shooting integrations in a single optical
  // solve. The immutable geometry/profile are checked ONCE; every integration
  // still runs the exact same `step` recurrence used by advanceState/trace.
  // The `trustedSolverState` flag is only for states generated by the solver
  // itself. They start unit length, and step() checks/normalizes each output;
  // external callers still get the fully checked default stepper.
  // This is only an internal solver optimization, not an alternate integrator.
  function prepareStepper(options, trustedSolverState) {
    var setup=validateSetup(options);
    return function(state, distance) {
      if(!trustedSolverState&&(!Array.isArray(state)||state.length!==4||!state.every(Number.isFinite)||
          Math.abs(Math.hypot(state[2],state[3])-1)>1e-8||!Number.isFinite(distance)))
        throw Error('Invalid ray state or signed step');
      if(!Number.isFinite(distance))throw Error('Invalid ray step');
      return step(state,distance,setup.geometry,setup.radius,setup.profile);
    };
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

  // Minimum surface altitude of the straight chord joining two states.
  // The true ray can depart from this chord by no more than K*ds^2/8 when
  // its curvature is bounded by K. Ground altitude is 1-Lipschitz in space.
  function chordClearance(a,b,geometry,radius) {
    if(geometry==='flat')return Math.min(a[1],b[1]);
    var dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz;
    var t=den>0?-(a[0]*dx+(a[1]+radius)*dz)/den:0;
    t=Math.max(0,Math.min(1,t));
    return Math.hypot(a[0]+t*dx,a[1]+radius+t*dz)-radius;
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
    var fastGroundSkips=0,fullGroundChecks=0;
    var fastGround=options.fastClearGround===true &&
      typeof profile.rayCurvatureUpperBound==='function';
    for (var i = 0; i < count; i++) {
      var delta = Math.min(ds, length - travelled);
      var clearNext=null,provedClear=false;
      if(fastGround && options.stopAtGround!==false &&
          height(state[0],state[1],geometry,radius)>0) {
        clearNext=step(state,delta,geometry,radius,profile);
        var h=height(state[0],state[1],geometry,radius);
        var curvature=profile.rayCurvatureUpperBound(h-delta);
        // The additional factor of 2 and 1 mm cushion make the shortcut
        // more conservative than the continuous-curve chord bound. A near-
        // horizon or uncertain segment always takes the original event path.
        var margin=curvature*delta*delta/4+0.001;
        provedClear=Number.isFinite(margin) &&
          chordClearance(state,clearNext,geometry,radius)>margin;
        if(provedClear)fastGroundSkips++;
      }
      if(!provedClear && options.stopAtGround!==false)fullGroundChecks++;
      var impact=options.stopAtGround===false||provedClear?null:
        groundEvent(state,delta,geometry,radius,profile,substeps,contactTolerance);
      if (impact) {
        state=impact.point.state;
        travelled+=impact.point.distance;
        hitGround=true;
        event={kind:'ground',contact:impact.contact,pathLength:travelled,
          x:state[0],z:state[1],height:height(state[0],state[1],geometry,radius),
          tolerance:contactTolerance};
      } else {
        state=provedClear?clearNext:step(state,delta,geometry,radius,profile);
        travelled+=delta;
      }
      if (points) points.push([state[0], state[1]]);
      if (hitGround) break;
    }
    return { x: state[0], z: state[1], angle: Math.atan2(state[3], state[2]),
      height: height(state[0], state[1], geometry, radius),
      hitGround: hitGround, travelled: travelled, points: points,
      termination:hitGround?'ground':(options.stopAtGround===false?'range-unchecked':'range'),
      fastGroundSkips:fastGroundSkips,fullGroundChecks:fullGroundChecks,
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

  return { atmosphere: atmosphere, height: height, trace: trace, advanceState: advanceState, prepareStepper:prepareStepper,
    vacuumTargetVisibility:vacuumTargetVisibility };
}));
