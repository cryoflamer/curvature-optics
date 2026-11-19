'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const resolver=require('../src/calibration/CameraMaterialAnchorResolver');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const ear=require('../src/geometry/CurvatureEarClip');
const model=(type=6)=>({showModel:1,rEarth:6371000,Height:12,Pan:3,CameraNorth:25,CameraEast:15,
  NObjects:[4,3],ObjType:[type,3],ObjDist:[1000,1200],ObjDeltaDist:[100,100],
  ObjSideType:[1,0],ObjSidePos:[30,40],ObjSideVar:[20,0],ObjSizeType:[0,0],ObjSize:[10,20],ObjSizeVar:[0,0]});
const physical=(m,b=0,height=0)=>engine.createObjectSequenceScene({...m,Height:height,geometryRadius:m.rEarth},b,true,
  {opticsNeutral:true,physicalSurface:true,curvature:1/m.rEarth}).primitives;
const a=(session,p,kind,indices,weights)=>({kind,owner:p.metadata.landmarkOwner,primitive:p.metadata.landmarkPrimitive,
  signature:session.signature(p.metadata.landmarkOwner.bank),indices,weights});
const near=(actual,expected,tol=1e-8)=>assert.ok(Math.hypot(...actual.map((x,i)=>x-expected[i]))<=tol,actual+' vs '+expected);
const sum=(p,indices,weights)=>[0,1,2].map(j=>indices.reduce((s,i,k)=>s+p.points[i][j]*weights[k],0));
test('synchronous SHA-256 standard vectors including multiple blocks',()=>{
  assert.equal(resolver.sha256Ascii(''),'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(resolver.sha256Ascii('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(resolver.sha256Ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  assert.equal(resolver.sha256Ascii('a'.repeat(1000000)),'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  assert.throws(()=>resolver.sha256Ascii('é'),/ASCII/);
});
test('bank signature ignores camera, radius, atmosphere and other-bank layout',()=>{
  const m=model(),r=resolver.create(m),sig=r.signature(0);
  assert.match(sig,/^bank-v1:sha256:[a-f0-9]{64}$/);assert.notEqual(sig,r.signature(1));
  const changed={...m,rEarth:8000000,Height:100,Pan:20,CameraEast:999,CameraNorth:-15,atmosphere:'standard',ObjSize:[10,999]};
  assert.equal(resolver.create(changed).signature(0),sig);
  for(const k of resolver.LAYOUT){
    const n=model();n[k][0]+=k==='ObjType'||k==='ObjSideType'||k==='ObjSizeType'||k==='NObjects'?1:.125;
    assert.notEqual(resolver.create(n).signature(0),sig,k);
  }
  m.ObjDist[0]=2000;assert.equal(r.signature(0),sig);
});
test('legacy vertex exact parity, opaque IDs and observer-height convention',()=>{
  for(const type of [0,1,2,3,4,5,6,7,8,9]){
    const m=model(type),r=resolver.create(m);
    for(const b of [0,1]){
      const ps=physical(m,b),atHeight=physical(m,b,m.Height);
      for(const [i,p] of ps.entries())for(const j of [0,p.points.length-1]){
        const v={id:'opaque-'+i+'-'+j,bank:b,objectType:m.ObjType[b],primitive:i,vertex:j};
        const l=r.upgradeLegacy(v),q=r.resolveLandmark('vertex',v);
        assert.equal(l.id,v.id);assert.deepEqual(q.point,p.points[j]);assert.equal(q.index,i);
        assert.deepEqual(r.resolve(l.anchor).point,q.point);
        near(q.point,atHeight[i].points[j].map((x,k)=>x+(k===2?m.Height:0)));
      }
    }
  }
});
test('Globe edge and surface match independent weighted physical vertices',()=>{
  const m=model(),r=resolver.create(m),ps=physical(m);
  const i=ps.findIndex(p=>p.metadata.landmarkOwner.kind==='object'&&ear.indexedTriangles(p).triangles.length);
  const p=ps[i],edge=ear.authoredEdges(p)[0],tri=ear.indexedTriangles(p).triangles[0];
  near(r.resolve(a(r,p,'edge',edge.slice().reverse(),[.7,.3])).point,sum(p,edge,[.3,.7]));
  const surface=a(r,p,'surface',tri,[.2,.3,.5]);
  near(r.resolve(surface).point,sum(p,tri,[.2,.3,.5]));
  const hit={kind:'surface',owner:surface.owner,primitive:surface.primitive,bank:0,index:i,indices:tri,weights:[.2,.3,.5]};
  const q=r.fromPick(hit,'pair-1');assert.equal(q.id,'pair-1');near(r.resolve(q.anchor).point,sum(p,tri,[.2,.3,.5]));
  assert.throws(()=>r.fromPick({...hit,index:i+1},'pair-1'),/identity/);
});
test('bridge and Soundly spans resolve per-column endpoints and original triangles',()=>{
  for(const type of [6,8,9]){
    const m=model(type),r=resolver.create(m),spans=physical(m).filter(p=>p.metadata.landmarkOwner.kind==='span');
    assert.ok(spans.length>0);let surfaces=0;
    for(const p of spans){
      const o=p.metadata.landmarkOwner;assert.equal(o.from.column,o.to.column);
      near(r.resolve(a(r,p,'edge',[0,1],[.5,.5])).point,sum(p,[0,1],[.5,.5]));
      for(const tri of ear.indexedTriangles(p).triangles){
        near(r.resolve(a(r,p,'surface',tri,[.2,.3,.5])).point,sum(p,tri,[.2,.3,.5]));surfaces++;
      }
    }
    assert.ok(surfaces>0);
  }
});
test('stale signatures, invalid topology and non-Globe input are rejected',()=>{
  const m=model(),r=resolver.create(m),p=physical(m).find(p=>p.metadata.landmarkOwner.kind==='span');
  const vertex=a(r,p,'vertex',[0],[1]);
  assert.throws(()=>r.resolve({...vertex,signature:'bank-v1:sha256:'+'0'.repeat(64)}),/Stale/);
  assert.throws(()=>r.resolve({...vertex,indices:[99]}),/index/);
  assert.throws(()=>r.resolve(a(r,p,'edge',[0,2],[.5,.5])),/authored edge/);
  const bad=[0,1,2,3].map(i=>[0,1,2,3].filter(j=>j!==i)).find(t=>!ear.indexedTriangles(p).triangles.some(q=>q.slice().sort((x,y)=>x-y).join()===t.join()));
  assert.ok(bad);assert.throws(()=>r.resolve(a(r,p,'surface',bad,[.2,.3,.5])),/authored triangle/);
  const n=model();n.ObjDist[0]+=100;assert.throws(()=>resolver.create(n).resolve(vertex),/Stale/);
  assert.throws(()=>r.upgradeLegacy({id:'x',bank:0,objectType:9,primitive:0,vertex:0}),/topology/);
  assert.throws(()=>resolver.create({...m,showModel:2}),/Globe/);
  assert.throws(()=>resolver.create({...m,rEarth:100,ObjDist:[100,1200],ObjDeltaDist:[150,100]}).signature(0),/Truncated/);
});
test('shared authored topology rejects zero-length edges, wire-only and nonplanar surfaces',()=>{
  const p={type:'polygon',mode:3,points:[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,0]]};
  assert.deepEqual(ear.authoredEdges(p),[[0,1],[1,2],[2,3],[3,4]]);
  assert.equal(ear.indexedTriangles(p).triangles.length,2);
  assert.equal(ear.indexedTriangles({...p,mode:1}).reason,'not-filled');
  assert.equal(ear.indexedTriangles({...p,points:[[0,0,0],[1,0,0],[1,1,1],[0,1,0]]}).reason,'nonplanar');
});
