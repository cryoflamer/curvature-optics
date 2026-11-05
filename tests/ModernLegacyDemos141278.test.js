'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const families=['Curve','Causeway','TransLine','Grace','Bedford','Tensas','Soundly','Chicago','Canigou'];
const protocol='curvature-demos-v1';
const origin='http://localhost:8000';

function modern(){
  const elements=new Map(),listeners={},out=[];
  function elem(){return {disabled:false,textContent:'',value:'',listeners:{},children:[],
    addEventListener(type,handler){this.listeners[type]=handler;},
    appendChild(child){this.children.push(child);},
    removeChild(child){this.children.splice(this.children.indexOf(child),1);},
    get firstChild(){return this.children[0]||null;}};}
  ['ModernDemoFrame','ModernDemoStatus','ModernDemoProgress','ModernDemoSelect',
    'ModernDemoTitle','ModernDemoPlay','ModernDemoPrev','ModernDemoNext','ModernDemoReset'].forEach(id=>elements.set(id,elem()));
  const frame=elements.get('ModernDemoFrame');
  frame.src='about:blank';frame.contentWindow={postMessage(message,destination){out.push({message,destination});}};
  const window={location:{origin},document:{getElementById:id=>elements.get(id)||null,createElement:elem},
    addEventListener(type,fn){listeners[type]=fn;}};
  window.window=window;
  vm.runInNewContext(read('src/ui/modern/ModernDemos.js'),{window});
  const api=window.CurvatureModernDemos;
  const incoming=(type,payload={},source=frame.contentWindow,from=origin)=>
    listeners.message({source,origin:from,data:{protocol,type,...payload}});
  const get=id=>elements.get(id);
  api.init();return {api,frame,out,get,incoming};
}
function legacy(){
  const parent={postMessage(message,destination){sent.push({message,destination});}},sent=[],listeners={};
  const demos={DemoList:families.map(Name=>({Name})),CurrDemo:null,playing:false,position:0,stops:0,
    Find(name){return this.DemoList.findIndex(d=>d.Name===name);},
    GetCurrPos(){return this.position;},GetNStates(){return this.CurrDemo&&this.CurrDemo.Name==='TransLine'?8:6;},
    IsPlaying(){return this.playing;},
    UpdateDemoPanels(){},
    SetDemo(name,play,pos){this.Stop();this.CurrDemo=this.DemoList[this.Find(name)];this.position=pos;this.playing=play;this.UpdateDemoPanels();},
    Stop(){this.stops++;this.playing=false;this.UpdateDemoPanels();},
    Play(){this.playing=true;this.UpdateDemoPanels();},
    Next(){this.position=Math.min(this.GetNStates()-1,this.position+1);this.UpdateDemoPanels();},
    Prev(){this.position=Math.max(0,this.position-1);this.UpdateDemoPanels();}};
  const window={location:{search:'?embed=demos',origin},parent,Demos:demos,
    document:{documentElement:{classList:{add(){}}}},graph:{Redraw(){}},
    addEventListener(type,fn){listeners[type]=fn;},setTimeout(fn){fn();}};
  window.window=window;
  vm.runInNewContext(read('src/ui/legacy/LegacyDemoEmbed.js'),{window,URLSearchParams});
  const command=(action,name,from=origin,source=parent)=>listeners.message({
    source,origin:from,data:{protocol,type:'command',command:action,...(name?{name}:{})}});
  listeners.load();return {sent,demos,command};
}

