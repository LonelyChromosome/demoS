// The original Dart Ed25519 verifier re-fetches signed metadata on demand.
// No resource is promoted until its index and every file match that metadata.
let updateGeneration=0,bootingApp=null,bootingBundle=null;
const releaseVerifications=new Map();
function hostTimeout(ms,callback) {
  if(typeof Timer!=='undefined'){const timer=Timer.schedule(ms,false,callback);return {cancel:()=>timer.invalidate()};}
  const timer=setTimeout(callback,ms);return {cancel:()=>clearTimeout(timer)};
}
async function requestVerifiedRelease(app) {
  const requestId=UUID.string();let resolve,reject;
  const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const timeout=hostTimeout(16000,()=>{releaseVerifications.delete(requestId);reject(errorCode('update_verification_timeout','Chưa xác minh được chữ ký cập nhật.'));});
  releaseVerifications.set(requestId,{resolve,reject,timeout});
  try {await sendNativeEvent(app,'update','verifyRelease',{requestId});return await result;}
  finally {timeout.cancel();releaseVerifications.delete(requestId);}
}
function acceptVerifiedRelease(reply) {
  const pending=releaseVerifications.get(reply.requestId);if(!pending)throw errorCode('update_stale_reply','Kết quả xác minh không thuộc yêu cầu hiện tại.');
  releaseVerifications.delete(reply.requestId);pending.timeout.cancel();
  if(reply.error)pending.reject(errorCode('update_signature','Chữ ký cập nhật không hợp lệ.'));
  else pending.resolve(reply.manifest);
  return null;
}
async function stageWebUpdate(args,app) {
  if(readState('pending-bundle.json',null))throw errorCode('update_pending','Bản cập nhật đã sẵn sàng cho lần mở tiếp theo.');
  const generation=++updateGeneration;
  const check=()=>{if(generation!==updateGeneration)throw errorCode('cancelled','Đã hủy cập nhật.');};
  let preparedHostBackup=null;
  const hostPath=bpaFM.joinPath(bpaFM.documentsDirectory(),'BPA.js');
  try {
    const verified=await requestVerifiedRelease(app);check();
    for(const key of ['url','sha256','size','versionCode','versionName','resourceIndexSize','minimumVersionCode'])if(verified?.[key]!==args?.[key])throw errorCode('update_changed','Bản cập nhật thay đổi sau khi ủy quyền.');
    const active=readState('bundle.json',null);
    if(!Number.isInteger(verified.versionCode)||verified.versionCode<=(active?.versionCode||51)||!Number.isInteger(verified.minimumVersionCode)||(active?.versionCode||51)<verified.minimumVersionCode)throw errorCode('update_not_newer','Bản cập nhật không mới hơn bản đang chạy.');
    writeState('install-status.json',{status:'downloading',versionCode:verified.versionCode});
    const bundle=await stageLocalBundle(verified.url,verified,async(bytes,total)=>{check();await sendNativeEvent(app,'update','downloading',{bytes,total});},check);
    check();await sendNativeEvent(app,'update','verifying');
    check();const hostSource=bpaFM.readString(bpaFM.joinPath(bundle.path,'scriptable/BPA.js'));
    preparedHostBackup=commitScriptSource(hostPath,hostSource);
    writeState('pending-bundle.json',{...bundle,bootAttempted:false,hostSourcePrepared:true,hostBackupPath:preparedHostBackup});
    writeState('install-status.json',{status:'ready',versionCode:verified.versionCode});
    check();await sendNativeEvent(app,'update','installerLaunched');check();return null;
  }catch(error){
    if(preparedHostBackup&&bpaFM.fileExists(preparedHostBackup)){if(bpaFM.fileExists(hostPath))bpaFM.remove(hostPath);bpaFM.move(preparedHostBackup,hostPath);}
    writeState('pending-bundle.json',null);
    writeState('install-status.json',{status:error.code==='cancelled'?'cancelled':'failed'});
    await sendNativeEvent(app,'update',error.code==='cancelled'?'cancelled':'updateFailed');throw error;
  }
}
function commitScriptSource(path,source) {
  const staged=path+'.bpa-pending',backup=path+'.bpa-backup';
  new Function(source); // Compile the signed host before changing the script file.
  bpaFM.writeString(staged,source);if(bpaFM.readString(staged)!==source)throw errorCode('script_write','Không xác minh được script cập nhật.');
  if(bpaFM.fileExists(backup))bpaFM.remove(backup);
  const existed=bpaFM.fileExists(path);if(existed)bpaFM.move(path,backup);
  try {bpaFM.move(staged,path);}catch(error){if(existed&&bpaFM.fileExists(backup)&&!bpaFM.fileExists(path))bpaFM.move(backup,path);throw error;}
  return backup;
}
async function commitBootedBundle(app) {
  if(app!==bootingApp||!bootingBundle?.pendingActivation)return null;
  const pending=readState('pending-bundle.json',null);if(!pending||pending.digest!==bootingBundle.digest)throw errorCode('update_stale_boot','Gói khởi chạy không thuộc cập nhật hiện tại.');
  const previous=readState('bundle.json',null),hostPath=bpaFM.joinPath(bpaFM.documentsDirectory(),'BPA.js');let backup=null;
  try {
    const source=bpaFM.readString(bpaFM.joinPath(pending.path,'scriptable/BPA.js'));
    backup=pending.hostSourcePrepared?pending.hostBackupPath:commitScriptSource(hostPath,source);
    writeState('bundle-rollback.json',previous);writeState('bundle.json',pending);
    installWidgetScripts(source);
    writeState('install-status.json',{status:'installed',versionCode:pending.versionCode});
    writeState('pending-bundle.json',null);writeState('update-preferences-backup.json',null);
    if(backup&&bpaFM.fileExists(backup))bpaFM.remove(backup);
    bootingBundle=null;await sendNativeEvent(app,'update','installed');return null;
  }catch(error){
    if(backup&&bpaFM.fileExists(backup)){if(bpaFM.fileExists(hostPath))bpaFM.remove(hostPath);bpaFM.move(backup,hostPath);}
    if(previous)writeState('bundle.json',previous);
    writeState('install-status.json',{status:'failed'});writeState('pending-bundle.json',null);throw error;
  }
}

function cancelWebUpdate() {
  updateGeneration++;
  const pending=readState('pending-bundle.json',null);
  if(pending?.hostBackupPath&&bpaFM.fileExists(pending.hostBackupPath)){
    const host=bpaFM.joinPath(bpaFM.documentsDirectory(),'BPA.js');if(bpaFM.fileExists(host))bpaFM.remove(host);bpaFM.move(pending.hostBackupPath,host);
  }
  writeState('pending-bundle.json',null);writeState('install-status.json',{status:'cancelled'});
}
