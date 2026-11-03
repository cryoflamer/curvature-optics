#!/usr/bin/env node
'use strict';

// A read-only, dependency-free provenance audit. We compare JavaScript token streams
// while preserving quoted strings and regexp literals. This is NOT a byte-for-byte
// reproduction of the old jsmin.exe or proof of equivalent browser behavior.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {extractScriptSources, resolveLocalScript} = require('./audit-legacy-isolation');
const {commentedScriptSources} = require('./audit-dead-code-candidates');

const ROOT = path.resolve(__dirname, '..');
const FIXTURE = 'tests/fixtures/legacy-bundle-provenance.json';
const GROUPS = Object.freeze([
  {bundle: 'src/legacy/GraphX3DX.js', historicalOutput: 'GraphX3DX.js', inputs: ['x.js', 'jsg.js', 'jsgx3d.js']},
  {bundle: 'src/ui/ControlPanelX.js', historicalOutput: 'ControlPanelX.js', inputs: ['tabs.js', 'xtc.js', 'DataX.js', 'Slider.js', 'NumFormatter.js', 'ControlPanel.js']},
  {bundle: 'src/ui/ModelAnimationX.js', historicalOutput: 'ModelAnimationX.js', inputs: ['ModelAnimation.js']},
]);
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = p => p.split(path.sep).join('/');
const read = (root, p) => fs.readFileSync(path.join(root, p), 'utf8');
const isIdPart = c => !!c && /[\w$]/.test(c);
const isIdStart = c => !!c && /[A-Za-z_$]/.test(c);
const KEYWORDS_BEFORE_EXPR = new Set(['return', 'throw', 'case', 'delete', 'typeof', 'void', 'new', 'in', 'instanceof', 'else', 'do', 'yield', 'await']);
const OPERATORS = ['>>>=','===','!==','>>>','<<=','>>=','**=','&&=','||=','??=',
  '=>','++','--','+=','-=','*=','/=','%=','==','!=','<=','>=','&&','||','<<','>>','**','??','?.','&=','|=','^='];

// Purposefully limited to the older JS syntax used by these historical sources.
// No dynamic execution, and quoted/commented text cannot masquerade as source tokens.
function jsTokens(source) {
  const out = [];
  let i = 0, canRegExp = true;
  function add(token, kind) {
    out.push(token);
    canRegExp = kind === 'keyword' ? KEYWORDS_BEFORE_EXPR.has(token) :
      !(kind === 'id' || kind === 'number' || kind === 'literal' || kind === 'regexp' ||
        [')', ']', '}', '++', '--'].includes(token));
  }
  while (i < source.length) {
    const ch = source[i], next = source[i + 1];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i + 2);
      i = end < 0 ? source.length : end;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) throw new Error(`Unclosed block comment at character ${i}`);
      i = end + 2;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      const start = i, quote = ch;
      let closed = false;
      for (i++; i < source.length; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === quote) { i++; closed = true; break; }
      }
      if (!closed) throw new Error(`Unclosed string literal at character ${start}`);
      add(source.slice(start, i), 'literal');
      continue;
    }
    if (ch === '/' && canRegExp) {
      const start = i;
      let inClass = false, closed = false;
      for (i++; i < source.length; i++) {
        const c = source[i];
        if (c === '\\') { i++; continue; }
        if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) {
          for (i++; isIdPart(source[i]); i++) {}
          closed = true;
          break;
        } else if (c === '\r' || c === '\n') break;
      }
      if (closed) { add(source.slice(start, i), 'regexp'); continue; }
      // If this isn't a complete regexp, let the ordinary operator path handle it.
      i = start;
    }
    if (isIdStart(ch)) {
      const start = i++;
      while (isIdPart(source[i])) i++;
      const token = source.slice(start, i);
      add(token, KEYWORDS_BEFORE_EXPR.has(token) ? 'keyword' : 'id');
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && next && /[0-9]/.test(next))) {
      const value = source.slice(i).match(/^(?:0[xX][\da-fA-F]+|0[bB][01]+|0[oO][0-7]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
      if (!value) throw new Error(`Unrecognized number at character ${i}`);
      i += value[0].length;
      add(value[0], 'number');
      continue;
    }
    const op = OPERATORS.find(x => source.startsWith(x, i));
    const token = op || ch;
    i += token.length;
    add(token, 'punct');
  }
  return out;
}

