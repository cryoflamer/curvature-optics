/* Phase 2: pure, opt-in world-space geometry for a type-2 transmission tower.
 * No GraphX3DX, DOM, canvas or legacy command recording is used here.
 * Other object types remain on the legacy path until independently ported.
 */
(function(root,factory){
  var api=factory(root.CurvatureSceneContract || (typeof require==='function'?require('./CurvatureSceneContract'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGeometryEngine=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  if(!contract)throw new Error('CurvatureSceneContract required');
  var shapes=[
    [[-.12,-.02,-.02,.02,.02,.12],[.08,.76,1,1,.76,.08],1],
    [[-.02,-.08,.08,.02],[1,.98,.98,1],1],
    [[-.02,-.07,.07,.02,-.02],[.94,.92,.92,.94,.94],1],
    [[-.02,-.07,.07,.02,-.02],[.86,.84,.84,.86,.86],1],
    [[-.02,-.07,.07,.02,-.02],[.78,.76,.76,.78,.78],1],
    [[-.12,.0906,-.0685,.0494,-.02],[.08,.28,.43,.56,.76],1],
    [[.12,-.0906,.0685,-.0494,.02],[.08,.28,.43,.56,.76],1],
    [[-.14,-.1,-.1,.1,.1,.14,.14,-.14,-.14],[0,0,.06,.06,0,0,.08,.08,0],3]
  ];
  var bars=[[-.0906,.28,.0906,.28],[-.0685,.43,.0685,.43],[-.0494,.56,.0494,.56]];
  function finite3(v){return Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);}
  function localTowerType2(){
    var primitives=shapes.slice(0,7).map(function(s){return {type:'polygon',points:s[0].map(function(x,i){return [x,s[1][i]];}),mode:s[2]};});
    bars.forEach(function(b){primitives.push({type:'line',points:[[b[0],b[1]],[b[2],b[3]]]});});
    var foundation=shapes[7];
    primitives.push({type:'polygon',points:foundation[0].map(function(x,i){return [x,foundation[1][i]];}),mode:3,style:{fill:'#a38d60'}});
    return primitives;
  }
  // Explicit plane basis: pos + u*xAxis + v*yAxis. The axes carry size.
  // This keeps placement independent of GraphX3DX's mutable SetPlane/SetTrans.
  function placeOnPlane(primitives,plane){
    if(!plane||!finite3(plane.origin)||!finite3(plane.xAxis)||!finite3(plane.yAxis))throw new TypeError('Finite plane basis required');
    return primitives.map(function(p){
      var q=Object.assign({},p);
      q.points=p.points.map(function(v){return [0,1,2].map(function(i){return plane.origin[i]+v[0]*plane.xAxis[i]+v[1]*plane.yAxis[i];});});
      return q;
    });
  }
  function createTowerType2Scene(plane,metadata){
    return contract.createScene('legacy',placeOnPlane(localTowerType2(),plane),Object.assign({generator:'CurvatureGeometryEngine',objectType:3,towerVariant:2},metadata||{}));
  }
  return {localTowerType2:localTowerType2,placeOnPlane:placeOnPlane,createTowerType2Scene:createTowerType2Scene};
}));
