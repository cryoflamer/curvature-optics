#!/usr/bin/env node
/* #140.6 — independent short-range bracket diagnostics for engineered profiles.
 * Offline only. Never changes the production solver or promotes its predictor.
 * The flat-surface oracle uses the conserved horizontal optical momentum
 * p=n(h)cos(theta), not OpticalTargetProjection's RK4 shooting recurrence.
 */
'use strict';
const rt=require('../src/optics/OpticalRayTracer');
const projection=require('../src/optics/OpticalTargetProjection');
const qualification=require('./qualify-engineered-shooting-1405');
const ANGLE_LIMIT=2e-8;
const VERTICAL_LIMIT=Math.PI/2-0.001; // forward-x contract of the production solver
const BASE_SPAN=0.02;
const R=6371000;

function flatHorizontalRange(profile,eye,targetHeight,p,segments=512){
 if(!(eye>targetHeight)||!(p>=0)||!Number.isFinite(p)||
     !Number.isInteger(segments)||segments<2||segments%2)throw Error('Invalid flat quadrature parameters');
 const nEye=profile.n(eye),nTarget=profile.n(targetHeight);
 if(!(nEye>0)||!(nTarget>0)||p>=Math.min(nEye,nTarget))return Infinity;
 // This integral assumes a monotone downward path (no interior turning point).
 // For exponential n(h), this antiderivative is exact; no RK4 or shooting used.
 if(profile._analyticExponentialRadius){
  return profile._analyticExponentialRadius*(Math.asin(p/nTarget)-Math.asin(p/nEye));
 }
 const delta=(eye-targetHeight)/segments;
 let sum=0;
 for(let i=0;i<=segments;i++){
  const n=profile.n(targetHeight+i*delta);
  const f=p/Math.sqrt(n*n-p*p);
  if(!Number.isFinite(f))return Infinity;
  sum+=(i===0||i===segments?1:(i%2?4:2))*f;
 }
 return sum*delta/3;
}
function independentFlatOracle({atmosphere,radius,eye,distance,height=0}){
 if(!['exponential-occlusion','inverse-spherical'].includes(atmosphere)||
   !(radius>0)||!(eye>height)||!(distance>0))throw Error('Unsupported monotone downward flat oracle case');
 const profile=rt.atmosphere(atmosphere,{occlusionRadius:radius});
 if(atmosphere==='exponential-occlusion')profile._analyticExponentialRadius=radius;
 const nEye=profile.n(eye),nTarget=profile.n(height);
 // Search strictly below the smallest refractive index on this interval;
 // turning rays are intentionally outside the oracle's contract.
 let lo=0,hi=Math.min(nEye,nTarget)*(1-1e-9);
 const maxDistance=flatHorizontalRange(profile,eye,height,hi);
 if(!(maxDistance>distance))return {status:'outside-monotone-branch',angle:null};
 for(let i=0;i<80;i++){
  const mid=(lo+hi)/2;
  if(flatHorizontalRange(profile,eye,height,mid)>distance)hi=mid;
  else lo=mid;
 }
 const p=(lo+hi)/2;
 return {status:'monotone-downward',angle:-Math.acos(p/nEye),
   horizontalResidualMetres:flatHorizontalRange(profile,eye,height,p)-distance,
   invariant:p,method:atmosphere==='exponential-occlusion'?
    'closed-form exponential Snell invariant':'Simpson quadrature of Snell invariant'};
}
function solveCase(c,step=2000,fineStep=500,ultraStep=125){
 const o={geometry:c.geometry,radius:R,observerHeight:c.eye,
  atmosphere:c.atmosphere,profileOptions:{occlusionRadius:c.radius},
  target:c.geometry==='flat'?[c.distance,c.height]:[
   (R+c.height)*Math.sin(c.distance/R),
   (R+c.height)*Math.cos(c.distance/R)-R],step};
 const directionAngle=Math.atan2(o.target[1]-c.eye,o.target[0]);
 const angularMargin=VERTICAL_LIMIT-Math.abs(directionAngle);
 // Keep the first bracket probe *inside* the forward-x domain. This is an
 // offline experiment using the solver's existing initialSpan setting.
 const limitedSpan=Math.min(BASE_SPAN,angularMargin/4);
 const original=projection.solve(o);
 const experimental=projection.solve({...o,shootingPredictor:true});
 const admissible=Number.isFinite(limitedSpan)&&limitedSpan>0;
 const bracket=admissible?projection.solve({...o,initialSpan:limitedSpan}):null;
 const fine=admissible?projection.solve({...o,step:fineStep,initialSpan:limitedSpan}):null;
 const ultra=admissible?projection.solve({...o,step:ultraStep,initialSpan:limitedSpan}):null;
 const oracle=c.geometry==='flat'?independentFlatOracle(c):null;
 const violations=[];
 // #140.7: the production bracket now stays inside its angular domain.
 // Keep the 16 historical overshoot cases visible as a regression signal,
 // rather than expecting the fixed production solver to fail again.
 const formerBracketOvershootRisk=admissible&&angularMargin<BASE_SPAN;
 if(!admissible)violations.push('initial direction is outside forward-x domain');
 if(admissible){
  for(const [name,value] of [['bounded bracket',bracket],['predictor',experimental],
    ['fine step',fine],['ultra-fine step',ultra]]){
   if(!value||!['visible','blocked'].includes(value.status))
    violations.push(name+' is unresolved: '+(value&&value.reason||value&&value.status||'not computed'));
  }
  if(bracket&&experimental)violations.push(...qualification.compareRays(bracket,experimental).violations.map(v=>'predictor: '+v));
  if(bracket&&fine)violations.push(...qualification.compareRays(bracket,fine).violations.map(v=>'fine step: '+v));
  if(fine&&ultra)violations.push(...qualification.compareRays(fine,ultra).violations.map(v=>'ultra step: '+v));
  if(original&&['visible','blocked'].includes(original.status))
   violations.push(...qualification.compareRays(original,bracket).violations.map(v=>'original: '+v));
  if(oracle){
   if(oracle.status!=='monotone-downward')violations.push('flat oracle has no monotone branch');
   else for(const [name,value] of [['bounded bracket',bracket],['predictor',experimental],['ultra-fine step',ultra]]){
    if(!value||!Number.isFinite(value.angle)||Math.abs(value.angle-oracle.angle)>ANGLE_LIMIT)
     violations.push(name+': independent Snell branch angle differs');
   }
  }
 }
 return {case:{atmosphere:c.atmosphere,geometry:c.geometry,radius:c.radius,
    eye:c.eye,distance:c.distance,height:c.height},
  cause:original.status==='solver_failed'&&/bracket left the forward-x integration domain/.test(original.reason||'')&&
   angularMargin<BASE_SPAN?'initial bracket probe crosses forward-x angle bound':null,
  formerBracketOvershootRisk:formerBracketOvershootRisk,
  repairedHistoricalOvershoot:formerBracketOvershootRisk&&
   ['visible','blocked'].includes(original.status)&&violations.length===0,
  angularMarginRadians:angularMargin,originalInitialSpanRadians:BASE_SPAN,
  boundedInitialSpanRadians:admissible?limitedSpan:null,
  originalStatus:original.status,originalReason:original.reason||null,
  experimentalStatus:experimental.status,
  boundedStatus:bracket&&bracket.status,
  fineStatus:fine&&fine.status,ultraStatus:ultra&&ultra.status,
  angles:{original:original.angle,experimental:experimental.angle,
   bounded:bracket&&bracket.angle,fine:fine&&fine.angle,ultra:ultra&&ultra.angle,
   independentFlat:oracle&&oracle.angle},
  independentFlatOracle:oracle,
  recoveredOriginalFailure:original.status==='solver_failed'&&bracket&&['visible','blocked'].includes(bracket.status),
  locallyQualified:violations.length===0,violations};
}
function run({step=2000,fineStep=500,ultraStep=125}={}){
 if(![step,fineStep,ultraStep].every(x=>Number.isFinite(x)&&x>0)||
  !(step>fineStep&&fineStep>ultraStep))throw Error('Require 0 < ultraStep < fineStep < step');
 const cases=qualification.casesFor('smoke').filter(c=>c.kind==='near-observer');
 const rows=cases.map(c=>solveCase(c,step,fineStep,ultraStep));
 const issues=rows.filter(r=>!r.locallyQualified);
 const unresolvedOriginal=rows.filter(r=>r.originalStatus==='solver_failed');
 const unexplained=unresolvedOriginal.filter(r=>!r.cause||!r.recoveredOriginalFailure);
 return {version:'140.6',scope:'Offline short-range forward-x shooting branch diagnostics; production defaults untouched',
  stepMetres:step,fineStepMetres:fineStep,ultraStepMetres:ultraStep,
  caseCount:rows.length,baselineFailures:unresolvedOriginal.length,
  recoveredBaselineFailures:rows.filter(r=>r.recoveredOriginalFailure).length,
  unexplainedBaselineFailures:unexplained.length,
  formerBracketOvershootRisks:rows.filter(r=>r.formerBracketOvershootRisk).length,
  repairedHistoricalOvershoots:rows.filter(r=>r.repairedHistoricalOvershoot).length,
  independentFlatOracleChecks:rows.filter(r=>r.independentFlatOracle).length,
  locallyQualified:issues.length===0&&unexplained.length===0,
  globalBranchCertified:false,defaultPromotionAllowed:false,
  decision:'No default promotion: local monotone-flat invariant and RK4 step convergence do not prove global branch completeness',
  issues,rows,limitations:[
   'The forward-x shooting domain excludes near-vertical launch angles beyond its explicit threshold',
   'The 140.7 production bracket avoids known oversized probes; this does not certify a universal bracket search',
   'The flat Snell-invariant oracle covers monotone downward rays only; it is not a multipath oracle',
   'Globe cases have three-step RK4 convergence checks but no independent analytic branch oracle',
   'Visible or blocked status does not prove the absence of other physical rays',
   '140.7 changes only production bracket boundary handling; Scene/Compare predictor defaults remain unchanged']};
}
function flag(name,fallback){
 const value=process.argv.find(v=>v.startsWith('--'+name+'='));
 return value?Number(value.slice(name.length+3)):fallback;
}
if(require.main===module){
 try{const result=run({step:flag('step',2000),fineStep:flag('fine-step',500),ultraStep:flag('ultra-step',125)});
  console.log(JSON.stringify(result,null,2));if(!result.locallyQualified)process.exitCode=1;
 }catch(e){console.error(e.stack);process.exitCode=1;}
}
module.exports={run,solveCase,independentFlatOracle,flatHorizontalRange};
