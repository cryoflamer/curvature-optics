'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

function modernHarness(){
  const elements = new Map();
  const listeners = {};
  const messages=[];
  for(const id of ['ModernDemoFrame','ModernDemoStatus','ModernDemoProgress',
    'ModernDemoPlay','ModernDemoPrev','ModernDemoNext','ModernDemoReset']){
    elements.set(id, {disabled:false, textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});
  }
  const frame = elements.get('ModernDemoFrame');
  frame.contentWindow={postMessage(message,origin){messages.push({message,origin});}};
  frame.src='about:blank';
  const host={location:{origin:'http://localhost:8000'},document:{getElementById:id=>elements.get(id)||null},
    addEventListener(type,fn){listeners[type]=fn;}};
  host.window=host;
  vm.runInNewContext(read('src/ui/modern/ModernDemos.js'), {window:host});
  return {host,frame,elements,listeners,messages,api:host.CurvatureModernDemos};
}
function demoState(h, overrides={}){
  h.listeners.message({source:h.frame.contentWindow,origin:'http://localhost:8000',
    data:{protocol:'curvature-demos-v1',type:'state',demo:'TransLine',position:0,total:8,playing:false,...overrides}});
}
test('141.2.77: Demos is lazy and starts the real isolated Legacy page only when selected',()=>{
  const h=modernHarness();h.api.init();
  assert.equal(h.frame.src,'about:blank');
  assert.equal(h.elements.get('ModernDemoPlay').disabled,true);
  h.api.activate();
  assert.equal(h.frame.src,'CurvatureApp.html?ui=legacy&embed=demos');
  assert.match(h.elements.get('ModernDemoStatus').textContent,/Loading/);
  demoState(h);
  assert.equal(h.elements.get('ModernDemoPlay').disabled,false);
  assert.equal(h.elements.get('ModernDemoProgress').textContent,'Step 1 / 8');
  h.api.deactivate();
  assert.equal(h.messages.at(-1).message.command,'pause');
  h.api.activate();
  assert.equal(h.frame.src,'CurvatureApp.html?ui=legacy&embed=demos');
  assert.equal(h.messages.at(-1).message.command,'status');
});
test('141.2.77: Modern playback buttons send narrow commands without importing legacy globals',()=>{
  const h=modernHarness();h.api.init();h.api.activate();demoState(h);
  for(const [id,command] of [['ModernDemoPlay','play'],['ModernDemoPrev','previous'],
    ['ModernDemoNext','next'],['ModernDemoReset','reset']]){
    h.elements.get(id).listeners.click();
    assert.deepEqual(JSON.parse(JSON.stringify(h.messages.at(-1))),{
      message:{protocol:'curvature-demos-v1',type:'command',command},origin:'http://localhost:8000'});
  }
  demoState(h,{position:3,playing:true});
  assert.equal(h.elements.get('ModernDemoPlay').textContent,'Pause');
  assert.equal(h.elements.get('ModernDemoProgress').textContent,'Step 4 / 8');
});
test('141.2.77: status messages require the embedded frame, same origin and protocol',()=>{
  const h=modernHarness();h.api.init();h.api.activate();
  const base={source:h.frame.contentWindow,origin:'http://localhost:8000',
    data:{protocol:'curvature-demos-v1',type:'state',demo:'TransLine',position:1,total:8}};
  h.listeners.message({...base,source:{}});
  h.listeners.message({...base,origin:'https://another.example'});
  h.listeners.message({...base,data:{...base.data,protocol:'unknown'}});
  assert.equal(h.elements.get('ModernDemoPlay').disabled,true);
  h.listeners.message(base);
  assert.equal(h.elements.get('ModernDemoPlay').disabled,false);
});

