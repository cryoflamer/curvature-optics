#!/usr/bin/env node
/* #140.7 — repeat the finite predictor qualification after repairing the
 * production bracket's forward-x angular-boundary overshoot.
 * Passing sampled cases NEVER promotes the opt-in predictor by itself.
 */
'use strict';
const qualification=require('./qualify-engineered-shooting-1405');
const shortRange=require('./diagnose-short-range-shooting-1406');
function run({suite='smoke'}={}){
 if(!['smoke','full'].includes(suite))throw Error('suite must be smoke or full');
 const reference=shortRange.run();
 const predictor=qualification.run({suite});
 const historical=reference.formerBracketOvershootRisks;
 const recovered=reference.repairedHistoricalOvershoots;
 const eligibleSample=reference.locallyQualified&&
  reference.baselineFailures===0&&historical===16&&recovered===historical&&
  predictor.qualifiedInSample&&
  predictor.grid.unqualified===0&&predictor.warmStarts.unqualified===0&&
  predictor.scenes.unqualified===0;
 return {version:'140.7',suite,
  scope:'Production bracket-boundary repair and independent finite-grid validation; CPU only',
  shortRange:{count:reference.caseCount,formerBracketOvershootRisks:historical,
   repairedHistoricalOvershoots:recovered,remainingProductionFailures:reference.baselineFailures,
   independentFlatOracleChecks:reference.independentFlatOracleChecks,
   locallyQualified:reference.locallyQualified,issues:reference.issues},
  predictor:{rayCases:predictor.grid.count,rayIssues:predictor.grid.unqualified,
   warmStartChecks:predictor.warmStarts.count,warmStartIssues:predictor.warmStarts.unqualified,
   scenePairs:predictor.scenes.count,sceneIssues:predictor.scenes.unqualified,
   legacySceneIssues:predictor.scenes.issues.filter(x=>!x.physicalWorld).length,
   referenceRK4Calls:predictor.grid.referenceRK4Calls,
   experimentalRK4Calls:predictor.grid.experimentalRK4Calls,
   issues:{rays:predictor.grid.issues,warmStarts:predictor.warmStarts.issues,
    scenes:predictor.scenes.issues}},
  qualifiedInFiniteSample:eligibleSample,
  globalBranchCertified:false,defaultPredictorPromotionAllowed:false,
  decision:eligibleSample?
   'Bracket boundary fix accepted in the sampled single-forward-x domain; keep engineered predictor opt-in pending independent branch certification':
   'Finite qualification failed; keep engineered predictor opt-in and inspect reported cases',
  limitations:[
   'The forward-x solver does not enumerate multiple atmospheric ray paths',
   'The independent Flat oracle checks only monotone downward branches',
   'Globe trajectories have step-convergence checks but no separate global multipath oracle',
   'Near-vertical trajectories outside the forward-x angular domain remain solver_failed',
   'Finite CPU-only qualification does not establish universal validity or GPU performance',
   'The main Scene/Compare engineered predictor selection remains unchanged'
  ]};
}
if(require.main===module){
 try{const suite=(process.argv.find(x=>x.startsWith('--suite='))||'--suite=smoke').split('=')[1];
  const report=run({suite});console.log(JSON.stringify(report,null,2));
  if(!report.qualifiedInFiniteSample)process.exitCode=1;
 }catch(error){console.error(error.stack);process.exitCode=1;}
}
module.exports={run};
