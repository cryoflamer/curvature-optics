'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const mp4=require('../src/animation/ModernAnimationMP4Muxer');
const avcc=Uint8Array.from([1,66,0,31,255,225,0,3,0x67,0x42,0x1f,1,0,2,0x68,0xce]);
const nal=Uint8Array.from([0,0,0,2,0x65,0x88]);
function settings(n=2){return {width:320,height:180,frameCount:n,
  durationUs:n*40000,frames:Array.from({length:n},(_,i)=>({
    timestampUs:i*40000,durationUs:40000}))};}
function chunk(i=0,type='key',data=nal){return {timestamp:i*40000,
  type,byteLength:data.length,copyTo(out){out.set(data);}};}
test('H.264 mux produces fast-start MP4 with movie/video sample tables',async()=>{
  const mux=mp4.create(settings());
  mux.add(chunk(0),40000,{decoderConfig:{description:avcc.buffer}});
  mux.add(chunk(1,'delta'),40000);
  const output=mux.finish();
  assert.equal(output.type,'video/mp4');
  const buf=Buffer.from(await output.arrayBuffer());
  assert.equal(buf.toString('ascii',4,8),'ftyp');
  assert.equal(buf.toString('ascii',buf.readUInt32BE(0)+4,buf.readUInt32BE(0)+8),'moov');
  for(const tag of ['mvhd','tkhd','mdhd','hdlr','avc1','avcC','stsd','stts','stsz','stsc','stco','stss','mdat'])
    assert.ok(buf.includes(Buffer.from(tag)),tag);
  const mdat=buf.indexOf(Buffer.from('mdat'));
  const stco=buf.indexOf(Buffer.from('stco'));
  assert.equal(buf.readUInt32BE(stco+12),mdat+4);
  assert.equal(mux.count(),2);
});
test('MP4 rejects malformed H.264 samples, out-of-order callbacks and missing avcC',()=>{
  const m=mp4.create(settings());
  assert.throws(()=>m.add(chunk(0,'key',Uint8Array.from([0,0,0,5,0x65,0x88])),40000,
    {decoderConfig:{description:avcc.buffer}}),/NAL/);
  const noConfig=mp4.create(settings());
  noConfig.add(chunk(0),40000);
  noConfig.add(chunk(1,'delta'),40000);
  assert.throws(()=>noConfig.finish(),/avcC/);
  const swapped=mp4.create(settings());
  swapped.add(chunk(1),40000,{decoderConfig:{description:avcc.buffer}});
  assert.throws(()=>swapped.add(chunk(0),40000),/reordered/);
  const incomplete=mp4.create(settings());
  incomplete.add(chunk(0),40000,{decoderConfig:{description:avcc.buffer}});
  assert.throws(()=>incomplete.finish(),/Incomplete MP4/);
  const badType=mp4.create(settings());
  badType.add(chunk(0,'delta'),40000,{decoderConfig:{description:avcc.buffer}});
  badType.add(chunk(1,'delta'),40000);
  assert.throws(()=>badType.finish(),/key frame/);
  const badAvcc=mp4.create(settings());
  assert.throws(()=>badAvcc.add(chunk(0),40000,{decoderConfig:{description:new Uint8Array([1,1,2])}}),/avcC/);
});
test('real H.264 bitstream can be remuxed into MP4 and decoded and seeked',async(t)=>{
  if(spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0||
    spawnSync('ffprobe',['-version'],{stdio:'ignore'}).status!==0){t.skip('ffmpeg and ffprobe not installed');return;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'curvature-mp4-'));
  try{
    const source=path.join(dir,'source.mp4'),out=path.join(dir,'result.mp4');
    const encode=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi',
      '-i','testsrc2=size=320x180:rate=25:duration=1','-frames:v','25',
      '-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-bf','0',
      '-g','10','-movflags','+faststart','-y',source],{encoding:'utf8'});
    if(encode.status!==0){t.skip('ffmpeg libx264 unavailable');return;}
    const file=fs.readFileSync(source),pos=file.indexOf(Buffer.from('avcC'));
    assert.ok(pos>0);
    const len=file.readUInt32BE(pos-4),avcConfig=file.subarray(pos+4,pos-4+len);
    const probe=JSON.parse(spawnSync('ffprobe',['-v','error','-select_streams','v:0',
      '-show_entries','packet=pts,dts,duration,pos,size,flags','-of','json',source],{
      encoding:'utf8'}).stdout).packets;
    assert.equal(probe.length,25);
    assert.ok(probe.every(p=>p.pts===p.dts));
    const plan=settings(25),mux=mp4.create(plan);
    for(let i=0;i<probe.length;i++){
      const p=probe[i],bytes=file.subarray(Number(p.pos),Number(p.pos)+Number(p.size));
      mux.add(chunk(i,p.flags.includes('K')?'key':'delta',bytes),40000,
        i===0?{decoderConfig:{description:avcConfig}}:undefined);
    }
    fs.writeFileSync(out,Buffer.from(await mux.finish().arrayBuffer()));
    const details=JSON.parse(spawnSync('ffprobe',['-v','error','-select_streams','v:0',
      '-show_entries','stream=codec_name,nb_frames,width,height,duration',
      '-of','json',out],{encoding:'utf8'}).stdout).streams[0];
    assert.equal(details.codec_name,'h264');
    assert.equal(Number(details.nb_frames),25);
    assert.equal(Number(details.duration),1);
    assert.equal(details.width,320);assert.equal(details.height,180);
    const decode=spawnSync('ffmpeg',['-v','error','-i',out,'-f','null','-'],{
      encoding:'utf8'});
    assert.equal(decode.status,0,decode.stderr);
    const seek=spawnSync('ffmpeg',['-v','error','-ss','0.5','-i',out,
      '-frames:v','1','-f','null','-'],{encoding:'utf8'});
    assert.equal(seek.status,0,seek.stderr);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
