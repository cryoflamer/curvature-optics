'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const viewer=require('../src/ui/modern/ModernLandmarkViewer');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const editor=require('../src/ui/modern/ModernPhotoCalibrationEditor');
const model={geometryRadius:6371000,Height:17,NObjects:[4,0],ObjDist:[1000,0],ObjDeltaDist:[300,300],
  ObjSidePos:[55,0],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[1,1],ObjSizeVar:[0,0],ObjSizeType:[0,0],ObjType:[8,3]};
test('viewer reconstructs authored world points without mutating geometry, including spans',()=>{
  for(const globe of [true,false]){
    const opt={opticsNeutral:true,physicalSurface:true,curvature:globe?1/model.geometryRadius:0};
    const scene=geometry.createObjectSequenceScene(model,0,globe,opt),pkg=editor.objectPackages([scene.primitives,[]]).get(3);
    const entry=geometry.objectSequence(model,0,globe,opt)[pkg.placedIndex];
    const before=JSON.stringify(scene);
    const local=viewer.localGeometry(scene.primitives,pkg,geometry.towerPlacement(entry.params));
    assert.equal(viewer.visibleItems(local,true).length-viewer.visibleItems(local,false).length,2);
    for(const item of local.items)for(const [i,p] of item.points.entries()){
      const f=local.frame,q=f.origin.map((v,k)=>v+p[0]*f.x[k]+p[1]*f.y[k]+p[2]*f.z[k]);
      assert.ok(Math.hypot(...q.map((v,k)=>v-scene.primitives[item.index].points[i][k]))<1e-8);
      if(item.owner.kind==='object')assert.ok(Math.abs(p[2])<1e-8);
    }
    assert.equal(JSON.stringify(scene),before);
  }
});
test('orthographic front/back, perspective, orbit and zoom preserve a separate local state',()=>{
  const b={center:[0,0,0],radius:10},s=viewer.reset(),p=[2,3,0];
  const a=viewer.camera(s,b,800,520).project(p);
  const back=viewer.camera(viewer.standardView(s,'back'),b,800,520).project(p);
  assert.ok(Math.abs(a.pixel[0]+back.pixel[0]-800)<1e-9);
  assert.equal(a.pixel[1],back.pixel[1]);
  const top=viewer.camera(viewer.standardView(s,'top'),b,800,520).project(p);
  assert.ok(Math.abs(top.pixel[1]-260)<1e-9);
  const q=viewer.zoom(viewer.pan(viewer.orbit(s,40,20),15,-5),2);
  assert.deepEqual(s,viewer.reset());assert.equal(q.zoom,2);assert.deepEqual(q.pan,[15,-5]);
  const c=viewer.camera({...s,projection:'perspective'},b,800,520);
  assert.ok(c.project([2,0,5]).pixel[0]>c.project([2,0,-5]).pixel[0]);
});
test('wireframe and spans change only the local draw commands',()=>{
  const owner={kind:'object'},span={kind:'span'},items=[
    {owner,index:0,type:'polygon',mode:2,style:{fill:'#aaa'},points:[[0,0,0],[4,0,0],[0,4,0]]},
    {owner:span,index:1,type:'polygon',mode:3,style:{},points:[[0,0,0],[4,0,0],[0,0,6]]}];
  let fills=0,strokes=0;
  const ctx={clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){fills++},stroke(){strokes++},fillText(){}};
  const canvas={width:800,height:520,getContext:()=>ctx},g={items},s=viewer.reset(),before=JSON.stringify(g);
  assert.equal(viewer.draw(canvas,g,s).count,1);assert.equal(fills,1);
  fills=0;strokes=0;assert.equal(viewer.draw(canvas,g,{...s,wireframe:true,spans:true}).count,2);
  assert.equal(fills,0);assert.ok(strokes>=5);assert.equal(JSON.stringify(g),before);
});
