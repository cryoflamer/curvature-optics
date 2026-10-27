const assert=require('node:assert/strict');
const {test}=require('node:test');
const p=require('../src/diagnostics/CurvatureDiagnosticPresets');
test('four deterministic presets do not mutate input',()=>{
 const model={geometryRadius:6371000,NObjects:[12,4],ObjType:[1,3],ObjSize:[64,50],ObjDist:[100,200],ObjDeltaDist:[20,30],ObjSidePos:[3,4]};
 const before=JSON.stringify(model),list=p.scenarios(model);
 assert.deepEqual(list.map(x=>x.id),['globe-near','globe-far','flat-near','flat-far']);
 assert.equal(JSON.stringify(model),before);
 list.forEach(x=>{assert.deepEqual(x.model.NObjects,[0,3]);assert.deepEqual(x.model.ObjType,[3,3]);assert.equal(x.objectIndex,1);assert.equal(x.model.diagnosticAlwaysShowLegacyTowers,true);assert.equal(x.model.showModel,x.globe?1:2);});
 list[0].model.NObjects[1]=99;assert.equal(list[1].model.NObjects[1],3);
});
test('eligible type-2 series are reported without changing model',()=>{
 assert.deepEqual(p.eligible({NObjects:[0,2],ObjType:[3,3]}),[1]);
 assert.deepEqual(p.eligible({NObjects:[2,3],ObjType:[3,3]}),[1]);
 assert.deepEqual(p.eligible({NObjects:[2,3],ObjType:[1,2]}),[]);
});
test('export wires preset images and explicitly labels missing legacy references',()=>{
 const fs=require('node:fs');const html=fs.readFileSync(__dirname+'/../CurvatureApp.html','utf8');
 assert.match(html,/CurvatureDiagnosticPresets\.js/);
 assert.match(html,/controlledPresets:controlledPresets/);
 assert.match(html,/referenceAvailable:false/);
 assert.match(html,/CurvatureControlledLegacyCapture\.capture/);
 assert.match(html,/controlled-.*-legacy\.png/);
 assert.match(html,/controlled-.*preset\.id/);
});
