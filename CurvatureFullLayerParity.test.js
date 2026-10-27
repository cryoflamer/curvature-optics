'use strict';
// Regression for diagnostic (32): the white disk occluded the independently
// generated globe grid because composeFull placed the disk after that grid.
const assert=require('node:assert/strict');
const {test}=require('node:test');
const engine=require('./CurvatureGeometryEngine');
const composition=require('./CurvatureIndependentComposition');
const base={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[0,3],
 ObjDist:[0,1500],ObjDeltaDist:[0,500],ObjSidePos:[0,0],ObjSideVar:[0,0],
 ObjSideType:[0,0],ObjSize:[0,64],ObjSizeVar:[0,0],ObjSizeType:[0,0],
 rDisk:400,zDisk:3,hDip:1,rFEarth:1000,showGrid:3,
 hDisk:100,aDip:.05,aDelta:.02,sceneWidth:500,PanRad:0,
 showTangent:true,showData:false,FEEqCol:'blue',FEGridCol:'gray',
 GlobeGridCol:'green',GlobeFGridCol:'yellow',TangentCol:'red'};
const slice=(result,name)=>{
 const r=result.ranges.find(x=>x.name===name);
 assert(r,`missing layer ${name}`);
 return result.scene.primitives.slice(r.start,r.end);
};
test('Globe disk is before the independently generated surface grid',()=>{
 const frame=composition.composeFull(base,1,true,{segments:32});
 assert.equal(composition.auditFull(frame).rendererReady,true);
 assert.deepEqual(frame.ranges.map(x=>x.name),
  ['behind','mask','surface-guides','outline','horizon-guides','before']);
 assert(slice(frame,'behind').length>0);
 assert.equal(slice(frame,'mask').length,1);
 assert(slice(frame,'surface-guides').some(x=>x.metadata.projection==='globe'));
 assert(slice(frame,'surface-guides').some(x=>x.metadata.projection==='plane'));
 assert(frame.ranges.find(x=>x.name==='mask').end<=frame.ranges.find(x=>x.name==='surface-guides').start);
 // The visible globe horizon line belongs to horizon-guides, not a second outline.
 assert.equal(slice(frame,'outline').length,0);
 assert.equal(slice(frame,'horizon-guides').filter(x=>x.metadata.kind==='globe-horizon').length,1);
});
test('No white occlusion disk is drawn when no object is behind the horizon',()=>{
 const m={...base,ObjDist:[0,100],ObjDeltaDist:[0,50]};
 const frame=composition.composeFull(m,1,true,{segments:32});
 assert.equal(slice(frame,'behind').length,0);
 assert.equal(slice(frame,'mask').length,0);
 assert.equal(composition.auditFull(frame).rendererReady,true);
 assert.equal(engine.createObjectHorizonComposition(m,1,true).mask.primitives.length,0);
});
test('Flat equator rings appear once and retain legacy stroke widths',()=>{
 const frame=composition.composeFull(base,1,false,{segments:32});
 assert.deepEqual(frame.ranges.map(x=>x.name),
  ['surface-guides','behind','mask','outline','before']);
 assert.equal(slice(frame,'outline').length,0);
 assert.equal(slice(frame,'mask').length,0);
 const rings=slice(frame,'surface-guides').filter(x=>x.metadata.kind==='equator');
 assert.deepEqual(rings.map(x=>x.metadata.radius),[base.rFEarth,2*base.rFEarth]);
 assert.deepEqual(rings.map(x=>x.style.lineWidth),[1,2]);
 assert.equal(composition.auditFull(frame).rendererReady,true);
});
test('Partial composition keeps its dedicated horizon outline',()=>{
 const partial=composition.compose(base,1,true,{segments:32});
 assert.equal(composition.audit(partial).rendererReady,true);
 assert(slice(partial,'outline').length===1);
});

test('Circular guides close without accidentally closing latitude polylines',()=>{
 const flat=engine.flatSurfaceGuides(base,{segments:24});
 assert(flat.primitives.filter(x=>x.type==='polygon').every(x=>x.closed===true));
 const globe=engine.globeSurfaceGuides(base);
 assert(globe.primitives.every(x=>x.closed!==true));
 const guides=engine.globeHorizonGuides(base,{segments:24});
 assert(guides.primitives.filter(x=>x.type==='polygon').every(x=>x.closed===true));
 const horizon=engine.createHorizonScenes(base,{globe:true,segments:24});
 assert.equal(horizon.outline.primitives[0].closed,true);
});
