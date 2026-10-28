/* Independent point-to-point shooting in a vertically stratified 2D medium.
 * Coordinates: [x,z] in the observer's tangent plane, metres; angles radians.
 * No legacy effective-radius optics or Canvas dependencies.
 */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports ? require('./OpticalRayTracer') : root.CurvatureRayTracer);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureTargetProjection = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (rt) {
  'use strict';
  var HALF_PI = Math.PI / 2;

  function solve(options) {
    options = options || {};
    var target = options.target;
    if (!Array.isArray(target) || target.length !== 2 || !target.every(Number.isFinite) || !(target[0] > 0))
      throw Error('Target must be finite [x,z] with x > 0 in the observer tangent frame');
    var observerHeight = options.observerHeight === undefined ? 0 : options.observerHeight;
    if (!Number.isFinite(observerHeight) || observerHeight < 0)
      throw Error('Invalid observer height');
    var step = options.step === undefined ? 50 : options.step;
    var tolerance = options.targetTolerance === undefined ? 1e-6 : options.targetTolerance;
    var maxIterations = options.maxIterations === undefined ? 48 : options.maxIterations;
    var maxSteps = options.maxSteps === undefined ? 100000 : options.maxSteps;
    var initialSpan = options.initialSpan === undefined ? 0.02 : options.initialSpan;
    var maxSpan = options.maxSpan === undefined ? 1.2 : options.maxSpan;
    if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 0.1 ||
        !Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 100 ||
        !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 1000000 ||
        !Number.isFinite(initialSpan) || initialSpan <= 0 ||
        !Number.isFinite(maxSpan) || maxSpan < initialSpan || maxSpan > 1.55)
      throw Error('Invalid target-shooting controls');
    if (options.profile !== undefined && (options.atmosphere !== undefined || options.profileOptions !== undefined))
      throw Error('Specify either a refractive profile or atmosphere options');
    var geometry = options.geometry === undefined ? 'globe' : options.geometry;
    var radius = options.radius === undefined ? 6371000 : options.radius;
    if ((geometry !== 'globe' && geometry !== 'flat') || !Number.isFinite(radius) || radius <= 0)
      throw Error('Invalid target geometry');
    var profile = options.profile || rt.atmosphere(options.atmosphere || 'standard', options.profileOptions);
    if (!profile || typeof profile.n !== 'function' || typeof profile.dn !== 'function')
      throw Error('Invalid refractive profile');
    var eventSubsteps = options.eventSubsteps === undefined ? 8 : options.eventSubsteps;
    var contactTolerance = options.contactTolerance === undefined ? 1e-6 : options.contactTolerance;
    if (!Number.isInteger(eventSubsteps) || eventSubsteps < 2 || eventSubsteps > 64 ||
        !Number.isFinite(contactTolerance) || contactTolerance <= 0 || contactTolerance > 0.01)
      throw Error('Invalid ground-contact controls');
    var targetAltitude = rt.height(target[0], target[1], geometry, radius);
    if (targetAltitude < -contactTolerance)
      throw Error('Target is below the opaque boundary');
    var groundEndpoint = targetAltitude <= contactTolerance;
    // Requiring a tighter shooting residual at the opaque boundary prevents
    // small height errors from producing an artificial early ground crossing.
    var solveTolerance = groundEndpoint ? Math.min(tolerance,1e-10) : tolerance;

    var directionAngle = Math.atan2(target[1] - observerHeight, target[0]);
    var setup = {geometry:geometry,radius:radius,profile:profile};
    var advance = rt.prepareStepper(setup,true);
    var xGoal = target[0], zGoal = target[1];
    var maxPath = 6 * Math.hypot(xGoal, zGoal - observerHeight) + 4 * step;
    var evaluations = 0,shootRK4Calls=0;

    function shoot(angle) {
      evaluations++;
      if (Math.abs(angle) >= HALF_PI - 0.001) return null;
      var state = [0,observerHeight,Math.cos(angle),Math.sin(angle)];
      var travelled = 0;
      try {
        for (var i = 0; i < maxSteps && travelled < maxPath; i++) {
          var delta = Math.min(step, maxPath - travelled);
          shootRK4Calls++;
          var next = advance(state,delta);
          // Only the first, forward-x branch is part of this API's contract.
          if (!(next[0] > state[0])) return null;
          if (next[0] >= xGoal) {
            // RK4 endpoint correction: dx/ds is the ray's positive horizontal
            // direction. Secant initialization followed by safeguarded Newton
            // avoids dozens of half-step RK4 solves per shot.
            var lo=0,hi=delta;
            var t=delta*(xGoal-state[0])/(next[0]-state[0]);
            var endpoint=next;
            for(var j=0;j<12;j++) {
              shootRK4Calls++;
              endpoint=advance(state,t);
              var difference=endpoint[0]-xGoal;
              if(Math.abs(difference)<=Math.max(1e-9,xGoal*1e-14))break;
              if(difference>0)hi=t;else lo=t;
              var corrected=t-difference/endpoint[2];
              t=(Number.isFinite(corrected)&&corrected>lo&&corrected<hi)?corrected:(lo+hi)/2;
            }
            if(Math.abs(endpoint[0]-xGoal)>Math.max(1e-8,xGoal*1e-12))return null;
            return {angle:angle,residual:endpoint[1]-zGoal,
              state:endpoint,pathLength:travelled+t};
          }
          state=next; travelled+=delta;
        }
      } catch (error) {
        // An RK4 integration failure is not a physical proof of occlusion.
        return null;
      }
      return null;
    }

    function failed(reason) {
      return {status:'solver_failed',angle:null,ray:null,target:target.slice(),
        residual:null,evaluations:evaluations,shootRK4Calls:shootRK4Calls,reason:reason,
        scope:'Only a forward-x single shooting branch was searched; no global multipath guarantee'};
    }

    // Vacuum admits a unique analytic shooting angle. The ground-contact
    // query is still evaluated by the same finite-ray event detector below.
    var vacuum = options.profile === undefined && (options.atmosphere === 'vacuum');
    var best = vacuum ? {
      angle:directionAngle,residual:0,
      pathLength:Math.hypot(xGoal,zGoal-observerHeight),
      state:[xGoal,zGoal,Math.cos(directionAngle),Math.sin(directionAngle)]
    } : shoot(directionAngle);
    if (!best) return failed('The initial ray did not reach the target x coordinate');
    if (!vacuum && Math.abs(best.residual) > solveTolerance) {
      var atStart=best, span=initialSpan, lower, upper;
      var sign = atStart.residual > 0 ? -1 : 1;
      while (span <= maxSpan * (1 + 1e-12)) {
        var candidateAngle = directionAngle + sign * span;
        var candidate = shoot(candidateAngle);
        if (candidate && Math.sign(candidate.residual) !== Math.sign(atStart.residual)) {
          lower = sign < 0 ? candidate : atStart;
          upper = sign < 0 ? atStart : candidate;
          break;
        }
        if (!candidate) return failed('Shooting bracket left the forward-x integration domain');
        if (span === maxSpan) break;
        span = Math.min(maxSpan,span * 2);
      }
      if (!lower) return failed('No sign-changing angular bracket was found');
      best = null;
      // Regula falsi is particularly effective for smooth, weakly bent
      // stratified rays. Keep the bracket throughout; bisect if a proposed
      // angle repeatedly crowds its edge (nonlinear/near-grazing cases).
      var stuck=0,previousSide=0;
      for (var k = 0; k < maxIterations; k++) {
        var width=upper.angle-lower.angle;
        var candidate=(lower.angle*upper.residual-upper.angle*lower.residual)/
          (upper.residual-lower.residual);
        if (!Number.isFinite(candidate)||candidate<=lower.angle||candidate>=upper.angle||stuck>=5)
          candidate=(lower.angle+upper.angle)/2;
        var middle=shoot(candidate);
        if (!middle) return failed('Integration failed inside the angular bracket');
        if (Math.abs(middle.residual) <= solveTolerance) { best=middle; break; }
        var side=Math.sign(middle.residual)===Math.sign(lower.residual)?-1:1;
        if(side<0)lower=middle;else upper=middle;
        stuck=(side===previousSide&&Math.abs(upper.angle-lower.angle)>0.8*width)?stuck+1:0;
        previousSide=side;
      }
      if (!best) return failed('Shooting did not meet the requested target tolerance');
    }

    // The geometric path length, not horizontal range, is the finite-ray
    // endpoint. In particular, contact *at* the target is not prior occlusion.
    var ray;
    try {
      ray=rt.trace({geometry:geometry,radius:radius,profile:profile,
        observerHeight:observerHeight,angle:best.angle,length:best.pathLength,
        step:step,eventSubsteps:eventSubsteps,contactTolerance:contactTolerance});
    } catch (error) {
      return failed('Ground-event verification failed: '+error.message);
    }
    var prior = ray.hitGround && ray.travelled < best.pathLength - 1e-6;
    var status = prior ? (ray.event.contact === 'grazing' ? 'indeterminate' : 'blocked') : 'visible';
    // A ground-level endpoint or near-tangent target can have a tiny crossing
    // distance because residual height is finite. Do not present that as a
    // proved blockage if the event is within the shooting error envelope.
    if (prior && groundEndpoint &&
        best.pathLength-ray.travelled <= Math.sqrt(2 * Math.max(radius,1000) * (Math.abs(best.residual)+solveTolerance))) {
      // An ordinary descending contact at the endpoint is visible. A nearly
      // tangent arrival remains numerically ambiguous; do not promote it.
      var nx = geometry === 'flat' ? 0 : xGoal/(radius+targetAltitude);
      var nz = geometry === 'flat' ? 1 : (zGoal+radius)/(radius+targetAltitude);
      var incomingSlope = nx*best.state[2] + nz*best.state[3];
      var safelyDescending = incomingSlope < -Math.sqrt(2 * contactTolerance / Math.max(radius,1000));
      status = ray.event.contact === 'crossing' && safelyDescending ? 'visible' : 'indeterminate';
    }
    return {status:status,angle:best.angle,residual:best.residual,
      pathLength:best.pathLength,target:target.slice(),ray:ray,evaluations:evaluations,shootRK4Calls:shootRK4Calls,
      reason:status==='indeterminate'?'Possible grazing or endpoint contact within numerical tolerance':null,
      scope:'Single forward-x shooting branch; a blocked branch does not exclude unsearched paths'};
  }

  // Reuse the atmospheric function pair for every point in one shared field.
  // The profile is immutable by convention; a new field is still constructed
  // whenever observer height, geometry or atmosphere changes.
  function preparedOptions(options){
    options=options||{};
    if(options.profile!==undefined||options.atmosphere===undefined)return Object.assign({},options);
    var prepared=Object.assign({},options,{profile:rt.atmosphere(options.atmosphere,options.profileOptions)});
    delete prepared.atmosphere;
    delete prepared.profileOptions;
    return prepared;
  }
  return {solve:solve,preparedOptions:preparedOptions};
}));
