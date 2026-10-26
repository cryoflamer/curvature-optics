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
    var composition=engine.createTowerHorizonComposition(model,objIx,globe,options);
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
      composition:'tower-horizon',objectIndex:objIx,globe:!!globe,
      layerRanges:ranges,approximation:'fixed-world-polygon',
      limitations:['Only type-2 towers and horizon are included',
        'World-polygon horizon is not pixel-identical to legacy CircleOnPlane',
        'Legacy camera and additional scene objects are not independently generated']});
    return {scene:scene,ranges:ranges,cutoffAngle:composition.cutoffAngle,
      requiresHorizonMask:composition.requiresHorizonMask};
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
  return {compose:compose,audit:audit};
}));
