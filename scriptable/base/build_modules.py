"""Generate isolated adapters from the already-portered native operations."""
from pathlib import Path
import re,json,hashlib,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[2];out=root/'scriptable/base/modules';out.mkdir(exist_ok=True)
app=(root/'scriptable/app-runtime.js').read_text();bundle=(root/'scriptable/bundled-shortcuts.js').read_text();widgets=(root/'scriptable/widgets.js').read_text()
def between(text,start,end):return text[text.index(start):text.index(end)]
shared='''const {fm:bpaFM,readState,writeState,preference,snapshot,isoDay,localISO,addDays,actionURL,errorCode,resource,delay,check}=ctx;const syncWorkerContext=null;const bpaPath=ctx.path;
function bundledShortcut(kind){const item=SHORTCUTS[kind];return {...item,path:resource(item.file)};}
'''
shortcuts={}
for key,stem,name in [('alarm','BPA-Alarm','BPA — Đặt báo thức'),('nfc','BPA-NFC','BPA — Quét thẻ'),('widgets','BPA-Widgets','BPA — Làm mới widget')]:
 p=root/f'scriptable/shortcuts/{stem}.shortcut';meta=json.loads(p.with_suffix('.json').read_text());assert p.read_bytes()[:4]==b'AEA1' and hashlib.sha256(p.read_bytes()).hexdigest()==meta['signed_sha256'];shortcuts[key]={'name':name,'sha256':meta['signed_sha256'],'size':p.stat().st_size,'file':str(p.relative_to(root))}
