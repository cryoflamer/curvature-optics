'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const project=require('../src/animation/ModernAnimationProject');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const frames=require('../src/animation/ModernAnimationFrameExport');
function snapshot(mode='scene'){
  const m={Height:15,FocalLengthField:1000,Pan:0,Nick:0,Roll:0,CameraEast:0,
    CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,showModel:1,rEarth:6371000,
    showGrid:1,DemoText:'Scene',Description:'',ObjType:[3,3],NObjects:[2,0],
    ObjDist:[1000,20000],ObjDeltaDist:[300,300],ObjSideType:[0,0],ObjSidePos:[35,25],
    ObjSideVar:[0,0],ObjSizeType:[0,0],ObjSize:[23,64],ObjSizeVar:[0,0]};
  return state.capture(m,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
  compare.preset('globe-flat-vacuum'),{mode,eyeLevel:false,horizon:true,selected:'A'});
}
function make(mode='scene'){
  const a=snapshot(mode),b=structuredClone(a);
  if(mode==='scene')b.scene.surface.showModel=2;
  else b.compare.A.surface='flat';
  return project.create([{experiment:a,holdMs:0},{experiment:b,travelMs:5000}],
    {id:'export_demo',name:'Earth curvature'});
}
const png=Uint8Array.from([137,80,78,71,13,10,26,10,1,2,3]);
function compositingContext(){return {save(){},restore(){},setTransform(){},fillRect(){}};}
function canvas(w,h){
  let composited=false;
  return {width:w,height:h,getContext(){return {...compositingContext(),
    fillRect(){composited=true;}};},toBlob(cb,type){
    assert.equal(composited,true,'background must be composited before PNG encoding');
    assert.equal(type,'image/png');cb(new Blob([png],{type}));
  }};
}
function entriesFromZip(array){
  const b=Buffer.from(array),entries=[];
  let pos=0;
  while(b.readUInt32LE(pos)===0x04034b50){
    const len=b.readUInt16LE(pos+26),extra=b.readUInt16LE(pos+28);
    const size=b.readUInt32LE(pos+18),name=b.subarray(pos+30,pos+30+len).toString();
    const start=pos+30+len+extra;
    entries.push({name,data:b.subarray(start,start+size)});
    pos=start+size;
  }
  assert.equal(b.readUInt32LE(pos),0x02014b50,'central directory must follow local files');
  return entries;
}
test('time grid is deterministic and contains an exact final Flat sample',()=>{
  const p=make(),a=frames.plan(p,{fps:25,width:960,height:540});
  assert.equal(a.durationMs,5000);
  assert.equal(a.timesMs.length,126);
  assert.deepEqual(a.timesMs.slice(0,4),[0,40,80,120]);
  assert.equal(a.timesMs.at(-1),5000);
  assert.equal(a.sides.join(','),'A');
  assert.equal(project.sampleAt(p,a.timesMs.at(-1)).scene.surface.showModel,2);
  assert.deepEqual(a.timesMs,frames.plan(p,{fps:25,width:960,height:540}).timesMs);
});
test('fixed resolution and memory budget reject unsupported export plans',()=>{
  const p=make();
  assert.throws(()=>frames.plan(p,{fps:24}),/Unsupported/);
  assert.throws(()=>frames.plan(p,{fps:25,width:150,height:100}),/Unsupported/);
  assert.throws(()=>frames.plan(p,{fps:25,width:2500,height:1400}),/Unsupported/);
  const long=structuredClone(p);long.keyframes[1].travelMs=120000;
  assert.throws(()=>frames.plan(long,{fps:25}),/Too many frames/);
});
test('PNG sequence has every deterministic timestamp, a manifest and actual ZIP headers',async()=>{
  const p=make(),before=structuredClone(p),calls=[],updates=[];
  const out=await frames.run({project:p,fps:25,width:640,height:360,
    render:async(sample,side,size)=>{
      calls.push({side,t:size.timeMs,flat:sample.scene.surface.showModel===2});
      return {canvas:canvas(size.width,size.height),quality:'accurate',metrics:
        {opticalQuality:'accurate',timings:{opticsMs:22},unresolved:0,fillUnresolved:0}};
    },yieldUi:async()=>{},onProgress:info=>updates.push(info.completed)});
  assert.equal(out.cancelled,false);
  assert.equal(out.manifest.frameCount,126);
  assert.equal(out.manifest.endpointIncluded,true);
  assert.equal(out.manifest.quality,'accurate');
  assert.equal(out.manifest.backgroundColor,'#ffffff');
  assert.equal(out.manifest.frames[0].renderStats.A.opticsMs,22);
  assert.equal(out.manifest.frames.at(-1).timestampUs,5000000);
  assert.equal(out.manifest.frames.at(-1).images.A,'frames/frame_00125_A.png');
  assert.deepEqual(calls.at(-1),{side:'A',t:5000,flat:true});
  assert.equal(updates.at(-1),126);
  assert.deepEqual(p,before,'no live or project mutation');
  const entries=entriesFromZip(await out.blob.arrayBuffer());
  assert.equal(entries.length,127);
  assert.equal(entries[0].name,'manifest.json');
  const manifest=JSON.parse(entries[0].data.toString('utf8'));
  assert.deepEqual(manifest.frames,out.manifest.frames);
  assert.deepEqual(entries[1].data,Buffer.from(png));
});
test('opaque PNG background matches transparent live Canvas displayed over white',()=>{
  // The real browser uses a white CSS layer under a transparent optical
  // Canvas. Model opaque, transparent and antialiased pixels here, including
  // canvas-state restoration so following renders are unaffected.
  const pixels=[[0,0,0,0],[22,51,74,255],[0,120,240,128]];
  const original=pixels.map(p=>p.slice());
  const state={globalCompositeOperation:'source-over',globalAlpha:0.65,
    fillStyle:'orange',transform:[2,0,0,2,17,12]};
  let saved,rect;
  const ctx={...state,save(){saved={globalCompositeOperation:this.globalCompositeOperation,
    globalAlpha:this.globalAlpha,fillStyle:this.fillStyle,transform:this.transform.slice()};},
    restore(){Object.assign(this,saved);},setTransform(...args){this.transform=args;},
    fillRect(x,y,w,h){
      rect=[x,y,w,h];
      assert.equal(this.globalCompositeOperation,'destination-over');
      assert.equal(this.globalAlpha,1);assert.equal(this.fillStyle,'#fff');
      assert.deepEqual(this.transform,[1,0,0,1,0,0]);
      for(const pixel of pixels){
        const alpha=pixel[3]/255;
        for(let c=0;c<3;c++)pixel[c]=Math.round(pixel[c]*alpha+255*(1-alpha));
        pixel[3]=255;
      }
    }};
  const canvas={width:3,height:1,getContext(type){assert.equal(type,'2d');return ctx;}};
  assert.equal(frames.compositeOpaqueWhite(canvas),canvas);
  assert.deepEqual(rect,[0,0,3,1]);
  assert.deepEqual(pixels,[[255,255,255,255],[22,51,74,255],
    [Math.round(255*127/255),Math.round(120*128/255+255*127/255),
      Math.round(240*128/255+255*127/255),255]]);
  assert.deepEqual({globalCompositeOperation:ctx.globalCompositeOperation,
    globalAlpha:ctx.globalAlpha,fillStyle:ctx.fillStyle,transform:ctx.transform},state);
  assert.deepEqual(original[0],[0,0,0,0]);
});
test('opaque PNG composition requires a usable fixed-size 2D context',()=>{
  assert.throws(()=>frames.compositeOpaqueWhite(null),/Canvas/);
  assert.throws(()=>frames.compositeOpaqueWhite({width:0,height:2,getContext(){return {};}}),/Canvas/);
  assert.throws(()=>frames.compositeOpaqueWhite({width:2,height:2,getContext(){return null;}}),/compositing/);
});
test('Compare exports synchronized A and B PNGs for every timestamp',async()=>{
  const p=make('compare'),record=[];
  const out=await frames.run({project:p,fps:5,width:640,height:360,
    render:async(sample,side,options)=>{record.push([options.index,side,options.timeMs]);
      return {canvas:canvas(640,360),quality:'accurate'};}});
  assert.equal(out.manifest.frameCount,26);
  assert.deepEqual(out.manifest.sides,['A','B']);
  assert.deepEqual(record.slice(0,4),[[0,'A',0],[0,'B',0],[1,'A',200],[1,'B',200]]);
  assert.equal(entriesFromZip(await out.blob.arrayBuffer()).length,53);
});
test('cancel yields and never delivers partial ZIP',async()=>{
  const token={cancelled:false};let called=0;
  const result=await frames.run({project:make(),fps:25,width:640,height:360,cancel:token,
    render:async()=>{called++;return {canvas:canvas(640,360),quality:'accurate'};},
    onProgress:info=>{if(info.completed===3)token.cancelled=true;}});
  assert.deepEqual({cancelled:result.cancelled,framesCompleted:result.framesCompleted},
    {cancelled:true,framesCompleted:3});
  assert.equal(result.blob,undefined);
  assert.equal(called,3);
});
test('approximated or wrong-size renders and PNG errors fail without an archive',async()=>{
  const setup={project:make(),fps:25,width:640,height:360};
  await assert.rejects(()=>frames.run({...setup,render:async()=>({
    canvas:canvas(640,360),quality:'fast'})}),/Accurate RK4/);
  await assert.rejects(()=>frames.run({...setup,render:async()=>({
    canvas:canvas(640,360),quality:'accurate',metrics:{opticalQuality:'fast'}})}),/Accurate RK4/);
  await assert.rejects(()=>frames.run({...setup,render:async()=>({
    canvas:canvas(800,360),quality:'accurate'})}),/fixed resolution/);
  await assert.rejects(()=>frames.run({...setup,render:async()=>({
    canvas:{width:640,height:360,getContext(){return compositingContext();},
      toBlob(cb){cb(null);}},quality:'accurate'})}),/encoding failed/);
  await assert.rejects(()=>frames.run({...setup,render:async()=>({
    canvas:{width:640,height:360,getContext(){return null;},
      toBlob(cb){cb(new Blob([png],{type:'image/png'}));}},quality:'accurate'})}),
    /compositing/);
});
test('isolated GraphX3DX adapter has private window, camera and fixed canvas',()=>{
  class Viewport{SetViewport(){this.WinTrans.OffsetX=22;this.VpTrans.ScaleX=4;}
    SetCamera(){this.Camera.Zoom=99;}UpdateCanvasSize(){throw Error('unexpected resize');}}
  const original=Object.assign(new Viewport(),{Camera:{Zoom:1},WinTrans:{OffsetX:2},
    VpTrans:{ScaleX:1},CanvasTrans:{ScaleX:1},ObjTrans:{OffsetX:0},
    Canvas:{width:700,height:400},ContextScale:2,TransByName:{window:null,viewport:null}});
  original.TransByName.window=original.WinTrans;
  const cloned=frames.graphForCanvas(original,{width:640,height:360,getContext(){return {}}});
  cloned.SetViewport();cloned.SetCamera();cloned.UpdateCanvasSize();
  assert.equal(original.WinTrans.OffsetX,2);
  assert.equal(original.Camera.Zoom,1);
  assert.equal(original.VpTrans.ScaleX,1);
  assert.equal(cloned.ContextScale,1);
  assert.equal(cloned.CanvasTrans.Width,640);
  assert.equal(cloned.CanvasTrans.Height,360);
  assert.equal(original.CanvasTrans.Width,undefined);
  assert.equal(cloned.CanvasWidth,640);
  assert.equal(cloned.CanvasHeight,360);
  assert.equal(cloned.TransByName.window,cloned.WinTrans);
});
test('browser script loads without CommonJS and exposes export API',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/animation/ModernAnimationFrameExport.js'),'utf8');
  const context={CurvatureModernAnimationProject:project,Blob,TextEncoder,Uint8Array};
  vm.runInNewContext(source,context,{filename:'ModernAnimationFrameExport.js'});
  assert.equal(context.CurvatureModernAnimationFrameExport.plan(make()).timesMs.length,126);
});
test('OffscreenCanvas PNG encoding works without callback toBlob',async()=>{
  const out=await frames.run({project:make(),fps:5,width:640,height:360,
    render:async()=>({canvas:{width:640,height:360,getContext(){return compositingContext();},
      convertToBlob:async opts=>{
        assert.equal(opts.type,'image/png');return new Blob([png],{type:'image/png'});
      }},quality:'accurate'})});
  assert.equal(out.manifest.frameCount,26);
  assert.equal(entriesFromZip(await out.blob.arrayBuffer()).length,27);
});
test('Modern export uses a Web Worker and never does optical painting on the UI thread',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../CurvatureModern.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.js'),'utf8');
  assert.match(html,/src="src\/animation\/ModernAnimationFrameExport\.js"/);
  assert.match(html,/src="src\/animation\/ModernAnimationBackgroundExport\.js"/);
  assert.ok(html.indexOf('ModernAnimationFrameExport.js')<html.indexOf('ModernAnimationBackgroundExport.js'));
  assert.ok(html.indexOf('ModernAnimationBackgroundExport.js')<html.indexOf('src/ui/modern/ModernApp.js'));
  assert.match(html,/id="ModernAnimationFrameExportStart"/);
  assert.match(html,/id="ModernAnimationFrameExportCancel"/);
  const code=js.slice(js.indexOf('  function bindStudioFrameExport(){'),
    js.indexOf('  function bindStudioPlayback(){'));
  assert.match(code,/controller\.start\(/);
  assert.match(code,/controller\.cancel\(/);
  assert.doesNotMatch(code,/api\.run\(|graphForCanvas\(|painter\.render\(|applyExperiment\(|queueHistoryAuto\(/);
  assert.match(code,/studioApi\.build\(studioDraft/);
});
