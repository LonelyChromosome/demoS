function create(ctx){
const {fm:bpaFM,readState,writeState,preference,snapshot,isoDay,actionURL,errorCode,resource,delay,check}=ctx;const syncWorkerContext=null;const bpaPath=ctx.path;
function bundledShortcut(kind){const item=SHORTCUTS[kind];return {...item,path:resource(item.file)};}
const SHORTCUTS={"alarm": {"name": "BPA — Đặt báo thức", "sha256": "da7f9e83d429f2e33d7a22cf8ef72bef1ceb873055d200575ec6570a0a3eb9ea", "size": 25594, "file": "scriptable/shortcuts/BPA-Alarm.shortcut"}, "nfc": {"name": "BPA — Quét thẻ", "sha256": "3e97f9ed0424c2cad4119790a6a0637f5c6efb525a41e91be40bb7813e9bc8e2", "size": 23771, "file": "scriptable/shortcuts/BPA-NFC.shortcut"}, "widgets": {"name": "BPA — Làm mới widget", "sha256": "feb69376f6a90ddf137ae32cae04691efdae604b4d5d498ad30f24f35a92a322", "size": 24468, "file": "scriptable/shortcuts/BPA-Widgets.shortcut"}};const BPA_BUNDLED_SHORTCUTS=SHORTCUTS;
async function invokeBundledShortcut(kind,input) {
  const asset=BPA_BUNDLED_SHORTCUTS[kind],callback=new CallbackURL('shortcuts://x-callback-url/run-shortcut');
  callback.addParameter('name',asset.name);callback.addParameter('input','text');callback.addParameter('text',JSON.stringify(input));
  return await callback.open();
}
const BPA_ASSISTANT_CATALOG=JSON.parse(bpaFM.readString(resource("scriptable/assistant_pack_texts.json")));
'use strict';
// Port of DemoF3 1.6 parsers and verification. No fuzzy name matching.
const str = v => v == null ? '' : String(v).trim();
const displayName = v => str(v).replace(/^Môn\s+/i, '').replace(/-\d+-\d+-\d+\([^)]*\)(?:\.[\w]+)?$/, '').trim();
const normalize = v => str(v).replace(/\s+/g, ' ').toLowerCase().normalize('NFD');
const normalizeSubject = v => normalize(displayName(v));
const normalizeClass = v => normalize(str(v).split(/<br\s*\/?>/i)[0]);
function vnDate(v) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str(v));
  if (!m) throw new Error('Ngày QLĐT không hợp lệ.');
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getFullYear() !== +m[3] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[1]) throw new Error('Ngày QLĐT không tồn tại.');
  return d;
}
function localISO(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function addDays(d, days) { const r = new Date(d); r.setDate(r.getDate()+days); return r; }
function expiry(start) {
  const month = new Date(start.getFullYear(), start.getMonth()+4, 1);
  const last = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  return new Date(month.getFullYear(), month.getMonth(), Math.min(start.getDate(), last)+7);
}
function data(response) {
  if (!response || response.Success !== true || !Array.isArray(response.Data) || response.Data.some(x => !x || typeof x !== 'object' || Array.isArray(x))) throw new Error('QLĐT chưa trả Data hợp lệ.');
  return response.Data;
}
function registration(payload) {
  const semesters = data(payload.semesters).map(row => {
    const m = /^(\d{4})_(\d{4})_(\d+)$/.exec(str(row.THOIGIAN));
    return m && +m[2] === +m[1]+1 && str(row.ID) ? {id:str(row.ID), name:str(row.THOIGIAN), year:+m[1], term:+m[3]} : null;
  }).filter(Boolean).sort((a,b) => b.year-a.year || b.term-a.term);
  if (!semesters.length) throw new Error('Không có học kỳ hợp lệ.');
  const latest = semesters[0];
  const plans = data(payload.plans).filter(row => str(row.MAKEHOACH) === latest.name || str(row.MAKEHOACH).startsWith(latest.name+','));
  const planIds = new Set(plans.map(row => str(row.ID)).filter(Boolean));
  const termIds = new Set(plans.map(row => str(row.DAOTAO_THOIGIANDAOTAO_ID)).filter(Boolean));
  if (planIds.size !== 1 || termIds.size !== 1) throw new Error('PLAN_AMBIGUOUS');
  const planId = [...planIds][0], termId = [...termIds][0];
  const subjects = new Map(), sections = new Map(), rows = data(payload.registrations);
  for (const row of rows) {
    if (str(row.DANGKY_KEHOACHDANGKY_ID) !== planId || ![latest.id,termId].includes(str(row.DAOTAO_THOIGIANDAOTAO_ID))) throw new Error('TraCuu trả lớp khác học kỳ hoặc kế hoạch.');
    const id = str(row.DAOTAO_HOCPHAN_ID), name = displayName(row.DAOTAO_HOCPHAN_TEN), cid = str(row.DANGKY_LOPHOCPHAN_ID), cname = str(row.DANGKY_LOPHOCPHAN_TEN);
    const start = vnDate(row.NGAYBATDAU), end = vnDate(row.NGAYKETTHUC);
    if (!id || !name || !cid || !cname || end < start) throw new Error('TraCuu trả môn hoặc lớp thiếu trường bắt buộc.');
    if (subjects.has(id) && normalizeSubject(subjects.get(id)) !== normalizeSubject(name)) throw new Error('ID môn có nhiều tên.');
    subjects.set(id,name);
    if (!sections.has(id)) sections.set(id,new Map());
    const section = {name:cname,startsOn:localISO(start),endsOn:localISO(end)};
    if (sections.get(id).has(cid) && JSON.stringify(sections.get(id).get(cid)) !== JSON.stringify(section)) throw new Error('ID lớp có dữ liệu khác nhau.');
    sections.get(id).set(cid,section);
  }
  let name = '';
  for (const row of rows) {
    const family = str(row.QLSV_NGUOIHOC_HODEM), given = str(row.QLSV_NGUOIHOC_TEN);
    name = family && given ? family+' '+given : ['QLSV_NGUOIHOC_HOTEN','HOTEN','HO_TEN','HOVATEN','FULLNAME'].map(k => str(row[k])).find(Boolean) || family || given;
    if (name) break;
  }
  return {id:latest.name,name:latest.name,displayName:name,confirmedEmpty:!rows.length,subjects:[...subjects].map(([id,name]) => ({name,sections:[...sections.get(id).values()]}))};
}
function chunksFor(reg) {
  const starts = reg.subjects.flatMap(s => s.sections.map(c => new Date(c.startsOn)));
  if (!starts.length) return [];
  const start = new Date(Math.min(...starts)), end = expiry(start), chunks = [];
  const format = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  for (let cursor = start; cursor <= end; cursor = addDays(cursor,7)) chunks.push({start:format(cursor),end:format(new Date(Math.min(+addDays(cursor,6),+end)))});
  return chunks;
}
function parseSchedule(response) {
  const records = new Map();
  for (const row of data(response)) {
    const type = str(row.PHANLOAI).toUpperCase();
    if (!['LICHHOC','LICHTHI'].includes(type)) throw new Error('Loại lịch không xác định.');
    const subjectName = displayName(row.TENHOCPHAN), dateText = str(row.NGAYHOC);
    if (!subjectName || !dateText) throw new Error('Bản ghi thiếu tên hoặc ngày.');
    const day = vnDate(dateText);
    const ints = ['GIOBATDAU','PHUTBATDAU','GIOKETTHUC','PHUTKETTHUC'].map(k => /^[-+]?\d+$/.test(str(row[k])) ? Number(str(row[k])) : NaN);
    const [sh,sm,eh,em] = ints;
    if (ints.some(x => !Number.isInteger(x)) || sh<0 || sh>23 || eh<0 || eh>23 || sm<0 || sm>59 || em<0 || em>59) throw new Error('Giờ học không hợp lệ.');
    const start = new Date(day.getFullYear(),day.getMonth(),day.getDate(),sh,sm), end = new Date(day.getFullYear(),day.getMonth(),day.getDate(),eh,em);
    if (end <= start) throw new Error('Giờ kết thúc không sau giờ bắt đầu.');
    const isExam = type === 'LICHTHI';
    const room = [row.PHONGHOC_TEN,isExam?row.PHONGTHI:row.TENPHONGHOC].map(str).find(Boolean) || '';
    const className = str(row.TENLOPHOCPHAN).split(/<br\s*\/?>/i)[0].trim();
    const id = [isExam?'exam':'class',dateText,subjectName,`${sh}:${sm}`,room,className].join('|');
    const optionalInt = v => /^[-+]?\d+$/.test(str(v)) ? Number(str(v)) : null;
    records.set(id,{id,isExam,subjectName,room,startAt:localISO(start),endAt:localISO(end),className,examForm:str(row.DANGKY_LOPHOCPHAN_TEN),periodStart:optionalInt(row.TIETBATDAU),periodEnd:optionalInt(row.TIETKETTHUC)});
  }
  return [...records.values()].sort((a,b) => new Date(a.startAt)-new Date(b.startAt));
}
function verify(reg, records) {
  const classes = new Map();
  for (const s of reg.subjects) {
    const n = normalizeSubject(s.name), sections = new Map();
    if (classes.has(n)) throw new Error('Trùng môn đăng ký.');
    for (const c of s.sections) {
      const cn = normalizeClass(c.name);
      if (!cn || sections.has(cn)) throw new Error('Lớp trùng hoặc thiếu tên.');
      sections.set(cn,c);
    }
    classes.set(n,sections);
  }
  if (!classes.size && (!reg.confirmedEmpty || records.length)) throw new Error('Chưa xác minh được môn của học kỳ.');
  return records.filter(row => {
    const subject = classes.get(normalizeSubject(row.subjectName));
    if (!subject) return false;
    const cn = normalizeClass(row.className), date = new Date(row.startAt);
    if (row.isExam) {
      const label = normalizeClass(row.examForm);
      const format = cn && ((cn === label && label) || ['trắc nghiệm','tự luận','vấn đáp','bài thi','thi ','trên máy','thực hành','online'].some(v => cn.includes(normalizeClass(v))));
      if (!subject.has(cn) && !format) throw new Error('Không xác minh được lớp của lịch thi.');
      const first = Math.min(...[...subject.values()].map(c => +new Date(c.startsOn)));
      if (!Number.isFinite(first) || date < first) throw new Error('Ca thi đứng trước học kỳ đăng ký.');
    } else {
      const c = subject.get(cn);
      if (!cn || !c) throw new Error('Không xác minh được lớp của lịch học.');
      const midnight = new Date(date.getFullYear(),date.getMonth(),date.getDate());
      if (midnight < addDays(new Date(c.startsOn),-14) || midnight > addDays(new Date(c.endsOn),14)) throw new Error('Buổi học ngoài khoảng ngày lớp.');
    }
    return true;
  });
}
function base64url(text) {
  const bytes = unescape(encodeURIComponent(text));
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i=0;i<bytes.length;i+=3) {
    const a=bytes.charCodeAt(i),b=bytes.charCodeAt(i+1),c=bytes.charCodeAt(i+2);
    out+=chars[a>>2]+chars[((a&3)<<4)|(Number.isNaN(b)?0:b>>4)];
    if (!Number.isNaN(b)) out+=chars[((b&15)<<2)|(Number.isNaN(c)?0:c>>6)];
    if (!Number.isNaN(c)) out+=chars[c&63];
  }
  return out;
}
function buildSemester(reg, records, now = new Date()) {
  const valid = verify(reg,records);
  return {semesterId:reg.id,semesterName:reg.name,displayName:reg.displayName,syncedAt:localISO(now),subjects:reg.subjects.map(s => {
    const normalizedName = normalizeSubject(s.name), subjectId='S'+base64url(`${reg.id.length}:${reg.id}${normalizedName}`);
    return {subjectId,name:displayName(s.name),normalizedName,studySchedules:valid.filter(r=>!r.isExam&&normalizeSubject(r.subjectName)===normalizedName),examSchedules:valid.filter(r=>r.isExam&&normalizeSubject(r.subjectName)===normalizedName)};
  })};
}
function retain(old, current, now = new Date()) {
  let previous = old && old.previous || null;
  if (old && old.current && old.current.semesterId !== current.semesterId && old.startedAt) previous={semester:old.current,startedAt:old.startedAt};
  if (previous && now >= addDays(expiry(new Date(previous.startedAt)),1)) previous=null;
  const first=current.subjects.flatMap(s=>s.studySchedules).map(r=>new Date(r.startAt)).sort((a,b)=>a-b)[0];
  const startedAt=old&&old.current&&old.current.semesterId===current.semesterId&&old.startedAt || first&&localISO(new Date(first.getFullYear(),first.getMonth(),first.getDate())) || null;
  return {schema:1,current,startedAt,previous};
}
const BPACore={displayName,normalizeSubject,normalizeClass,vnDate,expiry,registration,chunksFor,parseSchedule,verify,buildSemester,retain,base64url};

