'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');

// Exercise the actual ModernApp helpers in isolation, not an invented retired GPU handler.
// This is a browser-export contract test; it does not execute a browser or WebGPU.
const first=app.indexOf('  function downloadNumericAudit(report,failed){');
const after=app.indexOf('  function bindCpuResearch(){',first);
assert.ok(first>=0&&after>first,'numeric export functions must exist in ModernApp');
const exportHelpers=app.slice(first,after);
function harness(){
  const clicks=[],revoked=[],statuses=[],blobs=[];
  let failClick=false;
  class MockBlob{
    constructor(parts,options){this.parts=parts;this.type=options.type;blobs.push(this);}
  }
  const state={};
  const root={Blob:MockBlob,URL:{
    createObjectURL(){return 'blob:diagnostic-'+blobs.length;},
    revokeObjectURL(url){revoked.push(url);}
  },setTimeout(fn){fn();}};
  const document={createElement(tag){
    assert.equal(tag,'a');
    return {click(){if(failClick)throw Error('blocked download');
      clicks.push({href:this.href,filename:this.download});}};
  }};
  const functions=Function('root','document','state','probeStatus',
    exportHelpers+'\nreturn {downloadNumericAudit,numericAuditComplete,numericAuditFailed};')(
    root,document,state,message=>statuses.push(message));
  return {functions,root,state,clicks,revoked,statuses,blobs,blockClicks(value){failClick=value;}};
}

test('140.12.31.1: retained numeric export helper downloads a real JSON report with its historical filename',()=>{
  const h=harness(),report={version:'140.12.31',kind:'numerical-audit',ok:true,measurements:[1,2,3]};
  h.functions.numericAuditComplete(report);
  assert.equal(h.state.probeExportLast,report);
  assert.deepEqual(h.clicks,[{href:'blob:diagnostic-1',
    filename:'curvature-compare-140.12.31-bouguer-quadrature.json'}]);
  assert.equal(h.blobs.length,1);
  assert.equal(h.blobs[0].type,'application/json');
  assert.deepEqual(JSON.parse(h.blobs[0].parts[0]),report);
  assert.deepEqual(h.revoked,['blob:diagnostic-1']);
  assert.deepEqual(h.statuses,[]);
  assert.equal(h.functions.downloadNumericAudit({version:'140.12.42',ok:true},false),true);
  assert.equal(h.clicks[1].filename,'curvature-compare-140.12.42-diagnostic.json');
});

test('140.12.31.1: CPU diagnostic errors preserve stage/stack/details, never encode success',()=>{
  const h=harness(),error=new Error('CPU oracle failed');
  h.functions.numericAuditFailed('140.12.38','runCameraFirstOracle141238',error,{phase:'tracing'});
  const payload=JSON.parse(h.blobs[0].parts[0]);
  assert.equal(payload.version,'140.12.38');
  assert.equal(payload.kind,'numerical-audit-error');
  assert.equal(payload.ok,false);
  assert.equal(payload.stage,'runCameraFirstOracle141238');
  assert.equal(payload.message,'CPU oracle failed');
  assert.match(payload.stack,/CPU oracle failed/);
  assert.deepEqual(payload.details,{phase:'tracing'});
  assert.equal(h.state.probeExportLast.ok,false);
  assert.equal(h.clicks[0].filename,'curvature-compare-140.12.38-diagnostic-error.json');
  assert.deepEqual(h.revoked,['blob:diagnostic-1']);
});

test('140.12.31.1: blocked or unsupported JSON downloads remain failures, not fake exports',()=>{
  const h=harness();
  h.blockClicks(true);
  h.functions.numericAuditComplete({version:'140.12.31',ok:true});
  assert.equal(h.clicks.length,0);
  assert.equal(h.revoked.length,1,'the object URL is revoked on click failure');
  assert.match(h.statuses[0],/Automatic JSON download failed/);
  h.blockClicks(false);
  h.root.Blob=null;
  h.functions.numericAuditFailed('140.12.39','runCameraFirstObjects141239',Error('missing scene'));
  assert.equal(h.clicks.length,0);
  assert.equal(h.state.probeExportLast.ok,false);
  assert.match(h.statuses[1],/Diagnostic JSON download failed/);
});

test('140.12.31.1: retired GPU audits are not wired into Modern; CPU research remains opt-in',()=>{
  // The 140.12.22–31 WebGPU kernels and their research tests survive separately,
  // but ModernApp no longer defines the old GPU run functions or binds GPU buttons.
  assert.doesNotMatch(app,/async function runGpu(?:Precision|Root|Bouguer)/);
  assert.doesNotMatch(html,/\bsrc="[^"]*CurvatureGpuPrecisionAudit141222\.js/);
  assert.match(app,/function bindCpuResearch\(\)/);
  assert.match(app,/\['ModernCameraFirstOracleRun',runCameraFirstOracle141238\]/);
  assert.match(app,/\['ModernCpuQuadratureRun',runCpuQuadratureBenchmark141242\]/);
  assert.match(app,/numericAuditFailed\('140\.12\.38','runCameraFirstOracle141238',error,/);
  // No claim is made that a retired GPU export handler still runs or that the
  // legacy numeric helper is a user-visible manual retry control.
  assert.doesNotMatch(html,/id="ModernGpuBouguerQuadratureRun"/);
});
