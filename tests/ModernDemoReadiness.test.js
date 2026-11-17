'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const readiness = require('../tools/audit-modern-demo-readiness');
const catalog = require('../src/ui/modern/ModernLocationCatalog');
const root = path.resolve(__dirname, '..');
const pinned = require('./fixtures/modern-demo-readiness.json');

test('full read-only source audit is deterministic and matches the pinned fixture', () => {
  assert.deepEqual(readiness.buildReport(), pinned);
  const run = spawnSync(process.execPath, ['tools/audit-modern-demo-readiness.js', '--check'],
    {cwd: root, encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /9 demos \/ 80 states \/ 71 transitions/);
  assert.match(pinned.policy, /no Legacy execution/);
  assert.match(pinned.policy, /no.*automatic conversion/);
});

test('all 80 authored states and 71 adjacent authored transitions are accounted for', () => {
  assert.deepEqual(pinned.summary, {
    demos: 9, geographicScenarios: 8, states: 80, transitions: 71,
    partialNativeScenarios: 8, nativePresetReferences: 10,
    distinctSourceStatesWithPresetReferences: 9, schemaBlockedStates: 28,
    certifiedNativeStates: 0, certifiedNativeTransitions: 0,
  });
  assert.deepEqual(pinned.demos.map(d => d.demo), catalog.SCENARIOS.map(s => s.legacyDemo));
  for (const demo of pinned.demos) {
    const scenario = catalog.scenario(demo.scenarioId);
    assert.equal(demo.sourceStates, scenario.stateCount);
    assert.equal(demo.sourceTransitions, scenario.animationCount);
    assert.equal(demo.states.length, scenario.stateCount);
    assert.equal(demo.transitions.length, scenario.animationCount);
    assert.equal(demo.nativeStatus, scenario.status);
    demo.states.forEach((s, i) => {
      assert.equal(s.sourceIndex, i);
      assert.equal(s.legacyQuery, `?demo=${demo.demo}&pos=${i + 1}`);
      assert.equal(s.nativeVisualAndOpticalParity, 'not-certified');
      assert.ok(['review-only', 'blocked'].includes(s.structuralStatus));
    });
    demo.transitions.forEach((t, i) => {
      assert.equal(t.fromIndex, i);
      assert.equal(t.toIndex, i + 1);
      assert.equal(t.legacyFrom, demo.states[i].legacyQuery);
      assert.equal(t.legacyTo, demo.states[i + 1].legacyQuery);
      assert.equal(t.modernStudioParity, 'not-certified');
      assert.ok(t.sourceControlTargets.length || t.helpers.length);
      assert.deepEqual(t.sourceControlTargets, [...new Set(t.sourceControlTargets)].sort());
      assert.deepEqual(t.changedSnapshotFields, [...new Set(t.changedSnapshotFields)].sort());
    });
  }
});

test('source geometry anchors resolve to ten real Modern presets without claiming source camera/optics parity', () => {
  const used = pinned.demos.flatMap(d => d.nativeAnchors);
  assert.equal(used.length, 10);
  assert.equal(new Set(used.map(p => p.presetId)).size, 10);
  assert.deepEqual(new Set(used.map(p => p.presetId)),
    new Set(catalog.NATIVE_PRESETS.filter(p => !['single', 'rows'].includes(p))));
  for (const demo of pinned.demos) {
    for (const anchor of demo.nativeAnchors) {
      assert.equal(anchor.sourceObjectFieldsMatch, true);
      assert.equal(anchor.legacyQuery, demo.states[anchor.sourceIndex].legacyQuery);
      assert.ok(demo.states[anchor.sourceIndex].nativePresetReferences.includes(anchor.presetId));
      assert.equal(anchor.opticsAndViewParity, 'not-certified');
    }
  }
  const byId = id => used.find(a => a.presetId === id);
  assert.deepEqual([byId('chicago').sourceIndex, byId('chicago-near').sourceIndex], [0, 0]);
  assert.deepEqual([byId('canigou').sourceIndex, byId('canigou-low').sourceIndex], [2, 4]);
  assert.ok(byId('chicago').adaptedCameraFields.includes('CameraNorth (Modern translation)'));
  assert.ok(byId('canigou-low').adaptedCameraFields.includes('Nick'));
});

test('known source-level blockers remain explicit and do not get silently normalized', () => {
  const demo = id => pinned.demos.find(d => d.demo === id);
  const flags = (id, i) => demo(id).states[i].migrationFlags;
  assert.ok(flags('Bedford', 0).includes('signed-object-range'));
  assert.ok(flags('Bedford', 0).includes('legacy-combined-globe-flat'));
  for (let i = 0; i < 5; i++) assert.ok(flags('Grace', i).includes('zero-object-spacing'));
  assert.ok(flags('Canigou', 4).includes('legacy-nonzero-refraction-coefficient'));
  assert.ok(flags('TransLine', 4).includes('legacy-refraction-coefficient-unspecified'));
  assert.ok(demo('Curve').states.every(s => s.nativePresetReferences.length === 0));
  assert.ok(demo('Soundly').states.every(s => s.nativeVisualAndOpticalParity === 'not-certified'));
  assert.ok(demo('Soundly').states[12].nativePresetReferences.includes('soundly'));
});

test('action inventory reports helper/task evidence without pretending to be an executable timeline', () => {
  const parsed = readiness.controlInventory("Tval('Height', 100); Ttxt('note'); Tpan(100); Tpse(300); Mode: 'parallel'; ValueRef:'Nick'");
  assert.deepEqual(parsed.sourceControlTargets, ['Height', 'Nick']);
  assert.deepEqual(parsed.helpers, ['caption', 'camera-pan-sweep', 'pause', 'parallel-actions']);
  assert.throws(() => readiness.storyboardSections("Demos.New('Curve'); Demos.AddState('one'); Demos.AddState('two')"), /requires exactly/);
  // Source-ordered transition evidence exists even when 2 adjacent states have
  // identical fields (the narration can still be a meaningful transition).
  const grace = pinned.demos.find(d => d.demo === 'Grace');
  assert.ok(grace.transitions[0].helpers.includes('caption'));
  assert.ok(grace.transitions[0].sourceControlTargets.length === 0);
  assert.ok(pinned.demos.some(d => d.transitions.some(t => t.helpers.includes('parallel-actions'))));
});
