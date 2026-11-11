'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const vm=require('node:vm');
const caps=require('../src/animation/ModernAnimationVideoCapabilities');
class OffscreenCanvas{getContext(name){return name==='2d'?{}:null;}}
test('VP9 and H.264 are probed independently in dedicated worker runtime',async()=>{
  const seen=[];
  const report=await caps.inspectWorker({OffscreenCanvas,VideoFrame:class {},VideoEncoder:{
    async isConfigSupported(config){seen.push(config);return {supported:config.codec.startsWith('vp09')};}
  }},{width:960,height:540,fps:25});
  assert.equal(report.offscreenCanvas2d,true);
  assert.equal(report.videoFrame,true);
  assert.equal(report.videoEncoder,true);
  assert.equal(report.containerMuxerInstalled,false);
  assert.equal(report.codecs[0].supported,true);
  assert.equal(report.codecs[1].supported,false);
  assert.deepEqual(seen.map(x=>x.codec),['vp09.00.10.08','avc1.42E01F']);
  assert.ok(seen.every(c=>c.width===960&&c.height===540&&c.framerate===25));
});
test('missing Worker WebCodecs does not falsely report codec support',async()=>{
  const report=await caps.inspectWorker({OffscreenCanvas});
  assert.ok(report.codecs.every(c=>!c.supported));
  assert.equal(report.videoFrame,false);
  assert.equal(report.videoEncoder,false);
  const withoutCanvas=await caps.inspectWorker({VideoFrame:class{},VideoEncoder:{
    async isConfigSupported(){throw Error('Should not call without Canvas');}
  }});
  assert.ok(withoutCanvas.codecs.every(c=>!c.supported));
});
test('codec exception is isolated; an unsupported profile does not hide another',async()=>{
  const report=await caps.inspectWorker({OffscreenCanvas,VideoFrame:class{},VideoEncoder:{
    async isConfigSupported(c){if(c.codec.startsWith('vp09'))throw Error('VP9 unavailable');
      return {supported:true};}
  }});
  assert.match(report.codecs[0].reason,/VP9 unavailable/);
  assert.equal(report.codecs[1].supported,true);
  assert.throws(()=>caps.configs({fps:24}),/Unsupported/);
  assert.throws(()=>caps.configs({width:0}),/Unsupported/);
});
test('actual video probe Worker entry point imports capability source and reports codecs',async()=>{
  const dir=path.resolve(__dirname,'../src/animation');
  let result;
  const root=vm.createContext({console});root.self=root;
  root.VideoFrame=class{};root.OffscreenCanvas=OffscreenCanvas;
  root.VideoEncoder={async isConfigSupported(c){return {supported:c.codec.startsWith('vp09')};}};
  root.importScripts=(...scripts)=>scripts.forEach(file=>{
    const full=path.join(dir,file);
    vm.runInContext(fs.readFileSync(full,'utf8'),root,{filename:full});
  });
  root.postMessage=value=>{result=value;};
  vm.runInContext(fs.readFileSync(path.join(dir,'ModernAnimationVideoProbeWorker.js'),'utf8'),root);
  await root.self.onmessage({data:{type:'probe',settings:{width:640,height:360,fps:5}}});
  assert.equal(result.type,'video-capabilities');
  assert.equal(result.report.codecs[0].supported,true);
  assert.equal(result.report.codecs[1].supported,false);
  assert.equal(result.report.containerMuxerInstalled,true);
  assert.equal(root.document,undefined);
});
test('capability probe controller creates, uses and terminates worker',async()=>{
  let terminated=0,request;
  class Worker{
    constructor(url){assert.match(url,/ModernAnimationVideoProbeWorker\.js$/);}
    postMessage(value){
      request=value;
      queueMicrotask(()=>this.onmessage({data:{type:'video-capabilities',report:{
        offscreenCanvas2d:true,videoFrame:true,videoEncoder:true,
        containerMuxerInstalled:false,codecs:[
          {format:'webm',codec:'vp09.00.10.08',supported:true,reason:null},
          {format:'mp4',codec:'avc1.42E01F',supported:false,reason:'No H264'}
        ]}}}));
    }
    terminate(){terminated++;}
  }
  const result=await caps.probe({WorkerCtor:Worker,width:640,height:360,fps:10});
  assert.equal(result.codecs[0].supported,true);
  assert.equal(request.settings.fps,10);
  assert.equal(terminated,1);
  await assert.rejects(()=>caps.probe({WorkerCtor:null}),/unavailable/);
});
test('probe rejects malformed worker replies and terminates worker',async()=>{
  let terminated=0;
  class Worker{
    postMessage(){queueMicrotask(()=>this.onmessage({data:{type:'other'}}));}
    terminate(){terminated++;}
  }
  await assert.rejects(()=>caps.probe({WorkerCtor:Worker}),/Invalid video capability response/);
  assert.equal(terminated,1);
});
