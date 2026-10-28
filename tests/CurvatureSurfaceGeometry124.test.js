'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const geom=require('../src/geometry/CurvatureSurfaceGeometry');
const R=6371000;
function near(actual,expected,tolerance,label){
 assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,
  `${label}: got ${actual}, expected ${expected} ±${tolerance}`);
}
function nearVector(actual,expected,tolerance,label){
 assert.equal(actual.length,expected.length,label);
 actual.forEach((x,i)=>near(x,expected[i],tolerance,`${label}[${i}]`));
}

test('124: explicit zero curvature is an exact plane in 2D and 3D',()=>{
 const flat=geom.createFromCurvature(0);
 assert.equal(flat.flat,true);
 assert.equal(geom.curvatureFromRadius(Infinity),0);
 assert.equal(geom.radiusFromCurvature(0),Infinity);
 for(const d of [-1e9,-1000,0,1000,1e9]){
  for(const h of [0,15,-2,1200]){
   assert.deepEqual(flat.surfacePoint2(d,h),[d,h]);
   assert.deepEqual(flat.surfacePoint3(d,-d/3,h),[d,-d/3,h]);
   assert.equal(flat.height2(d,h),h);
   assert.equal(flat.height3(d,-d/3,h),h);
   assert.deepEqual(flat.normal2(d,h),[0,1]);
   assert.deepEqual(flat.normal3(d,-d/3,h),[0,0,1]);
   assert.deepEqual(flat.surfaceNormal2(d),[0,1]);
   assert.deepEqual(flat.surfaceNormal3(d,-d/3),[0,0,1]);
  }
 }
 for(const h of [0,1,15,500]){
  const horizon=flat.geometricHorizon(h);
  assert.deepEqual(horizon,{exists:false,dipAngle:0,arcDistance:Infinity,
   straightDistance:Infinity});
 }
 assert.equal(geom.sinc(0),1);
 assert.ok(Object.isFrozen(flat));
});

test('124: sphere geometry agrees with independent central-angle identities',()=>{
 const g=geom.createFromRadius(R);
 near(g.curvature,1/R,0,'curvature');
 for(const d of [-120000,-15000,-250,0,250,15000,120000]){
  for(const h of [0,0.001,15,200]){
   const angle=d/R;
   const expected=[(R+h)*Math.sin(angle),(R+h)*Math.cos(angle)-R];
   const point=g.surfacePoint2(d,h);
   nearVector(point,expected,1e-8,`point ${d}/${h}`);
   near(g.height2(point[0],point[1]),h,3e-9,`round-trip height ${d}/${h}`);
   const surfaceNormal=g.surfaceNormal2(d);
   nearVector(surfaceNormal,[Math.sin(angle),Math.cos(angle)],1e-15,'surface normal');
   nearVector(g.normal2(...point),surfaceNormal,5e-15,'point normal');
  }
 }
 // Full azimuth in 3D, with east and north being geodesic coordinates.
 const d=75000,az=0.7,h=86,ex=d*Math.cos(az),ny=d*Math.sin(az);
 const p=g.surfacePoint3(ex,ny,h),theta=d/R;
 nearVector(p,[(R+h)*Math.sin(theta)*Math.cos(az),
   (R+h)*Math.sin(theta)*Math.sin(az),(R+h)*Math.cos(theta)-R],1e-8,'3D spherical point');
 near(g.height3(...p),h,1e-9,'3D altitude');
 nearVector(g.normal3(...p),g.surfaceNormal3(ex,ny),5e-15,'3D surface normal');
});

