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

test('region seed uses visible owners inside a rectangle, not a bridge station or hidden geometry',()=>{
  const spans=new Map([[7,[[10,10,20]]],[4,[[14,15,20]]],[9,[[30,30,10]]]]);
  assert.deepEqual(viewer.regionSeed(spans,{x:12,y:9,width:10,height:10}),{key:4,pixel:[17.5,15.5],distance:2.5});
  assert.equal(viewer.regionSeed(spans,{x:0,y:0,width:5,height:5}),null);
});
test('region view preserves a rolled pinhole basis and includes all owners on both banks',()=>{
  const source={width:800,height:600,camera:{pos:[0,0,0],center:[0,100,0],up:[.6,0,.8],sceneSize:1,objectZExtend:0,zoom:1,near:.001}};
  const observer={origin:[10,20,30],right:[1,0,0],forward:[0,1,0],up:[0,0,1]};
  const owner={kind:'object',bank:0,objectType:3},other={kind:'object',bank:1,objectType:2};
  const polygon=(o,points)=>({type:'polygon',mode:3,style:{},points,metadata:{landmarkOwner:o,landmarkPrimitive:0}});
  const banks=[[polygon(owner,[[9,120,29],[11,120,29],[11,120,31],[9,120,31]])],
    [polygon(other,[[10,220,30],[12,220,30],[10,220,32]])]];
  const region={x:300,y:200,width:200,height:200},before=JSON.stringify(banks);
  const g=viewer.regionGeometry(banks,{owner,primaryIndices:[0],pixel:[400,300],region},source,observer);
  assert.equal(g.items.length,2);assert.equal(g.items[1].bank,1);assert.deepEqual(g.frame.origin,[10,120,30]);
  assert.deepEqual(g.eye,[0,0,100]);assert.equal(g.pivotError,0);
  const initial={...viewer.reset(),projection:'perspective'};
  const c=viewer.regionCamera(g,initial,800,600),q=g.items[0].points[0],p=c.project(q);
  assert.ok(Math.abs(p.pixel[0]-(400+g.focal*3*q[0]/100))<1e-8);
  assert.ok(Math.abs(p.pixel[1]-(300-g.focal*3*q[1]/100))<1e-8);
  const rotated=viewer.regionCamera(g,viewer.orbit(initial,40,10),800,600);
  assert.deepEqual(rotated.project([0,0,0]).pixel,[400,300]);
  assert.ok(Math.hypot(...rotated.project(q).pixel.map((v,i)=>v-p.pixel[i]))>1);
  for(const item of g.items)for(const [i,pt] of item.points.entries()){
    const f=g.frame,world=f.origin.map((x,k)=>x+pt[0]*f.x[k]+pt[1]*f.y[k]+pt[2]*f.z[k]);
    assert.ok(Math.hypot(...world.map((x,k)=>x-banks[item.bank][item.index].points[i][k]))<1e-9);
  }
  assert.equal(JSON.stringify(banks),before);
});
test('region pivot selects front physical intersection and falls back to perspective-correct edges',()=>{
  const face=(z)=>({type:'polygon',mode:2,points:[[-4,-4,z],[4,-4,z],[4,4,z],[-4,4,z]]});
  assert.deepEqual(viewer.regionPivot([face(-20),face(-10)],[400,300],800,600,100,.001),{point:[0,0,-10],distance:0});
  const hit=viewer.regionPivot([{type:'line',points:[[1,0,-10],[4,0,-20]]}],[415,300],800,600,100,.001);
  assert.ok(Math.abs(hit.distance)<1e-10);assert.ok(Math.abs(hit.point[0]/-hit.point[2]-.15)<1e-12);
});
test('free region painter clips near-plane crossing primitives and keeps every owner available',()=>{
  const owner={kind:'object',bank:0},geometry={eye:[0,0,10],focal:100,near:.001,seed:[50,50],region:{x:0,y:0,width:100,height:100},
    items:[{owner,type:'polygon',mode:3,style:{},points:[[-1,-1,0],[1,-1,0],[1,1,15],[-1,1,15]]}]};
  let fill=0,stroke=0;const record=(...xy)=>assert.ok(xy.every(v=>Number.isFinite(v)&&v>=-2.001&&v<=102.001));
  const ctx={clearRect(){},fillRect(){},beginPath(){},closePath(){},moveTo:record,lineTo:record,fill(){fill++;},stroke(){stroke++;}};
  const stats=viewer.drawRegion({width:100,height:100,getContext:()=>ctx},geometry,{...viewer.reset(),projection:'perspective'});
  assert.equal(stats.count,1);assert.equal(stats.visible,1);assert.equal(fill,1);assert.equal(stroke,1);
});

