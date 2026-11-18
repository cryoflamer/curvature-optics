'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');

function modern(){
  const nodes=new Map(),downloads=[],urls=[],methods=[];
  function node(){return {disabled:false,hidden:false,textContent:'',value:'',style:{},dataset:{},children:[],handlers:{},
    addEventListener(type,fn){this.handlers[type]=fn;},
    appendChild(child){this.children.push(child);},removeChild(child){this.children.splice(this.children.indexOf(child),1);},
    get firstChild(){return this.children[0]||null;}};}
  for(const id of ['ModernDemoFrame','ModernDemoStatus','ModernDemoProgress','ModernDemoSelect',
    'ModernDemoTitle','ModernDemoPlay','ModernDemoPrev','ModernDemoNext','ModernDemoReset',
    'ModernDemoDrawFps','ModernDemoTelemetryStatus'])nodes.set(id,node());
  const frame=nodes.get('ModernDemoFrame');frame.src='about:blank';
  const eventHandlers={},docBody=node();
  const host={location:{origin:'http://localhost:8000'},document:{body:docBody,
    getElementById:id=>nodes.get(id)||null,createElement:type=>{
      const result=node();if(type==='a')result.click=()=>downloads.push({href:result.href,name:result.download});
      return result;
    }},addEventListener(type,fn){eventHandlers[type]=fn;},
    Blob:class {constructor(parts,opts){this.parts=parts;this.opts=opts;}},
    URL:{createObjectURL(blob){urls.push(blob);return 'blob:test';},revokeObjectURL(){}},
    setTimeout(fn){fn();}};
  host.window=host;
  vm.runInNewContext(read('src/ui/modern/ModernDemos.js'),{window:host});
  const api=host.CurvatureModernDemos;api.init();
  let observer=null;
  frame.contentWindow={CurvatureLegacyDemosRuntime:{
    performanceStatus(){return {attached:true};},
    subscribe(fn){observer=fn;
      fn({type:'catalog',names:['TransLine','Soundly']});
      fn({type:'state',demo:'TransLine',position:0,total:8,playing:false});
      return ()=>{observer=null;};},
    command(action){methods.push(action);return true;}
  }};
  return {api,frame,nodes,downloads,urls,methods,emit:(type,extra={})=>observer({type,...extra}),
    click:id=>nodes.get(id).handlers.click(),get:id=>nodes.get(id)};
}

test('Demos UI renders live draw rate independently of RAF cadence',()=>{
  const h=modern();h.api.activate();h.frame.handlers.load();
  assert.match(h.get('ModernDemoTelemetryStatus').textContent,/Connected/);
  h.emit('performance',{drawFps:46.666,drawCount:9,playing:true});
  assert.equal(h.get('ModernDemoDrawFps').textContent,'46.7');
});

function host(){
  const messages=[],handlers={},parent={postMessage(msg){messages.push(msg);}};
  const names=['TransLine','Soundly'];
  const demos={CurrDemo:null,DemoList:names.map(Name=>({Name})),playing:false,position:0,
    Find(name){return names.indexOf(name);},IsPlaying(){return this.playing;},
    GetCurrPos(){return this.position;},GetNStates(){return 8;},
    UpdateDemoPanels(){},SetDemo(name){this.CurrDemo=this.DemoList[this.Find(name)];this.playing=false;this.UpdateDemoPanels();},
    Play(){this.playing=true;this.UpdateDemoPanels();},Stop(){this.playing=false;this.UpdateDemoPanels();},
    Next(){},Prev(){}};
  const window={location:{search:'?embed=demos',origin:'http://localhost:8000'},parent,
    document:{documentElement:{hasAttribute:()=>true,classList:{add(){}}}},
    graph:{Redraw(){}},Demos:demos,
    addEventListener(type,fn){handlers[type]=fn;},setTimeout(fn){fn();}};
  window.window=window;
  vm.runInNewContext(read('src/ui/legacy/LegacyDemoEmbed.js'),{window,URLSearchParams});
  handlers.load();
  return {window,runtime:window.CurvatureLegacyDemosRuntime,demos,messages,handlers};
}

test('Host accepts live draw telemetry without changing playback state',()=>{
  const h=host(),events=[];
  h.runtime.subscribe(event=>events.push(event));
  const meter={reset(){},dispose(){}};
  assert.deepEqual(JSON.parse(JSON.stringify(h.runtime.performanceStatus())),{attached:false});
  assert.equal(h.runtime.attachPerformance(meter),true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.runtime.performanceStatus())),{attached:true});
  assert.equal(h.runtime.command('play'),true);
  assert.equal(h.demos.playing,true);
  h.runtime.publishPerformance({drawFps:45,drawCount:12,playing:true});
  assert.equal(events.at(-1).type,'performance');
  assert.equal(events.at(-1).drawFps,45);
  assert.equal(h.demos.playing,true);
  assert.equal(h.runtime.command('pause'),true);
  assert.equal(h.demos.playing,false);
});

