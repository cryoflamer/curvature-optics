/* #140.12.30: fixed-angle Bouguer target-polar precision recheck.
 * Reuse #140.12.27's 256-node f32 quadrature without modifying its integrand.
 * Only the target angle and (for DS) its low-limb margin subtraction change.
 * Research / non-certified. GPU angles are obtained before any CPU reference.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureBouguerInvariant141227'):root.CurvatureBouguerInvariant141227,
    typeof module==='object'&&module.exports?
    require('./CurvatureGpuPrecisionFoundation141228'):root.CurvatureGpuPrecisionFoundation141228,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuBouguerPrecision141230=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(bouguer,arithmetic,gpu){
  'use strict';
  if(!bouguer||!arithmetic||!gpu)throw Error('Bouguer precision dependencies unavailable');
  var VERSION='140.12.30',MODES=['direct_f32','classic_ds','integer_residual_ds'];
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  // Use *one* original f32 Bouguer shader body. In every variant, logB,
  // integrand, compensation, and 256 midpoint nodes are byte-identical to
  // #140.12.27. The only changed arithmetic is the target polar angle and
  // low-part contribution to the final polar difference.
  function wgsl(mode){
    if(!MODES.includes(mode))throw RangeError('Unknown Bouguer precision mode');
    var index=MODES.indexOf(mode),s=bouguer.WGSL;
    var originalAngle='let theta=atan2(k*t.x,1.0+k*t.y);';
    var replacement=`let d=precise.data[i];
  var theta=d.x*k;
  var thetaLo=0.0;
  if(MODE!=0u){
    let polar=dsDiv(ds(d.x,d.y),ds(d.z,d.w));
    theta=polar.hi;
    thetaLo=polar.lo;
  }`;
    if(!s.includes(originalAngle)||!s.includes('(theta-phi)/k'))
      throw Error('Original Bouguer WGSL has changed: audited substitutions invalid');
    s=s.replace('struct Rays { data: array<vec4f> }',
      'struct Rays { data: array<vec4f> }\nconst MODE:u32='+index+'u;\n'+arithmetic.HELPERS);
    s=s.replace('@group(0) @binding(2) var<storage, read> config: array<u32>;',
      '@group(0) @binding(2) var<storage, read> config: array<u32>;\n'+
      '@group(0) @binding(3) var<storage, read> precise: Rays;\n'+
      '@group(0) @binding(4) var<storage, read_write> angleLows: array<f32>;');
    s=s.replace(originalAngle,replacement);
    s=s.replace('(theta-phi)/k','((theta-phi)+thetaLo)/k');
    s=s.replace('  let half=sin(0.5*t.w);','  angleLows[i]=thetaLo;\n  let half=sin(0.5*t.w);');
    return s;
  }
  function input(coordinates,radius){
    if(!Array.isArray(coordinates)||coordinates.length<1||coordinates.length>1024||
       !Number.isFinite(radius)||radius<=0)throw RangeError('Invalid Bouguer target coordinates/radius');
    var r=arithmetic.split64(radius),out=new Float32Array(coordinates.length*4);
    coordinates.forEach(function(v,i){
      if(!v||!Number.isFinite(v.distanceMetres)||v.distanceMetres<=0||
         !Number.isFinite(v.heightMetres)||v.heightMetres<0)
        throw RangeError('Invalid Bouguer target distance/height');
      var d=arithmetic.split64(v.distanceMetres);
      out.set([d[0],d[1],r[0],r[1]],i*4);
    });
    return out;
  }
  function decode(request,angles,raw,lows){
    if(!(lows instanceof Float32Array)||lows.length!==angles.length)
      throw RangeError('Bouguer target-angle low-part readback mismatch');
    return bouguer.decode(request,angles,raw).map(function(trace,i){
      if(!Number.isFinite(lows[i]))throw RangeError('Invalid Bouguer GPU target-angle low limb');
      return Object.assign({},trace,{targetPolarAngleHighRadians:trace.targetPolarAngleRadians,
        targetPolarAngleLowRadians:lows[i],
        targetPolarAngleRadians:trace.targetPolarAngleRadians+lows[i]});
    });
  }
  async function createSession(capacity,deps){
    if(!Number.isInteger(capacity)||capacity<1||capacity>1024)
      throw RangeError('Bouguer precision capacity 1..1024');
    deps=deps||{};
    var nav=deps.navigator||(typeof navigator!=='undefined'?navigator:null),
      usage=deps.GPUBufferUsage||(typeof GPUBufferUsage!=='undefined'?GPUBufferUsage:null),
      mapMode=deps.GPUMapMode||(typeof GPUMapMode!=='undefined'?GPUMapMode:null);
    if(!nav||!nav.gpu||!usage||!mapMode)throw Error('WebGPU Bouguer precision unavailable');
    var adapter=await nav.gpu.requestAdapter();
    if(!adapter)throw Error('No Bouguer precision adapter');
    var device=await adapter.requestDevice(),buffers=[],closed=false,pipelines={};
    function alloc(size,flags){var b=device.createBuffer({size:size,usage:flags});buffers.push(b);return b;}
    function close(){if(closed)return;closed=true;buffers.forEach(function(b){b.destroy();});if(device.destroy)device.destroy();}
    try{
      for(var mode of MODES){
        var module=device.createShaderModule({code:wgsl(mode)});
        if(module.getCompilationInfo){
          var info=await module.getCompilationInfo(),errors=info.messages.filter(function(m){return m.type==='error';});
          if(errors.length)throw Error('Bouguer precision '+mode+' WGSL: '+errors.map(function(e){return e.message;}).join('; '));
        }
        pipelines[mode]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});
      }
      if(capacity*16>device.limits.maxStorageBufferBindingSize)throw Error('Bouguer precision storage limit');
      var seeds=alloc(capacity*16,usage.STORAGE|usage.COPY_DST),
        config=alloc(64,usage.STORAGE|usage.COPY_DST),
        precise=alloc(capacity*16,usage.STORAGE|usage.COPY_DST),
        results=alloc(capacity*16,usage.STORAGE|usage.COPY_SRC),
        read=alloc(capacity*16,usage.COPY_DST|usage.MAP_READ),
        lows=alloc(capacity*4,usage.STORAGE|usage.COPY_SRC),
        readLows=alloc(capacity*4,usage.COPY_DST|usage.MAP_READ),binds={};
      MODES.forEach(function(mode){
        binds[mode]=device.createBindGroup({layout:pipelines[mode].getBindGroupLayout(0),entries:[
          {binding:0,resource:{buffer:seeds}},{binding:1,resource:{buffer:results}},
          {binding:2,resource:{buffer:config}},{binding:3,resource:{buffer:precise}},
          {binding:4,resource:{buffer:lows}}]});
      });
      async function solve(request,angles,coordinates){
        if(closed)throw Error('Bouguer precision session closed');
        bouguer.options(request);
        var n=request.targets.length;
        if(n>capacity||!Array.isArray(angles)||angles.length!==n||
           !angles.every(function(a){return Number.isFinite(a)&&Math.abs(a)<1.45;})||
           !Array.isArray(coordinates)||coordinates.length!==n)
          throw RangeError('Bouguer precision angles/coordinates must align');
        // Confirm that coordinates describe the exact request's spherical target,
        // preventing a false improvement from pairing unrelated distances.
        coordinates.forEach(function(c,i){
          var t=request.targets[i],theta=Math.atan2(t[0],request.radius+t[1]);
          if(!Number.isFinite(theta)||Math.abs(theta-c.distanceMetres/request.radius)*request.radius>1e-6)
            throw RangeError('Bouguer precision coordinate/target mismatch '+i);
        });
        var packed=gpu.pack(request),preciseInput=input(coordinates,request.radius),runs={};
        angles.forEach(function(a,i){packed.input[i*4+3]=a;});
        device.queue.writeBuffer(seeds,0,packed.input);
        device.queue.writeBuffer(config,0,packed.config);
        device.queue.writeBuffer(precise,0,preciseInput);
        for(var mode of MODES){
          var started=now(),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
          pass.setPipeline(pipelines[mode]);pass.setBindGroup(0,binds[mode]);
          pass.dispatchWorkgroups(Math.ceil(n/64));pass.end();
          encoder.copyBufferToBuffer(results,0,read,0,n*16);
          encoder.copyBufferToBuffer(lows,0,readLows,0,n*4);
          device.queue.submit([encoder.finish()]);
          await Promise.all([read.mapAsync(mapMode.READ),readLows.mapAsync(mapMode.READ)]);
          var raw=new Float32Array(read.getMappedRange(0,n*16).slice(0)),
            lowRaw=new Float32Array(readLows.getMappedRange(0,n*4).slice(0));
          read.unmap();readLows.unmap();
          runs[mode]={traces:decode(request,angles,raw,lowRaw),timing:{gpuDispatchToReadbackMs:now()-started,
            setupExcluded:true,includesReadback:true}};
        }
        return runs;
      }
      return Object.freeze({solve:solve,close:close});
    }catch(e){close();throw e;}
  }
  function event(g){return g.contactBeforeTarget===null?null:g.contactBeforeTarget;}
  function analyze(original,ladder,variants){
    if(!original||original.version!=='140.12.27'||!ladder||!ladder.request||
       !Array.isArray(ladder.coordinates)||!Array.isArray(original.perTargetResults)||
       original.perTargetResults.length!==48||ladder.coordinates.length!==48)
      throw RangeError('Bouguer precision requires complete #140.12.27 source');
    var R=ladder.request.radius,rows=[],summary={};
    var modes=['legacy_f32'].concat(MODES),runs=Object.assign({legacy_f32:{
      traces:original.perTargetResults.map(function(x){return x.gpuBouguer;}),
      timing:original.gpuBouguerTiming||null}},variants);
    modes.forEach(function(mode){
      var run=runs[mode];
      if(!run||!Array.isArray(run.traces)||run.traces.length!==48)
        throw RangeError('Missing Bouguer precision mode '+mode);
      var stats={cases:48,contactDisagreements:0,outside1cm:0,unresolved:0,
        maxAbsoluteTargetAngleErrorSurfaceMetres:0,maxAbsoluteGroundAngleErrorSurfaceMetres:0,
        maxAbsoluteMarginDifferenceMetres:0,changedClassificationFromLegacy:0,
        maxAbsoluteGroundAngleDeltaFromLegacyMetres:0};
      run.traces.forEach(function(g,i){
        var b=original.perTargetResults[i],legacy=original.perTargetResults[i].gpuBouguer,
          oracle=b.cpuF64Bouguer,ref=oracle.status==='before_target'?true:
            oracle.status==='unresolved'?null:false;
        if(!g||g.targetIndex!==i||g.angleRadians!==b.gpuAngleRadians)
          throw RangeError('Bouguer precision GPU angle/target mismatch '+mode+' '+i);
        var actual=event(g),old=event(legacy),disagree=ref!==null&&actual!==null&&ref!==actual,
          targetError=(g.targetPolarAngleRadians-oracle.targetPolarAngleRadians)*R,
          groundError=g.groundPolarAngleRadians===null||oracle.groundPolarAngleRadians===null?
            null:(g.groundPolarAngleRadians-oracle.groundPolarAngleRadians)*R,
          marginError=g.contactMarginSurfaceMetres===null||oracle.contactMarginSurfaceMetres===null?
            null:g.contactMarginSurfaceMetres-oracle.contactMarginSurfaceMetres,
          phiDelta=g.groundPolarAngleRadians===null||legacy.groundPolarAngleRadians===null?
            null:(g.groundPolarAngleRadians-legacy.groundPolarAngleRadians)*R;
        if(actual===null)stats.unresolved++;
        if(disagree){stats.contactDisagreements++;
          if(Math.abs(oracle.contactMarginSurfaceMetres||0)>.01)stats.outside1cm++;}
        if(actual!==old)stats.changedClassificationFromLegacy++;
        stats.maxAbsoluteTargetAngleErrorSurfaceMetres=Math.max(stats.maxAbsoluteTargetAngleErrorSurfaceMetres,Math.abs(targetError));
        if(groundError!==null)stats.maxAbsoluteGroundAngleErrorSurfaceMetres=Math.max(stats.maxAbsoluteGroundAngleErrorSurfaceMetres,Math.abs(groundError));
        if(marginError!==null)stats.maxAbsoluteMarginDifferenceMetres=Math.max(stats.maxAbsoluteMarginDifferenceMetres,Math.abs(marginError));
        if(phiDelta!==null)stats.maxAbsoluteGroundAngleDeltaFromLegacyMetres=Math.max(stats.maxAbsoluteGroundAngleDeltaFromLegacyMetres,Math.abs(phiDelta));
        rows.push({mode:mode,targetIndex:i,distanceMetres:ladder.coordinates[i].distanceMetres,
          heightMetres:ladder.coordinates[i].heightMetres,gpuAngleRadians:b.gpuAngleRadians,
          cpuF64AngleRadians:b.cpuF64Bouguer.angleRadians,
          sourceGPUStatus:b.gpuShootingStatus,cpuShootingStatus:b.cpuShootingStatus,
          gpu:g,cpuF64Bouguer:oracle,cpuF64Quadrature256:b.cpuF64Quadrature256,
          targetAngleErrorSurfaceMetres:targetError,groundAngleErrorSurfaceMetres:groundError,
          marginDifferenceFromF64Metres:marginError,groundAngleDeltaFromLegacyMetres:phiDelta,
          contactDisagreement:disagree,classificationChangedFromLegacy:actual!==old});
      });
      stats.timing=run.timing||null;
      summary[mode]=stats;
    });
    return {version:VERSION,kind:'fixed GPU-angle Bouguer target-angle precision recheck',
      assumptions:original.assumptions,geometry:'globe',modes:modes,
      targets:48,quadratureNodes:bouguer.GPU_NODES,
      gpuAnglesFrom:'One independent GPU predictor batch, shared unchanged by all four modes',
      control:'legacy_f32 reproduces #140.12.27 exactly; the other GPU modes use precisely the same 256-node f32 Bouguer integrand',
      precisionScope:'direct_f32: GPU d_hi*(f32 1/R); DS: GPU hi+lo distance / hi+lo radius and low-limb target-minus-f32-ground margin. No DS quadrature or DS atmosphere.',
      gpuAngleLowLimbCaveat:'Both WGSL target angle limbs are read back independently; target-angle error includes hi+lo. The f32 ground angle and final margin arithmetic remain f32.',
      cpuReference:'CPU f64 2048-node invariant and independent CPU same-angle RK4 from the original audit',
      timingCaveat:'Sequential dispatch/readback wall times, including CPU scheduling; not GPU-only kernel timing',
      summary:summary,nearSurfaceCases:rows.filter(function(r){return r.distanceMetres<=1250&&r.heightMetres<=.000001;}),
      perCase:rows,cpuReferenceAfterGpu:true,framePaintingChanged:false,
      shootingChanged:false,cpuShootingFallback:false,contactClassificationsChanged:false,
      productionAuthorized:false};
  }
  return Object.freeze({VERSION:VERSION,MODES:MODES,wgsl:wgsl,input:input,
    decode:decode,createSession:createSession,analyze:analyze});
}));
