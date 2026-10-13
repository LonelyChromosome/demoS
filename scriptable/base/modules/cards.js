function create(ctx){
const {fm:bpaFM,readState,writeState,preference,snapshot,isoDay,localISO,addDays,actionURL,errorCode,resource,delay,check}=ctx;const syncWorkerContext=null;const bpaPath=ctx.path;
function bundledShortcut(kind){const item=SHORTCUTS[kind];return {...item,path:resource(item.file)};}
const SHORTCUTS={"alarm": {"name": "BPA — Đặt báo thức", "sha256": "da7f9e83d429f2e33d7a22cf8ef72bef1ceb873055d200575ec6570a0a3eb9ea", "size": 25594, "file": "scriptable/shortcuts/BPA-Alarm.shortcut"}, "nfc": {"name": "BPA — Quét thẻ", "sha256": "3e97f9ed0424c2cad4119790a6a0637f5c6efb525a41e91be40bb7813e9bc8e2", "size": 23771, "file": "scriptable/shortcuts/BPA-NFC.shortcut"}, "widgets": {"name": "BPA — Làm mới widget", "sha256": "feb69376f6a90ddf137ae32cae04691efdae604b4d5d498ad30f24f35a92a322", "size": 24468, "file": "scriptable/shortcuts/BPA-Widgets.shortcut"}};const BPA_BUNDLED_SHORTCUTS=SHORTCUTS;
async function invokeBundledShortcut(kind,input) {
  const asset=BPA_BUNDLED_SHORTCUTS[kind],callback=new CallbackURL('shortcuts://x-callback-url/run-shortcut');
  callback.addParameter('name',asset.name);callback.addParameter('input','text');callback.addParameter('text',JSON.stringify(input));
  return await callback.open();
}
let cardGeneration=0;
function normalizeCardUID(value) {
  const uid=String(value||'').replace(/[:\s-]/g,'').toUpperCase();
  if(!/^(?:[0-9A-F]{2}){4,10}$/.test(uid))throw errorCode('nfc_invalid_uid','Shortcut không trả UID thẻ hợp lệ.');
  return uid;
}
async function requestCardUIDFromShortcut(expectedGeneration=cardGeneration) {
  await prepareNFCReader();
  if(expectedGeneration!==cardGeneration)throw errorCode('cancelled','Đã hủy yêu cầu thẻ.');
  await ensureNFCShortcut();
  if(expectedGeneration!==cardGeneration)throw errorCode('cancelled','Đã hủy yêu cầu thẻ.');
  const requestId=UUID.string(),started=Date.now();
  let response;
  try {response=await invokeBundledShortcut('nfc',{requestId});}
  catch(error){retryNFCImport();throw error;}
  const value=JSON.parse(response.result||'null');
  if(!value||value.requestId!==requestId)throw errorCode('nfc_unverified','Chưa xác minh được kết quả quét thuộc yêu cầu BPA.');
  const at=Date.parse(value.scannedAt);
  if(!Number.isFinite(at)||at<started-2000||at>Date.now()+2000)throw errorCode('nfc_stale','Kết quả thẻ không thuộc lần quét hiện tại.');
  if(value.callback!==undefined)return parseReaderCallback(value.callback,requestId);
  return normalizeCardUID(value.uid);
}
function urlQueryValue(url,name) {
  for(const field of String(url).split('?').slice(1).join('?').split('&')) {
    const i=field.indexOf('=');if(i<0)continue;
    if(decodeURIComponent(field.slice(0,i))===name)return decodeURIComponent(field.slice(i+1));
  }
  return null;
}
async function requestCardUIDViaHelper() {
  const requestId=UUID.string(),started=Date.now(),callback=new CallbackURL('nfchelper://read');
  // Reuse the native Scriptable return URL rather than inventing an IPC scheme.
  const success=urlQueryValue(callback.getURL(),'x-success');
  if(!success||!success.startsWith('scriptable:'))throw errorCode('nfc_callback_transport','Chưa xác minh được callback cục bộ của NFC Helper.');
  callback.addParameter('callback',success);callback.addParameter('params','true');callback.addParameter('custom',requestId);
  // No `write`, `url` or remote `post` parameter: the student card is read only.
  const response=await callback.open();
  if(!response||response.custom!==requestId||Date.now()-started>90000)throw errorCode('nfc_unverified','Callback NFC không thuộc lần đọc hiện tại.');
  if(typeof response.tagid!=='string') {
    writeState('nfc-diagnostics.json',{provider:'helper',returnedKeys:Object.keys(response),at:new Date().toISOString()});
    throw errorCode('nfc_callback_missing_uid','Callback chưa có trường serial thẻ đã xác minh.');
  }
  return normalizeCardUID(response.tagid);
}
async function requestCardUID(expectedGeneration=cardGeneration) {
  // Optional provider; the existing Shortcut consumer remains the default until
  // getURL()/reader callback shape is exercised on an actual iPhone.
  return preference('better_phenikaa_nfc_provider')==='helper'?await requestCardUIDViaHelper():await requestCardUIDFromShortcut(expectedGeneration);
}
function parseReaderCallback(raw,requestId) {
  if(typeof raw!=='string')throw errorCode('nfc_callback_shape','Đầu đọc chưa trả kết quả thẻ hợp lệ.');
  let value;
  try {value=JSON.parse(raw);}catch(_) {
    if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw))throw errorCode('nfc_callback_shape','Đầu đọc chưa trả kết quả thẻ hợp lệ.');
    value={custom:urlQueryValue(raw,'custom'),tagid:urlQueryValue(raw,'tagid')};
  }
  if(!value||typeof value!=='object'||value.custom!==requestId||typeof value.tagid!=='string')throw errorCode('nfc_unverified','Kết quả thẻ không thuộc lần quét BPA hiện tại.');
  return normalizeCardUID(value.tagid);
}
async function prepareNFCReader() {
  const setup=readState('nfc-reader-setup.json',{});
  if(setup.guideAcknowledged)return;
  const alert=new Alert();alert.title='Chuẩn bị đọc thẻ';
  alert.message='BPA dùng NFC Helper miễn phí để mở đầu đọc thẻ trên iPhone. Cài NFC Helper, sau đó quay lại BPA để tiếp tục.';
  alert.addAction('Đã cài, tiếp tục');alert.addAction('Mở App Store');alert.addCancelAction('Hủy');
  const choice=await alert.presentAlert();
  if(choice===1){Safari.open('https://apps.apple.com/app/id6472720100');throw errorCode('nfc_install_required','Cài NFC Helper rồi mở lại chức năng thẻ trong BPA.');}
  if(choice!==0)throw errorCode('cancelled','Đã hủy chuẩn bị đầu đọc.');
  // Acknowledged guidance only. A real read callback verifies the reader later.
  writeState('nfc-reader-setup.json',{guideAcknowledged:true});
}

