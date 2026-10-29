/* 138.2: visual (not yet C_n^2-calibrated) atmospheric shimmer.
 * A WebGL fragment shader warps a *cached* physical Canvas. The Canvas upload
 * happens on capture() or one context-recovery frame, never on ordinary
 * animation frames; no rays are retraced.
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
    // Smooth displacement (rather than a gradient-of-noise displacement):
    // high-curvature gradient noise folded the image into multiple outlines.
    'float valueNoise(vec2 p){',
    '  vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
    '  float a=hash12(i);float b=hash12(i+vec2(1.0,0.0));',
    '  float c=hash12(i+vec2(0.0,1.0));float d=hash12(i+vec2(1.0,1.0));',
    '  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y)-0.5;',
    '}',
    'void main(){',
    '  if(uStrength==0.0){gl_FragColor=texture2D(uImage,vUv);return;}',
    '  vec2 p=(gl_FragCoord.xy-vec2(uDrift,0.23*uDrift)*uTime)/uScale;',
    '  p+=vec2(uSeed,0.41*uSeed);',
    '  vec2 wiggle=vec2(',
    '    valueNoise(p+vec2(17.2,3.9))+0.25*valueNoise(2.2*p+vec2(5.3,31.6)),',
    '    valueNoise(p+vec2(8.7,23.1))+0.25*valueNoise(2.2*p+vec2(41.4,2.1)));',
    '  vec2 shift=uStrength*wiggle/uResolution;',
    '  vec2 uv=clamp(vUv+shift,0.5/uResolution,1.0-0.5/uResolution);',
    '  gl_FragColor=texture2D(uImage,uv);',
    '}'
  ].join('\n');
  var DEFAULTS=Object.freeze({intensity:3,scale:54,drift:18,seed:0});
  function now(){return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();}
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
    // The physical Canvas has transparent pixels over a white CSS backdrop.
    // An opaque WebGL drawing buffer turns them into solid black regardless
    // of shimmer strength. Preserve the source alpha for browser compositing.
    var gl=target.getContext('webgl',{alpha:true,antialias:false,preserveDrawingBuffer:false,
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
        uploaded:false,lost:false,uploads:0,frames:0,
        timerChecked:false,timerExtension:null,pendingGpuQuery:null};
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
    var setting=settingsFor(options.settings),viewSettings=Object.create(null),resources=new WeakMap();
    var listening=new WeakSet();
    var clocks=Object.create(null);
    var stats=Object.create(null);
    var errors=Object.create(null);
    // Only explicit diagnostics turn on JavaScript timing and GPU timer queries.
    // No gl.finish/readPixels: queries are polled asynchronously on future frames.
    var profiling=false,profileGeneration=0;
    function emit(kind,name,entry){
      var callback=kind==='gpu'?options.onGpuTime:options.onProfile;
      if(typeof callback==='function')try{callback(name,entry);}catch(_error){}
    }
    function gpuTimer(resource,name){
      if(!profiling)return null;
      if(!resource.timerChecked){
        resource.timerChecked=true;
        try{resource.timerExtension=resource.gl.getExtension&&
          resource.gl.getExtension('EXT_disjoint_timer_query');}catch(_error){}
      }
      var ext=resource.timerExtension;
      if(!ext)return null;
      var pending=resource.pendingGpuQuery,gl=resource.gl;
      if(pending){
        try{
          var available=ext.getQueryObjectEXT(pending,ext.QUERY_RESULT_AVAILABLE_EXT);
          if(available){
            var disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);
            if(!disjoint&&resource.pendingGeneration===profileGeneration){
              var ns=ext.getQueryObjectEXT(pending,ext.QUERY_RESULT_EXT);
              if(Number.isFinite(ns)&&ns>=0)emit('gpu',name,{gpuDrawMs:ns/1e6});
            }
            ext.deleteQueryEXT(pending);resource.pendingGpuQuery=null;
          }
        }catch(_error){releaseQuery(resource);resource.timerExtension=null;return null;}
      }
      if(resource.pendingGpuQuery)return null;
      try{
        var query=ext.createQueryEXT();
        if(!query)return null;
        ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,query);
        resource.pendingGpuQuery=query;resource.pendingGeneration=profileGeneration;
        return ext;
      }catch(_error){releaseQuery(resource);resource.timerExtension=null;return null;}
    }
    function releaseQuery(resource){
      if(resource.pendingGpuQuery&&resource.timerExtension){
        try{resource.timerExtension.deleteQueryEXT(resource.pendingGpuQuery);}catch(_error){}
      }
      resource.pendingGpuQuery=null;
    }
    function viewSetting(name){return name&&viewSettings[name]||setting;}
    function resetClock(name){
      // A paused/hidden viewport keeps its phase; its first resumed frame does
      // not advance by the time elapsed off screen.
      if(name) {if(clocks[name])clocks[name].lastMs=null;}
      else Object.keys(clocks).forEach(function(key){clocks[key].lastMs=null;});
    }
    function phaseTime(name,meta){
      var clock=clocks[name]||(clocks[name]={elapsedMs:0,lastMs:null});
      if(meta.capture===true||!Number.isFinite(meta.timeMs))return clock.elapsedMs/1000;
      if(clock.lastMs!==null)clock.elapsedMs+=Math.max(0,Math.min(100,meta.timeMs-clock.lastMs));
      clock.lastMs=meta.timeMs;
      return clock.elapsedMs/1000;
    }
    function observeContext(target,name){
      if(listening.has(target)||!target.addEventListener)return;
      listening.add(target);
      target.addEventListener('webglcontextlost',function(event){
        if(event.preventDefault)event.preventDefault();
        var current=resources.get(target);
        if(current)current.lost=true;
        errors[name]='Atmospheric shimmer WebGL context was lost';
        if(typeof options.onContextLost==='function')options.onContextLost(name);
      });
      target.addEventListener('webglcontextrestored',function(){
        // Old buffers/programs/textures are invalid. Reinitialize lazily on
        // the next frame and upload the *cached* source Canvas, not new rays.
        resources.delete(target);
        if(typeof options.onContextRestored==='function')options.onContextRestored(name);
      });
    }
    function present(source,target,name,meta){
      meta=meta||{};
      var current=viewSetting(name);
      var resource=resources.get(target);
      if(!resource){
        resource=initialize(target);
        resources.set(target,resource);
        observeContext(target,name);
      }
      // Context loss is recoverable: do not tear down the physical scene or
      // permanently disable the overlay while Chromium restores the GPU.
      if(resource.lost)return false;
      var gl=resource.gl,startedAt=profiling?now():0,uploaded=false,uploadedAt=startedAt;
      // Upload on a new physical capture, or once after context restoration.
      // Ordinary animation frames reuse the same texture.
      if(meta.capture===true||!resource.uploaded){
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,resource.texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        var err=gl.getError();if(err!==gl.NO_ERROR)
          throw Error('Shimmer Canvas texture upload failed (WebGL '+err+')');
        resource.uploaded=true;resource.uploads++;uploaded=true;
        if(profiling)uploadedAt=now();
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
      gl.uniform1f(resource.time,phaseTime(name,meta));
      // Max derivative per value-noise component is 1.5/scale;
      // with 0.25 * 2.2 octave the 2D Jacobian norm is bounded by
      // 4.65 * strength/scale. Keep it < 0.75 to avoid local image folding.
      var effectiveIntensity=Math.min(current.intensity,0.16*current.scale);
      gl.uniform1f(resource.strength,effectiveIntensity*pixelRatio);
      gl.uniform1f(resource.scale,current.scale*pixelRatio);
      gl.uniform1f(resource.drift,current.drift*pixelRatio);
      gl.uniform1f(resource.seed,current.seed);
      var activeQuery=gpuTimer(resource,name);
      // These wall-clock values measure JS/WebGL command submission; only
      // the optional EXT query can measure GPU-side draw execution.
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      if(activeQuery)try{activeQuery.endQueryEXT(activeQuery.TIME_ELAPSED_EXT);}
        catch(_error){releaseQuery(resource);resource.timerExtension=null;}
      if(profiling){var finishedAt=now();
        emit('cpu',name,{cpuTotalMs:finishedAt-startedAt,
          cpuUploadMs:uploaded?uploadedAt-startedAt:undefined,
          cpuSubmitMs:finishedAt-(uploaded?uploadedAt:startedAt),uploaded:uploaded});}
      resource.frames++;
      stats[name]={uploads:resource.uploads,frames:resource.frames,width:width,height:height,
        effectiveIntensity:effectiveIntensity};
      delete errors[name];
      return true;
    }
    function dispose(target){
      var r=target&&resources.get(target);
      if(!r)return;
      if(!r.lost){releaseQuery(r);r.gl.deleteTexture(r.texture);r.gl.deleteBuffer(r.buffer);r.gl.deleteProgram(r.program);}
      resources.delete(target);
    }
    return Object.freeze({present:present,dispose:dispose,
      setProfiling:function(value){
        var next=!!value;if(next&&!profiling)profileGeneration++;profiling=next;
      },
      isProfiling:function(){return profiling;},
      // With no viewport, configure remains the legacy DevTools global default;
      // Scene, A and B can each override only their own visual parameters.
      configure:function(next,name){
        if(name){if(!['Scene','A','B'].includes(name))throw RangeError('Unknown shimmer viewport: '+name);
          viewSettings[name]=settingsFor(next,viewSetting(name));
          return Object.assign({},viewSettings[name]);}
        setting=settingsFor(next,setting);return Object.assign({},setting);
      },
      getSettings:function(name){return Object.assign({},viewSetting(name));},
      resetClock:resetClock,
      getStats:function(name){return stats[name]?Object.assign({},stats[name]):null;},
      getError:function(name){return errors[name]||null;},
      // The WebGL failure is reported but never takes the physical Canvas away.
      noteError:function(name,error){errors[name]=String(error&&error.message||error);}});
  }
  return Object.freeze({create:create,settingsFor:settingsFor,vertexSource:VERTEX,fragmentSource:FRAGMENT});
}));
