/* Pure, opt-in world-space geometry for independently ported object types.
 * No GraphX3DX, DOM, canvas or legacy command recording is used here.
 */
(function(root,factory){
  var api=factory(root.CurvatureSceneContract || (typeof require==='function'?require('../scene/CurvatureSceneContract'):null),
    root.CurvaturePhysicalWorldGeometry || (typeof require==='function'?require('./CurvaturePhysicalWorldGeometry'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureGeometryEngine=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(contract,physicalWorld){
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
  function localTowerType2(hidden){
    var primitives=shapes.slice(0,7).map(function(s){return {type:'polygon',points:s[0].map(function(x,i){return [x,s[1][i]];}),mode:s[2]};});
    bars.forEach(function(b){primitives.push({type:'line',points:[[b[0],b[1]],[b[2],b[3]]]});});
    var foundation=shapes[7];
    primitives.push({type:'polygon',points:foundation[0].map(function(x,i){return [x,foundation[1][i]];}),mode:3,style:{fill:hidden?'#dcc493':'#a38d60'}});
    return primitives;
  }
  // The first object bank uses a distinct T-Tower silhouette. Preserve
  // DrawShape's polygon order and closure, including the foundation fill.
  function localTowerType1(hidden){
    var polygons=[
      [[.09,-.12,-.06,.14,.12,.12,.16,.16,.14,.06,-.06,-.14,-.12,-.12,-.16,-.16,-.14,.06,.12,-.09],
       [.31,.14,.48,.82,.89,.93,1,.89,.82,.48,.48,.82,.89,.93,1,.89,.82,.48,.14,.31]],
      [[.06,-.09,.09,-.06],[.48,.31,.31,.48]],
      [[-.28,.28,.16,-.16,-.28],[.89,.89,.93,.93,.89]],
      [[-.145,-.095,-.095,.095,.095,.145,.145,-.145,-.145],[0,0,.105,.105,0,0,.137,.137,0]]
    ];
    return polygons.map(function(v,i){
      var p={type:'polygon',points:v[0].map(function(x,j){return [x,v[1][j]];}),mode:i===3?3:1};
      if(i===3)p.style={fill:hidden?'#dcc493':'#a38d60'};
      return p;
    });
  }
  // Small non-tower silhouettes from DrawShape. Geometry is authored as
  // values; no Canvas/GraphX3DX methods are called by the engine.
  function localMRod(hidden){
    function rect(x1,y1,x2,y2,mode,fill){
      return {type:'polygon',points:[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]],
        mode:mode,style:{fill:fill}};
    }
    var yellow=hidden?'#ff4':'yellow',red=hidden?'#f66':'red';
    var result=[rect(-.1,0,.1,1,2,yellow),rect(-.1,.5,0,1,2,red)];
    for(var i=.1;i<1;i+=.2)result.push(rect(0,i,.1,i+.1,2,red));
    result.push(rect(-.1,0,.1,1,1,red));
    return result;
  }
  function localShip(hidden){
    var data=[
      [[-.15,.15,.2,-.2,-.15],[0,0,.15,.15,0],'#654130','#937162'],
      [[-.2,-.1,.1,.2,.3,-.3,-.2],[.15,.2,.2,.15,.4,.4,.15],'#7b899a','#a9b6c6'],
      [[-.3,-.1,.1,.3,.25,-.25,-.3],[.4,.45,.45,.4,.6,.6,.4],'#b5bdc3','#d4d9dd'],
      [[-.25,-.1,.1,.25,.2,-.2,-.25],[.6,.65,.65,.6,.8,.8,.6],'#dfe0df','#eff0ef'],
      [[-.2,-.05,.05,.2,.1,-.1,-.2],[.8,.85,.85,.8,1,1,.8],'#dfe0df','#eff0ef']
    ];
    var result=[{type:'polygon',points:data[0][0].map(function(x,i){return [x,data[0][1][i]];}),
      mode:3,style:{fill:hidden?data[0][3]:data[0][2]}} ,
      {type:'line',points:[[0,0],[0,1.05]]}];
    data.slice(1).forEach(function(v){result.push({type:'polygon',
      points:v[0].map(function(x,i){return [x,v[1][i]];}),mode:3,
      style:{fill:hidden?v[3]:v[2]}});});
    return result;
  }
  // Bedford Level markers depend on their position in the *drawn* sequence.
  // Curved paths are tessellated in local space with an explicit resolution;
  // unlike the legacy renderer this resolution is not camera dependent.
  function localBedford(drawn,total,hidden,options){
    if(!Number.isInteger(drawn)||drawn<0||!Number.isInteger(total)||total<1||drawn>=total)
      throw new RangeError('Valid Bedford sequence index and count required');
    options=options||{};
    var segments=options.segments===undefined?64:options.segments;
    if(!Number.isInteger(segments)||segments<8||segments>4096||segments%2)
      throw new RangeError('Even Bedford curve resolution from 8 to 4096 required');
    function poly(points,fill,alpha){
      var p={type:'polygon',points:points,mode:3,style:{fill:fill}};
      if(alpha!==undefined)p.style.alpha=alpha;
      return p;
    }
    function rect(x1,y1,x2,y2,fill,alpha){
      return poly([[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]],fill,alpha);
    }
    function circle(x,y,r){
      var result=[];
      for(var i=0;i<segments;i++){
        var a=2*Math.PI*i/segments;
        result.push([x+r*Math.cos(a),y+Math.abs(r)*Math.sin(a)]);
      }
      return result;
    }
    if(drawn===0){
      // The first marker is the bridge/bar. Its legacy OpenPath3D contains
      // an arc followed by the six-vertex deck polygon.
      var arc=[];
      for(var i=0;i<=segments/2;i++){
        var angle=Math.PI-Math.PI*i/(segments/2);
        arc.push([-.8*Math.cos(angle),.8*Math.sin(angle)]);
      }
      return [poly(arc.concat([[.8,0],[1.2,0],[1.2,1.1],[-1.2,1.1],[-1.2,0],[-.8,0]]),
          hidden?'#ccc':'#aaa'),
        rect(-.3,.85,.3,1.15,'white'),
        rect(-.3,.95,.3,1.05,hidden?'#444':'black')];
    }
    if(total>2&&drawn===total-1){
      var result=[rect(-.01,0,.01,.955,'black',.3)];
      // The legacy scope is a compound path (outer radius .05, inner -.04).
      // Tessellate it as annular quads to retain the transparent aperture.
      var outer=circle(0,1,.05),inner=circle(0,1,.04);
      for(var j=0;j<segments;j++){
        var k=(j+1)%segments;
        result.push(poly([outer[j],outer[k],inner[k],inner[j],outer[j]],'black',.3));
      }
      var lines=[[-.04,1,.04,1],[-.02,.98,-.005,.995],[.02,.98,.005,.995],
        [-.02,1.02,-.005,1.005],[.02,1.02,.005,1.005]];
      lines.forEach(function(v){result.push({type:'line',points:[[v[0],v[1]],[v[2],v[3]]],
        style:{stroke:'orange'}});});
      return result;
    }
    return [rect(-.025,0,.025,1,hidden?'#ff4':'yellow'),
      poly(circle(0,1,.06),hidden?'#f44':'red')];
  }
  // Three independent, authored skyline silhouettes from Legacy DrawShape
  // (ObjType 4). The drawn index determines both the bank (mod 3) and the
  // horizontal mirror (first half of each six-object cycle). The mirror is
  // applied to the whole local x axis, not to world east/north coordinates.
  function localCity(drawn,hidden){
    if(!Number.isInteger(drawn)||drawn<0)
      throw new RangeError('City skyline requires a nonnegative drawn index');
    var primitives=[],fill;
    function color(normal,occluded){fill=hidden?occluded:normal;}
    function polygon(xs,ys,mode){
      primitives.push({type:'polygon',points:xs.map(function(x,i){return [x,ys[i]];}),
        mode:mode,style:{fill:fill}});
    }
    function rect(x1,y1,x2,y2){
      polygon([x1,x2,x2,x1,x1],[y1,y1,y2,y2,y1],3);
    }
    function line(x1,y1,x2,y2){
      primitives.push({type:'line',points:[[x1,y1],[x2,y2]]});
    }
    var kind=drawn%3;
    if(kind===0){
      color('#eca992','#ecc3b4');rect(-1.5,0,-1.2,.4);
      color('#ffeacc','#fff4e5');rect(-1.45,.4,-1.25,.7);rect(-1.4,.7,-1.3,.75);
      line(-1.5,.3,-1.2,.3);line(-1.45,.6,-1.25,.6);
      color('#586a78','#7d868d');rect(-.7,0,-.4,.5);rect(-.65,.5,-.45,.8);
      rect(-.6,0,-.5,1);line(-.56,1,-.56,1.2);line(-.53,1,-.53,1.1);
      color('#f4caa9','#f4e3d5');
      polygon([-.05,-.05,0,0,.1,.2,.2,.25,.25,-.05],
        [0,.45,.5,.6,.75,.6,.5,.45,0,0],3);
      line(0,0,0,.5);line(.2,0,.2,.5);
      color('#ec7266','#f3b0a9');rect(.4,0,.6,.9);
      color('#586a78','#7d868d');
      polygon([1.1,1.2,1.35,1.45,1.1],[0,.8,.8,0,0],3);
      line(1.4,0,1.3,.8);line(1.25,.8,1.25,1);line(1.3,.8,1.3,1);
    }else if(kind===1){
      color('#fbd9c6','#fbebe2');rect(-1.7,0,-1.5,.5);
      color('#fbebe2','#fbf5f1');
      polygon([-1.68,-1.68,-1.6,-1.52,-1.52,-1.68],[.5,.6,.7,.6,.5,.5],3);
      line(-1.68,.6,-1.52,.6);
      color('#6d6870','#9a939e');rect(-1.1,0,-.9,.55);
      color('#dfbb97','#dfcfbf');rect(-1,0,-.8,.45);rect(-1.05,.55,-.95,.6);
      color('#b7997c','#cdbdad');rect(-.3,0,.2,.4);
      color('#ffeac6','#fff5e5');rect(-.25,.3,.15,.35);
      color('#f3dca7','#f3e5c5');rect(.6,0,1,.4);
      color('#c19f89','#e2bfa9');
      polygon([.7,.7,.8,.9,.9,.7],[0,.5,.7,.5,0,0],3);
      color('#4b5866','#7b8591');rect(1.6,0,1.9,.6);
      color('#012a46','#3b5465');rect(1.7,0,1.8,.65);
    }else{
      color('#eacfae','#eaddce');rect(-2,0,-1.8,.4);
      color('#525462','#8a8c98');rect(-1.8,0,-1.7,.4);
      color('#b59776','#dac2a8');rect(-1.4,0,-1,.3);
      color('#9c504d','#c18d8b');rect(-1.35,.3,-1.05,.35);
      color('#46352d','#827067');rect(-.7,0,-.5,.3);
      color('#e5c9a5','#efe2d1');polygon([-.7,-.6,-.5],[.2,.3,.2],1);
      color('#f5d9b4','#f5e9d9');rect(-.3,0,.1,.2);
      color('#39596b','#738c9a');
      polygon([.3,.4,.5,.4,.3],[.4,.6,.4,.2,.4],3);
      color('#878b8e','#a9aeb1');
      polygon([.3,.3,.4,.5,.5,.3],[0,.4,.2,.4,0,0],3);
      line(.4,0,.4,.2);
      color('#f5d9b4','#f5e9d9');rect(.6,0,.8,.2);
      color('#dccace','#f0dde1');rect(.9,0,1.2,.5);
      color('#d3b79e','#e3d7cc');rect(1,0,1.15,.6);
      color('#a17268','#c7a8a2');
      polygon([1.4,1.4,1.5,1.6,1.7,1.8,1.9,2,2,1.4],
        [0,.15,.2,.15,.2,.15,.2,.15,0,0],3);
      line(1.6,0,1.6,.15);line(1.8,0,1.8,.15);
    }
    if(drawn%6<=2)primitives.forEach(function(p){
      p.points.forEach(function(point){point[0]=point[0]===0?0:-point[0];});
    });
    return primitives;
  }
  // Authored Legacy type-5 mountain silhouettes. DrawShape selects its
  // variant with (drawn + bank) % 3, and mirrors the local horizontal axis
  // for the second half of each six-object cycle. The outlines/details are
  // reproduced as value-only primitives; physical visibility is not decided
  // here and remains the responsibility of the common ray solver.
  function localMountain(drawn,bank,hidden){
    if(!Number.isInteger(drawn)||drawn<0)
      throw new RangeError('Mountain requires a nonnegative drawn sequence index');
    if(bank!==0&&bank!==1)throw new RangeError('Mountain bank must be 0 or 1');
    var primitives=[],fill;
    function color(normal,occluded){fill=hidden?occluded:normal;}
    function polygon(xs,ys,mode){
      primitives.push({type:'polygon',points:xs.map(function(x,i){return [x,ys[i]];}),
        mode:mode,style:{fill:fill}});
    }
    function line(x1,y1,x2,y2){
      primitives.push({type:'line',points:[[x1,y1],[x2,y2]]});
    }
    var kind=(drawn%3+bank)%3;
    if(kind===0){
      color('#dbe2ed','#e9f0fc');
      polygon([-1.3,-.8,-.6,-.3,-.1,.1,.2,.4,.5,.6,1.3,-1.3],
        [0,.6,.6,1,.9,.7,.7,.9,.8,.85,0,0],3);
      polygon([-.3,0,.3,.5,.8],[.1,.2,.5,.5,.4],1);
      polygon([-.6,-.3,.1],[.6,.4,.3],1);
      polygon([-.2,-.1,.1],[.5,.6,.7],1);
      polygon([.1,.2,.4,.5],[.5,.6,.7,.8],1);
    }else if(kind===1){
      color('#92aace','#c4d2e8');
      polygon([-1.3,-.8,-.7,-.2,.1,.2,.5,.6,.7,1.3,-1.3],
        [0,.5,.5,1,.8,.7,.7,.6,.6,0,0],3);
      polygon([-.7,-.6,-.3],[.5,.5,.2],1);
      line(.2,.7,.7,.2);line(.6,.6,1.1,.1);
    }else{
      color('#abacb1','#c8c9cf');
      polygon([-1.3,-.7,-.6,-.3,-.3,-.2,-.1,.1,.3,.5,.6,.8,1,1.1,1.3,-1.3],
        [0,.6,.6,.8,.9,1,1,.8,.5,.4,.5,.5,.4,.2,0,0],3);
      polygon([-1,-.6,-.4,-.2,0],[.1,.4,.5,.5,.3],1);
      polygon([-.6,-.5,-.4],[.6,.6,.5],1);
      polygon([-.2,-.1,0],[1,.8,.4],1);
      polygon([0,.3,.6,.8,.9],[.1,.2,.5,.4,.3],1);
    }
    if(drawn%6>2)primitives.forEach(function(p){
      p.points.forEach(function(point){point[0]=point[0]===0?0:-point[0];});
    });
    return primitives;
  }
  // Legacy DrawShape type 6: two supports, transverse deck and parapet.
  // The road between neighbouring supports is constructed in world space by
  // createObjectSequenceScene, because it connects two different placements.
  function localBridge(hidden){
    function rect(x1,y1,x2,y2,fill){
      return {type:'polygon',points:[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]],
        mode:3,style:{fill:fill}};
    }
    return [rect(-.8,0,-.55,.55,hidden?'#d2d2cf':'#adadab'),
      rect(.55,0,.8,.55,hidden?'#d2d2cf':'#adadab'),
      rect(-1,.55,1,.7,hidden?'#b9b19e':'#8c8678'),
      {type:'polygon',points:[[-1,1],[-1,.9],[-.95,.9],[-.95,.7],
        [.95,.7],[.95,.9],[1,.9],[1,1],[-1,1]],mode:3,
        style:{fill:hidden?'#858b85':'#565a56'}}];
  }
  // Source DrawShape type 7 (Tensas Bayou), in metres.  Legacy deliberately
  // ignores ObjSize and ObjSizeVar for the local transform: heights, spans,
  // shoulder rails, and the centre crossover are authored world dimensions.
  // Longitudinal road/shore strips are joined below, between placements.
  function tensasDimensions(drawn,variation){
    if(!Number.isInteger(drawn)||drawn<0||!Number.isFinite(variation))
      throw new RangeError('Tensas requires a drawn index and finite size variation');
    var h=9.5,p=25.1,w=6.1;
    if(drawn<2){h=25.5;p=5.1;w=5;}
    else if(drawn<4){h=drawn===2?23.3:17.3;p=5.1;w=5;}
    else if(drawn<6){if(drawn===4)h=11.4;p=drawn===4?11.7:18.4;
      w=drawn===4?5.4:5.8;}
    return {height:h*(variation+1),offset:p,width:w};
  }
  function localTensas(drawn,variation,hidden){
    var d=tensasDimensions(drawn,variation),h=d.height,p=d.offset,w=d.width;
    var out=[],fill;
    function color(a,b){fill=hidden?b:a;}
    function poly(xs,ys){out.push({type:'polygon',mode:3,
      points:xs.map(function(x,i){return [x,ys[i]];}),style:{fill:fill}});}
    function rect(x1,y1,x2,y2){poly([x1,x2,x2,x1,x1],[y1,y1,y2,y2,y1]);}
    color('#adadab','#d2d2cf');
    [-1,1].forEach(function(sign){
      rect(sign*p-(w-1.3),0,sign*p-(w-2.7),h-2.4);
      rect(sign*p+(w-2.7),0,sign*p+(w-1.3),h-2.4);
    });
    color('#8c8678','#b9b19e');
    [-1,1].forEach(function(sign){rect(sign*p-w,h-2.4,sign*p+w,h-1.2);});
    color('#565a56','#858b85');
    [-1,1].forEach(function(sign){var c=sign*p;
      poly([c-w,c-w,c-(w-1.3),c-(w-1.3),c+(w-1.3),c+(w-1.3),
        c+w,c+w,c+(w-.4),c+(w-.4),c-(w-.4),c-(w-.4),c-w],
        [h+.8,h-.2,h-.2,h-1.2,h-1.2,h-.2,h-.2,h+.8,h+.8,h,h,h+.8,h+.8]);
    });
    // Only the 48th drawn segment connects the two carriageways.
    if(drawn===47){
      color('#565a56','#858b85');
      poly([-p+w,-p+w,-p+20.1,p-20.1,p-w,p-w,p-20.1,-p+20.1,-p+w],
        [h+.8,h-.2,h,h,h-.2,h+.8,h+1,h+1,h+.8]);
      color('#adadab','#d2d2cf');
      poly([-p+w,-p+w,-p+20.1,p-20.1,p-w,p-w,p-20.1,-p+20.1,-p+w],
        [h-.2,h-1,h-.8,h-.8,h-1,h-.2,h,h,h-.2]);
      color('#8c8678','#b9b19e');
      rect(-p+(w+.1),h-1.8,-p+(w+1.3),h-1);
      rect(+p-(w+.1),h-1.8,+p-(w+1.3),h-1);
      rect(-p+18.5,h-1.6,-p+19.7,h-.8);
      rect(+p-18.5,h-1.6,+p-19.7,h-.8);
      color('#565a56','#858b85');
      poly([-p+(w+.1),-p+(w-.5),-p+(w+.1),-p+(w+.7),-p+(w+.1)],
        [h-1.8,0,0,h-1.8,h-1.8]);
      poly([+p-(w+.1),+p-(w-.5),+p-(w+.1),+p-(w+.7),+p-(w+.1)],
        [h-1.8,0,0,h-1.8,h-1.8]);
      poly([-p+(w+.7),-p+(w+1.3),-p+(w+1.9),-p+(w+1.3),-p+(w+.7)],
        [h-1.8,0,0,h-1.8,h-1.8]);
      poly([+p-(w+.7),+p-(w+1.3),+p-(w+1.9),+p-(w+1.3),+p-(w+.7)],
        [h-1.8,0,0,h-1.8,h-1.8]);
      poly([-p+18.5,-p+17.9,-p+18.5,-p+19.1,-p+18.5],
        [h-1.6,0,0,h-1.6,h-1.6]);
      poly([+p-18.5,+p-17.9,+p-18.5,+p-19.1,+p-18.5],
        [h-1.6,0,0,h-1.6,h-1.6]);
      poly([-p+19.1,-p+19.7,-p+20.3,-p+19.7,-p+19.1],
        [h-1.6,0,0,h-1.6,h-1.6]);
      poly([+p-19.1,+p-19.7,+p-20.3,+p-19.7,+p-19.1],
        [h-1.6,0,0,h-1.6,h-1.6]);
    }
    return out;
  }
  function tensasStrip(previous,current,hidden,kind,edge){
    var before=towerPlacement(previous.params),after=towerPlacement(current.params);
    function vertex(plane,x,y){return [0,1,2].map(function(i){return plane.origin[i]+
      x*plane.xAxis[i]+y*plane.yAxis[i];});}
    var old=previous.scene.metadata.drawn,now=current.scene.metadata.drawn,
      variation=current.variation,d=tensasDimensions(now,variation);
    var p=kind==='tensas-shore'?100:d.offset, w=kind==='tensas-shore'?0:d.width-.4,
      height=kind==='tensas-shore'?4.2*(variation+1)*(now===8?0:1):d.height,
      oldHeight;
    if(kind==='tensas-shore')oldHeight=4.2*(previous.variation+1)*(old===8?0:1);
    else oldHeight=tensasDimensions(old,previous.variation).height;
    var left=edge===undefined?-p-w:edge*p-w,right=edge===undefined?p+w:edge*p+w;
    var oldD=kind==='tensas-shore'?null:tensasDimensions(old,previous.variation);
    var oldL=oldD?edge*oldD.offset-(oldD.width-.4):left;
    var oldR=oldD?edge*oldD.offset+(oldD.width-.4):right;
    return {type:'polygon',mode:3,points:[vertex(before,oldL,oldHeight),
      vertex(before,oldR,oldHeight),vertex(after,right,height),vertex(after,left,height)],
      style:{fill:kind==='tensas-shore'?(now===8?'#687e28':'#49884b'):
        (hidden?'#adb1bc':'#999ba2')},
      metadata:{kind:kind,physicalObject:true}};
  }
  function bridgeRoad(previous,current,hidden){
    // Road top is at the local y=1 in both neighbouring placed planes.
    // Legacy DrawShape's LastRoadP11/P12 track the preceding support;
    // a separate column (side variation = two rows) never crosses to another.
    var old=towerPlacement(previous),next=towerPlacement(current);
    function point(plane,x){return [0,1,2].map(function(i){return plane.origin[i]+
      x*plane.xAxis[i]+plane.yAxis[i];});}
    return {type:'polygon',mode:3,points:[point(old,-1),point(old,1),
      point(next,1),point(next,-1)],style:{fill:hidden?'#e8e4dc':'#cdcac3'},
      metadata:{kind:'bridge-road',physicalObject:true}};
  }
  // Independent, stateless local transcription of source Soundly DrawShape.
  // This local geometry recorder does not call Legacy, Canvas, or GraphX3DX;
  // continuous road meshes are joined separately in physical world space.
  function localSoundly(drawn,total,variation,sidePos,objType,hidden){
    if(![8,9].includes(objType)||!Number.isInteger(drawn)||drawn<0||
       !Number.isInteger(total)||total<1||drawn>=total||
       !Number.isFinite(variation)||!Number.isFinite(sidePos))
      throw new RangeError('Soundly requires valid drawn index, count and variation');
    var primitives=[],fill=null,stroke='black',alpha=1;
    var g={Poly:[],
      SetBgColor:function(c){fill=c;},SetColor:function(c){stroke=c;},
      SetAreaAttr:function(c){fill=c;},SetAlpha:function(a){alpha=a;},
      NewPoly:function(){this.Poly=[];},
      AddPointToPoly:function(x,y){this.Poly.push([x,y]);},
      PolygonOnPlane:function(xs,ys,mode){
        var points,m;
        if(mode===undefined){points=xs.map(function(v){return v.slice();});m=ys;}
        else {points=xs.map(function(x,i){return [x,ys[i]];});m=mode;}
        var prim={type:'polygon',points:points,mode:m},style={};
        // Legacy mode 2 is a filled polygon without an outline. Losing its
        // colour makes slender lamp posts white against the sky, leaving
        // their darker fixtures apparently floating in mid-air.
        if(m&2)style.fill=fill;
        if(m&1)style.stroke=stroke;
        if(alpha!==1)style.alpha=alpha;
        if(Object.keys(style).length)prim.style=style;
        primitives.push(prim);
      },
      RectOnPlane:function(x1,y1,x2,y2,mode){
        this.PolygonOnPlane([x1,x2,x2,x1,x1],[y1,y1,y2,y2,y1],mode);
      },
      LineOnPlane:function(x1,y1,x2,y2){
        primitives.push({type:'line',points:[[x1,y1],[x2,y2]],style:{stroke:stroke}});
      },
      GetTransPointOnPlane:function(x,y,p){p[0]=x;p[1]=y;p[2]=0;}
    };
    var JsgVect3={Null:function(){return [0,0,0];},Copy:function(p){return p.slice();}};
    var objIx=0;
    var m={NObjectsDrawn:[drawn],NObjects:[total],ObjSizeVar:[variation],
      ObjSidePos:[sidePos],LastPosValid:[false],isHiddenObj:[!!hidden]};
    function setBgColor(normal,behind){g.SetBgColor(hidden?behind:normal);}
    // Soundly demo: Causew-S and Causew-N

    var p1 = JsgVect3.Null();
    var p2 = JsgVect3.Null();
    var nDraw = m.NObjectsDrawn[objIx];
    if (objType == 9) {
      // draw backward
      nDraw = m.NObjects[objIx] - 1 - nDraw;
    }
    var roadH = 5 * (m.ObjSizeVar[objIx] + 1);
    var roadP = 17;
    var roadW = 5;
    var roadN = 0; // narrowing of east road

    // draw roads
    var roadS = 1;
    if (m.ObjSidePos[objIx] < 0) roadS = -1;

    // compute ship passages
    if (nDraw == 106 || nDraw == 107 || nDraw == 64 || nDraw == 63 || nDraw == 21 || nDraw == 20) {
      roadH += 2.5;
    }
    if (nDraw == 86 || nDraw == 87 || nDraw == 41 || nDraw == 42) {
      roadH += 12;
    }

    // compute narrowing of roads
    if (nDraw >= 121) {
      roadN = 18 * (nDraw - 121) / 7
    }
    if (nDraw <= 7) {
      roadN = 18 * (7-nDraw) / 7;
    }
    var underH = roadH - 3;
    var underL = 24.1;
    var underR = 26.8;
/*
    function DrawUnderPassageRamp( lastP ) {
      if (!m.LastPosValid[objIx]) return;
      var rp1 = JsgVect3.Null();
      var rp2 = JsgVect3.Null();
      g.GetTransPointOnPlane( -roadP-underL, underH, rp1 );
      g.GetTransPointOnPlane( -roadP-(underL-5), underH, rp2 );
      g.SaveTrans3D( true );
      g.NewPoly3D();
      g.AddPointToPoly3D( lastP );
      g.AddPointToPoly3D( JsgVect3.Add( lastP, [5,0,0] ) );
      g.AddPointToPoly3D( rp2 );
      g.AddPointToPoly3D( rp1 );
      setBgColor( '#999ba2', '#adb1bc' );
      g.DrawPoly3D( 7 );
      g.RestoreTrans3D();
    }
*/
    function DrawTower( base, center, height, basew, topw, nbars ) {
      g.SetAlpha( 0.3 );
      setBgColor( '#888888', '#aaaaaa' );
      g.PolygonOnPlane(
        [ center-basew/2, center+basew/2, center+topw/2, center-topw/2, center-basew/2 ],
        [ base, base, base+height, base+height, base ], 3 );
      g.NewPoly();
      var dh = height / nbars;
      var hlimit = height + dh/2;
      var slope = (topw-basew) / 2 / height;
      var s = 1;
      for (var hoff = 0; hoff < hlimit; hoff += dh) {
        g.AddPointToPoly( center+s*(hoff*slope+basew/2), hoff+base );
        s *= -1;
      }
      g.PolygonOnPlane( g.Poly, 1 );
      g.NewPoly();
      var s = -1;
      for (var hoff = 0; hoff < hlimit; hoff += dh) {
        g.AddPointToPoly( center+s*(hoff*slope+basew/2), hoff+base );
        s *= -1;
      }
      g.PolygonOnPlane( g.Poly, 1 );
      g.SetAlpha( 1 );
    }

    // World-space road connectors are created after object placement.
    var roadCorrLeftH = 4, w = roadN;

    // draw under passage
    if (nDraw == 79) {

      // pillows
      setBgColor( '#adadab', '#d2d2cf' );
      g.RectOnPlane( -roadP-(underL-1.3), 0, -roadP-(underL-2.7), underH, 3 );
      g.RectOnPlane( -roadP-(underL-7.3), 0, -roadP-(underL-8.7), underH, 3 );
      g.RectOnPlane( -roadP+(underR-1.3), 0, -roadP+(underR-2.7), underH, 3 );
      g.RectOnPlane( -roadP+(underR-7.3), 0, -roadP+(underR-8.7), underH, 3 );

      /*
      // box left
      setBgColor( '#8c8678', '#b9b19e' );
      g.RectOnPlane( -roadP-underL, underH-2.4, -roadP+underR, underH-1.2, 3 );
      */

      // hut
      setBgColor( '#565a56', '#858b85' );
      g.PolygonOnPlane(
        [ -roadP-underL, -roadP-underL, -roadP-(underL-1.3), -roadP-(underL-1.3), -roadP+(underR-1.3), -roadP+(underR-1.3), -roadP+underR, -roadP+underR, -roadP+(underR-0.4), -roadP+(underR-0.4), -roadP-(underL-0.4), -roadP-(underL-0.4), -roadP-underL ],
        [  underH+0.8,  underH-0.2,  underH-0.2,  underH-1.2,  underH-1.2,  underH-0.2,  underH-0.2,  underH+0.8,  underH+0.8,  underH+0.0,  underH+0.0,  underH+0.8,  underH+0.8 ], 3 );

      // base
      setBgColor( '#888888', '#aaaaaa' );
      g.SetAlpha(0.5);
      g.RectOnPlane( -roadP-roadW-13.5, underH, -roadP-roadW, underH+4, 3 );
      g.RectOnPlane( -roadP+roadW, underH, -roadP+roadW+18.6, underH+4, 3 );

      // towers
      var towerOffset = 5.5;
      var c = -roadP - roadW - towerOffset;
      var th = 21.4;
      var bh = underH + 3.2; // 8;
      DrawTower( bh, c, th, 3.8, 3.8, 5 );
      g.RectOnPlane( c-2.4, underH+4, c+2.4, underH+8, 3 );

      var c = -roadP + roadW + towerOffset;
      var th = 14.3;
      DrawTower( bh, c, th, 3.8, 3.8, 5 );
      g.RectOnPlane( c-2.4, underH+4, c+2.4, underH+8, 3 );

      // boxes
      setBgColor( '#8c8678', '#b9b19e' );
      var c = -roadP - roadW - towerOffset;
      g.RectOnPlane( c-1.8, underH+4, c+1.8, underH+7.6, 3 );
      /*
      var c = -roadP - roadW - 3.6;
      g.PolygonOnPlane( [ c-3.2, c-3.2, c, c, c-1.6, c-3.2 ], [ underH+6.7, underH+4, underH+4, underH+6.7, underH+6.9, underH+6.7 ], 3 );
      */
      var c = -roadP + roadW + towerOffset;
      g.RectOnPlane( c-1.8, underH+4, c+1.8, underH+7.6, 3 );
      setBgColor( '#cccccc', '#dddddd' );
      /*
      var c = -roadP + roadW +4.3;
      g.PolygonOnPlane( [ c, c, c+5.3, c+5.3, c+2.65, c ], [ underH+7.2, underH+4, underH+4, underH+7.2, underH+7.5, underH+7.2 ], 3 );
      */

    }

    // draw hump stuff
    if (nDraw == 41) {

      // control buildings
      setBgColor( '#8c8678', '#b9b19e' );
      var x = roadP - roadW;
      var z = roadH;
      g.PolygonOnPlane(
        [ x-2.26, x-2.26, x, x, x-2.51, x-2.51, x-2.01, x-7.28, x-6.78, x-6.78, x-2.26 ],
        [ z-5.52,      0, 0, z,      z, z+2.51, z+5.52, z+5.52, z+2.51, z-4.27, z-5.52 ], 3 );
      setBgColor( '#adadab', '#d2d2cf' );
      g.RectOnPlane( x-8.79, z+2, x-2.25, z+2.5, 3 );
      g.RectOnPlane( x-8.28, z, x-7.28, z+2, 3 );
      // radar
      g.RectOnPlane( x-5.27, z+5.52, x-4.77, z+9.29, 3 );
      g.RectOnPlane( x-6.90, z+8.54, x-3.12, z+9.04, 3 );
      // window
      setBgColor( '#444444', '#666666' );
      g.PolygonOnPlane(
        [ x-6.53, x-2.76, x-2.51, x-6.78, x-6.53 ],
        [ z+3.51, z+3.51, z+4.77, z+4.77, z+3.51 ], 3 );
      // building west
      var x = -roadP - roadW;
      setBgColor( '#8c8678', '#b9b19e' );
      g.PolygonOnPlane(
        [ x-2.26, x-2.26, x, x, x-2.51, x-2.51, x-6.78, x-6.78, x-2.26 ],
        [ z-5.52,      0, 0, z,      z, z+7.03, z+7.03, z-4.27, z-5.52 ], 3 );
      DrawTower( z, x-3.94, 7.53, 6.28, 6.28, 2 );

      // bridge
      setBgColor( '#adadab', '#d2d2cf' );
      g.RectOnPlane( -roadP+roadW, roadH-1.13, roadP-roadW, roadH, 3 );

      // left pillow
      setBgColor( '#8c8678', '#b9b19e' );
      var x = -roadP + roadW;
      g.RectOnPlane( x, 0, x+1.76, z, 3 );

      // tower oeast
      var towerOffset = 1.9;
      var c = +roadP + roadW + towerOffset;
      var th = 10;
      DrawTower( roadH, c, th, 3.8, 3.8, 3 );
      g.RectOnPlane( roadP + roadW, roadH-4, roadP + roadW + 4, roadH, 3 );

      // needle tower
      var towerOffset = 1.25;
      var c = +roadP - roadW - towerOffset;
      var th = 14;
      DrawTower( roadH, c, th, 1.5, 0, 6 );

    }

    // draw ship gide
    if (nDraw == 41 || nDraw == 42 || nDraw == 86 || nDraw == 87) {
      setBgColor( '#8c8678', '#b9b19e' );
      g.SetAlpha( 0.7 );
      g.RectOnPlane( -roadP-roadW-35, 0, +roadP+roadW+35, 3.4, 3 );
      g.SetAlpha( 1 );
      g.RectOnPlane( -roadP-roadW-41.7, 0, -roadP-roadW-35, 2.7, 3 );
      g.RectOnPlane( +roadP+roadW+35, 0, +roadP+roadW+41.7, 2.7, 3 );
    }

    // draw pilows
    w = roadN;
    var hCorrLeft = 0;
    if (nDraw == 79) hCorrLeft = roadCorrLeftH;  // under passage bridge correction
    var roadHC = roadH + hCorrLeft;
    setBgColor( '#adadab', '#d2d2cf' );
    g.RectOnPlane( -roadP-(roadW-1.3), 0, -roadP-(roadW-2.7), roadHC-2.4, 3 );
    g.RectOnPlane( -roadP+(roadW-2.7), 0, -roadP+(roadW-1.3), roadHC-2.4, 3 );
    g.RectOnPlane( +roadP-w-(roadW-1.3), 0, +roadP-w-(roadW-2.7), roadH-2.4, 3 );
    g.RectOnPlane( +roadP-w+(roadW-2.7), 0, +roadP-w+(roadW-1.3), roadH-2.4, 3 );
    setBgColor( '#8c8678', '#b9b19e' );
    g.RectOnPlane( -roadP-roadW, roadHC-2.4, -roadP+roadW, roadHC-1.2, 3 );
    g.RectOnPlane( +roadP-w-roadW, roadH-2.4, +roadP-w+roadW, roadH-1.2, 3 );
    setBgColor( '#565a56', '#858b85' );
    g.PolygonOnPlane(
      [ -roadP-roadW, -roadP-roadW, -roadP-(roadW-1.3), -roadP-(roadW-1.3), -roadP+(roadW-1.3), -roadP+(roadW-1.3), -roadP+roadW, -roadP+roadW, -roadP+(roadW-0.4), -roadP+(roadW-0.4), -roadP-(roadW-0.4), -roadP-(roadW-0.4), -roadP-roadW ],
      [  roadHC+0.8,  roadHC-0.2,  roadHC-0.2,  roadHC-1.2,  roadHC-1.2,  roadHC-0.2,  roadHC-0.2,  roadHC+0.8,  roadHC+0.8,  roadHC+0.0,  roadHC+0.0,  roadHC+0.8,  roadHC+0.8 ], 3 );
    g.PolygonOnPlane(
      [ +roadP-w-roadW, +roadP-w-roadW, +roadP-w-(roadW-1.3), +roadP-w-(roadW-1.3), +roadP-w+(roadW-1.3), +roadP-w+(roadW-1.3), +roadP-w+roadW, +roadP-w+roadW, +roadP-w+(roadW-0.4), +roadP-w+(roadW-0.4), +roadP-w-(roadW-0.4), +roadP-w-(roadW-0.4), +roadP-w-roadW ],
      [  roadH+0.8,  roadH-0.2,  roadH-0.2,  roadH-1.2,  roadH-1.2,  roadH-0.2,  roadH-0.2,  roadH+0.8,  roadH+0.8,  roadH+0.0,  roadH+0.0,  roadH+0.8,  roadH+0.8 ], 3 );

    // draw big transmission towers
    if (nDraw == 84) {
      var c = +roadP - roadW - 6.7;
      DrawTower( roadH, c, 32, 7.7, 4.8, 5 );

      setBgColor( '#8c8678', '#b9b19e' );
      g.RectOnPlane( -roadP+roadW+2.2, roadH, -roadP+roadW+6.8, roadH+3.8, 3 );
    }

    // double towers from north view
    if (nDraw == 39 && objType == 9) {
      // DrawTower( base, center, height, basew, topw, nbars );
      DrawTower( roadH, -6.25, 9.5, 1.79, 1.79, 5 );
      DrawTower( roadH,  6.25, 9.5, 1.79, 1.79, 5 );
    }

    // draw bridges
    if (nDraw == 18 || nDraw == 39 || nDraw == 44 || nDraw == 61 || nDraw == 84 || nDraw == 89 || nDraw == 110) {
      setBgColor( '#565a56', '#858b85' );
      g.RectOnPlane( -roadP+roadW, roadH-0.2, roadP-roadW, roadH+0.8, 3 );

      setBgColor( '#adadab', '#d2d2cf' );
      g.RectOnPlane( -roadP+roadW, roadH-1.4, roadP-roadW, roadH-0.2, 3 );

      g.RectOnPlane( -roadP+(roadW+0.1), roadH-2.8, -roadP+(roadW+1.0), roadH-1.4, 3 );
      g.RectOnPlane( +roadP-(roadW+0.1), roadH-2.8, +roadP-(roadW+1.0), roadH-1.4, 3 );

      setBgColor( '#8c8678', '#b9b19e' );
      g.RectOnPlane( -roadP+(roadW+0.2), 0, -roadP+(roadW+0.9), roadH-2.8, 3 );
      g.RectOnPlane( +roadP-(roadW+0.2), 0, +roadP-(roadW+0.9), roadH-2.8, 3 );

      // signs
      if (objType == 8) {
        if (nDraw != 89 && nDraw != 44) {
          setBgColor( '#cccccc', '#dddddd' );
          g.RectOnPlane( -roadP+(roadW+1.0+7.5), roadH+1.8, -roadP+(roadW+1.0), roadH+1.8+2.2, 3 );
        }
        if (nDraw != 84 && nDraw != 39) {
          setBgColor( '#444444', '#666666' );
          g.RectOnPlane( +roadP-(roadW+1.0+7.5), roadH+1.8, +roadP-(roadW+1.0), roadH+1.8+2.2, 3 );
        }
        setBgColor( '#666666', '#888888' );
        if (nDraw != 89 && nDraw != 44) {
          g.LineOnPlane( -roadP+(roadW+1.0+7.5), roadH+0.9, -roadP+(roadW+1.0+7.5), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0+5  ), roadH+0.9, -roadP+(roadW+1.0+5  ), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0+2.5), roadH+0.9, -roadP+(roadW+1.0+2.5), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0    ), roadH+0.9, -roadP+(roadW+1.0    ), roadH+1.8 );
        }
        if (nDraw != 84 && nDraw != 39) {
          g.LineOnPlane( +roadP-(roadW+1.0+7.5), roadH+0.9, +roadP-(roadW+1.0+7.5), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0+5  ), roadH+0.9, +roadP-(roadW+1.0+5  ), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0+2.5), roadH+0.9, +roadP-(roadW+1.0+2.5), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0    ), roadH+0.9, +roadP-(roadW+1.0    ), roadH+1.8 );
        }
      } else {
        if (nDraw != 89 && nDraw != 44) {
          setBgColor( '#444444', '#666666' );
          g.RectOnPlane( -roadP+(roadW+1.0+7.5), roadH+1.8, -roadP+(roadW+1.0), roadH+1.8+2.2, 3 );
        }
        if (nDraw != 84 && nDraw != 39) {
          setBgColor( '#cccccc', '#dddddd' );
          g.RectOnPlane( +roadP-(roadW+1.0+7.5), roadH+1.8, +roadP-(roadW+1.0), roadH+1.8+2.2, 3 );
        }
        setBgColor( '#666666', '#888888' );
        if (nDraw != 89 && nDraw != 44) {
          g.LineOnPlane( -roadP+(roadW+1.0+7.5), roadH+0.9, -roadP+(roadW+1.0+7.5), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0+5  ), roadH+0.9, -roadP+(roadW+1.0+5  ), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0+2.5), roadH+0.9, -roadP+(roadW+1.0+2.5), roadH+1.8 );
          g.LineOnPlane( -roadP+(roadW+1.0    ), roadH+0.9, -roadP+(roadW+1.0    ), roadH+1.8 );
        }
        if (nDraw != 84 && nDraw != 39) {
          g.LineOnPlane( +roadP-(roadW+1.0+7.5), roadH+0.9, +roadP-(roadW+1.0+7.5), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0+5  ), roadH+0.9, +roadP-(roadW+1.0+5  ), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0+2.5), roadH+0.9, +roadP-(roadW+1.0+2.5), roadH+1.8 );
          g.LineOnPlane( +roadP-(roadW+1.0    ), roadH+0.9, +roadP-(roadW+1.0    ), roadH+1.8 );
        }
      }

      // lights
      setBgColor( '#aaaaaa', '#bbbbbb' );
      g.RectOnPlane( -roadP-roadW-0.14, roadH, -roadP-roadW+0.14, roadH+18.0, 2 );
      g.RectOnPlane( -roadP-roadW+0.14, roadH+17.3, -roadP-roadW+1.14, roadH+17.7, 2 );
      g.SetAreaAttr( '#eeeeee', '#aaaaaa', 1 );
      g.RectOnPlane( -roadP-roadW+0.63, roadH+16.8, -roadP-roadW+1.13, roadH+17.3, 3 );

      setBgColor( '#aaaaaa', '#bbbbbb' );
      g.RectOnPlane( -0.07, roadH, 0.07, roadH+9.5, 2 );
      g.SetAreaAttr( '#eeeeee', '#aaaaaa', 1 );
      g.RectOnPlane( -0.35, roadH+9.05, 0.35, roadH+9.4, 3 );
      g.SetColor( 'black' );
    }

    // double towers from south view
    if (nDraw == 39 && objType == 8) {
      // DrawTower( base, center, height, basew, topw, nbars );
      DrawTower( roadH, -6.25, 9.5, 1.79, 1.79, 5 );
      DrawTower( roadH,  6.25, 9.5, 1.79, 1.79, 5 );
    }

    // draw huts
    function isHatPos( n ) {
      var hatPos = [ 6, 12, 18, 25, 32, 39, 44, 49, 55, 61, 67, 73, 84, 89, 96, 103, 110, 116, 122 ];
      for (var i = 0; i < hatPos.length; i++) {
        if (n == hatPos[i]) return true;
      }
      return false;
    }
    if (isHatPos( nDraw )) {
      setBgColor( '#888888', '#aaaaaa' );
      g.RectOnPlane( -roadP-roadW-13.5, roadH-0.5, -roadP-roadW, roadH, 3 );
      setBgColor( '#8c8678', '#b9b19e' );
      g.RectOnPlane( -roadP-roadW-12.9, roadH-1, -roadP-roadW-9.1, roadH-0.5, 3 );

      setBgColor( '#cccccc', '#dddddd' );
      var c = -roadP - roadW - 9.1 - 1.9;
      var b = roadH;
      g.PolygonOnPlane( [ c-2, c-2, c+2, c+2, c, c-2 ], [ b+2.7, b, b, b+2.7, b+3, b+2.7 ], 3 );

      g.RectOnPlane( c-1.5, 0, c-0.7, b-1, 3 );
      g.RectOnPlane( c+0.7, 0, c+1.5, b-1, 3 );

    }
    return primitives;
  }
  function soundlyRoadEnd(entry,side){
    var n=entry.scene.metadata.soundlyDrawn,h=5*(entry.variation+1),narrow=0;
    if([106,107,64,63,21,20].includes(n))h+=2.5;
    if([86,87,41,42].includes(n))h+=12;
    if(n>=121)narrow=18*(n-121)/7;
    if(n<=7)narrow=18*(7-n)/7;
    if(n===79&&side<0)h+=4;
    return {x:side*17-(side>0?narrow:0),h:h};
  }
  function soundlyRoad(previous,current,side,hidden){
    var old=towerPlacement(previous.params),next=towerPlacement(current.params);
    function pt(plane,x,h){return [0,1,2].map(function(i){return plane.origin[i]+
      x*plane.xAxis[i]+h*plane.yAxis[i];});}
    var a=soundlyRoadEnd(previous,side),b=soundlyRoadEnd(current,side),w=4.6;
    return {type:'polygon',mode:3,points:[pt(old,a.x-w,a.h),
      pt(old,a.x+w,a.h),pt(next,b.x+w,b.h),pt(next,b.x-w,b.h)],
      style:{fill:hidden?'#adb1bc':'#999ba2'},
      metadata:{kind:'soundly-road',side:side,physicalObject:true}};
  }
  function localObject(objType,objIx,hidden,options){
    if(objType===0){
      if(!options||!Number.isInteger(options.drawn)||!Number.isInteger(options.total))
        throw new TypeError('Bedford requires explicit drawn and total sequence context');
      return localBedford(options.drawn,options.total,!!hidden,options);
    }
    if(objType===3)return localTower(objIx,hidden);
    if(objType===4){
      if(!options||!Number.isInteger(options.drawn))
        throw new TypeError('City skyline requires the drawn sequence index');
      return localCity(options.drawn,!!hidden);
    }
    if(objType===5){
      if(!options||!Number.isInteger(options.drawn))
        throw new TypeError('Mountain requires the drawn sequence index');
      return localMountain(options.drawn,objIx,!!hidden);
    }
    if(objType===6)return localBridge(!!hidden);
    if(objType===7){
      if(!options||!Number.isInteger(options.drawn))
        throw new TypeError('Tensas requires the drawn sequence index');
      return localTensas(options.drawn,options.variation===undefined?0:options.variation,!!hidden);
    }
    if(objType===8||objType===9){
      if(!options||!Number.isInteger(options.drawn)||!Number.isInteger(options.total))
        throw new TypeError('Soundly requires drawn index and total');
      return localSoundly(options.drawn,options.total,
        options.variation===undefined?0:options.variation,
        options.sidePos===undefined?0:options.sidePos,objType,!!hidden);
    }
    if(objType===1)return localMRod(!!hidden);
    if(objType===2)return localShip(!!hidden);
    throw new RangeError('Object type has not been independently ported');
  }
  function createPlacedObjectScene(params,objType,objIx,hidden,metadata){
    var opts=metadata||{};
    return contract.createScene('legacy',placeOnPlane(localObject(objType,objIx,hidden,opts),towerPlacement(params)),
      Object.assign({generator:'CurvatureGeometryEngine',objectType:objType,objectIndex:objIx},opts));
  }
  function localTower(objIx,hidden){
    if(objIx!==0&&objIx!==1)throw new RangeError('Tower bank must be 0 or 1');
    return objIx===0?localTowerType1(hidden):localTowerType2(hidden);
  }
  function createPlacedTowerScene(params,objIx,metadata){
    return contract.createScene('legacy',placeOnPlane(localTower(objIx),towerPlacement(params)),
      Object.assign({generator:'CurvatureGeometryEngine',objectType:3,towerVariant:objIx+1},metadata||{}));
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
  // World placement corresponding to the legacy SetTrans transformation chain.
  // Angles are radians (DrawModel sets the graph angle measure to rad).
  // The returned basis is a value object; no mutable graph transform is needed.
  function towerPlacement(params){
    if(!params||!['geometryRadius','height','objectSize','longitude','latitude','verticalScale','horizontalScale'].every(function(k){return Number.isFinite(params[k]);}))
      throw new TypeError('Finite tower placement parameters required');
    if(params.geometryRadius<=0)throw new RangeError('Positive geometry radius required');
    if(params.physicalSurface){
      if(!physicalWorld)throw Error('Physical world geometry is required');
      return physicalWorld.placement(params);
    }
    var r=params.geometryRadius,h=params.height,os=params.objectSize;
    var xs=(params.globe?os:-os);
    var lat=params.latitude,lng=params.longitude;
    var cY=Math.cos(lat),sY=Math.sin(lat),cX=Math.cos(-lng),sX=Math.sin(-lng);
    var side=params.planeOffset||0,alt=params.altitude||0;
    if(!Number.isFinite(side)||!Number.isFinite(alt))throw new TypeError('Finite offset and altitude required');
    function point(u,v){
      var x=xs*(side+u*params.horizontalScale),y=0,z=os*v*params.verticalScale+r+alt;
      if(params.globe){
        var x1=cY*x+sY*z,z1=-sY*x+cY*z;
        x=x1;y=-sX*z1;z=cX*z1;
      }
      return [x+(params.globe?0:-lat*r),y+(params.globe?0:lng*r),z-r-h];
    }
    var origin=point(0,0),a=point(1,0),b=point(0,1);
    return {origin:origin,xAxis:a.map(function(n,i){return n-origin[i];}),yAxis:b.map(function(n,i){return n-origin[i];})};
  }
  function createPlacedTowerType2Scene(params,metadata){
    return createTowerType2Scene(towerPlacement(params),metadata);
  }
  function createTowerType2Scene(plane,metadata){
    return contract.createScene('legacy',placeOnPlane(localTowerType2(),plane),Object.assign({generator:'CurvatureGeometryEngine',objectType:3,towerVariant:2},metadata||{}));
  }
  // Shared sequence placement for independently supported object types.
  // Entries are far-to-near and retain legacy drawn/total context for Bedford.
  // Hidden styling is determined by the same horizon cutoff as legacy drawing.
  function objectSequence(model,objIx,globe,options){
    var physical=!!(options&&options.physicalSurface);
    if(!model||![0,1].includes(objIx))throw new TypeError('Model and object index required');
    var keys=['geometryRadius','Height','NObjects','ObjDist','ObjDeltaDist','ObjSidePos',
      'ObjSideVar','ObjSideType','ObjSize','ObjSizeVar','ObjSizeType','ObjType'];
    keys.forEach(function(k){
      var v=model[k];
      if(k==='geometryRadius'||k==='Height'){
        if(!Number.isFinite(v))throw new TypeError('Finite '+k+' required');
      }else if(!Array.isArray(v)||!Number.isFinite(v[objIx]))throw new TypeError('Finite '+k+' required');
    });
    var r=model.geometryRadius,n=model.NObjects[objIx];
    if(r<=0||!Number.isInteger(n)||n<0||n>500)throw new RangeError('Invalid tower count or radius');
    var objType=model.ObjType[objIx];
    if(![0,1,2,3,4,5,6,7,8,9].includes(objType))throw new RangeError('Object type has not been independently ported');
    var delta=model.ObjDeltaDist[objIx]/r,first=model.ObjDist[objIx]/r;
    if(n>1&&delta<=0)throw new RangeError('Positive spacing required for multiple towers');
    var max=n;
    if(n&&(!physical||options.curvature!==0)&&first+(n-1)*delta>Math.PI){
      max=Math.max(0,Math.min(n,Math.floor(Math.PI/delta)));
    }
    var entries=[];
    var cutoff=0;
    if(globe&&!physical){
      if(!Number.isFinite(model.rDisk)||!Number.isFinite(model.hDip)){
        // A missing horizon is acceptable for standalone placement, but not
        // for a visibility decision. Explicitly leave all entries visible.
        cutoff=Infinity;
      }else{
        var sideOnDisk=(r-model.hDip)*Math.tan(model.ObjSidePos[objIx]/r);
        if(model.rDisk>Math.abs(sideOnDisk))
          cutoff=Math.asin(Math.min(1,Math.sqrt(model.rDisk*model.rDisk-sideOnDisk*sideOnDisk)/r));
      }
    }
    for(var drawn=0;drawn<max;drawn++){
      var lng=first+(max-1-drawn)*delta;
      var variation=model.ObjSizeVar[objIx],size=1,sizeType=model.ObjSizeType[objIx];
      if(sizeType===0&&max>1)size=1+variation*(2*(max-1-drawn)/(max-1)-1);
      else if(sizeType===1)size=1+variation*Math.cos(Math.PI*drawn);
      else if(sizeType===2)size=1+variation*((64894678.9798467*Math.sqrt(drawn))%2-1);
      else if(sizeType===3)size=max>1?1-variation*Math.cos(2*Math.PI*drawn/(max-1)):1+variation;
      else if(sizeType===4)size=max>1?1-variation*Math.sin(2*Math.PI*drawn/(max-1)):1;
      else if(sizeType<0||sizeType>4)throw new RangeError('Unsupported size variation');
      size=(size+1-Math.abs(variation))/2;
      if(size<0)size=-size;
      // Legacy type-4 skyline varies height only; width stays fixed.
      var sizeHor=(objType===4||objType===5||objType===6)?1:size;
      if(objType===7||objType===8||objType===9){size=1;sizeHor=1;}
      if(objType===2){sizeHor=.25*size+.75;size=.5*size+.5;}
      var side=model.ObjSidePos[objIx]/r,sideVar=model.ObjSideVar[objIx]/r/2;
      var sideType=model.ObjSideType[objIx];
      if(sideType===0&&max>1)sideVar*=2*(max-1-drawn)/(max-1)-1;
      else if(sideType===2)sideVar*=(186573.6498496*Math.sqrt(drawn)%2)-1;
      else if(sideType===3&&max>1)sideVar*=Math.cos(2*Math.PI*drawn/(max-1));
      else if(sideType===4)sideVar=max>1?sideVar*Math.sin(2*Math.PI*drawn/(max-1)):0;
      else if(sideType<0||sideType>4)throw new RangeError('Unsupported side variation');
      var positions=sideType===1?[side-sideVar,side+sideVar]:[side+sideVar];
      if(sideType===1&&Math.abs(positions[0])<Math.abs(positions[1]))positions.reverse();
      positions.forEach(function(lat,col){
        var params={geometryRadius:r,height:model.Height,objectSize:model.ObjSize[objIx],
          longitude:lng,latitude:lat,globe:physical?true:!!globe,
          curvature:physical?options.curvature:undefined,
          verticalScale:size,horizontalScale:sizeHor,
          // Legacy SetPlane uses [side,0,0] for cosine/sine side modes.
          planeOffset:(sideType===3||sideType===4)?side:0,
          physicalSurface:physical};
        // Optical scenes must not inherit Legacy's purely geometric painter
        // classification: their visibility is resolved later by ray tracing.
        var hidden=!!globe&&!physical&&!(options&&options.opticsNeutral)&&lng>cutoff;
        var legacyDrawn=drawn+(globe?n-max:0);
        var metadata={objectIndex:objIx,sequenceIndex:drawn,drawn:legacyDrawn,
          total:n,column:sideType===1?col+1:0,longitude:lng,latitude:lat,hidden:hidden,
          variation:model.ObjSizeVar[objIx],sidePos:model.ObjSidePos[objIx],
          soundlyDrawn:objType===9?n-1-legacyDrawn:legacyDrawn};
        var scene=createPlacedObjectScene(params,objType,objIx,hidden,metadata);
        entries.push({params:params,scene:scene,hidden:hidden,variation:model.ObjSizeVar[objIx]});
      });
    }
    return entries;
  }
  function towerSequence(model,objIx,globe){
    if(!model||!Array.isArray(model.ObjType)||model.ObjType[objIx]!==3)
      throw new RangeError('Only transmission towers (ObjType 3) are supported');
    return objectSequence(model,objIx,globe);
  }
  function createObjectSequenceScene(model,objIx,globe,options){
    var entries=objectSequence(model,objIx,globe,options);
    var primitives=[];
    // Preserve each placed object's identity through the optics-neutral scene.
    // All of its authored primitives share one depth/order key; grouping by
    // polygon alone would paint the whole bank's strokes over nearer fills.
    var previousByColumn=new Map();
    entries.forEach(function(entry,placedIndex){
      var column=entry.scene.metadata.column||0;
      if(model.ObjType[objIx]===6&&model.ObjSideType[objIx]!==2){
        // The authored bridge explicitly suppresses the deck for pseudo-
        // random lateral placement (ObjSideType 2).
        var previous=previousByColumn.get(column);
        if(previous){
          // A physical bridge is connected geometry, not a screen-space
          // overlay. Preserve the source LastRoad endpoints independently
          // for each column; never bridge between two different rows.
          var road=bridgeRoad(previous.params,entry.params,entry.hidden);
          road.metadata=Object.assign({},road.metadata,{placedObjectIndex:placedIndex,
            objectBank:objIx,column:column});
          primitives.push(road);
        }
        previousByColumn.set(column,entry);
      }
      if(model.ObjType[objIx]===8||model.ObjType[objIx]===9){
        var previousSoundly=previousByColumn.get(column);
        if(previousSoundly&&model.ObjSideType[objIx]!==2){
          [-1,1].forEach(function(side){
            var road=soundlyRoad(previousSoundly,entry,side,entry.hidden);
            road.metadata=Object.assign({},road.metadata,{placedObjectIndex:placedIndex,
              objectBank:objIx,column:column});primitives.push(road);
          });
        }
        previousByColumn.set(column,entry);
      }
      if(model.ObjType[objIx]===7){
        var previousTensas=previousByColumn.get(column);
        if(previousTensas){
          // The source shores exist for the first nine drawn supports only;
          // both roads span the entire 87-support sequence. The surface and
          // object meshes share the same continuous curvature placement.
          if(entry.scene.metadata.drawn<=8){
            var ground=tensasStrip(previousTensas,entry,entry.hidden,'tensas-shore');
            ground.metadata=Object.assign({},ground.metadata,{placedObjectIndex:placedIndex,
              objectBank:objIx,column:column});primitives.push(ground);
          }
          (model.ObjSidePos[objIx]<0?[-1,1]:[1,-1]).forEach(function(edge){
            var road=tensasStrip(previousTensas,entry,entry.hidden,'tensas-road',edge);
            road.metadata=Object.assign({},road.metadata,{placedObjectIndex:placedIndex,
              objectBank:objIx,column:column});primitives.push(road);
          });
        }
        previousByColumn.set(column,entry);
      }
      entry.scene.primitives.forEach(function(p){
        primitives.push(Object.assign({},p,{metadata:Object.assign({},p.metadata,{
          placedObjectIndex:placedIndex,objectBank:objIx})}));
      });
    });
    return contract.createScene('legacy',primitives,{generator:'CurvatureGeometryEngine',
      objectIndex:objIx,objectType:model.ObjType[objIx],globe:!!globe,objectCount:entries.length,
      horizonPartitioned:false});
  }
  function createTowerSequenceScene(model,objIx,globe){
    var entries=towerSequence(model,objIx,globe);
    var primitives=[];
    entries.forEach(function(entry){entry.scene.primitives.forEach(function(p){primitives.push(p);});});
    return contract.createScene('legacy',primitives,{generator:'CurvatureGeometryEngine',
      objectIndex:objIx,globe:!!globe,towerCount:entries.length,
      horizonPartitioned:false});
  }
  // Partition the far-to-near sequence using the same geometric cutoff as
  // DrawObjectsBehindHorizon. This is a drawing-order partition, NOT an
  // analytic per-vertex visibility test: the legacy white disk masks the
  // behind-horizon geometry after it is drawn.
  // Common legacy painter-order horizon partition for all independently
  // supported object shapes. Partitioning is by object placement, not by
  // clipping individual triangles: the white disk masks the distant layer.
  function objectHorizonPartition(model,objIx,globe){
    if(!model||!Number.isFinite(model.rDisk)||!Number.isFinite(model.hDip))
      throw new TypeError('Finite horizon disk radius and dip required');
    if(model.rDisk<0)throw new RangeError('Nonnegative horizon disk radius required');
    var entries=objectSequence(model,objIx,globe),aClip=0;
    if(globe){
      var r=model.geometryRadius,side=model.ObjSidePos[objIx]/r;
      var sideOnDisk=(r-model.hDip)*Math.tan(side);
      if(model.rDisk>Math.abs(sideOnDisk)){
        var ratio=Math.sqrt(model.rDisk*model.rDisk-sideOnDisk*sideOnDisk)/r;
        aClip=Math.asin(Math.min(1,ratio));
      }
    }
    var behind=[],before=[];
    entries.forEach(function(entry){
      (globe&&entry.params.longitude>aClip?behind:before).push(entry);
    });
    return {behind:behind,before:before,cutoffAngle:aClip,
      requiresHorizonMask:!!globe&&behind.length>0,total:entries.length};
  }
  function createHorizonPartitionedObjectScenes(model,objIx,globe){
    var partition=objectHorizonPartition(model,objIx,globe);
    function scene(entries,layer){
      var primitives=[];
      entries.forEach(function(entry){entry.scene.primitives.forEach(function(p){primitives.push(p);});});
      return contract.createScene('legacy',primitives,{generator:'CurvatureGeometryEngine',
        objectIndex:objIx,objectType:model.ObjType[objIx],globe:!!globe,
        horizonPartitioned:true,layer:layer,objectCount:entries.length});
    }
    return {behind:scene(partition.behind,'behind'),before:scene(partition.before,'before'),
      cutoffAngle:partition.cutoffAngle,requiresHorizonMask:partition.requiresHorizonMask,
      total:partition.total};
  }
  // Backwards-compatible tower-only entrypoints remain strict.
  function towerHorizonPartition(model,objIx,globe){
    if(!model||!Array.isArray(model.ObjType)||model.ObjType[objIx]!==3)
      throw new RangeError('Only transmission towers (ObjType 3) are supported');
    return objectHorizonPartition(model,objIx,globe);
  }
  function createHorizonPartitionedTowerScenes(model,objIx,globe){
    towerHorizonPartition(model,objIx,globe);
    var scenes=createHorizonPartitionedObjectScenes(model,objIx,globe);
    scenes.behind.metadata.towerCount=scenes.behind.metadata.objectCount;
    scenes.before.metadata.towerCount=scenes.before.metadata.objectCount;
    return scenes;
  }
  // World-space horizon circle and white occlusion disk. Tessellation is an
  // explicit geometry resolution, not GraphX3DX's camera-dependent ellipse
  // sampling. The analytic circle is retained in metadata for exact tests.
  function horizonCircle(model,options){
    options=options||{};
    var globe=options.globe!==false;
    if(!model||!Number.isFinite(model.Height)||!Number.isFinite(globe?model.zDisk:model.rFEarth)||
        !Number.isFinite(globe?model.rDisk:model.Height))
      throw new TypeError('Finite horizon/flat-equator parameters required');
    var radius=globe?model.rDisk:model.rFEarth;
    if(radius<0)throw new RangeError('Nonnegative horizon radius required');
    var segments=options.segments===undefined?128:options.segments;
    if(!Number.isInteger(segments)||segments<3||segments>8192)
      throw new RangeError('Horizon segments must be an integer from 3 to 8192');
    var z=globe?-model.zDisk:-model.Height;
    var points=[];
    for(var i=0;i<segments;i++){
      var angle=2*Math.PI*i/segments;
      points.push([radius*Math.cos(angle),radius*Math.sin(angle),z]);
    }
    return {center:[0,0,z],radius:radius,points:points,segments:segments,globe:globe};
  }
  function createHorizonScenes(model,options){
    options=options||{};
    var circle=horizonCircle(model,options);
    var metadata={generator:'CurvatureGeometryEngine',horizon:true,
      center:circle.center,radius:circle.radius,segments:circle.segments,
      globe:circle.globe,approximation:'fixed-world-polygon'};
    // DrawModel uses rFEarth and 2*rFEarth on the flat plane, not rDisk.
    // The globe mask is the sole filled diagnostic horizon primitive.
    var outlines=[{type:'polygon',points:circle.points,mode:1,closed:true}];
    if(!circle.globe)outlines.push({type:'polygon',points:circle.points.map(function(p){
      return [p[0]*2,p[1]*2,p[2]];
    }),mode:1,closed:true});
    var outline=contract.createScene('legacy',outlines,
      Object.assign({},metadata,{layer:'horizon-outline'}));
    var mask=contract.createScene('legacy',circle.globe?[{type:'polygon',
      points:circle.points,mode:2,closed:true,style:{fill:'white',alpha:1}}]:[],
      Object.assign({},metadata,{layer:'horizon-mask',maskColor:'white',
        maskRequired:circle.globe}));
    return {outline:outline,mask:mask,circle:circle};
  }
  // Flat-Earth reference rings and radial grid from DrawModel. These are
  // visual guides on z=-Height, not physical Earth-surface geometry.
  // The original camera-dependent ArcOnPlane is represented by explicit
  // world-space polygons; radii and angles remain exact in metadata.
  function flatSurfaceGuides(model,options){
    options=options||{};
    if(!model||!Number.isFinite(model.Height)||model.Height<=0||
        !Number.isFinite(model.rFEarth)||model.rFEarth<=0)
      throw new RangeError('Positive finite Height and rFEarth required');
    var segments=options.segments===undefined?128:options.segments;
    if(!Number.isInteger(segments)||segments<12||segments>8192)
      throw new RangeError('Flat guide segments must be from 12 to 8192');
    var z=-model.Height,primitives=[];
    function ring(radius,kind){
      var points=[];
      for(var k=0;k<segments;k++){
        var a=2*Math.PI*k/segments;
        points.push([radius*Math.cos(a),radius*Math.sin(a),z]);
      }
      primitives.push({type:'polygon',points:points,mode:1,closed:true,
        style:{stroke:kind==='equator'?model.FEEqCol:model.FEGridCol,
          lineWidth:kind==='equator'&&radius===2*model.rFEarth?2:1,
          alpha:kind==='equator'?1:0.6-0.5*Math.log10(model.Height)/9},
        metadata:{kind:kind,radius:radius}});
    }
    ring(model.rFEarth,'equator');
    ring(2*model.rFEarth,'equator');
    var gridRadii=[];
    if(model.showGrid>0){
      var delta=model.rFEarth/12,max=2*model.rFEarth-delta/2;
      function gridRings(){
        // Match the legacy floating-point increment and termination rule.
        for(var r=delta;r<max;r+=delta){ring(r,'grid-circle');gridRadii.push(r);}
      }
      gridRings();
      [700000,30000,3000,300].forEach(function(limit){
        if(model.Height<limit){max=delta;delta/=10;max-=delta/2;gridRings();}
      });
      var angleStep=Math.PI/12,angleMax=2*Math.PI-angleStep/2;
      for(var angle=0;angle<angleMax;angle+=angleStep){
        primitives.push({type:'line',points:[
          [2*model.rFEarth*Math.cos(angle),2*model.rFEarth*Math.sin(angle),z],
          [0,0,z]],style:{stroke:model.FEGridCol,
            alpha:0.6-0.5*Math.log10(model.Height)/9},
          metadata:{kind:'grid-ray',angle:angle}});
      }
    }
    return contract.createScene('legacy',primitives,{
      generator:'CurvatureGeometryEngine',layer:'flat-surface-guides',
      visualAid:true,planeZ:z,segments:segments,
      equatorRadii:[model.rFEarth,2*model.rFEarth],gridRadii:gridRadii,
      gridEnabled:model.showGrid>0});
  }
  // Latitude/longitude guides follow DrawModel's exact angular stepping and
  // PointOnEarth/PointOnPlane transforms. They are visual aids, not surfaces.
  function globeSurfaceGuides(model){
    if(!model||![model.Height,model.geometryRadius,model.hDisk,model.aDip,model.aDelta].every(Number.isFinite)||
        model.Height<=0||model.geometryRadius<=0||model.aDelta<=0||model.aDip<0||
        model.aDip>=Math.PI/2||Math.abs(model.hDisk)>model.geometryRadius)
      throw new RangeError('Valid finite globe grid geometry required');
    var primitives=[],delta=model.aDelta,radius=model.geometryRadius;
    var alpha=0.6-0.5*Math.log10(model.Height)/9;
    function point(lat,long,flat){
      var x=radius*Math.sin(long),rr=radius*Math.cos(long),y=rr*Math.sin(lat);
      return [x,y,flat?-model.Height:rr*Math.cos(lat)-(radius+model.Height)];
    }
    function add(points,kind,flat,angle){
      if(points.length>=3)primitives.push({type:'polygon',points:points,mode:1,
        style:{stroke:flat?model.GlobeFGridCol:model.GlobeGridCol,alpha:alpha},
        metadata:{kind:kind,projection:flat?'plane':'globe',angle:angle}});
    }
    function grid(flat){
      var latMax=model.aDip,latStart=-(Math.floor(latMax/delta)*delta);
      for(var lat=latStart;lat<latMax;lat+=delta){
        var d=model.hDisk/Math.cos(lat),ratio=d/radius;
        if(ratio < -1 || ratio > 1)continue;
        var longMax=Math.acos(ratio),longStart=-(Math.floor(longMax/delta)*delta),points=[];
        for(var lon=longStart;lon<longMax;lon+=delta)points.push(point(lat,lon,flat));
        points.push(point(lat,longMax,flat));
        add(points,'latitude',flat,lat);
      }
      var longMax=model.aDip,longStart=-(Math.floor(longMax/delta)*delta);
      for(var lon=longStart;lon<longMax;lon+=delta){
        var rLong=radius*Math.cos(lon),ratio=model.hDisk/rLong;
        if(ratio < -1 || ratio > 1)continue;
        var maxLat=Math.acos(ratio),startLat=-(Math.floor(maxLat/delta)*delta),points=[point(-maxLat,lon,flat)];
        for(var lat=startLat;lat<maxLat;lat+=delta)points.push(point(lat,lon,flat));
        points.push(point(maxLat,lon,flat));
        add(points,'longitude',flat,lon);
      }
    }
    if(model.showGrid&1)grid(false);
    if(model.showGrid&2)grid(true);
    return contract.createScene('legacy',primitives,{generator:'CurvatureGeometryEngine',
      layer:'globe-surface-guides',visualAid:true,globeGridEnabled:!!(model.showGrid&1),
      projectedGridEnabled:!!(model.showGrid&2),angularStep:delta});
  }
  // Non-occluding reference geometry from DrawModel. The white occlusion disk
  // remains owned by createHorizonScenes; these guides must never fill it.
  function globeHorizonGuides(model,options){
    options=options||{};
    if(!model||![model.Height,model.rDisk,model.zDisk,model.sceneWidth,model.PanRad].every(Number.isFinite)||
        model.Height<0||model.rDisk<0||model.sceneWidth<=0)
      throw new RangeError('Valid finite globe horizon geometry required');
    var segments=options.segments===undefined?128:options.segments;
    if(!Number.isInteger(segments)||segments<3||segments>8192)
      throw new RangeError('Horizon segments must be an integer from 3 to 8192');
    var primitives=[];
    function circle(z,stroke,kind){
      var points=[];
      for(var i=0;i<segments;i++){
        var angle=2*Math.PI*i/segments;
        points.push([model.rDisk*Math.cos(angle),model.rDisk*Math.sin(angle),z]);
      }
      primitives.push({type:'polygon',points:points,mode:1,closed:true,
        style:{stroke:stroke,lineWidth:1.5,alpha:1},metadata:{kind:kind,visualAid:true}});
    }
    if(model.showGrid&2)circle(-model.Height,model.GlobeFGridCol,'projected-horizon');
    circle(-model.zDisk,model.GlobeGridCol,'globe-horizon');
    if(model.showTangent||model.showData){
      var a=-model.PanRad,c=Math.cos(a),s=Math.sin(a),w=2*model.sceneWidth;
      function rotate(x,y){return [c*x-s*y,s*x+c*y,-model.zDisk];}
      primitives.push({type:'line',points:[rotate(-w,model.rDisk),rotate(w,model.rDisk)],
        style:{stroke:model.TangentCol,lineWidth:1,alpha:1},
        metadata:{kind:'horizon-tangent',visualAid:true}});
    }
    return contract.createScene('legacy',primitives,{generator:'CurvatureGeometryEngine',
      layer:'globe-horizon-guides',visualAid:true,occlusionMask:false});
  }
  function createObjectHorizonComposition(model,objIx,globe,options){
    var objects=createHorizonPartitionedObjectScenes(model,objIx,globe);
    var horizon=createHorizonScenes(model,Object.assign({},options,{globe:!!globe}));
    if(options&&(options.objectsOnly||options.towersOnly)){
      horizon.outline=contract.createScene('legacy',[],{layer:'horizon-outline',objectsOnly:true});
    }
    // Legacy only draws the opaque globe disk after at least one object has
    // been painted behind the horizon. Without distant objects, a disk here
    // would create a white surface that DrawModel never draws.
    if(!objects.requiresHorizonMask){
      horizon.mask=contract.createScene('legacy',[],{layer:'horizon-mask',maskRequired:false});
    }
    return {layers:[objects.behind,horizon.mask,horizon.outline,objects.before],
      behind:objects.behind,mask:horizon.mask,outline:horizon.outline,
      before:objects.before,cutoffAngle:objects.cutoffAngle,
      requiresHorizonMask:objects.requiresHorizonMask};
  }
  function createTowerHorizonComposition(model,objIx,globe,options){
    if(!model||!Array.isArray(model.ObjType)||model.ObjType[objIx]!==3)
      throw new RangeError('Only transmission towers (ObjType 3) are supported');
    return createObjectHorizonComposition(model,objIx,globe,options);
  }
  return {globeHorizonGuides:globeHorizonGuides,globeSurfaceGuides:globeSurfaceGuides,flatSurfaceGuides:flatSurfaceGuides,objectHorizonPartition:objectHorizonPartition,createHorizonPartitionedObjectScenes:createHorizonPartitionedObjectScenes,createObjectHorizonComposition:createObjectHorizonComposition,objectSequence:objectSequence,createObjectSequenceScene:createObjectSequenceScene,localBedford:localBedford,localMRod:localMRod,localShip:localShip,localObject:localObject,createPlacedObjectScene:createPlacedObjectScene,localTowerType1:localTowerType1,localTowerType2:localTowerType2,localTower:localTower,createPlacedTowerScene:createPlacedTowerScene,placeOnPlane:placeOnPlane,createTowerType2Scene:createTowerType2Scene,towerPlacement:towerPlacement,createPlacedTowerType2Scene:createPlacedTowerType2Scene,towerSequence:towerSequence,createTowerSequenceScene:createTowerSequenceScene,towerHorizonPartition:towerHorizonPartition,createHorizonPartitionedTowerScenes:createHorizonPartitionedTowerScenes,horizonCircle:horizonCircle,createHorizonScenes:createHorizonScenes,createTowerHorizonComposition:createTowerHorizonComposition};
}));