function* sha256Work(raw) {
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],n=raw.length,blocks=Math.ceil((n+9)/64),rotate=(v,b)=>(v>>>b)|(v<<(32-b));
  for(let block=0;block<blocks;block++) {
    const W=new Array(64);
    for(let i=0;i<16;i++){let value=0;for(let j=0;j<4;j++){const at=block*64+i*4+j;const b=at<n?(typeof raw==='string'?raw.charCodeAt(at):raw.byteAt(at)):at===n?128:at>=blocks*64-4?Math.floor(n*8/Math.pow(256,blocks*64-1-at))&255:at>=blocks*64-8?Math.floor(n*8/Math.pow(256,blocks*64-1-at))&255:0;value=(value<<8)|b;}W[i]=value;}
    for(let i=16;i<64;i++){const a=W[i-15],b=W[i-2];W[i]=(W[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+W[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10)))|0;}
    let[a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]+W[i])|0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    [a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)|0);
    if(block%1024===1023)yield;
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
function sha256Raw(raw) {const work=sha256Work(raw);let value;do{value=work.next();}while(!value.done);return value.value;}
async function sha256Cooperative(raw,check=()=>{}) {
  const work=sha256Work(raw);let value;
  do{check();value=work.next();if(!value.done)await nativeDelay(4);}while(!value.done);
  check();return value.value;
}
function base64ByteView(base64) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',values={};for(let i=0;i<64;i++)values[alphabet[i]]=i;
  const length=base64.length/4*3-(base64.endsWith('==')?2:base64.endsWith('=')?1:0);
  return {length,byteAt(index){const i=Math.floor(index/3)*4,a=values[base64[i]],b=values[base64[i+1]],c=values[base64[i+2]]||0,d=values[base64[i+3]]||0;return index%3===0?(a<<2)|(b>>4):index%3===1?((b&15)<<4)|(c>>2):((c&3)<<6)|d;}};
}
function dataSize(data) {return base64ByteView(data.toBase64String()).length;}
function sha256Data(data) {return sha256Raw(base64ByteView(data.toBase64String()));}
// Direct algorithm port of DemoF3 ExamReminderPlanner.kt and AssistantText.kt.
function examHash(text) {return sha256Raw(unescape(encodeURIComponent(text)));}
function examLocalTime(text) {
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(text);
  if(!m)return null;
  const d=new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]);
  return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]&&d.getHours()===+m[4]&&d.getMinutes()===+m[5]?d:null;
}
function examReminderPlan(semester,nowMillis,scheduled=new Set(),delivered=new Set()) {
  const candidates=[],today=new Date(nowMillis);today.setHours(12,0,0,0);
  for(const subject of semester.subjects)for(const exam of subject.examSchedules) {
    const start=examLocalTime(exam.startAt),end=examLocalTime(exam.endAt);if(!start||!end||end.getTime()<=nowMillis)continue;
    const identity=[subject.subjectId,exam.id,exam.startAt,exam.endAt,exam.room||'',exam.className||'',exam.examForm||''].join('|');
    const startDay=new Date(start);startDay.setHours(12,0,0,0);
    let daysLeft=0;for(const cursor=new Date(today);cursor<startDay;cursor.setDate(cursor.getDate()+1))daysLeft++;
    if(daysLeft<=0)continue;
    for(const milestone of [7,3,1]) {
      const tierKey=examHash(identity+'|'+milestone);if(delivered.has(tierKey))continue;
      if(daysLeft>milestone) {
        const at=new Date(start);at.setDate(at.getDate()-milestone);at.setHours(9,0,0,0);
        candidates.push({key:examHash('day|'+at.getTime()+'|'+milestone),subjects:[subject.name],daysBefore:milestone,atMillis:at.getTime(),milestoneKeys:[tierKey]});
      }else if(daysLeft===1&&milestone===1||daysLeft>=2&&daysLeft<=3&&milestone===3||daysLeft>=4&&daysLeft<=7&&milestone===7) {
        candidates.push({key:examHash('due|'+daysLeft),subjects:[subject.name],daysBefore:daysLeft,atMillis:nowMillis,milestoneKeys:[tierKey]});
      }
    }
  }
  function grouped(items){const groups=new Map();for(const r of items){const old=groups.get(r.key);if(old){old.subjects=[...new Set([...old.subjects,...r.subjects])];old.milestoneKeys=[...new Set([...old.milestoneKeys,...r.milestoneKeys])];}else groups.set(r.key,{...r});}return [...groups.values()];}
  const future=grouped(candidates.filter(r=>r.atMillis>nowMillis)),due=grouped(candidates.filter(r=>r.atMillis<=nowMillis));
  return {schedule:future.filter(r=>!scheduled.has(r.key)),due,cancel:[...scheduled].filter(k=>!future.some(r=>r.key===k))};
}
function examAssistantText(pack,days,examCount,multiple=false) {
  const useCase=multiple||examCount>1?11:days===1?8:days===7?6:days===3?7:9;
  const texts=BPA_ASSISTANT_CATALOG[pack]||BPA_ASSISTANT_CATALOG.normal;
  const template=texts['U'+useCase]||BPA_ASSISTANT_CATALOG.normal['U'+useCase];
  return useCase===9?template.replace('X',String(days)):useCase===11?template.replace('X',String(days)).replace('N',String(examCount)):template;
}
async function scheduleExamReminders() {
  const current=preference('better_phenikaa_current_semester_v1');
  if(!current)return null;
  const ledger=readState('exam-reminders.json',{delivered:[],records:{}});
  const pending=await Notification.allPending(),actualDelivered=await Notification.allDelivered();
  const delivered=new Set(ledger.delivered);
  for(const n of actualDelivered)for(const key of (ledger.records[n.identifier]||{}).milestoneKeys||[])delivered.add(key);
  const prefix='bpa.exam.',scheduled=new Set(pending.filter(n=>n.identifier.startsWith(prefix)).map(n=>n.identifier.slice(prefix.length)));
  let plan=examReminderPlan(current,Date.now(),scheduled,delivered);
  const pack=preference('better_phenikaa_assistant_pack_v1')||'normal';
  async function publish(id,subjects,days,at,keys) {
    const n=new Notification();n.identifier=id;n.threadIdentifier='bpa.exam';n.title='Nhắc lịch thi';n.sound='default';
    n.body=examAssistantText(pack,Math.min(...days),subjects.length,days.size>1);
    n.openURL=actionURL('open','overview','main');if(at)n.setTriggerDate(new Date(at));
    ledger.records[id]={milestoneKeys:keys};writeState('exam-reminders.json',{...ledger,delivered:[...delivered]});
    await n.schedule();
  }
  if(plan.due.length) {
    const subjects=[...new Set(plan.due.flatMap(r=>r.subjects))],days=new Set(plan.due.map(r=>r.daysBefore)),keys=[...new Set(plan.due.flatMap(r=>r.milestoneKeys))];
    await publish(prefix+'due',subjects,days,null,keys);
    for(const key of keys)delivered.add(key);
    plan=examReminderPlan(current,Date.now(),scheduled,delivered);
  }
  await Notification.removePending(plan.cancel.map(k=>prefix+k));
  for(const reminder of plan.schedule)await publish(prefix+reminder.key,reminder.subjects,new Set([reminder.daysBefore]),reminder.atMillis,reminder.milestoneKeys);
  writeState('exam-reminders.json',{...ledger,delivered:[...delivered]});
  return null;
}
function assistantTemplate(useCase) {
  const pack=preference('better_phenikaa_assistant_pack_v1')||'normal';
  return (BPA_ASSISTANT_CATALOG[pack]||BPA_ASSISTANT_CATALOG.normal)['U'+useCase]||BPA_ASSISTANT_CATALOG.normal['U'+useCase];
}
function examChangeEvent(difference) {
  if(!difference||difference.initial)return null;
  const changed=key=>['added','removed','modified'].reduce((sum,k)=>sum+(difference[key]?.[k]||0),0)>0;
  const study=changed('study'),exam=changed('exams');
  return study&&exam?5:study?3:exam?4:null;
}
async function assistantNotification(useCase) {
  if(![1,3,4,5,6,7,8,9,11].includes(useCase))return false;
  const n=new Notification();n.identifier=useCase===1?'bpa.stale':useCase<=5?'bpa.changes':'bpa.exam.test';
  n.threadIdentifier=n.identifier;n.sound='default';n.title=useCase===1?'Đã lâu chưa đồng bộ':useCase<=5?'Lịch học kỳ thay đổi':'Nhắc lịch thi';
  n.body=assistantTemplate(useCase).replace('X','5').replace('N','2');n.openURL=actionURL('open','overview','main');
  await n.schedule();return true;
}
// Original Android policy: strictly more than two days since success, then
// once per local day at 09:00. A native daily Automation runs maintenance.
function staleReminderDue(now,success,lastRequested) {
  if(!(success>0)||now-success<=2*86400000)return false;
  return !(lastRequested>success)||isoDay(new Date(now))>isoDay(new Date(lastRequested));
}
async function scheduleStaleReminder(reset=false) {
  const success=readState('sync-status.json',{lastSuccessAtMillis:0}).lastSuccessAtMillis;
  if(!(success>0)||!preference('better_phenikaa_current_semester_v1'))return;
  const now=Date.now(),firstAt=success+2*86400000+1;
  let ledger=readState('sync-stale.json',{});
  if(reset||ledger.success!==success) {
    const pending=await Notification.allPending(),delivered=await Notification.allDelivered();
    await Notification.removePending(pending.filter(n=>n.identifier.startsWith('bpa.stale.')).map(n=>n.identifier));
    await Notification.removeDelivered(delivered.filter(n=>n.identifier.startsWith('bpa.stale.')).map(n=>n.identifier));
    ledger={success,lastRequested:0};
  }
  if(ledger.lastRequested&& !staleReminderDue(now,success,ledger.lastRequested))return;
  const at=now<firstAt?firstAt:now;
  const n=new Notification();n.identifier='bpa.stale.'+isoDay(new Date(at));n.threadIdentifier='bpa.stale';
  n.title='Đã lâu chưa đồng bộ';n.body=assistantTemplate(1);n.sound='default';n.openURL=actionURL('open','overview','main');
  if(at>now)n.setTriggerDate(new Date(at));
  await n.schedule();
  // This is a scheduling receipt, never a claim that the phone displayed it.
  writeState('sync-stale.json',{success,lastRequested:at,status:'requested'});
}
async function reminderMaintenance() {

  await scheduleStaleReminder();await scheduleExamReminders();
  return {status:'BPA_REMINDERS_REQUESTED'};
}
async function ensureReminderAutomation() {
  if(readState('reminder-automation.json',{}).guideAcknowledged)return;
  const a=new Alert();a.title='Chuẩn bị nhắc lịch';
  a.message='Trong Phím tắt → Tự động hóa, thêm Thời gian trong ngày: 09:00, hằng ngày, chạy ngay. Thêm tác vụ Scriptable “Run Script”, chọn “BPA — Nhắc lịch” và tắt “Run in App”. Sau khi tạo, quay lại BPA. Tác vụ này chỉ nhắc lịch, không tự đồng bộ QLĐT.';
  a.addAction('Đã tạo, tiếp tục');a.addAction('Mở Phím tắt');a.addCancelAction('Để sau');
  const choice=await a.presentAlert();
  if(choice===1){Safari.open('shortcuts://');return;}
  if(choice===0)writeState('reminder-automation.json',{guideAcknowledged:true});
}
async function handle(){const a=new Alert();a.title='Nhắc lịch';a.addAction('Bật / làm mới nhắc lịch thi');a.addAction('Chọn trợ lý');a.addAction('Lịch chạy hằng ngày');a.addDestructiveAction('Tắt nhắc lịch');a.addCancelAction('Đóng');const n=await a.presentAlert();if(n===0){writeState('reminders-enabled.json',true);await reminderMaintenance();ctx.installRunner('reminders');}if(n===1){const packs=['normal','serious','playful','affectionate','flirtatious','academic','blunt','cultivation'],names=['Bình thường','Nghiêm túc','Vui vẻ','Quan tâm','Mập mờ','Học thuật','Mỏ hỗn','Tu tiên'],x=new Alert();x.title='Trợ lý';for(const s of names)x.addAction(s);x.addCancelAction('Đóng');const i=await x.presentAlert();if(i>=0)ctx.setPreference('better_phenikaa_assistant_pack_v1',packs[i]);}if(n===2){ctx.installRunner('reminders');await ensureReminderAutomation();}if(n===3){writeState('reminders-enabled.json',false);await Notification.removePending((await Notification.allPending()).filter(n=>n.identifier.startsWith('bpa.exam.')||n.identifier.startsWith('bpa.stale.')).map(n=>n.identifier));}}
return {handle,async uninstall(){writeState('reminders-enabled.json',false);await Notification.removePending((await Notification.allPending()).filter(n=>n.identifier.startsWith('bpa.exam.')||n.identifier.startsWith('bpa.stale.')).map(n=>n.identifier));},maintenance:reminderMaintenance,async afterSyncMaintenance(){if(readState('reminders-enabled.json',false))await reminderMaintenance();},async afterSync(){if(readState('reminders-enabled.json',false)){writeState('sync-status.json',{lastSuccessAtMillis:Date.now()});await scheduleStaleReminder(true);await scheduleExamReminders();}}};
}
module.exports={create};
