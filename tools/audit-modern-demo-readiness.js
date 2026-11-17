#!/usr/bin/env node
'use strict';
/*
 * Deterministic, read-only inventory of source Legacy storyboards and their
 * existing partial Modern Scene anchors. NOT a converter, animation importer,
 * renderer, optics-parity oracle, or authorization to retire Legacy.
 * Legacy source literals are parsed as data; no original JS is executed.
 */
const fs = require('node:fs');
const path = require('node:path');
const {extractAllDemoStates, buildReport: buildBoundaryReport} = require('./audit-legacy-modern-boundary');
const catalog = require('../src/ui/modern/ModernLocationCatalog');
const scene = require('../src/ui/modern/ModernSceneState');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = 'src/animation/CurvatureDemos.js';
const FIXTURE = 'tests/fixtures/modern-demo-readiness.json';
const OBJECT_FIELDS = Object.freeze(['NObjects', 'ObjType', 'ObjDist', 'ObjDeltaDist',
  'ObjSideType', 'ObjSidePos', 'ObjSideVar', 'ObjSizeType', 'ObjSize', 'ObjSizeVar']);
const CAMERA_FIELDS = Object.freeze(['Height', 'FocalLengthField', 'Pan', 'Nick', 'Roll']);

// These are explicitly traced source *geometry* anchors, never claims of
// equivalent Legacy cameras, atmosphere, composite imagery or choreography.
// Indices are zero-based: ?demo=...&pos= is one-based.
const ANCHORS = Object.freeze({
  Causeway: Object.freeze([{presetId: 'causeway', sourceIndex: 4}]),
  TransLine: Object.freeze([{presetId: 'pontchartrain', sourceIndex: 4}]),
  Grace: Object.freeze([{presetId: 'grace', sourceIndex: 7}]),
  Bedford: Object.freeze([{presetId: 'bedford', sourceIndex: 3}]),
  Tensas: Object.freeze([{presetId: 'tensas', sourceIndex: 3}]),
  Soundly: Object.freeze([{presetId: 'soundly', sourceIndex: 12}]),
  Chicago: Object.freeze([{presetId: 'chicago', sourceIndex: 0},
    {presetId: 'chicago-near', sourceIndex: 0}]),
  Canigou: Object.freeze([{presetId: 'canigou', sourceIndex: 2},
    {presetId: 'canigou-low', sourceIndex: 4}]),
});

