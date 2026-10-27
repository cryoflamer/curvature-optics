'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const html=require('./helpers/readCurvatureSources')();
const start=html.indexOf('function DrawShape( objIx, g, m ) {');
const end=html.indexOf('\nfunction ',start+10);
assert.ok(start>=0&&end>start);
const ctx={document:{getElementById:()=>({checked:true})},window:{}};
vm.runInNewContext(html.slice(start,end)+'\nthis.drawShape=DrawShape;',ctx);
function trace(drawn,total,hidden){
 const ops=[];
 let fill=null,alpha=1;
 const g={
  SetBgColor:c=>{fill=c;},SetColor:c=>ops.push({kind:'color',value:c}),
  SetAlpha:a=>{alpha=a;ops.push({kind:'alpha',value:a});},
  OpenPath3D:()=>ops.push({kind:'open'}),Path3D:mode=>ops.push({kind:'path',mode,fill,alpha}),
  ArcOnPlane:(x,y,r,start,end)=>ops.push({kind:'arc',x,y,r,start,end}),
  CircleOnPlane:(x,y,r,mode)=>ops.push({kind:'circle',x,y,r,mode}),
  PolygonOnPlane:(xs,ys,mode)=>ops.push({kind:'polygon',xs:Array.from(xs),ys:Array.from(ys),mode}),
  RectOnPlane:(x1,y1,x2,y2,mode)=>ops.push({kind:'rect',x1,y1,x2,y2,mode,fill,alpha}),
  LineOnPlane:(x1,y1,x2,y2)=>ops.push({kind:'line',points:[[x1,y1],[x2,y2]]})
 };
 ctx.drawShape(0,g,{ObjType:[0,3],NObjects:[total,0],NObjectsDrawn:[drawn,0],isHiddenObj:[hidden,false]});
 return ops;
}
for(const hidden of [false,true]){
 const bridge=trace(0,3,hidden),geo=engine.localBedford(0,3,hidden);
 assert.deepEqual(bridge.map(x=>x.kind),['color'].filter(()=>false).concat(['open','arc','polygon','path','rect','rect']));
 assert.equal(geo.length,3);
 assert.equal(geo[0].style.fill,hidden?'#ccc':'#aaa');
 assert.deepEqual(geo[0].points.slice(-6),bridge[2].xs.map((x,i)=>[x,bridge[2].ys[i]]));
 assert.deepEqual(geo.slice(1).map(p=>p.style.fill),['white',hidden?'#444':'black']);
 assert.ok(Math.abs(geo[0].points[0][0]-.8)<1e-12);
 assert.ok(Math.abs(geo[0].points[32][0]+.8)<1e-12);
 const rod=trace(1,3,hidden),rg=engine.localBedford(1,3,hidden);
 assert.deepEqual(rod.map(x=>x.kind),['rect','circle']);
 assert.equal(rg.length,2);
 assert.deepEqual(rg[0].points.slice(0,4),[[-.025,0],[.025,0],[.025,1],[-.025,1]]);
 assert.equal(rg[1].points.length,64);
 assert.equal(rg[1].style.fill,hidden?'#f44':'red');
 const scope=trace(2,3,hidden),sg=engine.localBedford(2,3,hidden);
 assert.deepEqual(scope.map(x=>x.kind),['alpha','rect','open','circle','circle','path','alpha','color','line','line','line','line','line']);
 assert.equal(sg.length,70);
 assert.equal(sg[0].style.alpha,.3);
 assert.equal(sg[1].style.alpha,.3);
 assert.deepEqual(sg.slice(-5).map(p=>p.points),scope.slice(-5).map(p=>p.points));
 assert.ok(sg.slice(-5).every(p=>p.style.stroke==='orange'));
 assert.ok(sg.slice(1,65).every(p=>p.type==='polygon'&&p.points.length===5));
 assert.equal(engine.localObject(0,0,hidden,{drawn:1,total:3}).length,2);
}
assert.equal(engine.localBedford(1,2,false).length,2); // no scope with only two markers
assert.equal(engine.localBedford(0,1,false).length,3);
assert.throws(()=>engine.localBedford(-1,3,false),/sequence/);
assert.throws(()=>engine.localBedford(3,3,false),/sequence/);
assert.throws(()=>engine.localBedford(1,3,false,{segments:7}),/resolution/);
assert.throws(()=>engine.localObject(0,0,false),/sequence context/);
const params={geometryRadius:6371000,height:4,objectSize:10,longitude:.01,latitude:0,verticalScale:1,horizontalScale:1,globe:true};
const placed=engine.createPlacedObjectScene(params,0,0,false,{drawn:1,total:3});
assert.equal(placed.primitives.length,2);
assert.ok(placed.primitives.every(p=>p.points.every(v=>v.length===3&&v.every(Number.isFinite))));
console.log('CurvatureBedford: passed');
