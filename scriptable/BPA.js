// Variables used by Scriptable.
// icon-color: deep-blue; icon-glyph: calendar-alt;
// BPA 1.6 — original Flutter UI + Scriptable bridge.
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

const REGISTRATION_SCRIPT="\n    (function () {\n      const attempt = 1;\n      const bridge = window.flutter_inappwebview;\n      const system = window.edu && edu.system;\n      if (!bridge || typeof bridge.callHandler !== 'function') return 'BRIDGE_MISSING';\n      const send = (handler, value) => bridge.callHandler(handler, attempt, value);\n      let done = false;\n      const fail = (code, diagnostic) => {\n        if (done) return;\n        done = true;\n        if (diagnostic) {\n          bridge.callHandler('betterPhenikaaRegistrationError', attempt,\n            code, JSON.stringify(diagnostic));\n        } else {\n          send('betterPhenikaaRegistrationError', code);\n        }\n      };\n      const stage = value => send('betterPhenikaaRegistrationStage', value);\n      const id = value => {\n        const text = String(value == null ? '' : value).trim();\n        return /^[A-Za-z0-9_-]{1,64}$/.test(text) ? text : '[redacted]';\n      };\n      const label = value => {\n        if (value == null) return null;\n        const text = String(value).trim();\n        if (/token|cookie|authorization|session|bearer|password|mat.?khau/i.test(text))\n          return '[redacted]';\n        return text.slice(0, 160)\n          .replace(/[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}/g, '[email]')\n          .replace(/(?:\\+?\\d[\\d\\s.-]{6,}\\d)/g, '[number]');\n      };\n      try { stage('scriptStart'); } catch (_) { return 'BRIDGE_EXCEPTION'; }\n      if (!bridge || !system || !system.userId || system.iM == null ||\n          typeof system.makeRequest !== 'function') {\n        fail('SESSION_EXPIRED');\n        return 'SESSION_EXPIRED';\n      }\n      const call = (action, func, data, next) => {\n        const payload = Object.assign({action, func, iM: system.iM,\n          strQLSV_NguoiHoc_Id: system.userId}, data);\n        try {\n          system.makeRequest({\n            success: response => {\n              if (done) return;\n              if (func === 'pkg_dangkyhoc_thongtin.LayThoiGianDangKyCaNhan') {\n                stage('semesterResponse');\n              }\n              if (!response || response.Success !== true || !Array.isArray(response.Data)) {\n                fail('INVALID_RESPONSE');\n                return;\n              }\n              try { next(response); } catch (_) { fail('INVALID_RESPONSE'); }\n            },\n            error: () => fail('NETWORK_ERROR'),\n            type: 'POST', action, contentType: true, data: payload, fakedb: []\n          }, false, false, false, null);\n        } catch (_) { fail('REQUEST_ERROR'); }\n      };\n      stage('semesterRequest');\n      call('DKH_ThongTin_MH/DSA4FSkuKAYoIC8FIC8mCjgCIA8pIC8P',\n        'pkg_dangkyhoc_thongtin.LayThoiGianDangKyCaNhan',\n        {strDaoTao_ThoiGianDaoTao_Id: null}, semesters => {\n          const choices = semesters.Data.map(row => {\n            const match = /^(\\d{4})_(\\d{4})_(\\d+)$/.exec(row.THOIGIAN);\n            return match && Number(match[2]) === Number(match[1]) + 1 && row.ID\n              ? {id: row.ID, name: row.THOIGIAN, year: Number(match[1]), term: Number(match[3])}\n              : null;\n          }).filter(Boolean).sort((a, b) => b.year - a.year || b.term - a.term);\n          if (!choices.length) { fail('NO_SEMESTER'); return; }\n          const latest = choices[0];\n          stage('semesterPlan');\n          call('DKH_ThongTin_MH/DSA4BRIKJAkuICIpBSAvJgo4AiAPKSAv',\n            'pkg_dangkyhoc_thongtin.LayDSKeHoachDangKyCaNhan',\n            {strDaoTao_ThoiGianDaoTao_Id: latest.id}, plans => {\n              const rows = plans.Data;\n              const dropdown = document.querySelector('#dropSearch_KeHoach');\n              const diagnostic = {\n                version: 1,\n                latestSemesterId: id(latest.id),\n                latestSemesterName: label(latest.name),\n                recordCount: rows.length,\n                distinctIdCount: new Set(rows.map(row => String(row && row.ID || '').trim())\n                  .filter(Boolean)).size,\n                records: rows.slice(0, 200).map((row, index) => ({\n                  index,\n                  ID: id(row && row.ID),\n                  DAOTAO_THOIGIANDAOTAO_ID: id(row && row.DAOTAO_THOIGIANDAOTAO_ID),\n                  MAKEHOACH: label(row && row.MAKEHOACH),\n                  TENKEHOACH: label(row && row.TENKEHOACH),\n                  TRANGTHAI_ID: id(row && row.TRANGTHAI_ID),\n                  HIEULUC: row && typeof row.HIEULUC === 'boolean' ? row.HIEULUC : null,\n                  otherKeys: row && typeof row === 'object'\n                    ? Object.keys(row).filter(key => ![\n                      'ID', 'DAOTAO_THOIGIANDAOTAO_ID', 'MAKEHOACH',\n                      'TENKEHOACH', 'TRANGTHAI_ID', 'HIEULUC'\n                    ].includes(key)).slice(0, 100) : []\n                })),\n                dropdown: dropdown ? {\n                  selectedId: id(dropdown.value),\n                  options: [...dropdown.options].slice(0, 200).map((option, index) => ({\n                    index, ID: id(option.value), label: label(option.text),\n                    selected: option.selected\n                  }))\n                } : null\n              };\n              const matchingPlans = rows.filter(row => row && row.ID &&\n                (String(row.MAKEHOACH || '').trim() === latest.name ||\n                  String(row.MAKEHOACH || '').trim().startsWith(latest.name + ',')));\n              const planIds = [...new Set(matchingPlans\n                .map(row => String(row.ID || '').trim())\n                .filter(Boolean))];\n              const planSemesterIds = [...new Set(matchingPlans\n                .map(row => String(row.DAOTAO_THOIGIANDAOTAO_ID || '').trim())\n                .filter(Boolean))];\n              diagnostic.matchingRecordIndexes = rows.flatMap((row, index) =>\n                matchingPlans.includes(row) ? [index] : []);\n              diagnostic.computedPlanIdCount = planIds.length;\n              diagnostic.computedPlanIds = planIds.slice(0, 200).map(id);\n              if (planIds.length !== 1 || planSemesterIds.length !== 1) {\n                fail('PLAN_AMBIGUOUS', diagnostic); return;\n              }\n              stage('subjects');\n              call('DKH_Chung_MH/DSA4CiQ1EDQgBSAvJgo4DS4xCS4iESkgLwPP',\n                'pkg_dangkyhoc_chung.LayKetQuaDangKyLopHocPhan',\n                {strDaoTao_ChuongTrinh_Id: '',\n                  strDangKy_KeHoachDangKy_Id: planIds[0],\n                  strNguoiThucHien_Id: system.userId,\n                  strDaoTao_ThoiGianDaoTao_Id: latest.id}, registrations => {\n                  stage('verification');\n                  done = true;\n                  send('betterPhenikaaRegistrationResult',\n                    JSON.stringify({semesters, plans, registrations, userId: system.userId}));\n                });\n            });\n        });\n      return 'REG_SCRIPT_SUBMITTED';\n    })();\n  ";
const SCHEDULE_SCRIPT="\n      (function () {\n        function scheduleStage(value) {\n          try {\n            window.flutter_inappwebview.callHandler(\n              'betterPhenikaaScheduleStage', 1, value\n            );\n          } catch (_) {}\n        }\n\n        try {\n          if (!(window.flutter_inappwebview &&\n                typeof window.flutter_inappwebview.callHandler === 'function')) {\n            return 'bridge_unavailable';\n          }\n          if (!(window.edu && edu.system && edu.system.userId &&\n                edu.system.iM != null &&\n                typeof edu.system.makeRequest === 'function')) {\n            return 'portal_unavailable';\n          }\n\n          var chunks = __BPA_CHUNKS__;\n          var concurrency = 8;\n          var nextIndex = 0;\n          var active = 0;\n          var completed = 0;\n          var failed = false;\n          var merged = [];\n\n          function finishIfDone() {\n            if (failed || completed !== chunks.length) return;\n            scheduleStage('success');\n            window.flutter_inappwebview.callHandler(\n              'betterPhenikaaSyncResult',\n              1,\n              JSON.stringify({\n                name: '',\n                response: {\n                  Success: true,\n                  Data: merged,\n                  Message: '',\n                  Pager: null,\n                  Id: null\n                }\n              })\n            );\n          }\n\n          function launchMore() {\n            if (failed) return;\n            while (active < concurrency && nextIndex < chunks.length) {\n              (function (index) {\n                var chunk = chunks[index];\n                nextIndex += 1;\n                active += 1;\n\n                var requestData = {\n                  action: 'SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv',\n                  func: 'pkg_congthongtin_hssv_thongtin.LayDSLichCaNhan',\n                  iM: edu.system.iM,\n                  strQLSV_NguoiHoc_Id: edu.system.userId,\n                  strNgayBatDau: chunk.start,\n                  strNgayKetThuc: chunk.end\n                };\n\n                edu.system.makeRequest({\n                  success: function (response) {\n                    if (failed) return;\n                    active -= 1;\n                    completed += 1;\n\n                    if (!response || response.Success !== true ||\n                        !Array.isArray(response.Data)) {\n                      failed = true;\n                      scheduleStage('error');\n                      window.flutter_inappwebview.callHandler(\n                        'betterPhenikaaSyncError',\n                        1,\n                        'QLĐT trả dữ liệu lịch không hợp lệ.'\n                      );\n                      return;\n                    }\n\n                    for (var i = 0; i < response.Data.length; i++) {\n                      merged.push(response.Data[i]);\n                    }\n                    launchMore();\n                    finishIfDone();\n                  },\n                  error: function () {\n                    if (failed) return;\n                    failed = true;\n                    active -= 1;\n                    scheduleStage('error');\n                    window.flutter_inappwebview.callHandler(\n                      'betterPhenikaaSyncError',\n                      1,\n                      'QLĐT báo lỗi khi tải lịch cá nhân.'\n                    );\n                  },\n                  type: 'POST',\n                  action: requestData.action,\n                  contentType: true,\n                  data: requestData,\n                  fakedb: []\n                }, false, false, false, null);\n              })(nextIndex);\n            }\n            finishIfDone();\n          }\n\n          scheduleStage('request');\n          launchMore();\n          return 'request_dispatched';\n        } catch (error) {\n          scheduleStage('exception');\n          window.flutter_inappwebview.callHandler(\n            'betterPhenikaaSyncError',\n            1,\n            'Không thực hiện được yêu cầu lịch QLĐT.'\n          );\n          return 'request_exception';\n        }\n      })();\n    ";
function scheduleScript(chunks) { return SCHEDULE_SCRIPT.replace("__BPA_CHUNKS__",JSON.stringify(chunks)); }
const SESSION_SCRIPT="\n          (function () {\n            try {\n              var s = window.edu && edu.system;\n              if (!s || !s.userId || s.iM == null || !s.tokenJWT ||\n                  typeof s.makeRequest !== 'function') {\n                return null;\n              }\n              return JSON.stringify({\n                tokenJWT: String(s.tokenJWT),\n                userId: String(s.userId),\n                iM: String(s.iM),\n                appId: String(s.appId || ''),\n                strChucNangId: String(s.strChucNang_Id || ''),\n                cookie: String(document.cookie || ''),\n                name: ''\n              });\n            } catch (_) {\n              return null;\n            }\n          })();\n        ";
// Runtime bundled with core.js and unmodified JavaScript from Android.
async function callPortal(web, source, resultHandler, errorHandler, timeoutMs) {
  const adapter = `(() => {
    let finished = false;
    const timer = setTimeout(() => finish({error:'TIMEOUT'}), ${timeoutMs});
    function finish(value) { if (finished) return; finished=true; clearTimeout(timer); completion(value); }
    window.flutter_inappwebview = {callHandler(name, attempt, value) {
      if (name === ${JSON.stringify(resultHandler)}) finish({value});
      if (name === ${JSON.stringify(errorHandler)}) finish({error:String(value || 'QLDT_ERROR')});
      return Promise.resolve(null);
    }};
    const status = ${source.trim().replace(/;$/, '')};
    if (['SESSION_EXPIRED','BRIDGE_MISSING','BRIDGE_EXCEPTION','bridge_unavailable','portal_unavailable','request_exception'].includes(status)) finish({error:status});
  })();`;
  const result = await web.evaluateJavaScript(adapter, true);
  if (!result || result.error) throw new Error(result && result.error || 'QLĐT không trả kết quả.');
  return JSON.parse(result.value);
}
function saveVerified(fm, path, value) {
  const temporary = path+'.pending', backup=path+'.backup';
  const serialized = JSON.stringify(value);
  fm.writeString(temporary,serialized);
  if (fm.readString(temporary) !== serialized) throw new Error('Không xác minh được bản lưu.');
  if (fm.fileExists(backup)) fm.remove(backup);
  const hadOld = fm.fileExists(path);
  if (hadOld) fm.move(path,backup);
  try { fm.move(temporary,path); }
  catch (error) {
    if (hadOld && fm.fileExists(backup) && !fm.fileExists(path)) fm.move(backup,path);
    throw error;
  }
  if (fm.fileExists(backup)) fm.remove(backup);
}
async function runBPA() {
  if (config.runsInWidget) {
    throw new Error('File này kiểm tra đồng bộ trong Scriptable; chưa có bộ 3 widget BPA.');
  }
  const notice = new Alert();
  notice.title='BPA • Scriptable • kiểm tra đồng bộ';
  notice.message='Đây là phần đồng bộ thật, chưa phải bản BPA hoàn chỉnh. Đăng nhập QLĐT trong màn hình tiếp theo. Khi đã vào cổng sinh viên, bấm Xong để lấy và xác minh lịch. Không đóng Scriptable trong lúc kiểm tra.';
  notice.addAction('Đăng nhập và đồng bộ'); notice.addCancelAction('Hủy');
  if (await notice.presentAlert() === -1) { Script.complete(); return; }
  const fm=FileManager.local(), directory=fm.joinPath(fm.documentsDirectory(),'BPA-Scriptable');
  if (!fm.fileExists(directory)) fm.createDirectory(directory,true);
  const path=fm.joinPath(directory,'semester-v1.json');
  // Recover the last validated data after a process interruption during rename.
  if (!fm.fileExists(path) && fm.fileExists(path+'.backup')) fm.move(path+'.backup',path);
  const old=fm.fileExists(path)?JSON.parse(fm.readString(path)):null;
  const web=new WebView();
  await web.loadURL('https://qldtbeta.phenikaa-uni.edu.vn/');
  await web.present(false);
  // Credentials remain within the university's login WebView. Never log them.
  const portalHost=await web.evaluateJavaScript('location.hostname',false);
  if (portalHost !== 'qldtbeta.phenikaa-uni.edu.vn') throw new Error('Chưa trở về cổng QLĐT sau đăng nhập.');
  const raw=await callPortal(web,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',20000);
  const reg=BPACore.registration(raw), chunks=BPACore.chunksFor(reg);
  const schedule=chunks.length ? await callPortal(web, scheduleScript(chunks), 'betterPhenikaaSyncResult','betterPhenikaaSyncError',20000) : {response:{Success:true,Data:[]}};
  const current=BPACore.buildSemester(reg,BPACore.parseSchedule(schedule.response));
  const state=BPACore.retain(old,current);
  // Android uses the earliest registered section, including when the first
  // personal lesson is later. Keep that range as the persisted term start.
  if (chunks.length && !(old && old.current && old.current.semesterId === current.semesterId && old.startedAt)) state.startedAt=localISO(BPACore.vnDate(chunks[0].start));
  saveVerified(fm,path,state);
  const study=current.subjects.reduce((n,s)=>n+s.studySchedules.length,0), exams=current.subjects.reduce((n,s)=>n+s.examSchedules.length,0);
  const done=new Alert(); done.title='Đã lưu lịch đã xác minh';
  done.message=`${current.displayName}\n${current.semesterName}\n${study} buổi học • ${exams} ca thi\nDữ liệu cũ chỉ được thay sau khi toàn bộ xác minh thành công.`;
  done.addAction('Xong'); await done.presentAlert();
  Script.complete();
}

const BPA_RESOURCE_ROOT='https://raw.githubusercontent.com/LonelyChromosome/demoS/scriptable-web/';
function sha256Raw(raw) {
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],n=raw.length,blocks=Math.ceil((n+9)/64),rotate=(v,b)=>(v>>>b)|(v<<(32-b));
  for(let block=0;block<blocks;block++) {
    const W=new Array(64);
    for(let i=0;i<16;i++){let value=0;for(let j=0;j<4;j++){const at=block*64+i*4+j;const b=at<n?(typeof raw==='string'?raw.charCodeAt(at):raw.byteAt(at)):at===n?128:at>=blocks*64-4?Math.floor(n*8/Math.pow(256,blocks*64-1-at))&255:at>=blocks*64-8?Math.floor(n*8/Math.pow(256,blocks*64-1-at))&255:0;value=(value<<8)|b;}W[i]=value;}
    for(let i=16;i<64;i++){const a=W[i-15],b=W[i-2];W[i]=(W[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+W[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10)))|0;}
    let[a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]+W[i])|0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    [a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)|0);
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
function base64ByteView(base64) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',values={};for(let i=0;i<64;i++)values[alphabet[i]]=i;
  const length=base64.length/4*3-(base64.endsWith('==')?2:base64.endsWith('=')?1:0);
  return {length,byteAt(index){const i=Math.floor(index/3)*4,a=values[base64[i]],b=values[base64[i+1]],c=values[base64[i+2]]||0,d=values[base64[i+3]]||0;return index%3===0?(a<<2)|(b>>4):index%3===1?((b&15)<<4)|(c>>2):((c&3)<<6)|d;}};
}
function dataSize(data) {return base64ByteView(data.toBase64String()).length;}
function sha256Data(data) {return sha256Raw(base64ByteView(data.toBase64String()));}
function validBundlePath(path) {
  return typeof path==='string'&&path.length<300&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(v=>v==='..'||v==='.'||v==='.git'||!v);
}
async function ensureLocalBundle() {
  const active=readState('bundle.json',null);
  if(active&&bpaFM.fileExists(bpaFM.joinPath(active.path,'main.dart.js')))return active;
  const request=new Request(BPA_RESOURCE_ROOT+'bpa-package.json');request.timeoutInterval=30;
  const text=await request.loadString();if(request.response.statusCode!==200)throw errorCode('bundle_unavailable','Tài nguyên BPA chưa được phát hành.');
  const manifest=JSON.parse(text);
  if(manifest.schema!==1||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>1000||manifest.files.some(f=>!validBundlePath(f.path)||!Number.isInteger(f.size)||f.size<0||f.size>100000000||!/^[0-9a-f]{64}$/.test(f.sha256)))throw errorCode('invalid_bundle','Danh mục tài nguyên không hợp lệ.');
  if(manifest.files.reduce((n,f)=>n+f.size,0)>350000000)throw errorCode('invalid_bundle','Gói tài nguyên vượt giới hạn.');
  const digest=sha256Raw(unescape(encodeURIComponent(text))),directory=bpaPath('web-'+digest.slice(0,16));
  if(!bpaFM.fileExists(directory))bpaFM.createDirectory(directory,true);
  // Files are staged under a content identity. The active pointer changes only
  // after every asset matches its declared size and digest.
  for(const file of manifest.files) {
    const path=bpaFM.joinPath(directory,file.path);
    if(bpaFM.fileExists(path)&&sha256Data(bpaFM.read(path))===file.sha256)continue;
    const req=new Request(BPA_RESOURCE_ROOT+file.path.split('/').map(encodeURIComponent).join('/'));req.timeoutInterval=40;
    const data=await req.load();
    if(req.response.statusCode!==200||dataSize(data)!==file.size||sha256Data(data)!==file.sha256)throw errorCode('bundle_integrity','Không xác minh được tài nguyên '+file.path);
    const parent=path.slice(0,path.lastIndexOf('/'));if(!bpaFM.fileExists(parent))bpaFM.createDirectory(parent,true);
    bpaFM.write(path,data);
  }
  const value={path:directory,versionCode:manifest.versionCode,digest,files:manifest.files.map(f=>f.path)};
  writeState('bundle.json',value);return value;
}
function localAppHTML(bundle) {
  const read=name=>bpaFM.readString(bpaFM.joinPath(bundle.path,name));
  // Main Dart and CanvasKit module bytes are embedded once. Fonts, images and
  // WASM remain lazy local reads, avoiding a giant all-assets JS object.
  const modules=bundle.files.filter(p=>p.startsWith('canvaskit/')&&p.endsWith('.js')).map(path=>({path,text:read(path)}));
  const prepare=`const imports={};for(const item of ${JSON.stringify(modules)})imports['https://bpa.local/'+item.path]=URL.createObjectURL(new Blob([item.text],{type:'application/javascript'}));const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.appendChild(map);window.__bpaMainURL=URL.createObjectURL(new Blob([${JSON.stringify(read('main.dart.js'))}],{type:'application/javascript'}));`;
  const storage=`class BPAStorage{constructor(){Object.defineProperty(this,'values',{value:{},enumerable:false,configurable:true});}get length(){return Object.keys(this.values).length;}key(i){return Object.keys(this.values)[i]||null;}getItem(k){return Object.prototype.hasOwnProperty.call(this.values,k)?this.values[k]:null;}setItem(k,v){this.values[String(k)]=String(v);}removeItem(k){delete this.values[k];}clear(){for(const k of Object.keys(this.values))delete this.values[k];}}const memory=new Proxy(new BPAStorage(),{ownKeys:t=>Object.keys(t.values),getOwnPropertyDescriptor:(t,k)=>k in t.values?{value:t.values[k],enumerable:true,configurable:true}:Reflect.getOwnPropertyDescriptor(t,k)});Object.defineProperty(window,'localStorage',{value:memory,configurable:true});`;
  const safe=s=>s.replace(/<\/script/gi,'<\\/script');
  return '<!doctype html><html lang="vi"><head><base href="https://bpa.local/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;height:100%;overflow:hidden;background:#edf3fc}</style></head><body>'+
    '<script>window.__BPA_LOCAL__=true;'+safe(storage)+safe(prepare)+'</script>'+
    '<script>'+safe(read('scriptable-bridge.js'))+'</script>'+
    '<script>'+safe(read('local-assets.js'))+'</script>'+
    '<script>'+safe(read('flutter_bootstrap.js'))+';for(const build of _flutter.buildConfig.builds)build.mainJsPath=window.__bpaMainURL;</script></body></html>';
}

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
  const result=await request.loadJSON();
  if(request.response.statusCode!==200)throw errorCode('qldt_http','HTTP '+request.response.statusCode);
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
  const raw={semesters,plans,registrations,userId:session.userId},reg=BPACore.registration(raw),chunks=BPACore.chunksFor(reg),replies=new Array(chunks.length);let next=0;
  await Promise.all(Array.from({length:Math.min(8,chunks.length)},async()=>{
    while(next<chunks.length){const i=next++,chunk=chunks[i];replies[i]=await qldtPost(session,'SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv','pkg_congthongtin_hssv_thongtin.LayDSLichCaNhan',{strNgayBatDau:chunk.start,strNgayKetThuc:chunk.end});}
  }));
  const semester=BPACore.buildSemester(reg,BPACore.parseSchedule({Success:true,Data:replies.flatMap(r=>r.Data)}));
  if(!semester.displayName)throw errorCode('qldt_verification','QLDT_CANONICAL_NAME_MISSING');
  if(!chunks.length)throw errorCode('qldt_verification','Không xác định được môn đầu học kỳ.');
  return {semester,termStartedAt:localISO(BPACore.vnDate(chunks[0].start))};
}

