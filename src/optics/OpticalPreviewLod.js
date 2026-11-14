/* Fast-only, camera-distance-ranked object thinning for Modern Preview.
 * The authored scene is never edited: each placed tower is either projected
 * whole (including its footing) or omitted for this approximate frame.
 * An adaptive controller consumes measured complete frame times, not physics
 * solve counts. Accurate rendering never receives a preview stride.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureOpticalPreviewLod=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var STRIDES=[1,2,4,8,16,32];
  function validateStride(stride){
    if(!STRIDES.includes(stride))throw RangeError('Invalid Fast Preview object stride');
    return stride;
  }
  function thin(placed,model,stride){
    validateStride(stride);
    var original=placed.length;
    if(stride===1)return {objects:placed,original:original,selected:original,
      skipped:0,stride:stride};
    var groups=new Map(),keep=new Set();
    placed.forEach(function(object){
      var meta=object.primitives[0]&&object.primitives[0].metadata||{};
      // Other shapes and hand-authored/unidentified primitives are always
      // preserved. LOD is intentionally limited to authored tower banks.
      if(!Number.isInteger(object.id)||!Number.isInteger(meta.objectBank)||
          !model.ObjType||model.ObjType[meta.objectBank]!==3){
        keep.add(object);return;
      }
      var key=String(meta.objectBank)+'/'+object.name;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(object);
    });
    groups.forEach(function(objects){
      // The four nearest towers anchor perspective; always retain the far
      // endpoint too, so a bank's visible spatial extent does not jump.
      objects.sort(function(a,b){return a.distance-b.distance||a.id-b.id;});
      objects.forEach(function(object,i){
        if(i<4||i===objects.length-1||(i-4)%stride===0)keep.add(object);
      });
    });
    // Preserve the existing far-to-near painter order and atomic fills.
    var selected=placed.filter(function(object){return keep.has(object);});
    return {objects:selected,original:original,selected:selected.length,
      skipped:original-selected.length,stride:stride};
  }
  function createController(targetMs){
    if(!Number.isFinite(targetMs)||targetMs<=0)throw RangeError('Invalid Preview frame budget');
    var stride=1,average=null,fast=0;
    return Object.freeze({
      stride:function(){return stride;},
      reset:function(initial){stride=initial===undefined?1:validateStride(initial);average=null;fast=0;},
      observe:function(ms){
        if(!Number.isFinite(ms)||ms<0)return stride;
        average=average===null?ms:average*0.65+ms*0.35;
        if(average>targetMs*1.2){
          if(stride<32){stride*=2;average=null;}
          fast=0;
        }else if(average<targetMs*0.6&&stride>1){
          fast++;
          if(fast>=3){stride/=2;fast=0;average=null;}
        }else fast=0;
        return stride;
      }
    });
  }
  // Motion-only pacing uses observed *complete* Scene/Compare redraw times.
  // It does not make the optical field less accurate or change authored LOD.
  // A brief expensive frame backs off immediately; a faster sequence reduces
  // the interval gradually to avoid oscillations on mixed-cost atmospheres.
  function createFramePacer(){
    var interval=100,average=null;
    return Object.freeze({
      intervalMs:function(){return interval;},
      reset:function(){interval=100;average=null;},
      observe:function(ms){
        if(!Number.isFinite(ms)||ms<0)return interval;
        average=average===null?ms:average*0.6+ms*0.4;
        var wanted=Math.max(65,Math.min(180,Math.ceil(average*1.35)));
        if(wanted>interval)interval=wanted;
        else if(wanted<interval-4)
          interval=Math.max(wanted,Math.ceil(interval*0.65+wanted*0.35));
        return interval;
      }
    });
  }
  return Object.freeze({thin:thin,validateStride:validateStride,
    createController:createController,createFramePacer:createFramePacer,
    strides:STRIDES.slice()});
}));
