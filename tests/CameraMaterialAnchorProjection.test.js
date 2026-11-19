'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const projection=require('../src/calibration/CameraLandmarkProjection');
const resolver=require('../src/calibration/CameraMaterialAnchorResolver');
const engine=require('../src/geometry/CurvatureGeometryEngine');
const ear=require('../src/geometry/CurvatureEarClip');
const direct=require('../src/renderers/CurvatureCanvasDirectPreview');
const viewer=require('../src/ui/modern/ModernLandmarkViewer');
const surface=require('../src/geometry/CurvatureSurfaceGeometry');
const R=6371000,W=1000,H=700;
const model=(type=6)=>({showModel:1,rEarth:R,geometryRadius:R,Height:12,viewcenterHorizon:3,
  CameraEast:15,CameraNorth:40,Pan:0,Nick:0,Roll:0,
  NObjects:[4,0],ObjType:[type,3],ObjDist:[1000,0],ObjDeltaDist:[100,100],
  ObjSideType:[0,0],ObjSidePos:[30,0],ObjSideVar:[0,0],ObjSizeType:[0,0],ObjSize:[type===6?30:1,20],ObjSizeVar:[0,0],
  showGrid:0,showTangent:0,showData:0,aDelta:0});
const camera=(pan=0,zoom=1)=>({pos:[0,0,0],center:[100*Math.sin(pan),100*Math.cos(pan),0],
  up:[.02,0,1],sceneSize:50,screenSize:1,objectZExtend:0,zoom,near:.001});
const bank=(m,height=0)=>engine.createObjectSequenceScene({...m,Height:height,geometryRadius:m.rEarth},0,true,
  {opticsNeutral:true,physicalSurface:true,curvature:1/m.rEarth}).primitives;
const canvas=()=>({width:W,height:H,getContext:()=>({save(){},restore(){},clearRect(){},fillRect(){},
  beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},clip(){}})});
const opts=atmosphere=>({method:'canvas-direct',atmosphere,
  temperatureProfile:{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5},canvasDirectOptions:{capturePicking:true,thinOutlines:true}});
