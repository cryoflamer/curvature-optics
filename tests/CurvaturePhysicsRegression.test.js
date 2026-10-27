'use strict';
// Compatpatch 98: non-pixel, analytic reference checks for the independent
// world-space geometry. Neither DrawModel nor GraphX3DX is the oracle here.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const composition=require('../src/scene/CurvatureIndependentComposition');
const frames=require('../src/scene/CurvatureRenderFrame');

const EARTH_RADIUS=6371000;
const HEIGHTS=[1.7,15,100,1000];
const close=(actual,expected,tol,message)=>
  assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tol,
    `${message}: ${actual} vs ${expected} (tolerance ${tol})`);
const norm=v=>Math.hypot(...v);
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);

// Independent ideal-sphere right-triangle solution. These reference formulas
// do not call the geometry engine, horizon partition, or rasterizer.
function referenceHorizon(radius,height){
  const angle=Math.acos(radius/(radius+height));
  return {angle,arc:radius*angle,range:Math.sqrt(height*(2*radius+height)),
    tangentRadius:radius*Math.sin(angle),
    tangentDepth:radius+height-radius*Math.cos(angle)};
}
function target(radius,height,distance,targetHeight,globe){
  if(!globe)return [0,distance,targetHeight-height];
  const angle=distance/radius;
  return [0,(radius+targetHeight)*Math.sin(angle),
    (radius+targetHeight)*Math.cos(angle)-(radius+height)];
}
// Straight-line visibility in vacuum. Check the closest approach along a
// *finite segment*, not an infinite line: target and observer are endpoints.
function lineBlockedBySphere(radius,height,point){
  const center=[0,0,-radius-height],start=sub([0,0,0],center);
  const delta=point;
  const t=Math.max(0,Math.min(1,-dot(start,delta)/dot(delta,delta)));
  const closest=start.map((x,i)=>x+t*delta[i]);
  // A 1-micrometre clearance allowance avoids classifying endpoint touch.
  return norm(closest)<radius-1e-6;
}
function towerModel(radius,height,opts={}){
  const h=referenceHorizon(radius,height);
  return Object.assign({geometryRadius:radius,Height:height,
    rDisk:h.tangentRadius,zDisk:h.tangentDepth,
    hDip:radius*(1-Math.cos(h.angle)),hDisk:radius*Math.cos(h.angle),
    rFEarth:10007543,
    ObjType:[3,3],NObjects:[5,0],ObjDist:[500,0],ObjDeltaDist:[5000,0],
    ObjSidePos:[0,0],ObjSideVar:[0,0],ObjSideType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0],ObjSizeType:[0,0],
    showGrid:0,showTangent:false,showData:false,
    FEEqCol:'blue',FEGridCol:'blue',GlobeGridCol:'blue',GlobeFGridCol:'red',
    PanRad:0,sceneWidth:100000,aDip:h.angle,aDelta:h.angle/10},opts);
}
function worldAnchor(radius,height,distance,altitude,globe){
  const plane=geometry.towerPlacement({geometryRadius:radius,height,objectSize:altitude||1,
    longitude:distance/radius,latitude:0,globe,
    verticalScale:1,horizontalScale:1});
  return altitude===0?plane.origin:plane.origin.map((x,i)=>x+plane.yAxis[i]);
}

test('vacuum Globe: derived horizon is the tangent to the physical sphere at varied heights',()=>{
  for(const radius of [EARTH_RADIUS,1e6,1e7])for(const height of HEIGHTS){
    const h=referenceHorizon(radius,height),m=towerModel(radius,height);
    const circle=geometry.horizonCircle(m,{segments:64});
    close(norm(circle.center.map((x,i)=>x-[0,0,-radius-height][i])),
      radius*Math.cos(h.angle),2e-6,'disk center distance to Earth center');
    close(circle.radius,h.tangentRadius,1e-7,'disk radius');
    close(circle.center[2],-h.tangentDepth,1e-7,'disk depth');
    // acos(R/(R+h)) loses a few ULPs at tiny h/R; allow a relative
    // 1e-9 scale tolerance when checking the independent sqrt expression.
    close(Math.hypot(h.tangentRadius,h.tangentDepth),h.range,Math.max(1e-5,h.range*1e-9),'slant range');
    for(const point of circle.points){
      const radial=sub(point,[0,0,-radius-height]);
      close(norm(radial),radius,2e-6,'disk vertices lie on sphere');
      close(dot(point,radial)/(norm(point)*norm(radial)),0,3e-10,
        'observer ray perpendicular to surface radius');
    }
    close(h.arc,radius*h.angle,1e-10,'surface arc');
  }
});

