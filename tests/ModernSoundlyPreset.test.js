'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {extractAllDemoStates}=require('../tools/audit-legacy-modern-boundary');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const scene=require('../src/ui/modern/ModernSceneState');
const compare=require('../src/ui/modern/ModernCompareModel');
const compareState=require('../src/ui/modern/ModernCompareState');
const codec=require('../src/ui/modern/ModernExperimentState');
const catalog=require('../src/ui/modern/ModernLocationCatalog');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const vector={Norm:a=>a.map(v=>v/Math.hypot(...a)),
  Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((v,i)=>v+b[i]),
  ScalarProd:(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0)};
function model(){const c=vm.createContext({JsgVect3:vector});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),c);
  return vm.runInContext('new CurveAppClass()',c);}
const legacySource=fs.readFileSync('src/legacy/CurvatureLegacyDrawing.js','latin1');
const a=legacySource.indexOf('function DrawShape( objIx, g, m ) {');
const b=legacySource.indexOf('\nfunction ',a+15);
const ctx={window:{},document:{getElementById:()=>null},
  JsgVect3:{Null:()=>[0,0,0],Copy:v=>v.slice()}};
vm.runInNewContext(legacySource.slice(a,b)+'\nthis.draw=DrawShape;',ctx);
function sourceLocal(type,drawn,hidden,variation,sidePos){
  const out=[];let fill=null,stroke='black',alpha=1;
  const g={Poly:[],SetBgColor:c=>fill=c,SetColor:c=>stroke=c,
    SetAreaAttr:c=>fill=c,SetAlpha:x=>alpha=x,
    NewPoly(){this.Poly=[];},AddPointToPoly(x,y){this.Poly.push([x,y]);},
    PolygonOnPlane(xs,ys,mode){let points,m;
      if(mode===undefined){points=xs.map(v=>v.slice());m=ys;}
      else {points=xs.map((x,i)=>[x,ys[i]]);m=mode;}
      const p={type:'polygon',points,mode:m},style={};
      // Capture the actual Legacy paint modes, not only the mode-3 fill:
      // mode 2 uses its active background colour without an outline.
      if(m&2)style.fill=fill;
      if(m&1)style.stroke=stroke;
      if(alpha!==1)style.alpha=alpha;
      if(Object.keys(style).length)p.style=style;
      out.push(p);
    },
    RectOnPlane(x1,y1,x2,y2,mode){this.PolygonOnPlane([x1,x2,x2,x1,x1],[y1,y1,y2,y2,y1],mode);},
    LineOnPlane(x1,y1,x2,y2){out.push({type:'line',points:[[x1,y1],[x2,y2]],style:{stroke}});},
    GetTransPointOnPlane(x,y,p){p[0]=x;p[1]=y;p[2]=0;}};
  ctx.draw(0,g,{ObjType:[type,3],NObjects:[128,0],NObjectsDrawn:[drawn,0],
    ObjSizeVar:[variation,0],ObjSidePos:[sidePos,0],LastPosValid:[false,false],
    isHiddenObj:[hidden,false]});
  return JSON.parse(JSON.stringify(out));
}
const states=extractAllDemoStates(fs.readFileSync('src/animation/CurvatureDemos.js','latin1'))
  .find(x=>x.demo==='Soundly').states;
function graph(){const c={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},
  closePath(){},stroke(){},fill(){},clearRect(){},setLineDash(){},measureText(){return {width:0};},fillText(){}};
  return {Canvas:{width:640,height:420,getContext(){return c;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};}
test('Soundly types 8 and 9 match untouched Legacy local geometry, both palettes and special spans',()=>{
  for(const type of [8,9])for(const hidden of [false,true])for(const sidePos of [55.5,-43])
    for(const drawn of [0,6,7,18,20,21,39,41,42,44,61,63,64,79,84,86,87,89,106,110,121,127]){
      const actual=geometry.localObject(type,0,hidden,{drawn,total:128,variation:.1,sidePos});
      const expected=sourceLocal(type,drawn,hidden,.1,sidePos);
      assert.deepEqual(actual,expected,`type ${type}, index ${drawn}, hidden ${hidden}, offset ${sidePos}`);
    }
  assert.throws(()=>geometry.localObject(8,0,false,{drawn:0}),/total/);
  assert.throws(()=>geometry.localObject(9,0,false,{drawn:128,total:128}),/valid drawn/);
  assert.throws(()=>geometry.localObject(10,0,false),/not been independently ported/);
});
test('Soundly state 13 is source-backed and existing scenario catalog remains partial',()=>{
  const m=model(),p=scene.applyPreset(m,'soundly');m.Update();
  assert.equal(states.length,18);const src=states[12];
  for(const f of ['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos',
    'ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar'])
    assert.deepEqual(Array.from(m[f]),src[f],f);
  for(const f of ['Height','FocalLengthField','Nick','Pan','Roll'])assert.equal(m[f],src[f],f);
  assert.equal(p.atmosphere,'vacuum');assert.equal(src.refractionCoeff,0);
  assert.equal(catalog.scenario('pontchartrain-soundly').nativePresetId,'soundly');
  assert.equal(m.viewcenterHorizon,3,'Modern Compare uses eye-level shared camera');
});
test('Soundly roads join successive placements in world space on both Globe and Flat, including reverse type 9',()=>{
  const m=model();scene.applyPreset(m,'soundly');m.Update();
  const pair=compare.pair(m);assert.ok(compare.invariant(pair));
  for(const globe of [true,false])for(const type of [8,9]){
    const obj=globe?pair.A:pair.B;obj.ObjType[0]=type;
    const opts={physicalSurface:true,opticsNeutral:true,curvature:globe?1/6371000:0};
    const entries=geometry.objectSequence(obj,0,globe,opts);
    assert.equal(entries.length,128);
    assert.equal(entries[0].scene.metadata.soundlyDrawn,type===8?0:127);
    assert.ok(entries.every(e=>e.params.verticalScale===1&&e.params.horizontalScale===1));
    const mesh=geometry.createObjectSequenceScene(obj,0,globe,opts);
    const road=mesh.primitives.filter(p=>p.metadata.kind==='soundly-road');
    assert.equal(road.length,254);
    assert.equal(road.filter(p=>p.metadata.side===-1).length,127);
    assert.equal(road.filter(p=>p.metadata.side===1).length,127);
    assert.ok(road.every(p=>p.points.length===4&&p.points.every(v=>v.length===3&&v.every(Number.isFinite))));
  }
});
test('Soundly persists through the existing experiment format and uses the common CPU renderer',()=>{
  const m=model();scene.applyPreset(m,'soundly');m.Update();
  const snap=codec.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,preset:'soundly',resetPreset:'soundly'},
    compareState.initial(m,'vacuum',6371000),{mode:'compare',selected:'A',eyeLevel:false,horizon:true});
  assert.deepEqual(codec.validate(snap),snap);
  assert.deepEqual(codec.decode(codec.encode(snap)),snap);
  assert.deepEqual(codec.readUrl(new URL(codec.urlWithExperiment('https://example.com/',snap)).search),snap);
  // Render a short Soundly section at interactive scale while retaining the
  // full 128-support Geometry/Compare test above.
  m.NObjects[0]=12;m.FocalLengthField=500;m.Update();
  for(const globe of [true,false]){
    m.showModel=globe?1:2;m.Update();
    const out=renderer.renderPhysical(graph(),m,{atmosphere:'vacuum',occlusionRadius:6371000,interactive:false});
    assert.equal(out.mode,'physical-scene');assert.ok(out.drawn>0);
    assert.ok(out.fillTriangles>0);
  }
});
