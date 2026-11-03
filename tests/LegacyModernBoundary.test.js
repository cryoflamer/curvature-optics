'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {auditState, buildReport, extractAllDemoStates, fieldTargets, legacyOnlyReasons} =
  require('../tools/audit-legacy-modern-boundary');
const {extractDemoStates, buildFixtures} = require('../tools/extract-legacy-demo-fixtures');
const codec = require('../src/ui/modern/ModernExperimentState');
const route = require('../src/ui/modern/ModernRoute');

const root = path.join(__dirname, '..');
const reportFile = path.join(__dirname, 'fixtures', 'legacy-modern-boundary.json');
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));

test('all 9 Legacy demo programs and all 80 literal states are audited from real source', () => {
  const fresh = buildReport();
  assert.deepEqual(report, fresh, 'audit fixture must be regenerated when source or schema changes');
  assert.equal(fresh.totalDemos, 9);
  assert.equal(fresh.totalStates, 80);
  assert.equal(fresh.browserReferenceStates, 6);
  assert.deepEqual(fresh.demos.map(d => [d.demo, d.totalStates]), [
    ['Curve', 12], ['Causeway', 6], ['TransLine', 8], ['Grace', 9],
    ['Bedford', 7], ['Tensas', 6], ['Soundly', 18], ['Chicago', 6], ['Canigou', 8],
  ]);
  for (const demo of fresh.demos) {
    assert.equal(demo.states.length, demo.totalStates);
    for (const s of demo.states) {
      const params = new URLSearchParams(s.legacyQuery);
      assert.equal(params.get('demo'), demo.demo);
      assert.equal(Number(params.get('pos')), s.sourceIndex + 1);
      assert.equal(params.has('experiment'), false);
      assert.equal(s.conversionStatus, 'not-supported', 'no implicit migration approval');
      assert.ok(s.mappedFields.length > 10);
      assert.ok(s.unmappedFields.includes('rFEarth'), 'flat-world radius must not be silently lost');
    }
  }
});

