'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialize}=require('../src/calibration/CameraFocalSweep');
const width=1920,height=1080;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),unit=a=>a.map(x=>x/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function pose(position,focalPx,target=[0,0,0]){const z=unit(target.map((v,i)=>v-position[i])),x=unit(cross(z,[0,0,1]));return {position,focalPx,rotation:[x,cross(z,x),z]};}
function data(points,p,noise=0){return points.map((world,i)=>{const [x,y,z]=p.rotation.map(r=>dot(r,world.map((v,j)=>v-p.position[j])));assert.ok(z>0);return {world,pixel:[width/2+p.focalPx*x/z+noise*Math.sin(i*13.7),height/2+p.focalPx*y/z+noise*Math.cos(i*9.3)]};});}
const spatial=Array.from({length:12},(_,i)=>[35*Math.sin(i*2.1),70*Math.cos(i*1.3),12*Math.sin(i*3.7)]);
const bridge=Array.from({length:12},(_,i)=>[(i%2)*8,Math.floor(i/2)*300,8+(i%3)*.01]);
const options={width,height,minFocalPx:500,maxFocalPx:60000,samples:33};
function verify(points,p,noise=0,opts=options){const obs=data(points,p,noise),r=initialize(obs,opts);assert.equal(r.status,'candidates',r.reason);assert.equal(r.complete,false);const c=r.candidates[0];const pred=data(points,c);const rms=Math.sqrt(pred.reduce((s,o,i)=>s+(o.pixel[0]-obs[i].pixel[0])**2+(o.pixel[1]-obs[i].pixel[1])**2,0)/points.length);assert.ok(Math.abs(rms-c.rmsPx)<1e-7);assert.ok(r.candidates.every(c=>c.focalPx>=opts.minFocalPx&&c.focalPx<=opts.maxFocalPx));return {r,c};}
for(const side of [-1,1])test(`spatial recovery, side ${side}`,t=>{const p=pose([side*230,-180,60],1800);const {c}=verify(spatial,p);t.diagnostic(JSON.stringify(c));assert.ok(c.rmsPx<.002);assert.ok(Math.abs(c.focalPx-p.focalPx)<.1);assert.ok(Math.hypot(...c.position.map((v,i)=>v-p.position[i]))<.05);});
test('four noncoplanar points (fewer than spatial DLT needs)',()=>{const p=pose([230,-180,60],1800);const {c}=verify(spatial.slice(0,4),p);assert.ok(c.rmsPx<.01);});
test('frontal planar ambiguity retains distinct focal/distance candidates',()=>{const p={position:[0,0,200],rotation:[[1,0,0],[0,-1,0],[0,0,-1]],focalPx:1800},points=[[-40,-30,0],[40,-30,0],[40,30,0],[-40,30,0],[10,15,0]];const {r}=verify(points,p,0,{width,height,minFocalPx:900,maxFocalPx:3600,samples:5});const good=r.candidates.filter(c=>c.rmsPx<1e-4);assert.ok(good.some(c=>c.focalPx===900));assert.ok(good.some(c=>c.focalPx===3600));});
for(const side of [-1,1])test(`near-planar distant bridge, side ${side}`,t=>{const p=pose([side*900,-9200,80],24000,[4,750,8]);const {c}=verify(bridge,p);t.diagnostic(JSON.stringify(c));assert.ok(c.rmsPx<.02);});
test('large world offset and telephoto fixed focal',()=>{const offset=[6000000,-3000000,1000000],points=spatial.map(p=>p.map((v,i)=>v+offset[i]));const p=pose([6004000,-3009000,1000500],24000,offset);const {c}=verify(points,p,0,{width,height,minFocalPx:24000,maxFocalPx:24000,samples:2});assert.ok(c.rmsPx<1e-5);});
test('noisy observations have finite deterministic scored candidates',()=>{const p=pose([230,-180,60],1800),{r,c}=verify(spatial,p,.5);assert.ok(c.rmsPx<2);assert.deepEqual(r,initialize(data(spatial,p,.5),options));});
test('input validation and degeneracy',()=>{assert.equal(initialize([],options).status,'insufficient_points');assert.equal(initialize(Array.from({length:4},(_,i)=>({world:[i,0,0],pixel:[i,0]})),options).status,'degenerate');assert.throws(()=>initialize([],{...options,samples:130}),/bounds/);assert.throws(()=>initialize([{world:[1,2,NaN],pixel:[1,2]}],options),/Invalid/);});
test('noisy weak bridge geometry reports residuals rather than a unique calibrated pose',t=>{
  const p=pose([-900,-9200,80],24000,[4,750,8]),{r,c}=verify(bridge,p,.5);
  t.diagnostic(`weak geometry seed RMS ${c.rmsPx.toFixed(3)} px; focal ${c.focalPx.toFixed(1)} px; position error ${Math.hypot(...c.position.map((v,i)=>v-p.position[i])).toFixed(1)} m`);
  assert.ok(c.rmsPx<3);assert.ok(r.candidates.length>1);assert.equal(r.complete,false);
  for(const candidate of r.candidates){
    const R=candidate.rotation;assert.ok(Math.abs(dot(cross(R[0],R[1]),R[2])-1)<1e-8);
    for(const row of R)assert.ok(Math.abs(normRow(row)-1)<1e-8);
    assert.ok(bridge.every(w=>dot(R[2],w.map((v,i)=>v-candidate.position[i]))>0));
  }
  function normRow(row){return Math.hypot(...row);}
});
