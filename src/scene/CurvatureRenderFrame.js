/* Immutable-by-convention snapshot of an independent world-space scene, its
 * camera and viewport. Unlike SceneFrame (legacy graph commands), this frame
 * has no GraphX3DX commands and can be passed to multiple renderers unchanged.
 */
(function(root,factory){
  var api=factory(root.CurvatureSceneContract||(typeof require==='function'?require('./CurvatureSceneContract'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureRenderFrame=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  if(!contract)throw new Error('CurvatureSceneContract required');
  var VERSION=1,KIND='world-scene-frame';
  function finite(n){return typeof n==='number'&&Number.isFinite(n);}
  function vec3(v){return Array.isArray(v)&&v.length===3&&v.every(finite);}
  function plain(v){return v&&typeof v==='object'&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);}
  function clone(value,seen){
    if(value===null||typeof value==='string'||typeof value==='boolean'||finite(value))return value;
    if(!seen)seen=new Set();
    if(!Array.isArray(value)&&!plain(value))throw new TypeError('Non-serializable frame value');
    if(seen.has(value))throw new TypeError('Cyclic frame value');
    seen.add(value);
    var result;
    if(Array.isArray(value))result=value.map(function(v){return clone(v,seen);});
    else{
      result={};
      Object.keys(value).forEach(function(key){
        if(key==='__proto__'||key==='constructor'||key==='prototype')throw new TypeError('Unsafe frame key');
        // Legacy guide styles omit optional colors by assigning undefined.
        // Normalize to JSON's omission semantics without changing render defaults.
        if(value[key]!==undefined)result[key]=clone(value[key],seen);
      });
    }
    seen.delete(value);
    return result;
  }
  function cameraSnapshot(camera,width,height){
    if(!plain(camera)||!vec3(camera.pos)||!vec3(camera.center)||!vec3(camera.up)||
       !finite(camera.sceneSize)||!finite(camera.screenSize)||camera.screenSize<=0||
       !finite(camera.objectZExtend)||!finite(camera.zoom)||camera.zoom<=0)
      throw new TypeError('Invalid independent camera snapshot');
    // A valid center/up cannot make a basis with the camera direction, but
    // checking this here catches invalid frames before either renderer runs.
    var d=camera.pos.map(function(x,i){return x-camera.center[i];});
    var norm=Math.hypot.apply(null,d),upNorm=Math.hypot.apply(null,camera.up);
    if(!(norm>0)||!(upNorm>0))throw new RangeError('Degenerate camera basis');
    var cx=d[1]*camera.up[2]-d[2]*camera.up[1];
    var cy=d[2]*camera.up[0]-d[0]*camera.up[2];
    var cz=d[0]*camera.up[1]-d[1]*camera.up[0];
    if(!(Math.hypot(cx,cy,cz)/(norm*upNorm)>1e-12))throw new RangeError('Degenerate camera basis');
    if(camera.near!==undefined&&(!finite(camera.near)||camera.near<=0))throw new RangeError('Invalid near plane');
    if(camera.pixelTransform!==undefined){
      var pixel=camera.pixelTransform;
      if(!plain(pixel)||pixel.width!==width||pixel.height!==height||
         !['scaleX','scaleY','offsetX','offsetY'].every(function(key){return finite(pixel[key]);}))
        throw new RangeError('Camera pixel transform does not match viewport');
    }
    return clone(camera);
  }
  function layerSnapshot(layers,count){
    if(!Array.isArray(layers))throw new TypeError('Layer ranges required');
    var end=0,names=new Set();
    var result=layers.map(function(layer){
      if(!plain(layer)||typeof layer.name!=='string'||!layer.name||names.has(layer.name)||
         !Number.isInteger(layer.start)||!Number.isInteger(layer.end)||
         layer.start!==end||layer.end<layer.start||layer.end>count||
         (layer.count!==undefined&&layer.count!==layer.end-layer.start)||
         (layer.role!==undefined&&typeof layer.role!=='string'))
        throw new TypeError('Invalid or non-contiguous scene layer');
      names.add(layer.name);end=layer.end;
      return {name:layer.name,role:layer.role||'geometry',start:layer.start,end:layer.end,count:layer.end-layer.start};
    });
    if(end!==count||result.length===0)throw new TypeError('Layers must cover all primitives');
    return result;
  }
  function fromScene(scene,camera,width,height,layers){
    if(!scene||!plain(scene)||scene.version!==contract.VERSION)
      throw new TypeError('Invalid world-space scene');
    if(!Number.isInteger(width)||width<=0||!Number.isInteger(height)||height<=0)
      throw new RangeError('Invalid frame viewport');
    // Strictly validate every serialized value, including style and metadata.
    var safe=clone(scene);
    // `safe` already owns a strict deep copy of the caller's scene. Transfer
    // that private copy to the scene contract rather than cloning every point,
    // style and metadata a second time. adoptScene performs the SAME geometry
    // validation as createScene; no caller-owned object is adopted.
    var world=contract.adoptScene(safe.source,safe.primitives,safe.metadata);
    world.primitives.forEach(function(p,i){
      if(p.commandIndex!==i)throw new TypeError('Non-contiguous primitive command indices');
    });
    var cameraCopy=cameraSnapshot(camera,width,height);
    var ranges=layers===undefined?world.metadata.layerRanges:layers;
    if(ranges===undefined)ranges=[{name:'geometry',role:'geometry',start:0,end:world.primitives.length}];
    return {version:VERSION,kind:KIND,scene:world,camera:cameraCopy,
      viewport:{width:width,height:height},layers:layerSnapshot(ranges,world.primitives.length)};
  }
  function fromComposition(composed,camera,width,height){
    if(!composed||!composed.scene||!Array.isArray(composed.ranges))
      throw new TypeError('Composition with layer ranges required');
    return fromScene(composed.scene,camera,width,height,composed.ranges);
  }
  function validate(frame){
    if(!frame||frame.version!==VERSION||frame.kind!==KIND||
       !frame.viewport||!Array.isArray(frame.layers))throw new TypeError('Invalid world scene frame');
    return fromScene(frame.scene,frame.camera,frame.viewport.width,frame.viewport.height,frame.layers);
  }
  return {VERSION:VERSION,KIND:KIND,fromScene:fromScene,fromComposition:fromComposition,validate:validate};
}));