test('data-only parser decodes escaped JS apostrophes without executing demo source', () => {
  const source = fs.readFileSync(path.join(root, 'src/animation/CurvatureDemos.js'), 'latin1');
  const all = extractAllDemoStates(source);
  const soundly = all.find(d => d.demo === 'Soundly');
  assert.equal(soundly.states.length, 18);
  assert.match(soundly.states[0].DemoText, /Soundly's/);
  assert.equal(all.reduce((sum, d) => sum + d.states.length, 0), 80);
  // The older selected-state extractor agrees byte-for-byte for the two audited demos.
  for (const name of ['TransLine', 'Bedford']) {
    assert.deepEqual(all.find(d => d.demo === name).states, extractDemoStates(name));
  }
  assert.throws(() => extractAllDemoStates("Demos.New('X'); Demos.AddState(foo);"), /non-literal/);
  assert.throws(() => extractAllDemoStates("Demos.New('X'); Demos.AddState('CurveApp = {\\x');"), /non-literal|Unsupported/);
});

test('visual fixture IDs reference exactly the six frozen source samples, not fabricated renders', () => {
  const selected = buildFixtures().scenarios.flatMap(s => s.samples.map(p => s.demo + ':' + p.sourceIndex)).sort();
  const audited = report.demos.flatMap(d => d.states.filter(s => s.selectedVisualFixture)
    .map(s => d.demo + ':' + s.sourceIndex)).sort();
  assert.deepEqual(audited, selected);
  assert.deepEqual(audited, ['Bedford:0','Bedford:3','Bedford:6','TransLine:0','TransLine:4','TransLine:7']);
});

test('Modern data schema, field projection and reason inventory stay in sync', () => {
  for (const k of [...codec.CAMERA, 'viewcenterHorizon', 'deviceRatio'])
    assert.equal(fieldTargets[k], 'scene.camera.' + k);
  for (const k of codec.OBJECT)
    assert.equal(fieldTargets[k], 'scene.objects.' + k);
  assert.equal(fieldTargets.refractionCoeff, undefined);
  assert.match(legacyOnlyReasons.refractionCoeff, /effective-radius/);
  assert.equal(fieldTargets.showModel, 'scene.surface.showModel');
  assert.equal(fieldTargets.rEarth, 'scene.surface.rEarth');
  assert.equal(fieldTargets.showGrid, 'scene.showGrid');
  assert.equal(fieldTargets.DemoText, 'scene.title');
});

test('TransLine shared parameter names are not an optics or geometry parity claim', () => {
  const demo = report.demos.find(d => d.demo === 'TransLine');
  for (const ix of [0, 4, 7]) {
    const state = demo.states[ix];
    assert.equal(state.structuralStatus, 'review-only');
    assert.deepEqual(state.geometryTypes, [3]);
    assert.ok(state.unmappedFields.includes('refractionSync'));
    assert.equal(state.conversionStatus, 'not-supported');
  }
  assert.ok(demo.states.some(s => s.structuralStatus === 'blocked'));
  assert.equal(auditState(extractDemoStates('TransLine')[4]).opticalParity, 'not-established');
  assert.equal(auditState(extractDemoStates('TransLine')[4]).geometryParity, 'not-established');
});

test('Legacy showModel=3 and unsupported shape IDs are explicit blockers', () => {
  const base = structuredClone(extractDemoStates('TransLine')[4]);
  assert.equal(auditState(base).structuralStatus, 'review-only');
  base.showModel = 3;
  assert.deepEqual(auditState(base).blockers.map(b => b.field), ['showModel']);
  base.showModel = 1;
  base.ObjType = [4, 3];
  assert.deepEqual(auditState(base).blockers.map(b => b.field), ['ObjType']);
  base.ObjType = [3, 3];
  base.showGrid = 3;
  assert.deepEqual(auditState(base).blockers.map(b => b.code), ['grid-mode-not-representable']);
  assert.equal(auditState(base).conversionStatus, 'not-supported');
});

test('schema range errors and unknown Legacy fields fail closed, with no silent fallback', () => {
  const base = structuredClone(extractDemoStates('Bedford')[3]);
  assert.equal(auditState(base).structuralStatus, 'blocked');
  assert.ok(auditState(base).blockers.some(b => b.field === 'showModel'));
  base.showModel = 1;
  base.Height = -2;
  base.nonexistentProperty = 'ignored?';
  const audit = auditState(base);
  assert.ok(audit.blockers.some(b => b.code === 'modern-schema-rejected' && b.field === 'Height'));
  assert.ok(audit.blockers.some(b => b.code === 'unknown-field' && b.field === 'nonexistentProperty'));
  assert.ok(audit.unmapped.some(u => u.field === 'nonexistentProperty'));
  assert.throws(() => auditState(null), /object/);
  assert.throws(() => auditState([]), /object/);
});

test('Bedford mode and invalid negative distances remain blocking even with supported marker IDs', () => {
  const demo = report.demos.find(d => d.demo === 'Bedford');
  assert.ok(demo.states.every(s => s.structuralStatus === 'blocked'));
  assert.ok(demo.states.every(s => s.geometryTypes.includes(0)));
  assert.ok(demo.states.every(s => s.blockers.some(b => b.field === 'showModel')));
  assert.ok(demo.states[0].blockers.some(b => b.field === 'ObjDist'));
});

test('Legacy saved states / demo routes remain disjoint from Modern experiment URLs', () => {
  const old = '?demo=TransLine&pos=5&state=some-legacy-stream#App';
  assert.equal(route.isModern(old), false);
  assert.equal(codec.readUrl(old), null);
  assert.equal(route.isModern('?ui=modern&experiment=invalid'), true);
  const modernRoute = route.target({pathname:'/CurvatureApp.html',search:'?ui=modern&experiment=x',hash:'#App'});
  assert.equal(modernRoute, '/CurvatureModern.html?ui=modern&experiment=x#App');
  assert.match(fs.readFileSync(path.join(root, 'src/app/CurvatureStatePersistence.js'), 'latin1'), /DataX\.FromStream/);
});

test('audit documentation forbids implicit import or Legacy removal', () => {
  const doc = fs.readFileSync(path.join(root, 'docs/legacy-modern-compatibility.md'), 'utf8');
  assert.match(doc, /not a (?:working |validated )?converter/i);
  assert.match(doc, /physical.*parity|optical.*parity/i);
  assert.match(doc, /Legacy.*(?:removal|deletion)|(?:remove|delete).*Legacy/i);
  assert.match(doc, /80 states/);
});
