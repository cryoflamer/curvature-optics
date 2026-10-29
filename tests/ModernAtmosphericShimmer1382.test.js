'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const shimmer=require('../src/ui/modern/ModernAtmosphericShimmer');
const presentation=require('../src/ui/modern/ModernAtmosphericPresentation');

function fakeWebGL(){
  const calls=[];
  let index=0;
  const gl={VERTEX_SHADER:35633,FRAGMENT_SHADER:35632,COMPILE_STATUS:35713,
    LINK_STATUS:35714,ARRAY_BUFFER:34962,STATIC_DRAW:35044,FLOAT:5126,
    TEXTURE0:33984,TEXTURE_2D:3553,TEXTURE_MIN_FILTER:10241,TEXTURE_MAG_FILTER:10240,
    LINEAR:9729,TEXTURE_WRAP_S:10242,TEXTURE_WRAP_T:10243,CLAMP_TO_EDGE:33071,
    UNPACK_FLIP_Y_WEBGL:37440,RGBA:6408,UNSIGNED_BYTE:5121,TRIANGLE_STRIP:5,NO_ERROR:0};
  for(const method of ['shaderSource','compileShader','deleteShader','attachShader','linkProgram',
    'deleteTexture','deleteBuffer','deleteProgram','useProgram','bindBuffer','bufferData',
    'enableVertexAttribArray','vertexAttribPointer','activeTexture','bindTexture',
    'texParameteri','pixelStorei','uniform1i','texImage2D','viewport','uniform2f',
    'uniform1f','drawArrays'])gl[method]=function(...args){calls.push([method,...args]);};
  for(const method of ['createShader','createProgram','createBuffer','createTexture'])
    gl[method]=function(){return {gpu:++index};};
  gl.getShaderParameter=()=>true;gl.getProgramParameter=()=>true;
  gl.getAttribLocation=()=>0;gl.getUniformLocation=(_program,name)=>name;
  gl.getError=()=>0;
  return {gl,calls};
}
function canvasWith(fake){return {width:800,height:400,offsetWidth:400,offsetHeight:200,
  style:{opacity:''},parentNode:null,addEventListener(type,fn){this[type]=fn;},
  getContext(type,attrs){assert.equal(type,'webgl');assert.equal(attrs.alpha,true);
    assert.equal(attrs.premultipliedAlpha,false);return fake.gl;}};}

test('138.2: finite bounded manual shimmer settings; physical C_n^2 is not faked',()=>{
  assert.deepEqual(shimmer.settingsFor({intensity:0,drift:0}),
    {intensity:0,scale:54,drift:0,seed:0});
  assert.throws(()=>shimmer.settingsFor({intensity:100}),/Invalid/);
  assert.throws(()=>shimmer.settingsFor({scale:0}),/Invalid/);
  assert.throws(()=>shimmer.settingsFor({intensity:NaN}),/Invalid/);
  assert.throws(()=>shimmer.settingsFor({cn2:1e-14}),/Unknown/);
  assert.match(shimmer.fragmentSource,/gradNoise/);
  assert.match(shimmer.fragmentSource,/uTime/);
});

test('138.2: physics frame uploaded exactly once; animation draws without upload',()=>{
  const mock=fakeWebGL(),target=canvasWith(mock),source={offsetWidth:400,width:800,height:400};
  const effect=shimmer.create();
  effect.present(source,target,'Scene',{capture:true,timeMs:1000});
  effect.present(source,target,'Scene',{capture:false,timeMs:1016});
  effect.present(source,target,'Scene',{capture:false,timeMs:1032});
  assert.equal(mock.calls.filter(x=>x[0]==='texImage2D').length,1);
  assert.equal(mock.calls.filter(x=>x[0]==='drawArrays').length,3);
  assert.equal(effect.getStats('Scene').uploads,1);
  assert.equal(effect.getStats('Scene').frames,3);
  assert.ok(mock.calls.some(x=>x[0]==='uniform1f'&&x[1]==='uStrength'&&x[2]===6),
    'strength is multiplied by backing/CSS scale (2x)');
  const before=effect.getSettings();
  effect.configure({intensity:7,scale:20,drift:25});
  assert.equal(before.intensity,3,'getSettings returns independent copy');
  effect.present(source,target,'Scene',{capture:false,timeMs:1048});
  assert.ok(mock.calls.some(x=>x[0]==='uniform1f'&&x[1]==='uStrength'&&x[2]===14));
  assert.equal(mock.calls.filter(x=>x[0]==='texImage2D').length,1);
  target.width=600;target.height=300;source.width=600;source.height=300;
  effect.present(source,target,'Scene',{capture:true,timeMs:1064});
  assert.equal(effect.getStats('Scene').uploads,2);
  assert.deepEqual(mock.calls.filter(x=>x[0]==='viewport').at(-1),['viewport',0,0,600,300]);
  effect.dispose(target);
  assert.equal(mock.calls.filter(x=>x[0]==='deleteTexture').length,1);
  assert.equal(mock.calls.filter(x=>x[0]==='deleteProgram').length,1);
});

