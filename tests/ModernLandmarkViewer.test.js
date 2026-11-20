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

function frameFixture(items,wireframe=false){
  const geometry={eye:[0,0,10],focal:100,near:.001,seed:[50,50],region:{x:0,y:0,width:100,height:100},items};
  const paths=viewer.regionPaths(geometry,{...viewer.reset(),projection:'perspective',wireframe},100,100);
  return viewer.pickFrame(viewer.preparePick(items),paths);
}
test('frame picker rejects painter/depth disagreement and invalid foreground fills',()=>{
  const square=z=>[[-2,-2,z],[2,-2,z],[2,2,z],[-2,2,z]];
  const front=pickItem(square(2),2,0),rear=pickItem(square(0),2,1);
  let f=frameFixture([front,rear]);
  assert.equal(viewer.framePick(f,[50,50],'surface').candidates[0].index,0);
  // Reverse the actual painter order to simulate group-depth inconsistency.
  const ordered=f.entries.slice().reverse().map(e=>e.path);
  f=viewer.pickFrame(viewer.preparePick([front,rear]),{camera:f.camera,ordered});
  const mismatch=viewer.framePick(f,[50,50],'surface');
  assert.equal(mismatch.candidates.length,0);assert.ok(mismatch.blocked);
  const invalid=pickItem([[-3,-3,3],[3,-3,3],[3,3,4],[-3,3,3]],2,2);
  f=frameFixture([rear,invalid]);
  assert.equal(viewer.framePick(f,[50,50],'surface').candidates.length,0);
});
test('frame picker supports coplanar ambiguity, wireframe and bounded screen work',()=>{
  const face=pickItem([[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]],3,0),other={...face,index:1,owner:{kind:'object',bank:0,index:1}};
  const f=frameFixture([face,other]);
  assert.deepEqual(viewer.framePick(f,[50,50],'surface').candidates.map(h=>h.index),[1,0]);
  assert.equal(viewer.framePick(f,[70,70],'vertex',{radius:2}).candidates.length,2);
  const wire=frameFixture([face,other],true);
  assert.equal(viewer.framePick(wire,[50,50],'surface',{wireframe:true}).candidates.length,0);
  assert.ok(viewer.framePick(wire,[70,50],'edge',{wireframe:true}).candidates.length>0);
  assert.ok(viewer.containsFill([[0,0],[10,0],[10,10],[0,10]],[0,5]));
  assert.ok(!viewer.containsFill([[0,0],[10,0],[10,10],[0,10]],[12,5]));
  const crowded={...f,entries:Array.from({length:2501},()=>f.entries[0])};
  assert.ok(viewer.framePick(crowded,[50,50],'surface').blocked);
});

test('point adjustment preserves original indices, rejects invalid weights and snaps authored boundaries',()=>{
  const item=pickItem([[0,0,0],[4,0,0],[4,4,0],[0,4,0]],3,0),mesh=viewer.preparePick([item]),c=pickCamera();
  const h=viewer.pickRegion(mesh,c,[60,40],'surface').candidates[0],before=JSON.stringify(h);
  const q=viewer.adjustPoint(mesh,h,[.2,.3,.5]);
  assert.deepEqual(q.indices,h.indices);
  assert.deepEqual(q.weights,[.2,.3,.5]);
  const edge=viewer.adjustPoint(mesh,q,q.weights,'boundary');
  assert.equal(edge.kind,'edge');assert.ok(mesh[0].edges.some(e=>JSON.stringify(e)===JSON.stringify(edge.indices)));
  const mid=viewer.adjustPoint(mesh,edge,edge.weights,'midpoint');
  assert.deepEqual(mid.weights,[.5,.5]);
  const vertex=viewer.adjustPoint(mesh,mid,mid.weights,'vertex');
  assert.equal(vertex.kind,'vertex');assert.deepEqual(vertex.point,item.points[vertex.indices[0]]);
  let rejected=false;try{viewer.adjustPoint(mesh,h,[.7,.7,-.4]);}catch(e){rejected=true;}assert.ok(rejected);
  assert.equal(JSON.stringify(h),before);
  assert.deepEqual(viewer.worldPoint({origin:[10,20,30],x:[0,1,0],y:[-1,0,0],z:[0,0,1]},[2,3,4]),[7,22,34]);
});
test('fixed point visibility distinguishes hidden, outside and wireframe points',()=>{
  const rear=pickItem([[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]],3,0);
  const front=pickItem([[-2,-2,2],[2,-2,2],[2,2,2],[-2,2,2]],3,1);
  const f=frameFixture([rear,front]),h={order:0,point:[0,0,0]};
  assert.equal(viewer.markerVisibility(f,h,100,100,false),'occluded');
  assert.equal(viewer.markerVisibility(f,h,100,100,true),'wireframe');
  assert.equal(viewer.markerVisibility(f,{...h,point:[100,0,0]},100,100,false),'out of view');
  assert.equal(viewer.markerVisibility(f,{order:1,point:[0,0,2]},100,100,false),'visible');
});

