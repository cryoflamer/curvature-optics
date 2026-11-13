'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const families=['Curve','Causeway','TransLine','Grace','Chicago','Canigou','Bedford','Tensas','Soundly'];
const origin='http://localhost:8000';

function demoManager(){
  return {DemoList:families.map(Name=>({Name})),CurrDemo:null,position:0,playing:false,stops:0,
    Find(name){return this.DemoList.findIndex(d=>d.Name===name);},
    GetCurrPos(){return this.position;},GetNStates(){return this.CurrDemo.Name==='TransLine'?8:6;},
    IsPlaying(){return this.playing;},UpdateDemoPanels(){},
    SetDemo(name,play,pos){this.Stop();this.CurrDemo=this.DemoList[this.Find(name)];this.position=pos;this.playing=play;this.UpdateDemoPanels();},
    Stop(){this.stops++;this.playing=false;this.UpdateDemoPanels();},
    Play(){this.playing=true;this.UpdateDemoPanels();},
    Next(){this.position=Math.min(this.GetNStates()-1,this.position+1);this.UpdateDemoPanels();},
    Prev(){this.position=Math.max(0,this.position-1);this.UpdateDemoPanels();}};
}
function host(direct){
  const messages=[],listeners={},tasks=[];
  const parent={postMessage(message){messages.push(message);}};
  const demos=demoManager();
  const documentElement={classList:{add(){}},hasAttribute(name){return direct&&name==='data-direct-demos-host';}};
  const window={parent,location:{origin,search:'?embed=demos'},Demos:demos,
    document:{documentElement},graph:{Redraw(){}},
    addEventListener(type,handler){listeners[type]=handler;},setTimeout(fn){tasks.push(fn);}};
  vm.runInNewContext(read('src/ui/legacy/LegacyDemoEmbed.js'),{window,URLSearchParams});
  const start=()=>{listeners.load();while(tasks.length)tasks.shift()();};
  return {window,demos,messages,listeners,start};
}
function modern(){
  const elements=new Map(),listeners={},out=[];
  function elem(){return {value:'',disabled:false,textContent:'',listeners:{},children:[],
    addEventListener(type,handler){this.listeners[type]=handler;},
    appendChild(child){this.children.push(child);},
    removeChild(child){this.children.splice(this.children.indexOf(child),1);},
    get firstChild(){return this.children[0]||null;}};}
  for(const id of ['ModernDemoFrame','ModernDemoStatus','ModernDemoProgress','ModernDemoSelect',
    'ModernDemoTitle','ModernDemoPlay','ModernDemoPrev','ModernDemoNext','ModernDemoReset'])elements.set(id,elem());
  const frame=elements.get('ModernDemoFrame');
  frame.contentWindow={postMessage(message){out.push(message);}};
  const window={location:{origin},document:{getElementById:id=>elements.get(id),createElement:elem},
    addEventListener(type,fn){listeners[type]=fn;}};
  vm.runInNewContext(read('src/ui/modern/ModernDemos.js'),{window});
  window.CurvatureModernDemos.init();
  const get=id=>elements.get(id);
  return {window,frame,listeners,get,out,api:window.CurvatureModernDemos,
    attach(hostWindow){frame.contentWindow=hostWindow;frame.listeners.load();}};
}

test('direct host publishes catalog and state to late subscribers without parent messaging',()=>{
  const h=host(true);h.start();
  assert.equal(h.messages.length,0);
  assert.equal(h.listeners.message,undefined);
  const port=h.window.CurvatureLegacyDemosRuntime;
  const updates=[];const unsubscribe=port.subscribe(data=>updates.push({...data}));
  assert.deepEqual(updates[0].names,families);
  assert.equal(updates[1].demo,'TransLine');
  assert.equal(updates[1].position,0);
  assert.equal(port.command('play'),true);
  assert.equal(updates.at(-1).playing,true);
  assert.equal(port.command('select','Bedford'),true);
  assert.equal(updates.at(-1).demo,'Bedford');
  assert.equal(updates.at(-1).playing,false);
  const count=updates.length;unsubscribe();port.command('next');
  assert.equal(updates.length,count);
  h.listeners.pagehide();
  assert.equal(h.demos.playing,false);
  assert.throws(()=>port.subscribe(()=>{}),/active Demos observer/);
  assert.equal(port.command('play'),false);
});

test('host subscription works before engine load and one observer failure cannot stop animation',()=>{
  const h=host(true),port=h.window.CurvatureLegacyDemosRuntime,seen=[];
  port.subscribe(()=>{throw new Error('faulty presentation');});
  h.window.console={error(){}};
  port.subscribe(data=>seen.push(data.type));
  h.start();
  assert.deepEqual(seen.slice(0,2),['catalog','state']);
  port.command('next');
  assert.ok(seen.includes('state'));
  assert.equal(h.demos.position,1);
});

