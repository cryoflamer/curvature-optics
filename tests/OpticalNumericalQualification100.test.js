'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tracer=require('../src/optics/OpticalRayTracer');
const R=6371000;
const vacuum=tracer.atmosphere('vacuum');
const close=(actual,expected,tolerance,label)=>assert.ok(
  Math.abs(actual-expected)<=tolerance,
  `${label||'value'}: expected ${expected}, obtained ${actual}; tolerance ${tolerance}`);

function flatImpact(h,angle){return -h/Math.sin(angle);}
function globeImpact(h,angle,radius=R){
  // |(0,R+h)+t*(cos(angle),sin(angle))|^2=R^2;
  const b=(radius+h)*Math.sin(angle);
  const determinant=b*b-h*(2*radius+h);
  return determinant<0?null:-b-Math.sqrt(determinant);
}

test('100: vacuum rays are straight and independent of Flat/Globe geometry',()=>{
  for(const geometry of ['flat','globe']){
    for(const angle of [-0.14,-0.003,0,0.11]){
      const distance=10753.25,h=50;
      const ray=tracer.trace({geometry,profile:vacuum,angle,observerHeight:h,
        length:distance,step:307,stopAtGround:false,collect:true});
      close(ray.x,distance*Math.cos(angle),1e-7,'x');
      close(ray.z,h+distance*Math.sin(angle),1e-7,'z');
      close(ray.angle,angle,1e-12,'angle');
      close(ray.travelled,distance,1e-8,'travelled');
      assert.equal(ray.hitGround,false);
      assert.deepEqual(ray.points[0],[0,h]);
      close(ray.points.at(-1)[0],ray.x,1e-12,'last point x');
      close(ray.points.at(-1)[1],ray.z,1e-12,'last point z');
    }
  }
});

test('100: Flat impact returns analytic location AND actual truncated path length',()=>{
  const h=10,angle=-0.1,expected=flatImpact(h,angle);
  for(const ds of [37,200,1000]){
    const ray=tracer.trace({geometry:'flat',profile:vacuum,angle,observerHeight:h,
      length:5000,step:ds,collect:true});
    assert.equal(ray.hitGround,true);
    close(ray.travelled,expected,1e-7,'ground path length');
    close(ray.x,expected*Math.cos(angle),1e-7,'ground x');
    close(ray.z,0,1e-8,'ground z');
    close(ray.angle,angle,1e-12,'ground angle');
    close(ray.points.at(-1)[0],ray.x,1e-12,'last sample x');
  }
});

test('100: Globe impact agrees with independent quadratic line/sphere oracle',()=>{
  for(const angle of [-0.01,-0.003,-0.0023,-0.00217]){
    const expected=globeImpact(15,angle);
    assert.ok(expected>0);
    const ray=tracer.trace({geometry:'globe',radius:R,profile:vacuum,
      observerHeight:15,angle,length:25000,step:600});
    assert.equal(ray.hitGround,true);
    close(ray.travelled,expected,0.0001,'sphere impact length');
    close(ray.x,expected*Math.cos(angle),0.0001,'sphere impact x');
    close(ray.height,0,3e-8,'surface contact');
  }
});

test('100: vacuum Globe can pass above horizon while Flat has no curvature-induced contact',()=>{
  const elevation=-0.0021;
  assert.equal(globeImpact(15,elevation),null);
  const globe=tracer.trace({geometry:'globe',profile:vacuum,
    observerHeight:15,angle:elevation,length:25000,step:500});
  assert.equal(globe.hitGround,false);
  const flat=tracer.trace({geometry:'flat',profile:vacuum,
    observerHeight:15,angle:0,length:25000,step:500});
  assert.equal(flat.hitGround,false);
  close(flat.z,15,1e-8,'horizontal flat ray stays above ground');
});

test('100: no collision is returned if the range ends before ground',()=>{
  const ray=tracer.trace({geometry:'flat',profile:vacuum,
    observerHeight:10,angle:-0.1,length:42.5,step:100,collect:true});
  assert.equal(ray.hitGround,false);
  close(ray.travelled,42.5,1e-12);
  close(ray.z,10+42.5*Math.sin(-0.1),1e-10);
  assert.equal(ray.points.length,2);
});

test('100: stationary zero-length trace and initial downward surface contact',()=>{
  const zero=tracer.trace({geometry:'globe',profile:vacuum,
    observerHeight:17,angle:0.2,length:0,collect:true});
  assert.equal(zero.travelled,0);
  assert.equal(zero.hitGround,false);
  assert.deepEqual(zero.points,[[0,17]]);
  for(const geometry of ['flat','globe']){
    const ray=tracer.trace({geometry,profile:vacuum,
      observerHeight:0,angle:-0.1,length:100,step:100});
    assert.equal(ray.hitGround,true);
    close(ray.travelled,0,1e-7,'immediate ground hit');
  }
});