test('vertex snap minimizes physical distance rather than barycentric weight',()=>{
  const item=pickItem([[0,0,0],[100,0,0],[0,1,0]],3,0),mesh=viewer.preparePick([item]);
  const hit={kind:'surface',bank:0,index:0,order:0,indices:[0,1,2],weights:[.4,.35,.25]};
  const h=viewer.adjustPoint(mesh,hit,hit.weights,'vertex');
  // The largest weight can belong to the distant end of a long edge.
  const q=viewer.adjustPoint(mesh,hit,[.3,.4,.3],'vertex');
  assert.deepEqual(h.indices,[0]);
  assert.deepEqual(q.indices,[0]);
  assert.deepEqual(q.point,[0,0,0]);
  assert.deepEqual(q.weights,[1]);
});
test('surface vertex snap considers the whole authored polygon, edge snap only endpoints',()=>{
  const item=pickItem([[0,0,0],[10,0,0],[10,10,0],[0,10,0],[0,1,0]],3,0),mesh=viewer.preparePick([item]);
  const h={kind:'surface',bank:0,index:0,order:0,indices:[0,1,3],weights:[.85,.05,.1]};
  const q=viewer.adjustPoint(mesh,h,h.weights,'vertex');
  assert.deepEqual(q.indices,[4]);assert.deepEqual(q.point,[0,1,0]);
  const edge={...h,kind:'edge',indices:[0,3],weights:[.9,.1]};
  assert.deepEqual(viewer.adjustPoint(mesh,edge,edge.weights,'vertex').indices,[0]);
  assert.deepEqual(viewer.adjustPoint(mesh,{...edge,indices:[3,0]},[.5,.5],'vertex').indices,[0]);
});

test('stored magnifier view and anchors are validated against authored geometry',()=>{
  const state={...viewer.reset(),yaw:.3,pitch:-.2,zoom:2,pan:[10,-20],projection:'perspective',wireframe:true};
  assert.deepEqual(viewer.restoreView(state),state);
  for(const bad of [{...state,zoom:0},{...state,pan:[NaN,0]},{...state,projection:'other'}]){
    let rejected=false;try{viewer.restoreView(bad);}catch(e){rejected=true;}assert.ok(rejected);
  }
  const f=frameFixture([pickItem([[-2,-2,0],[2,-2,0],[2,2,0],[-2,2,0]],3,0)]);
  const mesh=f.entries.map(e=>e.entry),hit=viewer.framePick(f,[50,50],'surface').candidates[0];
  assert.deepEqual(viewer.restorePoint(mesh,hit),hit);
  for(const bad of [{...hit,indices:[0,0,1]},{...hit,point:[99,0,0]},{...hit,weights:[2,0,-1]}]){
    let rejected=false;try{viewer.restorePoint(mesh,bad);}catch(e){rejected=true;}assert.ok(rejected);
  }
});

function opticalFixture(item,points,geometry='globe',flatMaterial=null){
  const capture={geometry,flatMaterial,width:800,height:600,fx:700,fy:-600,cx:400,cy:300,near:.001};
  const c=viewer.opticalCamera(capture);
  const path={role:'objects',bank:item.bank,index:item.index,primitive:item.primitive,owner:item.owner,type:item.type,mode:item.mode,points,fill:points.map(c.screen),edges:[]};
  return {capture,path,c};
}
test('optical inverse recovers material weights from effective geometry, not screen interpolation',()=>{
  const item=pickItem([[0,0,0],[4,0,0],[0,6,0]],3,0);
  const {capture,path,c}=opticalFixture(item,[[0,0,10],[8,0,20],[0,9,15]]);
  const pixel=c.screen([.3*8,.5*9,.2*10+.3*20+.5*15]);
  const r=viewer.opticalPrimitivePick(capture,path,item,pixel,'surface');
  assert.equal(r.candidates.length,1);const hit=r.candidates[0];
  assert.ok(Math.hypot(...hit.point.map((x,i)=>x-[1.2,3,0][i]))<1e-10);
  assert.ok(hit.roundTripError<1e-10);
  const edge=c.screen([2,0,12.5]),e=viewer.opticalPrimitivePick(capture,path,item,edge,'edge',{radius:1});
  assert.equal(e.candidates.length,1);assert.ok(Math.abs(e.candidates[0].weights[1]-.25)<1e-10);
  assert.deepEqual(viewer.opticalPrimitivePick(capture,path,item,c.screen(path.points[1]),'vertex',{radius:1}).candidates[0].indices,[1]);
  assert.equal(viewer.opticalPrimitivePick(capture,{...path,index:99},item,pixel,'surface').candidates.length,0);
  const outside={...capture,fx:1000},outsideCam=viewer.opticalCamera(outside);
  assert.equal(viewer.opticalPrimitivePick(outside,path,item,outsideCam.screen(path.points[1]),'vertex',{radius:1}).candidates.length,0);
});
test('nonlinear Flat chord disagreement is explicitly unresolved',()=>{
  const item=pickItem([[0,0,0],[4,0,0],[0,4,0]],3,0);
  const mapping=p=>[p[0],p[1]+.2*p[0]*p[0],20];
  const {capture,path,c}=opticalFixture(item,item.points.map(mapping),'flat',mapping);
  const pixel=c.screen([2,1.6,20]);
  const bad=viewer.opticalPrimitivePick(capture,path,item,pixel,'edge',{radius:1});
  assert.equal(bad.candidates.length,0);assert.ok(bad.unresolved>0);
  const vertex=viewer.opticalPrimitivePick(capture,path,item,c.screen(path.points[1]),'vertex',{radius:1});
  assert.equal(vertex.candidates.length,1);
  const flat=p=>[p[0],p[1],20],f=opticalFixture(item,item.points.map(flat),'flat',flat);
  const good=viewer.opticalPrimitivePick(f.capture,f.path,item,f.c.screen([1,1,20]),'surface');
  assert.equal(good.candidates.length,1);assert.ok(good.candidates[0].roundTripError<1e-10);
});

