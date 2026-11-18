'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const direct=require('../src/renderers/CurvatureCanvasDirectPreview');
const cameraModel=require('../src/app/CurvaturePhysicalCamera');
const haze=require('../src/renderers/CurvatureAtmosphericVisibility');

function model(surface){
  const context=vm.createContext({JsgVect3:{
    Norm:a=>a.map(v=>v/Math.hypot(...a)),
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],
    Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((v,i)=>v+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0)}});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),context);
  const m=vm.runInContext('new CurveAppClass()',context);
  m.showModel=surface==='flat'?2:1;m.Height=12;m.Pan=0;m.Nick=0;m.Roll=0;
  m.viewcenterHorizon=3;m.showGrid=1;m.showTangent=0;m.showData=0;
  m.CameraEast=0;m.CameraNorth=0;
  m.ObjType=[3,3];m.NObjects=[1,0];m.ObjDist=[1500,0];m.ObjSidePos=[0,0];
  m.Update();return m;
}
function canvas(){
  const strokes=[],fills=[];
  const ctx={save(){},restore(){},setTransform(){},clearRect(){},fillRect(){},
    beginPath(){},moveTo(){},lineTo(){},closePath(){},
    fill(){fills.push({color:this.fillStyle,alpha:this.globalAlpha});},
    stroke(){strokes.push({color:this.strokeStyle,alpha:this.globalAlpha,width:this.lineWidth});}};
  return {width:1200,height:900,getContext(){return ctx;},strokes,fills};
}
function paint(m,options,session){
  const c=canvas(),camera={...cameraModel.create(m),screenSize:2,
    objectZExtend:0,zoom:1,near:.001};
  const result=(session||direct.create()).paint(c,camera,m,
    {atmosphere:'standard',canvasDirectOptions:{thinOutlines:true},...options});
  return {c,result};
}
function colorValue(hex){return Number.parseInt(hex.slice(1,3),16);}

test('Flat and Globe Canvas Direct metric grid uses the physical palette during drag',()=>{
  for(const surface of ['flat','globe']){
    const m=model(surface);
    m.GlobeGridCol='#1234ab';m.FEGridCol='black';
    const {c,result}=paint(m,{visibility:{enabled:true,rangeKm:1}});
    assert.ok(result.metricGrid.segments>0,`${surface} has visible metric guides`);
    assert.ok(c.strokes.some(s=>s.color==='#1234ab'&&s.alpha===.7),
      `${surface} uses the exact physical metric-grid color, not Legacy FE black`);
    assert.ok(c.strokes.every(s=>s.width<=1),'Thin outlines remain within one backing pixel');
    m.GlobeGridCol='';m.FEGridCol='#456789';
    assert.ok(paint(m).c.strokes.some(s=>s.color==='#456789'&&s.alpha===.7),
      'physical metric guide fallback follows the shared renderer');
  }
});

test('Canvas Direct fades object outlines and fills with shared 5%-contrast law; guides stay untouched',()=>{
  for(const surface of ['flat','globe']){
    const m=model(surface);m.showGrid=0;
    const baseline=paint(m,{visibility:{enabled:false,rangeKm:1}});
    const near=paint(m,{visibility:{enabled:true,rangeKm:500}});
    const far=paint(m,{visibility:{enabled:true,rangeKm:1}});
    const black=a=>a.c.strokes.filter(s=>s.color==='black').length;
    assert.ok(black(baseline)>0,`${surface} has authored black object outlines`);
    assert.ok(far.c.strokes.some(s=>/^#[0-9a-f]{6}$/i.test(s.color)&&s.color!=='#000000'),
      `${surface} outlines fade via atmospheric color blending`);
    const faded=a=>a.c.strokes.find(s=>/^#[0-9a-f]{6}$/i.test(s.color));
    assert.ok(colorValue(faded(far).color)>colorValue(faded(near).color),
      `${surface} a shorter visibility range fades a more distant object`);
    assert.ok(Math.abs(colorValue(faded(far).color)-
      colorValue(haze.blend('black',m.ObjDist[0],1)))<=5,
      'object range approximates the physical source distance');
    assert.notDeepEqual(far.c.fills,near.c.fills,
      'filled tower faces must also receive atmospheric airlight');
    assert.deepEqual(near.result.sourceObjects,far.result.sourceObjects);
    assert.equal(far.result.horizonMasks,baseline.result.horizonMasks,
      'haze changes no ground masking');
  }
});

test('Canvas Direct visibility is per viewport, per frame, and independent of cached object geometry',()=>{
  const m=model('flat'),session=direct.create();m.showGrid=0;
  const off=paint(m,{visibility:{enabled:false,rangeKm:2}},session);
  const short=paint(m,{visibility:{enabled:true,rangeKm:2}},session);
  const clear=paint(m,{visibility:{enabled:true,rangeKm:500}},session);
  assert.equal(off.result.geometryReused,false);
  assert.equal(short.result.geometryReused,true);
  assert.equal(clear.result.geometryReused,true);
  assert.ok(off.c.strokes.some(s=>s.color==='black'));
  assert.ok(short.c.strokes.some(s=>/^#[0-9a-f]{6}$/i.test(s.color)));
  assert.ok(colorValue(short.c.strokes.find(s=>/^#[0-9a-f]{6}$/i.test(s.color)).color)>
    colorValue(clear.c.strokes.find(s=>/^#[0-9a-f]{6}$/i.test(s.color)).color));
  const before=JSON.stringify(m);
  m.CameraNorth=600;m.Update();
  const moved=paint(m,{visibility:{enabled:true,rangeKm:2}},session);
  assert.equal(moved.result.geometryReused,true);
  assert.notDeepEqual(moved.c.strokes,short.c.strokes,
    'object range and camera projection reflect the observer translation');
  assert.notEqual(JSON.stringify(m),before,'camera pose changes without rebuilding the object mesh');
  assert.throws(()=>paint(m,{visibility:{enabled:true,rangeKm:0}}),RangeError);
});

test('Canvas Direct haze never changes metric guide colors, even on a transparent Flat display',()=>{
  const m=model('flat');m.GlobeGridCol='blue';
  const baseline=paint(m,{visibility:{enabled:false,rangeKm:1}});
  const faded=paint(m,{visibility:{enabled:true,rangeKm:1}});
  const grid=a=>a.c.strokes.filter(s=>s.color==='blue'&&s.alpha===.7);
  assert.ok(grid(baseline).length>0&&grid(faded).length>0);
  assert.deepEqual(grid(baseline),grid(faded));
  assert.ok(faded.c.strokes.some(s=>s.color==='blue'),
    'Flat metric grid does not inherit object haze');
});
