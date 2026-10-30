'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const audit=require('../src/diagnostics/CurvatureGpuRootConvergence141223');
const html=fs.readFileSync('CurvatureModern.html','utf8');
const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
test('140.12.23: root audit is wired and exported without painting',()=>{
  assert.match(html,/CurvatureGpuRootConvergence141223\.js/);
  assert.match(html,/id="ModernGpuRootAuditRun"/);
  assert.match(app,/addEventListener\('click',runGpuRootAudit141223\)/);
  const body=app.slice(app.indexOf('async function runGpuRootAudit141223(){'),app.indexOf('function bindCompareGpuProbe(){'));
  assert.match(body,/algorithm:job\[1\],refinement:job\[2\]/);
  assert.match(body,/\['bracketStrict','sweep','angle-bracket',strict\]/);
  assert.ok(body.indexOf('await contract.solveCpuBatch')>body.indexOf('await session.solve'));
  assert.doesNotMatch(body,/renderComposition|renderPhysical|CPU fallback/);
  assert.match(app,/curvature-compare-140\.12\.23-gpu-root-convergence\.json/);
});
test('140.12.23: status failures and bracket telemetry are not hidden by angle statistics',()=>{
  const ladder={targetsCount:1,request:{targets:[[60,0]]},coordinates:[{distanceMetres:60,heightMetres:0}]};
  const cpu={results:[{target:[60,0],status:'visible',angle:0}]};
  const mk=(status,angle,bracket)=>({response:{results:[{target:[60,0],status,angle,residual:0,
    ground:{event:null},pathLength:60}]},telemetry:[{bracketIndex:bracket,refineIterations:12,
    finalBracketWidthRadians:bracket>=0?0.00001:null}],algorithm:{predictorAccepted:bracket<0?1:null}});
  const batches={predictor5mm:mk('visible',0,-2),predictorStrict:mk('solver_failed',null,-3),
    sweepStrict:mk('solver_failed',null,2),bracketStrict:mk('visible',0.00001,2)};
  const r=audit.summarize(ladder,batches,cpu);
  assert.equal(r.variants.predictorStrict.solverFailed,1);
  assert.equal(r.variants.predictorStrict.successfulAngles,0);
  assert.equal(r.variants.bracketStrict.bracketed,1);
  assert.equal(r.variants.bracketStrict.meanRefineIterations,12);
  assert.equal(r.variants.bracketStrict.statusMismatches,0);
  assert.equal(r.productionAuthorized,false);
});
test('140.12.23: rejects mismatched target identity and missing telemetry',()=>{
  const ladder={targetsCount:1,request:{targets:[[60,0]]},coordinates:[{distanceMetres:60,heightMetres:0}]};
  const cpu={results:[{target:[60,0],status:'visible',angle:0}]};
  assert.throws(()=>audit.summarize(ladder,{},cpu),/Invalid GPU root batch/);
});
