#!/usr/bin/env node
'use strict';
// Compare the current solver at multiple integration steps; optionally compare
// against an independently supplied adapter. No reference solver is bundled.
const path = require('path');
const diag = require('../src/optics/OpticalTowerDiagnostics');
const arcsec = 180 * 3600 / Math.PI;
const args = process.argv.slice(2);
const externalAt = args.indexOf('--reference');
const referencePath = externalAt >= 0 ? args[externalAt + 1] : path.join(__dirname, 'reference/adapter.js');
if (externalAt >= 0 && (!referencePath || referencePath.startsWith('--'))) {
  console.error('Usage: node tools/compare-raytracers.js [--reference /absolute/path/to/adapter.js]');
  process.exit(2);
}
let reference = null;
if (referencePath) {
  try { reference = require(path.resolve(referencePath)); }
  catch (err) { console.error('Cannot load reference adapter:', err.message); process.exit(2); }
  if (typeof reference.solveAngle !== 'function') {
    console.error('Reference adapter must export solveAngle(options)'); process.exit(2);
  }
}
const cases = [];
for (const distance of [3000, 6000, 12000])
  for (const targetHeight of [10, 20, 40])
    cases.push({ geometry:'globe', atmosphere:'standard', observerHeight:15,
      radius:6371000, distance, targetHeight, atmosphereOptions:{refractivity:0.000293,scaleHeight:8500} });
const threshold = 0.1; // arcsec; compare matching n(h), n0=1.000293, H=8500m
let failures = 0, maxConvergence = 0, maxReference = 0;
console.log('distance(m) height(m) step25 step10 step5 conv(arcsec)' + (reference ? ' reference(arcsec)' : ''));
function evaluate(fn, options) {
  const result = fn(options);
  if (!result || !['visible','occluded','no solution'].includes(result.status))
    throw Error('Solver must return {status:"visible|occluded|no solution", angle:number|null}');
  if (result.status === 'visible' && !Number.isFinite(result.angle))
    throw Error('Visible ray must have finite angle in radians');
  return result;
}
for (const c of cases) {
  try {
    const a = evaluate(diag.solveAngle, {...c, step:25});
    const b = evaluate(diag.solveAngle, {...c, step:10});
    const d = evaluate(diag.solveAngle, {...c, step:5});
    const convergence = b.status === d.status && b.status === 'visible'
      ? Math.abs(b.angle-d.angle)*arcsec : b.status === d.status ? 0 : Infinity;
    maxConvergence = Math.max(maxConvergence, convergence);
    if (convergence > threshold) failures++;
    let comparison = '';
    if (reference) {
      const r = evaluate(reference.solveAngle, {...c, step:5});
      const diff = r.status === d.status && d.status === 'visible'
        ? Math.abs(r.angle-d.angle)*arcsec : r.status === d.status ? 0 : Infinity;
      maxReference = Math.max(maxReference, diff);
      if (diff > threshold) failures++;
      comparison = ' ' + (Number.isFinite(diff) ? diff.toFixed(6) : 'STATUS_MISMATCH');
    }
    console.log(`${c.distance} ${c.targetHeight} ${a.status} ${b.status} ${d.status} ${Number.isFinite(convergence) ? convergence.toFixed(6) : 'STATUS_MISMATCH'}${comparison}`);
  } catch (err) { failures++; console.error(`FAIL ${c.distance}m ${c.targetHeight}m: ${err.message}`); }
}
// Horizon-focused regression: first find the current solver's visibility transition
// and then compare both solvers on either side of it. The reference solver does
// not distinguish occlusion from failure to converge, so only contradictory
// visibility is a reference status failure.
const horizonDistances = [18000, 20000, 25000, 30000];
const observerHeight = 15;
const base = { geometry: 'globe', atmosphere: 'standard', observerHeight,
  radius: 6371000, atmosphereOptions: { refractivity: 0.000293, scaleHeight: 8500 } };
