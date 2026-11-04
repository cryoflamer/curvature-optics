'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');

// Execute the retained CPU failure exporter, not removed WebGPU success handlers.
// This checks browser-like Blob/URL behavior without claiming a real browser run.
const first=app.indexOf('  function downloadNumericAuditError(failure){');
const after=app.indexOf('  function bindCpuResearch(){',first);
assert.ok(first>=0&&after>first,'CPU error export functions must exist in ModernApp');
const exportHelpers=app.slice(first,after);
function harness(){
  const clicks=[],revoked=[],statuses=[],blobs=[];
  let failClick=false;
  class MockBlob{
    constructor(parts,options){this.parts=parts;this.type=options.type;blobs.push(this);}
  }
  const root={Blob:MockBlob,URL:{
    createObjectURL(){return 'blob:diagnostic-'+blobs.length;},
    revokeObjectURL(url){revoked.push(url);}
  },setTimeout(fn){fn();}};
  const document={createElement(tag){
    assert.equal(tag,'a');
    return {click(){if(failClick)throw Error('blocked download');
      clicks.push({href:this.href,filename:this.download});}};
  }};
  const functions=Function('root','document','probeStatus',
    exportHelpers+'\nreturn {downloadNumericAuditError,numericAuditFailed};')(
    root,document,message=>statuses.push(message));
  return {functions,root,clicks,revoked,statuses,blobs,blockClicks(value){failClick=value;}};
}

test('140.12.71: retained CPU diagnostic error exporter preserves stage/stack/details and filename',()=>{
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
  assert.deepEqual(h.clicks,[{href:'blob:diagnostic-1',
    filename:'curvature-compare-140.12.38-diagnostic-error.json'}]);
  assert.equal(h.blobs[0].type,'application/json');
  assert.deepEqual(h.revoked,['blob:diagnostic-1']);
  assert.deepEqual(h.statuses,[]);
});

test('140.12.71: errors from another active CPU audit use the same generic error naming',()=>{
  const h=harness();
  h.functions.numericAuditFailed('140.12.43','runCpuConformalBenchmark141243',Error('bad scene'));
  assert.equal(h.clicks[0].filename,'curvature-compare-140.12.43-diagnostic-error.json');
  assert.equal(JSON.parse(h.blobs[0].parts[0]).ok,false);
  assert.equal(h.revoked.length,1);
});

test('140.12.71: blocked or unsupported error exports do not claim success or suggest a nonexistent retry button',()=>{
  const h=harness();
  h.blockClicks(true);
  h.functions.numericAuditFailed('140.12.39','runCameraFirstObjects141239',Error('missing scene'));
  assert.equal(h.clicks.length,0);
  assert.deepEqual(h.revoked,['blob:diagnostic-1'],'object URL revoked on click failure');
  assert.match(h.statuses[0],/Diagnostic JSON download failed/);
  assert.doesNotMatch(h.statuses[0],/Export JSON to retry/);
  h.blockClicks(false);
  h.root.Blob=null;
  h.functions.numericAuditFailed('140.12.42','runCpuQuadratureBenchmark141242',Error('invalid input'));
  assert.equal(h.clicks.length,0);
  assert.equal(h.blobs.length,1);
  assert.match(h.statuses[1],/Diagnostic JSON download failed/);
  assert.equal(h.functions.downloadNumericAuditError(null),false);
});

test('140.12.71: retired Modern GPU success exporter is absent; CPU research remains opt-in',()=>{
  assert.doesNotMatch(app,/function numericAuditComplete\(/);
  assert.doesNotMatch(app,/var nameByVersion=/);
  assert.doesNotMatch(app,/async function runGpu(?:Precision|Root|Bouguer)/);
  assert.doesNotMatch(html,/\bsrc="[^"]*CurvatureGpuPrecisionAudit141222\.js/);
  assert.match(app,/function bindCpuResearch\(\)/);
  assert.match(app,/\['ModernCameraFirstOracleRun',runCameraFirstOracle141238\]/);
  assert.match(app,/\['ModernCpuQuadratureRun',runCpuQuadratureBenchmark141242\]/);
  assert.match(app,/numericAuditFailed\('140\.12\.38','runCameraFirstOracle141238',error,/);
  assert.doesNotMatch(html,/id="ModernGpuBouguerQuadratureRun"/);
  // ModernPerfExport remains a separate performance snapshot export, not a retry button.
  assert.match(html,/id="ModernPerfExport"/);
});
