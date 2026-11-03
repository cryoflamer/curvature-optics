#!/usr/bin/env node
'use strict';

// #140.12.65: a reviewed, read-only preservation gate. Static evidence is not
// a browser playback test; interactive behaviour is tested separately in Node.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {readEntryPoint} = require('./audit-legacy-isolation');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(ROOT, 'tests/fixtures/legacy-preservation-contract.json');
const ANIMATION_CONTROLS = ['BackButton', 'PlayButton', 'ForwButton', 'CountButton'];

function buildContract(root = ROOT) {
  const html = fs.readFileSync(path.join(root, 'CurvatureApp.html'), 'latin1');
  const demosSource = fs.readFileSync(path.join(root, 'src/animation/CurvatureDemos.js'), 'latin1');
  const legacy = readEntryPoint(root, 'CurvatureApp.html');
  const modern = readEntryPoint(root, 'CurvatureModern.html');
  const names = [...demosSource.matchAll(/Demos\.New\(\s*'([^']+)'/g)];
  const demos = names.map((match, index) => {
    const body = demosSource.slice(match.index, index + 1 < names.length ? names[index + 1].index : demosSource.length);
    return {
      name: match[1],
      states: [...body.matchAll(/Demos\.AddState\s*\(/g)].length,
      animatedTransitions: [...body.matchAll(/Demos\.AddAnimation\s*\(/g)].length,
    };
  });
  const demoTabs = html.match(/<ul\s+id="CurveDemosTabs"[^>]*>([\s\S]*?)<\/ul>/);
  assert.ok(demoTabs, 'Legacy demo tabs missing');
  const buttons = [...demoTabs[1].matchAll(/<li\b[^>]*\bid="([A-Za-z]+)Button"[^>]*>/g)]
    .map(m => m[1]).filter(name => name !== 'Reset');
  const scripts = legacy.scripts;
  const required = [
    'src/ui/modern/ModernRoute.js',
    'src/ui/ModelAnimationX.js',
    'src/app/CurvatureModel.js',
    'src/app/CurvatureAppRuntime.js',
    'src/animation/CurvatureAnimations.js',
    'src/animation/CurvatureDemos.js',
    'src/app/CurvatureStatePersistence.js',
  ];
  for (const file of required) assert.ok(scripts.includes(file), `Legacy startup dependency missing: ${file}`);
  for (const [before, after] of [
    [required[0], required[1]],
    [required[1], required[5]],
    [required[2], required[3]],
    [required[3], required[5]],
    [required[4], required[5]],
    [required[5], required[6]],
  ]) assert.ok(scripts.indexOf(before) < scripts.indexOf(after), `Invalid script order: ${before} -> ${after}`);
  for (const control of ANIMATION_CONTROLS) {
    assert.match(html, new RegExp(`<li\\b[^>]*\\bid="${control}"`), `Legacy animation control missing: ${control}`);
  }
  assert.match(html, /<option\s+value="legacy"\s+selected>/, 'default canvas must remain Legacy');
  assert.match(html, /id="ResetButton"/, 'demo reset button is required');
  assert.ok(!modern.scripts.includes('src/animation/CurvatureDemos.js'), 'Modern must not load Legacy animations');
  assert.ok(!modern.scripts.includes('src/app/CurvatureAppRuntime.js'), 'Modern must not initialize Legacy runtime');
  assert.ok(modern.scripts.includes('src/ui/modern/ModernApp.js'), 'Modern entrypoint missing');
  assert.ok(modern.scripts.includes('src/legacy/GraphX3DX.js'), 'shared graph renderer removed from Modern');
  assert.ok(scripts.includes('src/legacy/GraphX3DX.js'), 'shared graph renderer removed from Legacy');
  return {
    schemaVersion: 1,
    evidence: 'Static HTML/source preservation boundary; not browser timing, pixel or physics parity',
    entrypoint: 'CurvatureApp.html',
    modernEntrypoint: 'CurvatureModern.html',
    defaultCanvas: 'legacy',
    demos,
    demoButtonOrder: buttons,
    animationControls: ANIMATION_CONTROLS,
    statePersistenceScript: 'src/app/CurvatureStatePersistence.js',
    routeScript: 'src/ui/modern/ModernRoute.js',
    archivedBrowserReferences: 'tests/fixtures/legacy-browser-references.zip',
  };
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !['--check', '--json'].includes(argv[0])) {
    console.error('Usage: node tools/check-legacy-preservation.js --check|--json');
    process.exitCode = 2;
    return;
  }
  const contract = buildContract();
  if (argv[0] === '--json') {
    process.stdout.write(JSON.stringify(contract, null, 2) + '\n');
    return;
  }
  assert.deepEqual(contract, JSON.parse(fs.readFileSync(FIXTURE, 'utf8')),
    'Legacy preservation contract drifted; investigate before intentionally regenerating the fixture');
  assert.equal(contract.demos.reduce((count, demo) => count + demo.states, 0), 80);
  assert.ok(fs.statSync(path.join(ROOT, contract.archivedBrowserReferences)).size > 0);
  console.log(`OK: ${contract.demos.length} Legacy demos / 80 states / ` +
    `${contract.demos.reduce((n, demo) => n + demo.animatedTransitions, 0)} animated transitions; ` +
    'default Legacy entrypoint, controls, dependencies and archived references preserved');
}

if (require.main === module) main();
module.exports = {buildContract, ANIMATION_CONTROLS};
