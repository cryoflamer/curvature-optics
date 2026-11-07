#!/usr/bin/env node
'use strict';
// Deterministic target set; approximate preview results are NEVER validation
// of ground truth. The independent RK4 target solver is the comparison oracle.
const {performance}=require('node:perf_hooks');
const fast=require('../src/optics/OpticalFastRayField');
const accurate=require('../src/optics/OpticalTargetProjection');
const R=6371000;
const scenes=[
  {name:'globe-standard',geometry:'globe',atmosphere:'standard',observerHeight:15},
  {name:'flat-standard',geometry:'flat',atmosphere:'standard',observerHeight:15},
  {name:'flat-exponential',geometry:'flat',atmosphere:'exponential-occlusion',
    observerHeight:15,profileOptions:{occlusionRadius:R}},
  {name:'flat-inverse-endpoint',geometry:'flat',atmosphere:'inverse-temperature',
    observerHeight:15,profileOptions:{occlusionRadius:R,
      inverseProfile:{source:'standard',weight:1}}}
];
const distances=[1000,3000,7000,12000,20000,30000,50000,75000,100000];
const heights=[0,5,15,30,60,100,200];
const pxPerRad=1920/(2*Math.tan(5*Math.PI/360));
function target(geometry,d,h){return geometry==='flat'?[d,h]:[
  (R+h)*Math.sin(d/R),(R+h)*Math.cos(d/R)-R];}
function time(){return performance.now();}
function compare(s){
  const f=fast.create({...s,radius:R});
  let fastMs=0,accurateMs=0,maxPixelError=0,maxAngularError=0,
    compared=0,match=0,mismatch=0,uncertain=0,unsupported=0,failed=0;
  const examples=[];
  for(const d of distances)for(const h of heights){
    let t=time(),p=f.sample(d,h);fastMs+=time()-t;
    t=time();const a=accurate.solve({geometry:s.geometry,radius:R,
      atmosphere:s.atmosphere,profileOptions:s.profileOptions,
      observerHeight:s.observerHeight,target:target(s.geometry,d,h),
      step:1000,shootingPredictor:true});accurateMs+=time()-t;
    if(p.status==='indeterminate'){uncertain++;continue;}
    if(p.status==='unsupported'){unsupported++;continue;}
    if(a.status==='solver_failed'||a.status==='indeterminate'){
      failed++;continue;
    }
    if(p.status!==a.status){
      mismatch++;examples.push(`${d}m/${h}m: fast=${p.status}, exact=${a.status}`);
      continue;
    }
    match++;
    if(a.status==='visible'&&Number.isFinite(a.angle)){
      const err=Math.abs(p.angle-a.angle);compared++;
      maxAngularError=Math.max(maxAngularError,err);
      maxPixelError=Math.max(maxPixelError,err*pxPerRad);
    }
  }
  console.log(`${s.name}: ${f.mode}`);
  console.log(`  statuses: match=${match}, mismatch=${mismatch}, uncertain=${uncertain}, unsupported=${unsupported}, RK4-unresolved=${failed}`);
  console.log(`  visible-angle comparisons=${compared}, max error=${maxAngularError.toExponential(3)} rad / ${maxPixelError.toFixed(3)} px @ 1920px, 5° horizontal FOV`);
  console.log(`  sampled target time: fast=${fastMs.toFixed(3)} ms, RK4=${accurateMs.toFixed(3)} ms (Node.js, not whole-scene FPS)`);
  if(examples.length)console.log('  disagreements: '+examples.slice(0,8).join('; '));
  return {mismatch,failed};
}
console.log('Fast Ray Field diagnostic — approximate model vs independent RK4');
for(const s of scenes)compare(s);
console.log('Preview results must never be treated as validated visibility or production pixel parity.');
