/* One-user, explicit export/import drill. No new storage schemas or app startup.
 * Import refuses a nonempty target and never deletes existing user data.
 */
(function(root){
  'use strict';
  const api=root.CurvatureModernPortableBackup;
  const el=id=>document.getElementById(id);
  const exportButton=el('backup-export'),importButton=el('backup-import'),
    input=el('backup-file'),preview=el('backup-preview');
  let selected=null,busy=false,restored=false;
  function message(id,text,kind){
    const target=el(id);
    target.textContent=text;
    target.dataset.kind=kind||'info';
  }
  function lock(value){
    busy=value;
    exportButton.disabled=value;
    input.disabled=value;
    importButton.disabled=value||!selected||restored;
  }
  function summary(review){
    const exclusions=review.excludedWebStorageKeys;
    return 'Дата: '+review.capturedAt+'\n'+
      'IndexedDB: '+review.databases+' баз, '+review.stores+' сховищ, '+
      review.records+' записів\n'+
      'localStorage: '+review.localKeys+' ключів; sessionStorage: '+
      review.sessionKeys+' ключів\n'+
      'Не включено сторонніх ключів: localStorage '+exclusions.local+
      ', sessionStorage '+exclusions.session+'\n'+
      'Цільове сховище: '+(review.empty?'ПОРОЖНЄ':'НЕ ПОРОЖНЄ');
  }
  if(!api||!root.crypto||!root.crypto.subtle||!root.indexedDB||
    root.location.protocol==='file:'){
    message('backup-export-status','Для дампа відкрий сторінку через localhost (HTTP), з доступними IndexedDB і Web Crypto.','error');
    lock(true);return;
  }
  exportButton.addEventListener('click',async()=>{
    if(busy)return;
    lock(true);
    message('backup-export-status','Читаю бази й обчислюю контрольні суми…','info');
    let url=null;
    try{
      const archive=await api.capture(root);
      const file=await api.fileBlob(archive,root.crypto);
      url=URL.createObjectURL(file.blob);
      const link=document.createElement('a');
      link.href=url;link.download=file.filename;
      document.body.appendChild(link);link.click();link.remove();
      message('backup-export-status',
        'Завантаження розпочато: '+file.filename+' ('+
        (file.bytes/1024/1024).toFixed(2)+' MiB).\n'+
        'Переконайся, що файл справді з’явився на диску. '+
        'Не видаляй його до завершення рефакторингу.','success');
    }catch(error){
      message('backup-export-status','Не вдалося експортувати: '+error.message,'error');
    }finally{
      if(url)setTimeout(()=>URL.revokeObjectURL(url),30000);
      lock(false);
    }
  });
  input.addEventListener('change',async()=>{
    selected=null;restored=false;preview.textContent='';
    message('backup-import-status','','info');
    if(!input.files||!input.files[0]){lock(false);return;}
    lock(true);
    message('backup-import-status','Перевіряю файл та порожнє сховище…','info');
    try{
      const archive=await api.readFile(input.files[0],root.crypto);
      const review=await api.previewEmptyRestore(archive,root);
      preview.textContent=summary(review);
      if(!review.empty){
        const conflicts=review.conflicts;
        message('backup-import-status',
          'Імпорт заблоковано: тут уже є дані Curvature.\n'+
          'Бази: '+conflicts.databases.join(', ')+
          '\nКлючі localStorage: '+conflicts.localKeys.join(', ')+
          '\nКлючі sessionStorage: '+conflicts.sessionKeys.join(', ')+
          '\nВідкрий нове приватне вікно або порожній профіль.','error');
      }else{
        selected=archive;
        message('backup-import-status',
          'Файл перевірений. Можна імпортувати в це порожнє сховище.','success');
      }
    }catch(error){
      message('backup-import-status','Перевірка не пройдена: '+error.message,'error');
    }finally{lock(false);}
  });
  importButton.addEventListener('click',async()=>{
    if(busy||!selected||restored)return;
    const archive=selected;
    lock(true);
    message('backup-import-status','Відновлюю записи та перевіряю повторним читанням…','info');
    try{
      const result=await api.restoreEmpty(archive,root);
      restored=true;selected=null;
      message('backup-import-status','УСПІХ: '+result.databases+
        ' баз, '+result.records+' записів; усі відновлені дані збіглися з дампом.\n'+
        'Тепер відкрий Modern у ЦІЙ вкладці й перевір дані після F5.','success');
    }catch(error){
      selected=null;
      message('backup-import-status',
        'Імпорт не завершено: '+error.message+'\n'+
        'Цей тестовий профіль може містити частково імпортовані дані. '+
        'Не очищай робочий профіль; для повтору використай інший порожній профіль.','error');
    }finally{lock(false);}
  });
}(typeof window!=='undefined'?window:globalThis));
