#!/usr/bin/env node
'use strict';

// Static inventory only. This does not execute HTML or establish runtime ownership.
// Treat all browser globals, conditional dependencies, dynamically injected scripts,
// CSS/assets and URL/state contracts as separate review obligations.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = 'tests/fixtures/legacy-isolation-boundary.json';
const ENTRYPOINTS = Object.freeze({
  legacy: 'CurvatureApp.html',
  modern: 'CurvatureModern.html',
  webgpuResearch: 'tools/webgpu-optics.html',
});

const toPosix = file => file.split(path.sep).join('/');
const ordered = items => [...new Set(items)].sort();

// Exclude commented development-only script tags. Not a full HTML parser;
// the project intentionally uses literal <script src> tags for static loading.
function extractScriptSources(html) {
  const active = html.replace(/<!--[\s\S]*?-->/g, '');
  const sources = [];
  for (const tag of active.matchAll(/<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>/gi)) {
    const match = tag[1].match(/(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (match) sources.push(match[1] === undefined ? match[2] : match[1]);
  }
  return sources;
}

function resolveLocalScript(root, htmlFile, raw) {
  // Query strings are cache-busting metadata, not filesystem components.
  const url = raw.replace(/&amp;/gi, '&').trim();
  const pathname = url.split(/[?#]/, 1)[0];
  if (!pathname || /^([a-z][a-z\d+.-]*:|\/|\\)/i.test(pathname)) {
    throw new Error(`${htmlFile}: non-local or absolute script URL: ${raw}`);
  }
  const abs = path.resolve(root, path.dirname(htmlFile), pathname);
  const rel = path.relative(root, abs);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`${htmlFile}: script escapes repository: ${raw}`);
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw new Error(`${htmlFile}: missing static script: ${toPosix(rel)}`);
  }
  return toPosix(rel);
}

function readEntryPoint(root, file) {
  const html = fs.readFileSync(path.join(root, file), 'latin1').replace(/<!--[\s\S]*?-->/g, '');
  const sources = extractScriptSources(html);
  // Inventory inline blocks without claiming to trace their globals or behavior.
  const inlineScriptHashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/(?:^|\s)src\s*=/i.test(m[1]))
    .map(m => crypto.createHash('sha256').update(m[2].trim()).digest('hex'));
  const scripts = sources.map(raw => resolveLocalScript(root, file, raw));
  const count = new Map();
  for (const script of scripts) count.set(script, (count.get(script) || 0) + 1);
  return {
    file,
    scriptTags: scripts.length,
    uniqueScripts: count.size,
    inlineScriptBlocks: inlineScriptHashes.length,
    inlineScriptSha256: inlineScriptHashes,
    // Preserve actual browser load order and multiplicity, including Modern A/B canvases.
    scripts,
    duplicatedLoads: [...count.entries()].filter(([, n]) => n > 1)
      .map(([file, count]) => ({file, count})).sort((a, b) => a.file.localeCompare(b.file)),
  };
}

function listJs(root, folder) {
  const result = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) result.push(toPosix(path.relative(root, full)));
    }
  }
  visit(path.join(root, folder));
  return result.sort();
}

function localCommonJsTargets(root, from) {
  const source = fs.readFileSync(path.join(root, from), 'latin1');
  const targets = [];
  // Literal CommonJS paths are a *Node-side/static* reference, not a browser load.
  // No claim is made about dynamic require() expressions or JS global access.
  for (const match of source.matchAll(/\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g)) {
    const spec = match[2];
    if (!spec.startsWith('.')) continue;
    const base = path.resolve(root, path.dirname(from), spec);
    const candidates = [base, base + '.js', path.join(base, 'index.js')];
    const resolved = candidates.find(f => fs.existsSync(f) && fs.statSync(f).isFile());
    if (!resolved) throw new Error(`${from}: missing relative literal require: ${spec}`);
    const rel = path.relative(root, resolved);
    if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
      throw new Error(`${from}: relative require escapes repository: ${spec}`);
    }
    targets.push(toPosix(rel));
  }
  return ordered(targets);
}

