/* Read-only camera overlay for Modern Scene and Compare. Text is derived from
 * the same physical camera snapshot that is used by each viewport; visibility
 * changes affect only DOM, never an optics draw or saved experiment.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernCameraHud=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var VIEWS=['Scene','A','B'];
  function normalizeAppearance(input){
    var data=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
    return Object.freeze({
      opacity:Number.isInteger(data.opacity)&&data.opacity>=0&&data.opacity<=100?
        data.opacity:90,
      position:['top-left','top-right','bottom-left','bottom-right'].includes(data.position)?
        data.position:'top-left',
      size:[75,100,125].includes(data.size)?data.size:100
    });
  }
  function create(options){
    var telemetry=options&&options.telemetry,doc=options&&options.document;
    if(!telemetry||!doc||typeof doc.createElement!=='function')
      throw TypeError('Camera HUD requires telemetry and a document');
    var entries=Object.create(null);
    function ensure(view,canvas){
      if(!VIEWS.includes(view)||!canvas||!canvas.parentNode)return null;
      var parent=canvas.parentNode,entry=entries[view];
      if(entry&&entry.parent===parent&&entry.node.parentNode===parent)return entry;
      if(entry&&entry.node.parentNode)entry.node.parentNode.removeChild(entry.node);
      var node=doc.createElement('div');
      node.className='modern-camera-telemetry';
      node.setAttribute('role','group');
      node.setAttribute('aria-label','Camera telemetry');
      // Avoid announcing frequent position updates during keyboard navigation.
      node.setAttribute('aria-live','off');
      var heading=doc.createElement('strong');node.appendChild(heading);
      var rows=[];
      for(var i=0;i<3;i++){
        var row=doc.createElement('span');node.appendChild(row);rows.push(row);
      }
      parent.appendChild(node);
      entry={parent:parent,node:node,heading:heading,rows:rows};
      entries[view]=entry;
      return entry;
    }
    function setAppearance(view,appearance){
      var entry=entries[view];
      if(!entry)return false;
      var a=normalizeAppearance(appearance);
      entry.node.setAttribute('data-position',a.position);
      entry.node.setAttribute('data-size',String(a.size));
      // Only the panel background fades; telemetry text remains fully opaque.
      entry.node.style.backgroundColor='rgba(17, 41, 59, '+a.opacity/100+')';
      return true;
    }
    function update(view,canvas,model,appearance){
      // Compute first; an invalid/incomplete model never leaves misleading values.
      var entry=ensure(view,canvas);
      if(!entry)return false;
      try{
        var sample=telemetry.measure(model),text=telemetry.format(sample);
        entry.heading.textContent='CAMERA · '+(text.geometry==='flat'?'FLAT':'GLOBE');
        entry.rows[0].textContent='Height '+text.height+'  ·  Origin '+text.distance;
        entry.rows[1].textContent='East '+text.east+'  ·  North '+text.north;
        entry.rows[2].textContent='Heading '+text.heading+'  ·  Pitch '+text.pitch+
          '  ·  Roll '+text.roll+'  ·  FOV '+text.fov;
        setAppearance(view,appearance);
        entry.node.hidden=false;
        return true;
      }catch(error){entry.node.hidden=true;return false;}
    }
    function hide(view){var entry=entries[view];if(entry)entry.node.hidden=true;}
    function hideAll(){VIEWS.forEach(hide);}
    return Object.freeze({update:update,hide:hide,hideAll:hideAll,setAppearance:setAppearance});
  }
  return Object.freeze({create:create,normalizeAppearance:normalizeAppearance});
}));
