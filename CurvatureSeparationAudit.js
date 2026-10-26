/* Static migration inventory. This is NOT a completeness proof for dynamic JS. */
(function (root, factory) {
  var api = factory(root.CurvatureSceneContract || (typeof require === 'function' ? require('./CurvatureSceneContract') : null),
    root.LegacySceneAdapter || (typeof require === 'function' ? require('./LegacySceneAdapter') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureSeparationAudit = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (contract, adapter) {
  'use strict';
  function sortedUnique(xs) { return Array.from(new Set(xs)).sort(); }
  function matches(text, regex, group) {
    var out = [], match;
    while ((match = regex.exec(text)) !== null) out.push(match[group]);
    return sortedUnique(out);
  }
  function inspect(source) {
    if (typeof source !== 'string') throw new TypeError('HTML source is required');
    var start = source.search(/function\s+DrawModel\s*\(\s*g\s*\)\s*\{/);
    if (start < 0) throw new Error('DrawModel(g) not found');
    // Bound the primary draw entry to the next top-level function declaration.
    // Helper functions are inventoried separately and require a runtime trace.
    var body = source.slice(start);
    var next = /\nfunction\s+[A-Za-z_$][\w$]*\s*\(/g;
    next.lastIndex = 1;
    var boundary = next.exec(body);
    if (boundary) body = body.slice(0, boundary.index);
    var modelReads = matches(body, /\bm\.([A-Za-z_$][\w$]*)\b/g, 1);
    var graphCalls = matches(body, /\bg\.([A-Za-z_$][\w$]*)\s*\(/g, 1);
    var graphWrites = matches(body, /\bg\.([A-Za-z_$][\w$]*)\s*=(?!=)/g, 1);
    // Contract explicitly publishes snapshot keys, rather than deriving them
    // from an empty model (which cannot reveal the allowlist).
    var snapshotFields = contract.STATE_FIELDS || [];
    var recorded = adapter.METHODS;
    return {
      entrypoint:'DrawModel', modelReads:modelReads,
      stateSnapshotFields:snapshotFields.slice(),
      missingStateFields:modelReads.filter(function (name) { return snapshotFields.indexOf(name) < 0; }),
      graphCalls:graphCalls,
      unrecordedGraphCalls:graphCalls.filter(function (name) { return recorded.indexOf(name) < 0; }),
      graphWrites:graphWrites,
      blockers: {
        state:modelReads.filter(function (name) { return snapshotFields.indexOf(name) < 0; }),
        methods:graphCalls.filter(function (name) { return recorded.indexOf(name) < 0; }),
        directWrites:graphWrites
      },
      readyForIndependentEngine:false,
      limitations:[
        'Static inspection covers only the DrawModel function body',
        'Calls through helpers, dynamic properties, globals and side effects need runtime auditing',
        'Recorded graph commands are not renderer-independent 3D primitives',
        'A complete state snapshot and browser replay are required before switching production'
      ]
    };
  }
  return {inspect:inspect};
}));
