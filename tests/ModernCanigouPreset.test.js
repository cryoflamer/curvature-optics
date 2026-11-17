'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {extractAllDemoStates}=require('../tools/audit-legacy-modern-boundary');
const adapter=require('../src/ui/modern/ModernSceneState');
const catalog=require('../src/ui/modern/ModernLocationCatalog');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const compare=require('../src/ui/modern/ModernCompareModel');
const compareState=require('../src/ui/modern/ModernCompareState');
const experiments=require('../src/ui/modern/ModernExperimentState');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const authored=extractAllDemoStates(fs.readFileSync(path.join(root,'src/animation/CurvatureDemos.js'),'latin1'))
  .find(d=>d.demo==='Canigou').states;
const vec={Norm:a=>a.map(v=>v/Math.hypot(...a)),
  Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],
  Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((x,i)=>x+b[i]),
  ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
function model(){
  const ctx=vm.createContext({JsgVect3:vec});
  vm.runInContext(read('src/app/CurvatureModel.js'),ctx);
  return vm.runInContext('new CurveAppClass()',ctx);
}
const activeFields=['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos',
  'ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'];
function assertSourceBank(m,original){
  for(const key of activeFields)assert.deepEqual(Array.from(m[key]),original[key],key);
  assert.equal(m.showModel,1);
  assert.equal(m.rEarth,original.rEarth);
  assert.equal(m.showGrid,original.showGrid);
}
function capture(m,id,kind){
  return experiments.capture(m,{atmosphere:kind,occlusionRadius:6371000,
    preset:id,resetPreset:id},compareState.initial(m,kind,6371000),
  {mode:'compare',selected:'A',eyeLevel:false,horizon:true});
}

test('Canigou 257 km / 1000 m vacuum preset derives its camera and both mountain banks from authored state index 2',()=>{
  assert.equal(authored.length,8);
  const m=model(),original=authored[2];
  const p=adapter.applyPreset(m,'canigou');m.Update();
  for(const key of ['Height','FocalLengthField','Pan','Roll'])
    assert.equal(m[key],original[key],key);
  assertSourceBank(m,original);
  assert.equal(original.Nick,0);assert.equal(m.Nick,-1,'eye-level Modern camera aims toward the geometric horizon');
  assert.equal(original.ObjType[0],5);
  assert.equal(original.ObjDist[0],257000);
  assert.equal(original.refractionCoeff,0);
  assert.equal(p.atmosphere,'vacuum');
  assert.equal(original.viewcenterHorizon,0);
  assert.equal(m.viewcenterHorizon,3,'Modern eye-level composition is intentionally different');
  assert.equal(catalog.scenario('canigou-mountain').status,'partial');
  assert.equal(catalog.scenario('canigou-mountain').nativePresetId,'canigou');
  assert.ok(catalog.NATIVE_PRESETS.includes('canigou'));
  assert.ok(catalog.NATIVE_PRESETS.includes('canigou-low'));
});

test('Canigou low-observer preset carries source state index 4 geometry but explicitly uses a different atmosphere',()=>{
  const m=model(),original=authored[4];
  const p=adapter.applyPreset(m,'canigou-low');m.Update();
  for(const key of ['Height','FocalLengthField','Pan','Roll'])
    assert.equal(m[key],original[key],key);
  assertSourceBank(m,original);
  assert.equal(original.Nick,0);assert.equal(m.Nick,-.5,'low observer horizon is closer to eye level');
  assert.equal(original.Height,244);
  assert.equal(original.refractionCoeff,.16761);
  assert.equal(p.atmosphere,'standard');
  assert.match(p.description,/atmospheric refraction/);
  assert.doesNotMatch(p.description,/Legacy|244|standard|constant-k/,
    'author caption must not promise starting physical inputs or source-model parity');
  assert.notEqual(p.atmosphere,adapter.PRESETS.canigou.atmosphere);
});

