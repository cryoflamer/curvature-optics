'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const preview=require('../src/ui/modern/ModernCameraDragPreview');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('137.2.3: image-backed cursor declarations have native fallbacks and usable hotspots',()=>{
  const open=preview.cursorValue('grab'),closed=preview.cursorValue('grabbing');
  assert.match(open,/url\("src\/ui\/modern\/cursors\/hand-open\.png"\) 11 5, grab$/);
  assert.match(closed,/url\("src\/ui\/modern\/cursors\/hand-closed\.png"\) 15 13, grabbing$/);
  assert.equal(preview.cursorValue('crosshair'),'crosshair');
  const css=read('src/ui/modern/ModernApp.css');
  assert.match(css,/\.modern-camera-draggable\{cursor:url\("\.\/cursors\/hand-open\.png"\) 11 5,grab!important/);
  assert.match(css,/\.modern-camera-draggable\.is-camera-dragging\{cursor:url\("\.\/cursors\/hand-closed\.png"\) 15 13,grabbing!important/);
  assert.match(css,/\.modern-camera-dragging-global,.modern-camera-dragging-global \*\{cursor:url\("\.\/cursors\/hand-closed\.png"\)/);
});

test('137.2.3: both raster hand cursors exist, are valid 32x32 PNGs with alpha',()=>{
  for(const name of ['hand-open.png','hand-closed.png']){
    const bin=fs.readFileSync(path.join(root,'src/ui/modern/cursors',name));
    assert.equal(bin.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bin.readUInt32BE(16),32);
    assert.equal(bin.readUInt32BE(20),32);
    assert.equal(bin[25],6,'RGBA cursor should carry transparency');
  }
});

test('137.2.3: stylesheet and JS are cache-busted together',()=>{
  const html=read('CurvatureModern.html');
  assert.match(html,/ModernApp\.css\?v=137\.2\.3/);
  assert.match(html,/ModernCameraDragPreview\.js\?v=137\.2\.3/);
});
