'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const warp=require('../src/ui/modern/ModernCameraPerspectiveWarp');
const interaction=require('../src/ui/modern/ModernCameraInteraction');
const preview=require('../src/ui/modern/ModernCameraDragPreview');
const physicalCamera=require('../src/app/CurvaturePhysicalCamera');
const EPS=1e-7;
function near(a,b,eps=EPS){assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);}
const camera={Pan:7.5,Nick:-2.1,Roll:0};
const spec={width:800,height:500,fovRadians:0.8,aspectRatio:1.6,camera,aimRadians:0};
function dot(a,b){return a.reduce((s,x,i)=>s+x*b[i],0);}
function forwardProject(from,to,x,y){
  const h=Math.tan(spec.fovRadians/2)/Math.hypot(1,spec.aspectRatio);
  const fx=spec.width/(2*h*spec.aspectRatio),fy=spec.height/(2*h);
  const old=warp.basis(from,spec.aimRadians),next=warp.basis(to,spec.aimRadians);
  const world=old.forward.map((v,i)=>v+old.right[i]*(x-spec.width/2)/fx-
    old.up[i]*(y-spec.height/2)/fy);
  const z=dot(world,next.forward);
  return [spec.width/2+fx*dot(world,next.right)/z,
    spec.height/2-fy*dot(world,next.up)/z];
}
test('137.4: perspective warp identity matches CSS pixel coordinates, no movement',()=>{
  const t=warp.transform(spec,camera);
  assert.ok(t.css.startsWith('matrix3d('));
  for(const [x,y] of [[0,0],[400,250],[800,500],[600,50]]){
    const mapped=t.point(x,y);near(mapped[0],x);near(mapped[1],y);
  }
});
test('137.4: pixel re-projection agrees with independently projected rotated rays',()=>{
  for(const next of [{Pan:10,Nick:1,Roll:0},{Pan:5,Nick:-3,Roll:25},
    {Pan:9,Nick:-1.5,Roll:-35}]){
    const t=warp.transform(spec,next);
    assert.ok(t,`Expected valid plane for ${JSON.stringify(next)}`);
    for(const [x,y] of [[0,0],[800,0],[800,500],[0,500],[400,250],[100,200]]){
      const expected=forwardProject(camera,next,x,y),mapped=t.point(x,y);
      near(mapped[0],expected[0]);near(mapped[1],expected[1]);
    }
  }
});
test('137.4: shared 2-axis drag moves center consistently and creates a projective warp',()=>{
  const input={viewport:'A',width:spec.width,height:spec.height,
    fovRadians:spec.fovRadians,aspectRatio:spec.aspectRatio,camera};
  const controller=interaction.create();
  controller.begin({...input,x:100,y:100});
  const sample=controller.move({x:170,y:145});
  const next=interaction.angles(sample);
  const t=warp.transform(spec,next),center=t.point(400,250);
  assert.ok(center[0]>400&&center[1]>250);
  assert.ok(Math.abs(t.matrix[6])+Math.abs(t.matrix[7])>1e-8,
    'Two-axis perspective rotation should not be an image translation');
});
test('137.4: compare A/B use one world rotation with independent raster dimensions',()=>{
  const next={Pan:9,Nick:1,Roll:0};
  const a=warp.transform(spec,next),b=warp.transform({...spec,width:400,height:250},next);
  for(const [x,y] of [[0.5,0.5],[0,0],[1,1],[0.75,0.25]]){
    const p=a.point(spec.width*x,spec.height*y),q=b.point(400*x,250*y);
    near(p[0]/spec.width,q[0]/400);near(p[1]/spec.height,q[1]/250);
  }
});
test('137.4: Scene physical camera aim is included, Compare stays eye-level',()=>{
  const model={Pan:7.5,Nick:0.2,Roll:15,Height:15,showModel:1,
    rEarth:6371000,rFEarth:6371000,deviceRatio:1.6,
    camViewAngle:0.8,viewcenterHorizon:0};
  const aim=physicalCamera.create(model).aimDip;
  assert.ok(aim>0);
  const old=warp.basis(model,aim),newAim=warp.basis(model,0);
  assert.ok(dot(old.forward,newAim.forward)<1);
  const next={Pan:7.6,Nick:0.3,Roll:15};
  const t=warp.transform({...spec,camera:model,aimRadians:aim},next);
  assert.ok(t);
  const expected=warp.transform({...spec,camera:model,aimRadians:0},next);
  assert.ok(expected);
  assert.ok(Math.abs(t.point(0,0)[0]-expected.point(0,0)[0])>1e-7);
});
test('137.4: extreme rotation gets safe fallback; invalid calibration is rejected',()=>{
  assert.equal(warp.transform(spec,{Pan:179,Nick:0,Roll:0}),null);
  assert.throws(()=>warp.transform({...spec,fovRadians:0},camera),RangeError);
  assert.throws(()=>warp.transform({...spec,width:NaN},camera),RangeError);
  assert.throws(()=>warp.transform(spec,{Pan:NaN,Nick:0,Roll:0}),RangeError);
});
function classes(){const s=new Set();return {add:x=>s.add(x),remove:x=>s.delete(x),contains:x=>s.has(x)};}
function fake(name,width,height){return {name,canvas:{style:{transform:'',willChange:'',transformOrigin:''},
  classList:classes(),getBoundingClientRect(){return {width,height};}},camera,
  fovRadians:spec.fovRadians,aspectRatio:spec.aspectRatio,aimRadians:0};}
test('137.4: preview uses one RAF for both perspective canvases, holds and restores',()=>{
  const queue=[];
  const p=preview.create({requestFrame(fn){queue.push(fn);return queue.length;},cancelFrame(){},
    perspective:warp,angleMapping:interaction.angles,cursorHost:{classList:classes()}});
  const A=fake('A',800,500),B=fake('B',400,250);
  const s={dx:70,dy:45,width:800,height:500,fovRadians:spec.fovRadians,
    aspectRatio:spec.aspectRatio,camera};
  p.begin({source:'A',viewports:[A,B]});
  p.move({...s,dx:60});p.move(s);
  assert.equal(queue.length,1);
  assert.equal(A.canvas.style.transform,'');
  queue.shift()();
  assert.match(A.canvas.style.transform,/^matrix3d\(/);
  assert.match(B.canvas.style.transform,/^matrix3d\(/);
  assert.equal(A.canvas.style.transformOrigin,'0 0');
  p.hold({...s,dx:90});assert.equal(p.isHolding(),true);
  assert.match(A.canvas.style.transform,/^matrix3d\(/);
  p.clear();
  assert.equal(A.canvas.style.transform,'');assert.equal(B.canvas.style.transform,'');
  assert.equal(A.canvas.style.transformOrigin,'');
});