test('vacuum horizon grows with observer height and vanishes continuously at surface',()=>{
  let previous=0;
  for(const height of HEIGHTS){
    const h=referenceHorizon(EARTH_RADIUS,height);
    assert.ok(h.arc>previous);
    assert.ok(h.range>h.arc);
    previous=h.arc;
  }
  close(referenceHorizon(EARTH_RADIUS,0).arc,0,1e-12,'zero-height limit');
});

test('Globe placement follows spherical surface while Flat placement has no sagitta',()=>{
  for(const height of [1.7,15,100])for(const distance of [0,5000,15000,30000]){
    const ground=worldAnchor(EARTH_RADIUS,height,distance,0,true);
    const expected=target(EARTH_RADIUS,height,distance,0,true);
    ground.forEach((coordinate,i)=>close(coordinate,expected[i],2e-8,'globe ground coordinate '+i));
    close(norm(sub(ground,[0,0,-EARTH_RADIUS-height])),EARTH_RADIUS,2e-8,
      'globe ground radius');
    const top=worldAnchor(EARTH_RADIUS,height,distance,23,true);
    target(EARTH_RADIUS,height,distance,23,true).forEach((coordinate,i)=>
      close(top[i],coordinate,2e-8,'globe top coordinate '+i));
    const flatGround=worldAnchor(EARTH_RADIUS,height,distance,0,false);
    const flatTop=worldAnchor(EARTH_RADIUS,height,distance,23,false);
    close(flatGround[1],distance,1e-9,'flat ground range');
    close(flatGround[2],-height,1e-9,'flat ground is planar');
    close(flatTop[2],23-height,1e-9,'flat vertical target');
    const sagitta=EARTH_RADIUS*(Math.cos(distance/EARTH_RADIUS)-1);
    close(ground[2]+height,sagitta,2e-8,'curvature sagitta');
  }
});

test('vacuum finite-ray visibility: Globe hides bases first, Flat has no geometric horizon',()=>{
  const radius=EARTH_RADIUS,height=15;
  const observerHorizon=referenceHorizon(radius,height).arc;
  const topHorizon=referenceHorizon(radius,23).arc;
  assert.ok(observerHorizon<25000&&25000<observerHorizon+topHorizon);
  assert.ok(40000>observerHorizon+topHorizon);
  const cases=[
    {range:5000,groundBlocked:false,topBlocked:false},
    {range:25000,groundBlocked:true,topBlocked:false},
    {range:40000,groundBlocked:true,topBlocked:true}
  ];
  for(const c of cases){
    for(const altitude of [0,23]){
      const point=worldAnchor(radius,height,c.range,altitude,true);
      assert.equal(lineBlockedBySphere(radius,height,point),
        altitude===0?c.groundBlocked:c.topBlocked,
        `Globe range=${c.range}, altitude=${altitude}`);
      const flatPoint=worldAnchor(radius,height,c.range,altitude,false);
      const planeStart=-height;
      // Along the straight line, all interior points are strictly above the
      // flat ground except the ground target endpoint.
      for(const t of [0,0.25,0.5,0.75,0.999])
        assert.ok(t*flatPoint[2]>(planeStart+1e-9)||t===0,
          `Flat ray clears the plane: range=${c.range}, altitude=${altitude}, t=${t}`);
    }
  }
  for(const altitude of [0,5,23,100]){
    const limit=referenceHorizon(radius,height).angle+
      referenceHorizon(radius,altitude).angle;
    for(const factor of [0.9,1.1]){
      const distance=radius*limit*factor;
      const point=target(radius,height,distance,altitude,true);
      assert.equal(lineBlockedBySphere(radius,height,point),factor>1,
        `analytical tangent boundary altitude=${altitude}, factor=${factor}`);
    }
  }
});

test('Globe and Flat horizon layers have distinct physical semantics, not pixel parity',()=>{
  for(const globe of [true,false]){
    const m=towerModel(EARTH_RADIUS,15);
    const c=composition.composeMain(m,globe);
    assert.equal(composition.auditFull(c).rendererReady,true);
    const masks=c.ranges.filter(r=>r.role==='occlusion');
    assert.equal(masks.length,1);
    const polygons=masks.flatMap(r=>c.scene.primitives.slice(r.start,r.end));
    if(globe){
      assert.ok(polygons.length>0,'Globe has a painter-order horizon mask');
      assert.ok(polygons.every(p=>p.type==='polygon'&&p.mode===2&&p.style.fill==='white'));
      for(const p of polygons)for(const v of p.points){
        close(Math.hypot(v[0],v[1]),m.rDisk,1e-7,'globe horizon contour radius');
        close(v[2],-m.zDisk,1e-8,'globe horizon contour depth');
      }
    }else assert.equal(polygons.length,0,'Flat has no opaque geometric horizon mask');
  }
});

