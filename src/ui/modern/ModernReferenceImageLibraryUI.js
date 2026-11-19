/* Independent Library panel. Explicit saves; no active project/physics changes. */
(function(root,factory){
  var api=factory(root.CurvatureModernReferenceImageLibrary,root.CurvatureModernReferenceImageImport,root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.CurvatureModernReferenceImageLibraryUI=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(library,importer,env){
  'use strict';
  var textFields=[['title','Title',200],['description','Description',4000],['author','Author',300],
    ['sourceUrl','Source URL',4096],['license','License',4000],['notes','Notes',4000]];
  var facts=[['cameraHeightM','Camera height (m)',true],['latitudeDeg','Latitude (°)',true],
    ['longitudeDeg','Longitude (°)',true],['headingDeg','Heading (°)',true],['pitchDeg','Pitch (°)',true],
    ['rollDeg','Roll (°)',true],['focalLengthMm','Focal length (mm)',true],
    ['equivalentFocalLengthMm','35 mm equivalent focal length (mm)',true],['horizontalFovDeg','Horizontal FOV (°)',true],
    ['verticalFovDeg','Vertical FOV (°)',true],['sensorWidthMm','Sensor width (mm)',true],['sensorHeightMm','Sensor height (mm)',true],
    ['cameraModel','Camera model'],['lensModel','Lens model'],['location','Location'],['heightDatum','Height datum'],
    ['framing','Framing / crop'],['captureDate','Capture date / time']];
  function metadataFact(status,value,uncertainty,notes,numeric){
    if(!status)return null;
    var fact={status:status};if(notes.trim())fact.notes=notes;
    if(status!=='unknown'){
      if(!value.trim())throw Error('Enter a value for each known camera fact');
      fact.value=numeric?Number(value):value;
      if(numeric&&uncertainty.trim())fact.uncertainty=Number(uncertainty);
    }return fact;
  }
  function mount(host,db){
    var doc=host.ownerDocument,busy=false,loaded=false,selected=null,dirty=false;
    function el(tag,text,parent){var node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(parent)parent.appendChild(node);return node;}
    function button(text,parent,action){var b=el('button',text,parent);b.type='button';b.addEventListener('click',action);return b;}
    function field(parent,label,tag){var wrap=el('label',undefined,parent);el('span',label,wrap);return el(tag||'input',undefined,wrap);}
    var body=el('div',undefined,host);body.className='modern-reference-body';
    el('p','Independent observations, stored locally in this browser. Keep external backups of your originals; project links and portable export are not yet available.',body);
    var toolbar=el('div',undefined,body);toolbar.className='modern-reference-toolbar';
    var file=field(toolbar,'Import photograph','input');file.type='file';file.accept='image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
    var refresh=button('Refresh',toolbar,function(){if(allowDiscard())run(async function(){await reload(selected&&selected.id);});});
    var status=el('p','Open to load observations.',body);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    var chooser=field(body,'Saved observations','select');
    var editor=el('form',undefined,body);editor.noValidate=true;editor.className='modern-reference-editor';editor.hidden=true;
    var preview=el('div',undefined,editor);preview.className='modern-reference-preview';
    var fields=el('div',undefined,editor);fields.className='modern-reference-fields';var inputs={};
    textFields.forEach(function(f){var control=field(fields,f[1],['description','notes'].includes(f[0])?'textarea':'input');
      control.maxLength=f[2];if(f[0]==='title')control.required=true;inputs[f[0]]=control;});
    var camera=el('details',undefined,editor);el('summary','Camera and observation metadata',camera);
    var factInputs={};facts.forEach(function(f){
      var row=el('fieldset',undefined,camera);row.className='modern-reference-fact';el('legend',f[1],row);
      var state=field(row,'Status','select');[['','Not recorded'],['unknown','Unknown'],['reported','Reported'],['measured','Measured'],['estimated','Estimated']].forEach(function(p){el('option',p[1],state).value=p[0];});
      var value=field(row,'Value','input');value.maxLength=1000;if(f[2]){value.type='number';value.step='any';}
      var uncertainty=f[2]?field(row,'Uncertainty (same units)','input'):null;if(uncertainty){uncertainty.type='number';uncertainty.min='0';uncertainty.step='any';}
      var notes=field(row,'Notes','input');notes.maxLength=2000;
      function sync(){var known=!!state.value&&state.value!=='unknown';value.disabled=!known;
        if(uncertainty)uncertainty.disabled=!known;notes.disabled=!state.value;}
      state.addEventListener('change',sync);factInputs[f[0]]={state:state,value:value,uncertainty:uncertainty,notes:notes,sync:sync};
    });
    var actions=el('div',undefined,editor);actions.className='modern-reference-toolbar';
    var save=el('button','Save details',actions);save.type='submit';
    var remove=button('Delete observation',actions,function(){
      if(!selected||!env.confirm('Permanently delete this local observation and original? Keep a backup first.'))return;
      run(async function(){await library.remove(db,selected.id,selected.revision);dirty=false;await reload(null);},'Observation deleted.');
    });
    function allowDiscard(){return !dirty||env.confirm('Discard unsaved observation metadata changes?');}
    function setBusy(value){busy=value;file.disabled=value;refresh.disabled=value;chooser.disabled=value;
      // Disable the fieldsets and editable controls while a transaction runs.
      editor.inert=value;save.disabled=value;remove.disabled=value;}
    async function run(action,message){if(busy)return;setBusy(true);status.textContent='Working…';
      try{await action();status.textContent=message||'Reference Image Library ready.';}
      catch(error){status.textContent='Reference Image Library: '+(error&&error.message||error);}
      finally{setBusy(false);}}
    function fill(row){selected=row;dirty=false;editor.hidden=!row;preview.replaceChildren();
      if(!row)return;
      var r=row.record;var image=el('img',undefined,preview);image.src=(r.thumbnail||r.original).dataUrl;image.alt=r.title;
      el('p',r.original.width+' × '+r.original.height+' pixels · '+r.id,preview);
      var link=el('a','Download original',preview);link.href=r.original.dataUrl;
      link.download=r.id+'.'+r.original.dataUrl.split('/')[1].split(';')[0].replace('jpeg','jpg');
      textFields.forEach(function(f){inputs[f[0]].value=r[f[0]]||'';});
      facts.forEach(function(f){var v=(r.cameraMetadata||{})[f[0]]||{},c=factInputs[f[0]];
        c.state.value=v.status||'';c.value.value=v.value===undefined?'':String(v.value);
        if(c.uncertainty)c.uncertainty.value=v.uncertainty===undefined?'':String(v.uncertainty);
        c.notes.value=v.notes||'';c.sync();});
    }
    async function reload(id){var rows=await library.list(db);chooser.replaceChildren();
      el('option',rows.length?'Select an observation…':'No observations yet',chooser).value='';
      rows.forEach(function(r){el('option',r.title+' ('+r.width+' × '+r.height+')',chooser).value=r.id;});
      var row=id?await library.get(db,id):null;chooser.value=row?row.id:'';fill(row);loaded=true;
    }
    chooser.addEventListener('change',function(){if(!allowDiscard()){chooser.value=selected?selected.id:'';return;}
      var id=chooser.value;run(async function(){try{fill(id?await library.get(db,id):null);}
        finally{chooser.value=selected?selected.id:'';}});});
    file.addEventListener('change',function(){var chosen=file.files[0];file.value='';if(!chosen||!allowDiscard())return;
      run(async function(){var record=await importer.ingest(chosen,library.makeId(env.crypto),env);
        await library.create(db,record);await reload(record.id);},'Photograph imported. Original bytes retained.');});
    editor.addEventListener('input',function(){dirty=true;});editor.addEventListener('change',function(){dirty=true;});
    editor.addEventListener('submit',function(event){event.preventDefault();if(!selected)return;
      run(async function(){var metadata={},cameraMetadata={};
        textFields.forEach(function(f){metadata[f[0]]=inputs[f[0]].value;});
        facts.forEach(function(f){var c=factInputs[f[0]];if(c.state.value&&c.state.value!=='unknown'&&(c.value.validity.badInput||(c.uncertainty&&c.uncertainty.validity.badInput)))throw Error('Invalid numeric value for '+f[1]);var fact=metadataFact(c.state.value,c.value.value,c.uncertainty?c.uncertainty.value:'',c.notes.value,f[2]);if(fact)cameraMetadata[f[0]]=fact;});
        metadata.cameraMetadata=cameraMetadata;
        var saved=await library.update(db,selected.id,selected.revision,metadata);dirty=false;await reload(saved.id);
      },'Observation metadata saved.');});
    host.addEventListener('toggle',function(){if(host.open&&!loaded)run(function(){return reload(null);});});
    if(host.open)run(function(){return reload(null);});
  }
  // Loaded only by Modern. The collapsed Library does no storage work at startup.
  if(env.document&&library&&importer)env.document.addEventListener('DOMContentLoaded',function(){
    var host=env.document.getElementById('ModernReferenceImageLibrary');if(host)mount(host,env.indexedDB);
  });
  return Object.freeze({mount:mount,metadataFact:metadataFact});
}));
