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

const REGISTRATION_SCRIPT="\n    (function () {\n      const attempt = 1;\n      const bridge = window.flutter_inappwebview;\n      const system = bpaSystem;\n      if (!bridge || typeof bridge.callHandler !== 'function') return 'BRIDGE_MISSING';\n      const send = (handler, value) => bridge.callHandler(handler, attempt, value);\n      let done = false;\n      const fail = (code, diagnostic) => {\n        if (done) return;\n        done = true;\n        if (diagnostic) {\n          bridge.callHandler('betterPhenikaaRegistrationError', attempt,\n            code, JSON.stringify(diagnostic));\n        } else {\n          send('betterPhenikaaRegistrationError', code);\n        }\n      };\n      const stage = value => send('betterPhenikaaRegistrationStage', value);\n      const id = value => {\n        const text = String(value == null ? '' : value).trim();\n        return /^[A-Za-z0-9_-]{1,64}$/.test(text) ? text : '[redacted]';\n      };\n      const label = value => {\n        if (value == null) return null;\n        const text = String(value).trim();\n        if (/token|cookie|authorization|session|bearer|password|mat.?khau/i.test(text))\n          return '[redacted]';\n        return text.slice(0, 160)\n          .replace(/[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}/g, '[email]')\n          .replace(/(?:\\+?\\d[\\d\\s.-]{6,}\\d)/g, '[number]');\n      };\n      try { stage('scriptStart'); } catch (_) { return 'BRIDGE_EXCEPTION'; }\n      if (!bridge || !system || !system.userId || system.iM == null ||\n          typeof system.makeRequest !== 'function') {\n        fail('SESSION_EXPIRED');\n        return 'SESSION_EXPIRED';\n      }\n      const call = (action, func, data, next) => {\n        const payload = Object.assign({action, func, iM: system.iM,\n          strQLSV_NguoiHoc_Id: system.userId}, data);\n        try {\n          system.makeRequest({\n            success: response => {\n              if (done) return;\n              if (func === 'pkg_dangkyhoc_thongtin.LayThoiGianDangKyCaNhan') {\n                stage('semesterResponse');\n              }\n              if (!response || response.Success !== true || !Array.isArray(response.Data)) {\n                fail('INVALID_RESPONSE');\n                return;\n              }\n              try { next(response); } catch (_) { fail('INVALID_RESPONSE'); }\n            },\n            error: () => fail('NETWORK_ERROR'),\n            type: 'POST', action, contentType: true, data: payload, fakedb: []\n          }, false, false, false, null);\n        } catch (_) { fail('REQUEST_ERROR'); }\n      };\n      stage('semesterRequest');\n      call('DKH_ThongTin_MH/DSA4FSkuKAYoIC8FIC8mCjgCIA8pIC8P',\n        'pkg_dangkyhoc_thongtin.LayThoiGianDangKyCaNhan',\n        {strDaoTao_ThoiGianDaoTao_Id: null}, semesters => {\n          const choices = semesters.Data.map(row => {\n            const match = /^(\\d{4})_(\\d{4})_(\\d+)$/.exec(row.THOIGIAN);\n            return match && Number(match[2]) === Number(match[1]) + 1 && row.ID\n              ? {id: row.ID, name: row.THOIGIAN, year: Number(match[1]), term: Number(match[3])}\n              : null;\n          }).filter(Boolean).sort((a, b) => b.year - a.year || b.term - a.term);\n          if (!choices.length) { fail('NO_SEMESTER'); return; }\n          const latest = choices[0];\n          stage('semesterPlan');\n          call('DKH_ThongTin_MH/DSA4BRIKJAkuICIpBSAvJgo4AiAPKSAv',\n            'pkg_dangkyhoc_thongtin.LayDSKeHoachDangKyCaNhan',\n            {strDaoTao_ThoiGianDaoTao_Id: latest.id}, plans => {\n              const rows = plans.Data;\n              const dropdown = document.querySelector('#dropSearch_KeHoach');\n              const diagnostic = {\n                version: 1,\n                latestSemesterId: id(latest.id),\n                latestSemesterName: label(latest.name),\n                recordCount: rows.length,\n                distinctIdCount: new Set(rows.map(row => String(row && row.ID || '').trim())\n                  .filter(Boolean)).size,\n                records: rows.slice(0, 200).map((row, index) => ({\n                  index,\n                  ID: id(row && row.ID),\n                  DAOTAO_THOIGIANDAOTAO_ID: id(row && row.DAOTAO_THOIGIANDAOTAO_ID),\n                  MAKEHOACH: label(row && row.MAKEHOACH),\n                  TENKEHOACH: label(row && row.TENKEHOACH),\n                  TRANGTHAI_ID: id(row && row.TRANGTHAI_ID),\n                  HIEULUC: row && typeof row.HIEULUC === 'boolean' ? row.HIEULUC : null,\n                  otherKeys: row && typeof row === 'object'\n                    ? Object.keys(row).filter(key => ![\n                      'ID', 'DAOTAO_THOIGIANDAOTAO_ID', 'MAKEHOACH',\n                      'TENKEHOACH', 'TRANGTHAI_ID', 'HIEULUC'\n                    ].includes(key)).slice(0, 100) : []\n                })),\n                dropdown: dropdown ? {\n                  selectedId: id(dropdown.value),\n                  options: [...dropdown.options].slice(0, 200).map((option, index) => ({\n                    index, ID: id(option.value), label: label(option.text),\n                    selected: option.selected\n                  }))\n                } : null\n              };\n              const matchingPlans = rows.filter(row => row && row.ID &&\n                (String(row.MAKEHOACH || '').trim() === latest.name ||\n                  String(row.MAKEHOACH || '').trim().startsWith(latest.name + ',')));\n              const planIds = [...new Set(matchingPlans\n                .map(row => String(row.ID || '').trim())\n                .filter(Boolean))];\n              const planSemesterIds = [...new Set(matchingPlans\n                .map(row => String(row.DAOTAO_THOIGIANDAOTAO_ID || '').trim())\n                .filter(Boolean))];\n              diagnostic.matchingRecordIndexes = rows.flatMap((row, index) =>\n                matchingPlans.includes(row) ? [index] : []);\n              diagnostic.computedPlanIdCount = planIds.length;\n              diagnostic.computedPlanIds = planIds.slice(0, 200).map(id);\n              if (planIds.length !== 1 || planSemesterIds.length !== 1) {\n                fail('PLAN_AMBIGUOUS', diagnostic); return;\n              }\n              stage('subjects');\n              call('DKH_Chung_MH/DSA4CiQ1EDQgBSAvJgo4DS4xCS4iESkgLwPP',\n                'pkg_dangkyhoc_chung.LayKetQuaDangKyLopHocPhan',\n                {strDaoTao_ChuongTrinh_Id: '',\n                  strDangKy_KeHoachDangKy_Id: planIds[0],\n                  strNguoiThucHien_Id: system.userId,\n                  strDaoTao_ThoiGianDaoTao_Id: latest.id}, registrations => {\n                  stage('verification');\n                  done = true;\n                  send('betterPhenikaaRegistrationResult',\n                    JSON.stringify({semesters, plans, registrations, userId: system.userId}));\n                });\n            });\n        });\n      return 'REG_SCRIPT_SUBMITTED';\n    })();\n  ";
const SCHEDULE_SCRIPT="\n      (function () {\n        function scheduleStage(value) {\n          try {\n            window.flutter_inappwebview.callHandler(\n              'betterPhenikaaScheduleStage', 1, value\n            );\n          } catch (_) {}\n        }\n\n        try {\n          if (!(window.flutter_inappwebview &&\n                typeof window.flutter_inappwebview.callHandler === 'function')) {\n            return 'bridge_unavailable';\n          }\n          if (!(window.edu && edu.system && edu.system.userId &&\n                edu.system.iM != null &&\n                typeof edu.system.makeRequest === 'function')) {\n            return 'portal_unavailable';\n          }\n\n          var chunks = __BPA_CHUNKS__;\n          var concurrency = 8;\n          var nextIndex = 0;\n          var active = 0;\n          var completed = 0;\n          var failed = false;\n          var merged = [];\n\n          function finishIfDone() {\n            if (failed || completed !== chunks.length) return;\n            scheduleStage('success');\n            window.flutter_inappwebview.callHandler(\n              'betterPhenikaaSyncResult',\n              1,\n              JSON.stringify({\n                name: '',\n                response: {\n                  Success: true,\n                  Data: merged,\n                  Message: '',\n                  Pager: null,\n                  Id: null\n                }\n              })\n            );\n          }\n\n          function launchMore() {\n            if (failed) return;\n            while (active < concurrency && nextIndex < chunks.length) {\n              (function (index) {\n                var chunk = chunks[index];\n                nextIndex += 1;\n                active += 1;\n\n                var requestData = {\n                  action: 'SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv',\n                  func: 'pkg_congthongtin_hssv_thongtin.LayDSLichCaNhan',\n                  iM: edu.system.iM,\n                  strQLSV_NguoiHoc_Id: edu.system.userId,\n                  strNgayBatDau: chunk.start,\n                  strNgayKetThuc: chunk.end\n                };\n\n                bpaSystem.makeRequest({\n                  success: function (response) {\n                    if (failed) return;\n                    active -= 1;\n                    completed += 1;\n\n                    if (!response || response.Success !== true ||\n                        !Array.isArray(response.Data)) {\n                      failed = true;\n                      scheduleStage('error');\n                      window.flutter_inappwebview.callHandler(\n                        'betterPhenikaaSyncError',\n                        1,\n                        'QLĐT trả dữ liệu lịch không hợp lệ.'\n                      );\n                      return;\n                    }\n\n                    for (var i = 0; i < response.Data.length; i++) {\n                      merged.push(response.Data[i]);\n                    }\n                    launchMore();\n                    finishIfDone();\n                  },\n                  error: function () {\n                    if (failed) return;\n                    failed = true;\n                    active -= 1;\n                    scheduleStage('error');\n                    window.flutter_inappwebview.callHandler(\n                      'betterPhenikaaSyncError',\n                      1,\n                      'QLĐT báo lỗi khi tải lịch cá nhân.'\n                    );\n                  },\n                  type: 'POST',\n                  action: requestData.action,\n                  contentType: true,\n                  data: requestData,\n                  fakedb: []\n                }, false, false, false, null);\n              })(nextIndex);\n            }\n            finishIfDone();\n          }\n\n          scheduleStage('request');\n          launchMore();\n          return 'request_dispatched';\n        } catch (error) {\n          scheduleStage('exception');\n          window.flutter_inappwebview.callHandler(\n            'betterPhenikaaSyncError',\n            1,\n            'Không thực hiện được yêu cầu lịch QLĐT.'\n          );\n          return 'request_exception';\n        }\n      })();\n    ";
// Dispatch through the live university page's authenticated transport. There is
// exactly one outstanding callback evaluation and its completion is captured.
async function portalCall(web,evaluate,source,resultHandler,errorHandler,check){
 check();const code=`(()=>{
  const done=completion,previousBridge=window.flutter_inappwebview;
  let finished=false;
  const original=window.edu&&edu.system;
  function finish(value){if(finished)return;finished=true;clearTimeout(timer);window.flutter_inappwebview=previousBridge;done(value);}
  const timer=setTimeout(()=>finish({error:'QLDT_REQUEST_TIMEOUT'}),20000);
  if(!original||typeof original.makeRequest!=='function'){finish({error:'SESSION_EXPIRED'});return;}
  const bpaSystem=Object.create(original);
  bpaSystem.makeRequest=(options,...rest)=>{if(finished)return;const guarded={...options,success:value=>{if(!finished)options.success(value);},error:(...args)=>{if(!finished&&options.error)options.error(...args);}};return original.makeRequest.call(original,guarded,...rest);};
  window.flutter_inappwebview={callHandler(name,attempt,value){
   if(name===${JSON.stringify(resultHandler)})finish({value});
   else if(name===${JSON.stringify(errorHandler)})finish({error:String(value||'QLDT_ERROR')});
   return Promise.resolve(null);
  }};
  try{const result=${source.trim().replace(/;$/,'')};if(['SESSION_EXPIRED','BRIDGE_MISSING','BRIDGE_EXCEPTION','bridge_unavailable','portal_unavailable','request_exception'].includes(result))finish({error:result});}catch(error){finish({error:'QLDT_PAGE_ERROR'});}
 })();`;
 const result=await evaluate(web,code,true,25000);check();
 if(!result||result.error)throw Object.assign(Error(result?.error==='QLDT_REQUEST_TIMEOUT'?'QLĐT chưa trả dữ liệu sau 20 giây. Lịch cũ được giữ lại.':result?.error==='SESSION_EXPIRED'?'Phiên trong trang QLĐT chưa sẵn sàng.':('QLĐT: '+(result?.error||'Không có kết quả'))),{code:result?.error||'qldt_result'});
 return JSON.parse(result.value);
}
async function fetchInPortal(web,evaluate,check,stage=()=>{}){
 stage('registration');
 const raw=await portalCall(web,evaluate,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',check);
 const reg=BPACore.registration(raw),chunks=BPACore.chunksFor(reg);check();stage('schedule');
 const source=SCHEDULE_SCRIPT.replace('__BPA_CHUNKS__',JSON.stringify(chunks));
 const value=chunks.length?await portalCall(web,evaluate,source,'betterPhenikaaSyncResult','betterPhenikaaSyncError',check):{response:{Success:true,Data:[]}};
 check();stage('verification');const semester=BPACore.buildSemester(reg,BPACore.parseSchedule(value.response));
 if(!semester.displayName)throw Error('QLĐT chưa có tên sinh viên đã xác minh.');
 if(!chunks.length)throw Error('Chưa xác định được ngày bắt đầu học kỳ.');
 return {semester,termStartedAt:localISO(BPACore.vnDate(chunks[0].start))};
}

module.exports={probeScript:"\n          (function () {\n            try {\n              var s = window.edu && edu.system;\n              if (!s || !s.userId || s.iM == null || !s.tokenJWT ||\n                  typeof s.makeRequest !== 'function') {\n                return null;\n              }\n              return JSON.stringify({\n                tokenJWT: String(s.tokenJWT),\n                userId: String(s.userId),\n                iM: String(s.iM),\n                appId: String(s.appId || ''),\n                strChucNangId: String(s.strChucNang_Id || ''),\n                cookie: String(document.cookie || ''),\n                name: ''\n              });\n            } catch (_) {\n              return null;\n            }\n          })();\n        ",retain:BPACore.retain,fetch:fetchInPortal};
