// Runs in Scriptable's inline Shortcuts extension, independently of the app
// presentation. Physical iOS scheduling still needs a device test.
let syncWorkerContext=null;
function diskState(name,fallback={}) {
  const context=syncWorkerContext;syncWorkerContext=null;
  try{return readState(name,fallback);}finally{syncWorkerContext=context;}
}
function diskWrite(name,value) {
  const context=syncWorkerContext;syncWorkerContext=null;
  try{writeState(name,value);}finally{syncWorkerContext=context;}
}
function backgroundEpoch() {return diskState('account-epoch.json',{value:0}).value;}
function invalidateBackgroundSync() {
  recoverBackgroundCommit();
  diskWrite('account-epoch.json',{value:backgroundEpoch()+1});
  diskWrite('sync-lease.json',null);
}
function workerJobPath(id) {
  if(typeof id!=='string'||! /^[A-Za-z0-9-]{8,80}$/.test(id))throw errorCode('sync_job','Yêu cầu đồng bộ không hợp lệ.');
  return 'sync-job-'+id+'.json';
}
function checkBackgroundJob(job) {
  const lease=diskState('sync-lease.json',null);
  if(backgroundEpoch()!==job.epoch||!lease||lease.requestId!==job.requestId)throw errorCode('cancelled','Phiên đồng bộ đã bị hủy.');
  if(Date.now()-job.startedAt>600000)throw errorCode('sync_timeout','Đồng bộ đã quá thời gian.');
}
function recoverBackgroundCommit() {
  const journal=diskState('sync-commit.json',null);
  if(!journal)return;
  // A later logout owns the cleared state; never restore an older account.
  if(journal.epoch===backgroundEpoch()) {
    const result=diskState(workerJobPath(journal.requestId),null);
    if(result?.status!=='committed')for(const [name,value]of Object.entries(journal.before))diskWrite(name,value);
  }
  diskWrite('sync-commit.json',null);
}
function mergeWorkerPreferences(before,after,current) {
  const merged={...current};
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
    if(before[key]===after[key])continue;
    // Keep independent UI edits. Account epoch checks protect account data.
    if(current[key]!==before[key]&&current[key]!==after[key])throw errorCode('sync_conflict','Dữ liệu đã đổi trong lúc đồng bộ. Hãy đồng bộ lại.');
    if(Object.prototype.hasOwnProperty.call(after,key))merged[key]=after[key];else delete merged[key];
  }
  return merged;
}
function commitBackgroundState(job,context,result) {
  checkBackgroundJob(job);
  const changes=Object.fromEntries(context.states);
  changes['preferences.json']=mergeWorkerPreferences(job.preferences,changes['preferences.json']||job.preferences,diskState('preferences.json',{}));
  // Theme loading is incidental to the hidden runtime; foreground theme wins.
  delete changes['theme.json'];delete changes['widget-refresh.json'];
  changes['sync-revision.json']={requestId:job.requestId,epoch:job.epoch};
  const before={};for(const name of Object.keys(changes))before[name]=diskState(name,null);
  diskWrite('sync-commit.json',{requestId:job.requestId,epoch:job.epoch,before});
  try {
    for(const [name,value]of Object.entries(changes)){checkBackgroundJob(job);diskWrite(name,value);}
    checkBackgroundJob(job);
    const receipt={...result,status:'committed',requestId:job.requestId,epoch:job.epoch,completedAt:Date.now()};
    diskWrite(workerJobPath(job.requestId),receipt);
    diskWrite('sync-commit.json',null);return receipt;
  } catch(error) {recoverBackgroundCommit();throw error;}
}
function handleSyncWorkerCall(method) {
  if(!syncWorkerContext)throw errorCode('sync_worker_context','Không tìm thấy tác vụ đồng bộ.');
  checkBackgroundJob(syncWorkerContext.job);
  if(method==='payload')return syncWorkerContext.payload;
  if(method==='complete'){syncWorkerContext.complete=true;return null;}
  if(method==='failed')throw errorCode('sync_save_failed','Không lưu được lịch đã xác minh.');
  throw errorCode('sync_worker_method','Lệnh đồng bộ không hợp lệ.');
}
async function saveWorkerThroughOriginalDart(bundle,context) {
  const web=new WebView();
  await web.loadHTML(localAppHTML(bundle),'https://bpa.local/');
  await web.evaluateJavaScript(`bpaHost.init(${JSON.stringify(context.job.preferences)},{syncWorker:true});null`,false);
  while(!context.complete) {
    checkBackgroundJob(context.job);
    const packet=await web.evaluateJavaScript('bpaHost.poll(completion);',true);
    if(packet.preferences!==null)writeState('preferences.json',packet.preferences);
    for(const asset of packet.assets||[]) {
      await transmitLocalAsset(web,bundle,asset,()=>checkBackgroundJob(context.job));
    }
    for(const call of packet.calls) {
      // No login, card, update, picker or presentation from the worker.
      const channel=call.channel.replace('better_phenikaa/','');
      if(!['sync_worker','ios_runtime','daily_sync','widget_theme','local_files'].includes(channel))throw errorCode('sync_worker_method','Tác vụ nền yêu cầu thao tác ngoài luồng lưu.');
      if(channel==='local_files'&&!['fileExists','readFile'].includes(call.method))throw errorCode('sync_worker_method','Tác vụ nền không mở bộ chọn tệp.');
      const value=await handlePlatform(call,web);
      await web.evaluateJavaScript(`bpaHost.result(${JSON.stringify({id:call.id,result:value})});null`,false);
    }
  }
}
async function runBackgroundSyncWorker(input) {
  const path=workerJobPath(input.requestId),job=diskState(path,null);
  if(!job||job.requestId!==input.requestId||job.status!=='queued')throw errorCode('sync_job','Tác vụ đồng bộ không còn hiệu lực.');
  recoverBackgroundCommit();checkBackgroundJob(job);
  if(!Keychain.contains('BPA.qldt-session'))throw errorCode('qldt_session_expired','Cần đăng nhập QLĐT.');
  const session=JSON.parse(Keychain.get('BPA.qldt-session'));
  if(sha256Raw(unescape(encodeURIComponent(String(session.userId))))!==job.account)throw errorCode('cancelled','Tài khoản đã thay đổi.');
  const context={job,states:new Map(),payload:null,complete:false,reminders:false};
  syncWorkerContext=context;
  try {
    const fetched=await fetchNativeQldt(session);checkBackgroundJob(job);
    context.payload=commitPortalResult(fetched,syncGeneration);
    if(job.save)await saveWorkerThroughOriginalDart(await ensureLocalBundle(),context);
    checkBackgroundJob(job);
    syncWorkerContext=null;
    const receipt=commitBackgroundState(job,context,{...context.payload,savedByScriptableWorker:job.save});
    if(context.stale){checkBackgroundJob(job);try {await scheduleStaleReminder(true);}catch(error){diskWrite('sync-maintenance.json',{requestId:job.requestId,stale:'pending',code:error.code||'notification_error'});}}
    if(context.reminders) {
      try {await scheduleExamReminders();}catch(error){diskWrite('sync-maintenance.json',{requestId:job.requestId,reminders:'pending',code:error.code||'notification_error'});}
    }
    return {status:'BPA_SYNC_COMMITTED',requestId:job.requestId};
  } catch(error) {
    syncWorkerContext=null;
    diskWrite(path,{status:'failed',requestId:job.requestId,epoch:job.epoch,code:error.code||'sync_error'});
    throw error;
  } finally {syncWorkerContext=null;}
}
async function dispatchBackgroundSync(app,generation) {
  const state=appSessions.get(app);if(!state||state.closed)throw errorCode('cancelled','Đã đóng BPA.');
  await ensureWidgetShortcut();checkSyncGeneration(generation);
  // Only authentication failures may open the original QLDT WebView once.
  async function session() {
    if(Keychain.contains('BPA.qldt-session'))return JSON.parse(Keychain.get('BPA.qldt-session'));
    const value=await authenticatePortalInApp(app,generation);checkSyncGeneration(generation);
    Keychain.set('BPA.qldt-session',JSON.stringify(value));return value;
  }
  async function run(value) {
    checkSyncGeneration(generation);recoverBackgroundCommit();
    const existing=diskState('sync-lease.json',null);
    if(existing&&Date.now()-existing.startedAt<600000)throw errorCode('sync_busy','Đang có tác vụ đồng bộ.');
    state.phase='worker';if(state.pollInterrupt)state.pollInterrupt();
    const preferences=await app.evaluateJavaScript('bpaHost.suspend();',false);
    checkSyncGeneration(generation);writeState('preferences.json',preferences);
    const requestId=UUID.string(),epoch=backgroundEpoch(),startedAt=Date.now();
    const job={requestId,epoch,startedAt,preferences,status:'queued',save:preference('better_phenikaa_account_setup_complete_v1')===true,account:sha256Raw(unescape(encodeURIComponent(String(value.userId))))};
    diskWrite(workerJobPath(requestId),job);diskWrite('sync-lease.json',{requestId,epoch,startedAt});
    try {
      let callbackError;
      try {await invokeBundledShortcut('widgets',{mode:'sync',action:'sync',requestId});}catch(error){callbackError=error;}
      checkBackgroundJob(job);checkSyncGeneration(generation);
      const result=diskState(workerJobPath(requestId),null);
      if(result?.status==='failed')throw errorCode(result.code,'Đồng bộ chưa hoàn tất.');
      if(result?.status!=='committed')throw callbackError||errorCode('sync_not_committed','Tác vụ nền chưa xác nhận lưu lịch.');
      state.preferences=readState('preferences.json');state.syncRevision=readState('sync-revision.json',{}).requestId||null;
      await app.evaluateJavaScript(`bpaHost.replacePreferences(${JSON.stringify(state.preferences)});null`,false);
      return result;
    } finally {
      const lease=diskState('sync-lease.json',null);if(lease?.requestId===requestId)diskWrite('sync-lease.json',null);
      diskWrite(workerJobPath(requestId),null);
      if(!state.closed){state.phase='app';wakeAppSession(state);}
    }
  }
  let value=await session();
  try {return await run(value);}catch(error) {
    if(error.code!=='qldt_session_expired')throw error;
    checkSyncGeneration(generation);Keychain.remove('BPA.qldt-session');
    value=await session();return await run(value);
  }
}
