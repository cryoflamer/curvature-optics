'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {extractAllDemoStates}=require('../tools/audit-legacy-modern-boundary');
const authored=extractAllDemoStates(fs.readFileSync(path.join(root,'src/animation/CurvatureDemos.js'),'latin1'))
  .find(d=>d.demo==='Chicago').states;
const geometry=require('../src/geometry/CurvatureGeometryEngine');
const adapter=require('../src/ui/modern/ModernSceneState');
const compare=require('../src/ui/modern/ModernCompareModel');
const compareState=require('../src/ui/modern/ModernCompareState');
const experiment=require('../src/ui/modern/ModernExperimentState');
const catalog=require('../src/ui/modern/ModernLocationCatalog');
const vec={Norm:a=>a.map(v=>v/Math.hypot(...a)),
  Mult:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  Scale:(a,n)=>a.map(x=>x*n),Add:(a,b)=>a.map((x,i)=>x+b[i]),
  ScalarProd:(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0)};
function model(){
  const ctx=vm.createContext({JsgVect3:vec});
  vm.runInContext(read('src/app/CurvatureModel.js'),ctx);
  return vm.runInContext('new CurveAppClass()',ctx);
}
function near(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}

// Compare against the *authored* DrawShape method, not a second transcription
// of the numbers. The stub records its primitives after the local plane mirror.
const drawing=read('src/legacy/CurvatureLegacyDrawing.js');
const start=drawing.indexOf('function DrawShape( objIx, g, m ) {');
const end=drawing.indexOf('\nfunction ',start+10);
assert.ok(start>=0&&end>start);
const context={document:{getElementById:()=>({checked:true})},window:{}};
vm.runInNewContext(drawing.slice(start,end)+'\nthis.drawShape=DrawShape;',context);
function legacyCity(drawn,hidden,bank){
  const out=[];let fill;
  const g={Plane:{XDir:[1,0,0]},SetBgColor:c=>{fill=c;},
    PolygonOnPlane(xs,ys,mode=1){out.push({type:'polygon',points:xs.map((x,i)=>
      [x*g.Plane.XDir[0],ys[i]]),mode,style:{fill}});},
    RectOnPlane(x1,y1,x2,y2,mode=1){this.PolygonOnPlane([x1,x2,x2,x1,x1],
      [y1,y1,y2,y2,y1],mode);},
    LineOnPlane(x1,y1,x2,y2){out.push({type:'line',points:
      [[x1*g.Plane.XDir[0],y1],[x2*g.Plane.XDir[0],y2]]});}};
  context.drawShape(bank,g,{ObjType:bank?[3,4]:[4,3],
    NObjectsDrawn:bank?[0,drawn]:[drawn,0],isHiddenObj:bank?[false,hidden]:[hidden,false]});
  return JSON.parse(JSON.stringify(out));
}

test('type-4 skyline reproduces all three authored palettes, both hidden palettes and the six-index mirror cycle',()=>{
  for(const bank of [0,1])for(const hidden of [false,true])for(let drawn=0;drawn<12;drawn++){
    const expected=legacyCity(drawn,hidden,bank);
    const actual=geometry.localObject(4,bank,hidden,{drawn});
    assert.deepEqual(actual,expected,`bank ${bank}, drawn ${drawn}, hidden ${hidden}`);
    assert.ok(actual.length>=10);
  }
  assert.throws(()=>geometry.localObject(4,0,false),/drawn sequence index/);
  assert.throws(()=>geometry.localObject(4,0,false,{drawn:-1}),/nonnegative/);
  assert.throws(()=>geometry.localObject(8,0,false,{drawn:0}),/not been independently ported/);
});

test('Chicago source camera remains a separate near-shore reference with authored state-0 fields',()=>{
  const m=model();const p=adapter.applyPreset(m,'chicago-near');m.Update();
  const original=authored[0];
  for(const field of ['Height','FocalLengthField','Pan','Nick','Roll'])
    near(m[field],original[field]);
  for(const field of ['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSidePos',
    'ObjSideVar','ObjSideType','ObjSize','ObjSizeVar','ObjSizeType'])
    assert.deepEqual(Array.from(m[field]),original[field],field);
  assert.equal(m.showModel,1);
  assert.equal(original.showModel,3);
  assert.equal(original.refractionCoeff,0);
  assert.equal(p.atmosphere,'vacuum');
  assert.equal(m.viewcenterHorizon,3);
  assert.equal(original.viewcenterHorizon,2);
  assert.equal(catalog.scenario('chicago-skyline').nativePresetId,'chicago');
  assert.equal(catalog.scenario('chicago-skyline').status,'partial');
  for(const globe of [true,false]){
    const entries=geometry.objectSequence(m,0,globe,{opticsNeutral:true,physicalSurface:true,curvature:globe?1/m.rEarth:0});
    assert.equal(entries.length,6);
    entries.forEach((entry,i)=>{
      assert.equal(entry.scene.metadata.objectType,4);
      assert.equal(entry.scene.metadata.drawn,i);
      near(entry.params.longitude*m.geometryRadius,4400-200*i);
      // Legacy's deterministic pseudo-random side variation is retained.
      const variation=(-30.5/m.geometryRadius/2)*
        ((186573.6498496*Math.sqrt(i)%2)-1);
      near(entry.params.latitude*m.geometryRadius,1040+variation*m.geometryRadius);
      // City width does not change with cosine height variation.
      assert.equal(entry.params.horizontalScale,1);
      assert.ok(entry.scene.primitives.some(p=>p.type==='polygon'&&p.mode===3));
    });
  }
});

