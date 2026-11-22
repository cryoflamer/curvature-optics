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
    var doc=host.ownerDocument,busy=false,loaded=false,selected=null,dirty=false,
      entries=[],demoEntries=[],activeChoice=null,classificationReady=false,backupReady=false;
    function el(tag,text,parent){var node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(parent)parent.appendChild(node);return node;}
    function button(text,parent,action){var b=el('button',text,parent);b.type='button';b.addEventListener('click',action);return b;}
    function field(parent,label,tag){var wrap=el('label',undefined,parent);el('span',label,wrap);return el(tag||'input',undefined,wrap);}
    var body=el('div',undefined,host);body.className='modern-reference-body';
    el('p','Shared Image Library · original images remain local to this browser. Categories and tags are optional metadata, independent of how projects use an asset. Keep complete backups of your originals.',body);
    var toolbar=el('div',undefined,body);toolbar.className='modern-reference-toolbar';
    var file=field(toolbar,'Import image','input');file.type='file';file.accept='image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
    var backup=button('Download full backup',toolbar,function(){run(async function(){
      var payload=await library.exportBackup(db),
        blob=new env.Blob([JSON.stringify(payload)],{type:'application/json'});
      var url=env.URL.createObjectURL(blob);
      try{
        var link=el('a',undefined,body);
        link.download='curvature-image-library-backup.json';link.href=url;
        link.click();link.remove();
        backupReady=true;
      }finally{env.setTimeout(function(){env.URL.revokeObjectURL(url);},60000);}
    },'Full local Library backup download requested. Verify it is saved before activating classification.');});
    var enable=button('Enable kind & tags',toolbar,function(){run(async function(){
      if(!backupReady)throw Error('Download a complete backup first and verify the file was saved.');
      if(!env.confirm('Confirm your full image-library backup was saved. The classification upgrade changes IndexedDB to version 2; older versions of Curvature Optics may no longer open this database. Continue?'))return;
      await library.enableAnnotations(db);
      await reload(selected&&selected.id);
    },'Image classification enabled. Old originals and references were preserved.');});
    var restoreFile=field(toolbar,'Restore complete backup (merge)','input');
    restoreFile.type='file';restoreFile.accept='application/json,.json';
    var refresh=button('Refresh',toolbar,function(){if(allowDiscard())run(async function(){await reload(selected&&selected.id);});});
    var status=el('p','Open to load observations.',body);status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    var galleryControls=el('div',undefined,body);galleryControls.className='modern-image-library-filters';
    var search=field(galleryControls,'Search images & tags','input');search.type='search';search.placeholder='Title, author, tags…';
    var sourceFilter=field(galleryControls,'Source','select');sourceFilter.setAttribute('aria-label','Source');
    [['all','All sources'],['library','Local originals'],['demo','Built-in demos']].forEach(function(p){
      el('option',p[1],sourceFilter).value=p[0];
    });
    var kindFilter=field(galleryControls,'Kind','select');kindFilter.setAttribute('aria-label','Kind');
    el('option','All kinds',kindFilter).value='all';
    library.KINDS.forEach(function(k){el('option',k==='unclassified'?'Unclassified (legacy)':k,kindFilter).value=k;});
    var gallery=el('div',undefined,body);gallery.className='modern-image-library-gallery';
    gallery.setAttribute('aria-label','Image Library gallery');
    var demoDetails=el('aside',undefined,body);demoDetails.className='modern-image-library-demo';demoDetails.hidden=true;
    var chooser=field(body,'Saved observations','select');
    chooser.parentElement.hidden=true;chooser.setAttribute('aria-hidden','true');chooser.tabIndex=-1;
    var editor=el('form',undefined,body);editor.noValidate=true;editor.className='modern-reference-editor';editor.hidden=true;
    var preview=el('div',undefined,editor);preview.className='modern-reference-preview';
    var classify=el('fieldset',undefined,editor);classify.className='modern-image-library-classification';
    el('legend','Independent image classification',classify);
    var kind=field(classify,'Image kind','select');
    library.KINDS.forEach(function(k){el('option',k==='unclassified'?'Unclassified (legacy)':k,kind).value=k;});
    var tags=field(classify,'Tags (comma separated)','input');tags.maxLength=1300;
    var collections=field(classify,'Collections (comma separated)','input');collections.maxLength=1100;
    var classificationHint=el('p','Download a complete backup and enable kind & tags to edit classification.',classify);
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
    var remove=el('button','Delete observation',actions);remove.type='button';remove.disabled=true;
    remove.title='Disabled until all saved, draft and Undo references can be checked safely.';
    el('p','Deletion is temporarily disabled to protect linked originals in saved projects, drafts and other tabs.',editor);
    function allowDiscard(){return !dirty||env.confirm('Discard unsaved observation metadata changes?');}
    function setBusy(value){busy=value;file.disabled=value;refresh.disabled=value;chooser.disabled=value;
      search.disabled=value;sourceFilter.disabled=value;kindFilter.disabled=value;
      backup.disabled=value;restoreFile.disabled=value;enable.disabled=value||classificationReady;gallery.inert=value;
      // Disable the fieldsets and editable controls while a transaction runs.
      editor.inert=value;save.disabled=value;remove.disabled=true;}
    async function run(action,message){if(busy)return;setBusy(true);status.textContent='Working…';
      try{await action();status.textContent=message||'Reference Image Library ready.';}
      catch(error){status.textContent='Reference Image Library: '+(error&&error.message||error);}
      finally{setBusy(false);}}
    function fill(row){selected=row;dirty=false;editor.hidden=!row;preview.replaceChildren();
      if(!row)return;
      kind.disabled=!classificationReady;tags.disabled=!classificationReady;
      collections.disabled=!classificationReady;
      kind.value=row.kind||'unclassified';tags.value=(row.tags||[]).join(', ');
      collections.value=(row.collections||[]).join(', ');
      classificationHint.textContent=classificationReady?
        'Classification is separate from usage roles and never changes the original raster.':
        'Download a full backup and enable kind & tags to edit classification.';
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
    function demoSources(){
      try{
        var catalog=env.CurvatureModernDemoCatalog?.load()||[];
        return catalog.flatMap(function(demo){
          return (demo.referenceImages||[]).map(function(record){
            return {key:JSON.stringify(['demo',demo.id,record.id]),source:'demo',
              title:record.title,author:record.author||'',license:record.license||'',
              width:record.original.width,height:record.original.height,
              thumbnail:record.thumbnail||null,kind:'unclassified',record:record,
              demoName:demo.name||demo.title||demo.id};
          });
        });
      }catch(error){
        status.textContent='Built-in demos unavailable: '+error.message;
        return [];
      }
    }
    function selectedKey(){return selected?JSON.stringify(['library',selected.id]):activeChoice;}
    function renderGallery(){
      var query=search.value.trim().toLocaleLowerCase(),source=sourceFilter.value,
        filterKind=kindFilter.value,key=selectedKey();
      gallery.replaceChildren();
      var all=entries.concat(demoEntries),shown=all.filter(function(entry){
        return (source==='all'||entry.source===source)&&
          (filterKind==='all'||entry.kind===filterKind)&&
          (!query||[entry.title,entry.author,entry.license,entry.kind,
            ...(entry.tags||[]),...(entry.collections||[])].some(function(s){
              return String(s||'').toLocaleLowerCase().includes(query);
          }));
      }).sort(function(a,b){return a.title.localeCompare(b.title)||a.key.localeCompare(b.key);});
      shown.forEach(function(entry){
        var card=button('',gallery,function(){
          if(busy||!allowDiscard())return;
          run(async function(){
            if(entry.source==='library'){
              activeChoice=null;demoDetails.hidden=true;
              fill(await library.get(db,entry.id));
            }else{
              fill(null);activeChoice=entry.key;
              demoDetails.replaceChildren();demoDetails.hidden=false;
              el('strong',entry.title,demoDetails);
              el('p','Built-in demo: '+entry.demoName+' · '+entry.width+' × '+entry.height+' px',demoDetails);
              el('p','Read-only demo original. Browsing does not import it into local storage.',demoDetails);
              if(entry.author)el('p','Author: '+entry.author,demoDetails);
              if(entry.license)el('p','License: '+entry.license,demoDetails);
              var image=el('img',undefined,demoDetails);
              image.src=(entry.record.thumbnail||entry.record.original).dataUrl;
              image.alt=entry.title;
              var view=el('a','View full original',demoDetails);
              view.href=entry.record.original.dataUrl;view.target='_blank';view.rel='noopener';
            }
            renderGallery();
          });
        });
        card.className='modern-image-library-card';
        card.setAttribute('aria-label','Inspect '+entry.title+' ('+
          (entry.source==='demo'?'Built-in demo':'Local original')+')');
        card.setAttribute('aria-pressed',String(entry.key===key));
        var img=el('img',undefined,card);
        img.src=(entry.thumbnail||entry.record?.original)?.dataUrl||'';
        img.alt='';
        el('strong',entry.title,card);
        el('small',entry.source==='demo'?'Built-in demo · read-only':
          'Local original · '+entry.width+' × '+entry.height,card);
        if(entry.kind!=='unclassified')el('small','Kind: '+entry.kind,card);
        if(entry.tags?.length)el('small',entry.tags.join(' · '),card);
      });
      if(!shown.length)el('p',all.length?'No matching images.':'No images imported yet.',gallery);
    }
    async function reload(id){
      entries=(await library.list(db)).map(function(row){
        return {...row,key:JSON.stringify(['library',row.id]),source:'library'};
      });
      var info=await library.annotationStatus(db);
      classificationReady=info.enabled;
      enable.disabled=busy||classificationReady;
      enable.hidden=classificationReady;
      demoEntries=demoSources();
      chooser.replaceChildren();
      el('option',entries.length?'Select an observation…':'No observations yet',chooser).value='';
      entries.forEach(function(row){el('option',row.title+' ('+row.width+' × '+row.height+')',chooser).value=row.id;});
      var row=id?await library.get(db,id):null;
      chooser.value=row?row.id:'';
      activeChoice=null;demoDetails.hidden=true;
      fill(row);loaded=true;renderGallery();
    }
    [search,sourceFilter,kindFilter].forEach(function(input){
      input.addEventListener('input',renderGallery);
      input.addEventListener('change',renderGallery);
    });
    chooser.addEventListener('change',function(){});
    restoreFile.addEventListener('change',function(){
      var chosen=restoreFile.files[0];restoreFile.value='';
      if(!chosen||!allowDiscard())return;
      run(async function(){
        if(chosen.size>library.MAX_CHARS*2+1024*1024)
          throw RangeError('Image Library backup file exceeds allowed size');
        var payload=JSON.parse(await chosen.text());
        library.validateBackup(payload);
        if(!env.confirm('Merge this Image Library backup? Existing originals and classifications will not be overwritten. Conflicting image IDs are remapped. No images will be deleted.'))return;
        var result=await library.restoreBackup(db,payload,env.crypto,
          function(record){return importer.verifyOriginal(record,env);});
        await reload(null);
        status.textContent='Restored '+result.created+' original images and '+result.annotationsAdded+' classification records.';
      });
    });
    file.addEventListener('change',function(){var chosen=file.files[0];file.value='';if(!chosen||!allowDiscard())return;
      run(async function(){var record=await importer.ingest(chosen,library.makeId(env.crypto),env);
        await library.create(db,record);await reload(record.id);},'Photograph imported. Original bytes retained.');});
    editor.addEventListener('input',function(){dirty=true;});editor.addEventListener('change',function(){dirty=true;});
    editor.addEventListener('submit',function(event){event.preventDefault();if(!selected)return;
      run(async function(){var metadata={},cameraMetadata={};
        textFields.forEach(function(f){metadata[f[0]]=inputs[f[0]].value;});
        facts.forEach(function(f){var c=factInputs[f[0]];if(c.state.value&&c.state.value!=='unknown'&&(c.value.validity.badInput||(c.uncertainty&&c.uncertainty.validity.badInput)))throw Error('Invalid numeric value for '+f[1]);var fact=metadataFact(c.state.value,c.value.value,c.uncertainty?c.uncertainty.value:'',c.notes.value,f[2]);if(fact)cameraMetadata[f[0]]=fact;});
        metadata.cameraMetadata=cameraMetadata;
        var saved;
        if(classificationReady){
          function labels(value){return value.split(',').map(function(part){return part.trim();}).filter(Boolean);}
          saved=await library.updateDetails(db,selected.id,selected.revision,
            selected.annotationRevision,metadata,{kind:kind.value,
              tags:labels(tags.value),collections:labels(collections.value)});
        }else saved=await library.update(db,selected.id,selected.revision,metadata);
        dirty=false;await reload(saved.id);
      },'Observation metadata saved.');});
    // Library edits never change the camera or open Animation/Calibration projects.
    host.addEventListener('toggle',function(){if(host.open&&!loaded)run(function(){return reload(null);});});
    if(host.open)run(function(){return reload(null);});
  }
  // Loaded only by Modern. The collapsed Library does no storage work at startup.
  if(env.document&&library&&importer)env.document.addEventListener('DOMContentLoaded',function(){
    var host=env.document.getElementById('ModernReferenceImageLibrary');if(host)mount(host,env.indexedDB);
  });
  return Object.freeze({mount:mount,metadataFact:metadataFact});
}));
