/* #140.12.28: isolated WebGPU f32 / classic DS / integer-residual DS audit.
 * Research code only. No optical ray solving or rendering is modified.
 * Integer error transforms target finite NORMAL f32 values and normal outputs;
 * they are NOT software IEEE-754 binary64, nor a proof for all WGSL backends.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuPrecisionFoundation141228=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERSION='140.12.28';
  var MODES=['f32','classic_ds','integer_residual_ds'];
  var OPS=['add','sub','mul','div','sqrt'];
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function split64(x){
    if(!Number.isFinite(x)||Math.abs(x)>1e30)throw RangeError('Unsupported finite precision input');
    var hi=Math.fround(x),lo=Math.fround(x-hi);
    if(!Number.isFinite(hi)||!Number.isFinite(lo))throw RangeError('Invalid split64 limbs');
    return [hi,lo];
  }
  function makeVectors(){
    var rows=[];
    function push(op,a,b,label){
      if(!OPS.includes(op)||!Number.isFinite(a)||!Number.isFinite(b))throw RangeError('Bad precision test vector');
      if(op==='div'&&b===0||op==='sqrt'&&a<=0)throw RangeError('Unsafe precision test vector');
      rows.push({op:op,a:a,b:b,label:label||op+' '+rows.length});
    }
    // Representative terrestrial coordinates, small local details, opposite
    // signs, near-one ratios, and f32 rounding boundaries. Reference values
    // are computed from the original JS Number inputs, never f32-packed ones.
    var pairs=[
      [6371000.01,6371000,'earth radius + 1 cm'],
      [6371000.000001,6371000,'earth radius + 1 um'],
      [6371000.0001,6370999.9999,'nearby coordinates'],
      [15000000.125,15000000,'global to local'],
      [1.0000001192092896,1.0000000596046448,'half-ulp near one'],
      [1.00000001,0.99999999,'near-unity difference'],
      [0.00029300001,0.00029299999,'refractivity difference'],
      [0.00000000123456789,0.0000000012345678,'tiny nearby values'],
      [5400.000001,5400,'distance + 1 um'],
      [0.1250000001,0.125,'exact dyadic + delta'],
      [0.5,0.3333333333333333,'non-dyadic'],
      [123456.7890123,-123456.7890119,'opposing coordinates']];
    for(var i=0;i<pairs.length;i++){
      var p=pairs[i];
      push('add',p[0],p[1],p[2]);
      push('sub',p[0],p[1],p[2]);
      push('mul',p[0],p[1],p[2]);
      if(p[1]!==0)push('div',p[0],p[1],p[2]);
    }
    [2,3,0.01,0.000293,6371000.000001,1.00000001,7350,1e-9].forEach(function(a){
      push('sqrt',a,1,'sqrt '+a);
    });
    // Repeat a few geometrically significant operations to improve signal
    // without changing their mathematical inputs or oracle.
    [1e-6,1e-4,.01,.1,1].forEach(function(delta){
      push('sub',6371000+delta,6371000,'R+'+delta+' minus R');
      push('div',5400+delta,6371000,'small polar angle '+delta);
      push('mul',5400/6371000,6371000+delta,'polar angle times radius '+delta);
    });
    return rows;
  }
  function oracle(row){
    switch(row.op){case 'add':return row.a+row.b;
      case 'sub':return row.a-row.b;case 'mul':return row.a*row.b;
      case 'div':return row.a/row.b;case 'sqrt':return Math.sqrt(row.a);}
    throw Error('Unknown vector operation');
  }
  // This is NOT used as the GPU reference. It only cross-checks the packed
  // input against its JS f64 source before GPU submission.
  function packedInput(vectors){
    if(!Array.isArray(vectors)||!vectors.length||vectors.length>1024)throw RangeError('Precision vectors 1..1024');
    var limbs=new Float32Array(vectors.length*4),operations=new Uint32Array(vectors.length);
    vectors.forEach(function(v,i){
      if(!v||!OPS.includes(v.op))throw RangeError('Unknown precision operation');
      var a=split64(v.a),b=split64(v.b);
      limbs.set([a[0],a[1],b[0],b[1]],i*4);
      operations[i]=OPS.indexOf(v.op);
    });
    return {limbs:limbs,operations:operations};
  }
  // All integer transforms operate on a signed 64-bit accumulator formed
  // from two WGSL u32 words. A 24-bit f32 significand needs at most 49 bits
  // for an aligned 2-term sum and 48 for a product. Non-normal values are
  // deliberately not part of this benchmark's integer arithmetic contract.
  var HELPERS=`
struct DS { hi:f32, lo:f32 }
fn ds(hi:f32,lo:f32)->DS{return DS(hi,lo);}
fn u64add(a:vec2u,b:vec2u)->vec2u {
  let low=a.x+b.x;
  return vec2u(low,a.y+b.y+select(0u,1u,low<a.x));
}
fn u64neg(a:vec2u)->vec2u{return u64add(~a,vec2u(1u,0u));}
fn u64sub(a:vec2u,b:vec2u)->vec2u{return u64add(a,u64neg(b));}
fn u64shift(v:u32,s:u32)->vec2u {
  if(s>=32u){return vec2u(0u,v << (s-32u));}
  if(s==0u){return vec2u(v,0u);}
  return vec2u(v<<s,v>>(32u-s));
}
fn u64shr(v:vec2u,s:u32)->u32 {
  if(s>=64u){return 0u;}
  if(s>=32u){return v.y>>(s-32u);}
  if(s==0u){return v.x;}
  return (v.x>>s)|(v.y<<(32u-s));
}
fn u64bits(v:vec2u)->u32 {
  if(v.y!=0u){return 64u-countLeadingZeros(v.y);}
  if(v.x!=0u){return 32u-countLeadingZeros(v.x);}
  return 0u;
}
fn fexp(x:f32)->i32 {return i32((bitcast<u32>(x)>>23u)&255u)-127;}
fn fsig(x:f32)->u32 {return (bitcast<u32>(x)&0x7fffffu)|0x800000u;}
fn packAligned(x:f32,e:i32)->vec2u {
  let sh=u32(fexp(x)-e+25);
  let a=u64shift(fsig(x),sh);
  if(x<0.0){return u64neg(a);}
  return a;
}
fn residualToF32(bits:vec2u,exponent:i32)->f32 {
  if(bits.x==0u && bits.y==0u){return 0.0;}
  let neg=(bits.y&0x80000000u)!=0u;
  let magnitude=select(bits,u64neg(bits),neg);
  let n=u64bits(magnitude);
  let shift=select(0u,n-24u,n>24u);
  var top=u64shr(magnitude,shift);
  // The difference of a rounded f32 sum/product and its exact value is
  // exactly representable as f32 under the round-to-nearest normal contract.
  // Preserve the guard/tie bits if a backend returns another rounding.
  if(shift>0u){
    let guard=u64shr(magnitude,shift-1u)&1u;
    var sticky=false;
    if(shift>1u){
      if(shift<=32u){sticky=(magnitude.x&((1u<<(shift-1u))-1u))!=0u;}
      else{sticky=magnitude.x!=0u || (magnitude.y&((1u<<(shift-33u))-1u))!=0u;}
    }
    if(guard==1u&&(sticky||(top&1u)==1u)){top=top+1u;}
  }
  let out=ldexp(f32(top),exponent+i32(shift));
  return select(out,-out,neg);
}
fn normal(x:f32)->bool {
  let bits=(bitcast<u32>(x)>>23u)&255u;
  return bits>0u && bits<255u;
}
fn intTwoSum(a:f32,b:f32)->DS {
  let s=a+b;
  if(a==0.0 || b==0.0 || !normal(a) || !normal(b) || !normal(s)){
    return ds(s,0.0);
  }
  let e=max(fexp(a),max(fexp(b),fexp(s)));
  if(e-min(fexp(a),fexp(b))>25){
    return ds(s,select(a,b,fexp(a)>=fexp(b)));
  }
  let exact=u64add(packAligned(a,e),packAligned(b,e));
  let residual=u64sub(exact,packAligned(s,e));
  return ds(s,residualToF32(residual,e-48));
}
fn intTwoProd(a:f32,b:f32)->DS {
  let s=a*b;
  if(a==0.0 || b==0.0 || !normal(a) || !normal(b) || !normal(s)){
    return ds(s,0.0);
  }
  let x=fsig(a); let y=fsig(b);
  let x0=x&65535u; let x1=x>>16u;
  let y0=y&65535u; let y1=y>>16u;
  var exact=vec2u(x0*y0,0u);
  exact=u64add(exact,u64shift(x1*y0,16u));
  exact=u64add(exact,u64shift(x0*y1,16u));
  exact=u64add(exact,u64shift(x1*y1,32u));
  if((a<0.0)!=(b<0.0)){exact=u64neg(exact);}
  let scale=fexp(a)+fexp(b)-46;
  let shifted=u64shift(fsig(s),u32(fexp(s)-23-scale));
  let rounded=select(shifted,u64neg(shifted),s<0.0);
  let residual=u64sub(exact,rounded);
  return ds(s,residualToF32(residual,scale));
}
fn classicTwoSum(a:f32,b:f32)->DS {
  let s=a+b;let v=s-a;
  let e=(a-(s-v))+(b-v);
  return ds(s,e);
}
fn classicTwoProd(a:f32,b:f32)->DS {
  // Dekker splitting: deliberately optimizer-sensitive; magnitude bounded
  // in this diagnostic so multiplication by 4097 does not overflow.
  let s=a*b;
  let ac=4097.0*a;let ah=ac-(ac-a);let al=a-ah;
  let bc=4097.0*b;let bh=bc-(bc-b);let bl=b-bh;
  let e=((ah*bh-s)+ah*bl+al*bh)+al*bl;
  return ds(s,e);
}
fn twoSum(a:f32,b:f32)->DS {
  if(MODE==2u){return intTwoSum(a,b);}
  return classicTwoSum(a,b);
}
fn twoProd(a:f32,b:f32)->DS {
  if(MODE==2u){return intTwoProd(a,b);}
  return classicTwoProd(a,b);
}
fn dsAdd(a:DS,b:DS)->DS {
  let s=twoSum(a.hi,b.hi);
  let t=twoSum(a.lo,b.lo);
  let u=twoSum(s.lo,t.hi);
  let v=twoSum(s.hi,u.hi);
  return twoSum(v.hi,v.lo+u.lo+t.lo);
}
fn dsNeg(a:DS)->DS {return ds(-a.hi,-a.lo);}
fn dsSub(a:DS,b:DS)->DS {return dsAdd(a,dsNeg(b));}
fn dsMul(a:DS,b:DS)->DS {
  let p=twoProd(a.hi,b.hi);
  let correction=p.lo+(a.hi*b.lo+a.lo*b.hi)+a.lo*b.lo;
  return twoSum(p.hi,correction);
}
fn dsDiv(a:DS,b:DS)->DS {
  let q=a.hi/b.hi;
  let r=dsSub(a,dsMul(b,ds(q,0.0)));
  let q2=(r.hi+r.lo)/b.hi;
  return dsAdd(ds(q,0.0),ds(q2,0.0));
}
fn dsSqrt(a:DS)->DS {
  let q=sqrt(a.hi);
  let r=dsSub(a,dsMul(ds(q,0.0),ds(q,0.0)));
  let q2=(r.hi+r.lo)/(2.0*q);
  return dsAdd(ds(q,0.0),ds(q2,0.0));
}
fn oneStep(a:DS,b:DS,op:u32)->DS {
  if(MODE==0u){
    let x=a.hi+a.lo;let y=b.hi+b.lo;
    if(op==0u){return ds(x+y,0.0);}
    if(op==1u){return ds(x-y,0.0);}
    if(op==2u){return ds(x*y,0.0);}
    if(op==3u){return ds(x/y,0.0);}
    return ds(sqrt(x),0.0);
  }
  if(op==0u){return dsAdd(a,b);}
  if(op==1u){return dsSub(a,b);}
  if(op==2u){return dsMul(a,b);}
  if(op==3u){return dsDiv(a,b);}
  return dsSqrt(a);
}
`;
  var COMPUTE=`
struct Rays { data:array<vec4f> }
@group(0) @binding(0) var<storage,read> input:Rays;
@group(0) @binding(1) var<storage,read> operations:array<u32>;
@group(0) @binding(2) var<storage,read_write> output:Rays;
@group(0) @binding(3) var<storage,read> settings:array<u32>;
const MODE:u32=@MODE@u;
@HELPERS@
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;
  if(i>=settings[0]){return;}
  let inputRow=input.data[i];
  let a=ds(inputRow.x,inputRow.y);let b=ds(inputRow.z,inputRow.w);
  let op=operations[i];
  var result=oneStep(a,b,op);
  // Timing-only repetitions: avoid a separate optimized-away loop. Do NOT
  // interpret repeated values as correctness results for the original case.
  for(var j=1u;j<settings[1];j=j+1u){
    // For add/sub, use repeated exactly representable small deltas; for
    // mul/div use a factor near 1, and sqrt converges to 1.
    if(op==0u){result=oneStep(result,ds(0.0009765625,0.0),0u);}
    else if(op==1u){result=oneStep(result,ds(0.0009765625,0.0),1u);}
    else if(op==2u){result=oneStep(result,ds(1.0000001192092896,0.0),2u);}
    else if(op==3u){result=oneStep(result,ds(1.0000001192092896,0.0),3u);}
    else{result=oneStep(result,ds(0.0,0.0),4u);}
  }
  output.data[i]=vec4f(result.hi,result.lo,select(0.0,1.0,
    abs(result.hi)<3.402823e38 && abs(result.lo)<3.402823e38),0.0);
}`;
  function wgsl(mode){
    if(!MODES.includes(mode))throw RangeError('Unknown precision mode');
    return COMPUTE.replace('@MODE@',String(MODES.indexOf(mode))).replace('@HELPERS@',HELPERS);
  }
  function decode(vectors,raw){
    if(!(raw instanceof Float32Array)||raw.length!==vectors.length*4)throw RangeError('Precision readback mismatch');
    return vectors.map(function(v,i){
      var hi=raw[i*4],lo=raw[i*4+1],flag=raw[i*4+2];
      if(!Number.isFinite(hi)||!Number.isFinite(lo)||flag!==1)throw RangeError('Invalid GPU numeric result at '+i);
      return {index:i,operation:v.op,label:v.label,hi:hi,lo:lo,value:hi+lo};
    });
  }
  function median(values){var s=values.slice().sort(function(a,b){return a-b;});return s.length?s[Math.floor(s.length/2)]:null;}
  function analyze(vectors,runs){
    if(!Array.isArray(vectors)||!vectors.length)throw RangeError('No precision vectors');
    var summaries={},perCase=[],reference=vectors.map(oracle);
    MODES.forEach(function(mode){
      var run=runs[mode];
      if(!run||!Array.isArray(run.results)||run.results.length!==vectors.length)throw RangeError('Missing mode '+mode);
      var absSum=0,maxAbs=0,relMax=0,better=0,invalid=0;
      run.results.forEach(function(value,i){
        var expected=reference[i],actual=value.value;
        if(!Number.isFinite(actual)||!Number.isFinite(expected)){invalid++;return;}
        var abs=Math.abs(actual-expected),rel=abs/Math.max(Math.abs(expected),1e-30);
        absSum+=abs;maxAbs=Math.max(maxAbs,abs);relMax=Math.max(relMax,rel);
        if(mode!=='f32'&&runs.f32&&Number.isFinite(runs.f32.results[i].value)&&
           abs<Math.abs(runs.f32.results[i].value-expected))better++;
        perCase.push({index:i,operation:vectors[i].op,label:vectors[i].label,
          inputA:vectors[i].a,inputB:vectors[i].b,referenceF64:expected,
          mode:mode,hi:value.hi,lo:value.lo,actual:actual,
          absoluteError:abs,relativeError:rel});
      });
      summaries[mode]={cases:vectors.length,invalid:invalid,meanAbsoluteError:absSum/vectors.length,
        maxAbsoluteError:maxAbs,maxRelativeError:relMax,strictlyBetterThanF32:mode==='f32'?null:better,
        setupMs:run.setupMs,correctnessReadbackMs:run.correctnessMs,
        benchmarkIterations:run.benchmarkIterations,benchmarkWarmReadbackMs:run.benchmarkMs,
        benchmarkWarmMedianMs:median(run.benchmarkMs||[])};
    });
    var geometry=perCase.filter(function(r){return r.operation==='sub'&&r.label==='earth radius + 1 cm';});
    return {version:VERSION,kind:'isolated WGSL arithmetic precision and latency audit',
      methods:MODES.slice(),operationSet:OPS.slice(),vectors:vectors.length,
      arithmeticContract:'integer-residual DS: finite normal f32 limbs and normal intermediate results only; not IEEE binary64; non-certified',
      comparison:'JS Number binary64 reference of original inputs; output reconstructed as JS Number(hi)+Number(lo)',
      timingCaveat:'Wall-clock warmed upload/dispatch/readback, NOT a timestamp-query GPU kernel time',
      compilerCaveat:'Classic TwoSum/TwoProd are reassociation-sensitive in WGSL; integer mode uses bit-level high-part residuals but cross terms still use f32',
      geometryProbe:geometry,summary:summaries,perCase:perCase,
      cpuOracleUsedForGpuInput:false,framePaintingChanged:false,shootingChanged:false,
      productionAuthorized:false};
  }
  async function createSession(capacity,deps){
    if(!Number.isInteger(capacity)||capacity<1||capacity>1024)throw RangeError('Precision capacity 1..1024');
    deps=deps||{};
    var nav=deps.navigator||(typeof navigator!=='undefined'?navigator:null),
      usage=deps.GPUBufferUsage||(typeof GPUBufferUsage!=='undefined'?GPUBufferUsage:null),
      mapMode=deps.GPUMapMode||(typeof GPUMapMode!=='undefined'?GPUMapMode:null);
    if(!nav||!nav.gpu||!usage||!mapMode)throw Error('WebGPU precision stand unavailable');
    var start=now(),adapter=await nav.gpu.requestAdapter();
    if(!adapter)throw Error('No WebGPU precision adapter');
    var device=await adapter.requestDevice(),buffers=[],closed=false;
    function alloc(size,flags){var b=device.createBuffer({size:size,usage:flags});buffers.push(b);return b;}
    function close(){if(closed)return;closed=true;buffers.forEach(function(b){b.destroy();});if(device.destroy)device.destroy();}
    try{
      if(capacity*16>device.limits.maxStorageBufferBindingSize)throw Error('WebGPU precision storage limit');
      var pipelines={};
      for(var mi=0;mi<MODES.length;mi++){
        var mode=MODES[mi],module=device.createShaderModule({code:wgsl(mode)});
        if(module.getCompilationInfo){
          var info=await module.getCompilationInfo();
          var errors=info.messages.filter(function(x){return x.type==='error';});
          if(errors.length)throw Error(mode+' WGSL: '+errors.map(function(x){return x.message;}).join('; '));
        }
        pipelines[mode]=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});
      }
      var input=alloc(capacity*16,usage.STORAGE|usage.COPY_DST),
        ops=alloc(Math.max(16,capacity*4),usage.STORAGE|usage.COPY_DST),
        output=alloc(capacity*16,usage.STORAGE|usage.COPY_SRC),
        settings=alloc(16,usage.STORAGE|usage.COPY_DST),
        read=alloc(capacity*16,usage.COPY_DST|usage.MAP_READ);
      var binds={};
      MODES.forEach(function(mode){binds[mode]=device.createBindGroup({
        layout:pipelines[mode].getBindGroupLayout(0),entries:[
          {binding:0,resource:{buffer:input}},{binding:1,resource:{buffer:ops}},
          {binding:2,resource:{buffer:output}},{binding:3,resource:{buffer:settings}}]});});
      var busy=false;
      async function dispatch(mode,count,iterations){
        device.queue.writeBuffer(settings,0,new Uint32Array([count,iterations,0,0]));
        var started=now(),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
        pass.setPipeline(pipelines[mode]);pass.setBindGroup(0,binds[mode]);
        pass.dispatchWorkgroups(Math.ceil(count/64));pass.end();
        encoder.copyBufferToBuffer(output,0,read,0,count*16);
        device.queue.submit([encoder.finish()]);
        await read.mapAsync(mapMode.READ);
        var raw=new Float32Array(read.getMappedRange(0,count*16).slice(0));read.unmap();
        return {raw:raw,elapsedMs:now()-started};
      }
      async function run(vectors,options){
        if(closed)throw Error('Precision session closed');
        if(busy)throw Error('Precision session already busy');
        if(vectors.length>capacity)throw RangeError('Precision vectors exceed capacity');
        options=options||{};
        var repeats=options.warmRepeats===undefined?5:options.warmRepeats;
        var iterations=options.benchmarkIterations===undefined?128:options.benchmarkIterations;
        if(!Number.isInteger(repeats)||repeats<0||repeats>20||
           !Number.isInteger(iterations)||iterations<2||iterations>1024)
          throw RangeError('Invalid precision benchmark settings');
        var packed=packedInput(vectors),runs={};busy=true;
        try{
          device.queue.writeBuffer(input,0,packed.limbs);
          device.queue.writeBuffer(ops,0,packed.operations);
          for(var mi=0;mi<MODES.length;mi++){
            var mode=MODES[mi],correct=await dispatch(mode,vectors.length,1),times=[];
            // Warm-up run is not included in warm timing; serialization
            // ensures one mapped read buffer is never concurrently used.
            await dispatch(mode,vectors.length,iterations);
            for(var r=0;r<repeats;r++){
              var sample=await dispatch(mode,vectors.length,iterations);
              times.push(sample.elapsedMs);
            }
            runs[mode]={results:decode(vectors,correct.raw),correctnessMs:correct.elapsedMs,
              setupMs:now()-start,benchmarkMs:times,benchmarkIterations:iterations};
          }
          return analyze(vectors,runs);
        }finally{busy=false;}
      }
      return {run:run,close:close,setupMs:now()-start,adapterInfo:adapter.info||null};
    }catch(error){close();throw error;}
  }
  return Object.freeze({VERSION:VERSION,MODES:MODES,OPS:OPS,HELPERS:HELPERS,
    split64:split64,makeVectors:makeVectors,oracle:oracle,packedInput:packedInput,
    wgsl:wgsl,decode:decode,analyze:analyze,createSession:createSession});
}));