test('Chicago default starts from the verified distant camera while keeping source shapes and a reversible near view',()=>{
  const m=model();const preset=adapter.applyPreset(m,'chicago');m.Update();
  assert.equal(preset.atmosphere,'standard');
  assert.match(m.DemoText,/distant-shore/);
  near(m.Height,2);near(m.CameraNorth,-60000);near(m.CameraEast,-2170.9508443);
  near(m.Pan,3.023361537686);near(m.Nick,-.16397488782);
  assert.ok(m.FocalLengthField>900&&m.FocalLengthField<950);
  assert.deepEqual(Array.from(m.ObjType),[4,3]);
  assert.deepEqual(Array.from(m.ObjDist),[3400,0]);
  const remote=experiment.capture(m,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'chicago',resetPreset:'chicago'},compareState.preset('globe-flat-vacuum'),
    {mode:'scene',selected:'A',eyeLevel:false,horizon:true});
  assert.deepEqual(experiment.decode(experiment.encode(remote)),remote);
  const nearPreset=adapter.applyPreset(m,'chicago-near');m.Update();
  assert.equal(nearPreset.atmosphere,'vacuum');
  near(m.CameraEast,0);near(m.CameraNorth,0);near(m.FocalLengthField,34);
  const original=authored[0];
  for(const field of ['Height','Pan','Nick','FocalLengthField'])near(m[field],original[field]);
  const nearSnapshot=experiment.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'chicago-near',resetPreset:'chicago-near'},compareState.preset('globe-flat-vacuum'),
    {mode:'scene',selected:'A',eyeLevel:false,horizon:true});
  assert.equal(nearSnapshot.scene.preset,'chicago-near');
  assert.deepEqual(experiment.validate(nearSnapshot),nearSnapshot);
  assert.deepEqual(experiment.decode(experiment.encode(nearSnapshot)),nearSnapshot);
  adapter.applyPreset(m,'chicago');m.Update();
  near(m.CameraNorth,-60000);
});

test('Chicago stays independently renderable by Scene/Compare A/B and preserves schema-v1 URL/JSON/history payloads',()=>{
  const m=model();adapter.applyPreset(m,'chicago');m.Update();
  const pair=compare.pair(m);
  assert.ok(compare.invariant(pair));
  assert.equal(pair.A.showModel,1);assert.equal(pair.B.showModel,2);
  for(const [side,globe] of [['A',true],['B',false]]){
    assert.deepEqual(Array.from(pair[side].ObjType),[4,3]);
    const scenes=geometry.createObjectSequenceScene(pair[side],0,globe,{opticsNeutral:true,
      physicalSurface:true,curvature:globe?1/m.rEarth:0});
    assert.ok(scenes.primitives.length>50,side+' needs city geometry');
    assert.equal(scenes.metadata.objectCount,6);
    assert.ok(scenes.primitives.every(p=>p.points.every(v=>v.every(Number.isFinite))));
  }
  const settings=compareState.preset('globe-flat-vacuum');
  const input=experiment.capture(m,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'chicago',resetPreset:'chicago'},settings,
    {mode:'compare',selected:'A',eyeLevel:false,horizon:true});
  assert.equal(input.scene.preset,'chicago');
  assert.deepEqual(experiment.decode(experiment.encode(input)),input);
  const url=experiment.urlWithExperiment('https://example.org/CurvatureModern.html',input);
  assert.deepEqual(experiment.readUrl(new URL(url).search),input);
  assert.deepEqual(experiment.validate(input),input,'same validated payload is usable in History');
  const old=model();adapter.applyPreset(old,'pontchartrain');old.Update();
  adapter.applyPreset(old,'chicago');adapter.applyPreset(old,'pontchartrain');
  assert.deepEqual(Array.from(old.ObjType),[3,3]);
  assert.deepEqual(Array.from(old.ObjSideVar),[0,0]);
  assert.deepEqual(Array.from(old.ObjSizeVar),[0,0]);
});
