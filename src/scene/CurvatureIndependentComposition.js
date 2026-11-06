/* Opt-in bridge from independent world-space geometry to existing scene renderers.
 * No legacy graph, DOM or Canvas dependencies. This module does not alter DrawModel.
 */
(function(root,factory){
  var api=factory(root.CurvatureGeometryEngine||(typeof require==='function'?require('../geometry/CurvatureGeometryEngine'):null),root.CurvatureSceneContract||(typeof require==='function'?require('./CurvatureSceneContract'):null),
    root.CurvaturePhysicalWorldGeometry||(typeof require==='function'?require('../geometry/CurvaturePhysicalWorldGeometry'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureIndependentComposition=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(engine,contract,physicalWorld){
  'use strict';
  if(!engine||!contract)throw new Error('Geometry engine and scene contract required');
  // Original DrawObjectsBehindHorizon/BeforeHorizon use distinct stroke
  // palettes for *whole objects*, then the white disk masks the rear layer.
  // Do not use this geometric cutoff in composeOpticalMain: physical ray
  // tracing, not the legacy painter partition, owns optical visibility.
  function copyIndependentPrimitive(primitive, commandIndex, stroke){
    var copy=Object.assign({},primitive,{commandIndex:commandIndex});
    if(primitive.style)copy.style=Object.assign({},primitive.style);
    if(primitive.metadata)copy.metadata=Object.assign({},primitive.metadata);
    if(stroke && (!copy.style || !copy.style.stroke))
      copy.style=Object.assign({},copy.style,{stroke:stroke});
    return copy;
  }
  function compose(model,objIx,globe,options){
    var composition=engine.createObjectHorizonComposition(model,objIx,globe,options);
    var primitives=[],ranges=[],nextIndex=0;
    composition.layers.forEach(function(layer,index){
      var first=nextIndex;
      layer.primitives.forEach(function(primitive){
        // The independent painter-order renderer joins projected triangles and
        // strokes by commandIndex. Without unique indices, fills are lost or
        // incorrectly attributed to a different polygon.
        var stroke=index===0?'#666':index===3?'black':null;
        primitives.push(copyIndependentPrimitive(primitive,nextIndex++,stroke));
      });
      ranges.push({name:['behind','mask','outline','before'][index],
        role:['objects','occlusion','visual-aid','objects'][index],
        start:first,end:nextIndex,count:nextIndex-first});
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
        var stroke=layer.role==='objects'?(layer.name==='behind'?'#666':'black'):null;
        primitives.push(copyIndependentPrimitive(p,primitives.length,stroke));
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
  // The main Canvas must render BOTH object groups, unlike controlled diagnostic
  // captures which intentionally isolate one group. Preserve the legacy draw
  // ordering: far groups (each with its horizon mask), guides, near groups.
  function composeMain(model,globe,options){
    options=options||{};
    var first=model.ObjDist[0]>model.ObjDist[1]?0:1;
    var order=[first,1-first].filter(function(i){return model.NObjects[i]>0;});
    // The globe horizon is a projected silhouette. A 128-sided world disk
    // introduces visible straight chords at ordinary main-Canvas zoom levels.
    // Increase only the interactive main-frame mask resolution; controlled
    // diagnostic captures retain their explicitly requested resolution.
    var mainOptions=Object.assign({segments:512},options);
    var cores=order.map(function(i){
      return {index:i,parts:engine.createObjectHorizonComposition(model,i,globe,mainOptions)};
    });
    var surface=globe?engine.globeSurfaceGuides(model):engine.flatSurfaceGuides(model,mainOptions);
    var horizonGuides=globe?engine.globeHorizonGuides(model,mainOptions):null;
    var layers=[];
    if(!globe)layers.push({name:'surface-guides',role:'visual-aid',scene:surface});
    cores.forEach(function(group){
      layers.push({name:'behind-'+group.index,role:'objects',scene:group.parts.behind});
      layers.push({name:'mask-'+group.index,role:'occlusion',scene:group.parts.mask});
    });
    if(globe){
      layers.push({name:'surface-guides',role:'visual-aid',scene:surface});
      layers.push({name:'horizon-guides',role:'visual-aid',scene:horizonGuides});
    }
    cores.forEach(function(group){
      layers.push({name:'before-'+group.index,role:'objects',scene:group.parts.before});
    });
    var primitives=[],ranges=[];
    layers.forEach(function(layer){
      var start=primitives.length;
      layer.scene.primitives.forEach(function(p){
        var stroke=layer.role==='objects'?
          (layer.name.indexOf('behind-')===0?'#666':'black'):null;
        primitives.push(copyIndependentPrimitive(p,primitives.length,stroke));
      });
      ranges.push({name:layer.name,role:layer.role,start:start,
        end:primitives.length,count:primitives.length-start});
    });
    var scene=contract.createScene('legacy',primitives,{
      generator:'CurvatureGeometryEngine',composition:'main-independent-groups',
      objectIndices:order,globe:!!globe,layerRanges:ranges,
      limitations:['World-space horizon disk differs from legacy pixel silhouette',
        'Optical overlays and data annotations remain on the legacy path']});
    return {scene:scene,ranges:ranges,requiresHorizonMask:cores.some(function(x){
      return x.parts.requiresHorizonMask;
    })};
  }
  // Optics-neutral scene for BOTH the independent painter and its physical
  // projection adapter. It carries the same surface guides and placed object
  // primitives as composeMain, but excludes the legacy horizon MASK and the
  // artificial behind/before styling partition. Ground occlusion belongs to
  // the optical backend, not to the scene author or painter.
  function composeOpticalMain(model,globe,options){
    options=options||{};
    var first=model.ObjDist[0]>model.ObjDist[1]?0:1;
    var order=[first,1-first].filter(function(i){return model.NObjects[i]>0;});
    // Geometric reference guides must not inherit the legacy effective
    // refraction radius. The physical atmosphere modifies ray directions,
    // never the underlying Earth radius or the vacuum tangent geometry.
    var physical=options.physicalWorld===true;
    var physicalCurvature=physical?(model.showModel===2?0:1/model.rEarth):null;
    var guideModel=model;
    if(globe&&!physical){
      var R=model.geometryRadius,H=model.Height,ratio=R/(R+H);
      guideModel=Object.assign({},model,{
        rDisk:R*Math.sqrt(Math.max(0,1-ratio*ratio)),
        zDisk:R+H-R*ratio,hDisk:R*ratio
      });
    }
    if(physical&&!physicalWorld)throw Error('Physical world geometry required');
    var surface=physical?physicalWorld.metricGuides({curvature:physicalCurvature,
      observerHeight:model.Height,showGrid:model.showGrid,
      maxDistance:100000,
      stroke:model.GlobeGridCol||model.FEGridCol}):
      globe?engine.globeSurfaceGuides(guideModel):engine.flatSurfaceGuides(model,
        Object.assign({segments:128},options));
    var horizon=physical?null:globe?engine.globeHorizonGuides(guideModel,options):null;
    var layers=[{name:'surface-guides',role:'visual-aid',scene:surface}];
    if(horizon)layers.push({name:'horizon-guides',role:'visual-aid',scene:horizon});
    order.forEach(function(i){
      layers.push({name:'objects-'+i,role:'objects',
        scene:engine.createObjectSequenceScene(model,i,globe,Object.assign(
          {opticsNeutral:true},physical?
          {physicalSurface:true,curvature:physicalCurvature}:{}))});
    });
    var primitives=[],ranges=[];
    layers.forEach(function(layer){
      var start=primitives.length;
      layer.scene.primitives.forEach(function(primitive){
        var p=Object.assign({},primitive,{commandIndex:primitives.length});
        if(primitive.metadata)p.metadata=Object.assign({},primitive.metadata);
        p.style=Object.assign({},primitive.style);
        if(layer.role==='objects'&&!p.style.stroke)p.style.stroke='black';
        primitives.push(p);
      });
      ranges.push({name:layer.name,role:layer.role,start:start,
        end:primitives.length,count:primitives.length-start});
    });
    return {scene:contract.createScene('legacy',primitives,{
      generator:'CurvatureGeometryEngine',composition:'optics-neutral-main',
      objectIndices:order,globe:!!globe,layerRanges:ranges,
      horizonGuideIsGeometric:!physical,physicalMetricWorld:physical,
      limitations:[physical?'Metric ground guide spacing is independent of radius/horizon; physical horizon is determined by the optical backend':'Surface grids and horizon lines are geometric reference guides, not refracted ground silhouettes',
        'Object visibility is delegated to the optical backend; there is no horizon painter mask']}),
      ranges:ranges,requiresHorizonMask:false};
  }
  function auditFull(composed){
    if(!composed||!composed.scene||!Array.isArray(composed.ranges))
      throw new TypeError('Composition required');
    var p=composed.scene.primitives,r=composed.ranges;
    var main=composed.scene.metadata.composition==='main-independent-groups';
    var expected=main?composed.ranges.map(function(x){return x.name;}):composed.scene.metadata.globe?
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
  return {compose:compose,audit:audit,composeFull:composeFull,composeMain:composeMain,composeOpticalMain:composeOpticalMain,auditFull:auditFull};
}));
