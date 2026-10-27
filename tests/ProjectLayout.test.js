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
    assert.ok(fs.statSync(path.join(root, asset)).isFile(), `missing browser asset: ${asset}`);
  }
  assert.equal(new Set(scripts).size, scripts.length, 'duplicate script include');
});

test('production modules, tests and migration notes are grouped by responsibility', () => {
  const groups = ['geometry', 'scene', 'renderers', 'legacy', 'diagnostics', 'optics', 'ui'];
  for (const group of groups) assert.ok(fs.statSync(path.join(root, 'src', group)).isDirectory());
  assert.ok(fs.readdirSync(__dirname).some(name => name.endsWith('.test.js')));
  assert.ok(fs.readdirSync(path.join(root, 'docs')).some(name => name.startsWith('MIGRATION_')));
  assert.deepEqual(fs.readdirSync(root).filter(name => name.endsWith('.js')), []);
});
