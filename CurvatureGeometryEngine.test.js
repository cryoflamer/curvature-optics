'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('./CurvatureGeometryEngine');
const shapes=engine.localTowerType2();
assert.equal(shapes.length,11);
assert.equal(shapes.filter(p=>p.type==='polygon').length,8);
assert.equal(shapes.filter(p=>p.type==='line').length,3);
// Reference DrawShape is executed with a minimal fake graph; no browser renderer.
// The reference is only used in the TEST, not by the new generator.
const html=fs.readFileSync(__dirname+'/CurvatureApp.html','utf8');
const start=html.indexOf('function DrawShape( objIx, g, m ) {');
const end=html.indexOf('\nfunction ',start+10);
assert.ok(start>=0&&end>start);
const context={document:{getElementById:()=>({checked:true})},window:{}};
vm.runInNewContext(html.slice(start,end)+'\nthis.drawShape=DrawShape;',context);
const actual=[];
const graph={
  PolygonOnPlane:(xs,ys,mode=1)=>actual.push({type:'polygon',points:xs.map((x,i)=>[x,ys[i]]),mode}),
  LineOnPlane:(x1,y1,x2,y2)=>actual.push({type:'line',points:[[x1,y1],[x2,y2]]}),
  SetBgColor:()=>{}
};
context.drawShape(1,graph,{ObjType:[3,3],isHiddenObj:[false,false]});
assert.deepEqual(JSON.parse(JSON.stringify(actual.map(({type,points,mode})=>({type,points,...(mode===undefined?{}:{mode})})))),shapes.map(({type,points,mode})=>({type,points,...(mode===undefined?{}:{mode})})));
const plane={origin:[10,20,30],xAxis:[2,0,0],yAxis:[0,0,5]};
const scene=engine.createTowerType2Scene(plane,{case:'fixture'});
assert.equal(scene.primitives.length,11);
assert.deepEqual(scene.primitives[0].points[0],[9.76,20,30.4]);
assert.equal(scene.metadata.case,'fixture');
plane.origin[0]=999;
assert.deepEqual(scene.primitives[0].points[0],[9.76,20,30.4]);
assert.throws(()=>engine.createTowerType2Scene({origin:[0,0,0],xAxis:[1,0,0],yAxis:[NaN,0,1]}),/Finite plane/);
assert.throws(()=>engine.placeOnPlane(shapes,{}),/Finite plane/);
console.log('CurvatureGeometryEngine: passed');
