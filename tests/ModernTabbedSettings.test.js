'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
const code=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');

test('131.1: five exclusive accessible scene settings panels retain the original control IDs',()=>{
  const tabs=['Camera','Surface','Atmosphere','Objects','Display'];
  tabs.forEach((name,index)=>{
    assert.match(html,new RegExp('role="tab" id="ModernSettings'+name+'" aria-controls="ModernPanel'+name+'"'));
    assert.match(html,new RegExp('id="ModernPanel'+name+'" role="tabpanel" aria-labelledby="ModernSettings'+name+'"'+(index?' hidden':'')));
  });
  assert.match(code,/panel\.hidden=!active/);
  assert.match(code,/tab\.setAttribute\('aria-selected',String\(active\)\)/);
  assert.match(code,/event\.key==='ArrowRight'/);
  assert.match(code,/event\.key==='Home'/);
  assert.match(css,/\.modern-settings-panel\[hidden\]\{display:none!important\}/);
  ['ModernHeight','ModernFocal','ModernViewAngle','ModernRadiusKm','ModernAtmosphere','ModernObjectFields0','ModernObjectFields1','ModernGrid'].forEach(id=>assert.match(html,new RegExp('id="'+id+'"')));
});

test('131.1: scene presets live in the scene bar with original IDs and handlers',()=>{
  const main=html.indexOf('<main class="modern-main">');
  assert.ok(main>=0);
  const preset=html.indexOf('id="ModernPreset"');
  assert.ok(preset>main);
  assert.ok(preset<html.indexOf('id="ModernGraphHost"'));
  assert.match(code,/el\('ModernPreset'\).*addEventListener\('change'/);
  assert.match(code,/el\('ModernResetPreset'\).*addEventListener\('click'/);
});

test('131.1: tooltips explain scientific parameters and are keyboard reachable',()=>{
  for(const key of ['ModernCurvature','ModernViewAngle','ModernCameraAim','ModernAtmosphere','ModernOcclusion','ModernNick']){
    assert.match(code,new RegExp(key+':'));
  }
  assert.match(code,/document\.createElement\('button'\)/);
  assert.match(code,/help\.setAttribute\('aria-label'/);
  assert.match(code,/help\.setAttribute\('data-tip'/);
  assert.match(css,/\.modern-help:focus:after/);
  assert.match(css,/\.modern-help:focus-visible/);
  assert.match(code,/model\.ViewAngle\.toFixed\(4\)/);
  assert.doesNotMatch(html,/id="ModernPreset"[\s\S]*id="ModernPreset"/);
});
