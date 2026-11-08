/* 138.1: optional presentation-only layer for atmospheric turbulence.
 * The original GraphX3DX Canvas remains the ray-traced source and pointer
 * target. Scene pixels are captured before reference annotations are painted;
 * annotations stay sharp on their own transparent presentation Canvas.
 * No animation, turbulence model or extra work is enabled by default.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAtmosphericPresentation=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var names=['Scene','A','B'];
  function create(options){
    options=options||{};
    var doc=options.document||(typeof document!=='undefined'?document:null);
    var onRemove=options.onRemove||function(){};
    var present=options.present||function(source,target){
      var ctx=target.getContext('2d');
      if(!ctx)throw TypeError('Presentation Canvas 2D context unavailable');
      ctx.clearRect(0,0,target.width,target.height);
      ctx.drawImage(source,0,0);
    };
    var slots=Object.create(null);
    names.forEach(function(name){slots[name]={enabled:false,source:null,host:null,
      image:null,guides:null,oldOpacity:null,suspended:false,gpuLost:false};});
    function slot(name){
      if(!Object.prototype.hasOwnProperty.call(slots,name))throw RangeError('Unknown presentation viewport: '+name);
      return slots[name];
    }
    function remove(s){
      if(s.source&&s.source.style&&s.oldOpacity!==null)s.source.style.opacity=s.oldOpacity;
      if(s.image)onRemove(s.image);
      [s.image,s.guides].forEach(function(canvas){
        if(canvas&&canvas.parentNode)canvas.parentNode.removeChild(canvas);
      });
      s.source=null;s.host=null;s.image=null;s.guides=null;s.oldOpacity=null;s.suspended=false;s.gpuLost=false;
    }
    function setEnabled(name,value){
      var s=slot(name),enabled=!!value;
      if(s.enabled===enabled)return false;
      s.enabled=enabled;
      if(!enabled)remove(s);
      // Caller must redraw after turning OFF: annotations from the previous
      // active frame were drawn on the separate guide layer.
      return true;
    }
    function overlay(source,role){
      var canvas=doc.createElement('canvas');
      canvas.className='modern-atmospheric-'+role;
      canvas.setAttribute('aria-hidden','true');
      // These canvases are never pointer targets: the real graph handles drag.
      canvas.style.pointerEvents='none';
      canvas.style.position='absolute';
      canvas.style.left='0';canvas.style.top='0';canvas.style.margin='0';
      return canvas;
    }
    function align(s){
      var source=s.source,width=source.width,height=source.height;
      if(!(width>0&&height>0))throw RangeError('Presentation requires nonempty source Canvas');
      // GraphX3DX owns backing resolution/HiDPI; never infer it from CSS px.
      var displayWidth=source.offsetWidth||source.clientWidth||width;
      var displayHeight=source.offsetHeight||source.clientHeight||height;
      [s.image,s.guides].forEach(function(canvas){
        if(canvas.width!==width)canvas.width=width;
        if(canvas.height!==height)canvas.height=height;
        canvas.style.width=displayWidth+'px';canvas.style.height=displayHeight+'px';
        canvas.style.left=(source.offsetLeft||0)+'px';
        canvas.style.top=(source.offsetTop||0)+'px';
      });
      // Always clear old annotations, including when the dimensions did not change.
      s.guides.getContext('2d').clearRect(0,0,width,height);
    }
    function capture(name,graph){
      var s=slot(name);
      if(!s.enabled)return graph;
      var source=graph&&graph.Canvas,host=source&&source.parentNode;
      if(!doc||!source||!host||!host.appendChild||!source.getContext)return graph;
      try{
        if(s.source!==source||s.host!==host){
          remove(s);
          s.source=source;s.host=host;
          s.oldOpacity=source.style.opacity||'';
          s.image=overlay(source,'image');s.guides=overlay(source,'guides');
          host.appendChild(s.image);host.appendChild(s.guides);
        }
        align(s);
        // Presentation strategy is injectable: the 138.2 WebGL path can reuse
        // the clean source Canvas without ever running optical calculations.
        var painted=present(source,s.image,name,{capture:true});
        s.suspended=false;s.gpuLost=painted===false;
        s.image.style.display=s.gpuLost?'none':'';s.guides.style.display='';
        source.style.opacity=s.gpuLost?s.oldOpacity:'0';
        return Object.assign(Object.create(graph),{Canvas:s.guides});
      }catch(error){
        // Never hide an unpainted scene or lose the guides after failure.
        remove(s);
        return graph;
      }
    }
    function frame(name,timeMs){
      var s=slot(name);
      if(!s.enabled||!s.source||!s.image||s.suspended||s.gpuLost)return false;
      try{
        if(present(s.source,s.image,name,{capture:false,timeMs:timeMs})===false){
          contextLost(name);return false;
        }
        return true;
      }
      catch(error){s.enabled=false;remove(s);return false;}
    }
    function contextLost(name){
      var s=slot(name);
      if(!s.source||!s.image)return;
      s.gpuLost=true;
      // Keep the physical Canvas and its sharp guide overlay visible while
      // Chromium recreates WebGL, rather than displaying an empty GPU layer.
      s.image.style.display='none';
      s.source.style.opacity=s.oldOpacity;
    }
    function contextRestored(name){
      var s=slot(name);
      if(!s.enabled||!s.source||!s.image)return false;
      try{
        // The original Canvas still holds the latest physical frame. A new
        // WebGL texture can be uploaded from it without retracing optics.
        if(present(s.source,s.image,name,{capture:false})===false){
          contextLost(name);return false;
        }
        s.gpuLost=false;
        if(!s.suspended){s.image.style.display='';s.source.style.opacity='0';}
        return true;
      }catch(error){s.enabled=false;remove(s);return false;}
    }
    function suspend(){
      // Camera-preview CSS transform operates on the original Canvas. Expose
      // it during drag rather than freezing a stationary overlay on top.
      names.forEach(function(name){
        var s=slots[name];
        if(!s.image||s.suspended)return;
        s.suspended=true;
        s.image.style.display='none';s.guides.style.display='none';
        s.source.style.opacity=s.oldOpacity;
      });
    }
    function resume(){
      names.forEach(function(name){
        var s=slots[name];
        if(!s.suspended)return;
        s.suspended=false;
        s.image.style.display=s.gpuLost?'none':'';s.guides.style.display='';
        s.source.style.opacity=s.gpuLost?s.oldOpacity:'0';
      });
    }
    return Object.freeze({setEnabled:setEnabled,capture:capture,frame:frame,suspend:suspend,
      resume:resume,contextLost:contextLost,contextRestored:contextRestored,enabled:function(name){return slot(name).enabled;},
      // The next patch may replace the identity presenter with WebGL;
      // Scene/Compare callers need no further physics-renderer changes.
      getCanvas:function(name){return slot(name).image;},
      getGuideCanvas:function(name){return slot(name).guides;},
      ready:function(name){var s=slot(name);return !!(s.enabled&&s.image&&!s.suspended&&!s.gpuLost);},
      destroy:function(){names.forEach(function(name){slots[name].enabled=false;remove(slots[name]);});}});
  }
  return Object.freeze({create:create});
}));
