'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(file) { return fs.readFileSync(path.join(root, file), 'latin1'); }

function demos() {
  const source = read('src/animation/CurvatureDemos.js');
  const starts = [...source.matchAll(/Demos\.New\(\s*'([^']+)'/g)];
  return starts.map((entry, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : source.length;
    const body = source.slice(entry.index, end);
    return {id: entry[1], snapshots: [...body.matchAll(/Demos\.AddState\(/g)].length};
  });
}

test('Legacy migration matrix accounts for all actual demo IDs and state snapshots', () => {
  const plan = read('docs/legacy-migration-plan.md');
  const declared = [...plan.matchAll(/^\| `([A-Za-z]+)` \| (\d+) \|/gm)]
    .map(m => ({id: m[1], snapshots: Number(m[2])}));
  const actual = demos();
  assert.equal(new Set(actual.map(d => d.id)).size, actual.length);
  assert.deepEqual(declared, actual, 'refresh the migration matrix when source demonstrations change');
  assert.match(plan, /not.*(?:deletion approval|authorization to delete)/i);
  assert.match(plan, /TransLine/);
});

test('Legacy and Modern state formats and routes remain distinct while retirement is planned', () => {
  const legacyState = read('src/app/CurvatureStatePersistence.js');
  const modernState = read('src/ui/modern/ModernExperimentState.js');
  const route = require('../src/ui/modern/ModernRoute');
  assert.match(legacyState, /DataX\.ToStream/);
  assert.match(legacyState, /DataX\.FromStream/);
  assert.match(legacyState, /GetUrlStr\( 'demo' \)/);
  assert.match(modernState, /PARAM='experiment'/);
  assert.match(modernState, /SCENE_PRESETS=\['pontchartrain','single','rows','custom'\]/);
  assert.equal(route.isModern('?state=legacy'), false);
  assert.equal(route.isModern('?ui=modern'), true);
  assert.equal(route.target({pathname:'/CurvatureApp.html',search:'?ui=modern&experiment=x',hash:'#App'}),
    '/CurvatureModern.html?ui=modern&experiment=x#App');
});
