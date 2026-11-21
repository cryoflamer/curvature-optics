'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const catalog = require('../src/ui/modern/ModernLocationCatalog');
const scene = require('../src/ui/modern/ModernSceneState');
const {buildReport, extractAllDemoStates} = require('../tools/audit-legacy-modern-boundary');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function authoredAnimations(source) {
  const starts = [...source.matchAll(/Demos\.New\(\s*'([^']+)'/g)];
  return new Map(starts.map((m, i) => {
    const block = source.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : undefined);
    return [m[1], [...block.matchAll(/Demos\.AddAnimation\s*\(/g)].length];
  }));
}

function activeObjectTypes(states) {
  const types = new Set();
  for (const state of states) {
    for (let group = 0; group < 2; group++) {
      if (state.NObjects[group] > 0) types.add(state.ObjType[group]);
    }
  }
  return [...types].sort((a, b) => a - b);
}

test('nine immutable scenario identities match all authored Legacy states, animations and active geometry types', () => {
  const source = fs.readFileSync(path.join(root, 'src/animation/CurvatureDemos.js'), 'latin1');
  const demos = extractAllDemoStates(source);
  const animations = authoredAnimations(source);
  assert.equal(catalog.SCENARIOS.length, 9);
  assert.equal(new Set(catalog.SCENARIOS.map(s => s.id)).size, 9);
  assert.equal(new Set(catalog.SCENARIOS.map(s => s.legacyDemo)).size, 9);
  assert.deepEqual(catalog.SCENARIOS.map(s => s.legacyDemo), demos.map(d => d.demo));
  assert.equal(catalog.SCENARIOS.reduce((n, s) => n + s.stateCount, 0), 80);
  assert.equal(catalog.SCENARIOS.reduce((n, s) => n + s.animationCount, 0), 71);
  for (const scenario of catalog.SCENARIOS) {
    const demo = demos.find(d => d.demo === scenario.legacyDemo);
    assert.equal(scenario.stateCount, demo.states.length, scenario.id);
    assert.equal(scenario.animationCount, animations.get(scenario.legacyDemo), scenario.id);
    assert.deepEqual(scenario.objectTypes, activeObjectTypes(demo.states), scenario.id);
    assert.ok(Object.isFrozen(scenario) && Object.isFrozen(scenario.objectTypes));
  }
  assert.equal(buildReport().totalStates, 80, 'the existing compatibility audit remains the source baseline');
});

test('six locations group exactly eight geographic scenarios; the Curve lesson is not a fictitious place', () => {
  assert.equal(catalog.LOCATIONS.length, 6);
  assert.equal(new Set(catalog.LOCATIONS.map(l => l.id)).size, 6);
  assert.ok(Object.isFrozen(catalog.LOCATIONS));
  assert.ok(Object.isFrozen(catalog.SCENARIOS));
  assert.ok(Object.isFrozen(catalog.NATIVE_PRESETS));
  for (const location of catalog.LOCATIONS) {
    assert.ok(Object.isFrozen(location) && Object.isFrozen(location.scenarioIds));
    assert.equal(catalog.location(location.id), location);
    assert.deepEqual(catalog.scenariosAt(location.id).map(s => s.id).sort(),
      [...location.scenarioIds].sort(), 'bidirectional location membership: ' + location.id);
  }
  assert.equal(catalog.SCENARIOS.filter(s => s.category === 'geographic').length, 8);
  assert.equal(catalog.SCENARIOS.filter(s => s.category === 'educational').length, 1);
  const curve = catalog.scenario('earth-curvature-lesson');
  assert.equal(curve.locationId, null);
  assert.deepEqual(catalog.scenariosAt(null), [curve]);
  assert.equal(catalog.location('unknown'), null);
  assert.equal(catalog.scenario('unknown'), null);
  assert.deepEqual(catalog.scenariosAt('unknown'), []);
  assert.throws(() => { catalog.LOCATIONS[0].scenarioIds.push('bogus'); }, TypeError);
});

test('only implemented native partial presets are selectable; saved experiment allowlist and DOM stay in sync', () => {
  const existing = Object.keys(scene.PRESETS);
  assert.deepEqual(catalog.NATIVE_PRESETS, existing);
  assert.deepEqual(existing, ['pontchartrain', 'single', 'rows', 'bedford', 'chicago', 'chicago-near', 'canigou', 'canigou-low', 'grace', 'causeway', 'tensas', 'soundly']);
  const partial = catalog.SCENARIOS.filter(s => s.nativePresetId);
  assert.deepEqual(partial.map(s => [s.legacyDemo, s.nativePresetId, s.status]),
    [['Causeway', 'causeway', 'partial'], ['TransLine', 'pontchartrain', 'partial'], ['Grace', 'grace', 'partial'],
      ['Bedford', 'bedford', 'partial'], ['Tensas', 'tensas', 'partial'], ['Soundly', 'soundly', 'partial'], ['Chicago', 'chicago', 'partial'], ['Canigou', 'canigou', 'partial']]);
  assert.equal(catalog.SCENARIOS.filter(s => s.status === 'not-ported').length, 1);
  for (const scenario of catalog.SCENARIOS) {
    assert.ok(['partial', 'not-ported'].includes(scenario.status));
    if (scenario.nativePresetId) assert.ok(existing.includes(scenario.nativePresetId));
  }
  const html = read('CurvatureModern.html');
  const options = [...html.matchAll(/<option value="([^"]+)"[^>]*>/g)]
    .map(m => m[1]);
  const sceneSelect = html.match(/<select id="ModernPreset">([\s\S]*?)<\/select>/);
  assert.ok(sceneSelect);
  assert.deepEqual([...sceneSelect[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]),
    ['pontchartrain', 'single', 'rows', 'bedford', 'chicago', 'chicago-near', 'canigou', 'canigou-low', 'grace', 'causeway', 'tensas', 'soundly', 'custom']);
  assert.ok(options.includes('pontchartrain'));
  const serializer = read('src/ui/modern/ModernExperimentState.js');
  assert.match(serializer, /SCENE_PRESETS=\['pontchartrain','single','rows','bedford','chicago','chicago-near','canigou','canigou-low','grace','causeway','tensas','soundly','custom'\]/);
});

test('browser loads the metadata exactly once before Scene adapter and ModernApp; not as an extra Legacy demo engine', () => {
  const html = read('CurvatureModern.html');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)]
    .map(m => m[1].split(/[?#]/)[0]);
  const catalogPath = 'src/ui/modern/ModernLocationCatalog.js';
  assert.equal(scripts.filter(p => p === catalogPath).length, 1);
  assert.ok(scripts.indexOf(catalogPath) < scripts.indexOf('src/ui/modern/ModernSceneState.js'));
  assert.ok(scripts.indexOf(catalogPath) < scripts.indexOf('src/ui/modern/ModernApp.js'));
  const module = read(catalogPath);
  assert.match(module, /root\.CurvatureModernLocationCatalog\s*=\s*api/);
  assert.doesNotMatch(module, /(?:eval\(|new Function\(|\bfetch\()/);
});

test('current compatibility reference keeps all stable scenario IDs without a duplicate TODO checklist', () => {
  const doc = read('docs/native-scenario-compatibility.md');
  const rows = doc.split('\n').filter(line => line.startsWith('| `')).map(line => line.split('`')[1]);
  assert.deepEqual(rows, catalog.SCENARIOS.map(s => s.id));
  // The data source remains the immutable catalog + source animations.
  // Docs retain the separate-physics gates without pretending a port happened.
  for (const file of ['README.md', 'docs/legacy-migration-plan.md',
    'docs/architecture.md']) {
    assert.ok(read(file).includes('native-scenario-compatibility.md'),
      file + ' should link to the current technical boundary');
  }
  assert.match(doc, /Scene and both Compare/);
  assert.match(doc, /71 authored transitions/);
  assert.match(doc, /not approved/);
  assert.match(doc, /signed-distance prelude/i);
});
