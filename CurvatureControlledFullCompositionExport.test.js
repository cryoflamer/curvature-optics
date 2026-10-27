'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'CurvatureApp.html'),'latin1');
test('one export iterates the built-in Globe and Flat controlled presets',()=>{
 assert.match(html,/CurvatureDiagnosticPresets\.scenarios\(CurveApp\)\.forEach/);
 assert.match(html,/compositionScope:'full',width:cameraWidth,height:cameraHeight/);
 assert.match(html,/model:controlledModel,objectIndex:preset\.objectIndex,globe:preset\.globe/);
 assert.match(html,/legacyReference:\{width:cameraWidth,height:cameraHeight/);
 assert.match(html,/camera:referenceFrames\.fullCamera,rgba:snapshotPixels\(referenceFrames\.full\)/);
 assert.match(html,/controlled-['+]\+preset\.id\+['+]-full-composition/);
 assert.match(html,/entry\.fullComposition=\{available:true/);
});
test('controlled full-composition failures are reported without discarding other scenarios',()=>{
 assert.match(html,/catch\(fullPresetError\)\{entry\.fullComposition\.reason=String\(fullPresetError\);\}/);
 assert.match(html,/controlledPresets\.push\(entry\)/);
});
