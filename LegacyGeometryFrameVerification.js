/* Compare extracted world coordinates with the original GraphX3DX math on a captured frame.
 * Only explicitly supported geometry is compared; unsupported state is reported, never guessed.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.LegacyGeometryFrameVerification=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function verify(frame,scene,math,options){
    if(!frame||!Array.isArray(frame.commands)||!scene||!Array.isArray(scene.primitives)||!math||!math.mat||!math.plane)throw new TypeError('Frame, extracted scene and reference math required');
    var tolerance=options&&options.tolerance!==undefined?options.tolerance:1e-9;
    if(!(tolerance>=0&&Number.isFinite(tolerance)))throw new TypeError('Invalid tolerance');
    var mat=math.mat, matrix=null,stack=[],plane=null,active=null,angle=frame.bootstrap&&frame.bootstrap.AngleMeasure||'rad';
    var expected=new Map(), skipped={}, firstMismatch=null, maxError=0, compared=0, coordinates=0;
    function skip(name){skipped[name]=(skipped[name]||0)+1;}
    function apply(p){return matrix?Array.from(mat.Trans(matrix,p.slice())):p.slice();}
    function valid(p){return Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);}
    frame.commands.forEach(function(c,index){
      var a=c.args||[],m=c.method, next=null;
      if(m==='TransMove3D'||m==='TransScale3D'){
        var v=a.length===1&&valid(a[0])?a[0]:a;
        if(valid(v))next=m==='TransMove3D'?mat.Moving.apply(mat,v):mat.Scaling.apply(mat,v);
      }else if(/^TransRotate[XYZ]3D$/.test(m)){
        if(a.length===1&&Number.isFinite(a[0]))next=mat['Rotating'+m[11]](a[0]*(angle==='deg'?Math.PI/180:1));
      }
      if(next){matrix=matrix?mat.Mult(next,matrix):next;return;}
      if(m==='ResetTrans3D'){matrix=null;if(a[0]===true)stack=[];}
      else if(m==='SaveTrans3D'){stack.push(matrix?mat.Copy(matrix):null);if(a[0]===true)matrix=null;}
      else if(m==='RestoreTrans3D'){if(stack.length)matrix=stack.pop();}
      else if(m==='SetAngleMeasure'){if(a[0]==='rad'||a[0]==='deg')angle=a[0];}
      else if(m==='SetPlane'){
        if(a.length>=3&&valid(a[0])&&valid(a[1])&&valid(a[2])){
          plane=new math.plane(a[0].slice(),a[1].slice(),a[2].slice(),a[3]===true);
        }else plane=null;
      }else if(m==='NewPoly3D'){active={points:[],applyTrans:a[0]===true};}
      else if(m==='AddPointToPoly3D'){
        var p=a.length===1?a[0]:a;
        if(active&&valid(p))active.points.push(active.applyTrans?apply(p):p.slice());
      }else if(m==='DrawPoly3D'){
        if(active&&active.points.length>=3){
          var mode=a.length?a[0]:1;
          if(Number.isInteger(mode)&&mode&16)active.points.reverse();
          expected.set(index,active.points.map(function(p){return active.applyTrans?p.slice():apply(p);}));
        }
      }else if(m==='PolygonOnPlane'){
        var xs=a[0],ys=a[1],size=a.length>3?a[3]:xs&&xs.length;
        if(plane&&Array.isArray(xs)&&Array.isArray(ys)&&Number.isInteger(size)&&size>=3&&size<=xs.length&&size<=ys.length){
          expected.set(index,Array.from({length:size},function(_,i){return apply(Array.from(plane.PointOnPlane(xs[i],ys[i])));}));
        }
      }else if(m==='LineOnPlane'){
        var v=a.length>=2&&Array.isArray(a[0])&&Array.isArray(a[1])?[a[0][0],a[0][1],a[1][0],a[1][1]]:a.slice(0,4);
        if(plane&&v.length===4&&v.every(Number.isFinite))expected.set(index,[apply(Array.from(plane.PointOnPlane(v[0],v[1]))),apply(Array.from(plane.PointOnPlane(v[2],v[3])))]);
      }else if(m==='Line3D'){
        var ends=a.length>=2&&valid(a[0])&&valid(a[1])?[a[0],a[1]]:a.length>=6?[a.slice(0,3),a.slice(3,6)]:null;
        if(ends&&ends.every(valid))expected.set(index,ends.map(apply));
      }
    });
    scene.primitives.forEach(function(p){
      var ref=expected.get(p.commandIndex);
      if(!ref){skip('noReference');return;}
      if(ref.length!==p.points.length){skip('vertexCountMismatch');if(!firstMismatch)firstMismatch={commandIndex:p.commandIndex,reason:'vertexCount'};return;}
      compared++;
      ref.forEach(function(v,i){for(var j=0;j<3;j++){
        var err=Math.abs(v[j]-p.points[i][j]);coordinates++;
        if(!Number.isFinite(err)||err>tolerance){if(!firstMismatch)firstMismatch={commandIndex:p.commandIndex,vertex:i,axis:j,expected:v[j],actual:p.points[i][j],error:err};}
        if(err>maxError)maxError=err;
      }});
    });
    return {reference:'GraphX3DX JsgMat3/JsgPlane',tolerance:tolerance,extractedPrimitives:scene.primitives.length,comparedPrimitives:compared,comparedCoordinates:coordinates,maxAbsoluteError:maxError,firstMismatch:firstMismatch,skipped:skipped,passed:!firstMismatch&&compared===scene.primitives.length};
  }
  return {verify:verify};
}));
