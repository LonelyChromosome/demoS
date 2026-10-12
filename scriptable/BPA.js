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
const BPA_ASSISTANT_CATALOG={"normal": {"U1": "Bạn đã lâu chưa đồng bộ dữ liệu rồi. Đồng bộ một chút để lịch học và lịch thi luôn chính xác nhé.", "U2": "Đồng bộ xong rồi. Hiện chưa có thay đổi mới trong lịch của bạn.", "U3": "Lịch học của bạn vừa có thay đổi. Kiểm tra lại để tránh nhầm lịch nhé.", "U4": "Lịch thi của bạn vừa có thay đổi. Kiểm tra lại để tránh nhầm lịch nhé.", "U5": "Lịch học và lịch thi của bạn vừa có thay đổi. Bạn kiểm tra lại nhé.", "U6": "Còn 7 ngày nữa thi rồi. Bạn kiểm tra lịch nhé.", "U7": "Còn 3 ngày nữa thi rồi. Bạn kiểm tra lịch nhé.", "U8": "Ngày mai thi rồi. Bạn kiểm tra lại lịch nhé.", "U9": "Còn X ngày nữa thi. Bạn kiểm tra lịch nhé.", "U10": "Bạn đang trong kỳ thi. Nhớ kiểm tra lịch thi nhé.", "U11": "Còn X ngày nữa bạn có N môn thi. Kiểm tra lịch nhé.", "U12": "Đồng bộ xong rồi. Lịch của bạn có thay đổi.", "U13": "Đồng bộ xong rồi. Lịch của bạn vẫn như cũ.", "U14": "Lịch của bạn có thay đổi. Mở chi tiết để kiểm tra nhé.", "U15": "Hiện tại bạn chưa có lịch thi.", "U16": "Hôm nay không có lịch học.", "U17": "Đồng bộ chưa thành công. Bạn thử lại nhé.", "U18": "Đồng bộ mất quá lâu. Bạn thử lại sau nhé."}, "serious": {"U1": "Chúng tôi ghi nhận bạn đã 2 ngày chưa đồng bộ dữ liệu mới. Yêu cầu bạn hợp tác thực hiện đồng bộ để bảo đảm tính chính xác của dữ liệu.", "U2": "Đồng bộ hoàn tất. Không ghi nhận thay đổi mới trong dữ liệu lịch học hoặc lịch thi.", "U3": "Hệ thống ghi nhận thay đổi trong lịch học. Yêu cầu bạn kiểm tra lại thông tin trước khi đến lớp.", "U4": "Hệ thống ghi nhận thay đổi trong lịch thi. Yêu cầu bạn kiểm tra lại thông tin để bảo đảm tham gia đúng ca thi.", "U5": "Hệ thống ghi nhận thay đổi đồng thời trong lịch học và lịch thi. Yêu cầu bạn kiểm tra lại toàn bộ thông tin liên quan.", "U6": "Còn 7 ngày trước kỳ thi. Vui lòng kiểm tra lịch.", "U7": "Còn 3 ngày trước kỳ thi. Vui lòng kiểm tra lại lịch.", "U8": "Ngày mai là ngày thi. Vui lòng kiểm tra lại lịch.", "U9": "Còn X ngày trước kỳ thi. Vui lòng rà soát lại lịch.", "U10": "Bạn đang trong kỳ thi. Vui lòng theo dõi lịch thi thường xuyên.", "U11": "Còn X ngày, bạn có N môn thi. Vui lòng rà soát lịch.", "U12": "Đồng bộ hoàn tất. Hệ thống ghi nhận thay đổi trong dữ liệu.", "U13": "Đồng bộ hoàn tất. Không ghi nhận thay đổi mới.", "U14": "Hệ thống ghi nhận thay đổi. Vui lòng mở chi tiết để kiểm tra.", "U15": "Hiện chưa ghi nhận lịch thi trong dữ liệu của bạn.", "U16": "Hôm nay không ghi nhận lịch học.", "U17": "Đồng bộ không hoàn tất. Vui lòng thực hiện lại.", "U18": "Quá trình đồng bộ đã vượt thời gian chờ. Vui lòng thử lại."}, "playful": {"U1": "Fen ơi, 2 ngày rồi đấy! Cập nhật dữ liệu mới đi chứ fen!", "U2": "Xong rồi fen! Lịch vẫn y nguyên, chưa có gì mới hết á.", "U3": "Fen ơi, lịch học đổi rồi kìa! Vào xem lại lẹ đi.", "U4": "Fen ơi, lịch thi đổi rồi kìa! Vào check lại lẹ nha.", "U5": "Fen ơi, cả lịch học lẫn lịch thi đều đổi rồi kìa! Vào check nhanh đi fen!", "U6": "Fen ơi, 7 ngày nữa thi rồi đó!", "U7": "Fen ơi, còn 3 ngày nữa thi thôi đó!", "U8": "Fen ơi, mai thi rồi đó!", "U9": "Fen ơi, còn X ngày nữa thi đó!", "U10": "Fen đang trong kỳ thi đó nha, nhớ check lịch!", "U11": "Fen ơi, X ngày nữa có tận N môn thi đó!", "U12": "Fen ơi, sync xong có lịch mới nè!", "U13": "Xong rồi fen! Vẫn y nguyên nha.", "U14": "Fen ơi, có thay đổi nè! Vào xem chi tiết đi.", "U15": "Fen ơi, chưa có lịch thi nha!", "U16": "Fen ơi, nay được nghỉ!", "U17": "Fen ơi, sync hụt mất rồi! Thử lại nha.", "U18": "Fen ơi, chờ lâu quá rồi! Thử sync lại nha."}, "affectionate": {"U1": "Lâu rồi mình chưa thấy cậu đồng bộ í... để ý mình chút nha!", "U2": "Mình kiểm tra xong rồi nè, lịch vẫn như cũ thôi... chưa có gì mới đâu.", "U3": "Mình thấy lịch học bạn có thay đổi, bạn kiểm tra nhaaa.", "U4": "Mình thấy lịch thi của bạn có thay đổi, bạn xem lại nhaaa.", "U5": "Mình thấy cả lịch học với lịch thi của bạn đều có thay đổi, bạn kiểm tra nhaaa.", "U6": "Còn 7 ngày nữa thi rồi, bạn nhớ chuẩn bị nha.", "U7": "Còn 3 ngày nữa thi rồi, bạn nhớ giữ sức nha.", "U8": "Mai thi rồi, bạn ngủ sớm nha.", "U9": "Còn X ngày nữa thi rồi, bạn chuẩn bị dần nha.", "U10": "Bạn đang trong kỳ thi rồi, nhớ giữ sức và xem lịch nha.", "U11": "X ngày nữa bạn có N môn thi rồi, nhớ chuẩn bị nha.", "U12": "Mình sync xong rồi, lịch của bạn có thay đổi nha.", "U13": "Mình kiểm tra xong rồi, chưa có gì thay đổi đâu nha.", "U14": "Mình thấy có thay đổi đó, bạn mở xem thử nha.", "U15": "Mình chưa thấy lịch thi của bạn đâu, yên tâm nha.", "U16": "Hôm nay được nghỉ rồi, thư giãn chút nha.", "U17": "Mình chưa đồng bộ được cho bạn rồi... thử lại giúp mình nha.", "U18": "Mình chờ mãi mà chưa lấy được dữ liệu... thử lại chút nha."}, "flirtatious": {"U1": "Biết là bận rồi? Nhưng mà người ta cũng cần phải sync mà!", "U2": "Sync xong rồi nè, vẫn như cũ nha ❤️", "U3": "Có gì đó giữa chúng ta đã thay đổi ấy, kiểm tra lịch học nha ❤️", "U4": "Mình còn mập mờ nhưng lịch thi thì đổi rõ ❤️ Bạn kiểm tra nha.", "U5": "Mình và bạn rồi ai cũng thay đổi, cả lịch học và lịch thi cũng vậy! ❤️", "U6": "7 ngày nữa thi rồi đó... học đi nha ❤️", "U7": "3 ngày nữa thi rồi... học đi, đừng để mình phải lo ❤️", "U8": "Mai thi rồi đó... tối nay ngoan ngoãn học bài nha ❤️", "U9": "Còn X ngày nữa thi thôi... nhớ để ý lịch, với để ý mình nữa nha ❤️", "U10": "Nhớ mình thì nhớ, nhưng nhớ cả lịch thi nữa nha ❤️", "U11": "Chắc gì nhớ mỗi người ta... vậy mà mình nhớ người ta còn X ngày nữa có N môn thi đó ❤️", "U12": "Lịch của chúng mình vừa đổi rồi ấy ❤️", "U13": "Chúng mình vẫn như cũ nha ❤️", "U14": "Có một thay đổi mình chưa kể bạn nè ❤️ Mở xem đi.", "U15": "Lịch thi thì chưa có... còn lịch với mình thì sao? ❤️", "U16": "Nay không học... Mình muốn đi chơi! ❤️", "U17": "Hỏng rồi! Chúng mình làm lại nha ❤️", "U18": "Đợi mình thì được ❤️ chứ đống dữ liệu này thì sync lại thôi."}, "academic": {"U1": "Đã vượt quá khoảng thời gian khuyến nghị giữa hai lần đồng bộ. Tôi đề nghị bạn cập nhật dữ liệu để giảm nguy cơ sai lệch so với hệ thống QLĐT.", "U2": "Quá trình đồng bộ đã hoàn tất. Dữ liệu hiện tại không có sai khác so với lần đồng bộ thành công gần nhất.", "U3": "Phát hiện sai khác trong dữ liệu lịch học so với lần đồng bộ gần nhất. Vui lòng kiểm tra chi tiết thay đổi.", "U4": "Phát hiện sai khác trong dữ liệu lịch thi so với lần đồng bộ gần nhất. Vui lòng kiểm tra chi tiết thay đổi.", "U5": "Phát hiện sai khác đồng thời trong dữ liệu lịch học và lịch thi so với lần đồng bộ gần nhất. Vui lòng kiểm tra chi tiết các thay đổi.", "U6": "Kỳ thi còn 7 ngày. Hãy rà soát lịch thi.", "U7": "Kỳ thi còn 3 ngày. Hãy rà soát lịch và chuẩn bị.", "U8": "Kỳ thi diễn ra vào ngày mai. Hãy rà soát lịch thi.", "U9": "Kỳ thi còn X ngày. Hãy kiểm tra lịch và điều chỉnh kế hoạch ôn tập.", "U10": "Bạn đang trong giai đoạn thi. Hãy thường xuyên rà soát lịch thi.", "U11": "Trong X ngày tới có N môn thi. Hãy phân bổ thời gian ôn tập phù hợp.", "U12": "Đồng bộ hoàn tất và phát hiện sai khác so với dữ liệu trước đó.", "U13": "Đồng bộ hoàn tất. Không phát hiện sai khác so với dữ liệu trước đó.", "U14": "Phát hiện sai khác trong dữ liệu. Vui lòng kiểm tra phần chi tiết.", "U15": "Dữ liệu hiện tại chưa ghi nhận ca thi nào.", "U16": "Dữ liệu hiện tại không ghi nhận buổi học nào trong hôm nay.", "U17": "Quá trình đồng bộ không hoàn tất. Vui lòng thực hiện lại để cập nhật dữ liệu.", "U18": "Yêu cầu đồng bộ đã vượt ngưỡng thời gian chờ. Vui lòng thực hiện lại."}, "blunt": {"U1": "Có mỗi cái việc sync mà mày cũng lười? Mai đi học muộn đừng đổ tại tao nhé.", "U2": "Tao sync xong rồi đấy, mày chả được nghỉ buổi nào.", "U3": "Lịch học đổi rồi đấy, còn không mau check đi?", "U4": "Lịch thi đổi rồi đấy. Không check thì trượt ráng chịu.", "U5": "Mày làm gì mà người ta đổi cả lịch học lẫn lịch thi của mày rồi kìa.", "U6": "7 ngày nữa thi rồi mà mày chưa chịu học à?", "U7": "3 ngày nữa thi mà giờ vẫn ngồi lướt?", "U8": "Nói không nghe!? Mai thi giờ lại cắm đầu ôn.", "U9": "Còn X ngày nữa thi, giờ mới nhớ tới à?", "U10": "Đang trong kỳ thi đấy, quên lịch thì tự đi mà gánh.", "U11": "Còn X ngày nữa mày có N môn thi đấy, chơi ít thôi!", "U12": "Lịch đổi rồi đấy, vào xem đi? Lạy Bốốố!", "U13": "Sync xong rồi đấy, vẫn chả được nghỉ.", "U14": "Vào xem có gì đổi chi tiết kìa? Đợi tao đọc cho nghe à?", "U15": "Quẩy đê, nào có lịch tao báo.", "U16": "Mãi mới được nghỉ 1 hôm.", "U17": "Có mỗi cái sync mà mày cũng lỗi? Làm lại đê!", "U18": "Mày định chờ bao lâu nữa? Không biết đường mà sync lại à?"}, "cultivation": {"U1": "Pháp trận lâu ngày chưa được vận, truyền tống tắc nghẽn. Mau đồng bộ kẻo tu hành gặp sai sót.", "U2": "Pháp trận khai thông, truyền tống không có sai sót. Thiên đạo bất biến — an tâm tu hành.", "U3": "Thiên cơ đại biến, dễ sinh dị tượng. Còn không mau kiểm tra?", "U4": "Bí cảnh mới xuất hiện, thí luyện ắt biến. Mau kiểm tra lại!", "U5": "Thiên cơ hỗn loạn, bí cảnh đại biến. Còn không mau rà soát?", "U6": "7 ngày nữa, thiên kiếp giáng lâm. Trời sinh dị biến — mau chuẩn bị độ kiếp.", "U7": "3 ngày sau, thiên kiếp đã cận kề. Lôi vân tích tụ — còn không mau bế quan?", "U8": "Thiên kiếp giáng lâm. Giữ vững đạo tâm — chúc ngươi may mắn!", "U9": "X ngày sau, tu vi viên mãn. Lôi kiếp giáng lâm — hãy chuẩn bị thật tốt!", "U10": "Đã tới kỳ độ kiếp, Thiên đạo khảo hạch. Dị động lưu tâm — đạo này đi sai, vạn kiếp bất phục.", "U11": "Còn X ngày, N đạo thiên kiếp cùng lúc giáng xuống. Tu vi có hạn — chớ có lơ là!", "U12": "Pháp trận khai thông, truyền tống sinh biến. Thiên cơ nghịch vận — mau kiểm tra.", "U13": "Pháp trận vừa khai thông, truyền tống không có sai sót. Thiên đạo bất biến — an tâm tu hành.", "U14": "Thiên cơ khẽ động, bí cảnh ắt biến. Mau mở chi tiết kiểm tra.", "U15": "Bí cảnh chưa mở, chớ vội khảo hạch. Hãy chuẩn bị thật tốt!", "U16": "Nay vô biến vô mưu, an tâm tĩnh dưỡng.", "U17": "Pháp trận phản phệ, truyền tống không thành. Còn không mau thử lại?", "U18": "Pháp trận đình trệ, thiên đạo khó dung. Chớ cưỡng cầu — hãy quay lại sau."}};
const BPA_UPDATE_CHANNEL={"manifestUrl": "https://raw.githubusercontent.com/LonelyChromosome/demoS/scriptable-release/latest.json", "publicKeyBase64": "62splcM91ZF6kt7ydxqmvN7Hc45c54n8bfCIVp8maFc=", "versionCode": 52, "versionName": "cooc.1.6"};
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
const BPA_REQUIRED_BUNDLE_FILES=['main.dart.js','widget-renderer.js','widget-palette.js','scriptable/BPA.js'];
async function ensureLocalBundle(allowPending=false) {
  const active=readState('bundle.json',null),pending=readState('pending-bundle.json',null);
  if(allowPending&&pending) {
    if(pending.bootAttempted) {
      if(pending.hostBackupPath&&bpaFM.fileExists(pending.hostBackupPath)){const host=bpaFM.joinPath(bpaFM.documentsDirectory(),'BPA.js');if(bpaFM.fileExists(host))bpaFM.remove(host);bpaFM.move(pending.hostBackupPath,host);}
      writeState('pending-bundle.json',null);writeState('install-status.json',{status:'failed',error:'new_runtime_did_not_boot'});
      const backup=readState('update-preferences-backup.json',null);if(backup)writeState('preferences.json',backup);
      if(active)return active;
    }else {
      writeState('update-preferences-backup.json',readState('preferences.json'));
      writeState('pending-bundle.json',{...pending,bootAttempted:true});return {...pending,pendingActivation:true};
    }
  }
  if(active&&active.versionCode>=BPA_UPDATE_CHANNEL.versionCode&&Array.isArray(active.files)&&BPA_REQUIRED_BUNDLE_FILES.every(name=>active.files.includes(name)&&bpaFM.fileExists(bpaFM.joinPath(active.path,name))))return active;
  const value=await stageLocalBundle(BPA_RESOURCE_ROOT+'bpa-package.json');writeState('bundle.json',value);return value;
}
async function stageLocalBundle(indexURL,release=null,progress=null,check=()=>{}) {
  if(typeof indexURL!=='string'||!/^https:\/\/[^/?#\s]+\//.test(indexURL))throw errorCode('invalid_url','Gói cập nhật yêu cầu HTTPS.');
  const request=new Request(indexURL);request.timeoutInterval=30;
  const text=await request.loadString();if(request.response.statusCode!==200)throw errorCode('bundle_unavailable','Tài nguyên BPA chưa được phát hành.');
  check();
  const manifest=JSON.parse(text);
  const resourceRoot=indexURL.replace(/[?#].*$/,'').slice(0,indexURL.replace(/[?#].*$/,'').lastIndexOf('/')+1);
  const required=BPA_REQUIRED_BUNDLE_FILES;
  if(!release&&manifest.versionCode<BPA_UPDATE_CHANNEL.versionCode)throw errorCode('bundle_compatibility','Tài nguyên mới chưa được phát hành.');
  if(manifest.schema!==1||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>1000||manifest.files.some(f=>!validBundlePath(f.path)||!Number.isInteger(f.size)||f.size<0||f.size>100000000||!/^[0-9a-f]{64}$/.test(f.sha256)))throw errorCode('invalid_bundle','Danh mục tài nguyên không hợp lệ.');
  if(required.some(name=>!manifest.files.some(file=>file.path===name)))throw errorCode('bundle_compatibility','Gói giao diện chưa có đầy đủ bộ vẽ widget của phiên bản này.');
  if(manifest.files.reduce((n,f)=>n+f.size,0)>350000000)throw errorCode('invalid_bundle','Gói tài nguyên vượt giới hạn.');
  const digest=sha256Raw(unescape(encodeURIComponent(text)));
  const total=manifest.files.reduce((n,f)=>n+f.size,0)+unescape(encodeURIComponent(text)).length;
  if(new Set(manifest.files.map(f=>f.path)).size!==manifest.files.length)throw errorCode('invalid_bundle','Gói có đường dẫn trùng nhau.');
  if(release&&(digest!==release.sha256||unescape(encodeURIComponent(text)).length!==release.resourceIndexSize||total!==release.size||manifest.versionCode!==release.versionCode||manifest.versionName!==release.versionName))throw errorCode('bundle_integrity','Gói không khớp manifest có chữ ký.');
  let bytes=unescape(encodeURIComponent(text)).length;
  const directory=bpaPath('web-'+digest.slice(0,16));
  if(!bpaFM.fileExists(directory))bpaFM.createDirectory(directory,true);
  // Files are staged under a content identity. The active pointer changes only
  // after every asset matches its declared size and digest.
  for(const file of manifest.files) {
    check();
    const path=bpaFM.joinPath(directory,file.path);
    if(bpaFM.fileExists(path)&&dataSize(bpaFM.read(path))===file.size&&sha256Data(bpaFM.read(path))===file.sha256){bytes+=file.size;if(progress)await progress(bytes,total);continue;}
    const req=new Request(resourceRoot+file.path.split('/').map(encodeURIComponent).join('/'));req.timeoutInterval=40;
    const data=await req.load();
    if(req.response.statusCode!==200||dataSize(data)!==file.size||sha256Data(data)!==file.sha256)throw errorCode('bundle_integrity','Không xác minh được tài nguyên '+file.path);
    const parent=path.slice(0,path.lastIndexOf('/'));if(!bpaFM.fileExists(parent))bpaFM.createDirectory(parent,true);
    check();bpaFM.write(path,data);bytes+=file.size;if(progress)await progress(bytes,total);
  }
  const value={path:directory,versionCode:manifest.versionCode,versionName:manifest.versionName,digest,files:manifest.files.map(f=>f.path)};
  check();return value;
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
  // Inspect status before parsing: login redirects and 503 pages may be HTML.
  const text=await request.loadString(),status=request.response.statusCode;
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

// Widget state and real deep-link actions; iOS owns timeline refresh timing.
function actionURL(action,kind,id,extra={}) {
  const params={scriptName:'BPA',action,kind,instance:id,...extra};
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

async function renderWidgetBitmap(payload) {
  const kind=payload.kind,theme=payload.theme||{};
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
  if(kind==='overview'&&theme.theme==='tien_mon_premium'&&!payload.largeImagePath) {
    const now=new Date(),minutes=now.getHours()*60+now.getMinutes();
    const name=minutes>=990&&minutes<1110?'wid_chieu.png':minutes>=1110||minutes<300?'w_toi.png':'wid_sang.png';
    const path=bpaFM.joinPath(bundle.path,'assets/assets/tien_mon_premium/widget_overview/'+name);
    payload.largeImagePath='data:image/png;base64,'+bpaFM.read(path).toBase64String();payload.premiumScenic=true;
  }
  if(kind==='widget2'&&!payload.widget2ImagePath&&named[theme.theme||'classic']) {
    const path=bpaFM.joinPath(bundle.path,'widget-assets/widget2_themes/'+named[theme.theme||'classic']);
    payload.widget2ImagePath='data:image/'+path.split('.').pop()+';base64,'+bpaFM.read(path).toBase64String();
  }
  if(!payload.fontData&&['FzCoTrang','MinecraftCustom'].includes(theme.fontFamily)) {
    const name=theme.fontFamily==='FzCoTrang'?'assets/assets/tien_mon_premium/fonts/FzCoTrang.ttf':'assets/assets/fonts/minecraft.ttf';
    payload.fontData='data:font/ttf;base64,'+bpaFM.read(bpaFM.joinPath(bundle.path,name)).toBase64String();
  }
  payload.icons={};
  for(const [name,file]of Object.entries({calendar:'ic_widget_calendar',sync:'ic_widget_reload',mode:payload.examMode?'ic_widget_back':'ic_widget_bell',study:'ic_widget_study',previous:kind==='overview'?'ic_overview_chevron_left':'ic_widget_up',next:kind==='overview'?'ic_overview_chevron_right':'ic_widget_down'}))payload.icons[name]='data:image/svg+xml;base64,'+bpaFM.read(bpaFM.joinPath(bundle.path,'widget-assets/icons/'+file+'.svg')).toBase64String();
  const renderer=new WebView();
  const code=(bpaFM.readString(bpaFM.joinPath(bundle.path,'widget-palette.js'))+'\n'+bpaFM.readString(bpaFM.joinPath(bundle.path,'widget-renderer.js'))).replace(/<\/script/gi,'<\\/script');
  await renderer.loadHTML('<html><body><script>'+code+'</script></body></html>');
  const result=await renderer.evaluateJavaScript(`renderWidget(${JSON.stringify(payload)}).then(completion).catch(e=>completion({error:String(e)}));`,true);
  if(result.error)throw errorCode('widget_render',result.error);
  return result;
}

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
let syncGeneration=0,syncInFlight=null;
function checkSyncGeneration(generation) {
  if(generation!==syncGeneration)throw errorCode('cancelled','Phiên đồng bộ đã bị hủy.');
}
function commitPortalResult(result,generation) {
  checkSyncGeneration(generation);
  const old=readState('semester-v1.json',null),state=BPACore.retain(old,result.semester);
  // Preserve the original term start when a later registration changes range.
  if(!(old&&old.current&&old.current.semesterId===result.semester.semesterId&&old.startedAt))state.startedAt=result.termStartedAt;
  writeState('semester-v1.json',state);
  return {semester:result.semester,termStartedAt:state.startedAt};
}
function syncPortal() {
  if(syncInFlight)return syncInFlight;
  const generation=syncGeneration;
  const job=performPortalSync(generation);
  syncInFlight=job;
  const clear=()=>{if(syncInFlight===job)syncInFlight=null;};
  job.then(clear,clear);
  return job;
}
async function performPortalSync(generation) {
  if(Keychain.contains('BPA.qldt-session')) {
    let session;
    try {session=JSON.parse(Keychain.get('BPA.qldt-session'));}
    catch(_){throw errorCode('qldt_session_invalid','Không đọc được phiên QLĐT đã lưu.');}
    try {return commitPortalResult(await fetchNativeQldt(session),generation);}
    catch(error){
      // A timeout, a 503 or invalid data is not evidence of expired login.
      // Only authentication failures may move to the login flow; never loop.
      if(error.code!=='qldt_session_expired')throw error;
      checkSyncGeneration(generation);
      Keychain.remove('BPA.qldt-session');
    }
  }
  checkSyncGeneration(generation);
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
  const reg=BPACore.registration(raw),chunks=BPACore.chunksFor(reg);
  const schedule=chunks.length?await callPortal(portal,scheduleScript(chunks),'betterPhenikaaSyncResult','betterPhenikaaSyncError',20000):{response:{Success:true,Data:[]}};
  const semester=BPACore.buildSemester(reg,BPACore.parseSchedule(schedule.response));
  if(!semester.displayName)throw errorCode('canonical_name_missing','QLDT_CANONICAL_NAME_MISSING');
  if(!chunks.length)throw errorCode('term_start_missing','Không xác định được môn đầu học kỳ.');
  // Flutter then applies its original diff, retention and transaction algorithm.
  const result=commitPortalResult({semester,termStartedAt:localISO(BPACore.vnDate(chunks[0].start))},generation);
  if(session) {
    const parsed=JSON.parse(session);
    if(parsed.tokenJWT&&parsed.userId&&parsed.iM!=null&&parsed.appId&&parsed.strChucNangId)Keychain.set('BPA.qldt-session',session);
  }
  return result;
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
async function handlePlatform(call,app) {
  const method=call.method,args=call.arguments,channel=call.channel.replace('better_phenikaa/','');
  if(channel==='qldt_scriptable') {
    if(method==='sync')return await syncPortal();
    if(method==='clear'){syncGeneration++;syncInFlight=null;for(const key of ['BPA.credentials','BPA.qldt-session'])if(Keychain.contains(key))Keychain.remove(key);return null;}
  }
  if(channel==='ios_runtime') {
    if(method==='publishSnapshot'){writeState('snapshot.json',args?JSON.parse(args):{classes:[],exams:[]});return null;}
    if(method==='selectWidgetDay'){const id=readState('last-widget.json',{id:'main'}).id;setWidgetSelection(args.kind,id,{...widgetSelection(args.kind,id),day:args.day,index:0,manualPosition:false});return null;}
    if(method==='takeWidgetAction'){const value=readState('pending-action.json',null);writeState('pending-action.json',null);return value;}
    if(method==='beginSync'||method==='endSync'||method==='refreshWidgets')return null;
  }
  if(channel==='widget_render'&&method==='renderPreview') {
    const kind=args.surface==='large'?'overview':args.surface;
    const rows=widgetRows(snapshot(),{day:isoDay(new Date()),mode:'study'},kind);
    const result=await renderWidgetBitmap({kind,day:isoDay(new Date()),examMode:false,index:0,count:rows.length,items:rows.slice(0,kind==='small'?1:kind==='overview'?4:5),theme:args,hostWidth:args.widthDp,hostHeight:args.heightDp});
    return result.png;
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
  if(channel==='assistant_test'&&method==='trigger')return await assistantNotification(args);
  if(channel==='daily_sync') {
    if(method==='syncReminders')return await scheduleExamReminders();
    if(method==='recordAppSyncSuccess'){
      writeState('sync-status.json',{lastSuccessAtMillis:Date.now()});
      const event=examChangeEvent(preference('better_phenikaa_semester_difference_v1'));
      // Android foreground sync records exam notice without a system notification.
      if(event===4||event===5)writeState('exam-notice.json',{message:assistantTemplate(4),initialized:true});
      return null;
    }
    if(method==='refreshWidgetToday') {
      const selections=readState('widgets.json');
      for(const key of Object.keys(selections))selections[key]={...selections[key],day:isoDay(new Date()),index:0,manualPosition:false};
      writeState('widgets.json',selections);return null;
    }
    if(method==='status')return readState('sync-status.json',{lastSuccessAtMillis:0});
    if(method==='examNotice')return readState('exam-notice.json',{message:null}).message;
    if(method==='clearReminders'){
      await Notification.removePending((await Notification.allPending()).filter(n=>n.identifier.startsWith('bpa.exam.')||n.identifier==='bpa.stale'||n.identifier==='bpa.changes').map(n=>n.identifier));
      await Notification.removeDelivered(['bpa.stale','bpa.changes']);writeState('exam-notice.json',{message:null});writeState('exam-reminders.json',{delivered:[],records:{}});return null;
    }
    if(method==='ackExamNotice'){
      writeState('exam-notice.json',{message:null,initialized:true});
      await Notification.removePending(['bpa.changes']);await Notification.removeDelivered(['bpa.changes']);return null;
    }
    if(method==='disable')return null;
    if(method==='enable')throw errorCode('automation_required','iOS yêu cầu thiết lập Automation; BPA không tự bật lịch đồng bộ.');
  }
  if(channel==='study_alarm'&&method==='setAlarm') {
    const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),args.hour,args.minute);
    if(next.getTime()<=now.getTime()+30000)next.setDate(next.getDate()+1);
    if(!Number.isInteger(args.hour)||!Number.isInteger(args.minute)||args.hour<0||args.hour>23||args.minute<0||args.minute>59||next.getTime()!==args.target||args.target>=args.classStart||args.target<=now.getTime()+30000||args.classStart-now.getTime()>=86400000)throw errorCode('alarm_occurrence','Thời điểm báo thức không khớp buổi học trong 24 giờ.');
    const callback=new CallbackURL('shortcuts://x-callback-url/run-shortcut');
    const requestId=UUID.string();
    callback.addParameter('name','BPA — Đặt báo thức');callback.addParameter('input','text');callback.addParameter('text',JSON.stringify({...args,requestId}));
    const response=await callback.open();
    const receipt=JSON.parse(response.result||'null');
    if(!receipt||receipt.status!=='BPA_ALARM_CREATED'||Number(receipt.hour)!==args.hour||Number(receipt.minute)!==args.minute||receipt.label!==args.label||Number(receipt.target)!==args.target||receipt.requestId!==requestId||typeof receipt.createdAlarm!=='string'||!receipt.createdAlarm.trim())throw errorCode('clock_unverified','Shortcut chưa xác nhận tạo đúng báo thức.');
    return true;
  }
  if(channel==='update_http'&&method==='fetch') {
    if(typeof args.url!=='string'||!/^https:\/\/[^/?#\s]+\//.test(args.url))throw errorCode('invalid_url','Cập nhật yêu cầu HTTPS.');
    const request=new Request(args.url);request.timeoutInterval=12;
    const data=await request.load();if(dataSize(data)>args.limit)throw errorCode('manifest_too_large','Manifest quá lớn.');return data.toBase64String();
  }
  if(channel==='update') {
    if(method==='versionCode')return readState('bundle.json',{versionCode:51}).versionCode;
    if(method==='versionName')return readState('bundle.json',{versionName:'cooc.1.6'}).versionName||'cooc.1.6';
    if(method==='installStatus')return readState('install-status.json',{status:'idle'}).status;
    if(method==='verifyReply')return acceptVerifiedRelease(args);
    if(method==='runtimeReady')return await commitBootedBundle(app);
    if(method==='hasBoundCard')return Keychain.contains('BPA.bound-card-uid');
    if(method==='removeBoundCard'){if(Keychain.contains('BPA.bound-card-uid'))Keychain.remove('BPA.bound-card-uid');return null;}
    if(['stopCard','cancel'].includes(method)){cardGeneration++;if(method==='cancel')cancelWebUpdate();return null;}
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
    if(method==='canInstall')return true;
    if(method==='downloadAndInstall')return await stageWebUpdate(args,app);
    if(method==='installSettings')return null;
  }
  if(channel==='widget_session'&&['clear','invalidate'].includes(method))return null;
  throw errorCode('unsupported_platform_method',`${channel}/${method} chưa có cầu Scriptable.`);
}
function installWidgetScripts(sourceOverride=null) {
  const source=sourceOverride||bpaFM.readString(module.filename);
  for(const [name,kind]of [['BPA — Nhỏ','small'],['BPA — Tổng quan','overview'],['BPA — Widget 2','widget2']]) {
    const content=source.replace(/const DEFAULT_KIND='(?:small|overview|widget2)';/,`const DEFAULT_KIND='${kind}';`);
    bpaFM.writeString(bpaFM.joinPath(bpaFM.documentsDirectory(),name+'.js'),content);
  }
}
async function openOriginalApp() {
  const bundle=await ensureLocalBundle(true);
  const app=new WebView();bootingApp=app;bootingBundle=bundle;
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
