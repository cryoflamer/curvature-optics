/* Offline, stored ZIP for Compare A/B video. File payloads stay as immutable
 * Blobs, rather than being materialized as full-size ArrayBuffers a second
 * time. CRC32 is calculated incrementally through Blob.stream(). This is
 * bounded *memory* packaging, not streaming to disk or ZIP64.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationVideoArchive=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var MAX_ARCHIVE_BYTES=192*1024*1024;
  function u16(out,n){out.push(n&255,(n>>>8)&255);}
  function u32(out,n){out.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);}
  var table=null;
  function crcTable(){
    if(!table){table=new Uint32Array(256);for(var i=0;i<256;i++){
      var c=i;for(var j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;
      table[i]=c>>>0;
    }}
    return table;
  }
  async function checksum(blob){
    if(!blob||typeof blob.stream!=='function')
      throw TypeError('Video ZIP requires Blob streaming support');
    var crc=0xffffffff,bytes=0,lookup=crcTable();
    var reader=blob.stream().getReader();
    try{
      for(;;){
        var part=await reader.read();
        if(part.done)break;
        var data=part.value;
        if(!(data instanceof Uint8Array))throw TypeError('Unexpected Blob stream data');
        bytes+=data.byteLength;
        for(var i=0;i<data.length;i++)crc=lookup[(crc^data[i])&255]^(crc>>>8);
      }
    }finally{reader.releaseLock();}
    if(bytes!==blob.size)throw Error('Incomplete video Blob stream');
    return (crc^0xffffffff)>>>0;
  }
  async function pack(files,options){
    options=options||{};
    if(!Array.isArray(files)||!files.length||files.length>65535)
      throw RangeError('Invalid video ZIP entries');
    var seen=new Set(),parts=[],central=[],offset=0;
    var text=new TextEncoder();
    for(var i=0;i<files.length;i++){
      var file=files[i];
      if(!file||typeof file.name!=='string'||
        !/^[A-Za-z0-9_./-]{1,160}$/.test(file.name)||
        file.name.includes('..')||seen.has(file.name))
        throw RangeError('Invalid or duplicate video ZIP entry');
      seen.add(file.name);
      var name=text.encode(file.name);
      var data=file.data instanceof Blob?file.data:
        file.data instanceof Uint8Array?new Blob([file.data]):null;
      if(!data)throw TypeError('Video ZIP data must be Blob or Uint8Array');
      if(!Number.isSafeInteger(data.size)||data.size>0xffffffff)
        throw RangeError('Video ZIP entry too large');
      // Bound the final archive INCLUDING local and central headers, not
      // merely the compressed media payloads. Fail before reading large data.
      var extra=30+46+name.length*2+data.size;
      if(offset+extra+22+central.reduce(function(n,p){return n+p.length;},0)>MAX_ARCHIVE_BYTES)
        throw RangeError('Compare ZIP exceeds 192 MiB; reduce FPS, bitrate or duration');
      var crc=await checksum(data),local=[],cd=[];
      u32(local,0x04034b50);u16(local,20);u16(local,0);u16(local,0);
      u16(local,0);u16(local,0);u32(local,crc);
      u32(local,data.size);u32(local,data.size);u16(local,name.length);u16(local,0);
      var header=Uint8Array.from(local);
      parts.push(header,name,data);
      u32(cd,0x02014b50);u16(cd,20);u16(cd,20);u16(cd,0);u16(cd,0);
      u16(cd,0);u16(cd,0);u32(cd,crc);u32(cd,data.size);u32(cd,data.size);
      u16(cd,name.length);u16(cd,0);u16(cd,0);u16(cd,0);u16(cd,0);
      u32(cd,0);u32(cd,offset);
      central.push(Uint8Array.from(cd),name);
      offset+=header.length+name.length+data.size;
      if(typeof options.onEntry==='function')options.onEntry({completed:i+1,total:files.length});
    }
    var centralSize=central.reduce(function(n,part){return n+part.length;},0),end=[];
    if(offset+centralSize+22>MAX_ARCHIVE_BYTES||offset+centralSize>0xffffffff)
      throw RangeError('Compare ZIP exceeds 192 MiB');
    u32(end,0x06054b50);u16(end,0);u16(end,0);
    u16(end,files.length);u16(end,files.length);u32(end,centralSize);u32(end,offset);u16(end,0);
    return new Blob(parts.concat(central,[Uint8Array.from(end)]),{type:'application/zip'});
  }
  return Object.freeze({pack:pack,checksum:checksum,MAX_ARCHIVE_BYTES:MAX_ARCHIVE_BYTES});
}));
