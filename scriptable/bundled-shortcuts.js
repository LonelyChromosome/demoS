// BPA.scriptable embeds companion code instead of asking the user to download
// separate modules. Native import approval remains part of iOS setup.
function bundledShortcut(kind) {
  const asset=BPA_BUNDLED_SHORTCUTS[kind];
  if(!asset)throw errorCode('shortcut_bundle','Bộ cài BPA thiếu thành phần cần thiết.');
  const data=Data.fromBase64String(asset.base64);
  if(dataSize(data)!==asset.size||sha256Data(data)!==asset.sha256)throw errorCode('shortcut_integrity','Không xác minh được thành phần BPA.');
  const path=bpaPath(asset.name+'.shortcut');
  if(!bpaFM.fileExists(path)||sha256Data(bpaFM.read(path))!==asset.sha256)bpaFM.write(path,data);
  return {...asset,path};
}
async function invokeBundledShortcut(kind,input) {
  const asset=BPA_BUNDLED_SHORTCUTS[kind],callback=new CallbackURL('shortcuts://x-callback-url/run-shortcut');
  callback.addParameter('name',asset.name);callback.addParameter('input','text');callback.addParameter('text',JSON.stringify(input));
  return await callback.open();
}
async function ensureClockShortcut() {
  const asset=bundledShortcut('alarm');
  async function probe() {
    const requestId=UUID.string(),response=await invokeBundledShortcut('alarm',{mode:'probe',requestId});
    const receipt=JSON.parse(response.result||'null');
    if(!receipt||receipt.status!=='BPA_CLOCK_READY'||receipt.requestId!==requestId)throw errorCode('shortcut_not_ready','Chưa hoàn tất chuẩn bị báo thức BPA.');
  }
  try {await probe();return;}catch(_){}
  await QuickLook.present(asset.path,true);
  // Dismissing import UI does not mean the companion was installed.
  await probe();
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
