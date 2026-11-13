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
  assert.match(app,/workerUrl:'src\/animation\/ModernAnimationFrameWorker\.js\?spline-export=1'/);
  assert.match(worker,/ModernCameraInterpolator\.js\?spline-core=1&spline-export=1/);
  assert.match(worker,/ModernAnimationProject\.js\?studio-hud-fix=1&spline-core=1&spline-export=1/);
  assert.match(html,/spline-preview=1&amp;spline-export=1/);
});
