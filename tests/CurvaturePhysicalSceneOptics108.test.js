'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const compose=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const target=require('../src/optics/OpticalTargetProjection');
const main=require('../src/app/CurvatureMainCanvasRenderer');
const R=6371000;
function model(overrides={}){return {...{
  rEarth:R,geometryRadius:R,Height:15,showModel:1,ObjType:[3,3],NObjects:[85,2],
  ObjDist:[50,25550],ObjDeltaDist:[297.55,373],ObjSidePos:[32,22.4],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0],ObjSizeType:[0,0],
  rDisk:1000,zDisk:999,hDip:1,hDisk:R/2,aDip:.065,aDelta:.025,
  showGrid:1,rFEarth:10007543,PanRad:0,sceneWidth:5000,
  GlobeGridCol:'green',GlobeFGridCol:'yellow',TangentCol:'red',FEGridCol:'gray',FEEqCol:'blue',
  showTangent:true,showData:false,camPos:[0,0,0],camViewCenter:[0,1,0],
  camUp:[0,0,1],camSceneSize:1
},...overrides};}
function allLayers(c,role){return c.ranges.filter(x=>x.role===role).flatMap(x=>c.scene.primitives.slice(x.start,x.end));}
function close(a,b,err=1e-9){assert.ok(Math.abs(a-b)<err,`${a} vs ${b}`);}
test('108: optics-neutral composition includes both object banks and surface/horizon guides, never a horizon mask',()=>{
  for(const globe of [true,false]){
    const m=model({showModel:globe?1:2});
    const c=compose.composeOpticalMain(m,globe);
    assert.equal(c.scene.metadata.composition,'optics-neutral-main');
    assert.deepEqual(c.scene.metadata.objectIndices,[1,0]);
    assert.ok(c.ranges.some(x=>x.name==='objects-0'));
    assert.ok(c.ranges.some(x=>x.name==='objects-1'));
    assert.ok(c.ranges.some(x=>x.name==='surface-guides'));
    if(globe)assert.ok(c.ranges.some(x=>x.name==='horizon-guides'));
    assert.equal(c.ranges.some(x=>x.role==='occlusion'),false);
    assert.equal(c.scene.primitives.some(p=>p.style&&p.style.fill==='white'&&p.mode===2),false);
    assert.ok(allLayers(c,'objects').length>300);
    assert.ok(c.scene.primitives.every((p,i)=>p.commandIndex===i));
  }
});
test('108: true Globe horizon reference does not change with legacy k or disk proxy',()=>{
  const a=compose.composeOpticalMain(model(),true);
  const b=compose.composeOpticalMain(model({rDisk:400000,hDisk:R/3,zDisk:4000}),true);
  assert.deepEqual(allLayers(a,'visual-aid'),allLayers(b,'visual-aid'));
  const horizon=a.scene.primitives.find(p=>p.metadata&&p.metadata.kind==='globe-horizon');
  assert.ok(horizon);
  const d=Math.hypot(horizon.points[0][0],horizon.points[0][1]);
  close(d,R*Math.sqrt(1-(R/(R+15))**2),1e-6);
});
test('108: vacuum adapter preserves one shared painter frame and optical source lineage',()=>{
  for(const globe of [true,false]){
    const m=model({showModel:globe?1:2}),c=compose.composeOpticalMain(m,globe);
    const r=optics.create().transform(c,m,{atmosphere:'vacuum'});
    const p=r.composition;
    assert.equal(p.scene.metadata.composition,'physical-projected-main');
    assert.deepEqual(p.ranges.slice(0,-1).map(x=>x.role),
      c.ranges.filter(x=>x.role==='visual-aid').map(x=>x.role));
    assert.ok(allLayers(p,'visual-aid').every(x=>x.metadata.physicalGround));
    assert.ok(allLayers(p,'visual-aid').some(x=>x.metadata.kind==='physical-horizon') || !globe);
    assert.equal(p.ranges.some(x=>x.role==='occlusion'),false);
    assert.ok(allLayers(p,'objects').length>0);
    const projectedObjects=allLayers(p,'objects');
    const outlines=projectedObjects.filter(x=>x.metadata.kind==='physical-object-stroke');
    const fills=projectedObjects.filter(x=>x.metadata.kind==='physical-object-fill');
    assert.equal(outlines.length,r.stats.visibleSegments);
    assert.equal(fills.length,r.stats.fillTriangles);
    assert.ok(fills.length>0);
    assert.ok(outlines.every(x=>x.type==='line'&&x.mode===1&&x.metadata.opticalSourceIndex>=0));
    assert.ok(fills.every(x=>x.type==='polygon'&&x.mode===2&&x.points.length===3&&
      x.metadata.opticalSourceIndex>=0));
    assert.ok(new Set(allLayers(p,'objects').map(x=>x.metadata.objectLayer)).has('objects-1'),
      'the second/large tower bank must not be starved');
    assert.equal(r.stats.budgetExceeded,false);
    assert.ok(r.stats.buildMs<2000,'vacuum optics must not block for the old 3500 ms budget');
  }
});
test('108: analytic vacuum angles agree with independent shooting for both Earth shapes',()=>{
  const h0=15,ht=35;
  for(const geometry of ['flat','globe'])for(const d of [1000,3000,8000]){
    const theta=d/R;
    const dest=geometry==='flat'?[d,ht]:[(R+ht)*Math.sin(theta),(R+ht)*Math.cos(theta)-R];
    const expected=target.solve({geometry,radius:R,observerHeight:h0,target:dest,atmosphere:'vacuum'});
    const actual=optics.vacuumSample(geometry,R,h0,d,ht);
    assert.equal(actual.status,'visible');
    close(actual.angle,expected.angle,1e-11);
  }
  assert.equal(optics.vacuumSample('globe',R,15,200000,0).status,'blocked');
  assert.equal(optics.vacuumSample('flat',R,15,200000,0).status,'visible');
});
test('108: optical scene is camera independent and invalidated by atmosphere and observer height',()=>{
  const m=model({NObjects:[2,1]}),c=compose.composeOpticalMain(m,true);
  const a=optics.create(),r=a.transform(c,m,{atmosphere:'vacuum'});
  assert.equal(a.transform(c,m,{atmosphere:'vacuum'}).reused,true);
  assert.deepEqual(a.transform(c,m,{atmosphere:'vacuum'}).composition,r.composition);
  const withUpdatedGuides=model({NObjects:[2,1],PanRad:0.1});
  const reused=a.transform(compose.composeOpticalMain(withUpdatedGuides,true),withUpdatedGuides,{atmosphere:'vacuum'});
  assert.equal(reused.reused,true);
  assert.deepEqual(allLayers(reused.composition,'visual-aid'),allLayers(r.composition,'visual-aid'),
    'Optically projected ground guides do not depend on camera pan');
  const s=a.transform(c,m,{atmosphere:'standard',settings:{maxBuildMs:0,maximumDepth:1}});
  assert.equal(s.reused,false);
  assert.ok(s.stats.unresolved>0);
  assert.equal(s.stats.visibleSegments,0);
  const m2=model({NObjects:[2,1],Height:16});
  assert.equal(a.transform(compose.composeOpticalMain(m2,true),m2,{atmosphere:'vacuum'}).reused,false);
});
test('108: opt-in physical mode calls shared painter, not dedicated tower Canvas, with camera transform restoration',()=>{
  const operations=[];
  const ctx={save(){operations.push('save')},restore(){operations.push('restore')},
    setTransform(...args){operations.push(['transform',...args])},clearRect(){operations.push('clear')},
    beginPath(){},moveTo(){},lineTo(){},stroke(){operations.push('stroke')},closePath(){},fill(){}};
  const canvas={width:320,height:240,getContext(){return ctx}};
  const g={Canvas:canvas,Camera:{},WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:160,OffsetY:120},
    ContextScale:1,AutoScalePix:true,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(n){this.CameraClipPlaneDist=n},SetWindowToCameraScreen(){},
    SetCamera(c){this.Camera={...c,ScreenSize:1,ObjectZExtend:0,Zoom:1}},
    SetCameraZoom(n){this.Camera.Zoom=n}};
  const result=main.renderPhysical(g,{...model({showModel:2,NObjects:[1,1],showGrid:0}),
    camViewAngle:1*Math.PI/180,deviceRatio:1.5,Pan:0,Nick:0,Roll:0,viewcenterHorizon:3},{atmosphere:'vacuum'});
  assert.equal(result.mode,'physical-scene');
  assert.ok(result.drawn>0);
  assert.ok(result.layerCounts.some(x=>x.name==='surface-guides'));
  assert.ok(operations.includes('clear'));
  assert.ok(operations.includes('stroke'));
  assert.deepEqual(operations.filter(x=>Array.isArray(x)&&x[0]==='transform')[0],
    ['transform',1,0,0,1,0,0]);
  assert.equal(operations.filter(x=>x==='save').length,operations.filter(x=>x==='restore').length);
});
test('108: entrypoint loads scene optics before shared main renderer and keeps Legacy default',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../CurvatureApp.html'),'utf8');
  assert.ok(html.includes('src/optics/CurvaturePhysicalSceneOptics.js'));
  assert.ok(html.indexOf('CurvaturePhysicalSceneOptics.js')<html.indexOf('CurvatureMainCanvasRenderer.js'));
  assert.match(html,/<option value="legacy" selected>Legacy/);
  assert.match(html,/<option value="physical">Physical optics/);
});

