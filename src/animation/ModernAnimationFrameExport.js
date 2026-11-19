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
  var target=root.CurvatureModernTargetIndicator;
  if(typeof module==='object'&&module.exports)target=require('../ui/modern/ModernTargetIndicator');
  var compositor=root.CurvatureModernAnimationPresentationCompositor, references=root.CurvatureModernReferenceImage;
  if(typeof module==='object'&&module.exports){compositor=require('./ModernAnimationPresentationCompositor');references=require('./ModernReferenceImage');}
  var api=factory(projects,hud,target,compositor,references);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationFrameExport=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,hud,target,compositor,references){
  'use strict';
  var MAX_FRAMES=751,MAX_STREAM_FRAMES=30000,MAX_ARCHIVE_BYTES=192*1024*1024;
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
  function resolveHudAppearance(project,options){
    return options&&options.cameraHudAppearance!==undefined?
      hud.validateAppearance(options.cameraHudAppearance):
      (project.cameraHudAppearance||hud.normalizeAppearance());
  }
  function sequenceCount(durationMs,fps,streaming){
    var count=Math.ceil(durationMs*fps/1000)+1;
    var limit=streaming?MAX_STREAM_FRAMES:MAX_FRAMES;
    if(count>limit)throw RangeError('Too many frames for '+(streaming?'streaming':'in-memory')+' PNG export ('+count+
      ' requested; maximum '+limit+'). Reduce FPS or animation length.');
    return count;
  }
  // UI preflight before loading possibly very large original photographs.
  function checkFrameBudget(project,fps,streaming){
    return sequenceCount(projects.totalMs(project),exportSettings({fps:fps}).fps,streaming===true);
  }
  function plan(project,options){
    options=options||{};
    var owned=projects.validate(project),appearance=resolveHudAppearance(owned,options),presentation=options.presentation===undefined?null:
      compositor.plan(owned,Object.assign({},options.presentation,{width:options.width,height:options.height,cameraHud:options.cameraHud===true,cameraHudAppearance:appearance,referenceDimensions:[]}));
    var settings=exportSettings(presentation?{fps:options.fps,width:960,height:540}:options);
    var durationMs=projects.totalMs(owned);
    var intervals=options.previewTimeMs===undefined?sequenceCount(durationMs,settings.fps,options.streaming===true)-1:0;
    var records=[];
    if(presentation){
      if(!Array.isArray(options.referenceImages||[])||(options.referenceImages||[]).length>100)throw RangeError('Invalid presentation reference assets');
      records=references.validateCollection(options.referenceImages||[]);
      var ids=new Set(presentation.referenceLayout==='hidden'?[]:presentation.times.flatMap(function(t){return t.referenceImageIds;}));
      if(records.length!==ids.size||records.some(function(r){return !ids.has(r.id);}))throw Error('Presentation reference originals must match linked IDs');
      if(JSON.stringify(records).length>64*1024*1024)throw RangeError('Presentation reference assets exceed limit');
      presentation=compositor.plan(owned,Object.assign({},options.presentation,{width:options.width,height:options.height,
        cameraHud:options.cameraHud===true,cameraHudAppearance:appearance,referenceDimensions:records.map(function(r){
          return {id:r.id,width:r.original.width,height:r.original.height,
            title:r.title,author:r.author,license:r.license,sourceUrl:r.sourceUrl};
        })}));
    }else if(options.previewTimeMs!==undefined)throw RangeError('Preview requires full presentation');
    if(options&&options.cameraHud!==undefined&&typeof options.cameraHud!=='boolean')
      throw RangeError('Invalid camera HUD export setting');
    if(options&&options.targetIndicator!==undefined&&typeof options.targetIndicator!=='boolean')
      throw RangeError('Invalid target indicator export setting');
    if(options&&options.targetIndicator===true&&(!target||typeof target.paint!=='function'))
      throw Error('Target indicator painter unavailable');
    var fps=settings.fps,width=presentation?presentation.width:settings.width,height=presentation?presentation.height:settings.height;
    var times=[];
    if(options.previewTimeMs!==undefined){
      compositor.frameAt(presentation,options.previewTimeMs);times.push(options.previewTimeMs);
    }else for(var i=0;i<=intervals;i++)times.push(i===intervals?durationMs:Math.min(durationMs,1000*i/fps));
    // Endpoint is explicit. For 5 seconds at 25 fps this is 126 PNGs,
    // representing [0, 40, ..., 4960, 5000] milliseconds.
    return Object.freeze({project:owned,fps:fps,width:width,height:height,
      durationMs:durationMs,streaming:options.streaming===true,cameraHud:!!(options&&options.cameraHud===true),
      cameraHudAppearance:appearance,
      targetIndicator:!!(options&&options.targetIndicator===true),
      targetSelection:target?target.selection(options&&options.targetSelection):'scene',
      timesMs:Object.freeze(times),
      ...(presentation?{presentation:presentation,referenceImages:records,previewTimeMs:options.previewTimeMs}:{}),
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
  // STORE ZIP32 entries incrementally. Only central-directory headers and names
  // are retained; all image bytes belong to the caller until its write completes.
  function zipWriter(limit){
    var central=[],offset=0,seen=new Set(),total=0,centralSize=0,closed=false;
    function add(file){
      if(closed||!file||!/^[A-Za-z0-9_./-]{1,160}$/.test(file.name)||
        file.name.includes('..')||seen.has(file.name)||!(file.data instanceof Uint8Array))
        throw RangeError('Invalid or duplicate ZIP entry');
      var name=ascii(file.name),data=file.data,local=[],cd=[];
      if(total+data.length>limit)throw RangeError('Export would exceed 192 MiB; reduce resolution or frame count or save directly to disk');
      if(seen.size>=65535||offset+30+name.length+data.length+centralSize+46+name.length+22>=0xffffffff)
        throw RangeError('ZIP32 limit (4 GiB or 65535 entries) exceeded; reduce resolution, FPS or duration');
      var checksum=crc32(data);
      seen.add(file.name);total+=data.length;
      u32(local,0x04034b50);u16(local,20);u16(local,0);u16(local,0);
      u16(local,0);u16(local,0);u32(local,checksum);
      u32(local,data.length);u32(local,data.length);u16(local,name.length);u16(local,0);
      var header=Uint8Array.from(local);
      u32(cd,0x02014b50);u16(cd,20);u16(cd,20);u16(cd,0);u16(cd,0);
      u16(cd,0);u16(cd,0);u32(cd,checksum);u32(cd,data.length);u32(cd,data.length);
      u16(cd,name.length);u16(cd,0);u16(cd,0);u16(cd,0);u16(cd,0);u32(cd,0);u32(cd,offset);
      // Copy name: the local header/name/data buffers can be transferred away.
      central.push(Uint8Array.from(cd),name.slice());centralSize+=cd.length+name.length;
      offset+=header.length+name.length+data.length;
      return [header,name,data];
    }
    function finish(){
      if(closed||!seen.size)throw RangeError('No export files or ZIP already closed');
      closed=true;var end=[];
      u32(end,0x06054b50);u16(end,0);u16(end,0);
      u16(end,seen.size);u16(end,seen.size);u32(end,centralSize);u32(end,offset);u16(end,0);
      // Compact the directory into a single message buffer, not a list of tens
      // of thousands of transferables. No PNG data is stored here.
      var directory=new Uint8Array(centralSize+22),at=0;
      central.forEach(function(b){directory.set(b,at);at+=b.length;});
      directory.set(end,at);central=[];
      return directory;
    }
    return Object.freeze({add:add,finish:finish});
  }
  function zip(files){
    if(!Array.isArray(files)||!files.length)throw RangeError('No export files');
    var writer=zipWriter(MAX_ARCHIVE_BYTES),parts=[];
    files.forEach(function(file){parts.push(...writer.add(file));});
    parts.push(writer.finish());
    return new Blob(parts,{type:'application/zip'});
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
  function prepareCanvas(image,width,height,showHud,appearance,showTarget,targetSelection){
    if(!image||image.quality!=='accurate'||(image.metrics&&
      image.metrics.opticalQuality&&image.metrics.opticalQuality!=='accurate')||!image.canvas||
      image.canvas.width!==width||image.canvas.height!==height)
      throw Error('Export frame is not Accurate RK4 at fixed resolution');
    compositeOpaqueWhite(image.canvas);
    if(showHud){
      if(!hud||typeof hud.paint!=='function')throw Error('Camera HUD painter unavailable');
      hud.paint(image.canvas,image.cameraModel,appearance);
    }
    if(showTarget)target.paint(image.canvas,image.cameraModel,targetSelection);
    return image.canvas;
  }
  // A timestamp is independent of its neighbors. Both the single-worker
  // runner and parallel workers use the same painting, compositing, PNG
  // encoding and optical-quality checks; a different scheduling order must
  // never select Fast or omit an A/B side.
  function outputSides(p){return p.presentation?['presentation']:p.sides;}
  async function renderPresentation(p,index,render,cancel,adapter){
    if(!adapter||typeof adapter.canvas!=='function'||typeof adapter.observation!=='function')throw Error('Presentation export adapter unavailable');
    var time=p.timesMs[index],frame=compositor.frameAt(p.presentation,time),images={},renderStats={};
    for(var side of frame.sides){
      if(cancel&&cancel.cancelled)return null;
      var image=await render(frame.sample,side,{width:frame.viewSize.width,height:frame.viewSize.height,index:index,timeMs:time,showCaptions:false});
      prepareCanvas(image,frame.viewSize.width,frame.viewSize.height,false,p.cameraHudAppearance,p.targetIndicator,p.targetSelection);
      images[side]=Object.assign({},image,{timeMs:time});
      if(image.metrics){var m=image.metrics,t=m.timings||{};renderStats[side]={opticsMs:Number.isFinite(t.opticsMs)?t.opticsMs:null,
        unresolved:Number.isFinite(m.unresolved)?m.unresolved:null,fillUnresolved:Number.isFinite(m.fillUnresolved)?m.fillUnresolved:null,
        budgetExceeded:!!m.budgetExceeded,cacheReused:!!m.cacheReused};}
    }
    if(cancel&&cancel.cancelled)return null;
    var photo=frame.referenceId?await adapter.observation(p.referenceImages.find(function(r){return r.id===frame.referenceId;})):null;
    if(cancel&&cancel.cancelled)return null;
    var result=compositor.paint(adapter.canvas(),frame,images,photo),bytes=await toPng(result.canvas);
    var name='frames/frame_'+pad(index)+'_presentation.png';
    return {row:{index:index,timeMs:time,timestampUs:Math.round(time*1000),images:{presentation:name},
      referenceId:frame.referenceId,referenceCount:frame.referenceCount,topology:frame.topology,viewSize:frame.viewSize,warnings:result.warnings,renderStats:renderStats},entries:[{name:name,data:bytes}]};
  }
  async function renderTimestamp(p,index,render,cancel,adapter){
    if(!p||!Array.isArray(p.timesMs)||!Number.isInteger(index)||
      index<0||index>=p.timesMs.length||typeof render!=='function')
      throw RangeError('Invalid export timestamp or renderer');
    if(p.presentation)return renderPresentation(p,index,render,cancel,adapter);
    var time=p.timesMs[index],sample=projects.sampleAt(p.project,time);
    var row={index:index,timeMs:time,timestampUs:Math.round(time*1000),images:{}};
    var entries=[];
    for(var j=0;j<p.sides.length;j++){
      if(cancel&&cancel.cancelled)return null;
      var side=p.sides[j],image=await render(sample,side,{width:p.width,height:p.height,
        index:index,timeMs:time});
      prepareCanvas(image,p.width,p.height,p.cameraHud,p.cameraHudAppearance,
        p.targetIndicator,p.targetSelection);
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
  function validateFrame(p,frame,index){
      if(!frame||!frame.row||frame.row.index!==index||
        frame.row.timeMs!==p.timesMs[index]||
        frame.row.timestampUs!==Math.round(p.timesMs[index]*1000)||
        !Array.isArray(frame.entries)||frame.entries.length!==outputSides(p).length)
        throw Error('Invalid PNG frame index or timestamp');
      if(p.presentation){
        var planned=compositor.frameAt(p.presentation,p.timesMs[index]),row=frame.row;
        if(row.referenceId!==planned.referenceId||row.referenceCount!==planned.referenceCount||row.topology!==planned.topology||!row.viewSize||
          row.viewSize.width!==planned.viewSize.width||row.viewSize.height!==planned.viewSize.height||
          !Array.isArray(row.warnings)||row.warnings.some(function(w){return typeof w!=='string';}))
          throw Error('Invalid presentation frame metadata');
      }
      outputSides(p).forEach(function(side,j){
        var entry=frame.entries[j],name='frames/frame_'+pad(index)+'_'+side+'.png';
        if(!entry||entry.name!==name||frame.row.images[side]!==name||
          !(entry.data instanceof Uint8Array)||entry.data.length<8||
          entry.data[0]!==137||entry.data[1]!==80||entry.data[2]!==78||entry.data[3]!==71)
          throw Error('Invalid PNG frame entry: '+name);
      });
    return frame.row;
  }
  function manifestFor(p,frames,exportInfo){
    if(frames.length!==p.timesMs.length)throw Error('Incomplete PNG frame sequence');
    var manifest={schema:'curvature-animation-png-sequence',version:1,
      projectId:p.project.id,projectName:p.project.name,animationMode:p.project.mode,
      cameraInterpolation:p.project.mode==='camera'?(p.project.interpolation||'linear'):null,
      physicalTarget:p.project.target,project:p.project,quality:'accurate',
      fps:p.fps,width:p.width,height:p.height,durationMs:p.durationMs,
      endpointIncluded:p.previewTimeMs===undefined||p.previewTimeMs===p.durationMs,sides:outputSides(p).slice(),backgroundColor:p.presentation?'#f1f5f9':'#ffffff',
      frameCount:frames.length,frames:frames};
    if(p.presentation){
      manifest.presentation={referenceLayout:p.presentation.referenceLayout,layoutMode:p.presentation.layoutMode,
        showNarrative:p.presentation.showNarrative,cameraHudPlacement:p.cameraHud?'external':'none',modelSides:p.sides.slice(),preview:p.previewTimeMs!==undefined,
        referenceImages:p.referenceImages.map(function(r){var meta=Object.assign({},r);delete meta.thumbnail;
          meta.original={width:r.original.width,height:r.original.height};return meta;})};
    }
    if(p.cameraHud){
      manifest.cameraHudIncluded=true;
      manifest.cameraHudAppearance=p.cameraHudAppearance;
    }
    if(p.targetIndicator){manifest.targetIndicatorIncluded=true;
      manifest.targetSelection=p.targetSelection;}
    if(exportInfo){
      if(!Number.isInteger(exportInfo.workers)||exportInfo.workers<1||exportInfo.workers>4||
        !Number.isFinite(exportInfo.renderElapsedMs)||exportInfo.renderElapsedMs<0)
        throw RangeError('Invalid parallel export diagnostics');
      manifest.renderWorkers=exportInfo.workers;
      manifest.renderElapsedMs=Math.round(exportInfo.renderElapsedMs);
    }
    return manifest;
  }
  function manifestEntry(manifest){return {name:'manifest.json',data:ascii(JSON.stringify(manifest,null,2))};}
  function assemble(p,completed,exportInfo){
    if(!p||!Array.isArray(p.timesMs)||!Array.isArray(completed)||completed.length!==p.timesMs.length)
      throw Error('Incomplete PNG frame sequence');
    var frames=[],entries=[];
    completed.forEach(function(frame,index){frames.push(validateFrame(p,frame,index));entries.push(...frame.entries);});
    var manifest=manifestFor(p,frames,exportInfo);
    entries.unshift(manifestEntry(manifest));
    return {cancelled:false,blob:zip(entries),manifest:manifest,
      ...(p.previewTimeMs!==undefined?{previewBlob:new Blob([completed[0].entries[0].data],{type:'image/png'})}:{})};
  }
  // Each append is strictly ordered. The caller owns a bounded window and
  // must drain all returned parts before requesting the next timestamp.
  function streamingArchive(p,workers){
    if(!p.streaming||p.previewTimeMs!==undefined)throw Error('Streaming sequence plan required');
    var writer=zipWriter(Infinity),rows=[];
    return Object.freeze({append:function(index,frame,elapsedMs){
      if(index!==rows.length||index>=p.timesMs.length)throw Error('Invalid streaming PNG frame order');
      rows.push(validateFrame(p,frame,index));
      var parts=[];frame.entries.forEach(function(e){parts.push(...writer.add(e));});
      var manifest=null;
      if(rows.length===p.timesMs.length){
        manifest=manifestFor(p,rows,{workers:workers,renderElapsedMs:elapsedMs});
        parts.push(...writer.add(manifestEntry(manifest)),writer.finish());
      }
      return {parts:parts,manifest:manifest};
    }});
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
      var frame=await renderTimestamp(p,i,settings.render,cancel,settings.presentationAdapter);
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
  return Object.freeze({plan:plan,checkFrameBudget:checkFrameBudget,exportSettings:exportSettings,prepareCanvas:prepareCanvas,
    resolveHudAppearance:resolveHudAppearance,
    run:run,renderTimestamp:renderTimestamp,assemble:assemble,outputSides:outputSides,
    zip:zip,streamingArchive:streamingArchive,MAX_STREAM_FRAMES:MAX_STREAM_FRAMES,graphForCanvas:graphForCanvas,
    compositeOpaqueWhite:compositeOpaqueWhite,MAX_FRAMES:MAX_FRAMES});
}));
