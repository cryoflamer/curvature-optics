'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('CurvatureModern.html');
const app=read('src/ui/modern/ModernApp.js');

test('#140.12.53: Modern Compare no longer exposes or preloads WebGPU optical shooting',()=>{
  assert.doesNotMatch(html,/ModernGpuCompareProbe|ModernGpuProbeRun|value="gpu-probe"/);
  assert.doesNotMatch(html,/src="src\/diagnostics\/CurvatureWebGPU/);
  assert.doesNotMatch(html,/CurvatureGpuDsRk4Shooting141241\.js/);
  assert.doesNotMatch(app,/bindCompareGpuProbe|function runCompareGpuFirst|function runCompareGpuField/);
  assert.doesNotMatch(app,/experimentalRayField=|compareGpuProbe/);
});

test('#140.12.53: CPU A/B, CPU research and separate WebGL2 remain wired',()=>{
  for(const id of ['ModernCompareViews','ModernCpuResearch','ModernCpuQuadratureRun',
    'ModernCpuAdaptiveConformalRun','ModernFusedProductionGate141249Run',
    'ModernCameraFirstOracleRun','ModernCameraFirstObjectsRun','ModernGeometryBackend'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(app,/function bindCpuResearch\(/);
  assert.match(app,/\['ModernFusedProductionGate141249Run',runFusedProductionGate141249\]/);
  assert.match(app,/var spec=state\.compareConfig&&state\.compareConfig\[side\]/);
  assert.match(app,/geometryBackend:state\.geometryBackend/);
  assert.match(html,/CurvatureWebGLGeometryRenderer\.js/);
});

test('#140.12.53: legacy saved GPU mode is accepted as ordinary CPU physical A/B',()=>{
  assert.match(app,/gpuProbe:false,probeTargets:256/);
  assert.match(app,/Older saved experiments may contain display\.gpuProbe=true/);
  assert.doesNotMatch(app,/state\.compareGpuProbe=data\.display\.gpuProbe/);
  assert.match(read('src/ui/modern/ModernExperimentState.js'),/gpuProbe/);
});