test('dual object groups stay complete and correctly partitioned in independent scene',()=>{
  const m=towerModel(EARTH_RADIUS,15,{NObjects:[85,2],ObjDist:[50,25550],
    ObjDeltaDist:[297.55,373],ObjSidePos:[32,22.4],ObjSize:[23,64]});
  for(const globe of [true,false]){
    const c=composition.composeMain(m,globe);
    assert.equal(composition.auditFull(c).rendererReady,true);
    assert.deepEqual(c.scene.metadata.objectIndices,[1,0]);
    for(const index of [0,1]){
      const partition=geometry.objectHorizonPartition(m,index,globe);
      assert.equal(partition.total,m.NObjects[index]);
      const layer=c.ranges.filter(x=>x.name==='behind-'+index||x.name==='before-'+index);
      const actualCount=layer.reduce((sum,r)=>sum+r.count,0);
      const expectedCount=partition.behind.concat(partition.before).reduce(
        (sum,e)=>sum+e.scene.primitives.length,0);
      assert.equal(actualCount,expectedCount,'no objects silently removed');
      if(!globe)assert.equal(partition.behind.length,0);
    }
  }
});

test('effective-radius legacy-k changes geometric proxy; vacuum reference remains explicit',()=>{
  const height=15,radius=EARTH_RADIUS;
  const vacuum=referenceHorizon(radius,height);
  const k=0.13,proxyRadius=radius/(1-k);
  const proxy=referenceHorizon(proxyRadius,height);
  assert.ok(proxy.arc>vacuum.arc,'larger proxy radius extends apparent geometric horizon');
  assert.ok(proxy.angle<vacuum.angle,'same reference point has smaller central angle');
  const model=towerModel(proxyRadius,height);
  close(geometry.horizonCircle(model).radius,proxy.tangentRadius,1e-8,
    'effective-radius disk is a geometric proxy');
  // No assertion here claims a refracted optical ray has been integrated.
});


test('physical ground visibility agrees with Globe partition at both sides of tangent',()=>{
  const radius=EARTH_RADIUS,height=15,limit=referenceHorizon(radius,height).arc;
  for(const distance of [0.5*limit,0.95*limit,1.05*limit,1.5*limit,2.5*limit]){
    const m=towerModel(radius,height,{ObjDist:[distance,0],NObjects:[1,0]});
    const single=geometry.objectSequence(m,0,true);
    assert.equal(single.length,1);
    const blocked=lineBlockedBySphere(radius,height,worldAnchor(radius,height,distance,0,true));
    assert.equal(single[0].hidden,blocked,`Globe partition at ${distance}m`);
    assert.equal(geometry.objectSequence(m,0,false)[0].hidden,false,
      `Flat has no curvature partition at ${distance}m`);
  }
});

test('independent globe guide vertices lie on the sphere and projected guides on the plane',()=>{
  const radius=EARTH_RADIUS,height=15;
  const m=towerModel(radius,height,{showGrid:3});
  const guide=geometry.globeSurfaceGuides(m);
  const globes=guide.primitives.filter(p=>p.metadata.projection==='globe');
  const flats=guide.primitives.filter(p=>p.metadata.projection==='plane');
  assert.ok(globes.length>0&&flats.length>0);
  for(const primitive of globes)for(const p of primitive.points)
    close(norm(sub(p,[0,0,-radius-height])),radius,3e-8,
      'latitude/longitude guide remains on spherical surface');
  for(const primitive of flats)for(const p of primitive.points)
    close(p[2],-height,1e-9,'projected globe grid is planar');
  const flat=geometry.flatSurfaceGuides(m,{segments:32});
  for(const primitive of flat.primitives)for(const p of primitive.points)
    close(p[2],-height,1e-9,'flat surface guides remain planar');
});

test('world render frame preserves geometric invariants and ordered layers',()=>{
  const m=towerModel(EARTH_RADIUS,15,{NObjects:[85,2],ObjDist:[50,25550],
    ObjDeltaDist:[297.55,373],ObjSidePos:[32,22.4]});
  const camera={pos:[0,0,0],center:[0,1,0],up:[0,0,1],
    sceneSize:100,screenSize:1,objectZExtend:0,zoom:1,near:0.001};
  for(const globe of [true,false]){
    const composed=composition.composeMain(m,globe);
    const frame=frames.fromComposition(composed,camera,640,480);
    assert.equal(frame.kind,'world-scene-frame');
    assert.equal(frame.viewport.width,640);
    assert.equal(frame.viewport.height,480);
    assert.deepEqual(frame.layers,composed.ranges);
    assert.ok(frame.scene.primitives.every((p,i)=>p.commandIndex===i));
    const snapshot=frames.validate(frame);
    assert.deepEqual(snapshot.layers,frame.layers);
    assert.equal(snapshot.scene.primitives.length,frame.scene.primitives.length);
    // Frame must be a snapshot, not an alias to live composition/camera.
    camera.pos[0]=10;
    assert.equal(frame.camera.pos[0],0);
    camera.pos[0]=0;
  }
});
