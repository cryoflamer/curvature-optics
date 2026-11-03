'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const adapter = require('../tools/legacy-headless-reference');
const {buildFixtures} = require('../tools/extract-legacy-demo-fixtures');

const inputs = buildFixtures();
const storedInputs = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-reference-scenarios.json'), 'utf8'));
const reference = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-headless-numerics.json'), 'utf8'));

function nearly(actual, expected, relative = 1e-12, absolute = 1e-12) {
  assert.ok(Number.isFinite(actual), `non-finite: ${actual}`);
  assert.ok(Math.abs(actual - expected) <= absolute + relative * Math.max(Math.abs(actual), Math.abs(expected)),
    `expected ${actual} to be near ${expected}`);
}

test('six numerical samples derive from the exact Legacy input fixtures and original model', () => {
  assert.deepEqual(storedInputs, inputs);
  const measured = adapter.captureFixtures(inputs);
  assert.deepEqual(measured.samples.map(({demo, sourceIndex}) => [demo, sourceIndex]), [
    ['TransLine', 0], ['TransLine', 4], ['TransLine', 7],
    ['Bedford', 0], ['Bedford', 3], ['Bedford', 6],
  ]);
  assert.match(reference.evidenceKind, /NOT independent physics, ray or pixel oracle/);
  assert.deepEqual(reference.runtimeSources, [
    'src/app/CurvatureModel.js', 'src/app/CurvatureAtmosphere.js',
  ]);
  adapter.compareCapture(measured, reference);
});

test('legacy effective-radius horizons and camera observables obey independent geometric identities', () => {
  for (const {observables: o} of reference.samples) {
    const h = o.horizon, r = o.refraction, camera = o.camera;
    nearly(h.geometryRadiusMetres, h.earthRadiusMetres * r.radiusFactor);
    nearly(h.dipRadians, Math.acos(h.geometryRadiusMetres / (h.geometryRadiusMetres + h.observerHeightMetres)));
    nearly(h.horizonArcMetres, h.geometryRadiusMetres * h.dipRadians);
    // Legacy computes this via sin(acos(...)); sqrt is more stable near grazing angles.
    nearly(h.horizonLineOfSightMetres, Math.sqrt(h.observerHeightMetres * (2*h.geometryRadiusMetres + h.observerHeightMetres)), 1e-10);
    nearly(r.standardAtmospherePressurePa / 100, r.pressureHpa);
    nearly(r.standardAtmosphereTemperatureKelvin - 273.15, r.temperatureC);
    nearly(Math.hypot(...camera.up), 1);
    assert.ok(camera.fieldOfViewDegrees > 0 && camera.fieldOfViewDegrees < 160);
    assert.ok(h.horizonArcMetres > 0);
  }
});

test('standard-atmosphere and no-refraction snapshots remain different and correctly labeled', () => {
  const [far, close, vacuum, bedford] = reference.samples;
  assert.equal(far.observables.refraction.syncMode, 2);
  assert.equal(close.observables.refraction.syncMode, 2);
  assert.ok(close.observables.refraction.k > 0);
  assert.ok(far.observables.refraction.k > 0);
  assert.ok(close.observables.refraction.pressureHpa > far.observables.refraction.pressureHpa);
  assert.equal(vacuum.observables.refraction.syncMode, 1);
  assert.equal(vacuum.observables.refraction.k, 0);
  assert.equal(vacuum.observables.horizon.horizonRefractionAngleDegrees, 0);
  assert.equal(vacuum.observables.horizon.geometryRadiusMetres, vacuum.observables.horizon.earthRadiusMetres);
  for (const sample of reference.samples.slice(3)) {
    assert.equal(sample.demo, 'Bedford');
    assert.equal(sample.observables.refraction.k, 0);
  }
  assert.equal(bedford.sourceIndex, 0);
});

test('the headless adapter is data-only and neither rewrites snapshots nor accepts arbitrary code/fields', () => {
  const state = storedInputs.scenarios[0].samples[0].state;
  const before = JSON.stringify(state);
  const first = adapter.captureState(state);
  const second = adapter.captureState(state);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => adapter.captureState({...state, injected: true}), /Unexpected Legacy field: injected/);
  assert.throws(() => adapter.captureState({...state, rEarth: Infinity}), /Invalid Legacy field value: rEarth/);
  assert.throws(() => adapter.captureState({...state, NObjects: [85, '2']}), /Invalid Legacy array: NObjects/);
  assert.throws(() => adapter.captureState(null), /plain JSON object/);
  assert.throws(() => adapter.captureState([]), /plain JSON object/);
  assert.throws(() => adapter.captureState(JSON.parse('{"__proto__":{}}')), /Unexpected Legacy field/);
});

test('the saved numerical baseline rejects drift instead of silently regenerating itself', () => {
  const modified = structuredClone(reference);
  modified.samples[0].observables.horizon.horizonArcMetres += 1;
  assert.throws(() => adapter.compareCapture(adapter.captureFixtures(inputs), modified), /differs from saved reference/);
  assert.throws(() => adapter.captureFixtures({schemaVersion: 2, scenarios: []}), /Unsupported Legacy input fixture schema/);
});
