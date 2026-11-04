'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('every local HTML script and stylesheet resolves from project root', () => {
  const html = fs.readFileSync(path.join(root, 'CurvatureApp.html'), 'latin1');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
  const styles = [...html.matchAll(/<link[^>]*href="([^"]+\.css)"/g)].map(m => m[1]);
  assert.ok(scripts.length > 20);
  for (const asset of [...scripts, ...styles]) {
    assert.ok(!asset.startsWith('../'), `asset escapes project root: ${asset}`);
    assert.ok(fs.statSync(path.join(root, asset.split('?')[0])).isFile(), `missing browser asset: ${asset}`);
  }
  assert.equal(new Set(scripts).size, scripts.length, 'duplicate script include');
});

test('production modules, tests and current documentation are grouped by responsibility', () => {
  const groups = ['geometry', 'scene', 'renderers', 'legacy', 'diagnostics', 'optics', 'ui'];
  for (const group of groups) assert.ok(fs.statSync(path.join(root, 'src', group)).isDirectory());
  assert.ok(fs.readdirSync(__dirname).some(name => name.endsWith('.test.js')));
  for (const file of ['README.md', 'docs/architecture.md', 'docs/physics.md',
    'docs/user-guide.md', 'docs/development.md', 'docs/historical-records.md']) {
    assert.ok(fs.statSync(path.join(root, file)).isFile(), `missing current documentation: ${file}`);
  }
  assert.ok(!fs.readdirSync(path.join(root, 'docs')).some(name => /^migration-[a-z0-9-]+\.md$/.test(name)),
    'chronological migration documents should be recoverable from Git, not active docs/');
  assert.deepEqual(fs.readdirSync(root).filter(name => name.endsWith('.js')), []);
});
