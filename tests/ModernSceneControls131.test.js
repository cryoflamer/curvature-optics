'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(base,p),'utf8');
const adapter=require('../src/ui/modern/ModernSceneState131');
const curvature=require('../src/app/CurvaturePhysicalCurvature127');
const vec={Norm:a=>{const l=Math.hypot(...a);return a.map(v=>v/l);},
  Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  Scale:(a,s)=>a.map(v=>v*s),Add:(a,b)=>a.map((v,i)=>v+b[i]),
  ScalarProd:(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0)};
function model(){
  const context=vm.createContext({JsgVect3:vec});
  vm.runInContext(read('src/app/CurvatureModel.js'),context);
  return vm.runInContext('new CurveAppClass()',context);
}
test('131 pure state adapter uses exact one model and validates before mutation',()=>{
  const m=model();
  adapter.applyPreset(m,'pontchartrain');m.Update();
  assert.deepEqual(Array.from(m.NObjects),[85,2]);
  assert.deepEqual(Array.from(m.ObjDist),[50,25550]);
  adapter.setCamera(m,'FocalLengthField','2000');m.Update();
  const fov=m.ViewAngle;
  adapter.setCamera(m,'ViewAngleField','2');m.Update();
  assert.ok(Math.abs(m.ViewAngle-2)<1e-9,'FOV edits must beat the preceding focal input');
  assert.notEqual(m.ViewAngle,fov);
  adapter.setCamera(m,'Roll','-17.5');
  assert.equal(m.Roll,-17.5);
  adapter.setRadiusKm(m,'6000370');m.Update();
  assert.equal(m.rEarth,6000370000);
  assert.equal(m.showModel,1);
  curvature.applyStep(m,1000);m.Update();
  assert.equal(m.showModel,2);
  assert.equal(curvature.modelStep(m),1000);
  adapter.setRadiusKm(m,'6371');m.Update();
  assert.equal(m.showModel,1);
  assert.equal(m.rEarth,6371000);
  const before=m.ObjDist[1];
  assert.throws(()=>adapter.setObject(m,1,'ObjDist','Infinity'),/Expected/);
  assert.equal(m.ObjDist[1],before);
  assert.throws(()=>adapter.setObject(m,1,'NObjects','1.5'),/integer/);
  assert.throws(()=>adapter.setObject(m,1,'ObjType',4),/Expected/);
  assert.throws(()=>adapter.setCamera(m,'Height',''),/required/);
  assert.throws(()=>adapter.setRadiusKm(m,0),/Expected/);
  assert.throws(()=>adapter.setCamera(m,'foo',1),/Unknown/);
  adapter.setObject(m,1,'ObjType','2');assert.equal(m.ObjType[1],2);
  adapter.setObject(m,0,'ObjSidePos','-35');assert.equal(m.ObjSidePos[0],-35);
});

test('131 presets reset every relevant object group field without duplicating Legacy state',()=>{
  const m=model();
  for(const id of ['pontchartrain','single','rows']){
    const p=adapter.applyPreset(m,id);m.Update();
    assert.equal(m.DemoText,p.name);
    assert.equal(m.Description,p.description);
    assert.equal(m.viewcenterHorizon,3);
    assert.equal(m.showModel,1);
    assert.equal(m.rEarth,6371000);
    assert.equal(m.NObjects[0],p.objects.NObjects[0]);
    assert.equal(m.NObjects[1],p.objects.NObjects[1]);
    assert.deepEqual(Array.from(m.ObjSideType),[0,0]);
  }
  adapter.setObject(m,1,'ObjSideVar',350);
  adapter.setObject(m,0,'ObjSizeVar',0.8);
  adapter.applyPreset(m,'single');m.Update();
  assert.deepEqual(Array.from(m.ObjSideVar),[0,0]);
  assert.deepEqual(Array.from(m.ObjSizeVar),[0,0]);
  assert.deepEqual(Array.from(m.NObjects),[1,0]);
  assert.throws(()=>adapter.applyPreset(m,'missing'),/Unknown/);
});

