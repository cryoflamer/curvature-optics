'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function factory(){
  const sandbox=vm.createContext({});
  vm.runInContext(read('src/app/LegacyCanvasPresenter.js'),sandbox);
  return sandbox.CurvatureLegacyCanvasPresenter.create;
}
function fixture(name,mode='legacy',overrides={}){
  const calls=[],model={owner:name,Height:7,showModel:1};
  const selector={value:mode},status={textContent:'previous'};
  let audit=false;
  const options={atmosphere:'vacuum',occlusionRadius:6371000,interactive:false};
  const renderer={
    support(m){calls.push(['support',m.owner]);return {supported:true};},
    supportPhysical(m){calls.push(['supportPhysical',m.owner]);return {supported:true};},
    render(g,m){calls.push(['independent',g.owner,m.owner]);return {warning:name+' preview'};},
    renderPhysical(g,m,settings){calls.push(['physical',g.owner,m.owner,settings.atmosphere]);
      return {drawn:3,unresolved:0,buildMs:9,cacheReused:false,groundHorizon:12000,
        fieldStats:{solves:5,interpolations:3,fallbacks:0},sampleStatuses:{},guideSolves:8};}
  };
  const ports={
    getModel(){return model;},getMode(){return selector;},getStatus(){return status;},
    getRenderer(){return renderer;},isAuditActive(){return audit;},
    drawLegacy(g){calls.push(['legacy',g.owner]);return name+' legacy';},
    getPhysicalOptions(){calls.push(['options',name]);return options;},
    reportError(error){calls.push(['error',error.message]);},...overrides
  };
  return {calls,model,selector,status,options,renderer,ports,
    setAudit(value){audit=value;}};
}

test('Canvas presenter rejects missing ports; its module has no Legacy browser globals',()=>{
  const create=factory();
  assert.throws(()=>create(),/explicit drawing ports/);
  assert.throws(()=>create({drawLegacy(){}}),/explicit drawing ports/);
  const source=read('src/app/LegacyCanvasPresenter.js');
  assert.doesNotMatch(source,/\b(?:CurveApp|graph|ControlPanels|document)\b/);
  assert.doesNotMatch(source,/\bwindow\.(?!CurvatureLegacyCanvasPresenter)/);
});

test('two presenters draw into independent canvases and retain their own status',()=>{
  const create=factory(),a=fixture('A','independent'),b=fixture('B','physical');
  const pa=create(a.ports),pb=create(b.ports);
  a.options.atmosphere='standard';b.options.atmosphere='inverse-spherical';
  const ga={owner:'graph-A'},gb={owner:'graph-B'};
  pa.draw(ga);pb.draw(gb);pa.draw(ga);
  assert.deepEqual(a.calls,[['support','A'],['independent','graph-A','A'],
    ['support','A'],['independent','graph-A','A']]);
  assert.deepEqual(b.calls,[['supportPhysical','B'],['options','B'],
    ['physical','graph-B','B','inverse-spherical']]);
  assert.equal(a.status.textContent,'A preview');
  assert.match(b.status.textContent,/3 lines \(visible outline pieces\)/);
  assert.match(b.status.textContent,/optical horizon 12\.00 km/);
  assert.match(b.status.textContent,/5 shared exact ray solves/);
});

test('missing renderer, unsupported modes and capture audits preserve original fallback',()=>{
  const create=factory(),a=fixture('A','legacy'),g={owner:'g'};
  const p=create(a.ports);
  assert.equal(p.draw(g),'A legacy');
  assert.equal(a.status.textContent,'');
  a.selector.value='independent';
  a.renderer.support=()=>({supported:false,reason:'unsupported geometry'});
  assert.equal(p.draw(g),'A legacy');
  assert.equal(a.status.textContent,'unsupported geometry');
  a.setAudit(true);
  a.status.textContent='capture status';
  assert.equal(p.draw(g),'A legacy');
  assert.equal(a.status.textContent,'capture status','audit status must not be overwritten');
  assert.deepEqual(a.calls.filter(x=>x[0]==='legacy'),[['legacy','g'],['legacy','g'],['legacy','g']]);
});

test('physical renderer failure clears partial Canvas and draws the original scene',()=>{
  const create=factory(),a=fixture('A','physical');
  a.renderer.renderPhysical=()=>{throw Error('solver failed');};
  const g={owner:'A',Reset(force){a.calls.push(['reset',force]);}};
  assert.equal(create(a.ports).draw(g),'A legacy');
  assert.match(a.status.textContent,/Physical failed; Legacy restored: solver failed/);
  assert.deepEqual(a.calls.slice(-3),[['error','solver failed'],['reset',true],['legacy','A']]);
});

test('independent renderer failure also restores Legacy without affecting second presenter',()=>{
  const create=factory(),a=fixture('A','independent'),b=fixture('B','independent');
  const pA=create(a.ports),pB=create(b.ports);
  a.renderer.render=()=>{throw Error('bad painter');};
  const ga={owner:'A',Reset(){}},gb={owner:'B',Reset(){}};
  pA.draw(ga);pB.draw(gb);
  assert.match(a.status.textContent,/Independent failed; Legacy restored: bad painter/);
  assert.equal(b.status.textContent,'B preview');
  assert.equal(b.calls.some(x=>x[0]==='legacy'),false);
});

test('both Legacy documents load the port before runtime, without loading it in Modern',()=>{
  for(const entry of ['CurvatureApp.html','CurvatureDemosHost.html']){
    const html=read(entry),port=html.indexOf('src/app/LegacyCanvasPresenter.js');
    const coordinator=html.indexOf('src/app/LegacyUpdateCoordinator.js');
    const runtime=html.indexOf('src/app/CurvatureAppRuntime.js');
    assert.ok(coordinator>=0&&coordinator<port&&port<runtime,entry);
    assert.equal(html.split('src/app/LegacyCanvasPresenter.js').length-1,1);
  }
  assert.doesNotMatch(read('CurvatureModern.html'),/LegacyCanvasPresenter\.js/);
  const runtime=read('src/app/CurvatureAppRuntime.js');
  assert.match(runtime,/legacyCanvasPresenter\.draw\(g\)/);
  assert.match(runtime,/DrawFunc: DrawMainCanvasFrame/);
});
