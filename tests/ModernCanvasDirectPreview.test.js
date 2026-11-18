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
test('Globe and Flat render Vacuum and Standard with independent signed curvature',()=>{
  const m=soundly();
  const globe=draw(m,{atmosphere:'standard'});
  assert.ok(globe.refractionK>0&&globe.effectiveRadiusMeters>m.rEarth);
  assert.equal(globe.opticalQuality,'canvas-direct');
  assert.equal(draw(m,{atmosphere:'inverse-temperature',occlusionRadius:R}).opticalQuality,
    'canvas-direct');
  m.showModel=2;m.Update();
  const vacuum=draw(m),standard=draw(m,{atmosphere:'standard'});
  assert.equal(vacuum.opticalQuality,'canvas-direct');
  assert.equal(vacuum.effectiveRadiusMeters,Infinity);
  assert.equal(standard.opticalQuality,'canvas-direct');
  assert.ok(standard.refractionK>0&&standard.effectiveRadiusMeters<0);
  assert.equal(standard.directStats.horizonMasks,0,
    'downward ray bending on Flat does not invent a geometric horizon');
  const inverse=draw(m,{atmosphere:'inverse-temperature',occlusionRadius:R,
    inverseProfile:{source:'standard',weight:1}});
  assert.ok(inverse.effectiveRadiusMeters>0,'inverse Flat has positive virtual curvature');
  assert.equal(inverse.directStats.horizonMasks,0,'Flat does not invent a certified horizon');
});

