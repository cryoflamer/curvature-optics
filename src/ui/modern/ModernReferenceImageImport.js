/* Browser ingestion: preserve input bytes; inspect raster dimensions before decode. */
(function(root,factory){
  var api=factory(typeof module==='object'&&module.exports?require('../../animation/ModernReferenceImage'):root.CurvatureModernReferenceImage);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernReferenceImageImport=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(images){
  'use strict';
  function inspect(bytes){
    var v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=bytes.length,w,h,type;
    function ascii(i,len){return String.fromCharCode.apply(null,bytes.subarray(i,i+len));}
    function u24(i){return bytes[i]+256*bytes[i+1]+65536*bytes[i+2];}
    if(n>=33&&ascii(0,8)==='\x89PNG\r\n\x1a\n'&&ascii(12,4)==='IHDR'){
      type='png';w=v.getUint32(16);h=v.getUint32(20);
    }else if(n>=4&&bytes[0]===255&&bytes[1]===216){
      type='jpeg';var i=2;
      while(i+4<=n&&bytes[i]===255){
        while(i<n&&bytes[i]===255)i++;
        var marker=bytes[i++];if(marker===218||marker===217||i+2>n)break;
        var len=v.getUint16(i);if(len<2||i+len>n)break;
        if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&len>=8){
          h=v.getUint16(i+3);w=v.getUint16(i+5);break;
        }i+=len;
      }
    }else if(n>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
      type='webp';var chunk=ascii(12,4);
      if(chunk==='VP8X'){w=u24(24)+1;h=u24(27)+1;}
      else if(chunk==='VP8 '&&ascii(23,3)==='\x9d\x01\x2a'){w=v.getUint16(26,true)&16383;h=v.getUint16(28,true)&16383;}
      else if(chunk==='VP8L'&&bytes[20]===47){var bits=v.getUint32(21,true);w=(bits&16383)+1;h=((bits>>>14)&16383)+1;}
    }
    if(!type||!w||!h||w>32768||h>32768||w*h>100000000)throw RangeError('Unsupported image or invalid/oversized raster dimensions');
    return {type:type,width:w,height:h};
  }
  function dataUrl(bytes,type){
    var chunks=[];for(var i=0;i<bytes.length;i+=32768)chunks.push(String.fromCharCode.apply(null,bytes.subarray(i,i+32768)));
    return 'data:image/'+type+';base64,'+btoa(chunks.join(''));
  }
  async function verify(record,env){
    record=images.validate(record);
    for(var raster of [record.original,record.thumbnail].filter(Boolean)){
      var raw=atob(raster.dataUrl.split(',')[1]),bytes=Uint8Array.from(raw,function(c){return c.charCodeAt(0);});
      var header=inspect(bytes),image=new env.Image();
      if(!raster.dataUrl.startsWith('data:image/'+header.type+';'))throw Error('Image MIME mismatch');
      if(!((raster.width===header.width&&raster.height===header.height)||(raster.width===header.height&&raster.height===header.width)))
        throw Error('Reference image header dimensions mismatch');
      image.src=raster.dataUrl;await image.decode();
      if(image.naturalWidth!==raster.width||image.naturalHeight!==raster.height)throw Error('Reference image decoded dimensions mismatch');
    }
    return record;
  }
  async function ingest(file,id,env){
    if(!file||!Number.isSafeInteger(file.size)||file.size<=0||file.size>images.MAX_ORIGINAL_BYTES)
      throw RangeError('Select a PNG, JPEG or WebP image up to 20 MiB');
    var bytes=new Uint8Array(await file.arrayBuffer());
    if(bytes.length!==file.size)throw Error('Image file length changed');
    var header=inspect(bytes),url=dataUrl(bytes,header.type);
    // Browser decode respects embedded orientation; the view dimensions may swap.
    var image=new env.Image();image.src=url;await image.decode();
    var w=image.naturalWidth,h=image.naturalHeight;
    if(!((w===header.width&&h===header.height)||(w===header.height&&h===header.width)))
      throw Error('Decoded dimensions do not match image header');
    var canvas=env.document.createElement('canvas'),scale=Math.min(1,512/Math.max(w,h));
    canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
    var ctx=canvas.getContext('2d');if(!ctx)throw Error('Thumbnail canvas unavailable');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    var thumbnail=canvas.toDataURL('image/jpeg',0.8);
    var record=images.validate({version:1,id:id,title:(file.name||'Observation').slice(0,200),
      original:{dataUrl:url,width:w,height:h},thumbnail:{dataUrl:thumbnail,width:canvas.width,height:canvas.height}});
    canvas.width=canvas.height=0;return record;
  }
  return Object.freeze({inspect:inspect,dataUrl:dataUrl,ingest:ingest,verify:verify});
}));
