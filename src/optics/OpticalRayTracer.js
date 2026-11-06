/* Independent 2D geometrical-optics integrator. No changes to the legacy renderer.
 * x is horizontal, z is height above the observer's tangent plane.
 * For a globe the centre is (0,-radius); for flat Earth h=z.
 * Angles are radians, distances are metres.
 */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports
    ? require('../geometry/CurvatureSurfaceGeometry') : root.CurvatureSurfaceGeometry);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureRayTracer = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (surfaces) {
  'use strict';
  var DEFAULT_RADIUS = 6371000;
  // Private marker: an arbitrary caller-supplied n(h),dn(h) profile must never
  // accidentally opt into the standard-exponential kernel by naming a field.
  var EXPERIMENTAL_STANDARD = Symbol('experimental standard RK4');
  // Internal factory markers: never trust external custom-profile properties.
  var PREPARED_INVERSE = Symbol('prepared inverse temperature gradient');
  var HYDRO_SAMPLE = Symbol('single-pass hydrostatic sample');
  if (!surfaces) throw Error('Continuous-curvature surface geometry dependency required');

  function atmosphere(kind, options) {
    options = options || {};
    if (kind === 'vacuum') return { n: function () { return 1; }, dn: function () { return 0; } };
    if (kind === 'temperature-lapse') {
      // Dry-air hydrostatic boundary-layer model. Inputs describe local air at
      // h=0 and the *surface* dT/dh; the lapse relaxes as exp(-h/1000 m).
      // This avoids an unphysical negative Kelvin temperature when tracing
      // to high altitude. It is not an all-altitude or humidity model.
      var tC = options.temperatureC === undefined ? 15 : options.temperatureC;
      var p0 = options.pressureHpa === undefined ? 1013.25 : options.pressureHpa;
      var gKm = options.gradientKPerKm === undefined ? -6.5 : options.gradientKPerKm;
      if (!Number.isFinite(tC) || tC < -30 || tC > 40 ||
          !Number.isFinite(p0) || p0 < 800 || p0 > 1100 ||
          !Number.isFinite(gKm) || gKm < -20 || gKm > 20)
        throw RangeError('Invalid temperature-lapse atmosphere');
      var T0=tC+273.15,L=gKm/1000,layer=1000,B=L*layer,Tinf=T0+B;
      var gravOverR=9.80665/287.05;
      var refr0=0.000293*(p0/1013.25)*(288.15/T0);
      function sample(height){
        // RK4 can evaluate below ground before its first-hit event is refined.
        // Extrapolation below -1 km has no atmospheric interpretation.
        var h=Math.max(-1000,height),T,derivative,integral;
        if(h<0){
          T=T0+L*h;derivative=L;
          integral=L===0?h/T0:Math.log(T/T0)/L;
        } else {
          var e=Math.exp(-h/layer);
          T=Tinf-B*e;derivative=L*e;
          integral=(h+layer*Math.log(T/T0))/Tinf;
        }
        var refr=refr0*Math.exp(-gravOverR*integral)*T0/T;
        return {temperatureC:T-273.15,n:1+refr,
          dn:-refr*(gravOverR+derivative)/T};
      }
      return {
        n:function(h){return sample(h).n;},
        dn:function(h){return sample(h).dn;},
        temperatureCAt:function(h){return sample(h).temperatureC;},
        [HYDRO_SAMPLE]:sample
      };
    }
    if (kind === 'inverse-temperature') {
      // Inverse of dry hydrostatic + ideal-gas refractivity for N=n-1:
      // (N*T)' = -g/Rd * N, so T(h)=[T0*N0 - g/Rd*integral(N,0,h)]/N(h).
      // N(0)=N0>0 is indispensable: the legacy engineered n(0)=1 cannot
      // represent any finite-pressure, finite-temperature dry atmosphere.
      // Multiplying the engineered exponential by (1+N0) keeps dn/n, hence
      // every geometric-optics ray, exactly unchanged.
      var inverse=options.inverseProfile||{source:'temperature-lapse',weight:0};
      if(!inverse||typeof inverse!=='object'||Array.isArray(inverse)||
          Object.keys(inverse).some(function(k){return k!=='source'&&k!=='weight';})||
          !['standard','temperature-lapse'].includes(inverse.source)||
          typeof inverse.weight!=='number'||!Number.isFinite(inverse.weight)||
          inverse.weight<0||inverse.weight>1)
        throw RangeError('Invalid inverse-temperature configuration');
      var surface=options.temperatureProfile||{};
      var hydro=atmosphere('temperature-lapse',surface); // shared parameter validation
      var T0=(surface.temperatureC===undefined?15:surface.temperatureC)+273.15;
      var pressure=surface.pressureHpa===undefined?1013.25:surface.pressureHpa;
      var N0=0.000293*(pressure/1013.25)*(288.15/T0);
      var a=9.80665/287.05,H=7350,R=options.occlusionRadius;
      if(!Number.isFinite(R)||R<=0)throw RangeError('Inverse target requires positive occlusionRadius');
      var w=inverse.weight,oneMinus=1-w,n0=1+N0;
      function base(h){
        if(inverse.source==='temperature-lapse'){
          var N=hydro.n(h)-1,T=hydro.temperatureCAt(h)+273.15;
          return {N:N,dN:hydro.dn(h),J:(N0*T0-N*T)/a};
        }
        var N=N0*Math.exp(-h/H);
        return {N:N,dN:-N/H,J:-N0*H*Math.expm1(-h/H)};
      }
      function sample(h){
        var start=base(h),x=h/R,e=Math.exp(x);
        var targetN=n0*e-1,targetD=n0*e/R;
        // The small-h compensated form avoids subtracting two close O(h)
        // terms in the integrated engineered refractivity.
        var targetJ=N0*h+n0*R*(Math.expm1(x)-x);
        var N=oneMinus*start.N+w*targetN;
        var dN=oneMinus*start.dN+w*targetD;
        var J=oneMinus*start.J+w*targetJ;
        return {N:N,dN:dN,n:1+N,kelvin:N>0?(T0*N0-a*J)/N:NaN};
      }
      function positiveTemperature(h){var r=sample(h);return Number.isFinite(r.kelvin)&&r.kelvin>0;}
      // The optical n(h) is continued formally beyond this point, but the
      // inverse thermodynamic interpretation is NOT. Never silently clamp T.
      var limit=Infinity;
      // Pure hydrostatic baseline remains T>0 indefinitely in this boundary
      // layer. The standard baseline has an exact all-altitude inverse.
      if(w===0 && inverse.source==='standard' && T0<a*H){
        limit=-H*Math.log1p(-T0/(a*H));
      }else if(w>0 && !positiveTemperature(2e7)){
        var low=0,high=1000;
        while(high<2e7&&positiveTemperature(high)){low=high;high*=2;}
        high=Math.min(high,2e7);
        for(var step=0;step<55;step++){
          var mid=(low+high)/2;
          if(positiveTemperature(mid))low=mid;else high=mid;
        }
        limit=(low+high)/2;
      }
      // Shooting and ground verification need ONLY d(log n)/dh. Computing
      // the inverse-temperature integral J and the Kelvin interpretation on
      // every one of millions of RK4 stages is unnecessary. This prepared,
      // factory-owned kernel evaluates the same n/dn pair in one pass.
      // The exact engineered endpoint has d(log n)/dh=1/R everywhere.
      function opticalGradient(h){
        if(w===1)return 1/R;
        var N,dN;
        if(inverse.source==='temperature-lapse'){
          var measured=hydro[HYDRO_SAMPLE](h);
          N=measured.n-1;dN=measured.dn;
        }else{
          var decay=Math.exp(-h/H);
          N=N0*decay;dN=-N/H;
        }
        var n=1+N,dn=dN;
        if(w!==0){
          var growth=n0*Math.exp(h/R);
          n=1+oneMinus*N+w*(growth-1);
          dn=oneMinus*dN+w*growth/R;
        }
        if(!(n>0)||!Number.isFinite(n)||!Number.isFinite(dn))
          throw Error('Invalid refractive index');
        return dn/n;
      }
      var result={
        n:function(h){return sample(h).n;},
        dn:function(h){return sample(h).dN;},
        temperatureCAt:function(h){var r=sample(h);return h>=limit||!(r.kelvin>0)?NaN:r.kelvin-273.15;},
        gradientKPerKmAt:function(h){var r=sample(h);return h>=limit||!(r.kelvin>0)?NaN:
          1000*(-a-r.kelvin*r.dN/r.N);},
        validUntilMetres:limit,
        surfaceGradientKPerKm:1000*(-a-T0*sample(0).dN/N0),
        initialGradientKPerKm:1000*(-a-T0*base(0).dN/N0),
        targetGradientKPerKm:1000*(-a-T0*n0/(R*N0)),
        surfaceRefractivity:N0
      };
      if(options.experimentalFusedGradient===true){
        result[PREPARED_INVERSE]=true;
        result.fusedGradient=opticalGradient;
      }
      return result;
    }
    if (kind === 'profile-transition') {
      // Exploratory mathematical interpolation, NOT a hydrostatic atmospheric
      // evolution. Both endpoints and their derivatives are the original
      // forward tracer profiles. A temperature gradient only affects rays when
      // the selected source is temperature-lapse and weight < 1.
      var transition=options.transitionProfile||{source:'standard',weight:0};
      if(!transition||typeof transition!=='object'||Array.isArray(transition)||
          Object.keys(transition).some(function(k){return k!=='source'&&k!=='weight';})||
          !['standard','temperature-lapse'].includes(transition.source)||
          typeof transition.weight!=='number'||!Number.isFinite(transition.weight)||
          transition.weight<0||transition.weight>1)
        throw RangeError('Invalid atmospheric profile transition');
      var start=atmosphere(transition.source,options.temperatureProfile);
      var end=atmosphere('exponential-occlusion',{occlusionRadius:options.occlusionRadius});
      var a=1-transition.weight,b=transition.weight;
      var result={
        n:function(h){return a*start.n(h)+b*end.n(h);},
        dn:function(h){return a*start.dn(h)+b*end.dn(h);}
      };
      if(transition.source==='temperature-lapse')result.temperatureCAt=start.temperatureCAt;
      return result;
    }
    if (kind === 'standard') {
      // Exponential refractivity, representative near-surface standard profile.
      // Not a full meteorological model; both constants are configurable.
      var N0 = options.refractivity === undefined ? 0.000293 : options.refractivity;
      var H = options.scaleHeight === undefined ? 7350 : options.scaleHeight;
      if (!(H > 0) || !(N0 >= 0) || !Number.isFinite(H) || !Number.isFinite(N0))
        throw Error('Invalid atmospheric constants');
      var standard = {
        n: function (h) { return 1 + N0 * Math.exp(-h / H); },
        dn: function (h) { return -N0 * Math.exp(-h / H) / H; },
        // Conservative upper bound on |d(n)/dh / n| for altitudes >= h.
        // Used only to prove a whole RK4 segment remains above the ground;
        // arbitrary user profiles have no such shortcut.
        rayCurvatureUpperBound: function (lowestHeight) {
          return N0 * Math.exp(-lowestHeight / H) / H;
        }
      };
      // #140.12.48: experimental, opt-in common-subexpression elimination.
      // Preserve the exact original n(), dn(), validation and dn/n arithmetic.
      // Custom profiles and the default standard profile retain the old path.
      if (options.experimentalFusedGradient === true) {
        standard[EXPERIMENTAL_STANDARD]=true;
        standard.scalarRK4=options.experimentalScalarRK4 === true;
        standard.fusedGradient = function(h) {
          var e=Math.exp(-h/H),n=1+N0*e,dn=-N0*e/H;
          if(!(n>0)||!Number.isFinite(n)||!Number.isFinite(dn))
            throw Error('Invalid refractive index');
          return dn/n;
        };
      }
      return standard;
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

  // The explicit curvature is authoritative. Legacy geometry/radius options
  // remain accepted so existing UI and physical-scene callers do not change.
  // When curvature is present a contradictory geometry tag is an error, not a
  // silent second model. Atmospheric occlusionRadius is entirely independent.
  // Migration comparison only: reproduce #123's arithmetic byte-for-byte
  // at a finite radius. New and ordinary requests use the stable kernel.
  // This switch is deliberately explicit and scoped to the optical call;
  // it is NOT another physical geometry or a UI option.
  function legacySurface(k,radius){
    var flat=k===0;
    function height2(x,z){return flat?z:Math.hypot(x,z+radius)-radius;}
    function normal2(x,z){
      if(flat)return [0,1];
      var d=Math.hypot(x,z+radius);
      return [x/d,(z+radius)/d];
    }
    function metric2(x,z){
      if(flat)return [z,0,1];
      var d=Math.hypot(x,z+radius);
      return [Math.hypot(x,z+radius)-radius,x/d,(z+radius)/d];
    }
    return {flat:flat,curvature:k,legacy:true,radius:radius,height2:height2,
      normal2:normal2,metric2:metric2};
  }
  // Used at the boundary of tracing/shooting; derivative stages receive one
  // prepared surface object rather than rebuilding it at every RK4 substep.
  function resolveGeometry(options) {
    options=options||{};
    var explicit=Object.prototype.hasOwnProperty.call(options,'curvature');
    var k=explicit?options.curvature:null;
    if(explicit && (typeof k!=='number'||!Number.isFinite(k)||k<0))
      throw Error('Invalid surface curvature');
    var geometry=options.geometry===undefined?
      (explicit&&k===0?'flat':'globe'):options.geometry;
    if(geometry!=='flat'&&geometry!=='globe')throw Error('Unknown geometry');
    if(explicit && (geometry==='flat')!==(k===0))
      throw Error('Surface curvature contradicts geometry');
    var arithmetic=options.surfaceArithmetic===undefined?'stable':options.surfaceArithmetic;
    if(arithmetic!=='stable'&&arithmetic!=='legacy')throw Error('Invalid surface arithmetic');
    var radius=options.radius===undefined?DEFAULT_RADIUS:options.radius;
    if(!(radius>0)||!Number.isFinite(radius))throw Error('Invalid ray radius');
    if(!explicit)k=geometry==='flat'?0:surfaces.curvatureFromRadius(radius);
    if(arithmetic==='legacy' && explicit && k>0 &&
        Math.abs(k*radius-1)>8*Number.EPSILON)
      throw Error('Legacy surface arithmetic requires the matching finite radius');
    return {geometry:geometry,radius:radius,curvature:k,surfaceArithmetic:arithmetic,
      surface:arithmetic==='legacy'?legacySurface(k,radius):surfaces.createFromCurvature(k)};
  }
  function height(x,z,geometry,radius) {
    return resolveGeometry({geometry:geometry,radius:radius}).surface.height2(x,z);
  }
  function derivative(s, surface, profile) {
    var metric=surface.metric2(s[0],s[1]);
    var q;
    if (profile[EXPERIMENTAL_STANDARD]||profile[PREPARED_INVERSE]) {
      q=profile.fusedGradient(metric[0]);
    } else {
      var n=profile.n(metric[0]),dn=profile.dn(metric[0]);
      if(!(n>0)||!Number.isFinite(n)||!Number.isFinite(dn))throw Error('Invalid refractive index');
      q=dn/n;
    }
    var nx=metric[1],nz=metric[2];
    var dot=s[2]*nx+s[3]*nz;
    return [s[2],s[3],q*(nx-dot*s[2]),q*(nz-dot*s[3])];
  }
  function add(s, k, dt) {
    return [s[0]+dt*k[0],s[1]+dt*k[1],s[2]+dt*k[2],s[3]+dt*k[3]];
  }
  function step(s, ds, surface, profile) {
    var a = derivative(s, surface, profile);
    var b = derivative(add(s, a, ds / 2), surface, profile);
    var c = derivative(add(s, b, ds / 2), surface, profile);
    var d = derivative(add(s, c, ds), surface, profile);
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

  // #140.12.48: optional scalar recurrence for standard atmosphere only.
  // The four RK4 derivatives and stage states have the same evaluation
  // order as step(), but no intermediate [state] or [derivative] arrays.
  // The surface still supplies its authoritative stable metric2() at each
  // stage; ray normalization, tolerance and ground events remain unchanged.
  function stepScalar(s,ds,surface,profile) {
    var half=ds/2,metric=surface.metric2(s[0],s[1]);
    var q=profile.fusedGradient(metric[0]);
    var dot=s[2]*metric[1]+s[3]*metric[2];
    var ax=s[2],az=s[3],avx=q*(metric[1]-dot*s[2]),avz=q*(metric[2]-dot*s[3]);

    var bx=s[2]+half*avx,bz=s[3]+half*avz;
    metric=surface.metric2(s[0]+half*ax,s[1]+half*az);
    q=profile.fusedGradient(metric[0]);dot=bx*metric[1]+bz*metric[2];
    var bvx=q*(metric[1]-dot*bx),bvz=q*(metric[2]-dot*bz);

    var cx=s[2]+half*bvx,cz=s[3]+half*bvz;
    metric=surface.metric2(s[0]+half*bx,s[1]+half*bz);
    q=profile.fusedGradient(metric[0]);dot=cx*metric[1]+cz*metric[2];
    var cvx=q*(metric[1]-dot*cx),cvz=q*(metric[2]-dot*cz);

    var dx=s[2]+ds*cvx,dz=s[3]+ds*cvz;
    metric=surface.metric2(s[0]+ds*cx,s[1]+ds*cz);
    q=profile.fusedGradient(metric[0]);dot=dx*metric[1]+dz*metric[2];
    var dvx=q*(metric[1]-dot*dx),dvz=q*(metric[2]-dot*dz);

    var out=[s[0]+ds*(ax+2*bx+2*cx+dx)/6,
      s[1]+ds*(az+2*bz+2*cz+dz)/6,
      s[2]+ds*(avx+2*bvx+2*cvx+dvx)/6,
      s[3]+ds*(avz+2*bvz+2*cvz+dvz)/6];
    var norm=Math.hypot(out[2],out[3]);
    if(!(norm>0)||!Number.isFinite(norm)||!Number.isFinite(out[0])||!Number.isFinite(out[1]))
      throw Error('Non-finite ray state');
    out[2]/=norm;out[3]/=norm;
    return out;
  }

  function validateSetup(options) {
    options=options||{};
    var setup=resolveGeometry(options);
    var profile=options.profile||atmosphere(options.atmosphere||'standard',options.profileOptions);
    if(!profile||typeof profile.n!=='function'||typeof profile.dn!=='function')
      throw Error('Invalid ray profile');
    setup.profile=profile;
    return setup;
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
    return step(state,ds,setup.surface,setup.profile);
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
    var advance=setup.profile[EXPERIMENTAL_STANDARD]&&setup.profile.scalarRK4?stepScalar:step;
    return function(state, distance) {
      if(!trustedSolverState&&(!Array.isArray(state)||state.length!==4||!state.every(Number.isFinite)||
          Math.abs(Math.hypot(state[2],state[3])-1)>1e-8||!Number.isFinite(distance)))
        throw Error('Invalid ray state or signed step');
      if(!Number.isFinite(distance))throw Error('Invalid ray step');
      return advance(state,distance,setup.surface,setup.profile);
    };
  }

  // A first-event search uses integrated intermediate states, not a chord
  // between the outer RK4 nodes. Sampling remains bounded: it cannot prove
  // that an arbitrary rapidly varying n(h) has no hidden events.
  var DEFAULT_EVENT_SUBSTEPS = 8;
  var DEFAULT_CONTACT_TOLERANCE = 1e-6; // metres, in h(x,z)

  function altitudeSlope(state,surface) {
    var n=surface.normal2(state[0],state[1]);
    return n[0]*state[2]+n[1]*state[3];
  }
  function sample(state, distance, surface, profile) {
    var s = distance === 0 ? state : step(state,distance,surface,profile);
    return {distance:distance,state:s,
      altitude:surface.height2(s[0],s[1]),
      slope:altitudeSlope(s,surface)};
  }
  // Precondition: there is a strictly below-ground sample at hi and an
  // above-ground (or exactly surface) sample at lo. Always choose the first
  // positive-to-negative crossing, never the far-side exit from a sphere.
  function crossing(state, lo, hi, surface, profile) {
    for (var j=0; j<60 && hi-lo>Math.max(1e-10,hi*1e-13); j++) {
      var mid=(lo+hi)/2;
      var candidate=sample(state,mid,surface,profile);
      if (candidate.altitude < 0) hi=mid;
      else lo=mid;
    }
    return sample(state,(lo+hi)/2,surface,profile);
  }
  // Find a local minimum of physical altitude inside a bracket in which
  // dh/ds changes from negative to positive (including a zero at the end).
  function minimum(state, lo, hi, surface, profile) {
    for (var j=0; j<60 && hi-lo>Math.max(1e-10,hi*1e-13); j++) {
      var mid=(lo+hi)/2;
      if (sample(state,mid,surface,profile).slope < 0) lo=mid;
      else hi=mid;
    }
    return sample(state,(lo+hi)/2,surface,profile);
  }
  function groundEvent(state, delta, surface, profile, substeps, tolerance) {
    var previous=sample(state,0,surface,profile);
    // Stable radial height can retain sub-nanometre signed roundoff at a
    // mathematically exact surface endpoint/tangency. A numerical sign alone
    // must not turn this into a first *crossing*; the grazing test below
    // retains its original (larger) contact tolerance.
    var signedRoundoff=surface.legacy?0:Math.min(1e-9,tolerance*0.001);
    // Avoid a spurious event for a ray *departing* tangentially from the
    // surface. A ray launched into the surface is an immediate impact.
    if (previous.altitude <= 0 && previous.slope < -1e-12)
      return {contact:'crossing',point:previous};
    for (var i=1; i<=substeps; i++) {
      var current=sample(state,delta*i/substeps,surface,profile);
      if (previous.altitude >= -signedRoundoff && current.altitude < -signedRoundoff) {
        return {contact:'crossing',point:crossing(state,previous.distance,
          current.distance,surface,profile)};
      }
      if (previous.slope < 0 && current.slope >= 0) {
        var lowest=minimum(state,previous.distance,current.distance,surface,profile);
        if (lowest.altitude < -tolerance) {
          // The endpoints can both be above ground. A local minimum below
          // ground still implies an entry and exit within this RK4 step.
          return {contact:'crossing',point:crossing(state,previous.distance,
            lowest.distance,surface,profile)};
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
  function chordClearance(a,b,surface) {
    if(surface.flat)return Math.min(a[1],b[1]);
    if(surface.legacy){
      var oldDx=b[0]-a[0],oldDz=b[1]-a[1],oldDen=oldDx*oldDx+oldDz*oldDz;
      var oldT=oldDen>0?-(a[0]*oldDx+(a[1]+surface.radius)*oldDz)/oldDen:0;
      oldT=Math.max(0,Math.min(1,oldT));
      return surface.height2(a[0]+oldT*oldDx,a[1]+oldT*oldDz);
    }
    var k=surface.curvature,dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz;
    // The centre is at -1/k. Scale the closest-point calculation by k
    // instead of building z+R, which loses small offsets at large R.
    var t=den>0?-(k*a[0]*dx+(1+k*a[1])*dz)/(k*den):0;
    t=Math.max(0,Math.min(1,t));
    return surface.height2(a[0]+t*dx,a[1]+t*dz);
  }

  // #140.12.48: a strictly conservative, no-RK4 clearance preflight.
  // Distance-to-ground is 1-Lipschitz along a unit-speed ray, hence the
  // altitude over the next ds cannot fall below h0-ds. For a sphere, its
  // signed radial-height second derivative is bounded below by
  // -(max |d log n/dh| + 1/r_min), and by -max |d log n/dh| on a plane.
  // Therefore h(s) >= h0+h'(0)s-C*s*s/2. The concave lower bound takes
  // its minimum at an endpoint. An uncertain segment always falls back to
  // the ORIGINAL chord/event detector, including grazing/tangencies.
  function preflightClear(state,ds,surface,curvature,profile) {
    var h=surface.height2(state[0],state[1]);
    if(!(h>0))return false;
    var lowest=h-ds;
    var bend=profile.rayCurvatureUpperBound(lowest);
    var radial=curvature>0?curvature/(1+curvature*lowest):0;
    if(!Number.isFinite(bend)||!Number.isFinite(radial)||radial<0)return false;
    var n=surface.normal2(state[0],state[1]);
    var slope=n[0]*state[2]+n[1]*state[3];
    var lower=h+Math.min(0,slope*ds)-(bend+radial)*ds*ds/2;
    // Keep a 1 mm cushion, as in the existing chord clearance proof.
    return Number.isFinite(lower)&&lower>0.001;
  }

  function trace(options) {
    options = options || {};
    var setup=validateSetup(options);
    var geometry=setup.geometry, radius=setup.radius, surface=setup.surface, profile=setup.profile;
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
    var fastGroundSkips=0,fullGroundChecks=0,preflightGroundSkips=0;
    var advance=profile[EXPERIMENTAL_STANDARD]&&profile.scalarRK4?stepScalar:step;
    var fastGround=options.fastClearGround===true &&
      typeof profile.rayCurvatureUpperBound==='function';
    for (var i = 0; i < count; i++) {
      var delta = Math.min(ds, length - travelled);
      var clearNext=null,provedClear=false;
      if(fastGround && options.stopAtGround!==false &&
          options.preflightClearGround===true &&
          preflightClear(state,delta,surface,setup.curvature,profile)) {
        // This avoids chord/ground-event probes. The actual ray state is
        // still advanced by the identical RK4 recurrence below.
        provedClear=true;
        preflightGroundSkips++;
        fastGroundSkips++;
      } else if(fastGround && options.stopAtGround!==false &&
          surface.height2(state[0],state[1])>0) {
        clearNext=advance(state,delta,surface,profile);
        var h=surface.height2(state[0],state[1]);
        var curvature=profile.rayCurvatureUpperBound(h-delta);
        // The additional factor of 2 and 1 mm cushion make the shortcut
        // more conservative than the continuous-curve chord bound. A near-
        // horizon or uncertain segment always takes the original event path.
        var margin=curvature*delta*delta/4+0.001;
        provedClear=Number.isFinite(margin) &&
          chordClearance(state,clearNext,surface)>margin;
        if(provedClear)fastGroundSkips++;
      }
      if(!provedClear && options.stopAtGround!==false)fullGroundChecks++;
      var impact=options.stopAtGround===false||provedClear?null:
        groundEvent(state,delta,surface,profile,substeps,contactTolerance);
      if (impact) {
        state=impact.point.state;
        travelled+=impact.point.distance;
        hitGround=true;
        event={kind:'ground',contact:impact.contact,pathLength:travelled,
          x:state[0],z:state[1],height:surface.height2(state[0],state[1]),
          tolerance:contactTolerance};
      } else {
        state=provedClear&&clearNext?clearNext:advance(state,delta,surface,profile);
        travelled+=delta;
      }
      if (points) points.push([state[0], state[1]]);
      if (hitGround) break;
    }
    return { x: state[0], z: state[1], angle: Math.atan2(state[3], state[2]),
      height: surface.height2(state[0], state[1]),
      hitGround: hitGround, travelled: travelled, points: points,
      termination:hitGround?'ground':(options.stopAtGround===false?'range-unchecked':'range'),
      fastGroundSkips:fastGroundSkips,fullGroundChecks:fullGroundChecks,
      preflightGroundSkips:preflightGroundSkips,event:event };
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
    var ray=trace(Object.assign({},options.curvature===undefined?{}:{curvature:options.curvature},{geometry:options.geometry,radius:options.radius,surfaceArithmetic:options.surfaceArithmetic,
      profile:atmosphere('vacuum'),observerHeight:observerHeight,
      angle:Math.atan2(target[1]-observerHeight,target[0]),length:distance,
      step:options.step===undefined?20:options.step,
      eventSubsteps:options.eventSubsteps,contactTolerance:tolerance}));
    // A surface endpoint can be seen; the terrain is blocking only if it
    // is encountered *before* the target. Grazing is tolerance-dependent,
    // so a ray that may just touch the surface is not asserted visible.
    var priorHit=ray.hitGround && ray.travelled < distance-1e-7;
    var status= !priorHit?'visible':
      ray.event.contact==='crossing'?'blocked':'indeterminate';
    return {status:status,ray:ray,target:target.slice(),
      caveat:'Vacuum straight ray only; no atmospheric shooting or 3D mesh intersection'};
  }

  return { atmosphere: atmosphere, height: height, resolveGeometry:resolveGeometry, trace: trace, advanceState: advanceState, prepareStepper:prepareStepper,
    vacuumTargetVisibility:vacuumTargetVisibility };
}));
