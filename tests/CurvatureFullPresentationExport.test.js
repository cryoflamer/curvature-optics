'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../CurvatureApp.html'),'latin1');
test('presentation and region dependencies load before the full capture bridge',()=>{
 const names=['src/renderers/CurvatureCanvasProjection.js','src/renderers/CurvatureStrokePreview.js',
  'src/scene/CurvatureFullSceneDecorations.js','src/diagnostics/CurvatureRegionComparison.js','src/diagnostics/CurvatureCompositionCapture.js'];
 const locations=names.map(name=>html.indexOf('<script src="'+name+'"></script>'));
 assert(locations.every(n=>n>=0));
 assert(locations.every((n,i)=>i===0||n>locations[i-1]));
});
test('diagnostic JSON reports both unmasked and explicitly masked scores without relabeling them',()=>{
 assert.match(html,/foreground:controlledFull\.comparison\.foreground/);
 assert.match(html,/geometryForeground:controlledFull\.geometryForeground/);
 assert.match(html,/decorations:controlledFull\.decorations&&/);
 assert.match(html,/geometryForeground:fullCompositionResult\.geometryForeground/);
});
