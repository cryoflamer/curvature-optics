'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('src/ui/modern/ModernApp.js','utf8');
const html=fs.readFileSync('CurvatureModern.html','utf8');
const autosave=require('../src/animation/ModernAnimationDraftAutosave');
const studio=require('../src/animation/ModernAnimationStudio');

test('new Studio previews default to Canvas Direct, Auto FPS and <=1 pixel outlines',()=>{
  assert.match(app,/var studioPlaybackQuality='canvas-direct'/);
  assert.match(app,/studioPlaybackQuality='canvas-direct';studioLibraryActive=null/);
  assert.match(app,/studioSelectedKey=null;studioPlaybackQuality='canvas-direct'/);
  assert.match(html,/<option value="canvas-direct" selected>/);
  assert.match(html,/<input type="checkbox" id="ModernCanvasDirectThinOutlines" checked>/);
  assert.match(html,/<option value="auto" selected>Auto · display refresh/);
  assert.match(app,/thinOutlines:!thinOutlines\|\|thinOutlines.checked/);
});

test('saved explicit quality remains independent of new defaults and exported project',()=>{
  const before=studio.blank();
  for(const quality of ['auto','accurate','fast','effective-radius','canvas-direct']){
    const value=autosave.checkpoint({draft:before,selectedKey:null,quality,
      prepared:false,positionMs:0},1000);
    assert.equal(value.quality,quality);
    assert.equal(Object.hasOwn(value.draft,'quality'),false);
  }
  assert.deepEqual(studio.blank(),before);
  assert.match(app,/studioPlaybackQuality=saved.quality/);
  assert.match(app,/studioPlaybackQuality=record.quality/);
  assert.match(app,/var exactOptions=\{quality:'accurate',sceneDetail:studioPlaybackDetail/);
});
