/* Minimal ZIP store writer (no compression), for browser diagnostic exports. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.GeometryDiagnosticsZip=api;}(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function crc32(bytes){var c=-1;for(var i=0;i<bytes.length;i++){c^=bytes[i];for(var j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^-1)>>>0;}
function u16(n){return [n&255,(n>>>8)&255];}function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
function bytes(s){return new TextEncoder().encode(s);}
function build(entries){
  var local=[],central=[],offset=0;
  entries.forEach(function(e){
    var name=bytes(e.name),data=typeof e.data==='string'?bytes(e.data):e.data;
    if(!(data instanceof Uint8Array))throw new TypeError('Expected Uint8Array or string');
    var crc=crc32(data),size=data.length;
    var head=new Uint8Array([80,75,3,4,...u16(20),...u16(2048),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(size),...u32(size),...u16(name.length),...u16(0)]);
    local.push(head,name,data);
    central.push(new Uint8Array([80,75,1,2,...u16(20),...u16(20),...u16(2048),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(size),...u32(size),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),name);
    offset+=head.length+name.length+size;
  });
  var centralSize=central.reduce(function(n,v){return n+v.length;},0);
  var end=new Uint8Array([80,75,5,6,...u16(0),...u16(0),...u16(entries.length),...u16(entries.length),...u32(centralSize),...u32(offset),...u16(0)]);
  return new Blob(local.concat(central,[end]),{type:'application/zip'});
}
return {build:build,crc32:crc32};
}));
