'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const presentation=require('../src/ui/modern/ModernAtmosphericPresentation');

function fakeDom(){
  const created=[];
  function canvas(width=400,height=200){
    const calls=[];
    const ctx={clearRect(...args){calls.push(['clear',...args]);},
      drawImage(...args){calls.push(['image',...args]);},
      stroke(){calls.push(['stroke']);}};
    return {width,height,offsetWidth:width/2,offsetHeight:height/2,offsetLeft:0,offsetTop:0,
      style:{opacity:''},calls,parentNode:null,className:'',setAttribute(){},
      getContext(type){assert.equal(type,'2d');return ctx;}};
  }
  const host={children:[],appendChild(child){
    assert.equal(child.parentNode,null);this.children.push(child);child.parentNode=this;
  },removeChild(child){
    this.children.splice(this.children.indexOf(child),1);child.parentNode=null;
  }};
  const doc={createElement(tag){assert.equal(tag,'canvas');const node=canvas();created.push(node);return node;}};
  function graph(){const source=canvas();host.appendChild(source);return {Canvas:source,other:'intact'};}
  return {doc,host,created,graph};
}

test('138.1: presentation stays entirely inert when disabled',()=>{
  const h=fakeDom(),p=presentation.create({document:h.doc}),g=h.graph();
  assert.strictEqual(p.capture('Scene',g),g);
  assert.equal(h.created.length,0);
  assert.equal(g.Canvas.style.opacity,'');
  assert.equal(p.getCanvas('Scene'),null);
  assert.equal(p.frame('Scene'),false);
  assert.equal(p.setEnabled('Scene',false),false);
  assert.throws(()=>p.capture('unknown',g),/Unknown presentation viewport/);
});

test('138.1: enabled viewport captures physical pixels before using separate guides',()=>{
  const h=fakeDom(),p=presentation.create({document:h.doc}),g=h.graph();
  assert.equal(p.setEnabled('Scene',true),true);
  const guide=p.capture('Scene',g);
  assert.notStrictEqual(guide,g);
  assert.notStrictEqual(guide.Canvas,g.Canvas);
  assert.strictEqual(Object.getPrototypeOf(guide),g);
  assert.equal(guide.other,'intact');
  assert.equal(h.created.length,2);
  assert.equal(h.host.children.length,3);
  assert.equal(p.getCanvas('Scene'),h.created[0]);
  assert.equal(g.Canvas.style.opacity,'0');
  assert.deepEqual(h.created[0].calls.at(-1),['image',g.Canvas,0,0]);
  assert.deepEqual(h.created[1].calls.at(-1),['clear',0,0,400,200]);
  assert.equal(h.created[0].style.pointerEvents,'none');
  assert.equal(h.created[1].style.pointerEvents,'none');
  assert.equal(h.created[0].style.width,'200px');
  assert.equal(h.created[0].width,400,'backing pixels stay at native HiDPI resolution');
  guide.Canvas.getContext('2d').stroke();
  assert.equal(g.Canvas.calls.length,0,'guide annotation does not paint the physical source');
  const image=h.created[0],annotations=h.created[1];
  p.capture('Scene',g);
  assert.strictEqual(h.created[0],image,'no new nodes on repeated draws');
  assert.equal(image.calls.filter(call=>call[0]==='image').length,2);
  assert.equal(p.frame('Scene'),true,'a presentation frame never invokes the physics renderer');
  assert.equal(image.calls.filter(call=>call[0]==='image').length,3);
  assert.equal(annotations.calls.filter(call=>call[0]==='clear').length,2);
});

test('138.1: each viewport has separate output; resize and destroy restore original Canvas',()=>{
  const h=fakeDom(),p=presentation.create({document:h.doc});
  const a=h.graph(),b=h.graph();
  a.Canvas.style.opacity='0.7';
  p.setEnabled('A',true);p.setEnabled('B',true);
  p.capture('A',a);p.capture('B',b);
  assert.notStrictEqual(p.getCanvas('A'),p.getCanvas('B'));
  assert.equal(a.Canvas.style.opacity,'0');
  assert.equal(b.Canvas.style.opacity,'0');
  a.Canvas.width=800;a.Canvas.height=500;a.Canvas.offsetWidth=400;a.Canvas.offsetHeight=250;
  const updated=p.capture('A',a);
  assert.equal(updated.Canvas.width,800);
  assert.equal(updated.Canvas.height,500);
  assert.equal(p.getCanvas('A').style.width,'400px');
  assert.equal(p.getCanvas('A').style.height,'250px');
  p.suspend();
  assert.equal(a.Canvas.style.opacity,'0.7');
  assert.equal(b.Canvas.style.opacity,'');
  assert.equal(p.getCanvas('A').style.display,'none');
  assert.equal(p.frame('A'),false,'drag suspension disables presentation frames');
  p.resume();
  assert.equal(a.Canvas.style.opacity,'0');
  assert.equal(p.getCanvas('A').style.display,'');
  assert.equal(p.setEnabled('A',false),true);
  assert.equal(a.Canvas.style.opacity,'0.7');
  assert.equal(p.getCanvas('A'),null);
  assert.strictEqual(p.capture('A',a),a);
  assert.notEqual(p.getCanvas('B'),null);
  p.destroy();
  assert.equal(b.Canvas.style.opacity,'');
  assert.equal(h.host.children.length,2);
});

test('138.1: an unsuccessful presentation capture cannot hide the physical scene',()=>{
  const h=fakeDom(),p=presentation.create({document:h.doc}),g=h.graph();
  p.setEnabled('Scene',true);
  h.doc.createElement=()=>{throw Error('no 2D allocation');};
  assert.strictEqual(p.capture('Scene',g),g);
  assert.equal(g.Canvas.style.opacity,'');
  assert.equal(h.host.children.length,1);
});

test('138.1: postprocess is loaded before the app and after the physical drawing boundary',()=>{
  const base=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(base,'CurvatureModern.html'),'utf8');
  const js=fs.readFileSync(path.join(base,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.indexOf('ModernAtmosphericPresentation.js')>=0);
  assert.ok(html.indexOf('ModernAtmosphericPresentation.js')<html.indexOf('ModernApp.js'));
  assert.match(js,/renderPhysical\(g,model,[\s\S]*?atmosphericPresentation\.capture\('Scene',g\)/);
  assert.match(js,/renderPhysical\(g,m,options\)[\s\S]*?atmosphericPresentation\.capture\(side,g\)/);
  assert.match(js,/drawCompareHorizon\('Scene',guideGraph,model,sceneOptions\)/);
  assert.match(js,/drawCompareHorizon\(side,guideGraph,m,options\)/);
  assert.match(fs.readFileSync(path.join(base,'src/ui/modern/ModernApp.css'),'utf8'),
    /canvas\.modern-atmospheric-guides\{background:transparent\}/);
});

test('138.1: an injectable GPU presenter receives the cached physical Canvas, not a new ray trace',()=>{
  const h=fakeDom(),calls=[];
  const p=presentation.create({document:h.doc,present(source,target,name){calls.push({source,target,name});}});
  const g=h.graph();p.setEnabled('Scene',true);
  p.capture('Scene',g);p.frame('Scene');
  assert.equal(calls.length,2);
  assert.strictEqual(calls[0].source,g.Canvas);
  assert.strictEqual(calls[1].target,calls[0].target);
  assert.equal(calls[1].name,'Scene');
});
