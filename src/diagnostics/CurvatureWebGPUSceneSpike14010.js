/* #140.10: one bounded, opt-in real-scene TARGET SHOOTING integration spike.
 * GPU proposes launch angles for actual production tower-mesh vertices.
 * The unchanged CPU point-to-point solver ALWAYS certifies shooting and ground
 * events; a GPU candidate never supplies a visibility/occlusion verdict.
 * No renderer/backend hook is installed. This is NOT a frame/FPS benchmark.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUOpticsBenchmark'):root.CurvatureWebGPUOpticsBenchmark,
    typeof module==='object'&&module.exports?
    require('../optics/OpticalTargetProjection'):root.CurvatureTargetProjection,
    typeof module==='object'&&module.exports?
    require('../geometry/CurvatureSurfaceGeometry'):root.CurvatureSurfaceGeometry);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUSceneSpike14010=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(bench,projection,surfaces){
  'use strict';
  if(!bench||!projection||!surfaces)throw Error('#140.10 dependencies required');
  var MAX_TARGETS=128,STEPS=384,MIN_SPEEDUP=2;
  // Derivative and position-compensated RK4 come from the qualified #140.9.1
  // shader. Only the entrypoint is replaced to shoot scene target points.
  var prelude=bench.WGSL_COMPENSATED.split('@compute @workgroup_size(64)')[0];
  if(!prelude.includes('advanceCompensated'))throw Error('Missing validated Kahan kernel');
  var WGSL=prelude+`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;
  if(i>=config[0]){return;}
  let targetData=seeds.data[i];
  let x=targetData.x;
  let z=targetData.y;
  let eye=targetData.z;
  var angle=targetData.w;
  var residual=1e10;
  var endpoint=vec4f(0.0,eye,cos(angle),sin(angle));
  let pathLength=length(vec2f(x,z-eye));
  let ds=(pathLength+2.0)/f32(config[1]);
  // Bounded local Newton shooting: candidate only, never a verified root.
  for(var attempt=0u;attempt<4u;attempt=attempt+1u){
    var s=vec4f(0.0,eye,cos(angle),sin(angle));
    var correction=vec2f(0.0,0.0);
    for(var j=0u;j<config[1];j=j+1u){
      let next=advanceCompensated(s,ds,correction);
      s=next.state;
      correction=next.correction;
    }
    endpoint=s;
    if(s.z<=0.01){break;}
    residual=s.y+(x-s.x)*s.w/s.z-z;
    if(abs(residual)<0.0001){break;}
    let update=clamp(-residual*cos(angle)*cos(angle)/x,-0.02,0.02);
    angle=angle+update;
    if(abs(angle)>1.4){break;}
  }
  results.data[i]=vec4f(angle,residual,endpoint.x,endpoint.y);
}`;
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function validateFixture(fixture){
    if(!fixture||fixture.version!=='140.10'||!Array.isArray(fixture.scenes)||
      fixture.scenes.length!==2)throw Error('Invalid #140.10 production-scene fixture');
    var seen=new Set();
    fixture.scenes.forEach(function(s){
      if(!s||seen.has(s.id)||!['flat','globe'].includes(s.geometry)||
        s.atmosphere!=='standard'||!Number.isFinite(s.observerHeight)||
        s.observerHeight<0||!Number.isFinite(s.radius)||s.radius<=0||
        !Array.isArray(s.targets)||s.targets.length<1||s.targets.length>MAX_TARGETS)
        throw Error('Invalid production scene target set');
      seen.add(s.id);
      s.targets.forEach(function(t){
        if(!Array.isArray(t)||t.length!==2||!Number.isFinite(t[0])||
          !Number.isFinite(t[1])||t[0]<=0||t[1]<0||
          t[0]>=s.radius*Math.PI/2)throw Error('Invalid scene target');
      });
    });
    if(!seen.has('towers-12.flat')||!seen.has('towers-12.globe'))
      throw Error('Both production tower geometries required');
    return fixture;
  }
  function targets(s){
    var surface=surfaces.createFromCurvature(s.geometry==='globe'?1/s.radius:0);
    return s.targets.map(function(t){return surface.surfacePoint2(t[0],t[1]);});
  }
  function options(s,target,angle){
    var o={geometry:s.geometry,radius:s.radius,atmosphere:s.atmosphere,
      observerHeight:s.observerHeight,target:target,step:50,
      shootingPredictor:true};
    if(Number.isFinite(angle))o.shootingWarmStartAngle=angle;
    return o;
  }
  function solveScene(s,angles){
    var list=targets(s),out=[],accepted=0,attempts=0,shootRK4Calls=0;
    for(var i=0;i<list.length;i++){
      var r=projection.solve(options(s,list[i],angles&&angles[i]));
      out.push({status:r.status,angle:r.angle,residual:r.residual,
        pathLength:r.pathLength||null});
      accepted+=r.warmStartAccepted||0;
      attempts+=r.warmStartAttempts||0;
      shootRK4Calls+=r.shootRK4Calls||0;
    }
    return {results:out,warmStartAccepted:accepted,warmStartAttempts:attempts,
      shootRK4Calls:shootRK4Calls};
  }
  function seeds(s){
    var points=targets(s),input=new Float32Array(points.length*4);
    points.forEach(function(t,i){
      var a=Math.atan2(t[1]-s.observerHeight,t[0]);
      input.set([t[0],t[1],s.observerHeight,a],4*i);
    });
    return input;
  }
  function compare(a,b){
    if(a.length!==b.length)throw Error('Mismatched scene output counts');
    var statusMismatch=0,angleMismatch=0,maxAngularError=0,unresolved=0;
    for(var i=0;i<a.length;i++){
      if(a[i].status!==b[i].status)statusMismatch++;
      if(a[i].status==='solver_failed'||a[i].status==='indeterminate'||
        b[i].status==='solver_failed'||b[i].status==='indeterminate')unresolved++;
      if(Number.isFinite(a[i].angle)&&Number.isFinite(b[i].angle)){
        var error=Math.abs(Math.atan2(Math.sin(a[i].angle-b[i].angle),Math.cos(a[i].angle-b[i].angle)));
        maxAngularError=Math.max(maxAngularError,error);
        if(error>1e-7)angleMismatch++;
      }else if(a[i].angle!==b[i].angle)angleMismatch++;
    }
    return {statusMismatch:statusMismatch,angleMismatch:angleMismatch,
      maxAngularErrorRadians:maxAngularError,unresolved:unresolved};
  }
  function evaluate(report){
    if(!report||!Array.isArray(report.scenes)||report.scenes.length!==2)
      throw Error('Incomplete scene-spike evidence');
    var reasons=[],verdict='INCONCLUSIVE';
    var complete=report.scenes.every(function(s){return s.status==='measured'&&
      s.count>=1&&s.baseline&&s.hybrid&&s.comparison&&Number.isFinite(s.baseline.ms)&&
      Number.isFinite(s.hybrid.cpuCertificationMs)&&Number.isFinite(s.hybrid.gpuBatchMs);});
    if(!complete){reasons.push('Incomplete or unavailable scene GPU/CPU measurements');}
    else if(report.scenes.some(function(s){return s.comparison.statusMismatch>0||
      s.comparison.angleMismatch>0||s.comparison.unresolved>0;})){
      verdict='SCENE_NUMERICAL_STOP';
      reasons.push('Scene shooting differs, remains unresolved, or GPU candidates never pass CPU validation');
    }else if(report.scenes.some(function(s){return s.hybrid.warmStartAccepted===0;})){
      verdict='SCENE_PERFORMANCE_STOP';
      reasons.push('No GPU warm starts were accepted by the production CPU solver in at least one scene');
    }else if(!Number.isFinite(report.timing&&report.timing.coldSpeedup)||
        report.timing.coldSpeedup<MIN_SPEEDUP){
      verdict='SCENE_PERFORMANCE_STOP';
      reasons.push('Cold GPU setup + upload/readback + CPU-certified shooting did not beat CPU shooting by 2x');
    }else{
      verdict='STAGE_PASS_ONLY';
      reasons.push('CPU-certified scene-target shooting achieved 2x, but full scene assembly and painter were not measured');
    }
    return {verdict:verdict,reasons:reasons,thresholdColdSpeedup:MIN_SPEEDUP,
      productionAuthorized:false,experimentsRemaining:0,
      nextAction:verdict==='STAGE_PASS_ONLY'?
        'STOP this spike; full optical scene assembly must be qualified independently before any production change':
        'STOP this GPU shooting approach; keep the CPU scene solver and renderer'};
  }
  async function run(fixture,deps){
    validateFixture(fixture);deps=deps||{};
    var nav=deps.navigator||((typeof navigator!=='undefined')?navigator:null);
    if(!nav||!nav.gpu)return {version:'140.10',status:'unavailable',
      reason:'WebGPU unavailable',productionAuthorized:false};
    var usage=deps.GPUBufferUsage||((typeof GPUBufferUsage!=='undefined')?GPUBufferUsage:null);
    var mapMode=deps.GPUMapMode||((typeof GPUMapMode!=='undefined')?GPUMapMode:null);
    if(!usage||!mapMode)throw Error('WebGPU constants missing');
    // Warm up JS solver before timing, without including warm-up in either path.
    fixture.scenes.forEach(function(s){projection.solve(options(s,targets(s)[0]));});
    var baseStart=now(),baseline=fixture.scenes.map(function(s){
      var t=now(),r=solveScene(s);return {ms:now()-t,result:r};
    }),baselineTotalMs=now()-baseStart;
    var start=now(),adapter=await nav.gpu.requestAdapter();
    if(!adapter)return {version:'140.10',status:'unavailable',
      reason:'No WebGPU adapter',productionAuthorized:false};
    var device=await adapter.requestDevice(),buffers=[];
    try{
      var module=device.createShaderModule({code:WGSL});
      if(module.getCompilationInfo){
        var info=await module.getCompilationInfo();
        var errors=info.messages.filter(function(m){return m.type==='error';});
        if(errors.length)throw Error('Scene WGSL compilation failed: '+errors.map(function(e){return e.message;}).join('; '));
      }
      var pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});
      var setupMs=now()-start,scenes=[],totalGPU=0,totalCertificate=0;
      for(var j=0;j<fixture.scenes.length;j++){
        var s=fixture.scenes[j],input=seeds(s),bytes=input.byteLength;
        if(bytes>device.limits.maxStorageBufferBindingSize)throw Error('Scene targets exceed GPU limit');
        var packed=bench.config({count:s.targets.length,steps:STEPS,atmosphere:s.atmosphere,
          geometry:s.geometry,radius:s.radius,observerHeight:s.observerHeight});
        var src=device.createBuffer({size:bytes,usage:usage.STORAGE|usage.COPY_DST});
        var dst=device.createBuffer({size:bytes,usage:usage.STORAGE|usage.COPY_SRC});
        var cfg=device.createBuffer({size:packed.byteLength,usage:usage.STORAGE|usage.COPY_DST});
        var read=device.createBuffer({size:bytes,usage:usage.COPY_DST|usage.MAP_READ});
        buffers.push(src,dst,cfg,read);
        var bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
          {binding:0,resource:{buffer:src}},{binding:1,resource:{buffer:dst}},
          {binding:2,resource:{buffer:cfg}}]});
        var began=now();
        device.queue.writeBuffer(src,0,input);device.queue.writeBuffer(cfg,0,packed);
        var encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
        pass.setPipeline(pipeline);pass.setBindGroup(0,bind);
        pass.dispatchWorkgroups(Math.ceil(s.targets.length/64));pass.end();
        encoder.copyBufferToBuffer(dst,0,read,0,bytes);
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(mapMode.READ);
        var raw=new Float32Array(read.getMappedRange().slice(0));read.unmap();
        var gpuBatchMs=now()-began;totalGPU+=gpuBatchMs;
        var angles=Array.from({length:s.targets.length},function(_,i){
          var value=raw[4*i];return Number.isFinite(value)&&Math.abs(value)<1.4?value:NaN;
        });
        var certifiedStart=now(),certified=solveScene(s,angles),
          cpuCertificationMs=now()-certifiedStart;totalCertificate+=cpuCertificationMs;
        scenes.push({id:s.id,count:s.targets.length,status:'measured',
          baseline:{ms:baseline[j].ms,shootRK4Calls:baseline[j].result.shootRK4Calls},
          hybrid:{gpuBatchMs:gpuBatchMs,cpuCertificationMs:cpuCertificationMs,
            warmStartAccepted:certified.warmStartAccepted,
            warmStartAttempts:certified.warmStartAttempts,shootRK4Calls:certified.shootRK4Calls},
          comparison:compare(baseline[j].result.results,certified.results)});
      }
      var hybridColdMs=setupMs+totalGPU+totalCertificate;
      var report={version:'140.10',status:'finished',experiment:'GPU candidate angles + unchanged CPU shooting and ground-event certification',
        device:{adapterInfo:adapter.info?{vendor:adapter.info.vendor||'',architecture:adapter.info.architecture||''}:null,
          hardwareAcceleration:'unverified'},
        scenes:scenes,timing:{cpuShootingMs:baselineTotalMs,gpuSetupMs:setupMs,
          gpuUploadToReadbackMs:totalGPU,cpuCertificationMs:totalCertificate,
          hybridColdMs:hybridColdMs,coldSpeedup:baselineTotalMs/hybridColdMs},
        limitations:[
          'Targets were extracted from actual production 12-tower physical mesh vertices, not synthetic launch-angle seeds',
          'CPU point-to-point shooting, first-branch restriction, and CPU ground-event verification remain authoritative',
          'Only a shooting stage is timed; full scene composition, guides, clipping, fills, painter, FPS, and caching are excluded',
          'GPU f32 proposal is not an authoritative event/occlusion solver or a multipath proof',
          'One cold run on one device is not a statistically stable speedup estimate',
          'Neither this module nor its HTML page changes the production backend']};
      report.decision=evaluate(report);
      return report;
    }finally{
      buffers.forEach(function(b){b.destroy();});
      if(device.destroy)device.destroy();
    }
  }
  return Object.freeze({WGSL:WGSL,validateFixture:validateFixture,
    targets:targets,seeds:seeds,solveScene:solveScene,compare:compare,
    evaluate:evaluate,run:run});
}));
