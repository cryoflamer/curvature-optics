/* Numeric comparison of controlled legacy and independently generated world
 * vertices. The legacy input MUST be an extracted real graph-command trace;
 * independently tessellated circles and auxiliary graph calls are excluded.
 */
(function(root,factory){
 var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 root.CurvatureControlledGeometryParity=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function compare(legacyScene,candidateScene,ranges,tolerance){
  tolerance=tolerance===undefined?1e-6:tolerance;
  if(!legacyScene||!Array.isArray(legacyScene.primitives)||!candidateScene||
     !Array.isArray(candidateScene.primitives)||!Array.isArray(ranges)||
     !Number.isFinite(tolerance)||tolerance<0)throw new TypeError('Valid scenes, ranges and tolerance required');
  var old=legacyScene.primitives.filter(function(p){return p.sourceMethod!=='CircleOnPlane';});
  var recent=[];
  ['behind','before'].forEach(function(name){
    var range=ranges.find(function(r){return r.name===name;});
    if(!range)throw new RangeError('Missing controlled tower layer '+name);
    recent=recent.concat(candidateScene.primitives.slice(range.start,range.end));
  });
  var result={passed:true,toleranceMeters:tolerance,legacyTowerPrimitives:old.length,
    independentTowerPrimitives:recent.length,comparedVertices:0,comparedCoordinates:0,
    maxAbsoluteErrorMeters:0,meanAbsoluteErrorMeters:0,firstMismatch:null,
    limitations:['Only matched tower vertices are compared; native circle tessellation is excluded',
      'This checks world geometry, not rasterization or style']};
  function mismatch(index,reason,details){
    result.passed=false;
    if(!result.firstMismatch)result.firstMismatch=Object.assign({primitiveIndex:index,reason:reason},details||{});
  }
  if(old.length!==recent.length)mismatch(-1,'primitive count mismatch');
  var absSum=0;
  for(var i=0;i<Math.min(old.length,recent.length);i++){
    var a=old[i],b=recent[i];
    if(a.type!==b.type||a.mode!==b.mode||a.points.length!==b.points.length){
      mismatch(i,'primitive shape mismatch',{legacy:{type:a.type,mode:a.mode,points:a.points.length},
        independent:{type:b.type,mode:b.mode,points:b.points.length}});continue;
    }
    for(var j=0;j<a.points.length;j++){
      var p=a.points[j],q=b.points[j];
      if(!Array.isArray(p)||!Array.isArray(q)||p.length!==3||q.length!==3){mismatch(i,'invalid world vertex',{vertexIndex:j});continue;}
      result.comparedVertices++;
      for(var k=0;k<3;k++){
        var error=Math.abs(p[k]-q[k]);
        result.comparedCoordinates++;
        if(Number.isFinite(error)){absSum+=error;result.maxAbsoluteErrorMeters=Math.max(error,result.maxAbsoluteErrorMeters);}
        if(!Number.isFinite(error)||error>tolerance)mismatch(i,'world coordinate mismatch',
          {vertexIndex:j,axis:['x','y','z'][k],legacy:p[k],independent:q[k],absoluteErrorMeters:error});
      }
    }
  }
  result.meanAbsoluteErrorMeters=result.comparedCoordinates?absSum/result.comparedCoordinates:0;
  if(!result.comparedVertices)mismatch(-1,'no vertices compared');
  return result;
 }
 return {compare:compare};
}));
