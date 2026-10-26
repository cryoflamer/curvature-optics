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
  function planePoint(plane,x,y){return [0,1,2].map(function(i){return plane.pos[i]+x*plane.x[i]+y*plane.y[i];});}
  function normalizePlane(args){
    if(args.length<3||args.length>4||!vec(args[0])||!vec(args[1])||!vec(args[2]))return null;
    var pos=args[0].slice(),x=args[1].slice(),y=args[2].slice();
    if(args[3]===true){
      var len=Math.hypot.apply(null,x);if(!len)return null;x=x.map(function(v){return v/len;});
      var cross=function(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];};
      var z=cross(x,y),zl=Math.hypot.apply(null,z);if(!zl)return null;
      y=cross(z.map(function(v){return v/zl;}),x);
    }else if(args.length===4&&args[3]!==false&&args[3]!=null)return null;
    return {pos:pos,x:x,y:y};
  }
  function planePolygon(args){
    var xs=args[0],ys=args[1];
    if(!Array.isArray(xs)||!Array.isArray(ys)||!xs.every(Number.isFinite)||!ys.every(Number.isFinite))return null;
    var mode=args.length>2&&args[2]!=null?args[2]:1;
    var size=args.length>3&&args[3]!=null?args[3]:xs.length;
    if(!Number.isInteger(mode)||!Number.isInteger(size)||size<3||size>xs.length||size>ys.length)return null;
    return {xs:xs.slice(0,size),ys:ys.slice(0,size),mode:mode};
  }
  function extract(frame){
    if(!frame||!Array.isArray(frame.commands))throw new TypeError('SceneFrame commands required');
    var primitives=[],unsupported={},supported=0,polygons=0,vertices=0,discarded=0;
    var active=null, plane=null, matrix=null, stack=[],angleMeasure=frame.bootstrap&&frame.bootstrap.AngleMeasure||'rad';
    var style={fill:'white',stroke:'black',lineWidth:1,alpha:1},cameraNear=1e-6;
    function styleCopy(){return Object.assign({},style);}
    function color(v){if(typeof v==='string')return v;if(Array.isArray(v)&&v.length>=3&&v.slice(0,3).every(Number.isFinite)){var n=v.slice(0,3).map(x=>Math.max(0,Math.min(255,Math.round(255*x))));return 'rgb('+n.join(',')+')';}return null;}
    function setColor(key,v){var c=color(v);if(c===null)return false;style[key]=c;return true;}
    function setWidth(v){if(!Number.isFinite(v))return false;style.lineWidth=Math.max(0,v);return true;}
    var transformOps={TransMove3D:1,TransScale3D:1,TransRotateX3D:1,TransRotateY3D:1,TransRotateZ3D:1};
    function reject(method){unsupported[method]=(unsupported[method]||0)+1;}
    frame.commands.forEach(function(command,index){
      var method=command&&command.method, args=command&&command.args;
      if(!Array.isArray(args)){reject(method||'<invalid>');return;}
      if(method==='SetBgColor'||method==='SetColor'){
        if(args.length===1&&setColor(method==='SetBgColor'?'fill':'stroke',args[0]))supported++;else reject(method);
      }else if(method==='SetLineWidth'){
        if(args.length===1&&setWidth(args[0]))supported++;else reject(method);
      }else if(method==='SetAlpha'){
        if(args.length===1&&Number.isFinite(args[0])){style.alpha=Math.max(0,Math.min(1,args[0]));supported++;}else reject(method);
      }else if(method==='SetAreaAttr'||method==='SetLineAttr'){
        if(args.length<1||args.length>(method==='SetAreaAttr'?3:2)){reject(method);}else{
          var updated=styleCopy(),ok=true;
          if(method==='SetAreaAttr'){if(args[0]!=null)ok=setColor('fill',args[0])&&ok;if(args[1]!=null)ok=setColor('stroke',args[1])&&ok;if(args[2]!=null)ok=setWidth(args[2])&&ok;}
          else{if(args[0]!=null)ok=setColor('stroke',args[0])&&ok;if(args[1]!=null)ok=setWidth(args[1])&&ok;}
          if(ok)supported++;else{style=updated;reject(method);}
        }
      }else if(method==='SetCameraClipping'){
        if(args.length===1&&Number.isFinite(args[0])&&args[0]>=0){cameraNear=args[0]||1e-6;supported++;}else reject(method);
      }else if(transformOps[method]){
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
      }else if(method==='SetPlane'){
        var nextPlane=normalizePlane(args);
        if(nextPlane){plane=nextPlane;supported++;}else{plane=null;reject(method);}
      }else if(method==='PolygonOnPlane'){
        var poly=planePolygon(args);
        if(plane&&poly){
          primitives.push({type:'polygon',points:poly.xs.map(function(x,i){return transform(matrix,planePoint(plane,x,poly.ys[i]));}),
            mode:poly.mode,style:styleCopy(),commandIndex:index,sourceCommandIndices:[index]});
          supported++;polygons++;vertices+=poly.xs.length;
        }else reject(method);
      }else if(method==='CircleOnPlane'){
        // A filled horizon disk is an occluder in the legacy painter-order pass.
        // Tessellation is diagnostic, not pixel-identical to GraphX3DX's adaptive ellipse.
        var cx=args[0],cy=args[1],radius=args[2],mode=args.length>3&&args[3]!=null?args[3]:1;
        if(plane&&args.length>=3&&args.length<=5&&[cx,cy,radius].every(Number.isFinite)&&Number.isInteger(mode)&&radius>0){
          var steps=256,points=[];
          for(var k=0;k<steps;k++){
            var theta=2*Math.PI*k/steps;
            points.push(transform(matrix,planePoint(plane,cx+radius*Math.cos(theta),cy+radius*Math.sin(theta))));
          }
          primitives.push({type:'polygon',points:points,mode:mode,style:styleCopy(),commandIndex:index,sourceCommandIndices:[index],sourceMethod:'CircleOnPlane',approximation:'256-segment circle'});
          supported++;polygons++;vertices+=steps;
        }else reject(method);
      }else if(method==='LineOnPlane'){
        var coords=args.length>=2&&Array.isArray(args[0])&&Array.isArray(args[1])&&args[0].length===2&&args[1].length===2?
          [args[0][0],args[0][1],args[1][0],args[1][1]]:args.slice(0,4);
        if(plane&&coords.length===4&&coords.every(Number.isFinite)){
          primitives.push({type:'line',points:[planePoint(plane,coords[0],coords[1]),planePoint(plane,coords[2],coords[3])].map(function(p){return transform(matrix,p);}),style:styleCopy(),commandIndex:index});
          supported++;
        }else reject(method);
      }else if(method==='Line3D'){
        var ends=endpoints(args);
        if(ends){primitives.push({type:'line',points:ends.map(function(p){return transform(matrix,p);}),style:styleCopy(),commandIndex:index});supported++;}
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
            mode:mode,style:styleCopy(),commandIndex:index,sourceCommandIndices:active.indices.concat(index)});
          supported++;polygons++;
        }else{reject(method);discarded++;}
        // Keep the inverted buffer for any subsequent DrawPoly3D call.
      }else reject(method||'<invalid>');
    });
    return {
      scene:contract.createScene('legacy',primitives,{partial:true,coordinateSpace:'world',
        cameraNear:cameraNear,warning:'Supported 3D affine transforms resolved; clipping and viewport-dependent curves remain approximations'}),
      coverage:{total:frame.commands.length,supported:supported,unsupported:frame.commands.length-supported,
        unsupportedByMethod:unsupported,complete:supported===frame.commands.length,
        completedPolygons:polygons,polygonVertices:vertices,discardedPolygonSequences:discarded,
        primitiveCount:primitives.length}
    };
  }
  return {extract:extract};
}));
