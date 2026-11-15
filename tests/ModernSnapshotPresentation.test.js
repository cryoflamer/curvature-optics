'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const presentation=require('../src/ui/modern/ModernSnapshotPresentation');
const history=require('../src/ui/modern/ModernExperimentHistoryUI');
const studio=require('../src/ui/modern/ModernAnimationStudioUI');

function fixture(){
  return {id:7,name:'Profile test',description:'Saved view',source:'manual',createdAt:1760000000000,
    features:{mode:'scene',scene:{geometry:{kind:'globe'}}},
    thumbnail:{dataUrl:'data:image/webp;base64,YQ==',width:480,height:300},
    experiment:{display:{mode:'scene'},scene:{surface:{showModel:1,rEarth:6371000},
      atmosphere:'temperature-lapse',temperatureProfile:{temperatureC:12,gradientKPerKm:6,
        pressureHpa:1013},camera:{Height:15,Pan:0,Nick:0},
      objects:{NObjects:[2,0],ObjType:[3,0]}}}};
}
function fakeDom(){
  function createElement(tag){
    return {tagName:tag,children:[],className:'',textContent:'',
      appendChild(child){this.children.push(child);return child;}};
  }
  return {createElement};
}

test('shared presentation is the single implementation, with temporary History compatibility aliases',()=>{
  for(const key of ['label','displayName','frameSummary','frameVisual','inspect','inspectorMarkup']){
    assert.equal(history[key],presentation[key],key+' must forward the shared implementation');
    assert.equal(typeof presentation[key],'function');
  }
  assert.equal(typeof history.render,'function');
  assert.equal(typeof studio.render,'function');
  const ui=fs.readFileSync(path.join(root,'src/ui/modern/ModernAnimationStudioUI.js'),'utf8');
  assert.doesNotMatch(ui,/ModernExperimentHistoryUI|CurvatureModernExperimentHistoryUI|historyUI\./);
  assert.match(ui,/require\('\.\/ModernSnapshotPresentation'\)/);
});

test('rendering and inspecting snapshots preserve existing labels, physics, and thumbnails without mutation',()=>{
  const entry=fixture(),before=JSON.stringify(entry),doc=fakeDom();
  assert.equal(presentation.displayName(entry),'Profile test');
  assert.match(presentation.label(entry),/Scene · Globe/);
  assert.match(presentation.frameSummary(entry),/temperature-lapse 6 K\/km/);
  assert.match(presentation.frameSummary(entry),/Camera 15 m/);
  const visual=presentation.frameVisual(doc,entry,'modern-studio-picker-visual');
  assert.equal(visual.className,'modern-studio-picker-visual');
  assert.equal(visual.children[0].src,entry.thumbnail.dataUrl);
  assert.equal(visual.children[0].loading,'lazy');
  const meta=presentation.inspect(entry);
  assert.deepEqual(meta.A.find(row=>row[0]==='Gradient'),['Gradient','6 K/km']);
  assert.equal(meta.shared.find(row=>row[0]==='Camera height')[1],'15 m');
  const inspector=presentation.inspectorMarkup(doc,entry);
  assert.equal(inspector.className,'modern-history-inspector-inner');
  assert.equal(inspector.children[0].src,entry.thumbnail.dataUrl);
  assert.equal(JSON.stringify(entry),before,'presentation does not mutate source snapshot');
  const absent={...entry,thumbnail:null};
  const missing=presentation.frameVisual(doc,absent,'visual');
  assert.equal(missing.children[0].textContent,'No screenshot');
});

test('classic-browser globals are loaded in dependency order and Studio is independent of History UI',()=>{
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const scripts=[...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match=>match[1].split('?')[0]);
  const dependency='src/ui/modern/ModernSnapshotPresentation.js';
  const historyScript='src/ui/modern/ModernExperimentHistoryUI.js';
  const studioScript='src/ui/modern/ModernAnimationStudioUI.js';
  assert.equal(scripts.filter(src=>src===dependency).length,1);
  assert.ok(scripts.indexOf(dependency)<scripts.indexOf(historyScript));
  assert.ok(scripts.indexOf(dependency)<scripts.indexOf(studioScript));
  const browser=vm.createContext({});
  // Simulates classic script loading; neither CommonJS nor History UI is present.
  for(const file of [dependency,studioScript]){
    vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),browser,{filename:file});
  }
  assert.equal(vm.runInContext('typeof require',browser),'undefined');
  assert.equal(vm.runInContext('typeof CurvatureModernExperimentHistoryUI',browser),'undefined');
  assert.equal(typeof browser.CurvatureModernAnimationStudioUI.render,'function');
  assert.equal(typeof browser.CurvatureModernSnapshotPresentation.frameSummary,'function');
  vm.runInContext(fs.readFileSync(path.join(root,historyScript),'utf8'),browser,
    {filename:historyScript});
  assert.equal(typeof browser.CurvatureModernExperimentHistoryUI.render,'function');
});
