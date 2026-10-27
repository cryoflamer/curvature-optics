#!/usr/bin/env node
'use strict';
/* Diagnostic only: test whether the horizon bias tracks the ground-clearance
 * allowance. Does not change the application's default (0.03 m).
 */
const diag = require('../src/optics/OpticalTowerDiagnostics');
const R = 6371000;
const observerHeight = 15;
const tolerances = [0.1, 0.05, 0.03, 0.01, 0.001, 0];
const steps = [10, 5];
function analyticHeight(distance) {
  const a = distance / R - Math.acos(R / (R + observerHeight));
  return a <= 0 ? 0 : R * (1 / Math.cos(a) - 1);
}
function boundary(distance, tolerance, step) {
  const common = {geometry:'globe', atmosphere:'vacuum', observerHeight,
    radius:R, distance, step, clearanceTolerance:tolerance};
  const visible = height => diag.solveAngle({...common,targetHeight:height}).status === 'visible';
  let lo = 0, hi = 100;
  if (visible(lo) || !visible(hi)) throw Error('Cannot bracket horizon');
  for (let i=0;i<23;i++) {
    const mid = (lo+hi)/2;
    if (visible(mid)) hi=mid; else lo=mid;
  }
  return (lo+hi)/2;
}
let failures=0;
console.log('VACUUM HORIZON vs GROUND-CLEARANCE TOLERANCE (observer 15 m)');
console.log('distance(m) tolerance(m) step(m) numeric(m) analytic(m) bias(cm)');
for (const distance of [20000,25000]) {
  const exact=analyticHeight(distance);
  for (const step of steps) {
    let previous=-Infinity;
    for (const tolerance of tolerances) {
      try {
        const numeric=boundary(distance,tolerance,step);
        const bias=numeric-exact;
        console.log(`${distance} ${tolerance.toFixed(3)} ${step} ${numeric.toFixed(5)} ${exact.toFixed(5)} ${(bias*100).toFixed(3)}`);
        // Relaxing the ground clearance must not make the horizon higher.
        if (numeric+0.00003 < previous) {
          failures++;console.error('FAIL nonmonotonic tolerance response');
        }
        previous=numeric;
        if (Math.abs(bias)>0.25) {
          failures++;console.error('FAIL vacuum horizon differs by >25 cm');
        }
      } catch(e) { failures++;console.error('FAIL',distance,tolerance,step,e.message); }
    }
  }
}
console.log(`${failures} failures`);
process.exitCode=failures?1:0;
