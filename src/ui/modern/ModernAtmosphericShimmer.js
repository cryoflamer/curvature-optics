/* 138.2: visual (not yet C_n^2-calibrated) atmospheric shimmer.
 * A WebGL fragment shader warps a *cached* physical Canvas. The Canvas upload
 * happens only at capture(), not on animation frames; no rays are retraced.
 * All distances below are screen-space CSS pixels, not metres in the air.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAtmosphericShimmer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VERTEX=[
    'attribute vec2 aPosition;',
    'varying vec2 vUv;',
    'void main(){vUv=0.5*(aPosition+1.0);gl_Position=vec4(aPosition,0.0,1.0);}'
  ].join('\n');
  var FRAGMENT=[
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform sampler2D uImage;',
    'uniform vec2 uResolution;',
    'uniform float uTime;',
    'uniform float uStrength;',
    'uniform float uScale;',
    'uniform float uDrift;',
    'uniform float uSeed;',
    'float hash12(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
    // Analytic gradient of smooth value noise: continuously varying *local*
    // image displacement, not independent random offsets per pixel/frame.
    'vec2 gradNoise(vec2 p){',
    '  vec2 i=floor(p);vec2 f=fract(p);',
    '  vec2 u=f*f*(3.0-2.0*f);vec2 du=6.0*f*(1.0-f);',
    '  float a=hash12(i);float b=hash12(i+vec2(1.0,0.0));',
    '  float c=hash12(i+vec2(0.0,1.0));float d=hash12(i+vec2(1.0,1.0));',
    '  return vec2(mix(b-a,d-c,u.y)*du.x,mix(c-a,d-b,u.x)*du.y);',
    '}',
    'void main(){',
    '  vec2 p=(gl_FragCoord.xy-vec2(uDrift,0.23*uDrift)*uTime)/uScale;',
    '  p+=vec2(uSeed,0.41*uSeed);',
    '  vec2 wiggle=gradNoise(p)+0.30*gradNoise(2.3*p+vec2(13.7,4.2));',
    '  vec2 shift=uStrength*wiggle/uResolution;',
    '  vec2 uv=clamp(vUv+shift,0.5/uResolution,1.0-0.5/uResolution);',
    '  gl_FragColor=texture2D(uImage,uv);',
    '}'
  ].join('\n');
  var DEFAULTS=Object.freeze({intensity:3,scale:54,drift:18,seed:0});
  function settingsFor(input,current){
    var next=Object.assign({},current||DEFAULTS);
    if(!input)return next;
    var bounds={intensity:[0,20],scale:[8,400],drift:[0,250],seed:[-10000,10000]};
    Object.keys(input).forEach(function(key){
      if(!Object.prototype.hasOwnProperty.call(bounds,key))throw RangeError('Unknown shimmer setting: '+key);
      var number=Number(input[key]),range=bounds[key];
      if(!Number.isFinite(number)||number<range[0]||number>range[1])
        throw RangeError('Invalid shimmer '+key+': '+input[key]);
      next[key]=number;
    });
    return next;
  }
  function compile(gl,type,source){
    var shader=gl.createShader(type);
    if(!shader)throw Error('Cannot create WebGL shader');
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
      var info=gl.getShaderInfoLog(shader)||'unknown error';
      gl.deleteShader(shader);throw Error('Shimmer shader: '+info);
    }
    return shader;
  }
  function initialize(target){
    var gl=target.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:false,
      depth:false,stencil:false,premultipliedAlpha:false});
    if(!gl)throw Error('WebGL is unavailable for atmospheric shimmer');
    var vertex=null,fragment=null,program=null,buffer=null,texture=null;
    try{
      vertex=compile(gl,gl.VERTEX_SHADER,VERTEX);
      fragment=compile(gl,gl.FRAGMENT_SHADER,FRAGMENT);
      program=gl.createProgram();if(!program)throw Error('Cannot create shimmer program');
      gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))
        throw Error('Shimmer program: '+(gl.getProgramInfoLog(program)||'link failed'));
      buffer=gl.createBuffer();texture=gl.createTexture();
      if(!buffer||!texture)throw Error('Cannot allocate shimmer GPU buffers');
      gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      var location=gl.getAttribLocation(program,'aPosition');
      if(location<0)throw Error('Shimmer position attribute is absent');
      gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.uniform1i(gl.getUniformLocation(program,'uImage'),0);
      return {gl:gl,program:program,buffer:buffer,texture:texture,
        resolution:gl.getUniformLocation(program,'uResolution'),
        time:gl.getUniformLocation(program,'uTime'),
        strength:gl.getUniformLocation(program,'uStrength'),
        scale:gl.getUniformLocation(program,'uScale'),
        drift:gl.getUniformLocation(program,'uDrift'),
        seed:gl.getUniformLocation(program,'uSeed'),
        uploaded:false,lost:false,uploads:0,frames:0};
    }catch(error){
      if(texture)gl.deleteTexture(texture);
      if(buffer)gl.deleteBuffer(buffer);
      if(program)gl.deleteProgram(program);
      throw error;
    }finally{
      if(vertex)gl.deleteShader(vertex);
      if(fragment)gl.deleteShader(fragment);
    }
  }
  function create(options){
    options=options||{};
    var setting=settingsFor(options.settings),resources=new WeakMap();
    var stats=Object.create(null);
    var errors=Object.create(null);
    function present(source,target,name,meta){
      meta=meta||{};
      var resource=resources.get(target);
      if(!resource){
        resource=initialize(target);
        resources.set(target,resource);
        if(target.addEventListener)target.addEventListener('webglcontextlost',function(event){
          if(event.preventDefault)event.preventDefault();
          resource.lost=true;
        });
      }
      if(resource.lost)throw Error('Atmospheric shimmer WebGL context was lost');
      var gl=resource.gl;
      // upload ONLY on a new physical capture. Never upload on frame().
      if(meta.capture===true){
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,resource.texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        var err=gl.getError();if(err!==gl.NO_ERROR)
          throw Error('Shimmer Canvas texture upload failed (WebGL '+err+')');
        resource.uploaded=true;resource.uploads++;
      }
      if(!resource.uploaded)return false;
      var width=target.width,height=target.height;
      var displayWidth=source.offsetWidth||source.clientWidth||width;
      var pixelRatio=width/displayWidth;
      gl.viewport(0,0,width,height);
      gl.useProgram(resource.program);
      gl.bindBuffer(gl.ARRAY_BUFFER,resource.buffer);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,resource.texture);
      gl.uniform2f(resource.resolution,width,height);
      gl.uniform1f(resource.time,(meta.timeMs===undefined?0:meta.timeMs)/1000);
      gl.uniform1f(resource.strength,setting.intensity*pixelRatio);
      gl.uniform1f(resource.scale,setting.scale*pixelRatio);
      gl.uniform1f(resource.drift,setting.drift*pixelRatio);
      gl.uniform1f(resource.seed,setting.seed);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      resource.frames++;
      stats[name]={uploads:resource.uploads,frames:resource.frames,width:width,height:height};
      delete errors[name];
      return true;
    }
    function dispose(target){
      var r=target&&resources.get(target);
      if(!r)return;
      if(!r.lost){r.gl.deleteTexture(r.texture);r.gl.deleteBuffer(r.buffer);r.gl.deleteProgram(r.program);}
      resources.delete(target);
    }
    return Object.freeze({present:present,dispose:dispose,
      configure:function(next){setting=settingsFor(next,setting);return Object.assign({},setting);},
      getSettings:function(){return Object.assign({},setting);},
      getStats:function(name){return stats[name]?Object.assign({},stats[name]):null;},
      getError:function(name){return errors[name]||null;},
      // The WebGL failure is reported but never takes the physical Canvas away.
      noteError:function(name,error){errors[name]=String(error&&error.message||error);}});
  }
  return Object.freeze({create:create,settingsFor:settingsFor,vertexSource:VERTEX,fragmentSource:FRAGMENT});
}));
