'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const overlays=require('../src/scene/CurvatureFullSceneDecorations');
const presets=require('../src/ui/modern/ModernSceneState').PRESETS;
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

function fromPreset(id){
 const preset=presets[id];
 const model={DemoText:preset.name,Description:preset.description,
  NObjects:[0,0],ObjType:[3,3],ObjDeltaDist:[100,100],ObjSideType:[0,0]};
 Object.keys(preset.objects).forEach(key=>{model[key]=[...preset.objects[key]];});
 return model;
}
test('50: geometry summary derives live group totals, span and distinct rows without modifying authorship',()=>{
 const m=fromPreset('pontchartrain'),before=JSON.stringify(m);
 const text=overlays.geometrySummary(m);
 assert.match(text,/Group 1: 85 transmission towers/);
 assert.match(text,/Group 2: 2 transmission towers/);
 assert.match(text,/25 km extent/);
 assert.match(text,/373 m extent/);
 assert.equal(JSON.stringify(m),before);
 m.NObjects[0]=12;m.ObjDeltaDist[0]=500;
 assert.match(overlays.geometrySummary(m),/Group 1: 12 transmission towers.*5\.5 km extent/);
 assert.equal(m.Description,presets.pontchartrain.description,'author description is not rewritten');
 m.NObjects=[0,0];
 assert.equal(overlays.geometrySummary(m),'No scene objects configured');
});
test('50: geometry labels count actual structural objects rather than polygons or underlying skyline buildings',()=>{
 const causeway=overlays.geometrySummary(fromPreset('causeway'));
 assert.match(causeway,/82 bridge supports \(2 rows of 41\)/);
 assert.match(causeway,/38\.7 km extent/);
 assert.match(causeway,/80 road spans/);
 const tensas=overlays.geometrySummary(fromPreset('tensas'));
 assert.match(tensas,/87 Tensas bridge supports/);
 assert.match(tensas,/172 road spans/);
 const soundly=overlays.geometrySummary(fromPreset('soundly'));
 assert.match(soundly,/128 Soundly bridge supports/);
 assert.match(soundly,/254 road spans/);
 assert.match(overlays.geometrySummary(fromPreset('chicago')),/6 skyline sections/);
 assert.match(overlays.geometrySummary(fromPreset('canigou-low')),/40 mountain silhouettes/);
 const grace=overlays.geometrySummary(fromPreset('grace'));
 assert.match(grace,/Group 1: 2 bridge supports/);
 assert.match(grace,/Group 2: 11 mountain silhouettes/);
});
test('50: canvas uses live summary only for Modern title plus description; model, camera and optics remain unmodified',()=>{
 const model=fromPreset('pontchartrain');
 const original=JSON.stringify(model),c=canvas();c.width=800;c.height=530;
 const frame=resizedCamera(800,530);
 const shown=overlays.draw(c,model,frame,{captionMode:'title-description',includeGeometrySummary:true});
 const rendered=c.ops.filter(op=>op[0]==='text').map(op=>op[1]);
 assert(rendered.some(line=>line.includes('85 transmission towers')));
 assert(shown.excludedRects.some(rect=>rect.kind==='demo-geometry'));
 assert.equal(JSON.stringify(model),original);
 c.ops.length=0;model.NObjects[0]=8;
 overlays.draw(c,model,frame,{captionMode:'title-description',includeGeometrySummary:true});
 assert(c.ops.filter(op=>op[0]==='text').some(op=>op[1].includes('8 transmission towers')));
 c.ops.length=0;
 overlays.draw(c,model,frame,{captionMode:'title',includeGeometrySummary:true});
 assert.equal(c.ops.filter(op=>op[0]==='text').some(op=>/towers/.test(op[1])),false);
 c.ops.length=0;
 overlays.draw(c,model,frame,{captionMode:'off',includeGeometrySummary:true});
 assert.equal(c.ops.some(op=>op[0]==='text'),false);
});
