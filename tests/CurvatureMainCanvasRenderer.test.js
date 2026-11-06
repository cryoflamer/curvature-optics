'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const adapter=require('../src/app/CurvatureMainCanvasRenderer');
const base=path.resolve(__dirname,'..');
const source=name=>fs.readFileSync(path.join(base,name),'utf8');
const model={geometryRadius:6371000,Height:7,ObjType:[3,3],NObjects:[3,0],
  ObjDist:[100,0],ObjDeltaDist:[400,0],ObjSidePos:[0,0],ObjSideVar:[0,0],
  ObjSideType:[0,0],ObjSize:[12,0],ObjSizeVar:[0,0],ObjSizeType:[0,0],
  rDisk:400,zDisk:3,hDip:1,rFEarth:1000,showGrid:3,
  hDisk:100,aDip:0.05,aDelta:0.02,sceneWidth:500,PanRad:0,
  showTangent:true,showData:false,FEEqCol:'blue',FEGridCol:'gray',
  GlobeGridCol:'green',GlobeFGridCol:'yellow',TangentCol:'red',
  camSceneSize:1000,camPos:[0,-100,25],camUp:[0,0,1],camViewCenter:[0,0,0]};
function mockGraph(){
  const operations=[];
  const ctx={globalAlpha:1,save(){operations.push('save');},restore(){operations.push('restore');},
    setTransform(...args){operations.push(['transform',...args]);},beginPath(){},moveTo(){},lineTo(){},
    closePath(){},stroke(){},fill(){},clearRect(){},setLineDash(){},
    createImageData(){return {data:new Uint8ClampedArray(128*96*4)}},putImageData(){},
    measureText(){return {width:0}}};
  const canvas={width:128,height:96,getContext(){return ctx}};
  const g={Canvas:canvas,Camera:{},ContextScale:2,WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:32,OffsetY:24},
    AutoScalePix:true,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:2,
    GetPixScaling(){return 1},SetViewport(){operations.push('viewport')},
    SetGraphClipping(){},SetCameraClipping(value){this.CameraClipPlaneDist=value},
    SetWindowToCameraScreen(){},SetCamera(par){this.Camera={CamPos:par.CamPos, CamUp:par.CamUp,
      CamViewCenter:par.CamViewCenter,SceneSize:par.SceneSize,ScreenSize:1,
      ObjectZExtend:0,Zoom:1}},SetCameraZoom(value){this.Camera.Zoom=value}};
  return {g,operations};
}
test('mode availability and selected group do not conflate Globe, Flat, Both',()=>{
  assert.equal(adapter.support({...model,showModel:1}).supported,true);
  assert.equal(adapter.support({...model,showModel:2}).supported,true);
  assert.equal(adapter.support({...model,showModel:3}).supported,false);
  assert.equal(adapter.selectObject(model),0);
  assert.equal(adapter.selectObject({...model,NObjects:[0,4]}),1);
});
test('main Canvas renderer consumes the actual model camera and restores HiDPI transform',()=>{
  for(const showModel of [1,2]){
    const {g,operations}=mockGraph();
    const m={...model,showModel};
    const result=adapter.render(g,m);
    assert.equal(result.mode,'painter');
    assert.ok(result.primitiveCount>0);
    assert.deepEqual(g.Camera.CamPos,m.camPos);
    assert.equal(g.Camera.SceneSize,m.camSceneSize);
    assert.ok(operations.includes('viewport'));
    assert.deepEqual(operations.filter(x=>Array.isArray(x)&&x[0]==='transform')[0],
      ['transform',1,0,0,1,0,0]);
    assert.equal(operations.filter(x=>x==='save').length,operations.filter(x=>x==='restore').length);
  }
});
test('runtime routes normal frames, Both fallback, errors, and audit captures independently',()=>{
  const controls=new Map(),calls=[];
  function element(id){if(!controls.has(id))controls.set(id,{value:id==='MainCanvasRenderer'?'legacy':'original',
    textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return controls.get(id);}
  let options;
  const context=vm.createContext({window:{CurvatureMainCanvasRenderer:{
    support(m){return {supported:m.showModel!==3,reason:'Both uses Legacy'}},
    render(g,m){calls.push('independent:'+m.Height);if(m.Height===13)throw new Error('probe failure');
      return {warning:'preview is incomplete'};}}},
    document:{getElementById:element},CurveAppClass:function CurveAppClass(){},xDefBool(v,f){return v===undefined?f:v;},
    xOnLoad(){},NewGraphX3D(o){options=o;return {Redraw(){calls.push('redraw');}}},
    DrawModelWithOptionalAudit(){calls.push('legacy')},
    Demos:{Reset(){},PlayStop(){}},ControlPanels:{Update(){}},
    ShowMoreInfos(){},console:{error(){calls.push('error')}},
    legacyFrameAuditRequested:false,legacyFrameAuditInProgress:false});
  vm.runInContext(source('src/app/LegacyAppContext.js'),context);
  vm.runInContext(source('src/app/LegacyUpdateCoordinator.js'),context);
  vm.runInContext(source('src/app/LegacyCanvasPresenter.js'),context);
  vm.runInContext(source('src/app/CurvatureAppRuntime.js'),context);
  const g={Reset(){calls.push('reset')}};
  options.DrawFunc(g);assert.deepEqual(calls,['legacy']);calls.length=0;
  element('MainCanvasRenderer').value='independent';
  context.CurveApp.showModel=1;context.CurveApp.Height=7;
  options.DrawFunc(g);assert.deepEqual(calls,['independent:7']);calls.length=0;
  assert.equal(element('MainCanvasRendererStatus').textContent,'preview is incomplete');
  context.CurveApp.showModel=3;options.DrawFunc(g);
  assert.deepEqual(calls,['legacy']);calls.length=0;
  assert.match(element('MainCanvasRendererStatus').textContent,/Both/);
  context.CurveApp.showModel=2;context.CurveApp.Height=13;options.DrawFunc(g);
  assert.deepEqual(calls,['independent:13','error','reset','legacy']);calls.length=0;
  context.CurveApp.Height=9;context.legacyFrameAuditRequested=true;options.DrawFunc(g);
  assert.deepEqual(calls,['legacy']);calls.length=0;
  context.legacyFrameAuditRequested=false;
  element('MainCanvasRenderer').listeners.change();assert.deepEqual(calls,['redraw']);
});
test('main Canvas includes both Pontchartrain tower groups with independent horizon layers',()=>{
  const bridge=require('../src/scene/CurvatureIndependentComposition');
  const m={...model,ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],
    ObjDeltaDist:[297.55,373],ObjSidePos:[32,22.4],ObjSize:[23,64]};
  for(const globe of [true,false]){
    const c=bridge.composeMain(m,globe);
    const audit=bridge.auditFull(c);
    assert.equal(audit.rendererReady,true);
    assert.deepEqual(c.scene.metadata.objectIndices,[1,0]);
    for(const index of [0,1]){
      assert.ok(c.ranges.filter(x=>x.name==='behind-'+index||x.name==='before-'+index)
        .reduce((sum,x)=>sum+x.count,0)>0,'object group '+index+' present');
    }
    const names=c.ranges.map(x=>x.name);
    assert.ok(names.indexOf('behind-1')<names.indexOf('behind-0'));
    assert.ok(names.indexOf('before-1')<names.indexOf('before-0'));
    assert.ok(names.indexOf('mask-0')<names.indexOf('before-0'));
    assert.ok(c.scene.primitives.every((x,i)=>x.commandIndex===i));
  }
});
test('unsupported populated object groups are not silently omitted',()=>{
  assert.equal(adapter.support({...model,showModel:1,NObjects:[85,2],ObjType:[3,99]}).supported,false);
  assert.equal(adapter.support({...model,showModel:1,NObjects:[85,0],ObjType:[3,99]}).supported,true);
});

test('main-frame horizon mask preserves Legacy before/behind palettes',()=>{
  const bridge=require('../src/scene/CurvatureIndependentComposition');
  const m={...model,ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],
    ObjDeltaDist:[297.55,373],ObjSidePos:[32,22.4],ObjSize:[23,64]};
  const frame=bridge.composeMain(m,true);
  const masks=frame.scene.primitives.filter(p=>p.type==='polygon'&&p.mode===2&&p.style&&p.style.fill==='white');
  assert.ok(masks.length>0,'globe has an occluding horizon mask');
  assert.ok(masks.every(p=>p.points.length===512),'main Canvas uses a finer circular silhouette');
  for(const range of frame.ranges.filter(r=>r.role==='objects')){
    const behind=range.name.startsWith('behind-'),primitives=frame.scene.primitives.slice(range.start,range.end);
    for(const p of primitives)
      assert.equal(p.style.stroke,behind?'#666':'black',
        'object strokes follow the original Legacy horizon partition');
    const foundations=primitives.filter(p=>p.mode===3&&p.style.fill);
    if(primitives.length)assert.ok(foundations.length>0,'populated tower layers contain foundations');
    assert.ok(foundations.every(p=>p.style.fill===(behind?'#dcc493':'#a38d60')),
      'the Legacy foundation palette follows the same horizon partition');
  }
  const flat=bridge.composeMain(m,false);
  assert.equal(flat.scene.primitives.some(p=>p.type==='polygon'&&p.mode===2&&p.style&&p.style.fill==='white'),false);
  const guide=frame.ranges.find(r=>r.name==='surface-guides');
  assert.ok(frame.scene.primitives.slice(guide.start,guide.end).some(p=>p.style&&p.style.stroke!=='black'));
});

