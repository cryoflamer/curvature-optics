#!/usr/bin/env node
'use strict';
/**
 * Read-only acceptance gate after #140.12.74 research archival.
 * Browser behavior and actual GPU compilation are deliberately NOT certified here.
 * Run from any working directory: node tools/check-refactor-closure.js
 * Use --list to inspect the exact checks without running them.
 */
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const node = process.execPath;
const tests = [
  'tests/LegacyPreservationContract.test.js',
  'tests/LegacyDemosMountBoundary141280.test.js',
  'tests/LegacyDemosDirectPort.test.js',
  'tests/LegacyDemoManagerInstances.test.js',
  'tests/LegacyAppContextInstances.test.js',
  'tests/LegacyUpdateCoordinator.test.js',
  'tests/LegacyCanvasPresenter.test.js',
  'tests/LegacyDrawingModelPorts.test.js',
  'tests/LegacyHeadlessReference.test.js',
  'tests/LegacyReferenceScenarios.test.js',
  'tests/ModernHelperReachability141272.test.js',
  'tests/ModernDeadHandlerCleanup141271.test.js',
  'tests/ModernRetiredGpuStyleCleanup141270.test.js',
  'tests/ModernUiBootstrap.test.js',
  'tests/ModernPrimaryEntry.test.js',
  'tests/ModernPhysicalCompare.test.js',
  'tests/ModernWebGPURetirement141253.test.js',
  'tests/ResearchArchive141274.test.js',
  'tests/CurvaturePhysicsRegression.test.js',
  'tests/OpticalFusedProductionGate141249.test.js',
  'tests/WebGLGeometry1402.test.js',
  'tests/RefactorClosure141273.test.js'
];
const checks = [
  ['Legacy preservation', node, ['tools/check-legacy-preservation.js', '--check']],
  ['Legacy/Modern isolation', node, ['tools/audit-legacy-isolation.js', '--check']],
  ['Legacy bundle provenance', node, ['tools/audit-legacy-bundle-provenance.js', '--check']],
  ['Legacy/Modern compatibility boundaries', node, ['tools/audit-legacy-modern-boundary.js', '--check']],
  ['Opera PNG integrity', 'python3', ['tools/validate-legacy-visual-reference.py']],
  ['Representative Node regressions', node, ['--test', ...tests]]
];
function commandLine(step) {
  return [step[1] === node ? 'node' : step[1], ...step[2]].join(' ');
}
function main(args) {
  if (args.length && (args.length !== 1 || args[0] !== '--list')) {
    process.stderr.write('Usage: node tools/check-refactor-closure.js [--list]\n');
    return 2;
  }
  for (const [i, step] of checks.entries()) {
    console.log(`\n[${i + 1}/${checks.length}] ${step[0]}\n$ ${commandLine(step)}`);
    if (args[0] === '--list') continue;
    const result = spawnSync(step[1], step[2], {cwd: ROOT, stdio: 'inherit'});
    if (result.error || result.status !== 0) {
      const reason = result.error ? result.error.message : `exit ${result.status ?? result.signal}`;
      console.error(`Acceptance gate FAILED: ${step[0]} (${reason})`);
      return 1;
    }
  }
  if (args[0] !== '--list') {
    console.log('\nAutomated refactor baseline PASS. Opera UI playback and real GPU/WGSL are not covered.');
  }
  return 0;
}
if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = {checks, tests, commandLine, main};
