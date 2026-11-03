'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),
  fs=require('node:fs'),path=require('node:path');
const rk4=require('../src/diagnostics/CurvatureGpuDsRk4Shooting141241');
const audit=require('../src/diagnostics/CurvatureGpuDsRk4Audit141241');
const gate=require('../src/diagnostics/CurvatureGpuDsPainterGate141240');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const comp=require('../src/scene/CurvatureIndependentComposition');
const benchmark=require('../tools/benchmark-adaptive-prism-112');
const model=()=>({...benchmark.model(2,'globe'),Height:15});
function inputs(){let m=model();return gate.requestFromScene(comp.composeOpticalMain(m,true,{physicalWorld:true}),m);}
const camera={widthPx:320,heightPx:240,cameraElevationRadians:0,
 imagePlaneFocal:200,pixelScaleX:1,pixelScaleY:-1,pixelOffsetX:160,pixelOffsetY:120,rollDegrees:0};
function cpuStub(req){return {backend:'cpu-reference',branch:contract.BRANCH,results:req.targets.map(t=>({
 target:t.slice(),status:'visible',angle:Math.atan2(t[1]-req.observerHeight,t[0]),
 residual:0,pathLength:t[0],ground:{hitGround:false,travelled:t[0],event:null},reason:null
}))};}
function gpuStub(req){return {backend:'gpu-experimental',branch:contract.BRANCH,results:req.targets.map(t=>({
 target:t.slice(),status:'visible',angle:Math.atan2(t[1]-req.observerHeight,t[0]),
 residual:0,pathLength:t[0],ground:{hitGround:false,travelled:t[0],event:null},reason:null,
 evaluations:6,rk4Calls:90,eventChecks:6
}))};}
test('140.12.41: 48 identical physical targets and direct-angle GPU seeds are never CPU oracle outputs',()=>{
 const x=inputs();assert.equal(x.request.targets.length,48);
 assert.ok(rk4.validate(x.request));
 const packed=rk4.pack(x.request);
 assert.equal(packed.targets.length,48*8);assert.equal(packed.constants.length,8);
 for(let i=0;i<48;i++){
   const t=x.request.targets[i],k=i*8;
   assert.ok(Math.abs(packed.targets[k]+packed.targets[k+1]-t[0])<1e-8);
   assert.ok(Math.abs(packed.targets[k+2]+packed.targets[k+3]-t[1])<1e-8);
   assert.ok(Math.abs(packed.targets[k+4]+packed.targets[k+5]-Math.atan2(t[1]-15,t[0]))<1e-12);
 }
});
test('140.12.41: restricted atmosphere, range and controls fail closed (no substitute algorithm)',()=>{
 const r=inputs().request;
 assert.throws(()=>rk4.validate({...r,geometry:'flat'}),/Globe/);
 assert.throws(()=>rk4.validate({...r,atmosphere:'vacuum'}),/Globe/);
 assert.throws(()=>rk4.validate({...r,controls:{...r.controls,step:50}}),/step 500m/);
 assert.throws(()=>rk4.validate({...r,targets:[[61000,10]]}),/Globe/);
 assert.throws(()=>rk4.validate({...r,targets:new Array(257).fill([400,0])}),/256/);
});
test('140.12.41: generated WGSL uses DS RK4, first-forward-x bracket, sampled ground events — never Bouguer',()=>{
 const text=rk4.shader();
 assert.match(text,/fn rk4\(s:S,dt:DS/);
 assert.match(text,/fn deriv\(state:S,k:DS/);
 assert.match(text,/fn eventAt\(s:S,delta:DS/);
 assert.match(text,/fn firstCrossing\(/);assert.match(text,/fn minimum\(/);
 assert.match(text,/fn verify\(best:Shot/);
 assert.match(text,/fn shot\(angle:DS/);
 assert.match(text,/for\(var j=0u;j<48u/);
 assert.match(text,/fn twoProd/);
 assert.doesNotMatch(text,/dsLogF|polarResidual|Bouguer/);
 assert.doesNotMatch(text,/@DS_HELPERS@/);
 assert.equal((text.match(/@compute\s+@workgroup_size\(64\)/g)||[]).length,1);
 assert.ok(text.length>10000);
});
test('140.12.41.1: generated WGSL does not use reserved `final` in a field or member access',()=>{
 const source=rk4.shader();
 // WGSL reserves `final`; a JS syntax check cannot detect this compile failure.
 assert.doesNotMatch(source,/\bfinal\b/);
 assert.match(source,/struct Shot \{ok:bool,a:DS,res:DS,path:DS,endState:S,calls:u32\}/);
 assert.match(source,/best\.endState\.x/);
 assert.match(source,/best\.endState\.vz/);
});
test('140.12.41.2: generated WGSL never passes a DS struct to select',()=>{
 const source=rk4.shader();
 assert.doesNotMatch(source,/\bselect\s*\(\s*mulf\s*\(dsAdd\(lo,hi\)/);
 assert.match(source,/if\(greater\(candidate,lo\)\&\&less\(candidate,hi\)\)/);
});
test('140.12.41: decoded GPU readback preserves DS limbs and complete first-ground evidence',()=>{
 const request={...inputs().request,targets:[[1000,7],[9000,20],[20000,3]]};
 const raw=new Float32Array(3*16);
 // solved visible, blocked with crossing, and failed bracket
 raw.set([1,.003,1e-12,2e-8,1e-12,1000,3e-5,7,0,1000,3e-5,160,0,12,0,0],0);
 raw.set([2,-.002,-1e-12,1e-8,1e-12,9000,.01,9,1,8000,.02,180,0,18,0,0],16);
 raw.set([0,0,0,0,0,0,0,11,0,0,0,100,4,0,0,0],32);
 const response=rk4.decode(request,raw);
 assert.deepEqual(response.results.map(r=>r.status),['visible','blocked','solver_failed']);
 assert.equal(response.results[1].ground.event.contact,'crossing');
 assert.equal(response.results[0].ground.hitGround,false);
 assert.equal(response.results[2].angle,null);
 assert.match(response.results[2].reason,/bracket/i);
});
test('140.12.41: invalid/missing first-ground proof cannot be decoded as a verified visible result',()=>{
 const request={...inputs().request,targets:[[1000,7]]},data=new Float32Array(16);
 data.set([1,.01,0,0,0,1000,0,6,3,900,0,20,0,8,0,0]);
 assert.throws(()=>rk4.decode(request,data),/Invalid converged/);
 data[8]=1;data[0]=2;data[9]=1001;
 assert.throws(()=>rk4.decode(request,data),/Invalid converged/);
});
test('140.12.41: reports can detect status, ground or pixel mismatch without silently suppressing uncertainty',()=>{
 const x=inputs(),g=gpuStub(x.request),c=cpuStub(x.request),frame={width:320,height:240,rgba:new Uint8ClampedArray(320*240*4)};
 g.results[0].status='solver_failed';g.results[0].angle=null;g.results[0].residual=null;g.results[0].pathLength=null;g.results[0].ground=null;g.results[0].reason='no bracket';
 const eventAt=Math.min(10,x.request.targets[1][0]/2);
 g.results[1].ground={hitGround:true,travelled:eventAt,event:{kind:'ground',contact:'crossing',pathLength:eventAt}};
 g.results[1].status='blocked';
 const report=audit.makeReport(x,g,c,camera,{gpuCompileMs:1,gpuSessionSetupMs:2,gpuDispatchReadbackMs:3,cpuOracleMs:4},frame);
 assert.equal(report.stats.targets,48);assert.equal(report.stats.statusMismatches,2);
 assert.equal(report.stats.groundContactMismatches,2);
 assert.equal(report.stats.groundEventKindMismatches,1);
 assert.equal(report.verdict,'sample_parity_not_established');
 assert.equal(report.gpuDsFullFrameAvailable,false);assert.equal(report.eligibleForCpuPainter,false);
 assert.equal(report.rows[0].gpuFailureReason,'no bracket');
 assert.equal(report.rows[0].gpuPixel,null);
});
test('140.12.41: sample parity is never full-frame authorization',()=>{
 const x=inputs(),frame={width:320,height:240,rgba:new Uint8ClampedArray(320*240*4)},
   report=audit.makeReport(x,gpuStub(x.request),cpuStub(x.request),camera,{},frame);
 assert.equal(report.verdict,'sample_parity_candidate');
 assert.equal(report.eligibleForCpuPainter,false);
 assert.equal(report.gpuDsFullFrameAvailable,false);
});
test('140.12.41: PNG ZIP export labels point images explicitly NOT-A-FRAME',()=>{
 const x=inputs(),frame={width:320,height:240,rgba:new Uint8ClampedArray(320*240*4)},
   report=audit.makeReport(x,gpuStub(x.request),cpuStub(x.request),camera,{},frame);
 const doc={createElement(tag){assert.equal(tag,'canvas');return {getContext(){return {
   createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},putImageData(){} };},
   toDataURL(){return 'data:image/png;base64,iVBORw0KGgo=';}};}};
 const files=audit.entries(report,frame,doc),names=files.map(f=>f.name);
 assert.ok(names.includes('results.json'));
 assert.ok(names.includes('cpu-reference.png'));
 assert.ok(names.includes('gpu-ds-rk4-ray-positions-NOT-A-FRAME.png'));
 assert.ok(names.includes('status-and-position-disagreements-SAMPLES-ONLY.png'));
 assert.ok(names.includes('performance-48-target-batch.png'));
 assert.ok(files.find(f=>f.name==='README.txt').data.includes('NOT GPU rendered object frames'));
});
test('140.12.41: mocked WebGPU session packs DS targets, reads back unchanged order, releases resources',async()=>{
 const req={...inputs().request,targets:[[1000,10],[5000,15]]},buffers=[],sources=[],compiled=[];
 const USAGE={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
 let deviceDestroyed=0;
 const device={limits:{maxStorageBufferBindingSize:1<<25},
   createShaderModule({code}){compiled.push(code);return {code};},
   async createComputePipelineAsync({compute}){assert.equal(compute.entryPoint,'main');return {getBindGroupLayout(){return {};}};},
   createBuffer({size}){let b={bytes:new ArrayBuffer(size),destroyed:false,destroy(){this.destroyed=true;},
     async mapAsync(){},getMappedRange(){return this.bytes},unmap(){}};buffers.push(b);return b;},
   createBindGroup({entries}){assert.equal(entries.length,4);return {entries};},
   queue:{writeBuffer(buffer,offset,data){sources.push(data.constructor.name);
       new Uint8Array(buffer.bytes,offset,data.byteLength).set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));},
     submit(){}},
   createCommandEncoder(){return {beginComputePass(){return {setPipeline(){},setBindGroup(){},
     dispatchWorkgroups(count){assert.equal(count,1);},end(){
       let out=new Float32Array(buffers[2].bytes);for(let i=0;i<req.targets.length;i++){
         let t=req.targets[i],a=Math.atan2(t[1]-req.observerHeight,t[0]);
         out.set([1,a,0,0,0,t[0],0,6,0,t[0],0,40,0,6,0,0],i*16);
       }
     }}},
     copyBufferToBuffer(src,so,dst,doff,n){new Uint8Array(dst.bytes,doff,n).set(new Uint8Array(src.bytes,so,n));},
     finish(){return {};}};},destroy(){deviceDestroyed++;}};
 const deps={navigator:{gpu:{async requestAdapter(){return {async requestDevice(){return device;}};}}},
   GPUBufferUsage:USAGE,GPUMapMode:{READ:1}};
 const session=await rk4.createSession(req,deps);
 const result=await session.solve(req);
 assert.equal(result.response.results.length,2);
 assert.ok(result.response.results.every(r=>r.status==='visible'));
 assert.deepEqual(sources,['Float32Array','Float32Array','Uint32Array']);
 assert.equal(compiled.length,1);
 session.close();session.close();
 assert.ok(buffers.every(b=>b.destroyed));assert.equal(deviceDestroyed,1);
});
