'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const overlays=require('../src/scene/CurvatureFullSceneDecorations');
const camera={pos:[0,-100,50],center:[0,0,0],up:[0,0,1],sceneSize:100,screenSize:1,
 objectZExtend:0,zoom:1,near:.001,pixelTransform:{width:200,height:100,
 scaleX:1,scaleY:-1,offsetX:100,offsetY:50,contextScale:1,
 stroke:{autoScale:false,pixelScale:1,minWidth:1,scaleInt:false,devicePixelRatio:1}}};
const model={FrameCol:'black',sceneWidth:100,sceneHeight:50,
 DemoText:'Visible Title',Description:'A geometric description'};

function resizedCamera(width,height){
 return {...camera,pixelTransform:{...camera.pixelTransform,width:width,height:height,offsetX:width/2,offsetY:height/2}};
}
function canvas(){
 const ops=[];
 const ctx={save(){ops.push(['save']);},restore(){ops.push(['restore']);},beginPath(){ops.push(['begin']);},
 moveTo(x,y){ops.push(['move',x,y]);},lineTo(x,y){ops.push(['line',x,y]);},stroke(){ops.push(['stroke']);},
 measureText(text){return {width:text.length*8};},fillText(text,x,y){ops.push(['text',text,x,y]);}};
 return {width:200,height:100,ops,getContext(){return ctx;}};
}
test('camera aligned frame preserves camera plane, correct edge count and presentation metadata',()=>{
 const p=overlays.framePrimitive(model,camera);
 assert.equal(p.points.length,4);assert.equal(p.closed,true);assert.equal(p.style.lineWidth,2);
 for(const point of p.points){const forward=camera.center.map((v,i)=>v-camera.pos[i]);
  const dot=point.reduce((n,v,i)=>n+(v-camera.center[i])*forward[i],0);
  assert(Math.abs(dot)<1e-9);
 }
 const c=canvas(),result=overlays.draw(c,model,camera);
 assert.equal(result.frameSegments,4);assert.equal(result.captionCount,3);
 const lines=c.ops.filter(x=>x[0]==='text').map(x=>x[1]);
 assert.equal(lines[0],model.DemoText);
 assert.equal(lines.slice(1).join(' '),model.Description);
 assert(result.excludedRects.some(x=>x.kind==='camera-frame'));
 assert(result.excludedRects.some(x=>x.kind==='demo-title'));
});
test('empty text and disabled frame do not inject presentation primitives',()=>{
 const c=canvas(),report=overlays.draw(c,{FrameCol:'',DemoText:'',Description:'Ignored'},camera);
 assert.equal(report.captionCount,0);assert.equal(report.frameSegments,0);
 assert.deepEqual(report.excludedRects,[]);
 assert.deepEqual(c.ops,[]);
});
test('caption boxes retain independent reference layout and do not mutate the model',()=>{
 const m={...model};const c=canvas(),items=overlays.demoBounds(c,m,camera);
 assert.deepEqual(items.map(x=>x.kind),['demo-title','demo-description','demo-description']);
 assert(items[1].baselineY>items[0].baselineY);
 assert(items[2].baselineY>items[1].baselineY);
 assert.equal(items[0].fontSize,20);assert.equal(items[1].fontSize,16);
 assert.deepEqual(m,model);
});
test('Modern workspace can omit canvas captions without changing authored descriptions or frame',()=>{
 const m={...model},c=canvas();
 const result=overlays.draw(c,m,camera,{showCaptions:false});
 assert.equal(result.captionCount,0);
 assert.equal(result.frameSegments,4);
 assert.equal(result.excludedRects.some(x=>/^demo-/.test(x.kind)),false);
 assert.deepEqual(c.ops.filter(x=>x[0]==='text'),[]);
 assert.deepEqual(m,model,'scene title and description are retained for UI, history and exports');
});

test('caption modes wrap long text inside narrow viewports',()=>{
 const narrow=canvas();narrow.width=120;narrow.height=160;
 const long={...model,DemoText:'Very long scene title for compare viewport',Description:'Description text should wrap instead of overflowing the image header in Compare mode.'};
 const full=overlays.draw(narrow,long,resizedCamera(120,160),{captionMode:'title-description'});
 const lines=narrow.ops.filter(x=>x[0]==='text').map(x=>x[1]);
 assert(lines.length>=3,'long title and description should wrap into several lines');
 assert.equal(lines[0],'Very long');
 assert.equal(lines.slice(2).join(' ').includes('Description text should'),true);
 assert.equal(full.captionCount,lines.length);
 const titleOnlyCanvas=canvas();titleOnlyCanvas.width=120;titleOnlyCanvas.height=160;
 overlays.draw(titleOnlyCanvas,long,resizedCamera(120,160),{captionMode:'title'});
 assert.equal(titleOnlyCanvas.ops.filter(x=>x[0]==='text').length,2);
 assert.equal(titleOnlyCanvas.ops.filter(x=>x[0]==='text').every(x=>!/Description/.test(x[1])),true);
});
