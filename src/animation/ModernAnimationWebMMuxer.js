/* Minimal, dependency-free, offline VP9/WebM muxer. Receives only encoded
 * WebCodecs chunks; never holds uncompressed VideoFrames. Segment sizes and
 * CueClusterPositions are calculated from final Blob sizes, with a duration
 * header and keyframe cluster index for ordinary seekable .webm playback.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationWebMMuxer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var MAX_ENCODED=192*1024*1024;
  function bytesHex(hex){
    var out=[];for(var i=0;i<hex.length;i+=2)out.push(parseInt(hex.slice(i,i+2),16));
    return Uint8Array.from(out);
  }
  function unsigned(value){
    if(!Number.isSafeInteger(value)||value<0)throw RangeError('Invalid EBML unsigned integer');
    var parts=[];
    do{parts.unshift(value%256);value=Math.floor(value/256);}while(value);
    return Uint8Array.from(parts);
  }
  function sizeVint(value){
    if(!Number.isSafeInteger(value)||value<0)throw RangeError('Invalid EBML size');
    for(var width=1;width<=8;width++){
      var max=Math.pow(2,7*width)-2; // all-ones is reserved for unknown length
      if(value<=max){
        var out=new Uint8Array(width);
        for(var i=width-1;i>=0;i--){out[i]=value%256;value=Math.floor(value/256);}
        out[0]|=1<<(8-width);return out;
      }
    }
    throw RangeError('WebM segment too large');
  }
  function elem(id,parts){
    var payload=new Blob(Array.isArray(parts)?parts:[parts]);
    return new Blob([bytesHex(id),sizeVint(payload.size),payload]);
  }
  function u(id,n){return elem(id,unsigned(n));}
  function s(id,value){return elem(id,new TextEncoder().encode(value));}
  function float(id,value){
    var data=new ArrayBuffer(8);new DataView(data).setFloat64(0,value,false);
    return elem(id,new Uint8Array(data));
  }
  function simpleBlock(frame,baseMs){
    var ms=Math.round(frame.timestampUs/1000),offset=ms-baseMs;
    if(offset<0||offset>32767)throw RangeError('WebM cluster timestamp overflow');
    var header=Uint8Array.from([0x81,(offset>>>8)&255,offset&255,
      frame.type==='key'?0x80:0x00]);
    return elem('a3',[header,frame.data]);
  }
  function mux(frames,settings){
    if(!settings||!Number.isInteger(settings.width)||!Number.isInteger(settings.height)||
      settings.width<1||settings.height<1||!Number.isSafeInteger(settings.durationUs)||
      settings.durationUs<=0||!Number.isInteger(settings.frameCount)||
      !Array.isArray(frames)||frames.length!==settings.frameCount)
      throw RangeError('Incomplete WebM export');
    var sorted=frames.slice().sort(function(a,b){return a.timestampUs-b.timestampUs;});
    var totalBytes=0;
    sorted.forEach(function(frame,i){
      if(!frame||!Number.isSafeInteger(frame.timestampUs)||
        frame.timestampUs!==settings.frames[i].timestampUs||
        !Number.isSafeInteger(frame.durationUs)||frame.durationUs!==settings.frames[i].durationUs||
        !(frame.data instanceof Uint8Array)||frame.data.length<1||
        !['key','delta'].includes(frame.type))
        throw Error('Invalid, duplicate or missing VP9 video chunk at index '+i);
      totalBytes+=frame.data.byteLength;
      if(totalBytes>MAX_ENCODED)throw RangeError('WebM compressed data limit exceeded (192 MiB)');
    });
    if(sorted[0].type!=='key')throw Error('The first VP9 packet must be a key frame');
    var header=elem('1a45dfa3',[
      u('4286',1),u('42f7',1),u('42f2',4),u('42f3',8),
      s('4282','webm'),u('4287',4),u('4285',2)]);
    var info=elem('1549a966',[
      u('2ad7b1',1000000),s('4d80','Curvature Animation Studio'),
      s('5741','Curvature Animation Studio'),float('4489',settings.durationUs/1000)]);
    var track=elem('ae',[
      u('d7',1),u('73c5',1),u('83',1),s('86','V_VP9'),
      u('23e383',Math.round(1e9/settings.fps)),
      elem('e0',[u('b0',settings.width),u('ba',settings.height)])]);
    var tracks=elem('1654ae6b',track);
    var clusterFrames=[],clusterStart=0,clusters=[],cues=[],offset=info.size+tracks.size;
    function emitCluster(){
      if(!clusterFrames.length)return;
      var payload=[u('e7',clusterStart)];
      clusterFrames.forEach(function(frame){payload.push(simpleBlock(frame,clusterStart));});
      var cluster=elem('1f43b675',payload);
      if(clusterFrames[0].type==='key')cues.push({ms:clusterStart,position:offset});
      clusters.push(cluster);offset+=cluster.size;clusterFrames=[];
    }
    sorted.forEach(function(frame){
      var ms=Math.round(frame.timestampUs/1000);
      if(clusterFrames.length&&(frame.type==='key'||ms-clusterStart>30000))emitCluster();
      if(!clusterFrames.length)clusterStart=ms;
      clusterFrames.push(frame);
    });
    emitCluster();
    var index=elem('1c53bb6b',cues.map(function(cue){
      return elem('bb',[u('b3',cue.ms),elem('b7',[u('f7',1),u('f1',cue.position)])]);
    }));
    var segmentPayload=[info,tracks].concat(clusters,[index]);
    var size=segmentPayload.reduce(function(sum,part){return sum+part.size;},0);
    return new Blob([header,bytesHex('18538067'),sizeVint(size)].concat(segmentPayload),
      {type:'video/webm'});
  }
  function create(settings){
    var frames=[],encodedBytes=0;
    return Object.freeze({
      add:function(chunk,durationUs){
        if(!chunk||!Number.isSafeInteger(chunk.timestamp)||!Number.isSafeInteger(durationUs)||
          durationUs<=0||!['key','delta'].includes(chunk.type)||
          !Number.isInteger(chunk.byteLength)||chunk.byteLength<1)
          throw Error('Invalid VP9 output packet');
        encodedBytes+=chunk.byteLength;
        if(encodedBytes>MAX_ENCODED)throw RangeError('WebM compressed data limit exceeded (192 MiB)');
        var data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
        frames.push({timestampUs:chunk.timestamp,durationUs:durationUs,
          type:chunk.type,data:data});
      },
      finish:function(){return mux(frames,settings);},
      count:function(){return frames.length;},
      bytes:function(){return encodedBytes;}
    });
  }
  return Object.freeze({create:create,mux:mux,MAX_ENCODED:MAX_ENCODED});
}));