// Widget state and real deep-link actions; iOS owns timeline refresh timing.
function actionURL(action,kind,id,extra={}) {
  const params={scriptName:'BPA',action,kind,instance:id,...extra};
  return 'scriptable:///run?'+Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');
}
function widgetRows(data,selection,kind,now=new Date()) {
  const rows=selection.mode==='exam'?data.exams||[]:data.classes||[];
  return rows.filter(r=>selection.mode==='exam'?new Date(r.endAt)>now:r.startAt.slice(0,10)===selection.day).sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));
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
  const selection=widgetSelection(kind,id),rows=widgetRows(snapshot(),selection,kind);
  writeState('last-widget.json',{kind,id});
  if(action==='previous'||action==='next')setWidgetSelection(kind,id,navigateWidget(selection,rows,kind,action==='previous'?-1:1));
  else if(action==='mode')setWidgetSelection(kind,id,{...selection,mode:selection.mode==='exam'?'study':'exam',index:0});
  else if(action==='calendar') {
    writeState('pending-action.json',{kind,action:'calendar',day:selection.day});await openOriginalApp();return;
  } else if(action==='sync') {
    writeState('pending-action.json',{kind,action:'sync'});await openOriginalApp();return;
  } else {writeState('pending-action.json',{kind,action:'open'});await openOriginalApp();return;}
  // No preview sheet masquerading as a Home Screen update. The new selection
  // is committed; actual launcher refresh behavior still needs device tests.
}
async function renderBPAWidget(kind,id,preview=false) {
  if(!['small','overview','widget2'].includes(kind))throw errorCode('widget_kind','Loại widget không hợp lệ.');
  const family=config.widgetFamily||'medium';
  if(family==='small')throw errorCode('widget_tap_limit','Widget iOS cỡ small chỉ có một vùng bấm. Chưa tái hiện được toàn bộ icon BPA trong kích thước này.');
  const state=widgetSelection(kind,id),data=snapshot(),theme=readState('theme.json',{}),all=widgetRows(data,state,kind);
  const count=kind==='overview'?4:kind==='widget2'?5:1;
  const start=Math.max(0,Math.min(state.index||0,Math.max(0,all.length-count))),visible=all.slice(start,start+count);
  const payload={kind,day:state.day,examMode:state.mode==='exam',index:start,count:all.length,items:visible,theme};
  const configData=theme.widgetConfig?JSON.parse(theme.widgetConfig):{};
  for(const key of ['largeImagePath','widget2ImagePath']) {
    if(configData[key]&&bpaFM.fileExists(safeManagedPath(configData[key]))) {
      const data=bpaFM.read(safeManagedPath(configData[key]));
      payload[key]='data:image/'+configData[key].split('.').pop().toLowerCase()+';base64,'+data.toBase64String();
    }
  }
  if(theme.fontPath&&bpaFM.fileExists(safeManagedPath(theme.fontPath)))payload.fontData='data:font/ttf;base64,'+bpaFM.read(safeManagedPath(theme.fontPath)).toBase64String();
  const bundle=await ensureLocalBundle();
  const named={classic:'macdinh.png',lol:'lol.jpg',valorant:'vlr.jpg',minecraft:'minecraft.jpg',facebook:'facebooj.png',shopee:'shoppee.png',tiktok:'tiktok.png',ben10:'ben10.png.webp',youtube:'ytb.png',steam:'steam.png'};
  if(theme.theme==='tien_mon_premium'){const now=new Date(),minutes=now.getHours()*60+now.getMinutes();named.tien_mon_premium=minutes>=990&&minutes<1110?'tinemon-trua.png':minutes>=1110||minutes<300?'tienmon-toi.png':'tienmon-sang.png';}
  if(kind==='widget2'&&!payload.widget2ImagePath&&named[theme.theme||'classic']) {
    const path=bpaFM.joinPath(bundle.path,'widget-assets/widget2_themes/'+named[theme.theme||'classic']);
    payload.widget2ImagePath='data:image/'+path.split('.').pop()+';base64,'+bpaFM.read(path).toBase64String();
  }
  if(!payload.fontData&&['FzCoTrang','MinecraftCustom'].includes(theme.fontFamily)) {
    const name=theme.fontFamily==='FzCoTrang'?'assets/assets/tien_mon_premium/fonts/FzCoTrang.ttf':'assets/assets/fonts/minecraft.ttf';
    payload.fontData='data:font/ttf;base64,'+bpaFM.read(bpaFM.joinPath(bundle.path,name)).toBase64String();
  }
  payload.icons={};
  for(const [name,file]of Object.entries({calendar:'ic_widget_calendar',sync:'ic_widget_reload',mode:'ic_widget_bell',previous:'ic_widget_up',next:'ic_widget_down'}))payload.icons[name]='data:image/svg+xml;base64,'+bpaFM.read(bpaFM.joinPath(bundle.path,'widget-assets/icons/'+file+'.svg')).toBase64String();
  const renderer=new WebView();
  const code=bpaFM.readString(bpaFM.joinPath(bundle.path,'widget-renderer.js')).replace(/<\/script/gi,'<\\/script');
  await renderer.loadHTML('<html><body><script>'+code+'</script></body></html>');
  const result=await renderer.evaluateJavaScript(`renderWidget(${JSON.stringify(payload)}).then(completion).catch(e=>completion({error:String(e)}));`,true);
  if(result.error)throw errorCode('widget_render',result.error);
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

// Unified Scriptable host. All app UI is the original Flutter release.
const BPA_WEB='https://lonelychromosome.github.io/demoS/';
const DEFAULT_KIND='small';
const DEFAULT_INSTANCE='main';
const bpaFM=typeof FileManager==='undefined'?null:FileManager.local();
function bpaDirectory() {
  const path=bpaFM.joinPath(bpaFM.documentsDirectory(),'BPA');
  if(!bpaFM.fileExists(path))bpaFM.createDirectory(path,true);
  return path;
}
function bpaPath(name) { return bpaFM.joinPath(bpaDirectory(),name); }
function readState(name,fallback={}) {
  const p=bpaPath(name);
  if(!bpaFM.fileExists(p)&&bpaFM.fileExists(p+'.backup'))bpaFM.move(p+'.backup',p);
  return bpaFM.fileExists(p)?JSON.parse(bpaFM.readString(p)):fallback;
}
function writeState(name,value) { saveVerified(bpaFM,bpaPath(name),value); }
function preference(key) {
  const prefs=readState('preferences.json');
  const name=Object.keys(prefs).find(k=>k===key||k.endsWith('.'+key));
  if(!name)return null;
  let value=prefs[name];
  // SharedPreferences serializes the string payload; decode its outer wrapper.
  for(let i=0;i<2&&typeof value==='string';i++){try{value=JSON.parse(value);}catch(_){break;}}
  return value;
}
function snapshot() { return readState('snapshot.json',{classes:[],exams:[]}); }
function isoDay(d) { return localISO(d).slice(0,10); }
function widgetSelection(kind,id) {
  const selections=readState('widgets.json');
  return selections[kind+':'+id] || {day:isoDay(new Date()),mode:'study',index:0};
}
function setWidgetSelection(kind,id,value) {
  const selections=readState('widgets.json');selections[kind+':'+id]=value;writeState('widgets.json',selections);
}
function errorCode(code,message) { const error=new Error(message);error.code=code;return error; }
let cardGeneration=0;
function normalizeCardUID(value) {
  const uid=String(value||'').replace(/[:\s-]/g,'').toUpperCase();
  if(!/^(?:[0-9A-F]{2}){4,10}$/.test(uid))throw errorCode('nfc_invalid_uid','Shortcut không trả UID thẻ hợp lệ.');
  return uid;
}
async function requestCardUID() {
  const requestId=UUID.string(),started=Date.now();
  const callback=new CallbackURL('shortcuts://x-callback-url/run-shortcut');
  callback.addParameter('name','BPA — Quét thẻ');callback.addParameter('input','text');
  callback.addParameter('text',JSON.stringify({requestId}));
  const response=await callback.open();
  const value=JSON.parse(response.result||'null');
  if(!value||value.requestId!==requestId)throw errorCode('nfc_unverified','Chưa xác minh được kết quả quét thuộc yêu cầu BPA.');
  const at=Date.parse(value.scannedAt);
  if(!Number.isFinite(at)||at<started-2000||at>Date.now()+2000)throw errorCode('nfc_stale','Kết quả thẻ không thuộc lần quét hiện tại.');
  return normalizeCardUID(value.uid);
}
async function sendNativeEvent(app,channel,type,extra={}) {
  await app.evaluateJavaScript(`bpaHost.event(${JSON.stringify('better_phenikaa/'+channel)},'event',${JSON.stringify({type,...extra})});null`,false);
}
async function syncPortal() {
  if(Keychain.contains('BPA.qldt-session')) {
    try {return await fetchNativeQldt(JSON.parse(Keychain.get('BPA.qldt-session')));}
    catch(error){if(error.code==='qldt_verification')throw error;}
  }
  const portal=new WebView();
  await portal.loadURL('https://qldtbeta.phenikaa-uni.edu.vn/');
  let ready=await portal.evaluateJavaScript("!!(window.edu&&edu.system&&edu.system.userId&&edu.system.iM!=null&&typeof edu.system.makeRequest==='function')",false);
  if(!ready) {
    await portal.present(false);
    const host=await portal.evaluateJavaScript('location.hostname',false);
    if(host!=='qldtbeta.phenikaa-uni.edu.vn')throw errorCode('login_incomplete','Chưa trở về cổng QLĐT sau đăng nhập.');
  }
  const raw=await callPortal(portal,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',20000);
  const session=await portal.evaluateJavaScript(SESSION_SCRIPT,false);
  if(session) {
    const parsed=JSON.parse(session);
    if(parsed.tokenJWT&&parsed.userId&&parsed.iM&&parsed.appId&&parsed.strChucNangId)Keychain.set('BPA.qldt-session',session);
  }
  const reg=BPACore.registration(raw),chunks=BPACore.chunksFor(reg);
  const schedule=chunks.length?await callPortal(portal,scheduleScript(chunks),'betterPhenikaaSyncResult','betterPhenikaaSyncError',20000):{response:{Success:true,Data:[]}};
  const semester=BPACore.buildSemester(reg,BPACore.parseSchedule(schedule.response));
  if(!semester.displayName)throw errorCode('canonical_name_missing','QLDT_CANONICAL_NAME_MISSING');
  if(!chunks.length)throw errorCode('term_start_missing','Không xác định được môn đầu học kỳ.');
  const old=readState('semester-v1.json',null),state=BPACore.retain(old,semester);
  state.startedAt=localISO(BPACore.vnDate(chunks[0].start));
  // Flutter then applies its original diff, retention and transaction algorithm.
  writeState('semester-v1.json',state);
  return {semester,termStartedAt:state.startedAt};
}
function safeManagedPath(path) {
  const root=bpaFM.joinPath(bpaDirectory(),'files')+'/';
  if(typeof path!=='string'||!path.startsWith(root)||path.includes('/../'))throw errorCode('invalid_path','Đường dẫn không thuộc vùng dữ liệu BPA.');
  return path;
}
async function pickManaged(kind) {
  const paths=await DocumentPicker.open(kind==='font'?['public.data']:['public.image']);
  if(!paths.length)return null;
  const source=paths[0],name=source.split('/').pop(),directory=bpaFM.joinPath(bpaDirectory(),'files');
  if(!bpaFM.fileExists(directory))bpaFM.createDirectory(directory,true);
  const path=bpaFM.joinPath(directory,UUID.string()+'-'+name);
  bpaFM.copy(source,path);
  const bytes=bpaFM.read(path),size=dataSize(bytes);
  return {path,name,size,mimeType:kind==='font'?'font/ttf':'image/'+name.split('.').pop().toLowerCase()};
}
async function scheduleExamReminders() {
  const current=preference('better_phenikaa_current_semester_v1');
  if(!current)return null;
  const pending=await Notification.allPending(),delivered=await Notification.allDelivered();
  const deliveredKeys=new Set(delivered.map(n=>n.identifier));
  const wanted=new Set(),now=new Date(),jobs=[];
  for(const subject of current.subjects)for(const exam of subject.examSchedules)for(const days of [7,3,1]) {
    const at=new Date(new Date(exam.startAt).getTime()-days*86400000);
    const identity=`${subject.subjectId}|${exam.startAt}|${exam.endAt}|${exam.room.trim().toLowerCase()}|${BPACore.normalizeClass(exam.className)}|${BPACore.normalizeClass(exam.examForm)}|${days}`;
    const id='bpa.exam.'+BPACore.base64url(identity);
    if(at<=now||deliveredKeys.has(id))continue;
    wanted.add(id);
    if(pending.some(n=>n.identifier===id))continue;
    jobs.push({id,at,subject:subject.name,days,exam});
  }
  await Notification.removePending(pending.filter(n=>n.identifier.startsWith('bpa.exam.')&&!wanted.has(n.identifier)).map(n=>n.identifier));
  for(const job of jobs) {
    const n=new Notification();n.identifier=job.id;n.threadIdentifier='bpa.exam';
    n.title=`${job.subject} • còn ${job.days} ngày thi`;
    n.body=`${job.exam.startAt.slice(11,16)} • ${job.exam.room}${job.exam.examForm?' • '+job.exam.examForm:''}`;
    n.openURL=actionURL('open','overview','main');n.setTriggerDate(job.at);await n.schedule();
  }
  return null;
}
async function handlePlatform(call,app) {
  const method=call.method,args=call.arguments,channel=call.channel.replace('better_phenikaa/','');
  if(channel==='qldt_scriptable') {
    if(method==='sync')return await syncPortal();
    if(method==='clear'){for(const key of ['BPA.credentials','BPA.qldt-session'])if(Keychain.contains(key))Keychain.remove(key);return null;}
  }
  if(channel==='ios_runtime') {
    if(method==='publishSnapshot'){writeState('snapshot.json',args?JSON.parse(args):{classes:[],exams:[]});return null;}
    if(method==='selectWidgetDay'){const id=readState('last-widget.json',{id:'main'}).id;setWidgetSelection(args.kind,id,{...widgetSelection(args.kind,id),day:args.day,index:0});return null;}
    if(method==='takeWidgetAction'){const value=readState('pending-action.json',null);writeState('pending-action.json',null);return value;}
    if(method==='beginSync'||method==='endSync'||method==='refreshWidgets')return null;
  }
  if(channel==='widget_theme'&&method==='applyTheme'){writeState('theme.json',args);return 1;}
  if(channel==='local_files') {
    if(method==='pickFile')return await pickManaged(args.kind);
    if(method==='fileExists')return bpaFM.fileExists(safeManagedPath(args));
    if(method==='readFile'){const path=safeManagedPath(args.path),data=bpaFM.read(path);if(dataSize(data)>args.maximumBytes)throw errorCode('file_too_large','Tệp vượt giới hạn.');return data.toBase64String();}
  }
  if(channel==='widget_pin'&&method==='requestPin') {
    installWidgetScripts();
    const a=new Alert();a.title='Widget BPA';a.message='Các script widget đã được chuẩn bị. Nhấn giữ màn hình chính → thêm widget Scriptable → chọn script BPA tương ứng. iOS không có API để BPA tự thêm widget lên Home Screen.';a.addAction('Xong');await a.presentAlert();return false;
  }
  if(channel==='daily_sync') {
    if(method==='syncReminders')return await scheduleExamReminders();
    if(method==='recordAppSyncSuccess'){writeState('sync-status.json',{lastSuccessAtMillis:Date.now()});return null;}
    if(method==='refreshWidgetToday') {
      const selections=readState('widgets.json');
      for(const key of Object.keys(selections))selections[key]={...selections[key],day:isoDay(new Date()),index:0};
      writeState('widgets.json',selections);return null;
    }
    if(method==='status')return readState('sync-status.json',{lastSuccessAtMillis:0});
    if(method==='examNotice')return null;
    if(method==='clearReminders'){await Notification.removePending((await Notification.allPending()).filter(n=>n.identifier.startsWith('bpa.exam.')).map(n=>n.identifier));return null;}
    if(['disable','ackExamNotice'].includes(method))return null;
    if(method==='enable')throw errorCode('automation_required','iOS yêu cầu thiết lập Automation; BPA không tự bật lịch đồng bộ.');
  }
  if(channel==='study_alarm'&&method==='setAlarm') {
    const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),args.hour,args.minute);
    if(next.getTime()<=now.getTime()+30000)next.setDate(next.getDate()+1);
    if(!Number.isInteger(args.hour)||!Number.isInteger(args.minute)||args.hour<0||args.hour>23||args.minute<0||args.minute>59||next.getTime()!==args.target||args.target>=args.classStart||args.target<=now.getTime()+30000||args.classStart-now.getTime()>=86400000)throw errorCode('alarm_occurrence','Thời điểm báo thức không khớp buổi học trong 24 giờ.');
    const callback=new CallbackURL('shortcuts://x-callback-url/run-shortcut');
    callback.addParameter('name','BPA — Đặt báo thức');callback.addParameter('input','text');callback.addParameter('text',JSON.stringify(args));
    const response=await callback.open();
    const receipt=JSON.parse(response.result||'null');
    if(!receipt||receipt.status!=='BPA_ALARM_CREATED'||receipt.hour!==args.hour||receipt.minute!==args.minute||receipt.label!==args.label||receipt.target!==args.target||typeof receipt.alarmIdentifier!=='string'||!receipt.alarmIdentifier)throw errorCode('clock_unverified','Shortcut chưa xác nhận tạo đúng báo thức.');
    return true;
  }
  if(channel==='update_http'&&method==='fetch') {
    if(typeof args.url!=='string'||!/^https:\/\/[^/?#\s]+\//.test(args.url))throw errorCode('invalid_url','Cập nhật yêu cầu HTTPS.');
    const request=new Request(args.url);request.timeoutInterval=12;
    const data=await request.load();if(dataSize(data)>args.limit)throw errorCode('manifest_too_large','Manifest quá lớn.');return data.toBase64String();
  }
  if(channel==='update') {
    if(method==='versionCode')return 51;
    if(method==='versionName')return 'cooc.1.6';
    if(method==='installStatus')return 'idle';
    if(method==='hasBoundCard')return Keychain.contains('BPA.bound-card-uid');
    if(method==='removeBoundCard'){if(Keychain.contains('BPA.bound-card-uid'))Keychain.remove('BPA.bound-card-uid');return null;}
    if(['stopCard','cancel'].includes(method)){cardGeneration++;return null;}
    if(method==='startBindCard'||method==='startCard') {
      const generation=++cardGeneration;
      if(method==='startBindCard'&&Keychain.contains('BPA.bound-card-uid'))throw errorCode('already_bound','Thẻ đã được liên kết.');
      const uid=await requestCardUID();
      if(generation!==cardGeneration)throw errorCode('cancelled','Đã hủy yêu cầu thẻ.');
      if(method==='startBindCard'){Keychain.set('BPA.bound-card-uid',uid);await sendNativeEvent(app,'update','cardBound');}
      else {
        const matched=Keychain.contains('BPA.bound-card-uid')&&Keychain.get('BPA.bound-card-uid')===uid;
        await sendNativeEvent(app,'update',matched?'cardAccepted':'wrongCard');
      }
      return null;
    }
    if(method==='canInstall')return false;
    if(['downloadAndInstall','installSettings'].includes(method))throw errorCode('web_update_unconfigured','Chưa có kênh cập nhật web đã ký tương đương updater Android.');
  }
  if(channel==='widget_session'&&['clear','invalidate'].includes(method))return null;
  throw errorCode('unsupported_platform_method',`${channel}/${method} chưa có cầu Scriptable.`);
}
function installWidgetScripts() {
  const source=bpaFM.readString(module.filename);
  for(const [name,kind]of [['BPA — Nhỏ','small'],['BPA — Tổng quan','overview'],['BPA — Widget 2','widget2']]) {
    const content=source.replace("const DEFAULT_KIND='small';",`const DEFAULT_KIND='${kind}';`);
    bpaFM.writeString(bpaFM.joinPath(bpaFM.documentsDirectory(),name+'.js'),content);
  }
}
async function openOriginalApp() {
  const bundle=await ensureLocalBundle();
  const app=new WebView();
  await app.loadHTML(localAppHTML(bundle),'https://bpa.local/');
  const ready=await app.evaluateJavaScript('typeof bpaHost!=="undefined"&&typeof bpaStart==="function"',false);
  if(!ready)throw errorCode('web_build_unavailable','Bản giao diện BPA chưa sẵn sàng ở địa chỉ build.');
  await app.evaluateJavaScript(`bpaHost.init(${JSON.stringify(readState('preferences.json'))});null`,false);
  let closed=false;
  const jobs=new Set();
  const presentation=app.present(true).then(()=>{closed=true;});
  while(!closed) {
    let packet;
    try {packet=await app.evaluateJavaScript('bpaHost.poll(completion);',true);} catch(error){if(closed)break;throw error;}
    if(packet.preferences!==null)writeState('preferences.json',packet.preferences);
    for(const asset of packet.assets||[]) {
      let result;
      try {
        if(!validBundlePath(asset.path)||!bundle.files.includes(asset.path))throw Error('Tài nguyên ngoài gói BPA.');
        result={id:asset.id,data:bpaFM.read(bpaFM.joinPath(bundle.path,asset.path)).toBase64String()};
      } catch(error){result={id:asset.id,error:error.message};}
      if(!closed)await app.evaluateJavaScript(`bpaAssetResult(${JSON.stringify(result)});null`,false);
    }
    for(const call of packet.calls) {
      const job=(async()=>{
        let result;
        try {result={id:call.id,result:await handlePlatform(call,app)};}
        catch(error){result={id:call.id,error:{code:error.code||'scriptable_error',message:error.message}};}
        if(!closed)await app.evaluateJavaScript(`bpaHost.result(${JSON.stringify(result)});null`,false);
      })();
      jobs.add(job);job.then(()=>jobs.delete(job),()=>jobs.delete(job));
    }
  }
  cardGeneration++;
  await Promise.allSettled([...jobs]);
  await presentation;
}
async function bpaMain() {
  const params=typeof args==='undefined'?{}:args.queryParameters||{};
  let widgetOptions={};
  if(typeof args!=='undefined'&&args.widgetParameter) {
    try {widgetOptions=JSON.parse(args.widgetParameter);}catch(_){widgetOptions={instance:String(args.widgetParameter)};}
    if(!widgetOptions||typeof widgetOptions!=='object')throw errorCode('widget_parameter','Tham số widget không hợp lệ.');
  }
  const kind=params.kind||widgetOptions.kind||DEFAULT_KIND,id=params.instance||widgetOptions.instance||DEFAULT_INSTANCE;
  if(config.runsInWidget){Script.setWidget(await renderBPAWidget(kind,id));Script.complete();return;}
  installWidgetScripts();
  if(params.action){await widgetAction(params.action,kind,id,params);}
  else await openOriginalApp();
  Script.complete();
}
if(typeof Script!=='undefined')bpaMain().catch(async error=>{
  const alert=new Alert();alert.title='BPA';alert.message=error.message||String(error);alert.addAction('Đóng');await alert.presentAlert();Script.complete();
});