test('140.12.10: real physical adaptive scene is rendered with injected GPU samples and CPU fallback',()=>{
  const m=model({showModel:2,NObjects:[1,1],showGrid:0});
  const source=compose.composeOpticalMain(m,false,{physicalWorld:true});
  const captured=[];
  const settings={maximumDepth:1,maxSamples:200,fieldAdaptiveDepth:0,step:100};
  const cpu=optics.create().transform(source,m,{atmosphere:'standard',settings,
    onExactTarget:(d,h)=>captured.push([d,h])});
  assert.ok(captured.length>=16,'record real solver calls, not static fixture');
  assert.ok(cpu.stats.visibleSegments>0);
  const first=captured[0],key=first.map(v=>v.toPrecision(13)).join(',');
  let gpuReads=0,cpuFallbackReads=0;
  const injected={request:{geometry:'flat',radius:m.rEarth,observerHeight:m.Height,atmosphere:'standard'},
    sample(d,h){if(d.toPrecision(13)+','+h.toPrecision(13)===key){gpuReads++;return {
      status:'blocked',angle:0,method:'gpu-experimental'};}cpuFallbackReads++;return null;},
    exact(d,h){return this.sample(d,h);},
    stats(){return {gpuHits:gpuReads,cpuFallbackRequests:cpuFallbackReads};}};
  const session=optics.create();
  const gpu=session.transform(source,m,{atmosphere:'standard',settings,experimentalRayField:injected});
  assert.equal(gpu.reused,false);
  assert.ok(gpuReads>0,'real silhouettes/fills/ground should consult GPU-derived sample');
  assert.ok(cpuFallbackReads>0,'unseeded adaptive ray requests use CPU fallback');
  assert.ok(gpu.stats.fieldStats.experimentalGpu.gpuHits>0);
  assert.equal(session.transform(source,m,{atmosphere:'standard',settings}).reused,false,
    'experimental GPU composition must not poison ordinary CPU cache');
  assert.throws(()=>optics.create().transform(source,m,{atmosphere:'vacuum',experimentalRayField:injected}),
    /does not match/);
  assert.throws(()=>optics.create().transform(source,{...m,Height:m.Height+1},
    {atmosphere:'standard',settings,experimentalRayField:injected}),/does not match/);
});

