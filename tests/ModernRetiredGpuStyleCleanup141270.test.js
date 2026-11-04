'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('CurvatureModern.html');
const css = read('src/ui/modern/ModernApp.css');
const app = read('src/ui/modern/ModernApp.js');
const retiredNames = ['modern-gpu-probe-head', 'modern-gpu-probe-maps', 'ModernGpuProbeStatus'];

function obsoleteReferences(parts) {
  return retiredNames.flatMap(name => parts.filter(part => part.source.includes(name))
    .map(part => `${name} in ${part.name}`));
}

test('140.12.70: retired WebGPU probe style hooks are absent from the Modern application', () => {
  const parts = [
    {name: 'Modern HTML', source: html},
    {name: 'Modern stylesheet', source: css},
    {name: 'ModernApp JavaScript', source: app}
  ];
  assert.deepEqual(obsoleteReferences(parts), []);
});

test('140.12.70: obsolete-style guard rejects an accidental reintroduction', () => {
  assert.deepEqual(obsoleteReferences([{name:'fixture', source:'<div class="modern-gpu-probe-maps">'}]),
    ['modern-gpu-probe-maps in fixture']);
  assert.deepEqual(obsoleteReferences([{name:'fixture', source:'#ModernGpuProbeStatus{}'}]),
    ['ModernGpuProbeStatus in fixture']);
});

test('140.12.74: archived CPU research panel and CSS hooks no longer ship',()=>{
  assert.doesNotMatch(html,/ModernCpuResearch|ModernCpuQuadratureRun|modern-cpu-research/);
  assert.doesNotMatch(css,/modern-cpu-research/);
  assert.doesNotMatch(app,/bindCpuResearch|runFusedProductionGate141249/);
});

test('140.12.70: live GPU capability probe and WebGL2 renderer remain present', () => {
  assert.match(html, /id="ModernGpuCheck"/);
  assert.match(html, /id="ModernGpuWebGL2"/);
  assert.match(html, /src="src\/renderers\/CurvatureWebGLGeometryRenderer\.js\?v=/);
  assert.match(html, /id="ModernPerfRecord"/);
  assert.match(css, /\.modern-gpu-diagnostics\{/);
  assert.match(app, /document\.getElementById\('ModernGpuCheck'\)/);
});

test('140.12.74: archived standalone WebGPU page is absent',()=>{
  assert.equal(fs.existsSync(path.join(root,'tools/webgpu-optics.html')),false);
});
