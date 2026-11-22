'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const picker=require('../src/ui/modern/ModernImagePicker');

const sample=[
  {key:JSON.stringify(['library','same']),source:'library',title:'Bridge photo',width:640,height:480,
    author:'Observer',thumbnail:{dataUrl:'data:image/png;base64,YQ=='},links:['Animation / first frame']},
  {key:JSON.stringify(['demo','soundly','same']),source:'demo',title:'Bridge demo',width:600,height:400,
    license:'Demo permission unknown',kind:'unclassified'},
  {key:JSON.stringify(['library','diagram']),source:'library',title:'Optical diagram',width:1000,height:500,
    kind:'diagram',author:'Researcher'}
];

test('picker keeps local and built-in IDs distinct and never copies original bytes',()=>{
  const data=structuredClone(sample),result=picker.checkedChoices(data);
  assert.equal(new Set(result.map(r=>r.key)).size,3);
  assert.equal(result[0].kind,'unclassified');
  assert.equal(result[0].thumbnail,'data:image/png;base64,YQ==');
  assert.equal(result[0].original,undefined);
  assert.notEqual(result[0].key,result[1].key);
  result[0].links.push('New use');
  assert.deepEqual(sample,data,'caller choices and their link lists remain untouched');
});

test('picker search, source/kind filtering and sorting preserve selection keys',()=>{
  const choices=picker.checkedChoices(sample);
  assert.deepEqual(picker.visible(choices,{source:'demo'}).map(x=>x.title),['Bridge demo']);
  assert.deepEqual(picker.visible(choices,{kind:'diagram'}).map(x=>x.title),['Optical diagram']);
  assert.deepEqual(picker.visible(choices,{query:'observer'}).map(x=>x.title),['Bridge photo']);
  assert.deepEqual(picker.visible(choices,{query:'animation / first'}).map(x=>x.title),['Bridge photo']);
  assert.deepEqual(picker.visible(choices,{query:'bridge',source:'library'}).map(x=>x.title),['Bridge photo']);
  assert.deepEqual(picker.visible(choices).map(x=>x.title),['Bridge demo','Bridge photo','Optical diagram']);
  const first=choices[0].key,second=choices[2].key;
  assert.deepEqual(picker.select([],first,'single',1),[first]);
  assert.deepEqual(picker.select([first],second,'single',1),[second]);
  assert.deepEqual(picker.select([first],second,'multiple',2),[first,second]);
  assert.deepEqual(picker.select([first,second],first,'multiple',2),[second]);
  assert.deepEqual(picker.select([first,second],'third','multiple',2),[first,second]);
});

test('picker rejects duplicate alias keys, unsupported namespaces and unbounded selections',()=>{
  for(const choices of [[sample[0],sample[0]],
    [{...sample[0],source:'foreign'}],
    [{...sample[0],kind:'source-photo'}],
    [{...sample[0],width:0}],
    Array.from({length:301},(_,i)=>({...sample[0],key:'many-'+i}))]){
    assert.throws(()=>picker.checkedChoices(choices),/Invalid|Unsupported|Too many/);
  }
  assert.throws(()=>picker.select([],sample[0].key,'automatic',3),/mode/);
  assert.throws(()=>picker.select([],sample[0].key,'multiple',101),/limit/);
});

function mockDocument(){
  let count=0,focused=null;
  const elements=[];
  function node(tag){
    const e={tagName:tag,children:[],listeners:{},attributes:{},
      parentNode:null,value:'',open:false,disabled:false,isConnected:true,className:'',
      get textContent(){return this._text||'';},
      set textContent(value){this._text=value;this.children=[];},
      appendChild(child){this.children.push(child);child.parentNode=this;
        if(this.tagName==='select'&&this.children.length===1)this.value=child.value;
        return child;},
      replaceChildren(...items){this.children=[];items.forEach(e=>this.appendChild(e));},
      addEventListener(type,fn){this.listeners[type]=fn;},
      setAttribute(k,v){this.attributes[k]=v;},
      getAttribute(k){return this.attributes[k];},
      focus(){focused=this;},
      showModal(){this.open=true;},
      close(){this.open=false;},
      remove(){this.isConnected=false;this.parentNode.children=
        this.parentNode.children.filter(item=>item!==this);}};
    elements.push(e);return e;
  }
  const body=node('body'),origin=node('button');
  return {document:{body,activeElement:origin,createElement:node},
    find:(pred)=>elements.filter(pred),focused:()=>focused,origin};
}

test('opening and cancelling a shared picker does not invoke the owning editor',async()=>{
  const fake=mockDocument(),events=[];
  const view=picker.open({document:fake.document,choices:sample,mode:'single',
    onApply:()=>events.push('save')});
  const button=fake.find(e=>e.className==='modern-image-picker-choice')[0];
  assert.ok(button);button.listeners.click();
  assert.equal(events.length,0);
  assert.equal(fake.find(e=>e.className==='modern-image-picker-choice')
    .some(x=>x.attributes['aria-pressed']==='true'),true);
  const cancel=fake.find(e=>e.tagName==='button'&&e.textContent==='Cancel')[0];
  cancel.listeners.click();
  assert.equal(view.dialog.isConnected,false);
  assert.equal(events.length,0);
  assert.equal(fake.focused(),fake.origin);
});

test('confirmation passes namespaced keys once, and failures keep picker open',async()=>{
  const fake=mockDocument(),received=[];
  let reject=true;
  const view=picker.open({document:fake.document,choices:sample,mode:'multiple',max:2,
    onApply:async keys=>{received.push(keys);if(reject)throw Error('Missing original');}});
  fake.find(e=>e.className==='modern-image-picker-choice')[0].listeners.click();
  const apply=fake.find(e=>e.tagName==='button'&&e.textContent==='Use selected')[0];
  await apply.listeners.click();
  assert.equal(view.dialog.isConnected,true);
  assert.match(fake.find(e=>e.className==='modern-image-picker-status')[0].textContent,/Missing original/);
  reject=false;
  await apply.listeners.click();
  assert.equal(view.dialog.isConnected,false);
  assert.deepEqual(received,[received[0],received[0]]);
  assert.equal(received[0].length,1);
});

test('classification tags and collections are searched without changing source IDs',()=>{
  const original=structuredClone(sample[0]);
  original.kind='diagram';original.tags=['bridge','atmosphere'];original.collections=['Research'];
  const normalized=picker.checkedChoices([original]);
  assert.deepEqual(picker.visible(normalized,{query:'atmosphere'}).map(x=>x.key),[original.key]);
  assert.deepEqual(picker.visible(normalized,{query:'research'}).map(x=>x.key),[original.key]);
  assert.deepEqual(picker.visible(normalized,{kind:'diagram'}).map(x=>x.key),[original.key]);
  assert.deepEqual(picker.visible(normalized,{kind:'photograph'}),[]);
  assert.equal(normalized[0].source,'library');
  assert.deepEqual(sample[0].tags,undefined);
});
