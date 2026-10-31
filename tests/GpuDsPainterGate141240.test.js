'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const gate=require('../src/diagnostics/CurvatureGpuDsPainterGate141240');
const ds=require('../src/diagnostics/CurvatureGpuHighPrecisionShooting141232');
const contract=require('../src/diagnostics/CurvatureOpticalBatchContract1411');
const compose=require('../src/scene/CurvatureIndependentComposition');
const benchmark=require('../tools/benchmark-adaptive-prism-112');
const root=path.resolve(__dirname,'..');
function model(height=15){return {...benchmark.model(2,'globe'),Height:height};}
function scene(m=model()){return compose.composeOpticalMain(m,true,{physicalWorld:true});}
function selected(m=model()){return gate.requestFromScene(scene(m),m);}
const camera={widthPx:320,heightPx:240,cameraElevationRadians:0,
  imagePlaneFocal:200,pixelScaleX:1,pixelScaleY:-1,pixelOffsetX:160,pixelOffsetY:120,
  rollDegrees:0};
function stubRun(inputs){return Object.fromEntries(gate.NODES.map(mode=>[mode,{timing:{dispatchToReadbackMs:6},
  traces:inputs.selected.map((c,i)=>({status:'converged',angleRadians:inputs.angles[i],
    residualMetres:0.000002,iterations:4,groundPhase:'no_ground',groundMarginSurfaceMetres:null,
    contactClassification:'unresolved_or_no_ground'}))}]));}
