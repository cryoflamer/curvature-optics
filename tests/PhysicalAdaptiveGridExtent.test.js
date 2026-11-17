'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const world=require('../src/geometry/CurvaturePhysicalWorldGeometry');
const composition=require('../src/scene/CurvatureIndependentComposition');
const ground=require('../src/optics/CurvaturePhysicalGroundGuides');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const adapter=require('../src/ui/modern/ModernSceneState');
const compare=require('../src/ui/modern/ModernCompareModel');
const compareState=require('../src/ui/modern/ModernCompareState');
const experiments=require('../src/ui/modern/ModernExperimentState');
const decorations=require('../src/scene/CurvatureFullSceneDecorations');
const physicalCamera=require('../src/app/CurvaturePhysicalCamera');
const {model}=require('../tools/benchmark-adaptive-prism-112');
const R=6371000;
function canigou(){
  const m=model(2,'globe');
  adapter.applyPreset(m,'canigou-low');
  m.metricGridExtentKm=0;m.geometryRadius=R;
  // The benchmark model has the same authoritative physical metric fields as
  // CurveAppClass, but does not need its DOM or legacy camera for these tests.
  m.camViewAngle=7.8*Math.PI/180;
  m.deviceRatio=1000/630;
  m.Pan=0;m.Nick=-.5;m.Roll=0;
  return m;
}
function canvas(){
  const text=[],lines=[],ctx={save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
    stroke(){lines.push(true);},setLineDash(){},fillRect(){},measureText(t){return {width:t.length*8};},
    fillText(t,x,y){text.push({t,x,y});}};
  return {width:1000,height:630,text,lines,getContext(){return ctx;}};
}
test('Adaptive ground grid uses scene distance for Canigou and Chicago, while retaining a bounded default',()=>{
  const m=canigou();
  assert.equal(world.guideExtent(m),300000);
  assert.equal(world.guideExtent({...m,metricGridExtentKm:100}),100000);
  assert.equal(world.guideExtent({...m,metricGridExtentKm:500}),500000);
  assert.equal(world.guideExtent({...m,metricGridExtentKm:0,NObjects:[0,0]}),100000);
  assert.equal(world.guideExtent({...m,metricGridExtentKm:undefined}),100000);
  adapter.applyPreset(m,'chicago');
  assert.equal(m.metricGridExtentKm,0,'a fresh preset returns the grid to Auto');
  assert.equal(world.guideExtent(m),75000);
  adapter.applyPreset(m,'chicago-near');
  assert.equal(world.guideExtent(m),10000);
  assert.throws(()=>world.guideExtent({...m,metricGridExtentKm:1001}),/1000/);
  assert.throws(()=>world.metricGuides({curvature:0,observerHeight:2,showGrid:1,maxDistance:1000001}),/extent/);
  const manual=world.metricGuides({curvature:0,observerHeight:2,showGrid:1,maxDistance:25000});
  assert.ok(manual.metadata.gridRadiiMetres.includes(25000),
    'nonstandard manual ranges should include their exact limiting circle');
});
test('Canigou Flat 300 km metric rings and spokes use the same source extent and optical projection',()=>{
  const m=canigou();m.showModel=2;
  const source=composition.composeOpticalMain(m,false,{physicalWorld:true});
  assert.equal(source.scene.metadata.metricGuideExtentMetres,300000);
  assert.ok(source.scene.primitives.some(p=>p.metadata.kind==='metric-ring'&&p.metadata.radius===300000));
  const g=ground.create({model:m,geometry:'flat',atmosphere:'vacuum',metricGrid:true,maxDistance:300000});
  const guideSource=source.scene.primitives.slice(0,source.ranges[0].end);
  const projected=g.transform(guideSource);
  assert.equal(g.renderExtent,300000);
  assert.equal(g.horizonDistance,null,'Flat vacuum has no finite ground horizon');
  assert.ok(projected.some(p=>p.metadata.kind==='metric-ring'&&p.metadata.radius===300000));
  const before=g.solves();
  const cam=physicalCamera.create(m);
  const camera={pos:cam.pos,center:cam.center,up:cam.up,sceneSize:cam.sceneSize,
    screenSize:1,objectZExtend:0,zoom:1,near:.001};
  const visible=canvas();
  const overlay=decorations.metricGridOverlay(visible,m,camera,projected);
  assert.ok(overlay.spokes>0);
  assert.ok(overlay.labels>0);
  assert.ok(visible.text.some(p=>['200 km','250 km','300 km'].includes(p.t)),
    'a distant mountain should have a visible >100 km reference mark');
  assert.equal(g.solves(),before,'camera-aligned grid annotations cannot shoot rays');
});
test('Extended Flat Standard guides use a bounded number of real ground solves',()=>{
  const m=canigou();m.showModel=2;
  const input=composition.composeOpticalMain(m,false,{physicalWorld:true});
  const rendered=optics.create().transform(input,m,{atmosphere:'standard'});
  assert.equal(rendered.stats.guideRenderExtent,300000);
  assert.equal(rendered.stats.groundHorizon,null);
  assert.ok(rendered.stats.guideSegments>0);
  assert.ok(rendered.stats.guideSolves<120,
    'far guide detail must not trigger thousands of numerical ray shoots');
});
test('Globe extended grid stops at verified horizon; flat world has no artificial 100 km limit',()=>{
  const m=canigou();
  for(const geo of ['globe','flat']){
    const globe=geo==='globe';m.showModel=globe?1:2;
    const input=composition.composeOpticalMain(m,globe,{physicalWorld:true});
    const output=optics.create().transform(input,m,{atmosphere:'vacuum'});
    assert.equal(output.stats.guideRenderExtent,300000);
    const guides=output.composition.scene.primitives.filter(p=>p.metadata.kind==='metric-ring');
    if(globe){
      assert.ok(output.stats.groundHorizon>0&&output.stats.groundHorizon<100000);
      assert.ok(!guides.some(p=>p.metadata.radius>=100000));
    }else{
      assert.equal(output.stats.groundHorizon,null);
      assert.ok(guides.some(p=>p.metadata.radius===300000));
    }
  }
});
test('Manual extent is shared by Compare and survives export, URL and an older saved experiment',()=>{
  const m=canigou();m.metricGridExtentKm=300;
  m.deviceRatio=1.5;m.viewcenterHorizon=3;
  m.FocalLengthField=1000;m.CameraEast=0;m.CameraNorth=0;
  const both=compare.pair({...m,Update(){}});
  assert.ok(compare.invariant(both));
  assert.equal(both.A.metricGridExtentKm,300);
  assert.equal(both.B.metricGridExtentKm,300);
  const kind='standard',state={atmosphere:kind,occlusionRadius:R,preset:'canigou-low',resetPreset:'canigou-low'};
  // Missing optional Modern fields are intentionally allowed for the older
  // captured model/test helper; capture never writes an unvalidated value.
  const initial=compareState.initial(m,kind,R);
  const saved=experiments.capture(m,state,initial,{mode:'compare',selected:'A',eyeLevel:false,horizon:true});
  assert.equal(saved.scene.gridExtentKm,300);
  assert.deepEqual(experiments.decode(experiments.encode(saved)),saved);
  const old=structuredClone(saved);delete old.scene.gridExtentKm;
  assert.equal(experiments.validate(old).scene.gridExtentKm,0);
});

test('Modern Display exposes adaptive/manual grid choices without a parallel settings store',()=>{
  const fs=require('node:fs'),path=require('node:path'),root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/id="ModernGridExtent"/);
  assert.match(html,/Auto · by scene objects/);
  assert.match(html,/<option value="300">300 km<\/option>/);
  assert.match(app,/model\.metricGridExtentKm=scene\.gridExtentKm/);
  assert.match(app,/model\.metricGridExtentKm=v;markCustom\(\);redraw\(\)/);
});
