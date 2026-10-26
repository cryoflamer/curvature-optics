/* Source-anchored migration inventory. An audit, not a new drawing path. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureMigrationInventory = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var COMPONENTS = [
    {id:'camera', owner:'DrawModel', anchor:'g.SetCamera( {', kind:'view', target:'SceneFrame camera metadata', status:'shared projection exists', priority:1},
    {id:'eye-level', owner:'DrawModel', anchor:'// draw eye level', kind:'annotation', target:'overlay/annotation layer', status:'legacy only', priority:4},
    {id:'flat-equator', owner:'DrawModel', anchor:'// draw flat earth horizon and equator', kind:'line geometry', target:'flat ground reference circles', status:'partial; diagnostic circle only', priority:3},
    {id:'flat-grid', owner:'DrawModel', anchor:'// circle lines', kind:'line geometry', target:'flat radial and concentric grid', status:'legacy only', priority:3},
    {id:'globe-grid', owner:'DrawModel', anchor:'// latitude lines', kind:'line geometry', target:'spherical latitude/longitude grid', status:'legacy only', priority:3},
    {id:'globe-flat-grid', owner:'DrawModel', anchor:'// latitude lines on flat model', kind:'line geometry', target:'globe comparison projected grid', status:'legacy only', priority:3},
    {id:'horizon', owner:'DrawModel', anchor:'// Globe Horizon', kind:'line geometry', target:'horizon circle and tangent line', status:'partial', priority:2},
    {id:'split-screen', owner:'DrawModel', anchor:'// label split screen', kind:'viewport overlay', target:'screen-space overlay and clipping', status:'legacy only', priority:5},
    {id:'optical-overlays', owner:'DrawModel', anchor:'CurvatureInverseOpticsBridge.draw(g, m)', kind:'dynamic overlay', target:'separate optical overlay adapter', status:'legacy/experimental', priority:5},
    {id:'object-behind', owner:'DrawObjectsBehindHorizon', anchor:'function DrawObjectsBehindHorizon(', kind:'visibility', target:'behind-horizon scene partition', status:'partial', priority:2},
    {id:'object-before', owner:'DrawObjectsBeforeHorizon', anchor:'function DrawObjectsBeforeHorizon(', kind:'visibility', target:'foreground scene partition', status:'partial', priority:2},
    {id:'object-placement', owner:'SetTrans', anchor:'function SetTrans(', kind:'world transform', target:'independent object placement', status:'Type 2 verified', priority:2},
    {id:'object-variants', owner:'DrawShapeVariants', anchor:'function DrawShapeVariants(', kind:'geometry/placement', target:'all object placement variants', status:'Type 2 verified', priority:2},
    {id:'shape-library', owner:'DrawShape', anchor:'function DrawShape(', kind:'local geometry', target:'independent shapes by objIx and ObjType', status:'Type 2 only', priority:2}
  ];
  function lineOf(source, needle) {
    var offset = source.indexOf(needle);
    if (offset < 0) return null;
    return source.slice(0, offset).split('\n').length;
  }
  function inspect(source) {
    if (typeof source !== 'string') throw new TypeError('CurvatureApp.html source required');
    var missing = [], components = COMPONENTS.map(function (item) {
      var line = lineOf(source, item.anchor);
      if (line === null) missing.push(item.id);
      return {id:item.id, owner:item.owner, kind:item.kind, target:item.target,
        status:item.status, priority:item.priority, sourceLine:line, anchor:item.anchor};
    });
    var bodyStart = source.indexOf('function DrawModel( g )');
    var bodyEnd = source.indexOf('function DrawObjectsBehindHorizon(', bodyStart);
    if (bodyStart < 0 || bodyEnd < bodyStart) missing.push('DrawModel boundary');
    var body = bodyStart >= 0 && bodyEnd > bodyStart ? source.slice(bodyStart, bodyEnd) : '';
    var graphCalls = Array.from(new Set(Array.from(body.matchAll(/\bg\.([A-Za-z_$][\w$]*)\s*\(/g), function (m) {return m[1];}))).sort();
    var externalCalls = ['CurvatureProjectionCalibration', 'CurvatureTowerOverlay', 'CurvatureInverseOpticsBridge', 'CurvatureRenderedVertexAudit'].filter(function (name) {return body.indexOf(name) >= 0;});
    return {schemaVersion:1, source:'CurvatureApp.html', complete:missing.length === 0,
      missingAnchors:missing, components:components, drawModelGraphCalls:graphCalls,
      externalDrawDependencies:externalCalls,
      cautions:[
        'Static source anchors do not prove runtime coverage or equivalence.',
        'Canvas clipping, labels, optical overlays and camera mutations are separate migration tasks.',
        'Object type is selected by both ObjType and objIx; ObjType=3 is not one shape.',
        'Independent Type 2 geometry has been validated only in the controlled scenarios.',
        'Do not remove DrawModel until feature parity and browser regression gates pass.'
      ]};
  }
  return {inspect:inspect, COMPONENTS:COMPONENTS.map(function (x) {return Object.assign({}, x);})};
}));
