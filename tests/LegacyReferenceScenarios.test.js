'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {buildFixtures, extractDemoStates} = require('../tools/extract-legacy-demo-fixtures');

const fixturePath = path.join(__dirname, 'fixtures', 'legacy-reference-scenarios.json');
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

// These tests deliberately avoid the Legacy DOM, animation runtime, eval and Modern state import.
test('fixture is an exact, complete projection of real serialized Legacy demo states', () => {
  assert.deepEqual(fixtures, buildFixtures(), 'regenerate fixtures explicitly when source changes');
  assert.equal(fixtures.schemaVersion, 1);
  assert.equal(fixtures.source, 'src/animation/CurvatureDemos.js');
  assert.deepEqual(fixtures.scenarios.map(s => s.demo), ['TransLine', 'Bedford']);
  for (const scenario of fixtures.scenarios) {
    const original = extractDemoStates(scenario.demo);
    assert.equal(scenario.totalStates, original.length);
    assert.deepEqual(scenario.samples.map(s => s.sourceIndex), [0, Math.floor(original.length / 2), original.length - 1]);
    for (const sample of scenario.samples) {
      assert.deepEqual(sample.state, original[sample.sourceIndex]);
      assert.ok(Object.keys(sample.state).length >= 20, 'full state is retained, not selected fields');
      const params = new URLSearchParams(sample.legacyQuery);
      assert.equal(params.get('demo'), scenario.demo);
      assert.equal(Number(params.get('pos')), sample.sourceIndex);
      assert.equal(params.has('experiment'), false, 'Legacy routes are not Modern experiments');
    }
  }
});

test('TransLine retains tower layout and the final no-refraction comparison', () => {
  const [first, middle, last] = fixtures.scenarios[0].samples.map(s => s.state);
  assert.deepEqual(first.ObjType, [3, 3]);
  assert.deepEqual(first.NObjects, [85, 2]);
  assert.equal(first.ObjDeltaDist[0], 297.55);
  assert.equal(first.rEarth, 6371000);
  assert.equal(first.Height, 100);
  assert.equal(middle.Height, 15);
  assert.equal(middle.showGrid, 1);
  assert.equal(first.refractionSync, 2);
  assert.equal(Object.hasOwn(first, 'refractionCoeff'), false, 'do not invent fields absent from source state');
  assert.equal(last.refractionSync, 1);
  assert.equal(last.refractionCoeff, 0);
  assert.equal(last.FocalLengthField, 3500);
});

test('Bedford retains marker geometry, eye level and final dense marker sequence', () => {
  const [first, middle, last] = fixtures.scenarios[1].samples.map(s => s.state);
  for (const state of [first, middle, last]) {
    assert.equal(state.ObjType[0], 0);
    assert.equal(state.rEarth, 6371000);
  }
  assert.equal(first.Height, 7);
  assert.equal(first.NObjects[0], 3);
  assert.equal(middle.Height, 4.04);
  assert.equal(middle.showEyeLevel, true);
  assert.equal(last.NObjects[0], 49);
  assert.equal(last.ObjDeltaDist[0], 201.25);
  assert.equal(last.refractionCoeff, 0);
});

test('reference documentation explicitly does not assert pixel or numerical equivalence', () => {
  const docs = fs.readFileSync(path.join(__dirname, '..', 'docs', 'legacy-reference-scenarios.md'), 'utf8');
  assert.match(docs, /not (?:a |an )?(?:rendered|pixel|numerical) (?:oracle|baseline)/i);
  assert.match(docs, /missing/i);
  assert.match(docs, /TransLine/);
  assert.match(docs, /Bedford/);
});
