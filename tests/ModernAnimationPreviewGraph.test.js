'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../src/ui/modern/ModernAnimationPreviewGraph.js'),'utf8');

function bootstrap(side){
  const pending=new Set();
  const canceled=[];
  let timer=0,graph,requested;
  const win={};
  const context={
    window:win,
    document:{currentScript:{getAttribute(name){return name==='data-animation-side'?side:null;}}},
    setTimeout(fn){const id=++timer;pending.add(id);return id;},
    clearTimeout(id){pending.delete(id);canceled.push(id);}
  };
  win.NewGraphX3D=function(options){
    requested=options;
    // GraphX3DX starts its resize polling in the constructor. A canvas
    // cleared by this timer after a paused restore is blank until Play/Seek.
    graph={ResizeTimer:context.setTimeout(()=>{}),DrawTimer:null,DrawFunc:options.DrawFunc||null,
      CancelPendingDraws(){if(this.DrawTimer!==null)context.clearTimeout(this.DrawTimer);
        this.DrawTimer=null;this.DrawPending=0;},DrawPending:1};
    return graph;
  };
  vm.runInNewContext(source,context,{filename:'ModernAnimationPreviewGraph.js'});
  return {graph,requested,pending,canceled,registered:win.CurvatureModernAnimationGraphs};
}

test('independent A and B preview graphs never schedule a blank automatic draw',()=>{
  for(const side of ['A','B']){
    const h=bootstrap(side);
    assert.equal(h.requested.DrawFunc,undefined,
      'no empty DrawFunc: the automatic graph Draw() would clear physical pixels');
    assert.equal(h.graph.DrawFunc,null);
    assert.equal(h.graph.ResizeTimer,null,'disable the GraphX3DX polling resize timer');
    assert.equal(h.graph.DrawPending,0);
    assert.equal(h.pending.size,0,'no delayed timer may erase pixels after initial paint');
    assert.equal(h.canceled.length,1);
    assert.equal(h.registered[side],h.graph);
  }
});

test('invalid animation graph side still fails fast',()=>{
  assert.throws(()=>bootstrap('C'),/side A\/B required/);
});
