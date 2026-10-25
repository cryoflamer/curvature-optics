#!/usr/bin/env node
'use strict';
// Regression of the zero-clearance default and near-tangent stability.
const diag = require('../OpticalTowerDiagnostics');
const R = 6371000, ho = 15, arcsec = 180 * 3600 / Math.PI;
const distances = [20000, 25000];
const strengths = [0, 0.000293];
const steps = [10, 5];
let failures = 0, count = 0;
function exactVacuum(d) {
  const a = d/R - Math.acos(R/(R+ho));
  return a <= 0 ? 0 : R*(1/Math.cos(a)-1);
}
function solve(distance, N, step, h, tol) {
  return diag.solveAngle({geometry:'globe', atmosphere:'standard', observerHeight:ho,
    radius:R, distance, targetHeight:h, step, clearanceTolerance:tol,
    atmosphereOptions:{refractivity:N,scaleHeight:8500}});
}
function boundary(d,N,step,tol) {
  let lo=0.1,hi=100;
  if (solve(d,N,step,lo,tol).status==='visible' || solve(d,N,step,hi,tol).status!=='visible')
    throw Error('Cannot bracket horizon');
  for(let i=0;i<15;i++) {
    const mid=(lo+hi)/2;
    if(solve(d,N,step,mid,tol).status==='visible') hi=mid;
    else lo=mid;
  }
  return (lo+hi)/2;
}
console.log('ZERO-CLEARANCE PREFLIGHT (15m observer; matched n(h))');
console.log('distance N0 boundary10(m) boundary5(m) stepDelta(mm) vacuumError(mm) oldShift(cm)');
for(const d of distances) for(const N of strengths) {
  try {
    const b10=boundary(d,N,10,0), b5=boundary(d,N,5,0);
    const old=boundary(d,N,5,0.03);
    const delta=Math.abs(b10-b5);
    const vacError=N===0 ? Math.abs(b5-exactVacuum(d)) : null;
    console.log(`${d} ${N.toFixed(6)} ${b10.toFixed(5)} ${b5.toFixed(5)} ${(delta*1000).toFixed(3)} ${vacError===null?'-':(vacError*1000).toFixed(3)} ${((old-b5)*100).toFixed(3)}`);
    count++;
    if(delta>0.005 || (vacError!==null && vacError>0.005) || old>b5+0.001) {
      failures++; console.error('FAIL boundary accuracy/monotonicity',d,N);
    }
    for(const offset of [-0.2,0.2]) {
      const h=b5+offset;
      if(h<=0) continue;
      const a=solve(d,N,10,h,0), b=solve(d,N,5,h,0);
      count++;
      if(a.status!==b.status || (offset<0 && b.status==='visible') || (offset>0 && b.status!=='visible')) {
        failures++; console.error('FAIL near-tangent visibility',d,N,offset,a.status,b.status);
      }
      if(a.status==='visible' && Math.abs(a.angle-b.angle)*arcsec>0.1) {
        failures++; console.error('FAIL near-tangent angle',d,N,offset);
      }
    }
  } catch(e) {failures++;console.error('FAIL',d,N,e.stack);}
}
console.log(`Cases: ${count}; failures: ${failures}`);
process.exitCode=failures?1:0;
