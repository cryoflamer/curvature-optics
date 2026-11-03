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
    graph:{Canvas:canvas,DrawFunc(){},Redraw(){redrawCount++; this.DrawFunc();}},
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


test('fixture capture retries an initially blank frame without accepting empty PNG', async () => {
  let color=255, draws=0, selected=0, encodes=0;
  const pixels=new Uint8ClampedArray(32*32*4).fill(255);
  const canvas={id:'JsGraph1-Canvas',isConnected:true,width:32,height:32,
    getContext:()=>({getImageData:()=>{
      pixels[0]=color;
      return {data:new Uint8ClampedArray(pixels)};
    }}),
    getBoundingClientRect:()=>({width:32,height:32}),
    toBlob(callback){encodes++;callback(new Blob([Uint8Array.from([137,80,78,71])],{type:'image/png'}));}};
  const graph={Canvas:canvas,DrawFunc(){draws++;if(draws===2)color=10;},
    Redraw(){this.DrawFunc();},IsDrawing:()=>false,IsDrawPending:()=>false};
  const state={Height:15,Pan:0,Nick:0,ObjType:[3,3]};
  const win={CurveApp:{...state},graph,
    Demos:{Find:()=>0,SetDemo(demo,play,index){selected++;this.CurrDemo={Name:demo};this.index=index;},
      CurrDemo:null,GetCurrPos(){return this.index;},IsPlaying:()=>false},
    document:{getElementById(id){return {value:id==='MainCanvasRenderer'?'legacy':'original'};},fonts:{ready:Promise.resolve()}},
    requestAnimationFrame(callback){callback();},setTimeout(callback){callback();},crypto:webcrypto,
    navigator:{userAgent:'Test Browser'},devicePixelRatio:1};
  const attempts=[];
  const result=await browser.capture(win,{selectDemo:true,demo:'TransLine',sourceIndex:4,
    sourceState:state,maxRenderAttempts:3,onAttempt:(n)=>attempts.push(n)});
  assert.deepEqual(attempts,[1,2]);
  assert.equal(selected,1);
  assert.equal(draws,2);
  assert.equal(encodes,1);
  assert.equal(result.record.canvas.sampleDistinctColors,2);
  assert.equal(graph.DrawFunc.toString().includes('draws++'),true);
});

test('persistent blank frame refuses export with attempt and graph diagnostics', async () => {
  const pixels=new Uint8ClampedArray(32*32*4).fill(255);
  const canvas={id:'JsGraph1-Canvas',isConnected:true,width:32,height:32,
    getContext:()=>({getImageData:()=>({data:pixels})}),
    getBoundingClientRect:()=>({width:32,height:32})};
  let calls=0;
  const graph={Canvas:canvas,DrawFunc(){},Redraw(){calls++;this.DrawFunc();}};
  const win={graph,CurveApp:{Height:100},
    Demos:{IsPlaying:()=>false},
    document:{getElementById(id){return {value:id==='MainCanvasRenderer'?'legacy':'original'};},fonts:{ready:Promise.resolve()}},
    requestAnimationFrame(callback){callback();},setTimeout(callback){callback();},crypto:webcrypto};
  await assert.rejects(browser.capture(win,{maxRenderAttempts:3}),
    /Blank or uniform Legacy Canvas refused.*attempt 3\/3.*canvas=32x32/);
  assert.equal(calls,3);
});

test('swallowed GraphX3DX drawing exceptions are exposed and the DrawFunc hook is restored', async () => {
  const draw=()=>{throw new Error('broken geometry');};
  const graph={Canvas:{},DrawFunc:draw,Redraw(){try {this.DrawFunc();}catch (_err) {}}};
  const win={graph,CurveApp:{},Demos:{IsPlaying:()=>false},
    document:{getElementById(id){return {value:id==='MainCanvasRenderer'?'legacy':'original'};},fonts:{ready:Promise.resolve()}}};
  await assert.rejects(browser.capture(win,{}),/Legacy renderer threw: broken geometry/);
  assert.equal(graph.DrawFunc,draw);
});

test('capture detects Canvas changes during PNG encoding and retries', async () => {
  let mutation=0, encodes=0;
  const pixels=new Uint8ClampedArray(32*32*4).fill(255);pixels[0]=20;
  const canvas={id:'JsGraph1-Canvas',isConnected:true,width:32,height:32,
    getContext:()=>({getImageData:()=>{
      const data=new Uint8ClampedArray(pixels);
      data[0]=20+mutation;
      return {data};
    }}),getBoundingClientRect:()=>({width:32,height:32}),
    toBlob(callback){encodes++;if(encodes===1)mutation=1;
      callback(new Blob([Uint8Array.from([137,80,78,71])],{type:'image/png'}));}};
  const graph={Canvas:canvas,DrawFunc(){},Redraw(){this.DrawFunc();}};
  const win={graph,CurveApp:{},Demos:{IsPlaying:()=>false},
    document:{getElementById(id){return {value:id==='MainCanvasRenderer'?'legacy':'original'};},fonts:{ready:Promise.resolve()}},
    requestAnimationFrame(callback){callback();},setTimeout(callback){callback();},crypto:webcrypto,
    navigator:{userAgent:'Test Browser'}};
  const result=await browser.capture(win,{maxRenderAttempts:2});
  assert.equal(encodes,2);
  assert.equal(result.record.canvas.sampleDistinctColors,2);
});

