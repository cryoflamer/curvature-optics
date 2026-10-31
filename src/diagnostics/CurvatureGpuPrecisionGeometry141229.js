/* #140.12.29: isolated Globe/Flat geometry and f64-to-double-single input audit.
 * The f32 baseline reproduces the normalized target atan2 in #140.12.27
 * using the actual curved-surface Cartesian target, not a tangent-plane proxy.
 * This does not modify the shooting solver, refraction, visibility, or paint.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureGpuPrecisionFoundation141228'):root.CurvatureGpuPrecisionFoundation141228,
    typeof module==='object'&&module.exports?
    require('../geometry/CurvatureSurfaceGeometry'):root.CurvatureSurfaceGeometry);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuPrecisionGeometry141229=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(arithmetic,surfaces){
  'use strict';
  if(!arithmetic||!surfaces)throw Error('Precision arithmetic / scene geometry unavailable');
  var VERSION='140.12.29',MODES=arithmetic.MODES;
  var DEFAULT_RADIUS=6371000,DEFAULT_ORIGIN=15000000.125;
  var DISTANCES=[60,350,1250,2100,3900,5400],HEIGHTS=[0,1e-6,.01,.1,1,5,20,50];
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function median(array){var a=array.slice().sort(function(x,y){return x-y;});return a.length?a[Math.floor(a.length/2)]:null;}
  function cases(){var out=[];DISTANCES.forEach(function(d){HEIGHTS.forEach(function(h){out.push({distance:d,height:h});});});return out;}
  function validate(rows,radius,origin){
    if(!Array.isArray(rows)||!rows.length||rows.length>1024)throw RangeError('Geometry rows 1..1024');
    if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(origin)||Math.abs(origin)>1e30)throw RangeError('Invalid geometry radius/origin');
    rows.forEach(function(r){if(!r||!Number.isFinite(r.distance)||r.distance<0||r.distance>100000||
      !Number.isFinite(r.height)||r.height<0||r.height>10000)throw RangeError('Invalid geometry row');
      // Forward-only arctangent series: the next omitted term bounds the
      // remainder only on this explicitly small-angle domain.
      if(r.distance/(radius+r.height)>=0.016)throw RangeError('Geometry angle exceeds bounded series domain');
    });
  }
  function packedInput(rows,radius,origin){
    radius=radius===undefined?DEFAULT_RADIUS:radius;
    origin=origin===undefined?DEFAULT_ORIGIN:origin;
    validate(rows,radius,origin);
    var data=new Float32Array(rows.length*16),r=arithmetic.split64(radius),o=arithmetic.split64(origin),
      sphere=surfaces.createFromCurvature(1/radius);
    rows.forEach(function(v,i){
      var d=arithmetic.split64(v.distance),h=arithmetic.split64(v.height);
      var absoluteHeight=arithmetic.split64(radius+v.height);
      var absoluteX=arithmetic.split64(origin+v.distance),target=sphere.surfacePoint2(v.distance,v.height),
        tx=arithmetic.split64(target[0]),ty=arithmetic.split64(target[1]);
      data.set([d[0],d[1],h[0],h[1],tx[0],tx[1],ty[0],ty[1],
        absoluteHeight[0],absoluteHeight[1],absoluteX[0],absoluteX[1],
        r[0],r[1],o[0],o[1]],i*16);
    });
    return data;
  }
  // The same double-single operation helpers as #140.12.28 are deliberately
  // reused. This tests a chained calculation rather than a fresh arithmetic
  // implementation that might silently hide its own failures.
  var COMPUTE=`
struct Rows { data: array<vec4f> }
@group(0) @binding(0) var<storage,read> inputs:Rows;
@group(0) @binding(1) var<storage,read_write> outputs:Rows;
@group(0) @binding(2) var<storage,read> config:array<u32>;
const MODE:u32=@MODE@u;
@HELPERS@
fn polarSeries(d:DS,r:DS)->DS {
  // Cartesian Globe angle atan2(targetX,R+targetY) = atan(targetX/(R+targetY)).
  // |d/(R+h)| < 0.016 here. The omitted term is bounded by |q|^7/7;
  // report the bound rather than treating this as a general atan routine.
  let q=dsDiv(d,r);
  let q2=dsMul(q,q);
  let q3=dsMul(q2,q);
  let q5=dsMul(q3,q2);
  return dsAdd(dsSub(q,dsDiv(q3,ds(3.0,0.0))),dsDiv(q5,ds(5.0,0.0)));
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;
  if(i>=config[0]){return;}
  let v=inputs.data[4u*i];
  let xy=inputs.data[4u*i+1u];
  let absolute=inputs.data[4u*i+2u];
  let constants=inputs.data[4u*i+3u];
  let distance=ds(v.x,v.y);
  let height=ds(v.z,v.w);
  let radius=ds(constants.x,constants.y);
  let origin=ds(constants.z,constants.w);
  let targetX=ds(xy.x,xy.y);
  let targetY=ds(xy.z,xy.w);
  let absoluteR=ds(absolute.x,absolute.y);
  let absoluteX=ds(absolute.z,absolute.w);
  // Reproduce the #140.12.27 normalized f32 atan2 separately from DS.
  let k=bitcast<f32>(config[2]);
  let oldAngle=atan2(k*xy.x,1.0+k*xy.z);
  let directArcF32=v.x/constants.x;
  let angleAtanF32=atan2(xy.x/(constants.x+xy.z),1.0);
  let radiusWithHeight=dsAdd(radius,height);
  let radiusWithTargetY=dsAdd(radius,targetY);
  let directArc=dsDiv(distance,radius);
  var cartesianAngle=polarSeries(targetX,radiusWithTargetY);
  // The high-level math is fixed. Warm repetitions perturb the input
  // slightly, keeping the geometry pipeline active during benchmark runs.
  for(var j=1u;j<config[1];j=j+1u){
    let changed=dsAdd(targetX,ds(f32(j)*0.0009765625,0.0));
    cartesianAngle=polarSeries(changed,radiusWithTargetY);
  }
  let localHeight=dsSub(radiusWithHeight,radius);
  let packedHeight=dsSub(absoluteR,radius);
  let localDistance=dsSub(dsAdd(origin,distance),origin);
  let packedDistance=dsSub(absoluteX,origin);
  outputs.data[4u*i]=vec4f(oldAngle,directArc.hi,directArc.lo,directArcF32);
  outputs.data[4u*i+1u]=vec4f(cartesianAngle.hi,cartesianAngle.lo,angleAtanF32,0.0);
  outputs.data[4u*i+2u]=vec4f(localHeight.hi,localHeight.lo,packedHeight.hi,packedHeight.lo);
  outputs.data[4u*i+3u]=vec4f(localDistance.hi,localDistance.lo,packedDistance.hi,packedDistance.lo);
}`;
  function wgsl(mode){
    if(!MODES.includes(mode))throw RangeError('Unknown geometry arithmetic mode');
    return COMPUTE.replace('@MODE@',String(MODES.indexOf(mode))).replace('@HELPERS@',arithmetic.HELPERS);
  }
  function decode(rows,raw){
    if(!(raw instanceof Float32Array)||raw.length!==rows.length*16)throw RangeError('Geometry readback length mismatch');
    return Array.from({length:rows.length},function(_,i){
      var j=i*16,s=Array.from(raw.slice(j,j+16));
      if(!s.every(Number.isFinite))throw RangeError('Invalid geometry GPU number '+i);
      return {normalizedAtan2F32:s[0],directPolarAngle:s[1]+s[2],directPolarAngleLimbs:[s[1],s[2]],
        directArcF32:s[3],cartesianPolarAngle:s[4]+s[5],cartesianPolarAngleLimbs:[s[4],s[5]],
        directAtan2F32:s[6],localHeight:s[8]+s[9],localHeightLimbs:[s[8],s[9]],
        packedAbsoluteHeight:s[10]+s[11],packedAbsoluteHeightLimbs:[s[10],s[11]],
        flatLocalDistance:s[12]+s[13],flatLocalDistanceLimbs:[s[12],s[13]],
        flatPackedDistance:s[14]+s[15],flatPackedDistanceLimbs:[s[14],s[15]]};
    });
  }
  function analyze(rows,runs,radius,origin){
    radius=radius===undefined?DEFAULT_RADIUS:radius;
    origin=origin===undefined?DEFAULT_ORIGIN:origin;
    validate(rows,radius,origin);
    var reports=[],summary={},source=[],maxAngleSeriesBoundMetres=0,
      sphere=surfaces.createFromCurvature(1/radius);
    rows.forEach(function(v,i){
      var da=arithmetic.split64(v.distance),dh=arithmetic.split64(v.height),
        absH=arithmetic.split64(radius+v.height),absX=arithmetic.split64(origin+v.distance);
      var t=sphere.surfacePoint2(v.distance,v.height);
      var ratio=t[0]/(radius+t[1]);
      var bound=radius*Math.pow(Math.abs(ratio),7)/7;
      maxAngleSeriesBoundMetres=Math.max(maxAngleSeriesBoundMetres,bound);
      source.push({index:i,distanceMetres:v.distance,heightMetres:v.height,
        distanceInputSplitErrorMetres:da[0]+da[1]-v.distance,
        heightInputSplitErrorMetres:dh[0]+dh[1]-v.height,
        absoluteRadiusInputErrorMetres:absH[0]+absH[1]-(radius+v.height),
        absoluteFlatInputErrorMetres:absX[0]+absX[1]-(origin+v.distance),
        prepackedHeightVsLocalMetres:absH[0]+absH[1]-radius-v.height,
        prepackedFlatVsLocalMetres:absX[0]+absX[1]-origin-v.distance,
        sceneCartesianTargetMetres:t,sceneCartesianPolarRadians:Math.atan2(t[0],radius+t[1]),
        arcPolarRadians:v.distance/radius});
    });
    MODES.forEach(function(mode){
      var run=runs[mode];
      if(!run||!Array.isArray(run.results)||run.results.length!==rows.length)
        throw RangeError('Missing geometry mode '+mode);
      var stats={cases:rows.length,maxAbsolutePolarErrorSurfaceMetres:0,
        maxAbsoluteDirectArcF32ErrorSurfaceMetres:0,
        maxAbsoluteCartesianPolarErrorSurfaceMetres:0,
        maxAbsoluteNormalizedAtan2ErrorSurfaceMetres:0,
        maxAbsoluteLocalHeightErrorMetres:0,maxAbsolutePackedHeightErrorMetres:0,
        maxAbsoluteFlatLocalErrorMetres:0,maxAbsoluteFlatPackedErrorMetres:0,
        polarOutside1mm:0,localHeightOutside1um:0};
      run.results.forEach(function(g,i){
        var v=rows[i],t=sphere.surfacePoint2(v.distance,v.height),
          reference=Math.atan2(t[0],radius+t[1]),arc=v.distance/radius,
          polar=(g.directPolarAngle-arc)*radius,
          cartesian=(g.cartesianPolarAngle-reference)*radius,
          normalized=(g.normalizedAtan2F32-reference)*radius,
          atan=(g.directAtan2F32-reference)*radius;
        var errors={polarSurfaceMetres:polar,cartesianPolarSurfaceMetres:cartesian,
          normalizedAtan2SurfaceMetres:normalized,
          directArcF32SurfaceMetres:(g.directArcF32-arc)*radius,
          cpuSceneArcVsCartesianSurfaceMetres:(reference-arc)*radius,
          directAtan2F32SurfaceMetres:atan,
          localHeightMetres:g.localHeight-v.height,
          packedHeightMetres:g.packedAbsoluteHeight-v.height,
          flatLocalMetres:g.flatLocalDistance-v.distance,
          flatPackedMetres:g.flatPackedDistance-v.distance};
        stats.maxAbsolutePolarErrorSurfaceMetres=Math.max(stats.maxAbsolutePolarErrorSurfaceMetres,Math.abs(polar));
        stats.maxAbsoluteDirectArcF32ErrorSurfaceMetres=Math.max(stats.maxAbsoluteDirectArcF32ErrorSurfaceMetres,Math.abs(errors.directArcF32SurfaceMetres));
        stats.maxAbsoluteCartesianPolarErrorSurfaceMetres=Math.max(stats.maxAbsoluteCartesianPolarErrorSurfaceMetres,Math.abs(cartesian));
        stats.maxAbsoluteNormalizedAtan2ErrorSurfaceMetres=Math.max(stats.maxAbsoluteNormalizedAtan2ErrorSurfaceMetres,Math.abs(normalized));
        stats.maxAbsoluteLocalHeightErrorMetres=Math.max(stats.maxAbsoluteLocalHeightErrorMetres,Math.abs(errors.localHeightMetres));
        stats.maxAbsolutePackedHeightErrorMetres=Math.max(stats.maxAbsolutePackedHeightErrorMetres,Math.abs(errors.packedHeightMetres));
        stats.maxAbsoluteFlatLocalErrorMetres=Math.max(stats.maxAbsoluteFlatLocalErrorMetres,Math.abs(errors.flatLocalMetres));
        stats.maxAbsoluteFlatPackedErrorMetres=Math.max(stats.maxAbsoluteFlatPackedErrorMetres,Math.abs(errors.flatPackedMetres));
        if(Math.abs(polar)>.001)stats.polarOutside1mm++;
        if(Math.abs(errors.localHeightMetres)>1e-6)stats.localHeightOutside1um++;
        reports.push({index:i,mode:mode,distanceMetres:v.distance,heightMetres:v.height,
          referencePolarRadians:reference,referenceArcPolarRadians:arc,gpu:g,errors:errors});
      });
      stats.benchmarkWarmReadbackMs=run.benchmarkMs||[];
      stats.benchmarkWarmMedianMs=median(stats.benchmarkWarmReadbackMs);
      stats.benchmarkIterations=run.benchmarkIterations;
      summary[mode]=stats;
    });
    return {version:VERSION,kind:'isolated Globe/Flat GPU coordinate precision and input-split audit',
      geometry:['globe radial target angle','flat global-to-local coordinate'],modes:MODES.slice(),
      distancesMetres:DISTANCES.slice(),heightsMetres:HEIGHTS.slice(),targets:rows.length,
      radiusMetres:radius,flatOriginMetres:origin,
      reference:'CPU JS f64 surfacePoint2(distance,height) and atan2(x,R+y), exact arc angle distance/R; local height and flat distance',
      angleApproximation:'Cartesian atan(q) = q - q^3/3 + q^5/5, q=targetX/(R+targetY); arc-angle uses exact distance/R',
      maxOmittedPolarSeriesBoundSurfaceMetres:maxAngleSeriesBoundMetres,
      inputCaveat:'Two f32 limbs cannot encode an arbitrary binary64 exactly; compare prepacked R+h with separate local h to isolate quantization and cancellation',
      arithmeticCaveat:'classic DS optimizer-sensitive; integer-residual DS limited contract, not IEEE binary64; no transcendental refraction evaluation',
      timingCaveat:'Wall clock dispatch plus readback, not GPU timestamp kernel time; iterations >1 perturb distance and are benchmark-only',
      sourceInputDiagnostics:source,summary:summary,perCase:reports,
      cpuOracleUsedForGpuInput:false,framePaintingChanged:false,shootingChanged:false,
      contactClassificationsChanged:false,productionAuthorized:false};
  }
  async function createSession(capacity,deps){
    if(!Number.isInteger(capacity)||capacity<1||capacity>1024)throw RangeError('Geometry capacity 1..1024');
    deps=deps||{};
    var nav=deps.navigator||(typeof navigator!=='undefined'?navigator:null),
      usage=deps.GPUBufferUsage||(typeof GPUBufferUsage!=='undefined'?GPUBufferUsage:null),
      mapMode=deps.GPUMapMode||(typeof GPUMapMode!=='undefined'?GPUMapMode:null);
    if(!nav||!nav.gpu||!usage||!mapMode)throw Error('WebGPU geometry precision unavailable');
    var adapter=await nav.gpu.requestAdapter();
    if(!adapter)throw Error('No WebGPU geometry adapter');
    var device=await adapter.requestDevice(),buffers=[],closed=false;
    function alloc(bytes,flags){var b=device.createBuffer({size:bytes,usage:flags});buffers.push(b);return b;}
    function close(){if(closed)return;closed=true;buffers.forEach(function(b){b.destroy();});if(device.destroy)device.destroy();}
    try{
      if(capacity*64>device.limits.maxStorageBufferBindingSize)throw Error('Geometry storage limit');
      var pipelines={};
      for(var mi=0;mi<MODES.length;mi++){
        var mode=MODES[mi],module=device.createShaderModule({code:wgsl(mode)});
        if(module.getCompilationInfo){
          var info=await module.getCompilationInfo();
          var errors=info.messages.filter(function(m){return m.type==='error';});
          if(errors.length)throw Error(mode+' geometry WGSL: '+errors.map(function(m){return m.message;}).join('; '));
        }
        pipelines[mode]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});
      }
      var input=alloc(capacity*64,usage.STORAGE|usage.COPY_DST),
        output=alloc(capacity*64,usage.STORAGE|usage.COPY_SRC),
        config=alloc(16,usage.STORAGE|usage.COPY_DST),
        read=alloc(capacity*64,usage.COPY_DST|usage.MAP_READ),binds={};
      MODES.forEach(function(mode){binds[mode]=device.createBindGroup({
        layout:pipelines[mode].getBindGroupLayout(0),entries:[
          {binding:0,resource:{buffer:input}},{binding:1,resource:{buffer:output}},
          {binding:2,resource:{buffer:config}}]});});
      var busy=false;
      async function dispatch(mode,count,iterations,kbits){
        device.queue.writeBuffer(config,0,new Uint32Array([count,iterations,kbits,0]));
        var started=now(),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
        pass.setPipeline(pipelines[mode]);pass.setBindGroup(0,binds[mode]);
        pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();
        encoder.copyBufferToBuffer(output,0,read,0,count*64);
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(mapMode.READ);
        var raw=new Float32Array(read.getMappedRange(0,count*64).slice(0));read.unmap();
        return {results:decode(new Array(count),raw),elapsedMs:now()-started};
      }
      async function run(rows,options){
        if(closed)throw Error('Geometry session closed');
        if(busy)throw Error('Geometry session already busy');
        if(rows.length>capacity)throw RangeError('Geometry rows exceed capacity');
        options=options||{};
        var radius=options.radius===undefined?DEFAULT_RADIUS:options.radius,
          origin=options.origin===undefined?DEFAULT_ORIGIN:options.origin,
          repeats=options.warmRepeats===undefined?5:options.warmRepeats,
          iterations=options.benchmarkIterations===undefined?32:options.benchmarkIterations;
        if(!Number.isInteger(repeats)||repeats<0||repeats>20||
          !Number.isInteger(iterations)||iterations<2||iterations>256)
          throw RangeError('Invalid geometry benchmark settings');
        var packed=packedInput(rows,radius,origin),runs={},
          kbits=new Uint32Array(new Float32Array([1/radius]).buffer)[0];busy=true;
        try{
          device.queue.writeBuffer(input,0,packed);
          for(var mi=0;mi<MODES.length;mi++){
            var mode=MODES[mi],correct=await dispatch(mode,rows.length,1,kbits),times=[];
            await dispatch(mode,rows.length,iterations,kbits);
            for(var j=0;j<repeats;j++)times.push((await dispatch(mode,rows.length,iterations,kbits)).elapsedMs);
            runs[mode]={results:correct.results,benchmarkMs:times,benchmarkIterations:iterations};
          }
          return analyze(rows,runs,radius,origin);
        }finally{busy=false;}
      }
      return {run:run,close:close,adapterInfo:adapter.info||null};
    }catch(error){close();throw error;}
  }
  return Object.freeze({VERSION:VERSION,MODES:MODES,DISTANCES:DISTANCES,HEIGHTS:HEIGHTS,
    DEFAULT_RADIUS:DEFAULT_RADIUS,DEFAULT_ORIGIN:DEFAULT_ORIGIN,cases:cases,
    packedInput:packedInput,wgsl:wgsl,decode:decode,analyze:analyze,createSession:createSession});
}));