test('Globe optical frame uses actual painter order, horizon mask and material weights',()=>{
  const item=pickItem([[0,0,0],[4,0,0],[0,6,0]],3,0);
  const other={...item,index:1,owner:{kind:'object',bank:0,index:1}};
  const {capture,path,c}=opticalFixture(item,[[0,0,10],[8,0,20],[0,9,15]]);
  const front=opticalFixture(other,[[0,0,5],[4,0,10],[0,4.5,7.5]]).path;
  const pixel=c.screen([2.4,4.5,15.5]),mesh=viewer.preparePick([item,other]);
  const make=paths=>viewer.opticalFrame(mesh,{...capture,paths});
  let f=make([path]);
  const h=viewer.opticalFramePick(f,pixel,'surface').candidates[0];
  assert.ok(Math.hypot(...h.point.map((x,i)=>x-[1.2,3,0][i]))<1e-9);
  assert.equal(viewer.opticalMarker(f,h).visibility,'visible');
  assert.equal(viewer.opticalFramePick(make([path,front]),pixel,'surface').candidates[0].index,1);
  assert.equal(viewer.opticalFramePick(make([front,path]),pixel,'surface').candidates[0].index,0);
  assert.equal(viewer.opticalMarker(make([path,front]),h).visibility,'occluded');
  const mask={role:'occlusion',alpha:1,fill:path.fill,edges:[],strokeWidth:0};
  assert.equal(viewer.opticalFramePick(make([path,mask]),pixel,'surface').candidates.length,0);
  assert.equal(viewer.opticalMarker(make([path,mask]),h).visibility,'horizon masked');
  assert.equal(viewer.opticalFramePick(make([mask,path]),pixel,'surface').candidates.length,1);
  const stroke={...front,fill:[],edges:[[[pixel[0]-5,pixel[1]],[pixel[0]+5,pixel[1]]]],strokeWidth:2};
  assert.equal(viewer.opticalMarker(make([path,stroke]),h).visibility,'occluded');
  assert.equal(viewer.opticalMarker(make([path,{...stroke,alpha:.5}]),h).visibility,'visibility unresolved');
  assert.equal(viewer.opticalMarker(make([path,{...stroke,alpha:0}]),h).visibility,'visible');
  assert.equal(viewer.opticalFrame(mesh,{...capture,geometry:'flat',paths:[path]}),null);
  const edge=viewer.opticalFramePick(f,c.screen([2,0,12.5]),'edge',{radius:1}).candidates[0];
  assert.ok(Math.abs(edge.weights[1]-.25)<1e-9);
  assert.deepEqual(viewer.opticalFramePick(f,c.screen(path.points[1]),'vertex',{radius:1}).candidates[0].indices,[1]);
  const adjusted=viewer.adjustPoint(mesh,h,[.2,.3,.5]);
  assert.equal(viewer.opticalMarker(f,adjusted).visibility,'visible');
});

test('committed correspondence binding uses stable bank identity and sorted material topology',()=>{
  const item=pickItem([[0,0,0],[4,0,0],[0,6,0]],3,0),other={...item,index:1};
  const mesh=viewer.preparePick([other,item]);
  const row={id:'pair-1',label:'2V',color:'#123456',bank:item.bank,index:item.index,
    anchor:{kind:'surface',owner:item.owner,primitive:item.primitive,indices:[0,1,2],weights:[.2,.3,.5]}};
  const before=JSON.stringify(row),[bound]=viewer.correspondenceHits(mesh,[row]);
  assert.equal(bound.hit.order,1);assert.equal(bound.label,'2V');
  assert.ok(Math.hypot(...bound.hit.point.map((x,i)=>x-[1.2,3,0][i]))<1e-12);
  assert.equal(JSON.stringify(row),before);
  assert.equal(viewer.correspondenceHits(mesh,[{...row,index:99}])[0].hit,null);
  assert.equal(viewer.correspondenceHits(mesh,[{...row,anchor:{...row.anchor,primitive:999}}])[0].hit,null);
  const {capture,path}=opticalFixture(item,[[0,0,10],[8,0,20],[0,9,15]]);
  const frame=viewer.opticalFrame(mesh,{...capture,paths:[path]});
  assert.equal(viewer.opticalMarker(frame,bound.hit).visibility,'visible');
  const mask={role:'occlusion',alpha:1,fill:path.fill,edges:[],strokeWidth:0};
  assert.equal(viewer.opticalMarker(viewer.opticalFrame(mesh,{...capture,paths:[path,mask]}),bound.hit).visibility,'horizon masked');
});

