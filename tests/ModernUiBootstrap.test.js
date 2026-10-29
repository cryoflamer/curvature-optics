'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=p=>fs.readFileSync(path.join(root,p),'utf8');
const route=require('../src/ui/modern/ModernRoute');

test('URL router keeps Legacy default and routes only explicit modern requests',()=>{
  assert.equal(route.isModern(''),false);
  assert.equal(route.isModern('?ui=legacy'),false);
  assert.equal(route.isModern('?ui=compare'),false);
  assert.equal(route.isModern('?model=modern'),false);
  assert.equal(route.isModern('?ui=modern'),true);
  assert.equal(route.isModern('?foo=1&ui=modern&foo=2'),true);
  const location={pathname:'/projects/CurvatureApp.html',search:'?ui=modern&x=1',hash:'#scene'};
  assert.equal(route.target(location),'/projects/CurvatureModern.html?ui=modern&x=1#scene');
  assert.equal(route.canonical({...location,pathname:'/projects/CurvatureModern.html'}),
    '/projects/CurvatureApp.html?ui=modern&x=1#scene');
  assert.equal(route.redirect({...location,search:'?ui=legacy',replace(){throw Error('Should not navigate');}}),false);
  let navigated='';route.redirect({...location,replace(url){navigated=url;}});
  assert.equal(navigated,'/projects/CurvatureModern.html?ui=modern&x=1#scene');
  let canonical='';route.restoreCanonical({...location,pathname:'/projects/CurvatureModern.html'},
    {state:null,replaceState(_state,_title,url){canonical=url;}});
  assert.equal(canonical,'/projects/CurvatureApp.html?ui=modern&x=1#scene');
  assert.throws(()=>route.target({pathname:'/x/unknown.html'}),/Unrecognized/);
});

test('Modern document is isolated from legacy control/runtime scripts and uses actual physical renderer',()=>{
  const modern=source('CurvatureModern.html'),legacy=source('CurvatureApp.html');
  assert.match(legacy,/<script src="src\/ui\/modern\/ModernRoute\.js"><\/script>/);
  assert.match(modern,/src\/app\/CurvatureMainCanvasRenderer\.js/);
  assert.match(modern,/src\/optics\/CurvaturePhysicalSceneOptics\.js/);
  assert.match(modern,/src\/geometry\/CurvatureSurfaceGeometry\.js/);
  assert.match(modern,/src\/app\/CurvatureModel\.js/);
  assert.match(modern,/src\/ui\/modern\/ModernApp\.js/);
  assert.doesNotMatch(modern,/src\/ui\/ControlPanelX\.js|src\/app\/CurvatureAppRuntime\.js|src\/animation\/CurvatureDemos\.js|src\/legacy\/CurvatureLegacyDrawing\.js/);
  const htmlSrcs=[...modern.matchAll(/<script\s+src="([^"]+)"/g)].map(m=>m[1]);
  for(const p of htmlSrcs)assert.ok(fs.existsSync(path.join(root,p.split('?')[0])),p+' missing');
  assert.ok(htmlSrcs.indexOf('src/geometry/CurvatureSurfaceGeometry.js')<htmlSrcs.indexOf('src/optics/OpticalRayTracer.js'));
  assert.ok(htmlSrcs.indexOf('src/optics/CurvaturePhysicalSceneOptics.js')<htmlSrcs.indexOf('src/app/CurvatureMainCanvasRenderer.js'));
  assert.match(modern,/id="ModernCompareMessage" hidden/);
  assert.match(modern,/<base href="\.\/">/);
  assert.match(source('docs/modern-ui-plan.md'),/132/);
  assert.match(source('PROJECT_STATE.md'),/modern-ui-plan\.md/);
});

