/*
 * Read-only catalog of geographic locations and authored Legacy scenarios.
 * These are migration identities, NOT executable Modern Scene presets.
 * A scenario is not selectable until its separately validated Scene preset exists.
 * Keep the historical 'pontchartrain', 'single' and 'rows' preset IDs intact.
 */
(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureModernLocationCatalog = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function freezeEntries(entries) {
    return Object.freeze(entries.map(function(entry) {
      var copy = Object.assign({}, entry);
      if (copy.scenarioIds) copy.scenarioIds = Object.freeze(copy.scenarioIds.slice());
      if (copy.objectTypes) copy.objectTypes = Object.freeze(copy.objectTypes.slice());
      return Object.freeze(copy);
    }));
  }

  // Location identifiers are stable and do not encode a current UI label.
  // No invented geodetic coordinates are stored: Legacy provides model ranges,
  // not real-world latitude/longitude for these subjects.
  var LOCATIONS = freezeEntries([
    {id: 'lake-pontchartrain', name: 'Lake Pontchartrain',
      scenarioIds: ['pontchartrain-causeway', 'pontchartrain-transmission-line', 'pontchartrain-soundly']},
    {id: 'anacapa-grace', name: 'Anacapa Island / Platform Grace',
      scenarioIds: ['anacapa-grace-platform']},
    {id: 'bedford-level', name: 'Bedford Level', scenarioIds: ['bedford-level-experiment']},
    {id: 'little-tensas-bayou', name: 'Little Tensas Bayou', scenarioIds: ['tensas-bayou-bridge']},
    {id: 'chicago-lake-michigan', name: 'Chicago from Lake Michigan',
      scenarioIds: ['chicago-skyline']},
    {id: 'canigou', name: 'Mount Canigou', scenarioIds: ['canigou-mountain']}
  ]);

  // Counts and active object types are pinned to the authored CurvatureDemos.js
  // states; see tests/ModernLocationCatalog.test.js for source-derived checks.
  // 'partial' means at least one native Scene preset exists, NOT scene/animation parity.
  var SCENARIOS = freezeEntries([
    {id: 'earth-curvature-lesson', name: 'Where is the Curve?',
      category: 'educational', locationId: null, legacyDemo: 'Curve',
      stateCount: 12, animationCount: 11, objectTypes: [], status: 'not-ported', nativePresetId: null},
    {id: 'pontchartrain-causeway', name: 'Lake Pontchartrain Causeway',
      category: 'geographic', locationId: 'lake-pontchartrain', legacyDemo: 'Causeway',
      stateCount: 6, animationCount: 5, objectTypes: [6], status: 'partial', nativePresetId: 'causeway'},
    {id: 'pontchartrain-transmission-line', name: 'Lake Pontchartrain Transmission Line',
      category: 'geographic', locationId: 'lake-pontchartrain', legacyDemo: 'TransLine',
      stateCount: 8, animationCount: 7, objectTypes: [3], status: 'partial', nativePresetId: 'pontchartrain'},
    {id: 'anacapa-grace-platform', name: 'Anacapa Island / Platform Grace',
      category: 'geographic', locationId: 'anacapa-grace', legacyDemo: 'Grace',
      stateCount: 9, animationCount: 8, objectTypes: [5, 6], status: 'partial', nativePresetId: 'grace'},
    {id: 'bedford-level-experiment', name: 'Bedford Level Experiment',
      category: 'geographic', locationId: 'bedford-level', legacyDemo: 'Bedford',
      stateCount: 7, animationCount: 6, objectTypes: [0], status: 'partial', nativePresetId: 'bedford'},
    {id: 'tensas-bayou-bridge', name: 'Little Tensas Bayou Bridge',
      category: 'geographic', locationId: 'little-tensas-bayou', legacyDemo: 'Tensas',
      stateCount: 6, animationCount: 5, objectTypes: [7], status: 'not-ported', nativePresetId: null},
    {id: 'pontchartrain-soundly', name: 'Soundly Causeway Observations',
      category: 'geographic', locationId: 'lake-pontchartrain', legacyDemo: 'Soundly',
      stateCount: 18, animationCount: 17, objectTypes: [8], status: 'not-ported', nativePresetId: null},
    {id: 'chicago-skyline', name: 'Chicago Skyline',
      category: 'geographic', locationId: 'chicago-lake-michigan', legacyDemo: 'Chicago',
      stateCount: 6, animationCount: 5, objectTypes: [4], status: 'partial', nativePresetId: 'chicago'},
    {id: 'canigou-mountain', name: 'Mount Canigou',
      category: 'geographic', locationId: 'canigou', legacyDemo: 'Canigou',
      stateCount: 8, animationCount: 7, objectTypes: [5], status: 'partial', nativePresetId: 'canigou'}
  ]);

  // Only supported partial native Scene presets may be selected. 'single'
  // and 'rows' are illustrative samples, not authored geographic locations.
  // Chicago and Canigou each offer two views of the SAME partial source scenario.
  var NATIVE_PRESETS = Object.freeze(['pontchartrain', 'single', 'rows', 'bedford', 'chicago', 'chicago-near', 'canigou', 'canigou-low', 'grace', 'causeway']);

  function location(id) { return LOCATIONS.find(function(item) { return item.id === id; }) || null; }
  function scenario(id) { return SCENARIOS.find(function(item) { return item.id === id; }) || null; }
  function scenariosAt(id) { return SCENARIOS.filter(function(item) { return item.locationId === id; }); }

  return Object.freeze({LOCATIONS: LOCATIONS, SCENARIOS: SCENARIOS,
    NATIVE_PRESETS: NATIVE_PRESETS, location: location, scenario: scenario, scenariosAt: scenariosAt});
}));
