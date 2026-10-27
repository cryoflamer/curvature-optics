'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const html=fs.readFileSync(__dirname+'/../CurvatureApp.html','utf8');
const start=html.indexOf('function DrawShape( objIx, g, m ) {');
const end=html.indexOf('\nfunction ',start+10);
assert.ok(start>=0&&end>start);
const ctx={document:{getElementById:()=>({checked:true})},window:{}};
vm.runInNewContext(html.slice(start,end)+'\nthis.drawShape=DrawShape;',ctx);
function legacy(type,hidden){
 const actual=[];
 let fill;
 const graph={
   SetBgColor:c=>{fill=c;},
   PolygonOnPlane:(xs,ys,mode=1)=>actual.push({type:'polygon',points:xs.map((x,i)=>[x,ys[i]]),mode,style:{fill}}),
   LineOnPlane:(x1,y1,x2,y2)=>actual.push({type:'line',points:[[x1,y1],[x2,y2]]}),
   RectOnPlane:(x1,y1,x2,y2,mode=1)=>actual.push({type:'polygon',points:[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]],mode,style:{fill}})
 };
 ctx.drawShape(0,graph,{ObjType:[type,3],isHiddenObj:[hidden,false]});
 return JSON.parse(JSON.stringify(actual));
}
for(const type of [1,2])for(const hidden of [false,true]){
 const actual=engine.localObject(type,0,hidden);
 assert.deepEqual(actual,legacy(type,hidden),`type ${type} hidden ${hidden}`);
 assert.equal(actual.length,type===1?8:6);
}
assert.throws(()=>engine.localObject(4,0,false),/not been independently ported/);
const params={geometryRadius:6371000,height:3,objectSize:30,longitude:.01,latitude:0,verticalScale:1,horizontalScale:1,globe:true};
const scene=engine.createPlacedObjectScene(params,2,0,false);
assert.equal(scene.primitives.length,6);
assert.equal(scene.metadata.objectType,2);
assert.equal(scene.primitives[1].points.length,2);
assert.deepEqual(engine.localObject(3,0,false),engine.localTowerType1());
console.log('CurvatureSimpleObjects: passed');
