/* Optional airlight/extinction presentation over already traced Physical objects.
 * Only styles are altered; ray solutions, clipping and positions are untouched.
 * Visibility range is the approximate 5%-contrast distance in homogeneous air
 * (Koschmieder: transmission exp(-3 * distance / range)). Distance is the
 * authored object's observer-relative range, a near-horizontal optical-path
 * approximation; the index-of-refraction profile DOES NOT set extinction.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureAtmosphericVisibility=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var DEFAULT=Object.freeze({enabled:false,rangeKm:60});
  function validate(value){
    if(value===undefined||value===null)return {enabled:false,rangeKm:60};
    if(typeof value!=='object'||Array.isArray(value)||
      Object.keys(value).some(function(k){return k!=='enabled'&&k!=='rangeKm';})||
      typeof value.enabled!=='boolean'||typeof value.rangeKm!=='number'||
      !Number.isFinite(value.rangeKm)||value.rangeKm<1||value.rangeKm>500)
      throw RangeError('Atmospheric visibility requires enabled and a range of 1–500 km');
    return {enabled:value.enabled,rangeKm:value.rangeKm};
  }
  function rgb(color){
    if(typeof color!=='string')return null;
    if(color==='black')return [0,0,0];
    if(color==='white')return [255,255,255];
    var short=/^#([0-9a-f]{3})$/i.exec(color),full=/^#([0-9a-f]{6})$/i.exec(color);
    if(short)return short[1].split('').map(function(c){return parseInt(c+c,16);});
    if(full)return [0,2,4].map(function(i){return parseInt(full[1].slice(i,i+2),16);});
    return null; // Unknown authored color: preserve it; never guess.
  }
  function blend(color,distance,rangeKm){
    var channels=rgb(color);
    if(!channels)return color;
    var transmission=Math.exp(-3*Math.max(0,distance)/(rangeKm*1000));
    return '#'+channels.map(function(c){return Math.round(255-(255-c)*transmission).toString(16).padStart(2,'0');}).join('');
  }
  function apply(projected,source,statistics,raw){
    var setting=validate(raw);
    if(!setting.enabled)return projected; // Strict no-op, including object identity.
    if(!projected||!projected.scene||!source||!source.scene||!statistics||
      !Array.isArray(statistics.perObject))throw TypeError('Physical composition and object ranges required');
    var distances=new Map(),indexes=new Map();
    statistics.perObject.forEach(function(obj){
      distances.set(obj.name+'|'+String(obj.placedObjectIndex),obj.distance);
    });
    source.scene.primitives.forEach(function(p,i){
      var meta=p.metadata||{};
      if(meta.placedObjectIndex!==undefined)
        indexes.set(p.commandIndex===undefined?i:p.commandIndex,meta.placedObjectIndex);
    });
    var modified=0;
    var primitives=projected.scene.primitives.map(function(p){
      var meta=p.metadata||{};
      if(meta.kind!=='physical-object-fill'&&meta.kind!=='physical-object-stroke')return p;
      var id=indexes.get(meta.opticalSourceIndex),distance=distances.get(meta.objectLayer+'|'+String(id));
      if(!Number.isFinite(distance)||distance<0||!p.style)return p;
      var old=p.style,style=Object.assign({},old);
      if(meta.kind==='physical-object-fill'&&old.fill)style.fill=blend(old.fill,distance,setting.rangeKm);
      if(meta.kind==='physical-object-stroke'&&old.stroke)style.stroke=blend(old.stroke,distance,setting.rangeKm);
      if(style.fill===old.fill&&style.stroke===old.stroke)return p;
      modified++;
      return Object.assign({},p,{style:style});
    });
    if(!modified)return projected;
    // Do not mutate the cached optical scene, its ranges, or its source
    // primitives. Two Compare presentations can reuse identical ray results.
    return {scene:Object.assign({},projected.scene,{primitives:primitives}),ranges:projected.ranges};
  }
  return Object.freeze({DEFAULT:DEFAULT,validate:validate,blend:blend,apply:apply});
}));