test('committed marker selection ignores hidden markers and cycles overlapping visible IDs in CSS pixels',()=>{
  const rows=[{id:'a',pixel:[100,100],visibility:'visible'},{id:'b',pixel:[102,100],visibility:'wireframe'},
    {id:'hidden',pixel:[100,100],visibility:'occluded'},{id:'outside',pixel:[100,100],visibility:'out of crop'}];
  const before=JSON.stringify(rows);
  assert.equal(viewer.correspondenceAt(rows,[100,100],[2,2]),'a');
  assert.equal(viewer.correspondenceAt(rows,[100,100],[2,2],'a'),'b');
  assert.equal(viewer.correspondenceAt(rows,[100,100],[2,2],'b'),'a');
  assert.equal(viewer.correspondenceAt(rows,[200,200],[2,2]),null);
  assert.equal(JSON.stringify(rows),before);
});

test('optical viewport preserves source pixel under cursor and clamps pan without changing camera',()=>{
  const r={x:0,y:0,width:1200,height:800},before=JSON.stringify(r),p=[600,300];
  const t=viewer.opticalViewport(r,1000,600),q=[(p[0]-t.offsetX)/t.scale,(p[1]-t.offsetY)/t.scale];
  const z=viewer.zoomOptical(r,1200,800,1000,600,p,2),a=viewer.opticalViewport(z,1000,600);
  assert.ok(Math.hypot(...q.map((x,i)=>x*a.scale+[a.offsetX,a.offsetY][i]-p[i]))<1e-9);
  assert.deepEqual(viewer.zoomOptical(z,1200,800,1000,600,p,.5),r);
  assert.equal(viewer.panOptical(z,1200,800,1000,600,1e6,1e6).x,0);
  assert.equal(viewer.panOptical(z,1200,800,1000,600,-1e6,-1e6).y,400);
  assert.equal(JSON.stringify(r),before);
  assert.equal(viewer.rectangleOptical(r,1200,800,1000,600,[0,0],[20,20]),null);
  const rect=viewer.rectangleOptical(r,1200,800,1000,600,[200,150],[500,450]);
  assert.deepEqual(rect,{x:200,y:200,width:400,height:400});
});
test('pivot-independent optical geometry and frame transitions preserve authored material coordinates',()=>{
  const scene=geometry.createObjectSequenceScene(model,0,true,{opticsNeutral:true,physicalSurface:true,curvature:1/model.geometryRadius});
  const g=viewer.opticalGeometry([scene.primitives,[]]),mesh=viewer.preparePick(g.items);
  const e=mesh.find(e=>e.triangles.length),indices=e.triangles[0],weights=[.2,.3,.5];
  const point=[0,1,2].map(j=>indices.reduce((s,i,k)=>s+e.item.points[i][j]*weights[k],0));
  const hit={kind:'surface',bank:e.item.bank,index:e.item.index,primitive:e.item.primitive,owner:e.item.owner,indices,weights,point,order:e.order};
  const offset=[10,20,30],to={frame:{...g.frame,origin:offset},items:g.items.map(i=>({...i,points:i.points.map(q=>q.map((x,j)=>x-offset[j]))}))};
  const moved=viewer.reframePoint(hit,g,to,viewer.preparePick(to.items));
  assert.ok(Math.hypot(...viewer.worldPoint(to.frame,moved.point).map((x,j)=>x-point[j]))<1e-8);
  const back=viewer.reframePoint(moved,to,g,mesh);
  assert.deepEqual(back.indices,indices);assert.deepEqual(back.weights,weights);
  assert.throws(()=>viewer.reframePoint(hit,g,{...to,frame:g.frame},viewer.preparePick(to.items)),/geometry changed/);
  assert.deepEqual(viewer.opticalGeometry([[],[]]).items,[]);
});

