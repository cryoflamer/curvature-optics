/* Modern controls for the original Legacy demonstration catalog. The Legacy
 * engine has its own lightweight HTML host and isolated global namespace.
 * Scene/Compare do not import Legacy globals or serialized keyframes. */
(function(root){
  'use strict';
  var protocol='curvature-demos-v1';
  var frame,ready=false,started=false,selected='TransLine';
  var names=[];
  function el(id){return root.document.getElementById(id);}
  function status(message){var node=el('ModernDemoStatus');if(node)node.textContent=message;}
  function enable(available){
    ['ModernDemoPlay','ModernDemoPrev','ModernDemoNext','ModernDemoReset'].forEach(function(id){
      var node=el(id);if(node)node.disabled=!available;
    });
  }
  function send(command,name){
    if(frame&&ready&&frame.contentWindow)
      frame.contentWindow.postMessage({protocol:protocol,type:'command',command:command,
        ...(name?{name:name}:{})},root.location.origin==='null'?'*':root.location.origin);
  }
  function trusted(event){
    return frame&&event.source===frame.contentWindow&&
      (root.location.origin==='null'||event.origin===root.location.origin)&&
      event.data&&event.data.protocol===protocol;
  }
  function onCatalog(data){
    if(!Array.isArray(data.names))return;
    var seen=Object.create(null);
    var available=data.names.filter(function(name){
      if(typeof name!=='string'||!name||name.length>64||seen[name])return false;
      seen[name]=true;return true;
    });
    if(!available.length||available.length>32||available.indexOf('TransLine')<0)return;
    names=available;
    var picker=el('ModernDemoSelect');
    if(!picker)return;
    while(picker.firstChild)picker.removeChild(picker.firstChild);
    names.forEach(function(name){
      var option=root.document.createElement('option');
      option.value=name;option.textContent=name==='TransLine'?'TrnsmLine':name;
      picker.appendChild(option);
    });
    picker.value=selected;
    picker.disabled=false;
  }
  function onState(data){
    if(typeof data.demo!=='string'||data.demo!==selected||
       !Number.isInteger(data.position)||!Number.isInteger(data.total)||
       data.total<=0||data.position<0||data.position>=data.total)return;
    ready=true;
    enable(true);
    var picker=el('ModernDemoSelect');if(picker&&names.length)picker.value=selected;
    var heading=el('ModernDemoTitle');if(heading)heading.textContent='Demos · '+(selected==='TransLine'?'Transmission Line':selected);
    var play=el('ModernDemoPlay');if(play)play.textContent=data.playing?'Pause':'Play';
    var count=el('ModernDemoProgress');
    if(count)count.textContent='Step '+(data.position+1)+' / '+data.total;
    status(data.playing?'Playing original Legacy animation.':'Ready · Original Legacy renderer.');
  }
  function onMessage(event){
    if(!trusted(event))return;
    var data=event.data;
    if(data.type==='catalog')onCatalog(data);
    else if(data.type==='state')onState(data);
  }
  function changeDemo(name){
    if(names.indexOf(name)<0||name===selected||!ready)return;
    selected=name;
    enable(false);
    var heading=el('ModernDemoTitle');if(heading)heading.textContent='Demos · '+(name==='TransLine'?'Transmission Line':name);
    var count=el('ModernDemoProgress');if(count)count.textContent='Loading first step…';
    status('Switching to '+name+'…');
    send('select',name);
  }
  function init(){
    frame=el('ModernDemoFrame');if(!frame)return;
    root.addEventListener('message',onMessage);
    [['ModernDemoPlay','play'],['ModernDemoPrev','previous'],
      ['ModernDemoNext','next'],['ModernDemoReset','reset']].forEach(function(pair){
      var node=el(pair[0]);if(node)node.addEventListener('click',function(){send(pair[1]);});
    });
    var picker=el('ModernDemoSelect');
    if(picker){picker.disabled=true;picker.addEventListener('change',function(){changeDemo(picker.value);});}
    enable(false);
  }
  function activate(){
    if(!frame)return;
    if(!started){
      started=true;
      status('Loading isolated Legacy demonstration engine…');
      frame.src='CurvatureDemosHost.html?embed=demos';
    }else if(ready)send('status');
  }
  function deactivate(){send('pause');}
  root.CurvatureModernDemos={init:init,activate:activate,deactivate:deactivate};
}(window));
