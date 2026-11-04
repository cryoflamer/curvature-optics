'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('CurvatureModern.html');
const app=read('src/ui/modern/ModernApp.js');

test('140.12.74: Modern contains neither archived GPU optics nor CPU research UI',()=>{
  assert.doesNotMatch(html,/ModernCpuResearch|ModernConformalProductionToggle|CurvatureWebGPUBatch/);
  assert.doesNotMatch(app,/bindCpuResearch|probeGeneration|runGpu|runCpuConformalBenchmark/);
  assert.equal(fs.existsSync(path.join(__dirname,'..','tools/webgpu-optics.html')),false);
});

test('140.12.74: production A/B, GPU capabilities and WebGL2 geometry stay active',()=>{
  for(const id of ['ModernCompareViews','ModernGeometryBackend','ModernGpuCheck',
    'ModernPerfRecord'])assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(html,/CurvatureWebGLGeometryRenderer\.js/);
  assert.match(html,/ModernGpuCapabilities\.js/);
  assert.match(app,/CurvatureMainCanvasRenderer\.renderPhysical\(g,m,options\)/);
  assert.match(app,/function bindGpuDiagnostics\(/);
  assert.match(app,/function bindGeometryBackend\(/);
});

test('140.12.74: legacy saved GPU flags can still be loaded as ordinary A/B state',()=>{
  assert.match(app,/gpuProbe:false,probeTargets:256/);
  assert.match(app,/Older saved experiments may contain display\.gpuProbe=true/);
  assert.match(read('src/ui/modern/ModernExperimentState.js'),/gpuProbe/);
});
