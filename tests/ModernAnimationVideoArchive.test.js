'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const archive=require('../src/animation/ModernAnimationVideoArchive');
// ZIP32 stored entries have CRC32 in both local and central headers.
function entries(buffer){
  const result=[],end=buffer.lastIndexOf(Buffer.from('PK\x05\x06'));
  assert.ok(end>=0,'ZIP end record');
  const count=buffer.readUInt16LE(end+10);
  let cd=buffer.readUInt32LE(end+16);
  for(let i=0;i<count;i++){
    assert.equal(buffer.readUInt32LE(cd),0x02014b50);
    const checksum=buffer.readUInt32LE(cd+16),size=buffer.readUInt32LE(cd+20);
    const nameLength=buffer.readUInt16LE(cd+28),offset=buffer.readUInt32LE(cd+42);
    const name=buffer.toString('utf8',cd+46,cd+46+nameLength);
    assert.equal(buffer.readUInt32LE(offset),0x04034b50);
    assert.equal(buffer.readUInt32LE(offset+14),checksum);
    assert.equal(buffer.readUInt32LE(offset+18),size);
    const start=offset+30+buffer.readUInt16LE(offset+26);
    result.push({name,checksum,data:buffer.subarray(start,start+size)});
    cd+=46+nameLength+buffer.readUInt16LE(cd+30)+buffer.readUInt16LE(cd+32);
  }
  return result;
}
class StreamOnlyBlob extends Blob{
  async arrayBuffer(){throw Error('Whole-file arrayBuffer copy is forbidden');}
}
test('Compare ZIP streams CRC and reuses large immutable Blobs without whole-file copies',async()=>{
  const a=new StreamOnlyBlob([Buffer.alloc(2*1024*1024,0x58)]);
  const b=new StreamOnlyBlob([Buffer.from('H.264 output')]);
  const progress=[];
  const out=await archive.pack([
    {name:'curvature-animation-A.mp4',data:a},
    {name:'curvature-animation-B.mp4',data:b},
    {name:'manifest.json',data:new Blob(['{"format":"mp4"}\n'])}
  ],{onEntry:v=>progress.push(v.completed)});
  assert.equal(out.type,'application/zip');
  const content=Buffer.from(await out.arrayBuffer());
  const files=entries(content);
  assert.deepEqual(files.map(f=>f.name),[
    'curvature-animation-A.mp4','curvature-animation-B.mp4','manifest.json']);
  assert.equal(files[0].data.length,a.size);
  assert.equal(files[0].data[0],0x58);
  assert.equal(files[1].data.toString(),'H.264 output');
  assert.deepEqual(progress,[1,2,3]);
  assert.equal(await archive.checksum(new Blob(['123456789'])),0xcbf43926);
});
test('video ZIP refuses unsafe, duplicate, non-Blob or oversized entries before streaming',async()=>{
  await assert.rejects(archive.pack([{name:'../evil',data:new Blob(['x'])}]),/Invalid/);
  await assert.rejects(archive.pack([{name:'a',data:new Blob(['x'])},
    {name:'a',data:new Blob(['y'])}]),/duplicate/);
  await assert.rejects(archive.pack([{name:'a',data:'not-a-blob'}]),/Blob/);
  class LargeDeclaredBlob extends Blob{
    get size(){return archive.MAX_ARCHIVE_BYTES;}
    stream(){throw Error('Must fail on size before reading');}
  }
  await assert.rejects(archive.pack([{name:'large.webm',data:new LargeDeclaredBlob()}]),/192 MiB/);
});
test('empty and malformed Compare ZIP requests are rejected',async()=>{
  await assert.rejects(archive.pack([]),/Invalid/);
  await assert.rejects(archive.pack([{name:'hello.zip',data:{size:1}}]),/Blob/);
});
