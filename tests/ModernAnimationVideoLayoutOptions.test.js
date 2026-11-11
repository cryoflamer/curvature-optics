'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const video=require('../src/animation/ModernAnimationVideoPipeline');
const background=require('../src/animation/ModernAnimationBackgroundVideoExport');
const pngBackground=require('../src/animation/ModernAnimationBackgroundExport');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function ui(mode){
  const source=read('src/ui/modern/ModernApp.js');
  const start=source.indexOf('  function syncStudioVideoExportLayout(){');
  const stop=source.indexOf('  function syncStudioVideoExportControls(){',start);
  assert.ok(start>=0&&stop>start,'actual UI output description function is available');
  const elements={
    ModernAnimationVideoExportCompareLayout:{value:'side-by-side'},
    ModernAnimationVideoExportCompareLayoutControl:{hidden:true},
    ModernAnimationVideoExportLayoutInfo:{textContent:''},
    ModernAnimationVideoExportSize:{value:'960x540'},
    ModernAnimationVideoExportFormat:{value:'mp4'},
    ModernAnimationVideoExportWorkers:{value:'4'}
  };
  const context=vm.createContext({
    studioDraft:{frames:mode?[{experiment:{display:{mode}}}]:[]},
    studioVideoExportPlan:video,
    studioVideoExportApi:background,
    studioBackgroundExportApi:pngBackground,
    root:{navigator:{hardwareConcurrency:8}},
    newUiEl:id=>elements[id]
  });
  vm.runInContext(source.slice(start,stop)+'\nthis.sync=syncStudioVideoExportLayout;',context);
  context.sync();
  return {elements,sync:context.sync,context};
}

test('one shared layout contract distinguishes Scene, side-by-side and separate Compare outputs',()=>{
  const scene=video.outputLayout('scene',960,540);
  const combined=video.outputLayout('compare',960,540,'side-by-side');
  const separate=video.outputLayout('compare',960,540,'separate');
  assert.deepEqual(Array.from(scene.outputSides),['A']);
  assert.deepEqual(Array.from(combined.outputSides),['COMBINED']);
  assert.deepEqual(Array.from(separate.outputSides),['A','B']);
  assert.equal(scene.compareLayout,null);
  assert.equal(scene.outputWidth,960);assert.equal(scene.outputHeight,540);
  assert.equal(combined.outputWidth,1920);assert.equal(combined.outputHeight,1080);
  assert.equal(separate.outputWidth,960);assert.equal(separate.outputHeight,540);
  assert.equal(combined.rawFrameBytes,separate.rawFrameBytes*2);
  assert.throws(()=>video.outputLayout('scene',960,540,'separate'),/Compare layout/);
  assert.throws(()=>video.outputLayout('compare',960,540,'collage'),/Unsupported/);
});

test('actual UI description changes with Compare mode, frame size, worker credits and format',()=>{
  const {elements:e,sync}=ui('compare');
  assert.equal(e.ModernAnimationVideoExportCompareLayoutControl.hidden,false);
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/1 × 1920×1080 MP4 video/);
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/RGBA handoff 7\.9 MiB\/timestamp/);
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/excludes renderer Canvas and codec memory/);
  e.ModernAnimationVideoExportCompareLayout.value='separate';
  sync();
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/2 × 960×540 MP4 videos in one ZIP/);
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/RGBA handoff 4\.0 MiB\/timestamp/);
  e.ModernAnimationVideoExportFormat.value='webm';
  e.ModernAnimationVideoExportSize.value='1280x720';
  e.ModernAnimationVideoExportWorkers.value='1';
  sync();
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/2 × 1280×720 WEBM videos in one ZIP/);
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/2 frames/);
});

test('Scene UI hides Compare choice and still describes one video',()=>{
  const {elements:e,sync,context}=ui('scene');
  assert.equal(e.ModernAnimationVideoExportCompareLayoutControl.hidden,true);
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/1 × 960×540 MP4 video/);
  e.ModernAnimationVideoExportCompareLayout.value='separate';
  sync();
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/1 × 960×540 MP4 video/);
  context.studioDraft.frames=[];
  sync();
  assert.equal(e.ModernAnimationVideoExportCompareLayoutControl.hidden,true);
  assert.match(e.ModernAnimationVideoExportLayoutInfo.textContent,/Add compatible keyframes/);
});

test('Compare selection is wired into both the plan and Worker export start',()=>{
  const html=read('CurvatureModern.html'),app=read('src/ui/modern/ModernApp.js');
  const css=read('src/ui/modern/ModernApp.css');
  assert.match(html,/id="ModernAnimationVideoExportCompareLayoutControl"[^>]*hidden/);
  assert.match(html,/value="side-by-side" selected/);
  assert.match(html,/value="separate"/);
  assert.match(css,/label\[hidden\]\{display:none!important\}/);
  assert.match(app,/newUiEl\('ModernAnimationVideoExportCompareLayout'\)\.value:undefined/);
  assert.match(app,/height:size\[1\],compareLayout:compareLayout/);
  assert.match(app,/compareLayout:plan\.compareLayout/);
  assert.match(app,/addEventListener\('change',syncStudioVideoExportLayout\)/);
});

test('memory preview uses exactly the scheduler credit-window budget',()=>{
  for(const size of [[640,360],[960,540],[1280,720]]){
    for(const layout of ['side-by-side','separate']){
      const info=video.outputLayout('compare',size[0],size[1],layout);
      const window=background.frameWindow(info,4);
      assert.ok(info.rawFrameBytes*window<=background.MAX_INFLIGHT_RGBA_BYTES);
      assert.equal(info.rawFrameBytes,
        info.outputWidth*info.outputHeight*4*info.outputSides.length);
    }
  }
});