test('inline source lifecycle navigates optical raster without requiring a dialog or orbit pivot',()=>{
  const nodes=new Map(),make=()=>({style:{},dataset:{},value:'',textContent:'',hidden:false,
    clientWidth:800,clientHeight:600,width:800,height:600,events:{},
    closest(){return this;},replaceChildren(){},append(){},focus(){},addEventListener(k,fn){this.events[k]=fn;},
    setPointerCapture(){},hasPointerCapture(){return false;},getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}});
  const host=make();
  const hostKeys=[];host.addEventListener=(k,fn)=>{if(k==='keydown')hostKeys.push(fn);};
  host.hidden=true;host.querySelector=k=>{if(!nodes.has(k))nodes.set(k,make());return nodes.get(k);};
  host.querySelectorAll=()=>[];
  host.ownerDocument={createElement:make,defaultView:{devicePixelRatio:1,localStorage:{getItem(){return null;},setItem(){}},
    ResizeObserver:class{observe(){}},addEventListener(){},cancelAnimationFrame(){}}};
  const canvas=host.querySelector('canvas'),ctx=new Proxy({},{get:(o,k)=>o[k]??(()=>{})});
  canvas.getContext=()=>ctx;
  const owner={kind:'object',bank:0,objectType:3};
  const banks=[[{type:'polygon',mode:3,style:{},points:[[-1,100,-1],[1,100,-1],[1,100,1],[-1,100,1]],
    metadata:{landmarkOwner:owner,landmarkPrimitive:0}}],[]];
  let pivots=0,changes=0,failPivot=true;
  const full={x:0,y:0,width:800,height:600};
  const source={width:800,height:600,camera:{pos:[0,0,0],center:[0,100,0],up:[0,0,1],sceneSize:10,objectZExtend:0,zoom:1,near:.001}};
  const observer={origin:[0,0,0],right:[1,0,0],forward:[0,1,0],up:[0,0,1]};
  const fastHits=[],deleted=[],owners=[];let undos=0,cancels=0;const materialHits=[];
  const api=viewer.mount(host,()=>changes++,()=>{},{inline:true,onFastVertex:hit=>{fastHits.push(hit);return true;},onDeleteCorrespondence:id=>deleted.push(id),onUndo:()=>undos++,onInspectOwner:o=>owners.push(o),onCancelPair:()=>cancels++,onConfirmMaterial:h=>{materialHits.push(h);return true;}});
  const sourceContract={width:800,height:600,banks,paint:(c,capture,region)=>({transform:viewer.opticalViewport(region,c.width,c.height),stats:{}}),
    buildFree:(region,active,selected)=>{pivots++;if(failPivot)return null;return viewer.regionGeometry(banks,selected?{...selected,region}:{owner,primaryIndices:[0],pixel:[400,300],region},source,observer);}};
  api.openPhysical(banks);
  assert.equal(api.snapshot().mode,'free');assert.deepEqual(api.snapshot().pivot,[0,100,0]);
  assert.equal(host.querySelector('[data-viewer-scene-controls]').style.display,'none');
  assert.equal(api.sessionSnapshot().version,4);
  const physicalSaved=api.sessionSnapshot(),physicalBefore=api.snapshot();
  api.openPhysical(banks);api.restoreSession(physicalSaved);assert.deepEqual(api.snapshot(),physicalBefore);
  assert.equal(api.resetScene(),true);assert.equal(api.snapshot().mode,'free');
  assert.equal(api.parkScene(),true);api.openScene({...sourceContract,readOnly:true});assert.equal(api.resumeScene(),true);
  assert.equal(api.snapshot().mode,'free');api.close();
  // Open directly in exactly the previous Scene-derived physical frame.
  const framing={source,observer,spans:new Map([[1,[[400,300,1]]]]),
    packages:new Map([[1,{owner,primaryIndices:[0]}]])};
  const expectedGeometry=viewer.regionGeometry(banks,{owner,primaryIndices:[0],pixel:[400.5,300.5],region:full},source,observer);
  api.openPhysical(banks,framing);
  assert.equal(api.snapshot().mode,'free');assert.deepEqual(api.snapshot().pivot,expectedGeometry.frame.origin);
  assert.equal(api.snapshot().view.yaw,0);assert.equal(api.snapshot().view.pitch,0);
  assert.deepEqual(api.snapshot().region,full);
  const framed=api.sessionSnapshot();
  // On the physical viewport a saved marker captures a drag instead of orbit.
  const physicalPair={id:'physical',label:'1',color:'#123456',bank:0,index:0,anchor:{kind:'vertex',owner,primitive:0,indices:[0],weights:[1]}};
  api.setCorrespondences([physicalPair],null);
  const markerPixel=api.correspondences().find(r=>r.id==='physical').pixel;
  const markerEvent={...eventForFraming(),clientX:markerPixel[0],clientY:markerPixel[1]};
  const beforeMarker=api.snapshot().view;
  canvas.events.pointerdown(markerEvent);canvas.events.pointermove({...markerEvent,clientX:markerEvent.clientX+25});canvas.events.pointerup({...markerEvent,clientX:markerEvent.clientX+25});
  assert.deepEqual(api.snapshot().view,beforeMarker);
  canvas.events.pointerdown({...markerEvent,button:2});canvas.events.pointermove({...markerEvent,button:2,clientX:markerEvent.clientX+25});canvas.events.pointerup({...markerEvent,button:2,clientX:markerEvent.clientX+25});
  assert.equal(api.snapshot().view.yaw,beforeMarker.yaw);assert.ok(api.snapshot().view.pan[0]>beforeMarker.pan[0]);
  api.setCorrespondences([],null);api.resetScene();
  canvas.events.pointerdown(eventForFraming());canvas.events.pointermove({...eventForFraming(),clientX:440});canvas.events.pointerup({...eventForFraming(),clientX:440});
  function eventForFraming(){return {preventDefault(){},clientX:400,clientY:300,pointerId:1,button:0,shiftKey:false};}
  const rotated=api.sessionSnapshot(),rotatedView=api.snapshot();
  api.close();api.openPhysical(banks,framing);api.restoreSession(rotated);assert.deepEqual(api.snapshot(),rotatedView);
  assert.equal(api.resetScene(),true);assert.deepEqual(api.snapshot().view,framed.view);
  api.close();
  api.openScene(sourceContract);
  assert.equal(api.isOpen(),true);assert.equal(host.hidden,false);assert.equal(api.windowSnapshot(),null);
  assert.deepEqual(api.snapshot().region,full);
  const event={preventDefault(){},clientX:400,clientY:300,pointerId:1,button:0,shiftKey:false};
  canvas.events.wheel({...event,deltaY:-400});
  assert.equal(api.snapshot().mode,'scene');assert.ok(api.snapshot().region.width<800);
  const zoomed=api.snapshot().region;
  canvas.events.pointerdown(event);canvas.events.pointermove({...event,clientX:440});canvas.events.pointerup({...event,clientX:440});
  assert.ok(api.snapshot().region.x<zoomed.x);assert.equal(pivots,0);
  assert.equal(api.enterFree(),false);assert.equal(api.snapshot().mode,'scene');assert.equal(pivots,1);
  assert.ok(host.querySelector('[data-viewer-status]').textContent.includes('No visible physical pivot'));
  api.resetScene();assert.deepEqual(api.snapshot().region,full);
  assert.equal(api.zoomRectangle([200,150],[600,450]),true);
  failPivot=false;assert.equal(api.enterFree(),true);assert.equal(api.snapshot().mode,'free');
  const pair=(id,i)=>({id,label:id,color:'#123456',bank:0,index:0,anchor:{kind:'vertex',owner,primitive:0,indices:[i],weights:[1]}});
  const rows=[pair('a',0),pair('b',2)];
  api.setCorrespondences(rows,'a');
  assert.equal(host.querySelector('h2').textContent,'Model · Free View');
  
  // The mock stores only the last listener; invoke the actual button and inspect enabled state.
  const del=host.querySelector('[data-viewer-delete-pair]');assert.equal(del.disabled,false);del.onclick();assert.deepEqual(deleted,['a']);
  const key=(key,extra={})=>hostKeys.forEach(fn=>fn({key,target:canvas,preventDefault(){},stopPropagation(){},...extra}));
  key('Delete');key('z',{ctrlKey:true});assert.deepEqual(deleted,['a','a']);assert.equal(undos,1);
  key('Delete',{target:{tagName:'INPUT'}});assert.equal(deleted.length,2);
  assert.deepEqual(api.snapshot().pivot,banks[0][0].points[0]);
  canvas.events.pointerdown(event);canvas.events.pointermove({...event,clientX:440});canvas.events.pointerup({...event,clientX:440});
  assert.deepEqual(api.snapshot().pivot,banks[0][0].points[0]);
  api.setCorrespondences(rows,'b');
  assert.deepEqual(api.snapshot().pivot,banks[0][0].points[2]);
  api.resetScene();
  assert.equal(api.enterFree(),true);
  assert.deepEqual(api.snapshot().pivot,banks[0][0].points[2]);
  api.resetScene();assert.equal(api.snapshot().mode,'scene');assert.deepEqual(api.snapshot().region,full);
  api.setCorrespondences([],null);
  assert.equal(del.disabled,true);
  assert.equal(api.enterFree(),true);
  const select=host.querySelector('[data-viewer-pick-mode]');
  select.value='fast-vertex';select.onchange();
  const g=viewer.regionGeometry(banks,{owner,primaryIndices:[0],pixel:[400,300],region:full},source,observer);
  const pixel=viewer.regionCamera(g,api.snapshot().view,800,600).project(g.items[0].points[0]).pixel;
  const click={...event,clientX:pixel[0],clientY:pixel[1]};
  canvas.events.pointerdown(click);canvas.events.pointerup(click);
  assert.deepEqual(fastHits,[{kind:'vertex',bank:0,index:0,vertex:0}]);
  assert.equal(api.snapshot().staged,null);
  select.value='owner';select.onchange();
  const beforeOwner=api.snapshot();
  const middle={...event,clientX:400,clientY:300};canvas.events.pointerdown(middle);canvas.events.pointerup(middle);
  assert.deepEqual(owners,[owner]);assert.deepEqual(api.snapshot(),beforeOwner);
  api.setInspectedOwner(owner,'Owner',['P0']);
  assert.equal(host.querySelector('[data-viewer-owner-status]').textContent,'Owner');
  // Local staging survives navigation and inspection; a Fast Vertex action
  // cannot consume a local Vertex draft, even though they share a point kind.
  select.value='vertex';select.onchange();
  canvas.events.pointerdown(click);canvas.events.pointerup(click);
  const local=api.snapshot().staged;assert.ok(local);
  select.value='navigate';select.onchange();assert.deepEqual(api.snapshot().staged,local);
  select.value='fast-vertex';select.onchange();
  assert.equal(host.querySelector('[data-viewer-point-confirm]').disabled,true);
  host.querySelector('[data-viewer-point-confirm]').onclick();assert.equal(fastHits.length,1);
  select.value='owner';select.onchange();assert.deepEqual(api.snapshot().staged,local);
  select.value='vertex';select.onchange();
  assert.equal(host.querySelector('[data-viewer-point-confirm]').disabled,false);
  const draftSession=api.sessionSnapshot();
  api.restoreSession(draftSession);assert.deepEqual(api.snapshot().staged,local);
  api.setPendingVertex({bank:0,primitive:0,vertex:2});
  host.querySelector('[data-viewer-point-confirm]').onclick();
  assert.equal(api.snapshot().staged,null);assert.deepEqual(api.snapshot().confirmed,local);assert.deepEqual(materialHits,[local]);
  api.discardPairDraft();assert.deepEqual(api.snapshot().confirmed,local);
  // Undo clears local overlays even when Initial/Free View is parked.
  assert.equal(api.parkScene(),true);api.openScene({...sourceContract,readOnly:true});
  api.clearLocalPoint();assert.equal(api.resumeScene(),true);
  assert.equal(api.snapshot().confirmed,null);assert.equal(api.snapshot().staged,null);
  assert.equal(api.snapshot().mode,'free');
  key('Escape');assert.equal(cancels,1);assert.equal(api.snapshot().mode,'free');
  api.setPendingVertex(null);
  host.querySelector('[data-viewer-pick-clear]').onclick();
  assert.equal(api.snapshot().confirmed,null);
  select.value='owner';select.onchange();
  api.resetScene();
  canvas.events.wheel({...event,deltaY:-120});
  const beforeBest=api.snapshot();
  assert.equal(api.parkScene(),true);
  api.openScene({...sourceContract,readOnly:true,title:'Best Camera'});
  assert.equal(api.enterFree(),false);assert.equal(host.querySelector('[data-viewer-free]').disabled,true);
  canvas.events.wheel({...event,deltaY:-120});assert.ok(api.snapshot().region.width<800);
  const bestRegion=api.snapshot().region;
  assert.equal(api.updateScenePaint(sourceContract.paint),true);
  assert.deepEqual(api.snapshot().region,bestRegion);
  assert.equal(api.resumeScene(),true);
  assert.deepEqual(api.snapshot(),beforeBest);
  assert.equal(api.resumeScene(),false);
  assert.equal(api.sessionSnapshot().version,2);assert.ok(changes>0);
  // A new mount/source must reconstruct the same original frame and rebased pivot.
  api.resetScene();api.setCorrespondences(rows,'a');assert.equal(api.enterFree(),true);
  api.setCorrespondences(rows,'b');
  canvas.events.pointerdown(event);canvas.events.pointermove({...event,clientX:423,clientY:315});canvas.events.pointerup({...event,clientX:423,clientY:315});
  const saved=api.sessionSnapshot(),expected=api.snapshot();
  api.close();api.openScene(sourceContract);api.restoreSession(JSON.parse(JSON.stringify(saved)));
  const restored=api.snapshot();
  assert.equal(restored.mode,'free');assert.deepEqual(restored.view,expected.view);
  assert.ok(Math.hypot(...restored.pivot.map((x,i)=>x-expected.pivot[i]))<1e-6);
  assert.deepEqual(restored.region,expected.region);assert.equal(restored.pickMode,expected.pickMode);
  assert.throws(()=>api.restoreSession({...saved,base:{...saved.base,worldPoint:[0,0,0]}}),/pivot|frame|camera/i);
  api.resetScene();canvas.events.wheel({...event,deltaY:-120});
  const optical=api.sessionSnapshot();api.close();api.openScene(sourceContract);
  api.restoreSession(optical);assert.deepEqual(api.snapshot().region,optical.region);
  api.openScene({...sourceContract,readOnly:true,title:'Best Camera'});
  canvas.events.wheel({...event,deltaY:-120});const best=api.sessionSnapshot();
  api.close();api.openScene({...sourceContract,readOnly:true,title:'Best Camera'});api.restoreSession(best);
  assert.deepEqual(api.snapshot().region,best.region);assert.throws(()=>api.restoreSession(saved),/Invalid integrated/);
  api.close();assert.equal(host.hidden,true);assert.equal(api.snapshot(),null);
});


