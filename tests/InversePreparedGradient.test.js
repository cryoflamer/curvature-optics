'use strict';
/* Production inverse-temperature RK4 acceleration against the original,
 * independently exposed n(h),dn(h) path. Never weaken the physical oracle.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tracer=require('../src/optics/OpticalRayTracer');
const projection=require('../src/optics/OpticalTargetProjection');
const geometry=require('../src/geometry/CurvatureSurfaceGeometry');
const R=6371000;
const atmosphere={temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5};
function pair(source,weight){
  const options={inverseProfile:{source,weight},temperatureProfile:atmosphere,occlusionRadius:R};
  const raw=tracer.atmosphere('inverse-temperature',options);
  const fast=projection.preparedOptions({atmosphere:'inverse-temperature',profileOptions:options}).profile;
  return {raw,fast};
}
function near(actual,expected,tol,message){
  assert.ok(Number.isFinite(actual)&&Number.isFinite(expected)&&Math.abs(actual-expected)<=tol,
    `${message||'value'}: ${actual} versus ${expected} (tolerance ${tol})`);
}
test('Prepared inverse gradient reproduces reference dn/n over physical and formal altitudes',()=>{
  for(const source of ['standard','temperature-lapse'])for(const weight of [0,.01,.25,.5,.75,1]){
    const {raw,fast}=pair(source,weight);
    for(const h of [-1000,-50,0,.001,5,100,500,2000,4000,9000,25000]){
      const expected=raw.dn(h)/raw.n(h),computed=fast.fusedGradient(h);
      near(computed,expected,1e-17,`${source}/${weight} at ${h}`);
      near(fast.n(h),raw.n(h),0,'n(h) must remain the same public profile');
      near(fast.dn(h),raw.dn(h),0,'dn(h) must remain the same public profile');
      assert.equal(fast.temperatureCAt(h),raw.temperatureCAt(h));
    }
    assert.equal(fast.validUntilMetres,raw.validUntilMetres);
    assert.equal(fast.surfaceGradientKPerKm,raw.surfaceGradientKPerKm);
  }
});
test('Only the prepared factory-owned inverse profile gets the optimized derivative',()=>{
  const raw=tracer.atmosphere('inverse-temperature',{inverseProfile:{source:'standard',weight:1},
    temperatureProfile:atmosphere,occlusionRadius:R});
  assert.equal(raw.fusedGradient,undefined,'raw diagnostic tracer stays independent');
  const prepared=pair('temperature-lapse',1).fast;
  assert.equal(typeof prepared.fusedGradient,'function');
  near(prepared.fusedGradient(0),1/R,0,'engineered exponential logarithmic slope');
  near(prepared.fusedGradient(2000),1/R,0,'slope stays constant');
  const bogus=tracer.atmosphere('custom',{n:()=>1.001,dn:()=>0.001,
    fusedGradient:()=>1e20});
  // Public custom profiles cannot acquire the private built-in marker.
  const state=[0,15,1,0],step=tracer.advanceState(state,100,{geometry:'flat',profile:bogus});
  assert.ok(step[3]>0&&step[3]<1,'custom n/dn must remain authoritative');
});
test('Prepared inverse profile preserves RK4 ray path and ground contact',()=>{
  for(const geometryName of ['flat','globe'])for(const weight of [0,.15,.5,1]){
    const {raw,fast}=pair('temperature-lapse',weight);
    for(const angle of [-.002,-.0004,0,.0008]){
      const opts={geometry:geometryName,radius:R,observerHeight:15,angle,
        length:20000,step:500,contactTolerance:1e-6};
      const a=tracer.trace({...opts,profile:raw}),b=tracer.trace({...opts,profile:fast});
      assert.equal(b.hitGround,a.hitGround,`${geometryName}/${weight}/${angle} ground contact`);
      assert.equal(b.termination,a.termination);
      near(b.travelled,a.travelled,.00001,'contact path length metres');
      near(b.x,a.x,.00001,'x metres');near(b.z,a.z,.00001,'z metres');
      near(b.angle,a.angle,1e-9,'arrival angle radians');
    }
  }
});
test('Prepared inverse shooting retains statuses, angles and RK4 numerical tolerance',()=>{
  for(const geometryName of ['flat','globe'])for(const source of ['standard','temperature-lapse'])
    for(const weight of [0,.5,1]){
      const {raw,fast}=pair(source,weight);
      const surface=geometry.createFromCurvature(geometryName==='flat'?0:1/R);
      for(const [d,h] of [[1000,30],[8000,20],[20000,60]]){
        const target=surface.surfacePoint2(d,h);
        const options={geometry:geometryName,radius:R,observerHeight:15,target,
          step:2000,targetTolerance:1e-6,profile:raw};
        const a=projection.solve(options),b=projection.solve({...options,profile:fast});
        assert.equal(b.status,a.status,`${geometryName}/${source}/${weight} ${d}/${h}`);
        if(Number.isFinite(a.angle)){
          near(b.angle,a.angle,2e-10,'shooting angle');
          near(b.residual,a.residual,1e-5,'shooting residual metres');
        }
      }
    }
});