shared+='const SHORTCUTS='+json.dumps(shortcuts,ensure_ascii=False)+';const BPA_BUNDLED_SHORTCUTS=SHORTCUTS;\n'+between(bundle,'async function invokeBundledShortcut','async function ensureClockShortcut')
# Alarm validation/create code is kept byte-for-byte inside its original branch.
alarm=between(app,"  if(channel==='study_alarm'", "  if(channel==='update_http'")
body=alarm[alarm.index('    const now='):alarm.rindex('\n  }')]
alarmSource=shared+between(bundle,'async function ensureClockShortcut','function parseReaderCallback')+'''async function setAlarm(args){\n'''+body+'''\n}
async function handle(command={}){if(command.row){const row=command.row,at=new Date(row.startAt).getTime();if(!(at>Date.now()&&at-Date.now()<86400000))throw Error('Chọn buổi học trong 24 giờ tới.');const a=new Alert();a.title=row.subjectName;a.addTextField('Giờ 00–23',row.startAt.slice(11,13));a.addTextField('Phút 00–59','00');a.addAction('Đặt');a.addCancelAction('Hủy');if(await a.presentAlert()<0)return;const hour=Number(a.textFieldValue(0)),minute=Number(a.textFieldValue(1)),now=new Date(),target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),hour,minute);if(target.getTime()<=now.getTime()+30000)target.setDate(target.getDate()+1);return await setAlarm({hour,minute,target:target.getTime(),classStart:at,label:'BPA • '+row.subjectName});}await ensureClockShortcut();}return {handle,setAlarm};'''
(out/'alarms.js').write_text('function create(ctx){\n'+alarmSource+'\n}\nmodule.exports={create};\n')
nfc=shared+'let cardGeneration=0;\n'+between(app,'function normalizeCardUID','async function sendNativeEvent')+between(bundle,'function parseReaderCallback','\nasync function prepareNFCReader')+bundle[bundle.index('async function prepareNFCReader'):]
nfc+='''async function handle(command={}){const bound=Keychain.contains('BPA.bound-card-uid'),a=new Alert();a.title='Thẻ sinh viên';a.addAction(bound?'Kiểm tra thẻ':'Liên kết thẻ');if(bound)a.addDestructiveAction('Xóa liên kết');a.addCancelAction('Đóng');const choice=await a.presentAlert();if(choice<0)return;if(bound&&choice===1){await ctx.cardVFX(resource('assets/card_vfx/link.html'),'unlink');check();Keychain.remove('BPA.bound-card-uid');return;}const uid=await requestCardUID();check();if(bound&&Keychain.get('BPA.bound-card-uid')!==uid)throw Error('Thẻ không khớp.');if(!bound)Keychain.set('BPA.bound-card-uid',uid);await ctx.cardVFX(resource('assets/card_vfx/link.html'),bound?'accepted':'bound');}async function authorize(){if(!Keychain.contains('BPA.bound-card-uid'))throw Error('Liên kết thẻ trong phần Thẻ NFC trước.');const uid=await requestCardUID();check();if(uid!==Keychain.get('BPA.bound-card-uid'))throw Error('Thẻ không khớp.');await ctx.cardVFX(resource('assets/card_vfx/link.html'),'accepted');check();return true;}return {handle,authorize,requestCardUID};'''
(out/'cards.js').write_text('function create(ctx){\n'+nfc+'\n}\nmodule.exports={create};\n')
# Native notification planner and assistant text, including delivery ledger.
notif=shared+'const BPA_ASSISTANT_CATALOG=JSON.parse(bpaFM.readString(resource("scriptable/assistant_pack_texts.json")));\n'+(root/'scriptable/core.js').read_text().replace("if (typeof module !== 'undefined') module.exports=BPACore;",'')
# Core does not implement sha256: use the same deterministic digest implementation.
local=(root/'scriptable/local-package.js').read_text();notif+=between(local,'function* sha256Work','function validBundlePath')
notif+=(root/'scriptable/exam-reminders.js').read_text()+between(app,'async function scheduleExamReminders','async function handlePlatform')+(root/'scriptable/sync-stale-reminders.js').read_text().replace('  recoverBackgroundCommit();','')
notif+='''async function handle(){const a=new Alert();a.title='Nhắc lịch';a.addAction('Bật / làm mới nhắc lịch thi');a.addAction('Chọn trợ lý');a.addAction('Lịch chạy hằng ngày');a.addDestructiveAction('Tắt nhắc lịch');a.addCancelAction('Đóng');const n=await a.presentAlert();if(n===0){writeState('reminders-enabled.json',true);await reminderMaintenance();ctx.installRunner('reminders');}if(n===1){const packs=['normal','serious','playful','affectionate','flirtatious','academic','blunt','cultivation'],names=['Bình thường','Nghiêm túc','Vui vẻ','Quan tâm','Mập mờ','Học thuật','Mỏ hỗn','Tu tiên'],x=new Alert();x.title='Trợ lý';for(const s of names)x.addAction(s);x.addCancelAction('Đóng');const i=await x.presentAlert();if(i>=0)ctx.setPreference('better_phenikaa_assistant_pack_v1',packs[i]);}if(n===2){ctx.installRunner('reminders');await ensureReminderAutomation();}if(n===3){writeState('reminders-enabled.json',false);await Notification.removePending((await Notification.allPending()).filter(n=>n.identifier.startsWith('bpa.exam.')||n.identifier.startsWith('bpa.stale.')).map(n=>n.identifier));}}
return {handle,async uninstall(){writeState('reminders-enabled.json',false);await Notification.removePending((await Notification.allPending()).filter(n=>n.identifier.startsWith('bpa.exam.')||n.identifier.startsWith('bpa.stale.')).map(n=>n.identifier));},maintenance:reminderMaintenance,async afterSyncMaintenance(){if(readState('reminders-enabled.json',false))await reminderMaintenance();},async afterSync(){if(readState('reminders-enabled.json',false)){writeState('sync-status.json',{lastSuccessAtMillis:Date.now()});await scheduleStaleReminder(true);await scheduleExamReminders();}}};'''
# Avoid redeclaring imported core helpers inside the factory.
notif=notif.replace('snapshot,isoDay,localISO,addDays,','snapshot,isoDay,')
(out/'reminders.js').write_text('function create(ctx){\n'+notif+'\n}\nmodule.exports={create};\n')
# Widgets keep the original geometry/navigation and bitmap renderer, with local
# resources and a callback-free render mailbox replacing full-bundle loading.
w=shared.replace('actionURL,','')+between(widgets,'function actionURL','function widgetRows').replace("scriptName:'BPA'","scriptName:ctx.scriptName")+between(widgets,'function widgetRows','async function renderWidgetBitmap')
w=w.replace('await openOriginalApp();','ctx.openApp();').replace("const family=config.widgetFamily||'medium';","const family=preview?'medium':config.widgetFamily||'medium';")
w+=(root/'scriptable/widget-shortcut.js').read_text().replace("if(input.action==='sync')return await runBackgroundSyncWorker(input);", "if(input.action==='sync'){ctx.openApp('sync');return {status:'BPA_SYNC_OPENED',requestId:input.requestId};}")
w+='''async function renderWidgetBitmap(payload){return await ctx.renderBitmap(payload);}
async function handle(){const a=new Alert();a.title='Widget BPA';a.addAction('Cài widget');a.addAction('Xem widget nhỏ');a.addAction('Xem tổng quan');a.addAction('Xem Widget 2');a.addAction('Chuẩn bị nút chuyển lịch');a.addCancelAction('Đóng');const n=await a.presentAlert();if(n===0){ctx.installRunner('widgets');const x=new Alert();x.title='Widget BPA';x.message='Nhấn giữ màn hình chính → thêm Scriptable → chọn BPA — Nhỏ, BPA — Tổng quan hoặc BPA — Widget 2. Dùng kích thước medium để có đủ vùng bấm.';x.addAction('Xong');await x.presentAlert();}if(n>=1&&n<=3)await renderBPAWidget(['small','overview','widget2'][n-1],'main',true);if(n===4){ctx.installRunner('widgets');await ensureWidgetShortcut();}}
return {handle,async uninstall(){for(const n of ['BPA — Nhỏ.js','BPA — Tổng quan.js','BPA — Widget 2.js','BPA — WidgetEngine.js']){const p=bpaFM.joinPath(bpaFM.documentsDirectory(),n);if(bpaFM.fileExists(p))bpaFM.remove(p);}},render:renderBPAWidget,widgetCommand,widgetAction};'''
(out/'widgets.js').write_text('function create(ctx){\n'+w+'\n}\nmodule.exports={create};\n')
# Exact source palette fields rather than hand-invented preset colors.
text=(root/'lib/theme/app_theme.dart').read_text();presets={}
for key,body in re.findall(r'AppThemeId\.(\w+): AppThemePalette\((.*?)\n      \),',text,re.S):
 name=re.search(r'AppThemeId\.'+key+r" => '([^']+)'",text)
 p={field:int(color,16) for field,color in re.findall(r'(\w+): Color\(0x([0-9A-Fa-f]+)\)',body)};p['name']=name.group(1) if name else key
 font=re.search(r"fontFamily: '([^']+)'",body)
 if font:p['fontFamily']=font.group(1)
 radius=re.search(r'radius: ([\d.]+)',body);p['radius']=float(radius.group(1)) if radius else 14
 presets['tien_mon_premium' if key=='tienMonPremium' else key]=p
