/* #140.12.27: Bouguer's invariant, diagnostic-only spherical ground test.
 * The radial n(h) model reduces first-ground contact to a 1D polar-angle
 * integral. This is NOT interval arithmetic or a certified visibility result.
 * GPU angles are selected BEFORE any CPU f64 oracle is evaluated.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412,
    typeof module==='object'&&module.exports?
    require('./CurvatureGpuGroundContact141226'):root.CurvatureGpuGroundContact141226);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureBouguerInvariant141227=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(gpu,ground){
  'use strict';
  if(!gpu||!ground)throw Error('Bouguer audit dependencies unavailable');
  var GPU_NODES=256,CPU_NODES=2048;
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function options(request){
    gpu.checked(request);
    if(request.geometry!=='globe'||!['standard','vacuum'].includes(request.atmosphere))
      throw RangeError('Bouguer invariant audit supports only radial Globe vacuum/standard');
    var p=request.profileOptions||{},R=request.radius,H=p.scaleHeight===undefined?7350:p.scaleHeight,
      N=request.atmosphere==='vacuum'?0:(p.refractivity===undefined?.000293:p.refractivity),
      h0=request.observerHeight;
    if(!Number.isFinite(R)||R<=0||!Number.isFinite(N)||N<0||
       !Number.isFinite(H)||H<=0||!Number.isFinite(h0)||h0<=0)
      throw RangeError('Bouguer audit requires positive observer height and valid radial atmosphere');
    // F(r)=n(r)r. In the exponential model F' has its global minimum
    // at h=max(0,2H-R) for h>=0. Checking this globally also makes the
    // initially-outward no-ground branch safe against exotic ducting above
    // the observer; checking only [0,h0] would not be sufficient.
    function derivative(h){return 1+N*Math.exp(-h/H)*(1-(R+h)/H);}
    var candidates=[0,h0],turn=2*H-R;
    if(turn>0)candidates.push(turn);
    if(candidates.some(function(h){return !(derivative(h)>0);}))
      throw RangeError('Bouguer audit cannot assume monotone n(r)r for this profile');
    return {R:R,N:N,H:H,h0:h0};
  }
  function logF(h,p){
    // Stable near the surface: never subtract two close 6371-km radii.
    return Math.log1p(h/p.R)+Math.log1p(-p.N*(-Math.expm1(-h/p.H))/(1+p.N));
  }
  function f64(request,angle,target,nodes){
    var p=options(request),a=angle;
    if(!Number.isFinite(a)||Math.abs(a)>=Math.PI/2||!Array.isArray(target)||
       target.length!==2||!target.every(Number.isFinite))throw RangeError('Invalid Bouguer angle or target');
    nodes=nodes===undefined?CPU_NODES:nodes;
    if(!Number.isInteger(nodes)||nodes<32||nodes>8192)throw RangeError('Invalid quadrature node count');
    var theta=Math.atan2(target[0],p.R+target[1]);
    if(!(theta>0))throw RangeError('Target must be forward in spherical polar angle');
    var logB=logF(p.h0,p)+Math.log1p(-2*Math.sin(a/2)**2);
    var base={angleRadians:a,targetPolarAngleRadians:theta,
      logBOverSurface:logB,radialMonotone:true,quadratureNodes:nodes,
      groundPolarAngleRadians:null,contactMarginSurfaceMetres:null};
    if(a>=0)return Object.assign(base,{status:'no_ground',reason:'initially_outward'});
    if(logB>0)return Object.assign(base,{status:'no_ground',reason:'turns_above_surface'});
    // d(phi)/dh = 1/((R+h)*sqrt((F(h)/b)^2-1)).
    // h=h0*u^2 regularizes the integrable grazing singularity at h=0.
    var sum=0,compensation=0;
    for(var i=0;i<nodes;i++){
      var u=(i+.5)/nodes,h=p.h0*u*u,z=2*(logF(h,p)-logB);
      if(!(z>0))return Object.assign(base,{status:'unresolved',reason:'nonpositive_radial_radicand'});
      var term=2*p.h0*u/((p.R+h)*Math.sqrt(Math.expm1(z))),
        y=term-compensation,tmp=sum+y;
      compensation=(tmp-sum)-y;sum=tmp;
    }
    var phi=sum/nodes,margin=p.R*(theta-phi);
    return Object.assign(base,{status:margin>0?'before_target':margin<0?'after_target':'at_target',
      reason:null,groundPolarAngleRadians:phi,contactMarginSurfaceMetres:margin});
  }
  // All f32 operations are on normalized h/R and log(F/b) differences;
  // direct f32 radius arithmetic would erase centimetre/millimetre changes.
  // This is a candidate contact diagnostic, not an error-bounded proof.
  var WGSL=`struct Rays { data: array<vec4f> }
@group(0) @binding(0) var<storage, read> seeds: Rays;
@group(0) @binding(1) var<storage, read_write> results: Rays;
@group(0) @binding(2) var<storage, read> config: array<u32>;
fn log1pStable(x:f32)->f32 {
  if(abs(x)>0.01){return log(1.0+x);}
  let t=x*x;
  return x-t*0.5+t*x/3.0-t*t*0.25+t*t*x*0.2;
}
fn oneMinusExpNeg(x:f32)->f32 {
  if(abs(x)>0.02){return 1.0-exp(-x);}
  return x*(1.0+x*(-0.5+x*(1.0/6.0+x*(-1.0/24.0+x/120.0))));
}
fn expm1Stable(x:f32)->f32 {
  if(abs(x)>0.01){return exp(x)-1.0;}
  return x*(1.0+x*(0.5+x*(1.0/6.0+x*(1.0/24.0+x/120.0))));
}
fn logF(h:f32,k:f32,N:f32,H:f32)->f32 {
  let geometry=log1pStable(k*h);
  if(config[2]==3u){return geometry;}
  return geometry+log1pStable(-N*oneMinusExpNeg(h/H)/(1.0+N));
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u) {
  let i=id.x;
  if(i>=config[0]){return;}
  let t=seeds.data[i];
  let k=bitcast<f32>(config[5]);
  let N=bitcast<f32>(config[6]);
  let H=bitcast<f32>(config[7]);
  let theta=atan2(k*t.x,1.0+k*t.y);
  let half=sin(0.5*t.w);
  let logB=logF(t.z,k,N,H)+log1pStable(-2.0*half*half);
  if(t.w>=0.0 || logB>0.0){
    results.data[i]=vec4f(2.0,-1.0,theta,0.0);
    return;
  }
  var sum=0.0;
  var compensation=0.0;
  for(var j=0u;j<256u;j=j+1u){
    let u=(f32(j)+0.5)/256.0;
    let h=t.z*u*u;
    let z=2.0*(logF(h,k,N,H)-logB);
    if(z<=0.0){results.data[i]=vec4f(0.0,-1.0,theta,0.0);return;}
    let term=2.0*(k*t.z)*u/((1.0+k*h)*sqrt(expm1Stable(z)));
    let y=term-compensation;
    let tmp=sum+y;
    compensation=(tmp-sum)-y;
    sum=tmp;
  }
  let phi=sum/256.0;
  results.data[i]=vec4f(1.0,phi,theta,(theta-phi)/k);
}`;
  function decode(request,angles,raw){
    if(!(raw instanceof Float32Array)||!Array.isArray(angles)||
       angles.length!==request.targets.length||raw.length!==angles.length*4)
      throw RangeError('Bouguer GPU results/angle count mismatch');
    return angles.map(function(angle,i){
      var j=i*4,flag=raw[j],phi=raw[j+1],target=raw[j+2],margin=raw[j+3];
      if(![flag,phi,target,margin].every(Number.isFinite)||![0,1,2].includes(flag))
        throw RangeError('Invalid Bouguer GPU result at '+i);
      return {targetIndex:i,angleRadians:angle,phase:flag===0?'unresolved':flag===2?'no_ground':'ground_reachable',
        groundPolarAngleRadians:flag===1?phi:null,targetPolarAngleRadians:target,
        contactMarginSurfaceMetres:flag===1?margin:null,
        contactBeforeTarget:flag===1?margin>0:flag===2?false:null};
    });
  }
  async function createSession(capacity,deps){
    if(!Number.isInteger(capacity)||capacity<1||capacity>1024)throw RangeError('Bouguer capacity 1–1024');
    deps=deps||{};
    var nav=deps.navigator||(typeof navigator!=='undefined'?navigator:null),
      usage=deps.GPUBufferUsage||(typeof GPUBufferUsage!=='undefined'?GPUBufferUsage:null),
      mapMode=deps.GPUMapMode||(typeof GPUMapMode!=='undefined'?GPUMapMode:null);
    if(!nav||!nav.gpu||!usage||!mapMode)throw Error('WebGPU Bouguer invariant unavailable');
    var adapter=await nav.gpu.requestAdapter();
    if(!adapter)throw Error('No WebGPU Bouguer adapter');
    var device=await adapter.requestDevice(),buffers=[],closed=false;
    function alloc(size,flags){var b=device.createBuffer({size:size,usage:flags});buffers.push(b);return b;}
    function close(){if(closed)return;closed=true;buffers.forEach(function(b){b.destroy();});if(device.destroy)device.destroy();}
    try{
      var module=device.createShaderModule({code:WGSL});
      if(module.getCompilationInfo){
        var info=await module.getCompilationInfo();
        var errors=info.messages.filter(function(m){return m.type==='error';});
        if(errors.length)throw Error('GPU Bouguer WGSL: '+errors.map(function(e){return e.message;}).join('; '));
      }
      var pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});
      if(capacity*16>device.limits.maxStorageBufferBindingSize)throw Error('GPU Bouguer storage limit');
      var seeds=alloc(capacity*16,usage.STORAGE|usage.COPY_DST),
        config=alloc(64,usage.STORAGE|usage.COPY_DST),
        results=alloc(capacity*16,usage.STORAGE|usage.COPY_SRC),
        read=alloc(capacity*16,usage.COPY_DST|usage.MAP_READ);
      var bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
        {binding:0,resource:{buffer:seeds}},{binding:1,resource:{buffer:results}},
        {binding:2,resource:{buffer:config}}]});
      async function solve(request,angles){
        if(closed)throw Error('GPU Bouguer session closed');
        options(request);
        if(request.targets.length>capacity||!Array.isArray(angles)||
           angles.length!==request.targets.length||
           !angles.every(function(a){return Number.isFinite(a)&&Math.abs(a)<1.45;}))
          throw RangeError('Bouguer GPU angles and targets must align');
        var packed=gpu.pack(request),n=angles.length;
        angles.forEach(function(a,i){packed.input[i*4+3]=a;});
        var began=now();
        device.queue.writeBuffer(seeds,0,packed.input);
        device.queue.writeBuffer(config,0,packed.config);
        var encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
        pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();
        encoder.copyBufferToBuffer(results,0,read,0,n*16);
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(mapMode.READ);
        var raw=new Float32Array(read.getMappedRange(0,n*16).slice(0));read.unmap();
        return {traces:decode(request,angles,raw),timing:{gpuUploadToReadbackMs:now()-began,setupExcluded:true}};
      }
      return Object.freeze({solve:solve,close:close});
    }catch(error){close();throw error;}
  }
  function analyze(ladder,source,analyticGpu,groundGpu,cpu){
    if(!ladder||!ladder.request||!Array.isArray(ladder.coordinates)||
       !source||!source.response||!Array.isArray(source.response.results)||
       !analyticGpu||!Array.isArray(analyticGpu.traces)||
       !groundGpu||!Array.isArray(groundGpu.traces)||
       !cpu||!Array.isArray(cpu.results))throw TypeError('Bouguer audit needs matching GPU and CPU batches');
    var req=ladder.request,n=req.targets.length;
    if(n!==48||analyticGpu.traces.length!==n||groundGpu.traces.length!==n||
       source.response.results.length!==n||cpu.results.length!==n)throw RangeError('Bouguer audit needs 48 rays');
    var counts={targets:n,monotoneF:true,gpuVsF64ContactDisagreements:0,
      gpuVsF64Outside1cm:0,cpuAnalyticVsCpuReplayDisagreements:0,
      gpuUnresolved:0,within1cmF64:0,nearSurfaceStatusMismatches:0},rows=[];
    for(var i=0;i<n;i++){
      var shot=source.response.results[i],ref=cpu.results[i],g=analyticGpu.traces[i],trace=groundGpu.traces[i],
        target=req.targets[i],coord=ladder.coordinates[i];
      if(!shot||!ref||!g||!trace||g.targetIndex!==i||trace.targetIndex!==i||
         !Array.isArray(shot.target)||!Array.isArray(ref.target)||
         shot.target[0]!==target[0]||shot.target[1]!==target[1]||
         ref.target[0]!==target[0]||ref.target[1]!==target[1]||
         !Number.isFinite(shot.angle)||g.angleRadians!==shot.angle||
         Math.abs(trace.angleRadians-shot.angle)>1e-12)
        throw RangeError('Bouguer audit GPU angle/target mismatch '+i);
      var exact=f64(req,shot.angle,target),low=f64(req,shot.angle,target,GPU_NODES);
      var gpuEvent=g.contactBeforeTarget,
        cpuEvent=exact.status==='before_target'?true:exact.status==='unresolved'?null:false;
      var gDisagree=gpuEvent!==null&&cpuEvent!==null&&gpuEvent!==cpuEvent;
      var one=Object.assign({},req,{targets:[target]}),
        replay=ground.cpuFixedAngle(one,shot.angle,trace.pathLengthMetres,500,8),
        replayEvent=replay.status==='measured'?replay.hitGround:null;
      if(g.phase==='unresolved')counts.gpuUnresolved++;
      if(gDisagree)counts.gpuVsF64ContactDisagreements++;
      if(gDisagree&&exact.contactMarginSurfaceMetres!==null&&
         Math.abs(exact.contactMarginSurfaceMetres)>0.01)counts.gpuVsF64Outside1cm++;
      if(cpuEvent!==null&&replayEvent!==null&&cpuEvent!==replayEvent)
        counts.cpuAnalyticVsCpuReplayDisagreements++;
      if(exact.contactMarginSurfaceMetres!==null&&
         Math.abs(exact.contactMarginSurfaceMetres)<=0.01)counts.within1cmF64++;
      if(coord.distanceMetres<=1250&&coord.heightMetres<=.000001&&
         shot.status!==ref.status)counts.nearSurfaceStatusMismatches++;
      rows.push({targetIndex:i,distanceMetres:coord.distanceMetres,heightMetres:coord.heightMetres,
        gpuShootingStatus:shot.status,cpuShootingStatus:ref.status,gpuAngleRadians:shot.angle,
        cpuShootingAngleDeltaArcsec:Number.isFinite(ref.angle)?
          (shot.angle-ref.angle)*180/Math.PI*3600:null,
        gpuBouguer:g,cpuF64Bouguer:exact,
        cpuF64Quadrature256:low.status==='before_target'||low.status==='after_target'||low.status==='at_target'?
          {contactMarginSurfaceMetres:low.contactMarginSurfaceMetres,
            marginDelta2048Minus256Metres:exact.contactMarginSurfaceMetres-low.contactMarginSurfaceMetres}:null,
        gpuRk4FirstCrossingPathMetres:trace.firstCrossingPathMetres,
        gpuRk4EndpointAltitudeMetres:trace.endpointAltitudeMetres,
        cpuF64SameAngleRk4:replay,
        gpuBouguerVsF64Disagreement:gDisagree,
        cpuAnalyticVsCpuReplayDisagreement:cpuEvent!==null&&replayEvent!==null&&cpuEvent!==replayEvent});
    }
    return {version:'140.12.27',kind:'Bouguer spherical radial-invariant ground-contact audit',
      assumptions:'Globe; n=n(h) vacuum or standard exponential; strictly increasing n(r)r from surface to observer; inward first-forward polar branch; constant-radius terrain',
      gpuAnglesFrom:'Independent GPU predictor 5-mm shooting; never CPU-selected',
      gpuNumerics:'f32 dimensionless log invariant; 256-node midpoint quadrature; non-certified',
      cpuNumerics:'f64 log1p/expm1; 2048-node midpoint quadrature with 256-node diagnostic',
      contactMetric:'R*(target polar angle - first-ground polar angle), metres along reference surface; NOT RK4 path length',
      nearTargetCaveat:'Contact before a near-ground target for a NON-solving GPU angle does not establish that the target is physically blocked; f32 comparisons are not rigorous error bounds.',
      summary:counts,nearSurfaceCases:rows.filter(function(r){return [60,350,1250].includes(r.distanceMetres)&&r.heightMetres<=.000001;}),
      perTargetResults:rows,cpuReferenceAfterGpu:true,framePaintingChanged:false,
      cpuShootingFallback:false,productionAuthorized:false};
  }
  return Object.freeze({WGSL:WGSL,GPU_NODES:GPU_NODES,CPU_NODES:CPU_NODES,
    options:options,logF:logF,f64:f64,decode:decode,createSession:createSession,analyze:analyze});
}));