test('rebasing a physical orbit pivot preserves projection, zoom, rays and subsequent orbit in both projections',()=>{
  const g={eye:[3,-4,100],focal:600,near:.001,region:{x:10,y:20,width:800,height:600},seed:[380,290]};
  const near=(a,b)=>assert.ok(Math.hypot(...a.map((x,i)=>x-b[i]))<1e-8);
  const points=[[3,5,5],[-4,3,-12],[0,0,0]],p=points[0];
  for(const projection of ['perspective','orthographic'])for(const yaw of [0,.6,-.4])for(const pitch of [0,.3,-.2]){
    const s={...viewer.reset(),projection,yaw,pitch,zoom:1.7,pan:[22,-43]},before=JSON.stringify(s);
    const a=viewer.regionCamera(g,s,1024,768),n=viewer.rebaseRegionPivot(g,s,p,1024,768),b=viewer.regionCamera(g,n,1024,768);
    assert.equal(n.zoom,s.zoom);assert.deepEqual(n.pan,s.pan);assert.equal(JSON.stringify(s),before);
    for(const q of points){near(a.project(q).pixel,b.project(q).pixel);const ray=b.ray(b.project(q).pixel);near(ray.origin.map((x,i)=>x+ray.direction[i]*b.project(q).depth),q);}
    for(const delta of [[.3,0],[0,-.4],[.2,.2]])near(viewer.regionCamera(g,{...n,yaw:yaw+delta[0],pitch:pitch+delta[1]},1024,768).project(p).pixel,b.project(p).pixel);
    const moved=viewer.pan(n,10,-20),c=viewer.regionCamera(g,moved,1024,768);
    near(c.project(p).pixel,b.project(p).pixel.map((x,i)=>x+[10,-20][i]));
    const n2=viewer.rebaseRegionPivot(g,viewer.orbit(n,40,30),points[1],1024,768);
    near(viewer.regionCamera(g,n2,1024,768).project(points[2]).pixel,viewer.regionCamera(g,viewer.orbit(n,40,30),1024,768).project(points[2]).pixel);
  }
});