console.log('\nHORIZON TEST (observer 15m; matched standard atmosphere)');
console.log('distance(m) boundary-height(m) offset(m) current reference diff(arcsec)');
let horizonFailures = 0, horizonCases = 0, horizonMaxDiff = 0;
for (const distance of horizonDistances) {
  try {
    const solve = (height, step) => evaluate(diag.solveAngle,
      { ...base, distance, targetHeight: height, step });
    // A ground-level target can be numerically ambiguous at the endpoint.
    // Search only above 0.1m and bracket an actual occluded/visible transition.
    let lo = 0.1, hi = 100;
    if (solve(lo, 10).status === 'visible' || solve(hi, 10).status !== 'visible')
      throw Error('Unable to bracket horizon transition');
    for (let k = 0; k < 18; k++) {
      const mid = (lo + hi) / 2;
      if (solve(mid, 10).status === 'visible') hi = mid;
      else lo = mid;
    }
    const boundary = (lo + hi) / 2;
    for (const offset of [-1, -0.25, 0.25, 1]) {
      const height = boundary + offset;
      if (height <= 0) continue;
      horizonCases++;
      const current = solve(height, 5);
      const coarse = solve(height, 10);
      if (current.status !== coarse.status) {
        horizonFailures++;
        console.error(`FAIL horizon step-status mismatch at ${distance}m, h=${height.toFixed(3)}m`);
      }
      let refStatus = 'not-run', diff = null;
      if (reference) {
        const ref = evaluate(reference.solveAngle, { ...base, distance, targetHeight: height, step: 5 });
        refStatus = ref.status;
        if ((current.status === 'visible') !== (ref.status === 'visible')) {
          horizonFailures++;
          console.error(`FAIL horizon visibility mismatch at ${distance}m, h=${height.toFixed(3)}m`);
        }
        if (current.status === 'visible' && ref.status === 'visible') {
          diff = Math.abs(current.angle - ref.angle) * arcsec;
          horizonMaxDiff = Math.max(horizonMaxDiff, diff);
          if (diff > threshold) {
            horizonFailures++;
            console.error(`FAIL horizon angle mismatch at ${distance}m, h=${height.toFixed(3)}m`);
          }
        }
      }
      console.log(`${distance} ${boundary.toFixed(3)} ${offset.toFixed(2)} ${current.status} ${refStatus} ${diff === null ? '-' : diff.toFixed(6)}`);
    }
  } catch (err) {
    horizonFailures++;
    console.error(`FAIL horizon ${distance}m: ${err.message}`);
  }
}
// Exact spherical vacuum geometry gives a separate, non-RK4 visibility oracle.
// For two points on a sphere, the limiting surface arc is the sum of their
// tangent-to-surface horizon arcs.
console.log('\nVACUUM SPHERICAL TANGENCY (analytic visibility oracle)');
const radius = 6371000;
const observerArc = Math.acos(radius / (radius + observerHeight));
for (const distance of [16000, 20000, 25000]) {
  const targetArc = distance / radius - observerArc;
  const tangentHeight = targetArc <= 0 ? 0 : radius * (1 / Math.cos(targetArc) - 1);
  for (const offset of [-1, 1]) {
    const height = tangentHeight + offset;
    if (height <= 0) continue;
    const expected = offset > 0 ? 'visible' : 'occluded';
    const actual = evaluate(diag.solveAngle, { ...base, atmosphere: 'vacuum', distance,
      targetHeight: height, step: 5 }).status;
    horizonCases++;
    // The vacuum implementation uses sampled clearance, so near-tangent
    // classification is checked with a 1m safety margin.
    if (actual !== expected) {
      horizonFailures++;
      console.error(`FAIL vacuum analytic at ${distance}m, h=${height.toFixed(3)}m: expected ${expected}, got ${actual}`);
    }
    console.log(`${distance} tangent=${tangentHeight.toFixed(3)}m offset=${offset}m expected=${expected} actual=${actual}`);
  }
}
failures += horizonFailures;
console.log(`Horizon cases: ${horizonCases}; horizon failures: ${horizonFailures}; max horizon reference difference: ${horizonMaxDiff.toFixed(6)} arcsec`);
console.log(`Max convergence difference: ${maxConvergence.toFixed(6)} arcsec`);
if (reference) console.log(`Max reference difference: ${maxReference.toFixed(6)} arcsec`);
else console.log('INDEPENDENT COMPARISON NOT RUN.');
console.log(`${failures} failures (threshold ${threshold} arcsec)`);
process.exitCode = failures ? 1 : 0;