function freezeArrayOfStrings(items) { return [...new Set(items)].sort(); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function storyboardSections(text) {
  const starts = [...text.matchAll(/Demos\.New\(\s*'([^']+)'/g)];
  if (!starts.length) throw Error('No authored Legacy demonstrations found');
  return starts.map((entry, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : text.length;
    const body = text.slice(entry.index, end);
    const states = [...body.matchAll(/Demos\.AddState\s*\(/g)];
    const animations = [...body.matchAll(/Demos\.AddAnimation\s*\(/g)];
    if (animations.length !== states.length - 1)
      throw Error(`${entry[1]}: storyboard requires exactly N-1 transitions`);
    const actions = animations.map((start, i) => {
      if (!(states[i].index < start.index && start.index < states[i + 1].index))
        throw Error(`${entry[1]} transition ${i}: non-interleaved source order`);
      return body.slice(start.index, states[i + 1].index);
    });
    return {demo: entry[1], actions};
  });
}

function controlInventory(text) {
  const refs = [
    ...[...text.matchAll(/\bTval\s*\(\s*'([^']+)'/g)].map(m => m[1]),
    ...[...text.matchAll(/\bValueRef\s*:\s*'([^']+)'/g)].map(m => m[1]),
  ];
  const helpers = [];
  if (/\bTtxt\s*\(/.test(text)) helpers.push('caption');
  if (/\bTpan\s*\(/.test(text)) helpers.push('camera-pan-sweep');
  if (/\bTpse\s*\(/.test(text)) helpers.push('pause');
  if (/\bMode\s*:\s*'parallel'/.test(text)) helpers.push('parallel-actions');
  // sourceControlTargets are *only* syntactically detected literal refs;
  // source bodies may also have actions not captured by this small inventory.
  return {sourceControlTargets: freezeArrayOfStrings(refs), helpers};
}

function sourceDifferences(before, after) {
  return freezeArrayOfStrings([...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !same(before[key], after[key])));
}

function stateFlags(s) {
  const flags = [];
  if (s.showModel === 3) flags.push('legacy-combined-globe-flat');
  if (s.NObjects.some((count, i) => count > 0 && s.ObjDist[i] < 0))
    flags.push('signed-object-range');
  if (s.NObjects.some((count, i) => count > 1 && s.ObjDeltaDist[i] === 0))
    flags.push('zero-object-spacing');
  if (Object.hasOwn(s, 'refractionCoeff') && s.refractionCoeff !== 0)
    flags.push('legacy-nonzero-refraction-coefficient');
  if (!Object.hasOwn(s, 'refractionCoeff'))
    flags.push('legacy-refraction-coefficient-unspecified');
  if (Object.hasOwn(s, 'refractionSync') && s.refractionSync !== 1)
    flags.push('legacy-refraction-sync-mode');
  return flags;
}

function sourceAnchor(sourceState, anchor, demo) {
  const preset = scene.PRESETS[anchor.presetId];
  if (!preset || !catalog.NATIVE_PRESETS.includes(anchor.presetId))
    throw Error(`${demo}: unknown Modern preset ${anchor.presetId}`);
  if (!sourceState) throw Error(`${demo}: missing anchored state ${anchor.sourceIndex}`);
  const VARIATION_FIELDS = ['ObjSideVar', 'ObjSizeVar', 'ObjSideType', 'ObjSizeType'];
  const mismatched = OBJECT_FIELDS.filter(k => {
    if (Array.isArray(preset.objects[k])) return !same(preset.objects[k], sourceState[k]);
    // applyPreset explicitly clears the four variation fields to zero.
    if (VARIATION_FIELDS.includes(k)) return !same(sourceState[k], [0, 0]);
    return true; // Do not guess an implicit object default for other fields.
  });
  if (mismatched.length)
    throw Error(`${demo}/${anchor.presetId}: source geometry mismatch: ${mismatched.join(', ')}`);
  const cameraDifferences = CAMERA_FIELDS.filter(k => !same(preset.camera[k], sourceState[k]));
  for (const key of ['CameraEast', 'CameraNorth']) {
    if (preset.camera[key] !== undefined && preset.camera[key] !== 0)
      cameraDifferences.push(key + ' (Modern translation)');
  }
  return {
    presetId: anchor.presetId, sourceIndex: anchor.sourceIndex,
    legacyQuery: `?demo=${encodeURIComponent(demo)}&pos=${anchor.sourceIndex + 1}`,
    sourceObjectFieldsMatch: true,
    adaptedCameraFields: cameraDifferences,
    modernAtmosphere: preset.atmosphere || 'vacuum',
    opticsAndViewParity: 'not-certified',
  };
}

function buildReport() {
  const text = fs.readFileSync(path.join(ROOT, SOURCE), 'latin1');
  const sourceDemos = extractAllDemoStates(text);
  const storyboards = storyboardSections(text);
  const boundary = buildBoundaryReport();
  if (sourceDemos.length !== catalog.SCENARIOS.length || storyboards.length !== sourceDemos.length)
    throw Error('Demo inventory changed; manual migration review required');
  const usedPresets = new Set();
  const demos = catalog.SCENARIOS.map((scenario, demoIndex) => {
    const source = sourceDemos[demoIndex];
    const storyboard = storyboards[demoIndex];
    const boundaryDemo = boundary.demos[demoIndex];
    if (!source || source.demo !== scenario.legacyDemo || storyboard.demo !== source.demo ||
        boundaryDemo.demo !== source.demo || source.states.length !== scenario.stateCount ||
        storyboard.actions.length !== scenario.animationCount)
      throw Error('Source/catalog/boundary mismatch: ' + scenario.legacyDemo);
    const sourceAnchors = ANCHORS[source.demo] || [];
    if (scenario.nativePresetId && !sourceAnchors.some(a => a.presetId === scenario.nativePresetId))
      throw Error('Missing primary native anchor: ' + source.demo);
    if (!scenario.nativePresetId && sourceAnchors.length)
      throw Error('Unexpected native anchor: ' + source.demo);
    const nativeAnchors = sourceAnchors.map(anchor => {
      if (usedPresets.has(anchor.presetId)) throw Error('Duplicate preset mapping ' + anchor.presetId);
      usedPresets.add(anchor.presetId);
      return sourceAnchor(source.states[anchor.sourceIndex], anchor, source.demo);
    });
    const states = source.states.map((s, index) => {
      const old = boundaryDemo.states[index];
      const anchorIds = nativeAnchors.filter(a => a.sourceIndex === index).map(a => a.presetId);
      return {
        sourceIndex: index, legacyQuery: old.legacyQuery,
        activeObjectTypes: freezeArrayOfStrings(s.ObjType.filter((_, g) => s.NObjects[g] > 0)).map(Number),
        structuralStatus: old.structuralStatus,
        schemaBlockerCodes: freezeArrayOfStrings(old.blockers.map(item => item.code)),
        migrationFlags: stateFlags(s),
        nativePresetReferences: anchorIds,
        nativeVisualAndOpticalParity: 'not-certified',
      };
    });
    const transitions = storyboard.actions.map((body, index) => {
      const controls = controlInventory(body);
      if (!controls.sourceControlTargets.length && !controls.helpers.length)
        throw Error(`Transition ${source.demo}:${index} has no recognized static actions; review parser`);
      return {
        fromIndex: index, toIndex: index + 1,
        legacyFrom: states[index].legacyQuery,
        legacyTo: states[index + 1].legacyQuery,
        changedSnapshotFields: sourceDifferences(source.states[index], source.states[index + 1]),
        ...controls,
        modernStudioParity: 'not-certified',
      };
    });
    return {
      scenarioId: scenario.id, demo: source.demo,
      category: scenario.category, locationId: scenario.locationId,
      sourceStates: states.length, sourceTransitions: transitions.length,
      nativeStatus: scenario.status, nativeAnchors, states, transitions,
    };
  });
  // 10 source-anchored native presets, excluding the two general samples.
  if (usedPresets.size !== catalog.NATIVE_PRESETS.length - 2)
    throw Error('Native preset coverage changed; update the anchor matrix deliberately');
  return {
    schemaVersion: 1, source: SOURCE,
    policy: 'read-only source audit; no Legacy execution, automatic conversion, physical/pixel parity, native animation certification or Legacy retirement',
    summary: {
      demos: demos.length,
      geographicScenarios: demos.filter(d => d.category === 'geographic').length,
      states: demos.reduce((sum, d) => sum + d.sourceStates, 0),
      transitions: demos.reduce((sum, d) => sum + d.sourceTransitions, 0),
      partialNativeScenarios: demos.filter(d => d.nativeStatus === 'partial').length,
      nativePresetReferences: usedPresets.size,
      distinctSourceStatesWithPresetReferences: demos.reduce((n, d) => n + d.states.filter(s => s.nativePresetReferences.length).length, 0),
      schemaBlockedStates: demos.reduce((n, d) => n + d.states.filter(s => s.structuralStatus === 'blocked').length, 0),
      certifiedNativeStates: 0, certifiedNativeTransitions: 0,
    },
    demos,
  };
}

function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--check', '--write'].includes(args[0]))
    throw Error('Usage: node tools/audit-modern-demo-readiness.js --check | --write');
  const report = buildReport();
  const output = JSON.stringify(report, null, 2) + '\n';
  const fixturePath = path.join(ROOT, FIXTURE);
  if (args[0] === '--write') {
    fs.writeFileSync(fixturePath, output, 'utf8');
    console.log(`Wrote source-backed audit: ${report.summary.states} states, ${report.summary.transitions} transitions`);
  } else if (!fs.existsSync(fixturePath) || fs.readFileSync(fixturePath, 'utf8') !== output) {
    throw Error(FIXTURE + ' is stale; review source and regenerate deliberately with --write');
  } else {
    console.log(`OK: ${report.summary.demos} demos / ${report.summary.states} states / ${report.summary.transitions} transitions; 0 native parity certifications`);
  }
}
if (require.main === module) {
  try { main(); } catch (error) { console.error('Demo readiness audit FAILED: ' + error.message); process.exitCode = 1; }
}
module.exports = {ANCHORS, storyboardSections, controlInventory, stateFlags, buildReport, main};