test('140.12.10: real CPU field discovery is replayed through selected GPU oracle seeds',()=>{
  const compare=require('../src/ui/modern/ModernCompareModel');
  const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
  const m=model({showModel:2,NObjects:[1,1],showGrid:0});
  const composition=compose.composeOpticalMain(m,false,{physicalWorld:true});
  const settings={maximumDepth:1,maxSamples:200,fieldAdaptiveDepth:0,step:100};
  const requests=[];
  optics.create().transform(composition,m,{atmosphere:'standard',settings,
    onExactTarget:(d,h)=>requests.push([d,h])});
  const bundle=compare.gpuFieldRequest(m,requests,32,surfaces,'first-forward-x');
  assert.ok(bundle.selected.length>=16);
  const gpuResponse={results:bundle.selected.map(q=>({target:q.target,status:'visible',angle:0,residual:0}))};
  const field=compare.gpuRayField(bundle,gpuResponse);
  const result=optics.create().transform(composition,m,{atmosphere:'standard',settings,
    experimentalRayField:field});
  const stats=result.stats.fieldStats.experimentalGpu;
  assert.ok(stats.gpuHits>0,'selected real CPU oracle requests must be consumed by GPU-assisted frame');
  assert.ok(stats.cpuFallbackRequests>0,'unseeded requests cannot silently be treated as GPU');
  assert.ok(result.stats.visibleSegments>=0);
  assert.equal(result.reused,false);
});


