'use strict';
const assert=require('node:assert/strict');
const adapter=require('./LegacySceneAdapter');
const frameApi=require('./SceneFrame');
const preflight=require('./LegacyReplayProbe');
const events=[];
function graph(){return {
  SelectTrans(x){events.push(['select',x]);},
  SetCamera(p){events.push(['camera',p.CamPos[0]]);},
  TransMove3D(x,y,z){events.push(['move',x,y,z]);},
  Text(t,x,y){events.push(['text',t,x,y]);}
};}
const cam={CamPos:[1,2,3]};
const trace=adapter.record(graph(),g=>{
  g.SetCamera(cam);g.TransMove3D(1,2,3);
  g.SelectTrans('viewport');g.Text('title',4,5);g.SelectTrans('world');
});
const original=events.splice(0);
const frame=frameApi.fromTrace(trace);
cam.CamPos[0]=999;
trace.commands[0].args[0].CamPos[0]=888;
assert.equal(frame.commands[0].args[0].CamPos[0],1);
assert.equal(frame.kind,'scene-command-frame');
assert.deepEqual(frame.commands.map(c=>c.method),['SetCamera','TransMove3D','SelectTrans','Text','SelectTrans']);
const restored=JSON.parse(JSON.stringify(frame));
frameApi.replay(graph(),restored);
assert.deepEqual(events,original);
assert.equal(preflight.preflight(restored).ok,true);
assert.equal(frameApi.toTrace(restored).complete,true);
assert.throws(()=>frameApi.fromTrace({...trace,complete:false}),/Complete/);
assert.throws(()=>frameApi.fromTrace({...trace,unsupported:[{method:'Text'}]}),/Complete/);
assert.throws(()=>frameApi.toTrace({...restored,commands:[{method:'evil',args:[]}]}),/Unsupported/);
assert.throws(()=>frameApi.toTrace({...restored,commands:[{method:'Text',args:[()=>0]}]}),/Non-serializable/);
console.log('SceneFrame: passed');
