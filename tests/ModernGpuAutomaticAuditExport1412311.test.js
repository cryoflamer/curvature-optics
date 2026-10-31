'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
test('140.12.31.1: numerical report triggers automatic download and keeps manual retry',()=>{
  assert.match(app,/function numericAuditComplete\(report\)/);
  assert.match(app,/state\.probeExportLast=report;/);
  assert.match(app,/downloadNumericAudit\(report,false\)/);
  assert.match(app,/if\(state\.probeExportLast\)/);
  assert.match(app,/downloadNumericAudit\(state\.probeExportLast,state\.probeExportLast\.ok===false\)/);
  assert.match(app,/curvature-compare-140\.12\.31-bouguer-quadrature\.json/);
});
test('140.12.31.1: error payload includes stage, message and stack, without a fake success result',()=>{
  assert.match(app,/kind:'numerical-audit-error',ok:false,stage:stage/);
  assert.match(app,/stack:error&&error\.stack/);
  assert.match(app,/numericAuditFailed\('140\.12\.31','runGpuBouguerQuadrature141231',error\)/);
  assert.match(app,/filename\.replace\(\/\\\.json\$\//);
});
test('140.12.31.1: completed numerical audits export directly; frame rendering is not auto-exported',()=>{
  const functions=['runGpuPrecisionAudit141222','runGpuRootAudit141223',
    'runGpuNumericalFloor141224','runGpuPrecisionLimit141225','runGpuGroundAudit141226',
    'runGpuBouguerAudit141227','runGpuPrecisionFoundation141228',
    'runGpuPrecisionGeometry141229','runGpuBouguerPrecision141230',
    'runGpuBouguerQuadrature141231'];
  for(const name of functions){
    const start=app.indexOf('async function '+name+'()');
    assert.ok(start>=0,name);
    const body=app.slice(start,app.indexOf('\n  }',start));
    assert.match(body,/numericAuditComplete\(report\)/,name);
    assert.match(body,/numericAuditFailed\(/,name);
  }
  const frameStart=app.indexOf('async function runCompare');
  assert.doesNotMatch(app.slice(frameStart,frameStart+1200),/numericAuditComplete/);
});