test('original embedded Legacy continues to use parent messaging and origin verification',()=>{
  const h=host(false);h.start();
  assert.equal(h.messages[0].type,'catalog');
  assert.equal(h.messages.at(-1).demo,'TransLine');
  h.listeners.message({source:h.window.parent,origin:'https://other.example',
    data:{protocol:'curvature-demos-v1',type:'command',command:'next'}});
  assert.equal(h.demos.position,0);
  h.listeners.message({source:h.window.parent,origin,
    data:{protocol:'curvature-demos-v1',type:'command',command:'next'}});
  assert.equal(h.demos.position,1);
});

test('Modern uses direct commands and transitions across all nine original demonstrations',()=>{
  const h=modern(),legacy=host(true);h.api.activate();
  h.attach(legacy.window);
  legacy.start();
  assert.equal(h.get('ModernDemoSelect').disabled,false);
  assert.deepEqual(h.get('ModernDemoSelect').children.map(e=>e.value),families);
  for(const name of families){
    const picker=h.get('ModernDemoSelect');picker.value=name;picker.listeners.change();
    assert.equal(legacy.demos.CurrDemo.Name,name);
    h.get('ModernDemoPlay').listeners.click();
    assert.equal(legacy.demos.playing,true);
    h.get('ModernDemoNext').listeners.click();
    assert.equal(legacy.demos.position,1);
  }
  h.api.deactivate();
  assert.equal(legacy.demos.playing,false);
  assert.equal(h.out.length,0,'no postMessage calls on the direct-port path');
});

test('Modern reconnects to an already-started host using replayed catalog and state',()=>{
  const h=modern(),legacy=host(true);h.api.activate();
  legacy.start();
  legacy.window.CurvatureLegacyDemosRuntime.command('select','TransLine');
  legacy.window.CurvatureLegacyDemosRuntime.command('next');
  h.attach(legacy.window);
  assert.equal(h.get('ModernDemoSelect').disabled,false);
  assert.equal(h.get('ModernDemoProgress').textContent,'Step 2 / 8');
  assert.equal(h.get('ModernDemoPlay').disabled,false);
  assert.equal(h.out.length,0);
});

test('reloaded hosts unsubscribe prior observers and do not accept stale state',()=>{
  const h=modern(),first=host(true);h.api.activate();h.attach(first.window);first.start();
  let picker=h.get('ModernDemoSelect');picker.value='Canigou';picker.listeners.change();
  assert.equal(h.get('ModernDemoTitle').textContent,'Demos · Canigou');
  const second=host(true);h.attach(second.window);
  assert.equal(h.get('ModernDemoPlay').disabled,true);
  assert.equal(picker.disabled,true);
  first.window.CurvatureLegacyDemosRuntime.command('next');
  assert.equal(h.get('ModernDemoPlay').disabled,true,'stale callbacks ignored');
  second.start();
  assert.equal(h.get('ModernDemoPlay').disabled,false);
  assert.equal(h.get('ModernDemoTitle').textContent,'Demos · Transmission Line');
  assert.equal(picker.value,'TransLine');
  assert.equal(h.out.length,0);
});

test('cross-origin direct access fails safely and postMessage fallback is unchanged',()=>{
  const h=modern();h.api.activate();
  const messages=[];
  h.frame.contentWindow={get CurvatureLegacyDemosRuntime(){throw new Error('SecurityError');},
    postMessage(message){messages.push(message);}};
  h.frame.listeners.load();
  assert.equal(h.get('ModernDemoPlay').disabled,true);
  h.listeners.message({source:h.frame.contentWindow,origin,
    data:{protocol:'curvature-demos-v1',type:'state',demo:'TransLine',position:0,total:8,playing:false}});
  assert.equal(h.get('ModernDemoPlay').disabled,false);
  h.get('ModernDemoPlay').listeners.click();
  assert.equal(messages.at(-1).command,'play');
});

test('Modern and dedicated-host markup both select stable named JavaScript boundaries',()=>{
  const html=read('CurvatureDemosHost.html'),modernHtml=read('CurvatureModern.html');
  assert.match(html,/<html[^>]+data-direct-demos-host/);
  assert.match(html,/src="src\/ui\/legacy\/LegacyDemoEmbed\.js\?v=direct-host"/);
  assert.match(modernHtml,/src="src\/ui\/modern\/ModernDemos\.js\?v=direct-host&amp;status-messages=2"/);
  assert.doesNotMatch(html,/<(?:iframe|script)[^>]+CurvatureApp\.html/);
  assert.match(read('src/ui/modern/ModernDemos.js'),/CurvatureLegacyDemosRuntime/);
});
