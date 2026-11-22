/* Reusable read-only image browser. The caller alone owns the eventual attach
 * or photo replacement; opening, browsing and Cancel never persist anything.
 */
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernImagePicker=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var kinds=['unclassified','photograph','diagram','map','graph','render','screenshot','illustration','other'];
  function checkedChoices(input){
    if(!Array.isArray(input)||input.length>300)throw RangeError('Too many image picker choices');
    var keys=new Set();
    return input.map(function(item){
      if(!item||typeof item.key!=='string'||!item.key||keys.has(item.key)||
        !['library','demo'].includes(item.source)||typeof item.title!=='string'||
        !item.title.trim()||!Number.isSafeInteger(item.width)||item.width<1||
        !Number.isSafeInteger(item.height)||item.height<1)
        throw RangeError('Invalid or duplicate image picker choice');
      keys.add(item.key);
      var kind=item.kind||'unclassified';
      if(!kinds.includes(kind))throw RangeError('Unsupported image classification');
      return {key:item.key,source:item.source,kind:kind,title:item.title,
        width:item.width,height:item.height,author:item.author||'',
        license:item.license||'',links:Array.isArray(item.links)?item.links.slice(0,100):[],
        tags:Array.isArray(item.tags)?item.tags.slice(0,20):[],
        collections:Array.isArray(item.collections)?item.collections.slice(0,12):[],
        thumbnail:item.thumbnail&&item.thumbnail.dataUrl||null};
    });
  }
  function visible(items,{query='',source='all',kind='all',sort='title'}={}){
    var needle=String(query).trim().toLocaleLowerCase();
    return items.filter(function(item){
      return (source==='all'||source===item.source)&&(kind==='all'||kind===item.kind)&&
        (!needle||[item.title,item.author,item.license,item.source,item.kind].concat(item.links,item.tags,item.collections)
          .some(function(v){return String(v).toLocaleLowerCase().includes(needle);}));
    }).sort(function(a,b){
      return sort==='source'?
        a.source.localeCompare(b.source)||a.title.localeCompare(b.title)||a.key.localeCompare(b.key):
        a.title.localeCompare(b.title)||a.source.localeCompare(b.source)||a.key.localeCompare(b.key);
    });
  }
  function select(keys,key,mode,max){
    if(mode!=='single'&&mode!=='multiple')throw RangeError('Invalid image picker mode');
    if(!Number.isSafeInteger(max)||max<1||max>100)throw RangeError('Invalid image picker selection limit');
    var picked=keys.slice(),i=picked.indexOf(key);
    if(i>=0)picked.splice(i,1);
    else if(mode==='single')picked=[key];
    else if(picked.length<max)picked.push(key);
    return picked;
  }
  function open(options){
    var doc=options&&options.document,mode=options&&options.mode||'single',
      max=mode==='single'?1:options.max||100;
    if(!doc||!doc.body||typeof options.onApply!=='function')
      throw Error('Image picker needs a document and an apply callback');
    var items=checkedChoices(options.choices||[]);
    if(mode!=='single'&&mode!=='multiple')throw RangeError('Invalid image picker mode');
    if(!Number.isSafeInteger(max)||max<1||max>100)throw RangeError('Invalid image picker limit');
    var selected=[],closed=false,busy=false,origin=doc.activeElement;
    var dialog=doc.createElement('dialog');dialog.className='modern-image-picker';
    dialog.setAttribute('aria-label',options.title||'Select images');
    function el(tag,cls,label,parent){
      var node=doc.createElement(tag);if(cls)node.className=cls;
      if(label!==undefined)node.textContent=label;
      if(parent)parent.appendChild(node);return node;
    }
    function button(label,parent,action){
      var node=el('button','',label,parent);node.type='button';
      node.addEventListener('click',action);return node;
    }
    var heading=el('h2','','',dialog);
    heading.textContent=options.title||'Select images';
    el('p','modern-image-picker-hint','Selection only · no image is copied or attached until confirmed.',dialog);
    var toolbar=el('div','modern-image-picker-toolbar',undefined,dialog);
    function control(label,tag){
      var wrapper=el('label','',undefined,toolbar);
      el('span','',label,wrapper);
      var input=el(tag,'',undefined,wrapper);
      input.setAttribute('aria-label',label);
      return input;
    }
    var search=control('Search images','input');search.type='search';search.placeholder='Title, author or usage';
    var source=control('Source','select'),kind=control('Kind','select'),sort=control('Sort','select');
    function optionsFor(select,rows){rows.forEach(function(row){
      var option=el('option','',row[1],select);option.value=row[0];
    });}
    optionsFor(source,[['all','All sources'],['library','Local library'],['demo','Built-in demos']]);
    optionsFor(kind,[['all','All kinds'],...kinds.map(function(k){return [k,k==='unclassified'?'Unclassified (legacy)':k];})]);
    optionsFor(sort,[['title','Title'],['source','Source']]);
    source.value='all';kind.value='all';sort.value='title';
    var columns=el('div','modern-image-picker-columns',undefined,dialog),
      gallery=el('div','modern-image-picker-gallery',undefined,columns);
    gallery.setAttribute('role','group');gallery.setAttribute('aria-label','Available images');
    var inspector=el('aside','modern-image-picker-inspector',undefined,columns);
    inspector.setAttribute('aria-label','Image details');
    var status=el('p','modern-image-picker-status','Choose an image.',dialog);
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    var footer=el('div','modern-image-picker-footer',undefined,dialog);
    var cancel=button('Cancel',footer,function(){finish();});
    var apply=button(options.applyLabel||'Use selected',footer,applySelection);
    function details(item){
      inspector.replaceChildren();
      if(!item){el('p','','Select an image to inspect its metadata.',inspector);return;}
      el('strong','',item.title,inspector);
      el('p','',item.width+' × '+item.height+' px · '+(item.source==='demo'?'Built-in demo':'Local library'),inspector);
      el('p','','Kind: '+(item.kind==='unclassified'?'Unclassified (legacy)':item.kind),inspector);
      if(item.author)el('p','','Author: '+item.author,inspector);
      if(item.license)el('p','','License: '+item.license,inspector);
      if(item.tags.length)el('p','','Tags: '+item.tags.join(', '),inspector);
      if(item.collections.length)el('p','','Collections: '+item.collections.join(', '),inspector);
      if(item.links.length)el('p','','Known animation references: '+item.links.slice(0,8).join('; '),inspector);
      else el('p','','No use asserted by this picker; full usage audit is a separate feature.',inspector);
    }
    function paint(){
      var filtered=visible(items,{query:search.value,source:source.value,kind:kind.value,sort:sort.value});
      gallery.replaceChildren();
      filtered.forEach(function(item){
        var card=button('',gallery,function(){
          if(busy)return;
          selected=select(selected,item.key,mode,max);paint();
        });
        card.className='modern-image-picker-choice';
        card.setAttribute('aria-label','Select image '+item.title+' ('+(item.source==='demo'?'Built-in demo':'Local')+')');
        card.setAttribute('aria-pressed',String(selected.includes(item.key)));
        card.disabled=busy||(mode==='multiple'&&selected.length>=max&&!selected.includes(item.key));
        if(item.thumbnail){var img=el('img','',undefined,card);img.src=item.thumbnail;
          img.alt='';img.loading='lazy';}
        else el('span','modern-image-picker-placeholder','No thumbnail',card);
        el('span','modern-image-picker-choice-name',item.title,card);
        el('small','',item.source==='demo'?'Built-in demo':'Local original',card);
      });
      if(!filtered.length)el('p','modern-image-picker-empty',
        items.length?'No matching images.':'No images available.',gallery);
      details(items.find(function(item){return item.key===selected[selected.length-1];})||null);
      apply.disabled=busy||!selected.length;
      cancel.disabled=busy;
      status.textContent=busy?'Checking selected images…':
        selected.length+' selected · '+filtered.length+' visible of '+items.length+'.';
    }
    function finish(){
      if(closed||busy)return;
      closed=true;
      if(typeof dialog.close==='function'&&dialog.open)dialog.close();
      dialog.remove();
      if(origin&&origin.isConnected&&typeof origin.focus==='function')origin.focus({preventScroll:true});
    }
    async function applySelection(){
      if(busy||!selected.length)return;
      busy=true;paint();
      try{
        var current=selected.slice();
        if(current.some(function(key){return !items.some(function(item){return item.key===key;});}))
          throw Error('Selected image is no longer available');
        var result=await options.onApply(current);
        busy=false;
        if(result===false){paint();return;}
        finish();
      }catch(error){
        busy=false;paint();
        status.textContent='Cannot use selected image: '+(error.message||error);
      }
    }
    [search,source,kind,sort].forEach(function(control){
      control.addEventListener('input',paint);control.addEventListener('change',paint);
    });
    dialog.addEventListener('cancel',function(event){
      event.preventDefault();finish();
    });
    doc.body.appendChild(dialog);
    if(typeof dialog.showModal!=='function'){
      dialog.remove();throw Error('Accessible image picker dialog unavailable');
    }
    dialog.showModal();paint();search.focus();
    return {dialog:dialog,close:finish};
  }
  return Object.freeze({kinds:kinds.slice(),checkedChoices:checkedChoices,visible:visible,
    select:select,open:open});
}));