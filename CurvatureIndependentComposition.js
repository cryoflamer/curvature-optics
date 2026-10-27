/* Opt-in bridge from independent world-space geometry to existing scene renderers.
 * No legacy graph, DOM or Canvas dependencies. This module does not alter DrawModel.
 */
(function(root,factory){
  var api=factory(root.CurvatureGeometryEngine||(typeof require==='function'?require('./CurvatureGeometryEngine'):null),root.CurvatureSceneContract||(typeof require==='function'?require('./CurvatureSceneContract'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureIndependentComposition=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(engine,contract){
  'use strict';
  if(!engine||!contract)throw new Error('Geometry engine and scene contract required');
  function compose(model,objIx,globe,options){
    var composition=engine.createObjectHorizonComposition(model,objIx,globe,options);
    var primitives=[],ranges=[],nextIndex=0;
    composition.layers.forEach(function(layer,index){
      var first=nextIndex;
      layer.primitives.forEach(function(primitive){
        // The independent painter-order renderer joins projected triangles and
        // strokes by commandIndex. Without unique indices, fills are lost or
        // incorrectly attributed to a different polygon.
        var copy=Object.assign({},primitive,{commandIndex:nextIndex++});
        if(copy.style)copy.style=Object.assign({},copy.style);
        primitives.push(copy);
      });
      ranges.push({name:['behind','mask','outline','before'][index],start:first,end:nextIndex,count:nextIndex-first});
    });
    var scene=contract.createScene('legacy',primitives,{generator:'CurvatureGeometryEngine',
      composition:'object-horizon',objectIndex:objIx,globe:!!globe,
      layerRanges:ranges,approximation:'fixed-world-polygon',
      limitations:['Only independently supported object types and horizon are included',
        'World-polygon horizon is not pixel-identical to legacy CircleOnPlane',
        'Legacy camera and additional scene objects are not independently generated']});
    return {scene:scene,ranges:ranges,cutoffAngle:composition.cutoffAngle,
      requiresHorizonMask:composition.requiresHorizonMask};
  }
  // Opt-in assembled frame. Keep guide primitives distinct from the opaque
  // horizon mask, so neither consumers nor audits confuse visual aids with
  // physical occlusion. The legacy DrawModel remains the default renderer.
  function composeFull(model,objIx,globe,options){
    options=options||{};
    var core=engine.createObjectHorizonComposition(model,objIx,globe,options);
    var surface=globe?engine.globeSurfaceGuides(model):engine.flatSurfaceGuides(model,options);
    var horizonGuides=globe?engine.globeHorizonGuides(model,options):null;
    // DrawObjectsBehindHorizon paints the disk BEFORE the globe grid.
    // Previously the full scene placed the grid under the opaque disk,
    // erasing most latitude/longitude lines in the controlled Globe captures.
    // The outlines in createHorizonScenes are used by partial/objects-only
    // composition; in a full scene the same circles are already emitted by
    // globeHorizonGuides (Globe) or flatSurfaceGuides (Flat). Do not overdraw.
    var emptyOutline=contract.createScene('legacy',[],{
      generator:'CurvatureGeometryEngine',layer:'full-outline-already-in-guides'});
    var layers=globe?[
      {name:'behind',scene:core.behind,role:'objects'},
      {name:'mask',scene:core.mask,role:'occlusion'},
      {name:'surface-guides',scene:surface,role:'visual-aid'},
      {name:'outline',scene:emptyOutline,role:'visual-aid'},
      {name:'horizon-guides',scene:horizonGuides,role:'visual-aid'},
      {name:'before',scene:core.before,role:'objects'}
    ]:[
      {name:'surface-guides',scene:surface,role:'visual-aid'},
      {name:'behind',scene:core.behind,role:'objects'},
      {name:'mask',scene:core.mask,role:'occlusion'},
      {name:'outline',scene:emptyOutline,role:'visual-aid'},
      {name:'before',scene:core.before,role:'objects'}
    ];
    var primitives=[],ranges=[];
    layers.forEach(function(layer){
      var start=primitives.length;
      layer.scene.primitives.forEach(function(p){
        var copy=Object.assign({},p,{commandIndex:primitives.length});
        if(p.style)copy.style=Object.assign({},p.style);
        if(p.metadata)copy.metadata=Object.assign({},p.metadata);
        primitives.push(copy);
      });
      ranges.push({name:layer.name,role:layer.role,start:start,
        end:primitives.length,count:primitives.length-start});
    });
    var scene=contract.createScene('legacy',primitives,{
      generator:'CurvatureGeometryEngine',composition:'full-independent-guides',
      objectIndex:objIx,globe:!!globe,layerRanges:ranges,
      limitations:['Guide curves are discretized in world space',
        'Screen captions/frame are rendered separately by the optional full-scene capture bridge',
        'Data labels, optical overlays and unsupported objects are not included']
    });
    return {scene:scene,ranges:ranges,cutoffAngle:core.cutoffAngle,
      requiresHorizonMask:core.requiresHorizonMask};
  }
  function auditFull(composed){
    if(!composed||!composed.scene||!Array.isArray(composed.ranges))
      throw new TypeError('Composition required');
    var p=composed.scene.primitives,r=composed.ranges;
    var expected=composed.scene.metadata.globe?
      ['behind','mask','surface-guides','outline','horizon-guides','before']:
      ['surface-guides','behind','mask','outline','before'];
    var continuous=r.length===expected.length&&r.every(function(layer,i){
      return layer.name===expected[i]&&layer.count===layer.end-layer.start&&
        layer.start===(i?r[i-1].end:0);
    })&&r[r.length-1].end===p.length;
    var unique=new Set(p.map(function(x){return x.commandIndex;}));
    return {primitiveCount:p.length,continuousRanges:continuous,
      uniqueCommandIndices:unique.size,layerCounts:r.map(function(x){
        return {name:x.name,role:x.role,count:x.count};
      }),rendererReady:continuous&&unique.size===p.length&&
        p.every(function(x,i){return x.commandIndex===i;})};
  }
  function audit(composed){
    if(!composed||!composed.scene||!Array.isArray(composed.ranges))throw new TypeError('Composition required');
    var p=composed.scene.primitives,r=composed.ranges;
    var ids=p.map(function(x){return x.commandIndex;});
    var unique=new Set(ids);
    var continuous=r.length===4&&r[0].start===0&&r[3].end===p.length&&
      r.every(function(x,i){return x.count===x.end-x.start&&(i===0||r[i-1].end===x.start);});
    return {primitiveCount:p.length,uniqueCommandIndices:unique.size,
      duplicateCommandIndices:p.length-unique.size,continuousRanges:continuous,
      layerCounts:r.map(function(x){return {name:x.name,count:x.count};}),
      rendererReady:unique.size===p.length&&continuous&&ids.every(function(x,i){return x===i;})};
  }
  return {compose:compose,audit:audit,composeFull:composeFull,auditFull:auditFull};
}));
