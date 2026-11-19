'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function read(name){return fs.readFileSync(path.join(root,name),'utf8');}
test('Spline export refreshes browser Worker script and imported sampler cache keys',()=>{
  const app=read('src/ui/modern/ModernApp.js');
  const worker=read('src/animation/ModernAnimationFrameWorker.js');
  const html=read('CurvatureModern.html');
  assert.match(app,/ModernAnimationFrameWorker\.js\?compare-layout=1&spline-export=1/);
  assert.match(app,/workerUrl:'src\/animation\/ModernAnimationFrameWorker\.js\?spline-export=1&spline-parity=1&presentation-png=1&png-project-fields=1&png-stream=1&projection-fix=1&presentation-hud=1&adaptive-layout=1&topology=1&content-layout=1'/);
  assert.match(worker,/ModernCameraInterpolator\.js\?spline-core=1&spline-export=1/);
  assert.match(worker,/ModernAnimationProject\.js\?project-fields=reference-narrative-1/);
  assert.match(html,/spline-preview=1&amp;spline-export=1/);
  assert.match(html,/ModernAnimationProject\.js\?project-fields=reference-narrative-1/);
  assert.match(app,/ModernAnimationVideoEncoderWorker\.js\?semantic-export=2&spline-parity=1/);
});
