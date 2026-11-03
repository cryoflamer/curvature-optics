'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const browser = require('../src/diagnostics/LegacyBrowserReferenceExport');
const zip = require('../src/diagnostics/GeometryDiagnosticsZip');
const root = path.resolve(__dirname, '..');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/legacy-reference-scenarios.json')));

test('browser exporter is connected to the Legacy page and reuses existing ZIP library', () => {
  const html = fs.readFileSync(path.join(root, 'CurvatureApp.html'), 'utf8');
  assert.match(html, /id="LegacyReferenceCurrentButton"/);
  assert.match(html, /id="LegacyReferenceAllButton"/);
  assert.match(html, /src="src\/diagnostics\/GeometryDiagnosticsZip.js"/);
  assert.match(html, /src="src\/diagnostics\/LegacyBrowserReferenceExport.js"/);
  assert.match(html, /LegacyBrowserReferenceExport\.install\(window\)/);
  assert.ok(html.indexOf('CurvatureAppRuntime.js') < html.indexOf('LegacyBrowserReferenceExport.js'));
});
test('all fixture selections preserve zero-based indices and one-based links', () => {
  const samples = browser.samplePlan(fixture);
  assert.deepEqual(samples.map(s => [s.demo, s.sourceIndex]), [
    ['TransLine',0],['TransLine',4],['TransLine',7],
    ['Bedford',0],['Bedford',3],['Bedford',6]
  ]);
  assert.deepEqual(samples.map(s => s.sourceQueryHint), [
    '?demo=TransLine&pos=1','?demo=TransLine&pos=5','?demo=TransLine&pos=8',
    '?demo=Bedford&pos=1','?demo=Bedford&pos=4','?demo=Bedford&pos=7'
  ]);
  assert.throws(() => browser.samplePlan({...fixture, schemaVersion:2}), /schema/);
  const bad = structuredClone(fixture);
  bad.scenarios[0].samples[1].legacyQuery = '?demo=TransLine&pos=4';
  assert.throws(() => browser.samplePlan(bad), /mismatch/);
});
test('applied field validation is strict for camera and geometry, reports model-derived atmospheric fields', () => {
  const state = {Height:15, Pan:-10, ObjType:[3,3], refractionSync:2};
  const actual = {...state, refractionSync:1};
  assert.deepEqual(browser.effectiveFields(actual,state).recomputedInputFields, ['refractionSync']);
  assert.throws(() => browser.effectiveFields({...actual, Height:16},state), /did not apply Height/);
  assert.throws(() => browser.effectiveFields({...actual, ObjType:[3,4]},state), /ObjType/);
  assert.throws(() => browser.effectiveFields({...actual, Pan:undefined},state), /Missing applied field Pan/);
});
test('blank/uniform canvases are rejected; nonuniform original Canvas passes', () => {
  const pixels = new Uint8ClampedArray(40*40*4).fill(255);
  const canvas = {id:'JsGraph1-Canvas',isConnected:true,width:40,height:40,
    getContext:()=>({getImageData:()=>({data:pixels})}),
    getBoundingClientRect:()=>({width:40,height:40})};
  assert.throws(() => browser.inspectCanvas(canvas), /uniform/);
  pixels[0]=0;
  const info = browser.inspectCanvas(canvas);
  assert.equal(info.sampleDistinctColors,2);
  assert.equal(info.opaqueSamples,1600);
  canvas.id='other';
  assert.throws(() => browser.inspectCanvas(canvas), /Original Legacy Canvas/);
});
test('capture does real redraw, rejects wrong mode, and emits PNG bytes and verifiable hashes', async () => {
  const pixels = new Uint8ClampedArray(32*32*4).fill(255);
  pixels[0]=30;
  let redrawCount=0, playing=false, engine='legacy';
  const canvas = {id:'JsGraph1-Canvas',isConnected:true,width:32,height:32,
    getContext:()=>({getImageData:()=>({data:pixels})}),
    getBoundingClientRect:()=>({width:32,height:32}),
    toBlob(callback) {callback(new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])],{type:'image/png'}));}};
  const win={CurveApp:{Height:15, rEarth:6371000, Pan:0, Nick:0, refractionCoeff:0.17},
    graph:{Canvas:canvas,Redraw(){redrawCount++;}},
    Demos:{CurrDemo:{Name:'TransLine'}, GetCurrPos:()=>4,IsPlaying:()=>playing},
    document:{getElementById(id){return {value:id==='MainCanvasRenderer'?engine:'original'};},fonts:{ready:Promise.resolve()}},
    requestAnimationFrame(callback){callback();},crypto:webcrypto,
    navigator:{userAgent:'Test Browser'}, devicePixelRatio:1};
  const result=await browser.capture(win,{demo:'TransLine',sourceIndex:4});
  assert.equal(redrawCount,1);
  assert.equal(result.pngBytes.length,8);
  assert.match(result.record.canvas.pngSha256,/^[a-f0-9]{64}$/);
  assert.match(result.record.canvas.pixelSha256,/^[a-f0-9]{64}$/);
  assert.equal(result.record.demo,'TransLine');
  playing=true;
  await assert.rejects(browser.capture(win,{}), /Stop the demo animation/);
  playing=false; engine='physical';
  await assert.rejects(browser.capture(win,{}), /Select Legacy canvas/);
});
test('single and complete archives use existing ZIP builder and manifest, never a fake full-page screenshot', async () => {
  const result={pngBytes:Uint8Array.from([137,80,78,71]),record:{demo:'Bedford',sourceIndex:6,
    canvas:{pngSha256:'f'.repeat(64)}}};
  const fakeWin={GeometryDiagnosticsZip:zip};
  const blob=await browser.zipEntries(fakeWin,[result],'a'.repeat(64));
  const bytes=new Uint8Array(await blob.arrayBuffer());
  const content=new TextDecoder().decode(bytes);
  assert.ok(content.includes('manifest.json'));
  assert.ok(content.includes('bedford-state-6.canvas.png'));
  assert.ok(content.includes('"sampleCount": 1'));
  assert.ok(content.includes('"fixtureSha256": "'+'a'.repeat(64)+'"'));
  assert.ok(!content.includes('page.png'));
  await assert.rejects(browser.zipEntries(fakeWin,[result,result],null), /Duplicate/);
});
