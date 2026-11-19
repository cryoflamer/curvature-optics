'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {calibrate}=require('../src/calibration/CameraCalibration');
const physical=require('../src/calibration/CameraPhysicalFit');
const bridge=require('../src/calibration/CameraPhysicalPose');
const projection=require('../src/calibration/CameraLandmarkProjection');
const width=1920,height=1080;
const base={rEarth:6371000,rFEarth:10007543,geometryRadius:6371000,CameraEast:-300,CameraNorth:-600,Height:45,Pan:26.56505117707799,Nick:2,Roll:13,FocalLengthField:43,deviceRatio:1.5,viewcenterHorizon:3};
const points=Array.from({length:12},(_,i)=>({id:'p'+i,east:35*Math.sin(i*2.1),north:70*Math.cos(i*1.3),height:50+12*Math.sin(i*3.7)}));
const opts={width,height,maxCandidates:4,samples:17,maxIterations:60};
const pose=m=>Object.fromEntries(physical.fields.map(k=>[k,m[k]]));
function observe(m,p,options,noise=0){const s=projection.create(m,bridge.photoCamera(m,width,height),width,height,{...options,method:'accurate'});return p.map((landmark,i)=>{const r=s.metric(landmark);assert.equal(r.status,'visible');return {landmark,pixel:r.pixel.map((v,j)=>v+noise*Math.sin(i*13.7+j*9.1))};});}
function verify(result,m,obs,options){assert.equal(result.status,'candidates');assert.equal(result.complete,false);assert.equal(result.method,'accurate');assert.ok(result.candidates.length<=options.maxCandidates);assert.equal(result.attempts.length,result.diagnostics.selected);for(let i=0;i<result.candidates.length;i++){const c=result.candidates[i];const e=physical.evaluate(m,c.pose,obs,{...options,method:'accurate'});assert.deepEqual(c.evaluation,e);if(i)assert.ok(result.candidates[i-1].evaluation.cost<=e.cost);const a=result.attempts[c.attempt];if(a.initialAccurateRmsPx!==null&&obs.every(o=>(o.weight??1)===1))assert.ok(e.rmsPx<=a.initialAccurateRmsPx+1e-10);}}
for(const showModel of [1,2])for(const side of [-1,1])test('unknown vacuum camera '+showModel+' side '+side,t=>{
 const m={...base,showModel,CameraEast:side*300,Pan:-side*base.Pan,Roll:side*13},o=observe(m,points,opts);const scene={...m,CameraEast:0,CameraNorth:0,Height:1,Pan:0,Nick:0,Roll:0,FocalLengthField:21};const before=JSON.stringify([scene,o]);
 const result=calibrate(scene,o,opts);verify(result,scene,o,opts);assert.equal(JSON.stringify([scene,o]),before);assert.ok(result.candidates[0].evaluation.rmsPx<1e-6);for(const k of physical.fields)assert.ok(Math.abs(result.candidates[0].pose[k]-m[k])<1e-3,k);assert.ok(result.diagnostics.generators.every(g=>g.generated>0));t.diagnostic('selected '+result.diagnostics.selected+' / '+result.diagnostics.eligible+'; best '+result.candidates[0].evaluation.rmsPx+' px');
});
test('distant Standard refracted observations: automatic candidate refinement and exact ranking',t=>{
 const m={...base,showModel:1,CameraEast:-1500,CameraNorth:-6000,Height:40,Pan:Math.atan2(1500,22000)*180/Math.PI,Nick:-.06,Roll:2,FocalLengthField:200};const p=Array.from({length:12},(_,i)=>({id:'far'+i,east:140*Math.sin(i*2.2),north:16000+1600*Math.cos(i*1.7),height:45+20*Math.sin(i*1.1)}));const options={...opts,atmosphere:'standard',maxCandidates:3},obs=observe(m,p,options);const result=calibrate({...m,CameraEast:0,Height:1},obs,options);verify(result,m,obs,options);const best=result.candidates[0];assert.ok(best.evaluation.rmsPx<1e-5);assert.ok(result.attempts.some(a=>a.approximate?.accurateValid));for(const k of physical.fields)assert.ok(Math.abs(best.pose[k]-m[k])<.1,k);t.diagnostic('best Accurate '+best.evaluation.rmsPx+' px; attempts '+JSON.stringify(result.attempts.map(a=>({source:a.source,start:a.initialAccurateRmsPx,fast:a.approximate?.rmsPx,fastAccurate:a.approximate?.accurateRmsPx,refined:a.refined?.rmsPx}))));
});
test('held out measurements never alter candidates or ranking',()=>{
 const m={...base,showModel:2},obs=observe(m,points.slice(0,9),opts,.5),validation=observe(m,points.slice(9),opts),a=calibrate(m,obs,{...opts,validation});verify(a,m,obs,opts);const changed=validation.map(o=>({...o,pixel:[o.pixel[0]+123,o.pixel[1]-80]}));const b=calibrate(m,obs,{...opts,validation:changed});assert.deepEqual(a.attempts,b.attempts);assert.deepEqual(a.candidates.map(({validation,...c})=>c),b.candidates.map(({validation,...c})=>c));assert.ok(b.candidates[0].validation.rmsPx>a.candidates[0].validation.rmsPx+100);assert.throws(()=>calibrate(m,obs,{...opts,validation:[obs[0]]}),/duplicate/);
});
test('explicit locked parameters and user initial pose with too few points',()=>{
 const m={...base,showModel:2},obs=observe(m,points.slice(0,2),opts),freeParameters=['Pan'],fixedParameters=Object.fromEntries(physical.fields.filter(k=>k!=='Pan').map(k=>[k,m[k]]));const options={...opts,initialPoses:[{...pose(m),Pan:m.Pan-1,Height:100}],freeParameters,fixedParameters,bounds:{Pan:[m.Pan-2,m.Pan+2]}};const r=calibrate(m,obs,options);verify(r,m,obs,options);assert.ok(r.candidates[0].evaluation.rmsPx<1e-6);for(const k of Object.keys(fixedParameters))assert.equal(r.candidates[0].pose[k],fixedParameters[k]);assert.throws(()=>calibrate(m,obs,{...opts,freeParameters}),/fixed values/);
});
test('no seed and physically impossible supplied candidate are distinct results',()=>{
 const m={...base,showModel:1,CameraEast:0,CameraNorth:0,Height:10,Pan:0,Nick:0,Roll:0};const obs=[{landmark:{id:'hidden',east:0,north:100000,height:1},pixel:[960,540]}];assert.equal(calibrate(m,obs,opts).status,'no_seed');const r=calibrate(m,obs,{...opts,initialPoses:[pose(m)]});assert.equal(r.status,'no_valid_fit');assert.equal(r.candidates.length,0);assert.equal(r.attempts[0].initialAccurateRmsPx,null);assert.equal(r.attempts[0].valid,false);
});
test('authored vertex seed construction and physical recovery',t=>{
 const m={...base,showModel:1,Pan:0,CameraEast:-30,CameraNorth:100,Height:12,Nick:0,Roll:1,ObjType:[8,3],NObjects:[3,0],ObjDist:[1700,0],ObjDeltaDist:[300,100],ObjSize:[1,10],ObjSizeVar:[0,0],ObjSideType:[0,0],ObjSidePos:[6,0],ObjSideVar:[0,0],ObjSizeType:[0,0]};
 const engine=require('../src/geometry/CurvatureGeometryEngine'),sc=engine.createObjectSequenceScene({...m,Height:0},0,true,{opticsNeutral:true,physicalSurface:true,curvature:1/m.rEarth}),p=projection.create(m,bridge.photoCamera(m,width,height),width,height,opts),obs=[],world=[];
 for(let i=0;i<sc.primitives.length;i+=3){for(let j=0;j<sc.primitives[i].points.length;j++){const w=sc.primitives[i].points[j];if(world.some(v=>Math.hypot(...v.map((a,k)=>a-w[k]))<1e-5))continue;const landmark={id:'v'+i+':'+j,bank:0,objectType:8,primitive:i,vertex:j},q=p.vertex(landmark);if(q.status==='visible'){obs.push({kind:'vertex',landmark,pixel:q.pixel});world.push(w);}}}
 assert.ok(obs.length>6);const sample=obs.filter((_,i)=>i%Math.ceil(obs.length/30)===0);const r=calibrate(m,sample,{...opts,maxCandidates:2});verify(r,m,sample,{...opts,maxCandidates:2});assert.ok(r.candidates[0].evaluation.rmsPx<1e-5);t.diagnostic('mesh points '+sample.length+'; best '+r.candidates[0].evaluation.rmsPx+' px');
});
test('candidate limits, explicit bounds and determinism',()=>{
 const m={...base,showModel:2},obs=observe(m,points,opts);const options={...opts,maxCandidates:2,bounds:{Height:[1,100]}};const a=calibrate(m,obs,options);assert.deepEqual(a,calibrate(m,obs,options));assert.ok(a.diagnostics.omitted>0);assert.equal(a.diagnostics.selected,2);assert.ok(a.candidates.every(c=>c.pose.Height>=1&&c.pose.Height<=100));assert.throws(()=>calibrate(m,obs,{...opts,maxCandidates:33}),/budget/);assert.throws(()=>calibrate(m,obs,{...opts,bounds:{Height:[2,1]}}),/bounds/);
});

