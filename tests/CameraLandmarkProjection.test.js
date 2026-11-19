'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const landmarks=require('../src/calibration/CameraLandmarkProjection');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const physicalCamera=require('../src/app/CurvaturePhysicalCamera');
function model(surface,type=3){
  const context=vm.createContext({JsgVect3:{Norm:a=>a.map(v=>v/Math.hypot(...a)),
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((v,i)=>v+b[i]),ScalarProd:(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0)}});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),context);
  const m=vm.runInContext('new CurveAppClass()',context);
  Object.assign(m,{showModel:surface==='globe'?1:2,Height:12,Pan:1.2,Nick:0.2,Roll:3,
    viewcenterHorizon:3,CameraEast:20,CameraNorth:90,FocalLengthField:110,showGrid:0,showTangent:0,showData:0,
    ObjType:[type,3],NObjects:[1,0],ObjDist:[1700,0],ObjSidePos:[6,0]});
  m.Update();return m;
}
function graph(width,height){
  let active=[];const points=[];
  const ctx={save(){},restore(){},setTransform(){},clearRect(){},fillRect(){},fillText(){},measureText(){return {width:20};},
    beginPath(){active=[];},moveTo(x,y){active.push([x,y]);},lineTo(x,y){active.push([x,y]);},closePath(){},
    stroke(){points.push(...active);},fill(){},clip(){}};
  return {points,Canvas:{width,height,getContext(){return ctx;}},Camera:{},ContextScale:1,
    WinTrans:{ScaleX:height,ScaleY:-height,OffsetX:width/2,OffsetY:height/2},AutoScalePix:false,
    MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,GetPixScaling(){return 1;},
    SetViewport(){},SetGraphClipping(){},SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},SetCameraZoom(z){this.Camera.Zoom=z;}};
}
function near(a,b,tol){assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])<=tol,`${a} vs ${b}`);}
function makeCamera(m){return {...physicalCamera.create(m),screenSize:1,objectZExtend:0,zoom:1,near:.001};}
function metric(id,east,north,height){return {id,east,north,height};}
for(const surface of ['flat','globe'])for(const method of ['accurate','canvas-direct'])for(const atmosphere of ['vacuum','standard','temperature-lapse']){
  test(`${surface} ${method} ${atmosphere}: authored landmark matches real painter path`,t=>{
    const m=model(surface),g=graph(1200,900),opts={atmosphere,opticalQuality:method,captureProjection:true,deferDecorations:true,
      temperatureProfile:{temperatureC:15,pressureHpa:1013.25,gradientKPerKm:-6.5}};
    const rendered=renderer.renderPhysical(g,m,opts),session=landmarks.create(m,rendered.projectionCamera,1200,900,{...opts,method});
    for(const vertex of [0,1]){
      const p=session.vertex({id:'tower:'+vertex,bank:0,objectType:3,primitive:0,vertex});
      assert.equal(p.status,'visible');assert.equal(p.meshOcclusion,'not-tested');
      const error=Math.min(...g.points.map(q=>Math.hypot(q[0]-p.pixel[0],q[1]-p.pixel[1])));
      assert.ok(error<=.5,`landmark pixel mismatch ${error}`);t.diagnostic(`endpoint error px: ${error}`);
    }
  });
}
test('analytic centered pinhole on Flat vacuum: in-frame, outside, behind and invalid inputs',()=>{
  const m=model('flat');Object.assign(m,{Pan:0,Nick:0,Roll:0,CameraEast:0,CameraNorth:0});m.Update();
  const camera=makeCamera(m),p=landmarks.create(m,camera,800,600);
  near(p.metric(metric('center',0,1000,m.Height)).pixel,[400,300],1e-9);
  const f=600*1000/camera.sceneSize;
  near(p.metric(metric('offset',10,1000,m.Height+20)).pixel,[400+10*f/1000,300-20*f/1000],1e-9);
  assert.equal(p.metric(metric('behind',0,-1000,20)).status,'behind_camera');
  const outside=p.metric(metric('out',1000,100,20));assert.equal(outside.status,'out_of_frame');assert.ok(outside.pixel.every(Number.isFinite));
  assert.equal(p.metric(metric('vertical',0,0,20)).status,'solver_failed');
  assert.throws(()=>p.metric(metric('',0,100,20)),/ID/);
  assert.throws(()=>p.vertex({id:'wrong',bank:0,objectType:8,primitive:0,vertex:0}),/topology/);
  assert.throws(()=>landmarks.create(m,camera,800,600,{atmosphere:'inverse-temperature'}),/Unsupported/);
  assert.throws(()=>landmarks.create({...m,viewcenterHorizon:0},camera,800,600),/eye-level/);
});
test('ground-hidden and grazing Globe landmarks do not masquerade as fit residuals',()=>{
  const m=model('globe');Object.assign(m,{CameraEast:0,CameraNorth:0,Pan:0,Nick:0,Roll:0});m.Update();
  for(const method of ['accurate','canvas-direct']){
    const p=landmarks.create(m,makeCamera(m),800,600,{method});
    const blocked=p.metric(metric('hidden',0,100000,1));assert.equal(blocked.status,'blocked');assert.equal(blocked.pixel,null);
    const horizon=require('../src/geometry/CurvatureSurfaceGeometry').createFromRadius(m.rEarth).geometricHorizon(m.Height).arcDistance;
    const grazing=p.metric(metric('tangent',0,horizon,0));assert.equal(grazing.status,'indeterminate');assert.equal(grazing.pixel,null);
  }
});
for(const type of [8,9])for(const surface of ['flat','globe'])for(const method of ['accurate','canvas-direct']){
  test(`Causeway type ${type}, ${surface}, ${method}: portrait/translated bridge mesh`,t=>{
    const m=model(surface,type);Object.assign(m,{CameraEast:type===8?-20:20,CameraNorth:90,Pan:0,Nick:0,Roll:-2,
      deviceRatio:2/3,FocalLengthField:45,NObjects:[3,0],ObjDeltaDist:[300,100],ObjSize:[1,10],ObjSizeVar:[0,0]});m.Update();
    const g=graph(800,1200),opts={atmosphere:'standard',opticalQuality:method,captureProjection:true,deferDecorations:true};
    const rendered=renderer.renderPhysical(g,m,opts),session=landmarks.create(m,rendered.projectionCamera,800,1200,{...opts,method});
    const source=require('../src/geometry/CurvatureGeometryEngine').createObjectSequenceScene({...m,geometryRadius:m.rEarth},0,surface==='globe',
      {opticsNeutral:true,physicalSurface:true,curvature:surface==='globe'?1/m.rEarth:0});
    const primitive=source.primitives.findIndex(p=>(p.mode&1)&&p.points.length>1);
    assert.ok(primitive>=0);
    for(const vertex of [0,1]){
      const p=session.vertex({id:'bridge:'+vertex,bank:0,objectType:type,primitive,vertex});
      assert.equal(p.status,'visible');
      const error=Math.min(...g.points.map(q=>Math.hypot(q[0]-p.pixel[0],q[1]-p.pixel[1])));
      assert.ok(error<=.5,`bridge pixel mismatch ${error}`);t.diagnostic(`endpoint error px: ${error}`);
    }
  });
}