test('temporary browser reference frames are visibly paintable and failures remove their preview', async () => {
  let removed=0, timer;
  const frameWin={xOnLoadFinished:true,document:{readyState:'complete',fonts:{ready:Promise.resolve()},
    getElementById(id){return {value:id==='MainCanvasRenderer'?'legacy':'original'};}},
    Demos:{DemoList:Array(9),CurrDemo:null,IsPlaying:()=>false,Find:()=>0,
      SetDemo(demo,play,index){this.CurrDemo={Name:demo};this.index=index;},
      GetCurrPos(){return this.index;}},CurveApp:{...fixture.scenarios[0].samples[0].state},
    graph:{Canvas:{id:'JsGraph1-Canvas',isConnected:true,width:32,height:32,
      getContext(){return {getImageData(){return {data:new Uint8ClampedArray(32*32*4).fill(255)};}};},
      getBoundingClientRect(){return {width:32,height:32};}},DrawFunc(){},Redraw(){this.DrawFunc();}},
    requestAnimationFrame(callback){callback();},setTimeout(callback){callback();},
    crypto:webcrypto,navigator:{userAgent:'Test Browser'}};
  const doc={readyState:'complete',createElement(name){
    if(name==='iframe')return {style:{},contentWindow:frameWin};
    return {style:{},appendChild(child){(this.children||(this.children=[])).push(child);},remove(){removed++;}};
  },body:{appendChild(preview){
    const frame=preview.children.find(x=>x.contentWindow);
    assert.match(frame.style.cssText,/transform:scale\(0\.25\)/);
    assert.doesNotMatch(frame.style.cssText,/opacity:0/);
    frame.onload();
  }}};
  const fakeWin={URL,location:{href:'http://localhost:8000/CurvatureApp.html'},document:doc,crypto:webcrypto,
    fetch:async()=>({ok:true,arrayBuffer:async()=>Buffer.from(JSON.stringify(fixture))}),
    setTimeout(callback,ms){timer=setTimeout(callback,ms);return timer;},clearTimeout(id){clearTimeout(id);}};
  await assert.rejects(browser.exportAll(fakeWin),/Capture 1\/6 TransLine state 0 FAILED.*Blank or uniform/);
  assert.equal(removed,1);
});

test('all six simulated browser captures publish one complete ZIP and clean every preview', async () => {
  let removed=0, downloads=0, builtZip, visiblePreviewCount=0;
  const pixels=new Uint8ClampedArray(32*32*4).fill(255);pixels[0]=10;
  const child={xOnLoadFinished:true,document:{readyState:'complete',fonts:{ready:Promise.resolve()},
      getElementById(id){return {value:id==='MainCanvasRenderer'?'legacy':'original'};}},
    Demos:{DemoList:Array(9),CurrDemo:null,IsPlaying:()=>false,Find:()=>0,
      SetDemo(demo,play,index){
        this.CurrDemo={Name:demo};this.index=index;
        const sample=fixture.scenarios.find(s=>s.demo===demo).samples.find(s=>s.sourceIndex===index);
        child.CurveApp=structuredClone(sample.state);
      },GetCurrPos(){return this.index;}},CurveApp:{},
    graph:{Canvas:{id:'JsGraph1-Canvas',isConnected:true,width:32,height:32,
      getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(pixels)})}),
      getBoundingClientRect:()=>({width:32,height:32}),
      toBlob(callback){callback(new Blob([Uint8Array.from([137,80,78,71,13,10,26,10])],{type:'image/png'}));}},
      DrawFunc(){},Redraw(){this.DrawFunc();},IsDrawing:()=>false,IsDrawPending:()=>false},
    requestAnimationFrame(callback){callback();},setTimeout(callback){callback();},
    crypto:webcrypto,navigator:{userAgent:'Simulated Opera'},devicePixelRatio:1};
  const doc={createElement(tag){
    if(tag==='iframe')return {style:{},contentWindow:child};
    if(tag==='a')return {click(){downloads++;},remove(){},href:'',download:''};
    return {style:{},appendChild(el){(this.children||(this.children=[])).push(el);},
      remove(){removed++;}};
  },body:{appendChild(el){
    if(el.children){visiblePreviewCount++;el.children.find(x=>x.contentWindow).onload();}
  }}};
  class FakeURL extends URL {
    static createObjectURL(blob){builtZip=blob;return 'blob:verified';}
    static revokeObjectURL(){}
  }
  const win={URL:FakeURL,location:{href:'http://localhost:8000/CurvatureApp.html'},
    document:doc,GeometryDiagnosticsZip:zip,crypto:webcrypto,
    fetch:async()=>({ok:true,arrayBuffer:async()=>Buffer.from(JSON.stringify(fixture))}),
    setTimeout(callback,ms){return ms>=60000?0:setTimeout(callback,ms);},clearTimeout(id){clearTimeout(id);}};
  const statuses=[];
  const count=await browser.exportAll(win,msg=>statuses.push(msg));
  assert.equal(count,6);
  assert.equal(visiblePreviewCount,6);
  assert.equal(removed,6);
  assert.equal(downloads,1);
  assert.ok(builtZip);
  const content=new TextDecoder().decode(await builtZip.arrayBuffer());
  for(const demo of ['transline','bedford'])for(const index of demo==='transline'?[0,4,7]:[0,3,6])
    assert.ok(content.includes(`${demo}-state-${index}.canvas.png`));
  assert.ok(content.includes('"sampleCount": 6'));
  assert.ok(content.includes('"complete": true'));
  assert.match(statuses.join(' / '),/Rendering 6\/6 Bedford state 6 \(attempt 1\/6\)/);
});
