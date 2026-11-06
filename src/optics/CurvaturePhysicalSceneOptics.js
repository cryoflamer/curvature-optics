/* Physical optics as a SCENE ADAPTER, not a Canvas renderer.
 * Consumes the same independently authored scene used by the painter.
 * Its only output is a painter-ready world frame with ray-arrival directions
 * and ground-hit-clipped strokes. Camera projection, styles, guides and
 * drawing remain the responsibility of CurvatureFrameRenderer.
 */
(function(root,factory){
  var api=factory(root.CurvatureSceneContract||(typeof require==='function'?require('../scene/CurvatureSceneContract'):null),
    root.CurvatureSharedRayField||(typeof require==='function'?require('./OpticalSharedRayField'):null),
    root.CurvatureOpticalTowerSilhouette||(typeof require==='function'?require('./OpticalTowerSilhouette'):null),
    root.CurvaturePhysicalGroundGuides||(typeof require==='function'?require('./CurvaturePhysicalGroundGuides'):null),
    root.CurvaturePhysicalPolygonFills||(typeof require==='function'?require('./CurvaturePhysicalPolygonFills'):null),
    root.CurvatureSurfaceGeometry||(typeof require==='function'?require('../geometry/CurvatureSurfaceGeometry'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePhysicalSceneOptics=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract,fields,silhouette,groundGuides,polygonFills,surfaceApi){
  'use strict';
  if(!contract||!fields||!silhouette||!groundGuides||!polygonFills)throw Error('Physical scene optics dependencies required');
  function clock(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  var ATMOSPHERES=['vacuum','standard','temperature-lapse','profile-transition','exponential-occlusion','inverse-spherical'];
  function arrivalPoint(pair){
    var az=pair[0],el=pair[1],ce=Math.cos(el),range=1000;
    return [range*Math.sin(az)*ce,range*Math.cos(az)*ce,range*Math.sin(el)];
  }
  // Analytic, non-shooting vacuum path. This prevents a 3.5-second numerical
  // budget from hiding the second tower bank even when rays are straight.
  function vacuumSample(geometry,radius,eye,d,h,physicalSurface){
    if(!(d>0&&h>=0))throw RangeError('Invalid vacuum target');
    if(geometry==='flat')return {status:'visible',angle:Math.atan2(h-eye,d),method:'vacuum-analytic'};
    if(physicalSurface){
      var s=surfaceApi.createFromCurvature(1/radius),p=s.surfacePoint2(d,h),
        horizon=(s.geometricHorizon(eye).dipAngle+s.geometricHorizon(h).dipAngle)*radius,
        gap=d-horizon,tol=Math.max(1e-6,1e-12*d);
      return {status:Math.abs(gap)<=tol?'indeterminate':gap>0?'blocked':'visible',
        angle:Math.atan2(p[1]-eye,p[0]),method:'vacuum-analytic'};
    }
    var theta=d/radius,dx=(radius+h)*Math.sin(theta),
      dz=(radius+h)*Math.cos(theta)-radius-eye;
    var horizon=radius*(Math.acos(radius/(radius+eye))+Math.acos(radius/(radius+h)));
    var gap=d-horizon,tol=Math.max(1e-6,1e-11*radius);
    return {status:Math.abs(gap)<=tol?'indeterminate':gap>0?'blocked':'visible',
      angle:Math.atan2(dz,dx),method:'vacuum-analytic'};
  }
  function modelKey(model,options){
    return JSON.stringify([model.showModel,model.rEarth,model.Height,
      model.ObjType,model.NObjects,model.ObjDist,model.ObjDeltaDist,
      model.ObjSidePos,model.ObjSideVar,model.ObjSideType,
      model.ObjSize,model.ObjSizeVar,model.ObjSizeType,
      model.showGrid,
      options.metricWorld?null:[model.aDelta,model.rFEarth,model.aDip],
      options.atmosphere,options.occlusionRadius,
      options.atmosphere==='temperature-lapse'?options.temperatureProfile:null,
      options.atmosphere==='profile-transition'?options.transitionProfile:null,
      options.atmosphere==='profile-transition'&&options.transitionProfile&&options.transitionProfile.source==='temperature-lapse'?options.temperatureProfile:null,
      options.settings||null]);
  }
  // Cache is keyed by the physically contributing scene as well as the model.
  // A style or vertex may change without a corresponding legacy model control.
  // Exact serialization avoids collisions; obsolete geometric reference aids
  // and camera attributes must not invalidate the optical result.
  function sceneKey(composed){
    var primitives=composed.scene.primitives;
    // These geometric debug guides are explicitly dropped by the physical
    // ground adapter. For example the tangent line rotates with camera PanRad,
    // but its optical contribution is always empty. Do NOT let that obsolete
    // legacy presentation line invalidate the camera-independent ray cache.
    var relevant=[];
    composed.ranges.forEach(function(r){
      for(var i=r.start;i<r.end;i++){
        var p=primitives[i],meta=p.metadata||{};
        if(r.role==='visual-aid'&&(meta.projection==='plane'||
            /horizon|tangent/.test(meta.kind||'')))continue;
        if(r.role!=='visual-aid'&&r.role!=='objects')continue;
        relevant.push([r.name,p.type,p.mode,p.points,p.style,p.metadata,p.commandIndex]);
      }
    });
    return JSON.stringify(relevant);
  }
  function bounds(primitives,geometry,radius,eye,physicalSurface){
    var metric=physicalSurface?surfaceApi.createFromCurvature(geometry==='globe'?1/radius:0):null;
    var dmin=Infinity,dmax=0,hmin=Infinity,hmax=0;
    primitives.forEach(function(p){p.points.forEach(function(point){
      var q=silhouette.coordinate(point,geometry,radius,eye,metric);
      if(q.distance>0&&(geometry==='flat'||q.distance<radius*Math.PI/2)&&q.height>=-1e-6){
        dmin=Math.min(dmin,q.distance);dmax=Math.max(dmax,q.distance);
        hmin=Math.min(hmin,Math.max(0,q.height));hmax=Math.max(hmax,Math.max(0,q.height));
      }
    });});
    if(!Number.isFinite(dmin))return null;
    var lo=Math.max(0.001,dmin-1),hi=Math.max(lo+1,dmax+1),
      hlo=Math.max(0,hmin-1),hhi=Math.max(hlo+1,hmax+1);
    if(geometry==='globe')hi=Math.min(hi,radius*Math.PI/2-1);
    var distances=[],heights=[];
    for(var i=0;i<=12;i++)distances.push(lo*Math.pow(hi/lo,i/12));
    for(var j=0;j<=3;j++)heights.push(hlo+(hhi-hlo)*j/3);
    return {distances:distances,heights:heights};
  }
  // Painter ordering: opaque foundations in nearer towers must cover the
  // geometry of farther towers. Depth is measured from the fixed observer,
  // not from the camera's Pan/Nick/Roll, so turning the view does not trigger
  // new atmospheric ray integrations or invalidate the optical composition.
  // For overlapping/intersecting meshes a real Z buffer would be required.
  function placedObjects(source,groups){
    var placed=[];
    groups.forEach(function(r){
      var byObject=new Map();
      source.slice(r.start,r.end).forEach(function(p){
        var meta=p.metadata||{},id=meta.placedObjectIndex;
        // Older or hand-authored scenes lacking placement metadata remain
        // one batch, preserving their original primitive order.
        var key=Number.isInteger(id)?id:'unknown';
        if(!byObject.has(key))byObject.set(key,[]);
        byObject.get(key).push(p);
      });
      byObject.forEach(function(primitives,id){
        var radial=0,n=0;
        primitives.forEach(function(p){p.points.forEach(function(v){
          radial+=Math.hypot(v[0],v[1]);n++;
        });});
        placed.push({name:r.name,id:id,primitives:primitives,
          distance:n?radial/n:0});
      });
    });
    // Stable in modern JS; explicit tie-break also makes tests deterministic.
    placed.sort(function(a,b){return b.distance-a.distance ||
      a.name.localeCompare(b.name) || String(a.id).localeCompare(String(b.id));});
    return placed;
  }
  // The Legacy far/near palette is keyed to the base of an authored tower.
  // In Physical the horizon is refracted: sample the very same qualified ray
  // field used for the outlines/fills, never model.rDisk or a geometric dip.
  // This classifies the tower's *footing*, not visibility of its upper parts;
  // partially visible upper struts are still clipped by the physical adapter.
  function opticalFootingVisibility(primitives,field,geometry,radius,eye,metricWorld){
    var foundation=primitives.find(function(p){return p.type==='polygon'&&
      p.style&&p.style.fill==='#a38d60'&&Array.isArray(p.points);});
    if(!foundation||!field||typeof field.sample!=='function')return 'unresolved';
    var surface=metricWorld&&surfaceApi?
      surfaceApi.createFromCurvature(geometry==='globe'?1/radius:0):null;
    var coords=foundation.points.map(function(point){
      return silhouette.coordinate(point,geometry,radius,eye,surface);
    });
    var lowest=Math.min.apply(null,coords.map(function(p){return p.height;}));
    // The authored foundation rests on h=0; small metric rounding errors
    // must not move its ray query off the physical ground surface.
    var feet=coords.filter(function(p){return Math.abs(p.height-lowest)<=0.01;});
    if(!feet.length)return 'unresolved';
    var distance=feet.reduce(function(sum,p){return sum+p.distance;},0)/feet.length;
    var height=Math.max(0,Math.abs(lowest)<0.01?0:lowest);
    if(!(distance>0)||(geometry==='globe'&&distance>=radius*Math.PI/2))return 'unresolved';
    var shot;
    try{shot=field.sample(distance,height);}catch(_error){return 'unresolved';}
    if(!shot)return 'unresolved';
    if(shot.status==='blocked')return 'blocked';
    if(shot.status==='visible'&&Number.isFinite(shot.angle))return 'visible';
    return 'unresolved';
  }
  function assemble(composed,results,geometry,guides,timings){
    // Guides remain live presentation data. A pan may rotate the tangent
    // line without invalidating expensive, view-independent optical rays.
    var primitives=[],ranges=[],source=composed.scene.primitives;
    function append(name,role,items){
      var start=primitives.length;
      // All returned guide and object primitives were freshly projected and
      // belong exclusively to this adapter. Pass those references onward;
      // the shared contract will validate before taking ownership.
      items.forEach(function(p){primitives.push(p);});
      ranges.push({name:name,role:role,start:start,end:primitives.length,count:primitives.length-start});
    }
    var guideRanges=composed.ranges.filter(function(r){return r.role==='visual-aid';});
    guideRanges.forEach(function(r,i){
      append(r.name,'visual-aid',i===0?guides:[]);
    });
    append('physically-projected-objects','objects',results);
    // This adapter owns every projected guide/outline/fill and hands off
    // ownership exactly once. Adopt after the SAME strict point validation,
    // without deep-cloning tens of thousands of new ground-guide segments.
    var adoptionStart=clock();
    var scene=contract.adoptScene('legacy',primitives,{
      generator:'CurvaturePhysicalSceneOptics',composition:'physical-projected-main',
      layerRanges:ranges,globe:geometry==='globe',
      limitations:['Ground grids are sampled through atmospheric optics and bounded by optical horizon; no surface fill',
        'Authored polygon fills are sampled and ground-clipped; mutual 3D mesh occlusion is not supported']});
    if(timings)timings.sceneAdoptionMs=clock()-adoptionStart;
    // These are the adapter's owned projected primitives, not source geometry.
    // The authored originals and their command indices are never modified.
    scene.primitives.forEach(function(p,i){p.commandIndex=i;});
    return {scene:scene,ranges:ranges};
  }
  function create(){
    var cached=null;
    function transform(composed,model,options){
      options=options||{};
      if(!composed||!composed.scene||!Array.isArray(composed.ranges)||
          composed.scene.metadata.composition!=='optics-neutral-main')
        throw TypeError('Optics-neutral scene composition required');
      var kind=options.atmosphere||'vacuum',R=options.occlusionRadius===undefined?6371000:options.occlusionRadius;
      if(!ATMOSPHERES.includes(kind)||!Number.isFinite(R)||R<=0)
        throw RangeError('Invalid physical atmospheric configuration');
      var geometry=model.showModel===1?'globe':model.showModel===2?'flat':null;
      var physicalSurface=composed.scene.metadata.physicalMetricWorld===true;
      if(!geometry||!(model.rEarth>0)||!Number.isFinite(model.Height)||model.Height<0)
        throw RangeError('Globe/Flat physical model required');
      var key=modelKey(model,{atmosphere:kind,occlusionRadius:R,temperatureProfile:options.temperatureProfile,transitionProfile:options.transitionProfile,settings:options.settings,
        metricWorld:composed.scene.metadata.physicalMetricWorld===true})+
        '\n'+sceneKey(composed);
      // The common frame/painter copies and validates its input scene. A
      // camera-only redraw may therefore reuse the optical composition itself
      // instead of rebuilding thousands of validated line primitives.
      if(cached&&!options.geometryAudit&&!options.onExactTarget&&!options.onExactResult&&!options.experimentalRayField&&cached.key===key)
        return {composition:cached.composition,stats:cached.stats,reused:true};
      if(options.experimentalRayField && (kind!=='standard'||
          typeof options.experimentalRayField.sample!=='function'||
          typeof options.experimentalRayField.exact!=='function'||
          !options.experimentalRayField.request||
          options.experimentalRayField.request.geometry!==geometry||
          options.experimentalRayField.request.radius!==model.rEarth||
          options.experimentalRayField.request.observerHeight!==model.Height||
          options.experimentalRayField.request.atmosphere!==kind))
        throw RangeError('Experimental GPU ray field does not match the physical scene');
      // At the exact endpoints, use the *original* named tracer paths, not
      // merely equivalent n(h)/dn(h) functions. This retains the production
      // Standard optimizations and preserves endpoint numerical behavior.
      var traceKind=kind;
      if(kind==='profile-transition'&&options.transitionProfile){
        if(options.transitionProfile.weight===0)traceKind=options.transitionProfile.source;
        else if(options.transitionProfile.weight===1)traceKind='exponential-occlusion';
      }
      // Representative profiles are smooth over kilometre scales. RK4 at
      // 2 km was checked against the 200 m shooting oracle; cap the step
      // relative to smaller geometric or engineered curvature radii.
      var characteristicRadius=traceKind==='standard'||traceKind==='temperature-lapse'?model.rEarth:Math.min(model.rEarth,R);
      var automaticStep=Math.max(20,Math.min(2000,characteristicRadius/3000));
      var began=Date.now(),settings=Object.assign({maxBuildMs:null,
        step:automaticStep,fieldTolerance:1e-5,fieldAdaptiveDepth:3,
        fieldMaxAdaptiveCells:4096,angularTolerance:2e-5,
        minimumDepth:0,maximumDepth:10,maxSamples:25000},options.settings||{});
      if(settings.maxBuildMs!==null&&(!Number.isFinite(settings.maxBuildMs)||settings.maxBuildMs<0))
        throw RangeError('Invalid physical scene budget');
      var startedProfile=clock();
      var source=composed.scene.primitives,groups=composed.ranges.filter(function(r){return r.role==='objects';});
      var objects=[];
      groups.forEach(function(r){source.slice(r.start,r.end).forEach(function(p){
        objects.push(p);
      });});
      var field,fieldStats=null,span=null;
      if(kind==='vacuum')field={sample:function(d,h){return vacuumSample(geometry,model.rEarth,model.Height,d,h,physicalSurface);}};
      else {
        span=bounds(objects,geometry,model.rEarth,model.Height,physicalSurface);
        // #140.12.12: opt-in precomputed GPU-first grid serves both outlines
        // and fills directly. No CPU shooting is invoked to discover requests
        // or fill gaps. Failed GPU cells stay unresolved, not silently CPU-corrected.
        if(span&&options.experimentalRayField&&options.experimentalRayField.fullCoverageGrid)
          field=options.experimentalRayField;
        else if(span)field=fields.create({geometry:geometry,radius:model.rEarth,
          observerHeight:model.Height,atmosphere:traceKind,
          profileOptions:traceKind==='temperature-lapse'?options.temperatureProfile:
            traceKind==='profile-transition'?{transitionProfile:options.transitionProfile,
              temperatureProfile:options.temperatureProfile,occlusionRadius:R}:
            traceKind==='inverse-spherical'||traceKind==='exponential-occlusion'?{occlusionRadius:R}:undefined,
          distances:span.distances,heights:span.heights,
          angleTolerance:settings.fieldTolerance,step:settings.step,
          adaptiveDepth:settings.fieldAdaptiveDepth,
          maxAdaptiveCells:settings.fieldMaxAdaptiveCells,
          shootingOptimization:settings.shootingOptimization,
          traceOptimization:settings.traceOptimization,
          profileShootingStages:settings.profileShootingStages,
          shootingWarmStart:settings.shootingWarmStart,
          surfaceArithmetic:settings.surfaceArithmetic,
          onExactTarget:options.onExactTarget,
          onExactResult:options.onExactResult,
          experimentalRayField:options.experimentalRayField});
      }
      var fieldSetupMs=clock()-startedProfile;
      var deadline=settings.maxBuildMs===null?Infinity:Date.now()+settings.maxBuildMs,cutoff=false;
      var limited=field&&{sample:function(d,h){
        if(kind!=='vacuum'&&Date.now()>=deadline){cutoff=true;return {status:'solver_failed',reason:'preview-time-budget'};}
        return field.sample(d,h);
      }};
      var guideSource=[];
      composed.ranges.filter(function(r){return r.role==='visual-aid';}).forEach(function(r){
        guideSource.push.apply(guideSource,source.slice(r.start,r.end));
      });
      // Ground h=0 and tower h>=0 use the SAME exact RK4 oracle/cache.
      // The radial surface table still limits ground tessellation and never
      // extrapolates a physical horizon from the prism bounds.
      // Count NEW target oracles and their shooting trials separately from
      // cache hits, at the point where work is actually performed. These
      // counters are nested: evaluations are trial angles *per target solve*,
      // while RK4 calls are the individual integration steps of those trials.
      var WORK_FIELDS=['solves','hits','interpolations','fallbacks','shootEvaluations',
        'shootRK4Calls','predictorAttempts','predictorAccepted','predictorFallbacks',
        'warmStartAttempts','warmStartAccepted','warmStartMisses',
        'clearGroundSteps','fullGroundEventSteps','exactSolveMs'];
      function counters(){return field&&field.stats?field.stats():null;}
      function workDelta(before,after){
        if(!before||!after)return null;
        var difference={};WORK_FIELDS.forEach(function(key){
          difference[key]=(after[key]||0)-(before[key]||0);
        });
        return difference;
      }
      function addWork(target,delta){
        if(!delta)return;
        WORK_FIELDS.forEach(function(key){target[key]=(target[key]||0)+delta[key];});
      }
      var groundBefore=counters();
      var guideProjection=groundGuides.create({model:model,geometry:geometry,
        atmosphere:traceKind,occlusionRadius:R,temperatureProfile:options.temperatureProfile,transitionProfile:options.transitionProfile,step:settings.step,
        metricGrid:physicalSurface,
        maxDistance:Math.min(100000,model.rEarth*.1),
        sampleGround:kind!=='vacuum'&&field?function(d){return field.exact(d,0);}:null});
      var physicalGuides=guideProjection.transform(guideSource);
      var groundGuidesMs=clock()-startedProfile-fieldSetupMs;
      var groundAfter=counters();
      var phaseWork={ground:workDelta(groundBefore,groundAfter),outlines:{},fills:{}};
      var workCheckpoint=groundAfter;
      var groundFieldSolves=groundAfter?groundAfter.solves-groundBefore.solves:0;
      var groundCacheHits=groundAfter?groundAfter.hits-groundBefore.hits:0;
      var results=[],stats={sourceObjects:objects.length,physicalMetricWorld:physicalSurface,
        visibleSegments:0,
        unresolved:0,unresolvedReasons:{},sampleStatuses:{},perGroup:[],hiddenLeaves:0,
        boundaryClipped:0,maxBoundaryGapMetres:0,boundaryGapMetres:0,boundaryGrazingStops:0,
        fieldStats:null,perObject:[],fieldPrism:span?{
          minDistance:span.distances[0],maxDistance:span.distances[span.distances.length-1],
          minHeight:span.heights[0],maxHeight:span.heights[span.heights.length-1]
        }:null,budgetExceeded:false,
        atmosphere:kind,step:settings.step,guideIsGeometric:false,groundHorizon:guideProjection.horizonDistance,
        guideSolves:guideProjection.solves(),sharedGroundSolves:groundFieldSolves,
        sharedGroundCacheHits:groundCacheHits,guideSegments:physicalGuides.length,
        guideRenderExtent:guideProjection.renderExtent,guideCulling:guideProjection.cullingStats(),
        fillTriangles:0,fillUnresolved:0,fillHidden:0,fillSubdivisions:0,fillSamples:0,
        fillUnresolvedReasons:{}};
      function countInto(dest,source){Object.keys(source).forEach(function(k){
        dest[k]=(dest[k]||0)+source[k];
      });}
      // Each placed tower is an atomic painter batch: FARTHER first, then
      // its own fills followed by its own outlines. Drawing the whole bank's
      // fills and only then its strokes made far tower strokes cross foreground
      // foundations regardless of the bank sorting order.
      var prioritized=placedObjects(source,groups);
      var outlinesMs=0,fillsMs=0;
      prioritized.forEach(function(r){
        var prim=r.primitives;
        if(!prim.length)return;
        if(!limited){stats.unresolved+=prim.length;return;}
        var beganOutline=clock();
        var footing=opticalFootingVisibility(prim,limited,geometry,model.rEarth,
          model.Height,physicalSurface);
        var projected=silhouette.projectPrimitives({primitives:prim,field:limited,
          geometry:geometry,radius:model.rEarth,observerHeight:model.Height,
          physicalSurface:physicalSurface,
          onUnresolved:options.geometryAudit&&function(item){
            var origin=prim[item.source.primitiveIndex];
            options.geometryAudit.onUnresolved(Object.assign({phase:'outline',
              sourceId:origin&&origin.commandIndex,objectLayer:r.name},item));
          },
          angularTolerance:settings.angularTolerance,minimumDepth:settings.minimumDepth,
          maximumDepth:settings.maximumDepth,maxSamples:settings.maxSamples});
        outlinesMs+=clock()-beganOutline;
        var afterOutline=counters();
        addWork(phaseWork.outlines,workDelta(workCheckpoint,afterOutline));
        workCheckpoint=afterOutline;
        var beganFill=clock();
        // Only authored filled polygons participate: tower struts remain
        // strokes, while their foundation polygons regain their actual fill.
        // The polygon adapter reuses the exact SAME qualified field as outlines.
        var fills=polygonFills.project({polygons:prim,field:limited,
          geometry:geometry,radius:model.rEarth,observerHeight:model.Height,
          physicalSurface:physicalSurface,
          angularTolerance:settings.angularTolerance,maximumDepth:7,
          maxSamples:settings.maxSamples,layer:r.name,
          onUnresolved:options.geometryAudit&&function(item){
            options.geometryAudit.onUnresolved(Object.assign({phase:'fill',objectLayer:r.name},item));
          }});
        fillsMs+=clock()-beganFill;
        var afterFill=counters();
        addWork(phaseWork.fills,workDelta(workCheckpoint,afterFill));
        workCheckpoint=afterFill;
        fills.primitives.forEach(function(p){
          if(footing==='blocked'&&p.style&&p.style.fill==='#a38d60')
            p.style=Object.assign({},p.style,{fill:'#dcc493'});
          results.push(p);
        });
        stats.fillTriangles+=fills.stats.fillTriangles;
        stats.fillUnresolved+=fills.stats.unresolvedTriangles;
        stats.fillHidden+=fills.stats.hiddenTriangles;
        stats.fillSubdivisions+=fills.stats.subdivisions;
        stats.fillSamples+=fills.stats.samples;
        countInto(stats.fillUnresolvedReasons,fills.stats.unresolvedReasons);
        projected.segments.forEach(function(segment){
          var original=prim[segment.source.primitiveIndex];
          var stroke=Object.assign({stroke:(original.style&&original.style.stroke)||
            (original.style&&original.style.fill)||'black'},original.style);
          if(footing==='blocked')stroke.stroke='#666';
          results.push({type:'line',mode:1,
            points:segment.points.map(arrivalPoint),style:stroke,
            metadata:{kind:'physical-object-stroke',objectLayer:r.name,
              opticalSourceIndex:original.commandIndex}});
        });
        stats.visibleSegments+=projected.segments.length;
        stats.unresolved+=projected.unresolved.length;
        stats.hiddenLeaves+=projected.stats.hiddenLeaves;
        stats.boundaryClipped+=projected.stats.boundaryClipped;
        stats.boundaryGrazingStops+=projected.stats.boundaryGrazingStops;
        stats.maxBoundaryGapMetres=Math.max(stats.maxBoundaryGapMetres,
          projected.stats.maxBoundaryGapMetres);
        stats.boundaryGapMetres+=projected.stats.boundaryGapMetres;
        countInto(stats.unresolvedReasons,projected.stats.unresolvedReasons);
        countInto(stats.sampleStatuses,projected.stats.sampleStatuses);
        // Public perGroup metrics remain aggregated by bank for the existing
        // diagnostics/tests. New perObject metrics expose painter Z ordering.
        var one={name:r.name,placedObjectIndex:r.id,distance:r.distance,
          footingVisibility:footing,fillTriangles:fills.stats.fillTriangles,
          fillUnresolved:fills.stats.unresolvedTriangles,sourcePrimitives:prim.length,
          visibleSegments:projected.segments.length,unresolved:projected.unresolved.length,
          boundaryClipped:projected.stats.boundaryClipped,
          unresolvedReasons:projected.stats.unresolvedReasons};
        stats.perObject.push(one);
        var bank=stats.perGroup.find(function(g){return g.name===r.name;});
        if(!bank){bank={name:r.name,fillTriangles:0,fillUnresolved:0,
          sourcePrimitives:0,visibleSegments:0,unresolved:0,boundaryClipped:0,unresolvedReasons:{}};
          stats.perGroup.push(bank);}
        bank.fillTriangles+=one.fillTriangles;bank.fillUnresolved+=one.fillUnresolved;
        bank.sourcePrimitives+=one.sourcePrimitives;
        bank.visibleSegments+=one.visibleSegments;bank.unresolved+=one.unresolved;
        bank.boundaryClipped+=one.boundaryClipped;
        countInto(bank.unresolvedReasons,one.unresolvedReasons);
      });
      if(field&&field.stats)fieldStats=field.stats();
      stats.fieldStats=fieldStats;
      stats.opticalWork=fieldStats?phaseWork:null;
      stats.towerSolves=fieldStats?fieldStats.solves-groundFieldSolves:0;
      stats.budgetExceeded=cutoff;stats.buildMs=Date.now()-began;
      // Cache the camera-independent physical scene INCLUDING its optical
      // ground guides. The common painter still rebuilds camera-dependent
      // frames and pixel projections on every redraw. A budget-expired
      // preview is partial; never freeze it in the cache.
      var assemblyStarted=clock();
      var assemblyDetail={};
      var presentation=assemble(composed,results,geometry,physicalGuides,assemblyDetail);
      if(options.geometryAudit&&typeof options.geometryAudit.onScene==='function')
        options.geometryAudit.onScene(presentation.scene,stats);
      stats.opticalStages={sceneAdoptionMs:assemblyDetail.sceneAdoptionMs,fieldSetupMs:fieldSetupMs,groundGuidesMs:groundGuidesMs,
        outlinesMs:outlinesMs,fillsMs:fillsMs,assemblyMs:clock()-assemblyStarted,
        exactSolveMs:fieldStats&&fieldStats.exactSolveMs||0};
      if(!options.geometryAudit&&!options.onExactTarget&&!options.onExactResult&&!options.experimentalRayField&&
          !stats.budgetExceeded&&!stats.unresolvedReasons['sample-budget']&&!stats.fillUnresolvedReasons['optical-solver'])
        cached={key:key,stats:stats,composition:presentation};
      else cached=null;
      return {composition:presentation,stats:stats,reused:false};
    }
    return {transform:transform,clearCache:function(){cached=null;}};
  }
  return {geometryAuditRevision:'140.12.37.2',create:create,vacuumSample:vacuumSample,
    arrivalPoint:arrivalPoint,placedObjects:placedObjects,
    opticalFootingVisibility:opticalFootingVisibility};
}));
