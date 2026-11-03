#!/usr/bin/env node
'use strict';

// Extract archived Legacy snapshots as data, without executing browser demo code.
// Usage: node tools/extract-legacy-demo-fixtures.js [--check]
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sourcePath = 'src/animation/CurvatureDemos.js';
const outputPath = 'tests/fixtures/legacy-reference-scenarios.json';
const source = fs.readFileSync(path.join(root, sourcePath), 'latin1');
const specs = [
  {demo: 'TransLine', count: 8, indices: [0, 4, 7]},
  {demo: 'Bedford', count: 7, indices: [0, 3, 6]},
];

function extractDemoStates(demoName) {
  const starts = [...source.matchAll(/Demos\.New\(\s*'([^']+)'/g)];
  const startIndex = starts.findIndex(m => m[1] === demoName);
  if (startIndex < 0) throw new Error(`Missing demo: ${demoName}`);
  const start = starts[startIndex].index;
  const end = startIndex + 1 < starts.length ? starts[startIndex + 1].index : source.length;
  const section = source.slice(start, end);
  const declaredCount = [...section.matchAll(/Demos\.AddState\s*\(/g)].length;
  const matches = [...section.matchAll(/Demos\.AddState\s*\(\s*'CurveApp = (\{[^\r\n]*\})'\s*\)/g)];
  if (matches.length !== declaredCount) {
    throw new Error(`Non-literal or unsupported state in ${demoName}: ${matches.length}/${declaredCount}`);
  }
  return matches.map((match, index) => {
    try { return JSON.parse(match[1]); }
    catch (err) { throw new Error(`Invalid JSON for ${demoName} state ${index}: ${err.message}`); }
  });
}

function buildFixtures() {
  return {
    schemaVersion: 1,
    source: sourcePath,
    description: 'Literal CurveApp states from Legacy demos; not rendered or numerical baselines',
    scenarios: specs.map(({demo, count, indices}) => {
      const states = extractDemoStates(demo);
      if (states.length !== count) throw new Error(`${demo} has ${states.length} states, expected ${count}`);
      if (new Set(indices).size !== indices.length || indices.some(i => i < 0 || i >= count)) {
        throw new Error(`Invalid selected indices for ${demo}`);
      }
      return {
        demo,
        totalStates: states.length,
        samples: indices.map(index => ({
          sourceIndex: index,
          legacyQuery: `?demo=${encodeURIComponent(demo)}&pos=${index + 1}`,
          state: states[index],
        })),
      };
    }),
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(a => a !== '--check')) throw new Error('Only --check is supported');
  const output = JSON.stringify(buildFixtures(), null, 2) + '\n';
  const outputFile = path.join(root, outputPath);
  if (args.includes('--check')) {
    if (!fs.existsSync(outputFile) || fs.readFileSync(outputFile, 'utf8') !== output) {
      console.error(`${outputPath} is stale; run node tools/extract-legacy-demo-fixtures.js`);
      process.exitCode = 1;
      return;
    }
    console.log(`OK: ${outputPath} matches Legacy demo source`);
  } else {
    fs.writeFileSync(outputFile, output);
    console.log(`Wrote ${outputPath}`);
  }
}

if (require.main === module) main();
module.exports = {buildFixtures, extractDemoStates};
