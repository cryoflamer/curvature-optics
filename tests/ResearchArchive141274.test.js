'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const modern=read('CurvatureModern.html');
const legacy=read('CurvatureApp.html');
const app=read('src/ui/modern/ModernApp.js');
const compare=read('src/ui/modern/ModernCompareModel.js');
const css=read('src/ui/modern/ModernApp.css');
const audit=require('../tools/audit-legacy-isolation');

const removedResearch=/Curvature(?:WebGPU|Gpu(?:Ds|Precision|HighPrecision|Ground|Numerical|Bouguer|Pixel|FullFrame|Algorithm|Root)|Cpu(?:Quadrature|Conformal|Adaptive)|CameraFirst|ConformalProfile)/;

test('140.12.74: only the two supported HTML applications are inventoried',()=>{
  const report=audit.buildReport();
  assert.deepEqual(Object.keys(report.entrypoints),['legacy','modern']);
  assert.equal(report.entrypoints.legacy.scriptTags,97);
  assert.ok(report.entrypoints.modern.scriptTags>40);
  for(const entry of Object.values(report.entrypoints)){
    for(const filename of entry.scripts)
      assert.ok(fs.statSync(path.join(root,filename)).isFile(),filename);
  }
  assert.equal(fs.existsSync(path.join(root,'tools/webgpu-optics.html')),false);
});

test('140.12.74: neither Modern CPU research UI nor retired WebGPU optical runtime remains',()=>{
  for(const src of [modern,app,css,compare]){
    assert.doesNotMatch(src,/ModernCpuResearch|ModernCpuQuadratureRun|ModernConformalProductionToggle/);
    assert.doesNotMatch(src,/conformalCompareB|bindCpuResearch|gpuFirstRayField/);
  }
  assert.doesNotMatch(modern,removedResearch);
  assert.doesNotMatch(app,/function runConformalFrameProfile141246|function runCameraFirstOracle141238/);
});

test('140.12.74: production CPU RK4, A/B Compare, WebGL2 and capability reporting are retained',()=>{
  for(const file of ['src/optics/OpticalRayTracer.js',
    'src/optics/OpticalTargetProjection.js','src/optics/OpticalSharedRayField.js',
    'src/optics/OpticalConformalPredictor.js',
    'src/optics/CurvaturePhysicalSceneOptics.js',
    'src/renderers/CurvatureWebGLGeometryRenderer.js',
    'src/ui/modern/ModernExperimentLibrary.js',
    'src/ui/modern/ModernGpuCapabilities.js'])
    assert.ok(fs.existsSync(path.join(root,file)),file);
  assert.match(app,/CurvatureMainCanvasRenderer\.renderPhysical\(g,m,options\)/);
  assert.match(compare,/return Object\.freeze\(\{pair:pair,clone:clone,invariant:invariant\}\)/);
  for(const id of ['ModernSceneTab','ModernCompareTab','ModernGpuCheck','ModernGeometryBackend',
    'ModernLibraryToggle','ModernLibrarySave','ModernCompareViews'])
    assert.ok(modern.includes('id="'+id+'"'),id);
  assert.match(legacy,/CurvatureDemos\.js/);
  assert.ok(fs.existsSync(path.join(root,'tests/fixtures/legacy-browser-references.zip')));
  assert.ok(fs.existsSync(path.join(root,'src/diagnostics/GeometryDiagnosticsZip.js')));
});

test('140.12.74: archived research modules are not present in the active source tree',()=>{
  const old=fs.readdirSync(path.join(root,'src/diagnostics')).filter(n=>
    /^(?:CurvatureWebGPU|CurvatureGpu|CurvatureCpu|CurvatureCameraFirst|CurvatureConformalProfile|CurvatureOpticalBatchContract)/.test(n));
  assert.deepEqual(old,[]);
  assert.ok(fs.existsSync(path.join(root,'src/diagnostics/LegacyBrowserReferenceExport.js')));
});

test('140.12.74: separate archive tag and recovery are documented before patch application',()=>{
  const doc=read('docs/research-archive.md');
  assert.match(doc,/optics-research-archive-2026-11/);
  assert.match(doc,/before.*applying this patch/i);
  assert.match(doc,/git worktree add/);
  assert.match(doc,/format-patch/);
});
