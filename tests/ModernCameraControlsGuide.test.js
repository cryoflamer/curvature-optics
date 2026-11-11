'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
const css=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.css'),'utf8');
const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
const navigation=require('../src/ui/modern/ModernCameraNavigation');
const interaction=require('../src/ui/modern/ModernCameraInteraction');

test('native camera guide follows Scene viewport and lives inside Compare section',()=>{
  const scene=html.indexOf('aria-label="Scene camera controls"');
  const compare=html.indexOf('aria-label="Compare camera controls"');
  assert.ok(scene>html.indexOf('id="ModernGraphHost"'));
  assert.ok(scene<html.indexOf('id="ModernCompareViews"'));
  assert.ok(compare>html.indexOf('id="ModernCompareViews"'));
  assert.ok(compare<html.indexOf('id="ModernComputeTiming"'));
  assert.equal((html.match(/class="modern-camera-controls"/g)||[]).length,2);
  assert.equal((html.match(/class="modern-camera-controls-detail"/g)||[]).length,2);
  assert.match(css,/\.modern-camera-controls>summary:focus-visible/);
  assert.match(css,/@media\(max-width:650px\)/);
  assert.doesNotMatch(html,/id="ModernCameraControlsGuide"/);
});

test('short and expanded guides correctly describe actual camera controls',()=>{
  for(const key of ['KeyW','KeyS','KeyA','KeyD','KeyQ','KeyE',
    'ArrowLeft','ArrowRight','ArrowUp','ArrowDown'])assert.ok(navigation.action(key));
  assert.equal(navigation.action('KeyR'),null);
  assert.match(html,/Shift \+ drag: move sideways \/ vertically/);
  assert.match(html,/Alt \+ wheel: forward \/ back/);
  assert.match(html,/Shift \+ wheel: FOV/);
  assert.match(html,/Shift for ×5 speed or Ctrl for ×0\.2 precision/);
  assert.match(html,/Unmodified wheel: scroll the page/);
  assert.match(app,/mode:event\.shiftKey\?'translate':'rotate'/);
  assert.match(app,/event\.altKey/);
  assert.match(app,/event\.shiftKey/);
  assert.equal(typeof interaction.translate,'function');
  assert.equal(typeof interaction.dolly,'function');
  assert.equal(typeof interaction.focalWheel,'function');
});

test('guide does not introduce camera handlers or run-time dependence',()=>{
  assert.equal((html.match(/<details class="modern-camera-controls"/g)||[]).length,2);
  assert.equal((html.match(/<summary><strong>Camera controls<\/strong>/g)||[]).length,2);
  assert.doesNotMatch(html,/on(?:click|keydown|wheel|pointerdown)\s*=/i);
  assert.match(html,/Keyboard shortcuts are disabled while editing a field/);
});
