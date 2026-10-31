/* #140.12.41 — diagnostic-only, independent GPU DS first-forward-x RK4 shooting.
 * Same ray state, stable sphere metric, RK4 recurrence, angular bracket and
 * sampled first-ground-event search as OpticalTargetProjection/OpticalRayTracer.
 * DS is an approximation to f64; the CPU oracle is never an input to the GPU.
 * No production rendering, frame parity or multipath coverage is claimed.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureGpuBouguerQuadrature141231'):root.CurvatureGpuBouguerQuadrature141231,
    typeof module==='object'&&module.exports?
    require('./CurvatureGpuPrecisionFoundation141228'):root.CurvatureGpuPrecisionFoundation141228,
    typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuDsRk4Shooting141241=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(quad,precision,contract){
'use strict';
if(!quad||!precision||!contract)throw Error('GPU DS RK4 dependencies unavailable');
var VERSION='140.12.41',MAX_TARGETS=256,MAX_DISTANCE=60000,STEP=500;
function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
function validate(request){
  contract.validateRequest(request);
  var c=request.controls||{};
  if(request.branch!==contract.BRANCH||request.geometry!=='globe'||request.atmosphere!=='standard'||
     request.profileOptions!==undefined||request.observerHeight>200||request.observerHeight<=0||
     request.radius<100000||request.targets.length>MAX_TARGETS||
     (c.step!==undefined&&c.step!==STEP)||
     (c.targetTolerance!==undefined&&c.targetTolerance!==1e-6)||
     (c.eventSubsteps!==undefined&&c.eventSubsteps!==8)||
     (c.contactTolerance!==undefined&&c.contactTolerance!==1e-6)||
     (c.maxIterations!==undefined&&c.maxIterations!==48)||
     (c.initialSpan!==undefined&&c.initialSpan!==.02)||
     (c.maxSpan!==undefined&&c.maxSpan!==1.2)||
     request.targets.some(function(t){return t[0]>MAX_DISTANCE||Math.hypot(t[0],t[1]-request.observerHeight)*6+STEP*4>MAX_DISTANCE*6+STEP*4;}))
    throw RangeError('DS RK4 diagnostic supports Globe/standard, h0 (0,200], <=256 targets, step 500m, fixed CPU shooting/event controls');
  return true;
}
function pack(request){
  validate(request);
  var pairs=new Float32Array(request.targets.length*8);
  request.targets.forEach(function(t,i){
    var seed=Math.atan2(t[1]-request.observerHeight,t[0]);
    var x=precision.split64(t[0]),z=precision.split64(t[1]),a=precision.split64(seed);
    pairs.set([x[0],x[1],z[0],z[1],a[0],a[1],0,0],i*8);
  });
  var radius=precision.split64(request.radius),eye=precision.split64(request.observerHeight);
  var input=new Float32Array([radius[0],radius[1],eye[0],eye[1],
    ...precision.split64(.000293),...precision.split64(7350)]);
  return {targets:pairs,constants:input};
}
var BODY=String.raw`
struct Rays { data:array<vec4f> }
@group(0) @binding(0) var<storage,read> input:Rays;
@group(0) @binding(1) var<storage,read> constants:Rays;
@group(0) @binding(2) var<storage,read_write> output:Rays;
@group(0) @binding(3) var<storage,read> config:array<u32>;
@DS_HELPERS@
fn D(v:f32)->DS{return ds(v,0.0);}
fn dval(v:DS)->f32{return v.hi+v.lo;}
fn less(a:DS,b:DS)->bool{return a.hi<b.hi||(a.hi==b.hi&&a.lo<b.lo);}
fn greater(a:DS,b:DS)->bool{return less(b,a);}
fn mulf(a:DS,b:f32)->DS{return dsMul(a,D(b));}
fn near(a:DS,threshold:f32)->bool{return abs(dval(a))<=threshold;}
fn clampd(a:DS,lo:DS,hi:DS)->DS{if(less(a,lo)){return lo;}if(greater(a,hi)){return hi;}return a;}
// Range-reduced 16-term Taylor; no native f32 exp loss at small heights.
fn expds(x:DS)->DS{
  let u=mulf(x,0.0625);
  var term=D(1.0);var sum=term;
  for(var i=1u;i<=16u;i=i+1u){term=dsDiv(dsMul(term,u),D(f32(i)));sum=dsAdd(sum,term);}
  for(var j=0u;j<4u;j=j+1u){sum=dsMul(sum,sum);}
  return sum;
}
fn sind(x:DS)->DS{
  let xx=dsMul(x,x);var term=x;var sum=x;
  for(var j=1u;j<=10u;j=j+1u){term=dsDiv(dsNeg(dsMul(term,xx)),D(f32((2u*j)*(2u*j+1u))));sum=dsAdd(sum,term);}
  return sum;
}
fn cosd(x:DS)->DS{
  let xx=dsMul(x,x);var term=D(1.0);var sum=term;
  for(var j=1u;j<=10u;j=j+1u){term=dsDiv(dsNeg(dsMul(term,xx)),D(f32((2u*j-1u)*(2u*j))));sum=dsAdd(sum,term);}
  return sum;
}
struct S {x:DS,z:DS,vx:DS,vz:DS}
struct K {x:DS,z:DS,vx:DS,vz:DS}
struct M {height:DS,nx:DS,nz:DS}
struct Shot {ok:bool,a:DS,res:DS,path:DS,endState:S,calls:u32}
struct Sample {state:S,t:DS,h:DS,slope:DS}
struct Event {kind:u32,path:DS}
struct Verification {status:u32,kind:u32,path:DS,checks:u32}
fn metric(x:DS,z:DS,k:DS)->M{
  let a=dsAdd(D(1.0),dsMul(k,z));let b=dsMul(k,x);
  let length=dsSqrt(dsAdd(dsMul(a,a),dsMul(b,b)));
  let h=dsAdd(z,dsDiv(dsMul(k,dsMul(x,x)),dsAdd(length,a)));
  return M(h,dsDiv(b,length),dsDiv(a,length));
}
fn deriv(state:S,k:DS,N:DS,H:DS)->K{
  let m=metric(state.x,state.z,k);
  let e=expds(dsNeg(dsDiv(m.height,H)));
  let refr=dsMul(N,e);let n=dsAdd(D(1.0),refr);
  let q=dsDiv(dsNeg(dsDiv(refr,H)),n);
  let dot=dsAdd(dsMul(state.vx,m.nx),dsMul(state.vz,m.nz));
  return K(state.vx,state.vz,dsMul(q,dsSub(m.nx,dsMul(dot,state.vx))),
    dsMul(q,dsSub(m.nz,dsMul(dot,state.vz))));
}
fn plus(s:S,a:K,dt:DS)->S{
  return S(dsAdd(s.x,dsMul(dt,a.x)),dsAdd(s.z,dsMul(dt,a.z)),
    dsAdd(s.vx,dsMul(dt,a.vx)),dsAdd(s.vz,dsMul(dt,a.vz)));
}
fn rk4(s:S,dt:DS,k:DS,N:DS,H:DS)->S{
  let a=deriv(s,k,N,H);
  let b=deriv(plus(s,a,mulf(dt,0.5)),k,N,H);
  let c=deriv(plus(s,b,mulf(dt,0.5)),k,N,H);
  let d=deriv(plus(s,c,dt),k,N,H);
  let weight=dsDiv(dt,D(6.0));
  var o=S(
    dsAdd(s.x,dsMul(weight,dsAdd(dsAdd(a.x,mulf(dsAdd(b.x,c.x),2.0)),d.x))),
    dsAdd(s.z,dsMul(weight,dsAdd(dsAdd(a.z,mulf(dsAdd(b.z,c.z),2.0)),d.z))),
    dsAdd(s.vx,dsMul(weight,dsAdd(dsAdd(a.vx,mulf(dsAdd(b.vx,c.vx),2.0)),d.vx))),
    dsAdd(s.vz,dsMul(weight,dsAdd(dsAdd(a.vz,mulf(dsAdd(b.vz,c.vz),2.0)),d.vz))));
  let norm=dsSqrt(dsAdd(dsMul(o.vx,o.vx),dsMul(o.vz,o.vz)));
  o.vx=dsDiv(o.vx,norm);o.vz=dsDiv(o.vz,norm);
  return o;
}
fn start(angle:DS,eye:DS)->S{return S(D(0.0),eye,cosd(angle),sind(angle));}
fn invalidShot(angle:DS)->Shot{return Shot(false,angle,D(0.0),D(0.0),start(angle,D(0.0)),0u);}
fn shot(angle:DS,xGoal:DS,zGoal:DS,eye:DS,k:DS,N:DS,H:DS,maxSteps:u32)->Shot{
  if(abs(dval(angle))>=1.5697963){return invalidShot(angle);}
  var s=start(angle,eye);var distance=D(0.0);var calls=0u;
  let maxPath=dsAdd(mulf(dsSqrt(dsAdd(dsMul(xGoal,xGoal),dsMul(dsSub(zGoal,eye),dsSub(zGoal,eye)))),6.0),D(2000.0));
  for(var i=0u;i<maxSteps;i=i+1u){
    if(!less(distance,maxPath)){break;}
    let delta=clampd(dsSub(maxPath,distance),D(0.0),D(500.0));
    let next=rk4(s,delta,k,N,H);calls=calls+1u;
    if(!greater(next.x,s.x)){return invalidShot(angle);}
    if(!less(next.x,xGoal)){
      var lo=D(0.0);var hi=delta;
      var t=dsMul(delta,dsDiv(dsSub(xGoal,s.x),dsSub(next.x,s.x)));
      var endpoint=next;
      for(var j=0u;j<12u;j=j+1u){
        endpoint=rk4(s,t,k,N,H);calls=calls+1u;
        let error=dsSub(endpoint.x,xGoal);
        if(near(error,max(0.000000001,dval(xGoal)*1e-14))){break;}
        if(greater(error,D(0.0))){hi=t;}else{lo=t;}
        let candidate=dsSub(t,dsDiv(error,endpoint.vx));
        t=select(mulf(dsAdd(lo,hi),0.5),candidate,greater(candidate,lo)&&less(candidate,hi));
      }
      if(!near(dsSub(endpoint.x,xGoal),max(0.00000001,dval(xGoal)*1e-12))){return invalidShot(angle);}
      return Shot(true,angle,dsSub(endpoint.z,zGoal),dsAdd(distance,t),endpoint,calls);
    }
    s=next;distance=dsAdd(distance,delta);
  }
  return invalidShot(angle);
}
fn surfaceSample(s:S,t:DS,k:DS,N:DS,H:DS)->Sample{
  var state=s;
  if(!near(t,0.0)){state=rk4(s,t,k,N,H);}
  let m=metric(state.x,state.z,k);
  return Sample(state,t,m.height,dsAdd(dsMul(m.nx,state.vx),dsMul(m.nz,state.vz)));
}
fn firstCrossing(s:S,lo0:DS,hi0:DS,k:DS,N:DS,H:DS)->Sample{
  var lo=lo0;var hi=hi0;
  for(var j=0u;j<45u;j=j+1u){
    if(!greater(dsSub(hi,lo),D(max(1e-10,dval(hi)*1e-13)))){break;}
    let mid=mulf(dsAdd(lo,hi),0.5);
    let p=surfaceSample(s,mid,k,N,H);
    if(less(p.h,D(0.0))){hi=mid;}else{lo=mid;}
  }
  return surfaceSample(s,mulf(dsAdd(lo,hi),0.5),k,N,H);
}
fn minimum(s:S,lo0:DS,hi0:DS,k:DS,N:DS,H:DS)->Sample{
  var lo=lo0;var hi=hi0;
  for(var j=0u;j<45u;j=j+1u){
    if(!greater(dsSub(hi,lo),D(max(1e-10,dval(hi)*1e-13)))){break;}
    let mid=mulf(dsAdd(lo,hi),0.5);
    if(less(surfaceSample(s,mid,k,N,H).slope,D(0.0))){lo=mid;}else{hi=mid;}
  }
  return surfaceSample(s,mulf(dsAdd(lo,hi),0.5),k,N,H);
}
fn eventAt(s:S,delta:DS,k:DS,N:DS,H:DS)->Event{
  var prev=surfaceSample(s,D(0.0),k,N,H);
  if(!greater(prev.h,D(0.0))&&less(prev.slope,D(-1e-12))){return Event(1u,D(0.0));}
  for(var i=1u;i<=8u;i=i+1u){
    let current=surfaceSample(s,dsMul(delta,D(f32(i)/8.0)),k,N,H);
    if(!less(prev.h,D(-1e-9))&&less(current.h,D(-1e-9))){
      let crossing=firstCrossing(s,prev.t,current.t,k,N,H);
      return Event(1u,crossing.t);
    }
    if(less(prev.slope,D(0.0))&&!less(current.slope,D(0.0))){
      let bottom=minimum(s,prev.t,current.t,k,N,H);
      if(less(bottom.h,D(-1e-6))){
        let crossing=firstCrossing(s,prev.t,bottom.t,k,N,H);
        return Event(1u,crossing.t);
      }
      if(near(bottom.h,1e-6)){return Event(2u,bottom.t);}
    }
    if(i==8u&&less(prev.slope,D(0.0))&&near(current.slope,1e-10)&&near(current.h,1e-6)){
      return Event(2u,current.t);
    }
    prev=current;
  }
  return Event(0u,D(0.0));
}
fn verify(best:Shot,xGoal:DS,zGoal:DS,eye:DS,k:DS,N:DS,H:DS)->Verification{
  var s=start(best.a,eye);var travelled=D(0.0);var checks=0u;
  for(var i=0u;i<1024u;i=i+1u){
    if(!less(travelled,best.path)){break;}
    let delta=clampd(dsSub(best.path,travelled),D(0.0),D(500.0));
    let impact=eventAt(s,delta,k,N,H);checks=checks+1u;
    if(impact.kind!=0u){
      let at=dsAdd(travelled,impact.path);
      let prior=less(at,dsSub(best.path,D(1e-6)));
      var verdict=1u;
      if(prior){verdict=select(2u,3u,impact.kind==2u);}
      // CPU uses an endpoint error envelope for surface-height targets.
      let targetHeight=metric(xGoal,zGoal,k).height;
      if(prior&&abs(dval(targetHeight))<=1e-6){
        let radius=dsDiv(D(1.0),k);
        let envelope=sqrt(2.0*max(dval(radius),1000.0)*(abs(dval(best.res))+1e-10));
        if(dval(dsSub(best.path,at))<=envelope){
          let m=metric(best.endState.x,best.endState.z,k);
          let slope=dval(dsAdd(dsMul(m.nx,best.endState.vx),dsMul(m.nz,best.endState.vz)));
          let descend=slope<-sqrt(2e-6/max(dval(radius),1000.0));
          verdict=select(3u,1u,impact.kind==1u&&descend);
        }
      }
      return Verification(verdict,impact.kind,at,checks);
    }
    s=rk4(s,delta,k,N,H);travelled=dsAdd(travelled,delta);
  }
  if(less(travelled,dsSub(best.path,D(1e-6)))){return Verification(3u,3u,travelled,checks);}
  return Verification(1u,0u,best.path,checks);
}
fn writeFailure(i:u32,code:f32,evaluations:u32,calls:u32){
  output.data[4u*i]=vec4f(0.0,0.0,0.0,0.0);
  output.data[4u*i+1u]=vec4f(0.0,0.0,0.0,f32(evaluations));
  output.data[4u*i+2u]=vec4f(0.0,0.0,0.0,f32(calls));
  output.data[4u*i+3u]=vec4f(code,0.0,0.0,0.0);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;if(i>=config[0]){return;}
  let data=input.data[2u*i];let seed=input.data[2u*i+1u];
  let xGoal=ds(data.x,data.y);let zGoal=ds(data.z,data.w);
  let params=constants.data[0];let air=constants.data[1];
  let radius=ds(params.x,params.y);let eye=ds(params.z,params.w);
  let N=ds(air.x,air.y);let H=ds(air.z,air.w);
  let k=dsDiv(D(1.0),radius);
  let direction=ds(seed.x,seed.y);
  let tolerance=select(1e-6,1e-10,abs(dval(metric(xGoal,zGoal,k).height))<=1e-6);
  var evaluations=1u;var best=shot(direction,xGoal,zGoal,eye,k,N,H,config[1]);
  var calls=best.calls;
  if(!best.ok){writeFailure(i,1.0,evaluations,calls);return;}
  if(abs(dval(best.res))>tolerance){
    let sign=select(1.0,-1.0,greater(best.res,D(0.0)));
    let limit=1.5697963;
    let available=select(limit-dval(direction),dval(direction)+limit,sign<0.0);
    if(available<=0.0){writeFailure(i,2.0,evaluations,calls);return;}
    var span=select(0.02,available/4.0,0.02>=available);
    let first=best;var lower=best;var upper=best;var found=false;
    for(var j=0u;j<14u;j=j+1u){
      evaluations=evaluations+1u;
      let probe=shot(dsAdd(direction,D(sign*span)),xGoal,zGoal,eye,k,N,H,config[1]);
      calls=calls+probe.calls;
      if(!probe.ok){writeFailure(i,3.0,evaluations,calls);return;}
      if((less(probe.res,D(0.0))&&!less(first.res,D(0.0)))||
         (!less(probe.res,D(0.0))&&less(first.res,D(0.0)))){
        if(sign<0.0){lower=probe;upper=first;}else{lower=first;upper=probe;}
        found=true;break;
      }
      if(span>=1.2){break;}
      var nextSpan=min(1.2,span*2.0);
      if(nextSpan>=available){nextSpan=min(1.2,available*(1.0-1e-9));}
      if(nextSpan<=span){break;}
      span=nextSpan;
    }
    if(!found){writeFailure(i,4.0,evaluations,calls);return;}
    var converged=false;var stuck=0u;var previousSide=0i;
    for(var j=0u;j<48u;j=j+1u){
      let width=dsSub(upper.a,lower.a);
      var angle=dsDiv(dsSub(dsMul(lower.a,upper.res),dsMul(upper.a,lower.res)),dsSub(upper.res,lower.res));
      if(!greater(angle,lower.a)||!less(angle,upper.a)||stuck>=5u){angle=mulf(dsAdd(lower.a,upper.a),0.5);}
      evaluations=evaluations+1u;
      let middle=shot(angle,xGoal,zGoal,eye,k,N,H,config[1]);
      calls=calls+middle.calls;
      if(!middle.ok){writeFailure(i,5.0,evaluations,calls);return;}
      if(abs(dval(middle.res))<=tolerance){best=middle;converged=true;break;}
      let side=select(1i,-1i,(less(middle.res,D(0.0)))==(less(lower.res,D(0.0))));
      if(side<0i){lower=middle;}else{upper=middle;}
      let nextWidth=dsSub(upper.a,lower.a);
      stuck=select(0u,stuck+1u,side==previousSide&&greater(nextWidth,mulf(width,0.8)));
      previousSide=side;
    }
    if(!converged){writeFailure(i,6.0,evaluations,calls);return;}
  }
  let evidence=verify(best,xGoal,zGoal,eye,k,N,H);
  output.data[4u*i]=vec4f(f32(evidence.status),best.a.hi,best.a.lo,best.res.hi);
  output.data[4u*i+1u]=vec4f(best.res.lo,best.path.hi,best.path.lo,f32(evaluations));
  output.data[4u*i+2u]=vec4f(f32(evidence.kind),evidence.path.hi,evidence.path.lo,f32(calls));
  output.data[4u*i+3u]=vec4f(0.0,f32(evidence.checks),0.0,0.0);
}`;
function shader(){
  return BODY.replace('@DS_HELPERS@',quad.arithmeticHelpers('classic_ds_512'));
}
function decode(request,raw){
  if(!(raw instanceof Float32Array)||raw.length!==request.targets.length*16)
    throw RangeError('GPU DS RK4 readback size mismatch');
  var reasons={1:'Initial ray did not reach the target x coordinate',2:'Bracket outside forward-x domain',
    3:'Angular bracket probe failed',4:'No sign-changing angular bracket',
    5:'Integration failed within angular bracket',6:'Shooting residual tolerance not achieved'};
  var results=request.targets.map(function(target,i){
    var v=Array.from(raw.subarray(i*16,i*16+16)),code=v[0],kind=v[8];
    if(!v.every(Number.isFinite)||![0,1,2,3].includes(code)||![0,1,2,3].includes(kind)||
       (code===0&&!reasons[v[12]])||(code!==0&&v[12]!==0))
      throw RangeError('Invalid GPU DS RK4 result '+i);
    if(code===0)return {target:target.slice(),status:'solver_failed',angle:null,residual:null,
      pathLength:null,ground:null,reason:reasons[v[12]],evaluations:v[7],rk4Calls:v[11],eventChecks:0};
    var angle=v[1]+v[2],residual=v[3]+v[4],path=v[5]+v[6],impact=v[9]+v[10];
    if(Math.abs(angle)>=Math.PI/2||path<=0||Math.abs(residual)>1e-6+1e-9||
       (kind!==0&&(impact<0||impact>path+1e-6))||
       (kind===0&&code!==1)||(kind===3&&code!==3)||
       (code===2&&(kind!==1||impact>=path-1e-6))||
       (kind===2&&code!==3)||(code===3&&kind===0))
      throw RangeError('Invalid converged GPU DS RK4 solution '+i);
    var event=kind===1||kind===2?{kind:'ground',contact:kind===1?'crossing':'grazing',pathLength:impact}:null,
      ground={hitGround:!!event,travelled:event||kind===3?impact:path,event:event};
    return {target:target.slice(),status:code===1?'visible':code===2?'blocked':'indeterminate',
      angle:angle,residual:residual,pathLength:path,ground:ground,reason:code===3?'GPU DS ground event ambiguous':null,
      evaluations:v[7],rk4Calls:v[11],eventChecks:v[13],angleLimbs:[v[1],v[2]],
      residualLimbs:[v[3],v[4]],eventKind:kind===3?'unresolved':kind===1?'crossing':kind===2?'grazing':'clear'};
  });
  return contract.validateResponse(request,{backend:'gpu-experimental',branch:contract.BRANCH,results:results});
}
async function createSession(request,deps){
  validate(request);deps=deps||{};
  var nav=deps.navigator||(typeof navigator!=='undefined'?navigator:null),
    usage=deps.GPUBufferUsage||(typeof GPUBufferUsage!=='undefined'?GPUBufferUsage:null),
    mapMode=deps.GPUMapMode||(typeof GPUMapMode!=='undefined'?GPUMapMode:null);
  if(!nav||!nav.gpu||!usage||!mapMode)throw Error('Real WebGPU device required for DS RK4');
  var adapter=await nav.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');
  var device=await adapter.requestDevice(),buffers=[],closed=false,running=false;
  function alloc(bytes,flags){var b=device.createBuffer({size:bytes,usage:flags});buffers.push(b);return b;}
  function close(){if(closed)return;closed=true;buffers.forEach(function(b){b.destroy();});if(device.destroy)device.destroy();}
  try{
    var start=now(),module=device.createShaderModule({code:shader()}),pipeline;
    try{pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});}
    catch(error){if(module.getCompilationInfo){var info=await module.getCompilationInfo(),failures=info.messages.filter(function(m){return m.type==='error';});if(failures.length)throw Error('DS RK4 WGSL: '+failures.map(function(m){return m.lineNum+': '+m.message;}).join('; '));}throw error;}
    var compileMs=now()-start,n=request.targets.length;
    if(n*64>device.limits.maxStorageBufferBindingSize)throw RangeError('DS RK4 target buffer exceeds WebGPU limit');
    var targetBuffer=alloc(n*32,usage.STORAGE|usage.COPY_DST),
      constantsBuffer=alloc(32,usage.STORAGE|usage.COPY_DST),
      outputBuffer=alloc(n*64,usage.STORAGE|usage.COPY_SRC),
      readBuffer=alloc(n*64,usage.COPY_DST|usage.MAP_READ),
      configBuffer=alloc(16,usage.STORAGE|usage.COPY_DST);
    var bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
      {binding:0,resource:{buffer:targetBuffer}},{binding:1,resource:{buffer:constantsBuffer}},
      {binding:2,resource:{buffer:outputBuffer}},{binding:3,resource:{buffer:configBuffer}}]});
    async function solve(actual){
      if(closed||running||actual!==request)throw Error('DS RK4 session closed/busy or request identity changed');
      validate(actual);running=true;
      try{
        var packed=pack(actual);
        device.queue.writeBuffer(targetBuffer,0,packed.targets);
        device.queue.writeBuffer(constantsBuffer,0,packed.constants);
        device.queue.writeBuffer(configBuffer,0,new Uint32Array([n,1024,0,0]));
        var begin=now(),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
        pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();
        encoder.copyBufferToBuffer(outputBuffer,0,readBuffer,0,n*64);device.queue.submit([encoder.finish()]);
        await readBuffer.mapAsync(mapMode.READ);
        var raw=new Float32Array(readBuffer.getMappedRange(0,n*64).slice(0));readBuffer.unmap();
        return {response:decode(actual,raw),timing:{dispatchToReadbackMs:now()-begin,includesReadback:true}};
      }finally{running=false;}
    }
    return Object.freeze({solve:solve,close:close,compileMs:compileMs});
  }catch(error){close();throw error;}
}
return Object.freeze({VERSION:VERSION,MAX_TARGETS:MAX_TARGETS,validate:validate,pack:pack,shader:shader,decode:decode,createSession:createSession});
}));
