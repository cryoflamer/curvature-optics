'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../CurvatureApp.html'),'latin1');
test('composition dependencies are loaded before application execution',()=>{
 for(const name of ['CurvatureIndependentComposition','CurvatureCompositionComparison','CurvatureCompositionCapture']){
  assert.match(html,new RegExp('<script src="'+({CurvatureIndependentComposition:'src/scene/',CurvatureCompositionComparison:'src/diagnostics/',CurvatureCompositionCapture:'src/diagnostics/'}[name]+name)+'\\.js"></script>'));
  assert.ok(html.indexOf('<script src="'+name+'.js">')<html.indexOf('var CurveApp = new CurveAppClass()'));
 }
});
test('ZIP captures actual legacy frame and exports independent images and metrics',()=>{
 assert.match(html,/captureLegacy:function\(\)\{return \{canvas:captureEndPixels,camera:cameraSnapshot\};\}/);
 assert.match(html,/independentCompositionComparison:independentCompositionComparison/);
 for(const name of ['independent-composition.png','independent-foreground-diff.png','independent-edges-diff.png'])assert.ok(html.includes(name));
 assert.match(html,/supportedIndices.length!==1/);
 assert.match(html,/CurveApp.showModel!==1&&CurveApp.showModel!==2/);
 assert.match(html,/catch\(compositionError\)\{independentCompositionComparison.reason=compositionError.message;\}/);
});