test('owner inspection follows painted coverage including masks, lines and transparent ambiguity',()=>{
  const owner={kind:'object',bank:0},span={kind:'span',bank:0};
  const fill=[[0,0],[20,0],[20,20],[0,20]],bounds={x:0,y:0,X:20,Y:20};
  const entry=(o,path={})=>({bounds,path:{fill,edges:[],...path},entry:o?{item:{owner:o}}:null});
  const back=entry(owner),front=entry(span,{fill:[],edges:[[[0,10],[20,10]]],strokeWidth:2});
  assert.deepEqual(viewer.ownerAtFrame({entries:[back,front]},[10,10]),span);
  assert.deepEqual(viewer.ownerAtFrame({entries:[back,front]},[10,5]),owner);
  assert.equal(viewer.ownerAtFrame({entries:[back,entry(null)]},[10,5]),null);
  assert.equal(viewer.ownerAtFrame({entries:[back,entry(span,{alpha:.5})]},[10,5]),null);
  assert.deepEqual(viewer.ownerAtFrame({entries:[back,entry(span,{alpha:0})]},[10,5]),owner);
  assert.equal(viewer.ownerAtFrame({entries:[back]},[40,40]),null);
});


test('independent physical frame includes both banks and fits a stable world centre',()=>{
  const owner={kind:'object',bank:0,objectType:3};
  const p=(bank,points)=>({type:'polygon',mode:3,style:{},points,metadata:{landmarkOwner:{...owner,bank},landmarkPrimitive:0}});
  const banks=[[p(0,[[100,200,5],[110,200,5],[110,200,15]])],[p(1,[[190,300,5],[200,300,5],[200,300,15]])]];
  const g=viewer.physicalGeometry(banks),s=viewer.physicalView(),c=viewer.regionCamera(g,s,800,600);
  assert.deepEqual(g.frame.origin,[150,250,10]);assert.equal(g.items.length,2);
  assert.deepEqual(g.items.map(x=>x.bank),[0,1]);
  for(const item of g.items)for(const [i,point] of item.points.entries()){
    assert.deepEqual(viewer.worldPoint(g.frame,point),banks[item.bank][item.index].points[i]);
    const q=c.project(point);assert.ok(q&&q.pixel[0]>=0&&q.pixel[0]<=800&&q.pixel[1]>=0&&q.pixel[1]<=600);
  }
  const point=g.items[1].points[2],next=viewer.rebaseRegionPivot(g,s,point,800,600);
  const d=viewer.regionCamera(g,next,800,600);
  for(const item of g.items)for(const p of item.points)assert.ok(Math.hypot(...c.project(p).pixel.map((x,i)=>x-d.project(p).pixel[i]))<1e-8);
  assert.deepEqual(viewer.physicalGeometry(banks),g);
  assert.throws(()=>viewer.physicalGeometry([[],[]]),/No visible geometry/);
});


