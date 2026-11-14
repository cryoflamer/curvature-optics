'use strict';
// Node-only microbenchmark for the opt-in optical kernel, NOT an Opera FPS test.
// Run: node tools/benchmark-adaptive-fast-preview.js
const {performance}=require('node:perf_hooks');
const fast=require('../src/optics/OpticalFastRayField');
const R=6371000;
const cases=[
  {geometry:'globe',atmosphere:'standard'},
  {geometry:'globe',atmosphere:'temperature-lapse',profileOptions:{gradientKPerKm:-20}},
  {geometry:'globe',atmosphere:'profile-transition',profileOptions:{
    transitionProfile:{source:'temperature-lapse',weight:0.5},
    temperatureProfile:{gradientKPerKm:20},occlusionRadius:R}},
  {geometry:'flat',atmosphere:'inverse-temperature',profileOptions:{
    inverseProfile:{source:'standard',weight:0.5},occlusionRadius:R}}
];
const points=[1000,5000,12000,30000,50000,100000].flatMap(d=>
  [0,2,5,15,30,80,200].map(h=>[d,h]));
for(const options of cases){
  const field=fast.createAdaptive({...options,radius:R,observerHeight:15});
  let checksum=0;
  for(let i=0;i<1000;i++)field.sample(...points[i%points.length]);
  const count=30000,start=performance.now();
  for(let i=0;i<count;i++){
    const result=field.sample(...points[i%points.length]);
    checksum+=result.angle||0;
  }
  const ms=performance.now()-start;
  console.log(JSON.stringify({geometry:options.geometry,atmosphere:options.atmosphere,
    calls:count,microsecondsPerTarget:Number((ms*1000/count).toFixed(3)),
    checksum:Number(checksum.toFixed(6)),shootRK4Calls:field.stats().shootRK4Calls}));
}
