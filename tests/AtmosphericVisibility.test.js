'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const visibility=require('../src/renderers/CurvatureAtmosphericVisibility');
const scene=require('../src/ui/modern/ModernSceneState');
const compare=require('../src/ui/modern/ModernCompareState');
const experiments=require('../src/ui/modern/ModernExperimentState');
const compose=require('../src/scene/CurvatureIndependentComposition');
const optics=require('../src/optics/CurvaturePhysicalSceneOptics');
const bench=require('../tools/benchmark-adaptive-prism-112');

function opticalPair(surface){
  const m=bench.model(2,surface);
  const source=compose.composeOpticalMain(m,surface==='globe');
  const session=optics.create();
  const result=session.transform(source,m,{atmosphere:'vacuum'});
  return {m,source,session,result};
}
function styled(composition){return composition.scene.primitives.filter(p=>
  p.metadata?.kind==='physical-object-stroke'||p.metadata?.kind==='physical-object-fill');}

test('Atmospheric visibility uses 5%-contrast range and does not reinterpret refraction',()=>{
  assert.deepEqual(visibility.validate(),{enabled:false,rangeKm:60});
  for(const bad of [{enabled:1,rangeKm:60},{enabled:true,rangeKm:0},
    {enabled:true,rangeKm:Infinity},{enabled:true,rangeKm:60,opaque:true},
    {enabled:true,rangeKm:'60'}])assert.throws(()=>visibility.validate(bad));
  assert.equal(visibility.blend('black',0,30),'#000000');
  assert.equal(visibility.blend('black',30000,30),'#f2f2f2');
  assert.equal(visibility.blend('#a38d60',0,30),'#a38d60');
  assert.equal(visibility.blend('blue',30000,30),'blue','unknown colors are not guessed');
  assert.equal(visibility.blend('#000',0,30),'#000000');
});

test('Globe and Flat Physical visuals fade by authored object distance, not horizon status',()=>{
  for(const surface of ['globe','flat']){
    const {m,source,session,result}=opticalPair(surface);
    const base=result.composition;
    const disabled=visibility.apply(base,source,result.stats,{enabled:false,rangeKm:30});
    assert.strictEqual(disabled,base);
    const changed=visibility.apply(base,source,result.stats,{enabled:true,rangeKm:30});
    assert.notStrictEqual(changed,base);
    assert.deepEqual(changed.ranges,base.ranges);
    assert.deepEqual(changed.scene.primitives.map(p=>p.points),base.scene.primitives.map(p=>p.points),
      'ray arrival coordinates must not change');
    const before=styled(base),after=styled(changed);
    assert.equal(before.length,after.length);
    assert.ok(after.some((p,i)=>p.style.stroke!==before[i].style.stroke||
      p.style.fill!==before[i].style.fill),'some visible tower styles must fade');
    assert.ok(base.scene.primitives.some(p=>p.metadata?.kind==='physical-object-stroke'&&
      p.style.stroke==='black'),'original optical cache remains unmodified');
    for(let i=0;i<base.scene.primitives.length;i++){
      const p=base.scene.primitives[i],q=changed.scene.primitives[i];
      if(p.metadata?.kind!=='physical-object-stroke'&&p.metadata?.kind!=='physical-object-fill')
        assert.strictEqual(q,p,'guides and other layers must not be recolored');
    }
    const repeat=session.transform(source,m,{atmosphere:'vacuum'});
    assert.equal(repeat.reused,true,'haze changes must not trigger new optical rays');
    assert.strictEqual(repeat.composition,base);
    const clear=visibility.apply(base,source,result.stats,{enabled:true,rangeKm:500});
    const dark=visibility.apply(base,source,result.stats,{enabled:true,rangeKm:1});
    const firstStroke=c=>c.scene.primitives.find(p=>p.metadata?.kind==='physical-object-stroke');
    const distanceToWhite=c=>parseInt(firstStroke(c).style.stroke.slice(1,3),16);
    assert.ok(distanceToWhite(dark)>distanceToWhite(clear), 'shorter visibility means less contrast');
  }
});

test('Visibility settings are independent across Compare models and old links default to OFF',()=>{
  const model={showModel:1,rEarth:6371000};
  const initial=compare.initial(model,'standard',6371000);
  assert.notStrictEqual(initial.A.visibility,initial.B.visibility);
  assert.equal(initial.A.visibility.enabled,false);
  assert.equal(initial.B.visibility.enabled,false);
  const next=compare.update(initial,'B','visibility',{enabled:true,rangeKm:15});
  assert.deepEqual(next.B.visibility,{enabled:true,rangeKm:15});
  assert.deepEqual(initial.B.visibility,{enabled:false,rangeKm:60});
  assert.deepEqual(next.A.visibility,{enabled:false,rangeKm:60});
  assert.throws(()=>compare.update(initial,'A','visibility',{enabled:true,rangeKm:-1}));
  assert.deepEqual(experiments.validate({version:1,
    scene:{camera:{Height:15,FocalLengthField:2000,Pan:0,Nick:0,Roll:0,viewcenterHorizon:3,deviceRatio:1.5},
      objects:Object.fromEntries(experiments.OBJECT.map(key=>[key, key==='NObjects'?[2,0]: key==='ObjType'?[3,3]: key==='ObjDeltaDist'?[300,300]:key==='ObjSize'?[20,20]:[0,0]])),
      surface:{showModel:1,rEarth:6371000},atmosphere:'standard',occlusionRadius:6371000,
      showGrid:true,preset:'custom',resetPreset:'pontchartrain',title:'',description:''},
    compare:{A:{surface:'globe',radiusKm:6371,atmosphere:'standard',occlusionRadius:6371000},
      B:{surface:'flat',radiusKm:6371,atmosphere:'vacuum',occlusionRadius:6371000},
      preset:'custom',selected:'A'},display:{mode:'scene',eyeLevel:false,horizon:true}}
  ).scene.visibility,{enabled:false,rangeKm:60});
});
