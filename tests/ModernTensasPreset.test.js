'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {extractAllDemoStates}=require('../tools/audit-legacy-modern-boundary');
const scene=require('../src/ui/modern/ModernSceneState');
const catalog=require('../src/ui/modern/ModernLocationCatalog');
const geo=require('../src/geometry/CurvatureGeometryEngine');
const compare=require('../src/ui/modern/ModernCompareModel');
const state=require('../src/ui/modern/ModernCompareState');
const codec=require('../src/ui/modern/ModernExperimentState');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const vec={Norm:a=>a.map(x=>x/Math.hypot(...a)),Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],
  Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((x,i)=>x+b[i]),ScalarProd:(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0)};
function model(){const c=vm.createContext({JsgVect3:vec});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),c);
  return vm.runInContext('new CurveAppClass()',c);}
function graph(){const ctx={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},
  closePath(){},stroke(){},fill(){},clearRect(){},setLineDash(){},measureText(){return {width:0};},fillText(){}};
  return {Canvas:{width:640,height:420,getContext(){return ctx;}},Camera:{},ContextScale:1,
    WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},AutoScalePix:false,MinLineWidth:1,
    ScalePixInt:false,DevicePixelRatio:1,GetPixScaling(){return 1;},SetViewport(){},
    SetGraphClipping(){},SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},SetCameraZoom(z){this.Camera.Zoom=z;}};}
const source=fs.readFileSync('src/legacy/CurvatureLegacyDrawing.js','utf8');
const start=source.indexOf('function DrawShape( objIx, g, m ) {'),end=source.indexOf('\nfunction ',start+12);
const c={window:{},document:{getElementById:()=>({checked:true})},JsgVect3:{Null:()=>[0,0,0],Copy:a=>a.slice()}};
vm.runInNewContext(source.slice(start,end)+'\nthis.drawShape=DrawShape;',c);
function legacyLocal(drawn,variation,hidden){let fill,primitives=[];
  const g={SetBgColor:v=>fill=v,SetColor(){},GetTransPointOnPlane(x,y,p){p[0]=x;p[1]=y;p[2]=0;},
    RectOnPlane(x1,y1,x2,y2,mode){this.PolygonOnPlane([x1,x2,x2,x1,x1],[y1,y1,y2,y2,y1],mode);},
    PolygonOnPlane(xs,ys,mode){primitives.push({type:'polygon',points:xs.map((x,i)=>[x,ys[i]]),mode,style:{fill}});}};
  c.drawShape(0,g,{ObjType:[7,3],isHiddenObj:[hidden,false],NObjectsDrawn:[drawn,0],
    ObjSizeVar:[variation,0],ObjSidePos:[-2,0],LastPosValid:[false,false]});
  return JSON.parse(JSON.stringify(primitives));
}
const states=extractAllDemoStates(fs.readFileSync('src/animation/CurvatureDemos.js','latin1'))
  .find(x=>x.demo==='Tensas').states;
const fields=['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos',
  'ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'];
test('Tensas local pillars and elevated crossover match untouched Legacy DrawShape for transition indices and colors',()=>{
  for(const hidden of [false,true])for(const variation of [0,.125])
    for(const drawn of [0,1,2,3,4,5,6,7,8,9,46,47,48,86]){
      const actual=geo.localObject(7,0,hidden,{drawn,variation}),expected=legacyLocal(drawn,variation,hidden);
      assert.equal(actual.length,expected.length);
      for(let j=0;j<actual.length;j++){
        try {assert.deepEqual(actual[j],expected[j]);}
        catch(e){console.log('MISMATCH',drawn,variation,hidden,j,'ACT',JSON.stringify(actual[j]),'EXP',JSON.stringify(expected[j]));throw Error('Legacy Tensas shape mismatch');}
      }

    }
  assert.throws(()=>geo.localObject(7,0,false),/drawn sequence/);
  assert.throws(()=>geo.localObject(10,0,false,{drawn:0}),/not been independently ported/);
});
test('Tensas source state 4 is preserved as partial Modern vacuum preset',()=>{
  const m=model(),legacy=states[3],p=scene.applyPreset(m,'tensas');m.Update();
  assert.equal(states.length,6);
  for(const f of fields)assert.deepEqual(Array.from(m[f]),legacy[f],f);
  for(const f of ['Height','FocalLengthField','Nick','Pan','Roll'])assert.equal(m[f],legacy[f],f);
  assert.equal(p.atmosphere,'vacuum');assert.equal(m.viewcenterHorizon,3);
  assert.equal(legacy.refractionCoeff,0);
  assert.equal(catalog.scenario('tensas-bayou-bridge').nativePresetId,'tensas');
  assert.equal(legacy.ObjType[0],7);
});
test('Tensas world-space road segments and shore are continuous per bank on Globe/Flat',()=>{
  const m=model();scene.applyPreset(m,'tensas');m.Update();
  const pair=compare.pair(m);assert.ok(compare.invariant(pair));
  for(const globe of [true,false]){
    const obj=globe?pair.A:pair.B;
    const opts={physicalSurface:true,opticsNeutral:true,curvature:globe?1/6371000:0};
    const entries=geo.objectSequence(obj,0,globe,opts);
    assert.equal(entries.length,87);
    assert.ok(entries.every(e=>e.params.horizontalScale===1&&e.params.verticalScale===1));
    const mesh=geo.createObjectSequenceScene(obj,0,globe,opts);
    assert.equal(mesh.metadata.objectCount,87);
    assert.equal(mesh.primitives.filter(p=>p.metadata.kind==='tensas-road').length,172);
    assert.equal(mesh.primitives.filter(p=>p.metadata.kind==='tensas-shore').length,8);
    assert.ok(mesh.primitives.every(p=>p.points.every(v=>v.length===3&&v.every(Number.isFinite))));
    assert.ok(mesh.primitives.some(p=>p.mode===3&&p.style.fill==='#565a56'));
    assert.ok(mesh.primitives.filter(p=>p.metadata.kind==='tensas-road')
      .every(p=>p.points.length===4));
  }
});
test('Tensas physical render, Compare and experiment serialization stay inside native Modern',()=>{
  const m=model();scene.applyPreset(m,'tensas');m.Update();
  const snap=codec.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'tensas',resetPreset:'tensas'},state.initial(m,'vacuum',6371000),
    {mode:'compare',selected:'A',eyeLevel:false,horizon:true});
  assert.deepEqual(codec.validate(snap),snap);
  assert.deepEqual(codec.decode(codec.encode(snap)),snap);
  assert.deepEqual(codec.readUrl(new URL(codec.urlWithExperiment('https://example.org/',snap)).search),snap);
  const g=graph();
  for(const globe of [true,false]){
    m.showModel=globe?1:2;m.Update();
    const result=renderer.renderPhysical(g,m,{atmosphere:'vacuum',occlusionRadius:6371000,interactive:false});
    assert.equal(result.mode,'physical-scene');
    assert.ok(result.drawn>0);
    assert.ok(result.fillTriangles>0);
  }
});