test('scene-framed physical view reproduces former initial projection and retains all banks',()=>{
  const owner={kind:'object',bank:0,objectType:3},other={...owner,bank:1};
  const make=(o,points)=>({type:'polygon',mode:3,style:{},points,metadata:{landmarkOwner:o,landmarkPrimitive:0}});
  const banks=[[make(owner,[[-1,100,-1],[1,100,-1],[1,100,1],[-1,100,1]])],
    [make(other,[[20,10000,-1],[21,10000,-1],[21,10000,1]])]];
  const source={width:800,height:600,camera:{pos:[0,0,0],center:[0,100,0],up:[0,0,1],sceneSize:10,objectZExtend:0,zoom:1,near:.001}};
  const observer={origin:[0,0,0],right:[1,0,0],forward:[0,1,0],up:[0,0,1]},region={x:0,y:0,width:800,height:600};
  const spans=new Map([[1,[[400,300,1]]]]),packages=new Map([[1,{owner,primaryIndices:[0]}]]);
  const g=viewer.initialPhysicalGeometry(banks,source,observer,spans,packages);
  const old=viewer.regionGeometry(banks,{owner,primaryIndices:[0],pixel:[400.5,300.5],region},source,observer);
  assert.equal(g.sceneFramed,true);assert.deepEqual(g.frame,old.frame);assert.deepEqual(g.items,old.items);
  assert.equal(g.items.length,2);
  const c=viewer.regionCamera(g,viewer.physicalView(g),800,600),d=viewer.regionCamera(old,{...viewer.physicalView(g)},800,600);
  for(const p of g.items.flatMap(x=>x.points))assert.deepEqual(c.project(p),d.project(p));
  assert.ok(Math.abs(c.project(g.items[0].points[0]).pixel[0]-c.project(g.items[0].points[1]).pixel[0])>100);
  assert.deepEqual(viewer.initialPhysicalGeometry(banks,source,observer,new Map(),packages),viewer.physicalGeometry(banks));
});
