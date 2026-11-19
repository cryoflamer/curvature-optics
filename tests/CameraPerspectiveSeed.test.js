'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialize}=require('../src/calibration/CameraPerspectiveSeed');
const width=1920,height=1080;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const unit=a=>a.map(x=>x/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function pose(position,focalPx,target=[0,0,0]){
  const z=unit(target.map((x,i)=>x-position[i])),x=unit(cross(z,[0,0,1])),y=cross(z,x);
  return {position,focalPx,rotation:[x,y,z]};
}
function data(points,p,noise=0){return points.map((world,i)=>{
  const [x,y,z]=p.rotation.map(row=>dot(row,world.map((v,j)=>v-p.position[j])));assert.ok(z>0);
  return {world,pixel:[width/2+p.focalPx*x/z+noise*Math.sin(i*13.7),height/2+p.focalPx*y/z+noise*Math.cos(i*9.3)]};
});}
const spatial=Array.from({length:12},(_,i)=>[35*Math.sin(i*2.1),70*Math.cos(i*1.3),12*Math.sin(i*3.7)]);
const plane=Array.from({length:6},(_,i)=>[(i%3-1)*35,(Math.floor(i/3)-.5)*60,0]);
function recover(points,p,tolerance=1e-6){
  const r=initialize(data(points,p),{width,height});assert.equal(r.status,'candidates',r.reason);assert.equal(r.complete,false);
  const c=r.candidates[0];assert.ok(c.rmsPx<tolerance,JSON.stringify(c));
  assert.ok(Math.hypot(...c.position.map((v,i)=>v-p.position[i]))<tolerance*100);assert.ok(Math.abs(c.focalPx-p.focalPx)<tolerance*100);
  assert.ok(c.rotation.every((row,i)=>row.every((v,j)=>Math.abs(v-p.rotation[i][j])<tolerance)));return r;
}
for(const side of [-1,1]){
  test(`spatial DLT unknown camera side ${side}`,()=>recover(spatial,pose([side*230,-180,60],1800)));
  test(`oblique plane unknown camera side ${side}`,()=>recover(plane,pose([side*170,-220,180],1500)));
}
test('four planar points are sufficient for oblique homography',()=>recover([plane[0],plane[2],plane[3],plane[5]],pose([170,-220,180],1500)));
test('large coordinate offset and telephoto remain normalized',()=>{
  const offset=[6000000,-3000000,1000000],points=spatial.map(p=>p.map((v,i)=>v+offset[i]));
  recover(points,pose([6004000,-3009000,1000500],24000,offset),1e-5);
});
test('frontal plane and collinear configurations are flagged',()=>{
  const frontal={position:[0,0,200],rotation:[[1,0,0],[0,-1,0],[0,0,-1]],focalPx:1800};
  assert.equal(initialize(data(plane,frontal),{width,height}).status,'degenerate');
  assert.equal(initialize(data(plane.map((_,i)=>[i,0,0]),frontal),{width,height}).status,'degenerate');
});
test('insufficient, repeated and focal-bounded inputs do not invent a candidate',()=>{
  const p=pose([230,-180,60],1800),obs=data(spatial,p);
  assert.equal(initialize(obs.slice(0,5),{width,height}).status,'insufficient_points');
  assert.equal(initialize(Array(8).fill(obs[0]),{width,height}).status,'degenerate');
  assert.equal(initialize(obs,{width,height,maxFocalPx:100}).status,'failed');
  assert.throws(()=>initialize(obs,{width,height,minFocalPx:0}),/bounds/);
  assert.throws(()=>initialize([{world:[1,2,NaN],pixel:[1,2]}],{width,height}),/Invalid/);
});
test('noisy initialization stays finite and reports actual reprojection error',t=>{
  const p=pose([230,-180,60],1800),obs=data(spatial,p,.5),r=initialize(obs,{width,height});
  assert.equal(r.status,'candidates',r.reason);const c=r.candidates[0];
  const predicted=data(spatial,c),rms=Math.sqrt(predicted.reduce((s,o,i)=>s+(o.pixel[0]-obs[i].pixel[0])**2+(o.pixel[1]-obs[i].pixel[1])**2,0)/obs.length);
  assert.ok(Math.abs(c.rmsPx-rms)<1e-9);assert.ok(rms<15);t.diagnostic(`seed RMS ${rms.toFixed(3)} px (not refined)`);
});