test('124: closed-form geometric horizon and vacuum tangent geometry',()=>{
 const flat=geom.createFromCurvature(0);
 const globe=geom.createFromRadius(R);
 const eyeHeights=[0,0.01,2,15,100,1000];
 for(const H of eyeHeights){
  const o=globe.geometricHorizon(H);
  const angle=Math.acos(R/(R+H));
  const slant=Math.sqrt(H*(2*R+H));
  assert.equal(o.exists,true);
  near(o.dipAngle,angle,1e-9,`dip ${H}`);
  near(o.arcDistance,angle*R,0.01,`arc ${H}`);
  near(o.straightDistance,slant,1e-8,`slant ${H}`);
  if(H>0){
   const tangent=globe.surfacePoint2(o.arcDistance);
   const n=globe.normal2(...tangent);
   const direction=[tangent[0],tangent[1]-H];
   const norm=Math.hypot(...direction);
   near((direction[0]*n[0]+direction[1]*n[1])/norm,0,2e-13,`grazing ${H}`);
  }
 }
 assert.equal(flat.geometricHorizon(15).exists,false);
 // At observer height equal to R, the central tangent angle is pi/3.
 const large=geom.createFromRadius(100);
 const horizon=large.geometricHorizon(100);
 near(horizon.dipAngle,Math.PI/3,2e-15,'60° tangent dip');
 near(horizon.arcDistance,100*Math.PI/3,3e-14,'tangent arc');
 near(horizon.straightDistance,Math.sqrt(3)*100,3e-14,'tangent chord');
});

test('124: altitude gradient matches the outward surface normal',()=>{
 for(const k of [0,1/R,1/(R*1e5)]){
  const g=geom.createFromCurvature(k);
  for(const p of [[2000,700,15],[21000,-13000,-30],[0,0,100]]){
   const n=g.normal3(...p);
   near(Math.hypot(...n),1,2e-15,'unit normal');
   const eps=0.0001;
   const numeric=p.map((_,i)=>{
    const plus=p.slice(),minus=p.slice();plus[i]+=eps;minus[i]-=eps;
    return (g.height3(...plus)-g.height3(...minus))/(2*eps);
   });
   nearVector(n,numeric,1.0e-7,`gradient at ${k} and ${p}`);
  }
 }
});

test('124: tiny positive curvature converges to the exact flat surface',()=>{
 const flat=geom.createFromCurvature(0);
 const d=80000,h=5;
 let last=Infinity;
 for(const multiple of [1,10,100,1000,1e5,1e8,1e11,1e14]){
  const g=geom.createFromRadius(R*multiple);
  const p=g.surfacePoint2(d,h),f=flat.surfacePoint2(d,h);
  const error=Math.hypot(p[0]-f[0],p[1]-f[1]);
  assert.ok(error<=last+4e-12,`sag should converge: multiple=${multiple}`);
  last=error;
  near(g.height2(...p),h,3e-9,'tiny curvature altitude');
 }
 assert.ok(last<1e-11,'flat coordinate limit');
 // A small spherical sag (~5e-13 m) must not disappear just because
 // adding the enormous radius would round it to the radius itself.
 const g=geom.createFromRadius(1e16);
 const q=g.surfacePoint2(100,0);
 near(q[1],-5e-13,3e-28,'stable tiny sag');
 near(g.height2(...q),0,5e-28,'stable tiny ground clearance');
 // Even when 2*R overflows, geometric tangent distance is finite.
 const huge=geom.createFromRadius(1e308).geometricHorizon(10);
 assert.ok(Number.isFinite(huge.arcDistance));
 assert.ok(Number.isFinite(huge.straightDistance));
 near(huge.arcDistance/huge.straightDistance,1,1e-14,'distant horizon chord ratio');
});

test('124: back hemisphere, centre singularity and invalid domains are explicit',()=>{
 const g=geom.createFromRadius(100);
 near(g.height2(0,-200),0,1e-15,'opposite pole surface');
 nearVector(g.normal2(0,-200),[0,-1],1e-15,'opposite pole normal');
 near(g.height2(0,-100),-100,1e-15,'centre altitude');
 assert.throws(()=>g.normal2(0,-100),/undefined at the sphere centre/);
 for(const invalid of [NaN,-Infinity,Infinity,'0',undefined])
  assert.throws(()=>geom.createFromCurvature(invalid),/curvature must be a finite/);
 for(const invalid of [-1,0,NaN,'3',undefined])
  assert.throws(()=>geom.createFromRadius(invalid),/radius/);
 assert.throws(()=>g.geometricHorizon(-1),/non-negative/);
 assert.throws(()=>g.surfacePoint2(Infinity,0),/finite/);
 assert.throws(()=>g.surfacePoint3(0,0,-100),/above the sphere centre/);
 assert.throws(()=>g.height3(0,NaN,10),/finite/);
 assert.throws(()=>geom.radiusFromCurvature(-0.1),/non-negative/);
 assert.throws(()=>geom.sinc(NaN),/finite/);
});

