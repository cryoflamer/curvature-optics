/* #140.12.26: diagnostic-only GPU fixed-angle ground-event replay.
 * The launch angles come from an independent GPU shooting pass, NEVER from
 * CPU shooting. CPU f64 references/replays run after ALL GPU submissions.
 * No ground-contact heuristic in this audit certifies ray visibility.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUOpticsBenchmark'):root.CurvatureWebGPUOpticsBenchmark,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412,
    typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?
    require('../optics/OpticalRayTracer'):root.CurvatureRayTracer);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuGroundContact141226=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(benchmark,gpu,contract,rayTracer){
  'use strict';
  if(!benchmark||!gpu||!contract||!rayTracer)throw Error('GPU ground-contact audit dependencies missing');
  var integrator=benchmark.WGSL_COMPENSATED.slice(
    benchmark.WGSL_COMPENSATED.indexOf('fn derivative'),
    benchmark.WGSL_COMPENSATED.indexOf('@compute @workgroup_size(64)'));
  if(!integrator.includes('advanceCompensated'))throw Error('GPU compensated RK4 kernel missing');
  var GPU_MODES=Object.freeze([
    {id:'step500Sub8',step:500,eventSubsteps:8},
    {id:'step500Sub16',step:500,eventSubsteps:16},
    {id:'step50Sub8',step:50,eventSubsteps:8}
  ]);
  // Same stable altitude and compensated RK4 as shooting; the GPU integrates
  // directly to target x at the GPU-provided angle. Independent crossing and
  // proximity records make a grazing-first classification observable.
  var WGSL=`struct Rays { data: array<vec4f> }
@group(0) @binding(0) var<storage, read> seeds: Rays;
@group(0) @binding(1) var<storage, read_write> results: Rays;
@group(0) @binding(2) var<storage, read> config: array<u32>;
${integrator}
fn altitude(s:vec4f)->f32 {
  if(config[3]==0u){return s.y;}
  let k=bitcast<f32>(config[5]);
  let a=1.0+k*s.y;
  let b=k*s.x;
  let lengthScale=sqrt(a*a+b*b);
  if(a>=0.0){return s.y+k*s.x*s.x/(lengthScale+a);}
  return (2.0*s.y+k*(s.x*s.x+s.y*s.y))/(lengthScale+1.0);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;
  if(i>=config[0]){return;}
  let t=seeds.data[i];
  let stepSize=bitcast<f32>(config[4]);
  let contactTol=bitcast<f32>(config[14]);
  var s=vec4f(0.0,t.z,cos(t.w),sin(t.w));
  var correction=vec2f(0.0,0.0);
  var travelled=0.0;
  var crossing=-1.0;
  var crossingBeforeH=0.0;
  var crossingAfterH=0.0;
  var crossingX=0.0;
  var crossingSampleWidth=0.0;
  var proximity=-1.0;
  var proximityH=0.0;
  var firstNegative=-1.0;
  var firstNegativeH=0.0;
  var minimumH=altitude(s);
  var minimumPath=0.0;
  var valid=0.0;
  var residual=0.0;
  var endpointH=0.0;
  var endpointXError=0.0;
  for(var j=0u;j<config[1];j=j+1u){
    if(s.z<=0.0001){break;}
    let ds=min(stepSize,(t.x-s.x)/max(s.z,0.0001)+stepSize*0.01);
    if(ds<=0.0){break;}
    let next=advanceCompensated(s,ds,correction);
    if(next.state.x<=s.x){break;}
    var segment=ds;
    var endpoint=next.state;
    if(next.state.x>=t.x){
      var lo=0.0;
      var hi=ds;
      segment=clamp(ds*(t.x-s.x)/(next.state.x-s.x),lo,hi);
      for(var k=0u;k<9u;k=k+1u){
        endpoint=advanceCompensated(s,segment,correction).state;
        let error=endpoint.x-t.x;
        if(abs(error)<=0.00001){break;}
        if(error>0.0){hi=segment;}else{lo=segment;}
        let proposal=segment-error/max(endpoint.z,0.0001);
        if(proposal>lo && proposal<hi){segment=proposal;}
        else{segment=(lo+hi)*0.5;}
      }
    }
    var previousH=altitude(s);
    var previousT=0.0;
    for(var sub=1u;sub<=config[13];sub=sub+1u){
      let q=segment*f32(sub)/f32(config[13]);
      let sample=advanceCompensated(s,q,correction).state;
      let h=altitude(sample);
      if(h<minimumH){minimumH=h;minimumPath=travelled+q;}
      if(firstNegative<0.0 && h<0.0){firstNegative=travelled+q;firstNegativeH=h;}
      if(proximity<0.0 && h<=contactTol){proximity=travelled+q;proximityH=h;}
      if(crossing<0.0 && previousH>0.0 && h<0.0){
        var low=previousT;
        var high=q;
        for(var b=0u;b<18u;b=b+1u){
          let middle=(low+high)*0.5;
          let mh=altitude(advanceCompensated(s,middle,correction).state);
          if(mh<0.0){high=middle;}else{low=middle;}
        }
        crossing=travelled+(low+high)*0.5;
        crossingBeforeH=previousH;
        crossingAfterH=h;
        crossingX=advanceCompensated(s,(low+high)*0.5,correction).state.x;
        crossingSampleWidth=q-previousT;
      }
      previousH=h;
      previousT=q;
    }
    travelled=travelled+segment;
    if(endpoint.x>=t.x-0.0001){
      endpointXError=endpoint.x-t.x;
      if(abs(endpointXError)<=0.01){
        valid=1.0;
        residual=endpoint.y-t.y;
        endpointH=altitude(endpoint);
      }
      break;
    }
    s=next.state;
    correction=next.correction;
  }
  let out=i*4u;
  results.data[out]=vec4f(valid,travelled,residual,endpointH);
  results.data[out+1u]=vec4f(crossing,crossingBeforeH,crossingAfterH,crossingX);
  results.data[out+2u]=vec4f(proximity,proximityH,minimumH,minimumPath);
  results.data[out+3u]=vec4f(endpointXError,crossingSampleWidth,firstNegative,firstNegativeH);
}`;
  function decode(request,angles,raw){
    if(!(raw instanceof Float32Array)||raw.length!==request.targets.length*16||
       !Array.isArray(angles)||angles.length!==request.targets.length)
      throw RangeError('GPU fixed-angle ground replay buffer mismatch');
    return request.targets.map(function(target,i){
      var j=i*16,r=Array.from(raw.subarray(j,j+16));
      if(!r.every(Number.isFinite))throw RangeError('Nonfinite GPU ground trace '+i);
      var valid=r[0]===1;
      if(r[0]!==0 && !valid)throw RangeError('Invalid GPU ground trace validity '+i);
      function evt(path){return valid&&path>=0?path:null;}
      return {targetIndex:i,angleRadians:angles[i],valid:valid,
        pathLengthMetres:valid?r[1]:null,residualMetres:valid?r[2]:null,
        endpointAltitudeMetres:valid?r[3]:null,
        firstCrossingPathMetres:evt(r[4]),
        crossingBeforeAltitudeMetres:evt(r[4])===null?null:r[5],
        crossingAfterAltitudeMetres:evt(r[4])===null?null:r[6],
        crossingXMetres:evt(r[4])===null?null:r[7],
        firstProximityPathMetres:evt(r[8]),
        firstProximityAltitudeMetres:evt(r[8])===null?null:r[9],
        minSampledAltitudeMetres:valid?r[10]:null,
        minAltitudePathMetres:valid?r[11]:null,
        endpointXErrorMetres:valid?r[12]:null,
        crossingSampleWidthMetres:evt(r[4])===null?null:r[13],
        firstNegativeSamplePathMetres:evt(r[14]),
        firstNegativeAltitudeMetres:evt(r[14])===null?null:r[15]};
    });
  }
  function timeNow(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  async function createSession(capacity,deps){
    if(!Number.isInteger(capacity)||capacity<1||capacity>1024)throw RangeError('GPU replay capacity 1–1024');
    deps=deps||{};
    var nav=deps.navigator||(typeof navigator!=='undefined'?navigator:null),
      usage=deps.GPUBufferUsage||(typeof GPUBufferUsage!=='undefined'?GPUBufferUsage:null),
      mapMode=deps.GPUMapMode||(typeof GPUMapMode!=='undefined'?GPUMapMode:null);
    if(!nav||!nav.gpu||!usage||!mapMode)throw Error('WebGPU ground replay unavailable');
    var adapter=await nav.gpu.requestAdapter();
    if(!adapter)throw Error('No GPU adapter for ground replay');
    var device=await adapter.requestDevice(),buffers=[],closed=false;
    function alloc(size,flags){var b=device.createBuffer({size:size,usage:flags});buffers.push(b);return b;}
    function close(){if(closed)return;closed=true;buffers.forEach(function(b){b.destroy();});if(device.destroy)device.destroy();}
    try{
      var module=device.createShaderModule({code:WGSL});
      if(module.getCompilationInfo){
        var info=await module.getCompilationInfo();
        var errors=info.messages.filter(function(m){return m.type==='error';});
        if(errors.length)throw Error('GPU ground WGSL: '+errors.map(function(e){return e.message;}).join('; '));
      }
      var pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});
      if(capacity*64>device.limits.maxStorageBufferBindingSize)throw Error('GPU ground trace binding size exceeded');
      var seeds=alloc(capacity*16,usage.STORAGE|usage.COPY_DST),
        config=alloc(64,usage.STORAGE|usage.COPY_DST),
        results=alloc(capacity*64,usage.STORAGE|usage.COPY_SRC),
        read=alloc(capacity*64,usage.COPY_DST|usage.MAP_READ);
      var bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
        {binding:0,resource:{buffer:seeds}},
        {binding:1,resource:{buffer:results}},
        {binding:2,resource:{buffer:config}}]});
      async function solve(request,angles){
        if(closed)throw Error('GPU ground replay session closed');
        gpu.checked(request);
        if(request.targets.length>capacity||!Array.isArray(angles)||angles.length!==request.targets.length||
           !angles.every(function(a){return Number.isFinite(a)&&Math.abs(a)<1.45;}))
          throw RangeError('GPU angles and replay targets must align');
        var prepared=gpu.pack(request),n=request.targets.length;
        angles.forEach(function(a,i){prepared.input[i*4+3]=a;});
        var began=timeNow();
        device.queue.writeBuffer(seeds,0,prepared.input);
        device.queue.writeBuffer(config,0,prepared.config);
        var encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
        pass.setPipeline(pipeline);pass.setBindGroup(0,bind);
        pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();
        encoder.copyBufferToBuffer(results,0,read,0,n*64);
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(mapMode.READ);
        var raw=new Float32Array(read.getMappedRange(0,n*64).slice(0));read.unmap();
        return {traces:decode(request,angles,raw),
          timing:{gpuUploadToReadbackMs:timeNow()-began,setupExcluded:true},
          stepMetres:request.controls.step,eventSubsteps:request.controls.eventSubsteps};
      }
      return Object.freeze({solve:solve,close:close});
    }catch(error){close();throw error;}
  }
  function cpuFixedAngle(request,angle,length,step,substeps){
    if(!Number.isFinite(length)||length<=0)return {status:'unavailable',reason:'GPU fixed-angle path unavailable'};
    try{
      var args={geometry:request.geometry,radius:request.radius,
        atmosphere:request.atmosphere,profileOptions:request.profileOptions,
        observerHeight:request.observerHeight,angle:angle,length:length,step:step,
        eventSubsteps:substeps,
        contactTolerance:request.controls.contactTolerance===undefined?1e-6:request.controls.contactTolerance};
      var event=rayTracer.trace(args),endpoint=rayTracer.trace(Object.assign({},args,{stopAtGround:false}));
      return {status:'measured',hitGround:event.hitGround,
        contact:event.event?event.event.contact:null,
        impactPathLengthMetres:event.event?event.event.pathLength:null,
        impactXMetres:event.event?event.event.x:null,
        impactAltitudeMetres:event.event?event.event.height:null,
        beforeEndMetres:event.event?length-event.event.pathLength:null,
        endpointXErrorMetres:endpoint.x-request.targets[0][0],
        endpointAltitudeMetres:endpoint.height};
    }catch(error){return {status:'unavailable',reason:String(error&&error.message||error)};}
  }
  function analyze(ladder,shot,replays,cpu){
    if(!ladder||!ladder.request||!Array.isArray(ladder.coordinates)||
       !shot||!shot.response||!Array.isArray(shot.response.results)||
       !cpu||!Array.isArray(cpu.results))throw TypeError('Ground audit requires GPU and CPU batches');
    var request=ladder.request,n=request.targets.length;
    if(n!==48||shot.response.results.length!==n||cpu.results.length!==n)
      throw RangeError('Ground audit requires fixed 48-point ladder');
    var rows=[],summaries={};
    GPU_MODES.forEach(function(mode){
      if(!replays||!replays[mode.id]||!Array.isArray(replays[mode.id].traces)||
         replays[mode.id].traces.length!==n)throw RangeError('Missing GPU fixed-angle replay '+mode.id);
      var s={targets:n,valid:0,gpuCrossings:0,gpuProximity:0,
        cpuCrossings:0,cpuGrazing:0,cpuNoContact:0,
        gpuCpuContactDisagreements:0,endpointCrossingsWithin25cm:0,
        cpuReplayUnavailable:0,angleStatusMismatches:0};
      replays[mode.id].traces.forEach(function(g,i){
        var src=shot.response.results[i],ref=cpu.results[i],coord=ladder.coordinates[i];
        if(!src||!ref||!Array.isArray(src.target)||!Array.isArray(ref.target)||
           src.target[0]!==request.targets[i][0]||src.target[1]!==request.targets[i][1]||
           ref.target[0]!==request.targets[i][0]||ref.target[1]!==request.targets[i][1]||
           !g||g.targetIndex!==i||!Number.isFinite(src.angle)||
           Math.abs(g.angleRadians-src.angle)>1e-12)
          throw RangeError('Ground replay must use the identical GPU angle/target '+i);
        var length=g.pathLengthMetres,one=Object.assign({},request,{targets:[request.targets[i]]}),
          replay=cpuFixedAngle(one,src.angle,length,mode.step,mode.eventSubsteps);
        if(g.valid)s.valid++;
        if(g.firstCrossingPathMetres!==null)s.gpuCrossings++;
        if(g.firstProximityPathMetres!==null)s.gpuProximity++;
        if(ref.status!==src.status)s.angleStatusMismatches++;
        if(g.firstCrossingPathMetres!==null&&length-g.firstCrossingPathMetres>=0&&
           length-g.firstCrossingPathMetres<=0.25)s.endpointCrossingsWithin25cm++;
        if(replay.status!=='measured')s.cpuReplayUnavailable++;
        else if(replay.contact==='crossing')s.cpuCrossings++;
        else if(replay.contact==='grazing')s.cpuGrazing++;
        else s.cpuNoContact++;
        var cpuHasEvent=replay.status==='measured'&&replay.hitGround;
        var gpuHasEvent=g.firstCrossingPathMetres!==null||g.firstProximityPathMetres!==null;
        // This is an EVENT PRESENCE disagreement; GPU crossing vs CPU
        // grazing is recorded independently, never counted as a match.
        var discrep=replay.status==='measured'&&(cpuHasEvent!==gpuHasEvent||
          (replay.contact==='crossing')!==(g.firstCrossingPathMetres!==null));
        if(discrep)s.gpuCpuContactDisagreements++;
        rows.push({mode:mode.id,targetIndex:i,distanceMetres:coord.distanceMetres,
          heightMetres:coord.heightMetres,originalGpuStatus:src.status,
          cpuShootingStatus:ref.status,gpuShootingAngleRadians:src.angle,
          cpuShootingAngleDeltaArcsec:Number.isFinite(ref.angle)?
            (src.angle-ref.angle)*180/Math.PI*3600:null,
          originalGpuContact:src.ground&&src.ground.event?src.ground.event.contact:null,
          originalGpuContactBeforeEndMetres:src.ground&&src.ground.event?
            src.pathLength-src.ground.event.pathLength:null,
          gpuFixedAngle:g,
          gpuCrossingBeforeEndMetres:g.firstCrossingPathMetres!==null&&g.valid?
            length-g.firstCrossingPathMetres:null,
          gpuProximityBeforeEndMetres:g.firstProximityPathMetres!==null&&g.valid?
            length-g.firstProximityPathMetres:null,
          cpuF64SameAngle:replay,contactDisagreement:discrep});
      });
      summaries[mode.id]=s;
    });
    return {version:'140.12.26',kind:'Fixed-GPU-angle f32/f64 ground-contact and endpoint audit',
      targetSelection:'Fixed 48 physical geometry points; GPU predictor angle selected before CPU reference',
      gpuAnglesFrom:'5-mm GPU predictor shooting; no CPU-guided angle selection',
      modes:GPU_MODES.map(function(x){return Object.assign({},x);}),
      summaries:summaries,nearSurfaceCases:rows.filter(function(r){return [60,350,1250].includes(r.distanceMetres)&&r.heightMetres<=0.000001;}),
      perTargetResults:rows,cpuF64ReferenceRunsAfterGpu:true,
      cpuTraceEndpointPolicy:'Same GPU launch angle, same GPU fixed-angle path length, not CPU shooting angle; f64 trace does not solve target x',
      eventCaveat:'GPU sample crossing/proximity are separately logged; f64 event finder also detects interior minima and grazes. Neither event presence nor near-endpoint contact certifies visibility.',
      framePaintingChanged:false,cpuShootingFallback:false,productionAuthorized:false};
  }
  return Object.freeze({WGSL:WGSL,GPU_MODES:GPU_MODES,createSession:createSession,
    decode:decode,cpuFixedAngle:cpuFixedAngle,analyze:analyze});
}));
