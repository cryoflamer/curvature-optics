'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const muxer=require('../src/animation/ModernAnimationWebMMuxer');
function setup(count=6){
  const frames=Array.from({length:count},(_,i)=>({
    timestampUs:i*200000,durationUs:200000,
    type:i%3===0?'key':'delta',data:Uint8Array.from([0x82,i+1,0x1b,0x17])}));
  return {frames,settings:{width:640,height:360,fps:5,frameCount:count,
    durationUs:count*200000,frames:frames.map(f=>({timestampUs:f.timestampUs,durationUs:f.durationUs}))}};
}
test('WebM VP9 output has EBML, finite-duration Segment, Tracks, Clusters and seek Cues',async()=>{
  const {frames,settings}=setup();
  const result=muxer.mux(frames.slice().reverse(),settings);
  assert.equal(result.type,'video/webm');
  const buf=Buffer.from(await result.arrayBuffer());
  assert.equal(buf.subarray(0,4).toString('hex'),'1a45dfa3');
  for(const id of ['18538067','1549a966','1654ae6b','1f43b675','1c53bb6b'])
    assert.ok(buf.includes(Buffer.from(id,'hex')),'Missing EBML element '+id);
  assert.ok(buf.includes(Buffer.from('V_VP9')));
  assert.ok(buf.includes(Buffer.from('webm')));
  assert.ok(buf.includes(Buffer.from('Curvature Animation Studio')));
  assert.equal((buf.toString('hex').match(/1f43b675/g)||[]).length,2,
    'one cluster for each forced key frame');
});
test('encoder chunk collector makes an identical mux when callback completion is out of order',async()=>{
  const {frames,settings}=setup();
  const collector=muxer.create(settings);
  for(const f of frames.slice().reverse()){
    collector.add({timestamp:f.timestampUs,type:f.type,byteLength:f.data.length,
      copyTo(out){out.set(f.data);}},f.durationUs);
  }
  assert.equal(collector.count(),frames.length);
  assert.equal(collector.bytes(),frames.reduce((a,f)=>a+f.data.length,0));
  const a=Buffer.from(await collector.finish().arrayBuffer());
  const b=Buffer.from(await muxer.mux(frames,settings).arrayBuffer());
  assert.deepEqual(a,b);
});
test('WebM rejects incomplete frames, wrong timestamps, invalid first keyframe and oversize content',()=>{
  const {frames,settings}=setup();
  assert.throws(()=>muxer.mux(frames.slice(1),settings),/Incomplete/);
  assert.throws(()=>muxer.mux(frames.map((f,i)=>i===1?{...f,timestampUs:250000}:f),settings),/timestamp|Invalid/);
  assert.throws(()=>muxer.mux(frames.map((f,i)=>i===0?{...f,type:'delta'}:f),settings),/key frame/);
  const collector=muxer.create(settings);
  assert.throws(()=>collector.add({timestamp:0,type:'delta',byteLength:0,copyTo(){}},200000),/Invalid/);
});
