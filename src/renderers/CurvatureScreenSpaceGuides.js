/* Camera-dependent, screen-error-bounded simplification of already optically
 * traced ground guides. Only coherent, unfilled ground guide polylines may be
 * simplified. Physical horizons, objects, fills and near-plane crossings are
 * never approximated. No optical ray is calculated here.
 */
(function(root,factory){
  var api=factory(root.CurvatureCanvasProjection||(typeof require==='function'?require('./CurvatureCanvasProjection'):null),
    root.CurvatureSceneContract||(typeof require==='function'?require('../scene/CurvatureSceneContract'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureScreenSpaceGuides=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(canvasProjection,contract){
  'use strict';
  var indexed=new WeakMap();
  function unit(v){var len=Math.hypot(v[0],v[1],v[2]);if(!(len>0))throw RangeError('Degenerate camera');return v.map(function(n){return n/len;});}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function projector(camera,width,height){
    var back=unit(camera.pos.map(function(v,i){return v-camera.center[i];})),
      right=unit(cross(unit(camera.up),back)),up=unit(cross(back,right)),
      distance=Math.hypot.apply(null,camera.center.map(function(v,i){return v-camera.pos[i];})),
      focal=camera.sceneSize!==0?camera.screenSize/camera.sceneSize*(distance-camera.objectZExtend):1,
      view=canvasProjection.resolve(camera,width,height),scale=focal*camera.zoom,
      near=camera.near>0?camera.near:1e-6;
    function point(p){
      var v=[p[0]-camera.pos[0],p[1]-camera.pos[1],p[2]-camera.pos[2]],depth=-dot(v,back);
      if(!(depth>near*1.01))return {pixel:null,depth:depth,near:near};
      return {pixel:[view.offsetX+dot(v,right)*scale*view.scaleX/depth,
        view.offsetY+dot(v,up)*scale*view.scaleY/depth],depth:depth,near:near};
    }
    return point;
  }
  function equalPoint(a,b){return Math.abs(a[0]-b[0])<=1e-8&&Math.abs(a[1]-b[1])<=1e-8&&Math.abs(a[2]-b[2])<=1e-8;}
  function isGround(p){return p.type==='line'&&p.mode!==2&&p.metadata&&
    p.metadata.physicalGround===true&&p.metadata.kind!=='physical-horizon';}
  function key(p){var m=p.metadata||{};return JSON.stringify([m.kind,m.angle,p.style]);}
  function groupsFor(composition){
    var source=composition.scene.primitives;
    var found=indexed.get(source);if(found)return found;
    var ranges=composition.ranges,groups=[];
    ranges.forEach(function(r){
      if(r.role!=='visual-aid')return;
      var chain=null;
      for(var i=r.start;i<r.end;i++){
        var p=source[i];
        if(!isGround(p)){groups.push({start:i,end:i+1,ground:false});chain=null;continue;}
        var signature=key(p);
        if(chain&&chain.end===i&&chain.signature===signature&&
           equalPoint(source[i-1].points[1],p.points[0])){
          chain.end=i+1;
        }else{
          chain={start:i,end:i+1,ground:true,signature:signature};groups.push(chain);
        }
      }
    });
    indexed.set(source,groups);return groups;
  }
  function squaredDistance(p,a,b){
    var dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
    if(!(den>0))return (p[0]-a[0])**2+(p[1]-a[1])**2;
    var t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)),
      x=a[0]+t*dx,y=a[1]+t*dy;
    return (p[0]-x)**2+(p[1]-y)**2;
  }
  function selectedVertices(screen,tolerance){
    var selected=new Set([0,screen.length-1]),stack=[[0,screen.length-1]],limit=tolerance*tolerance;
    while(stack.length){
      var range=stack.pop(),a=range[0],b=range[1],max=limit,index=-1;
      for(var j=a+1;j<b;j++){
        var err=squaredDistance(screen[j],screen[a],screen[b]);
        if(err>max){max=err;index=j;}
      }
      if(index>=0){selected.add(index);stack.push([a,index],[index,b]);}
    }
    return Array.from(selected).sort(function(a,b){return a-b;});
  }
  function simplify(composition,camera,width,height,options){
    options=options||{};
    var tolerance=options.tolerancePixels===undefined?0.5:options.tolerancePixels;
    if(!Number.isFinite(tolerance)||tolerance<=0||tolerance>4)throw RangeError('Invalid screen guide tolerance');
    if(!composition||!composition.scene||!Array.isArray(composition.ranges))throw TypeError('Scene composition required');
    var project=projector(camera,width,height),source=composition.scene.primitives,
      groups=groupsFor(composition),primitives=[],ranges=[],seen=0,reduced=0,
      culled=0,unsafe=0,maxSampledError=0,keptCurves=0;
    function append(p){primitives.push(Object.assign({},p,{commandIndex:primitives.length}));}
    composition.ranges.forEach(function(r){
      var start=primitives.length;
      if(r.role!=='visual-aid'){
        for(var n=r.start;n<r.end;n++)append(source[n]);
      }else{
        groups.forEach(function(g){
          if(g.start<r.start||g.start>=r.end)return;
          var count=g.end-g.start;
          if(!g.ground){append(source[g.start]);return;}
          seen+=count;
          var points=[source[g.start].points[0]];
          for(var k=g.start;k<g.end;k++)points.push(source[k].points[1]);
          var screen=points.map(project),p=source[g.start],edge=0;
          // Every safe run is a continuous polyline strictly in front of the
          // near plane. Unsafe edges are never approximated; edges strictly
          // behind the near plane cannot contribute to the painted image.
          while(edge<count){
            if(!screen[edge].pixel||!screen[edge+1].pixel||
                !screen[edge].pixel.every(Number.isFinite)||
                !screen[edge+1].pixel.every(Number.isFinite)){
              if(screen[edge].depth<=screen[edge].near&&
                 screen[edge+1].depth<=screen[edge+1].near){culled++;}
              else {append(source[g.start+edge]);unsafe++;}
              edge++;continue;
            }
            var first=edge;
            while(edge<count&&screen[edge].pixel&&screen[edge+1].pixel&&
              screen[edge].pixel.every(Number.isFinite)&&screen[edge+1].pixel.every(Number.isFinite))edge++;
            var projected=screen.slice(first,edge+1).map(function(q){return q.pixel;}),
              minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
            projected.forEach(function(q){minX=Math.min(minX,q[0]);maxX=Math.max(maxX,q[0]);
              minY=Math.min(minY,q[1]);maxY=Math.max(maxY,q[1]);});
            var lineWidth=canvasProjection.lineWidth(p.style&&p.style.lineWidth,camera);
            var margin=Math.max(2,lineWidth+2);
            if(maxX< -margin||minX>width+margin||maxY< -margin||minY>height+margin){
              culled+=edge-first;continue;
            }
            var keep=selectedVertices(projected,tolerance);
            for(var idx=1;idx<keep.length;idx++){
              var a=keep[idx-1],b=keep[idx];
              append(Object.assign({},p,{points:[points[first+a],points[first+b]]}));
              for(var j=a+1;j<b;j++)maxSampledError=Math.max(maxSampledError,
                Math.sqrt(squaredDistance(projected[j],projected[a],projected[b])));
            }
            reduced+=edge-first-(keep.length-1);keptCurves++;
          }
        });
      }
      ranges.push({name:r.name,role:r.role,start:start,end:primitives.length,count:primitives.length-start});
    });
    var metadata=Object.assign({},composition.scene.metadata,{layerRanges:ranges});
    return {composition:{scene:contract.createScene(composition.scene.source,primitives,metadata),ranges:ranges},
      stats:{inputGroundSegments:seen,removedBySimplification:reduced,
        removedOffscreen:culled,unsafeNearPlane:unsafe,keptCurves:keptCurves,
        outputPrimitives:primitives.length,tolerancePixels:tolerance,
        maxSampledPixelDeviation:maxSampledError}};
  }
  return {simplify:simplify};
}));
