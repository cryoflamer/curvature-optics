'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
const helper=source.slice(source.indexOf('  function bindStudioExportPreferences('),source.indexOf('  function exportRendererLabel('));
function reload(storage,disabledDisk=false){
  const nodes={};
  for(const kind of ['Frame','Video']){
    const prefix='ModernAnimation'+kind+'Export';
    for(const [field,values] of Object.entries({Renderer:['accurate','canvas-direct'],Fps:['25','30'],Mode:['simulation','presentation'],Destination:['disk','memory'],Format:['webm','mp4'],Quality:['standard','high'],CompareLayout:['side-by-side','separate']})){
      const options=values.map(value=>({value,disabled:disabledDisk&&value==='disk'}));
      nodes[prefix+field]={type:'select-one',options,value:options.find(o=>!o.disabled).value,addEventListener(event,fn){this.change=fn;}};
    }
    nodes[prefix+'Narrative']={type:'checkbox',checked:true,addEventListener(event,fn){this.change=fn;}};
    nodes[prefix+'Progress']={value:0};
  }
  const context=vm.createContext({sharedPresentationRequested:false,experimentPreview:{live:false},studioExportPreferenceBindings:{},root:{localStorage:storage},newUiEl:id=>nodes[id]});
  vm.runInContext(helper+"\nbindStudioExportPreferences('Frame');bindStudioExportPreferences('Video');",context);
  return nodes;
}
function memory(){const data=new Map();return {data,getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};}
test('independent export settings survive reload without job state',()=>{
  const storage=memory(),a=reload(storage);
  a.ModernAnimationFrameExportRenderer.value='canvas-direct';a.ModernAnimationFrameExportRenderer.change();
  a.ModernAnimationVideoExportFps.value='30';a.ModernAnimationVideoExportFps.change();
  a.ModernAnimationVideoExportNarrative.checked=false;a.ModernAnimationVideoExportNarrative.change();
  a.ModernAnimationVideoExportProgress.value=77;
  const b=reload(storage);
  assert.equal(b.ModernAnimationFrameExportRenderer.value,'canvas-direct');
  assert.equal(b.ModernAnimationVideoExportRenderer.value,'accurate');
  assert.equal(b.ModernAnimationFrameExportFps.value,'25');
  assert.equal(b.ModernAnimationVideoExportFps.value,'30');
  assert.equal(b.ModernAnimationVideoExportNarrative.checked,false);
  assert.equal(b.ModernAnimationVideoExportProgress.value,0);
});
test('outdated, malformed, unavailable and disabled preferences keep defaults',()=>{
  const s=memory();s.data.set('curvature.animation.export.frame.v1',JSON.stringify({Renderer:'obsolete',Destination:'disk',Narrative:'false'}));
  s.data.set('curvature.animation.export.video.v1','{broken');
  const a=reload(s,true);assert.equal(a.ModernAnimationFrameExportRenderer.value,'accurate');assert.equal(a.ModernAnimationFrameExportDestination.value,'memory');assert.equal(a.ModernAnimationFrameExportNarrative.checked,true);assert.equal(a.ModernAnimationVideoExportFps.value,'25');
  const b=reload({getItem(){throw Error('unavailable');},setItem(){throw Error('quota');}});assert.doesNotThrow(()=>b.ModernAnimationVideoExportFps.change());
  assert.doesNotThrow(()=>reload(undefined));
});
