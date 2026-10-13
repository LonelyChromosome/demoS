// Base runtime: calendar shell and verified QLDT data only. No Flutter, themes,
// widgets, native companion Shortcuts or full-app updater is initialized here.
function unwrap(value){for(let i=0;i<4&&typeof value==='string';i++){try{value=JSON.parse(value);}catch(_){break;}}return value;}
function prefValue(prefs,key){const k=Object.keys(prefs).find(k=>k===key||k.endsWith('.'+key));return k?unwrap(prefs[k]):null;}
function prefWrite(prefs,key,value){const k=Object.keys(prefs).find(k=>k===key||k.endsWith('.'+key))||'flutter.'+key;prefs[k]=JSON.stringify(value);}
function flatten(semester,retained=null){const rows=semester.subjects.flatMap(s=>[...s.studySchedules,...s.examSchedules]);if(retained)rows.push(...retained.semester.subjects.flatMap(s=>s.examSchedules));const unique=new Map(rows.map(r=>[r.id,r]));return {displayName:semester.displayName,source:'qldt',syncedAt:semester.syncedAt,records:[...unique.values()].sort((a,b)=>new Date(a.startAt)-new Date(b.startAt))};}
function saveAtomic(fm,path,value){const pending=path+'.pending',backup=path+'.backup',raw=JSON.stringify(value);fm.writeString(pending,raw);if(fm.readString(pending)!==raw)throw Error('Không xác minh được bản lưu.');if(fm.fileExists(backup))fm.remove(backup);const old=fm.fileExists(path);if(old)fm.move(path,backup);try{fm.move(pending,path);}catch(error){if(old&&fm.fileExists(backup)&&!fm.fileExists(path))fm.move(backup,path);throw error;}if(fm.fileExists(backup))fm.remove(backup);}
function readJSON(fm,path,fallback){if(!fm.fileExists(path)&&fm.fileExists(path+'.backup'))fm.move(path+'.backup',path);return fm.fileExists(path)?JSON.parse(fm.readString(path)):fallback;}
function portalOverlay(ui,nonce,state){
 const html=ui.replace('<head>','<head><script>window.__BPA_PARENT_NONCE__='+JSON.stringify(nonce)+';</script>');
 return `(()=>{
  if(!window.bpaBaseNative){
   const frame=document.createElement('iframe');frame.id='bpa-base-frame';frame.setAttribute('sandbox','allow-scripts allow-forms');frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:#f9fbff';
   const queue=[];let current=${JSON.stringify(state)};
   window.bpaBaseNative={drain:()=>JSON.stringify(queue.splice(0)),set:value=>{current=value;frame.contentWindow.postMessage({bpa:${JSON.stringify(nonce)},state:current},'*');}};
   window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.data?.bpa===${JSON.stringify(nonce)}&&event.data.command)queue.push(event.data.command);});
   frame.onload=()=>frame.contentWindow.postMessage({bpa:${JSON.stringify(nonce)},state:current},'*');frame.srcdoc=${JSON.stringify(html)};document.body.append(frame);
  }else window.bpaBaseNative.set(${JSON.stringify(state)});
  return 'mounted';
 })()`;
}
async function run(web,ctx){
 const fm=ctx.fm,root=fm.joinPath(fm.documentsDirectory(),'BPA'),prefPath=fm.joinPath(root,'preferences.json');if(!fm.fileExists(root))fm.createDirectory(root,true);
 const epochPath=fm.joinPath(root,'account-epoch.json');
 // Recover an interrupted full-app transaction before adopting its data.
 const oldEpoch=readJSON(fm,epochPath,{value:0}).value,journal=readJSON(fm,fm.joinPath(root,'sync-commit.json'),null);
 if(journal&&journal.epoch===oldEpoch&&readJSON(fm,fm.joinPath(root,'sync-job-'+journal.requestId+'.json'),null)?.status!=='committed')for(const [name,value]of Object.entries(journal.before))saveAtomic(fm,fm.joinPath(root,name),value);
 if(journal)saveAtomic(fm,fm.joinPath(root,'sync-commit.json'),null);
 const ownedEpoch=oldEpoch+1;saveAtomic(fm,epochPath,{value:ownedEpoch});saveAtomic(fm,fm.joinPath(root,'sync-lease.json'),null);
 let prefs=readJSON(fm,prefPath,{}),snapshot=prefValue(prefs,'better_phenikaa_snapshot_v1'),busy=false,closed=false,portal=false;const nonce=UUID.string();
 const check=()=>{ctx.check();if(closed||readJSON(fm,epochPath,{value:0}).value!==ownedEpoch)throw Object.assign(Error('Đã đóng BPA.'),{code:'cancelled'});};
 // Keep imported old data even if its optional module is absent.
 let ui=fm.readString(await ctx.install('ui.html'));
 const fontPath=await ctx.install('Roboto-Regular.ttf');
 ui=ui.replace('<style>',"<style>@font-face{font-family:Roboto;src:url(data:font/ttf;base64,"+fm.read(fontPath).toBase64String()+");font-display:swap}");
 function diagnostic(phase,extra={}){saveAtomic(fm,fm.joinPath(root,'base-sync-status.json'),{phase,at:Date.now(),...extra});}
 async function screen(message='',error=false){check();const state={snapshot,displayName:prefValue(prefs,'better_phenikaa_account_display_name_v1'),busy,message,error};
  if(portal){await ctx.evaluate(web,portalOverlay(ui,nonce,state),false,10000);}
  else {await Promise.race([web.loadHTML(ui,'https://bpa.local/'),ctx.presentation.then(()=>{throw Object.assign(Error('Đã đóng BPA.'),{code:'cancelled'});})]);check();await ctx.evaluate(web,`bpaBase.set(${JSON.stringify(state)});null`,false,10000);}
 }
 async function status(message){check();await ctx.evaluate(web,`(window.bpaBaseNative||window.bpaBase).set(${JSON.stringify({snapshot,displayName:prefValue(prefs,'better_phenikaa_account_display_name_v1'),busy,message,error:false})});null`,false,10000);}
 const presentation=ctx.presentation.then(()=>{closed=true;});
 async function session(sync){
  diagnostic('login');
  let deadline=Date.now()+600000,opened=false;
  while(Date.now()<deadline){check();let raw=null;try{raw=await ctx.evaluate(web,`location.hostname==='qldtbeta.phenikaa-uni.edu.vn'?(${sync.probeScript.trim().replace(/;$/,'')}):null`,false,5000);}catch(error){if(error.code==='cancelled')throw error;}
   check();if(raw){let value;try{value=JSON.parse(raw);}catch(_){}if(value&&['tokenJWT','userId','iM'].every(k=>typeof value[k]==='string'&&value[k].trim())){portal=true;Keychain.set('BPA.qldt-session',JSON.stringify(value));diagnostic('portal-ready');return value;}}
   if(!opened){portal=false;opened=true;await web.loadURL('https://qldtbeta.phenikaa-uni.edu.vn/');}else await ctx.delay(200);
  }throw Object.assign(Error('Đăng nhập QLĐT quá thời gian. Hãy thử lại.'),{code:'login_timeout'});
 }
 async function synchronize(){
  if(busy)return;busy=true;await status('Đang chuẩn bị đồng bộ…');
  try{
   const sync=importModule(await ctx.install('sync.js'));check();await session(sync);await screen('Đang lấy và xác minh lịch QLĐT…');
   const result=await sync.fetch(web,ctx.evaluate,check,diagnostic);diagnostic('verified');
   check();const nextPrefs={...readJSON(fm,prefPath,{})};let name=prefValue(nextPrefs,'better_phenikaa_account_display_name_v1');
   if(prefValue(nextPrefs,'better_phenikaa_account_setup_complete_v1')!==true){const alert=new Alert();alert.title='Tên hiển thị';alert.message='Kiểm tra tên của bạn trước khi lưu lịch.';alert.addTextField('Tên của bạn',result.semester.displayName);alert.addAction('Lưu');alert.addCancelAction('Hủy');if(await alert.presentAlert()===-1)throw Object.assign(Error('Đã hủy lưu lịch.'),{code:'cancelled'});name=alert.textFieldValue(0).trim();if(!name)throw Error('Cần có tên hiển thị.');}
   check();const previous=prefValue(nextPrefs,'better_phenikaa_base_retention_v1')||readJSON(fm,fm.joinPath(root,'semester-v1.json'),null),retention=sync.retain(previous,result.semester);if(!retention.startedAt)retention.startedAt=result.termStartedAt;
   const nextSnapshot=flatten(result.semester,retention.previous);
   prefWrite(nextPrefs,'better_phenikaa_snapshot_v1',JSON.stringify(nextSnapshot));prefWrite(nextPrefs,'better_phenikaa_current_semester_v1',JSON.stringify(result.semester));prefWrite(nextPrefs,'better_phenikaa_base_retention_v1',retention);prefWrite(nextPrefs,'better_phenikaa_account_display_name_v1',name||result.semester.displayName);prefWrite(nextPrefs,'better_phenikaa_account_setup_complete_v1',true);
   // One authoritative atomic preferences commit. Failed fetch/name/save leaves
   // the previous semester and snapshot intact; no widget or module side effect.
   check();saveAtomic(fm,prefPath,nextPrefs);diagnostic('saved');prefs=nextPrefs;snapshot=nextSnapshot;busy=false;await screen('Đồng bộ thành công');
  }catch(error){diagnostic('failed',{code:error.code||'sync_error'});busy=false;if(!closed)await screen(error.message||String(error),true);}
 }
 await screen();
 while(!closed){
  let calls;try{calls=JSON.parse(await ctx.evaluate(web,'(window.bpaBaseNative||window.bpaBase).drain();',false,5000));}catch(error){if(closed)break;throw error;}
  if(closed)break;if(!calls?.length){await ctx.delay(200);continue;}for(const call of calls||[]){if(closed)break;if(call.action==='sync')await synchronize();else if(call.action==='account'){
   const alert=new Alert();alert.title=prefValue(prefs,'better_phenikaa_account_display_name_v1')||'BPA';alert.message='cooc 1.0 base • Lịch học Ngày / Tuần';alert.addAction('Đóng');alert.addDestructiveAction('Đăng xuất');if(await alert.presentAlert()===1){check();if(Keychain.contains('BPA.qldt-session'))Keychain.remove('BPA.qldt-session');const next={...prefs};if(Keychain.contains('BPA.credentials'))Keychain.remove('BPA.credentials');for(const name of ['semester-v1.json','snapshot.json','sync-success.json']){const path=fm.joinPath(root,name);if(fm.fileExists(path))fm.remove(path);}for(const key of ['better_phenikaa_snapshot_v1','better_phenikaa_current_semester_v1','better_phenikaa_base_retention_v1','better_phenikaa_current_term_start_v1','better_phenikaa_previous_semester_v1','better_phenikaa_widget_snapshot_v1','better_phenikaa_scriptable_name','better_phenikaa_account_display_name_v1','better_phenikaa_account_setup_complete_v1']){const name=Object.keys(next).find(k=>k===key||k.endsWith('.'+key));if(name)delete next[name];}saveAtomic(fm,prefPath,next);prefs=next;snapshot=null;portal=false;await screen();}
  }}
 }
 await presentation;
}
module.exports={portalOverlay,run,unwrap,prefValue,prefWrite,flatten,saveAtomic,readJSON};
