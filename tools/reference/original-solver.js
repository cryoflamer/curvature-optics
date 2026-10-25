(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RayTracer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const R = 6_371_000;
  const N0 = 1.000293;
  const H = 8500;

  function altitude(p, geometry) {
    return geometry === 'flat' ? p.y : Math.hypot(p.x, p.y + R) - R;
  }

  function radialUp(p, geometry) {
    if (geometry === 'flat') return { x: 0, y: 1 };
    const q = { x: p.x, y: p.y + R };
    const r = Math.hypot(q.x, q.y);
    return { x: q.x / r, y: q.y / r };
  }

  function interpolateMeasured(h, points) {
    if (!Array.isArray(points) || points.length < 2) return { n: NaN, dn: NaN };
    let i = 0;
    if (h <= points[0].h) i = 0;
    else if (h >= points[points.length - 1].h) i = points.length - 2;
    else {
      let lo = 0, hi = points.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (points[mid].h <= h) lo = mid;
        else hi = mid;
      }
      i = lo;
    }
    const a = points[i], b = points[i + 1];
    const dh = b.h - a.h;
    if (!(dh > 0)) return { n: NaN, dn: NaN };
    const dn = (b.n - a.n) / dh;
    return { n: a.n + dn * (h - a.h), dn };
  }


  // Ciddor (1996) phase refractive index for moist air in the visible/near-IR.
  // Input wavelength is vacuum wavelength in nm, pressure in hPa, RH in percent,
  // and CO2 concentration in umol/mol (numerically ppm). The implementation
  // follows the equations reproduced by the NIST Engineering Metrology Toolbox.
  function saturationVaporPressureCiddor(tempC) {
    const T = tempC + 273.15;
    if (!(T > 0)) return NaN;
    return Math.exp(1.2378847e-5*T*T - 1.9121316e-2*T + 33.93711047 - 6343.1645/T);
  }

  function airCompressibilityCiddor(tempC, pressurePa, xv) {
    const T = tempC + 273.15;
    const a0=1.58123e-6, a1=-2.9331e-8, a2=1.1043e-10;
    const b0=5.707e-6, b1=-2.051e-8;
    const c0=1.9898e-4, c1=-2.376e-6;
    const d=1.83e-11, e=-0.765e-8;
    return 1 - (pressurePa/T)*(a0+a1*tempC+a2*tempC*tempC+(b0+b1*tempC)*xv+(c0+c1*tempC)*xv*xv)
      + (pressurePa/T)**2*(d+e*xv*xv);
  }

  function ciddorIndex(wavelengthNm, tempC, pressureHpa, relativeHumidity=0, co2Ppm=450) {
    if (!(wavelengthNm >= 300 && wavelengthNm <= 1700)) return NaN;
    if (!(tempC >= -40 && tempC <= 100)) return NaN;
    if (!(pressureHpa >= 100 && pressureHpa <= 1400)) return NaN;
    if (!(relativeHumidity >= 0 && relativeHumidity <= 100)) return NaN;
    if (!(co2Ppm >= 0 && co2Ppm <= 2000)) return NaN;

    const lambdaUm=wavelengthNm/1000;
    const sigma=1/lambdaUm;
    const sigma2=sigma*sigma;
    const nas=1+(5792105/(238.0185-sigma2)+167917/(57.362-sigma2))*1e-8;
    const nws=1+1.022*(295.235+2.6422*sigma2-0.03238*sigma2*sigma2+0.004028*sigma2*sigma2*sigma2)*1e-8;
    const nasxMinus1=(nas-1)*(1+0.534e-6*(co2Ppm-450));

    const p=pressureHpa*100;
    const T=tempC+273.15;
    const psv=saturationVaporPressureCiddor(tempC);
    const enhancement=1.00062+3.14e-8*p+5.6e-7*tempC*tempC;
    const xv=(relativeHumidity/100)*enhancement*psv/p;

    const Ma=1e-3*(28.9635+12.011e-6*(co2Ppm-400));
    const Mv=0.018015;
    const gasR=8.314510;
    const z=airCompressibilityCiddor(tempC,p,xv);
    const rhoA=p*Ma*(1-xv)/(z*gasR*T);
    const rhoV=p*Mv*xv/(z*gasR*T);

    const zAxs=airCompressibilityCiddor(15,101325,0);
    const rhoAxs=101325*Ma/(zAxs*gasR*288.15);
    const zVs=airCompressibilityCiddor(20,1333,1);
    const rhoVs=1333*Mv/(zVs*gasR*293.15);

    return 1+(rhoA/rhoAxs)*nasxMinus1+(rhoV/rhoVs)*(nws-1);
  }

  function densityScaledIndex(tempC, pressureHpa, nRef = N0) {
    const Tref = 288.15;
    const Pref = 1013.25;
    const T = tempC + 273.15;
    if (!(T > 0) || !(pressureHpa > 0)) return NaN;
    return 1 + (nRef - 1) * (pressureHpa / Pref) * (Tref / T);
  }

  function nAndDn(h, profile, custom = {}) {
    if (profile === 'vacuum') return { n: 1, dn: 0 };
    if (profile === 'standard') {
      const e = Math.exp(-Math.max(h, -100) / H);
      return { n: 1 + (N0 - 1) * e, dn: -(N0 - 1) * e / H };
    }
    if (profile === 'custom-linear') {
      const n0 = Number.isFinite(custom.n0) ? custom.n0 : N0;
      const gradient = Number.isFinite(custom.gradient) ? custom.gradient : 0;
      return { n: n0 + gradient * h, dn: gradient };
    }
    if (profile === 'custom-exponential') {
      const n0 = Number.isFinite(custom.n0) ? custom.n0 : N0;
      const scale = Number.isFinite(custom.scale) && Math.abs(custom.scale) > 1 ? custom.scale : R;
      const n = n0 * Math.exp(h / scale);
      return { n, dn: n / scale };
    }
    if (profile === 'measured') {
      const nd = interpolateMeasured(h, custom.measuredPoints);
      if (Number.isFinite(nd.n) && Number.isFinite(nd.dn) && nd.n > 0) return nd;
      return { n: 1, dn: 0 };
    }
    const n = N0 * Math.exp(h / R);
    return { n, dn: n / R };
  }

  function deriv(z, s) {
    const p = { x: z.x, y: z.y };
    const up = radialUp(p, s.geometry);
    const nd = nAndDn(altitude(p, s.geometry), s.profile, s.customProfile);
    const dot = z.tx * up.x + z.ty * up.y;
    return {
      x: z.tx,
      y: z.ty,
      tx: (nd.dn / nd.n) * (up.x - z.tx * dot),
      ty: (nd.dn / nd.n) * (up.y - z.ty * dot)
    };
  }

  function add(z, k, a) {
    return { x: z.x + a * k.x, y: z.y + a * k.y, tx: z.tx + a * k.tx, ty: z.ty + a * k.ty };
  }

  function rk4(z, ds, s) {
    const k1 = deriv(z, s);
    const k2 = deriv(add(z, k1, ds / 2), s);
    const k3 = deriv(add(z, k2, ds / 2), s);
    const k4 = deriv(add(z, k3, ds), s);
    const q = {
      x: z.x + ds * (k1.x + 2 * k2.x + 2 * k3.x + k4.x) / 6,
      y: z.y + ds * (k1.y + 2 * k2.y + 2 * k3.y + k4.y) / 6,
      tx: z.tx + ds * (k1.tx + 2 * k2.tx + 2 * k3.tx + k4.tx) / 6,
      ty: z.ty + ds * (k1.ty + 2 * k2.ty + 2 * k3.ty + k4.ty) / 6
    };
    const m = Math.hypot(q.tx, q.ty);
    q.tx /= m;
    q.ty /= m;
    return q;
  }

  function observer(s) { return { x: 0, y: s.ho }; }

  function traceAngle(s, angle, store = false) {
    const o = observer(s);
    const ds = Math.max(5, Math.min(100, s.L / 700));
    let z = { x: o.x, y: o.y, tx: Math.cos(angle), ty: Math.sin(angle) };
    const pts = store ? [{ x: z.x, y: z.y }] : null;
    let prev = z;
    const targetAngle = s.geometry === 'sphere' ? s.L / R : null;

    for (let i = 0; i < 2500; i++) {
      const q = rk4(z, ds, s);
      if (altitude(q, s.geometry) <= 0) {
        if (store) pts.push({ x: q.x, y: q.y });
        return { hitSurface: true, pts, z: q };
      }
      if (store && i % 3 === 0) pts.push({ x: q.x, y: q.y });
      if (s.geometry === 'flat') {
        if (prev.x <= s.L && q.x >= s.L) {
          const u = (s.L - prev.x) / (q.x - prev.x);
          return { hitSurface: false, pts, targetH: prev.y + u * (q.y - prev.y), z: q };
        }
      } else {
        const ap = Math.atan2(prev.x, prev.y + R);
        const aq = Math.atan2(q.x, q.y + R);
        if (ap <= targetAngle && aq >= targetAngle) {
          const u = (targetAngle - ap) / (aq - ap);
          const x = prev.x + u * (q.x - prev.x);
          const y = prev.y + u * (q.y - prev.y);
          return { hitSurface: false, pts, targetH: Math.hypot(x, y + R) - R, z: q };
        }
      }
      if (q.x > s.L * 1.25 + 1000) break;
      prev = q;
      z = q;
    }
    return { hitSurface: false, pts, targetH: NaN, z };
  }


  function alongDistance(p, geometry) {
    return geometry === 'flat' ? p.x : R * Math.atan2(p.x, p.y + R);
  }

  // Return a handful of surface-hitting rays for diagnostic rendering when
  // no target sample is visible. These are found from the same forward solver
  // as the visibility calculation; no horizon or grazing formula is used.
  function findBlockedDiagnosticRays(s, count = 5) {
    const targetMid = s.ht * 0.5;
    const center = (targetMid - s.ho) / Math.max(s.L, 1);
    const span = Math.max(0.02, s.fov * 2, Math.abs(center) * 3 + 0.005);
    const scanned = [];
    const N = 480;

    for (let i = 0; i <= N; i++) {
      const angle = center - span + (2 * span * i / N);
      const ray = traceAngle(s, angle, false);
      if (!ray.hitSurface) continue;
      const impact = alongDistance(ray.z, s.geometry);
      if (!Number.isFinite(impact) || impact <= 0) continue;
      scanned.push({ angle, impact });
    }

    if (!scanned.length) return [];
    scanned.sort((a, b) => a.impact - b.impact);

    // Choose rays across the upper part of the impact-distance range so the
    // dashed diagnostics remain visible on a plot scaled to the target range,
    // while still showing that several launch directions are blocked.
    const fractions = count <= 1
      ? [1]
      : Array.from({ length: count }, (_, i) => 0.35 + 0.65 * i / (count - 1));
    const chosen = [];
    const used = new Set();
    for (const f of fractions) {
      const idx = Math.min(scanned.length - 1, Math.round(f * (scanned.length - 1)));
      if (used.has(idx)) continue;
      used.add(idx);
      const q = scanned[idx];
      const ray = traceAngle(s, q.angle, true);
      if (ray.hitSurface) chosen.push({ ray, angle: q.angle, impact: q.impact });
    }
    return chosen;
  }

  function shootForHeight(s, h) {
    const center = (h - s.ho) / Math.max(s.L, 1);
    const span = Math.max(0.02, s.fov * 2, Math.abs(center) * 3 + 0.005);
    const N = 180;
    let last = null;
    let previousSample = null;
    for (let i = 0; i <= N; i++) {
      const a = center - span + (2 * span * i / N);
      const r = traceAngle(s, a);
      const f = Number.isFinite(r.targetH) ? r.targetH - h : NaN;

      // A valid ray can occupy a very narrow angular interval immediately above
      // the surface-grazing boundary. If the coarse scan steps from a blocked
      // ray straight to a finite ray, refine that transition before looking for
      // the target-height root; otherwise the visible branch can be skipped.
      if (Number.isFinite(f) && previousSample && !previousSample.finite) {
        let lo = previousSample.a;
        let hi = a;
        let boundary = null;
        for (let k = 0; k < 32; k++) {
          const mid = (lo + hi) / 2;
          const rm = traceAngle(s, mid);
          if (Number.isFinite(rm.targetH)) { hi = mid; boundary = rm; }
          else lo = mid;
        }
        if (boundary && Number.isFinite(boundary.targetH)) {
          last = { a: hi, f: boundary.targetH - h };
        }
      }

      if (Number.isFinite(f) && last && f * last.f <= 0) {
        let lo = last.a;
        let hi = a;
        let flo = last.f;
        for (let k = 0; k < 34; k++) {
          const mid = (lo + hi) / 2;
          const rm = traceAngle(s, mid);
          const fm = Number.isFinite(rm.targetH) ? rm.targetH - h : NaN;
          if (!Number.isFinite(fm)) { lo = mid; continue; }
          if (flo * fm <= 0) hi = mid;
          else { lo = mid; flo = fm; }
        }
        const angle = (lo + hi) / 2;
        const rr = traceAngle(s, angle, true);
        if (!rr.hitSurface && Math.abs(rr.targetH - h) < 0.08) return { visible: true, angle, ray: rr };
      }
      if (Number.isFinite(f)) last = { a, f };
      previousSample = { a, finite: Number.isFinite(f) };
    }
    return { visible: false };
  }

  function integratePath(s, initial, maxArcLength, ds) {
    const points = [{ ...initial }];
    let z = { ...initial };
    const steps = Math.ceil(maxArcLength / ds);
    for (let i = 0; i < steps; i++) {
      z = rk4(z, Math.min(ds, maxArcLength - i * ds), s);
      points.push({ ...z });
    }
    return points;
  }

  return { R, N0, H, altitude, radialUp, interpolateMeasured, saturationVaporPressureCiddor, airCompressibilityCiddor, ciddorIndex, densityScaledIndex, nAndDn, deriv, rk4, observer, traceAngle, alongDistance, findBlockedDiagnosticRays, shootForHeight, integratePath };
});
