'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const compare132=require('../src/ui/modern/ModernCompareModel');
const compare133=require('../src/ui/modern/ModernCompareState');
const physicalCamera=require('../src/app/CurvaturePhysicalCamera');
const perspective=require('../src/renderers/CurvaturePerspectivePreview');
const code=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const R=6371000;

// This is the actual painter's perspective projection of a physical ray,
// evaluated without using ModernApp's screen-space guide arithmetic.
function physicalPixelY(model,angleDegrees,width,height){
  const camera=physicalCamera.create(model);
  const az=model.Pan*Math.PI/180,el=angleDegrees*Math.PI/180;
  const range=1000;
  const world=[range*Math.sin(az)*Math.cos(el),
    range*Math.cos(az)*Math.cos(el),range*Math.sin(el)];
  const projected=perspective.project({primitives:[{type:'line',points:[world,world]}]},
    {pos:camera.pos,center:camera.center,up:camera.up,
      sceneSize:camera.sceneSize,screenSize:camera.sceneSize,
      objectZExtend:0,zoom:1},width,height);
  assert.equal(projected.segments.length,1,'reference physical ray is within the viewport');
  return projected.segments[0].points[0][1];
}

function compareFixture(nick,angleDegrees){
  const names=['ModernStatus','ModernCurvatureLabel','ModernViewInfo','ModernModePill',
    'ModernOcclusionWrap','ModernSceneTab','ModernCompareTab','ModernCompareMessage',
    'ModernGraphHost','ModernCompareViews','ModernBackToScene','ModernHeight','ModernFocal',
    'ModernPan','ModernNick','ModernOcclusion','ModernCameraAim','ModernAtmosphere',
    'ModernGrid','ModernCurvature','ModernEarth','ModernRender','ModernRoll','ModernViewAngle',
    'ModernRadiusKm','ModernFlat','ModernPreset','ModernResetPreset','ModernObjectFields0',
    'ModernObjectFields1','ModernSceneTitle','ModernSceneDescription','ModernCompareLabelA',
    'ModernCompareLabelB','ModernCompareStatusA','ModernCompareStatusB',
    'ModernSceneSettings','ModernCompareSettings','ModernPairPreset','ModernModelTabA',
    'ModernModelTabB','ModernModelSurface','ModernModelRadius','ModernModelAtmosphere',
    'ModernModelOcclusionWrap','ModernModelOcclusion','ModernRecalculateCompare',
    'ModernCompareEyeLevel','ModernCompareHorizon','ModernHorizonStatusA','ModernHorizonStatusB'];
  const nodes=new Map(names.map(id=>[id,{id,value:'',checked:true,hidden:false,
    textContent:'',classList:{toggle(){}},listeners:{},
    addEventListener(event,callback){this.listeners[event]=callback;},
    setAttribute(){},closest(){return {hidden:false};}}]));
  const labels=[],lines=[],calls=[];
  let start=null,end=null;
  const ctx={save(){},restore(){},setTransform(){},setLineDash(){},beginPath(){},
    moveTo(x,y){start={x,y};},lineTo(x,y){end={x,y};},
    stroke(){lines.push({start,end});},fillText(t){labels.push(t);}};
  const canvas={width:600,height:400,getContext(){return ctx;}};
  function FakeModel(){Object.assign(this,{Height:15,FocalLengthField:2000,Pan:.0464,
    Nick:nick,Roll:0,showModel:1,rEarth:R,rFEarth:R,viewcenterHorizon:3,
    deviceRatio:1.5,camViewAngle:.02,showGrid:1,
    ObjType:[3,3],NObjects:[3,2],ObjDist:[1200,3000],ObjDeltaDist:[380,500],
    ObjSideType:[0,0],ObjSidePos:[30,40],ObjSideVar:[0,0],
    ObjSizeType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0]});}
  FakeModel.prototype.Update=function(){};
  const browser={CurveAppClass:FakeModel,CurvatureModernSceneState:null,
    CurvatureModernCompareModel:compare132,CurvatureModernCompareState:compare133,
    CurvatureRayHorizon:{diagnose(){return {status:'resolved',angleDegrees,
      dipDegrees:-angleDegrees,tangentDistance:14000,
      bracketDegrees:[angleDegrees-1e-5,angleDegrees+1e-5]};}},
    CurvaturePhysicalCamera:physicalCamera,
    CurvaturePhysicalSceneOptics:{create(){return {};}},
    CurvatureMainCanvasRenderer:{renderPhysical(){return {drawn:10,fillTriangles:10,unresolved:0};}},
    CurvaturePhysicalCurvature:{modelStep(){return 164;},label(){return 'Earth';}},
    NewGraphX3D(params){return {Redraw(){params.DrawFunc({id:'scene'});}};},
    xOnLoad(fn){calls.push(fn);},console:{error(e){throw e;}}};
  const context={window:browser,document:{getElementById(id){
    assert.ok(nodes.has(id),'missing '+id);return nodes.get(id);
  }},requestAnimationFrame(fn){fn();return 1;},cancelAnimationFrame(){},
    setTimeout(fn){fn();return 1;},clearTimeout(){},console};
  browser.window=browser;
  vm.runInNewContext(code,context);
  const app=browser.CurvatureModernApp;
  for(const side of ['A','B'])app.registerCompareGraph(side,{
    Canvas:canvas,UpdateCanvasSize(){},Redraw(){app.drawCompare(side,{Canvas:canvas});}});
  calls[0]();
  nodes.get('ModernCompareTab').listeners.click();
  // Eye-level is opt-in; redraw A with both guides on.
  nodes.get('ModernCompareEyeLevel').checked=true;
  nodes.get('ModernCompareEyeLevel').listeners.change();
  labels.length=0;lines.length=0;
  const m=app.getCompareModels().A;
  app.drawCompare('A',{Canvas:canvas});
  assert.ok(labels.some(t=>t.includes('Eye level')));
  assert.ok(labels.some(t=>t.includes('Traced horizon')));
  assert.equal(lines.length,2);
  return {model:m,eyeY:lines[0].start.y,horizonY:lines[1].start.y,
    width:canvas.width,height:canvas.height};
}

test('133.2.1: traced negative elevation is below eye-level and agrees with physical painter',()=>{
  for(const nick of [0,.0121,-.05]){
    const view=compareFixture(nick,-.1243);
    assert.ok(view.horizonY>view.eyeY,`negative angle must be below eye-level (Nick ${nick})`);
    for(const [angle,y] of [[0,view.eyeY],[-.1243,view.horizonY]]){
      const reference=physicalPixelY(view.model,angle,view.width,view.height);
      assert.ok(Math.abs(y-reference)<1e-7,
        `Nick ${nick}, angle ${angle}: overlay y ${y}, physical y ${reference}`);
    }
  }
});

test('133.2.1: positive elevations project above eye-level in same camera/FOV',()=>{
  const view=compareFixture(.0121,.08);
  assert.ok(view.horizonY<view.eyeY);
  assert.ok(Math.abs(view.horizonY-physicalPixelY(view.model,.08,view.width,view.height))<1e-7);
});
