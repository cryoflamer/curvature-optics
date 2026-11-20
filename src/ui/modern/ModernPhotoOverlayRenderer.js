/* Scene reference photo presentation, independent of physical painting.
 * The original graph remains the pointer target and thumbnail source.
 * No refit, model edits, alternate image fallback or storage writes.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernPhotoOverlayRenderer=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function create(env,options={}){
    const registration=env.CurvatureModernPhotoOverlayRegistration;
    const state=env.CurvatureModernExperimentState;
    let generation=0,key=null,origin=null,reference=null,image=null;
    let source=null,layer=null,observer=null,layout=null,dimensions=null;
    let status='inactive',error='',pending=null;
    // Local presentation choices; not part of the physical experiment.
    let mode='overlay',opacity=50,painted=false;
    function effectiveMode(){return painted&&status==='ready'?mode:'scene';}
    function notify(){if(typeof options.onChange==='function')options.onChange(snapshot());}
    function present(){
      if(layer){
        const active=effectiveMode();
        layer.style.display=active==='scene'?'none':'';
        layer.style.opacity=String(active==='photo'?1:opacity/100);
        // White outside the registered picture (and behind transparent pixels)
        // in Photo only. Do not change opacity/visibility of the source canvas.
        layer.style.background=active==='photo'?'#fff':'transparent';
      }
      notify();
    }
    function setMode(value){
      if(!['scene','photo','overlay'].includes(value))throw RangeError('Unknown photo display mode');
      mode=value;present();return snapshot();
    }
    function setOpacity(value){
      if(!Number.isInteger(value)||value<0||value>100)throw RangeError('Invalid photo opacity');
      opacity=value;present();return snapshot();
    }
    function detach(){
      if(observer)observer.disconnect();
      observer=null;
      if(layer&&layer.parentNode)layer.parentNode.removeChild(layer);
      layer=null;source=null;layout=null;dimensions=null;painted=false;
    }
    function clear(){
      generation++;detach();key=null;origin=null;reference=null;image=null;
      status='inactive';error='';pending=null;notify();
    }
    function fail(message){
      generation++;detach();reference=null;image=null;pending=null;
      status='unavailable';error=String(message?.message||message);notify();
    }
    function align(){
      if(!source||!layer||!dimensions)return false;
      if(source.width!==dimensions.width||source.height!==dimensions.height||
         !source.parentNode||source.parentNode!==layer.parentNode||
         !(source.offsetWidth>0&&source.offsetHeight>0)){
        painted=false;present();return false;
      }
      layer.style.left=source.offsetLeft+'px';layer.style.top=source.offsetTop+'px';
      layer.style.width=source.offsetWidth+'px';layer.style.height=source.offsetHeight+'px';
      return true;
    }
    function paint(){
      if(!image||!source||!layout||!dimensions)return;
      if(source.width!==dimensions.width||source.height!==dimensions.height||!source.parentNode||
         !(source.offsetWidth>0&&source.offsetHeight>0)){
        painted=false;present();return;
      }
      if(!layer){
        layer=env.document.createElement('canvas');
        layer.className='modern-reference-photo-overlay';
        layer.setAttribute('aria-hidden','true');
        Object.assign(layer.style,{position:'absolute',pointerEvents:'none',margin:'0',
          background:'transparent',opacity:'0.5',zIndex:'2',display:'none'});
        source.parentNode.appendChild(layer);
        if(env.ResizeObserver){
          observer=new env.ResizeObserver(()=>{
            // A valid CSS alignment does not authorize previously stale
            // backing pixels. Only paint() can mark a completed layer ready.
            if(align())present();
          });
          observer.observe(source);
        }
      }
      painted=false;
      if(layer.width!==dimensions.width)layer.width=dimensions.width;
      if(layer.height!==dimensions.height)layer.height=dimensions.height;
      if(!align())return;
      const ctx=layer.getContext('2d');
      if(!ctx)throw Error('Reference photo Canvas 2D unavailable');
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,layer.width,layer.height);
      const r=layout.rect;
      // Canvas clips to its backing bounds. Never shrink the destination to
      // layout.clip, which would stretch the entire original into the crop.
      if(layout.clip)ctx.drawImage(image,r.x,r.y,r.width,r.height);
      painted=true;status='ready';error='';present();
    }
    async function resolveOriginal(expected,token){
      const archive=env.CurvatureModernCalibrationResultArchive,
        resultApi=env.CurvatureModernCalibrationResult,
        library=env.CurvatureModernReferenceImageLibrary,
        importer=env.CurvatureModernReferenceImageImport;
      const archived=await archive.get(env.indexedDB,expected.resultId);
      if(token!==generation)return;
      if(!archived)throw Error('Calibration result unavailable');
      const trusted=state.validateCalibrationOrigin(resultApi.origin(archived.record,expected.target));
      if(JSON.stringify(trusted)!==JSON.stringify(expected))
        throw Error('Calibration origin does not match archived result');
      const row=await library.findOriginal(env.indexedDB,trusted.photo,env.crypto,
        record=>importer.verifyOriginal(record,env));
      if(token!==generation)return;
      if(!row)throw Error('Reference photo original unavailable');
      const decoded=new env.Image();
      decoded.src=row.record.original.dataUrl;await decoded.decode();
      if(token!==generation)return;
      if(decoded.naturalWidth!==trusted.photo.width||decoded.naturalHeight!==trusted.photo.height)
        throw Error('Reference photo decoded dimensions mismatch');
      reference={id:row.id,title:row.record.title};image=decoded;
      if(layout){status='loaded';paint();}
    }
    function capture(candidate,canvas,camera,aspect){
      if(!candidate||candidate.target!=='Scene'||!canvas||!canvas.parentNode){clear();return;}
      try{
        const checked=state.validateCalibrationOrigin(candidate),next=JSON.stringify(checked);
        if(next!==key){
          clear();key=next;origin=checked;status='loading';
        }
        if(status==='unavailable')return;
        if(source!==canvas){detach();source=canvas;}
        if(layer&&layer.parentNode!==canvas.parentNode){detach();source=canvas;}
        const width=canvas.width,height=canvas.height;
        // Copy the completed capture's layout only. The live pose, focal
        // field, zoom and sceneSize are intentionally not passed through.
        try{
          layout=registration.create(origin).layout({aspect,width,height,
            screenSize:camera?.screenSize,pixelTransform:camera?.pixelTransform});
          dimensions={width,height};
        }catch(e){
          // A hidden or resizing graph may report a temporary invalid
          // capture. Hide the stale layer and retry the next completed draw.
          detach();status='layout-unavailable';error=String(e.message||e);notify();return;
        }
        if(image){status='loaded';error='';paint();return;}
        if(!pending){
          status='loading';error='';notify();
          const token=generation;
          pending=resolveOriginal(origin,token).catch(e=>{
            if(token===generation)fail(e);
          }).finally(()=>{if(token===generation)pending=null;});
        }
      }catch(e){fail(e);}
    }
    function snapshot(){
      return {status,error,resultId:origin?.resultId||null,reference:reference?{...reference}:null,
        photo:origin?{width:origin.photo.width,height:origin.photo.height}:null,
        mode,opacity,effectiveMode:effectiveMode(),available:painted&&status==='ready',
        layout,backing:dimensions?{...dimensions}:null};
    }
    return Object.freeze({capture,clear,snapshot,setMode,setOpacity});
  }
  return Object.freeze({create});
}));
