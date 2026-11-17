'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {extractAllDemoStates}=require('../tools/audit-legacy-modern-boundary');
const scene=require('../src/ui/modern/ModernSceneState');
const catalog=require('../src/ui/modern/ModernLocationCatalog');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const compare=require('../src/ui/modern/ModernCompareModel');
const compareState=require('../src/ui/modern/ModernCompareState');
const experiments=require('../src/ui/modern/ModernExperimentState');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const vec={Norm:a=>a.map(v=>v/Math.hypot(...a)),
  Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],
  Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((x,i)=>x+b[i]),
  ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
function model(){
  const ctx=vm.createContext({JsgVect3:vec});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),ctx);
  return vm.runInContext('new CurveAppClass()',ctx);
}
const states=extractAllDemoStates(fs.readFileSync('src/animation/CurvatureDemos.js','latin1'))
  .find(e=>e.demo==='Grace').states;
const fields=['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType',
  'ObjSidePos','ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'];
function graph(){
  const ctx={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},
    closePath(){},stroke(){},fill(){},clearRect(){},setLineDash(){},
    measureText(){return {width:0};},fillText(){}};
  return {Canvas:{width:680,height:453,getContext(){return ctx;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
}
test('Grace uses source state 8 geometry, a vacuum globe and explicit camera-only adaptation',()=>{
  assert.equal(states.length,9);
  const legacy=states[7],m=model();const p=scene.applyPreset(m,'grace');m.Update();
  for(const key of fields)assert.deepEqual(Array.from(m[key]),legacy[key],key);
  for(const key of ['Height','Pan','Roll','FocalLengthField'])assert.equal(m[key],legacy[key]);
  assert.equal(legacy.showModel,1);
  assert.equal(legacy.refractionCoeff,0);
  assert.equal(p.atmosphere,'vacuum');
  assert.equal(m.Nick,-.21);
  assert.equal(m.viewcenterHorizon,3);
  assert.equal(legacy.ObjDist[0],28000);
  assert.equal(legacy.ObjDist[1],50100);
  assert.equal(catalog.scenario('anacapa-grace-platform').nativePresetId,'grace');
  // The source's early duplicated mountain interval is NOT silently corrected.
  assert.equal(states[0].ObjDeltaDist[1],0);
  const broken=model();scene.applyPreset(broken,'grace');broken.ObjDeltaDist[1]=0;
  assert.throws(()=>geometry.objectSequence(broken,1,true,{physicalSurface:true,curvature:1/6371000}),
    /Positive spacing/);
});
test('Legacy bridge local pillars and parapet match DrawShape for both palettes',()=>{
  const source=fs.readFileSync('src/legacy/CurvatureLegacyDrawing.js','utf8');
  const begin=source.indexOf('function DrawShape( objIx, g, m ) {');
  const end=source.indexOf('\nfunction ',begin+10);
  assert.ok(begin>0&&end>begin);
  const ctx={window:{},document:{getElementById:()=>({checked:true})},
    JsgVect3:{Null:()=>[0,0,0],Copy:v=>v.slice()}};
  vm.runInNewContext(source.slice(begin,end)+'\nthis.run=DrawShape;',ctx);
  for(const hidden of [false,true]){
    const out=[];let fill;
    const g={SetBgColor:c=>{fill=c;},GetTransPointOnPlane(x,y,p){p[0]=x;p[1]=y;p[2]=0;},
      RectOnPlane(x1,y1,x2,y2,mode){this.PolygonOnPlane([x1,x2,x2,x1,x1],[y1,y1,y2,y2,y1],mode);},
      PolygonOnPlane(xs,ys,mode){out.push({type:'polygon',points:xs.map((x,i)=>[x,ys[i]]),
        mode,style:{fill}});}};
    ctx.run(0,g,{ObjType:[6,3],NObjectsDrawn:[0,0],ObjSideType:[0,0],
      isHiddenObj:[hidden,false],Col:1});
    assert.deepEqual(geometry.localObject(6,0,hidden),JSON.parse(JSON.stringify(out)));
  }
  assert.throws(()=>geometry.localObject(7,0,false),/not been independently ported/);
});
test('Grace decks connect adjacent physical supports on both surfaces, but never different banks',()=>{
  const m=model();scene.applyPreset(m,'grace');m.Update();
  const pair=compare.pair(m);
  assert.ok(compare.invariant(pair));
  for(const [side,globe] of [['A',true],['B',false]]){
    const obj=pair[side],opts={physicalSurface:true,opticsNeutral:true,
      curvature:globe?1/obj.rEarth:0};
    assert.equal(obj.ObjType[0],6);assert.equal(obj.ObjType[1],5);
    const bridge=geometry.createObjectSequenceScene(obj,0,globe,opts);
    const island=geometry.createObjectSequenceScene(obj,1,globe,opts);
    assert.equal(bridge.metadata.objectCount,2);
    assert.equal(island.metadata.objectCount,11);
    const roads=bridge.primitives.filter(p=>p.metadata.kind==='bridge-road');
    assert.equal(roads.length,1);
    assert.equal(roads[0].points.length,4);
    assert.ok(roads[0].points.every(v=>v.every(Number.isFinite)));
    assert.equal(roads[0].style.fill,'#cdcac3');
    assert.ok(bridge.primitives.filter(p=>p.type==='polygon'&&p.mode&2).length>=9);
    assert.ok(island.primitives.some(p=>p.type==='polygon'&&p.mode&2));
    obj.ObjSideType[0]=2;
    const scattered=geometry.createObjectSequenceScene(obj,0,globe,opts);
    assert.equal(scattered.primitives.filter(p=>p.metadata.kind==='bridge-road').length,0,
      'Legacy does not connect platforms with pseudo-random lateral offsets');
  }
});
test('Grace Scene and Compare are rendered through shared physical optics and round-trip',()=>{
  const m=model();scene.applyPreset(m,'grace');m.Update();
  const snapshot=experiments.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'grace',resetPreset:'grace'},compareState.initial(m,'vacuum',6371000),
  {mode:'compare',selected:'A',eyeLevel:false,horizon:true});
  assert.deepEqual(experiments.validate(snapshot),snapshot);
  assert.deepEqual(experiments.decode(experiments.encode(snapshot)),snapshot);
  assert.deepEqual(experiments.readUrl(new URL(experiments.urlWithExperiment('https://example.org/',snapshot)).search),snapshot);
  const g=graph();
  for(const globe of [true,false]){
    m.showModel=globe?1:2;m.Update();
    const out=renderer.renderPhysical(g,m,{atmosphere:'vacuum',occlusionRadius:6371000,interactive:false});
    assert.equal(out.mode,'physical-scene');
    assert.ok(out.drawn>0,'real optics should produce visible contours');
    assert.ok(out.fillTriangles>0,'bridge/island faces should be projected as fills');
  }
});
