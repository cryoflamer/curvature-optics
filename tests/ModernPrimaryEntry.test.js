'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const script=read('src/ui/modern/ModernRoute.js');
const router=require('../src/ui/modern/ModernRoute');

function boot(pathname,search='',hash=''){
  const history=[];
  const location={pathname,search,hash,replace(url){history.push(url);}};
  const context={location,URLSearchParams};
  vm.runInNewContext(script,context,{filename:'ModernRoute.js',timeout:2000});
  return {history,api:context.CurvatureModernRoute};
}

test('bare historical entry boots canonical Modern document without loading a Legacy state',()=>{
  const old=boot('/projects/CurvatureApp.html');
  assert.deepEqual(old.history,['/projects/CurvatureModern.html']);
  assert.equal(old.api.isModern(''),true);
  const modern=boot('/projects/CurvatureModern.html');
  assert.deepEqual(modern.history,[], 'Modern must not rewrite history back to Legacy');
  assert.equal(typeof modern.api.restoreCanonical,'undefined');
});

test('old Modern bookmarks preserve fragment and query exactly once',()=>{
  assert.deepEqual(boot('/x/CurvatureApp.html','?ui=modern&experiment=x%2By','#App').history,
    ['/x/CurvatureModern.html?ui=modern&experiment=x%2By#App']);
  assert.deepEqual(boot('/x/CurvatureApp.html','?experiment=abc','#scene').history,
    ['/x/CurvatureModern.html?experiment=abc#scene']);
  assert.deepEqual(boot('/x/CurvatureApp.html','?unknown=x&v=1','#notes').history,
    ['/x/CurvatureModern.html?unknown=x&v=1#notes']);
});

test('Legacy diagnostics, state, demo, tab and embed bookmarks do not redirect',()=>{
  for(const query of [
    '?ui=legacy','?ui=compare','?state=a%2Bb',
    '?demo=TransLine&pos=5&play=1','?demo=Bedford',
    '?tab=Refr','?pos=4','?play=1','?embed=demos',
    '?state=&experiment=invalid','?ui=legacy&experiment=not-a-legacy-state',
  ]){
    assert.deepEqual(boot('/x/CurvatureApp.html',query,'#App').history,[],query);
  }
  assert.deepEqual(boot('/x/CurvatureApp.html','?ui=modern&demo=Curve').history,
    ['/x/CurvatureModern.html?ui=modern&demo=Curve']);
});

test('real HTML preserves Legacy diagnostics but Modern shares use primary URL',()=>{
  const legacy=read('CurvatureApp.html');
  const modern=read('CurvatureModern.html');
  const codec=read('src/ui/modern/ModernExperimentState.js');
  assert.ok(legacy.indexOf('src/ui/modern/ModernRoute.js')<legacy.indexOf('src/legacy/GraphX3DX.js'));
  assert.match(legacy,/id="MainCanvasRenderer"/);
  assert.match(modern,/href="CurvatureApp\.html\?ui=legacy"/);
  assert.match(modern,/id="ModernDemoFrame"/);
  assert.match(read('src/ui/modern/ModernDemos.js'),/CurvatureDemosHost\.html\?embed=demos/);
  assert.match(codec,/CurvatureApp\\\.html\$\/,\s*'CurvatureModern\.html'/);
  for(const tool of ['tools/capture-legacy-browser.py','tools/check-browser.py'])
    assert.match(read(tool),/CurvatureApp\.html\?ui=legacy/,tool);
});
