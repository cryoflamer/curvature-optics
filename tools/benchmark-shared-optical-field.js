#!/usr/bin/env node
/* Repeatable 2D projection workload. Reports preprocessing and redraw separately.
 * Results are environment-dependent; this is not a Canvas/frame-rate benchmark.
 */
'use strict';
const {performance}=require('node:perf_hooks');
const fieldAPI=require('../src/optics/OpticalSharedRayField');
function options(kind, gridSize=5) {
  if(!Number.isInteger(gridSize)||gridSize<2||gridSize>64)throw Error('gridSize must be 2..64');
  const distances=Array.from({length:gridSize},(_,i)=>1000+200*i/(gridSize-1));
  const heights=Array.from({length:gridSize},(_,i)=>20+2*i/(gridSize-1));
  const base={geometry:'flat',observerHeight:15,distances,
    heights,step:200,angleTolerance:2e-5};
  if(kind==='inverse-spherical') return {...base,atmosphere:kind,
    profileOptions:{occlusionRadius:6371000}};
  if(kind==='standard') return {...base,atmosphere:kind};
  if(kind==='vacuum') return {...base,atmosphere:kind};
  throw Error('Unknown profile: '+kind);
}
function points(count) {
  // Fixed non-grid aligned samples, independent of wall clock or random seed.
  return Array.from({length:count},(_,i)=>({
    d:1000+200*((i*37+11)%101)/101,
    h:20+2*((i*53+7)%103)/103
  }));
}
function measure(fn) {const start=performance.now();const value=fn();return {ms:performance.now()-start,value};}
function run({profile='vacuum',counts=[2,10,85],frames=3,gridSize=5,viewportWidth=1920,fieldOfViewDeg=60}={}) {
  if(!Number.isInteger(frames)||frames<1)throw Error('frames must be positive integer');
  if(!Number.isFinite(viewportWidth)||viewportWidth<=0||!Number.isFinite(fieldOfViewDeg)||fieldOfViewDeg<=0||fieldOfViewDeg>=179)throw Error('Invalid camera');
  const focalPixels=viewportWidth/(2*Math.tan(fieldOfViewDeg*Math.PI/360));
  const result=[];
  for(const count of counts) {
    const targets=points(count), opts=options(profile,gridSize);
    const reference=fieldAPI.create(opts);
    const direct=measure(()=>{
      let sum=0;
      for(let f=0;f<frames;f++)for(const p of targets) {
        // An uncached solve reflects repeated unshared target projection.
        const r=reference.exact(p.d+f*1e-9,p.h);
        if(r.status==='visible') sum+=r.angle;
      }
      return sum;
    });
    const shared=fieldAPI.create(opts);
    const warm=measure(()=>shared.warm());
    const first=measure(()=>targets.map(p=>shared.sample(p.d,p.h)));
    const redraw=measure(()=>{
      let sum=0;
      for(let f=1;f<frames;f++)for(const p of targets){
        const r=shared.sample(p.d,p.h);
        if(r.status==='visible')sum+=r.angle;
      }
      return sum;
    });
    let maxError=0,checked=0,interpolated=0,fallback=0,unexpectedStatus=0;
    for(let i=0;i<targets.length;i++) {
      const p=targets[i], approx=first.value[i], exact=reference.exact(p.d,p.h);
      if(approx.method==='interpolated')interpolated++; else fallback++;
      if(approx.status!==exact.status)unexpectedStatus++;
      if(approx.status==='visible'&&exact.status==='visible') {
        maxError=Math.max(maxError,Math.abs(approx.angle-exact.angle));checked++;
      }
    }
    result.push({profile,objects:count,frames,gridSize,viewportWidth,fieldOfViewDeg,directMs:direct.ms,
      warmMs:warm.ms,firstMs:first.ms,redrawMs:redraw.ms,
      warmSolves:warm.value.solves,sharedSolves:shared.stats().solves,
      interpolated,fallback,statusMismatch:unexpectedStatus,
      checked,maxAngularErrorRad:maxError,approxMaxPixelError:maxError*focalPixels,stats:shared.stats()});
  }
  return result;
}
if(require.main===module){
  const args=process.argv.slice(2);
  const profile=args.find(x=>x.startsWith('--profile='))?.split('=')[1]||'vacuum';
  const frames=Number(args.find(x=>x.startsWith('--frames='))?.split('=')[1]||3);
  const gridSize=Number(args.find(x=>x.startsWith('--grid='))?.split('=')[1]||5);
  try {console.log(JSON.stringify({environment:{node:process.version,platform:process.platform},
    measurements:run({profile,frames,gridSize})},null,2));}
  catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={run,points,options};
