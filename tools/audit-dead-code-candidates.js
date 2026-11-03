#!/usr/bin/env node
'use strict';

// Read-only, static review inventory. A candidate is not a safe deletion.
// In particular this does NOT infer browser-global reachability, dynamic script
// injection, external usage, saved-state contracts or retained build workflows.
const fs = require('node:fs');
const path = require('node:path');
const {buildReport, extractScriptSources} = require('./audit-legacy-isolation');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = 'tests/fixtures/dead-code-candidates.json';
const POSIX = file => file.split(path.sep).join('/');
const sorted = items => [...new Set(items)].sort();

function commentedScriptSources(root, htmlFiles) {
  const result = new Map();
  for (const file of htmlFiles) {
    const content = fs.readFileSync(path.join(root, file), 'latin1');
    for (const comment of content.matchAll(/<!--[\s\S]*?-->/g)) {
      for (const raw of extractScriptSources(comment[0].slice(4, -3))) {
        const src = raw.split(/[?#]/, 1)[0];
        const resolved = POSIX(path.normalize(path.join(path.dirname(file), src)));
        if (!resolved.startsWith('src/') || !resolved.endsWith('.js')) continue;
        if (!result.has(resolved)) result.set(resolved, []);
        result.get(resolved).push(file);
      }
    }
  }
  return new Map([...result.entries()].map(([file, callers]) => [file, sorted(callers)]));
}

function historicalBuildSources(root) {
  // This DOS build script is evidence of a past source-to-bundle workflow, not
  // proof that it still produces the bundles loaded by the current HTML pages.
  const make = fs.readFileSync(path.join(root, 'src/make.bat'), 'latin1');
  const refs = [];
  for (const match of make.matchAll(/<\s*([A-Za-z0-9_.-]+\.js)\b/g)) {
    const writtenName = match[1];
    refs.push({file: 'src/' + writtenName, exactCaseExists: fs.existsSync(path.join(root, 'src', writtenName))});
  }
  return refs;
}

function buildReportWithRoot(root = ROOT) {
  const isolation = buildReport(root);
  const commented = commentedScriptSources(root, Object.values(isolation.entrypoints).map(e => e.file));
  const makeInputs = historicalBuildSources(root);
  const byLower = new Map(makeInputs.map(ref => [ref.file.toLowerCase(), ref]));
  const research = new Set(isolation.matrix.researchOnlyNotEitherApp);
  const notLoaded = new Set(isolation.matrix.notDirectlyLoadedByTheseEntrypoints);
  const candidates = sorted([...research, ...notLoaded]).map(file => {
    const evidence = isolation.sourceModules[file];
    const commentedIn = commented.get(file) || [];
    const build = byLower.get(file.toLowerCase());
    const kind = research.has(file) ? 'research-harness-loaded'
      : commentedIn.length ? 'commented-legacy-debug-source'
        : 'not-loaded-but-statically-referenced';
    return {
      file,
      kind,
      directHtmlLoads: evidence.directHtmlLoads,
      commentedHtmlReferences: commentedIn,
      historicalBuildInput: build ? {script: 'src/make.bat', writtenPath: build.file,
        exactCaseExists: build.exactCaseExists} : null,
      commonJsSourceCallers: evidence.commonJsSourceCallers,
      commonJsTestCallers: evidence.commonJsTestCallers,
      commonJsToolCallers: evidence.commonJsToolCallers,
      disposition: kind === 'research-harness-loaded' ? 'retain-until-explicit-research-retirement'
        : kind === 'commented-legacy-debug-source' ? 'review-source-bundle-provenance-before-removal'
          : 'review-static-and-dynamic-consumers-before-removal',
      deletionApproved: false,
    };
  });
  const counts = {
    sourceJs: isolation.sourceJsCount,
    activeInLegacy: isolation.entrypoints.legacy.uniqueScripts,
    activeInModern: isolation.entrypoints.modern.uniqueScripts,
    activeInWebgpuResearch: isolation.entrypoints.webgpuResearch.uniqueScripts,
    commentedLegacySources: candidates.filter(x => x.kind === 'commented-legacy-debug-source').length,
    testAndModuleLinkedNotLoaded: candidates.filter(x => x.kind === 'not-loaded-but-statically-referenced').length,
    researchLoaded: candidates.filter(x => x.kind === 'research-harness-loaded').length,
    totalReviewCandidates: candidates.length,
    deletionApproved: 0,
  };
  // Explicit protected seams: mistaken filename-based removal here is costly.
  const protectedFiles = [
    'src/legacy/GraphX3DX.js',
    'src/app/CurvatureModel.js',
    'src/optics/OpticalRayTracer.js',
    'src/renderers/CurvatureWebGLGeometryRenderer.js',
    'src/diagnostics/CurvatureGpuDsPainterGate141240.js',
    'src/diagnostics/CurvatureGpuPixelSpaceAudit141233.js',
    'src/diagnostics/CurvatureGpuFullFrameParity141234.js',
  ].map(file => ({file, directHtmlLoads: isolation.sourceModules[file].directHtmlLoads}));
  return {
    schemaVersion: 1,
    policy: 'Review evidence only; no deletion authorized. Static entrypoints, commented HTML and literal CommonJS/build refs are incomplete reachability evidence.',
    counts,
    historicalBuild: {file: 'src/make.bat', sources: makeInputs},
    protectedFiles,
    candidates,
  };
}

function main(args) {
  if (args.length > 1 || args.some(x => !['--json', '--check'].includes(x))) {
    throw new Error('Usage: node tools/audit-dead-code-candidates.js [--json|--check]');
  }
  const report = buildReportWithRoot();
  const json = JSON.stringify(report, null, 2) + '\n';
  if (args.includes('--json')) return process.stdout.write(json);
  if (args.includes('--check')) {
    if (fs.readFileSync(path.join(ROOT, FIXTURE), 'utf8') !== json) {
      throw new Error(`${FIXTURE} differs from repository evidence; review before regeneration`);
    }
    process.stdout.write(`OK: ${report.counts.totalReviewCandidates} review candidates; 0 approved deletions\n`);
    return;
  }
  for (const [key, value] of Object.entries(report.counts)) {
    process.stdout.write(`${key}: ${value}\n`);
  }
  process.stdout.write('No file is approved for deletion; see docs/dead-code-candidate-audit.md.\n');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error('Dead-code candidate audit FAILED: ' + error.message); process.exitCode = 1; }
}

module.exports = {commentedScriptSources, historicalBuildSources, buildReportWithRoot};
