/* #140.2: opt-in WebGL2 painter of the SAME projected triangles and strokes.
 * Physics, visibility, triangulation and projection remain on CPU. A separate
 * WebGL canvas is composited into the existing 2D canvas so its decorations,
 * atmospheric presentation and GraphX3DX ownership remain untouched.
 * This first bridge incurs drawImage/copy cost; it is not zero-copy GPU output.
 */
(function(root,factory){
  var api=factory(root.CurvatureLegacyOrderPreview||
    (typeof require==='function'?require('./CurvatureLegacyOrderPreview'):null),
    root.CurvatureCanvasProjection||
    (typeof require==='function'?require('./CurvatureCanvasProjection'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureWebGLGeometryRenderer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(painter,projection){
  'use strict';
  if(!painter||!projection)throw Error('WebGL painter dependencies required');
  var contexts=new WeakMap(),VERTEX=
    'attribute vec2 a_position; uniform vec2 u_viewport;\n'+
    'void main(){vec2 p=vec2(2.0*a_position.x/u_viewport.x-1.0,1.0-2.0*a_position.y/u_viewport.y);gl_Position=vec4(p,0.0,1.0);}',
    FRAGMENT='precision mediump float; uniform vec4 u_color; void main(){gl_FragColor=u_color;}';
  function parseColor(input){
    var v=String(input||'').trim().toLowerCase(),known={black:'#000000',white:'#ffffff',
      red:'#ff0000',green:'#008000',blue:'#0000ff',orange:'#ffa500',navy:'#000080',
      gray:'#808080',grey:'#808080',yellow:'#ffff00',magenta:'#ff00ff',
      fuchsia:'#ff00ff',cyan:'#00ffff',aqua:'#00ffff',lime:'#00ff00',
      purple:'#800080',silver:'#c0c0c0',maroon:'#800000',olive:'#808000',
      teal:'#008080',transparent:'#00000000'};
    if(known[v])v=known[v];
    var m=v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
    if(m){var hex=m[1];if(hex.length<=4)hex=hex.split('').map(function(c){return c+c;}).join('');
      var n=hex.length===8?8:6,values=[0,2,4].map(function(i){return parseInt(hex.slice(i,i+2),16)/255;});
      values.push(n===8?parseInt(hex.slice(6,8),16)/255:1);return values;}
    m=v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
    if(m){var c=[1,2,3].map(function(i){return Number(m[i])/255;});c.push(m[4]===undefined?1:Number(m[4]));
      if(c.every(function(x){return Number.isFinite(x)&&x>=0&&x<=1;}))return c;}
    throw Error('Unsupported experimental GPU style color: '+v);
  }
  function segmentQuad(a,b,width,out){
    var dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    if(!(length>1e-9)||!(width>0))return;
    var nx=-dy/length*width/2,ny=dx/length*width/2;
    var p=[a[0]+nx,a[1]+ny,a[0]-nx,a[1]-ny,b[0]+nx,b[1]+ny,b[0]-nx,b[1]-ny];
    out.push(p[0],p[1],p[2],p[3],p[4],p[5],p[4],p[5],p[2],p[3],p[6],p[7]);
  }
  function commands(scene,camera,width,height,triangles){
    var data=painter.build(scene,camera,width,height,triangles),batches=[],pending=null;
    function append(kind,color,alpha,vertices){
      if(!vertices.length)return;
      var rgba=parseColor(color),a=Number(alpha);
      if(!Number.isFinite(a)||a<0||a>1)throw RangeError('Invalid GPU painter alpha');
      rgba[3]*=a;
      var key=kind+':'+rgba.join(',');
      if(!pending||pending.key!==key||pending.vertices.length+vertices.length>240000){
        pending={key:key,rgba:rgba,vertices:[]};batches.push(pending);
      }
      for(var i=0;i<vertices.length;i++)pending.vertices.push(vertices[i]);
    }
    data.commands.forEach(function(cmd){
      var style=cmd.style||{},alpha=style.alpha==null?1:style.alpha,coords=[];
      if(cmd.triangles.length){
        cmd.triangles.forEach(function(t){t.points.forEach(function(p){coords.push(p[0],p[1]);});});
        append('fill',style.fill||'#a8b8c7',alpha,coords);
      }
      if(cmd.segments.length){
        coords=[];var lineWidth=projection.lineWidth(style.lineWidth,camera);
        cmd.segments.forEach(function(seg){segmentQuad(seg.points[0],seg.points[1],lineWidth,coords);});
        append('stroke',style.stroke||'#30435a',alpha,coords);
      }
    });
    return {batches:batches,statistics:data.statistics};
  }
  function shader(gl,type,source){
    var s=gl.createShader(type);if(!s)throw Error('WebGL shader allocation failed');
    gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){var message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error('WebGL shader compile: '+message);}
    return s;
  }
  function initialize(gl){
    var vert=shader(gl,gl.VERTEX_SHADER,VERTEX),frag=shader(gl,gl.FRAGMENT_SHADER,FRAGMENT),program=gl.createProgram();
    if(!program)throw Error('WebGL program allocation failed');
    gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);
    gl.deleteShader(vert);gl.deleteShader(frag);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('WebGL link: '+gl.getProgramInfoLog(program));
    var buffer=gl.createBuffer(),position=gl.getAttribLocation(program,'a_position'),
      viewport=gl.getUniformLocation(program,'u_viewport'),color=gl.getUniformLocation(program,'u_color');
    if(!buffer||position<0||viewport===null||color===null)throw Error('WebGL painter attributes unavailable');
    return {gl:gl,program:program,buffer:buffer,position:position,viewport:viewport,color:color,lost:false};
  }
  function createState(target,createCanvas){
    var offscreen=(createCanvas?createCanvas():
      (typeof document!=='undefined'?document.createElement('canvas'):null));
    if(!offscreen||typeof offscreen.getContext!=='function')throw Error('GPU canvas is unavailable');
    var gl=offscreen.getContext('webgl2',{alpha:true,premultipliedAlpha:true,
      antialias:true,preserveDrawingBuffer:true,depth:false,stencil:false});
    if(!gl)throw Error('WebGL2 is unavailable');
    var state=initialize(gl);state.canvas=offscreen;
    if(typeof offscreen.addEventListener==='function'){
      offscreen.addEventListener('webglcontextlost',function(event){
        if(event&&typeof event.preventDefault==='function')event.preventDefault();state.lost=true;
      });
      offscreen.addEventListener('webglcontextrestored',function(){
        try{Object.assign(state,initialize(gl));state.lost=false;}
        catch(error){state.lost=true;state.error=error;}
      });
    }
    contexts.set(target,state);return state;
  }
  function draw(target,scene,camera,triangles,options){
    options=options||{};
    var width=target.width,height=target.height;
    if(!(width>0&&height>0)||!target||typeof target.getContext!=='function')
      throw TypeError('GPU painting requires a valid target canvas');
    var prepared=commands(scene,camera,width,height,triangles),
      state=contexts.get(target)||createState(target,options.createCanvas);
    if(state.lost||state.gl.isContextLost&&state.gl.isContextLost())
      throw Error('WebGL2 context is lost');
    var gl=state.gl;
    if(state.canvas.width!==width)state.canvas.width=width;
    if(state.canvas.height!==height)state.canvas.height=height;
    gl.viewport(0,0,width,height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(state.program);
    gl.uniform2f(state.viewport,width,height);gl.bindBuffer(gl.ARRAY_BUFFER,state.buffer);
    gl.enableVertexAttribArray(state.position);gl.vertexAttribPointer(state.position,2,gl.FLOAT,false,0,0);
    prepared.batches.forEach(function(batch){
      gl.uniform4fv(state.color,batch.rgba);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(batch.vertices),gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES,0,batch.vertices.length/2);
    });
    var error=gl.getError();if(error!==gl.NO_ERROR)throw Error('WebGL2 painter error '+error);
    var ctx=target.getContext('2d');if(!ctx||typeof ctx.drawImage!=='function')
      throw Error('Canvas 2D presentation bridge is unavailable');
    ctx.clearRect(0,0,width,height);
    ctx.drawImage(state.canvas,0,0);
    prepared.statistics.canvasStrokeCalls=0;
    prepared.statistics.gpuBatches=prepared.batches.length;
    prepared.statistics.gpuVertices=prepared.batches.reduce(function(sum,b){return sum+b.vertices.length/2;},0);
    return prepared;
  }
  return Object.freeze({draw:draw,commands:commands,parseColor:parseColor,segmentQuad:segmentQuad});
}));
