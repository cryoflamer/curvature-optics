/* #140.8: isolated fixed-step WebGPU RK4 ray-batch experiment.
 * No production ray/scene integration. CPU f64 is the numerical reference.
 * The GPU deliberately uses WebGPU f32; every result must pass numeric gates.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('../optics/OpticalRayTracer'):root.CurvatureRayTracer);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUOpticsBenchmark=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(tracer){
  'use strict';
  if(!tracer)throw Error('CurvatureRayTracer dependency required');
  var R=6371000;
  var PROFILES={standard:0,'exponential-occlusion':1,'inverse-spherical':2,vacuum:3};
  var WGSL=`
struct Rays { data: array<vec4f> }
@group(0) @binding(0) var<storage, read> seeds: Rays;
@group(0) @binding(1) var<storage, read_write> results: Rays;
// 0 count, 1 steps, 2 atmosphere, 3 geometry, 4 ds, 5 curvature,
// 6 refractivity, 7 scale height, 8 comparison radius (raw u32 bits for f32).
@group(0) @binding(2) var<storage, read> config: array<u32>;

fn derivative(s:vec4f)->vec4f {
  let k=bitcast<f32>(config[5]);
  var h=s.y;
  var nx=0.0;
  var nz=1.0;
  if(config[3]==1u){
    let a=1.0+k*s.y;
    let b=k*s.x;
    let length=sqrt(a*a+b*b);
    if(a>=0.0){h=s.y+k*s.x*s.x/(length+a);}
    else{h=(2.0*s.y+k*(s.x*s.x+s.y*s.y))/(length+1.0);}
    nx=b/length;
    nz=a/length;
  }
  var q=0.0;
  let profile=config[2];
  if(profile==0u){
    let N0=bitcast<f32>(config[6]);
    let H=bitcast<f32>(config[7]);
    let refr=N0*exp(-h/H);
    q=-refr/(H*(1.0+refr));
  } else if(profile==1u){
    q=1.0/bitcast<f32>(config[8]);
  } else if(profile==2u){
    let t=h/bitcast<f32>(config[8]);
    let u=1.0+t;
    q=(2.0*u*u*u-u)/(bitcast<f32>(config[8])*(1.0+t*(2.0+t)*u*u));
  }
  let dotv=s.z*nx+s.w*nz;
  return vec4f(s.z,s.w,q*(nx-dotv*s.z),q*(nz-dotv*s.w));
}
fn advance(s:vec4f,ds:f32)->vec4f {
  let a=derivative(s);
  let b=derivative(s+0.5*ds*a);
  let c=derivative(s+0.5*ds*b);
  let d=derivative(s+ds*c);
  var out=s+(ds/6.0)*(a+2.0*b+2.0*c+d);
  let inv=1.0/length(out.zw);
  out.z=out.z*inv;
  out.w=out.w*inv;
  return out;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;
  if(i>=config[0]){return;}
  var s=seeds.data[i];
  let ds=bitcast<f32>(config[4]);
  for(var j=0u;j<config[1];j=j+1u){s=advance(s,ds);}
  results.data[i]=s;
}`;
  function check(opts){
    opts=opts||{};
    var p={count:opts.count===undefined?1024:opts.count,
      steps:opts.steps===undefined?256:opts.steps,
      step:opts.step===undefined?50:opts.step,
      observerHeight:opts.observerHeight===undefined?15:opts.observerHeight,
      atmosphere:opts.atmosphere||'standard',geometry:opts.geometry||'flat',
      radius:opts.radius===undefined?R:opts.radius,
      occlusionRadius:opts.occlusionRadius===undefined?R:opts.occlusionRadius,
      refractivity:opts.refractivity===undefined?0.000293:opts.refractivity,
      scaleHeight:opts.scaleHeight===undefined?7350:opts.scaleHeight,
      repeats:opts.repeats===undefined?3:opts.repeats,
      maxPositionError:opts.maxPositionError===undefined?0.1:opts.maxPositionError,
      maxAngularError:opts.maxAngularError===undefined?1e-5:opts.maxAngularError};
    if(!Number.isInteger(p.count)||p.count<1||p.count>65536||
      !Number.isInteger(p.steps)||p.steps<1||p.steps>10000||
      !Number.isInteger(p.repeats)||p.repeats<1||p.repeats>20||
      !Number.isFinite(p.step)||p.step<=0||
      !Number.isFinite(p.observerHeight)||p.observerHeight<0||
      !Number.isFinite(p.radius)||p.radius<=0||
      !Number.isFinite(p.occlusionRadius)||p.occlusionRadius<=0||
      !Number.isFinite(p.refractivity)||p.refractivity<0||
      !Number.isFinite(p.scaleHeight)||p.scaleHeight<=0||
      !Number.isFinite(p.maxPositionError)||p.maxPositionError<=0||
      !Number.isFinite(p.maxAngularError)||p.maxAngularError<=0||
      !(p.atmosphere in PROFILES)||!['flat','globe'].includes(p.geometry))
      throw Error('Invalid WebGPU optical benchmark controls');
    if(p.count*p.steps>12000000)throw Error('Benchmark budget exceeded: maximum 12 million RK4 steps');
    // Avoid silent truncation of integer/floating inputs when preparing GPU buffers.
    if(!Number.isFinite(Math.fround(p.step))||Math.fround(p.step)<=0||
       !Number.isFinite(Math.fround(p.radius))||!Number.isFinite(Math.fround(p.occlusionRadius))||
       !Number.isFinite(Math.fround(p.scaleHeight)))throw Error('Values cannot be represented as f32');
    return p;
  }
  function seeds(p){
    p=check(p);
    var data=new Float32Array(p.count*4);
    for(var i=0;i<p.count;i++){
      // Deterministic angles, all away from vertical, span a practical near-horizon cone.
      var a=-0.012+0.036*(i+0.5)/p.count;
      data.set([0,p.observerHeight,Math.cos(a),Math.sin(a)],4*i);
    }
    return data;
  }
  function cpuIntegrate(p,inputs){
    p=check(p);
    if(!(inputs instanceof Float32Array)||inputs.length!==4*p.count)
      throw Error('Incorrect CPU ray seeds');
    var advance=tracer.prepareStepper({geometry:p.geometry,radius:p.radius,
      atmosphere:p.atmosphere,profileOptions:{occlusionRadius:p.occlusionRadius,
        refractivity:p.refractivity,scaleHeight:p.scaleHeight}},true);
    var out=new Float64Array(inputs.length);
    for(var i=0;i<p.count;i++){
      var o=4*i,s=[inputs[o],inputs[o+1],inputs[o+2],inputs[o+3]];
      // Input is already quantized to f32 for the same initial conditions.
      for(var j=0;j<p.steps;j++)s=advance(s,p.step);
      for(var k=0;k<4;k++)out[o+k]=s[k];
    }
    return out;
  }
  function compare(reference,gpu,p){
    p=check(p);
    if(reference.length!==p.count*4||gpu.length!==reference.length)throw Error('Mismatched ray outputs');
    var maxPositionError=0,maxAngularError=0,failed=0,nonFinite=0;
    var positions=[],angles=[];
    for(var i=0;i<p.count;i++){
      var o=4*i;
      if(![reference[o],reference[o+1],reference[o+2],reference[o+3],gpu[o],gpu[o+1],gpu[o+2],gpu[o+3]].every(Number.isFinite)){
        nonFinite++;failed++;continue;
      }
      var positionError=Math.hypot(gpu[o]-reference[o],gpu[o+1]-reference[o+1]);
      var angularError=Math.abs(Math.atan2(gpu[o+3],gpu[o+2])-Math.atan2(reference[o+3],reference[o+2]));
      positions.push(positionError);angles.push(angularError);
      maxPositionError=Math.max(maxPositionError,positionError);
      maxAngularError=Math.max(maxAngularError,angularError);
      if(positionError>p.maxPositionError||angularError>p.maxAngularError)failed++;
    }
    function p95(v){return v.length?v.slice().sort((a,b)=>a-b)[Math.ceil(0.95*v.length)-1]:null;}
    return {qualified:failed===0,rayCount:p.count,failedRays:failed,nonFiniteRays:nonFinite,
      maxPositionErrorMetres:maxPositionError,p95PositionErrorMetres:p95(positions),
      maxAngularErrorRadians:maxAngularError,p95AngularErrorRadians:p95(angles),
      positionToleranceMetres:p.maxPositionError,angularToleranceRadians:p.maxAngularError};
  }
  function bits(f){var b=new ArrayBuffer(4);new DataView(b).setFloat32(0,f,true);return new DataView(b).getUint32(0,true);}
  function config(p){
    p=check(p);
    return new Uint32Array([p.count,p.steps,PROFILES[p.atmosphere],p.geometry==='globe'?1:0,
      bits(p.step),bits(1/p.radius),bits(p.refractivity),bits(p.scaleHeight),bits(p.occlusionRadius)]);
  }
  function median(v){var a=v.slice().sort((x,y)=>x-y);return (a[(a.length-1)>>1]+a[a.length>>1])/2;}
  function now(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
  async function run(options,deps){
    var p=check(options),input=seeds(p);
    deps=deps||{};
    var nav=deps.navigator||((typeof navigator!=='undefined')?navigator:null);
    if(!nav||!nav.gpu||typeof nav.gpu.requestAdapter!=='function')
      return {version:'140.8',status:'unavailable',reason:'WebGPU navigator.gpu is unavailable',parameters:p,qualified:false};
    var acquisitionStarted=now();
    var adapter=await nav.gpu.requestAdapter();
    if(!adapter)return {version:'140.8',status:'unavailable',reason:'No WebGPU adapter',parameters:p,qualified:false};
    var device=await adapter.requestDevice();
    var deviceAcquisitionMs=now()-acquisitionStarted;
    var GPUBufferUsageValue=deps.GPUBufferUsage||((typeof GPUBufferUsage!=='undefined')?GPUBufferUsage:null);
    var GPUMapModeValue=deps.GPUMapMode||((typeof GPUMapMode!=='undefined')?GPUMapMode:null);
    if(!GPUBufferUsageValue||!GPUMapModeValue)throw Error('WebGPU constants not available');
    var bytes=input.byteLength,configValues=config(p);
    if(bytes>device.limits.maxStorageBufferBindingSize)throw Error('Ray buffer exceeds GPU storage limit');
    var cpuTimes=[],gpuTimes=[],cpuOutput=null,gpuOutput=null,validation=null;
    var pipelineStart=now();
    var shader=device.createShaderModule({code:WGSL});
    if(shader.getCompilationInfo){
      var compilation=await shader.getCompilationInfo();
      var errors=compilation.messages.filter(m=>m.type==='error');
      if(errors.length)throw Error('WGSL compilation failed: '+errors.map(m=>m.message).join('; '));
    }
    var pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:shader,entryPoint:'main'}});
    var pipelineMs=now()-pipelineStart;
    var usage=GPUBufferUsageValue;
    var source=device.createBuffer({size:bytes,usage:usage.STORAGE|usage.COPY_DST});
    var result=device.createBuffer({size:bytes,usage:usage.STORAGE|usage.COPY_SRC});
    var settings=device.createBuffer({size:configValues.byteLength,usage:usage.STORAGE|usage.COPY_DST});
    var read=device.createBuffer({size:bytes,usage:usage.COPY_DST|usage.MAP_READ});
    var group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
      {binding:0,resource:{buffer:source}},{binding:1,resource:{buffer:result}},
      {binding:2,resource:{buffer:settings}}]});
    var runGpu=async function(){
      // Include both CPU-to-GPU staging uploads in the measured wall-clock.
      var start=now();
      device.queue.writeBuffer(source,0,input);
      device.queue.writeBuffer(settings,0,configValues);
      var encoder=device.createCommandEncoder();
      var pass=encoder.beginComputePass();
      pass.setPipeline(pipeline);pass.setBindGroup(0,group);
      pass.dispatchWorkgroups(Math.ceil(p.count/64));pass.end();
      encoder.copyBufferToBuffer(result,0,read,0,bytes);
      device.queue.submit([encoder.finish()]);
      await read.mapAsync(GPUMapModeValue.READ);
      var output=new Float32Array(read.getMappedRange().slice(0));
      read.unmap();
      return {ms:now()-start,output:output};
    };
    try{
      // Device/pipeline creation and warmup are not included in steady-state timing.
      await runGpu();
      for(var i=0;i<p.repeats;i++){
        var t=now();cpuOutput=cpuIntegrate(p,input);cpuTimes.push(now()-t);
        var gpu=await runGpu();gpuTimes.push(gpu.ms);gpuOutput=gpu.output;
        var comparison=compare(cpuOutput,gpuOutput,p);
        if(validation===null||!comparison.qualified)validation=comparison;
      }
    }finally{
      source.destroy();result.destroy();settings.destroy();read.destroy();
      if(device.destroy)device.destroy();
    }
    var resultReport={version:'140.8',status:'measured',qualified:validation.qualified,
      parameters:p,device:{adapterInfo:adapter.info?{vendor:adapter.info.vendor||'',
        architecture:adapter.info.architecture||'',device:adapter.info.device||'',description:adapter.info.description||''}:null,
        hardwareAcceleration:'unverified'},
      timing:{deviceAcquisitionMs:deviceAcquisitionMs,pipelineSetupMs:pipelineMs,cpuMedianMs:median(cpuTimes),
        gpuUploadToReadbackMedianMs:median(gpuTimes),cpuSamplesMs:cpuTimes,
        gpuUploadToReadbackSamplesMs:gpuTimes,
        ratioCpuToGpu:median(cpuTimes)/median(gpuTimes)},
      validation:validation,limitations:[
        'GPU uses f32 while the existing CPU integrator uses f64; tolerances are application-specific, not a certification',
        'Each ray is an independent fixed-step RK4 path; no shooting, boundary events, adaptive integration, or occlusion is computed',
        'CPU and GPU use identical f32-quantized initial states but independent f64/f32 integration arithmetic',
        'GPU timing includes seed/config uploads, command encoding, queue submission and full readback/map; adapter/device and pipeline setup are reported separately',
        'CPU timing is JS wall-clock; GPU timing is upload-to-readback wall-clock, NOT device timestamp or isolated shader duration',
        'For rays crossing an opaque ground boundary these are mathematical trajectories only, not valid visibility results',
        'Benchmark is standalone and does NOT alter the production CPU solver or select a GPU optics backend',
        'A passing finite set is not a proof of equivalent multipath, grazing or distant-ray behaviour']};
    return resultReport;
  }
  return Object.freeze({WGSL:WGSL,check:check,seeds:seeds,cpuIntegrate:cpuIntegrate,
    compare:compare,config:config,run:run});
}));
