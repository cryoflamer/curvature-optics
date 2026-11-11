/* Deterministic, offline PNG-frame export. Time is indexed, never wall-clock
 * driven. A self-contained project is sampled and each Canvas is encoded only
 * after a complete Accurate RK4 render. No live workspace state is touched.
 * The uncompressed ZIP writer is intentionally dependency-free and bounded.
 */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject;
  if(typeof module==='object'&&module.exports)projects=require('./ModernAnimationProject');
  var hud=root.CurvatureModernAnimationCanvasHud;
  if(typeof module==='object'&&module.exports)
    hud=require('./ModernAnimationCanvasHud');
  var api=factory(projects,hud);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationFrameExport=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,hud){
  'use strict';
  var MAX_FRAMES=751,MAX_ARCHIVE_BYTES=192*1024*1024;
  // Shared sizing/FPS policy for PNG and future video frames. Video has an
  // independent timeline and resource budget, but must accept the same presets.
  function exportSettings(options){
    options=options||{};
    var fps=options.fps===undefined?25:options.fps;
    var width=options.width===undefined?960:options.width;
    var height=options.height===undefined?540:options.height;
    if(![5,10,25,30].includes(fps)||!Number.isInteger(width)||!Number.isInteger(height)||
      width<320||height<180||width>1920||height>1080||width*height>2073600)
      throw RangeError('Unsupported export FPS or resolution');
    return Object.freeze({fps:fps,width:width,height:height});
  }
  function plan(project,options){
    var owned=projects.validate(project),settings=exportSettings(options);
    if(options&&options.cameraHud!==undefined&&typeof options.cameraHud!=='boolean')
      throw RangeError('Invalid camera HUD export setting');
    var fps=settings.fps,width=settings.width,height=settings.height;
    var durationMs=projects.totalMs(owned);
    var intervals=Math.ceil(durationMs*fps/1000);
    if(intervals+1>MAX_FRAMES)
      throw RangeError('Too many frames for in-memory PNG export (maximum '+MAX_FRAMES+'). Reduce FPS or animation length.');
    var times=[];
    for(var i=0;i<=intervals;i++)times.push(i===intervals?durationMs:Math.min(durationMs,1000*i/fps));
    // Endpoint is explicit. For 5 seconds at 25 fps this is 126 PNGs,
    // representing [0, 40, ..., 4960, 5000] milliseconds.
    return Object.freeze({project:owned,fps:fps,width:width,height:height,
      durationMs:durationMs,cameraHud:!!(options&&options.cameraHud===true),
      timesMs:Object.freeze(times),
      sides:Object.freeze(owned.baseExperiment.display.mode==='compare'?['A','B']:['A'])});
  }
  function ascii(value){return new TextEncoder().encode(value);}
  function u16(out,n){out.push(n&255,(n>>>8)&255);}
  function u32(out,n){out.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);}
  var crcTable=null;
  function crc32(bytes){
    if(!crcTable){crcTable=[];for(var i=0;i<256;i++){
      var c=i;for(var j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
      crcTable.push(c>>>0);
    }}
    var crc=0xffffffff;
    for(var k=0;k<bytes.length;k++)crc=crcTable[(crc^bytes[k])&255]^(crc>>>8);
    return (crc^0xffffffff)>>>0;
  }
  function zip(files){
    if(!Array.isArray(files)||!files.length)throw RangeError('No export files');
    var parts=[],central=[],offset=0,seen=new Set(),total=0;
    files.forEach(function(file){
      if(!file||!/^[A-Za-z0-9_./-]{1,160}$/.test(file.name)||
        file.name.includes('..')||seen.has(file.name)||!(file.data instanceof Uint8Array))
        throw RangeError('Invalid or duplicate ZIP entry');
      seen.add(file.name);
      var name=ascii(file.name),data=file.data,checksum=crc32(data),local=[];
      total+=data.length;
      if(total>MAX_ARCHIVE_BYTES)throw RangeError('Export would exceed 192 MiB; reduce resolution or frame count');
      u32(local,0x04034b50);u16(local,20);u16(local,0);u16(local,0);
      u16(local,0);u16(local,0);u32(local,checksum);
      u32(local,data.length);u32(local,data.length);u16(local,name.length);u16(local,0);
      var header=Uint8Array.from(local);parts.push(header,name,data);
      var cd=[];u32(cd,0x02014b50);u16(cd,20);u16(cd,20);u16(cd,0);u16(cd,0);
      u16(cd,0);u16(cd,0);u32(cd,checksum);u32(cd,data.length);u32(cd,data.length);
      u16(cd,name.length);u16(cd,0);u16(cd,0);u16(cd,0);u16(cd,0);u32(cd,0);u32(cd,offset);
      central.push(Uint8Array.from(cd),name);
      offset+=header.length+name.length+data.length;
    });
    var centralSize=central.reduce(function(n,b){return n+b.length;},0),end=[];
    if(parts.length/3>65535||offset+centralSize>0xffffffff)throw RangeError('ZIP32 limit exceeded');
    u32(end,0x06054b50);u16(end,0);u16(end,0);
    u16(end,files.length);u16(end,files.length);u32(end,centralSize);u32(end,offset);u16(end,0);
    return new Blob(parts.concat(central,[Uint8Array.from(end)]),{type:'application/zip'});
  }
  // Live Scene/Animation displays the transparent painter canvas above a
  // white CSS background. PNG has no CSS: bake that same background behind
  // the finished RGBA painting, after the painter has cleared its canvas.
  // destination-over preserves the optical geometry and blends anti-aliased
  // edges just as the live browser canvas does over white. Never clear or
  // paint source-over: that would erase the finished frame.
  function compositeOpaqueWhite(canvas){
    if(!canvas||!(canvas.width>0&&canvas.height>0)||typeof canvas.getContext!=='function')
      throw TypeError('Fixed-size export Canvas required for opaque PNG');
    var ctx=canvas.getContext('2d');
    if(!ctx||typeof ctx.save!=='function'||typeof ctx.restore!=='function'||
      typeof ctx.setTransform!=='function'||typeof ctx.fillRect!=='function')
      throw TypeError('Canvas 2D compositing required for opaque PNG');
    ctx.save();
    try{
      ctx.setTransform(1,0,0,1,0,0);
      ctx.globalCompositeOperation='destination-over';
      ctx.globalAlpha=1;
      ctx.fillStyle='#fff';
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }finally{ctx.restore();}
    return canvas;
  }
  function toPng(canvas){
    // OffscreenCanvas in a dedicated Worker uses convertToBlob(), whereas
    // HTMLCanvasElement in the legacy test adapter uses callback-based toBlob().
    if(canvas&&typeof canvas.convertToBlob==='function'){
      return canvas.convertToBlob({type:'image/png'}).then(function(blob){
        if(!blob||blob.type!=='image/png')throw Error('Canvas PNG encoding failed');
        return blob.arrayBuffer().then(function(buffer){return new Uint8Array(buffer);});
      });
    }
    return new Promise(function(resolve,reject){
      if(!canvas||typeof canvas.toBlob!=='function'){
        reject(Error('PNG encoding requires Canvas.toBlob or OffscreenCanvas.convertToBlob'));return;
      }
      try{canvas.toBlob(function(blob){
        if(!blob||blob.type!=='image/png'){reject(Error('Canvas PNG encoding failed'));return;}
        blob.arrayBuffer().then(function(buffer){resolve(new Uint8Array(buffer));},reject);
      },'image/png');}catch(error){reject(error);}
    });
  }
  function pad(index){return String(index).padStart(5,'0');}
  // Common optical quality + opaque Canvas contract, before either PNG
  // serialization or creation of a VideoFrame. Never use a Fast frame here.
  function prepareCanvas(image,width,height,showHud){
    if(!image||image.quality!=='accurate'||(image.metrics&&
      image.metrics.opticalQuality&&image.metrics.opticalQuality!=='accurate')||!image.canvas||
      image.canvas.width!==width||image.canvas.height!==height)
      throw Error('Export frame is not Accurate RK4 at fixed resolution');
    compositeOpaqueWhite(image.canvas);
    if(showHud){
      if(!hud||typeof hud.paint!=='function')throw Error('Camera HUD painter unavailable');
      hud.paint(image.canvas,image.cameraModel);
    }
    return image.canvas;
  }
  // A timestamp is independent of its neighbors. Both the single-worker
  // runner and parallel workers use the same painting, compositing, PNG
  // encoding and optical-quality checks; a different scheduling order must
  // never select Fast or omit an A/B side.
  async function renderTimestamp(p,index,render,cancel){
    if(!p||!Array.isArray(p.timesMs)||!Number.isInteger(index)||
      index<0||index>=p.timesMs.length||typeof render!=='function')
      throw RangeError('Invalid export timestamp or renderer');
    var time=p.timesMs[index],sample=projects.sampleAt(p.project,time);
    var row={index:index,timeMs:time,timestampUs:Math.round(time*1000),images:{}};
    var entries=[];
    for(var j=0;j<p.sides.length;j++){
      if(cancel&&cancel.cancelled)return null;
      var side=p.sides[j],image=await render(sample,side,{width:p.width,height:p.height,
        index:index,timeMs:time});
      prepareCanvas(image,p.width,p.height,p.cameraHud);
      var bytes=await toPng(image.canvas);
      if(bytes.length<8||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)
        throw Error('Invalid PNG data from export Canvas');
      var name='frames/frame_'+pad(index)+'_'+side+'.png';
      entries.push({name:name,data:bytes});row.images[side]=name;
      if(image.metrics){
        if(!row.renderStats)row.renderStats={};
        var metrics=image.metrics,timing=metrics.timings||{};
        row.renderStats[side]={opticsMs:Number.isFinite(timing.opticsMs)?timing.opticsMs:null,
          unresolved:Number.isFinite(metrics.unresolved)?metrics.unresolved:null,
          fillUnresolved:Number.isFinite(metrics.fillUnresolved)?metrics.fillUnresolved:null,
          budgetExceeded:!!metrics.budgetExceeded,cacheReused:!!metrics.cacheReused};
      }
    }
    return {row:row,entries:entries};
  }
  // Assemble in timestamp order, not completion order. Validate all entries
  // before emitting an archive; never produce partial/duplicated frame ZIPs.
  function assemble(p,completed,exportInfo){
    if(!p||!Array.isArray(p.timesMs)||!Array.isArray(completed)||
      completed.length!==p.timesMs.length)throw Error('Incomplete PNG frame sequence');
    var frames=[],entries=[];
    completed.forEach(function(frame,index){
      if(!frame||!frame.row||frame.row.index!==index||
        frame.row.timeMs!==p.timesMs[index]||
        frame.row.timestampUs!==Math.round(p.timesMs[index]*1000)||
        !Array.isArray(frame.entries)||frame.entries.length!==p.sides.length)
        throw Error('Invalid PNG frame index or timestamp');
      p.sides.forEach(function(side,j){
        var entry=frame.entries[j],name='frames/frame_'+pad(index)+'_'+side+'.png';
        if(!entry||entry.name!==name||frame.row.images[side]!==name||
          !(entry.data instanceof Uint8Array)||entry.data.length<8||
          entry.data[0]!==137||entry.data[1]!==80||entry.data[2]!==78||entry.data[3]!==71)
          throw Error('Invalid PNG frame entry: '+name);
        entries.push(entry);
      });
      frames.push(frame.row);
    });
    var manifest={schema:'curvature-animation-png-sequence',version:1,
      projectId:p.project.id,projectName:p.project.name,animationMode:p.project.mode,
      physicalTarget:p.project.target,project:p.project,quality:'accurate',
      fps:p.fps,width:p.width,height:p.height,durationMs:p.durationMs,
      endpointIncluded:true,sides:p.sides.slice(),backgroundColor:'#ffffff',
      frameCount:frames.length,frames:frames};
    if(p.cameraHud)manifest.cameraHudIncluded=true;
    if(exportInfo){
      if(!Number.isInteger(exportInfo.workers)||exportInfo.workers<1||exportInfo.workers>4||
        !Number.isFinite(exportInfo.renderElapsedMs)||exportInfo.renderElapsedMs<0)
        throw RangeError('Invalid parallel export diagnostics');
      manifest.renderWorkers=exportInfo.workers;
      manifest.renderElapsedMs=Math.round(exportInfo.renderElapsedMs);
    }
    entries.unshift({name:'manifest.json',data:ascii(JSON.stringify(manifest,null,2))});
    return {cancelled:false,blob:zip(entries),manifest:manifest};
  }
  // Sequential compatibility runner (also used as a parity reference).
  async function run(settings){
    if(!settings||typeof settings.render!=='function')throw TypeError('Export renderer required');
    var p=plan(settings.project,settings),cancel=settings.cancel||{},completed=[];
    var yieldUi=typeof settings.yieldUi==='function'?settings.yieldUi:function(){return Promise.resolve();};
    var progress=typeof settings.onProgress==='function'?settings.onProgress:function(){};
    for(var i=0;i<p.timesMs.length;i++){
      await yieldUi();
      if(cancel.cancelled)return {cancelled:true,framesCompleted:i,totalFrames:p.timesMs.length};
      var frame=await renderTimestamp(p,i,settings.render,cancel);
      if(!frame||cancel.cancelled)
        return {cancelled:true,framesCompleted:i,totalFrames:p.timesMs.length};
      completed.push(frame);
      progress({completed:i+1,total:p.timesMs.length,timeMs:p.timesMs[i]});
    }
    if(cancel.cancelled)return {cancelled:true,framesCompleted:completed.length,totalFrames:p.timesMs.length};
    return assemble(p,completed);
  }
  // Isolated clone of the GraphX3DX viewport plumbing. Methods use `this`,
  // and every mutable camera/window transform gets its own object. The source
  // preview graph and working Scene/Compare remain untouched by export.
  function graphForCanvas(source,canvas){
    if(!source||!source.Camera||!source.WinTrans||!source.VpTrans||!canvas)
      throw TypeError('GraphX3DX source viewport required');
    var graph=Object.assign(Object.create(Object.getPrototypeOf(source)),source);
    function clone(obj){return Object.assign(Object.create(Object.getPrototypeOf(obj)),obj);}
    ['Camera','WinTrans','VpTrans','CanvasTrans','ObjTrans'].forEach(function(k){
      if(source[k])graph[k]=clone(source[k]);
    });
    // Camera.Set()/Update() can reuse owned scratch vectors. Do not write
    // into the currently displayed preview graph's scratch arrays.
    if(graph.Camera)Object.keys(graph.Camera).forEach(function(k){
      var v=graph.Camera[k];
      if(Array.isArray(v))graph.Camera[k]=v.slice();
    });
    if(source.TransByName)graph.TransByName=Object.assign({},source.TransByName,
      {window:graph.WinTrans,viewport:graph.VpTrans,canvas:graph.CanvasTrans});
    if(source.ClipPlaneList)graph.ClipPlaneList=source.ClipPlaneList.slice();
    if(source.CurrTrans===source.WinTrans)graph.CurrTrans=graph.WinTrans;
    else if(source.CurrTrans===source.VpTrans)graph.CurrTrans=graph.VpTrans;
    else if(source.CurrTrans===source.CanvasTrans)graph.CurrTrans=graph.CanvasTrans;
    if(graph.CanvasTrans){graph.CanvasTrans.Width=canvas.width;
      graph.CanvasTrans.Height=canvas.height;}
    graph.Canvas=canvas;graph.Context2D=canvas.getContext('2d');
    graph.ContextScale=1;graph.DevicePixelRatio=1;graph.PixelRatio=1;
    graph.CanvasWidth=canvas.width;graph.CanvasHeight=canvas.height;
    graph.UpdateCanvasSize=function(){};graph.ResizeTimer=null;
    return graph;
  }
  return Object.freeze({plan:plan,exportSettings:exportSettings,prepareCanvas:prepareCanvas,
    run:run,renderTimestamp:renderTimestamp,assemble:assemble,
    zip:zip,graphForCanvas:graphForCanvas,
    compositeOpaqueWhite:compositeOpaqueWhite,MAX_FRAMES:MAX_FRAMES});
}));