test('independent partial/full and optical compositions keep distinct style semantics',()=>{
  const bridge=require('../src/scene/CurvatureIndependentComposition');
  const m={...model,ObjType:[3,3],NObjects:[5,0],ObjDist:[100,0],
    ObjDeltaDist:[400,0],ObjSidePos:[0,0],ObjSize:[23,64],showModel:1,rEarth:6371000};
  for(const result of [bridge.compose(m,0,true,{objectsOnly:true,segments:32}),
    bridge.composeFull(m,0,true,{segments:32}),bridge.composeMain(m,true)]){
    const layers=result.ranges.filter(r=>r.role==='objects');
    assert.equal(layers.length,2);
    for(const range of layers){
      const behind=range.name.startsWith('behind'),objects=result.scene.primitives.slice(range.start,range.end);
      assert.ok(objects.length>0);
      assert.ok(objects.every(p=>p.style.stroke===(behind?'#666':'black')));
      assert.ok(objects.filter(p=>p.mode===3).every(p=>p.style.fill===(behind?'#dcc493':'#a38d60')));
    }
    assert.ok(result.ranges.some(r=>r.role==='occlusion'&&r.count>0),
      'the independently composed Globe still paints the white horizon mask');
  }
  for(const options of [{},{physicalWorld:true}]){
    const optical=bridge.composeOpticalMain(m,true,options);
    const objects=optical.ranges.filter(r=>r.role==='objects')
      .flatMap(r=>optical.scene.primitives.slice(r.start,r.end));
    assert.ok(objects.length>0);
    assert.ok(objects.every(p=>p.style.stroke==='black'));
    assert.ok(objects.filter(p=>p.mode===3).every(p=>p.style.fill==='#a38d60'),
      'optical scenes do not inherit a geometric hidden-foundation color');
    assert.ok(objects.every(p=>!p.metadata.hidden),
      'optical visibility is left to the ray-tracing backend');
    assert.equal(optical.ranges.filter(r=>r.role==='occlusion').length,0);
  }
});