const near=(a,b,t=1e-6)=>{assert.ok(a&&b);assert.ok(Math.hypot(...a.map((x,i)=>x-b[i]))<=t,a+' vs '+b);};
const weighted=(pts,indices,weights)=>[0,1,2].map(j=>indices.reduce((s,i,k)=>s+pts[i][j]*weights[k],0));
function anchorFor(r,p,kind,indices,weights,id='pair-1'){
  return {id,anchor:{kind,owner:p.metadata.landmarkOwner,primitive:p.metadata.landmarkPrimitive,
    signature:r.signature(0),indices,weights}};
}
function pickableSpan(ps){
  const i=ps.findIndex(p=>p.metadata.landmarkOwner.kind==='span'&&ear.indexedTriangles(p).triangles.length);
  assert.ok(i>=0);return i;
}
test('all Globe material kinds round-trip through the real Canvas Direct painter',()=>{
  let count=0;
  for(const type of [6,8,9])for(const atmosphere of ['vacuum','standard','temperature-lapse']){
    const m=model(type),r=resolver.create(m),ps=bank(m),i=pickableSpan(ps),p=ps[i];
    const item={...p,bank:0,index:i,owner:p.metadata.landmarkOwner,primitive:p.metadata.landmarkPrimitive};
    const tri=ear.indexedTriangles(p).triangles[0];
    for(const [pan,zoom] of [[0,1],[.03,1.5]]){
      const c=camera(pan,zoom),o=opts(atmosphere),s=projection.create(m,c,W,H,o);
      const cap=direct.create().paint(canvas(),c,m,o).picking;
      const path=cap.paths.find(a=>a.role==='objects'&&a.bank===0&&a.index===i);
      assert.ok(path,'actual authored span is painted');
      const cam=viewer.opticalCamera(cap);
      for(const [kind,indices,weights] of [['vertex',[0],[1]],['edge',[0,1],[.4,.6]],['surface',tri,[.2,.3,.5]]]){
        const l=anchorFor(r,p,kind,indices,weights),q=s[kind](l);
        assert.equal(q.status,'visible',JSON.stringify({type,atmosphere,kind,q}));
        assert.equal(q.meshOcclusion,'not-tested');
        const pixel=cam.project(weighted(path.points,indices,weights)).pixel;
        near(q.pixel,pixel,1e-6);
        const inverse=viewer.opticalPrimitivePick(cap,path,item,pixel,kind,{radius:.01}).candidates;
        assert.ok(inverse.some(h=>Math.hypot(...h.point.map((v,j)=>v-r.resolve(l.anchor).point[j]))<1e-6),'inverse material point');
        if(kind==='vertex')assert.deepEqual(q,s.vertex({id:l.id,bank:0,objectType:type,primitive:i,vertex:0}));
        count++;
      }
    }
  }
  assert.equal(count,54);
});
test('Accurate material projection matches independent metric coordinates and legacy vertices',()=>{
  const m=model(),r=resolver.create(m),ps=bank(m),i=pickableSpan(ps),p=ps[i],
    tri=ear.indexedTriangles(p).triangles[0],l=anchorFor(r,p,'surface',tri,[.2,.3,.5]);
  const xyz=weighted(p.points,tri,[.2,.3,.5]),radial=Math.hypot(xyz[0],xyz[1]),
    arc=R*Math.atan2(radial,R+xyz[2]),height=surface.createFromRadius(R).height3(...xyz),
    metric={id:l.id,east:xyz[0]*arc/radial,north:xyz[1]*arc/radial,height};
  for(const atmosphere of ['vacuum','standard','temperature-lapse']){
    const c=camera(.02,1.5),o={...opts(atmosphere),method:'accurate'},s=projection.create(m,c,W,H,o);
    const q=s.surface(l),expected=s.metric(metric);
    assert.equal(q.status,'visible');assert.equal(expected.status,'visible');near(q.pixel,expected.pixel,1e-5);
    const v=anchorFor(r,p,'vertex',[0],[1]);
    assert.deepEqual(s.vertex(v),s.vertex({id:v.id,bank:0,objectType:6,primitive:i,vertex:0}));
  }
});
test('projection bank binding rejects identity mismatch and preserves physical connectivity',()=>{
  const m=model(),r=resolver.create(m),ps=bank(m),i=pickableSpan(ps),p=ps[i],tri=ear.indexedTriangles(p).triangles[0],
    l=anchorFor(r,p,'surface',tri,[.2,.3,.5]);
  const q=ps.map(p=>({...p,points:p.points.map(x=>x.slice())}));
  const bound=r.bindProjectionBank(0,q),before=bound.point('surface',l);
  q[i].points[0][0]+=100;near(bound.point('surface',l),before);
  const wrong=ps.slice();wrong[i]={...p,metadata:{...p.metadata,landmarkPrimitive:99}};
  assert.throws(()=>r.bindProjectionBank(0,wrong),/identity|topology/);
  assert.throws(()=>r.bindProjectionBank(0,ps.slice(1)),/topology/);
  const bad=ps.slice();bad[i]={...p,points:p.points.map(()=>p.points[0].slice())};
  assert.throws(()=>r.bindProjectionBank(0,bad).point('surface',l),/Degenerate/);
});
test('material projection distinguishes invalid anchors, out-of-frame and terrain blocking',()=>{
  const m=model(),r=resolver.create(m),ps=bank(m),i=pickableSpan(ps),p=ps[i],
    l=anchorFor(r,p,'edge',[0,1],[.4,.6]),s=projection.create(m,camera(),W,H,opts('vacuum'));
  for(const bad of [{...l,anchor:{...l.anchor,indices:[0,2]}},{...l,anchor:{...l.anchor,signature:'bank-v1:sha256:'+'0'.repeat(64)}},
    {...l,anchor:{...l.anchor,kind:'vertex',indices:[0],weights:[1]}}]){
    const q=s.edge(bad);assert.equal(q.status,'invalid_anchor');assert.equal(q.pixel,null);assert.ok(q.reason);
  }
  const off=projection.create(m,camera(.65,3),W,H,opts('vacuum')).edge(l);
  assert.equal(off.status,'out_of_frame');assert.ok(off.pixel.every(Number.isFinite));
  const flat=projection.create({...m,showModel:2},camera(),W,H,opts('vacuum')).edge(l);
  assert.equal(flat.status,'invalid_anchor');
  const distant={...m,ObjDist:[100000,0]},dr=resolver.create(distant),dp=bank(distant);
  const j=dp.findIndex(p=>p.points.some(q=>q[2]<-100));
  const dl=anchorFor(dr,dp[j],'vertex',[0],[1]);
  const blocked=projection.create(distant,camera(),W,H,opts('vacuum')).vertex(dl);
  assert.equal(blocked.status,'blocked');assert.equal(blocked.pixel,null);
});
