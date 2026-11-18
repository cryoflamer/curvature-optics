/* Experimental effective-curvature preview: straight rays on a locally
 * effective signed surface, with non-recursive object projection.
 * Independent of Legacy drawing.
 * Not a certified visibility solver, nor a replacement for Accurate optics.
 */
(function(root,factory){
  var api=factory(root.CurvatureSceneContract||(typeof require==='function'?require('../scene/CurvatureSceneContract'):null),
    root.CurvatureOpticalTowerSilhouette||(typeof require==='function'?require('./OpticalTowerSilhouette'):null),
    root.CurvaturePhysicalPolygonFills||(typeof require==='function'?require('./CurvaturePhysicalPolygonFills'):null),
    root.CurvaturePhysicalGroundGuides||(typeof require==='function'?require('./CurvaturePhysicalGroundGuides'):null),
    root.CurvatureSurfaceGeometry||(typeof require==='function'?require('../geometry/CurvatureSurfaceGeometry'):null),
    root.CurvatureRayTracer||(typeof require==='function'?require('./OpticalRayTracer'):null),
    root.CurvaturePhysicalSceneOptics||(typeof require==='function'?require('./CurvaturePhysicalSceneOptics'):null),
    root.CurvatureOpticalPreviewLod||(typeof require==='function'?require('./OpticalPreviewLod'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureOpticalEffectiveRadiusPreview=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract,silhouette,polygons,ground,surfaces,tracer,physical,lod){
  'use strict';
  if(!contract||!silhouette||!polygons||!ground||!surfaces||!tracer||!physical||!lod)
    throw Error('Effective Radius Preview requires the Modern optical dependencies');
  function clock(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function between(a,b,t){return a.map(function(v,i){return v+(b[i]-v)*t;});}
  function arrival(az,el){var c=Math.cos(el);return [1000*Math.sin(az)*c,1000*Math.cos(az)*c,1000*Math.sin(el)];}
  function resolveParameters(model,options,interactive){
    options=options||{};
    if(!model||!(model.rEarth>0)||!(model.Height>=0)||!Number.isFinite(model.Height))
      throw RangeError('Invalid Effective Radius geometry');
    var globe=model.showModel===1,flat=model.showModel===2;
    if(!globe&&!flat)throw RangeError('Effective Radius requires Globe or Flat');
    var kind=options.atmosphere||'vacuum';
    var simple=['vacuum','standard','temperature-lapse'];
    var all=simple.concat(['profile-transition','inverse-temperature',
      'inverse-spherical','exponential-occlusion']);
    if(!(interactive?all:simple).includes(kind))
      throw RangeError('Effective Radius supports Vacuum, Standard and Temperature lapse only');
    // Canvas Direct uses exactly the existing physical profile's local n(h)
    // and dn(h); no new ray tracer, atmosphere, or assumed constant k is added.
    // The explicit Effective Radius mode remains restricted to its qualified set.
    var profileOptions=kind==='temperature-lapse'?options.temperatureProfile:
      kind==='profile-transition'?{temperatureProfile:options.temperatureProfile,
        transitionProfile:options.transitionProfile,occlusionRadius:options.occlusionRadius}:
      kind==='inverse-temperature'?{temperatureProfile:options.temperatureProfile,
        inverseProfile:options.inverseProfile,occlusionRadius:options.occlusionRadius}:
      {occlusionRadius:options.occlusionRadius};
    var atmosphere=tracer.atmosphere(kind,profileOptions);
    var index=atmosphere.n(model.Height),gradient=atmosphere.dn(model.Height);
    if(!(index>0)||!Number.isFinite(gradient))throw RangeError('Invalid local atmospheric gradient');
    // The tangent-frame approximation subtracts downward ray curvature from
    // physical surface curvature: C_eff = C_surface + (dn/dh)/n.
    // Flat Standard therefore has NEGATIVE effective curvature: it is a
    // locally concave-up virtual surface viewed with straight rays. Use the
    // nominal Earth radius only to report dimensionless refraction k on Flat;
    // Flat geometry and its curvature are independent of model.rEarth.
    var referenceRadius=globe?model.rEarth:6371000;
    var k=gradient===0?0:-referenceRadius*gradient/index;
    if(!Number.isFinite(k)||(!interactive&&(k<=-1||k>=0.95)))
      throw RangeError('Local Effective Radius approximation is unsupported at this curvature');
    var curvature=globe?(1-k)/model.rEarth:gradient/index;
    // During motion, upward-bending engineered profiles on physical Flat
    // yield POSITIVE virtual curvature. The direct painter supports this
    // signed embedding without adding a true physical Flat horizon or RK4.
    if(!interactive&&flat&&curvature>0)
      throw RangeError('Flat Effective Radius supports downward or zero local ray bending only');
    if(globe&&!(curvature>0))
      throw RangeError('Globe Effective Radius requires positive effective curvature');
    return {geometry:globe?'globe':'flat',radius:model.rEarth,
      effectiveCurvature:curvature,
      effectiveRadius:globe?model.rEarth/(1-k):curvature===0?Infinity:1/curvature,
      eye:model.Height,atmosphere:kind,k:k};
  }
  function parameters(model,options){return resolveParameters(model,options,false);}
  // Wider, explicitly approximate eligibility for live Canvas Direct only.
  function canvasDirectParameters(model,options){return resolveParameters(model,options,true);}
  function ray(p,d,h){
    if(!Number.isFinite(d)||!Number.isFinite(h)||d<0||h<0)return {status:'blocked'};
    if(d===0)return {status:'visible',angle:h>=p.eye?Math.PI/2:-Math.PI/2};
    if(p.geometry==='flat'&&p.effectiveCurvature===0)
      return {status:'visible',angle:Math.atan2(h-p.eye,d)};
    var r=p.effectiveRadius,t=d/r;
    if(Math.abs(t)>=Math.PI/2)return {status:'blocked'};
    // A negative virtual curvature on Flat has no ground horizon. The same
    // signed-circle chord formula gives the local straight-ray elevation.
    if(p.geometry==='globe'){
      var horizon=r*(Math.acos(r/(r+p.eye))+Math.acos(r/(r+h)));
      if(d>horizon+0.01)return {status:'blocked'};
    }
    var dx=(r+h)*Math.sin(t),dz=h-p.eye-2*(r+h)*Math.sin(t/2)**2;
    return {status:'visible',angle:Math.atan2(dz,dx)};
  }
  function create(){
    // An animation changes observer pose almost every frame; serializing the
    // entire authored mesh to test a cache key is slower than a cold projection.
    function transform(composed,model,options){
      options=options||{};
      if(!composed||!composed.scene||composed.scene.metadata.composition!=='optics-neutral-main'||
        !Array.isArray(composed.ranges))throw TypeError('Optics-neutral composition required');
      var started=clock(),p=parameters(model,options),stride=options.previewLod?
        lod.validateStride(options.previewLod.stride):1;
      var metric=composed.scene.metadata.physicalMetricWorld===true?
        surfaces.createFromCurvature(p.geometry==='globe'?1/p.radius:0):null;
      var samples=new Map(),sampleCount=0;
      function sample(world){
        var key=world.join(',');if(samples.has(key))return samples.get(key);
        var q=silhouette.coordinate(world,p.geometry,p.radius,p.eye,metric);
        var shot=q.height< -1e-6?{status:'blocked'}:ray(p,q.distance,Math.max(0,q.height));
        var point={world:world,status:shot.status,
          projected:shot.status==='visible'?arrival(q.azimuth,shot.angle):null};
        samples.set(key,point);sampleCount++;return point;
      }
      function crossing(a,b){
        var yes=a.status==='visible'?a:b,no=a.status==='visible'?b:a;
        for(var j=0;j<12;j++){
          var mid=sample(between(yes.world,no.world,.5));
          if(mid.status==='visible')yes=mid;else no=mid;
        }
        return yes;
      }
      var projectedObjects=[],strokeBatch=[],fillBatch=[],visibleSegments=0,
        triangleCount=0,hidden=0,clipped=0;
      function emitStroke(a,b,source,layer){
        if(a.status!=='visible'||b.status!=='visible')return;
        strokeBatch.push({type:'line',mode:1,points:[a.projected,b.projected],
          style:Object.assign({stroke:source.style&&source.style.fill||'black'},source.style),
          metadata:{kind:'physical-object-stroke',objectLayer:layer,
            opticalSourceIndex:source.commandIndex}});visibleSegments++;
      }
      function edge(a,b,source,layer){
        var mid=sample(between(a.world,b.world,.5));
        if(a.status==='visible'&&b.status==='visible'&&mid.status==='visible'){
          emitStroke(a,b,source,layer);return;
        }
        if(a.status==='blocked'&&b.status==='blocked'&&mid.status==='blocked'){
          hidden++;return;
        }
        [[a,mid],[mid,b]].forEach(function(pair){
          var left=pair[0],right=pair[1];
          if(left.status==='blocked'&&right.status==='blocked')return;
          if(left.status!==right.status){
            var contact=crossing(left,right);clipped++;
            if(left.status==='visible')right=contact;else left=contact;
          }
          emitStroke(left,right,source,layer);
        });
      }
      function fillTriangle(a,b,c,source,layer){
        var vertices=[sample(a),sample(b),sample(c)],ring=[];
        for(var i=0;i<3;i++){
          var current=vertices[i],next=vertices[(i+1)%3];
          if(current.status==='visible')ring.push(current);
          if(current.status!==next.status){ring.push(crossing(current,next));clipped++;}
        }
        if(ring.length<3){hidden++;return;}
        // A very large triangle may conceal a horizon crossing even when
        // its three corners are visible. Prefer omission to false visibility.
        if(vertices.every(function(v){return v.status==='visible';})&&
          sample(between(between(a,b,.5),c,1/3)).status!=='visible'){
          hidden++;return;
        }
        for(var j=1;j<ring.length-1;j++){
          fillBatch.push({type:'polygon',mode:2,
            points:[ring[0].projected,ring[j].projected,ring[j+1].projected],
            style:Object.assign({},source.style),
            metadata:{kind:'physical-object-fill',objectLayer:layer,
              opticalSourceIndex:source.commandIndex}});triangleCount++;
        }
      }
      var source=composed.scene.primitives;
      var objectGroups=composed.ranges.filter(function(r){return r.role==='objects';});
      var placed=physical.placedObjects(source,objectGroups);
      var selection=lod.thin(placed,model,stride),geometryStarted=clock();
      selection.objects.forEach(function(entry){
        strokeBatch=[];fillBatch=[];
        entry.primitives.forEach(function(original){
          var points=original.points,closed=original.type==='polygon';
          for(var i=0;i<(closed?points.length:points.length-1);i++)
            edge(sample(points[i]),sample(points[(i+1)%points.length]),original,entry.name);
          if(closed&&(original.mode&2)){
            var mesh=polygons.planeTriangles(points);
            if(!mesh.reason)mesh.triangles.forEach(function(t){
              fillTriangle(t[0],t[1],t[2],original,entry.name);
            });
          }
        });
        // Opaque fill first, then outlines for each far-to-near placed object.
        projectedObjects.push.apply(projectedObjects,fillBatch);
        projectedObjects.push.apply(projectedObjects,strokeBatch);
      });
      var geometryMs=clock()-geometryStarted;
      var guideSource=[];
      composed.ranges.filter(function(r){return r.role==='visual-aid';}).forEach(function(r){
        guideSource.push.apply(guideSource,source.slice(r.start,r.end));
      });
      var guideProjection=ground.create({model:model,geometry:p.geometry,
        atmosphere:p.k===0?'vacuum':'standard',metricGrid:!!metric,
        occlusionRadius:p.radius,maxDistance:metric?composed.scene.metadata.metricGuideExtentMetres:
          Math.min(100000,p.radius*.1),sampleGround:function(d){return ray(p,d,0);}});
      var projectedGuides=guideProjection.transform(guideSource);
      var guideMs=clock()-geometryStarted-geometryMs;
      var primitives=[],ranges=[];
      function append(name,role,items){var from=primitives.length;
        primitives.push.apply(primitives,items);
        ranges.push({name:name,role:role,start:from,end:primitives.length,count:primitives.length-from});
      }
      composed.ranges.filter(function(r){return r.role==='visual-aid';}).forEach(function(r,i){
        append(r.name,'visual-aid',i===0?projectedGuides:[]);
      });
      append('effective-radius-objects','objects',projectedObjects);
      var scene=contract.adoptScene('legacy',primitives,{generator:'OpticalEffectiveRadiusPreview',
        composition:'physical-projected-main',layerRanges:ranges,globe:p.geometry==='globe',
        limitations:['Local constant-k atmosphere, not altitude-varying ray tracing',
          'Approximate piecewise-linear horizon clipping, not certified visibility',
          'No mutual mesh depth testing']});
      scene.primitives.forEach(function(item,i){item.commandIndex=i;});
      var stats={sourceObjects:selection.original,visibleSegments:visibleSegments,
        unresolved:0,unresolvedReasons:{},sampleStatuses:{},perGroup:[],
        fillTriangles:triangleCount,fillUnresolved:0,fillHidden:hidden,fillSamples:sampleCount,
        fillSubdivisions:0,fillUnresolvedReasons:{},
        opticalQuality:'effective-radius',atmosphere:p.atmosphere,refractionK:p.k,
        effectiveRadius:p.effectiveRadius,previewLod:{stride:stride,original:selection.original,
          selected:selection.selected,skipped:selection.skipped},physicalMetricWorld:!!metric,
        fieldStats:null,fieldPrism:null,budgetExceeded:false,buildMs:clock()-started,
        groundHorizon:guideProjection.horizonDistance,guideSegments:projectedGuides.length,
        guideSolves:guideProjection.solves(),sharedGroundSolves:0,sharedGroundCacheHits:0,
        towerSolves:0,guideRenderExtent:guideProjection.renderExtent,
        guideCulling:guideProjection.cullingStats(),boundaryClipped:clipped,
        opticalStages:{fieldSetupMs:0,groundGuidesMs:guideMs,outlinesMs:geometryMs,
          fillsMs:0,assemblyMs:clock()-started-geometryMs-guideMs,
          exactSolveMs:0,sceneAdoptionMs:0}};
      return {composition:{scene:scene,ranges:ranges},stats:stats,reused:false};
    }
    return Object.freeze({transform:transform,clearCache:function(){}});
  }
  return Object.freeze({create:create,parameters:parameters,
    canvasDirectParameters:canvasDirectParameters,ray:ray});
}));
