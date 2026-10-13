function create(ctx){
const {fm:bpaFM,readState,writeState,preference,snapshot,isoDay,localISO,addDays,actionURL,errorCode,resource,delay,check}=ctx;const syncWorkerContext=null;const bpaPath=ctx.path;
function bundledShortcut(kind){const item=SHORTCUTS[kind];return {...item,path:resource(item.file)};}
const SHORTCUTS={"alarm": {"name": "BPA — Đặt báo thức", "sha256": "da7f9e83d429f2e33d7a22cf8ef72bef1ceb873055d200575ec6570a0a3eb9ea", "size": 25594, "file": "scriptable/shortcuts/BPA-Alarm.shortcut"}, "nfc": {"name": "BPA — Quét thẻ", "sha256": "3e97f9ed0424c2cad4119790a6a0637f5c6efb525a41e91be40bb7813e9bc8e2", "size": 23771, "file": "scriptable/shortcuts/BPA-NFC.shortcut"}, "widgets": {"name": "BPA — Làm mới widget", "sha256": "feb69376f6a90ddf137ae32cae04691efdae604b4d5d498ad30f24f35a92a322", "size": 24468, "file": "scriptable/shortcuts/BPA-Widgets.shortcut"}};const BPA_BUNDLED_SHORTCUTS=SHORTCUTS;
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
async function setAlarm(args){
    const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),args.hour,args.minute);
    if(next.getTime()<=now.getTime()+30000)next.setDate(next.getDate()+1);
    if(!Number.isInteger(args.hour)||!Number.isInteger(args.minute)||args.hour<0||args.hour>23||args.minute<0||args.minute>59||next.getTime()!==args.target||args.target>=args.classStart||args.target<=now.getTime()+30000||args.classStart-now.getTime()>=86400000)throw errorCode('alarm_occurrence','Thời điểm báo thức không khớp buổi học trong 24 giờ.');
    const started=Date.now();await ensureClockShortcut();
    if(Date.now()-started>90000||args.target<=Date.now()+30000)throw errorCode('alarm_setup_timeout','Thời điểm báo thức đã quá gần. Hãy chọn lại giờ.');
    const requestId=UUID.string();
    const response=await invokeBundledShortcut('alarm',{...args,mode:'create',requestId,timeText:String(args.hour).padStart(2,'0')+':'+String(args.minute).padStart(2,'0')});
    const receipt=JSON.parse(response.result||'null');
    if(!receipt||receipt.status!=='BPA_ALARM_CREATED'||Number(receipt.hour)!==args.hour||Number(receipt.minute)!==args.minute||receipt.label!==args.label||Number(receipt.target)!==args.target||receipt.requestId!==requestId||typeof receipt.createdAlarm!=='string'||!receipt.createdAlarm.trim())throw errorCode('clock_unverified','Shortcut chưa xác nhận tạo đúng báo thức.');
    return true;
}
async function handle(command={}){if(command.row){const row=command.row,at=new Date(row.startAt).getTime();if(!(at>Date.now()&&at-Date.now()<86400000))throw Error('Chọn buổi học trong 24 giờ tới.');const a=new Alert();a.title=row.subjectName;a.addTextField('Giờ 00–23',row.startAt.slice(11,13));a.addTextField('Phút 00–59','00');a.addAction('Đặt');a.addCancelAction('Hủy');if(await a.presentAlert()<0)return;const hour=Number(a.textFieldValue(0)),minute=Number(a.textFieldValue(1)),now=new Date(),target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),hour,minute);if(target.getTime()<=now.getTime()+30000)target.setDate(target.getDate()+1);return await setAlarm({hour,minute,target:target.getTime(),classStart:at,label:'BPA • '+row.subjectName});}await ensureClockShortcut();}return {handle,setAlarm};
}
module.exports={create};
