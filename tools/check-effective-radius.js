#!/usr/bin/env node
'use strict';
// Independent paraxial, constant-gradient approximation; not an exact oracle.
const diag = require('../src/optics/OpticalTowerDiagnostics');
const R = 6371000, observerHeight = 15;
function effectiveRadius(N, H) {
  const e = Math.exp(-observerHeight / H);
  const n = 1 + N * e;
  const dn = -N * e / H;
  return 1 / (1 / R + dn / n);
}
function tangentHeight(radius, distance) {
  const observerArc = Math.acos(radius / (radius + observerHeight));
  const targetArc = distance / radius - observerArc;
  return targetArc <= 0 ? 0 : radius * (1 / Math.cos(targetArc) - 1);
}
function numericalBoundary(distance, N, H) {
  const base = { geometry:'globe', atmosphere:'standard', observerHeight, radius:R,
    distance, atmosphereOptions:{refractivity:N, scaleHeight:H}, step:10 };
  const visible = h => diag.solveAngle({...base,targetHeight:h}).status === 'visible';
  let lo=0.1, hi=100;
  if (visible(lo) || !visible(hi)) throw Error('Cannot bracket visibility boundary');
  for(let i=0;i<17;i++) {const mid=(lo+hi)/2; if(visible(mid))hi=mid;else lo=mid;}
  return (lo+hi)/2;
}
let failures=0;
console.log('EFFECTIVE-RADIUS APPROXIMATION (observer 15m, globe; heights in m)');
console.log('distance N0 H R_eff(km) numeric(m) approximation(m) delta(m)');
for (const distance of [20000,25000]) {
  let previous=Infinity;
  for(const N of [0,0.00015,0.000293,0.00045]) {
    const H=8500;
    try {
      const numeric = numericalBoundary(distance,N,H);
      const reff=effectiveRadius(N,H);
      const approx=tangentHeight(reff,distance);
      const delta=numeric-approx;
      console.log(`${distance} ${N.toFixed(6)} ${H} ${(reff/1000).toFixed(2)} ${numeric.toFixed(3)} ${approx.toFixed(3)} ${delta.toFixed(3)}`);
      // This is a qualitative approximation: stronger negative dn/dh should
      // lower the limiting target height for these non-ducting profiles.
      if (!(numeric < previous)) {failures++;console.error('FAIL non-monotonic refractivity response');}
      previous=numeric;
      if (N===0 && Math.abs(delta)>0.1) {failures++;console.error('FAIL vacuum analytic limit');}
      // 1 m is a deliberately broad sanity tolerance, not a precision bound.
      if(Math.abs(delta)>1) {failures++;console.error('FAIL effective-radius approximation exceeds 1m');}
    } catch(e) {failures++;console.error('FAIL',distance,N,e.message);}
  }
}
console.log(`${failures} failures`);
process.exitCode=failures?1:0;