test('100: RK4 results converge on both geometries for a strongly varying smooth n(h)',()=>{
  const profile=tracer.atmosphere('standard',{refractivity:0.03,scaleHeight:350});
  for(const geometry of ['flat','globe']){
    const args={geometry,profile,observerHeight:250,angle:0.05,
      length:4000,stopAtGround:false};
    const ref=tracer.trace({...args,step:5});
    const error=step=>{
      const x=tracer.trace({...args,step});
      return Math.hypot(x.x-ref.x,x.z-ref.z);
    };
    const coarse=error(500),medium=error(250),fine=error(125);
    assert.ok(coarse>medium*4 && medium>fine*4,
      `${geometry}: expected step refinement to reduce error (${coarse}, ${medium}, ${fine})`);
    assert.ok(fine<0.00002);
  }
});

test('100: homogeneous custom n has exactly straight vacuum-like trajectories',()=>{
  const profile=tracer.atmosphere('custom',{n:()=>1.4,dn:()=>0});
  const angle=0.12,dist=4000;
  for(const geometry of ['flat','globe']){
    const ray=tracer.trace({geometry,profile,observerHeight:100,
      angle,length:dist,step:123,stopAtGround:false});
    close(ray.x,dist*Math.cos(angle),1e-8);
    close(ray.z,100+dist*Math.sin(angle),1e-8);
  }
});

test('100: refraction conserves n(h)*vx in planar stratification',()=>{
  const profile=tracer.atmosphere('standard',{refractivity:0.03,scaleHeight:350});
  const initial=profile.n(250)*Math.cos(0.05);
  const ray=tracer.trace({geometry:'flat',profile,observerHeight:250,
    angle:0.05,length:4000,step:25,stopAtGround:false});
  close(profile.n(ray.height)*Math.cos(ray.angle),initial,1e-9,
    'planar Snell invariant');
});

test('100: refraction conserves radial angular momentum n(h)*(r cross v)',()=>{
  const profile=tracer.atmosphere('standard',{refractivity:0.03,scaleHeight:350});
  const initial=-(R+250)*profile.n(250)*Math.cos(0.05);
  const ray=tracer.trace({geometry:'globe',radius:R,profile,
    observerHeight:250,angle:0.05,length:4000,step:25,stopAtGround:false});
  const invariant=profile.n(ray.height)*
    (ray.x*Math.sin(ray.angle)-(ray.z+R)*Math.cos(ray.angle));
  close(invariant,initial,0.001,'radially stratified optical angular momentum');
});

test('100: signed RK4 step is reversible with step refinement',()=>{
  const profile=tracer.atmosphere('standard',{refractivity:0.03,scaleHeight:350});
  const initial=[0,250,Math.cos(0.05),Math.sin(0.05)];
  for(const geometry of ['flat','globe']){
    const experiment=ds=>{
      const num=4000/ds;
      let state=initial;
      for(let j=0;j<num;j++)state=tracer.advanceState(state,ds,{geometry,profile});
      for(let j=0;j<num;j++)state=tracer.advanceState(state,-ds,{geometry,profile});
      return Math.hypot(state[0]-initial[0],state[1]-initial[1]);
    };
    const coarse=experiment(500),fine=experiment(62.5);
    assert.ok(coarse>fine*10,`${geometry}: reverse trajectory must converge: ${coarse},${fine}`);
    assert.ok(fine<2e-7);
  }
});

test('100: invalid geometry, state, atmosphere and numeric values are rejected',()=>{
  const valid={geometry:'flat',atmosphere:'vacuum',length:10};
  for(const params of [{radius:0},{radius:NaN},{radius:Infinity},{angle:Infinity},
    {observerHeight:NaN},{observerHeight:-1},{length:Infinity},{length:NaN},
    {step:NaN},{step:Infinity},{step:0},{step:-1},{profile:{n:()=>1}},
    {profile:{n:()=>-1,dn:()=>0}},{profile:{n:()=>1,dn:()=>Infinity}},
    {geometry:'unknown'},{length:1000000000,step:0.01}]){
    assert.throws(()=>tracer.trace({...valid,...params}),undefined,JSON.stringify(params));
  }
  for(const opts of [{refractivity:Infinity},{refractivity:NaN},
    {refractivity:-0.01},{scaleHeight:Infinity},{scaleHeight:0},
    {scaleHeight:NaN}]){
    assert.throws(()=>tracer.atmosphere('standard',opts));
  }
  assert.throws(()=>tracer.advanceState([0,1,4,0],10,{geometry:'flat',profile:vacuum}));
  assert.throws(()=>tracer.advanceState([0,1,1,0],NaN,{geometry:'flat',profile:vacuum}));
});