test('orbit sensitivity defaults to quarter speed and depends only on CSS motion',()=>{
  const s=viewer.reset(),a=viewer.orbit(s,100,50),b=viewer.orbit(s,100,50,100);
  assert.ok(Math.abs(a.yaw-.2)<1e-12);assert.ok(Math.abs(a.pitch-.1)<1e-12);
  assert.ok(Math.abs(b.yaw-.8)<1e-12);assert.ok(Math.abs(b.pitch-.4)<1e-12);
  assert.ok(Math.abs(viewer.orbit(s,100,50,5).yaw-.04)<1e-12);
  assert.deepEqual(viewer.orbit(s,100,50),viewer.orbit(s,100,50,25));
  assert.equal(viewer.orbitSensitivity(null),25);assert.equal(viewer.orbitSensitivity(NaN),25);
  assert.equal(viewer.orbitSensitivity(-1),5);assert.equal(viewer.orbitSensitivity(200),100);
  assert.equal(viewer.orbitSensitivity(27),25);
  assert.equal(viewer.orbit(s,0,100000).pitch,Math.PI/2);
  assert.deepEqual(s,viewer.reset());
});

const pickItem=(points,mode=3,index=0,type='polygon')=>({points,mode,index,type,bank:0,primitive:index,owner:{kind:'object',bank:0,index},style:{}});
function pickCamera(projection='perspective',eye=[0,0,10],state={}){
  return viewer.regionCamera({eye,focal:100,near:.001,seed:[50,50],region:{x:0,y:0,width:100,height:100}},
    {...viewer.reset(),projection,...state},100,100);
}
test('indexed concave planar fill retains original indices after closure and collinear cleanup',()=>{
  const p=pickItem([[0,0,0],[1,0,0],[2,0,0],[2,2,0],[1,1,0],[0,2,0],[0,0,0]]);
  const before=JSON.stringify(p),r=viewer.indexedTriangles(p);
  assert.equal(r.reason,null);assert.equal(r.triangles.length,3);
  assert.ok(r.triangles.flat().every(i=>Number.isInteger(i)&&i>=0&&i<6&&i!==1));
  let area=0;
  for(const [a,b,c] of r.triangles.map(t=>t.map(i=>p.points[i])))area+=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;
  assert.ok(Math.abs(area-3)<1e-10);assert.equal(JSON.stringify(p),before);
  const q=pickItem(p.points.map(([x,y])=>[10000+x,20000+y,30000+x+y]));
  assert.equal(viewer.indexedTriangles(q).reason,null);
});
test('invalid and wire-only fills cannot create surfaces; authored edges survive',()=>{
  const square=[[0,0,0],[2,0,0],[2,2,0],[0,2,0]];
  const items=[pickItem(square,1),pickItem([[0,0,0],[2,2,0],[0,2,0],[2,0,0]]),
    pickItem([[0,0,0],[2,0,0],[2,2,1],[0,2,0]]),pickItem([[0,0,0],[2,0,0],[1,0,0],[2,2,0],[0,2,0]])];
  const mesh=viewer.preparePick(items);
  assert.deepEqual(mesh.map(e=>e.reason),['not-filled','self-intersection','nonplanar','backtracking-edge']);
  assert.ok(mesh.every(e=>!e.triangles.length&&e.edges.length>=4));
  assert.deepEqual(mesh[0].edges,[[0,1],[1,2],[2,3],[3,0]]);
});
test('off-axis rolled orbit ray inverts perspective and orthographic screens',()=>{
  for(const projection of ['perspective','orthographic']){
    const c=pickCamera(projection,[1,-2,10],{yaw:.3,pitch:.2,pan:[7,-3],zoom:1.4}),p=[.2,-.4,1],q=c.project(p),ray=c.ray(q.pixel);
    assert.ok(Math.hypot(...p.map((v,i)=>v-ray.origin[i]-ray.direction[i]*q.depth))<1e-10);
  }
});
test('surface picks use front depth, preserve barycentric coordinates and expose coplanar ambiguity',()=>{
  const square=z=>[[-2,-2,z],[2,-2,z],[2,2,z],[-2,2,z]];
  const mesh=viewer.preparePick([pickItem(square(0),3,0),pickItem(square(2),3,1),pickItem(square(2),3,2)]);
  const c=pickCamera(),r=viewer.pickRegion(mesh,c,[55,48],'surface');
  assert.deepEqual(r.candidates.map(h=>h.index),[2,1]);
  const h=r.candidates[0];
  assert.ok(h.weights.every(w=>w>=0));assert.ok(Math.abs(h.weights.reduce((a,b)=>a+b,0)-1)<1e-12);
  assert.ok(Math.abs(h.point[2]-2)<1e-10);
  for(let k=0;k<3;k++)assert.ok(Math.abs(h.point[k]-h.indices.reduce((sum,i,j)=>sum+h.weights[j]*mesh[2].item.points[i][k],0))<1e-10);
  assert.ok(Math.hypot(...c.project(h.point).pixel.map((v,i)=>v-[55,48][i]))<1e-10);
  assert.equal(viewer.pickRegion(mesh,c,[55,48],'surface',{wireframe:true}).candidates.length,0);
});
test('edge picking recovers the original perspective parameter, not screen interpolation',()=>{
  const c=pickCamera(),a=[0,0,0],b=[2,0,5],point=[.5,0,1.25],pixel=c.project(point).pixel;
  const h=viewer.edgeHit(c,pixel,a,b);
  assert.ok(Math.abs(h.t-.25)<1e-12);assert.ok(h.distance<1e-10);
  const near=viewer.edgeHit(c,[60,50],[0,0,0],[1,0,11]);
  assert.ok(near&&near.t>=0&&near.t<=1&&near.depth>=c.near-1e-10);
  const mesh=viewer.preparePick([pickItem([a,b],1,0,'line')]);
  const edge=viewer.pickRegion(mesh,c,pixel,'edge').candidates[0];
  assert.deepEqual(edge.indices,[0,1]);assert.ok(Math.abs(edge.weights[1]-.25)<1e-12);
});
test('snapped hidden vertices and edges are rejected at their own pixel, wireframe allows them',()=>{
  const c=pickCamera(),front=pickItem([[-2,-2,2],[2,-2,2],[2,2,2],[-2,2,2]],2,0);
  const rear=pickItem([[0,0,0],[1,0,0]],1,1,'line');
  const mesh=viewer.preparePick([front,rear]);
  for(const kind of ['vertex','edge']){
    const solid=viewer.pickRegion(mesh,c,[50,50],kind,{radius:2});
    assert.equal(solid.candidates.length,0);
    const wire=viewer.pickRegion(mesh,c,[50,50],kind,{radius:2,wireframe:true});
    assert.equal(wire.candidates[0].index,1);
  }
});
test('authored mixed bridge and non-bridge geometry has indexed surface coverage',()=>{
  for(const globe of [true,false]){
    const m={...model,ObjType:[8,3],NObjects:[4,3]};
    const banks=[0,1].map(b=>geometry.createObjectSequenceScene(m,b,globe,{opticsNeutral:true,physicalSurface:true,curvature:globe?1/m.geometryRadius:0}).primitives);
    const items=banks.flatMap((bank,b)=>bank.map((p,i)=>({...p,bank:b,index:i,primitive:p.metadata.landmarkPrimitive,owner:p.metadata.landmarkOwner})));
    const meshes=viewer.preparePick(items);
    assert.ok(meshes.some(e=>e.item.owner.kind==='span'&&e.triangles.length));
    assert.ok(meshes.some(e=>e.item.bank===1&&e.triangles.length));
    for(const e of meshes)for(const t of e.triangles)assert.ok(t.every(i=>Number.isInteger(i)&&i>=0&&i<e.item.points.length));
  }
});