test('131 HTML controls and isolated module order are explicit and no Legacy handlers are loaded',()=>{
  const html=read('CurvatureModern.html');
  const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,'DOM IDs must be unique');
  for(const id of ['ModernPreset','ModernResetPreset','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernObjectFields0','ModernObjectFields1']){
    assert.ok(ids.includes(id),id);
  }
  assert.ok(html.indexOf('src/ui/modern/ModernSceneState131.js')<html.indexOf('src/ui/modern/ModernApp130.js'));
  assert.doesNotMatch(html,/src\/ui\/ControlPanelX\.js|CurvatureAppRuntime\.js|CurvatureDemos\.js/);
  assert.match(read('docs/modern-ui-plan.md'),/131/);
});

function buildRuntime(){
  const nodes=new Map(),callbacks=[],draws=[],timers=new Map();
  let sequence=0;
  function node(id){
    if(nodes.has(id))return nodes.get(id);
    const n={id,value:'',checked:false,hidden:false,min:'',max:'',disabled:false,
      tagName:'INPUT',listeners:{},textContent:'',innerHTML:'',
      classList:{toggle(){}},addEventListener(name,cb){this.listeners[name]=cb;},
      setAttribute(){},closest(){return {hidden:false};},
      getAttribute(key){return this.attrs&&this.attrs[key];},
      querySelectorAll(){return [...nodes.values()].filter(v=>v.attrs&&v.attrs['data-group']===id.slice(-1));}};
    nodes.set(id,n);return n;
  }
  const staticIds=[...read('CurvatureModern.html').matchAll(/\sid="([^"]+)"/g)].map(x=>x[1]);
  for(const id of staticIds)node(id);
  node('ModernHeight').value='15';node('ModernFocal').value='2000';node('ModernPan').value='0.0464';
  node('ModernNick').value='0.0121';node('ModernRoll').value='0';
  node('ModernCameraAim').value='3';node('ModernAtmosphere').value='standard';
  node('ModernOcclusion').value='6371000';node('ModernCurvature').value='164';
  // Object host innerHTML is set at startup. Provide realistic querySelectorAll.
  for(let i=0;i<2;i++){
    const host=node('ModernObjectFields'+i);
    host.querySelectorAll=function(){
      const html=host.innerHTML;
      const matches=[...html.matchAll(/<(input|select)\s+id="(ModernObject\d+\w+)"[^>]*data-group="(\d+)" data-field="(\w+)"/g)];
      return matches.map(match=>{
        const n=node(match[2]);n.tagName=match[1].toUpperCase();
        n.attrs={'data-group':match[3],'data-field':match[4]};return n;
      });
    };
  }
  const modelCtx=vm.createContext({JsgVect3:vec});
  vm.runInContext(read('src/app/CurvatureModel.js'),modelCtx);
  const CurveAppClass=vm.runInContext('CurveAppClass',modelCtx);
  const win={CurveAppClass,CurvatureModernSceneState131:adapter,
    CurvaturePhysicalCurvature127:curvature,
    CurvatureMainCanvasRenderer:{renderPhysical(g,m,opts){
      draws.push({height:m.Height,roll:m.Roll,viewAngle:m.ViewAngle,
        radius:m.rEarth,showModel:m.showModel,atmosphere:opts.atmosphere,
        count:[...m.NObjects],lateral:[...m.ObjSidePos]});
      return {drawn:42,fillTriangles:10,unresolved:0,timings:{totalMs:5}};
    }},
    NewGraphX3D(options){return {Redraw(){options.DrawFunc({});}};},
    xOnLoad(fn){callbacks.push(fn);},console};
  const sandbox={window:win,document:{getElementById(id){return nodes.get(id)||null;}},
    requestAnimationFrame(fn){fn();return ++sequence;},cancelAnimationFrame(){},
    setTimeout(fn){const id=++sequence;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);},console};
  win.window=win;
  vm.runInNewContext(read('src/ui/modern/ModernApp130.js'),sandbox);
  callbacks[0]();
  function fire(id,type,value){const n=node(id);if(value!==undefined)n.value=value;
    const cb=n.listeners[type];assert.equal(typeof cb,'function',id+': '+type);
    cb.call(n);}
  function drain(){while(timers.size){const entries=[...timers];timers.clear();for(const [,cb] of entries)cb();}}
  return {nodes,draws,timers,win,fire,drain};
}

