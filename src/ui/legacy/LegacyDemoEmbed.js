/* Legacy Demos control boundary. The controller works with an injected manager
 * and callbacks; only the transport below knows about iframes/postMessage.
 * Standalone Legacy never installs the embedded message transport. */
(function(root){
  'use strict';
  function createController(ports){
    if(!ports||typeof ports.getDemos!=='function'||
       typeof ports.publish!=='function'||typeof ports.catalog!=='function')
      throw new TypeError('Legacy Demos controller requires manager and output ports');
    var manager=null,update=null,closed=false;
    function current(){return ports.getDemos();}
    function report(){
      var demos=current();
      if(closed||!demos||!demos.CurrDemo)return null;
      var state={demo:demos.CurrDemo.Name,position:demos.GetCurrPos(),
        total:demos.GetNStates(),playing:demos.IsPlaying()};
      ports.publish(state);
      return state;
    }
    function start(initial){
      if(closed||manager)return false;
      var demos=current();
      if(!demos||typeof demos.Find!=='function'||demos.Find(initial)<0||
         typeof demos.UpdateDemoPanels!=='function')return false;
      manager=demos;
      update=demos.UpdateDemoPanels;
      demos.UpdateDemoPanels=function(){
        var result=update.apply(this,arguments);
        report();
        return result;
      };
      ports.catalog(demos.DemoList.map(function(item){return item.Name;}));
      demos.SetDemo(initial,false,0);
      report();
      return true;
    }
    function command(action,name){
      var demos=current();
      if(closed||!manager||demos!==manager||!demos.CurrDemo)return false;
      if(action==='select'){
        if(typeof name!=='string'||demos.Find(name)<0)return false;
        // SetDemo stops existing playback before installing the next key state.
        demos.SetDemo(name,false,0);
      }else{
        switch(action){
          case 'play':
            if(demos.IsPlaying())demos.Stop();
            else demos.Play();
            break;
          case 'previous':demos.Prev(false,false);break;
          case 'next':demos.Next(false,false);break;
          case 'reset':demos.SetDemo(demos.CurrDemo.Name,false,0);break;
          case 'pause':demos.Stop();break;
          case 'status':
            if(typeof ports.redraw==='function')ports.redraw();
            break;
          default:return false;
        }
      }
      report();
      return true;
    }
    function dispose(){
      if(closed)return;
      closed=true;
      if(manager){
        manager.Stop();
        manager.UpdateDemoPanels=update;
        manager=null;
      }
    }
    return {start:start,command:command,report:report,dispose:dispose};
  }
  // Usable without location, document, a parent window, or any browser events.
  // A future direct Modern runtime can supply its own manager and observers.
  root.CurvatureLegacyDemosController={create:createController};

  if(!root.location||new URLSearchParams(root.location.search).get('embed')!=='demos'||
     root.parent===root)return;
  root.document.documentElement.classList.add('legacy-demo-embed');
  var protocol='curvature-demos-v1';
  // Modern's dedicated host uses a synchronous, same-origin instance port.
  // The original CurvatureApp.html?embed=demos retains postMessage support.
  var directHost=!!(root.document&&root.document.documentElement&&
    typeof root.document.documentElement.hasAttribute==='function'&&
    root.document.documentElement.hasAttribute('data-direct-demos-host'));
  var observers=[],catalogSnapshot=null,stateSnapshot=null,disposed=false;
  function notify(type,data){
    if(disposed)return;
    var snapshot=Object.assign({type:type},data);
    if(type==='catalog')catalogSnapshot=snapshot;
    if(type==='state')stateSnapshot=snapshot;
    observers.slice().forEach(function(observer){
      try{observer(snapshot);}catch(error){
        // Presentation exceptions must not interrupt an authored animation.
        if(root.console&&root.console.error)root.console.error(error);
      }
    });
    if(!directHost)post(type,data);
  }
  var controller=createController({
    getDemos:function(){return root.Demos;},
    publish:function(data){notify('state',data);},
    catalog:function(names){notify('catalog',{names:names});},
    redraw:function(){
      if(root.legacyAppContext)return root.legacyAppContext.redraw();
      // Older embedded Legacy pages do not have an instance context.
      if(root.graph)root.graph.Redraw();
    }
  });
  // No global Legacy model, Canvas or manager escapes through this API.
  // The subscription replays the catalog and latest state for late binders.
  root.CurvatureLegacyDemosRuntime={
    subscribe:function(observer){
      if(disposed||typeof observer!=='function')throw new TypeError('An active Demos observer is required');
      observers.push(observer);
      if(catalogSnapshot)observer(catalogSnapshot);
      if(stateSnapshot)observer(stateSnapshot);
      return function(){
        var index=observers.indexOf(observer);
        if(index>=0)observers.splice(index,1);
      };
    },
    command:function(action,name){return controller.command(action,name);}
  };
  function origin(){return root.location.origin==='null'?'*':root.location.origin;}
  function post(type,data){
    root.parent.postMessage(Object.assign({protocol:protocol,type:type},data),origin());
  }
  if(!directHost)root.addEventListener('message',function(event){
    if(event.source!==root.parent||
       (root.location.origin!=='null'&&event.origin!==root.location.origin)||
       !event.data||event.data.protocol!==protocol||event.data.type!=='command')return;
    controller.command(event.data.command,event.data.name);
  });
  root.addEventListener('load',function(){
    // Demos are registered by original Legacy load callbacks before this turn.
    root.setTimeout(function(){controller.start('TransLine');},0);
  });
  root.addEventListener('pagehide',function(){
    disposed=true;
    observers.length=0;
    controller.dispose();
  });
}(window));
