'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const direct=require('../src/renderers/CurvatureCanvasDirectPreview');
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const preview=require('../src/animation/ModernAnimationPreview');
const experiment=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const state=require('../src/ui/modern/ModernSceneState');
const R=6371000;
function model(){
  const ctx=vm.createContext({JsgVect3:{
    Norm:a=>a.map(v=>v/Math.hypot(...a)),
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((v,i)=>v+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0)}});
  vm.runInContext(fs.readFileSync('src/app/CurvatureModel.js','utf8'),ctx);
  return vm.runInContext('new CurveAppClass()',ctx);
}
function graph(trackPaths=false){
  let filled=0,stroked=0,paths=0,activePath=[];
  const called={beginPath:0,moveTo:0,lineTo:0,closePath:0,fill:0,stroke:0,
    clip:0,clearRect:0,fillRect:0,drawImage:0};
  const fillColors=[],paintedPaths=[],strokedPaths=[],events=[];
  const ctx={save(){},restore(){},setTransform(){},
    fillRect(){called.fillRect++;},clearRect(){called.clearRect++;},
    beginPath(){called.beginPath++;paths++;if(trackPaths)activePath=[];},
    moveTo(x,y){called.moveTo++;if(trackPaths)activePath.push([x,y]);},
    lineTo(x,y){called.lineTo++;if(trackPaths)activePath.push([x,y]);},
    closePath(){called.closePath++;},
    fill(){called.fill++;filled++;fillColors.push(this.fillStyle);
      events.push({type:'fill',color:this.fillStyle});
      if(trackPaths)paintedPaths.push({color:this.fillStyle,points:activePath.slice()});},
    stroke(){called.stroke++;stroked++;if(trackPaths)strokedPaths.push(activePath.slice());
      events.push({type:'stroke',color:this.strokeStyle,
      width:this.lineWidth,alpha:this.globalAlpha,join:this.lineJoin});},
    clip(){called.clip++;},drawImage(){called.drawImage++;}};
  const g={Canvas:{width:800,height:500,getContext(){return ctx;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:500,ScaleY:-500,OffsetX:400,OffsetY:250},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
  return {g,stats:()=>({filled,stroked,paths,fillColors,paintedPaths,strokedPaths,called,events})};
}
function soundly(){const m=model();state.applyPreset(m,'soundly');m.Height=8.55;
  m.FocalLengthField=2038;m.Pan=.49;m.Nick=-.006;
  m.CameraEast=-36;m.CameraNorth=399;m.Update();return m;}
function draw(m,opts={}){return renderer.renderPhysical(graph().g,m,
  {atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true,...opts});}
test('geometric preview uses the same k profile as Effective Radius, but never mutates model',()=>{
  const m=soundly(),before=JSON.stringify(m),params=require('../src/optics/OpticalEffectiveRadiusPreview').parameters(m,{atmosphere:'standard'});
  const g=direct.geometricModel(m,params);
  assert.equal(g.geometryRadius,params.effectiveRadius);
  assert.ok(g.rDisk>0&&g.zDisk>0&&g.aDip>0);
  assert.equal(g.Height,m.Height);
  assert.equal(JSON.stringify(m),before);
  assert.ok(direct.geometricModel(m,{geometry:'globe',effectiveRadius:R}).rDisk>0);
});
test('Soundly lamp shafts keep their authored fill in both directions and hidden styles',()=>{
  for(const type of [8,9]){
    for(const hidden of [false,true]){
      const source=geometry.localObject(type,0,hidden,{drawn:type===8?39:88,total:128,variation:0,sidePos:0});
      const shafts=source.filter(p=>p.type==='polygon'&&p.mode===2);
      assert.equal(shafts.length,3,'legacy Soundly has three fill-only lamp pieces');
      assert.ok(shafts.every(p=>p.style&&p.style.fill===(hidden?'#bbbbbb':'#aaaaaa')),
        'mode 2 must preserve the actual background fill, not fall back to white');
      assert.ok(shafts.every(p=>p.style.stroke===undefined),
        'mode 2 lamps have no invented outline');
      const lattice=source.filter(p=>p.type==='polygon'&&p.mode===1);
      assert.ok(lattice.length>0&&lattice.every(p=>p.style.stroke==='black'),
        'mode 1 uses the authored stroke colour');
    }
  }
});
test('Canvas Direct paints Soundly fill-only lamp shafts with their authored colour',()=>{
  const g=graph(),m=soundly();
  const result=renderer.renderPhysical(g.g,m,
    {atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(result.opticalQuality,'canvas-direct');
  assert.ok(g.stats().fillColors.includes('#aaaaaa'),
    'lamp shafts must be visible against the white background');
});
test('real Soundly source renders all 128 object packages with native polygon fills and one mask',()=>{
  const m=soundly(),g=graph(),before=JSON.stringify(Array.from(m.ObjDist));
  const r=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(r.opticalQuality,'canvas-direct');
  assert.equal(r.geometryBackend,'Canvas Direct 2D');
  assert.equal(r.previewLod.original,128);assert.equal(r.previewLod.selected,128);
  assert.equal(r.directStats.horizonMasks,1);
  assert.ok(r.directStats.fillCalls>500&&r.directStats.strokeCalls>500);
  assert.equal(r.fillTriangles,0,'Canvas Direct must not pre-triangulate bridge fills');
  assert.equal(g.stats().filled,r.directStats.fillCalls);
  assert.equal(g.stats().stroked,r.directStats.strokeCalls);
  assert.ok(r.timings.totalMs>=0&&r.timings.geometryMs>=0);
  assert.equal(JSON.stringify(Array.from(m.ObjDist)),before);
});
test('moving observer and changing height reuse immutable authored geometry',()=>{
  const m=soundly(),g=graph();
  const first=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(first.cacheReused,false);
  m.Height=3.5;m.CameraEast=51.2;m.CameraNorth=496;m.Update();
  const next=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(next.cacheReused,true);
  assert.equal(next.directStats.horizonMasks,1);
  assert.equal(next.previewLod.selected,128);
});
test('distinct Animation canvases have independent cached object meshes',()=>{
  const m=soundly(),a=graph(),b=graph();
  const options={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  assert.equal(renderer.renderPhysical(a.g,m,options).cacheReused,false);
  assert.equal(renderer.renderPhysical(b.g,m,options).cacheReused,false);
  assert.equal(renderer.renderPhysical(a.g,m,options).cacheReused,true);
  assert.equal(renderer.renderPhysical(b.g,m,options).cacheReused,true);
  assert.equal(renderer.renderPhysical(a.g,m,{...options,forceColdOptics:true}).cacheReused,false);
  assert.equal(renderer.renderPhysical(b.g,m,options).cacheReused,true);
});
test('a changed source bridge geometry invalidates the cache while camera-only changes do not',()=>{
  const m=soundly(),g=graph();
  draw(m);m.ObjDist[0]+=1;m.Update();
  const changed=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(changed.cacheReused,false);
  const repeated=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true});
  assert.equal(repeated.cacheReused,true);
});
test('distant support stays in far painter group and is covered by horizon mask',()=>{
  const m=soundly();m.NObjects[0]=1;m.ObjDist[0]=60000;m.Height=3;
  m.CameraEast=0;m.CameraNorth=0;m.Update();
  const r=draw(m);
  assert.equal(r.previewLod.original,1);
  assert.equal(r.directStats.horizonMasks,1);
});
test('all-near supports do not trigger a false white horizon mask',()=>{
  const m=soundly();m.NObjects[0]=1;m.ObjDist[0]=1000;m.Height=200;
  m.CameraEast=0;m.CameraNorth=0;m.Update();
  const r=draw(m);
  assert.equal(r.directStats.horizonMasks,0);
  assert.equal(r.previewLod.original,1);
  // The camera looks almost horizontally from 200 m at an object only 1 km
  // away: its geometry is outside the viewport and must not be painted.
  assert.equal(r.directStats.strokeCalls,0);
});
test('non-vacuum Globe and Flat Vacuum work; refracted Flat and unsupported profiles reject',()=>{
  const m=soundly();
  const r=draw(m,{atmosphere:'standard'});
  assert.ok(r.refractionK>0&&r.effectiveRadiusMeters>m.rEarth);
  assert.equal(r.opticalQuality,'canvas-direct');
  assert.throws(()=>draw(m,{atmosphere:'inverse-temperature'}),/supports/);
  m.showModel=2;m.Update();
  assert.equal(draw(m).opticalQuality,'canvas-direct');
  assert.throws(()=>draw(m,{atmosphere:'standard'}),/Flat/);
});
test('Animation Preview routes explicit Canvas Direct without affecting Fast / Accurate / Auto',()=>{
  const m=soundly();const snap=experiment.capture(m,{atmosphere:'vacuum',occlusionRadius:R,preset:'soundly',resetPreset:'soundly'},
    compare.preset('globe-flat-vacuum'),{mode:'scene',eyeLevel:false,horizon:false,selected:'A'});
  const previous=structuredClone(snap);let received;
  class FakeModel{Update(){}}
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical(_g,_m,o){received=o;return {previewLod:{original:128,selected:128}};}}});
  const r=view.render(snap,'A',{Canvas:{}},{quality:'canvas-direct',sceneDetail:'performance'});
  assert.equal(r.quality,'canvas-direct');assert.equal(received.opticalQuality,'canvas-direct');
  assert.equal(received.previewLod.stride,1,'never thin bridge parts');
  assert.equal(view.build(snap,'A',{quality:'accurate'}).quality,'accurate');
  assert.equal(view.build(snap,'A',{quality:'fast'}).quality,'fast');
  assert.equal(view.build(snap,'A',{quality:'auto',animationMode:'physical'}).quality,'accurate');
  assert.deepEqual(snap,previous);
});
test('browser script order and Modern-only isolation of Canvas Direct',()=>{
  const html=fs.readFileSync('CurvatureModern.html','utf8');
  const code=fs.readFileSync('src/renderers/CurvatureCanvasDirectPreview.js','utf8');
  assert.ok(html.indexOf('src/renderers/CurvatureCanvasDirectPreview.js')<
    html.indexOf('src/app/CurvatureMainCanvasRenderer.js'));
  assert.ok(html.indexOf('src/optics/OpticalEffectiveRadiusPreview.js')<
    html.indexOf('src/renderers/CurvatureCanvasDirectPreview.js'));
  assert.match(html,/value="canvas-direct"/);
  assert.doesNotMatch(code,/\bGraphX3DX\s*\(|\bDrawModel\s*\(/);
  const browser=vm.createContext({CurvatureGeometryEngine:require('../src/geometry/CurvatureGeometryEngine'),
    CurvatureOpticalEffectiveRadiusPreview:require('../src/optics/OpticalEffectiveRadiusPreview'),
    CurvatureCameraTranslation:require('../src/geometry/CurvatureCameraTranslation'),
    CurvatureCanvasProjection:require('../src/renderers/CurvatureCanvasProjection')});
  vm.runInContext(code,browser);
  assert.equal(typeof browser.CurvatureCanvasDirectPreview.create,'function');
});

test('Canvas Direct diagnostics independently toggle fills, outlines and horizon mask',()=>{
  const m=soundly();
  const all=graph(),fillOff=graph(),strokeOff=graph(),maskOff=graph();
  const opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const base=renderer.renderPhysical(all.g,m,opts);
  const noFills=renderer.renderPhysical(fillOff.g,m,{...opts,canvasDirectDiagnostics:{fills:false}});
  const noStrokes=renderer.renderPhysical(strokeOff.g,m,{...opts,canvasDirectDiagnostics:{strokes:false}});
  const noMask=renderer.renderPhysical(maskOff.g,m,{...opts,canvasDirectDiagnostics:{horizonMask:false}});
  assert.ok(base.directStats.fillCalls>0&&base.directStats.strokeCalls>0);
  assert.equal(base.directStats.horizonMasks,1);
  assert.equal(noFills.directStats.fillCalls,1,'mask remains visible with object fills disabled');
  assert.ok(noFills.directStats.strokeCalls>0);
  assert.equal(noStrokes.directStats.strokeCalls,0);
  assert.ok(noStrokes.directStats.fillCalls>0);
  assert.equal(noMask.directStats.horizonMasks,0);
  assert.equal(noMask.directStats.fillCalls,base.directStats.fillCalls-1);
  assert.equal(noMask.previewLod.original,128);
});

test('Soundly moving-camera horizon mask is clipped to the Canvas viewport',()=>{
  const m=soundly();m.Height=9.41;m.CameraEast=-22.2;m.CameraNorth=247;
  m.Pan=.47;m.Nick=-.015;m.FocalLengthField=2098;m.Update();
  const g=graph(true),opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',
    deferDecorations:true,canvasDirectDiagnostics:{strokes:false}};
  const r=renderer.renderPhysical(g.g,m,opts);
  assert.equal(r.directStats.horizonMasks,1);
  const paths=g.stats().paintedPaths;
  const masks=paths.filter(p=>p.color==='white');
  assert.equal(masks.length,1,'horizon disk is the only opaque white path');
  const w=g.g.Canvas.width,h=g.g.Canvas.height,margin=2.001;
  for(const path of paths){
    for(const [x,y] of path.points){
      assert.ok(Number.isFinite(x)&&Number.isFinite(y),'finite Canvas coordinates');
      assert.ok(x>=-margin&&x<=w+margin&&y>=-margin&&y<=h+margin,
        'no path may submit off-viewport or enormous coordinates to Canvas');
    }
  }
  const disk=masks[0].points;
  assert.ok(disk.length>=4,'clipped disk retains an opaque horizon region');
  assert.ok(Math.max(...disk.map(p=>p[0]))-Math.min(...disk.map(p=>p[0]))>w-6,
    'the disk still masks the full width below the horizon');
  const unmasked=graph(true);
  const off=renderer.renderPhysical(unmasked.g,m,{...opts,
    canvasDirectDiagnostics:{strokes:false,horizonMask:false}});
  assert.equal(off.directStats.horizonMasks,0);
  assert.equal(unmasked.stats().paintedPaths.filter(p=>p.color==='white').length,0);
});

test('Canvas Direct counters match the exact issued path and paint calls, including layer variants',()=>{
  const m=soundly(),options={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  for(const flags of [{fills:true,strokes:true,horizonMask:true},
    {fills:false,strokes:true,horizonMask:true},
    {fills:true,strokes:false,horizonMask:true},
    {fills:true,strokes:true,horizonMask:false}]){
    const g=graph();
    const result=renderer.renderPhysical(g.g,m,{...options,canvasDirectDiagnostics:flags});
    assert.deepEqual(result.directStats.canvasCalls,g.stats().called);
    assert.equal(result.directStats.canvasCalls.fill,result.directStats.fillCalls);
    assert.equal(result.directStats.canvasCalls.stroke,result.directStats.strokeCalls);
    assert.equal(result.directStats.canvasCalls.beginPath,
      result.directStats.fillCalls+result.directStats.strokeCalls);
    assert.equal(result.directStats.canvasCalls.clearRect,1);
    assert.equal(result.directStats.canvasCalls.fillRect,1);
    assert.equal(result.directStats.canvasCalls.clip,0,
      'direct painter performs clipping in JavaScript, not Canvas clip()');
  }
});


test('path-only builds the same clipped outlines and fills but omits every stroke() call',()=>{
  const m=soundly(),baseGraph=graph(),pathGraph=graph();
  const opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const base=renderer.renderPhysical(baseGraph.g,m,opts);
  const path=renderer.renderPhysical(pathGraph.g,m,{...opts,
    canvasDirectDiagnostics:{strokeMode:'path-only'}});
  const b=base.directStats,p=path.directStats;
  assert.ok(b.strokeCalls>500);
  assert.equal(p.strokeCalls,0);
  assert.equal(p.strokePrimitives,b.strokePrimitives);
  assert.equal(p.strokePrimitives,b.strokeCalls,'one outline per stroke in the baseline');
  assert.equal(path.drawn,base.drawn);
  assert.equal(path.primitiveCount,base.primitiveCount);
  assert.equal(p.fillCalls,b.fillCalls);
  for(const key of ['beginPath','moveTo','lineTo','closePath','fill','clearRect','fillRect'])
    assert.equal(p.canvasCalls[key],b.canvasCalls[key],key+' still executes');
  assert.deepEqual(p.canvasCalls,pathGraph.stats().called);
  assert.equal(p.canvasCalls.stroke,0);
});

test('simple stroke preserves projected paths, using the same calls as baseline',()=>{
  const m=soundly(),simple=graph(),base=graph();
  const opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const a=renderer.renderPhysical(base.g,m,opts);
  const b=renderer.renderPhysical(simple.g,m,{...opts,
    canvasDirectDiagnostics:{strokeMode:'simple'}});
  assert.deepEqual(b.directStats.canvasCalls,a.directStats.canvasCalls);
  assert.equal(b.directStats.strokePrimitives,a.directStats.strokePrimitives);
  assert.equal(b.primitiveCount,a.primitiveCount);
  assert.equal(b.drawn,a.drawn);
  assert.equal(simple.g.Canvas.getContext('2d').lineJoin,'miter');
  assert.equal(simple.g.Canvas.getContext('2d').lineWidth,1);
  assert.equal(simple.g.Canvas.getContext('2d').strokeStyle,'#000');
  assert.ok(simple.stats().events.filter(e=>e.type==='stroke').every(e=>
    e.color==='#000'&&e.width===1&&e.alpha===1&&e.join==='miter'));
  // A subsequent default frame must reset the diagnostic styling.
  renderer.renderPhysical(simple.g,m,opts);
  assert.equal(simple.g.Canvas.getContext('2d').lineJoin,'round');
});

test('batching reduces stroke calls while retaining fills and projected segments',()=>{
  const m=soundly(),base=graph(),batched=graph();
  const opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const a=renderer.renderPhysical(base.g,m,opts);
  const b=renderer.renderPhysical(batched.g,m,{...opts,
    canvasDirectDiagnostics:{strokeMode:'batched'}});
  const before=a.directStats,after=b.directStats;
  assert.ok(after.strokeCalls<before.strokeCalls,
    'contiguous same-style paths must combine in the Soundly scene');
  assert.ok(after.strokeCalls>0,'pending final batch must be flushed');
  assert.equal(after.strokePrimitives,before.strokePrimitives);
  assert.equal(b.drawn,a.drawn);
  assert.equal(b.primitiveCount,a.primitiveCount);
  assert.equal(after.horizonMasks,before.horizonMasks);
  assert.equal(after.fillCalls,before.fillCalls,'mask and object fills remain in place');
  assert.equal(after.canvasCalls.lineTo,before.canvasCalls.lineTo,
    'every stroke segment still reaches Canvas');
  assert.ok(after.canvasCalls.beginPath<before.canvasCalls.beginPath);
  assert.deepEqual(after.canvasCalls,batched.stats().called);
  assert.equal(after.canvasCalls.stroke,after.strokeCalls);
  const events=batched.stats().events;
  const maskIndex=events.findIndex(e=>e.type==='fill'&&e.color==='white');
  assert.ok(maskIndex>0,'horizon mask must still be painted');
  assert.ok(events.slice(0,maskIndex).some(e=>e.type==='stroke'),
    'far-object strokes are flushed before the white mask');
  assert.ok(events.slice(maskIndex+1).some(e=>e.type==='stroke'),
    'near-object strokes still paint over the mask');
  assert.deepEqual(events.filter(e=>e.type==='fill').map(e=>e.color),
    base.stats().events.filter(e=>e.type==='fill').map(e=>e.color),
    'object and mask fills retain their painter order');
});

test('stroke style isolation changes exactly one Canvas property per mode',()=>{
  const m=soundly(),opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const baseGraph=graph();
  const baseline=renderer.renderPhysical(baseGraph.g,m,opts);
  const baseEvents=baseGraph.stats().events;
  const baseStrokes=baseEvents.filter(e=>e.type==='stroke');
  assert.ok(baseStrokes.length>500);
  const modes={
    opaque:(a,b)=>assert.deepEqual(b,{...a,alpha:1}),
    black:(a,b)=>assert.deepEqual(b,{...a,color:'#000'}),
    'unit-width':(a,b)=>assert.deepEqual(b,{...a,width:1}),
    miter:(a,b)=>assert.deepEqual(b,{...a,join:'miter'}),
    simple:(a,b)=>assert.deepEqual(b,{...a,alpha:1,color:'#000',width:1,join:'miter'})
  };
  for(const [mode,compare] of Object.entries(modes)){
    const g=graph();
    const r=renderer.renderPhysical(g.g,m,{...opts,canvasDirectDiagnostics:{strokeMode:mode}});
    const events=g.stats().events,strokes=events.filter(e=>e.type==='stroke');
    assert.equal(events.length,baseEvents.length,mode+' painter events unchanged');
    assert.deepEqual(events.filter(e=>e.type==='fill'),baseEvents.filter(e=>e.type==='fill'),
      mode+' fill sequence unchanged');
    assert.equal(strokes.length,baseStrokes.length);
    for(let i=0;i<strokes.length;i++)compare(baseStrokes[i],strokes[i]);
    assert.deepEqual(r.directStats.canvasCalls,baseline.directStats.canvasCalls,
      mode+' does not alter geometry or Canvas operation counts');
    assert.equal(r.drawn,baseline.drawn);
    assert.equal(r.primitiveCount,baseline.primitiveCount);
    assert.equal(r.directStats.strokePrimitives,baseline.directStats.strokePrimitives);
    assert.equal(r.directStats.horizonMasks,baseline.directStats.horizonMasks);
    assert.equal(r.directStats.strokeStyleCounts.translucent,
      strokes.filter(e=>e.alpha<1).length);
    assert.equal(r.directStats.strokeStyleCounts.nonUnitWidth,
      strokes.filter(e=>Math.abs(e.width-1)>1e-6).length);
    assert.equal(r.directStats.strokeStyleCounts.nonBlack,
      strokes.filter(e=>!(/^(?:black|#000|#000000|rgb\(0,\s*0,\s*0\))$/i).test(String(e.color))).length);
    assert.equal(r.directStats.strokeStyleCounts.roundJoin,
      strokes.filter(e=>e.join==='round').length);
    // Switching back to the normal painter must not retain miter/black styles.
    renderer.renderPhysical(g.g,m,opts);
    assert.equal(g.g.Canvas.getContext('2d').lineJoin,'round');
  }
});

test('stroke style counters describe only submitted strokes, not path-only work',()=>{
  const m=soundly(),g=graph();
  const r=renderer.renderPhysical(g.g,m,{atmosphere:'vacuum',opticalQuality:'canvas-direct',
    deferDecorations:true,canvasDirectDiagnostics:{strokeMode:'path-only'}});
  assert.ok(r.directStats.strokePrimitives>500);
  assert.equal(r.directStats.strokeCalls,0);
  assert.deepEqual(r.directStats.strokeStyleCounts,
    {translucent:0,nonUnitWidth:0,nonBlack:0,roundJoin:0});
});

test('unknown stroke diagnostic mode is rejected instead of silently changing the painter',()=>{
  const m=soundly();
  assert.throws(()=>draw(m,{canvasDirectDiagnostics:{strokeMode:'unknown'}}),
    /Unknown Canvas Direct stroke diagnostic mode/);
});


test('stroke width sweep retains full path geometry and every other stroke property',()=>{
  const m=soundly(),opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const baselineGraph=graph(),baseline=renderer.renderPhysical(baselineGraph.g,m,opts);
  const original=baselineGraph.stats().events;
  const baseStrokes=original.filter(e=>e.type==='stroke');
  assert.ok(baseStrokes.length>500);
  assert.ok(baseline.directStats.strokeWidthRange.minPx>0);
  assert.ok(baseline.directStats.strokeWidthRange.maxPx>=baseline.directStats.strokeWidthRange.minPx);
  for(const width of [0.25,0.5,0.75,1,1.125,1.25,1.5,2,3,4]){
    const g=graph(),result=renderer.renderPhysical(g.g,m,{...opts,
      canvasDirectDiagnostics:{fills:true,strokes:true,horizonMask:true,strokeMode:'normal',strokeWidth:width}});
    const events=g.stats().events;
    assert.equal(events.length,original.length,`${width}: total painter operations`);
    assert.deepEqual(events.filter(e=>e.type==='fill'),original.filter(e=>e.type==='fill'));
    const strokes=events.filter(e=>e.type==='stroke');
    assert.equal(strokes.length,baseStrokes.length);
    for(let i=0;i<strokes.length;i++){
      assert.deepEqual(strokes[i],{...baseStrokes[i],width},`${width}: stroke ${i}`);
    }
    assert.deepEqual(result.directStats.canvasCalls,baseline.directStats.canvasCalls);
    assert.equal(result.drawn,baseline.drawn);
    assert.equal(result.primitiveCount,baseline.primitiveCount);
    assert.equal(result.directStats.strokeCalls,baseline.directStats.strokeCalls);
    assert.equal(result.directStats.horizonMasks,baseline.directStats.horizonMasks);
    assert.equal(result.directStats.strokeWidthRange.minPx,width);
    assert.equal(result.directStats.strokeWidthRange.maxPx,width);
    renderer.renderPhysical(g.g,m,opts);
    assert.equal(g.g.Canvas.getContext('2d').lineJoin,'round');
  }
});

test('stroke width overrides validate values before Canvas painting',()=>{
  const m=soundly();
  for(const strokeWidth of [0,-1,65,NaN,Infinity,'1',null]){
    assert.throws(()=>draw(m,{canvasDirectDiagnostics:{strokeWidth}}),
      /Invalid Canvas Direct diagnostic stroke width/);
  }
  assert.throws(()=>draw(m,{canvasDirectDiagnostics:{strokeMode:'simple',strokeWidth:1}}),
    /Invalid Canvas Direct diagnostic stroke width/);
});


test('projection-only benchmark runs real clipping but never sends Canvas draw commands',()=>{
  const m=soundly(),g=graph(),opts={atmosphere:'vacuum',
    opticalQuality:'canvas-direct',deferDecorations:true};
  const full=renderer.renderPhysical(g.g,m,opts);
  assert.ok(full.directStats.strokeCalls>0&&full.timings.projectionMs>=0);
  const projectionGraph=graph();
  const projection=renderer.renderPhysical(projectionGraph.g,m,{...opts,
    canvasDirectDiagnostics:{fills:true,strokes:true,horizonMask:true,
      strokeMode:'normal',skipCanvasPaint:true}});
  assert.equal(projection.drawn,full.drawn);
  assert.equal(projection.primitiveCount,full.primitiveCount);
  assert.equal(projection.directStats.horizonMasks,full.directStats.horizonMasks);
  assert.equal(projection.directStats.strokeCalls,0);
  assert.equal(projection.directStats.fillCalls,0);
  assert.ok(projection.timings.projectionMs>=0);
  for(const [command,count] of Object.entries(projectionGraph.stats().called))
    assert.equal(count,0,'projection-only must not call '+command);
  const restored=renderer.renderPhysical(projectionGraph.g,m,opts);
  assert.ok(restored.directStats.strokeCalls>0);
  assert.equal(restored.drawn,full.drawn);
  assert.equal(restored.primitiveCount,full.primitiveCount);
});

test('empty-stroke calls the same number of stroke() operations on empty paths',()=>{
  const m=soundly(),opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const baseGraph=graph(true),emptyGraph=graph(true),pathGraph=graph(true);
  const base=renderer.renderPhysical(baseGraph.g,m,opts);
  const empty=renderer.renderPhysical(emptyGraph.g,m,{...opts,
    canvasDirectDiagnostics:{strokeMode:'empty-stroke'}});
  const paths=renderer.renderPhysical(pathGraph.g,m,{...opts,
    canvasDirectDiagnostics:{strokeMode:'path-only'}});
  assert.ok(base.directStats.strokeCalls>500);
  assert.equal(empty.directStats.strokeCalls,base.directStats.strokeCalls);
  assert.equal(empty.directStats.strokePrimitives,base.directStats.strokePrimitives);
  assert.equal(empty.directStats.fillCalls,base.directStats.fillCalls);
  assert.equal(empty.drawn,base.drawn);
  assert.equal(empty.primitiveCount,base.primitiveCount);
  assert.equal(empty.directStats.horizonMasks,base.directStats.horizonMasks);
  assert.equal(empty.directStats.canvasCalls.stroke,base.directStats.canvasCalls.stroke);
  assert.equal(empty.directStats.canvasCalls.moveTo,base.directStats.canvasCalls.moveTo);
  assert.equal(empty.directStats.canvasCalls.lineTo,base.directStats.canvasCalls.lineTo);
  assert.equal(empty.directStats.canvasCalls.beginPath,
    base.directStats.canvasCalls.beginPath+base.directStats.strokeCalls);
  assert.equal(paths.directStats.strokeCalls,0);
  assert.ok(baseGraph.stats().strokedPaths.every(p=>p.length>0));
  assert.ok(emptyGraph.stats().strokedPaths.every(p=>p.length===0));
  assert.deepEqual(empty.directStats.canvasCalls,emptyGraph.stats().called);
  assert.deepEqual(emptyGraph.stats().events.filter(e=>e.type==='fill'),
    baseGraph.stats().events.filter(e=>e.type==='fill'));
  assert.equal(empty.directStats.canvasCalls.fill,base.directStats.canvasCalls.fill);
  const restored=renderer.renderPhysical(emptyGraph.g,m,opts);
  assert.ok(restored.directStats.strokeCalls>0);
});


test('thin outlines cap authored widths without changing paint operations or scene state',()=>{
  const m=soundly(),before=JSON.stringify(m);
  const opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const base=graph();
  const baseResult=renderer.renderPhysical(base.g,m,opts);
  const thin=graph();
  const thinResult=renderer.renderPhysical(thin.g,m,{...opts,
    canvasDirectDiagnostics:{thinOutlines:true}});
  const baseEvents=base.stats().events,thinEvents=thin.stats().events;
  assert.equal(thinEvents.length,baseEvents.length);
  assert.deepEqual(thinEvents.filter(e=>e.type==='fill'),baseEvents.filter(e=>e.type==='fill'));
  const original=baseEvents.filter(e=>e.type==='stroke');
  const capped=thinEvents.filter(e=>e.type==='stroke');
  assert.ok(original.length>500);
  assert.equal(capped.length,original.length);
  for(let i=0;i<original.length;i++){
    assert.deepEqual(capped[i],{...original[i],width:Math.min(original[i].width,1)});
  }
  assert.equal(thinResult.drawn,baseResult.drawn);
  assert.equal(thinResult.primitiveCount,baseResult.primitiveCount);
  assert.deepEqual(thinResult.directStats.canvasCalls,baseResult.directStats.canvasCalls);
  assert.equal(thinResult.directStats.strokeWidthRange.maxPx,1);
  assert.equal(JSON.stringify(m),before);
  const restored=renderer.renderPhysical(thin.g,m,opts);
  assert.deepEqual(restored.directStats.strokeWidthRange,baseResult.directStats.strokeWidthRange);
  assert.throws(()=>renderer.renderPhysical(graph().g,m,{...opts,
    canvasDirectDiagnostics:{thinOutlines:true,strokeWidth:0.5}}),
    /Invalid Canvas Direct diagnostic stroke width/);
});
