'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const renderer=require('../src/app/CurvatureMainCanvasRenderer');
const sceneState=require('../src/ui/modern/ModernSceneState');
const shimmer=require('../src/ui/modern/ModernAtmosphericShimmer');

function makeModel(){
  const vec={Norm:a=>{const n=Math.hypot(...a);return a.map(v=>v/n);},
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]],
    Scale:(a,t)=>a.map(v=>v*t),Add:(a,b)=>a.map((v,i)=>v+b[i]),
    ScalarProd:(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0)};
  const context=vm.createContext({JsgVect3:vec});
  const src=fs.readFileSync(path.join(__dirname,'../src/app/CurvatureModel.js'),'utf8');
  vm.runInContext(src,context);
  const m=vm.runInContext('new CurveAppClass()',context);
  sceneState.applyPreset(m,'single');m.Update();
  m.DemoText='Sharp title';m.Description='Sharp description';
  return m;
}
function makeCanvas(){
  const ops=[],ctx={
    save(){ops.push(['save']);},restore(){ops.push(['restore']);},
    setTransform(...args){ops.push(['transform',...args]);},beginPath(){},
    moveTo(){},lineTo(){},closePath(){},stroke(){},fill(){},clearRect(){},
    setLineDash(){},measureText(t){return {width:t.length*10};},
    fillText(t){ops.push(['text',t]);}
  };
  return {width:700,height:466,ops,getContext(type){assert.equal(type,'2d');return ctx;}};
}
function makeGraph(canvas){
  return {Canvas:canvas,Camera:{},ContextScale:1,
    WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},AutoScalePix:false,
    MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,GetPixScaling(){return 1;},
    SetViewport(){},SetGraphClipping(){},SetCameraClipping(d){this.CameraClipPlaneDist=d;},
    SetWindowToCameraScreen(){},SetCamera(p){this.Camera={CamPos:p.CamPos,
      CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,SceneSize:p.SceneSize,
      ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
}
const opts={atmosphere:'standard',occlusionRadius:6371000,interactive:false};

test('138.2.2: physical snapshot excludes screen-only titles and camera frame',()=>{
  const m=makeModel(),source=makeCanvas(),g=makeGraph(source);
  const result=renderer.renderPhysical(g,m,{...opts,deferDecorations:true});
  assert.equal(result.mode,'physical-scene');
  assert.ok(result.decorationCamera,'renderer returns camera only when decoration is deferred');
  assert.deepEqual(source.ops.filter(op=>op[0]==='text'),[],
    'the source texture must contain physical optics only');
  const guide=makeCanvas();
  renderer.drawPresentationDecorations(guide,m,result.decorationCamera);
  assert.deepEqual(guide.ops.filter(op=>op[0]==='text').map(op=>op[1]),
    ['Sharp title','Sharp description']);
  assert.deepEqual(guide.ops.filter(op=>op[0]==='transform')[0],
    ['transform',1,0,0,1,0,0],'guides must use backing pixel coordinates');
  assert.deepEqual(source.ops.filter(op=>op[0]==='text'),[],
    'drawing screen decorations cannot feed back into the source texture');
});

test('138.2.2: disabled effect and capture-fallback source retain captions',()=>{
  const m=makeModel(),source=makeCanvas(),g=makeGraph(source);
  const regular=renderer.renderPhysical(g,m,opts);
  assert.equal(regular.decorationCamera,null);
  assert.deepEqual(source.ops.filter(op=>op[0]==='text').map(op=>op[1]),
    ['Sharp title','Sharp description']);
  source.ops.length=0;
  const deferred=renderer.renderPhysical(g,m,{...opts,deferDecorations:true});
  assert.deepEqual(source.ops.filter(op=>op[0]==='text'),[]);
  // If WebGL capture fails, the app's fallback guideGraph is the original graph.
  renderer.drawPresentationDecorations(g.Canvas,m,deferred.decorationCamera);
  assert.deepEqual(source.ops.filter(op=>op[0]==='text').map(op=>op[1]),
    ['Sharp title','Sharp description']);
});

test('138.2.2: no repeated feedback; shader uses smooth bounded displacement',()=>{
  assert.match(shimmer.fragmentSource,/valueNoise\(vec2 p\)/);
  assert.doesNotMatch(shimmer.fragmentSource,/gradNoise/);
  assert.match(shimmer.fragmentSource,/if\(uStrength==0\.0\)/);
  const src=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernAtmosphericShimmer.js'),'utf8');
  assert.match(src,/Math\.min\(current\.intensity,0\.16\*current\.scale\)/);
  assert.match(src,/if\(meta\.capture===true\)[\s\S]*?gl\.texImage2D/);
  const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(app,/atmosphericPresentation\.frame\(name,timestamp\)/);
  assert.match(app,/deferDecorations:separateDecorations/);
  assert.match(app,/options\.deferDecorations=true/);
  assert.equal(shimmer.settingsFor({intensity:12,scale:35}).intensity,12,
    'configured value remains user-selected; only GPU displacement is capped');
});
