/* Conservative, renderer-independent coverage probe for explicit Line3D calls.
 * No projection, clipping, or implicit graph transformations are inferred.
 */
(function(root,factory){
  var api=factory(root.CurvatureSceneContract || (typeof require==='function'?require('./CurvatureSceneContract'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.LegacyGeometryExtractor=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract){
  'use strict';
  if(!contract)throw new Error('CurvatureSceneContract required');
  function vec(v){return Array.isArray(v)&&v.length===3&&v.every(function(x){return typeof x==='number'&&Number.isFinite(x);});}
  function endpoints(args){
    if(args.length>=2&&vec(args[0])&&vec(args[1]))return [args[0].slice(),args[1].slice()];
    if(args.length>=6&&args.slice(0,6).every(function(x){return typeof x==='number'&&Number.isFinite(x);}))
      return [args.slice(0,3),args.slice(3,6)];
    return null;
  }
  function extract(frame){
    if(!frame||!Array.isArray(frame.commands))throw new TypeError('SceneFrame commands required');
    var primitives=[], unsupported={}, supported=0;
    frame.commands.forEach(function(command,index){
      var method=command&&command.method;
      var points=method==='Line3D'&&Array.isArray(command.args)?endpoints(command.args):null;
      if(points){
        primitives.push({type:'line',points:points,commandIndex:index});
        supported++;
      }else{
        var reason=method||'<invalid>';
        unsupported[reason]=(unsupported[reason]||0)+1;
      }
    });
    return {
      scene:contract.createScene('legacy',primitives,{partial:true,coordinateSpace:'legacy-input',
        warning:'Graph transforms, projection and clipping have not been resolved'}),
      coverage:{total:frame.commands.length,supported:supported,unsupported:frame.commands.length-supported,
        unsupportedByMethod:unsupported,complete:supported===frame.commands.length}
    };
  }
  return {extract:extract};
}));