// Exercise the *production* Accurate renderer rather than generating the
// reference pixels with the calibration projector. Its shared optical field
// and default integration step intentionally differ from individual shooting.
const photoPose=require('../src/calibration/CameraPhysicalPose');
const composition=require('../src/scene/CurvatureIndependentComposition');
const strokePreview=require('../src/renderers/CurvatureStrokePreview');

for(const scenario of [
  {name:'Globe vacuum near geometric horizon',surface:'globe',atmosphere:'vacuum',distance:12300,w:1920,h:1080},
  {name:'Globe vacuum partially hidden tower',surface:'globe',atmosphere:'vacuum',distance:22000,w:1920,h:1080,partial:true},
  {name:'Globe Standard distant telephoto',surface:'globe',atmosphere:'standard',distance:22000,w:1920,h:1080,partial:true},
  {name:'Flat Standard portrait telephoto',surface:'flat',atmosphere:'standard',distance:22000,w:1200,h:1600}
])test('Accurate authoring parity: '+scenario.name,t=>{
  const {surface,atmosphere,distance,w,h}=scenario;
  const globe=surface==='globe',m=model(surface);
  Object.assign(m,{Height:12,CameraEast:-25,CameraNorth:90,Pan:.1,Nick:-.075,Roll:3,
    deviceRatio:w/h,FocalLengthField:400,NObjects:[1,0],ObjDist:[distance,0],
    ObjSize:[23,10],ObjSizeVar:[0,0],ObjSideType:[0,0],ObjSidePos:[20,0],ObjSideVar:[0,0]});
  m.Update();
  const g=graph(w,h);
  let opticalScene;
  const rendered=renderer.renderPhysical(g,m,{atmosphere,opticalQuality:'accurate',
    geometryBackend:'canvas2d',captureProjection:true,deferDecorations:true,
    geometryAudit:{onCamera(){},onUnresolved(){},onScene(scene){opticalScene=scene;}}});
  assert.equal(rendered.geometryBackend,'Canvas 2D');
  assert.equal(rendered.opticalQuality,'accurate');
  assert.ok(opticalScene&&g.points.length>0);
  assert.ok(!rendered.budgetExceeded);
  // Do NOT pass the renderer camera into calibration: the user's accepted
  // pose must independently reconstruct the photo camera at the raster size.
  const session=landmarks.create(m,photoPose.photoCamera(m,w,h),w,h,{atmosphere,method:'accurate'});
  const authored=composition.composeOpticalMain({...m,geometryRadius:m.rEarth},globe,{physicalWorld:true});
  const bank=authored.ranges.find(r=>r.role==='objects'&&r.name==='objects-0');
  assert.ok(bank&&bank.count>0);
  // Recover the painter's exact stroke coordinates indexed by original
  // authored command, not by the closest unrelated tower or ground guide.
  const sourceByCommand=new Map(opticalScene.primitives.filter(p=>p.metadata?.kind==='physical-object-stroke')
    .map(p=>[p.commandIndex,p.metadata.opticalSourceIndex]));
  const bySource=new Map();
  for(const s of strokePreview.build(opticalScene,rendered.projectionCamera,w,h).segments){
    const id=sourceByCommand.get(s.commandIndex);
    if(id===undefined)continue;
    if(!bySource.has(id))bySource.set(id,[]);
    bySource.get(id).push(...s.points.map(p=>p.slice(0,2)));
  }
  const all=[];
  for(let i=bank.start;i<bank.end;i++){
    const p=authored.scene.primitives[i];
    if(!(p.mode&1)||p.points.length<2)continue;
    for(let j=0;j<p.points.length;j++){
      const v=p.points[j],prev=p.points[(j+p.points.length-1)%p.points.length],next=p.points[(j+1)%p.points.length];
      if(Math.hypot(...prev.map((x,k)=>x-v[k]))===0&&Math.hypot(...next.map((x,k)=>x-v[k]))===0)continue;
      all.push({primitive:i-bank.start,vertex:j,command:p.commandIndex,z:v[2]});
    }
  }
  assert.ok(all.length>=16);
  // Fixed height-stratified selection, made before inspecting projection
  // results: include the lowest and highest authored stroke vertices.
  all.sort((a,b)=>a.z-b.z||a.primitive-b.primitive||a.vertex-b.vertex);
  const selected=Array.from({length:16},(_,i)=>all[Math.round(i*(all.length-1)/15)]);
  const count={},errors=[],paintErrors=[],missing=[];
  const distancePx=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  for(const v of selected){
    const p=session.vertex({id:v.primitive+':'+v.vertex,bank:0,objectType:3,primitive:v.primitive,vertex:v.vertex});
    count[p.status]=(count[p.status]||0)+1;
    if(p.status!=='visible'){
      if(p.status!=='out_of_frame')assert.equal(p.pixel,null);
      continue;
    }
    const candidates=bySource.get(v.command)||[];
    if(!candidates.length){missing.push(p.id);continue;}
    const nearest=candidates.reduce((a,b)=>distancePx(p.pixel,a)<=distancePx(p.pixel,b)?a:b);
    errors.push(distancePx(p.pixel,nearest));
    paintErrors.push(Math.min(...g.points.map(q=>distancePx(q,nearest))));
  }
  const maxError=errors.length?Math.max(...errors):null,maxPaint=paintErrors.length?Math.max(...paintErrors):null;
  t.diagnostic(JSON.stringify({scenario:scenario.name,raster:[w,h],rendererStep:rendered.step,
    landmarkStep:200,statuses:count,compared:errors.length,missing,
    rmsPx:errors.length?Math.hypot(...errors)/Math.sqrt(errors.length):null,maxErrorPx:maxError,
    maxCanvasEndpointErrorPx:maxPaint,unresolved:rendered.unresolved,groundHorizon:rendered.groundHorizon}));
  assert.ok(errors.length>=3,'nonvacuous visible endpoint comparison');
  assert.equal(missing.length,0,'visible selected vertices must have same-source rendered strokes');
  assert.ok(maxError<=1,'photo-to-renderer mismatch: '+maxError+' px');
  assert.ok(maxPaint<=1e-5,'projected reference must reach actual Canvas stroke commands');
  if(scenario.partial)assert.ok(count.blocked>0&&count.visible>0,'partially visible tower must exercise both statuses');
  // This audit does not prove the identity of a particular clipped segment
  // endpoint or absence of mesh occlusion; same-primitive nearest endpoint
  // and actual submitted Canvas paths are the limited reference.
});
