/* Offline presentation geometry and painting. No DOM, clock, optics or encoding.
 * The caller renders Accurate RK4 at frame.viewSize before composing; model
 * pixels are copied 1:1. Observation decoding belongs to the caller. */
(function(root,factory){
  var projects=root.CurvatureModernAnimationProject,presentation=root.CurvatureModernAnimationPresentation,
    references=root.CurvatureModernReferenceImage,telemetry=root.CurvatureModernCameraTelemetry,
    hud=root.CurvatureModernCameraHud;
  if(typeof module==='object'&&module.exports){
    projects=require('./ModernAnimationProject');presentation=require('./ModernAnimationPresentation');
    references=require('./ModernReferenceImage');telemetry=require('../camera/ModernCameraTelemetry');
    hud=require('../ui/modern/ModernCameraHud');
  }
  var api=factory(projects,presentation,references,telemetry,hud);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernAnimationPresentationCompositor=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(projects,presentation,references,telemetry,hud){
  'use strict';
  function rect(x,y,width,height){return Object.freeze({x:x,y:y,width:width,height:height});}
  function choice(value,allowed,fallback){
    if(value===undefined)return fallback;
    if(!allowed.includes(value))throw RangeError('Unsupported presentation layout option');return value;
  }
  function plan(project,options){
    options=options||{};
    var p=projects.validate(project),width=choice(options.width,[1280,1920,2560,3840],1920),height=width*9/16;
    if(options.height!==undefined&&options.height!==height)throw RangeError('Presentation output must be 16:9');
    var times=Object.freeze(projects.timeline(p).map(function(t){
      return Object.freeze(Object.assign({},t,{referenceImageIds:Object.freeze((t.referenceImageIds||[]).slice())}));
    }));
    var linked=new Set(times.flatMap(function(t){return t.referenceImageIds;})),aspects=Object.create(null);
    (options.referenceDimensions||[]).forEach(function(r){
      if(!r||!linked.has(r.id)||!Number.isFinite(r.width)||!Number.isFinite(r.height)||r.width<=0||r.height<=0)
        throw RangeError('Invalid presentation reference dimensions');
      aspects[r.id]=r.width/r.height;
    });
    return Object.freeze({project:p,width:width,height:height,times:times,durationMs:projects.totalMs(p),referenceAspects:Object.freeze(aspects),
      sides:Object.freeze(p.baseExperiment.display.mode==='compare'?['A','B']:['A']),
      referenceLayout:choice(options.referenceLayout,['side','below','hidden'],'side'),
      layoutMode:choice(options.layoutMode,['fixed','dynamic'],'fixed'),
      showNarrative:choice(options.showNarrative,[true,false],true),
      cameraHud:choice(options.cameraHud,[true,false],false),
      cameraHudSize:options.cameraHud===true?(options.cameraHudAppearance===undefined?100:hud.validateAppearance(options.cameraHudAppearance).size):100,
      hasSceneCaption:!!((p.baseExperiment.scene.title&&p.baseExperiment.scene.title!==p.name)||p.baseExperiment.scene.description),
      hasReferences:times.some(function(t){return !!t.referenceImageIds.length;}),
      hasNarrative:times.some(function(t){return !!(t.description||t.narrativeTitle);})});
  }
  function contain(box,width,height){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
      throw RangeError('Invalid raster dimensions');
    var w,h;
    if(box.width/width<=box.height/height){w=box.width;h=height*(w/width);}
    else{h=box.height;w=width*(h/height);}
    return rect(box.x+(box.width-w)/2,box.y+(box.height-h)/2,w,h);
  }
  // Score actual contained photo pixels, not the size of an empty photo panel.
  // Preserve at least the previous physical raster size; prefer usable model
  // pixels, then observation pixels, and penalize unused photo-box area.
  // Keep at least 60% of the legacy mean displayed photo area.
  var shares=new WeakMap();
  function adaptiveShare(p,body,gap,label,px,metadataHeight,legacy,ratios){
    if(!ratios.length)return legacy;
    var cache=shares.get(p),key=ratios.join(',');
    if(!cache){cache=new Map();shares.set(p,cache);}
    if(cache.has(key))return cache.get(key);
    var side=p.referenceLayout==='side',n=p.sides.length;
    function evaluate(size){
      var mw=side?body.width-size-gap:body.width,mh=side?body.height:body.height-size-gap;
      var pw=side?size-2*gap:Math.floor((body.width-gap)*0.55)-gap,
        ph=side?body.height-label-px(88)-gap:size-label-gap;
      var units=Math.floor(Math.min(Math.floor((mw-gap*(n-1))/n)/16,(mh-label-metadataHeight)/9,120));
      if(units<20||pw<=0||ph<=0)return null;
      var modelArea=n*144*units*units,photoArea=ratios.reduce(function(sum,r){
        var w=Math.min(pw,ph*r);return sum+w*w/r;
      },0)/ratios.length;
      return {units:units,photoArea:photoArea,score:modelArea+0.5*photoArea-0.05*(pw*ph-photoArea)};
    }
    var best=legacy,base=evaluate(legacy),score=base?base.score:-Infinity,
      min=side?px(260):label+gap+5*Math.ceil(px(12)*1.22),
      max=side?Math.floor(body.width*0.55):body.height-gap-label-metadataHeight-180;
    for(var size=min;size<=max;size+=Math.max(1,px(8))){
      var v=evaluate(size);
      if(v&&(!base||(v.units>=base.units&&v.photoArea>=0.60*base.photoArea))&&v.score>score){best=size;score=v.score;}
    }
    cache.set(key,best);return best;
  }
  // A Fixed export considers all linked originals, even outside the current
  // hold. Dynamic uses only the displayed original, or the linked set during
  // travel with a reserved panel. Missing dimension metadata retains legacy geometry.
  function referenceRatios(p,r){
    var ids=p.layoutMode==='dynamic'&&r.ids.length?[r.ids[0]]:Object.keys(p.referenceAspects);
    return ids.map(function(id){return p.referenceAspects[id];}).filter(function(ratio){return Number.isFinite(ratio)&&ratio>0;});
  }
  function frameAt(p,timeMs){
    if(!Number.isFinite(timeMs)||timeMs<0||timeMs>p.durationMs)throw RangeError('Invalid presentation time');
    var r=presentation.referencesAt(p.times,timeMs),i=0;
    while(i+1<p.times.length&&timeMs>=p.times[i+1].arrivalMs)i++;
    var reserve=p.referenceLayout!=='hidden'&&p.hasReferences&&(p.layoutMode==='fixed'||r.reserve);
    var s=p.width/1280,px=function(n){return Math.round(n*s);};
    var pad=px(14),gap=px(10),label=px(26),header=px(66),footer=px(30),
      narrativeHeight=p.showNarrative&&p.hasNarrative?px(112):0,
      sceneHeight=p.hasSceneCaption?px(64):0,
      hudFont=px(14*p.cameraHudSize/100),
      // Below uses the wide model columns for a compact first row, retaining
      // enough room for the original and all four provenance fields at HD.
      hudCompact=reserve&&p.referenceLayout==='below',
      hudHeight=p.cameraHud?px(12)+(hudCompact?4:5)*Math.ceil(hudFont*1.22)+px(6):0,
      metadataHeight=sceneHeight+hudHeight;
    var body=rect(pad,header,p.width-2*pad,p.height-header-footer-narrativeHeight-gap),
      models=body,photo=null,photoBox=null,photoText=null;
    if(reserve&&p.referenceLayout==='side'){
      var w=adaptiveShare(p,body,gap,label,px,metadataHeight,Math.floor((body.width-gap)*0.32),referenceRatios(p,r));
      photo=rect(body.x,body.y,w,body.height);
      models=rect(body.x+w+gap,body.y,body.width-w-gap,body.height);
      photoText=rect(photo.x+gap,photo.y+photo.height-px(88),photo.width-2*gap,px(82));
      photoBox=rect(photo.x+gap,photo.y+label,photo.width-2*gap,photo.height-label-px(88)-gap);
    }else if(reserve){
      // Preserve the reference allocation unless the metadata and minimum
      // physical raster cannot coexist. Never cover a physical pixel with text.
      var h=Math.min(Math.floor((body.height-gap)*0.38),body.height-gap-label-metadataHeight-180);
      h=adaptiveShare(p,body,gap,label,px,metadataHeight,h,referenceRatios(p,r));
      photo=rect(body.x,body.y+body.height-h,body.width,h);
      models=rect(body.x,body.y,body.width,body.height-h-gap);
      var bw=Math.floor((photo.width-gap)*0.55);
      photoBox=rect(photo.x+gap,photo.y+label,bw-gap,photo.height-label-gap);
      photoText=rect(photo.x+bw+gap,photo.y+label,photo.width-bw-2*gap,photo.height-label-gap);
    }
    var paneWidth=Math.floor((models.width-gap*(p.sides.length-1))/p.sides.length),
      // Exact 16:9 integer backing pixels, within existing physical export limits.
      units=Math.floor(Math.min(paneWidth/16,(models.height-label-metadataHeight)/9,120)),
      vw=units*16,vh=units*9;
    if(vw<320||vh<180)throw RangeError('Presentation leaves insufficient physical viewport space');
    var spare=models.height-label-vh;
    var oldOffset=Math.floor(spare/2),offset=Math.max(sceneHeight,Math.min(oldOffset,spare-hudHeight));
    var modelWidth=paneWidth*p.sides.length+gap*(p.sides.length-1),
      sceneCaption=sceneHeight?rect(models.x,models.y+label,modelWidth,sceneHeight):null,
      cameraHud=hudHeight?rect(models.x,models.y+label+offset+vh,modelWidth,hudHeight):null;
    var panels={};p.sides.forEach(function(side,j){
      var panel=rect(models.x+j*(paneWidth+gap),models.y,paneWidth,models.height);
      panels[side]=Object.freeze({panel:panel,viewport:rect(panel.x+Math.floor((paneWidth-vw)/2),
        panel.y+label+offset,vw,vh)});
    });
    var t=p.times[i],caption=p.showNarrative?presentation.narrativeAt(p.times,timeMs):null,
      sample=projects.sampleAt(p.project,timeMs),expected={};
    p.sides.forEach(function(side){
      var spec=p.sides.length===2?sample.compare[side]:sample.scene;
      expected[side]=Object.freeze({showModel:p.sides.length===2?(spec.surface==='flat'?2:1):spec.surface.showModel,
        atmosphere:spec.atmosphere});
    });
    return Object.freeze({width:p.width,height:p.height,title:p.project.name,timeMs:timeMs,durationMs:p.durationMs,
      chapter:(i+1)+' / '+p.times.length+' · '+(t.narrativeTitle||t.name),
      sceneTitle:sample.scene.title,sceneDescription:sample.scene.description,
      sceneCaption:sceneCaption,cameraHud:cameraHud,hudFont:hudFont,hudCompact:hudCompact,
      sample:sample,expected:Object.freeze(expected),sides:p.sides,viewSize:Object.freeze({width:vw,height:vh}),panels:Object.freeze(panels),
      referenceId:reserve&&r.ids.length?r.ids[0]:null,referenceCount:reserve?r.ids.length:0,
      photo:photo,photoBox:photoBox,photoText:photoText,caption:caption?Object.freeze(caption):null,
      narrative: narrativeHeight?rect(pad,body.y+body.height+gap,body.width,narrativeHeight-gap):null,
      pad:pad,labelHeight:label,footerHeight:footer,scale:s});
  }
  // Call once per decoded original, not for every video timestamp. The caller
  // must decode record.original (never a thumbnail) and retain ownership until
  // export completes. Display dimensions include EXIF orientation.
  function observation(record,image){
    var r=references.validate(record),w=image&&(image.naturalWidth===undefined?image.width:image.naturalWidth),
      h=image&&(image.naturalHeight===undefined?image.height:image.naturalHeight);
    if(w!==r.original.width||h!==r.original.height)throw RangeError('Decoded original dimensions do not match reference');
    return Object.freeze({id:r.id,image:image,width:w,height:h,title:r.title,author:r.author||'',
      license:r.license||'',sourceUrl:r.sourceUrl||''});
  }
  function source(image,side,frame,target){
    if(!image||image.quality!=='accurate'||(image.metrics&&image.metrics.opticalQuality&&image.metrics.opticalQuality!=='accurate')||
      !image.canvas||image.canvas===target||image.canvas.width!==frame.viewSize.width||image.canvas.height!==frame.viewSize.height||
      !image.cameraModel||image.cameraModel.showModel!==frame.expected[side].showModel||image.timeMs!==frame.timeMs)
      throw RangeError('Presentation '+side+' requires a painted Accurate RK4 view of the planned dimensions');
    return image;
  }
  // Wrap by measured glyph widths, including long URLs and explicit newlines.
  // Overflow is visible and reported to the caller; no silent omission.
  function textBlock(ctx,text,box,size,weight,color,warnings,key){
    var lineHeight=Math.ceil(size*1.22),maxLines=Math.floor(box.height/lineHeight),lines=[],line='';
    ctx.font=weight+' '+size+'px Arial, sans-serif';ctx.fillStyle=color;
    var fits=function(t){return ctx.measureText(t).width<=box.width;};
    String(text).split(/\r?\n/).forEach(function(paragraph){
      line='';paragraph.split(/\s+/).forEach(function(word){
        if(!word)return;
        if(line&&fits(line+' '+word)){line+=' '+word;return;}
        if(fits(word)){if(line)lines.push(line);line=word;return;}
        if(line)line+=' ';
        Array.from(word).forEach(function(ch){if(line&&!fits(line+ch)){lines.push(line);line='';}line+=ch;});
      });lines.push(line);
    });
    if(lines.length>maxLines){
      warnings.push(key);lines=lines.slice(0,maxLines);
      if(lines.length){var last=Array.from(lines[lines.length-1]);while(last.length&&!fits(last.join('')+'…'))last.pop();lines[lines.length-1]=last.join('')+'…';}
    }
    lines.forEach(function(t,i){ctx.fillText(t,box.x,box.y+i*lineHeight);});
  }
  var fields=[['Height','heightMeters','height'],['Origin','distanceFromOriginMeters','distance'],
    ['East','eastMeters','east'],['North','northMeters','north'],['Heading','headingDegrees','heading'],
    ['Pitch','pitchDegrees','pitch'],['Roll','rollDegrees','roll'],['FOV','fovDegrees','fov']];
  function cameraData(frame,sources){
    if(!frame.cameraHud)return [];
    var samples=sources.map(function(v){return telemetry.measure(v.cameraModel);});
    var shared=samples.length===2&&fields.every(function(f){return samples[0][f[1]]===samples[1][f[1]];});
    return (shared?[samples[0]]:samples).map(function(sample,i){
      return {label:shared?'Camera · A / B':frame.sides.length===2?'Camera · '+frame.sides[i]:'Camera',
        values:telemetry.format(sample)};
    });
  }
  function clock(ms){return (ms/1000).toFixed(2)+' s';}
  function paint(target,frame,images,photo){
    if(!target||target.width!==frame.width||target.height!==frame.height||typeof target.getContext!=='function')
      throw RangeError('Presentation target dimensions do not match frame');
    var sources=frame.sides.map(function(side){return source(images&&images[side],side,frame,target);});
    if(new Set(sources.map(function(v){return v.canvas;})).size!==sources.length)throw RangeError('Presentation views must be independent');
    if(frame.referenceId){
      if(!photo||photo.id!==frame.referenceId||!photo.image||photo.image===target||sources.some(function(v){return v.canvas===photo.image;})||
        (photo.image.naturalWidth===undefined?photo.image.width:photo.image.naturalWidth)!==photo.width||
        (photo.image.naturalHeight===undefined?photo.image.height:photo.image.naturalHeight)!==photo.height)
        throw RangeError('Missing or mismatched presentation original: '+frame.referenceId);
    }else if(photo)throw RangeError('Unexpected presentation original outside its reference interval');
    var cameras=cameraData(frame,sources);
    var ctx=target.getContext('2d');if(!ctx)throw Error('Canvas 2D presentation unavailable');
    var s=frame.scale,pad=frame.pad,fs=function(n){return Math.round(n*s);},warnings=[];
    function block(text,b,size,weight,key){textBlock(ctx,text,b,fs(size),weight,'#192e43',warnings,key);}
    function fill(b,c){ctx.fillStyle=c;ctx.fillRect(b.x,b.y,b.width,b.height);}
    ctx.save();try{
      ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
      ctx.textAlign='left';ctx.textBaseline='top';
      fill(rect(0,0,frame.width,frame.height),'#f1f5f9');
      block(frame.title,rect(pad,fs(7),frame.width-2*pad,fs(29)),22,'600','title');
      block(frame.chapter,rect(pad,fs(36),frame.width-2*pad,fs(23)),17,'400','chapter');
      frame.sides.forEach(function(side,i){
        var b=frame.panels[side],v=sources[i];fill(b.panel,'#ffffff');
        fill(rect(b.panel.x,b.panel.y,b.panel.width,frame.labelHeight),'#dce8f2');
        block((frame.sides.length===2?'Model '+side+' · ':'Model · ')+(v.cameraModel.showModel===1?'Globe':'Flat')+' · '+frame.expected[side].atmosphere,
          rect(b.panel.x+fs(6),b.panel.y+fs(3),b.panel.width-fs(12),frame.labelHeight-fs(3)),16,'600','model');
        ctx.imageSmoothingEnabled=false;ctx.drawImage(v.canvas,b.viewport.x,b.viewport.y);
      });
      if(frame.sceneCaption){
        var caption=frame.sceneCaption,hasTitle=frame.sceneTitle&&frame.sceneTitle!==frame.title;
        fill(caption,'#ffffff');
        if(hasTitle)block(frame.sceneTitle,rect(caption.x+fs(6),caption.y+fs(4),caption.width-fs(12),fs(22)),16,'600','scene title');
        if(frame.sceneDescription){var dy=hasTitle?fs(27):fs(4);
          block(frame.sceneDescription,rect(caption.x+fs(6),caption.y+dy,caption.width-fs(12),caption.height-dy),14,'400','scene description');}
      }
      if(frame.cameraHud){
        var area=frame.cameraHud;
        cameras.forEach(function(camera,i){
          var box=cameras.length===1?area:rect(frame.panels[frame.sides[i]].panel.x,area.y,frame.panels[frame.sides[i]].panel.width,area.height);
          fill(box,'#e8eff5');
          var font=frame.hudFont,step=Math.ceil(font*1.22),inset=fs(6),col=Math.floor((box.width-3*inset)/2);
          function hudText(t,x,y,w,weight,key){textBlock(ctx,t,rect(x,y,w,step),font,weight,'#192e43',warnings,key);}
          var firstCol=Math.floor((box.width-4*inset)/3);
          hudText(camera.label,box.x+inset,box.y+inset,frame.hudCompact?firstCol:box.width-2*inset,'600','camera heading');
          fields.forEach(function(f,j){
            var first=frame.hudCompact&&j<2,x=first?box.x+inset+(j+1)*(firstCol+inset):box.x+inset+(j%2)*(col+inset),
              y=box.y+inset+(frame.hudCompact?Math.floor(j/2):1+Math.floor(j/2))*step;
            hudText(f[0]+' '+camera.values[f[2]],x,y,first?firstCol:col,'400','camera '+f[2]);
          });
        });
      }
      if(frame.photo){
        fill(frame.photo,'#ffffff');fill(rect(frame.photo.x,frame.photo.y,frame.photo.width,frame.labelHeight),'#dce8f2');
        block('Reference · real observation'+(frame.referenceCount>1?' · 1 / '+frame.referenceCount:''),rect(frame.photo.x+fs(6),frame.photo.y+fs(3),frame.photo.width-fs(12),frame.labelHeight-fs(3)),16,'600','reference label');
        if(photo){
          var b=contain(frame.photoBox,photo.width,photo.height);ctx.imageSmoothingEnabled=true;
          ctx.drawImage(photo.image,b.x,b.y,b.width,b.height);
          // Reserve distinct rows so even a very long title/author cannot hide
          // the license or source. Include at least two lines for the URL.
          var meta=frame.photoText,step=Math.ceil(fs(12)*1.22);
          [photo.title,'Author: '+(photo.author||'Unknown'),'License: '+(photo.license||'Unknown'),
            'Source: '+(photo.sourceUrl||'Unknown')].forEach(function(value,i){
            block(value,rect(meta.x,meta.y+i*step,meta.width,i===3?meta.height-3*step:step),12,'400','reference '+['title','author','license','source'][i]);
          });
        }else block('No reference at this time',frame.photoBox,16,'400','reference placeholder');
      }
      if(frame.narrative&&frame.caption)block(frame.caption.text,frame.narrative,16,'400','explanation');
      block('Accurate RK4 · '+clock(frame.timeMs)+' / '+clock(frame.durationMs),
        rect(pad,frame.height-frame.footerHeight+fs(3),frame.width-2*pad,frame.footerHeight-fs(3)),14,'400','timing');
    }finally{ctx.restore();}
    return Object.freeze({canvas:target,warnings:Object.freeze(warnings)});
  }
  return Object.freeze({plan:plan,frameAt:frameAt,contain:contain,observation:observation,paint:paint});
}));
