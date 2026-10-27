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
    root.CurvaturePhysicalGroundGuides||(typeof require==='function'?require('./CurvaturePhysicalGroundGuides'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvaturePhysicalSceneOptics=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract,fields,silhouette,groundGuides){
  'use strict';
  if(!contract||!fields||!silhouette||!groundGuides)throw Error('Physical scene optics dependencies required');
  var ATMOSPHERES=['vacuum','standard','exponential-occlusion','inverse-spherical'];
  function arrivalPoint(pair){
    var az=pair[0],el=pair[1],ce=Math.cos(el),range=1000;
    return [range*Math.sin(az)*ce,range*Math.cos(az)*ce,range*Math.sin(el)];
  }
  // Analytic, non-shooting vacuum path. This prevents a 3.5-second numerical
  // budget from hiding the second tower bank even when rays are straight.
  function vacuumSample(geometry,radius,eye,d,h){
    if(!(d>0&&h>=0))throw RangeError('Invalid vacuum target');
    if(geometry==='flat')return {status:'visible',angle:Math.atan2(h-eye,d),method:'vacuum-analytic'};
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
      model.showGrid,model.aDelta,model.rFEarth,model.aDip,
      options.atmosphere,options.occlusionRadius,
      options.settings||null]);
  }
  function bounds(primitives,geometry,radius,eye){
    var dmin=Infinity,dmax=0,hmin=Infinity,hmax=0;
    primitives.forEach(function(p){p.points.forEach(function(point){
      var q=silhouette.coordinate(point,geometry,radius,eye);
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
  function assemble(composed,results,geometry,guides){
    // Guides remain live presentation data. A pan may rotate the tangent
    // line without invalidating expensive, view-independent optical rays.
    var primitives=[],ranges=[],source=composed.scene.primitives;
    function append(name,role,items){
      var start=primitives.length;
      items.forEach(function(p){primitives.push(Object.assign({},p,{commandIndex:primitives.length}));});
      ranges.push({name:name,role:role,start:start,end:primitives.length,count:primitives.length-start});
    }
    var guideRanges=composed.ranges.filter(function(r){return r.role==='visual-aid';});
    guideRanges.forEach(function(r,i){
      append(r.name,'visual-aid',i===0?guides:[]);
    });
    append('physically-projected-objects','objects',results);
    var scene=contract.createScene('legacy',primitives,{
      generator:'CurvaturePhysicalSceneOptics',composition:'physical-projected-main',
      layerRanges:ranges,globe:geometry==='globe',
      limitations:['Ground grids are sampled through atmospheric optics and bounded by optical horizon; no surface fill',
        'All objects have physically clipped outlines; polygon fills and mutual occlusion are not yet projected']});
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
      if(!geometry||!(model.rEarth>0)||!Number.isFinite(model.Height)||model.Height<0)
        throw RangeError('Globe/Flat physical model required');
      var key=modelKey(model,{atmosphere:kind,occlusionRadius:R,settings:options.settings});
      if(cached&&cached.key===key)return {composition:assemble(composed,cached.results,geometry,cached.guides),
        stats:cached.stats,reused:true};
      // Representative profiles are smooth over kilometre scales. RK4 at
      // 2 km was checked against the 200 m shooting oracle; cap the step
      // relative to smaller geometric or engineered curvature radii.
      var characteristicRadius=kind==='standard'?model.rEarth:Math.min(model.rEarth,R);
      var automaticStep=Math.max(20,Math.min(2000,characteristicRadius/3000));
      var began=Date.now(),settings=Object.assign({maxBuildMs:null,
        step:automaticStep,fieldTolerance:1e-5,fieldAdaptiveDepth:3,
        fieldMaxAdaptiveCells:4096,angularTolerance:2e-5,
        minimumDepth:0,maximumDepth:10,maxSamples:25000},options.settings||{});
      if(settings.maxBuildMs!==null&&(!Number.isFinite(settings.maxBuildMs)||settings.maxBuildMs<0))
        throw RangeError('Invalid physical scene budget');
      var source=composed.scene.primitives,groups=composed.ranges.filter(function(r){return r.role==='objects';});
      var objects=[];
      groups.forEach(function(r){source.slice(r.start,r.end).forEach(function(p){
        objects.push(p);
      });});
      var field,fieldStats=null,span=null;
      if(kind==='vacuum')field={sample:function(d,h){return vacuumSample(geometry,model.rEarth,model.Height,d,h);}};
      else {
        span=bounds(objects,geometry,model.rEarth,model.Height);
        if(span)field=fields.create({geometry:geometry,radius:model.rEarth,
          observerHeight:model.Height,atmosphere:kind,
          profileOptions:kind==='inverse-spherical'||kind==='exponential-occlusion'?{occlusionRadius:R}:undefined,
          distances:span.distances,heights:span.heights,
          angleTolerance:settings.fieldTolerance,step:settings.step,
          adaptiveDepth:settings.fieldAdaptiveDepth,
          maxAdaptiveCells:settings.fieldMaxAdaptiveCells});
      }
      var deadline=settings.maxBuildMs===null?Infinity:Date.now()+settings.maxBuildMs,cutoff=false;
      var limited=field&&{sample:function(d,h){
        if(kind!=='vacuum'&&Date.now()>=deadline){cutoff=true;return {status:'solver_failed',reason:'preview-time-budget'};}
        return field.sample(d,h);
      }};
      var guideSource=[];
      composed.ranges.filter(function(r){return r.role==='visual-aid';}).forEach(function(r){
        guideSource.push.apply(guideSource,source.slice(r.start,r.end));
      });
      var guideProjection=groundGuides.create({model:model,geometry:geometry,
        atmosphere:kind,occlusionRadius:R,step:settings.step,maxDistance:Math.min(100000,model.rEarth*.1)});
      var physicalGuides=guideProjection.transform(guideSource);
      var results=[],stats={sourceObjects:objects.length,visibleSegments:0,
        unresolved:0,unresolvedReasons:{},sampleStatuses:{},perGroup:[],hiddenLeaves:0,
        fieldStats:null,fieldPrism:span?{
          minDistance:span.distances[0],maxDistance:span.distances[span.distances.length-1],
          minHeight:span.heights[0],maxHeight:span.heights[span.heights.length-1]
        }:null,budgetExceeded:false,
        atmosphere:kind,step:settings.step,guideIsGeometric:false,groundHorizon:guideProjection.horizonDistance,
        guideSolves:guideProjection.solves(),guideSegments:physicalGuides.length,
        guideRenderExtent:guideProjection.renderExtent,guideCulling:guideProjection.cullingStats()};
      function countInto(dest,source){Object.keys(source).forEach(function(k){
        dest[k]=(dest[k]||0)+source[k];
      });}
      // Small bank first so a long causeway cannot exhaust the numerical
      // budget before the important comparison/focus tower is processed.
      var prioritized=groups.slice().sort(function(a,b){return a.count-b.count;});
      prioritized.forEach(function(r){
        // Every authored primitive is represented. Fill-only polygons remain
        // outlines until true physical polygon clipping is available; they
        // must not silently disappear when the optics backend is switched.
        var prim=source.slice(r.start,r.end);
        if(!prim.length)return;
        if(!limited){stats.unresolved+=prim.length;return;}
        var projected=silhouette.projectPrimitives({primitives:prim,field:limited,
          geometry:geometry,radius:model.rEarth,observerHeight:model.Height,
          angularTolerance:settings.angularTolerance,minimumDepth:settings.minimumDepth,
          maximumDepth:settings.maximumDepth,maxSamples:settings.maxSamples});
        projected.segments.forEach(function(segment){
          var original=prim[segment.source.primitiveIndex];
          results.push({type:'line',mode:1,
            points:segment.points.map(arrivalPoint),
            style:Object.assign({stroke:(original.style&&original.style.stroke)||
              (original.style&&original.style.fill)||'black'},original.style),
            metadata:{kind:'physical-object-stroke',objectLayer:r.name,
              opticalSourceIndex:original.commandIndex}});
        });
        stats.visibleSegments+=projected.segments.length;
        stats.unresolved+=projected.unresolved.length;
        stats.hiddenLeaves+=projected.stats.hiddenLeaves;
        countInto(stats.unresolvedReasons,projected.stats.unresolvedReasons);
        countInto(stats.sampleStatuses,projected.stats.sampleStatuses);
        stats.perGroup.push({name:r.name,sourcePrimitives:prim.length,
          visibleSegments:projected.segments.length,unresolved:projected.unresolved.length,
          unresolvedReasons:projected.stats.unresolvedReasons});
      });
      if(field&&field.stats)fieldStats=field.stats();
      stats.fieldStats=fieldStats;stats.budgetExceeded=cutoff;stats.buildMs=Date.now()-began;
      // The only cached artifact is physical geometry; LIVE guides and
      // camera-dependent projections are rebuilt by the common painter.
      // A budget-expired preview is partial; never freeze it in the cache.
      if(!stats.budgetExceeded&&!stats.unresolvedReasons['sample-budget'])
        cached={key:key,stats:stats,results:results,guides:physicalGuides};
      else cached=null;
      return {composition:assemble(composed,results,geometry,physicalGuides),stats:stats,reused:false};
    }
    return {transform:transform,clearCache:function(){cached=null;}};
  }
  return {create:create,vacuumSample:vacuumSample,arrivalPoint:arrivalPoint};
}));