function buildReport(root = ROOT) {
  const entrypoints = Object.fromEntries(Object.entries(ENTRYPOINTS)
    .map(([key, file]) => [key, readEntryPoint(root, file)]));
  const members = Object.fromEntries(Object.entries(entrypoints).map(([name, e]) => [name, new Set(e.scripts)]));
  const L = members.legacy, M = members.modern, W = members.webgpuResearch;
  const allSrc = listJs(root, 'src');
  const loadedAnywhere = new Set([...L, ...M, ...W]);
  const matrix = {
    loadedByLegacyAndModern: ordered([...L].filter(p => M.has(p))),
    loadedByLegacyNotModern: ordered([...L].filter(p => !M.has(p))),
    loadedByModernNotLegacy: ordered([...M].filter(p => !L.has(p))),
    researchOnlyNotEitherApp: ordered([...W].filter(p => !L.has(p) && !M.has(p))),
    notDirectlyLoadedByTheseEntrypoints: allSrc.filter(p => !loadedAnywhere.has(p)),
  };
  const srcModules = Object.fromEntries(allSrc.map(file => [file, {
    directHtmlLoads: Object.keys(members).filter(name => members[name].has(file)),
    commonJsSourceCallers: [],
    commonJsTestCallers: [],
    commonJsToolCallers: [],
  }]));
  const originGroups = [
    ['src', 'commonJsSourceCallers'],
    ['tests', 'commonJsTestCallers'],
    ['tools', 'commonJsToolCallers'],
  ];
  for (const [folder, field] of originGroups) {
    for (const from of listJs(root, folder)) {
      for (const target of localCommonJsTargets(root, from)) {
        if (srcModules[target]) srcModules[target][field].push(from);
      }
    }
  }
  for (const mod of Object.values(srcModules)) {
    for (const field of ['commonJsSourceCallers', 'commonJsTestCallers', 'commonJsToolCallers']) {
      mod[field] = ordered(mod[field]);
    }
  }
  return {
    schemaVersion: 1,
    policy: 'Static evidence only: no ownership, runtime reachability, parity, or deletion approval',
    entrypoints,
    matrix,
    sourceJsCount: allSrc.length,
    sourceModules: srcModules,
  };
}

function main(args) {
  if (args.length > 1 || args.some(x => !['--check', '--json'].includes(x))) {
    throw new Error('Usage: node tools/audit-legacy-isolation.js [--check|--json]');
  }
  const report = buildReport();
  const serialized = JSON.stringify(report, null, 2) + '\n';
  if (args.includes('--json')) return process.stdout.write(serialized);
  if (args.includes('--check')) {
    const filepath = path.join(ROOT, FIXTURE);
    if (!fs.existsSync(filepath) || fs.readFileSync(filepath, 'utf8') !== serialized) {
      throw new Error(`${FIXTURE} is stale; review changes and regenerate via --json`);
    }
    return process.stdout.write(`OK: Legacy ${report.entrypoints.legacy.scriptTags} tags; Modern ${report.entrypoints.modern.scriptTags} tags; research ${report.entrypoints.webgpuResearch.scriptTags} tags; ${report.sourceJsCount} src JS modules\n`);
  }
  for (const [key, val] of Object.entries(report.entrypoints)) {
    process.stdout.write(`${key}: ${val.scriptTags} active script tags / ${val.uniqueScripts} unique files; ${val.duplicatedLoads.length} repeated files; ${val.inlineScriptBlocks} inline blocks\n`);
  }
  for (const [key, arr] of Object.entries(report.matrix)) {
    process.stdout.write(`${key}: ${arr.length}\n`);
  }
  process.stdout.write('No deletion approved; static HTML loads and literal CommonJS references only.\n');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error('Legacy isolation audit FAILED: ' + error.message); process.exitCode = 1; }
}

module.exports = {ENTRYPOINTS, extractScriptSources, resolveLocalScript, readEntryPoint,
  listJs, localCommonJsTargets, buildReport};
