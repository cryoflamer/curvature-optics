'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const html=read('CurvatureModern.html').replace(/<!--[\s\S]*?-->/g,'');
const app=read('src/ui/modern/ModernApp.js');

// These seven browser-global coordinators were extracted without a bundler.
// Their static loading order is a runtime contract, not just a documentation list.
const coordinators=[
  ['ModernAnimationWorkspaceRecovery','studioRecoveryApi'],
  ['ModernAnimationWorkspaceSwitch','studioSwitchApi'],
  ['ModernAnimationWorkspacePersistence','studioPersistenceApi'],
  ['ModernAnimationLibraryActions','studioLibraryActionsApi'],
  ['ModernAnimationPreviewLifecycle','studioPreviewLifecycleApi'],
  ['ModernAnimationStudioEditing','studioEditingApi'],
  ['ModernAnimationPlaybackControls','studioPlaybackControlsApi']
];
const scripts=[...html.matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/g)]
  .map(match=>match[1].replace(/&amp;/g,'&').split(/[?#]/)[0]);

function escaped(text){return text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

test('all seven extracted Animation coordinators are loaded exactly once before ModernApp',()=>{
  const entry=scripts.indexOf('src/ui/modern/ModernApp.js');
  assert.ok(entry>=0,'Modern entrypoint must be a static script');
  for(const [moduleName,alias] of coordinators){
    const script='src/animation/'+moduleName+'.js';
    assert.equal(scripts.filter(file=>file===script).length,1,script+' must have exactly one load');
    assert.ok(scripts.indexOf(script)<entry,script+' must load before ModernApp');
    const api=require(path.join(root,script));
    assert.equal(typeof api.create,'function',moduleName+' must expose its coordinator factory');
    assert.match(read(script),new RegExp('root\\.Curvature'+escaped(moduleName)+'\\s*=\\s*api'));
    assert.match(app,new RegExp('var '+escaped(alias)+'=root\\.Curvature'+escaped(moduleName)+';'));
    assert.match(app,new RegExp('\\b'+escaped(alias)+'\\.create\\('),alias+' must be used by the app');
  }
  assert.ok(scripts.indexOf('src/animation/ModernAnimationLibrary.js')<
    scripts.indexOf('src/animation/ModernAnimationLibraryActions.js'),
    'the Library model must load before its actions');
});

test('History Restore keeps one error-handled event path without a redundant dead wrapper',()=>{
  assert.doesNotMatch(app,/\bfunction handleHistoryRestore\(/,
    'do not revive the unused History Restore wrapper');
  assert.match(app,/el\('ModernHistoryRestore'\)\.addEventListener\('click',function\(\)\{handle\(function\(\)\{\s*return restoreHistorySnapshot\(historySelectedId\);/);
  assert.match(app,/function handle\(operation\)\{\s*Promise\.resolve\(\)\.then\(operation\)\.catch\(function\(error\)\{historyStatus\(error\.message,true\);\}\);/);
});

test('ModernApp has no plainly unreferenced top-level named function declaration',()=>{
  const declarations=[...app.matchAll(/^  function ([\w$]+)\(/gm)].map(match=>match[1]);
  assert.ok(declarations.length>50,'audit should still see the application functions');
  const unused=declarations.filter(name=>(app.match(new RegExp('\\b'+escaped(name)+'\\b','g'))||[]).length===1);
  assert.deepEqual(unused,[],
    'an isolated name is evidence of an obsolete private handler; review before removal');
});
