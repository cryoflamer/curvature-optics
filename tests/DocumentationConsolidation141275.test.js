'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = [
  'README.md', 'docs/architecture.md', 'docs/physics.md',
  'docs/user-guide.md', 'docs/development.md'
];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Deliberately scoped to Markdown links in the new current-entry-point guides,
// not historical documents, opaque URL state or rendered HTML fragments.
test('140.12.75: every relative Markdown link in the new guides resolves', () => {
  for (const file of pages) {
    const src = read(file);
    for (const match of src.matchAll(/\[[^\]]+\]\(([^\s)]+)\)/g)) {
      const destination = match[1];
      if (/^(?:https?:|mailto:|#)/.test(destination)) continue;
      const local = decodeURIComponent(destination.split('#')[0]);
      assert.ok(local, `${file}: empty Markdown destination`);
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), local)),
        `${file}: broken link ${destination}`);
    }
  }
});

test('140.12.75: current guide entry points and archive index exist', () => {
  for (const file of [...pages, 'docs/research-archive.md']) {
    assert.ok(fs.statSync(path.join(root, file)).size > 600, file);
    assert.match(read(file), /^# /, file);
  }
  const readme = read('README.md');
  for (const doc of pages.slice(1)) assert.ok(readme.includes(doc), doc);
  assert.ok(readme.includes('docs/research-archive.md'));
});

test('140.12.75: running instructions match both supported entry points', () => {
  for (const file of ['CurvatureApp.html', 'CurvatureModern.html'])
    assert.ok(fs.existsSync(path.join(root, file)), file);
  const readme = read('README.md');
  const guide = read('docs/user-guide.md');
  for (const name of ['CurvatureApp.html', 'CurvatureModern.html',
    'python3 -m http.server 8000']) {
    assert.ok(readme.includes(name), name);
    assert.ok(guide.includes(name), name);
  }
  const route = read('src/ui/modern/ModernRoute.js');
  assert.match(route, /CurvatureApp\\\.html|CurvatureApp\.html/);
  assert.match(route, /CurvatureModern\\\.html|CurvatureModern\.html/);
});

test('140.12.75: modern documented controls still exist', () => {
  const html = read('CurvatureModern.html');
  for (const id of ['ModernSceneTab','ModernCompareTab', 'ModernRender',
    'ModernRecalculateCompare', 'ModernHistoryPanel','ModernHistoryExportSelected',
    'ModernHistoryExportAll','ModernHistoryImport','ModernGpuCheck','ModernGeometryBackend'])
    assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /option value="canvas"/);
  assert.match(html, /option value="webgl2"/);
  assert.ok(!fs.existsSync(path.join(root, 'tools/webgpu-optics.html')));
});

test('140.12.75: physics guide matches the implemented profile defaults', () => {
  const code = read('src/optics/OpticalRayTracer.js');
  const physics = read('docs/physics.md');
  assert.match(code, /0\.000293/);
  assert.match(code, /7350/);
  assert.match(physics, /0\.000293/);
  assert.match(physics, /7350/);
  assert.match(physics, /fused-gradient/);
  assert.match(read('src/optics/OpticalSharedRayField.js'), /'fused-gradient'/);
  for (const name of ['OpticalTargetProjection.js','OpticalSharedRayField.js'])
    assert.ok(fs.existsSync(path.join(root, 'src/optics', name)), name);
});

test('140.12.75: Legacy reference preservation is part of the documentation', () => {
  assert.ok(fs.existsSync(path.join(root,'tests/fixtures/legacy-browser-references.zip')));
  assert.ok(fs.existsSync(path.join(root,'tests/fixtures/legacy-browser-reference-lock.json')));
  const guide = read('docs/user-guide.md');
  assert.match(guide, /80 authored key states/);
  assert.match(guide, /71 transition/);
  assert.match(guide, /pos.*1-based/);
  assert.match(read('docs/legacy-preservation-contract.md'), /Legacy preservation contract/);
});

test('140.12.75: no new guide recommends retired WebGPU research execution', () => {
  for (const file of pages) {
    const text = read(file);
    assert.doesNotMatch(text, /(?:open|run|serve|visit)\s+(?:the\s+)?`?tools\/webgpu-optics\.html`?/i,
      `retired live page was recommended in ${file}`);
  }
  const archive = read('docs/research-archive.md');
  assert.match(archive, /optics-research-archive-2026-11/);
  assert.match(archive, /git worktree add/);
});
