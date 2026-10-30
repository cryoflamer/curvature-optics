/* #140.12: independent, bounded GPU target shooting research (NOT production).
 * Stage A sweeps many launch angles in parallel; stage B brackets/refines roots
 * and evaluates first-ground evidence on GPU. CPU is used solely as an OFFLINE
 * reference after the timed GPU batch. A finite sweep is not a multipath proof.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUOpticsBenchmark'):root.CurvatureWebGPUOpticsBenchmark,
    typeof module==='object'&&module.exports?
    require('./CurvatureOpticalBatchContract1411'):root.CurvatureOpticalBatchContract1411,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUSceneSpike14010'):root.CurvatureWebGPUSceneSpike14010);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGPUBatchShooting1412=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(benchmark,contract,sceneSpike){
  'use strict';
  if(!benchmark||!contract||!sceneSpike)throw Error('#140.12 dependencies missing');
  var SAMPLES=33, MAX_TARGETS=256,MAX_STEPS=8192,MAX_DISTANCE=100000;
  var stagePrelude=benchmark.WGSL_COMPENSATED;
  var integrator=stagePrelude.slice(stagePrelude.indexOf('fn derivative'),
    stagePrelude.indexOf('@compute @workgroup_size(64)'));
  if(!integrator.includes('advanceCompensated'))throw Error('Kahan RK4 shader unavailable');
  // Binding 3 is only used in the refinement stage; stage A has a different
  // auto pipeline layout. Do not submit extra bindings to an auto layout.
  function shader(refinement){
    return `struct Rays { data: array<vec4f> }
@group(0) @binding(0) var<storage, read> seeds: Rays;
@group(0) @binding(1) var<storage, read_write> results: Rays;
@group(0) @binding(2) var<storage, read> config: array<u32>;
${refinement?'@group(0) @binding(3) var<storage, read> coarse: Rays;':''}
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
struct Arrival { residual:f32, path:f32, valid:f32, impact:f32, contact:f32 }
fn arrival(t:vec4f,angle:f32,withGround:bool)->Arrival {
  let stepSize=bitcast<f32>(config[4]);
  var s=vec4f(0.0,t.z,cos(angle),sin(angle));
  var correction=vec2f(0.0,0.0);
  var travelled=0.0;
  var impact=-1.0;
  var contact=0.0;
  for(var j=0u;j<config[1];j=j+1u){
    if(s.z<=0.0001){break;}
    let ds=min(stepSize, (t.x-s.x)/max(s.z,0.0001)+stepSize*0.01);
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
    if(withGround && impact<0.0){
      // Midpoint sampling makes clear crossings observable even when a full
      // RK4 step has endpoints above ground. Tangencies remain uncertain.
      var previousH=altitude(s);
      var previousT=0.0;
      for(var sub=1u;sub<=config[13];sub=sub+1u){
        let q=segment*f32(sub)/f32(config[13]);
        let point=advanceCompensated(s,q,correction).state;
        let h=altitude(point);
        if(previousH>0.0 && h<0.0){
          var low=previousT;
          var high=q;
          for(var b=0u;b<18u;b=b+1u){
            let middle=(low+high)*0.5;
            let middleH=altitude(advanceCompensated(s,middle,correction).state);
            if(middleH<0.0){high=middle;}else{low=middle;}
          }
          impact=travelled+(low+high)*0.5;
          contact=1.0;
          break;
        }
        if(h<=bitcast<f32>(config[14]) && impact<0.0){
          impact=travelled+q;
          contact=2.0; // ambiguous/grazing: conservative, not a crossing proof
        }
        previousH=h;previousT=q;
      }
    }
    travelled=travelled+segment;
    if(endpoint.x>=t.x-0.0001){
      if(abs(endpoint.x-t.x)>0.01){break;}
      return Arrival(endpoint.y-t.y,travelled,1.0,impact,contact);
    }
    s=next.state;
    correction=next.correction;
  }
  return Arrival(0.0,0.0,0.0,-1.0,0.0);
}
${refinement?`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;
  if(i>=config[0]){return;}
  let t=seeds.data[i];
  var bestDistance=1e30;
  var bracket=-1i;
  var candidateBrackets=0u;
  // Choose the nearest detected sign-change interval to straight line of sight.
  for(var j=0u;j<config[9]-1u;j=j+1u){
    let a=coarse.data[i*config[9]+j];
    let b=coarse.data[i*config[9]+j+1u];
    if(a.w>0.5 && b.w>0.5 && a.y*b.y<=0.0){
      candidateBrackets=candidateBrackets+1u;
      let distance=abs((a.x+b.x)*0.5-t.w);
      if(distance<bestDistance){bestDistance=distance;bracket=i32(j);}
    }
  }
  let offset=i*3u;
  if(bracket<0){
    results.data[offset]=vec4f(0.0,0.0,0.0,0.0);
    results.data[offset+1u]=vec4f(0.0,0.0,0.0,0.0);
    results.data[offset+2u]=vec4f(-1.0,0.0,0.0,0.0);
    return;
  }
  var a=coarse.data[i*config[9]+u32(bracket)];
  var b=coarse.data[i*config[9]+u32(bracket)+1u];
  var usedIterations=0u;
  for(var iter=0u;iter<config[12];iter=iter+1u){
    usedIterations=iter+1u;
    let angle=(a.x+b.x)*0.5;
    let shot=arrival(t,angle,false);
    if(shot.valid<0.5){break;}
    if(abs(shot.residual)<=bitcast<f32>(config[11])){
      a=vec4f(angle,shot.residual,shot.path,1.0);
      b=a;
      break;
    }
    if(a.y*shot.residual<=0.0){b=vec4f(angle,shot.residual,shot.path,1.0);}
    else{a=vec4f(angle,shot.residual,shot.path,1.0);}
  }
  let angle=(a.x+b.x)*0.5;
  let shot=arrival(t,angle,true);
  // Fail closed if f32 integration did not meet the target residual threshold.
  var status=0.0;
  if(shot.valid>0.5 && abs(shot.residual)<=bitcast<f32>(config[11])){
    status=1.0;
    if(shot.impact>=0.0){
      if(shot.contact==1.0 && shot.impact<shot.path-bitcast<f32>(config[15])){
        status=2.0; // observed prior crossing
      }else{status=3.0;} // contact/grazing uncertainty
    }
  }
  results.data[offset]=vec4f(angle,shot.residual,shot.path,status);
  results.data[offset+1u]=vec4f(shot.impact,shot.contact,shot.valid,f32(candidateBrackets));
  results.data[offset+2u]=vec4f(f32(bracket),f32(usedIterations),a.x,b.x);
}`:`
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;
  if(i>=config[0]*config[9]){return;}
  let targetIndex=i/config[9];
  let sampleIndex=i%config[9];
  let t=seeds.data[targetIndex];
  let angle=t.w+(f32(sampleIndex)/(f32(config[9])-1.0)*2.0-1.0)*bitcast<f32>(config[10]);
  if(abs(angle)>1.45){results.data[i]=vec4f(angle,0.0,0.0,0.0);return;}
  let shot=arrival(t,angle,false);
  results.data[i]=vec4f(angle,shot.residual,shot.path,shot.valid);
}`}`;
  }
  var WGSL_SWEEP=shader(false),WGSL_REFINE=shader(true);
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function bits(f){var v=new DataView(new ArrayBuffer(4));v.setFloat32(0,f,true);return v.getUint32(0,true);}
  function checked(request){
    contract.validateRequest(request);
    if(request.targets.length>MAX_TARGETS)throw RangeError('#140.12 bounded maximum '+MAX_TARGETS+' targets');
    if(request.targets.some(function(t){return t[0]>MAX_DISTANCE||Math.abs(t[1])>MAX_DISTANCE;}))
      throw RangeError('#140.12 maximum target distance exceeded');
    var controls=request.controls||{};
    var step=controls.step===undefined?50:controls.step;
    var substeps=controls.eventSubsteps===undefined?8:controls.eventSubsteps;
    var contactTol=controls.contactTolerance===undefined?1e-6:controls.contactTolerance;
    if(!(step>=1&&step<=500)||!Number.isInteger(substeps)||substeps<2||substeps>16||
        !(contactTol>=1e-7&&contactTol<=0.01))throw RangeError('Unsupported GPU integration/event settings');
    if(Object.keys(controls).some(function(k){return !['step','targetTolerance','eventSubsteps','contactTolerance'].includes(k)}))
      throw RangeError('Unsupported GPU controls; no silent approximation');
    if(request.profileOptions && Object.keys(request.profileOptions).some(function(k){return !['occlusionRadius','refractivity','scaleHeight'].includes(k)}))
      throw RangeError('Unsupported GPU atmosphere options');
    if(request.profileOptions && ('refractivity' in request.profileOptions)&&request.profileOptions.refractivity<0)
      throw RangeError('Invalid refractivity');
    if(request.profileOptions && ('scaleHeight' in request.profileOptions)&&request.profileOptions.scaleHeight<=0)
      throw RangeError('Invalid scale height');
    if(request.targets.some(function(t){return Math.abs(Math.atan2(t[1]-request.observerHeight,t[0]))>1.2;}))
      throw RangeError('Near-vertical targets excluded from bounded GPU sweep');
    var steps=Math.ceil(MAX_DISTANCE/step*1.6)+2;
    if(steps>MAX_STEPS)throw RangeError('GPU RK4 step budget exceeded');
    return request;
  }
  function pack(request){
    checked(request);
    var c=request.controls||{},p=request.profileOptions||{};
    var settings=benchmark.config({count:request.targets.length,steps:1,
      step:c.step===undefined?50:c.step,geometry:request.geometry,
      atmosphere:request.atmosphere,radius:request.radius,observerHeight:request.observerHeight,
      refractivity:p.refractivity===undefined?0.000293:p.refractivity,
      scaleHeight:p.scaleHeight===undefined?7350:p.scaleHeight,
      occlusionRadius:p.occlusionRadius===undefined?6371000:p.occlusionRadius});
    var maxX=Math.max.apply(null,request.targets.map(function(t){return t[0];}));
    settings[1]=Math.min(MAX_STEPS,Math.ceil(maxX/(c.step===undefined?50:c.step)*8)+16);
    var packed=new Uint32Array(16);packed.set(settings);
    packed[9]=SAMPLES;packed[10]=bits(0.20);
    packed[11]=bits(Math.max(0.00001,c.targetTolerance===undefined?1e-6:c.targetTolerance));
    packed[12]=28;packed[13]=c.eventSubsteps===undefined?8:c.eventSubsteps;
    packed[14]=bits(c.contactTolerance===undefined?1e-6:c.contactTolerance);
    packed[15]=bits(Math.max(0.001,(c.step===undefined?50:c.step)*0.01));
    var input=new Float32Array(request.targets.length*4);
    request.targets.forEach(function(t,i){input.set([t[0],t[1],request.observerHeight,
      Math.atan2(t[1]-request.observerHeight,t[0])],i*4);});
    return {input:input,config:packed};
  }
  function decode(request,data){
    if(!(data instanceof Float32Array)||data.length!==request.targets.length*12)
      throw Error('GPU result buffer length mismatch');
    var results=request.targets.map(function(target,i){
      var b=i*12,angle=data[b],residual=data[b+1],length=data[b+2],status=data[b+3],
        impact=data[b+4],contact=data[b+5],valid=data[b+6];
      var failure=function(reason){return {target:target.slice(),status:'solver_failed',
        angle:null,residual:null,pathLength:null,ground:null,reason:reason};};
      if(!Number.isFinite(status)||!Number.isInteger(status)||status<1||status>3||valid!==1)
        return failure('No bracket or no numerically resolved GPU arrival');
      if(![angle,residual,length,impact,contact].every(Number.isFinite)||
          !(Math.abs(angle)<Math.PI/2)||length<=0)
        return failure('Invalid GPU numeric output');
      var event=impact>=0?{kind:'ground',contact:contact===1?'crossing':'grazing',pathLength:impact}:null;
      if(impact>=0&&contact!==1&&contact!==2)return failure('Unrecognized GPU ground contact');
      var statusName=['','visible','blocked','indeterminate'][status];
      var ground={hitGround:event!==null,travelled:event?impact:length,event:event};
      if(status===2&&(!event||contact!==1||impact>=length-1e-6))
        return failure('No prior crossing evidence for blockage');
      if(status===1&&event)return failure('Uncertified ground event on visible ray');
      return {target:target.slice(),status:statusName,angle:angle,residual:residual,
        pathLength:length,ground:ground,
        reason:status===3?'GPU first-contact/grazing requires qualification':null};
    });
    return contract.validateResponse(request,{backend:'gpu-experimental',
      branch:contract.BRANCH,results:results});
  }
  // Raw shader audit fields are separate from the strict #140.11 result
  // contract. The shader writes these into previously unused vec4 slots.
  function decodeTelemetry(request,data){
    checked(request);
    if(!(data instanceof Float32Array)||data.length!==request.targets.length*12)
      throw Error('GPU telemetry buffer length mismatch');
    return request.targets.map(function(target,i){
      var offset=i*12,bracket=data[offset+8],lo=data[offset+10],hi=data[offset+11];
      return {targetIndex:i,bracketIndex:bracket,bracketCount:data[offset+7],
        refineIterations:data[offset+9],
        finalBracketLowRadians:bracket>=0?lo:null,
        finalBracketHighRadians:bracket>=0?hi:null,
        finalBracketWidthRadians:bracket>=0?Math.abs(hi-lo):null,
        rawStatusCode:data[offset+3],rawArrivalValid:data[offset+6],
        rawGroundContactCode:data[offset+5]};
    });
  }
  // #140.12.1: optional diagnostic-only repeat measurements re-use the SAME
  // device, pipelines and buffers. Default remains the original single run.
  async function solveBatch(request,deps,options){
    checked(request);deps=deps||{};options=options||{};
    var warmRepeats=options.warmRepeats===undefined?0:options.warmRepeats;
    if(!Number.isInteger(warmRepeats)||warmRepeats<0||warmRepeats>5)
      throw RangeError('Diagnostic repeat count must be an integer from 0 to 5');
    var nav=deps.navigator||((typeof navigator!=='undefined')?navigator:null);
    if(!nav||!nav.gpu||!nav.gpu.requestAdapter)throw Error('WebGPU unavailable');
    var usage=deps.GPUBufferUsage||((typeof GPUBufferUsage!=='undefined')?GPUBufferUsage:null);
    var mapMode=deps.GPUMapMode||((typeof GPUMapMode!=='undefined')?GPUMapMode:null);
    if(!usage||!mapMode)throw Error('GPU buffer constants unavailable');
    var prepared=pack(request),start=now(),adapter=await nav.gpu.requestAdapter();
    if(!adapter)throw Error('No WebGPU adapter');
    var device=await adapter.requestDevice(),buffers=[];
    function alloc(size,flags){
      var result=device.createBuffer({size:size,usage:flags});buffers.push(result);return result;
    }
    try{
      var modules=[WGSL_SWEEP,WGSL_REFINE].map(function(code){return device.createShaderModule({code:code});});
      for(var module of modules){
        if(module.getCompilationInfo){
          var info=await module.getCompilationInfo(),errors=info.messages.filter(function(m){return m.type==='error';});
          if(errors.length)throw Error('GPU shooting WGSL compilation failed: '+errors.map(function(e){return e.message;}).join('; '));
        }
      }
      var pipelines=[];
      for(var shaderModule of modules)pipelines.push(await device.createComputePipelineAsync({layout:'auto',compute:{module:shaderModule,entryPoint:'main'}}));
      var setupMs=now()-start;
      var inputSize=prepared.input.byteLength,scanSize=request.targets.length*SAMPLES*16,
        outputSize=request.targets.length*3*16;
      if([inputSize,scanSize,outputSize].some(function(v){return v>device.limits.maxStorageBufferBindingSize;}))
        throw Error('WebGPU storage binding limit exceeded');
      var seeds=alloc(inputSize,usage.STORAGE|usage.COPY_DST),
        config=alloc(prepared.config.byteLength,usage.STORAGE|usage.COPY_DST),
        scan=alloc(scanSize,usage.STORAGE|usage.COPY_SRC),
        output=alloc(outputSize,usage.STORAGE|usage.COPY_SRC),
        read=alloc(outputSize,usage.COPY_DST|usage.MAP_READ);
      var bindings=[
        device.createBindGroup({layout:pipelines[0].getBindGroupLayout(0),entries:[
          {binding:0,resource:{buffer:seeds}},{binding:1,resource:{buffer:scan}},
          {binding:2,resource:{buffer:config}}]}),
        device.createBindGroup({layout:pipelines[1].getBindGroupLayout(0),entries:[
          {binding:0,resource:{buffer:seeds}},{binding:1,resource:{buffer:output}},
          {binding:2,resource:{buffer:config}},{binding:3,resource:{buffer:scan}}]})];
      var firstRaw=null,firstMs=null,warmMs=[],warmStable=true;
      for(var repeat=0;repeat<=warmRepeats;repeat++){
        var began=now();
        device.queue.writeBuffer(seeds,0,prepared.input);
        device.queue.writeBuffer(config,0,prepared.config);
        var encoder=device.createCommandEncoder();
        for(var i=0;i<2;i++){
          var pass=encoder.beginComputePass();pass.setPipeline(pipelines[i]);pass.setBindGroup(0,bindings[i]);
          pass.dispatchWorkgroups(Math.ceil(request.targets.length*(i===0?SAMPLES:1)/64));pass.end();
        }
        encoder.copyBufferToBuffer(output,0,read,0,outputSize);
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(mapMode.READ);
        var current=new Float32Array(read.getMappedRange().slice(0));read.unmap();
        var elapsed=now()-began;
        if(repeat===0){firstRaw=current;firstMs=elapsed;}
        else{
          warmMs.push(elapsed);
          var aBytes=new Uint32Array(firstRaw.buffer),bBytes=new Uint32Array(current.buffer);
          for(var index=0;index<aBytes.length;index++){
            if(aBytes[index]!==bBytes[index]){warmStable=false;break;}
          }
        }
      }
      var sorted=warmMs.slice().sort(function(a,b){return a-b;});
      var middle=Math.floor(sorted.length/2);
      var median=!sorted.length?null:sorted.length%2?sorted[middle]:
        (sorted[middle-1]+sorted[middle])/2;
      return {response:decode(request,firstRaw),telemetry:decodeTelemetry(request,firstRaw),
        timing:{gpuSetupMs:setupMs,gpuUploadToReadbackMs:firstMs,
          gpuColdMs:setupMs+firstMs,warmRunMs:warmMs,
          gpuWarmMedianMs:median,warmOutputBitwiseStable:warmStable},
        algorithm:{sampleAngles:SAMPLES,refineIterations:28,
          branch:contract.BRANCH,productionAuthorized:false},
        device:{adapterInfo:adapter.info?{vendor:adapter.info.vendor||'',architecture:adapter.info.architecture||''}:null}};
    }finally{buffers.forEach(function(b){b.destroy();});if(device.destroy)device.destroy();}
  }
  function decision(reports){
    if(!reports||!reports.length||reports.some(function(r){return !r||r.status!=='measured';}))
      return {verdict:'INCONCLUSIVE',productionAuthorized:false,
        nextAction:'GPU execution/measurement unavailable; retain CPU'};
    var mismatch=reports.some(function(r){return !r.comparison.sampleMatches;});
    var speed=reports.every(function(r){return r.timing.coldSpeedup>=2;});
    return {verdict:mismatch?'BATCH_NUMERICAL_STOP':speed?'BATCH_STAGE_PASS_ONLY':'BATCH_PERFORMANCE_STOP',
      productionAuthorized:false,thresholdColdSpeedup:2,
      nextAction:mismatch?'GPU shooting failed CPU parity; retain CPU':
        speed?'Batch stage passed; qualify complete scene before integration':
          'Independent GPU batch did not reach the 2x cold gate; retain CPU'};
  }
  function fixtureRequests(fixture){
    sceneSpike.validateFixture(fixture);
    return fixture.scenes.map(function(s){return {id:s.id,request:{branch:contract.BRANCH,
      geometry:s.geometry,radius:s.radius,observerHeight:s.observerHeight,
      atmosphere:s.atmosphere,controls:{step:50,targetTolerance:0.005,eventSubsteps:8},
      targets:sceneSpike.targets(s)}};});
  }
  async function run(fixture,deps){
    var entries=fixtureRequests(fixture),reports=[];
    for(var entry of entries){
      var started=now(),cpu=await contract.solveCpuBatch(entry.request),cpuMs=now()-started;
      try{
        var gpu=await solveBatch(entry.request,deps);
        var cmp=contract.compare(entry.request,cpu,gpu.response);
        reports.push({id:entry.id,status:'measured',count:entry.request.targets.length,
          cpuMs:cpuMs,timing:Object.assign({coldSpeedup:cpuMs/gpu.timing.gpuColdMs},gpu.timing),
          comparison:cmp,gpuStatusCounts:gpu.response.results.reduce(function(acc,r){
            acc[r.status]=(acc[r.status]||0)+1;return acc;},{}),device:gpu.device});
      }catch(error){reports.push({id:entry.id,status:'unavailable',count:entry.request.targets.length,
        cpuMs:cpuMs,reason:String(error.message||error)});}
    }
    return {version:'140.12',status:reports.every(function(r){return r.status==='measured';})?'finished':'incomplete',
      experiment:'Independent GPU sweep + bracketed root refinement + on-GPU ground sampling',
      scenes:reports,decision:decision(reports),limitations:[
        'Separate experimental solver; CPU batch is measured independently and never called to certify GPU output',
        'Finite 33-angle sweep does not establish complete multipath search or tangent root capture',
        'GPU event sampling is bounded and not equivalent to the full CPU grazing/contact finder',
        'f32 accuracy and fixed 0.005 m stage tolerance must pass strict CPU parity, not assumed',
        'Cold stage excludes full adaptive scene composition, painter and caching',
        'No production backend switch or authorization']};
  }
  return Object.freeze({WGSL_SWEEP:WGSL_SWEEP,WGSL_REFINE:WGSL_REFINE,
    checked:checked,pack:pack,decode:decode,decodeTelemetry:decodeTelemetry,solveBatch:solveBatch,
    fixtureRequests:fixtureRequests,decision:decision,run:run});
}));
