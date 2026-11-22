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
    var urlInput=field(toolbar,'Image URL','input');urlInput.type='url';
    urlInput.placeholder='https://example.com/photo.jpg';urlInput.maxLength=4096;
    var addUrl=button('Import URL',toolbar,function(){
      if(!allowDiscard())return;
      run(async function(){
        var source=new URL(urlInput.value.trim());
        if(!['http:','https:'].includes(source.protocol)||source.username||source.password)
          throw Error('Enter an HTTP(S) image URL without credentials');
        var response=await env.fetch(source.href,{mode:'cors',credentials:'omit',redirect:'follow'});
        if(!response.ok)throw Error('Image download failed (HTTP '+response.status+')');
        if(!response.body||!response.body.getReader)throw Error('Streaming image download is unavailable');
        var reader=response.body.getReader(),chunks=[],total=0;
        try{
          while(true){
            var part=await reader.read();if(part.done)break;
            total+=part.value.byteLength;
            if(total>20*1024*1024)throw RangeError('Image URL exceeds 20 MiB limit');
            chunks.push(part.value);
          }
        }finally{reader.releaseLock();if(total>20*1024*1024)await response.body.cancel().catch(function(){});}
        if(!total)throw Error('Image URL returned an empty file');
        var bytes=new Uint8Array(total),offset=0;
        chunks.forEach(function(chunk){bytes.set(chunk,offset);offset+=chunk.length;});
        var basename=source.pathname.split('/').pop()||'URL image';
        var name;
        try{name=decodeURIComponent(basename);}catch(error){name='URL image';}
        var imported=await ingestSource(new env.Blob([bytes]),name,source.href);
        urlInput.value='';
        return imported;
      });
    });
    async function pasteClipboardImage(){
      if(!env.navigator.clipboard||!env.navigator.clipboard.read)
        throw Error('Clipboard image reading is unavailable; use an image paste event or local file.');
      var items=await env.navigator.clipboard.read(),blob=null;
      for(var i=0;i<items.length&&!blob;i++){
        var type=items[i].types.find(function(t){return /^image\/(png|jpeg|webp)$/.test(t);});
        if(type)blob=await items[i].getType(type);
      }
      if(!blob)throw Error('Clipboard contains no supported PNG, JPEG or WebP image');
      return ingestSource(blob,'Clipboard image');
    }
    var paste=button('Paste image',toolbar,function(){
      if(!allowDiscard())return;
      run(pasteClipboardImage);
    });
    var returnToCalibration=button('Return to Calibration',toolbar,function(){
      if(busy)return;
      var tab=doc.getElementById('ModernPhotoCalibrationOpen');
      if(!tab)return;
      tab.click();
      if(env.CurvatureModernApp?.getWorkspaceMode?.()==='calibration'){
        env.CurvatureImageLibraryReturnToCalibration=false;
        syncReturnNavigation();
      }
    });
    var returnToStoryboard=button('Return to Storyboard',toolbar,function(){
      if(busy)return;
      var studio=doc.getElementById('ModernAnimationTab'),
        editor=doc.getElementById('ModernAnimationViewEditor');
      if(!studio||!editor)return;
      studio.click();
      if(env.CurvatureModernApp?.getWorkspaceMode?.()!=='animation')return;
      if(editor.getAttribute('aria-selected')!=='true')editor.click();
      if(editor.getAttribute('aria-selected')==='true'){
        env.CurvatureImageLibraryReturnToStoryboard=false;
        syncReturnNavigation();
      }
    });
    function syncReturnNavigation(){
      returnToCalibration.hidden=!env.CurvatureImageLibraryReturnToCalibration;
      returnToStoryboard.hidden=!env.CurvatureImageLibraryReturnToStoryboard;
    }
    syncReturnNavigation();
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
    gallery.tabIndex=0; // A reliable focus target for Ctrl+V outside editable fields.
    var demoDetails=el('aside',undefined,body);demoDetails.className='modern-image-library-demo';demoDetails.hidden=true;
    var chooser=field(body,'Saved observations','select');
    chooser.parentElement.hidden=true;chooser.setAttribute('aria-hidden','true');chooser.tabIndex=-1;
    var editor=el('form',undefined,body);editor.noValidate=true;editor.className='modern-reference-editor';editor.hidden=true;
    var preview=el('div',undefined,editor);preview.className='modern-reference-preview';
    var usage=el('section',undefined,editor);usage.className='modern-image-usage';
    usage.setAttribute('aria-label','Where used?');
    var usageHead=el('div',undefined,usage);usageHead.className='modern-image-usage-heading';
    el('strong','Where used?',usageHead);
    var usageRefresh=button('Refresh uses',usageHead,function(){
      if(selected)void showUses(selected);
    });
    var usageStatus=el('p','Select a saved original to inspect known uses.',usage);
    usageStatus.className='modern-image-usage-status';usageStatus.setAttribute('aria-live','polite');
    var usageGroups=el('div',undefined,usage);usageGroups.className='modern-image-usage-groups';
    var usageEpoch=0;
    async function navigateUse(use){
      if(busy||!allowDiscard())return;
      var tab=null;
      if(use.type==='animation'){
        if(!env.CurvatureModernApp?.openImageUsageAnimation)
          throw Error('Guarded Animation navigation is unavailable');
        await env.CurvatureModernApp.openImageUsageAnimation(
          use.ownerId,use.frameKey,use.revision,use.frameIndex,selected&&selected.id);
      }else if(use.type==='calibration'){
        // Check a saved owner before changing tabs. A deleted/stale row must
        // not disturb the current Image Library or the outgoing editor.
        var store=env.CurvatureModernCalibrationProjectStore;
        if(!store?.get)throw Error('Calibration Projects unavailable');
        var inspectedImageId=selected&&selected.id,inspectedEpoch=usageEpoch;
        var owner=await store.get(env.indexedDB,use.ownerId);
        if(!owner)throw Error('Calibration project was deleted');
        if(owner.revision!==use.revision)
          throw Error('Calibration project changed since usage inspection; refresh Where used?');
        if(inspectedEpoch!==usageEpoch||!selected||selected.id!==inspectedImageId)
          throw Error('Image selection changed while checking Calibration; refresh Where used?');
        tab=doc.getElementById('ModernPhotoCalibrationOpen');if(!tab)throw Error('Calibration tab unavailable');
        tab.click();
        if(env.CurvatureModernApp?.getWorkspaceMode?.()!=='calibration')throw Error('Calibration navigation was blocked');
        var editorApi=env.CurvatureModernPhotoCalibrationEditor?.mount?.(doc);
        if(!editorApi?.openCalibrationProject)throw Error('Calibration Projects unavailable');
        await editorApi.openCalibrationProject(use.ownerId);
      }else if(use.type==='draft'){
        if(!env.CurvatureModernApp?.openImageUsageDraft)
          throw Error('Guarded Storyboard navigation unavailable');
        await env.CurvatureModernApp.openImageUsageDraft(
          use.ownerId,use.frameKey,use.revision,selected&&selected.id,
          use.source,use.draftContent);
      }else if(use.type==='calibration-draft'){
        var currentCalibration=env.CurvatureModernPhotoCalibrationEditor?.mount?.(doc);
        var livePhoto=currentCalibration?.snapshot?.()?.referenceImageId;
        var liveOwner=currentCalibration?.projectBinding?.()?.projectId||'current';
        if(livePhoto!==(selected&&selected.id)||liveOwner!==use.ownerId)
          throw Error('Calibration working session changed; refresh Where used?');
        var calibrationTab=doc.getElementById('ModernPhotoCalibrationOpen');
        if(!calibrationTab)throw Error('Calibration workspace unavailable');
        calibrationTab.click();
        if(env.CurvatureModernApp?.getWorkspaceMode?.()!=='calibration')
          throw Error('Calibration workspace navigation blocked');
      }else{
        throw Error('Unknown image use type');
      }
    }
    async function showUses(row){
      var token=++usageEpoch,graph=env.CurvatureModernImageUsageGraph;
      usageGroups.replaceChildren();
      if(!graph){usageStatus.textContent='Usage graph unavailable';return;}
      usageStatus.textContent='Checking saved projects and recoverable drafts…';
      try{
        var report=await graph.discover(env,row);
        if(token!==usageEpoch||!selected||selected.id!==row.id)return;
        usageStatus.textContent=report.count+' known local use'+(report.count===1?'':'s')+
          (report.complete?' · accessible stores inspected':' · incomplete discovery');
        var groups=[
          ['animation','Saved animations'],['calibration','Calibration projects'],
          ['archive','Archived results'],['draft','Recoverable Storyboards'],
          ['calibration-draft','Current Calibration']
        ];
        groups.forEach(function(group){
          var found=report.uses.filter(function(use){return use.type===group[0];});
          if(!found.length)return;
          var section=el('section',undefined,usageGroups);
          el('h3',group[1]+' ('+found.length+')',section);
          if(group[0]==='archive')
            el('p','Immutable historical evidence. No direct result viewer; opening a different project is not equivalent.',section);
          found.forEach(function(use){
            var item=el('div',undefined,section);item.className='modern-image-usage-item';
            var detail=el('span',use.title+
              (use.frameIndex?' · keyframe '+use.frameIndex+': '+use.frameName:'')+
              ' · '+use.source,item);
            detail.title=use.ownerId;
            if(use.type==='draft'&&use.source==='recoverable local backup'){
              el('small','Unsent local recovery snapshot · open Animation Studio recovery to restore it before navigating. This snapshot is not the currently loaded workspace.',item);
            }else if(['animation','calibration','draft','calibration-draft'].includes(use.type)){
              var open=button('Open use',item,function(){
                navigateUse(use).catch(function(error){
                  usageStatus.textContent='Cannot open use: '+error.message;
                });
              });
              open.setAttribute('aria-label','Open '+use.type+' '+use.title+
                (use.frameIndex?' frame '+use.frameIndex:'')+' · '+use.source);
            }
          });
        });
        if(!report.uses.length)el('p','No references found in inspected local records.',usageGroups);
        if(report.unavailable.length){
          var warning=el('p','Not checked: '+report.unavailable.join('; '),usageGroups);
          warning.className='modern-image-usage-warning';
        }
        el('p',report.note,usageGroups).className='modern-image-usage-caveat';
      }catch(error){
        if(token===usageEpoch)usageStatus.textContent='Usage discovery failed: '+error.message;
      }
    }
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
    remove.title='Disabled: separate databases and other-tab Undo/recovery cannot be revalidated atomically.';
    var deletionCheck=button('Check deletion safety',actions,function(){
      if(!selected)return;
      run(async function(){
        var inspectedId=selected.id,revision=selected.revision;
        var graph=env.CurvatureModernImageUsageGraph;
        if(!graph?.deletionReview)throw Error('Deletion inspection is unavailable');
        var outcome=await graph.deletionReview(env,selected);
        if(!selected||selected.id!==inspectedId||selected.revision!==revision)
          throw Error('Image selection changed during deletion inspection; refresh Library');
        deletionStatus.textContent=(outcome.knownUses===null?
          'Available local uses could not be determined.':
          outcome.knownUses+' known local use'+(outcome.knownUses===1?'':'s')+
            ' at inspection time.')+' Deletion blocked. '+outcome.reasons.join(' · ');
        void showUses(selected);
        return 'Deletion was not performed. Review the safety explanation below.';
      });
    });
    var deletionStatus=el('p','Deletion remains disabled. Check deletion safety to inspect known local links; zero known uses is not deletion permission.',editor);
    deletionStatus.className='modern-image-usage-warning';
    deletionStatus.setAttribute('role','status');
    deletionStatus.setAttribute('aria-live','polite');
    function allowDiscard(){return !dirty||env.confirm('Discard unsaved observation metadata changes?');}
    function setBusy(value){busy=value;file.disabled=value;refresh.disabled=value;chooser.disabled=value;
      search.disabled=value;sourceFilter.disabled=value;kindFilter.disabled=value;
      backup.disabled=value;restoreFile.disabled=value;enable.disabled=value||classificationReady;
      urlInput.disabled=value;addUrl.disabled=value;paste.disabled=value;
      deletionCheck.disabled=value||!selected;
      returnToCalibration.disabled=value;returnToStoryboard.disabled=value;gallery.inert=value;
      // Disable the fieldsets and editable controls while a transaction runs.
      editor.inert=value;save.disabled=value;remove.disabled=true;}
    async function run(action,message){if(busy)return;setBusy(true);status.textContent='Working…';
      try{var feedback=await action();status.textContent=message||feedback||'Reference Image Library ready.';}
      catch(error){status.textContent='Reference Image Library: '+(error&&error.message||error);}
      finally{setBusy(false);}}
    function fill(row){selected=row;dirty=false;editor.hidden=!row;preview.replaceChildren();
      ++usageEpoch;usageGroups.replaceChildren();
      deletionCheck.disabled=!row;
      deletionStatus.textContent='Deletion remains disabled. Check deletion safety to inspect known local links; zero known uses is not deletion permission.';
      if(!row)return;
      void showUses(row);
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
              demo:demo,demoName:demo.name||demo.title||demo.id};
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
              var demoUsage=el('section',undefined,demoDetails);
              demoUsage.className='modern-image-usage';
              demoUsage.setAttribute('aria-label','Where used?');
              el('strong','Where used?',demoUsage);
              var graph=env.CurvatureModernImageUsageGraph;
              if(!graph?.demoReferences){
                el('p','Shipped demo usage cannot be checked. No zero-use claim.',demoUsage);
              }else{
                var demoUses=graph.demoReferences(entry.demo,entry.record.id);
                el('p',demoUses.length+' shipped demo keyframe use'+
                  (demoUses.length===1?'':'s')+' · separate from local projects.',demoUsage);
                demoUses.forEach(function(use){
                  var item=el('div',undefined,demoUsage);
                  item.className='modern-image-usage-item';
                  var location=el('span',use.title+' · keyframe '+
                    use.frameIndex+': '+use.frameName+' · shipped',item);
                  location.title=use.ownerId;
                });
                if(!demoUses.length)
                  el('p','No references in this bundled demo\'s keyframes.',demoUsage);
                el('p','Read-only demo references have no direct frame-navigation action. No photograph was imported.',demoUsage);
              }
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
        card.setAttribute('data-image-key',entry.key);
        if(entry.source==='library')card.setAttribute('data-image-id',entry.id);
        card.setAttribute('aria-label','Inspect '+entry.title+' ('+
          (entry.source==='demo'?'Built-in demo':'Local original')+')');
        card.setAttribute('aria-pressed',String(entry.key===key));
        var raster=entry.thumbnail||entry.record?.original;
        if(raster){var img=el('img',undefined,card);img.src=raster.dataUrl;img.alt='';}
        else{var noThumbnail=el('span','No thumbnail',card);noThumbnail.className='modern-image-library-placeholder';}
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
        return 'Restored '+result.created+' original images and '+result.annotationsAdded+' classification records.';
      });
    });
    async function ingestSource(blob,name,sourceUrl){
      if(!blob||!Number.isSafeInteger(blob.size)||blob.size<1||blob.size>20*1024*1024)
        throw RangeError('Select a PNG, JPEG or WebP image up to 20 MiB');
      // Preserve the exact provided bytes; neither import nor deduplication recodes the original.
      var fileLike={size:blob.size,name:name||'Image',arrayBuffer:function(){return blob.arrayBuffer();}};
      var record=await importer.ingest(fileLike,library.makeId(env.crypto),env);
      if(sourceUrl)record={...record,sourceUrl:sourceUrl};
      var result=await library.ensureOriginal(db,record,env.crypto,function(r){return importer.verifyOriginal(r,env);});
      await reload(result.row.id);
      return result.reused?'Existing original reused; its attribution was not overwritten.':
        'Photograph imported. Original bytes retained.';
    }
    file.addEventListener('change',function(){var chosen=file.files[0];file.value='';if(!chosen||!allowDiscard())return;
      run(function(){return ingestSource(chosen,chosen.name);});});
    // Chromium may not dispatch a native paste event for a focused, noneditable
    // gallery. Handle the explicit keyboard gesture as a clipboard-read action;
    // keep the native paste event for browsers that deliver image clipboardData.
    host.addEventListener('keydown',function(event){
      if(busy||event.defaultPrevented||event.altKey||
         !(event.ctrlKey||event.metaKey)||String(event.key).toLowerCase()!=='v')return;
      var target=event.target;
      if(target&&target.closest&&target.closest('input,textarea,[contenteditable]'))return;
      event.preventDefault(); // Avoid a second native paste event importing twice.
      if(!allowDiscard())return;
      run(pasteClipboardImage);
    });
    host.addEventListener('paste',function(event){
      if(busy||env.CurvatureModernApp?.getWorkspaceMode?.()!=='images'||event.defaultPrevented)return;
      var target=event.target;
      if(target&&target.closest&&target.closest('input,textarea,[contenteditable]'))return;
      var items=event.clipboardData&&event.clipboardData.items;
      if(!items)return;
      var imageItem=null;
      for(var i=0;i<items.length;i++){
        if(/^image\/(png|jpeg|webp)$/.test(items[i].type)){imageItem=items[i];break;}
      }
      if(!imageItem)return;
      event.preventDefault();
      if(!allowDiscard())return;
      var blob=imageItem.getAsFile();
      run(function(){return ingestSource(blob,'Clipboard image');});
    });
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
    function activated(){
      syncReturnNavigation();
      if(!busy&&!dirty)run(function(){return reload(selected&&selected.id);});
    }
    host.addEventListener('curvature-library-navigation',activated);
    // The standalone workspace is initially hidden. It is activated by the
    // top-level tab, not by a nested <details> disclosure inside Studio.
    if(env.CurvatureModernApp?.getWorkspaceMode?.()==='images')activated();
  }
  // Loaded only by Modern. The standalone Library remains lazy until its tab opens.
  if(env.document&&library&&importer)env.document.addEventListener('DOMContentLoaded',function(){
    var host=env.document.getElementById('ModernReferenceImageLibrary');if(host)mount(host,env.indexedDB);
  });
  return Object.freeze({mount:mount,metadataFact:metadataFact});
}));
