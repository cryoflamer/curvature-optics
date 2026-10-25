/* Phase 3: opt-in audit of the legacy graph boundary.
 * No production drawing path is changed. A partial trace is NOT replay-safe.
 */
(function (root, factory) {
  var api = factory(root.LegacySceneAdapter || (typeof require === 'function' ? require('./LegacySceneAdapter') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LegacySceneAudit = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (adapter) {
  'use strict';
  if (!adapter) throw new Error('LegacySceneAdapter is required');
  function uniqueSorted(items) {
    return Array.from(new Set(items)).sort();
  }
  function inspectSource(source) {
    if (typeof source !== 'string') throw new TypeError('Expected source text');
    // This inventory intentionally covers explicit g.Method(...) call sites,
    // not dynamic dispatch, direct canvas calls or graph property mutations.
    var found = [], re = /\bg\.([A-Za-z_$][\w$]*)\s*\(/g, match;
    while ((match = re.exec(source)) !== null) found.push(match[1]);
    var used = uniqueSorted(found), allowed = new Set(adapter.METHODS);
    return {
      used: used,
      captured: used.filter(function (name) { return allowed.has(name); }),
      missing: used.filter(function (name) { return !allowed.has(name); }),
      complete: used.every(function (name) { return allowed.has(name); }),
      limitations: ['Only explicit g.Method(...) calls are inventoried',
        'Direct graph properties, canvas/driver calls and dynamic dispatch are not covered']
    };
  }
  function summarize(trace) {
    if (!trace || trace.kind !== 'legacy-graph-commands' || !Array.isArray(trace.commands))
      throw new TypeError('Expected a legacy graph command trace');
    var counts = Object.create(null);
    trace.commands.forEach(function (c) { counts[c.method] = (counts[c.method] || 0) + 1; });
    return {count:trace.commands.length, methods:Object.keys(counts).sort().map(function (name) {
      return {name:name, count:counts[name]};
    })};
  }
  function captureFrame(graph, draw) {
    // Diagnostic only. Pass-through drawing occurs normally; trace completeness
    // must be established before calling replay on a production frame.
    var trace = adapter.record(graph, draw);
    return {trace:trace, summary:summarize(trace), replayVerified:false};
  }
  return {inspectSource:inspectSource, summarize:summarize, captureFrame:captureFrame};
}));