test('Modern standalone runtime binds working scene controls and does not instantiate Legacy UI',()=>{
  const ids=['ModernStatus','ModernCurvatureLabel','ModernViewInfo','ModernModePill','ModernOcclusionWrap',
    'ModernSceneTab','ModernCompareTab','ModernCompareMessage','ModernGraphHost',
    'ModernBackToScene','ModernCompareViews','ModernHeight','ModernFocal','ModernPan','ModernNick','ModernOcclusion',
    'ModernCameraAim','ModernAtmosphere','ModernGrid','ModernCurvature','ModernEarth','ModernRender',
    'ModernRoll','ModernViewAngle','ModernRadiusKm','ModernFlat','ModernPreset','ModernResetPreset',
    'ModernObjectFields0','ModernObjectFields1','ModernSceneTitle','ModernSceneDescription'];
  const nodes=new Map(ids.map(id=>[id,{
    id,value:{ModernHeight:'15',ModernFocal:'2000',ModernPan:'0.0464',ModernNick:'0.0121',
      ModernCameraAim:'3',ModernAtmosphere:'standard',ModernOcclusion:'6371000',ModernCurvature:'164'}[id]||'',
    min:'',max:'',checked:true,hidden:false,textContent:'',listeners:{},previousElementSibling:{textContent:id},
    classList:{toggle(){}},addEventListener(type,fn){this.listeners[type]=fn;},
    setAttribute(){},closest(){return {set hidden(value){this.value=value;}};}
  }]));
  const calls=[],callbacks=[],renderOptions=[];
  function FakeModel(){this.showModel=1;this.rEarth=6371000;this.Height=100;this.Update=function(){calls.push('update');};}
  const ctx={window:{CurveAppClass:FakeModel,
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,options){renderOptions.push({g,m,options});return {
      cacheReused:false,drawn:30,fillTriangles:12,unresolved:0,timings:{totalMs:12}};}},
    CurvaturePhysicalCurvature:{modelStep(m){return m.showModel===2?1000:164;},
      applyStep(m,step){m.showModel=step===1000?2:1;},
      resetEarth(m){m.showModel=1;m.rEarth=6371000;},
      label(m){return m.showModel===2?'Flat':'Globe';}},
    NewGraphX3D(options){calls.push('graph');callbacks.push(options);return {Redraw(){options.DrawFunc({id:'canvasGraph'});}};},
    xOnLoad(fn){callbacks.push(fn);},console:{error(msg){calls.push('error:'+msg);}}},
    document:{getElementById(id){assert.ok(nodes.has(id),'unexpected '+id);return nodes.get(id);}},
    requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){},
    setTimeout(fn){fn();return 2;},clearTimeout(){},console};
  ctx.window.window=ctx.window;
  vm.runInNewContext(source('src/ui/modern/ModernApp.js'),ctx,{filename:'ModernApp.js'});
  assert.equal(calls.includes('graph'),true);
  // The explicit xOnLoad callback, not the old legacy animation/bootstrap.
  callbacks.find(item=>typeof item==='function')();
  assert.equal(renderOptions.length,1);
  assert.equal(renderOptions[0].options.atmosphere,'standard');
  assert.equal(renderOptions[0].m.NObjects[0],85);
  assert.match(nodes.get('ModernStatus').textContent,/30 outline pieces/);
  nodes.get('ModernAtmosphere').value='inverse-spherical';
  nodes.get('ModernAtmosphere').listeners.change.call(nodes.get('ModernAtmosphere'));
  assert.equal(renderOptions.at(-1).options.atmosphere,'inverse-spherical');
  assert.equal(nodes.get('ModernOcclusionWrap').hidden,false);
  nodes.get('ModernCurvature').value='1000';nodes.get('ModernCurvature').listeners.input();
  assert.equal(renderOptions.at(-1).m.showModel,2);
  assert.match(nodes.get('ModernCurvatureLabel').textContent,/Flat/);
  nodes.get('ModernCompareTab').listeners.click();
  assert.equal(ctx.window.CurvatureModernApp.getMode(),'compare');
  assert.equal(nodes.get('ModernCompareMessage').hidden,false);
  nodes.get('ModernBackToScene').listeners.click();
  assert.equal(ctx.window.CurvatureModernApp.getMode(),'scene');
});

test('Modern demo configuration renders real 85+2 Physical optics, not a placeholder image',()=>{
  const vec={Norm:a=>{const n=Math.hypot(...a);return a.map(x=>x/n);},
    Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    Scale:(a,t)=>a.map(x=>x*t),Add:(a,b)=>a.map((x,i)=>x+b[i]),
    ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
  const modelContext=vm.createContext({JsgVect3:vec});
  vm.runInContext(source('src/app/CurvatureModel.js'),modelContext);
  const model=vm.runInContext('new CurveAppClass()',modelContext);
  Object.assign(model,{Height:15,FocalLengthField:2000,Pan:0.0464,Nick:0.0121,
    viewcenterHorizon:3,showModel:1,showGrid:1,showEyeLevel:false,showTangent:false,
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSidePos:[35,25.4],ObjSideVar:[0,0],ObjSideType:[0,0],ObjSize:[23,64],
    ObjSizeVar:[0,0],ObjSizeType:[0,0]});
  model.Update();
  const ctx={save(){},restore(){},setTransform(){},beginPath(){},moveTo(){},lineTo(){},
    closePath(){},stroke(){},fill(){},clearRect(){},setLineDash(){},
    measureText(){return {width:0};}};
  const graph={Canvas:{width:720,height:480,getContext(){return ctx;}},Camera:{},
    ContextScale:1,WinTrans:{ScaleX:1,ScaleY:-1,OffsetX:0,OffsetY:0},
    AutoScalePix:false,MinLineWidth:1,ScalePixInt:false,DevicePixelRatio:1,
    GetPixScaling(){return 1;},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(d){this.CameraClipPlaneDist=d;},SetWindowToCameraScreen(){},
    SetCamera(p){this.Camera={CamPos:p.CamPos,CamUp:p.CamUp,CamViewCenter:p.CamViewCenter,
      SceneSize:p.SceneSize,ScreenSize:1,ObjectZExtend:0,Zoom:1};},
    SetCameraZoom(z){this.Camera.Zoom=z;}};
  const result=require('../src/app/CurvatureMainCanvasRenderer').renderPhysical(graph,model,
    {atmosphere:'standard',occlusionRadius:6371000,interactive:false});
  assert.equal(result.mode,'physical-scene');
  assert.ok(result.drawn>3000,'expected full tower silhouettes');
  assert.ok(result.fillTriangles>800,'expected real projected foundation fills');
  assert.equal(result.unresolved,0);
  assert.ok(result.guideSegments>0,'expected physical metric ground guides');
});
