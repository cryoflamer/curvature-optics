'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src/ui/modern/ModernApp.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'CurvatureModern.html'), 'utf8');

function obsoleteHandlers(source) {
  return ['function numericAuditComplete(', 'var nameByVersion=',
    'state.probeFrameLast=', 'state.probeExportLast=',
    'use Export JSON to retry'].filter(part => source.includes(part));
}

test('140.12.71: unused Modern GPU success handler, filename map, and write-only state are gone', () => {
  assert.deepEqual(obsoleteHandlers(app), []);
  assert.doesNotMatch(html, /id="ModernGpu(?:Bouguer|Precision|Root).*Run"/);
});

test('140.12.71: dead-handler guard detects accidental reintroductions', () => {
  for (const name of ['function numericAuditComplete(', 'var nameByVersion=',
    'state.probeFrameLast=', 'state.probeExportLast=', 'use Export JSON to retry']) {
    assert.deepEqual(obsoleteHandlers(`// injected ${name}`), [name]);
  }
});

test('140.12.74: diagnostic handlers are archived; GPU capability and WebGL2 remain live',()=>{
  assert.doesNotMatch(app,/function numericAuditFailed\(|function downloadNumericAuditError\(/);
  assert.doesNotMatch(app,/function bindCpuResearch\(/);
  assert.match(app,/function bindGpuDiagnostics\(/);
  assert.match(app,/function bindGeometryBackend\(/);
  assert.match(html,/id="ModernGpuCheck"/);
  assert.match(html,/src="src\/renderers\/CurvatureWebGLGeometryRenderer\.js\?v=/);
});