test('Cached host missing FPS script is repaired inside iframe and does not change Modern script list',()=>{
  const h=modern();
  const runtime=h.frame.contentWindow.CurvatureLegacyDemosRuntime;
  let attached=false,script=null,appendCount=0;
  runtime.performanceStatus=()=>({attached});
  runtime.attachPerformance=()=>true;
  h.frame.contentWindow.document={
    head:{appendChild(node){appendCount++;script=node;}},
    createElement(){return {};}
  };
  h.api.activate();h.frame.handlers.load();
  assert.equal(appendCount,1);
  assert.match(script.src,/LegacyDemoPerformance\.js/);
  assert.match(h.get('ModernDemoTelemetryStatus').textContent,/Installing/);
  attached=true;script.onload();
  assert.equal(h.get('ModernDemoTelemetryStatus').dataset.state,'connected');
  h.emit('performance',{drawFps:45,drawCount:10,playing:true});
  assert.equal(h.get('ModernDemoDrawFps').textContent,'45.0');
  assert.equal(appendCount,1);
});

test('Outdated controller reports a telemetry error',()=>{
  const h=modern();
  const runtime=h.frame.contentWindow.CurvatureLegacyDemosRuntime;
  delete runtime.performanceStatus;
  h.api.activate();h.frame.handlers.load();
  assert.equal(h.get('ModernDemoTelemetryStatus').dataset.state,'error');
  assert.match(h.get('ModernDemoTelemetryStatus').textContent,/outdated/i);
});

test('Telemetry recovery load error is surfaced',()=>{
  const h=modern();
  const runtime=h.frame.contentWindow.CurvatureLegacyDemosRuntime;
  runtime.performanceStatus=()=>({attached:false});
  runtime.attachPerformance=()=>true;
  let script;
  h.frame.contentWindow.document={head:{appendChild(node){script=node;}},createElement(){return {};}};
  h.api.activate();h.frame.handlers.load();
  script.onerror();
  assert.equal(h.get('ModernDemoTelemetryStatus').dataset.state,'error');
  assert.match(h.get('ModernDemoTelemetryStatus').textContent,/failed to load/i);
});


test('Real host-bound meter publishes GraphX3DX draw measurements through the iframe runtime',()=>{
  const h=host();
  let now=100,serial=0,rendered=0;
  const intervals=new Map(),timeouts=new Map();
  h.window.graph={Canvas:{width:900,height:600,getBoundingClientRect:()=>({width:800,height:533})},
    DrawFunc(){rendered++;now+=3;},Draw(){this.DrawFunc();}};
  h.window.performance={now:()=>now};
  h.window.devicePixelRatio=1.25;
  h.window.navigator={userAgent:'Legacy integration test'};
  h.window.requestAnimationFrame=()=>++serial;
  h.window.cancelAnimationFrame=()=>{};
  h.window.setInterval=(fn)=>{const id=++serial;intervals.set(id,fn);return id;};
  h.window.clearInterval=id=>intervals.delete(id);
  h.window.setTimeout=(fn)=>{const id=++serial;timeouts.set(id,fn);return id;};
  h.window.clearTimeout=id=>timeouts.delete(id);
  const events=[];h.runtime.subscribe(event=>events.push(event));
  vm.runInNewContext(read('src/diagnostics/LegacyDemoPerformance.js'),{window:h.window});
  assert.equal(h.runtime.performanceStatus().attached,true);
  assert.ok(events.some(event=>event.type==='performance-status'&&event.state==='connected'));
  const installedDraw=h.window.graph.Draw;
  vm.runInNewContext(read('src/diagnostics/LegacyDemoPerformance.js'),{window:h.window});
  assert.equal(h.window.graph.Draw,installedDraw,'script reload must not double-wrap the graph');
  h.demos.SetDemo('Soundly');h.demos.Play();
  h.window.graph.Draw();now+=18;h.window.graph.Draw();
  intervals.values().next().value();
  const metrics=events.filter(event=>event.type==='performance').at(-1);
  assert.equal(rendered,2);
  assert.equal(metrics.drawCount,2);
  assert.ok(metrics.drawFps>0);
  assert.equal(h.demos.playing,true,'pre-existing playback remains active');
});
