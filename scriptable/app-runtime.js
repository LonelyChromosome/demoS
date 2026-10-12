// Unified Scriptable host. All app UI is the original Flutter release.
const BPA_WEB='https://lonelychromosome.github.io/demoS/';
const DEFAULT_KIND='small';
const DEFAULT_INSTANCE='main';
const bpaFM=typeof FileManager==='undefined'?null:FileManager.local();
function bpaDirectory() {
  const path=bpaFM.joinPath(bpaFM.documentsDirectory(),'BPA');
  if(!bpaFM.fileExists(path))bpaFM.createDirectory(path,true);
  return path;
}
function bpaPath(name) { return bpaFM.joinPath(bpaDirectory(),name); }
function readState(name,fallback={}) {
  const p=bpaPath(name);
  if(!bpaFM.fileExists(p)&&bpaFM.fileExists(p+'.backup'))bpaFM.move(p+'.backup',p);
  return bpaFM.fileExists(p)?JSON.parse(bpaFM.readString(p)):fallback;
}
function writeState(name,value) { saveVerified(bpaFM,bpaPath(name),value); }
function preference(key) {
  const prefs=readState('preferences.json');
  const name=Object.keys(prefs).find(k=>k===key||k.endsWith('.'+key));
  if(!name)return null;
  let value=prefs[name];
  // SharedPreferences serializes the string payload; decode its outer wrapper.
  for(let i=0;i<2&&typeof value==='string';i++){try{value=JSON.parse(value);}catch(_){break;}}
  return value;
}
function snapshot() { return readState('snapshot.json',{classes:[],exams:[]}); }
function isoDay(d) { return localISO(d).slice(0,10); }
function widgetSelection(kind,id) {
  const selections=readState('widgets.json');
  return selections[kind+':'+id] || {day:isoDay(new Date()),mode:'study',index:0};
}
function setWidgetSelection(kind,id,value) {
  const selections=readState('widgets.json');selections[kind+':'+id]=value;writeState('widgets.json',selections);
}
function errorCode(code,message) { const error=new Error(message);error.code=code;return error; }
let cardGeneration=0;
function normalizeCardUID(value) {
  const uid=String(value||'').replace(/[:\s-]/g,'').toUpperCase();
  if(!/^(?:[0-9A-F]{2}){4,10}$/.test(uid))throw errorCode('nfc_invalid_uid','Shortcut không trả UID thẻ hợp lệ.');
  return uid;
}
async function requestCardUID() {
  const requestId=UUID.string(),started=Date.now();
  const callback=new CallbackURL('shortcuts://x-callback-url/run-shortcut');
  callback.addParameter('name','BPA — Quét thẻ');callback.addParameter('input','text');
  callback.addParameter('text',JSON.stringify({requestId}));
  const response=await callback.open();
  const value=JSON.parse(response.result||'null');
  if(!value||value.requestId!==requestId)throw errorCode('nfc_unverified','Chưa xác minh được kết quả quét thuộc yêu cầu BPA.');
  const at=Date.parse(value.scannedAt);
  if(!Number.isFinite(at)||at<started-2000||at>Date.now()+2000)throw errorCode('nfc_stale','Kết quả thẻ không thuộc lần quét hiện tại.');
  return normalizeCardUID(value.uid);
}
async function sendNativeEvent(app,channel,type,extra={}) {
  await app.evaluateJavaScript(`bpaHost.event(${JSON.stringify('better_phenikaa/'+channel)},'event',${JSON.stringify({type,...extra})});null`,false);
}
async function syncPortal() {
  if(Keychain.contains('BPA.qldt-session')) {
    try {return await fetchNativeQldt(JSON.parse(Keychain.get('BPA.qldt-session')));}
    catch(error){if(error.code==='qldt_verification')throw error;}
  }
  const portal=new WebView();
  await portal.loadURL('https://qldtbeta.phenikaa-uni.edu.vn/');
  let ready=await portal.evaluateJavaScript("!!(window.edu&&edu.system&&edu.system.userId&&edu.system.iM!=null&&typeof edu.system.makeRequest==='function')",false);
  if(!ready) {
    await portal.present(false);
    const host=await portal.evaluateJavaScript('location.hostname',false);
    if(host!=='qldtbeta.phenikaa-uni.edu.vn')throw errorCode('login_incomplete','Chưa trở về cổng QLĐT sau đăng nhập.');
  }
  const raw=await callPortal(portal,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',20000);
  const session=await portal.evaluateJavaScript(SESSION_SCRIPT,false);
  if(session) {
    const parsed=JSON.parse(session);
    if(parsed.tokenJWT&&parsed.userId&&parsed.iM&&parsed.appId&&parsed.strChucNangId)Keychain.set('BPA.qldt-session',session);
  }
  const reg=BPACore.registration(raw),chunks=BPACore.chunksFor(reg);
  const schedule=chunks.length?await callPortal(portal,scheduleScript(chunks),'betterPhenikaaSyncResult','betterPhenikaaSyncError',20000):{response:{Success:true,Data:[]}};
  const semester=BPACore.buildSemester(reg,BPACore.parseSchedule(schedule.response));
  if(!semester.displayName)throw errorCode('canonical_name_missing','QLDT_CANONICAL_NAME_MISSING');
  if(!chunks.length)throw errorCode('term_start_missing','Không xác định được môn đầu học kỳ.');
  const old=readState('semester-v1.json',null),state=BPACore.retain(old,semester);
  state.startedAt=localISO(BPACore.vnDate(chunks[0].start));
  // Flutter then applies its original diff, retention and transaction algorithm.
  writeState('semester-v1.json',state);
  return {semester,termStartedAt:state.startedAt};
}
function safeManagedPath(path) {
  const root=bpaFM.joinPath(bpaDirectory(),'files')+'/';
  if(typeof path!=='string'||!path.startsWith(root)||path.includes('/../'))throw errorCode('invalid_path','Đường dẫn không thuộc vùng dữ liệu BPA.');
  return path;
}
async function pickManaged(kind) {
  const paths=await DocumentPicker.open(kind==='font'?['public.data']:['public.image']);
  if(!paths.length)return null;
  const source=paths[0],name=source.split('/').pop(),directory=bpaFM.joinPath(bpaDirectory(),'files');
  if(!bpaFM.fileExists(directory))bpaFM.createDirectory(directory,true);
  const path=bpaFM.joinPath(directory,UUID.string()+'-'+name);
  bpaFM.copy(source,path);
  const bytes=bpaFM.read(path),size=dataSize(bytes);
  return {path,name,size,mimeType:kind==='font'?'font/ttf':'image/'+name.split('.').pop().toLowerCase()};
}
async function scheduleExamReminders() {
  const current=preference('better_phenikaa_current_semester_v1');
  if(!current)return null;
  const pending=await Notification.allPending(),delivered=await Notification.allDelivered();
  const deliveredKeys=new Set(delivered.map(n=>n.identifier));
  const wanted=new Set(),now=new Date(),jobs=[];
  for(const subject of current.subjects)for(const exam of subject.examSchedules)for(const days of [7,3,1]) {
    const at=new Date(new Date(exam.startAt).getTime()-days*86400000);
    const identity=`${subject.subjectId}|${exam.startAt}|${exam.endAt}|${exam.room.trim().toLowerCase()}|${BPACore.normalizeClass(exam.className)}|${BPACore.normalizeClass(exam.examForm)}|${days}`;
    const id='bpa.exam.'+BPACore.base64url(identity);
    if(at<=now||deliveredKeys.has(id))continue;
    wanted.add(id);
    if(pending.some(n=>n.identifier===id))continue;
    jobs.push({id,at,subject:subject.name,days,exam});
  }
  await Notification.removePending(pending.filter(n=>n.identifier.startsWith('bpa.exam.')&&!wanted.has(n.identifier)).map(n=>n.identifier));
  for(const job of jobs) {
    const n=new Notification();n.identifier=job.id;n.threadIdentifier='bpa.exam';
    n.title=`${job.subject} • còn ${job.days} ngày thi`;
    n.body=`${job.exam.startAt.slice(11,16)} • ${job.exam.room}${job.exam.examForm?' • '+job.exam.examForm:''}`;
    n.openURL=actionURL('open','overview','main');n.setTriggerDate(job.at);await n.schedule();
  }
  return null;
}
async function handlePlatform(call,app) {
  const method=call.method,args=call.arguments,channel=call.channel.replace('better_phenikaa/','');
  if(channel==='qldt_scriptable') {
    if(method==='sync')return await syncPortal();
    if(method==='clear'){for(const key of ['BPA.credentials','BPA.qldt-session'])if(Keychain.contains(key))Keychain.remove(key);return null;}
  }
  if(channel==='ios_runtime') {
    if(method==='publishSnapshot'){writeState('snapshot.json',args?JSON.parse(args):{classes:[],exams:[]});return null;}
    if(method==='selectWidgetDay'){const id=readState('last-widget.json',{id:'main'}).id;setWidgetSelection(args.kind,id,{...widgetSelection(args.kind,id),day:args.day,index:0});return null;}
    if(method==='takeWidgetAction'){const value=readState('pending-action.json',null);writeState('pending-action.json',null);return value;}
    if(method==='beginSync'||method==='endSync'||method==='refreshWidgets')return null;
  }
  if(channel==='widget_theme'&&method==='applyTheme'){writeState('theme.json',args);return 1;}
  if(channel==='local_files') {
    if(method==='pickFile')return await pickManaged(args.kind);
    if(method==='fileExists')return bpaFM.fileExists(safeManagedPath(args));
    if(method==='readFile'){const path=safeManagedPath(args.path),data=bpaFM.read(path);if(dataSize(data)>args.maximumBytes)throw errorCode('file_too_large','Tệp vượt giới hạn.');return data.toBase64String();}
  }
  if(channel==='widget_pin'&&method==='requestPin') {
    installWidgetScripts();
    const a=new Alert();a.title='Widget BPA';a.message='Các script widget đã được chuẩn bị. Nhấn giữ màn hình chính → thêm widget Scriptable → chọn script BPA tương ứng. iOS không có API để BPA tự thêm widget lên Home Screen.';a.addAction('Xong');await a.presentAlert();return false;
  }
  if(channel==='daily_sync') {
    if(method==='syncReminders')return await scheduleExamReminders();
    if(method==='recordAppSyncSuccess'){writeState('sync-status.json',{lastSuccessAtMillis:Date.now()});return null;}
    if(method==='refreshWidgetToday') {
      const selections=readState('widgets.json');
      for(const key of Object.keys(selections))selections[key]={...selections[key],day:isoDay(new Date()),index:0};
      writeState('widgets.json',selections);return null;
    }
    if(method==='status')return readState('sync-status.json',{lastSuccessAtMillis:0});
    if(method==='examNotice')return null;
    if(method==='clearReminders'){await Notification.removePending((await Notification.allPending()).filter(n=>n.identifier.startsWith('bpa.exam.')).map(n=>n.identifier));return null;}
    if(['disable','ackExamNotice'].includes(method))return null;
    if(method==='enable')throw errorCode('automation_required','iOS yêu cầu thiết lập Automation; BPA không tự bật lịch đồng bộ.');
  }
  if(channel==='study_alarm'&&method==='setAlarm') {
    const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),args.hour,args.minute);
    if(next.getTime()<=now.getTime()+30000)next.setDate(next.getDate()+1);
    if(!Number.isInteger(args.hour)||!Number.isInteger(args.minute)||args.hour<0||args.hour>23||args.minute<0||args.minute>59||next.getTime()!==args.target||args.target>=args.classStart||args.target<=now.getTime()+30000||args.classStart-now.getTime()>=86400000)throw errorCode('alarm_occurrence','Thời điểm báo thức không khớp buổi học trong 24 giờ.');
    const callback=new CallbackURL('shortcuts://x-callback-url/run-shortcut');
    callback.addParameter('name','BPA — Đặt báo thức');callback.addParameter('input','text');callback.addParameter('text',JSON.stringify(args));
    const response=await callback.open();
    const receipt=JSON.parse(response.result||'null');
    if(!receipt||receipt.status!=='BPA_ALARM_CREATED'||receipt.hour!==args.hour||receipt.minute!==args.minute||receipt.label!==args.label||receipt.target!==args.target||typeof receipt.alarmIdentifier!=='string'||!receipt.alarmIdentifier)throw errorCode('clock_unverified','Shortcut chưa xác nhận tạo đúng báo thức.');
    return true;
  }
  if(channel==='update_http'&&method==='fetch') {
    if(typeof args.url!=='string'||!/^https:\/\/[^/?#\s]+\//.test(args.url))throw errorCode('invalid_url','Cập nhật yêu cầu HTTPS.');
    const request=new Request(args.url);request.timeoutInterval=12;
    const data=await request.load();if(dataSize(data)>args.limit)throw errorCode('manifest_too_large','Manifest quá lớn.');return data.toBase64String();
  }
  if(channel==='update') {
    if(method==='versionCode')return 51;
    if(method==='versionName')return 'cooc.1.6';
    if(method==='installStatus')return 'idle';
    if(method==='hasBoundCard')return Keychain.contains('BPA.bound-card-uid');
    if(method==='removeBoundCard'){if(Keychain.contains('BPA.bound-card-uid'))Keychain.remove('BPA.bound-card-uid');return null;}
    if(['stopCard','cancel'].includes(method)){cardGeneration++;return null;}
    if(method==='startBindCard'||method==='startCard') {
      const generation=++cardGeneration;
      if(method==='startBindCard'&&Keychain.contains('BPA.bound-card-uid'))throw errorCode('already_bound','Thẻ đã được liên kết.');
      const uid=await requestCardUID();
      if(generation!==cardGeneration)throw errorCode('cancelled','Đã hủy yêu cầu thẻ.');
      if(method==='startBindCard'){Keychain.set('BPA.bound-card-uid',uid);await sendNativeEvent(app,'update','cardBound');}
      else {
        const matched=Keychain.contains('BPA.bound-card-uid')&&Keychain.get('BPA.bound-card-uid')===uid;
        await sendNativeEvent(app,'update',matched?'cardAccepted':'wrongCard');
      }
      return null;
    }
    if(method==='canInstall')return false;
    if(['downloadAndInstall','installSettings'].includes(method))throw errorCode('web_update_unconfigured','Chưa có kênh cập nhật web đã ký tương đương updater Android.');
  }
  if(channel==='widget_session'&&['clear','invalidate'].includes(method))return null;
  throw errorCode('unsupported_platform_method',`${channel}/${method} chưa có cầu Scriptable.`);
}
function installWidgetScripts() {
  const source=bpaFM.readString(module.filename);
  for(const [name,kind]of [['BPA — Nhỏ','small'],['BPA — Tổng quan','overview'],['BPA — Widget 2','widget2']]) {
    const content=source.replace("const DEFAULT_KIND='small';",`const DEFAULT_KIND='${kind}';`);
    bpaFM.writeString(bpaFM.joinPath(bpaFM.documentsDirectory(),name+'.js'),content);
  }
}
async function openOriginalApp() {
  const bundle=await ensureLocalBundle();
  const app=new WebView();
  await app.loadHTML(localAppHTML(bundle),'https://bpa.local/');
  const ready=await app.evaluateJavaScript('typeof bpaHost!=="undefined"&&typeof bpaStart==="function"',false);
  if(!ready)throw errorCode('web_build_unavailable','Bản giao diện BPA chưa sẵn sàng ở địa chỉ build.');
  await app.evaluateJavaScript(`bpaHost.init(${JSON.stringify(readState('preferences.json'))});null`,false);
  let closed=false;
  const jobs=new Set();
  const presentation=app.present(true).then(()=>{closed=true;});
  while(!closed) {
    let packet;
    try {packet=await app.evaluateJavaScript('bpaHost.poll(completion);',true);} catch(error){if(closed)break;throw error;}
    if(packet.preferences!==null)writeState('preferences.json',packet.preferences);
    for(const asset of packet.assets||[]) {
      let result;
      try {
        if(!validBundlePath(asset.path)||!bundle.files.includes(asset.path))throw Error('Tài nguyên ngoài gói BPA.');
        result={id:asset.id,data:bpaFM.read(bpaFM.joinPath(bundle.path,asset.path)).toBase64String()};
      } catch(error){result={id:asset.id,error:error.message};}
      if(!closed)await app.evaluateJavaScript(`bpaAssetResult(${JSON.stringify(result)});null`,false);
    }
    for(const call of packet.calls) {
      const job=(async()=>{
        let result;
        try {result={id:call.id,result:await handlePlatform(call,app)};}
        catch(error){result={id:call.id,error:{code:error.code||'scriptable_error',message:error.message}};}
        if(!closed)await app.evaluateJavaScript(`bpaHost.result(${JSON.stringify(result)});null`,false);
      })();
      jobs.add(job);job.then(()=>jobs.delete(job),()=>jobs.delete(job));
    }
  }
  cardGeneration++;
  await Promise.allSettled([...jobs]);
  await presentation;
}
async function bpaMain() {
  const params=typeof args==='undefined'?{}:args.queryParameters||{};
  let widgetOptions={};
  if(typeof args!=='undefined'&&args.widgetParameter) {
    try {widgetOptions=JSON.parse(args.widgetParameter);}catch(_){widgetOptions={instance:String(args.widgetParameter)};}
    if(!widgetOptions||typeof widgetOptions!=='object')throw errorCode('widget_parameter','Tham số widget không hợp lệ.');
  }
  const kind=params.kind||widgetOptions.kind||DEFAULT_KIND,id=params.instance||widgetOptions.instance||DEFAULT_INSTANCE;
  if(config.runsInWidget){Script.setWidget(await renderBPAWidget(kind,id));Script.complete();return;}
  installWidgetScripts();
  if(params.action){await widgetAction(params.action,kind,id,params);}
  else await openOriginalApp();
  Script.complete();
}
if(typeof Script!=='undefined')bpaMain().catch(async error=>{
  const alert=new Alert();alert.title='BPA';alert.message=error.message||String(error);alert.addAction('Đóng');await alert.presentAlert();Script.complete();
});