(out/'theme-presets.json').write_text(json.dumps(presets,ensure_ascii=False,indent=2)+'\n')
# Original vector paths are stored as small SVG resources in the widget module.
icons=out/'icons';icons.mkdir(exist_ok=True);android='{http://schemas.android.com/apk/res/android}'
for name in ['ic_widget_calendar','ic_widget_reload','ic_widget_bell','ic_widget_up','ic_widget_down','ic_widget_back','ic_widget_study','ic_overview_chevron_left','ic_overview_chevron_right']:
 vector=ET.parse(root/f'reference/android/android/app/src/main/res/drawable/{name}.xml').getroot();svg=ET.Element('svg',{'xmlns':'http://www.w3.org/2000/svg','viewBox':f"0 0 {vector.attrib[android+'viewportWidth']} {vector.attrib[android+'viewportHeight']}"})
 for node in vector.iter('path'):
  color=node.attrib.get(android+'fillColor','#ffffff');attr={'d':node.attrib[android+'pathData'],'fill':color}
  if len(color)==9:attr['fill']='#'+color[3:];attr['fill-opacity']=str(int(color[1:3],16)/255)
  for old,new in [('strokeColor','stroke'),('strokeWidth','stroke-width'),('strokeLineCap','stroke-linecap'),('strokeLineJoin','stroke-linejoin'),('fillType','fill-rule')]:
   if android+old in node.attrib:attr[new]=node.attrib[android+old]
  ET.SubElement(svg,'path',attr)
 ET.ElementTree(svg).write(icons/(name+'.svg'),encoding='unicode')
def file(path):
 p=root/path;return {'path':path,'size':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def module(id,title,extra=[],requires=[],assets=[]):
 entry=f'scriptable/base/modules/{id}.js';return {'id':id,'title':title,'entry':entry,'requires':requires,'files':[file(p) for p in [entry,*extra]],'assets':[file(p) for p in assets]}
modules=[module('themes','Giao diện',['scriptable/base/modules/theme-presets.json','scriptable/base/modules/theme-engine.js','scriptable/base/modules/theme-client.js','web/widget-palette.js','assets/fonts/minecraft.ttf'],[],['scriptable/base/modules/vendor/html2canvas.min.js','scriptable/base/modules/vendor/LICENSE.html2canvas']),module('tienmon','Tiên Môn Premium',['assets/tien_mon_premium/scene_manifest.json','assets/tien_mon_premium/fonts/FzCoTrang.ttf'],['themes'],[str(p.relative_to(root)) for p in sorted((root/'assets/tien_mon_premium').rglob('*.png'))]),module('widgets','Widget',['web/widget-renderer.js','web/widget-palette.js','scriptable/shortcuts/BPA-Widgets.shortcut','ios/WidgetAssets/widget2_themes/macdinh.png',*[str(p.relative_to(root)) for p in sorted(icons.glob('*.svg'))]],[],[str(p.relative_to(root)) for p in sorted((root/'ios/WidgetAssets/widget2_themes').glob('*')) if p.name!='macdinh.png']),module('reminders','Nhắc lịch / Trợ lý',['scriptable/assistant_pack_texts.json']),module('alarms','Báo thức',['scriptable/shortcuts/BPA-Alarm.shortcut']),module('cards','Thẻ NFC / VFX',['scriptable/shortcuts/BPA-NFC.shortcut','assets/card_vfx/link.html']),module('updater','Cập nhật',[],['cards'])]
(root/'scriptable/base/catalog.json').write_text(json.dumps({'schema':1,'modules':modules},ensure_ascii=False,indent=2)+'\n')
print({m['id']:sum(f['size'] for f in m['files']) for m in modules})
