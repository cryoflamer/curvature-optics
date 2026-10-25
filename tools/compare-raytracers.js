#!/usr/bin/env node
'use strict';
// Compare the current solver at multiple integration steps; optionally compare
// against an independently supplied adapter. No reference solver is bundled.
const path = require('path');
const diag = require('../OpticalTowerDiagnostics');
const arcsec = 180 * 3600 / Math.PI;
const args = process.argv.slice(2);
const externalAt = args.indexOf('--reference');
const referencePath = externalAt >= 0 ? args[externalAt + 1] : null;
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
      radius:6371000, distance, targetHeight });
const threshold = 0.1; // arcsec; configurable after independent validation
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
console.log(`Max convergence difference: ${maxConvergence.toFixed(6)} arcsec`);
if (reference) console.log(`Max reference difference: ${maxReference.toFixed(6)} arcsec`);
else console.log('INDEPENDENT COMPARISON NOT RUN: supply --reference adapter; convergence alone is not independent validation.');
console.log(`${failures} failures (threshold ${threshold} arcsec)`);
process.exitCode = failures ? 1 : 0;