test('131 Modern events change the shared model; presets/flat/atmosphere keep state in sync',()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp130.getModel();
  assert.equal(r.draws.length,1);
  assert.deepEqual(r.draws[0].count,[85,2]);
  r.fire('ModernRoll','change','15');assert.equal(m.Roll,15);
  r.fire('ModernViewAngle','change','2.5');
  assert.ok(Math.abs(m.ViewAngle-2.5)<1e-8);
  r.fire('ModernRadiusKm','change','6000370');
  assert.equal(m.rEarth,6000370000);
  assert.equal(r.nodes.get('ModernCurvature').value,String(curvature.modelStep(m)));
  r.nodes.get('ModernFlat').checked=true;
  r.fire('ModernFlat','change');
  assert.equal(m.showModel,2);
  assert.equal(r.nodes.get('ModernRadiusKm').disabled,true);
  r.fire('ModernObject1NObjects','change','0');assert.equal(m.NObjects[1],0);
  r.fire('ModernObject0ObjSidePos','change','-650');assert.equal(m.ObjSidePos[0],-650);
  r.fire('ModernAtmosphere','change','inverse-spherical');
  assert.equal(r.draws.at(-1).atmosphere,'inverse-spherical');
  assert.equal(r.nodes.get('ModernOcclusionWrap').hidden,false);
  assert.equal(r.nodes.get('ModernPreset').value,'custom');
  r.fire('ModernPreset','change','single');
  assert.deepEqual(Array.from(m.NObjects),[1,0]);
  assert.equal(m.showModel,1);
  assert.equal(m.Roll,0);
  assert.equal(r.nodes.get('ModernSceneTitle').textContent,'Single transmission tower · sample');
  assert.equal(r.nodes.get('ModernPreset').value,'single');
  r.fire('ModernObject0NObjects','change','3');
  r.fire('ModernResetPreset','click');
  assert.equal(m.NObjects[0],1);
  assert.equal(r.nodes.get('ModernPreset').value,'single');
  assert.equal(r.win.CurvatureModernApp130.getPreset(),'single');
  assert.equal(r.nodes.get('ModernStatus').classList!==undefined,true);
});

test('131 input debounce coalesces expensive optics and invalid entries never mutate model',()=>{
  const r=buildRuntime(),m=r.win.CurvatureModernApp130.getModel();
  r.fire('ModernHeight','input','24');
  r.fire('ModernHeight','input','25');
  r.fire('ModernHeight','input','26');
  assert.equal(r.draws.length,1,'typing cannot shoot rays immediately');
  r.drain();
  assert.equal(r.draws.length,2);
  assert.equal(m.Height,26);
  const previous=r.draws.length;
  r.fire('ModernHeight','change','');
  assert.equal(m.Height,26);
  assert.equal(r.draws.length,previous);
  assert.match(r.nodes.get('ModernStatus').textContent,/Invalid/);
  r.fire('ModernObject0ObjType','change','9');
  assert.equal(m.ObjType[0],3);
  assert.equal(r.draws.length,previous);
  r.fire('ModernHeight','change','30');
  assert.equal(m.Height,30);
  assert.equal(r.draws.length,previous+1);
});

test('131 sample presets produce physical scenes using the real shared renderer',()=>{
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
  const m=model();
  for(const id of ['single','rows']){
    adapter.applyPreset(m,id);m.Update();
    const output=renderer.renderPhysical(graph,m,{atmosphere:'standard',
      occlusionRadius:6371000,interactive:false});
    assert.equal(output.mode,'physical-scene');
    assert.ok(output.drawn>0,id+' draws visible physical geometry');
    assert.ok(Number.isFinite(output.drawn));
    assert.ok(Number.isFinite(output.unresolved));
  }
});
