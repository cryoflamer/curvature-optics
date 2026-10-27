#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(path.join(root, 'tests')).filter(n => n.endsWith('.test.js')).sort();
let failed = 0;
for (const test of tests) {
  const p = cp.spawnSync(process.execPath, [path.join(root, 'tests', test)], {encoding:'utf8', timeout:120000});
  const ok = p.status === 0 && !p.error;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${test}`);
  if (!ok) {
    failed++;
    if (p.error) console.error(p.error.message);
    if (p.stdout) process.stdout.write(p.stdout);
    if (p.stderr) process.stderr.write(p.stderr);
  }
}
const scripts = ['CurvatureInverseOpticsBridge.js','OpticalTowerDiagnostics.js','OpticalRayTracer.js'];
for (const file of scripts) {
  const p = cp.spawnSync(process.execPath, ['--check', path.join(root, ({'CurvatureInverseOpticsBridge.js':'src/renderers/CurvatureInverseOpticsBridge.js','OpticalTowerDiagnostics.js':'src/optics/OpticalTowerDiagnostics.js','OpticalRayTracer.js':'src/optics/OpticalRayTracer.js'})[file])], {encoding:'utf8'});
  const ok = p.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} syntax ${file}`);
  if (!ok) { failed++; console.error(p.stderr); }
}
console.log(`\n${tests.length} unit/integration test files; ${failed} failures`);
process.exitCode = failed ? 1 : 0;