test('140.12.11: real physical optics can replay selected CPU oracle results through the seeded field',()=>{
  const compare=require('../src/ui/modern/ModernCompareModel');
  const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
  const m=model({showModel:2,NObjects:[1,1],showGrid:0});
  const composition=compose.composeOpticalMain(m,false,{physicalWorld:true});
  const settings={maximumDepth:1,maxSamples:200,fieldAdaptiveDepth:0,step:100};
  const requests=[],records=[];
  const reference=optics.create().transform(composition,m,{atmosphere:'standard',settings,
    onExactTarget:(d,h)=>requests.push([d,h]),
    onExactResult:(d,h,result)=>records.push({d,h,result})});
  const bundle=compare.gpuFieldRequest(m,requests,32,surfaces,'first-forward-x');
  const replay=compare.cpuReplayField(bundle,records);
  assert.ok(replay.stats().seeds>0);
  const controlled=optics.create().transform(composition,m,{atmosphere:'standard',settings,
    experimentalRayField:replay});
  assert.ok(replay.stats().replayExactHits>0);
  assert.ok(controlled.stats.visibleSegments>=0);
  assert.equal(controlled.reused,false);
  assert.ok(reference.stats.fieldStats.solves>0);
});

test('140.12.11: CPU exact output hook captures real f64 records without poisoning scene cache',()=>{
  const m=model({showModel:2,NObjects:[1,1],showGrid:0});
  const scene=compose.composeOpticalMain(m,false,{physicalWorld:true});
  const settings={maximumDepth:1,maxSamples:200,fieldAdaptiveDepth:0,step:100};
  const originals=[];
  const session=optics.create();
  const observed=session.transform(scene,m,{atmosphere:'standard',settings,
    onExactResult:(d,h,result)=>originals.push({d,h,result})});
  assert.equal(observed.reused,false);
  assert.ok(originals.length>5);
  assert.ok(originals.every(r=>r.result&&Object.isFrozen(r.result)));
  assert.ok(originals.some(r=>r.result.method==='exact'));
  const ordinary=session.transform(scene,m,{atmosphere:'standard',settings});
  assert.equal(ordinary.reused,false,'capture-only render must not poison the regular CPU cache');
});


test('140.12.12: physical scene renderer accepts a GPU-first grid directly without CPU shooting',()=>{
  const compare=require('../src/ui/modern/ModernCompareModel');
  const surfaces=require('../src/geometry/CurvatureSurfaceGeometry');
  const silhouette=require('../src/optics/OpticalTowerSilhouette');
  const m=model({showGrid:0,NObjects:[2,1]});
  const composed=compose.composeOpticalMain(m,true,{physicalWorld:true});
  const grid=compare.gpuFirstGrid(m,128,{composition:compose,silhouette,surfaces,
    branch:'first-forward-x'});
  const answer={results:grid.request.targets.map(t=>({target:t,status:'visible',
    angle:Math.atan2(t[1]-m.Height,t[0]),residual:0}))};
  const field=compare.gpuFirstRayField(grid,answer,surfaces);
  const result=optics.create().transform(composed,m,{atmosphere:'standard',
    experimentalRayField:field,settings:{minimumDepth:0,maximumDepth:1,
      maxSamples:200,fieldAdaptiveDepth:0,step:100}});
  assert.ok(result.composition.scene.primitives.length>0);
  assert.equal(result.stats.fieldStats.shootRK4Calls,0);
  assert.equal(result.stats.fieldStats.exactSolveMs,0);
  assert.equal(result.stats.fieldStats.experimentalGpu.cpuFallbackRequests,0);
  assert.ok(result.stats.fieldStats.experimentalGpu.gpuHits>0);
  assert.throws(()=>optics.create().transform(composed,{...m,Height:16},
    {atmosphere:'standard',experimentalRayField:field}),/does not match/);
});
