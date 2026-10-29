/* Cheap raster preview for the shared Scene/Compare camera gesture.
 * Existing Canvas backing stores are already cached pixels: translate them
 * with CSS while dragging, rather than copying or re-rendering the scene.
 * The authoritative physical renderer replaces this approximation on release.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCameraDragPreview=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Use PNG cursors because some Opera/Windows installations render native
  // grab/grabbing with a generic four-way scroll glyph. The last keyword is
  // a native fallback if an image fails to load.
  var cameraCursors=Object.freeze({
    grab:'url("src/ui/modern/cursors/hand-open.png") 10 5, grab',
    grabbing:'url("src/ui/modern/cursors/hand-closed.png") 12 9, grabbing'
  });
  function cursorValue(value){return cameraCursors[value]||value;}
  // Apply cursor state directly as well as via CSS. Older stylesheet responses
  // can be cached independently of the Modern script in local dev servers.
  function setCursor(target,value){
    var style=target&&target.style;
    if(!style)return;
    if(typeof style.setProperty==='function')style.setProperty('cursor',cursorValue(value),'important');
    else style.cursor=cursorValue(value);
  }
  function restoreCursor(target,value,priority){
    var style=target&&target.style;
    if(!style)return;
    if(typeof style.removeProperty==='function'&&!value)style.removeProperty('cursor');
    else if(typeof style.setProperty==='function')style.setProperty('cursor',value,priority||'');
    else style.cursor=value||'';
  }
  function create(options){
    options=options||{};
    var request=options.requestFrame||function(fn){return requestAnimationFrame(fn);};
    var cancel=options.cancelFrame||function(id){cancelAnimationFrame(id);};
    var cursorHost=options.cursorHost||null;
    var entries=null,source=null,dx=0,dy=0,queued=false,frame=null,holding=false;
    var hostCursor=null;
    function cursor(on){
      var classes=cursorHost&&cursorHost.classList;
      if(on){
        if(classes)classes.add('modern-camera-dragging-global');
        if(cursorHost&&cursorHost.style){
          var style=cursorHost.style;
          hostCursor={value:style.getPropertyValue?style.getPropertyValue('cursor'):style.cursor||'',
            priority:style.getPropertyPriority?style.getPropertyPriority('cursor'):''};
          setCursor(cursorHost,'grabbing');
        }
      }else{
        if(classes)classes.remove('modern-camera-dragging-global');
        if(hostCursor){
          restoreCursor(cursorHost,hostCursor.value,hostCursor.priority);
          hostCursor=null;
        }
      }
    }
    function stopFrame(){
      if(queued){cancel(frame);queued=false;frame=null;}
    }
    function reset(){
      stopFrame();cursor(false);
      if(entries)entries.forEach(function(entry){
        entry.canvas.style.transform=entry.transform;
        entry.canvas.style.willChange=entry.willChange;
        setCursor(entry.canvas,'grab');
        var classes=entry.canvas.classList;
        if(classes)classes.remove('is-camera-dragging');
      });
      entries=null;source=null;dx=dy=0;holding=false;
    }
    function paint(){
      if(!entries)return;
      entries.forEach(function(entry){
        // A/B may have different CSS widths. Preserve the same *fraction* of
        // the viewport displacement so the two camera directions stay aligned.
        var x=dx*entry.width/source.width,y=dy*entry.height/source.height;
        entry.canvas.style.transform='translate3d('+x+'px, '+y+'px, 0)';
      });
    }
    function schedule(){
      if(queued)return;
      queued=true;
      frame=request(function(){queued=false;frame=null;paint();});
    }
    return Object.freeze({
      begin:function(spec){
        reset();
        if(!spec||!Array.isArray(spec.viewports)||!spec.viewports.length)
          throw TypeError('Camera preview viewports required');
        var prepared=spec.viewports.map(function(view){
          var canvas=view&&view.canvas,rect=canvas&&canvas.getBoundingClientRect&&canvas.getBoundingClientRect();
          if(!canvas||!canvas.style||!rect||!(rect.width>0&&rect.height>0))
            throw RangeError('Camera preview requires visible Canvas dimensions');
          return {name:view.name,canvas:canvas,width:rect.width,height:rect.height,
            transform:canvas.style.transform||'',willChange:canvas.style.willChange||''};
        });
        var initial=prepared.find(function(view){return view.name===spec.source;});
        if(!initial)throw RangeError('Camera preview source is not visible');
        entries=prepared;source=initial;
        entries.forEach(function(entry){
          entry.canvas.style.willChange='transform';
          setCursor(entry.canvas,'grabbing');
          if(entry.canvas.classList)entry.canvas.classList.add('is-camera-dragging');
        });
        cursor(true);
      },
      move:function(sample){
        if(!entries||holding)return;
        if(!sample||!Number.isFinite(sample.dx)||!Number.isFinite(sample.dy))
          throw RangeError('Camera preview displacement must be finite');
        dx=sample.dx;dy=sample.dy;
        schedule();
      },
      // After pointerup, keep the last preview pixels visible until the
      // authoritative Canvas draws are finished in the following RAF.
      hold:function(sample){
        if(!entries)return;
        if(sample)this.move(sample);
        stopFrame();paint();holding=true;
        cursor(false);
        entries.forEach(function(entry){
          if(entry.canvas.classList)entry.canvas.classList.remove('is-camera-dragging');
          setCursor(entry.canvas,'grab');
        });
      },
      clear:reset,
      isActive:function(){return entries!==null;},
      isHolding:function(){return holding;}
    });
  }
  return Object.freeze({create:create,setCursor:setCursor,cursorValue:cursorValue});
}));
