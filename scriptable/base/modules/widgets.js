function create(ctx){
const {fm:bpaFM,readState,writeState,preference,snapshot,isoDay,localISO,addDays,errorCode,resource,delay,check}=ctx;const syncWorkerContext=null;const bpaPath=ctx.path;
function bundledShortcut(kind){const item=SHORTCUTS[kind];return {...item,path:resource(item.file)};}
const SHORTCUTS={"alarm": {"name": "BPA — Đặt báo thức", "sha256": "da7f9e83d429f2e33d7a22cf8ef72bef1ceb873055d200575ec6570a0a3eb9ea", "size": 25594, "file": "scriptable/shortcuts/BPA-Alarm.shortcut"}, "nfc": {"name": "BPA — Quét thẻ", "sha256": "3e97f9ed0424c2cad4119790a6a0637f5c6efb525a41e91be40bb7813e9bc8e2", "size": 23771, "file": "scriptable/shortcuts/BPA-NFC.shortcut"}, "widgets": {"name": "BPA — Làm mới widget", "sha256": "feb69376f6a90ddf137ae32cae04691efdae604b4d5d498ad30f24f35a92a322", "size": 24468, "file": "scriptable/shortcuts/BPA-Widgets.shortcut"}};const BPA_BUNDLED_SHORTCUTS=SHORTCUTS;
async function invokeBundledShortcut(kind,input) {
  const asset=BPA_BUNDLED_SHORTCUTS[kind],callback=new CallbackURL('shortcuts://x-callback-url/run-shortcut');
  callback.addParameter('name',asset.name);callback.addParameter('input','text');callback.addParameter('text',JSON.stringify(input));
  return await callback.open();
}
function actionURL(action,kind,id,extra={}) {
  if(['previous','next','mode'].includes(action)&&widgetShortcutReady())return widgetShortcutURL({mode:'home',action,kind,instance:id,requestId:UUID.string()});
  const params={scriptName:ctx.scriptName,action,kind,instance:id,...extra};
  return 'scriptable:///run?'+Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');
}
function widgetRows(data,selection,kind,now=new Date()) {
  const rows=selection.mode==='exam'?data.exams||[]:data.classes||[];
  const today=isoDay(now);
  return rows.filter(r=>selection.mode==='exam'?r.startAt.slice(0,10)>=today:r.startAt.slice(0,10)===selection.day).sort((a,b)=>a.startAt.localeCompare(b.startAt)||String(a.id).localeCompare(String(b.id)));
}
// Android WidgetTimeline.withCalendarDays + arrange, including empty days.
function smallWidgetCollection(data,selection,now=new Date()) {
  if(selection.mode==='exam')return {items:widgetRows(data,selection,'small',now),selectedIndex:0};
  const byDay=new Map(),chosen=new Date(selection.day+'T00:00:00');
  let first=addDays(chosen,-1),last=addDays(chosen,1);
  for(const row of data.classes||[]) {
    const day=row.startAt.slice(0,10),date=new Date(day+'T00:00:00');
    if(date<first)first=date;if(date>last)last=date;
    if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(row);
  }
  const items=[];
  for(let day=first,count=0;day<=last&&count<370;day=addDays(day,1),count++) {
    const key=isoDay(day),rows=byDay.get(key);
    if(rows)items.push(...rows);
    else items.push({id:'empty-day-'+key,subjectName:'Không có lịch học',room:key===isoDay(now)?'Hôm nay • '+key.slice(8,10)+'/'+key.slice(5,7):key.slice(8,10)+'/'+key.slice(5,7),startAt:key+'T00:00:00',endAt:key+'T23:59:59',emptyDay:true});
  }
  items.sort((a,b)=>a.startAt.localeCompare(b.startAt)||String(a.id).localeCompare(String(b.id)));
  const indices=items.map((r,i)=>r.startAt.slice(0,10)===selection.day?i:-1).filter(i=>i>=0);
  const selectedIndex=selection.day===isoDay(now)?indices.find(i=>items[i].endAt.slice(0,19)>=localISO(now))??indices.at(-1)??0:indices[0]??0;
  return {items,selectedIndex};
}
function navigateWidget(selection,rows,kind,direction) {
  const count=kind==='overview'?4:kind==='widget2'?5:1;
  const last=Math.max(0,rows.length-count), index=Math.max(0,Math.min(selection.index||0,last));
  if(kind==='small'&&rows.length)return {...selection,index:Math.max(0,Math.min(index+direction,last))};
  if(kind==='overview'&&direction>0&&index<last)return {...selection,index:last};
  if(kind==='overview'&&direction<0&&index>0)return {...selection,index:0};
  if(selection.mode==='exam')return {...selection,index:Math.max(0,Math.min(index+direction*count,last))};
  const day=new Date(selection.day+'T00:00:00');day.setDate(day.getDate()+direction);
  const dates=(snapshot().classes||[]).map(r=>r.startAt.slice(0,10)).sort();
  const chosen=isoDay(day);
  if(dates.length&&(chosen<dates[0]||chosen>dates[dates.length-1]))return selection;
  return {...selection,day:chosen,index:0};
}
async function widgetAction(action,kind,id,params) {
  let selection=widgetSelection(kind,id);const collection=kind==='small'?smallWidgetCollection(snapshot(),selection):null,rows=collection?collection.items:widgetRows(snapshot(),selection,kind);
  if(collection&&!selection.manualPosition)selection={...selection,index:collection.selectedIndex};
  writeState('last-widget.json',{kind,id});
  if(action==='previous'||action==='next')setWidgetSelection(kind,id,{...navigateWidget(selection,rows,kind,action==='previous'?-1:1),manualPosition:kind==='small'});
  else if(action==='mode')setWidgetSelection(kind,id,{...selection,mode:selection.mode==='exam'?'study':'exam',index:0,manualPosition:false});
  else if(action==='calendar') {
    writeState('pending-action.json',{kind,action:'calendar',day:selection.day});ctx.openApp();return;
  } else if(action==='sync') {
    writeState('pending-action.json',{kind,action:'sync'});ctx.openApp();return;
  } else {writeState('pending-action.json',{kind,action:'open'});ctx.openApp();return;}
  if(!params.engineOnly)await requestWidgetRefresh(true);
  // Native refresh intent is requested; launcher rendering still needs tests.
}
async function renderBPAWidget(kind,id,preview=false) {
  if(!['small','overview','widget2'].includes(kind))throw errorCode('widget_kind','Loại widget không hợp lệ.');
  const family=preview?'medium':config.widgetFamily||'medium';
  if(family==='small')throw errorCode('widget_tap_limit','Widget iOS cỡ small chỉ có một vùng bấm. Chưa tái hiện được toàn bộ icon BPA trong kích thước này.');
  let state=widgetSelection(kind,id);const data=snapshot(),theme=readState('theme.json',{}),collection=kind==='small'?smallWidgetCollection(data,state):null,all=collection?collection.items:widgetRows(data,state,kind);
  if(collection&&!state.manualPosition)state={...state,index:collection.selectedIndex};
  const count=kind==='overview'?4:kind==='widget2'?5:1;
  const start=Math.max(0,Math.min(state.index||0,Math.max(0,all.length-count))),visible=all.slice(start,start+count);
  const payload={kind,day:state.day,examMode:state.mode==='exam',index:start,count:all.length,items:visible,theme,hostHeight:family==='large'?340:158};
  const result=await renderWidgetBitmap(payload);
  const image=Image.fromData(Data.fromBase64String(result.png));
  const widget=new ListWidget();widget.backgroundImage=image;widget.setPadding(0,0,0,0);widget.spacing=0;
  const h=family==='large'?340:158,w=340;
  let currentY=0;
  for(const band of result.hitBands) {
    const gap=Math.max(0,band.y-currentY);if(gap)widget.addSpacer(gap*h/result.height);
    const row=widget.addStack();row.layoutHorizontally();row.size=new Size(0,band.height*h/result.height);row.spacing=0;row.setPadding(0,0,0,0);
    let currentX=0;
    for(const hit of band.hits) {
      if(hit.x>currentX)row.addSpacer((hit.x-currentX)*w/result.width);
      const target=row.addStack();target.size=new Size(hit.width*w/result.width,band.height*h/result.height);target.url=actionURL(hit.action,kind,id);target.setPadding(0,0,0,0);target.addSpacer();currentX=hit.x+hit.width;
    }
    row.addSpacer();currentY=band.y+band.height;
  }
  widget.addSpacer();widget.url=actionURL('open',kind,id);
  widget.refreshAfterDate=new Date(Date.now()+15*60000);
  if(preview){if(family==='large')await widget.presentLarge();else await widget.presentMedium();}
  return widget;
}

function widgetShortcutURL(input) {
  return 'shortcuts://run-shortcut?name='+encodeURIComponent(BPA_BUNDLED_SHORTCUTS.widgets.name)+'&input=text&text='+encodeURIComponent(JSON.stringify(input));
}
function widgetShortcutReady() {
  const asset=BPA_BUNDLED_SHORTCUTS.widgets;
  return !!asset&&readState('widget-shortcut.json',{}).readyDigest===asset.sha256;
}
async function ensureWidgetShortcut() {
  const asset=bundledShortcut('widgets');
  async function probe() {
    const requestId=UUID.string(),response=await invokeBundledShortcut('widgets',{mode:'probe',requestId});
    const value=JSON.parse(response.result||'null');
    if(!value||value.status!=='BPA_WIDGET_BRIDGE_READY'||value.protocol!==2||value.requestId!==requestId)throw errorCode('widget_bridge_setup','Chưa hoàn tất chuẩn bị widget BPA.');
  }
  try {await probe();}
  catch(_) {await QuickLook.present(asset.path,true);await probe();}
  writeState('widget-shortcut.json',{readyDigest:asset.sha256});
}
async function requestWidgetRefresh(returnHome=false) {
  if(syncWorkerContext)return false;
  if(returnHome)await ensureWidgetShortcut();
  else if(!widgetShortcutReady()) {
    writeState('widget-refresh.json',{status:'setup_required',at:Date.now()});return false;
  }
  const requestId=UUID.string();
  if(returnHome) {
    // No x-success opens Scriptable again after Return to Home Screen.
    Safari.open(widgetShortcutURL({mode:'home',requestId}));return true;
  }
  const response=await invokeBundledShortcut('widgets',{mode:'refresh',requestId});
  const value=JSON.parse(response.result||'null');
  if(!value||value.status!=='BPA_WIDGET_REFRESH_REQUESTED'||value.requestId!==requestId)throw errorCode('widget_refresh_unverified','Chưa xác nhận được yêu cầu làm mới widget.');
  // An intent request is not proof that the launcher has painted a new frame.
  writeState('widget-refresh.json',{status:'requested',at:Date.now()});return true;
}
async function widgetCommand(input) {
  if(typeof input==='string')input=JSON.parse(input);
  if(!input||typeof input!=='object'||typeof input.requestId!=='string'||!input.requestId)throw errorCode('widget_action','Yêu cầu widget không hợp lệ.');
  if(input.action==='sync'){ctx.openApp('sync');return {status:'BPA_SYNC_OPENED',requestId:input.requestId};}
  if(!input.action)return {status:'BPA_WIDGET_NO_CHANGE',requestId:input.requestId};
  if(!['previous','next','mode'].includes(input.action)||!['small','overview','widget2'].includes(input.kind)||typeof input.instance!=='string'||!input.instance||input.instance.length>512)throw errorCode('widget_action','Yêu cầu widget không hợp lệ.');
  await widgetAction(input.action,input.kind,input.instance,{engineOnly:true});
  return {status:'BPA_WIDGET_ACTION_COMMITTED',requestId:input.requestId};
}
async function renderWidgetBitmap(payload){return await ctx.renderBitmap(payload);}
async function handle(){const a=new Alert();a.title='Widget BPA';a.addAction('Cài widget');a.addAction('Xem widget nhỏ');a.addAction('Xem tổng quan');a.addAction('Xem Widget 2');a.addAction('Chuẩn bị nút chuyển lịch');a.addCancelAction('Đóng');const n=await a.presentAlert();if(n===0){ctx.installRunner('widgets');const x=new Alert();x.title='Widget BPA';x.message='Nhấn giữ màn hình chính → thêm Scriptable → chọn BPA — Nhỏ, BPA — Tổng quan hoặc BPA — Widget 2. Dùng kích thước medium để có đủ vùng bấm.';x.addAction('Xong');await x.presentAlert();}if(n>=1&&n<=3)await renderBPAWidget(['small','overview','widget2'][n-1],'main',true);if(n===4){ctx.installRunner('widgets');await ensureWidgetShortcut();}}
return {handle,async uninstall(){for(const n of ['BPA — Nhỏ.js','BPA — Tổng quan.js','BPA — Widget 2.js','BPA — WidgetEngine.js']){const p=bpaFM.joinPath(bpaFM.documentsDirectory(),n);if(bpaFM.fileExists(p))bpaFM.remove(p);}},render:renderBPAWidget,widgetCommand,widgetAction};
}
module.exports={create};
