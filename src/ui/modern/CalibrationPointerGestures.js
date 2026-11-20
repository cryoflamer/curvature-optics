/* Shared pointer protocol for calibration viewports. Coordinates are CSS pixels. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CurvatureCalibrationPointerGestures=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const point=e=>[e.clientX,e.clientY],distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const background=()=>({kind:'background'});
  function markerAt(markers,p,scale=[1,1],radius=12){
    let best=null,d=Infinity;
    for(const m of markers){
      if(!m.pixel)continue;
      const n=distance([m.pixel[0]/scale[0],m.pixel[1]/scale[1]],[p[0]/scale[0],p[1]/scale[1]]);
      if(n<=radius&&(n<d||n===d&&m.kind==='draft'&&best?.kind!=='draft')){best=m;d=n;}
    }
    return best;
  }
  function create({threshold=5,doubleMs=400,doubleRadius=5}={}){
    let active=null,previous=null;
    const same=(a,b)=>a.kind===b.kind&&a.id===b.id&&(a.kind!=='background'||a.empty===b.empty)||a.kind==='background'&&a.empty!==true&&b.kind==='draft';
    function begin(e,target=background(),backgroundDrag='pan',markerDrag=true){
      if(active||![0,1,2].includes(e.button))return null;
      const p=point(e),action=e.button!==0||e.shiftKey?'pan':markerDrag&&target.kind!=='background'?'marker':backgroundDrag;
      active={id:e.pointerId,button:e.button,target:{kind:target.kind,id:target.id,...(target.empty===undefined?{}:{empty:!!target.empty})},action,start:p,last:p,moved:false,modified:!!e.shiftKey};
      return active;
    }
    function move(e){
      if(!active||active.id!==e.pointerId)return null;
      const p=point(e);
      if(!active.moved&&distance(p,active.start)<threshold)return null;
      active.moved=true;previous=null;
      const delta=[p[0]-active.last[0],p[1]-active.last[1]];active.last=p;
      return {...active,point:p,delta};
    }
    function finish(e,inside=true){
      if(!active||active.id!==e.pointerId)return null;
      const step=move(e),a=active,p=point(e);active=null;
      let kind='none';
      if(a.moved)kind=a.action==='marker'&&!inside?'cancel':'drag';
      else if(!inside)kind='cancel';
      else if(a.button===2)kind='context';
      else if(a.button===0&&!a.modified){
        const validTime=Number.isFinite(e.timeStamp),dt=validTime&&previous?e.timeStamp-previous.time:null;
        if(dt!==null&&dt>=0&&dt<=doubleMs&&distance(p,previous.point)<=doubleRadius&&same(previous.target,a.target)){
          kind='double-click';previous=null;
        }else{
          kind='click';previous=validTime?{time:e.timeStamp,point:p,target:a.target}:null;
        }
      }
      if(kind!=='click'&&kind!=='double-click')previous=null;
      return {...a,kind,point:p,inside,step};
    }
    function cancel(id){
      if(id!==undefined&&active?.id!==id)return null;
      const a=active;active=null;previous=null;
      return a?{...a,kind:'cancel',inside:false,point:a.last}:null;
    }
    return {get active(){return active;},begin,move,finish,cancel,clearClicks(){previous=null;}};
  }
  function mount(canvas,{enabled=()=>true,target=background,backgroundDrag=()=> 'pan',markerDrag=()=>true,
    onStart=()=>{},onHover=()=>{},onDrag=()=>{},onAction=()=>{},onEnd=()=>{},onLeave=()=>{}}={}){
    const g=create();
    function release(id){if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}
    function cancel(id){
      const a=g.cancel(id);if(!a)return;
      release(a.id);onEnd(a);
    }
    canvas.addEventListener('pointerdown',e=>{
      if(g.active||!enabled(e))return;
      const a=g.begin(e,target(point(e),e)||background(),backgroundDrag(e),markerDrag(e));if(!a)return;
      e.preventDefault();canvas.setPointerCapture(e.pointerId);onStart(a,e);
    });
    canvas.addEventListener('pointermove',e=>{
      if(!g.active){onHover(point(e),e);return;}
      const step=g.move(e);if(step)onDrag(step,e);
    });
    canvas.addEventListener('pointerup',e=>{
      const r=canvas.getBoundingClientRect(),p=point(e);
      const inside=p[0]>=r.left&&p[0]<r.left+r.width&&p[1]>=r.top&&p[1]<r.top+r.height;
      const a=g.finish(e,inside);if(!a)return;
      release(a.id);
      try{
        if(a.step&&(a.step.delta[0]||a.step.delta[1]))onDrag(a.step,e);
        if(a.kind!=='cancel'&&a.kind!=='none')onAction(a,e);
      }finally{onEnd(a,e);}
    });
    for(const name of ['pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>cancel(e.pointerId));
    canvas.addEventListener('pointerleave',e=>onLeave(e));
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('dblclick',e=>e.preventDefault());
    return {get active(){return g.active;},cancel,clearClicks:g.clearClicks};
  }
  return Object.freeze({create,mount,markerAt});
}));