test('138.2.1: transparent source pixels remain transparent in WebGL output',()=>{
  const mock=fakeWebGL(),target=canvasWith(mock);
  const effect=shimmer.create({settings:{intensity:0}});
  effect.present({width:100,height:50,offsetWidth:100},target,'Scene',
    {capture:true,timeMs:0});
  assert.ok(mock.calls.some(call=>call[0]==='uniform1f'&&call[1]==='uStrength'&&call[2]===0));
  assert.match(shimmer.fragmentSource,/gl_FragColor=texture2D\(uImage,uv\)/,
    'shader must forward source RGBA, not replace alpha with opaque black');
  const css=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernApp.css'),'utf8');
  assert.match(css,/canvas\.modern-atmospheric-image\{background:#fff\}/,
    'transparent output must composite against the same white canvas backdrop');
  assert.equal(effect.getStats('Scene').uploads,1);
});

test('138.2: Scene and Compare targets get independent GPU textures',()=>{
  const a=fakeWebGL(),b=fakeWebGL();
  const effect=shimmer.create({settings:{seed:42}}),src={width:100,height:50,offsetWidth:100};
  effect.present(src,canvasWith(a),'A',{capture:true});
  effect.present(src,canvasWith(b),'B',{capture:true});
  assert.equal(effect.getStats('A').uploads,1);
  assert.equal(effect.getStats('B').uploads,1);
  assert.equal(a.calls.filter(c=>c[0]==='texImage2D').length,1);
  assert.equal(b.calls.filter(c=>c[0]==='texImage2D').length,1);
});

test('138.2: no WebGL produces a safe presentation fallback to original canvas',()=>{
  const original={width:100,height:50,offsetWidth:100,offsetHeight:50,
    offsetLeft:0,offsetTop:0,style:{opacity:''}};
  const host={children:[original],appendChild(canvas){canvas.parentNode=this;this.children.push(canvas);},
    removeChild(canvas){this.children.splice(this.children.indexOf(canvas),1);canvas.parentNode=null;}};
  original.parentNode=host;
  const ctx={clearRect(){}};
  const doc={createElement(){return {width:0,height:0,style:{},setAttribute(){},
    getContext(type){return type==='2d'?ctx:null;}};}};
  const effect=shimmer.create(),layer=presentation.create({document:doc,
    present:(source,target,name,meta)=>effect.present(source,target,name,meta),
    onRemove:effect.dispose});
  layer.setEnabled('Scene',true);
  const graph={Canvas:original};
  assert.equal(layer.capture('Scene',graph),graph);
  assert.equal(original.style.opacity,'');
  assert.equal(host.children.length,1);
  assert.equal(layer.ready('Scene'),false);
  assert.equal(layer.frame('Scene'),false);
});

test('138.2: shader script precedes runtime and RAF uses presentation.frame only',()=>{
  const root=path.resolve(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'CurvatureModern.html'),'utf8');
  const app=fs.readFileSync(path.join(root,'src/ui/modern/ModernApp.js'),'utf8');
  assert.ok(html.indexOf('ModernAtmosphericShimmer.js')>html.indexOf('ModernAtmosphericPresentation.js'));
  assert.ok(html.indexOf('ModernAtmosphericShimmer.js')<html.indexOf('ModernApp.js'));
  assert.match(app,/shimmerFrame=requestAnimationFrame\(function\(timestamp\)/);
  assert.match(app,/atmosphericPresentation\.frame\(name,timestamp\)/);
  assert.match(app,/getAtmosphericShimmer:function/);
  assert.match(app,/stopShimmerFrame\(\);atmosphericPresentation\.suspend\(\)/);
});
