'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const gate = require('../tools/check-refactor-closure');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/ui/modern/ModernApp.js'), 'utf8');

test('140.12.73: removed timing local was write-only in the conformal frame audit', () => {
  const start = app.indexOf('async function runConformalFrameParity141245(){');
  const end = app.indexOf('async function runCpuAdaptiveConformalBenchmark141244(){', start);
  assert.ok(start >= 0 && end > start, 'the diagnostic implementation must remain present');
  const body = app.slice(start, end);
  assert.doesNotMatch(body, /\bstarted\b/);
  assert.match(body, /phase='cold baseline physical frame'/);
  assert.match(body, /phase='cold experimental physical frame'/);
  assert.match(body, /compareAdapter\.compareFramePixels\(imageA,imageB\)/);
  assert.match(body, /'curvature-compare-140\.12\.45-conformal-production-frame\.zip'/);
});

test('140.12.73: acceptance checks use existing read-only entrypoints', () => {
  assert.equal(gate.checks.length, 7);
  for (const [, exec, args] of gate.checks) {
    assert.ok(exec === process.execPath || exec === 'python3');
    assert.ok(args.length > 0);
    assert.ok(fs.existsSync(path.join(root, args[0])) || args[0] === '--test', args[0]);
  }
  for (const filename of gate.tests) {
    assert.ok(fs.existsSync(path.join(root, filename)), filename);
  }
});

test('140.12.73: --list displays commands without running any acceptance checks', () => {
  const proc = spawnSync(process.execPath, ['tools/check-refactor-closure.js', '--list'], {
    cwd: root, encoding: 'utf8'
  });
  assert.equal(proc.status, 0, proc.stderr);
  assert.match(proc.stdout, /Legacy preservation/);
  assert.match(proc.stdout, /Opera PNG integrity/);
  assert.match(proc.stdout, /Representative Node regressions/);
  assert.doesNotMatch(proc.stdout, /Automated refactor baseline PASS/);
});

test('140.12.73: invalid invocation fails rather than claiming a successful check', () => {
  const proc = spawnSync(process.execPath, ['tools/check-refactor-closure.js', '--not-an-option'], {
    cwd: root, encoding: 'utf8'
  });
  assert.equal(proc.status, 2);
  assert.match(proc.stderr, /Usage:/);
});
