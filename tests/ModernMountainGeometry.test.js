 'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/legacy/CurvatureLegacyDrawing.js'),'utf8');
const start=source.indexOf('function DrawShape( objIx, g, m ) {');
const end=source.indexOf('\nfunction ',start+10);
assert.ok(start>=0&&end>start);
const context={document:{getElementById:()=>({checked:true})},window:{}};
vm.runInNewContext(source.slice(start,end)+'\nthis.drawShape=DrawShape;',context);
const engine=require('../src/geometry/CurvatureGeometryEngine');
const adapter=require('../src/ui/modern/ModernSceneState');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareModel');
const compareState=require('../src/ui/modern/ModernCompareState');
const vec={Norm:a=>a.map(v=>v/Math.hypot(...a)),
  Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],
  Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((x,i)=>x+b[i]),
  ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
function model(){
  const c=vm.createContext({JsgVect3:vec});
  vm.runInContext(fs.readFileSync(path.join(root,'src/app/CurvatureModel.js'),'utf8'),c);
  return vm.runInContext('new CurveAppClass()',c);
}
function legacyMountain(drawn,hidden,bank){
  const primitives=[];let fill;
  const g={Plane:{XDir:[1,0,0]},SetBgColor:c=>{fill=c;},
    PolygonOnPlane(xs,ys,mode=1){primitives.push({type:'polygon',points:xs.map((x,i)=>
      [x*this.Plane.XDir[0],ys[i]]),mode,style:{fill}});},
    RectOnPlane(x1,y1,x2,y2,mode=1){this.PolygonOnPlane([x1,x2,x2,x1,x1],
      [y1,y1,y2,y2,y1],mode);},
    LineOnPlane(x1,y1,x2,y2){primitives.push({type:'line',
      points:[[x1*this.Plane.XDir[0],y1],[x2*this.Plane.XDir[0],y2]]});}};
  context.drawShape(bank,g,{ObjType:[5,5],NObjectsDrawn:bank?[0,drawn]:[drawn,0],
    isHiddenObj:bank?[false,hidden]:[hidden,false]});
  return JSON.parse(JSON.stringify(primitives));
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('mountain local geometry matches actual Legacy DrawShape for both banks, colors and mirror cycles',()=>{
  for(const bank of [0,1])for(const hidden of [false,true])for(let drawn=0;drawn<18;drawn++){
    const actual=engine.localObject(5,bank,hidden,{drawn});
    assert.deepEqual(actual,legacyMountain(drawn,hidden,bank),
      `bank ${bank}, index ${drawn}, hidden ${hidden}`);
    assert.ok(actual.some(p=>p.type==='polygon'&&p.mode===3));
  }
  assert.throws(()=>engine.localObject(5,0,false),/drawn sequence index/);
  assert.throws(()=>engine.localObject(5,1,false,{drawn:-1}),/nonnegative/);
  assert.throws(()=>engine.localObject(5,2,false,{drawn:0}),/bank must be/);
  assert.throws(()=>engine.localObject(6,0,false,{drawn:0}),/not been independently ported/);
});

test('mountain sequence retains independent height variation, constant width and source variant identity',()=>{
  const m=model();adapter.applyPreset(m,'single');
  m.NObjects[0]=6;m.ObjType[0]=5;m.ObjDist[0]=10000;
  m.ObjDeltaDist[0]=300;m.ObjSize[0]=2800;
  m.ObjSizeVar[0]=.125;m.ObjSizeType[0]=3;
  m.ObjSideType[0]=2;m.ObjSideVar[0]=-100;
  m.Update();
  for(const globe of [true,false]){
    const entries=engine.objectSequence(m,0,globe,{physicalSurface:true,opticsNeutral:true,
      curvature:globe?1/m.rEarth:0});
    assert.equal(entries.length,6);
    entries.forEach((entry,drawn)=>{
      assert.equal(entry.params.horizontalScale,1,'Legacy mountain width is fixed');
      close(entry.params.verticalScale,
        (2-.125-.125*Math.cos(2*Math.PI*drawn/5))/2);
      assert.equal(entry.scene.metadata.drawn,drawn);
      assert.ok(entry.scene.primitives.some(p=>p.type==='polygon'&&p.mode===3));
      assert.ok(entry.scene.primitives.every(p=>p.points.every(v=>v.every(Number.isFinite))));
    });
    const scene=engine.createObjectSequenceScene(m,0,globe,{physicalSurface:true,opticsNeutral:true,
      curvature:globe?1/m.rEarth:0});
    assert.equal(scene.metadata.objectCount,6);
    assert.ok(scene.primitives.length>20);
  }
  const pair=compare.pair(m);
  assert.ok(compare.invariant(pair));
  for(const side of ['A','B'])assert.equal(pair[side].ObjType[0],5);
  const snapshot=codec.capture(m,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'custom',resetPreset:'chicago'},compareState.preset('globe-flat-vacuum'),
    {mode:'scene',selected:'A',eyeLevel:false,horizon:true});
  assert.equal(snapshot.scene.objects.ObjType[0],5);
  assert.deepEqual(codec.validate(snapshot),snapshot);
  assert.deepEqual(codec.decode(codec.encode(snapshot)),snapshot);
  assert.deepEqual(codec.readUrl(new URL(codec.urlWithExperiment('https://example.org/',snapshot)).search),snapshot);
  assert.equal(adapter.OBJECT.ObjType[1],5);
  assert.throws(()=>adapter.setObject(m,0,'ObjType',6),/Expected/);
});

test('type-5 mountains pass the production physical Canvas renderer and produce filled polygons on both surfaces',()=>{
  const renderer=require('../src/app/CurvatureMainCanvasRenderer');
  const context={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},
    closePath(){},stroke(){},fill(){},clearRect(){},setLineDash(){},
    measureText(){return {width:0};},fillText(){}};
  const graph={Canvas:{width:700,height:466,getContext(){return context;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
  const m=model();adapter.applyPreset(m,'single');
  m.Height=20;m.FocalLengthField=250;m.ObjType[0]=5;m.NObjects[0]=3;
  m.ObjDist[0]=10000;m.ObjDeltaDist[0]=300;m.ObjSize[0]=500;
  for(const surface of [1,2]){
    m.showModel=surface;m.Update();
    const output=renderer.renderPhysical(graph,m,{atmosphere:'standard',occlusionRadius:6371000,
      interactive:false});
    assert.equal(output.mode,'physical-scene');
    assert.ok(output.drawn>0);
    assert.ok(output.fillTriangles>0,'mountains must have real optical filled faces');
    assert.equal(output.unresolved,0);
  }
  m.ObjType[0]=6;
  assert.throws(()=>renderer.renderPhysical(graph,m,{atmosphere:'standard',occlusionRadius:6371000}),
    /Unsupported object group/);
});