test('141.2.78: actual Legacy registry contains nine distinct authored demonstrations',()=>{
  const original=read('src/animation/CurvatureDemos.js');
  const names=[...original.matchAll(/Demos\.New\(\s*'([^']+)'/g)].map(m=>m[1]);
  assert.deepEqual(names,families);
  const html=read('CurvatureModern.html');
  assert.match(html,/id="ModernDemoSelect"/);
  assert.match(html,/id="ModernDemoTitle"/);
  assert.match(html,/src="about:blank"/);
});

test('141.2.78: Legacy sends its authoritative catalog and starts paused on TransLine',()=>{
  const h=legacy();
  assert.equal(h.sent[0].message.type,'catalog');
  assert.deepEqual(Array.from(h.sent[0].message.names),families);
  assert.equal(h.demos.CurrDemo.Name,'TransLine');
  assert.equal(h.demos.playing,false);
  assert.equal(h.sent.at(-1).message.demo,'TransLine');
});

test('141.2.78: all eight additional families can be selected, each starting from first key state',()=>{
  const h=legacy();
  for(const name of families.filter(n=>n!=='TransLine')){
    h.command('play');assert.equal(h.demos.playing,true);
    h.command('next');assert.equal(h.demos.position,1);
    const previousStops=h.demos.stops;
    h.command('select',name);
    assert.equal(h.demos.CurrDemo.Name,name);
    assert.equal(h.demos.position,0);
    assert.equal(h.demos.playing,false);
    assert.ok(h.demos.stops>previousStops);
    assert.equal(h.sent.at(-1).message.demo,name);
    h.command('reset');assert.equal(h.demos.position,0);
  }
});

test('141.2.78: unregistered, malformed and cross-origin selections cannot affect Legacy',()=>{
  const h=legacy();
  h.command('select','Unknown');assert.equal(h.demos.CurrDemo.Name,'TransLine');
  h.command('select','Curve','https://other.example');assert.equal(h.demos.CurrDemo.Name,'TransLine');
  h.command('select','Curve',origin,{});assert.equal(h.demos.CurrDemo.Name,'TransLine');
  h.command('explode','Curve');assert.equal(h.demos.CurrDemo.Name,'TransLine');
  h.command('select','Curve');assert.equal(h.demos.CurrDemo.Name,'Curve');
});

test('141.2.78: Modern populates its selector solely from the frame catalog',()=>{
  const h=modern();
  assert.equal(h.get('ModernDemoSelect').disabled,true);
  assert.equal(h.frame.src,'about:blank');
  h.api.activate();
  assert.equal(h.frame.src,'CurvatureDemosHost.html?embed=demos');
  h.incoming('catalog',{names:families}, {},origin);
  assert.equal(h.get('ModernDemoSelect').disabled,true);
  h.incoming('catalog',{names:families},h.frame.contentWindow,'https://other.example');
  assert.equal(h.get('ModernDemoSelect').disabled,true);
  h.incoming('catalog',{names:families});
  assert.equal(h.get('ModernDemoSelect').disabled,false);
  assert.deepEqual(h.get('ModernDemoSelect').children.map(o=>o.value),families);
  assert.equal(h.get('ModernDemoSelect').value,'TransLine');
  assert.equal(h.get('ModernDemoSelect').children[2].textContent,'TrnsmLine');
});

test('141.2.78: selecting a new family requests a switch and ignores stale prior states',()=>{
  const h=modern();h.api.activate();
  h.incoming('catalog',{names:families});
  h.incoming('state',{demo:'TransLine',position:3,total:8,playing:true});
  const picker=h.get('ModernDemoSelect');
  picker.value='Bedford';picker.listeners.change();
  assert.equal(h.out.at(-1).message.command,'select');
  assert.equal(h.out.at(-1).message.name,'Bedford');
  assert.equal(h.get('ModernDemoPlay').disabled,true);
  h.incoming('state',{demo:'TransLine',position:4,total:8,playing:false});
  assert.equal(h.get('ModernDemoPlay').disabled,true);
  h.incoming('state',{demo:'Bedford',position:0,total:6,playing:false});
  assert.equal(h.get('ModernDemoPlay').disabled,false);
  assert.equal(h.get('ModernDemoProgress').textContent,'Step 1 / 6');
  assert.equal(h.get('ModernDemoTitle').textContent,'Demos · Bedford');
  picker.value='Bogus';picker.listeners.change();
  assert.equal(h.out.at(-1).message.name,'Bedford');
});

test('141.2.78: selected demo survives tab navigation without resetting or autoplay',()=>{
  const h=modern();h.api.activate();h.incoming('catalog',{names:families});
  h.incoming('state',{demo:'TransLine',position:0,total:8,playing:false});
  const picker=h.get('ModernDemoSelect');picker.value='Canigou';picker.listeners.change();
  h.incoming('state',{demo:'Canigou',position:3,total:6,playing:true});
  h.api.deactivate();
  assert.equal(h.out.at(-1).message.command,'pause');
  const before=h.out.length;
  h.incoming('state',{demo:'Canigou',position:3,total:6,playing:false});
  assert.equal(h.out.length,before,'no repeated pause feedback loop');
  h.api.activate();
  assert.equal(h.out.at(-1).message.command,'status');
  assert.equal(h.frame.src,'CurvatureDemosHost.html?embed=demos');
  assert.equal(picker.value,'Canigou');
  assert.equal(h.get('ModernDemoProgress').textContent,'Step 4 / 6');
});
