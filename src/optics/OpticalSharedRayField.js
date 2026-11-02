/* Shared, explicitly scoped, 2D optical projection cache for the tower prism.
 * No Canvas/legacy dependencies. Distances are flat horizontal ranges or
 * Globe surface arc lengths; heights are above their respective surfaces.
 * Only independently checked smooth visible cells may be interpolated.
 */
(function (root, factory) {
  var api = factory(typeof module === 'object' && module.exports
    ? require('./OpticalTargetProjection') : root.CurvatureTargetProjection,
    typeof module === 'object' && module.exports
      ? require('../geometry/CurvatureSurfaceGeometry') : root.CurvatureSurfaceGeometry,
    typeof module === 'object' && module.exports
      ? require('./OpticalConformalPredictor') : root.CurvatureOpticalConformalPredictor);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CurvatureSharedRayField = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (projection,surfaces,conformal) {
  'use strict';
  function axis(values, name, positive) {
    if (!Array.isArray(values) || values.length < 2 ||
        values.some(function (v, i) { return !Number.isFinite(v) ||
          (positive && v <= 0) || (i > 0 && v <= values[i - 1]); }))
      throw Error('Invalid increasing ' + name + ' axis');
    return values.slice();
  }
  if(!surfaces)throw Error('Continuous-curvature surface geometry dependency required');
  function interval(values, x) {
    if (x < values[0] || x > values[values.length - 1]) return -1;
    if (x === values[values.length - 1]) return values.length - 2;
    var lo=0, hi=values.length-1;
    while (hi-lo>1) {
      var mid=(lo+hi)>>1;
      if (values[mid] <= x) lo=mid; else hi=mid;
    }
    return lo;
  }
  function create(options) {
    options=options || {};
    var distances=axis(options.distances,'distance',true);
    var heights=axis(options.heights,'height',false);
    if (heights[0] < 0) throw Error('Field heights cannot be negative');
    var explicit=Object.prototype.hasOwnProperty.call(options,'curvature');
    var k=options.curvature;
    if(explicit&&(!Number.isFinite(k)||k<0))throw Error('Invalid shared-field curvature');
    var geometry=options.geometry===undefined?(explicit&&k>0?'globe':'flat'):options.geometry;
    var radius=options.radius===undefined?6371000:options.radius;
    if((geometry!=='flat'&&geometry!=='globe')||!Number.isFinite(radius)||radius<=0)
      throw Error('Invalid shared-field geometry or range');
    if(explicit&&(geometry==='flat')!==(k===0))
      throw Error('Shared-field curvature contradicts geometry');
    if(!explicit)k=geometry==='flat'?0:surfaces.curvatureFromRadius(radius);
    var surface=surfaces.createFromCurvature(k);
    var legacy=options.surfaceArithmetic==='legacy';
    if(k>0 && k*distances[distances.length-1]>=Math.PI/2)
      throw Error('Invalid shared-field geometry or range');
    var angleTolerance=options.angleTolerance === undefined ? 1e-7 : options.angleTolerance;
    if (!Number.isFinite(angleTolerance) || angleTolerance <= 0 || angleTolerance > 0.1)
      throw Error('Invalid angular interpolation tolerance');
    // Patch 112: optionally refine only those prism cells visited by actual
    // geometry. The legacy 104/105 uniform-cell API remains the default.
    var adaptiveDepth=options.adaptiveDepth === undefined ? 0 : options.adaptiveDepth;
    var maxAdaptiveCells=options.maxAdaptiveCells === undefined ? 4096 : options.maxAdaptiveCells;
    if (!Number.isInteger(adaptiveDepth) || adaptiveDepth < 0 || adaptiveDepth > 8 ||
        !Number.isInteger(maxAdaptiveCells) || maxAdaptiveCells < 1 || maxAdaptiveCells > 100000)
      throw Error('Invalid adaptive-field controls');
    var solverOptions=Object.assign({},options,{curvature:k});
    delete solverOptions.distances;
    delete solverOptions.heights;
    delete solverOptions.angleTolerance;
    delete solverOptions.adaptiveDepth;
    delete solverOptions.maxAdaptiveCells;
    delete solverOptions.shootingOptimization;
    delete solverOptions.onExactTarget;
    delete solverOptions.onExactResult;
    delete solverOptions.profileShootingStages;
    delete solverOptions.experimentalRayField;
    if (solverOptions.profileOptions)
      solverOptions.profileOptions=Object.assign({},solverOptions.profileOptions);
    // #140.4: engineered profiles may be measured with the existing guarded
    // predictor and warm starts, but ONLY behind this explicit opt-in. Their
    // grazing rays can be branch-sensitive, so the shipped Scene/Compare
    // defaults retain the original bracket-first solver. A custom profile
    // must never be included in this narrowly-scoped experiment.
    // Explicitly opt in to the proven *candidate-only* Globe predictor. No
    // global default or profile-specific inference may enable this path.
    // #140.12.46: selectable reference/gradient/scalar implementations,
    // all strictly opt-in and all certified by the same Globe RK4 solver.
    // #140.12.48: opt-in standard-profile RK4/common-gradient and guarded
    // ground-clearance experiment; never enable for custom/engineered rays.
    if(options.atmosphere==='standard' && options.profile===undefined &&
       (options.traceOptimization==='fused-gradient'||options.traceOptimization==='fused-preflight'||
        options.traceOptimization==='scalar-rk4'))
      solverOptions.traceOptimization=options.traceOptimization;
    else delete solverOptions.traceOptimization;
    var conformalHybrid=options.shootingOptimization==='conformal-hybrid';
    var conformalEngine=conformalHybrid?'fast':
      options.shootingOptimization==='conformal-reference'?'reference':
      options.shootingOptimization==='conformal-gradient'?'gradient':
      options.shootingOptimization==='conformal-experimental'?'fast':null;
    var conformalExperimental=!!conformalEngine&&geometry==='globe'&&
      options.atmosphere==='standard'&&options.profile===undefined&&!!conformal;
    var conformalConstants=conformalExperimental?conformal.constants(solverOptions):null;
    conformalExperimental=!!conformalConstants;
    var engineeredExperiment=options.shootingOptimization==='engineered-experimental' &&
      options.profile===undefined &&
      (options.atmosphere==='exponential-occlusion'||options.atmosphere==='inverse-spherical');
    if(options.profile===undefined&&(
        (options.atmosphere==='standard'&&options.shootingOptimization!==false)||
        engineeredExperiment))
      solverOptions.shootingPredictor=true;
    // Cache lifetime is the returned field: changing atmosphere, camera height,
    // or R means constructing a new field. No hidden cross-configuration cache.
    solverOptions=projection.preparedOptions(solverOptions);
    var cache=new Map();
    function clock(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
    var statistics={solves:0,hits:0,interpolations:0,fallbacks:0,
      exactSolveMs:0,shootRK4Calls:0,shootEvaluations:0,
      predictorAttempts:0,predictorAccepted:0,predictorFallbacks:0,
      warmStartAttempts:0,warmStartAccepted:0,warmStartMisses:0,
      conformalAttempts:0,conformalCandidates:0,conformalWarmAccepted:0,
      conformalFallbacks:0,conformalPredictionMs:0,conformalGradientCalls:0,
      conformalStepsHistogram:{},
      hybridBaselineSolved:0,hybridLateAttempts:0,hybridLateAccepted:0,
      shootingStageMs:{},shootingStageRK4:{},shootingStageEvaluations:{},
      clearGroundSteps:0,fullGroundEventSteps:0,preflightGroundSteps:0,
      refinements:0,acceptedCells:0,rejectedCells:0,adaptiveLimits:0,
      maxDepthUsed:0,gpuSeedUses:0};
    // Bounded history per 0.1 mm distance bucket, owned by this field alone.
    // Bucketing absorbs last-bit distance drift across nearly identical
    // tower ranges. It is ONLY used to guess an angle; not to cache results.
    // A separate field is created after any observer-height/atmosphere change.
    var heightSeeds=new Map();
    function exact(d,h) {
      var key=d+','+h;
      if (cache.has(key)) {statistics.hits++;return cache.get(key);}
      // Optional Compare-only ray field capture; one callback per unique exact
      // CPU request, never inside an ordinary production field.
      if(typeof options.onExactTarget==='function')options.onExactTarget(d,h);
      // Inside exact(): adaptive prism corners and qualification midpoints
      // reach here without traversing the public field.sample wrapper.
      // GPU values must be injected at this oracle boundary, not merely at
      // the outer sampling API. Missing/failed GPU rays retain CPU f64.
      var seeded=options.experimentalRayField&&options.experimentalRayField.exact(d,h);
      if(seeded){
        var record=Object.freeze({status:seeded.status,angle:seeded.angle,
          residual:seeded.residual,method:seeded.method||'gpu-experimental',reason:seeded.reason||null});
        cache.set(key,record);statistics.solves++;statistics.gpuSeedUses++;
        return record;
      }
      var started=clock(),shootOpts={geometry:geometry,radius:radius,curvature:k,
        target:legacy?(geometry==='flat'?[d,h]:[
          (radius+h)*Math.sin(d/radius),(radius+h)*Math.cos(d/radius)-radius]):
          surface.surfacePoint2(d,h)};
      // Two already integrated angles at effectively one distance supply a local
      // height/angle secant. Restrict to distant rays: nearby steep angles
      // are substantially nonlinear in height. Engineered seeds are ONLY
      // consumed by the explicit benchmark opt-in above.
      var seedKey=Math.round(d*10000),conformalCandidate=null;
      if(conformalExperimental&&!conformalHybrid){
        statistics.conformalAttempts++;
        var predictionStart=clock();
        // Candidate generation has no physical authority; invalid or
        // unsupported predictions use the ordinary baseline shooting path.
        try{conformalCandidate=conformal.adaptiveCandidate(conformalConstants,shootOpts.target,
          {mode:'richardson'});}
        catch(_){conformalCandidate=null;}
        statistics.conformalPredictionMs+=clock()-predictionStart;
        if(conformalCandidate&&conformalCandidate.status==='candidate'&&
            Number.isFinite(conformalCandidate.angle)){
          shootOpts.shootingWarmStartAngle=conformalCandidate.angle;
          statistics.conformalCandidates++;
          statistics.conformalGradientCalls+=conformalCandidate.coarseCalls||0;
          var steps=String(conformalCandidate.stepsUsed||0);
          statistics.conformalStepsHistogram[steps]=(statistics.conformalStepsHistogram[steps]||0)+1;
        }
      }
      if(conformalExperimental&&conformalHybrid){
        // Lazily perform the costly conformal integration ONLY if the cheap
        // production predictor did not converge. Never classify a ray here.
        shootOpts.shootingLateWarmStart=function(){
          statistics.conformalAttempts++;
          var predictionStart=clock(),candidate=null;
          try{candidate=conformal.adaptiveCandidate(conformalConstants,shootOpts.target,
            {mode:'richardson',engine:'fast'});}
          catch(_){candidate=null;}
          statistics.conformalPredictionMs+=clock()-predictionStart;
          if(candidate&&candidate.status==='candidate'&&Number.isFinite(candidate.angle)){
            statistics.conformalCandidates++;
            statistics.conformalGradientCalls+=candidate.coarseCalls||0;
            var steps=String(candidate.stepsUsed||0);
            statistics.conformalStepsHistogram[steps]=(statistics.conformalStepsHistogram[steps]||0)+1;
            return candidate.angle;
          }
          return null;
        };
      }
      if(options.profileShootingStages===true)shootOpts.profileShootingStages=true;
      var seeds=d>=5000&&solverOptions.shootingPredictor===true&&
        options.shootingWarmStart!==false?
        heightSeeds.get(seedKey):null;
      if(!Number.isFinite(shootOpts.shootingWarmStartAngle)&&
          seeds&&seeds.length===2&&seeds[0].h!==seeds[1].h){
        var a=seeds[0],b=seeds[1];
        var angle=b.angle+(a.angle-b.angle)*(h-b.h)/(a.h-b.h);
        if(Number.isFinite(angle))shootOpts.shootingWarmStartAngle=angle;
      }
      var result=projection.solve(Object.assign({},solverOptions,shootOpts));
      statistics.exactSolveMs+=clock()-started;
      statistics.shootRK4Calls+=result.shootRK4Calls||0;
      statistics.shootEvaluations+=result.evaluations||0;
      statistics.predictorAttempts+=result.predictorAttempts||0;
      statistics.predictorAccepted+=result.predictorAccepted||0;
      statistics.predictorFallbacks+=result.predictorFallbacks||0;
      statistics.warmStartAttempts+=result.warmStartAttempts||0;
      statistics.warmStartAccepted+=result.warmStartAccepted||0;
      statistics.warmStartMisses+=result.warmStartMisses||0;
      if(conformalHybrid){
        statistics.hybridLateAttempts+=result.lateWarmAttempts||0;
        statistics.hybridLateAccepted+=result.lateWarmAccepted||0;
        if(result.lateWarmAccepted)statistics.conformalWarmAccepted++;
        else if(result.predictorAccepted||result.warmStartAccepted||
            (result.evaluations===1&&!result.lateWarmAttempts))
          statistics.hybridBaselineSolved++;
        if(result.lateWarmAttempts&&!result.lateWarmAccepted)statistics.conformalFallbacks++;
      }
      if(result.shootingStages){
        for(var group of [['ms','shootingStageMs'],['rk4','shootingStageRK4'],
            ['evaluations','shootingStageEvaluations']]){
          var dest=statistics[group[1]],from=result.shootingStages[group[0]];
          Object.keys(from).forEach(function(key){dest[key]=(dest[key]||0)+from[key];});
        }
      }
      if(conformalExperimental&&!conformalHybrid){
        if(conformalCandidate&&conformalCandidate.status==='candidate'&&result.warmStartAccepted)
          statistics.conformalWarmAccepted++;
        else statistics.conformalFallbacks++;
      }
      statistics.clearGroundSteps+=result.ray&&result.ray.fastGroundSkips||0;
      statistics.fullGroundEventSteps+=result.ray&&result.ray.fullGroundChecks||0;
      statistics.preflightGroundSteps+=result.ray&&result.ray.preflightGroundSkips||0;
      var record={status:result.status,angle:result.angle,
        residual:result.residual,method:'exact',reason:result.reason};
      Object.freeze(record);
      cache.set(key,record);
      if(typeof options.onExactResult==='function')options.onExactResult(d,h,record);
      if(d>=5000&&solverOptions.shootingPredictor===true&&
          options.shootingWarmStart!==false&&Number.isFinite(result.angle)&&Number.isFinite(result.residual)){
        var previous=heightSeeds.get(seedKey)||[];
        // Keep the two most recently solved distinct heights. This also
        // prevents a repeated exact key from biasing the secant slope.
        if(!previous.length||previous[previous.length-1].h!==h){
          previous=previous.length===2?[previous[1]]:previous.slice();
          previous.push({h:h,angle:result.angle});
          heightSeeds.set(seedKey,previous);
        }
      }
      statistics.solves++;
      return record;
    }
    var cells=new Map(), cellCount=0;
    function linear(a,b,t) {return a+(b-a)*t;}
    function bilinear(corners,u,v) {
      return linear(linear(corners[0].angle,corners[1].angle,u),
        linear(corners[2].angle,corners[3].angle,u),v);
    }
    function makeCell(d0,d1,h0,h1,depth) {
      cellCount++;
      statistics.maxDepthUsed=Math.max(statistics.maxDepthUsed,depth);
      return {d0:d0,d1:d1,h0:h0,h1:h1,depth:depth,
        state:'unprepared',children:null,checkedError:0,corners:null};
    }
    function prepare(cell) {
      if (cell.state!=='unprepared') return cell;
      var d0=cell.d0,d1=cell.d1,h0=cell.h0,h1=cell.h1;
      var corners=[exact(d0,h0),exact(d1,h0),exact(d0,h1),exact(d1,h1)];
      var accepted=corners.every(function(c){return c.status==='visible'&&Number.isFinite(c.angle);});
      // Qualification is empirical, NOT a certified maximum error bound.
      // Test the centre first; many broad root cells can be rejected early.
      var check=[[0.5,0.5],[0.5,0],[0.5,1],[0,0.5],[1,0.5]],error=0;
      if(accepted)for(var k=0;k<check.length;k++) {
        var u=check[k][0],v=check[k][1];
        var observed=exact(linear(d0,d1,u),linear(h0,h1,v));
        if(observed.status!=='visible'||!Number.isFinite(observed.angle)) {
          accepted=false;break;
        }
        error=Math.max(error,Math.abs(observed.angle-bilinear(corners,u,v)));
        if(error>angleTolerance){accepted=false;break;}
      }
      cell.corners=corners;cell.checkedError=error;
      cell.state=accepted?'accepted':'rejected';
      if(accepted)statistics.acceptedCells++;else statistics.rejectedCells++;
      return cell;
    }
    function rootCell(i,j) {
      var key=i+','+j,cell=cells.get(key);
      if(!cell){cell=makeCell(distances[i],distances[i+1],heights[j],heights[j+1],0);
        cells.set(key,cell);}
      return cell;
    }
    function children(cell) {
      if(cell.children)return cell.children;
      if(cellCount+4>maxAdaptiveCells)return null;
      var dm=(cell.d0+cell.d1)/2,hm=(cell.h0+cell.h1)/2,depth=cell.depth+1;
      cell.children=[makeCell(cell.d0,dm,cell.h0,hm,depth),
        makeCell(dm,cell.d1,cell.h0,hm,depth),
        makeCell(cell.d0,dm,hm,cell.h1,depth),
        makeCell(dm,cell.d1,hm,cell.h1,depth)];
      statistics.refinements++;
      return cell.children;
    }
    function sample(d,h) {
      if (!Number.isFinite(d) || !Number.isFinite(h) || d <= 0 || h < 0)
        throw Error('Invalid shared-field target coordinates');
      // Directly sampled GPU oracle points must not be re-interpolated by
      // CPU cells. Both paths still respect explicit status/angle evidence.
      if(options.experimentalRayField){
        var seeded=options.experimentalRayField.sample(d,h);
        if(seeded){statistics.gpuSeedUses++;return seeded;}
      }
      var i=interval(distances,d),j=interval(heights,h);
      if(i<0||j<0){statistics.fallbacks++;return exact(d,h);}
      var cell=rootCell(i,j);
      while(true){
        prepare(cell);
        if(cell.state==='accepted'){
          var u=(d-cell.d0)/(cell.d1-cell.d0),v=(h-cell.h0)/(cell.h1-cell.h0);
          statistics.interpolations++;
          return {status:'visible',angle:bilinear(cell.corners,u,v),
            residual:null,method:'interpolated',checkedError:cell.checkedError,reason:null};
        }
        if(cell.depth>=adaptiveDepth)break;
        var next=children(cell);
        if(!next){statistics.adaptiveLimits++;break;}
        var index=(d>(cell.d0+cell.d1)/2?1:0)+(h>(cell.h0+cell.h1)/2?2:0);
        cell=next[index];
      }
      statistics.fallbacks++;
      return exact(d,h);
    }
    // Explicit eager qualification is optional; cells also build lazily.
    function warm() {
      for(var i=0;i<distances.length-1;i++)
        for(var j=0;j<heights.length-1;j++) prepare(rootCell(i,j));
      return stats();
    }
    function stats() {return Object.assign({cells:cellCount,roots:cells.size,points:cache.size},statistics,
      options.experimentalRayField?{experimentalGpu:options.experimentalRayField.stats()}:{});}
    return {sample:sample,exact:exact,warm:warm,stats:stats,
      distances:distances.slice(),heights:heights.slice()};
  }
  return {create:create};
}));
