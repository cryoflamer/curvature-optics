'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const library=require('../src/ui/modern/ModernExperimentLibrary');
const codec=require('../src/ui/modern/ModernExperimentState');
const compare=require('../src/ui/modern/ModernCompareState');
function experiment(){
  const m={Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,viewcenterHorizon:3,
    deviceRatio:1.5,showModel:1,rEarth:6371000,showGrid:1,DemoText:'Test',Description:'Optics',
    ObjType:[3,3],NObjects:[85,2],ObjDist:[50,25550],ObjDeltaDist:[297.55,373],
    ObjSideType:[0,0],ObjSidePos:[35,25.4],ObjSideVar:[0,0],ObjSizeType:[0,0],
    ObjSize:[23,64],ObjSizeVar:[0,0]};
  return codec.capture(m,{atmosphere:'standard',occlusionRadius:6371000,
    preset:'pontchartrain',resetPreset:'pontchartrain'},compare.preset('flat-inverse'),
    {mode:'compare',eyeLevel:true,horizon:true,selected:'B'});
}
function storage(){const map=new Map();return {getItem:k=>map.has(k)?map.get(k):null,
  setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
test('134.1: named records use the identical validated experiment schema',()=>{
  const s=storage(),e=experiment();
  library.save(s,'Lake test',e);
  assert.deepEqual(library.read(s),[{name:'Lake test',experiment:e}]);
  const next=structuredClone(e);next.compare.B.radiusKm=7000;
  library.save(s,'Lake test',next);
  assert.equal(library.read(s).length,1);
  assert.equal(library.read(s)[0].experiment.compare.B.radiusKm,7000);
  assert.deepEqual(library.remove(s,'Lake test'),[]);
});
test('134.1: JSON export/import and URL codec preserve the same model state',()=>{
  const e=experiment();
  assert.deepEqual(library.importJson(library.exportJson(e)),codec.decode(codec.encode(e)));
  assert.throws(()=>library.importJson('{'),SyntaxError);
  assert.throws(()=>library.importJson(JSON.stringify({...e,version:999})),/version/);
  assert.throws(()=>library.importJson('x'.repeat(200001)),/large/);
});
test('134.1: invalid names, duplicate records, corrupt storage and overlong lists are rejected',()=>{
  const s=storage(),e=experiment();
  assert.throws(()=>library.save(s,'   ',e),/name/);
  assert.throws(()=>library.save(s,'bad\nname',e),/name/);
  library.save(s,'Demo',e);
  library.save(s,'demo',e);
  assert.equal(library.read(s).length,1);
  assert.throws(()=>library.remove(s,'missing'),/not found/);
  s.setItem(library.KEY,'not-json');
  assert.throws(()=>library.read(s),SyntaxError);
  assert.throws(()=>library.write(storage(),Array.from({length:51},(_,i)=>({name:'Name'+i,experiment:e}))),/library/);
});
test('134.1: no implicit writes to the autosaved Modern experiment key',()=>{
  const s=storage();library.save(s,'Demo',experiment());
  assert.equal(s.getItem(codec.STORAGE_KEY),null);
});
