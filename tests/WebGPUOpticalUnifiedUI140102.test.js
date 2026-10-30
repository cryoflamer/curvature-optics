'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../tools/webgpu-optics.html'),'utf8');

// Execute the actual inline browser handler script against a minimal DOM, instead of
// merely looking for button labels. This catches the #140.10.1 selector regression.
function mount(){
 const panels=Array.from({length:9},(_,i)=>({id:'panel-'+i,hidden:i!==8,children:new Map(),
   querySelector(selector){assert.match(selector,/^#[a-z-]+$/);const id=selector.slice(1);
     if(!this.children.has(id))this.children.set(id,element(id));
     return this.children.get(id);}}));
 function element(id){return {id,disabled:id==='save'||id==='cancel',textContent:'',value:'4',
   handlers:{},addEventListener(type,cb){this.handlers[type]=cb;},
   querySelectorAll(){return [];},reportValidity(){return true;},appendChild(){},click(){},
   async fire(type){assert.ok(this.handlers[type],`missing ${type} listener for ${id}`);
     return this.handlers[type]({preventDefault(){}});}};}
 const choice=element('experiment-choice');
 const elements=new Map([['experiment-choice',choice],...panels.map(p=>[p.id,p])]);
 const document={getElementById(id){assert.ok(elements.has(id),`missing ${id}`);return elements.get(id);},
   createElement(){return element('link');}};
 const script=html.match(/<script>\s*([\s\S]*?)<\/script>/);
 assert.ok(script,'missing inline handlers');
 const ctx={document,fetch:async()=>({ok:true,json:async()=>({scenes:[]})}),
  CurvatureWebGPUSceneSpike14010:{run:async()=>({status:'unavailable',reason:'test runtime unavailable'})},
  CurvatureWebGPUBatchShooting1412:{run:async()=>({decision:{verdict:'INCONCLUSIVE',nextAction:'test GPU'},scenes:[]})},
  CurvatureWebGPUBatchDiagnostics14121:{run:async()=>({decision:{verdict:'INCONCLUSIVE',nextAction:'test diagnostics'},scenes:[]})},
  CurvatureWebGPUPhysicalTolerance14123:{run:async()=>({decision:{verdict:'INCONCLUSIVE',nextAction:'test physical'},scenes:[]})},
  CurvatureWebGPURootRefinement14122:{run:async()=>({decision:{verdict:'INCONCLUSIVE',nextAction:'test refined'},scenes:[],analyticVacuum:{status:'unavailable'}})},
  CurvatureWebGPUOpticsBenchmark:{run:async()=>({status:'unavailable',reason:'test'})},
  CurvatureWebGPUOpticsMatrix1409:{run:async()=>({decision:{verdict:'INCONCLUSIVE',nextAction:'test',stats:{passed:0,total:0,failed:0,unavailable:0,errors:0}},cases:[]})},
  CurvatureWebGPUOpticsPrecision14091:{run:async()=>({decision:{verdict:'INCONCLUSIVE',nextAction:'test',stats:{passed:0,total:0,failed:0},repairedCases:0,baselineFailedCases:0,missingPairs:0,failedAnalyticalChecks:0},cases:[]})},
  Blob,URL:{createObjectURL:()=>'',revokeObjectURL(){}},setTimeout(){}};
 vm.runInNewContext(script[1],ctx,{filename:'tools/webgpu-optics.html'});
 return {panels,choice};
}
test('140.10.2: all nine unified panels actually register run and export handlers',()=>{
 const {panels,choice}=mount();
 for(const [i,p] of panels.entries()){
  assert.equal(typeof (i>=3&&i!==8?p.querySelector('#start'):p.querySelector('#'+(['benchmark','matrix','precision'][i]||'visual-controls'))).handlers[i>=3&&i!==8?'click':'submit'],'function');
  assert.equal(typeof p.querySelector('#save').handlers.click,'function');
 }
 choice.value='2';choice.handlers.change();
 assert.equal(panels[2].hidden,false);
 assert.ok(panels.filter(p=>!p.hidden).length===1);
});
test('140.10.2: clicking scene Run invokes spike and updates its status',async()=>{
 const {panels}=mount(),p=panels[3];
 await p.querySelector('#start').fire('click');
 assert.equal(p.querySelector('#status').textContent,'test runtime unavailable');
 assert.equal(p.querySelector('#start').disabled,false);
 assert.equal(p.querySelector('#save').disabled,false);
});

test('140.12: fifth selector panel invokes GPU batch handler and retains historical modes',async()=>{
 const {panels,choice}=mount();
 choice.value='4';choice.handlers.change();
 assert.equal(panels.filter(p=>!p.hidden).length,1);
 assert.equal(panels[4].hidden,false);
 await panels[4].querySelector('#start').fire('click');
 assert.match(panels[4].querySelector('#status').textContent,/INCONCLUSIVE/);
 assert.equal(panels[4].querySelector('#start').disabled,false);
 assert.equal(panels[4].querySelector('#save').disabled,false);
});

test('140.12.1: sixth diagnostic panel invokes warm/per-target handler and export',async()=>{
 const {panels,choice}=mount();
 choice.value='5';choice.handlers.change();
 assert.equal(panels.filter(p=>!p.hidden).length,1);
 assert.equal(panels[5].hidden,false);
 await panels[5].querySelector('#start').fire('click');
 assert.match(panels[5].querySelector('#status').textContent,/INCONCLUSIVE/);
 assert.equal(panels[5].querySelector('#start').disabled,false);
 assert.equal(panels[5].querySelector('#save').disabled,false);
});

test('140.12.2: seventh panel runs corrected GPU A/B and remains selectable',async()=>{
 const {panels,choice}=mount();
 choice.value='6';choice.handlers.change();
 assert.equal(panels.filter(p=>!p.hidden).length,1);
 assert.equal(panels[6].hidden,false);
 await panels[6].querySelector('#start').fire('click');
 assert.match(panels[6].querySelector('#status').textContent,/INCONCLUSIVE/);
 assert.equal(panels[6].querySelector('#start').disabled,false);
 assert.equal(panels[6].querySelector('#save').disabled,false);
});

test('140.12.3: eighth panel invokes physical qualification and remains selectable',async()=>{
 const {panels,choice}=mount();
 choice.value='7';choice.handlers.change();
 assert.equal(panels.filter(p=>!p.hidden).length,1);
 assert.equal(panels[7].hidden,false);
 await panels[7].querySelector('#start').fire('click');
 assert.match(panels[7].querySelector('#status').textContent,/INCONCLUSIVE/);
 assert.equal(panels[7].querySelector('#start').disabled,false);
 assert.equal(panels[7].querySelector('#save').disabled,false);
});

test('140.12.4: ninth visual-proxy panel submits and exports without adding a new page',async()=>{
 const {panels,choice}=mount();
 choice.value='8';choice.handlers.change();
 assert.equal(panels.filter(p=>!p.hidden).length,1);
 assert.equal(panels[8].hidden,false);
 await panels[8].querySelector('#visual-controls').fire('submit');
 assert.match(panels[8].querySelector('#status').textContent,/INCONCLUSIVE/);
 assert.equal(panels[8].querySelector('#start').disabled,false);
 assert.equal(panels[8].querySelector('#save').disabled,false);
});
