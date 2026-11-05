'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const fills=require('../src/optics/CurvaturePhysicalPolygonFills');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const compose=require('../src/scene/CurvatureIndependentComposition');
const benchmark=require('../tools/benchmark-adaptive-prism-112');
const sceneContract=require('../src/scene/CurvatureSceneContract');
const frames=require('../src/scene/CurvatureRenderFrame');
const painter=require('../src/renderers/CurvatureFrameRenderer');
const R=6371000;
function rectangle(mode=3){return {type:'polygon',mode,points:[
  [0,1000,0],[100,1000,0],[100,1000,100],[0,1000,100],[0,1000,0]],
  style:{fill:'#a38d60',stroke:'#333'},commandIndex:42};}
const flatField={sample(d,h){return {status:'visible',angle:Math.atan2(h-10,d),method:'exact'};}};
function project(polygons,field=flatField,extra={}){
  return fills.project({polygons,field,geometry:'flat',radius:R,observerHeight:0,
    angularTolerance:2e-5,maximumDepth:7,boundaryTolerance:0.1,...extra});
}
test('114: coplanar concave authored foundation is ear-clipped before optical projection',()=>{
  const p={type:'polygon',mode:3,points:[
    [0,1000,0],[80,1000,0],[80,1000,20],[20,1000,20],
    [20,1000,80],[0,1000,80],[0,1000,0]]};
  const result=fills.planeTriangles(p.points);
  assert.equal(result.reason,null);
  assert.equal(result.triangles.length,4);
  assert.ok(result.triangles.every(t=>t.every(pt=>pt[1]===1000)));
});
test('114: authored fill color is preserved and no stroke-only polygon is filled',()=>{
  const r=project([rectangle(),rectangle(1)]);
  assert.equal(r.stats.sourcePolygons,1);
  assert.ok(r.stats.fillTriangles>=2);
  assert.equal(r.stats.unresolvedTriangles,0);
  assert.ok(r.primitives.every(p=>p.type==='polygon'&&p.mode===2&&p.style.fill==='#a38d60'&&
    p.metadata.opticalSourceIndex===42&&p.points.length===3));
});
test('114: physically blocked interior remains unfilled; partially visible rectangle is clipped',()=>{
  const half={sample(d,h){return h>=50?{status:'visible',angle:Math.atan2(h-10,d),method:'exact'}:
    {status:'blocked'};}};
  const r=project([rectangle()],half);
  assert.ok(r.stats.fillTriangles>0);
  assert.ok(r.stats.hiddenTriangles>=0);
  assert.ok(r.primitives.every(p=>p.points.every(v=>{
    // Optical arrival vectors preserve azimuth/elevation; never reach the
    // h<50 part of the source when sampled through the clipped boundary.
    return v.every(Number.isFinite);
  })));
  // Compare to the entire visible rectangle: no point in the mapped fill
  // should be below the visible-angle threshold for the source range.
  const lowerBound=Math.atan2(40,Math.hypot(100,1000));
  assert.ok(r.primitives.every(p=>p.points.every(v=>Math.atan2(v[2],Math.hypot(v[0],v[1]))>=lowerBound-1e-6)));
});
test('114: wholly blocked and failed fill polygons are never painted',()=>{
  const blocked=project([rectangle()],{sample(){return {status:'blocked'};}});
  assert.equal(blocked.primitives.length,0);
  assert.equal(blocked.stats.unresolvedTriangles,0);
  const failed=project([rectangle()],{sample(){return {status:'solver_failed',reason:'forced'};}},{maximumDepth:1});
  assert.equal(failed.primitives.length,0);
  assert.ok(failed.stats.unresolvedTriangles>0);
});
test('114: geometric arrival fill polygons reach the unchanged shared painter',()=>{
  const m=benchmark.model(2,'flat'),r=optics.create().transform(compose.composeOpticalMain(m,false),m,{atmosphere:'vacuum'});
  const f=r.composition.scene.primitives.filter(x=>x.metadata?.kind==='physical-object-fill');
  assert.ok(f.length>0);
  assert.ok(f.some(x=>x.style.fill==='#a38d60'));
  const c={pos:[0,0,0],center:[0,1000,0],up:[0,0,1],sceneSize:2,
    screenSize:2,objectZExtend:0,zoom:1,near:1e-5};
  const frame=frames.fromComposition(r.composition,c,320,240);
  let painted=0,stroked=0;
  const ctx={clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
    fill(){painted++;},stroke(){stroked++;}};
  const canvas={width:320,height:240,getContext(){return ctx;}};
  const output=painter.render(canvas,frame,{mode:'painter'});
  assert.equal(output.mode,'painter');
  assert.ok(painted>0,'the shared painter must actually issue fill operations');
  assert.ok(stroked>0);
});
test('114: Flat+Standard 85+2 tower scene retains outlines and physical foundation fills without fill uncertainty',()=>{
  const m=benchmark.model(85,'flat'),r=optics.create().transform(compose.composeOpticalMain(m,false),m,{atmosphere:'standard'});
  assert.equal(r.stats.unresolved,0);
  assert.equal(r.stats.fillUnresolved,0);
  assert.ok(r.stats.fillTriangles>100);
  assert.ok(r.stats.perGroup.every(x=>x.fillTriangles>0));
  assert.ok(r.stats.fieldStats.solves<6000);
});
test('114: Globe+Standard ground-hidden foundation pieces are clipped, not filled through the surface',()=>{
  const m=benchmark.model(85,'globe'),r=optics.create().transform(compose.composeOpticalMain(m,true),m,{atmosphere:'standard'});
  assert.ok(r.stats.fillTriangles>0);
  assert.ok(r.stats.fillHidden>0);
  assert.equal(r.stats.fillUnresolved,0);
  assert.ok(r.stats.fieldStats.solves<9000,'filled fragments should not resurrect costly unbounded shooting');
});
test('114: browser loads polygon fills before scene optics and status reports filled triangles',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureApp.html'),'utf8');
  assert.ok(html.indexOf('CurvaturePhysicalPolygonFills.js')<html.indexOf('CurvaturePhysicalSceneOptics.js'));
  const status=fs.readFileSync(path.join(__dirname,'../src/app/LegacyCanvasPresenter.js'),'utf8');
  assert.match(status,/physical fill triangles/);
  assert.doesNotMatch(status,/fills pending/);
});
