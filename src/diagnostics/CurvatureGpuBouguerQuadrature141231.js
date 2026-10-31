/* #140.12.31: independent GPU Bouguer quadrature-precision audit.
 * The same predictor f32 angles drive every variant. DS variants extend
 * precision to the invariant, local atmosphere, quadrature and contact margin;
 * they are bounded polynomial approximations, not IEEE f64 or certified rays.
 * No production optics, shooting, classification or painting is modified.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureBouguerInvariant141227'):root.CurvatureBouguerInvariant141227,
    typeof module==='object'&&module.exports?
    require('./CurvatureGpuPrecisionFoundation141228'):root.CurvatureGpuPrecisionFoundation141228,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412,
    typeof module==='object'&&module.exports?
    require('./CurvatureGpuBouguerPrecision141230'):root.CurvatureGpuBouguerPrecision141230);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuBouguerQuadrature141231=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(bouguer,precision,gpu,oldPrecision){
  'use strict';
  if(!bouguer||!precision||!gpu||!oldPrecision)throw Error('Bouguer quadrature dependencies unavailable');
  var VERSION='140.12.31',NODES=[128,256,512],ARITHMETIC=['classic_ds','integer_residual_ds'],
    MODES=ARITHMETIC.flatMap(function(a){return NODES.map(function(n){return a+'_'+n;});});
  function selectedArithmetic(options){return options&&options.includeIntegerResidual?ARITHMETIC.slice():['classic_ds'];}
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function environment(request){
    var p=bouguer.options(request),limit=200;
    // Polynomial domains are deliberately narrower than the base Bouguer
    // model. An unsupported atmosphere/height must FAIL, not quietly use f32.
    if(p.h0>limit||p.H<100||p.N>0.01||p.R<1e5)
      throw RangeError('DS quadrature polynomial domain exceeded');
    return p;
  }
  function packedConstants(request){
    var p=environment(request),out=new Float32Array(8),r=precision.split64(p.R),
      h=precision.split64(p.h0),n=precision.split64(p.N),scale=precision.split64(p.H);
    out.set([r[0],r[1],h[0],h[1],n[0],n[1],scale[0],scale[1]]);
    return out;
  }
  // DS elementary functions use small, explicitly bounded arguments.
  // h/R <= .002, h/H <= 2, but this diagnostic further restricts h/H
  // to <= 0.02 for its finite exp series. This is checked on the CPU.
  // |angle/2| <= 0.25 so the sin polynomial error is well below f32 ulps.
  var MATH=`
fn dsLessOrEqualZero(x:DS)->bool{return x.hi<0.0 || (x.hi==0.0 && x.lo<=0.0);}
fn dsPositive(x:DS)->bool{return x.hi>0.0 || (x.hi==0.0 && x.lo>0.0);}
fn dsLog1pSmall(x:DS)->DS {
  // log(1+x) = 2 * sum_{k=0}^6 q^(2k+1)/(2k+1), q=x/(2+x).
  // |x| <= .14 in this diagnostic; next term below ~ 1e-18.
  let q=dsDiv(x,dsAdd(ds(2.0,0.0),x));
  let q2=dsMul(q,q);
  var term=q;
  var sum=q;
  for(var j=1u;j<=6u;j=j+1u){
    term=dsMul(term,q2);
    sum=dsAdd(sum,dsDiv(term,ds(f32(2u*j+1u),0.0)));
  }
  return dsMul(sum,ds(2.0,0.0));
}
fn dsOneMinusExpNeg(x:DS)->DS {
  // 1-exp(-x), ten terms; |x|<=.02.
  var term=x;
  var sum=x;
  for(var j=2u;j<=10u;j=j+1u){
    term=dsDiv(dsMul(dsNeg(term),x),ds(f32(j),0.0));
    sum=dsAdd(sum,term);
  }
  return sum;
}
fn dsExpm1Small(x:DS)->DS {
  // exp(x)-1, sixteen terms; 0<x<.28 in this domain.
  var term=x;
  var sum=x;
  for(var j=2u;j<=16u;j=j+1u){
    term=dsDiv(dsMul(term,x),ds(f32(j),0.0));
    sum=dsAdd(sum,term);
  }
  return sum;
}
fn dsSinHalf(angle:f32)->DS {
  let x=ds(0.5*angle,0.0);
  let x2=dsMul(x,x);
  var term=x;
  var sum=x;
  for(var j=1u;j<=6u;j=j+1u){
    term=dsDiv(dsNeg(dsMul(term,x2)),ds(f32((2u*j)*(2u*j+1u)),0.0));
    sum=dsAdd(sum,term);
  }
  return sum;
}
fn dsLogF(h:DS,invR:DS,n:DS,scale:DS)->DS {
  let geometry=dsLog1pSmall(dsMul(h,invR));
  if(VACUUM){return geometry;}
  let fall=dsOneMinusExpNeg(dsDiv(h,scale));
  let correction=dsDiv(dsNeg(dsMul(n,fall)),dsAdd(ds(1.0,0.0),n));
  return dsAdd(geometry,dsLog1pSmall(correction));
}
`;
  // #140.12.31.3: specialize the common DS arithmetic once at source level.
  // Import the ORIGINAL definitions, without forking numerical formulas, but
  // exclude unused integer/benchmark functions from classic shaders and
  // exclude unused classic/benchmark functions from integer shaders.
  // Crucially, twoSum/twoProd have no MODE-dependent branch in the output.
  function isolatedHelper(name){
    var source=precision.HELPERS,match=source.match(new RegExp('(?:^|\\n)fn '+name+'\\('));
    if(!match)throw Error('Missing DS arithmetic helper '+name);
    var start=match.index+(match[0][0]==='\n'?1:0),next=source.indexOf('\nfn ',start+3);
    return source.slice(start,next<0?source.length:next).trim();
  }
  function arithmeticHelpers(mode){
    var integer=mode.startsWith('integer_residual_ds');
    var dependencies=integer?[
      'u64add','u64neg','u64sub','u64shift','u64shr','u64bits',
      'fexp','fsig','packAligned','residualToF32','normal']:[];
    var sum=integer?'intTwoSum':'classicTwoSum',prod=integer?'intTwoProd':'classicTwoProd';
    return ['struct DS { hi:f32, lo:f32 }',isolatedHelper('ds')]
      .concat(dependencies.map(isolatedHelper))
      .concat([isolatedHelper(sum).replace('fn '+sum+'(', 'fn twoSum('),
        isolatedHelper(prod).replace('fn '+prod+'(', 'fn twoProd(')])
      .concat(['dsAdd','dsNeg','dsSub','dsMul','dsDiv','dsSqrt'].map(isolatedHelper))
      .join('\n');
  }
  function wgsl(mode){
    if(!MODES.includes(mode))throw RangeError('Unknown Bouguer quadrature mode');
    return `struct Rays { data:array<vec4f> }
@group(0) @binding(0) var<storage,read> seeds:Rays;
@group(0) @binding(1) var<storage,read> constants:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> results:Rays;
@group(0) @binding(3) var<storage,read> config:array<u32>;
@group(0) @binding(4) var<storage,read> arcs:Rays;
// Node count is supplied in config[1], allowing one pipeline per arithmetic.
const VACUUM:bool=false;
${arithmeticHelpers(mode)}
${MATH}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;
  if(i>=config[0]){return;}
  let nodeCount=config[1];
  let t=seeds.data[i];
  let a=constants[0];
  let b=constants[1];
  let radius=ds(a.x,a.y);
  let height=ds(a.z,a.w);
  let refractivity=ds(b.x,b.y);
  let scale=ds(b.z,b.w);
  let inverseRadius=dsDiv(ds(1.0,0.0),radius);
  let arc=arcs.data[i];
  let theta=dsDiv(ds(arc.x,arc.y),radius);
  let half=dsSinHalf(t.w);
  let cosTerm=dsMul(ds(-2.0,0.0),dsMul(half,half));
  let logB=dsAdd(dsLogF(height,inverseRadius,refractivity,scale),dsLog1pSmall(cosTerm));
  var flag=1.0;
  var phi=ds(0.0,0.0);
  var margin=ds(0.0,0.0);
  if(t.w>=0.0 || dsPositive(logB)){
    flag=2.0;
  } else {
    var sum=ds(0.0,0.0);
    for(var j=0u;j<nodeCount;j=j+1u){
      // This midpoint is exactly representable in f32 at 128/256/512.
      let u=ds((f32(j)+0.5)/f32(nodeCount),0.0);
      let h=dsMul(height,dsMul(u,u));
      let z=dsMul(ds(2.0,0.0),dsSub(dsLogF(h,inverseRadius,refractivity,scale),logB));
      if(dsLessOrEqualZero(z)){
        flag=0.0;
        break;
      }
      let radicand=dsExpm1Small(z);
      if(dsLessOrEqualZero(radicand)){
        flag=0.0;
        break;
      }
      let numerator=dsMul(dsMul(ds(2.0,0.0),dsMul(height,inverseRadius)),u);
      let denominator=dsMul(dsAdd(ds(1.0,0.0),dsMul(h,inverseRadius)),dsSqrt(radicand));
      sum=dsAdd(sum,dsDiv(numerator,denominator));
    }
    if(flag==1.0){
      phi=dsDiv(sum,ds(f32(nodeCount),0.0));
      margin=dsMul(dsSub(theta,phi),radius);
    }
  }
  // Three vec4f rows preserve BOTH limbs of every significant output.
  results.data[3u*i]=vec4f(flag,phi.hi,phi.lo,theta.hi);
  results.data[3u*i+1u]=vec4f(theta.lo,margin.hi,margin.lo,logB.hi);
  results.data[3u*i+2u]=vec4f(logB.lo,0.0,0.0,0.0);
}`.replace('const VACUUM:bool=false;', 'const VACUUM:bool=@VACUUM@;');
  }
  function shader(mode,request){
    var p=environment(request);
    if(p.h0/p.H>0.02)throw RangeError('DS quadrature requires observer height / scale height <= 0.02');
    return wgsl(mode).replace('@VACUUM@',request.atmosphere==='vacuum'?'true':'false');
  }
  function decode(request,angles,raw){
    if(!(raw instanceof Float32Array)||raw.length!==angles.length*12||
       angles.length!==request.targets.length)throw RangeError('Bouguer quadrature readback mismatch');
    return angles.map(function(angle,i){
      var j=12*i,v=Array.from(raw.slice(j,j+12));
      if(!v.every(Number.isFinite)||![0,1,2].includes(v[0]))
        throw RangeError('Non-finite Bouguer quadrature GPU result '+i);
      var flag=v[0],theta=v[3]+v[4],phi=flag===1?v[1]+v[2]:null,
        margin=flag===1?v[5]+v[6]:null;
      return {targetIndex:i,angleRadians:angle,
        phase:flag===0?'unresolved':flag===2?'no_ground':'ground_reachable',
        groundPolarAngleRadians:phi,groundPolarAngleLimbs:flag===1?[v[1],v[2]]:null,
        targetPolarAngleRadians:theta,targetPolarAngleLimbs:[v[3],v[4]],
        contactMarginSurfaceMetres:margin,contactMarginLimbs:flag===1?[v[5],v[6]]:null,
        contactBeforeTarget:flag===1?(v[5]>0||(v[5]===0&&v[6]>0)):flag===2?false:null,
        logBOverSurface:v[7]+v[8]};
    });
  }
  // Validate the actual fixed-angle inputs *before* creating expensive WGSL
  // pipelines. Outward rays never reach the ground and skip the quadrature;
  // the narrow polynomial domain only constrains inward rays.
  function validateSolveInputs(request,actual,angles,coordinates){
    var params=environment(request);environment(actual);
    if(params.h0/params.H>0.02)
      throw RangeError('DS quadrature requires observer height / scale height <= 0.02');
    if(actual!==request)throw RangeError('Bouguer quadrature request identity mismatch');
    var count=request.targets.length;
    if(!Array.isArray(angles)||angles.length!==count||
       !Array.isArray(coordinates)||coordinates.length!==count)
      throw RangeError('Bouguer quadrature angle/coordinate count mismatch');
    angles.forEach(function(a,i){
      if(!Number.isFinite(a)||Math.abs(a)>=1.45)
        throw RangeError('Bouguer quadrature invalid GPU angle at target '+i+': '+a);
      if(a<-.5)
        throw RangeError('Bouguer quadrature inward polynomial angle domain exceeded at target '+i+': '+a);
    });
    coordinates.forEach(function(c,i){
      var t=request.targets[i],theta=Math.atan2(t[0],request.radius+t[1]);
      if(!c||!Number.isFinite(c.distanceMetres)||!Number.isFinite(c.heightMetres)||
         Math.abs(request.radius*theta-c.distanceMetres)>1e-6)
        throw RangeError('Bouguer quadrature coordinate mismatch '+i);
    });
    return true;
  }
  async function createSession(request,deps,options){
    var p=environment(request);
    if(p.h0/p.H>0.02)throw RangeError('DS quadrature requires observer height / scale height <= 0.02');
    deps=deps||{};options=options||{};
    var arithmeticModes=selectedArithmetic(options),compilationTimings=[],
      inspectCompilation=options.inspectCompilation===undefined?!!options.includeIntegerResidual:!!options.inspectCompilation;
    function compileEvent(arithmetic,stage,elapsedMs,failed){
      var row={arithmetic:arithmetic,stage:stage,elapsedMs:elapsedMs};
      if(failed)row.failed=true;
      if(stage!=='start')compilationTimings.push(row);
      if(typeof options.onCompileProgress==='function')options.onCompileProgress(row);
    }
    var nav=deps.navigator||(typeof navigator!=='undefined'?navigator:null),
      usage=deps.GPUBufferUsage||(typeof GPUBufferUsage!=='undefined'?GPUBufferUsage:null),
      mapMode=deps.GPUMapMode||(typeof GPUMapMode!=='undefined'?GPUMapMode:null);
    if(!nav||!nav.gpu||!usage||!mapMode)throw Error('WebGPU Bouguer quadrature unavailable');
    var adapter=await nav.gpu.requestAdapter();
    if(!adapter)throw Error('No Bouguer quadrature adapter');
    var device=await adapter.requestDevice(),buffers=[],closed=false,pipelines={};
    function alloc(size,flags){var b=device.createBuffer({size:size,usage:flags});buffers.push(b);return b;}
    function close(){if(closed)return;closed=true;buffers.forEach(function(b){b.destroy();});if(device.destroy)device.destroy();}
    try{
      // Full comparison uses two programs; quick mode uses classic only.
      // Node counts vary by config[1] per dispatch, with no recompilation.
      for(var arithmetic of arithmeticModes){
        var mode=arithmetic+'_512',source=shader(mode,request);
        compileEvent(arithmetic,'start',0);
        var startModule=now(),module;
        try{module=device.createShaderModule({code:source});
          compileEvent(arithmetic,'createShaderModule',now()-startModule);
        }catch(error){compileEvent(arithmetic,'createShaderModule',now()-startModule,true);throw error;}
        if(module.getCompilationInfo&&inspectCompilation){
          var startInfo=now();
          try{
            var info=await module.getCompilationInfo(),errors=info.messages.filter(function(m){return m.type==='error';});
            if(errors.length)throw Error('Bouguer quadrature '+mode+' WGSL: '+errors.map(function(e){return e.message;}).join('; '));
            compileEvent(arithmetic,'getCompilationInfo',now()-startInfo);
          }catch(error){compileEvent(arithmetic,'getCompilationInfo',now()-startInfo,true);throw error;}
        }else{compileEvent(arithmetic,'getCompilationInfoSkipped',0);}
        var startPipeline=now();
        try{
          pipelines[arithmetic]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});
          compileEvent(arithmetic,'createComputePipelineAsync',now()-startPipeline);
        }catch(error){
          compileEvent(arithmetic,'createComputePipelineAsync',now()-startPipeline,true);
          // A successful pipeline creation already validates WGSL. Pay for a
          // separate detailed diagnostic pass only after a pipeline error.
          if(module.getCompilationInfo&&!inspectCompilation){
            var startedDiagnostics=now();
            try{
              var diagnostics=await module.getCompilationInfo();
              compileEvent(arithmetic,'getCompilationInfoOnFailure',now()-startedDiagnostics);
              var compilerErrors=diagnostics.messages.filter(function(m){return m.type==='error';});
              if(compilerErrors.length)throw Error('Bouguer quadrature '+mode+' WGSL: '+
                compilerErrors.map(function(e){return e.message;}).join('; '));
            }catch(diagnosticError){
              if(diagnosticError!==error){
                if(String(diagnosticError).includes('WGSL:'))throw diagnosticError;
                compileEvent(arithmetic,'getCompilationInfoOnFailure',now()-startedDiagnostics,true);
              }
            }
          }
          throw error;
        }
      }
      var count=request.targets.length;
      if(count<1||count>1024||count*48>device.limits.maxStorageBufferBindingSize)
        throw RangeError('Bouguer quadrature target/storage limit');
      var seeds=alloc(count*16,usage.STORAGE|usage.COPY_DST),
        arcs=alloc(count*16,usage.STORAGE|usage.COPY_DST),
        constants=alloc(32,usage.STORAGE|usage.COPY_DST),
        config=alloc(64,usage.STORAGE|usage.COPY_DST),
        output=alloc(count*48,usage.STORAGE|usage.COPY_SRC),
        read=alloc(count*48,usage.COPY_DST|usage.MAP_READ),binds={};
      arithmeticModes.forEach(function(arithmetic){binds[arithmetic]=device.createBindGroup({
        layout:pipelines[arithmetic].getBindGroupLayout(0),entries:[
          {binding:0,resource:{buffer:seeds}},{binding:1,resource:{buffer:constants}},
          {binding:2,resource:{buffer:output}},{binding:3,resource:{buffer:config}},
          {binding:4,resource:{buffer:arcs}}]});});
      async function solve(actual,angles,coordinates,onProgress){
        if(closed)throw Error('Bouguer quadrature session closed');
        validateSolveInputs(request,actual,angles,coordinates);
        var packed=gpu.pack(request);
        angles.forEach(function(a,i){packed.input[i*4+3]=a;});
        device.queue.writeBuffer(seeds,0,packed.input);
        device.queue.writeBuffer(constants,0,packedConstants(request));
        device.queue.writeBuffer(arcs,0,oldPrecision.input(coordinates,request.radius));
        var runs={};
        var activeModes=arithmeticModes.flatMap(function(a){return NODES.map(function(n){return a+'_'+n;});});
        for(var mode of activeModes){
          var arithmetic=mode.startsWith('classic_ds')?'classic_ds':'integer_residual_ds',
            nodeCount=Number(mode.split('_').at(-1)),
            modeConfig=new Uint32Array(packed.config);
          modeConfig[1]=nodeCount;
          device.queue.writeBuffer(config,0,modeConfig);
          var started=now(),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
          pass.setPipeline(pipelines[arithmetic]);pass.setBindGroup(0,binds[arithmetic]);
          pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();
          encoder.copyBufferToBuffer(output,0,read,0,count*48);
          device.queue.submit([encoder.finish()]);
          await read.mapAsync(mapMode.READ);
          var raw=new Float32Array(read.getMappedRange(0,count*48).slice(0));
          read.unmap();
          runs[mode]={traces:decode(request,angles,raw),timing:{
            gpuDispatchToReadbackMs:now()-started,setupExcluded:true,includesReadback:true}};
          if(typeof onProgress==='function')onProgress(mode,runs[mode].timing,activeModes.indexOf(mode)+1,activeModes.length);
        }
        return runs;
      }
      return Object.freeze({solve:solve,close:close,inspectCompilation:inspectCompilation,modes:Object.freeze(arithmeticModes.flatMap(function(a){return NODES.map(function(n){return a+'_'+n;});})),
        compilationTimings:compilationTimings});
    }catch(e){close();throw e;}
  }
  function event(g){return g.contactBeforeTarget===null?null:g.contactBeforeTarget;}
  function analyze(original,ladder,f32Control,variants){
    if(!original||original.version!=='140.12.27'||!ladder||!ladder.request||
       !Array.isArray(ladder.coordinates)||ladder.coordinates.length!==48||
       !Array.isArray(original.perTargetResults)||original.perTargetResults.length!==48||
       !f32Control||!Array.isArray(f32Control.traces)||f32Control.traces.length!==48)
      throw RangeError('Bouguer quadrature needs complete fixed-angle source and f32 control');
    var R=ladder.request.radius,rows=[],summary={},cpuConvergence=[],
      availableModes=MODES.filter(function(mode){return Object.prototype.hasOwnProperty.call(variants,mode);}),
      modes=['f32_quadrature_256'].concat(availableModes),runs=Object.assign({f32_quadrature_256:f32Control},variants);
    if(!NODES.every(function(n){return availableModes.includes('classic_ds_'+n);})||
       ![0,3].includes(availableModes.filter(function(mode){return mode.startsWith('integer_residual_ds_');}).length))
      throw RangeError('Incomplete Bouguer quadrature mode selection');
    original.perTargetResults.forEach(function(b,i){
      // Only CPU f64 references: these are evaluated after the GPU variants.
      var base=b.cpuF64Bouguer;
      cpuConvergence.push({targetIndex:i,distanceMetres:ladder.coordinates[i].distanceMetres,
        heightMetres:ladder.coordinates[i].heightMetres,
        cpu256:b.cpuF64Quadrature256,
        cpu128:bouguer.f64(ladder.request,b.gpuAngleRadians,ladder.request.targets[i],128),
        cpu512:bouguer.f64(ladder.request,b.gpuAngleRadians,ladder.request.targets[i],512),
        cpu2048:base});
    });
    modes.forEach(function(mode){
      var run=runs[mode];
      if(!run||!Array.isArray(run.traces)||run.traces.length!==48)
        throw RangeError('Missing Bouguer quadrature variant '+mode);
      var stats={cases:48,contactDisagreements:0,outside1cm:0,unresolved:0,
        maxAbsoluteTargetAngleErrorSurfaceMetres:0,maxAbsoluteGroundAngleErrorSurfaceMetres:0,
        maxAbsoluteMarginDifferenceMetres:0,changedClassificationFromF32:0};
      run.traces.forEach(function(g,i){
        var b=original.perTargetResults[i],oracle=b.cpuF64Bouguer,
          ref=oracle.status==='before_target'?true:oracle.status==='unresolved'?null:false,
          actual=event(g),old=event(f32Control.traces[i]);
        if(!g||g.targetIndex!==i||g.angleRadians!==b.gpuAngleRadians)
          throw RangeError('Bouguer quadrature GPU angle/target mismatch '+mode+' '+i);
        var targetError=(g.targetPolarAngleRadians-oracle.targetPolarAngleRadians)*R,
          groundError=g.groundPolarAngleRadians===null||oracle.groundPolarAngleRadians===null?
            null:(g.groundPolarAngleRadians-oracle.groundPolarAngleRadians)*R,
          marginError=g.contactMarginSurfaceMetres===null||oracle.contactMarginSurfaceMetres===null?
            null:g.contactMarginSurfaceMetres-oracle.contactMarginSurfaceMetres,
          disagreement=actual!==null&&ref!==null&&actual!==ref;
        if(actual===null)stats.unresolved++;
        if(disagreement){stats.contactDisagreements++;
          if(Math.abs(oracle.contactMarginSurfaceMetres||0)>.01)stats.outside1cm++;}
        if(actual!==old)stats.changedClassificationFromF32++;
        stats.maxAbsoluteTargetAngleErrorSurfaceMetres=Math.max(stats.maxAbsoluteTargetAngleErrorSurfaceMetres,Math.abs(targetError));
        if(groundError!==null)stats.maxAbsoluteGroundAngleErrorSurfaceMetres=Math.max(stats.maxAbsoluteGroundAngleErrorSurfaceMetres,Math.abs(groundError));
        if(marginError!==null)stats.maxAbsoluteMarginDifferenceMetres=Math.max(stats.maxAbsoluteMarginDifferenceMetres,Math.abs(marginError));
        rows.push({mode:mode,targetIndex:i,distanceMetres:ladder.coordinates[i].distanceMetres,
          heightMetres:ladder.coordinates[i].heightMetres,gpuAngleRadians:b.gpuAngleRadians,
          gpu:g,cpuF64Bouguer:oracle,cpuF64Quadrature256:b.cpuF64Quadrature256,
          targetAngleErrorSurfaceMetres:targetError,groundAngleErrorSurfaceMetres:groundError,
          marginDifferenceFromF64Metres:marginError,contactDisagreement:disagreement,
          changedClassificationFromF32:actual!==old});
      });
      stats.timing=run.timing||null;
      summary[mode]=stats;
    });
    return {version:VERSION,kind:'fixed-GPU-angle GPU Bouguer quadrature precision audit',
      assumptions:original.assumptions,geometry:'globe',modes:modes,targets:48,
      nodeCounts:NODES,arithmetic:['f32_integrand_DS_target','classic_ds'].concat(
        availableModes.includes('integer_residual_ds_128')?['integer_residual_ds']:[]),
      integerResidualEvaluated:availableModes.includes('integer_residual_ds_128'),
      precisionScope:'DS log-invariant and local exponential-atmosphere polynomial, DS integrand/accumulator/sqrt/division, DS d/R target and contact margin; bounded angle/height domain; no IEEE f64 or rigorous error bound',
      control:'f32_quadrature_256 is the unchanged #140.12.30 classic_ds target-angle variant with original #140.12.27 f32 Bouguer integrand',
      gpuAnglesFrom:'One independent GPU predictor batch, unchanged across all evaluated quadrature modes',
      cpuReference:'CPU f64 Bouguer 128,256,512,2048 and independent same-angle CPU RK4; CPU all run after GPU',
      timingCaveat:'Per-mode sequential dispatch/readback wall times include browser scheduling; not GPU-only kernel time',
      compilationCaveat:'Successful createComputePipelineAsync validates WGSL; quick mode skips eager getCompilationInfo, detailed diagnostics run on failure. Full mode times eager WGSL diagnostics and pipeline creation separately. All are host wall times, not GPU kernel times',
      summary:summary,nearSurfaceCases:rows.filter(function(r){return [60,350,1250,5400].includes(r.distanceMetres)&&r.heightMetres<=.000001;}),
      perCase:rows,cpuNodeConvergence:cpuConvergence,
      cpuReferenceAfterGpu:true,framePaintingChanged:false,shootingChanged:false,
      cpuShootingFallback:false,contactClassificationsChanged:false,productionAuthorized:false};
  }
  return Object.freeze({VERSION:VERSION,MODES:MODES,NODES:NODES,MATH:MATH,
    environment:environment,packedConstants:packedConstants,wgsl:wgsl,shader:shader,arithmeticHelpers:arithmeticHelpers,selectedArithmetic:selectedArithmetic,
    decode:decode,validateSolveInputs:validateSolveInputs,createSession:createSession,analyze:analyze});
}));
