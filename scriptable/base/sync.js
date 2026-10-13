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
if (typeof module !== 'undefined') module.exports=BPACore;

function errorCode(code,message){return Object.assign(Error(message),{code});}
let activeCheck=()=>{};
// Request wire format is ported from qldt_native_transport.dart, including
// its A/B XOR+UTF-8 envelope. Session material is stored only in Keychain.
function qldtEncode(text,key) {
  let cipher='';for(let i=0;i<text.length;i++)cipher+=String.fromCharCode(text.charCodeAt(i)^key.charCodeAt(i%key.length));
  if(typeof Data!=='undefined')return Data.fromString(cipher).toBase64String();
  return Buffer.from(cipher,'utf8').toString('base64');
}
function qldtDecode(encoded,key) {
  const cipher=typeof Data!=='undefined'?Data.fromBase64String(encoded).toRawString():Buffer.from(encoded,'base64').toString('utf8');
  if(typeof cipher!=='string')throw errorCode('qldt_encoding','QLĐT trả envelope không phải UTF-8.');
  let text='';for(let i=0;i<cipher.length;i++)text+=String.fromCharCode(cipher.charCodeAt(i)^key.charCodeAt(i%key.length));return text;
}
async function qldtPost(session,action,func,extra) {
  activeCheck();
  const data={action,func,iM:session.iM,strQLSV_NguoiHoc_Id:session.userId,...extra};
  for(const [key,value]of Object.entries({strChucNang_Id:session.strChucNangId,strNguoiThucHien_Id:session.userId,strVaiTroDangNhap_Id:session.appId,strChucNangHeThong_Id:session.strChucNangId}))if(!(key in data))data[key]=value;
  const prefix=action.slice(0,action.indexOf('_')),path=prefix==='DKH'?'/dangkyhocapi3/api':prefix==='SV'?'/sinhvienapi3/api':null;
  if(!path)throw errorCode('qldt_route','API prefix không hợp lệ.');
  const request=new Request('https://qldtbeta.phenikaa-uni.edu.vn'+path+'/'+action);
  request.method='POST';request.timeoutInterval=5;
  request.headers={Authorization:'Bearer '+session.tokenJWT,Accept:'application/json, text/javascript, */*; q=0.01','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'};
  if(session.cookie)request.headers.Cookie=session.cookie;
  const key=action.slice(action.indexOf('/')+1);
  request.body='A='+encodeURIComponent(qldtEncode(JSON.stringify(data),key));
  // Inspect status before parsing: login redirects and 503 pages may be HTML.
  const text=await request.loadString(),status=request.response.statusCode;activeCheck();
  if(status===401||status===403)throw errorCode('qldt_session_expired','Phiên QLĐT đã hết hạn.');
  if(status!==200)throw errorCode('qldt_http','HTTP '+status);
  let result;
  try {result=JSON.parse(text);}catch(_){throw errorCode('qldt_response','QLĐT không trả JSON hợp lệ.');}
  if(result.Success!==true)throw errorCode('qldt_response','QLĐT Success != true');
  if(result.Data&&typeof result.Data.B==='string')result.Data=JSON.parse(qldtDecode(result.Data.B,session.iM));
  if(!Array.isArray(result.Data))throw errorCode('qldt_response','QLĐT Data không phải danh sách.');
  return result;
}
async function fetchNativeQldt(session) {
  const semesters=await qldtPost(session,'DKH_ThongTin_MH/DSA4FSkuKAYoIC8FIC8mCjgCIA8pIC8P','pkg_dangkyhoc_thongtin.LayThoiGianDangKyCaNhan',{strDaoTao_ThoiGianDaoTao_Id:null});
  const candidates=semesters.Data.map(r=>{const m=/^(\d{4})_(\d{4})_(\d+)$/.exec(String(r.THOIGIAN||''));return m&&+m[2]===+m[1]+1&&r.ID?{id:r.ID,name:r.THOIGIAN,year:+m[1],term:+m[3]}:null;}).filter(Boolean).sort((a,b)=>b.year-a.year||b.term-a.term);
  if(!candidates.length)throw errorCode('qldt_verification','NO_SEMESTER');
  const latest=candidates[0],plans=await qldtPost(session,'DKH_ThongTin_MH/DSA4BRIKJAkuICIpBSAvJgo4AiAPKSAv','pkg_dangkyhoc_thongtin.LayDSKeHoachDangKyCaNhan',{strDaoTao_ThoiGianDaoTao_Id:latest.id});
  const matched=plans.Data.filter(r=>String(r.MAKEHOACH||'').trim()===latest.name||String(r.MAKEHOACH||'').trim().startsWith(latest.name+','));
  const ids=[...new Set(matched.map(r=>String(r.ID||'').trim()).filter(Boolean))],termIds=[...new Set(matched.map(r=>String(r.DAOTAO_THOIGIANDAOTAO_ID||'').trim()).filter(Boolean))];
  if(ids.length!==1||termIds.length!==1)throw errorCode('qldt_verification','PLAN_AMBIGUOUS');
  const registrations=await qldtPost(session,'DKH_Chung_MH/DSA4CiQ1EDQgBSAvJgo4DS4xCS4iESkgLwPP','pkg_dangkyhoc_chung.LayKetQuaDangKyLopHocPhan',{strDaoTao_ChuongTrinh_Id:'',strDangKy_KeHoachDangKy_Id:ids[0],strNguoiThucHien_Id:session.userId,strDaoTao_ThoiGianDaoTao_Id:latest.id});
  const raw={semesters,plans,registrations,userId:session.userId},reg=BPACore.registration(raw),chunks=BPACore.chunksFor(reg),replies=new Array(chunks.length);let next=0,failure=null;
  await Promise.all(Array.from({length:Math.min(8,chunks.length)},async()=>{
    while(!failure&&next<chunks.length){
      const i=next++,chunk=chunks[i];
      try {replies[i]=await qldtPost(session,'SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv','pkg_congthongtin_hssv_thongtin.LayDSLichCaNhan',{strNgayBatDau:chunk.start,strNgayKetThuc:chunk.end});}
      catch(error){if(!failure)failure=error;}
    }
  }));
  // Drain the issued requests before allowing retry; no orphan workers may
  // continue dispatching another semester after the caller receives failure.
  if(failure)throw failure;
  const semester=BPACore.buildSemester(reg,BPACore.parseSchedule({Success:true,Data:replies.flatMap(r=>r.Data)}));
  if(!semester.displayName)throw errorCode('qldt_verification','QLDT_CANONICAL_NAME_MISSING');
  if(!chunks.length)throw errorCode('qldt_verification','Không xác định được môn đầu học kỳ.');
  return {semester,termStartedAt:localISO(BPACore.vnDate(chunks[0].start))};
}

module.exports={probeScript:"\n          (function () {\n            try {\n              var s = window.edu && edu.system;\n              if (!s || !s.userId || s.iM == null || !s.tokenJWT ||\n                  typeof s.makeRequest !== 'function') {\n                return null;\n              }\n              return JSON.stringify({\n                tokenJWT: String(s.tokenJWT),\n                userId: String(s.userId),\n                iM: String(s.iM),\n                appId: String(s.appId || ''),\n                strChucNangId: String(s.strChucNang_Id || ''),\n                cookie: String(document.cookie || ''),\n                name: ''\n              });\n            } catch (_) {\n              return null;\n            }\n          })();\n        ",retain:BPACore.retain,async fetch(session,check){activeCheck=check;try{check();return await fetchNativeQldt(session);}finally{activeCheck=()=>{};}}};
