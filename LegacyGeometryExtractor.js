/* Conservative renderer-independent extraction of explicit legacy geometry.
 * Polygon vertices remain in graph input space; transforms are NOT resolved.
 */
(function(root,factory){
  var api=factory(root.CurvatureSceneContract || (typeof require==='function'?require('./CurvatureSceneContract'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.LegacyGeometryExtractor=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  if(!contract)throw new Error('CurvatureSceneContract required');
  function vec(v){return Array.isArray(v)&&v.length===3&&v.every(function(x){return typeof x==='number'&&Number.isFinite(x);});}
  function point(args){
    if(args.length===1&&vec(args[0]))return args[0].slice();
    if(args.length===3&&args.every(function(x){return typeof x==='number'&&Number.isFinite(x);}))return args.slice();
    return null;
  }
  function endpoints(args){
    if(args.length>=2&&vec(args[0])&&vec(args[1]))return [args[0].slice(),args[1].slice()];
    if(args.length>=6&&args.slice(0,6).every(function(x){return typeof x==='number'&&Number.isFinite(x);}))return [args.slice(0,3),args.slice(3,6)];
    return null;
  }
  function extract(frame){
    if(!frame||!Array.isArray(frame.commands))throw new TypeError('SceneFrame commands required');
    var primitives=[],unsupported={},supported=0,polygons=0,vertices=0,discarded=0;
    var active=null;
    function reject(method){unsupported[method]=(unsupported[method]||0)+1;}
    frame.commands.forEach(function(command,index){
      var method=command&&command.method, args=command&&command.args;
      if(!Array.isArray(args)){reject(method||'<invalid>');return;}
      if(method==='Line3D'){
        var ends=endpoints(args);
        if(ends){primitives.push({type:'line',points:ends,commandIndex:index});supported++;}
        else reject(method);
      }else if(method==='NewPoly3D'){
        // GraphX3DX defaults applyTrans to false. True needs the live matrix.
        if(active&&active.points.length)discarded++;
        active={points:[],valid:args.length===0||args[0]===false||args[0]==null,
          startIndex:index,indices:[index]};
        if(active.valid)supported++;else reject(method);
      }else if(method==='AddPointToPoly3D'){
        var p=point(args);
        if(active&&active.valid&&p){active.points.push(p);active.indices.push(index);supported++;vertices++;}
        else{if(active)active.valid=false;reject(method);}
      }else if(method==='DrawPoly3D'){
        var mode=args.length===0||args[0]==null?1:args[0];
        if(active&&active.valid&&active.points.length>=3&&Number.isInteger(mode)){
          // Mode bit 16 reverses the reusable polygon in the graph implementation.
          if(mode&16)active.points.reverse();
          primitives.push({type:'polygon',points:active.points.map(function(p){return p.slice();}),
            mode:mode,commandIndex:index,sourceCommandIndices:active.indices.concat(index)});
          supported++;polygons++;
        }else{reject(method);discarded++;}
        // Keep the inverted buffer for any subsequent DrawPoly3D call.
      }else reject(method||'<invalid>');
    });
    return {
      scene:contract.createScene('legacy',primitives,{partial:true,coordinateSpace:'legacy-input',
        warning:'Graph transforms, projection, clipping and on-plane primitives have not been resolved'}),
      coverage:{total:frame.commands.length,supported:supported,unsupported:frame.commands.length-supported,
        unsupportedByMethod:unsupported,complete:supported===frame.commands.length,
        completedPolygons:polygons,polygonVertices:vertices,discardedPolygonSequences:discarded,
        primitiveCount:primitives.length}
    };
  }
  return {extract:extract};
}));