test('frontal vertical plane retains focal-distance alternatives rather than asserting uniqueness',t=>{
 const m={...base,showModel:2,CameraEast:0,CameraNorth:-200,Height:40,Pan:0,Nick:0,Roll:0};
 const p=[[-40,10],[40,10],[40,70],[-40,70],[10,55]].map(([east,height],i)=>({id:'plane'+i,east,north:0,height}));
 const obs=observe(m,p,opts),options={...opts,minFocalPx:900,maxFocalPx:3600,samples:5};
 const r=calibrate(m,obs,options);verify(r,m,obs,options);const good=r.candidates.filter(c=>c.evaluation.rmsPx<1e-5);
 assert.ok(good.length>=2);assert.ok(Math.max(...good.map(c=>c.pose.FocalLengthField))/Math.min(...good.map(c=>c.pose.FocalLengthField))>1.2);
 assert.ok(r.diagnostics.generators[0].status==='degenerate');t.diagnostic('ambiguous exact alternatives: '+JSON.stringify(good.map(c=>({north:c.pose.CameraNorth,focal:c.pose.FocalLengthField,rms:c.evaluation.rmsPx}))));
});
test('all fixed parameters evaluate without a supplied or generated seed',()=>{
 const m={...base,showModel:2},obs=observe(m,points.slice(0,1),opts),r=calibrate(m,obs,{...opts,freeParameters:[],fixedParameters:pose(m)});
 assert.equal(r.status,'candidates');assert.equal(r.candidates[0].source,'fixed');assert.equal(r.candidates[0].termination,'fixed');assert.equal(r.candidates[0].evaluation.rmsPx,0);
 assert.throws(()=>calibrate(m,obs,{...opts,method:'canvas-direct'}),/Final method/);
});
