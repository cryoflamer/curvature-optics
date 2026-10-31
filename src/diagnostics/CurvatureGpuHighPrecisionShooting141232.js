/* #140.12.32: GPU-owned double-single radial Bouguer shooting diagnostic.
 * The f32 GPU predictor supplies seeds only. Each GPU invocation refines its
 * OWN angle by DS secant iterations on target-polar residuals, with neither
 * CPU angle corrections nor CPU oracle values entering the GPU solve.
 * Domain: monotone radial globe, standard exponential atmosphere, observer
 * 0<h0<=200 m, targets 0..min(200 m,0.02 H), monotone radial leg to target.
 * Inward/outward first-forward branch only: no turning rays / certified events.
 * Diagnostic only: production shooting, ground decisions and paint unchanged.
 */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?
    require('./CurvatureGpuBouguerQuadrature141231'):root.CurvatureGpuBouguerQuadrature141231,
    typeof module==='object'&&module.exports?
    require('./CurvatureGpuBouguerPrecision141230'):root.CurvatureGpuBouguerPrecision141230,
    typeof module==='object'&&module.exports?
    require('./CurvatureGpuPrecisionFoundation141228'):root.CurvatureGpuPrecisionFoundation141228,
    typeof module==='object'&&module.exports?
    require('./CurvatureWebGPUBatchShooting1412'):root.CurvatureWebGPUBatchShooting1412,
    typeof module==='object'&&module.exports?
    require('./CurvatureBouguerInvariant141227'):root.CurvatureBouguerInvariant141227);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGpuHighPrecisionShooting141232=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(quad,polar,arithmetic,gpu,bouguer){
  'use strict';
  if(!quad||!polar||!arithmetic||!gpu||!bouguer)throw Error('DS shooting dependencies unavailable');
  var VERSION='140.12.32',NODE_COUNTS=[256,512],MAX_ITERS=9,RESIDUAL_TOL=0.00001;
  function now(){return typeof performance!=='undefined'&&performance.now?performance.now():Date.now();}
  function validate(request,coordinates,angles){
    var p=quad.environment(request),count=request.targets.length;
    if(p.h0/p.H>0.02||count!==48||!Array.isArray(coordinates)||coordinates.length!==count||
       !Array.isArray(angles)||angles.length!==count)
      throw RangeError('DS shooting requires 48 matched targets and bounded observer atmosphere');
    coordinates.forEach(function(c,i){
      var h=c&&c.heightMetres,a=angles[i],d=c&&c.distanceMetres;
      if(!Number.isFinite(h)||h<0||h>200||h/p.H>0.02||h===p.h0||!Number.isFinite(d)||d<=0||
         !Number.isFinite(a)||Math.abs(a)>=.54||a===0||
         (h<p.h0?a>=0:a<=0))
        throw RangeError('DS shooting radial-leg domain exceeded at target '+i);
      var target=request.targets[i];
      if(!target||Math.abs(d-p.R*Math.atan2(target[0],p.R+target[1]))>1e-6||
         Math.abs(h-(Math.hypot(target[0],p.R+target[1])-p.R))>2e-7)
        throw RangeError('DS shooting coordinates/targets mismatch '+i);
    });
    return true;
  }
  function heights(coordinates){
    var out=new Float32Array(coordinates.length*4);
    coordinates.forEach(function(c,i){var parts=arithmetic.split64(c.heightMetres);
      out.set([parts[0],parts[1],0,0],i*4);});
    return out;
  }
  // Reuse tested classic DS operations AND analytic-atmosphere expressions
  // from #140.12.31. Only sinHalf takes a DS angular argument here.
  function shader(request){
    var p=quad.environment(request);
    if(p.h0/p.H>0.02)throw RangeError('DS shooting observer-height polynomial domain exceeded');
    var math=quad.MATH.replace('fn dsSinHalf(angle:f32)->DS {','fn dsSinHalf(angle:DS)->DS {')
      .replace('let x=ds(0.5*angle,0.0);','let x=dsMul(ds(0.5,0.0),angle);');
    if(!math.includes('fn dsSinHalf(angle:DS)->DS')||math.includes('ds(0.5*angle'))
      throw Error('DS sine helper contract changed');
    return `struct Rays { data:array<vec4f> }
@group(0) @binding(0) var<storage,read> seeds:Rays;
@group(0) @binding(1) var<storage,read> constants:array<vec4f>;
@group(0) @binding(2) var<storage,read> arcs:Rays;
@group(0) @binding(3) var<storage,read> targetHeights:Rays;
@group(0) @binding(4) var<storage,read> config:array<u32>;
@group(0) @binding(5) var<storage,read_write> results:Rays;
const VACUUM:bool=${request.atmosphere==='vacuum'?'true':'false'};
${quad.arithmeticHelpers('classic_ds_512')}
${math}
struct Evaluation { residual:DS, polar:DS, valid:bool }
fn evaluate(angle:DS,observer:DS,targetHeight:DS,radius:DS,invR:DS,n:DS,scale:DS,theta:DS,nodeCount:u32)->Evaluation {
  let zero=ds(0.0,0.0);
  let inward=dsPositive(dsSub(observer,targetHeight));
  if((inward && angle.hi>=0.0)||(!inward && angle.hi<=0.0)||abs(angle.hi)>=0.54){
    return Evaluation(zero,zero,false);
  }
  var lower=observer;
  var upper=targetHeight;
  if(inward){lower=targetHeight;upper=observer;}
  let span=dsSub(upper,lower);
  let half=dsSinHalf(angle);
  let correction=dsMul(ds(-2.0,0.0),dsMul(half,half));
  let logB=dsAdd(dsLogF(observer,invR,n,scale),dsLog1pSmall(correction));
  var sum=zero;
  for(var j=0u;j<nodeCount;j=j+1u){
    let u=ds((f32(j)+0.5)/f32(nodeCount),0.0);
    let height=dsAdd(lower,dsMul(span,dsMul(u,u)));
    let z=dsMul(ds(2.0,0.0),dsSub(dsLogF(height,invR,n,scale),logB));
    if(dsLessOrEqualZero(z)){return Evaluation(zero,zero,false);}
    let radical=dsExpm1Small(z);
    if(dsLessOrEqualZero(radical)){return Evaluation(zero,zero,false);}
    let numerator=dsMul(dsMul(ds(2.0,0.0),dsMul(span,invR)),u);
    let denominator=dsMul(dsAdd(ds(1.0,0.0),dsMul(height,invR)),dsSqrt(radical));
    sum=dsAdd(sum,dsDiv(numerator,denominator));
  }
  let reached=dsDiv(sum,ds(f32(nodeCount),0.0));
  return Evaluation(dsMul(dsSub(reached,theta),radius),reached,true);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
  let i=id.x;
  if(i>=config[0]){return;}
  let seed=seeds.data[i];
  let heightParts=targetHeights.data[i];
  let arc=arcs.data[i];
  let c=constants[0];let d=constants[1];
  let radius=ds(c.x,c.y);
  let observer=ds(c.z,c.w);
  let targetHeight=ds(heightParts.x,heightParts.y);
  let invR=dsDiv(ds(1.0,0.0),radius);
  let theta=dsDiv(ds(arc.x,arc.y),radius);
  let n=ds(d.x,d.y);
  let scale=ds(d.z,d.w);
  var previousAngle=ds(seed.w,0.0);
  var previous=evaluate(previousAngle,observer,targetHeight,radius,invR,n,scale,theta,config[1]);
  let firstResidual=previous.residual;
  var angle=previousAngle;
  var current=previous;
  var count=0u;
  var status=0.0;
  if(previous.valid){
    if(abs(previous.residual.hi)<=0.00001){status=1.0;}
    else {
      // The perturbation is chosen on the SAME monotone radial branch.
      // No CPU oracle or saved targetHeight-angle solution seeds the derivative.
      let step=select(-1.0,1.0,seed.w>0.0)*max(0.000001,abs(seed.w)*0.0001);
      angle=dsAdd(previousAngle,ds(step,0.0));
      current=evaluate(angle,observer,targetHeight,radius,invR,n,scale,theta,config[1]);
      if(current.valid){
        for(var iteration=0u;iteration<9u;iteration=iteration+1u){
          count=iteration+1u;
          if(abs(current.residual.hi)<=0.00001){status=1.0;break;}
          let slope=dsSub(current.residual,previous.residual);
          if(abs(slope.hi)<1e-15){break;}
          let proposal=dsSub(angle,dsDiv(dsMul(current.residual,dsSub(angle,previousAngle)),slope));
          if(abs(proposal.hi)>=0.54 || (seed.w<0.0 && proposal.hi>=0.0) ||
             (seed.w>0.0 && proposal.hi<=0.0)){break;}
          let next=evaluate(proposal,observer,targetHeight,radius,invR,n,scale,theta,config[1]);
          if(!next.valid){break;}
          previousAngle=angle;previous=current;angle=proposal;current=next;
        }
        if(current.valid && abs(current.residual.hi)<=0.00001){status=1.0;}
      }
    }
  }
  // Same DS angular limbs are retained for the independent contact test.
  // A |margin| <= 1 cm result is numerically ambiguous, not an event proof.
  var groundFlag=0.0;
  var groundMargin=ds(0.0,0.0);
  if(status==1.0){
    if(seed.w>=0.0){groundFlag=2.0;}
    else {
      let half=dsSinHalf(angle);
      let b=dsAdd(dsLogF(observer,invR,n,scale),
        dsLog1pSmall(dsMul(ds(-2.0,0.0),dsMul(half,half))));
      if(dsPositive(b)){groundFlag=2.0;}
      else {
        let ground=evaluate(angle,observer,ds(0.0,0.0),radius,invR,n,scale,theta,config[1]);
        if(ground.valid){groundFlag=1.0;groundMargin=dsNeg(ground.residual);}
      }
    }
  }
  results.data[i*4u]=vec4f(status,angle.hi,angle.lo,current.residual.hi);
  results.data[i*4u+1u]=vec4f(current.residual.lo,f32(count),firstResidual.hi,firstResidual.lo);
  results.data[i*4u+2u]=vec4f(current.polar.hi,current.polar.lo,theta.hi,theta.lo);
  results.data[i*4u+3u]=vec4f(groundFlag,groundMargin.hi,groundMargin.lo,0.0);
}`;
  }
  function decode(coordinates,angles,raw){
    if(!(raw instanceof Float32Array)||raw.length!==angles.length*16||angles.length!==coordinates.length)
      throw RangeError('DS shooting readback size mismatch');
    return angles.map(function(seed,i){
      var v=Array.from(raw.subarray(i*16,i*16+16));
      if(!v.every(Number.isFinite)||![0,1].includes(v[0])||![0,1,2].includes(v[12])||
         (v[0]===0&&v[12]!==0)||
         (v[0]===1&&(Math.abs(v[1]+v[2])>=.54||
           Math.sign(v[1]+v[2])!==Math.sign(seed)||Math.abs(v[3]+v[4])>RESIDUAL_TOL*1.01)))
        throw RangeError('Invalid DS shooting readback at '+i);
      return {targetIndex:i,distanceMetres:coordinates[i].distanceMetres,heightMetres:coordinates[i].heightMetres,
        initialAngleRadians:seed,status:v[0]===1?'converged':'unresolved',
        angleRadians:v[1]+v[2],angleLimbs:[v[1],v[2]],residualMetres:v[3]+v[4],
        residualLimbs:[v[3],v[4]],iterations:v[5],initialResidualMetres:v[6]+v[7],
        targetPolarRadians:v[10]+v[11],reachedPolarRadians:v[8]+v[9],
        groundPhase:v[12]===0?'unresolved':v[12]===2?'no_ground':'ground_reachable',
        groundMarginSurfaceMetres:v[12]===1?v[13]+v[14]:null,
        groundMarginLimbs:v[12]===1?[v[13],v[14]]:null,
        contactClassification:v[12]===1?(Math.abs(v[13]+v[14])<=.01?'within_1cm_uncertain':
          v[13]+v[14]>0?'before_target':'after_target'):'unresolved_or_no_ground'};
    });
  }
  async function createSession(request,deps,options){
    quad.environment(request);deps=deps||{};options=options||{};
    var nav=deps.navigator||(typeof navigator!=='undefined'?navigator:null),
      usage=deps.GPUBufferUsage||(typeof GPUBufferUsage!=='undefined'?GPUBufferUsage:null),
      mapMode=deps.GPUMapMode||(typeof GPUMapMode!=='undefined'?GPUMapMode:null);
    if(!nav||!nav.gpu||!usage||!mapMode)throw Error('GPU DS shooting unavailable');
    var adapter=await nav.gpu.requestAdapter();if(!adapter)throw Error('No GPU DS shooting adapter');
    var device=await adapter.requestDevice(),buffers=[],closed=false;
    function alloc(size,flags){var buffer=device.createBuffer({size:size,usage:flags});buffers.push(buffer);return buffer;}
    function close(){if(closed)return;closed=true;buffers.forEach(function(b){b.destroy();});if(device.destroy)device.destroy();}
    try{
      var compilationStarted=now(),module=device.createShaderModule({code:shader(request)}),pipeline;
      try{pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:module,entryPoint:'main'}});}
      catch(e){
        if(module.getCompilationInfo){
          var info=await module.getCompilationInfo(),errors=info.messages.filter(function(m){return m.type==='error';});
          if(errors.length)throw Error('DS shooting WGSL: '+errors.map(function(m){return m.message;}).join('; '));
        }
        throw e;
      }
      var compileMs=now()-compilationStarted,count=request.targets.length;
      if(count*64>device.limits.maxStorageBufferBindingSize)throw RangeError('DS shooting storage limit');
      var seeds=alloc(count*16,usage.STORAGE|usage.COPY_DST),
        constants=alloc(32,usage.STORAGE|usage.COPY_DST),
        arcs=alloc(count*16,usage.STORAGE|usage.COPY_DST),
        targetHeights=alloc(count*16,usage.STORAGE|usage.COPY_DST),
        config=alloc(64,usage.STORAGE|usage.COPY_DST),
        output=alloc(count*64,usage.STORAGE|usage.COPY_SRC),
        read=alloc(count*64,usage.COPY_DST|usage.MAP_READ);
      var bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[
        {binding:0,resource:{buffer:seeds}},{binding:1,resource:{buffer:constants}},
        {binding:2,resource:{buffer:arcs}},{binding:3,resource:{buffer:targetHeights}},
        {binding:4,resource:{buffer:config}},{binding:5,resource:{buffer:output}}]});
      var running=false;
      async function solve(actual,coordinates,angles,onProgress){
        if(closed||running)throw Error('DS shooting session closed or running');
        if(actual!==request)throw RangeError('DS shooting request identity mismatch');
        validate(actual,coordinates,angles);running=true;
        try{
          var packed=gpu.pack(request);angles.forEach(function(a,i){packed.input[i*4+3]=a;});
          device.queue.writeBuffer(seeds,0,packed.input);
          device.queue.writeBuffer(constants,0,quad.packedConstants(request));
          device.queue.writeBuffer(arcs,0,polar.input(coordinates,request.radius));
          device.queue.writeBuffer(targetHeights,0,heights(coordinates));
          var runs={};
          for(var nodes of NODE_COUNTS){
            var cfg=new Uint32Array(packed.config);cfg[1]=nodes;
            device.queue.writeBuffer(config,0,cfg);
            var begin=now(),encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();
            pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(angles.length/64));pass.end();
            encoder.copyBufferToBuffer(output,0,read,0,angles.length*64);device.queue.submit([encoder.finish()]);
            await read.mapAsync(mapMode.READ);
            var raw=new Float32Array(read.getMappedRange(0,angles.length*64).slice(0));read.unmap();
            var mode='classic_ds_'+nodes;
            runs[mode]={traces:decode(coordinates,angles,raw),timing:{dispatchToReadbackMs:now()-begin,includesReadback:true}};
            if(typeof onProgress==='function')onProgress(mode,runs[mode].timing);
          }
          return runs;
        }finally{running=false;}
      }
      return Object.freeze({solve:solve,close:close,compileMs:compileMs});
    }catch(e){close();throw e;}
  }
  function logF(h,p){return Math.log1p(h/p.R)+Math.log1p(-p.N*(-Math.expm1(-h/p.H))/(1+p.N));}
  function targetResidualF64(request,angle,coordinate,nodes){
    var p=bouguer.options(request),h=coordinate.heightMetres,inward=h<p.h0;
    if(!(Number.isFinite(angle)&&Math.abs(angle)<.54)||h===p.h0||
       (inward?angle>=0:angle<=0))return null;
    var lower=Math.min(h,p.h0),span=Math.abs(h-p.h0),target=request.targets[coordinate.targetIndex],
      theta=Math.atan2(target[0],p.R+target[1]),logB=logF(p.h0,p)+Math.log1p(-2*Math.sin(angle/2)**2);
    var sum=0,comp=0;
    for(var j=0;j<nodes;j++){
      var u=(j+.5)/nodes,z=2*(logF(lower+span*u*u,p)-logB);
      if(!(z>0))return null;
      var term=2*span*u/((p.R+lower+span*u*u)*Math.sqrt(Math.expm1(z))),y=term-comp,next=sum+y;
      comp=(next-sum)-y;sum=next;
    }
    return {residualMetres:p.R*(sum/nodes-theta),polarRadians:sum/nodes};
  }
  function cpuRoot(request,coord,seed){
    var previousAngle=seed,previous=targetResidualF64(request,seed,coord,2048);
    if(!previous)return null;
    var a=seed+Math.sign(seed)*Math.max(1e-6,Math.abs(seed)*.0001),current=targetResidualF64(request,a,coord,2048);
    if(!current)return null;
    for(var i=0;i<12&&Math.abs(current.residualMetres)>1e-7;i++){
      var denominator=current.residualMetres-previous.residualMetres;
      if(Math.abs(denominator)<1e-14)return null;
      var nextAngle=a-current.residualMetres*(a-previousAngle)/denominator;
      if(Math.abs(nextAngle)>=.54||seed*nextAngle<=0)return null;
      var next=targetResidualF64(request,nextAngle,coord,2048);if(!next)return null;
      previousAngle=a;previous=current;a=nextAngle;current=next;
    }
    return {angleRadians:a,residualMetres:current.residualMetres,
      converged:Math.abs(current.residualMetres)<=1e-5};
  }
  function analyze(ladder,predictor,runs,cpu){
    var request=ladder.request,coordinates=ladder.coordinates;
    if(!predictor||!predictor.response||!Array.isArray(predictor.response.results)||
       !cpu||!Array.isArray(cpu.results)||predictor.response.results.length!==48||
       cpu.results.length!==48||!runs||!NODE_COUNTS.every(function(n){return runs['classic_ds_'+n]&&
         runs['classic_ds_'+n].traces.length===48;}))throw RangeError('Incomplete independent DS shooting audit');
    var summaries={},perCase=[],nodes=NODE_COUNTS;
    nodes.forEach(function(n){
      var mode='classic_ds_'+n,stats={targets:48,converged:0,unresolved:0,
        maxAbsAngleDeltaFromF64Arcsec:0,maxAbsAngleCorrectionFromPredictorArcsec:0,
        maxAbsGpuResidualMetres:0,maxAbsCpuSameAngleResidualMetres:0,
        cpuRootUnresolved:0,within1cmCpuResidual:0,
        groundDisagreementsBeyond1cm:0,groundWithin1cmUncertain:0,groundUnresolved:0};
      runs[mode].traces.forEach(function(t,i){
        var coord=Object.assign({targetIndex:i},coordinates[i]),g=predictor.response.results[i],ref=cpu.results[i];
        if(t.targetIndex!==i||t.initialAngleRadians!==g.angle||!Array.isArray(ref.target)||
           ref.target[0]!==request.targets[i][0]||ref.target[1]!==request.targets[i][1])
          throw RangeError('DS shooting target/angle mismatch '+i);
        var reference=cpuRoot(request,coord,g.angle),fixed=targetResidualF64(request,t.angleRadians,coord,2048),
          cpuContact=bouguer.f64(request,t.angleRadians,request.targets[i],2048);
        if(t.groundPhase==='unresolved')stats.groundUnresolved++;
        if(t.groundPhase==='ground_reachable' && cpuContact.contactMarginSurfaceMetres!==null){
          var gpuMargin=t.groundMarginSurfaceMetres,refMargin=cpuContact.contactMarginSurfaceMetres;
          if(Math.abs(gpuMargin)<=.01 || Math.abs(refMargin)<=.01)stats.groundWithin1cmUncertain++;
          else if((gpuMargin>0)!==(refMargin>0))stats.groundDisagreementsBeyond1cm++;
        }
        var angleDelta=reference?(t.angleRadians-reference.angleRadians)*180/Math.PI*3600:null;
        if(t.status==='converged')stats.converged++;else stats.unresolved++;
        if(!reference||!reference.converged)stats.cpuRootUnresolved++;
        if(angleDelta!==null)stats.maxAbsAngleDeltaFromF64Arcsec=Math.max(stats.maxAbsAngleDeltaFromF64Arcsec,Math.abs(angleDelta));
        stats.maxAbsAngleCorrectionFromPredictorArcsec=Math.max(stats.maxAbsAngleCorrectionFromPredictorArcsec,
          Math.abs(t.angleRadians-g.angle)*180/Math.PI*3600);
        stats.maxAbsGpuResidualMetres=Math.max(stats.maxAbsGpuResidualMetres,Math.abs(t.residualMetres));
        if(fixed){stats.maxAbsCpuSameAngleResidualMetres=Math.max(stats.maxAbsCpuSameAngleResidualMetres,Math.abs(fixed.residualMetres));
          if(Math.abs(fixed.residualMetres)<=.01)stats.within1cmCpuResidual++;}
        perCase.push({mode:mode,targetIndex:i,distanceMetres:coord.distanceMetres,heightMetres:coord.heightMetres,
          gpuPredictorAngleRadians:g.angle,gpuShooting:t,cpuF64BouguerRoot:reference,
          cpuF64SameAngleResidual:fixed,cpuF64GroundContact:cpuContact,
          cpuF64Rk4ShootingAngleRadians:ref.angle,
          cpuF64Rk4ShootingStatus:ref.status,angleDeltaFromF64Arcsec:angleDelta,
          angleDeltaFromCpuRk4Arcsec:Number.isFinite(ref.angle)?
            (t.angleRadians-ref.angle)*180/Math.PI*3600:null});
      });
      stats.timing=runs[mode].timing;
      summaries[mode]=stats;
    });
    return {version:VERSION,kind:'independent GPU DS radial Bouguer shooting audit',geometry:'globe',
      targets:48,modes:nodes.map(function(n){return 'classic_ds_'+n;}),
      constraints:'First-forward monotone radial leg only; target height != observer height; no turning branches; bounded DS polynomial; first-principles f64 comparisons, not certified',
      gpuAngleSelection:'Independent GPU f32 predictor seeds; each GPU workgroup invocation performs its own DS secant angle refinement, with no CPU angle adjustment',
      cpuReference:'Independent CPU f64 2048-node Bouguer root and CPU f64 RK4 shooting calculated after both GPU runs',
      classificationScope:'GPU same-angle DS contact is diagnostic only; |ground margin| <= 1 cm is uncertain, no visibility certification',
      summary:summaries,perCase:perCase,cpuReferenceAfterGpu:true,
      shootingChanged:false,contactClassificationsChanged:false,framePaintingChanged:false,productionAuthorized:false};
  }
  return Object.freeze({VERSION:VERSION,NODE_COUNTS:NODE_COUNTS,MAX_ITERS:MAX_ITERS,RESIDUAL_TOL:RESIDUAL_TOL,
    validate:validate,heights:heights,shader:shader,decode:decode,createSession:createSession,
    targetResidualF64:targetResidualF64,cpuRoot:cpuRoot,analyze:analyze});
}));
