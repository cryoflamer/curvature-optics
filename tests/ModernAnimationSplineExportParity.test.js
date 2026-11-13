'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const state=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
const projects=require('../src/animation/ModernAnimationProject');
const playback=require('../src/animation/ModernAnimationPlayback');
const png=require('../src/animation/ModernAnimationFrameExport');
const video=require('../src/animation/ModernAnimationVideoPipeline');

const signature=c=>[c.Height,c.CameraEast,c.CameraNorth,c.Pan,c.Nick,c.Roll,c.FocalLengthField];
const proofSignature=c=>[c.Height,c.FocalLengthField,c.Pan,c.Nick,c.Roll,
  c.CameraEast,c.CameraNorth,c.viewcenterHorizon,c.deviceRatio];
const pngMagic=Uint8Array.from([137,80,78,71,13,10,26,10]);
function make(mode='compare',interpolation='spline'){
  const model={Height:15,FocalLengthField:1200,Pan:175,Nick:0,Roll:170,
    CameraEast:0,CameraNorth:0,viewcenterHorizon:3,deviceRatio:1.5,
    showModel:1,rEarth:6371000,showGrid:0,DemoText:'Spline parity',Description:'',
    ObjType:[3,3],NObjects:[1,0],ObjDist:[1000,20000],ObjDeltaDist:[300,300],
    ObjSideType:[0,0],ObjSidePos:[35,25],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  const first=state.capture(model,{atmosphere:'vacuum',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},
  compare.preset('globe-flat-vacuum'),{mode,eyeLevel:false,horizon:false,selected:'A'});
  const positions=[
    {Height:15,CameraEast:0,CameraNorth:0,Pan:175,Roll:170,FocalLengthField:1200},
    {Height:40,CameraEast:25,CameraNorth:30,Pan:-170,Roll:-175,FocalLengthField:1400},
    {Height:9,CameraEast:60,CameraNorth:45,Pan:-155,Roll:-170,FocalLengthField:950},
    {Height:80,CameraEast:95,CameraNorth:10,Pan:-130,Roll:-150,FocalLengthField:1700}
  ];
  const times=[{holdMs:200},{travelMs:600,holdMs:300},
    {travelMs:1000,holdMs:0},{travelMs:800,holdMs:100}];
  const frames=positions.map((pose,i)=>{
    const experiment=structuredClone(first);
    Object.assign(experiment.scene.camera,pose);
    return {experiment,...times[i],name:'Keyframe '+(i+1)};
  });
  return projects.create(frames,{id:'spline_parity',name:'Spline export parity',
    mode:'camera',interpolation});
}
function canvas(width,height){
  return {width,height,getContext(){return {save(){},restore(){},setTransform(){},fillRect(){}};},
    async convertToBlob(){return new Blob([pngMagic],{type:'image/png'});}};
}
function renderCapture(list){
  return async(sample,side,opts)=>{
    list.push({side,timeMs:opts.timeMs,camera:signature(sample.scene.camera),
      aSurface:sample.compare.A.surface,bSurface:sample.compare.B.surface});
    return {quality:'accurate',metrics:{opticalQuality:'accurate'},
      canvas:canvas(opts.width,opts.height)};
  };
}
class Frame{
  constructor(source,options){this.source=source;this.timestamp=options.timestamp;
    this.duration=options.duration;this.closed=false;}
  close(){this.closed=true;}
}
function expectedAt(project,timeMs){
  const preview=playback.create(project);
  preview.seek(timeMs,0);
  return signature(preview.sample().scene.camera);
}

test('Spline parity proof checks first, middle and last travel, not only first transition',()=>{
  const p=make(),proof=projects.splineProof(p);
  assert.deepEqual(proof.map(row=>row[0]),[500,1600,2500]);
  for(const row of proof)assert.deepEqual(row.slice(1),
    proofSignature(projects.sampleAt(p,row[0]).scene.camera));
  const edited=structuredClone(p);
  edited.keyframes[3].value.Height=110;
  const changed=projects.splineProof(edited);
  assert.deepEqual(changed[0],proof[0], 'first transition is unaffected by later change');
  assert.notDeepEqual(changed[2],proof[2], 'later changes are detected before exporting');
  assert.equal(projects.splineProof(make('compare','linear')),null);
  const many=structuredClone(p);
  many.keyframes.push(...Array.from({length:18},(_,i)=>({
    ...structuredClone(many.keyframes[3]),name:'Extra '+i,travelMs:600,holdMs:0})));
  assert.equal(projects.splineProof(many).length,8,'initialization proof stays bounded');
});

for(const mode of ['scene','compare']){
  test('Spline Preview matches PNG and video sample states in '+mode+' mode',async()=>{
    const p=make(mode),options={fps:5,width:640,height:360};
    const pp=png.plan(p,options),pngCalls=[],pngFrames=[];
    assert.equal(pp.durationMs,3000);
    for(let index=0;index<pp.timesMs.length;index++){
      const frame=await png.renderTimestamp(pp,index,renderCapture(pngCalls));
      pngFrames.push(frame);
    }
    const assembled=png.assemble(pp,pngFrames);
    assert.equal(assembled.manifest.cameraInterpolation,'spline');
    assert.equal(assembled.manifest.project.interpolation,'spline');
    assert.equal(assembled.manifest.endpointIncluded,true);
    assert.equal(assembled.manifest.quality,'accurate');
    assert.equal(assembled.manifest.frames.at(-1).timeMs,3000);
    for(const call of pngCalls)
      assert.deepEqual(call.camera,expectedAt(p,call.timeMs));

    const layouts=mode==='compare'?['side-by-side','separate']:[null];
    for(const layout of layouts){
      const vp=video.plan(p,{...options,...(layout?{compareLayout:layout}:{})});
      const videoCalls=[];
      const output=[];
      for(let index=0;index<vp.frameCount;index++){
        const composite=(images,timing)=>{
          assert.deepEqual(Object.keys(images),['A','B']);
          assert.equal(timing.timeMs,vp.frames[index].sampleTimeMs);
          return canvas(vp.outputWidth,vp.outputHeight);
        };
        const bundle=await video.renderTimestamp(vp,index,renderCapture(videoCalls),Frame,
          null,layout==='side-by-side'?composite:undefined);
        assert.equal(bundle.sampleTimeMs,vp.frames[index].sampleTimeMs);
        assert.deepEqual(Object.keys(bundle.frames),Array.from(vp.outputSides));
        for(const frame of Object.values(bundle.frames)){
          assert.equal(frame.timestamp,vp.frames[index].timestampUs);
          assert.equal(frame.duration,vp.frames[index].durationUs);
        }
        output.push(bundle);
        video.closeFrames(bundle);
        assert.ok(Object.values(bundle.frames).every(frame=>frame.closed));
      }
      // Video's final display interval deliberately samples the exact endpoint;
      // the inclusive PNG sequence contains that same endpoint as an extra PNG.
      assert.equal(vp.frames.at(-1).sampleTimeMs,pp.timesMs.at(-1));
      assert.equal(vp.frames.at(-1).timestampUs+vp.frames.at(-1).durationUs,vp.durationUs);
      assert.equal(vp.durationUs,pp.durationMs*1000);
      for(const call of videoCalls){
        assert.deepEqual(call.camera,expectedAt(p,call.timeMs));
        const pngSample=pngCalls.find(entry=>entry.side===call.side&&entry.timeMs===call.timeMs);
        assert.ok(pngSample,'PNG includes every video sampled time: '+call.timeMs);
        assert.deepEqual(call.camera,pngSample.camera);
      }
      if(mode==='compare'){
        for(const time of new Set(videoCalls.map(entry=>entry.timeMs))){
          const sides=videoCalls.filter(entry=>entry.timeMs===time);
          assert.deepEqual(sides.map(row=>row.side),['A','B']);
          assert.deepEqual(sides[0].camera,sides[1].camera);
          assert.notEqual(sides[0].aSurface,sides[0].bSurface);
        }
        assert.equal(output[0].frames.COMBINED!==undefined,layout==='side-by-side');
      }
    }
  });
}

test('old Linear projects remain Linear across plans and PNG manifests',async()=>{
  const p=structuredClone(make('scene','linear'));
  delete p.interpolation;
  const pp=png.plan(p,{fps:5,width:640,height:360});
  const frames=[];
  for(let index=0;index<pp.timesMs.length;index++)
    frames.push(await png.renderTimestamp(pp,index,renderCapture([])));
  assert.equal(png.assemble(pp,frames).manifest.cameraInterpolation,'linear');
  assert.equal(video.plan(p,{fps:5,width:640,height:360}).project.interpolation,undefined);
});
