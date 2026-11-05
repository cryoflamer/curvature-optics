/* Owns Legacy model refresh sequencing for one app instance. Browser UI,
 * Canvas and Physical scheduling remain behind injected ports; no CurveApp,
 * graph, Demos, ControlPanels, window or document globals are read here.
 * The classic UpdateAll function remains a compatibility entrypoint. */
(function(root){
  'use strict';
  var required=['getModel','resetDemos','showInfo','syncOptics','updatePanels',
    'syncCurvature','isPhysical','queueHeightChange','cancelHeightChange',
    'scheduleFinalFrame','redraw','refreshOptics'];
  function create(ports){
    if(!ports||required.some(function(name){return typeof ports[name]!=='function';}))
      throw new TypeError('Legacy update coordinator requires explicit refresh ports');
    var running=false,previousHeight=null;
    return {
      update:function(stopAnimation){
        if(running)return false;
        running=true;
        try{
          var model=ports.getModel();
          if(!model||typeof model.Update!=='function')
            throw new TypeError('Legacy update coordinator requires an updatable model');
          // Preserve xDefBool(..., true): non-boolean arguments use the default.
          stopAnimation=typeof stopAnimation==='boolean'?stopAnimation:true;
          if(stopAnimation){
            ports.resetDemos();
            model.DemoText='';
            model.Description='';
            ports.showInfo();
          }
          model.Update();
          ports.syncOptics();
          ports.updatePanels();
          ports.syncCurvature();
          var changedHeight=previousHeight!==null&&model.Height!==previousHeight;
          previousHeight=model.Height;
          var heightPending=changedHeight&&ports.isPhysical()&&ports.queueHeightChange();
          if(!heightPending){
            ports.cancelHeightChange();
            ports.scheduleFinalFrame();
            ports.redraw();
          }
          ports.refreshOptics();
          return true;
        }finally{running=false;}
      }
    };
  }
  root.CurvatureLegacyUpdateCoordinator={create:create};
}(typeof window==='undefined'?globalThis:window));