test('Modern horizon-aim camera keeps the distant summit within the narrow FOV for both observer heights',()=>{
  for(const id of ['canigou','canigou-low']){
    const m=model();adapter.applyPreset(m,id);m.Update();
    // Geometric (vacuum) line from the observer tangent frame to the
    // nominal mountain summit. This is a CAMERA framing check, not a
    // refraction or optical visibility prediction.
    const separation=m.ObjDist[0]/m.rEarth;
    const radial=(m.rEarth+m.ObjSize[0])*Math.cos(separation)-(m.rEarth+m.Height);
    const forward=(m.rEarth+m.ObjSize[0])*Math.sin(separation);
    const summitAngle=Math.atan2(radial,forward);
    const verticalHalfFov=Math.atan(Math.tan(m.camViewAngle/2)/
      Math.sqrt(1+m.deviceRatio*m.deviceRatio));
    const aim=m.Nick*Math.PI/180;
    assert.ok(Math.abs(summitAngle-aim)<verticalHalfFov,
      id+' nominal summit should be inside the eye-level-centered Modern frame');
    const pair=compare.pair(m);
    assert.ok(compare.invariant(pair));
    assert.equal(pair.A.Nick,pair.B.Nick,'Compare must keep one shared camera');
    assert.equal(pair.A.viewcenterHorizon,3);
  }
});

test('Canigou 40-mountain world geometry works independently for Scene and physical Compare A/B',()=>{
  const m=model();adapter.applyPreset(m,'canigou');m.Update();
  assert.equal(m.NObjects[0],40);
  assert.equal(m.NObjects[1],0);
  const pair=compare.pair(m);
  assert.ok(compare.invariant(pair));
  assert.equal(pair.A.showModel,1);assert.equal(pair.B.showModel,2);
  for(const [side,globe] of [['A',true],['B',false]]){
    assert.deepEqual(Array.from(pair[side].ObjType),[5,3]);
    const pieces=geometry.objectSequence(pair[side],0,globe,{physicalSurface:true,
      opticsNeutral:true,curvature:globe?1/m.rEarth:0});
    assert.equal(pieces.length,40);
    pieces.forEach((part,i)=>{
      assert.equal(part.scene.metadata.objectType,5);
      assert.equal(part.scene.metadata.drawn,i);
      assert.equal(part.params.horizontalScale,1);
      assert.ok(part.scene.primitives.some(p=>p.type==='polygon'&&p.mode===3));
      assert.ok(part.scene.primitives.every(p=>p.points.every(v=>v.every(Number.isFinite))));
    });
    assert.equal(geometry.objectSequence(pair[side],1,globe,{opticsNeutral:true}).length,0);
  }
});

test('Canigou IDs persist through History payload, JSON, URL and reset; switching back clears mountain variations',()=>{
  const m=model();
  for(const [id,kind] of [['canigou','vacuum'],['canigou-low','standard']]){
    adapter.applyPreset(m,id);m.Update();
    const input=capture(m,id,kind);
    assert.deepEqual(experiments.validate(input),input);
    assert.deepEqual(experiments.decode(experiments.encode(input)),input);
    assert.deepEqual(experiments.readUrl(new URL(experiments.urlWithExperiment('https://example.org/',input)).search),input);
    assert.equal(input.scene.preset,id);
    assert.equal(input.scene.resetPreset,id);
    assert.equal(input.scene.atmosphere,kind);
    assert.equal(input.scene.objects.ObjSideVar[0],-5620);
  }
  adapter.applyPreset(m,'pontchartrain');m.Update();
  assert.deepEqual(Array.from(m.ObjType),[3,3]);
  assert.deepEqual(Array.from(m.ObjSideVar),[0,0]);
  assert.deepEqual(Array.from(m.ObjSizeVar),[0,0]);
});

function fakeGraph(){
  const ctx={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},
    closePath(){},stroke(){},fill(){},clearRect(){},setLineDash(){},
    measureText(){return {width:0};},fillText(){}};
  return {Canvas:{width:700,height:466,getContext(){return ctx;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
}
test('Canigou physical renderer accepts high and low studies without special-case optics or fake cutoffs',()=>{
  const m=model(),g=fakeGraph();
  for(const [id,kind] of [['canigou','vacuum'],['canigou-low','standard']]){
    adapter.applyPreset(m,id);m.Update();
    const rendered=renderer.renderPhysical(g,m,{atmosphere:kind,occlusionRadius:6371000,interactive:false});
    assert.equal(rendered.mode,'physical-scene');
    assert.ok(Number.isFinite(rendered.drawn));
    assert.ok(Number.isFinite(rendered.fillTriangles));
    assert.ok(Number.isFinite(rendered.unresolved));
    assert.ok(rendered.drawn>0,id+' must produce some geometry');
    assert.ok(rendered.fillTriangles>0,id+' must produce actual optical filled polygons');
  }
});
