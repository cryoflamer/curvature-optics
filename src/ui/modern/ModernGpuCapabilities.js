/* 140.0: capability discovery only. Does not switch rendering backend or
 * infer hardware acceleration from successful WebGL context creation. */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CurvatureModernGpuCapabilities=api;
}(typeof window!=='undefined'?window:null,function(){
  'use strict';
  function errorText(err){return err&&err.message?String(err.message):String(err);}
  function softwareHint(text){return /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render|lavapipe/i.test(text||'');}
  function webglResult(document,kind){
    var result={status:'unavailable',renderer:'Not disclosed',vendor:'Not disclosed',
      software:'unknown',floatTexture:'unknown',maxTextureSize:null};
    if(!document||typeof document.createElement!=='function')return result;
    var canvas,gl;
    try{
      canvas=document.createElement('canvas');
      if(!canvas||typeof canvas.getContext!=='function')return result;
      gl=canvas.getContext(kind,{alpha:true,antialias:false,failIfMajorPerformanceCaveat:true});
      if(!gl){result.status='unavailable';return result;}
      result.status='available';
      if(typeof gl.getParameter==='function'){
        var ext=gl.getExtension&&gl.getExtension('WEBGL_debug_renderer_info');
        if(ext){result.renderer=String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||'Not disclosed');
          result.vendor=String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)||'Not disclosed');}
        result.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE)||null;
      }
      result.software=softwareHint(result.renderer+' '+result.vendor)?'suspected':'unverified';
      result.floatTexture=kind==='webgl2'?
        (gl.getExtension&&gl.getExtension('EXT_color_buffer_float')?'renderable':'not confirmed'):
        (gl.getExtension&&gl.getExtension('OES_texture_float')?'sampleable':'not confirmed');
    }catch(err){result.status='error';result.error=errorText(err);}
    finally{
      try{if(gl&&gl.getExtension){var lose=gl.getExtension('WEBGL_lose_context');if(lose)lose.loseContext();}}catch(_){}
      // Only the temporary probe context is released; active Scene GPU is untouched.
      gl=null;canvas=null;
    }
    return result;
  }
  async function webgpuResult(navigator){
    if(!navigator||!navigator.gpu||typeof navigator.gpu.requestAdapter!=='function')return {status:'unavailable'};
    try{
      var adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
      if(!adapter)return {status:'unavailable'};
      var result={status:'available',software:'unverified',features:adapter.features?adapter.features.size:null};
      // Adapter information is optional / privacy-restricted. Never label
      // hardware acceleration as verified merely because the adapter exists.
      if(adapter.info){
        result.description=String(adapter.info.description||'');
        result.software=softwareHint(result.description+' '+(adapter.info.architecture||''))?'suspected':'unverified';
      }
      return result;
    }catch(err){return {status:'error',error:errorText(err)};}
  }
  async function probe(environment){
    var env=environment||{};
    var document=env.document;
    var navigator=env.navigator;
    var webgl=webglResult(document,'webgl');
    var webgl2=webglResult(document,'webgl2');
    var webgpu=await webgpuResult(navigator);
    return {webgl:webgl,webgl2:webgl2,webgpu:webgpu,
      hardwareAcceleration:webgl.software==='suspected'||webgl2.software==='suspected'||webgpu.software==='suspected'?
        'software renderer suspected':'unverified',
      guidance:'Availability is not proof of hardware acceleration. Backend selection remains Canvas 2D.'};
  }
  return {probe:probe,webglResult:webglResult,webgpuResult:webgpuResult,softwareHint:softwareHint};
}));
