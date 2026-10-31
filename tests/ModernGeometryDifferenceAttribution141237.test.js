'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const audit=require('../src/diagnostics/CurvatureGeometryDifferenceAttribution141237');
const tower=require('../src/optics/OpticalTowerSilhouette');
const fills=require('../src/optics/CurvaturePhysicalPolygonFills');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const compose=require('../src/scene/CurvatureIndependentComposition');
const benchmark=require('../tools/benchmark-adaptive-prism-112');
const cam={pos:[0,0,0],center:[0,1000,0],up:[0,0,1],sceneSize:2,
  screenSize:2,objectZExtend:0,zoom:1,near:1e-5};
const line={type:'line',mode:1,metadata:{kind:'physical-object-stroke',opticalSourceIndex:42,objectLayer:'tower'},
  points:[[0,1000,0],[0,1000,10]]};
const triangle={type:'polygon',mode:2,metadata:{kind:'physical-object-fill',opticalSourceIndex:43,objectLayer:'tower'},
  points:[[-10,1000,0],[10,1000,0],[0,1000,20]]};
function captured(variant,ps){const c=audit.collector('actual-camera',variant);
  c.onCamera(cam,320,240);c.onScene({primitives:ps});return c;}
test('140.12.37: source-linked comparison identifies missing outline / fill signatures and counts',()=>{
  const a=captured('cpu',[line,triangle]).result();
  const b=captured('baseline',[line]).result();
  const c=audit.comparePair(a,b);
  assert.equal(c.totals.cpuOutlines,1);assert.equal(c.totals.cpuFills,1);
  assert.equal(c.totals.gpuFills,0);
  assert.ok(c.totals.cpuOnlySignatures>=1);
  assert.equal(c.bySource.find(x=>x.source==='tower#43').cpuFills,1);
  assert.equal(c.bySource.find(x=>x.source==='tower#43').gpuFills,0);
  assert.ok(audit.projected(a).length>audit.projected(b).length);
});
test('140.12.37: rejected optical leaves carry originating physical d/h and source index',()=>{
  const events=[],r=tower.projectPrimitives({primitives:[{type:'line',points:[[0,1000,0],[0,1000,15]]}],
    geometry:'flat',radius:6371000,observerHeight:0,
    field:{sample:()=>({status:'indeterminate',reason:'grazing'})},
    onUnresolved:x=>events.push(x)});
  assert.ok(r.stats.unresolvedLeaves>0);assert.equal(events.length,r.stats.unresolvedLeaves);
  assert.equal(events[0].source.primitiveIndex,0);
  assert.equal(events[0].queries[0].distance,1000);
  assert.equal(events[0].queries[0].status,'indeterminate');
  const rejects=[];
  const f=fills.project({polygons:[{type:'polygon',mode:2,commandIndex:43,
    points:[[0,1000,0],[10,1000,0],[0,1000,10]]}],
    field:{sample:()=>({status:'indeterminate',reason:'grazing'})},geometry:'flat',
    radius:6371000,observerHeight:0,maximumDepth:1,maxSamples:10000,
    onUnresolved:x=>rejects.push(x)});
  assert.equal(f.stats.unresolvedTriangles,rejects.length);
  assert.ok(rejects.length>0);
  assert.equal(rejects[0].sourceId,43);
  assert.ok(rejects[0].queries.some(x=>x.distance>0&&x.height>=0&&x.status==='indeterminate'));
});
test('140.12.37: collector applies bounded rejected query export but exact per-source totals',()=>{
  const c=captured('cpu',[line]);
  for(let i=0;i<505;i++)c.onUnresolved({phase:'outline',sourceId:42,objectLayer:'tower',reason:'grazing-uncertainty',
    queries:[{distance:1000,height:i,world:[0,1000,i],status:'indeterminate'}]});
  const r=c.result();assert.equal(r.rejectedTotal,505);assert.equal(r.rejected.length,500);
  assert.equal(r.rejectedBySource['tower#42'].outline,505);
  assert.equal(r.rejected[0].queries[0].distance,1000);
  assert.equal(r.rejectedTruncated,true);
});
test('140.12.37: full scene transform emits actual painted primitive sources without changing renderer',()=>{
  const m=benchmark.model(2,'flat'),c=audit.collector('actual-camera','cpu');
  c.onCamera(cam,320,240);
  const result=optics.create().transform(compose.composeOpticalMain(m,false),m,
    {atmosphere:'vacuum',geometryAudit:c});
  const capturedScene=c.result();
  const expected=result.composition.scene.primitives.filter(p=>
    p.metadata&&['physical-object-fill','physical-object-stroke'].includes(p.metadata.kind));
  assert.equal(capturedScene.objects.length,expected.length);
  assert.ok(capturedScene.objects.some(p=>p.kind==='fill'));
  assert.ok(capturedScene.objects.some(p=>p.kind==='outline'));
  assert.ok(audit.projected(capturedScene).length>0);
  const plain=optics.create().transform(compose.composeOpticalMain(m,false),m,{atmosphere:'vacuum'});
  assert.deepEqual(result.composition.scene.primitives,plain.composition.scene.primitives,
    'capturing physical geometry must not change the actual painter inputs');
});
test('140.12.37: ZIP includes source diagnostics and per-camera geometry overlays',()=>{
  const variants={cpu:captured('cpu',[line,triangle]).result(),
    baseline:captured('baseline',[line]).result(),strict:captured('strict',[line]).result(),
    strictDirect:captured('strictDirect',[line]).result()};
  const captures=['tilt-up','tilt-down','narrow-field','actual-camera'].map(id=>({id,variants}));
  const pixels=captures.map(item=>({id:item.id,variants:{baseline:{pixelDiff:{tiles:[]}},
    strict:{pixelDiff:{tiles:[]}},strictDirect:{pixelDiff:{tiles:[]}}}}));
  const report=audit.compareAll(captures,pixels);
  assert.equal(report.cases.length,4);
  assert.equal(report.cases[0].comparisons.baseline.totals.cpuFills,1);
  assert.equal(report.comparisonQuantumRadians,2e-6);
  assert.ok(report.cases[0].comparisons.baseline.bySource[0].screenFootprint);
  const doc={createElement(name){assert.equal(name,'canvas');return {width:0,height:0,
    getContext(){return {fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}};},
    toDataURL(){return 'data:image/png;base64,iVBORw0KGgo=';}};}};
  const files=audit.entries(captures,doc);
  assert.equal(files.filter(x=>x.name.endsWith('edges.png')).length,8);
  assert.equal(files.filter(x=>x.name.endsWith('unresolved-queries.json')).length,4);
  assert.ok(files.some(x=>x.name==='geometry/README.txt'));
});
test('140.12.37: new callback is strictly opt-in and browser runs candidate geometry before CPU',()=>{
  const root=path.resolve(__dirname,'..');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  assert.match(html,/CurvatureGeometryDifferenceAttribution141237\.js\?v=140\.12\.37/);
  assert.match(app,/state\.probeGeometryAudit=geometryAudit\.collector\(config\.id,name\)/);
  assert.match(app,/state\.probeGeometryAudit=geometryAudit\.collector\(measurement\.id,'cpu'\)/);
  assert.match(app,/geometryAudit\.compareAll\(geometryCases,cases\)/);
  assert.match(app,/curvature-compare-140\.12\.37-geometry-attribution\.zip/);
  assert.match(app,/state\.probeGeometryAudit=null;/);
  const opticsSource=fs.readFileSync(path.join(root,'src/optics/CurvaturePhysicalSceneOptics.js'),'utf8');
  assert.match(opticsSource,/if\(options\.geometryAudit&&typeof options\.geometryAudit\.onScene/);
  assert.match(opticsSource,/onUnresolved:options\.geometryAudit&&/);
});
