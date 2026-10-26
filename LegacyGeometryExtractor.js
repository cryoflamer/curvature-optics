/* Conservative renderer-independent extraction of explicit legacy geometry.
 * World coordinates are resolved for supported 3D affine transforms; camera and clipping remain separate.
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
  function identity(){return [[1,0,0,0],[0,1,0,0],[0,0,1,0]];}
  function copy(m){return m&&m.map(function(r){return r.slice();});}
  function multiply(a,b){var r=identity();for(var i=0;i<3;i++)for(var j=0;j<4;j++){
    r[i][j]=(j===3?a[i][3]:0);
    for(var k=0;k<3;k++)r[i][j]+=a[i][k]*b[k][j];
  }return r;}
  function transform(m,p){if(!m)return p.slice();return m.map(function(row){return row[0]*p[0]+row[1]*p[1]+row[2]*p[2]+row[3];});}
  function affine(method,args,angleMeasure){
    var a=args.length===1&&vec(args[0])?args[0]:args;
    if(method==='TransMove3D'||method==='TransScale3D'){
      if(a.length!==3||!vec(a))return null;
      var m=identity();for(var i=0;i<3;i++)m[i][method==='TransMove3D'?3:i]=a[i];return m;
    }
    if(a.length!==1||typeof a[0]!=='number'||!Number.isFinite(a[0]))return null;
    var theta=a[0]*(angleMeasure==='deg'?Math.PI/180:1),c=Math.cos(theta),s=Math.sin(theta),r=identity();
    if(method==='TransRotateX3D'){r[1][1]=c;r[1][2]=-s;r[2][1]=s;r[2][2]=c;}
    else if(method==='TransRotateY3D'){r[0][0]=c;r[0][2]=s;r[2][0]=-s;r[2][2]=c;}
    else if(method==='TransRotateZ3D'){r[0][0]=c;r[0][1]=-s;r[1][0]=s;r[1][1]=c;}
    else return null;
    return r;
  }
  function extract(frame){
    if(!frame||!Array.isArray(frame.commands))throw new TypeError('SceneFrame commands required');
    var primitives=[],unsupported={},supported=0,polygons=0,vertices=0,discarded=0;
    var active=null, matrix=null, stack=[],angleMeasure=frame.bootstrap&&frame.bootstrap.AngleMeasure||'rad';
    var transformOps={TransMove3D:1,TransScale3D:1,TransRotateX3D:1,TransRotateY3D:1,TransRotateZ3D:1};
    function reject(method){unsupported[method]=(unsupported[method]||0)+1;}
    frame.commands.forEach(function(command,index){
      var method=command&&command.method, args=command&&command.args;
      if(!Array.isArray(args)){reject(method||'<invalid>');return;}
      if(transformOps[method]){
        var next=affine(method,args,angleMeasure);
        if(next){matrix=matrix?multiply(next,matrix):next;supported++;}else reject(method);
      }else if(method==='ResetTrans3D'){
        if(args.length<=1&&(args.length===0||typeof args[0]==='boolean')){
          matrix=null;if(args[0]===true)stack=[];supported++;
        }else reject(method);
      }else if(method==='SaveTrans3D'){
        if(args.length<=1&&(args.length===0||typeof args[0]==='boolean')){
          stack.push(copy(matrix));if(args[0]===true)matrix=null;supported++;
        }else reject(method);
      }else if(method==='RestoreTrans3D'){
        if(args.length===0){if(stack.length)matrix=stack.pop();supported++;}else reject(method);
      }else if(method==='SetAngleMeasure'){
        if(args.length===1&&(args[0]==='rad'||args[0]==='deg')){angleMeasure=args[0];supported++;}else reject(method);
      }else if(method==='Line3D'){
        var ends=endpoints(args);
        if(ends){primitives.push({type:'line',points:ends.map(function(p){return transform(matrix,p);}),commandIndex:index});supported++;}
        else reject(method);
      }else if(method==='NewPoly3D'){
        // GraphX3DX defaults applyTrans to false. True needs the live matrix.
        if(active&&active.points.length)discarded++;
        active={points:[],applyTrans:args[0]===true,valid:args.length===0||args[0]===false||args[0]===true||args[0]==null,
          startIndex:index,indices:[index]};
        if(active.valid)supported++;else reject(method);
      }else if(method==='AddPointToPoly3D'){
        var p=point(args);
        if(active&&active.valid&&p){active.points.push(active.applyTrans?transform(matrix,p):p);active.indices.push(index);supported++;vertices++;}
        else{if(active)active.valid=false;reject(method);}
      }else if(method==='DrawPoly3D'){
        var mode=args.length===0||args[0]==null?1:args[0];
        if(active&&active.valid&&active.points.length>=3&&Number.isInteger(mode)){
          // Mode bit 16 reverses the reusable polygon in the graph implementation.
          if(mode&16)active.points.reverse();
          primitives.push({type:'polygon',points:active.points.map(function(p){return active.applyTrans?p.slice():transform(matrix,p);}),
            mode:mode,commandIndex:index,sourceCommandIndices:active.indices.concat(index)});
          supported++;polygons++;
        }else{reject(method);discarded++;}
        // Keep the inverted buffer for any subsequent DrawPoly3D call.
      }else reject(method||'<invalid>');
    });
    return {
      scene:contract.createScene('legacy',primitives,{partial:true,coordinateSpace:'world',
        warning:'Supported 3D affine transforms resolved; camera, clipping, paths and on-plane primitives remain unresolved'}),
      coverage:{total:frame.commands.length,supported:supported,unsupported:frame.commands.length-supported,
        unsupportedByMethod:unsupported,complete:supported===frame.commands.length,
        completedPolygons:polygons,polygonVertices:vertices,discardedPolygonSequences:discarded,
        primitiveCount:primitives.length}
    };
  }
  return {extract:extract};
}));
