'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const evidence = require('../tools/audit-modern-location-evidence');
const {extractAllDemoStates} = require('../tools/audit-legacy-modern-boundary');
const catalog = require('../src/ui/modern/ModernLocationCatalog');
const scene = require('../src/ui/modern/ModernSceneState');
const geometry = require('../src/geometry/CurvatureGeometryEngine');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = extractAllDemoStates(fs.readFileSync(path.join(root, 'src/animation/CurvatureDemos.js'), 'latin1'));
const demo = name => source.find(x => x.demo === name).states;
const snapshot = require('./fixtures/modern-location-evidence.json');

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}, delta ${actual - expected}`);
}

test('all nine source demos have pinned opening/middle/final numeric baselines with unchanged provenance', () => {
  assert.deepEqual(evidence.buildEvidence(), snapshot);
  assert.equal(snapshot.scenarios.length, 9);
  assert.deepEqual(snapshot.scenarios.map(x => x.scenarioId), catalog.SCENARIOS.map(x => x.id));
  assert.equal(snapshot.scenarios.reduce((n, entry) => n + entry.samples.length, 0), 27);
  for (const entry of snapshot.scenarios) {
    const selected = entry.samples.map(x => x.sourceIndex);
    assert.deepEqual(selected, evidence.INDICES[entry.legacyDemo]);
    assert.equal(selected[0], 0);
    assert.equal(selected[2], demo(entry.legacyDemo).length - 1);
    assert.ok(selected[1] > 0 && selected[1] < selected[2]);
    entry.samples.forEach(sample => {
      assert.equal(sample.legacyQuery, `?demo=${entry.legacyDemo}&pos=${sample.sourceIndex + 1}`);
      const state = demo(entry.legacyDemo)[sample.sourceIndex];
      assert.equal(sample.camera.Height, state.Height);
      assert.equal(sample.camera.FocalLengthField, state.FocalLengthField);
      assert.equal(sample.surface.showModel, state.showModel);
      assert.equal(sample.banks.reduce((n, bank) => n + bank.count, 0),
        state.NObjects[0] + state.NObjects[1]);
      for (const bank of sample.banks) {
        close(bank.lastMetres, bank.startMetres + (bank.count - 1) * bank.spacingMetres);
        assert.ok(bank.behindObserver <= bank.count);
      }
    });
  }
  assert.equal(snapshot.policy.includes('no Modern import'), true);
  const cli = spawnSync(process.execPath, ['tools/audit-modern-location-evidence.js', '--check'],
    {cwd: root, encoding: 'utf8'});
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /27 pinned/);
});

test('TransLine source state 4 shares both numeric object-bank layouts with existing pontchartrain preset', () => {
  const original = demo('TransLine')[4];
  const model = {Height: 15, geometryRadius: 6371000,
    NObjects: [0, 0], ObjType: [0, 0], ObjDist: [0, 0], ObjDeltaDist: [1, 1],
    ObjSidePos: [0, 0], ObjSize: [1, 1], ObjSideVar: [0, 0], ObjSideType: [0, 0],
    ObjSizeType: [0, 0], ObjSizeVar: [0, 0]};
  scene.applyPreset(model, 'pontchartrain');
  for (const field of ['NObjects', 'ObjType', 'ObjDist', 'ObjDeltaDist', 'ObjSidePos',
    'ObjSideVar', 'ObjSideType', 'ObjSize', 'ObjSizeVar', 'ObjSizeType']) {
    assert.deepEqual(model[field], original[field], 'source geometry: ' + field);
  }
  for (const field of ['Height', 'FocalLengthField', 'Roll']) assert.equal(model[field], original[field]);
  close(model.Pan - original.Pan, 0.0464, 1e-12);
  close(model.Nick - original.Nick, 0.0121, 1e-12);
  assert.equal(original.viewcenterHorizon, 0);
  assert.equal(model.viewcenterHorizon, 3);
  assert.equal(original.refractionSync, 2);
  assert.equal(Object.hasOwn(original, 'refractionCoeff'), false,
    'unspecified state k must NOT be interpreted as zero');
  // Independently constructed world-space placements, not a rendered/ray comparison.
  for (let group = 0; group < 2; group++) {
    const sequence = geometry.objectSequence(model, group, true, {opticsNeutral: true});
    assert.equal(sequence.length, original.NObjects[group]);
    sequence.forEach((entry, farToNear) => {
      const index = sequence.length - farToNear - 1;
      close(entry.params.longitude * model.geometryRadius,
        original.ObjDist[group] + index * original.ObjDeltaDist[group]);
      close(entry.params.latitude * model.geometryRadius, original.ObjSidePos[group]);
    });
  }
  close(original.ObjDist[0] + 20 * original.ObjDeltaDist[0], 6001);
  close(original.ObjDist[0] + 84 * original.ObjDeltaDist[0], 25044.2);
  close(original.ObjDist[1] + original.ObjDeltaDist[1], 25923);
});

test('Legacy TransLine headless effective-radius observables are pinned but cannot certify Modern ray equivalence', () => {
  const legacy = require('./fixtures/legacy-headless-numerics.json').samples;
  const index4 = legacy.find(x => x.demo === 'TransLine' && x.sourceIndex === 4);
  const index7 = legacy.find(x => x.demo === 'TransLine' && x.sourceIndex === 7);
  assert.ok(index4 && index7);
  assert.equal(index4.observables.refraction.syncMode, 2);
  close(index4.observables.refraction.k, 0.1704565179870846, 1e-12);
  close(index4.observables.refraction.effectiveRadiusMetres, 7680127.85121348, 1e-5);
  close(index4.observables.horizon.horizonArcMetres, 15179.046759619987, 1e-5);
  assert.equal(index7.observables.refraction.syncMode, 1);
  assert.equal(index7.observables.refraction.k, 0);
  close(index7.observables.refraction.effectiveRadiusMetres, 6371000, 1e-5);
  // Deliberately not testing a fabricated difference against a different Modern profile.
});

test('Curve teaches a combined Legacy projection without objects; Compare A/B is not a substitute', () => {
  const states = demo('Curve');
  assert.equal(states.length, 12);
  assert.ok(states.every(s => s.NObjects.every(n => n === 0)));
  assert.deepEqual(states.map((s, i) => s.showModel === 3 ? i : -1).filter(i => i !== -1), [2, 7, 8]);
  assert.equal(states[0].Height, 2);
  assert.equal(states[10].Height, 35786000);
  assert.equal(states[8].Nick, 8.89);
  const controls = {showModel: 3, rEarth: 6371000};
  assert.equal(scene.PRESETS['earth-curvature-lesson'], undefined,
    'no false native lesson preset may be enabled before its view is implemented');
  assert.equal(catalog.scenario('earth-curvature-lesson').status, 'not-ported');
  assert.ok(![1, 2].includes(controls.showModel));
  assert.match(read('docs/native-scenario-compatibility.md'), /Overlay-equivalent teaching view/);
});

test('Bedford initial signed distances are three distinct markers; no clamping or fake Compare dual view', () => {
  const states = demo('Bedford');
  const start = evidence.activeBank(states[0], 0);
  assert.equal(start.type, 0);
  assert.equal(start.count, 3);
  assert.equal(start.behindObserver, 2);
  assert.deepEqual([0, 1, 2].map(i => start.startMetres + i * start.spacingMetres),
    [-8600, -3770, 1060]);
  assert.equal(start.lastMetres, 1060);
  assert.ok(states.every(s => s.showModel === 3));
  assert.deepEqual([0, 1, 2].map(i => states[3].ObjDist[0] + i * states[3].ObjDeltaDist[0]),
    [124, 4954, 9784]);
  assert.equal(states[6].NObjects[0], 49);
  close(states[6].ObjDist[0] + 48 * states[6].ObjDeltaDist[0], 9784);
  const model = {ObjDist: [124, 0]};
  assert.throws(() => scene.setObject(model, 0, 'ObjDist', -8600), /Expected/);
  assert.deepEqual(model.ObjDist, [124, 0], 'modern validator must reject, not clamp, signed range');
  assert.equal(catalog.scenario('bedford-level-experiment').nativePresetId, 'bedford');
  assert.equal(catalog.scenario('bedford-level-experiment').status, 'partial');
  assert.match(read('docs/native-scenario-compatibility.md'), /signed-distance prelude/);
});

test('source-only Grace zero spacing is retained as an explicit blocker instead of coerced geometry', () => {
  const grace = demo('Grace')[0];
  assert.equal(grace.NObjects[1], 2);
  assert.equal(grace.ObjDeltaDist[1], 0);
  const bank = evidence.activeBank(grace, 1);
  assert.equal(bank.lastMetres, bank.startMetres);
  assert.throws(() => scene.setObject({ObjDeltaDist: [20, 20]}, 1, 'ObjDeltaDist', 0), /Expected/);
  assert.equal(catalog.scenario('anacapa-grace-platform').status, 'partial',
    'later Grace state is ported, but zero-spacing early states remain blocked');
});
