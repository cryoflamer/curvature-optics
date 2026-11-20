/* Independent observation assets, never simulated thumbnails or camera poses.
 * Pure structural validation shared by the future Library, Studio and calibrator.
 * Actual image decoding/dimension verification belongs to the ingestion boundary.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernReferenceImage=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERSION=1,MAX_ORIGINAL_BYTES=20*1024*1024,MAX_THUMBNAIL_BYTES=512*1024;
  var MAX_DIMENSION=32768,MAX_PIXELS=100000000,MAX_THUMBNAIL_DIMENSION=1024;
  var alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var numericFields={cameraHeightM:[-10000,1000000],latitudeDeg:[-90,90],longitudeDeg:[-180,180],
    headingDeg:[0,360],pitchDeg:[-90,90],rollDeg:[-180,180],focalLengthMm:[0.001,1000000],
    equivalentFocalLengthMm:[0.001,1000000],horizontalFovDeg:[0.000001,180],
    verticalFovDeg:[0.000001,180],sensorWidthMm:[0.001,1000],sensorHeightMm:[0.001,1000]};
  var textFields=['cameraModel','lensModel','location','heightDatum','framing'];
  function own(obj,key){return Object.prototype.hasOwnProperty.call(obj,key);}
  function fields(value,required,optional){
    if(!value||typeof value!=='object'||Array.isArray(value)||
      required.some(function(k){return !own(value,k);})||
      Object.keys(value).some(function(k){return !required.includes(k)&&!optional.includes(k);}))
      throw RangeError('Invalid reference image fields');
  }
  function text(value,max,required){
    if(typeof value!=='string'||value.length>max||(required&&!value.trim()))
      throw RangeError('Invalid reference image text');
    return value.trim();
  }
  function id(value){
    if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value))
      throw RangeError('Invalid reference image ID');
    return value;
  }
  function sourceUrl(value){
    var url=text(value,4096,false);
    if(!url)return '';
    if(!/^https?:\/\//i.test(url)||/[\s\u0000-\u001f\u007f\\]/.test(url))
      throw RangeError('Invalid reference image source URL');
    var parsed;
    try{parsed=new URL(url);}catch(error){throw RangeError('Invalid reference image source URL');}
    if(!parsed.hostname||parsed.username||parsed.password)throw RangeError('Invalid reference image source URL');
    return url;
  }
  function dimensions(value,max,pixels){
    if(!Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)||
      value.width<1||value.height<1||value.width>max||value.height>max||value.width*value.height>pixels)
      throw RangeError('Invalid reference image dimensions');
  }
  // Validate canonical base64 without allocating a decoded multi-megabyte copy.
  function raster(value,thumbnail){
    fields(value,['dataUrl','width','height'],[]);
    var max=thumbnail?MAX_THUMBNAIL_BYTES:MAX_ORIGINAL_BYTES;
    dimensions(value,thumbnail?MAX_THUMBNAIL_DIMENSION:MAX_DIMENSION,
      thumbnail?MAX_THUMBNAIL_DIMENSION*MAX_THUMBNAIL_DIMENSION:MAX_PIXELS);
    var url=value.dataUrl;
    if(typeof url!=='string'||url.length>4*Math.ceil(max/3)+64)
      throw RangeError('Reference image exceeds size limit or is not embedded');
    var header=/^data:image\/(png|jpeg|webp);base64,/.exec(url);
    if(!header)throw RangeError('Unsupported reference image type');
    var data=url.slice(header[0].length),padding=data.endsWith('==')?2:data.endsWith('=')?1:0;
    var end=data.length-padding,bytes=data.length/4*3-padding;
    if(!end||data.length%4||bytes>max||/[^A-Za-z0-9+/]/.test(data.slice(0,end))||
      (padding&&alphabet.indexOf(data[end-1])%(padding===2?16:4)!==0))
      throw RangeError('Invalid reference image base64 or size');
    // Reject MIME mismatches; the full decoder still must verify the file.
    var signature=atob(data.slice(0,Math.min(16,data.length)));
    if((header[1]==='png'&&!signature.startsWith('\x89PNG\r\n\x1a\n'))||
      (header[1]==='jpeg'&&!signature.startsWith('\xff\xd8\xff'))||
      (header[1]==='webp'&&!(signature.startsWith('RIFF')&&signature.slice(8,12)==='WEBP')))
      throw RangeError('Reference image MIME does not match signature');
    return Object.freeze({dataUrl:url,width:value.width,height:value.height});
  }
  function fact(value,key){
    fields(value,['status'],['value','notes','uncertainty']);
    if(!['unknown','measured','reported','estimated'].includes(value.status))
      throw RangeError('Invalid reference metadata status');
    var result={status:value.status};
    if(value.status==='unknown'){
      if(own(value,'value')||own(value,'uncertainty'))throw RangeError('Unknown reference metadata has no value');
    }else{
      if(!own(value,'value'))throw RangeError('Missing reference metadata value');
      if(own(numericFields,key)){
        var range=numericFields[key],n=value.value;
        if(typeof n!=='number'||!Number.isFinite(n)||n<range[0]||n>range[1]||
          ((key==='headingDeg'||key.endsWith('FovDeg'))&&n===range[1]))
          throw RangeError('Invalid reference metadata number');
        result.value=n;
        if(own(value,'uncertainty')){
          if(typeof value.uncertainty!=='number'||!Number.isFinite(value.uncertainty)||value.uncertainty<0)
            throw RangeError('Invalid reference metadata uncertainty');
          result.uncertainty=value.uncertainty;
        }
      }else{
        if(own(value,'uncertainty'))throw RangeError('Text reference metadata has no numeric uncertainty');
        result.value=text(value.value,1000,true);
      }
    }
    if(own(value,'notes'))result.notes=text(value.notes,2000,false);
    return Object.freeze(result);
  }
  function metadata(value){
    var keys=Object.keys(numericFields).concat(textFields,['captureDate']);
    fields(value,[],keys);
    var result={};keys.forEach(function(key){if(own(value,key))result[key]=fact(value[key],key);});
    return Object.freeze(result);
  }
  // Metadata-only snapshot for archived calibration provenance. No raster
  // placeholder or local library lookup is needed when validating an archive.
  function validateAttribution(value){
    fields(value,['title'],['description','author','sourceUrl','license','cameraMetadata','notes']);
    var result={title:text(value.title,200,true)};
    ['description','author','license','notes'].forEach(function(key){
      if(own(value,key))result[key]=text(value[key],key==='author'?300:4000,false);
    });
    if(own(value,'sourceUrl'))result.sourceUrl=sourceUrl(value.sourceUrl);
    if(own(value,'cameraMetadata'))result.cameraMetadata=metadata(value.cameraMetadata);
    return Object.freeze(result);
  }
  function validate(value){
    fields(value,['version','id','original','title'],['thumbnail','description','author','sourceUrl','license','cameraMetadata','notes']);
    if(value.version!==VERSION)throw RangeError('Unsupported reference image version');
    var result={version:VERSION,id:id(value.id),original:raster(value.original,false),title:text(value.title,200,true)};
    if(own(value,'thumbnail')&&value.thumbnail!==null)result.thumbnail=raster(value.thumbnail,true);
    var attribution={title:value.title};
    ['description','author','license','notes','sourceUrl','cameraMetadata'].forEach(function(key){
      if(own(value,key))attribution[key]=value[key];
    });
    Object.assign(result,validateAttribution(attribution));
    return Object.freeze(result);
  }
  // An asset catalog owns one record per ID; never silently resolve collisions.
  function validateCollection(values){
    if(!Array.isArray(values))throw RangeError('Invalid reference image collection');
    var seen=new Set();
    return Object.freeze(Array.from(values,function(value){
      var record=validate(value);
      if(seen.has(record.id))throw RangeError('Duplicate reference image ID: '+record.id);
      seen.add(record.id);return record;
    }));
  }
  // Identity is independent of local record IDs and editable provenance.
  // Dimensions refer to the decoder's orientation-aware original raster.
  function validateIdentity(value){
    fields(value,['version','sha256','width','height'],[]);
    if(value.version!==1||typeof value.sha256!=='string'||!/^[0-9a-f]{64}$/.test(value.sha256))
      throw RangeError('Invalid reference photo identity');
    dimensions(value,MAX_DIMENSION,MAX_PIXELS);
    return Object.freeze({version:1,sha256:value.sha256,width:value.width,height:value.height});
  }
  // This hashes structurally valid bytes only. A durable identity must also
  // pass the ingestion decoder; hashing itself does not certify a raster.
  async function originalDigest(record,crypto){
    var original=validate(record).original;
    if(!crypto||!crypto.subtle||typeof crypto.subtle.digest!=='function')
      throw Error('SHA-256 requires Web Crypto in a secure context');
    var raw=atob(original.dataUrl.slice(original.dataUrl.indexOf(',')+1));
    var bytes=Uint8Array.from(raw,function(c){return c.charCodeAt(0);});
    var digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
    if(digest.length!==32)throw Error('Invalid SHA-256 digest');
    return Array.from(digest,function(b){return b.toString(16).padStart(2,'0');}).join('');
  }
  return Object.freeze({VERSION:VERSION,validateIdentity:validateIdentity,validateAttribution:validateAttribution,originalDigest:originalDigest,MAX_ORIGINAL_BYTES:MAX_ORIGINAL_BYTES,
    MAX_THUMBNAIL_BYTES:MAX_THUMBNAIL_BYTES,validate:validate,validateCollection:validateCollection,validId:id});
}));