test('124: independent module does not alter live ray tracer or UI contracts',()=>{
 const tracer=require('../src/optics/OpticalRayTracer');
 const previous=tracer.trace({geometry:'globe',radius:R,atmosphere:'vacuum',
   observerHeight:15,angle:-0.01,length:1000,step:100});
 const fixture=[previous.x,previous.z,previous.height,previous.hitGround];
 nearVector(fixture.slice(0,3),[999.9500004166654,5.00016666583333,5.078639372251928],1e-10,'#123 vacuum ray');
 assert.equal(fixture[3],false);
});


test('124: 3D surface round-trip for seeded locations and a broad radius range',()=>{
 for(const radius of [250,6371000,6e9,6e12,1e16]){
  const g=geom.createFromRadius(radius);
  for(let i=1;i<=128;i++){
   // Deterministic stress inputs, including surface and near-surface points.
   const maxDistance=Math.min(125000,0.3*radius);
   const east=maxDistance*Math.sin(i*7.41);
   const north=maxDistance*Math.cos(i*3.07);
   const h=i%4===0?0:i%4===1?0.001:i%4===2?20:500;
   const p=g.surfacePoint3(east,north,h);
   near(g.height3(...p),h,2e-8,`3D return R=${radius}, sample=${i}`);
   const n=g.normal3(...p),s=g.surfaceNormal3(east,north);
   nearVector(n,s,5e-15,'3D matching normals');
   near(Math.hypot(...n),1,3e-15,'3D unit normal');
  }
 }
});

test('124: stable sagitta and tangent distance remain accurate beyond legacy Number precision',()=>{
 const radius=1e16,d=100;
 const g=geom.createFromRadius(radius);
 const expected=-d*d/(2*radius);
 const stable=g.surfacePoint2(d,0)[1];
 const unstable=radius*Math.cos(d/radius)-radius;
 assert.equal(unstable,0,'legacy expression loses the entire sagitta');
 near(stable,expected,3e-28,'stable subpicometre spherical sag');
 const p=g.surfacePoint3(d/Math.sqrt(2),d/Math.sqrt(2));
 near(p[2],expected,3e-28,'stable 3D sag');
 const horizon=g.geometricHorizon(12);
 const expectedDip=Math.sqrt(2*12/radius);
 near(horizon.dipAngle/expectedDip,1,1e-14,'small-angle tangent dip');
 const expectedDistance=Math.sqrt(2*radius*12);
 near(horizon.arcDistance/expectedDistance,1,1e-14,'small-angle tangent arc');
 near(horizon.straightDistance/expectedDistance,1,1e-14,'small-angle tangent slant');
});

test('124: sinc stays even and well-conditioned for small arguments',()=>{
 for(const value of [0,1e-200,1e-10,1e-5,0.0001,0.001,0.5,Math.PI]){
  near(geom.sinc(value),geom.sinc(-value),0,'even sinc');
  if(value>1e-3)near(geom.sinc(value),Math.sin(value)/value,3e-16,'reference sinc');
 }
 near(geom.sinc(1e-5),1-1e-10/6,2e-16,'small-angle Taylor');
});

test('124: radius/curvature conversions reject ambiguous numerical overflow',()=>{
 for(const radius of [100,6371000,1e16,1e308]){
  const k=geom.curvatureFromRadius(radius);
  near(geom.radiusFromCurvature(k)/radius,1,2e-16,'radius inverse');
 }
 assert.throws(()=>geom.radiusFromCurvature(Number.MIN_VALUE),/exceeds the finite range/);
 assert.throws(()=>geom.curvatureFromRadius(Number.MIN_VALUE),/finite positive curvature/);
});

test('124: browser UMD export remains standalone and side-effect-free',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const source=fs.readFileSync(require.resolve('../src/geometry/CurvatureSurfaceGeometry'),'utf8');
 const context=vm.createContext({});
 vm.runInContext(source,context,{filename:'CurvatureSurfaceGeometry.js'});
 assert.equal(typeof context.CurvatureSurfaceGeometry.createFromCurvature,'function');
 const surface=context.CurvatureSurfaceGeometry.createFromCurvature(0);
 assert.equal(surface.surfacePoint2(123,4)[0],123);
 assert.deepEqual(Object.keys(context),['CurvatureSurfaceGeometry']);
});
