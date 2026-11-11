/* Small offline H.264/AVC MP4 muxer. WebCodecs must be configured with
 * avc:{format:'avc'} so each sample uses length-prefixed NAL units and
 * metadata.decoderConfig.description supplies avcC (SPS/PPS). A single
 * non-fragmented, fast-start, video-only MP4 is assembled with a bounded
 * compressed sample budget. Accurate RGBA frames never enter this module.
 * Constrained Baseline is used: samples must arrive in decoding/presentation
 * order, without B-frame reordering (WebCodecs provides PTS, not DTS).
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationMP4Muxer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var MAX_ENCODED=192*1024*1024, TIMESCALE=1000000;
  function assertUint(value,max){
    if(!Number.isSafeInteger(value)||value<0||value>max)
      throw RangeError('MP4 integer out of range');
    return value;
  }
  function b16(v){assertUint(v,65535);return Uint8Array.of(v>>>8,v&255);}
  function b32(v){assertUint(v,0xffffffff);
    return Uint8Array.of((v/0x1000000)&255,(v>>>16)&255,(v>>>8)&255,v&255);
  }
  function b64(v){assertUint(v,Number.MAX_SAFE_INTEGER);
    return new Uint8Array([...b32(Math.floor(v/4294967296)),...b32(v%4294967296)]);
  }
  function ascii(v){return Uint8Array.from(v.split('').map(function(c){return c.charCodeAt(0);}));}
  function box(type){
    var parts=Array.prototype.slice.call(arguments,1),data=new Blob(parts);
    if(type.length!==4||data.size>0xffffffff-8)throw RangeError('Invalid MP4 box size');
    return new Blob([b32(data.size+8),ascii(type),data]);
  }
  function full(type,version,flags){
    return box.apply(null,[type,Uint8Array.of(version,(flags>>>16)&255,(flags>>>8)&255,flags&255)]
      .concat(Array.prototype.slice.call(arguments,3)));
  }
  function matrix(){return new Blob([b32(65536),b32(0),b32(0),b32(0),b32(65536),
    b32(0),b32(0),b32(0x40000000)]);}
  function avccBytes(value){
    if(!value)throw Error('H.264 decoderConfig.description (avcC) is missing');
    var data=Object.prototype.toString.call(value)==='[object ArrayBuffer]'?
      new Uint8Array(value):
      ArrayBuffer.isView(value)?new Uint8Array(value.buffer,value.byteOffset,value.byteLength):null;
    if(!data||data.length<11||data[0]!==1||(data[4]&3)!==3)
      throw Error('Unsupported H.264 avcC: expected 4-byte NAL lengths');
    var pos=6,sps=data[5]&31;
    if(!sps)throw Error('H.264 avcC contains no SPS');
    for(var i=0;i<sps;i++){
      if(pos+2>data.length)throw Error('Truncated H.264 SPS');
      var n=data[pos]*256+data[pos+1];pos+=2+n;
      if(!n||pos>data.length)throw Error('Invalid H.264 SPS');
    }
    if(pos>=data.length)throw Error('H.264 avcC contains no PPS');
    var pps=data[pos++];
    if(!pps)throw Error('H.264 avcC contains no PPS');
    for(var j=0;j<pps;j++){
      if(pos+2>data.length)throw Error('Truncated H.264 PPS');
      var length=data[pos]*256+data[pos+1];pos+=2+length;
      if(!length||pos>data.length)throw Error('Invalid H.264 PPS');
    }
    // AVC profile extensions may follow PPS records; retain them verbatim.
    return data.slice();
  }
  function verifySample(data){
    var pos=0;
    while(pos<data.length){
      if(pos+4>data.length)throw Error('Truncated AVC NAL length');
      var n=data[pos]*16777216+data[pos+1]*65536+data[pos+2]*256+data[pos+3];
      pos+=4;
      if(!n||pos+n>data.length)throw Error('Invalid AVC NAL unit');
      pos+=n;
    }
  }
  function videoEntry(settings,avcc){
    return box('avc1',new Uint8Array(6),b16(1),new Uint8Array(16),
      b16(settings.width),b16(settings.height),b32(0x00480000),b32(0x00480000),
      b32(0),b16(1),new Uint8Array(32),b16(24),b16(65535),box('avcC',avcc));
  }
  function sampleTable(frames,settings,avcc,dataOffset){
    var runs=[];frames.forEach(function(f){
      var prev=runs[runs.length-1];
      if(prev&&prev.duration===f.durationUs)prev.count++;
      else runs.push({duration:f.durationUs,count:1});
    });
    var durations=full('stts',0,0,b32(runs.length),...runs.flatMap(function(r){
      return [b32(r.count),b32(r.duration)];}));
    var sync=frames.map(function(f,i){return f.type==='key'?i+1:0;}).filter(Boolean);
    return box('stbl',
      full('stsd',0,0,b32(1),videoEntry(settings,avcc)),durations,
      full('stsc',0,0,b32(1),b32(1),b32(frames.length),b32(1)),
      full('stsz',0,0,b32(0),b32(frames.length),...frames.map(function(f){return b32(f.data.length);})),
      full('stco',0,0,b32(1),b32(dataOffset)),
      full('stss',0,0,b32(sync.length),...sync.map(b32)));
  }
  function moov(frames,settings,avcc,dataOffset){
    var duration=settings.durationUs;
    var movie=full('mvhd',1,0,b64(0),b64(0),b32(TIMESCALE),b64(duration),
      b32(65536),b16(256),new Uint8Array(10),matrix(),new Uint8Array(24),b32(2));
    var tkhd=full('tkhd',1,7,b64(0),b64(0),b32(1),b32(0),b64(duration),
      new Uint8Array(8),b16(0),b16(0),b16(0),b16(0),matrix(),
      b32(settings.width*65536),b32(settings.height*65536));
    var mdhd=full('mdhd',1,0,b64(0),b64(0),b32(TIMESCALE),b64(duration),b16(0x55c4),b16(0));
    var hdlr=full('hdlr',0,0,b32(0),ascii('vide'),new Uint8Array(12),ascii('VideoHandler\0'));
    var dinf=box('dinf',full('dref',0,0,b32(1),full('url ',0,1)));
    var minf=box('minf',full('vmhd',0,1,b16(0),new Uint8Array(6)),dinf,
      sampleTable(frames,settings,avcc,dataOffset));
    return box('moov',movie,box('trak',tkhd,box('mdia',mdhd,hdlr,minf)));
  }
  function mux(frames,settings,avcc){
    if(!settings||!Number.isInteger(settings.width)||!Number.isInteger(settings.height)||
      settings.width<1||settings.height<1||settings.width>65535||settings.height>65535||
      !Number.isSafeInteger(settings.durationUs)||settings.durationUs<=0||
      !Number.isInteger(settings.frameCount)||!Array.isArray(settings.frames)||
      !Array.isArray(frames)||frames.length!==settings.frameCount)
      throw RangeError('Incomplete MP4 export');
    var config=avccBytes(avcc),bytes=0;
    frames.forEach(function(frame,i){
      var expected=settings.frames[i];
      if(!frame||!expected||frame.timestampUs!==expected.timestampUs||
        frame.durationUs!==expected.durationUs||!['key','delta'].includes(frame.type)||
        !(frame.data instanceof Uint8Array)||!frame.data.length)
        throw Error('Invalid, missing or reordered H.264 sample at '+i);
      verifySample(frame.data);bytes+=frame.data.length;
      if(bytes>MAX_ENCODED)throw RangeError('MP4 compressed data limit exceeded (192 MiB)');
    });
    if(frames[0].type!=='key')throw Error('First H.264 sample must be a key frame');
    var ftyp=box('ftyp',ascii('isom'),b32(512),ascii('isomiso2avc1mp41'));
    var metadata=moov(frames,settings,config,0);
    var offset=ftyp.size+metadata.size+8;
    if(offset+bytes>0xffffffff)throw RangeError('MP4 file exceeds 32-bit chunk offsets');
    metadata=moov(frames,settings,config,offset);
    var data=box('mdat',...frames.map(function(f){return f.data;}));
    return new Blob([ftyp,metadata,data],{type:'video/mp4'});
  }
  function create(settings){
    var frames=[],avcc=null,total=0,last=-1;
    return Object.freeze({
      add:function(chunk,durationUs,metadata){
        if(!chunk||!Number.isSafeInteger(chunk.timestamp)||!Number.isSafeInteger(durationUs)||
          durationUs<=0||!['key','delta'].includes(chunk.type)||
          !Number.isInteger(chunk.byteLength)||chunk.byteLength<5)
          throw Error('Invalid H.264 output sample');
        if(chunk.timestamp<=last)throw Error('H.264 output reordered; MP4 requires no B frames');
        if(metadata&&metadata.decoderConfig&&metadata.decoderConfig.description){
          var extra=avccBytes(metadata.decoderConfig.description);
          if(avcc&&(!extra.every(function(b,i){return avcc[i]===b;})||extra.length!==avcc.length))
            throw Error('H.264 decoder configuration changed during export');
          avcc=extra;
        }
        total+=chunk.byteLength;
        if(total>MAX_ENCODED)throw RangeError('MP4 compressed data limit exceeded (192 MiB)');
        var data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);verifySample(data);
        frames.push({timestampUs:chunk.timestamp,durationUs:durationUs,
          type:chunk.type,data:data});last=chunk.timestamp;
      },
      finish:function(){return mux(frames,settings,avcc);},
      count:function(){return frames.length;},bytes:function(){return total;}
    });
  }
  return Object.freeze({create:create,mux:mux,MAX_ENCODED:MAX_ENCODED});
}));
