'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

// Validate all retained documentation rather than only the main landing pages.
// Ignore external links and fragment identifiers; we cannot verify those offline.
test('140.12.76: every local Markdown link in retained guides resolves', () => {
  const files = ['README.md', ...fs.readdirSync(docs)
    .filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];
  for (const file of files) {
    const source = read(file);
    for (const match of source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
      const dest = match[1].trim();
      if (/^(?:https?:|mailto:|data:|#)/i.test(dest)) continue;
      const target = decodeURIComponent(dest.split('#')[0].split('?')[0]);
      if (!target) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(file), target)),
        `${file}: missing relative link ${dest}`);
    }
  }
});

test('140.12.76: retired chronological migration and patch notes stay out of active docs', () => {
  const names = fs.readdirSync(docs).filter(name => name.endsWith('.md'));
  assert.ok(!names.some(name => /^migration-/.test(name)));
  assert.ok(!names.some(name => /^controlled-cleanup-/.test(name)));
  assert.ok(!names.some(name => /^regression-test-repairs-/.test(name)));
  for (const name of ['baseline-inventory.md','SCENE_SEPARATION_PLAN.md',
    'project-layout.md','html-script-extraction.md','legacy-ui-assessment.md',
    'refactor-closure-140.12.73.md','cpu-hybrid-shooting.md']) {
    assert.ok(!names.includes(name), `superseded documentation is back: ${name}`);
  }
  assert.ok(names.length < 50, 'a chronological documentation tree was reintroduced');
});

test('140.12.76: current guides, test-backed contracts, and physical evidence survive', () => {
  for (const file of [
    'README.md','docs/architecture.md','docs/physics.md','docs/user-guide.md',
    'docs/development.md','docs/research-archive.md','docs/historical-records.md',
    'docs/legacy-preservation-contract.md','docs/legacy-visual-validation.md',
    'docs/legacy-migration-plan.md','docs/legacy-modern-compatibility.md',
    'docs/legacy-isolation-audit.md','docs/modern-ui-plan.md',
    'docs/modern-gpu-geometry.md','docs/modern-camera-interaction-baseline.md',
    'docs/fused-gradient-production-promotion.md',
    'docs/engineered-optical-qualification.md',
    'docs/continuous-physical-verification.md',
    'tests/fixtures/legacy-browser-references.zip',
    'tests/fixtures/legacy-browser-reference-lock.json',
    'PROJECT_STATE.md', 'CurvatureApp.html', 'CurvatureModern.html'
  ]) assert.ok(exists(file), `protected reference missing: ${file}`);
});

test('140.12.76: obsolete roadmaps are clearly labeled, not presented as active plans', () => {
  assert.match(read('docs/modern-ui-plan.md'), /Historical design record retained for regression tests/);
  assert.match(read('docs/legacy-migration-plan.md'), /not an active migration plan/);
  assert.match(read('docs/historical-records.md'), /71 Markdown files/);
  assert.match(read('README.md'), /historical-records\.md/);
  assert.match(read('docs/development.md'), /historical-records\.md/);
});

test('140.12.76: recovery instructions distinguish deleted notes from the research archive', () => {
  const history = read('docs/historical-records.md');
  assert.match(history, /git show HEAD\^:docs\/migration-flat-surface\.md/);
  assert.match(history, /git log --diff-filter=D/);
  assert.match(history, /research-archive\.md/);
  assert.match(history, /optics-research-archive-2026-11/);
  assert.ok(!exists('tools/webgpu-optics.html'), 'research-only WebGPU page was reintroduced');
});
