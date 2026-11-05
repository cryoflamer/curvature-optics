'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/legacy/CurvatureLegacyDrawing.js'),'latin1');
const read=file=>fs.readFileSync(path.join(root,file),'latin1');

function excerpt(start,end){
  const from=source.indexOf(start),to=end?source.indexOf(end,from+start.length):source.length;
  assert.ok(from>=0&&to>from,`missing renderer boundary ${start}`);
  return source.slice(from,to);
}
function graph(){
  const calls=[];
  return {calls,SetAngleMeasure(){},SetViewport(){},SetGraphClipping(){},
    SetCameraClipping(){},SetWindowToCameraScreen(){},
    SetCamera(camera){calls.push(['camera',camera.SceneSize]);},SetCameraZoom(){}};
}

test('actual DrawModel selects explicit owner without reading global CurveApp',()=>{
  const calls=[];
  const realm=vm.createContext({window:{},
    DrawObjectsBehindHorizon(index,g,model){calls.push(['behind',index,model.owner]);},
    DrawObjectsBeforeHorizon(index,g,globe,model){calls.push(['before',index,globe,model.owner]);}});
  vm.runInContext(excerpt('function DrawModel( g ) {','\nfunction DrawObjectsBehindHorizon('),realm);
  const a={owner:'A',showModel:1,camSceneSize:30,camPos:[],camUp:[],camViewCenter:[]};
  const b={owner:'B',showModel:2,camSceneSize:60,camPos:[],camUp:[],camViewCenter:[]};
  const ga=graph(),gb=graph();
  realm.DrawModel(ga,{towerOnlyIndex:1},a);
  realm.DrawModel(gb,{towerOnlyIndex:1},b);
  assert.deepEqual(calls,[['behind',1,'A'],['before',1,true,'A'],['before',1,false,'B']]);
  assert.deepEqual(ga.calls,[['camera',30]]);
  assert.deepEqual(gb.calls,[['camera',60]]);
  // There deliberately is no global CurveApp in this realm: the explicit
  // model is sufficient for both independently targeted render commands.
  assert.equal('CurveApp' in realm,false);
});

test('unmodified DrawModel(g, options) continues to resolve legacy CurveApp',()=>{
  const calls=[];
  const model={owner:'global',showModel:1,camSceneSize:13,camPos:[],camUp:[],camViewCenter:[]};
  const realm=vm.createContext({window:{},CurveApp:model,
    DrawObjectsBehindHorizon(index,g,owner){calls.push(owner.owner);},
    DrawObjectsBeforeHorizon(index,g,globe,owner){calls.push(owner.owner);}});
  vm.runInContext(excerpt('function DrawModel( g ) {','\nfunction DrawObjectsBehindHorizon('),realm);
  const g=graph();realm.DrawModel(g,{towerOnlyIndex:1});
  assert.deepEqual(g.calls,[['camera',13]]);
  assert.deepEqual(calls,['global','global']);
});

function scene(owner,start){return {owner,geometryRadius:6371000,Height:7,
  NObjects:[3,0],ObjDist:[start,0],ObjDeltaDist:[100,0],ObjSidePos:[0,0],
  aObjDelta:[0,0],aObjFirst:[0,0],aObjLast:[0,0],aObjCurr:[0,0],
  MaxNObjectsToDraw:[0,0],NObjectsDrawn:[0,0],isHiddenObj:[false,false]};}

test('horizon object traversal mutates only the explicitly supplied scene',()=>{
  const calls=[];
  const realm=vm.createContext({
    DrawShapeVariants(index,g,model,globe){calls.push([model.owner,model.aObjCurr[index],globe]);}});
  vm.runInContext(excerpt('function DrawObjectsBehindHorizon(','\nfunction SetTrans('),realm);
  const graph={SetAlpha(){},SetAreaAttr(){},SaveTrans3D(){},RestoreTrans3D(){}};
  const a=scene('A',100),b=scene('B',1000);
  realm.DrawObjectsBeforeHorizon(0,graph,false,a);
  assert.equal(a.NObjectsDrawn[0],3);
  assert.equal(b.NObjectsDrawn[0],0);
  realm.DrawObjectsBeforeHorizon(0,graph,false,b);
  assert.equal(b.NObjectsDrawn[0],3);
  assert.deepEqual(calls.map(x=>x[0]),['A','A','A','B','B','B']);
  assert.ok(calls[0][1]<calls[3][1]);
  assert.equal('CurveApp' in realm,false);
});

test('globe and plane coordinates use the given model and preserve old implicit call',()=>{
  const realm=vm.createContext({Math});
  vm.runInContext(excerpt('function PointOnEarth('),realm);
  const a={geometryRadius:100,Height:4},b={geometryRadius:200,Height:30};
  assert.deepEqual(Array.from(realm.PointOnEarth(0,0,a)),[0,0,-4]);
  assert.deepEqual(Array.from(realm.PointOnEarth(0,0,b)),[0,0,-30]);
  assert.deepEqual(Array.from(realm.PointOnPlane(0,0,a)),[0,0,-4]);
  assert.deepEqual(Array.from(realm.PointOnPlane(0,0,b)),[0,0,-30]);
  realm.CurveApp=a;
  assert.deepEqual(Array.from(realm.PointOnEarth(0,0)),[0,0,-4]);
  assert.deepEqual(Array.from(realm.PointOnPlane(0,0)),[0,0,-4]);
});

test('production Legacy Canvas port passes its owning model through audit entrypoint',()=>{
  const runtime=read('src/app/CurvatureAppRuntime.js');
  const audit=read('src/diagnostics/CurvatureLegacyFrameCaptureController.js');
  assert.match(runtime,/drawLegacy: function\(g\)\{return DrawModelWithOptionalAudit\(g,legacyAppContext\.model\);\}/);
  assert.match(audit,/!window\.LegacySceneAudit\) return DrawModel\(g, undefined, renderingModel\);/);
  assert.match(audit,/return DrawModel\(graph, undefined, renderingModel\);/);
  assert.match(audit,/DrawModel\(graph, undefined, renderingModel\);/);
  assert.match(audit,/DrawModel\(graph,\{towerOnlyIndex:preset\.objectIndex\}\)/,
    'controlled diagnostic replay still uses its intentionally replaced global model');
});
