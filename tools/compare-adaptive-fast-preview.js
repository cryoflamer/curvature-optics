'use strict';
// Deterministic, Node-only optical-angle/status diagnostic against RK4.
// NOT a browser screenshot, FPS, full-scene occlusion or multipath audit.
// Usage: node tools/compare-adaptive-fast-preview.js [--quick]
const fast=require('../src/optics/OpticalFastRayField');
const projection=require('../src/optics/OpticalTargetProjection');
const R=6371000;
const VIEWPORT_WIDTH=1920,FIELD_OF_VIEW_DEGREES=5;
const CASES=[
  {geometry:'globe',atmosphere:'temperature-lapse',profileOptions:{gradientKPerKm:-20}},
  {geometry:'globe',atmosphere:'temperature-lapse',profileOptions:{gradientKPerKm:20}},
  {geometry:'globe',atmosphere:'profile-transition',profileOptions:{
    transitionProfile:{source:'standard',weight:0.5},occlusionRadius:R}},
  {geometry:'flat',atmosphere:'inverse-temperature',profileOptions:{
    inverseProfile:{source:'standard',weight:0.5},occlusionRadius:R}},
  {geometry:'flat',atmosphere:'inverse-spherical',profileOptions:{occlusionRadius:R}},
  {geometry:'globe',atmosphere:'exponential-occlusion',profileOptions:{occlusionRadius:R}}
];
function target(geometry,d,h){
  return geometry==='flat'?[d,h]:[(R+h)*Math.sin(d/R),(R+h)*Math.cos(d/R)-R];
}
function audit(options={}){
  const eyes=options.quick?[15]:[2,15,100];
  const summaries=[];
  for(const spec of CASES)for(const eye of eyes){
    const opts={...spec,radius:R,observerHeight:eye};
    const field=fast.createAdaptive(opts);
    const row={geometry:spec.geometry,atmosphere:spec.atmosphere,
      profileOptions:spec.profileOptions,observerHeight:eye,
      visible:0,blocked:0,indeterminate:0,unsupported:0,
      referenceUncertain:0,statusMismatches:[],maxVisibleAngleErrorPx:0,
      worstVisiblePoint:null};
    for(const d of [1000,10000,25000,50000,80000])for(const h of [0,3,15,50,200,1000]){
      const estimate=field.sample(d,h);
      if(!['visible','blocked','indeterminate','unsupported'].includes(estimate.status))
        throw Error('Unexpected preview status: '+estimate.status);
      row[estimate.status]++;
      // An explicitly unresolved preview is neither an RK4 mismatch nor a
      // physical clear/blocked verdict. Don't hide it from the counters.
      if(estimate.status==='indeterminate'||estimate.status==='unsupported')continue;
      const truth=projection.solve({...opts,target:target(spec.geometry,d,h),
        step:1000,shootingPredictor:true});
      if(truth.status==='indeterminate'||truth.status==='unsupported'){
        row.referenceUncertain++;continue;
      }
      if(estimate.status!==truth.status){
        row.statusMismatches.push({distance:d,height:h,fast:estimate.status,
          accurate:truth.status});continue;
      }
      if(estimate.status==='visible'){
        if(!Number.isFinite(estimate.angle)||!Number.isFinite(truth.angle))
          throw Error('Visible ray has a non-finite angle');
        const errorPx=Math.abs(estimate.angle-truth.angle)*VIEWPORT_WIDTH/
          (FIELD_OF_VIEW_DEGREES*Math.PI/180);
        if(errorPx>row.maxVisibleAngleErrorPx){
          row.maxVisibleAngleErrorPx=errorPx;
          row.worstVisiblePoint={distance:d,height:h};
        }
      }
    }
    if(field.stats().shootRK4Calls!==0)
      throw Error('Adaptive Fast unexpectedly invoked RK4');
    summaries.push(row);
  }
  return {
    label:'sampled forward shallow-ray comparison; NOT a full-frame error bound',
    hypotheticalCamera:{widthPx:VIEWPORT_WIDTH,fieldOfViewDegrees:FIELD_OF_VIEW_DEGREES},
    totalSamples:summaries.reduce((sum,row)=>sum+row.visible+row.blocked+row.indeterminate+row.unsupported,0),
    totalMismatches:summaries.reduce((sum,row)=>sum+row.statusMismatches.length,0),
    maxVisibleAngleErrorPx:Math.max(...summaries.map(row=>row.maxVisibleAngleErrorPx)),
    summaries
  };
}
if(require.main===module){
  const report=audit({quick:process.argv.includes('--quick')});
  console.log(JSON.stringify(report,null,2));
  if(report.totalMismatches)process.exitCode=1;
}
module.exports={audit};