test('Flat signed-curvature painter bends object and ground guides in the observer frame',()=>{
  const m=soundly();m.showModel=2;m.showGrid=1;m.Update();
  const params=require('../src/optics/OpticalEffectiveRadiusPreview').parameters(m,{atmosphere:'standard'});
  const C=params.effectiveCurvature;
  const eye=m.Height,d=10000,h=23;
  const vacuum=direct.flatRefractionPoint(0,d,h,eye,0);
  const refracted=direct.flatRefractionPoint(0,d,h,eye,C);
  assert.equal(vacuum[1],d);
  assert.equal(vacuum[2],h-eye);
  assert.ok(refracted[2]>vacuum[2],'downward-bent rays raise distant objects');
  assert.ok(Math.abs(refracted[1]-d)<.1,'small-angle lateral correction');
  const localAngle=Math.atan2(refracted[2],refracted[1]);
  const ray=require('../src/optics/OpticalEffectiveRadiusPreview').ray(params,d,h);
  assert.ok(Math.abs(localAngle-ray.angle)<1e-12,
    'Canvas Direct coordinate warp and Effective Radius ray must agree');
  const before=JSON.stringify(m),g=graph(true),directOptions={atmosphere:'standard',
    opticalQuality:'canvas-direct',deferDecorations:true};
  const first=renderer.renderPhysical(g.g,m,directOptions);
  assert.ok(first.directStats.strokeCalls>0);
  assert.equal(first.directStats.horizonMasks,0);
  const vacuumGraph=graph(true);
  renderer.renderPhysical(vacuumGraph.g,m,{...directOptions,atmosphere:'vacuum'});
  assert.notDeepEqual(g.stats().strokedPaths,vacuumGraph.stats().strokedPaths,
    'Flat Standard must bend the actual Canvas paths, not only return a negative radius');
  m.CameraEast+=100;m.CameraNorth+=200;m.Update();
  const second=renderer.renderPhysical(g.g,m,directOptions);
  assert.equal(second.cacheReused,true,'moving observer does not regenerate authored meshes');
  assert.equal(JSON.stringify(Array.from(m.ObjDist)),JSON.stringify(Array.from(JSON.parse(before).ObjDist)));
  const flatVac=direct.flatRefractionPoint(12,45,0,eye,0);
  assert.deepEqual(flatVac,[12,45,-eye],'vacuum Flat retains its exact plane');
  assert.throws(()=>direct.flatRefractionPoint(0,1e9,0,eye,C),/preview range/);
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
test('Canvas Direct supports all authored atmosphere profiles on Globe and Flat',()=>{
  const atmospheric=require('../src/optics/OpticalRayTracer');
  const effective=require('../src/optics/OpticalEffectiveRadiusPreview');
  const temperatureProfile={temperatureC:12,pressureHpa:980,gradientKPerKm:-12};
  const common={occlusionRadius:R,temperatureProfile,
    transitionProfile:{source:'temperature-lapse',weight:.6},
    inverseProfile:{source:'standard',weight:.7}};
  const kinds=['vacuum','standard','temperature-lapse','profile-transition',
    'inverse-temperature','inverse-spherical','exponential-occlusion'];
  const m=soundly();
  for(const shape of [1,2]){
    m.showModel=shape;m.Update();
    const original=JSON.stringify(m);
    for(const kind of kinds){
      const opts={...common,atmosphere:kind},p=effective.canvasDirectParameters(m,opts);
      const profileOptions=kind==='temperature-lapse'?temperatureProfile:
        kind==='profile-transition'?{temperatureProfile,transitionProfile:common.transitionProfile,occlusionRadius:R}:
        kind==='inverse-temperature'?{temperatureProfile,inverseProfile:common.inverseProfile,occlusionRadius:R}:
        {occlusionRadius:R};
      const profile=atmospheric.atmosphere(kind,profileOptions),height=m.Height;
      const expected=(shape===1?1/m.rEarth:0)+profile.dn(height)/profile.n(height);
      assert.ok(Math.abs(p.effectiveCurvature-expected)<1e-17,`${shape} ${kind} local n'/n`);
      const g=graph(true),result=renderer.renderPhysical(g.g,m,{...opts,
        opticalQuality:'canvas-direct',deferDecorations:true,
        canvasDirectOptions:{thinOutlines:true}});
      assert.equal(result.opticalQuality,'canvas-direct',`${shape} ${kind}`);
      assert.ok(result.drawn>=0&&Number.isFinite(result.timings.totalMs));
      assert.ok(g.stats().events.every(e=>e.type!=='stroke'||e.width<=1));
      assert.ok(g.stats().paintedPaths.concat(g.stats().strokedPaths.map(points=>({points})))
        .every(path=>path.points.every(point=>point.every(Number.isFinite))),
        `${shape} ${kind} finite Canvas paths`);
      if(shape===2)assert.equal(result.directStats.horizonMasks,0,
        'Flat approximation never claims a certified horizon');
    }
    assert.equal(JSON.stringify(m),original,'renderer leaves the authored model untouched');
  }
  assert.throws(()=>effective.parameters(m,{...common,atmosphere:'inverse-spherical'}),
    /supports/,'explicit Effective Radius mode remains restricted');
  assert.throws(()=>effective.canvasDirectParameters(m,{atmosphere:'inverse-temperature'}),
    /occlusionRadius/,'missing profile parameters must not become Vacuum');
});

test('Canvas Direct signed Flat embedding supports positive and negative virtual curvature',()=>{
  const eye=12,d=10000,h=20,positive=1/R,negative=-1/R;
  const plane=direct.flatRefractionPoint(0,d,h,eye,0);
  const upBending=direct.flatRefractionPoint(0,d,h,eye,positive);
  const downBending=direct.flatRefractionPoint(0,d,h,eye,negative);
  assert.ok(upBending[2]<plane[2]);
  assert.ok(downBending[2]>plane[2]);
  assert.ok([plane,upBending,downBending].every(row=>row.every(Number.isFinite)));
});

test('Animation Studio keeps all authored profiles in Canvas Direct and falls back only when unrepresentable',()=>{
  const m=soundly(),base={occlusionRadius:R,preset:'soundly',resetPreset:'soundly'};
  const comparison=compare.preset('globe-flat-vacuum');
  const display={mode:'scene',eyeLevel:false,horizon:false,selected:'A'};
  class FakeModel{Update(){}}
  const calls=[];
  const view=preview.create({Model:FakeModel,renderer:{renderPhysical(_g,_m,options){
    calls.push(options.opticalQuality);return {drawn:5};
  }}});
  for(const kind of ['standard','profile-transition','inverse-temperature',
    'inverse-spherical','exponential-occlusion']){
    const snapshot=experiment.capture(m,{...base,atmosphere:kind},comparison,display);
    const before=structuredClone(snapshot);
    const result=view.render(snapshot,'A',{Canvas:{}},{quality:'canvas-direct'});
    assert.equal(result.quality,'canvas-direct',kind);
    assert.equal(result.fallback,null,kind);
    assert.equal(calls.at(-1),'canvas-direct');
    assert.deepEqual(snapshot,before,'no atmosphere or project mutation');
  }
  m.showModel=2;m.Update();
  for(const kind of ['standard','inverse-spherical','exponential-occlusion']){
    const snap=experiment.capture(m,{...base,atmosphere:kind},comparison,display);
    assert.equal(view.render(snap,'A',{Canvas:{}},{quality:'canvas-direct'}).quality,
      'canvas-direct',`Flat ${kind}`);
  }
  // An enormous, but valid, Globe radius makes standard refraction overbend
  // the surface. An unrepresentable virtual globe must still fail closed.
  m.showModel=1;m.rEarth=1e13;m.Update();
  const extreme=experiment.capture(m,{...base,atmosphere:'standard'},comparison,display);
  const fallback=view.render(extreme,'A',{Canvas:{}},{quality:'canvas-direct'});
  assert.equal(fallback.requestedQuality,'canvas-direct');
  assert.equal(fallback.quality,'accurate');
  assert.match(fallback.fallback,/Canvas Direct unavailable/);
  assert.equal(calls.at(-1),'accurate');
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

test('Soundly moving-camera horizon mask is clipped to the Canvas viewport',()=>{
  const m=soundly();m.Height=9.41;m.CameraEast=-22.2;m.CameraNorth=247;
  m.Pan=.47;m.Nick=-.015;m.FocalLengthField=2098;m.Update();
  const g=graph(true),opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',
    deferDecorations:true};
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
});

test('thin outlines cap authored widths without changing paint operations or scene state',()=>{
  const m=soundly(),before=JSON.stringify(m);
  const opts={atmosphere:'vacuum',opticalQuality:'canvas-direct',deferDecorations:true};
  const base=graph(),thin=graph();
  const baseResult=renderer.renderPhysical(base.g,m,opts);
  const thinResult=renderer.renderPhysical(thin.g,m,{...opts,
    canvasDirectOptions:{thinOutlines:true}});
  const a=base.stats().events,b=thin.stats().events;
  assert.equal(b.length,a.length,'the same paths are painted');
  assert.deepEqual(b.filter(e=>e.type==='fill'),a.filter(e=>e.type==='fill'));
  const original=a.filter(e=>e.type==='stroke');
  const capped=b.filter(e=>e.type==='stroke');
  assert.ok(original.length>500);
  assert.equal(capped.length,original.length);
  for(let i=0;i<original.length;i++)
    assert.deepEqual(capped[i],{...original[i],width:Math.min(original[i].width,1)});
  assert.equal(thinResult.drawn,baseResult.drawn);
  assert.equal(thinResult.primitiveCount,baseResult.primitiveCount);
  assert.deepEqual(thinResult.directStats,baseResult.directStats);
  assert.equal(JSON.stringify(m),before);
  const firstPaintCount=b.length;
  const restored=renderer.renderPhysical(thin.g,m,opts);
  assert.equal(restored.drawn,baseResult.drawn);
  const last=thin.stats().events.slice(firstPaintCount).filter(e=>e.type==='stroke');
  assert.deepEqual(last,original,'turning off the cap restores authored widths');
});