function legacyHarness(search='?embed=demos',inFrame=true){
  const parent={postMessage:()=>{}};
  const replies=[];parent.postMessage=(message,origin)=>replies.push({message,origin});
  const listeners={};
  const names=['Curve','Causeway','TransLine','Grace','Bedford','Tensas','Soundly','Chicago','Canigou'];
  const demos={name:null,position:0,playing:false,CurrDemo:null,DemoList:names.map(Name=>({Name})),
    Find(n){return names.indexOf(n);},
    IsCurrDemoName(n){return this.name===n;},
    GetCurrPos(){return this.position;},GetNStates(){return 8;},IsPlaying(){return this.playing;},
    UpdateDemoPanels(){},
    SetDemo(name,play,pos){this.playing=false;this.name=name;this.CurrDemo=this.DemoList[this.Find(name)];this.position=pos;this.playing=play;this.UpdateDemoPanels();},
    Stop(){this.playing=false;this.UpdateDemoPanels();},
    Play(){this.playing=true;this.UpdateDemoPanels();},
    Next(){this.position++;this.UpdateDemoPanels();},
    Prev(){this.position--;this.UpdateDemoPanels();}};
  const host={location:{search,origin:'http://localhost:8000'},document:{documentElement:{classList:{add(){}}}},parent:inFrame?parent:null,
    Demos:demos,graph:{Redraw(){}},addEventListener(type,fn){listeners[type]=fn;},
    setTimeout(fn){fn();}};
  if(!inFrame)host.parent=host;
  vm.runInNewContext(read('src/ui/legacy/LegacyDemoEmbed.js'),{window:host,URLSearchParams});
  return {host,parent,replies,listeners,demos};
}
test('141.2.77: embedded legacy initializes TransLine paused at state one',()=>{
  const h=legacyHarness();h.listeners.load();
  assert.equal(h.demos.name,'TransLine');
  assert.equal(h.demos.position,0);
  assert.equal(h.demos.playing,false);
  assert.equal(h.replies.at(-1).message.total,8);
});
test('141.2.77: embedded legacy accepts only same-origin parent commands',()=>{
  const h=legacyHarness();h.listeners.load();
  const command=(command,origin='http://localhost:8000',source=h.parent)=>
    h.listeners.message({source,origin,data:{protocol:'curvature-demos-v1',type:'command',command}});
  command('next','https://untrusted.example');assert.equal(h.demos.position,0);
  command('next','http://localhost:8000',{});assert.equal(h.demos.position,0);
  command('next');assert.equal(h.demos.position,1);
  command('play');assert.equal(h.demos.playing,true);
  command('pause');assert.equal(h.demos.playing,false);
  command('reset');assert.equal(h.demos.position,0);
});
test('141.2.77: standalone Legacy never installs the embedded bridge',()=>{
  assert.deepEqual(Object.keys(legacyHarness('').listeners),[]);
  assert.deepEqual(Object.keys(legacyHarness('?embed=demos',false).listeners),[]);
});
test('141.2.77: UI integration retains the physical Scene/Compare serialization modes',()=>{
  const html=read('CurvatureModern.html');
  for(const id of ['ModernDemosTab','ModernDemosPanel','ModernDemoFrame','ModernDemoPlay',
    'ModernDemoNext','ModernDemoPrev','ModernDemoReset'])assert.match(html,new RegExp('id="'+id+'"'));
  const app=read('src/ui/modern/ModernApp.js');
  assert.match(app,/if\(demosActive\)\{[\s\S]*?return; \/\/ Never serialize Demos/);
  assert.match(app,/state\.mode=mode/);
  assert.match(app,/root\.CurvatureModernDemos\.init\(\)/);
  const legacy=read('CurvatureApp.html');
  assert.match(legacy,/src\/ui\/legacy\/LegacyDemoEmbed\.js/);
  assert.match(legacy,/src\/ui\/legacy\/LegacyDemoEmbed\.css/);
  assert.match(read('src/ui/legacy/LegacyDemoEmbed.css'),/#Wiki>:not\(#JsGraph1\)/);
  assert.match(read('src/ui/legacy/LegacyDemoEmbed.css'),/#WikiPage>:not\(#Wiki\)/);
  assert.match(read('src/animation/CurvatureDemos.js'),/Demos\.New\( 'TransLine'/);
  assert.match(html,/src="about:blank"/); // No heavyweight Legacy boot on initial Scene/Compare.
});
