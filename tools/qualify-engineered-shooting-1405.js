#!/usr/bin/env node
/* #140.5: offline numerical qualification of the #140.4 opt-in CPU shooting
 * predictor. This program NEVER promotes it to the app's default solver.
 * The fine-step check is convergence evidence, not an independent branch proof.
 */
'use strict';
const projection=require('../src/optics/OpticalTargetProjection');
const fields=require('../src/optics/OpticalSharedRayField');
const scenes=require('./benchmark-engineered-shooting-1404');
const SURFACE_RADIUS=6371000;
const PROFILES=['exponential-occlusion','inverse-spherical'];
const GEOMETRIES=['flat','globe'];
const ANGLE_LIMIT=2e-8; // rad: branch-sensitive, far narrower than rendering pixel scale
const EVENT_LIMIT=0.05; // m: physical first-hit position if both rays hit ground
const OPT_IN='engineered-experimental';
function point(geometry,d,h){
 return geometry==='flat'?[d,h]:[
  (SURFACE_RADIUS+h)*Math.sin(d/SURFACE_RADIUS),
  (SURFACE_RADIUS+h)*Math.cos(d/SURFACE_RADIUS)-SURFACE_RADIUS];
}
function horizonScale(profile,radius,eye){
 // Only a sampling scale, NEVER an asserted optical horizon or visibility law.
 return radius*Math.acos(profile==='exponential-occlusion'?
  Math.exp(-eye/radius):radius/(radius+eye));
}
function options({atmosphere,geometry,radius,eye,distance,height,step}){
 return {geometry,radius:SURFACE_RADIUS,observerHeight:eye,atmosphere,
  profileOptions:{occlusionRadius:radius},target:point(geometry,distance,height),step};
}
function compareRays(reference,candidate,limit=ANGLE_LIMIT){
 const violations=[];
 if(reference.status!==candidate.status)
  violations.push('status: '+reference.status+' / '+candidate.status);
 // An equal failure/indeterminate outcome is not evidence of correct physics.
 if(!['visible','blocked'].includes(reference.status)||
    !['visible','blocked'].includes(candidate.status))
  violations.push('inconclusive solver/visibility outcome');
 if(reference.status==='visible'||reference.status==='blocked'){
  if(!Number.isFinite(reference.angle)||!Number.isFinite(candidate.angle))
   violations.push('nonfinite launch angle');
  else if(Math.abs(reference.angle-candidate.angle)>limit)
   violations.push('launch-angle branch mismatch');
  for(const [name,result] of [['reference',reference],['candidate',candidate]]){
   const ground=result.ray;
   if(!ground||!Number.isFinite(result.residual)||
      !Number.isFinite(result.pathLength)||!Number.isFinite(ground.travelled))
    violations.push(name+': missing finite ray/endpoint');
   else if(Math.abs(result.residual)>1e-6) // ground-target tighter residual checked by solver
    violations.push(name+': target residual outside 1e-6 m');
  }
  if(reference.ray&&candidate.ray){
   if(reference.ray.hitGround!==candidate.ray.hitGround)
    violations.push('first-ground classification differs');
   if(((reference.ray.event&&reference.ray.event.contact)||null) !==
      ((candidate.ray.event&&candidate.ray.event.contact)||null))
    violations.push('ground event contact differs');
   if(reference.ray.hitGround&&candidate.ray.hitGround&&
      Math.abs(reference.ray.travelled-candidate.ray.travelled)>EVENT_LIMIT)
    violations.push('first-ground event distance differs');
  }
 }
 return {qualified:violations.length===0,violations,
  angleDelta: Number.isFinite(reference.angle)&&Number.isFinite(candidate.angle)?
   Math.abs(reference.angle-candidate.angle):null};
}
function describeCase(c){
 return {atmosphere:c.atmosphere,geometry:c.geometry,radius:c.radius,
  eye:c.eye,distance:c.distance,height:c.height,scale:c.scale,kind:c.kind||'horizon-scale'};
}
function casesFor(tier){
 if(!['smoke','full'].includes(tier))throw Error('suite must be smoke or full');
 const radii=tier==='smoke'?[SURFACE_RADIUS/2,SURFACE_RADIUS]:
  [SURFACE_RADIUS/2,SURFACE_RADIUS,SURFACE_RADIUS*2];
 const eyes=tier==='smoke'?[2,15]:[2,15,100];
 const heights=tier==='smoke'?[0,10]:[0,1,10,50];
 const factors=tier==='smoke'?[0.75,0.99,1.01,1.25]:
  [0.7,0.95,0.999,1,1.001,1.05,1.25];
 const result=[];
 for(const atmosphere of PROFILES)for(const geometry of GEOMETRIES)
  for(const radius of radii)for(const eye of eyes)
   for(const height of heights)for(const scale of factors){
    result.push({atmosphere,geometry,radius,eye,height,scale,
     distance:horizonScale(atmosphere,radius,eye)*scale});
   }
 // Stress very short rays separately: the old bracket search has a steep-
 // angle domain boundary which an accepted predictor may cross. Record the
 // disagreement, rather than counting the new 'visible' as automatic proof.
 for(const atmosphere of PROFILES)for(const geometry of GEOMETRIES)
  for(const radius of [SURFACE_RADIUS/2,SURFACE_RADIUS])
   for(const distance of [0.1,0.3,0.5,1,2,10,100])
    result.push({atmosphere,geometry,radius,eye:15,height:0,
     distance,scale:null,kind:'near-observer'});
 return result;
}
function checkRayGrid({suite='smoke',step=2000,fineStep=500}={}){
 const rows=[],issues=[];let verified=0,predictorAccepted=0;
 for(const c of casesFor(suite)){
  const o=options({...c,step});
  const reference=projection.solve(o);
  const candidate=projection.solve({...o,shootingPredictor:true});
  const fine=projection.solve({...o,step:fineStep});
  const paired=compareRays(reference,candidate);
  const convergence=compareRays(reference,fine);
  // The full physics reference must itself survive step refinement.
  const qualified=paired.qualified&&convergence.qualified;
  if(qualified)verified++;
  predictorAccepted+=candidate.predictorAccepted||0;
  if(!qualified){
   const entry={case:describeCase(c),referenceStatus:reference.status,
    candidateStatus:candidate.status,fineStatus:fine.status,
    predictorVsReference:paired.violations,
    referenceVsFine:convergence.violations,
    angleDifference:paired.angleDelta,fineAngleDifference:convergence.angleDelta};
   issues.push(entry);
  }
  // One concise record per case, preserving details only for failures.
  rows.push({status:reference.status,qualified,kind:c.kind||'horizon-scale',
   predictorAccepted:candidate.predictorAccepted||0,
   referenceRK4Calls:reference.shootRK4Calls||0,
   experimentalRK4Calls:candidate.shootRK4Calls||0});
 }
 return {count:rows.length,qualified:verified,unqualified:issues.length,
  predictorAccepted,referenceRK4Calls:rows.reduce((v,r)=>v+r.referenceRK4Calls,0),
  experimentalRK4Calls:rows.reduce((v,r)=>v+r.experimentalRK4Calls,0),
  statuses:rows.reduce((v,r)=>(v[r.status]=(v[r.status]||0)+1,v),{}),
  byKind:rows.reduce((v,r)=>{const o=v[r.kind]||(v[r.kind]={count:0,unqualified:0});
   o.count++;if(!r.qualified)o.unqualified++;return v;},{}),issues};
}
function compareFieldRecord(reference,candidate){
 const violations=[];
 if(reference.status!==candidate.status)violations.push('status differs');
 if(!['visible','blocked'].includes(reference.status)||
    !['visible','blocked'].includes(candidate.status))violations.push('inconclusive status');
 if(Number.isFinite(reference.angle)&&Number.isFinite(candidate.angle)){
  if(Math.abs(reference.angle-candidate.angle)>ANGLE_LIMIT)violations.push('angle branch differs');
 }else violations.push('nonfinite angle');
 if(!Number.isFinite(reference.residual)||!Number.isFinite(candidate.residual)||
    Math.abs(candidate.residual)>1e-6)violations.push('invalid endpoint residual');
 return violations;
}
function checkWarmStarts({suite='smoke',step=2000,fineStep=500}={}){
 const radii=suite==='smoke'?[SURFACE_RADIUS]:[SURFACE_RADIUS/2,SURFACE_RADIUS,SURFACE_RADIUS*2];
 const eyes=suite==='smoke'?[15]:[2,15,100];
 const scales=suite==='smoke'?[0.85,1.1]:[0.7,0.98,1,1.02,1.3];
 const heightSequences=[[2,10,30,20,5],[50,20,1,15,35],
  [10,10.2,10.25,10.1,10.15],[1,1.2,1.3,1.15,1.1]];
 const issues=[];let count=0,accepted=0,attempts=0,refRK4=0,optRK4=0;
 for(const atmosphere of PROFILES)for(const geometry of GEOMETRIES)
  for(const radius of radii)for(const eye of eyes)for(const scale of scales)
   for(const heights of heightSequences){
    const d=horizonScale(atmosphere,radius,eye)*scale;
    // A field supplies secant seeds only after two distinct heights at one d.
    const field=fields.create({geometry,radius:SURFACE_RADIUS,observerHeight:eye,
     atmosphere,profileOptions:{occlusionRadius:radius},
     distances:[d*0.8,d*1.2],heights:[0,100],step,
     shootingOptimization:OPT_IN});
    for(const height of heights){
     const o=options({atmosphere,geometry,radius,eye,distance:d,height,step});
     const ref=projection.solve(o);
     const fine=projection.solve({...o,step:fineStep});
     const optimized=field.exact(d,height);
     const violations=compareFieldRecord(ref,optimized);
     const fineCheck=compareRays(ref,fine);
     if(!fineCheck.qualified)violations.push('fine-step: '+fineCheck.violations.join('; '));
     if(violations.length)issues.push({case:{atmosphere,geometry,radius,eye,scale,height},
      referenceStatus:ref.status,experimentalStatus:optimized.status,violations});
     refRK4+=ref.shootRK4Calls||0;count++;
    }
    const stats=field.stats();
    accepted+=stats.warmStartAccepted;
    attempts+=stats.warmStartAttempts;
    optRK4+=stats.shootRK4Calls;
    if(stats.warmStartAccepted+stats.warmStartMisses!==stats.warmStartAttempts)
     issues.push({case:{atmosphere,geometry,radius,eye,scale},
      violations:['warm-start counters inconsistent']});
   }
 return {count,attempts,accepted,referenceRK4Calls:refRK4,
  experimentalRK4Calls:optRK4,unqualified:issues.length,issues};
}
function checkScenes({suite='smoke'}={}){
 const sizes=suite==='smoke'?[2]:[2,10,85];
 const radii=suite==='smoke'?[SURFACE_RADIUS]:[SURFACE_RADIUS/2,SURFACE_RADIUS,SURFACE_RADIUS*2];
 const rows=[],issues=[];
 for(const atmosphere of PROFILES)for(const geometry of GEOMETRIES)
  for(const radius of radii)for(const towers of sizes)
   for(const physicalWorld of [true,false]){
   const result=scenes.run({atmosphere,geometry,radius,towers,repeats:1,physicalWorld});
   const entry={atmosphere,geometry,radius,towers,physicalWorld,
    qualified:result.qualifiedInSample,
    maxCoordinateDeltaMetres:result.maxCoordinateDeltaMetres,
    referenceRK4Calls:result.summary.referenceTotalRK4Calls,
    experimentalRK4Calls:result.summary.experimentalTotalRK4Calls};
   rows.push(entry);
   if(!entry.qualified)issues.push({...entry,
    violations:result.rows[0].comparison.violations});
  }
 return {count:rows.length,unqualified:issues.length,rows,issues};
}
function run(config={}){
 const suite=config.suite||'smoke',step=config.step===undefined?2000:config.step,
  fineStep=config.fineStep===undefined?500:config.fineStep;
 if(!['smoke','full'].includes(suite))throw Error('suite must be smoke or full');
 if(!Number.isFinite(step)||step<=0||!Number.isFinite(fineStep)||fineStep<=0||fineStep>=step)
  throw Error('Require 0 < fineStep < step');
 const grid=checkRayGrid({suite,step,fineStep});
 const warmStarts=checkWarmStarts({suite,step,fineStep});
 const sceneChecks=checkScenes({suite});
 const qualifiedInSample=!grid.unqualified&&!warmStarts.unqualified&&!sceneChecks.unqualified &&
  warmStarts.attempts>0&&grid.predictorAccepted>0;
 return {version:'140.5',suite,stepMetres:step,fineStepMetres:fineStep,
  scope:'Offline CPU-only numerical qualification of engineered predictor; no default promotion',
  qualifiedInSample,defaultPromotionAllowed:false,
  decision:'Keep the bracket-first production solver; a passing finite grid does not certify all branches',
  grid,warmStarts,scenes:sceneChecks,limitations:[
   'A finer RK4 step is a numerical-convergence cross-check, NOT an independent analytic or multipath branch oracle',
   'At any grazing or multipath singularity, an equal answer from two algorithms cannot establish all physical branches',
   'Nonmetric legacy guide interpolation is also compared; its radial point set can change when near-eye reference shooting fails',
   'Any solver_failed or indeterminate ray in this grid is inconclusive, never counted as qualified',
   'All speed metrics are RK4 work counters, not a promise of wall-time or browser FPS',
   'Scene and Compare continue using the original bracket-first engineered model by default']};
}
function flag(name,fallback){
 const found=process.argv.find(arg=>arg.startsWith('--'+name+'='));
 return found?found.slice(name.length+3):fallback;
}
if(require.main===module){
 try{
  const result=run({suite:flag('suite','smoke'),step:Number(flag('step','2000')),
   fineStep:Number(flag('fine-step','500'))});
  console.log(JSON.stringify(result,null,2));
  if(!result.qualifiedInSample)process.exitCode=1;
 }catch(error){console.error(error.stack);process.exitCode=1;}
}
module.exports={run,compareRays,compareFieldRecord,casesFor,checkRayGrid,checkWarmStarts,checkScenes};
