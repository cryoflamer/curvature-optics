'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const compare=require('../src/ui/modern/ModernCompareModel');

function actualModel(){
  const vec={Norm:a=>{const n=Math.hypot(...a);return a.map(x=>x/n);},
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    Scale:(a,t)=>a.map(x=>x*t),Add:(a,b)=>a.map((x,i)=>x+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
  const c=vm.createContext({JsgVect3:vec});
  vm.runInContext(source('src/app/CurvatureModel.js'),c);
  const model=vm.runInContext('new CurveAppClass()',c);
  Object.assign(model,{Height:15,FocalLengthField:2000,Nick:0.0121,Pan:0.0464,
    Roll:0,showModel:1,showGrid:1,viewcenterHorizon:0,
    ObjType:[3,3],NObjects:[3,2],ObjDist:[1200,3000],ObjDeltaDist:[380,500],
    ObjSidePos:[35,25.4],ObjSize:[23,64]});
  model.Update();
  return model;
}

test('132: physical A/B models keep one observer/camera and authored scene without mutating source',()=>{
  const original=actualModel(),oldMode=original.showModel,oldAim=original.viewcenterHorizon;
  const result=compare.pair(original);
  assert.notStrictEqual(result.A,original);
  assert.notStrictEqual(result.B,original);
  assert.notStrictEqual(result.A,result.B);
  assert.equal(result.A.showModel,1);
  assert.equal(result.B.showModel,2);
  assert.equal(original.showModel,oldMode);
  assert.equal(original.viewcenterHorizon,oldAim);
  assert.equal(result.A.viewcenterHorizon,3);
  assert.equal(result.B.viewcenterHorizon,3);
  assert.ok(compare.invariant(result));
  for(const key of ['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSidePos','ObjSize']){
    assert.notStrictEqual(result.A[key],result.B[key],key+' must have independent arrays');
    assert.deepEqual(Array.from(result.A[key]),Array.from(result.B[key]));
  }
  result.B.ObjSize[0]=999;
  assert.equal(original.ObjSize[0],23);
  assert.equal(result.A.ObjSize[0],23);
});

test('132: observer-fixed physical cameras agree across surface curvature and preserve FOV',()=>{
  const camera=require('../src/app/CurvaturePhysicalCamera');
  const sourceModel=actualModel(),{A,B}=compare.pair(sourceModel);
  const a=camera.create(A),b=camera.create(B);
  assert.deepEqual(a.center,b.center);
  assert.deepEqual(a.up,b.up);
  assert.equal(a.sceneSize,b.sceneSize);
  assert.equal(a.fieldOfViewRadians,b.fieldOfViewRadians);
  assert.notEqual(A.showModel,B.showModel);
  assert.ok(compare.invariant({A,B}));
});

test('132: Compare markup creates two actual independent GraphX3DX canvases and tooltip has no native duplicate',()=>{
  const html=source('CurvatureModern.html'),code=source('src/ui/modern/ModernApp.js');
  const graphCode=source('src/ui/modern/ModernCompareGraph.js');
  const css=source('src/ui/modern/ModernApp.css');
  assert.match(html,/id="ModernCompareViews"/);
  assert.match(html,/ModernCompareGraph\.js" data-compare-side="A"/);
  assert.match(html,/ModernCompareGraph\.js" data-compare-side="B"/);
  assert.match(graphCode,/root\.NewGraphX3D\(/);
  assert.match(graphCode,/app\.drawCompare\(side,g\)/);
  assert.match(code,/CurvatureMainCanvasRenderer\.renderPhysical\(g,m/);
  assert.match(code,/compareAdapter\.pair\(model\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/modern-compare-viewports:not\(\.is-active\)/);
  assert.doesNotMatch(code,/help\.title\s*=\s*message/);
  assert.match(code,/ObjType:'Selects the actual 3D object shape/);
});

test('132: each Compare viewport invokes Physical renderer separately with shared optics and camera inputs',()=>{
  const names=['ModernStatus','ModernCurvatureLabel','ModernViewInfo','ModernModePill',
    'ModernOcclusionWrap','ModernSceneTab','ModernCompareTab','ModernCompareMessage',
    'ModernGraphHost','ModernCompareViews','ModernBackToScene','ModernHeight','ModernFocal',
    'ModernPan','ModernNick','ModernOcclusion','ModernCameraAim','ModernAtmosphere',
    'ModernGrid','ModernCurvature','ModernEarth','ModernRender','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernPreset','ModernResetPreset','ModernObjectFields0',
    'ModernObjectFields1','ModernSceneTitle','ModernSceneDescription','ModernCompareLabelA',
    'ModernCompareLabelB','ModernCompareStatusA','ModernCompareStatusB'];
  const nodes=new Map(names.map(id=>[id,{id,value:'',min:'',max:'',checked:true,hidden:false,
    textContent:'',listeners:{},classList:{toggle(){}},
    addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},
    closest(){return {set hidden(value){this.value=value;}};}}]));
  const renders=[],callbacks=[];
  function FakeModel(){this.Update=function(){};this.showModel=1;this.rEarth=6371000;}
  const ctx={window:{CurveAppClass:FakeModel,
    CurvatureModernSceneState:null,CurvatureModernCompareModel:compare,
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,options){renders.push({g,m,options});
      return {drawn:28,fillTriangles:11,unresolved:0,cacheReused:false,timings:{totalMs:5}};}},
    CurvaturePhysicalCurvature:{modelStep(){return 164;},label(){return 'Earth';}},
    NewGraphX3D(params){return {Redraw(){params.DrawFunc({id:'Scene'});}};},
    xOnLoad(fn){callbacks.push(fn);},console:{error(e){throw e;}}},
    document:{getElementById(id){assert.ok(nodes.has(id),'missing '+id);return nodes.get(id);}},
    requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){},
    setTimeout(fn){fn();return 1;},clearTimeout(){},console};
  ctx.window.window=ctx.window;
  vm.runInNewContext(source('src/ui/modern/ModernApp.js'),ctx);
  const app=ctx.window.CurvatureModernApp;
  for(const side of ['A','B'])app.registerCompareGraph(side,{
    UpdateCanvasSize(){},Redraw(){app.drawCompare(side,{id:'compare-'+side});}
  });
  callbacks[0]();
  assert.equal(renders.length,1,'only one Scene render before switching');
  nodes.get('ModernCompareTab').listeners.click();
  assert.equal(app.getMode(),'compare');
  assert.equal(renders.length,3,'two real Compare render calls');
  assert.equal(renders[1].g.id,'compare-A');
  assert.equal(renders[2].g.id,'compare-B');
  assert.equal(renders[1].m.showModel,1);
  assert.equal(renders[2].m.showModel,2);
  assert.equal(renders[1].m.viewcenterHorizon,3);
  assert.equal(renders[2].m.viewcenterHorizon,3);
  assert.equal(renders[1].options.atmosphere,renders[2].options.atmosphere);
  assert.equal(app.getModel().showModel,1,'Compare must not modify Scene');
  assert.match(nodes.get('ModernCompareStatusA').textContent,/28 contours/);
  assert.match(nodes.get('ModernCompareStatusB').textContent,/28 contours/);
  nodes.get('ModernBackToScene').listeners.click();
  assert.equal(app.getMode(),'scene');
  assert.equal(renders.length,4);
});

test('140.12.7: Compare optical probes sample the actual physical scene, never fixture rays',()=>{
  const points=Array.from({length:20},(_,i)=>[i+1,0,1]);
  const composed={scene:{primitives:[{points:points.slice(0,10)},{points:points.slice(10)}]},
    ranges:[{start:0,end:2,role:'objects'}]};
  const dependencies={composition:{composeOpticalMain(m,globe,opts){
    assert.equal(opts.physicalWorld,true);assert.equal(globe,true);return composed;
  }},surfaces:{createFromCurvature(){return {surfacePoint2(d,h){return [d,h]}};}},
  silhouette:{coordinate(p){return {distance:p[0],height:1,azimuth:p[0]*0.001};}}};
  const m={showModel:1,rEarth:6371000,Height:1};
  const data=compare.probeTargets(m,{count:8,atmosphere:'standard',includeEdges:false},dependencies);
  assert.equal(data.points.length,8);
  assert.equal(data.sourcePointCount,20);
  assert.equal(data.geometry,'globe');
  assert.deepEqual(data.points.map(p=>p.target[0]),[2,4,7,9,12,14,17,19]);
  assert.ok(data.points.every(p=>p.azimuth>0));
  assert.throws(()=>compare.probeTargets(m,{count:1025},dependencies),/8–1024/);
  assert.throws(()=>compare.probeTargets(m,{count:8},{}),/dependencies/);
});

test('140.12.7: CPU/GPU statuses remain reviewable despite subpixel angular proxy',()=>{
  const points=[{azimuth:0},{azimuth:0.05},{azimuth:0.2}];
  const cpu={results:[{status:'visible',angle:0},{status:'visible',angle:.02},
    {status:'blocked',angle:.08}]};
  const gpu={results:[{status:'indeterminate',angle:0.0000001},
    {status:'visible',angle:.0200001},{status:'blocked',angle:.0800001}]};
  const report=compare.probeReport(points,cpu,gpu,1080);
  assert.equal(report.statusMismatches,1);
  assert.equal(report.uncertain,1);
  assert.equal(report.overOnePixel,0);
  assert.equal(report.matchedVisible,1);
  assert.equal(report.actualFrameCompared,false);
  assert.equal(report.productionAuthorized,false);
  assert.equal(report.visualEquivalenceProven,false);
  assert.equal(report.rows[0].gpu,'indeterminate');
  assert.throws(()=>compare.probeReport(points,cpu,{results:[]}),/Mismatched/);
});

test('140.12.7: optional Compare-only GPU controls and research scripts are wired, no production backend switch',()=>{
  const html=source('CurvatureModern.html'),app=source('src/ui/modern/ModernApp.js');
  assert.match(html,/id="ModernCompareKind"/);
  assert.match(html,/id="ModernGpuProbeRun"/);
  assert.match(html,/id="ModernGpuProbeCanvasCPU"/);
  assert.match(html,/id="ModernGpuProbeCanvasGPU"/);
  assert.match(html,/id="ModernGpuProbeExport"/);
  assert.match(html,/CurvatureWebGPUBatchShooting1412\.js/);
  assert.match(app,/session=await gpu\.createSession/);
  assert.match(app,/gpu\.checked\(request\)/);
  assert.match(app,/generation!==state\.probeGeneration/);
  assert.match(app,/result\.B=compareAdapter\.clone\(result\.A\)/);
  assert.match(app,/spec=state\.compareConfig&&\(state\.compareGpuProbe\?state\.compareConfig\.A/);
  assert.match(app,/actualRenderedImageCompared:false/);
  assert.doesNotMatch(source('src/app/CurvatureMainCanvasRenderer.js'),/CurvatureWebGPUBatchShooting1412/);
});

test('140.12.8: disputed GPU ground contacts are independently replayed and never certified as frames',()=>{
  const request={geometry:'flat',radius:6371000,observerHeight:2,atmosphere:'standard',
    controls:{step:50,eventSubsteps:8},targets:[[100,0],[200,0],[300,0]]};
  const cpu={results:[{status:'visible'},{status:'blocked'},{status:'visible'}]};
  const gpu={results:[{status:'blocked',angle:0.01,pathLength:100},
    {status:'blocked',angle:0.02,pathLength:200},
    {status:'indeterminate',angle:null,pathLength:null}]};
  const calls=[];
  const tracer={atmosphere(){return {kind:'standard'};},trace(options){
    calls.push(options);return {hitGround:true,travelled:99.98,
      event:{kind:'ground',contact:'crossing',pathLength:99.98}};
  }};
  const review=compare.probeGroundReview(request,cpu,gpu,tracer);
  assert.equal(review.disagreements,2);
  assert.deepEqual(review.reviews.map(r=>r.targetIndex),[0,2]);
  assert.equal(calls.length,1);
  assert.equal(calls[0].angle,0.01);
  assert.ok(Math.abs(review.reviews[0].groundReplay.remainingPathMetres-0.02)<1e-8);
  assert.equal(review.reviews[1].groundReplay.status,'unavailable');
  assert.equal(review.renderedSilhouetteCompared,false);
  assert.equal(review.excludedFromGpuTimings,true);
  assert.equal(compare.probeGroundReview(request,cpu,gpu,tracer,1).truncated,true);
  assert.throws(()=>compare.probeGroundReview(request,cpu,{results:[]},tracer),/Mismatched/);
});

test('140.12.10: collected exact adaptive rays create bounded ordered metric GPU field requests',()=>{
  const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
  const m={showModel:2,rEarth:6371000,Height:12};
  const records=Array.from({length:24},(_,i)=>[100+i*50,5+i]);
  records.push(records[0],records[3],[-1,0],[100001,10]);
  const bundle=compare.gpuFieldRequest(m,records,8,surfaces,'first-forward-x');
  assert.equal(bundle.discovered,28);
  assert.equal(bundle.qualified,24);
  assert.equal(bundle.selected.length,8);
  assert.equal(bundle.request.geometry,'flat');
  assert.equal(bundle.request.atmosphere,'standard');
  assert.deepEqual(bundle.request.targets,bundle.selected.map(x=>x.target));
  assert.ok(bundle.request.targets.every(t=>t[0]>0&&t[0]<=100000));
  assert.ok(bundle.selected.every(p=>p.key===p.d.toPrecision(13)+','+p.h.toPrecision(13)));
  assert.throws(()=>compare.gpuFieldRequest(m,records,1025,surfaces,'first-forward-x'),/Invalid/);
  assert.throws(()=>compare.gpuFieldRequest(m,records,8,{},'first-forward-x'),/Invalid/);
});

test('140.12.10: GPU-seeded optical field uses real statuses, CPU fallback and reports honest coverage',()=>{
  const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
  const model={showModel:1,rEarth:6371000,Height:15};
  const bundle=compare.gpuFieldRequest(model,[[500,30],[1000,100],[500,30]],2,surfaces,'first-forward-x');
  const response={results:[
    {target:bundle.selected[0].target,status:'blocked',angle:-0.001,residual:0.001},
    {target:bundle.selected[1].target,status:'solver_failed',angle:null,residual:null}
  ]};
  const field=compare.gpuRayField(bundle,response);
  const a=bundle.selected[0],b=bundle.selected[1];
  assert.equal(field.sample(a.d,a.h).status,'blocked','do not reclassify blocked to CPU visible');
  assert.equal(field.exact(a.d,a.h).method,'gpu-experimental');
  assert.equal(field.sample(b.d,b.h),null,'failed GPU rays must fall back to CPU');
  assert.equal(field.sample(800,25),null,'unseeded rays must fall back to CPU');
  assert.deepEqual(field.stats(),{seeds:1,failedGpuSeeds:1,gpuHits:2,gpuExactHits:1,
    cpuFallbackRequests:2});
  assert.throws(()=>compare.gpuRayField(bundle,{results:response.results.slice().reverse()}),/order mismatch/);
});

test('140.12.10: rendered frame comparison measures real pixels, not angular-ray proxies',()=>{
  function fake(pixels,w=2){return {width:w,height:1,getContext(){return {
    getImageData(){return {data:new Uint8ClampedArray(pixels)};}}}};}
  const a=fake([0,0,0,255,10,10,10,255]),b=fake([0,0,0,255,20,10,10,255]);
  const report=compare.compareFramePixels(a,b);
  assert.equal(report.status,'measured');
  assert.equal(report.totalPixels,2);
  assert.equal(report.significantPixels,1);
  assert.equal(report.strictPixels,1);
  assert.equal(report.maxChannelDelta,10);
  assert.equal(report.visualEquivalenceProven,false);
  assert.equal(compare.compareFramePixels(a,fake([0,0,0,255],1)).status,'unavailable');
  assert.equal(compare.compareFramePixels({},{}).status,'unavailable');
});

test('140.12.10: full physical renderer and Compare wire GPU results into B and keep opt-in bounds',()=>{
  const html=source('CurvatureModern.html'),app=source('src/ui/modern/ModernApp.js');
  const optics=source('src/optics/CurvaturePhysicalSceneOptics.js'),field=source('src/optics/OpticalSharedRayField.js');
  assert.match(html,/id="ModernGpuFrameRun"/);
  assert.match(html,/GPU-seeded rays and explicit CPU fallback/);
  assert.match(app,/runCompareGpuField/);
  assert.match(app,/state\.compareGraphs\.B\.Redraw\(\)/);
  assert.match(app,/options\.experimentalRayField=state\.probeField/);
  assert.match(app,/options\.onExactTarget=function/);
  assert.match(app,/gpuAssistedFrame:state\.probeFrameLast/);
  assert.match(optics,/experimentalRayField:options.experimentalRayField/);
  assert.match(field,/options\.experimentalRayField\.exact\(d,h\)/);
  assert.match(field,/options\.onExactTarget\(d,h\)/);
  assert.doesNotMatch(source('src/app/CurvatureMainCanvasRenderer.js'),/CurvatureWebGPUBatchShooting1412/);
});


test('140.12.11: CPU replay uses only original selected f64 oracle outputs and honest fallback',()=>{
  const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
  const model={showModel:2,rEarth:6371000,Height:15};
  const bundle=compare.gpuFieldRequest(model,[[500,30],[1000,100],[1500,20]],3,surfaces,'first-forward-x');
  const rows=[{d:500,h:30,result:{status:'visible',angle:0.012,residual:0.001}},
    {d:1000,h:100,result:{status:'blocked',angle:-0.023,residual:0.002}},
    {d:1500,h:20,result:{status:'solver_failed',angle:null}}];
  const replay=compare.cpuReplayField(bundle,rows);
  assert.deepEqual(replay.exact(500,30),{status:'visible',angle:0.012,
    residual:0.001,reason:undefined,method:'cpu-replay-experimental'});
  assert.equal(replay.sample(1000,100).status,'blocked');
  assert.equal(replay.exact(1500,20),null);
  assert.equal(replay.exact(800,40),null);
  assert.deepEqual(replay.stats(),{seeds:2,missingCpuSeeds:1,
    replayHits:2,replayExactHits:1,cpuFallbackRequests:2});
  assert.throws(()=>compare.cpuReplayField({},null),/Invalid/);
});

test('140.12.11: Compare captures actual CPU answers and renders replay before GPU B',()=>{
  const app=source('src/ui/modern/ModernApp.js');
  const field=source('src/optics/OpticalSharedRayField.js');
  const html=source('CurvatureModern.html');
  assert.match(field,/options\.onExactResult\(d,h,record\)/);
  assert.match(app,/options\.onExactResult=function\(d,h,result\)/);
  assert.match(app,/compareAdapter\.cpuReplayField\(bundle,cpuRecords\)/);
  assert.match(app,/replayFrameDiff=compareAdapter\.compareFramePixels/);
  assert.match(app,/cpuReplayControl:/);
  assert.match(html,/Build CPU replay \+ GPU frame B/);
  assert.ok(app.indexOf('var cpuReplay=compareAdapter.cpuReplayField')<
    app.indexOf('state.probeField=compareAdapter.gpuRayField(bundle,gpuResult.response)'));
});

test('140.12.11: CPU replay counts and source status are distinct from GPU work',()=>{
  const request={geometry:'flat',radius:6371000,observerHeight:15,atmosphere:'standard'};
  const selected=[{key:'500.0000000000,30.00000000000',d:500,h:30}];
  const replay=compare.cpuReplayField({request,selected},[{d:500,h:30,
    result:{status:'blocked',angle:-0.003,residual:0,reason:'ground-crossing'}}]);
  assert.strictEqual(replay.request,request);
  assert.equal(replay.kind,'cpu-replay-control');
  assert.equal(replay.exact(500,30).method,'cpu-replay-experimental');
  assert.equal(replay.exact(500,30).reason,'ground-crossing');
  assert.equal(replay.stats().replayExactHits,2);
  assert.equal(compare.frameControlCounts({drawn:7,fillTriangles:9,unresolved:0},
    {drawn:7,fillTriangles:9,unresolved:0}).sameCounts,true);
  assert.equal(compare.frameControlCounts({drawn:7,fillTriangles:9,unresolved:0},
    {drawn:7,fillTriangles:10,unresolved:0}).sameCounts,false);
  assert.equal(compare.frameControlCounts(null,{drawn:1}).sameCounts,false);
});

test('140.12.11: replay control labels and exports strict pixel and adaptive work evidence',()=>{
  const app=source('src/ui/modern/ModernApp.js');
  assert.match(app,/replayFrameDiff\.strictPixels===0/);
  assert.match(app,/referenceCounts\.sameCounts/);
  assert.match(app,/cpuReplayControl:\{renderMs:replayMs/);
  assert.match(app,/replayStats\.replayHits/);
  assert.match(app,/CPU replay control/);
  assert.match(app,/curvature-compare-140\.12\.11-cpu-replay-gpu-frame\.json/);
});


test('140.12.12: GPU-first scene grid is authored without discovering CPU ray solves',()=>{
  const composition=require('../src/scene/CurvatureIndependentComposition');
  const silhouette=require('../src/optics/OpticalTowerSilhouette');
  const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
  const gpu=require('../src/diagnostics/CurvatureWebGPUBatchShooting1412');
  for(const showModel of [1,2]){
    const model=actualModel();model.showModel=showModel;
    const grid=compare.gpuFirstGrid(model,1024,{composition,silhouette,surfaces,
      branch:'first-forward-x'});
    assert.equal(grid.cpuOracleDiscovery,false);
    assert.equal(grid.request.geometry,showModel===1?'globe':'flat');
    assert.equal(grid.request.targets.length,1024);
    assert.equal(grid.distances.length*grid.heights.length,1024);
    assert.ok(grid.objectVertices>50);
    assert.equal(grid.distances[0],100);
    assert.ok(grid.distances.every((d,i,a)=>i===0||d>a[i-1]));
    assert.ok(grid.heights.every((h,i,a)=>i===0||h>a[i-1]));
    assert.equal(grid.heights[0],0);
    assert.doesNotThrow(()=>gpu.checked(grid.request));
  }
  assert.throws(()=>compare.gpuFirstGrid(actualModel(),64,{}),/Invalid GPU-first/);
});

test('140.12.12: GPU-first field serves every sample with bounded GPU data and no CPU oracle fallback',()=>{
  const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
  const metric=surfaces.createFromCurvature(0),d=[100,1000],h=[0,100];
  const request={branch:'first-forward-x',geometry:'flat',radius:6371000,
    observerHeight:15,atmosphere:'standard',targets:d.flatMap(x=>h.map(y=>metric.surfacePoint2(x,y)))};
  const grid={request,distances:d,heights:h,columns:2,rows:2};
  const results=request.targets.map((t,i)=>({target:t,status:i===3?'blocked':'visible',
    angle:Math.atan2(t[1]-15,t[0]),residual:0}));
  const field=compare.gpuFirstRayField(grid,{results},surfaces);
  assert.equal(field.fullCoverageGrid,true);
  assert.equal(field.sample(100,0).status,'visible');
  assert.equal(field.exact(1000,100).status,'blocked');
  const centre=field.sample(500,25);
  assert.ok(Number.isFinite(centre.angle));
  assert.equal(centre.method,'gpu-first-grid-approximation');
  assert.equal(field.sample(99999,500).status,'blocked');
  const report=field.stats().experimentalGpu;
  assert.equal(report.cpuFallbackRequests,0);
  assert.equal(report.gpuSeedNodes,4);
  assert.ok(report.gpuHits>=4);
  assert.ok(report.mixedStatusLookups>0);
  assert.ok(report.extrapolatedLookups>0);
  assert.equal(report.productionAuthorized,false);
  assert.throws(()=>compare.gpuFirstRayField(grid,{results:results.slice().reverse()},surfaces),
    /target order mismatch/);
  const failed=results.map(r=>({...r,status:'solver_failed',angle:null}));
  const empty=compare.gpuFirstRayField(grid,{results:failed},surfaces);
  assert.equal(empty.sample(500,25).status,'solver_failed');
  assert.equal(empty.stats().experimentalGpu.cpuFallbackRequests,0);
});

test('140.12.12: GPU-first UI measures end-to-end BEFORE separately timed CPU cold reference',()=>{
  const html=source('CurvatureModern.html'),app=source('src/ui/modern/ModernApp.js');
  const physical=source('src/optics/CurvaturePhysicalSceneOptics.js');
  assert.match(html,/id="ModernGpuFirstRun"/);
  assert.match(html,/Benchmark GPU-first full frame/);
  assert.match(app,/function runCompareGpuFirst\(/);
  assert.match(app,/gpuFirstGrid\(state\.comparePair\.A/);
  assert.match(app,/session\.solve\(grid\.request,\{warmRepeats:0\}\)/);
  assert.match(app,/gpuFirstRayField\(grid,batch\.response/);
  assert.match(app,/gpuFirstEndToEndMs:fullGpuMs/);
  assert.match(app,/cpuColdReferenceMs:cpuMs/);
  assert.ok(app.indexOf('var fullGpuMs=renderFinished-totalStarted')<
    app.indexOf('state.probeForceColdA=true'));
  assert.match(physical,/options\.experimentalRayField\.fullCoverageGrid/);
  assert.match(app,/curvature-compare-140\.12\.12-gpu-first-frame\.json/);
});
