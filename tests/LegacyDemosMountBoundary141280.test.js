'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const families=['Curve','Causeway','TransLine','Grace','Bedford','Tensas','Soundly','Chicago','Canigou'];

function directController(){
  const window={};
  vm.runInNewContext(read('src/ui/legacy/LegacyDemoEmbed.js'),{window});
  const reported=[],catalogs=[];
  const demo={CurrDemo:null,DemoList:families.map(Name=>({Name})),position:0,playing:false,stops:0,
    Find(name){return this.DemoList.findIndex(item=>item.Name===name);},
    GetCurrPos(){return this.position;},GetNStates(){return this.CurrDemo.Name==='TransLine'?8:6;},
    IsPlaying(){return this.playing;},UpdateDemoPanels(){},
    SetDemo(name,playing,pos){this.Stop();this.CurrDemo=this.DemoList[this.Find(name)];this.position=pos;this.playing=playing;this.UpdateDemoPanels();},
    Stop(){this.stops++;this.playing=false;this.UpdateDemoPanels();},
    Play(){this.playing=true;this.UpdateDemoPanels();},
    Next(){this.position=Math.min(this.position+1,this.GetNStates()-1);this.UpdateDemoPanels();},
    Prev(){this.position=Math.max(this.position-1,0);this.UpdateDemoPanels();}};
  const original=demo.UpdateDemoPanels;
  let redraws=0;
  const driver=window.CurvatureLegacyDemosController.create({
    getDemos:()=>demo,
    publish:state=>reported.push({...state}),
    catalog:names=>catalogs.push([...names]),
    redraw:()=>redraws++});
  return {demo,driver,reported,catalogs,original,get redraws(){return redraws;}};
}

test('141.2.80: the injected controller needs no DOM, parent, globals or messaging to start',()=>{
  const h=directController();
  assert.equal(h.driver.start('Unknown'),false);
  assert.equal(h.driver.start('TransLine'),true);
  assert.deepEqual(h.catalogs,[families]);
  assert.equal(h.demo.CurrDemo.Name,'TransLine');
  assert.deepEqual(h.reported.at(-1),{demo:'TransLine',position:0,total:8,playing:false});
  assert.equal(h.driver.start('TransLine'),false,'do not wrap update twice');
});

test('141.2.80: one controller manages all families, animation commands and redraw',()=>{
  const h=directController();h.driver.start('TransLine');
  for(const name of families){
    h.driver.command('play');assert.equal(h.demo.IsPlaying(),true);
    h.driver.command('next');
    const stops=h.demo.stops;
    assert.equal(h.driver.command('select',name),true);
    assert.equal(h.demo.CurrDemo.Name,name);
    assert.equal(h.demo.position,0);
    assert.equal(h.demo.playing,false);
    assert.ok(h.demo.stops>stops);
  }
  h.driver.command('next');
  h.driver.command('previous');
  assert.equal(h.demo.position,0);
  h.driver.command('status');assert.equal(h.redraws,1);
  assert.equal(h.driver.command('select','Unknown'),false);
  assert.equal(h.driver.command('select',{}),false);
  assert.equal(h.driver.command('whatever'),false);
});

test('141.2.80: teardown restores original callback and stops notifications',()=>{
  const h=directController();h.driver.start('TransLine');
  const sent=h.reported.length;
  h.driver.dispose();
  assert.equal(h.demo.UpdateDemoPanels,h.original);
  assert.equal(h.demo.playing,false);
  h.demo.UpdateDemoPanels();
  assert.equal(h.reported.length,sent);
  assert.equal(h.driver.command('play'),false);
  assert.equal(h.driver.start('Curve'),false);
  h.driver.dispose();
});

function domMount(){
  const writes=[];
  const script={insertAdjacentHTML(where,html){writes.push({where,html});}};
  const nativeWrites=[];
  const original=function(html){nativeWrites.push(html);};
  const window={document:{currentScript:script,writeln:original}};
  vm.runInNewContext(read('src/ui/legacy/LegacyDemoDomMount.js'),{window});
  return {port:window.CurvatureLegacyDemoDomMount,writes,window,nativeWrites,original};
}

test('141.2.80: DOM port inserts multiple parser-time panels in order without document.write',()=>{
  const h=domMount();
  h.window.document.writeln('<table id="one"></table>');
  h.window.document.writeln('<table id="two"></table>');
  assert.deepEqual(h.writes,[{where:'beforebegin',html:'<table id="one"></table>'},
    {where:'beforebegin',html:'<table id="two"></table>'}]);
  h.window.document.currentScript=null;
  assert.throws(()=>h.port.writeHTML('<p>missing anchor</p>'),/script anchor/);
});

test('141.2.80: DOM port accepts explicit mount target after HTML parsing',()=>{
  const h=domMount();h.window.document.currentScript=null;
  h.port.setTarget({insertAdjacentHTML(where,html){h.writes.push({where,html});}});
  h.port.writeHTML('<canvas></canvas>');
  assert.deepEqual(h.writes,[{where:'beforeend',html:'<canvas></canvas>'}]);
  assert.throws(()=>h.port.setTarget({}),/mount target/);
  h.port.setTarget(null);
  assert.throws(()=>h.port.writeHTML('oops'),/script anchor/);
  assert.throws(()=>h.port.writeHTML({}),/markup must be a string/);
  h.port.uninstall();
  assert.equal(h.window.document.writeln,h.original);
  h.window.document.writeln('native');
  assert.deepEqual(h.nativeWrites,['native']);
  h.port.install();
  assert.notEqual(h.window.document.writeln,h.original);
});

test('141.2.80: only isolated host installs DOM writer override; protected Legacy bundles remain unchanged',()=>{
  const host=read('CurvatureDemosHost.html');
  const standalone=read('CurvatureApp.html');
  assert.match(host,/src="src\/ui\/legacy\/LegacyDemoDomMount\.js/);
  assert.doesNotMatch(standalone,/LegacyDemoDomMount\.js/);
  assert.ok(host.indexOf('LegacyDemoDomMount.js')<host.indexOf('GraphX3DX.js'));
  const graph=read('src/legacy/GraphX3DX.js');
  const panel=read('src/ui/ControlPanelX.js');
  assert.equal((graph.match(/document\.writeln\(s\)/g)||[]).length,2);
  assert.match(panel,/document\.writeln\(this\.GetHtml\(\)\)/);
  assert.match(read('src/ui/legacy/LegacyDemoDomMount.js'),/doc\.writeln=function/);
});
