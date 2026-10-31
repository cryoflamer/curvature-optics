'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const compare=require('../src/ui/modern/ModernCompareModel');
const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
const src=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const metric=surfaces.createFromCurvature(1/6371000);
function requestField(){
  const calls=[];
  const solve=(d,h)=>{calls.push([d,h]);return Object.freeze({status:d<5000?'indeterminate':'visible',angle:d/1e5+h/1000,reason:'Grid mixed'});};
  return {fullCoverageGrid:true,request:{geometry:'globe',radius:6371000,observerHeight:15},
    sample:solve,exact:solve,stats:()=>({solves:0,experimentalGpu:{kind:'gpu-first-grid',cpuFallbackRequests:0}}),calls};
}
const row=(d,h,status='indeterminate')=>({d,h,kind:h===0?'ground-height':'low-height',gridStatus:status,
  sampleCalls:1,exactCalls:0});
const result=(r,status,angle=0.1)=>({target:metric.surfacePoint2(r.d,r.h),status,angle,
  ground:{hitGround:status==='indeterminate',event:status==='indeterminate'?{contact:'crossing',pathLength:22}:null}});
test('140.12.21: capture selects only actual uncertain requests and stratifies distance',()=>{
  const c=compare.captureGpuRendererQueries(requestField());
  for(let i=0;i<200;i++){c.sample(100+i*23,0.00001+(i%10)*0.2);c.exact(100+i*23,0);}
  for(let i=0;i<10;i++)c.sample(5300+i*9,3);
  const a=compare.selectIndeterminateRendererTargets(c,40);
  assert.equal(a.length,40);
  assert.ok(a.every(r=>r.gridStatus==='indeterminate'&&r.d<5000));
  assert.equal(new Set(a.map(r=>r.d+','+r.h)).size,40);
  assert.deepEqual(a,compare.selectIndeterminateRendererTargets(c,40));
  const bands=new Set(a.map(r=>Math.min(3,Math.floor(r.d/1500))));
  assert.ok(bands.size>=3);
  assert.throws(()=>compare.selectIndeterminateRendererTargets(c,1025),/budget/);
  assert.throws(()=>compare.selectIndeterminateRendererTargets({},1),/capture/);
});
test('140.12.21: GPU direct upgrades only indeterminate grid statuses, never changes optical angles',()=>{
  const base=requestField(),samples=[row(2000,1),row(3000,2),row(6000,3,'visible')];
  // Only uncertain coordinates are allowed to enter the probe.
  assert.throws(()=>compare.gpuStatusQualificationField(base,samples,
    {results:samples.map(r=>result(r,'visible'))},{surfaces}),/indeterminate/);
  const qualified=samples.slice(0,2),answers={results:[result(qualified[0],'visible'),result(qualified[1],'blocked')]};
  const field=compare.gpuStatusQualificationField(base,qualified,answers,{surfaces,useDirect:true});
  const a=field.sample(2000,1),b=field.exact(3000,2);
  assert.equal(a.status,'visible');assert.equal(b.status,'blocked');
  assert.equal(a.angle,2000/1e5+1/1000);assert.equal(b.angle,3000/1e5+2/1000);
  assert.equal(field.sample(6000,3).status,'visible');
  assert.equal(field.sample(1000,1).status,'indeterminate');
  assert.equal(field.qualificationAudit().uniqueUpgradedTargets,2);
  assert.equal(field.qualificationAudit().directUpgrades,2);
  assert.equal(field.qualificationAudit().fineUpgrades,0);
  assert.equal(field.stats().experimentalGpu.statusQualification.cpuFallbackRequests,0);
});
test('140.12.21: fine-step contact switch is independent of direct switch, fail-closed',()=>{
  const samples=[row(2000,0),row(3000,.01),row(4000,1)],
    direct={results:[result(samples[0],'indeterminate'),result(samples[1],'visible'),
      result(samples[2],'indeterminate')]},
    fineResults=[{sample:samples[0],result:result(samples[0],'visible')},
      {sample:samples[2],result:result(samples[2],'indeterminate')}];
  const fineOnly=compare.gpuStatusQualificationField(requestField(),samples,direct,
    {surfaces,useFine:true,fineResults});
  assert.equal(fineOnly.sample(2000,0).status,'visible');
  assert.equal(fineOnly.sample(3000,.01).status,'indeterminate','direct result must not leak into fine-only');
  assert.equal(fineOnly.sample(4000,1).status,'indeterminate','uncertain fine shot cannot make target visible');
  assert.equal(fineOnly.qualificationAudit().fineUpgrades,1);
  const combined=compare.gpuStatusQualificationField(requestField(),samples,direct,
    {surfaces,useDirect:true,useFine:true,fineResults});
  assert.equal(combined.sample(2000,0).status,'visible');
  assert.equal(combined.sample(3000,.01).status,'visible');
  assert.equal(combined.sample(4000,1).status,'indeterminate');
  assert.equal(combined.qualificationAudit().fineUpgrades,1);
  assert.equal(combined.qualificationAudit().directUpgrades,1);
  assert.equal(combined.qualificationAudit().unconfirmedTargets,1);
});
test('140.12.21: rejected misordered or non-direct-uncertain fine result cannot alter geometry',()=>{
  const sample=row(2000,1),good=result(sample,'visible');
  assert.throws(()=>compare.gpuStatusQualificationField(requestField(),[sample],
    {results:[{...good,target:[1,2]}]},{surfaces,useDirect:true}),/target\/order/);
  assert.throws(()=>compare.gpuStatusQualificationField(requestField(),[sample],
    {results:[good]},{surfaces,useFine:true,fineResults:[{sample,result:good}]}),/not uncertain/);
  assert.throws(()=>compare.gpuStatusQualificationField(requestField(),[sample,sample],
    {results:[good,good]},{surfaces}),/Duplicate/);
});
test('140.12.21: UI triggers both independent, GPU-only status experiments and CPU reference last',()=>{
  const app=src('src/ui/modern/ModernApp.js'),html=src('CurvatureModern.html');
  assert.match(html,/ModernApp\.js\?v=140\.12\.27/);
  assert.match(html,/ModernCompareModel\.js\?v=140\.12\.27/);
  assert.match(html,/id="ModernGpuStatusQualificationRun"/);
  assert.match(html,/id="ModernGpuStatusDirectToggle"/);
  assert.match(html,/id="ModernGpuContactQualificationToggle"/);
  assert.match(app,/addEventListener\('click',runGpuStatusQualification141221\)/);
  assert.match(app,/curvature-compare-140\.12\.21-gpu-status-qualification\.json/);
  const segment=app.slice(app.indexOf('async function runGpuStatusQualification141221()'),
    app.indexOf('function bindCompareGpuProbe()'));
  assert.match(segment,/selectIndeterminateRendererTargets\(capture,targetBudget\)/);
  assert.match(segment,/step:500/);assert.match(segment,/step:50/);
  assert.match(segment,/gpuStatusQualificationField\(base,selected,/);
  assert.match(segment,/directOnly/);assert.match(segment,/fineOnly/);
  assert.match(segment,/combined/);
  assert.ok(segment.indexOf('state.compareGraphs.A.Redraw()')>
    segment.indexOf('combinations.forEach(function(row)'));
  assert.match(segment,/originalNonindeterminateGridStatusesPreserved:true/);
  assert.match(segment,/cpuShootingFallback:false/);
  assert.match(segment,/productionAuthorized:false/);
});
test('140.12.21: real tower outlines and fills can discover indeterminate GPU requests for status-only repaint',()=>{
  const composition=require('../src/scene/CurvatureIndependentComposition');
  const silhouette=require('../src/optics/OpticalTowerSilhouette');
  const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
  const bench=require('../tools/benchmark-adaptive-prism-112');
  const m=bench.model(85,'globe');
  const grid=compare.gpuFirstGrid(m,4096,{composition,silhouette,surfaces,branch:'first-forward-x'},
    {layout:'distance-focused'});
  const results=grid.request.targets.map(p=>({target:p.slice(),
    status:p[1]<0.2?'indeterminate':'visible',angle:Math.atan2(p[1]-m.Height,p[0])}));
  const base=compare.gpuFirstRayField(grid,{results},surfaces);
  const capture=compare.captureGpuRendererQueries(base,{maximumDistance:6000,maximumHeight:20});
  const scene=composition.composeOpticalMain(Object.assign({},m,{geometryRadius:m.rEarth}),true,
    {physicalWorld:true});
  optics.create().transform(scene,m,{atmosphere:'standard',experimentalRayField:capture});
  const selected=compare.selectIndeterminateRendererTargets(capture,32);
  assert.ok(selected.length>0,'physical renderer must request uncertain near-ground targets');
  const direct={results:selected.map(r=>result(r,'visible'))};
  const fixed=compare.gpuStatusQualificationField(base,selected,direct,{surfaces,useDirect:true});
  const fixedScene=optics.create().transform(scene,m,{atmosphere:'standard',experimentalRayField:fixed});
  assert.ok(fixedScene.stats.visibleSegments>0);
  assert.equal(fixed.stats().experimentalGpu.cpuFallbackRequests,0);
  assert.ok(fixed.qualificationAudit().uniqueUpgradedTargets>0);
});