function stubCpu(inputs){return {branch:contract.BRANCH,backend:'cpu-reference',results:inputs.selected.map(c=>({
  target:c.target.slice(),status:'visible',angle:Math.atan2(c.target[1]-inputs.request.observerHeight,c.target[0]),
  residual:0,pathLength:c.target[0],ground:{hitGround:false,travelled:c.target[0],event:null},reason:null
}))};}
test('140.12.40: 48 original metric authored edge targets preserve deterministic identities and exact order',()=>{
  const m=model(),a=selected(m),b=selected(m);
  assert.equal(a.selected.length,48);assert.deepEqual(a.selected,b.selected);
  assert.ok(a.selection.candidates>=48);assert.equal(a.request.atmosphere,'standard');
  assert.equal(a.request.geometry,'globe');assert.equal(a.request.controls.step,500);
  assert.equal(new Set(a.selected.map(s=>s.placedObjectIndex)).size,2);
  assert.ok(a.selected.some(s=>s.distanceMetres>20000));
  assert.ok(a.selected.some(s=>s.distanceMetres<100));
  assert.ok(a.selected.every(s=>Number.isInteger(s.sourceIndex)));
  const p=scene(m);assert.ok(a.selected.every(s=>{
    const pt=p.scene.primitives[s.sourceIndex];return pt&&pt.commandIndex===s.sourceIndex;
  }));
  contract.validateRequest(a.request);ds.validate(a.request,a.coordinates,a.angles);
});
test('140.12.40: reject unsupported/foreign scene, eye height, and insufficient real points',()=>{
  const m=model();const c=scene(m);
  assert.throws(()=>gate.requestFromScene({...c,scene:{...c.scene,metadata:{...c.scene.metadata,physicalMetricWorld:false}}},m),/Optics-neutral/);
  assert.throws(()=>gate.requestFromScene(c,{...m,Height:0}),/restricted/);
  assert.throws(()=>gate.requestFromScene(c,{...m,Height:150}),/restricted/);
  assert.throws(()=>gate.requestFromScene({...c,ranges:[]},m),/real-scene points/);
});
test('140.12.40: GPU DS is explicitly NOT CPU RK4 and cannot be painted as a full frame',()=>{
  const inputs=selected(),frame={width:320,height:240,rgba:new Uint8ClampedArray(320*240*4)},
    report=gate.makeReport(inputs,stubRun(inputs),stubCpu(inputs),camera,{gpuCompileMs:2,gpu256Ms:6,gpu512Ms:7,cpuOracleMs:9},frame);
  assert.equal(report.verdict,'not_cpu_equivalent');assert.equal(report.eligibleForCpuPainter,false);
  assert.equal(report.cpuFrameParityAvailable,false);assert.equal(report.gpuDsFullFrameAvailable,false);
  assert.equal(report.rows.length,96);assert.equal(report.modeSummary.classic_ds_512.converged,48);
  assert.ok(report.modeSummary.classic_ds_512.maxAngleDifferenceRadians!==null);
  assert.ok(report.performanceLadder.every(x=>x.durationMs===null&&x.status.startsWith('not_supported')));
  assert.match(report.explanation,/NOT|not/i);
});
test('140.12.40: any unresolved GPU ray is retained as unqualified, never silently CPU-certified',()=>{
  const inputs=selected(),run=stubRun(inputs);run.classic_ds_512.traces[0]={status:'unresolved',angleRadians:null,groundPhase:'unresolved'};
  let cpu=stubCpu(inputs),frame={width:320,height:240,rgba:new Uint8ClampedArray(320*240*4)};
  const report=gate.makeReport(inputs,run,cpu,camera,{},frame),first=report.rows.find(r=>r.mode==='classic_ds_512'&&r.index===0);
  assert.equal(first.gpuCandidateVisibility,'unresolved');assert.equal(first.gpuPixel,null);
  assert.equal(report.modeSummary.classic_ds_512.uncertainOrUnresolvedVisibility>=1,true);
  assert.equal(report.eligibleForCpuPainter,false);
  assert.equal(gate.classifyGpu({status:'converged',contactClassification:'within_1cm_uncertain'}),'uncertain');
  assert.equal(gate.classifyGpu({status:'converged',groundPhase:'ground_reachable',groundMarginSurfaceMetres:.1}),'candidate_blocked');
});
test('140.12.40: PNG export contains a real CPU screenshot and only clearly labeled point maps',()=>{
  const inputs=selected(),frame={width:320,height:240,rgba:new Uint8ClampedArray(320*240*4)};
  frame.rgba.set([32,64,96,255]);
  const report=gate.makeReport(inputs,stubRun(inputs),stubCpu(inputs),camera,
    {gpuCompileMs:3,gpu256Ms:4,gpu512Ms:5,cpuOracleMs:7},frame);
  const seen=[];
  const doc={createElement(tag){assert.equal(tag,'canvas');return {width:0,height:0,
    getContext(kind){assert.equal(kind,'2d');return {
      createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
      putImageData(data){seen.push(data.data.slice(0,4));}
    };},toDataURL(){return 'data:image/png;base64,iVBORw0KGgo=';}};}};
  const files=gate.entries(report,frame,doc);
  assert.equal(files.filter(f=>f.name.endsWith('.png')).length,5);
  assert.deepEqual(Array.from(seen[0]),[32,64,96,255]);
  assert.equal(files.find(f=>f.name==='cpu-reference.png').name,'cpu-reference.png');
  assert.ok(files.some(f=>f.name==='gpu-ds-ray-positions-NOT-a-frame.png'));
  assert.ok(!files.some(f=>f.name==='gpu-ds.png'||f.name==='difference.png'));
  assert.match(files.find(f=>f.name==='README.txt').data,/NO CPU-equivalent GPU DS frame/);
  assert.match(files.find(f=>f.name==='results.json').data,/not_cpu_equivalent/);
  const dots=gate.dotFrame(report,'classic_ds_512','gpu');
  assert.equal(dots.rgba.length,320*240*4);
});
test('140.12.40: button, script order and cache busting wired into Modern Compare',()=>{
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8'),
    js=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/CurvatureGpuDsPainterGate141240\.js\?v=140\.12\.40/);
  assert.match(html,/id="ModernGpuDsPainterGateRun"/);
  assert.match(js,/addEventListener\('click',runGpuDsPainterGate141240\)/);
  assert.match(js,/gpuDsFullFrameAvailable|FULL GPU DS frame NOT available/);
  assert.doesNotMatch(js,/probeField\s*=\s*.*GpuDsPainterGate/);
});