function buildEntries(root) {
  const batch = read(root, 'src/make.bat');
  const recipe = batch.split(/\r?\n/).filter(x => x.trim()).map(line => {
    const match = line.match(/^jsmin\s+<\s*(\S+)\s+(>>?)\s*(\S+)(?:\s+"[^"]*")?\s*$/i);
    if (!match) throw new Error(`Unexpected make.bat command: ${line}`);
    return {input: match[1], append: match[2] === '>>', output: relative(path.normalize(path.join('src', match[3])))};
  });
  const expectedLength = GROUPS.reduce((n, g) => n + g.inputs.length, 0);
  if (recipe.length !== expectedLength) throw new Error(`Expected ${expectedLength} recipe commands, got ${recipe.length}`);
  const legacy = extractScriptSources(read(root, 'CurvatureApp.html'))
    .map(raw => resolveLocalScript(root, 'CurvatureApp.html', raw));
  const modern = extractScriptSources(read(root, 'CurvatureModern.html'))
    .map(raw => resolveLocalScript(root, 'CurvatureModern.html', raw));
  const disabled = commentedScriptSources(root, ['CurvatureApp.html']);
  const names = fs.readdirSync(path.join(root, 'src'));
  let offset = 0;
  const bundles = GROUPS.map(group => {
    const commands = recipe.slice(offset, offset + group.inputs.length);
    offset += commands.length;
    if (commands.some((r, i) => r.append !== (i !== 0) ||
        r.output !== group.historicalOutput ||
        r.input.toLowerCase() !== group.inputs[i].toLowerCase())) {
      throw new Error(`src/make.bat recipe changed for ${group.bundle}; review output/input mapping`);
    }
    const inputs = group.inputs.map((name, index) => {
      const exact = fs.existsSync(path.join(root, 'src', name));
      const caseAlternates = names.filter(x => x.toLowerCase() === commands[index].input.toLowerCase());
      if (caseAlternates.length !== 1 || caseAlternates[0] !== name) {
        throw new Error(`Source case resolution is missing or ambiguous for ${name}`);
      }
      const file = `src/${name}`;
      if (!disabled.has(file) || legacy.includes(file)) {
        throw new Error(`${file} is no longer a disabled Legacy debug source`);
      }
      const bytes = fs.readFileSync(path.join(root, file));
      return {file, bytes: bytes.length, sha256: sha256(bytes), recipeSpelling: commands[index].input,
        exactCaseInRecipe: exact && commands[index].input === name};
    });
    const joined = group.inputs.map(name => read(root, `src/${name}`)).join('\n');
    const compiled = read(root, group.bundle);
    // Syntax-only compilation: evaluate neither the current bundle nor its sources.
    new vm.Script(joined, {filename: `inputs for ${group.bundle}`});
    new vm.Script(compiled, {filename: group.bundle});
    const left = jsTokens(joined), right = jsTokens(compiled);
    if (left.length !== right.length) {
      throw new Error(`Token count mismatch for ${group.bundle}: sources ${left.length}, bundle ${right.length}`);
    }
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) throw new Error(`Token mismatch for ${group.bundle} at index ${i}: ${JSON.stringify(left[i])} versus ${JSON.stringify(right[i])}`);
    }
    if (!legacy.includes(group.bundle)) throw new Error(`${group.bundle} is no longer loaded by Legacy`);
    const bundleBytes = fs.readFileSync(path.join(root, group.bundle));
    return {
      bundle: group.bundle,
      historicalOutput: group.historicalOutput,
      activeEntrypoints: ['legacy', ...(modern.includes(group.bundle) ? ['modern'] : [])],
      inputs,
      sourceBytes: inputs.reduce((n, x) => n + x.bytes, 0),
      bundleBytes: bundleBytes.length,
      bundleSha256: sha256(bundleBytes),
      tokenCount: left.length,
      tokenSha256: sha256(JSON.stringify(left)),
      comparison: 'identical-lexical-token-streams; syntax-checked; historical jsmin executable not run',
    };
  });
  return {recipe, bundles};
}

function buildReport(root = ROOT) {
  const {recipe, bundles} = buildEntries(root);
  const oldMinifier = fs.readFileSync(path.join(root, 'src/jsmin.exe'));
  return {
    schemaVersion: 1,
    policy: 'Evidence only: no deletion, relocation, rebuild replacement, or runtime parity authorized',
    tool: {path: 'src/jsmin.exe', format: 'PE32 Windows executable', bytes: oldMinifier.length,
      sha256: sha256(oldMinifier), executed: false},
    counts: {
      legacySourceFiles: bundles.reduce((n, x) => n + x.inputs.length, 0),
      activeBundles: bundles.length,
      lexicalMatches: bundles.length,
      recipeCaseMismatches: recipe.filter(x => !fs.existsSync(path.join(root, 'src', x.input))).length,
      historicalOutputsNotActive: bundles.filter(x => x.bundle !== x.historicalOutput).length,
      approvedDeletions: 0,
    },
    recipe,
    bundles,
  };
}

function main(args) {
  if (args.length > 1 || args.some(x => !['--check','--json'].includes(x))) {
    throw new Error('Usage: node tools/audit-legacy-bundle-provenance.js [--check|--json]');
  }
  const report = buildReport();
  const json = JSON.stringify(report, null, 2) + '\n';
  if (args.includes('--json')) return process.stdout.write(json);
  if (args.includes('--check')) {
    if (read(ROOT, FIXTURE) !== json) throw new Error(`${FIXTURE} differs from source evidence; review before updating`);
    return process.stdout.write(`OK: ${report.counts.activeBundles} bundles / ${report.counts.legacySourceFiles} historical inputs; token streams match; ${report.counts.approvedDeletions} deletions approved\n`);
  }
  for (const bundle of report.bundles) {
    process.stdout.write(`${bundle.bundle}: ${bundle.inputs.length} inputs / ${bundle.tokenCount} matching lexical tokens; loaded by ${bundle.activeEntrypoints.join(', ')}\n`);
  }
  process.stdout.write('Historical jsmin.exe was not run; do not delete or replace source/bundles on this evidence alone.\n');
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(`Legacy bundle provenance audit FAILED: ${error.message}`); process.exitCode = 1; }
}

module.exports = {GROUPS, jsTokens, buildEntries, buildReport};