test('geometric horizon movement recolors towers without losing or moving them',()=>{
  const bridge=require('../src/scene/CurvatureIndependentComposition');
  const m={...model,showModel:1,rDisk:400,ObjType:[3,3],NObjects:[5,0],
    ObjDist:[100,0],ObjDeltaDist:[400,0],ObjSidePos:[0,0],ObjSize:[23,64]};
  const frames=[bridge.composeMain(m,true),bridge.composeMain({...m,rDisk:1400},true)];
  function foundationColors(frame){
    return frame.ranges.filter(r=>r.role==='objects')
      .flatMap(r=>frame.scene.primitives.slice(r.start,r.end))
      .filter(p=>p.mode===3&&p.style.fill)
      .reduce((totals,p)=>{totals[p.style.fill]=(totals[p.style.fill]||0)+1;return totals;},{});
  }
  assert.deepEqual(foundationColors(frames[0]),{'#dcc493':4,'#a38d60':1});
  assert.deepEqual(foundationColors(frames[1]),{'#dcc493':1,'#a38d60':4});
  assert.equal(frames[0].scene.primitives.length,frames[1].scene.primitives.length,
    'moving the horizon changes paint styles, not object geometry');
  const flat=bridge.composeMain(m,false);
  assert.deepEqual(foundationColors(flat),{'#a38d60':5},
    'Flat Earth has no geometric behind-horizon layer');
});