async function ensureNFCShortcut() {
  const asset=bundledShortcut('nfc'),setup=readState('shortcut-import-shown.json',{});
  if(setup.nfc===asset.sha256)return;
  await QuickLook.present(asset.path,true);
  // This records only which import UI was shown, never a verified installation.
  writeState('shortcut-import-shown.json',{...setup,nfc:asset.sha256});
}
function retryNFCImport() {
  const setup=readState('shortcut-import-shown.json',{});delete setup.nfc;
  writeState('shortcut-import-shown.json',setup);
}
async function handle(command={}){const bound=Keychain.contains('BPA.bound-card-uid'),a=new Alert();a.title='Thẻ sinh viên';a.addAction(bound?'Kiểm tra thẻ':'Liên kết thẻ');if(bound)a.addDestructiveAction('Xóa liên kết');a.addCancelAction('Đóng');const choice=await a.presentAlert();if(choice<0)return;if(bound&&choice===1){await ctx.cardVFX(resource('assets/card_vfx/link.html'),'unlink');check();Keychain.remove('BPA.bound-card-uid');return;}const uid=await requestCardUID();check();if(bound&&Keychain.get('BPA.bound-card-uid')!==uid)throw Error('Thẻ không khớp.');if(!bound)Keychain.set('BPA.bound-card-uid',uid);await ctx.cardVFX(resource('assets/card_vfx/link.html'),bound?'accepted':'bound');}return {handle,requestCardUID};
}
module.exports={create};
