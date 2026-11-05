'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const modernDir = path.join(root, 'src/ui/modern');
const html = fs.readFileSync(path.join(root, 'CurvatureModern.html'), 'utf8');
const app = fs.readFileSync(path.join(modernDir, 'ModernApp.js'), 'utf8');
const scriptTags = [...html.matchAll(/<script\s+src="([^"]+)"([^>]*)>/g)].map(match => ({
  file: match[1].split('?')[0], attributes: match[2], index: match.index
}));
const modernScripts = scriptTags.filter(tag => tag.file.startsWith('src/ui/modern/'));

// The script tags, not the directory names, are the documented browser entrypoint.
// This list is an intentional preservation gate, not permission to remove
// future scripts absent from this test.
const required = [
  'ModernApp.js', 'ModernAtmosphericPresentation.js',
  'ModernAtmosphericShimmer.js', 'ModernCameraDragPreview.js',
  'ModernCameraInteraction.js', 'ModernCameraPerspectiveWarp.js',
  'ModernCompareGraph.js', 'ModernCompareModel.js',
  'ModernCompareState.js', 'ModernDemos.js', 'ModernExperimentLibrary.js',
  'ModernExperimentState.js', 'ModernGpuCapabilities.js',
  'ModernPerformanceReport.js', 'ModernRenderProfiler.js',
  'ModernRoute.js', 'ModernSceneState.js'
];

function tagsFor(name) {
  return modernScripts.filter(tag => tag.file === 'src/ui/modern/' + name);
}

test('140.12.72: all 17 Modern helper modules remain active and locally available', () => {
  const actual = fs.readdirSync(modernDir).filter(name => name.endsWith('.js')).sort();
  assert.deepEqual(actual, [...required].sort(), 'review newly added/removed modules explicitly');
  for (const name of required) {
    assert.ok(fs.statSync(path.join(modernDir, name)).size > 0, name + ' must have source');
    assert.equal(tagsFor(name).length, name === 'ModernCompareGraph.js' ? 2 : 1,
      name + ' must remain loaded by Modern');
  }
});

test('140.12.72: Compare graphs A and B retain distinct parser-time script loads', () => {
  const pair = tagsFor('ModernCompareGraph.js');
  assert.match(pair[0].attributes, /data-compare-side="A"/);
  assert.match(pair[1].attributes, /data-compare-side="B"/);
  assert.ok(tagsFor('ModernApp.js')[0].index < pair[0].index);
  assert.ok(pair[0].index < pair[1].index);
});

test('140.12.72: Modern dependency modules load before the Scene bootstrap', () => {
  const appIndex = tagsFor('ModernApp.js')[0].index;
  for (const name of required) {
    if (name === 'ModernApp.js' || name === 'ModernCompareGraph.js') continue;
    assert.ok(tagsFor(name)[0].index < appIndex, name + ' must load before ModernApp');
  }
});

test('140.12.72: Scene graph remains the local renderer, not write-only private state', () => {
  assert.doesNotMatch(app, /\bstate\.graph\b/);
  assert.doesNotMatch(app, /\bgraph\s*:\s*null\b/);
  assert.match(app, /\bvar graph=root\.NewGraphX3D\(\{Id:'ModernSceneGraph'/);
  assert.match(app, /\bfunction cameraViewport\(view\)\{\s*if\(view==='Scene'\)return graph;/);
  assert.match(app, /\bregisterCompareGraph\s*:\s*registerCompareGraph/);
});

test('140.12.72: absence guard rejects reintroduced write-only graph assignments', () => {
  const introduced = app + '\nstate.graph=graph;\n';
  assert.match(introduced, /\bstate\.graph\b/);
});
