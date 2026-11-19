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

test('precise owner keys distinguish both road sides and support, including two banks and columns',()=>{
  for(const type of [6,7,8,9]){
    const m={...model,ObjType:[type,type],NObjects:[4,4],ObjSideType:[1,1],ObjSideVar:[20,20]};
    const banks=[0,1].map(b=>geometry.createObjectSequenceScene(m,b,true,{opticsNeutral:true,physicalSurface:true,curvature:1/m.geometryRadius}).primitives);
    const owners=editor.ownerSelections(banks,geometry.landmarkOwnerKey);
    for(const [b,primitives] of banks.entries())for(const [i,p] of primitives.entries()){
      const md=p.metadata,key=geometry.landmarkOwnerKey(b,md.placedObjectIndex,md.landmarkOwner);
      const selected=owners.get(key);
      assert.ok(selected);assert.deepEqual(selected.owner,md.landmarkOwner);assert.ok(selected.primaryIndices.includes(i));
      if(md.landmarkOwner.kind==='span'){
        assert.equal(selected.primaryIndices.length,1);
        assert.ok(selected.primitiveIndices.length>1);
        const entry=geometry.objectSequence(m,b,true,{opticsNeutral:true,physicalSurface:true,curvature:1/m.geometryRadius})[selected.placedIndex];
        const local=viewer.localGeometry(primitives,selected,geometry.towerPlacement(entry.params));
        assert.equal(viewer.visibleItems(local,false).length,1);
        assert.equal(viewer.visibleItems(local,false)[0].index,i);
        assert.ok(viewer.bounds(viewer.visibleItems(local,false)).size[2]>100);
        assert.ok(viewer.visibleItems(local,true).length>1);
        assert.ok(viewer.visibleItems(local,true).filter(q=>!q.primary).every(q=>q.owner.kind==='object'));
      }
    }
  }
});
test('exact ownership raster keeps a clicked road separate from its support and other road',()=>{
  const m={...model,Height:0};
  const b=geometry.createObjectSequenceScene(m,0,true,{opticsNeutral:true,physicalSurface:true,curvature:1/m.geometryRadius}).primitives;
  const owners=editor.ownerSelections([b,[]],geometry.landmarkOwnerKey);
  const pkg=[...owners.values()].filter(p=>p.placedIndex===1);
  const support=pkg.find(p=>p.owner.kind==='object'),roads=pkg.filter(p=>p.owner.kind==='span');
  assert.equal(roads.length,2);
  const rgb=id=>[id&255,id>>>8,1+(((id&255)*31+(id>>>8)*17)%254),255];
  const spans=editor.identitySpans(new Uint8ClampedArray([...rgb(support.key),...rgb(roads[0].key),...rgb(roads[1].key),0,0,0,255]),4,1);
  const raster=editor.ownershipRaster(spans,4,1);
  for(const [x,p] of [support,...roads].entries())assert.deepEqual(owners.get(editor.ownerAt(raster,x+.5,.5)).owner,p.owner);
  assert.equal(editor.ownerAt(raster,3.5,.5),null);
});

test('window geometry restores and clamps independently of the viewer camera',()=>{
  const camera=viewer.reset(),before=JSON.stringify(camera);
  const a=viewer.windowRect({x:90,y:60,width:620,height:450},1200,800);
  assert.deepEqual(a,{x:90,y:60,width:620,height:450});
  assert.deepEqual(viewer.changeWindowRect(a,'move',100,70,1200,800),{x:190,y:130,width:620,height:450});
  assert.deepEqual(viewer.changeWindowRect(a,'resize',120,80,1200,800),{x:90,y:60,width:740,height:530});
  const resized=viewer.changeWindowRect(a,'resize',10000,10000,1200,800);
  assert.equal(resized.x,a.x);assert.equal(resized.y,a.y);
  assert.equal(resized.x+resized.width,1192);assert.equal(resized.y+resized.height,792);
  const small=viewer.windowRect(a,280,240);
  assert.deepEqual(small,{x:8,y:8,width:264,height:224});
  const invalid=viewer.windowRect({x:NaN,y:12,width:100,height:100},1200,800);
  assert.ok(invalid.width>=340&&invalid.height>=300);
  assert.equal(JSON.stringify(camera),before);
});
test('resized raster matches window aspect and bounds backing store size',()=>{
  assert.deepEqual(viewer.rasterSize(640,400,2),{width:1280,height:800});
  assert.deepEqual(viewer.rasterSize(3000,1500,3),{width:2048,height:1024});
  assert.deepEqual(viewer.rasterSize(500,250,1),{width:500,height:250});
});
