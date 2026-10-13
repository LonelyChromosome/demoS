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
const BPA_UPDATE_CHANNEL={"manifestUrl": "https://raw.githubusercontent.com/LonelyChromosome/demoS/scriptable-release/latest.json", "publicKeyBase64": "62splcM91ZF6kt7ydxqmvN7Hc45c54n8bfCIVp8maFc=", "versionCode": 59, "versionName": "cooc.1.6"};
const BPA_BUNDLED_SHORTCUTS={"alarm": {"name": "BPA — Đặt báo thức", "size": 25594, "sha256": "da7f9e83d429f2e33d7a22cf8ef72bef1ceb873055d200575ec6570a0a3eb9ea", "base64": "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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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"}, "nfc": {"name": "BPA — Quét thẻ", "size": 23771, "sha256": "3e97f9ed0424c2cad4119790a6a0637f5c6efb525a41e91be40bb7813e9bc8e2", "base64": "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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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b25lV3NjYW5uEtztZjQ2M2I2YTktOTQwOAI54AQ3Ni1hNjM1LTBhOGVmZmQ1OWY0ZgCqUPiP5JDRQZEBUueSkltDdXJyBCcIWwkiTpTGlZmaVpbkl9FBmPTOjTOM8kYz5mQwOGE2MATP6TZjOGEtNWQ3ZgBs52VjLTU4ODkJoeQyNmE1CSJOnI6dn1ae5JozmVkgs0mSQYerCKGiOSz6orga5qMdHqTAwfQHAAhAS3Plpb/RpqcSPD205EZpZWwdfRAm7KOosbjSqaqrrVVXRgJLTHtXjC1sdeWsQ9E9dgAIUN6u5K/RQbABCIAtdlSAF7K0QB+zQAg2UB+15LbRQbcUVAAfgBe5u0AfukAIn1AfvOS90UG+80KYn2iNFv5oFVryC9zgBDU2NzMxYTAtNWM5NC01YWRiLTgyAahD9DDnZGUwODEwOQx/iTdHw47ExlbF6sEzwFdyZWNlaXASx07IxsnNzlbK5MvRQcwAiZmjxlRGNOU0OGFmNwIo5C1mOWMCxcY0MzRGMesxNjlmYTUzOTlkOPRO0I7R01bS5M4zzVsgbAhNACSD6dXWPEr7F/0G5tHX2FhXRh8JBwBGUJLZ5NrRQdvz4BXTVNCgCK8QFeDh4uPk5ebn6Onq6+zt7u/w8fLz9F8QFFdGQVZBB9EJoo0nF+MGyBNBcHD5VhjlU3RvcmU4G/YIReZydGljbGU4F/YIEJhcYWP4QakX6UNNYXBzTGluazga8yOHOC73McI4GvMFJelFbWFpbEFkZHIEsDgc8wctCcWKRm9sOBbzF38IR0UJbsisY0Zp+0LdEsgVbWFn+gcpCbi6JUxvYzhe9h9WCjgW8wE0zlBERvyEJVBoOC75AFzkUmljaAnhOBjzBdDHQAdTYWbkV2ViUDiR9gB5HyQIOBbzAHkHCwY4RvbraVR1bmVzUHJvZHU5gfPpovb3VVdhdGNooiorD4UJj+4LU2jg/1NlYXJjaKCgCQAIACMASgBrAHoAlACoAMQA6QEHASsBPQFZAXEBlwGbAZ4BowG+AdoB3wHiAewCAQIGAiMCQAJoAm8CdwKKAo8ClAKaArACtQLCAscC1QLkAvwDAgMpAy4DUwNeA3kDiwOQA5cDogOtA7oDyQPwA/oD/wQdBCQENwQ8BEEESARdBGAEYwRqBHEEhQSKBLEEtgTYBN8E7gTzBPoE/wUfBSgFNQU6BT8FQgVHBVAFVwVfBYYFiwWSBZcFnAXpBewF9AX7BgIGKQYuBjUGOgZBBksGUAZ3BoYGogaxBs4G8QcPBxAHFQcaBx0HIgdJB0oHUwdeB2MHagdvB3QHdwd+B4UHrAexB7jg4Qe9B8QHyQfrB/YICggeCCUILggzCDsIYghnCGwIbwh0CIAIhQiMCJEIlgiZCKAIpwjOCNMI2gjfCOYI8Aj1CRYJHQklCSoJLQlLCU8JVAlaCWIJZwlqCW8JdAl3CXwJgQmGCYkJjgmTCZYJmwmgCaUJqAmtCbIJtQm6CdMJ3goFCgoKEQoWCh0KJQoqCjEKNgo7Cj4KQwpKCnEKdgp9CoIKiQqVCpoKtwq6CsMKyArNCtAK1QrWCtcK2ArwCwcLGgs1C0wLYwt9C5ELqwvHC90L+AwNDCUMOwxODGkMgQyeDLQMxwzkDOcM7Q0KDQsNDAAQAc4CAQDynvsA9uMADQ0GAAAAAAAAAGJ2eCQ="}, "widgets": {"name": "BPA — Làm mới widget", "size": 24468, "sha256": "feb69376f6a90ddf137ae32cae04691efdae604b4d5d498ad30f24f35a92a322", "base64": "QUVBMQAAAACcCAAAYnBsaXN0MDDRAQJfEBdTaWduaW5nQ2VydGlmaWNhdGVDaGFpbqMDBAVPEQMKMIIDBjCCAqygAwIBAgIID3TIa8bwSKowCgYIKoZIzj0EAwIwcjEmMCQGA1UEAwwdQXBwbGUgU3lzdGVtIEludGVncmF0aW9uIENBIDQxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzAeFw0yNjEwMTMwNTM2MzFaFw0yNzExMDkyMDAwNDhaME0xKTAnBgNVBAMMIDlkYWNkZTczZDlkZTQyMDA4MTVkMDljMDFhZmI3M2U5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABNKfRiIlBIRG7MtvfmsEV4tO2LEyyLJv6OwQkX4z6zfzDGKcB4p2Sz4uZ+6tVLGoMj4qiRtVBsH0Q6uZTRfYvI2jggFPMIIBSzAMBgNVHRMBAf8EAjAAMB8GA1UdIwQYMBaAFHpHujiKFSRIIkbNvo8aJHs0AyppMEEGCCsGAQUFBwEBBDUwMzAxBggrBgEFBQcwAYYlaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hc2ljYTQwNDCBlgYDVR0gBIGOMIGLMIGIBgkqhkiG92NkBQEwezB5BggrBgEFBQcCAjBtDGtUaGlzIGNlcnRpZmljYXRlIGlzIHRvIGJlIHVzZWQgZXhjbHVzaXZlbHkgZm9yIGZ1bmN0aW9ucyBpbnRlcm5hbCB0byBBcHBsZSBQcm9kdWN0cyBhbmQvb3IgQXBwbGUgcHJvY2Vzc2VzLjAdBgNVHQ4EFgQUfmx6AFCSUdPHkYHP0JC6FD4Eq/0wDgYDVR0PAQH/BAQDAgeAMA8GCSqGSIb3Y2QSAQQCBQAwCgYIKoZIzj0EAwIDSAAwRQIgQ6a12yq6smNt+kgWhlkf+tx8VdvgfxwCJelCQBAdQwECIQC9576apWxKEwqIDJcvLk9oZnmnYwbA3AFScPOXs0tMiE8RAuowggLmMIICbaADAgECAggzDe74v0xoLjAKBggqhkjOPQQDAzBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzAeFw0xNzAyMjIyMjIzMjJaFw0zMjAyMTgwMDAwMDBaMHIxJjAkBgNVBAMMHUFwcGxlIFN5c3RlbSBJbnRlZ3JhdGlvbiBDQSA0MSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQGa6RWb32fJ9HONo6SG1bNVDZkSsmUaJn6ySB+4vVYD9ziausZRy8u7zukAbQBE0R8WiatoJwpJYrl5gZvT3xao4H3MIH0MA8GA1UdEwEB/wQFMAMBAf8wHwYDVR0jBBgwFoAUu7DeoVgziJqkipnevr3rr9rLJKswRgYIKwYBBQUHAQEEOjA4MDYGCCsGAQUFBzABhipodHRwOi8vb2NzcC5hcHBsZS5jb20vb2NzcDAzLWFwcGxlcm9vdGNhZzMwNwYDVR0fBDAwLjAsoCqgKIYmaHR0cDovL2NybC5hcHBsZS5jb20vYXBwbGVyb290Y2FnMy5jcmwwHQYDVR0OBBYEFHpHujiKFSRIIkbNvo8aJHs0AyppMA4GA1UdDwEB/wQEAwIBBjAQBgoqhkiG92NkBgIRBAIFADAKBggqhkjOPQQDAwNnADBkAjAVDKmOxq+WaWunn91c1ANZbK5S1GDGi3bgt8Wi8Ql84Jrja7HjfDHEJ3qnjon9q3cCMGEzIPEp//mHMq4pyGQ9dntRpNICL3a+YCKR8dU6ddy04sYqlv7GCdxKT9Uk8PzKsk8RAkcwggJDMIIByaADAgECAggtxfyI0sVLlTAKBggqhkjOPQQDAzBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzAeFw0xNDA0MzAxODE5MDZaFw0zOTA0MzAxODE5MDZaMGcxGzAZBgNVBAMMEkFwcGxlIFJvb3QgQ0EgLSBHMzEmMCQGA1UECwwdQXBwbGUgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxEzARBgNVBAoMCkFwcGxlIEluYy4xCzAJBgNVBAYTAlVTMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAEmOkvPUBypO2TInKBExzdEJXxxaNOcdwUFtkO5aYFKndke19OONO7HES1f/UftjJiXcnphFtPME8RWgD9WFgMpfUPLE0HRxN12peXl28xXO0rnXsgO9i5VNlemaQ6UQoxo0IwQDAdBgNVHQ4EFgQUu7DeoVgziJqkipnevr3rr9rLJKswDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwMDaAAwZQIxAIPpwcQWXhpdNBjZ7e/0bA4ARku437JGEcUP/eZ6jKGma87CA9Sc9ZPGdLhq36ojFQIwbWaKEMrUDdRPzY1DPrSKY6UzbuNt2he3ZB/IUyb5iGJ0OQsXW8tRqAzoGAPnorIoAAgACwAlACkDNwYlAAAAAAAAAgEAAAAAAAAABgAAAAAAAAAAAAAAAAAACHAwRgIhAMEiKBV2peBhTWbgsxnGC/wQlMBs6RPyKzYtdsHSK3IxAiEA+givOWQRWSBip9ZzUZ0BBnAE98OatmVc+dn4p2x04CQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAO3TYHs/umIVDxBMoaPGfBBt3wwE13mJb/i/44XADfxPyf3/wMBjCf+psQO6kwp8GUJIDMxNlp79+kYqA1FZ0Uu+nCR+sAyspZ5P49TYYuHgEljFs6r9AQlyKxMHZcrpSH8XAAAAAAAAlF8AAAAAAAAAABAAAAEAAGUCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFbLYjhDwdwUSiSHoqsdSXhdUymcV7ZsjJmsUnuhGLvxfxcAAJwNAAAwFUXFUtGiT2S4lSvOJuyB6kL17e8MYaS/AmA+B1iztgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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"}};
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
  recoverBackgroundCommit();
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
function validBundlePath(path) {
  return typeof path==='string'&&path.length<300&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(v=>v==='..'||v==='.'||v==='.git'||!v);
}
const BPA_REQUIRED_BUNDLE_FILES=['main.dart.js','widget-renderer.js','widget-palette.js','scriptable/BPA.js'];
async function ensureLocalBundle(allowPending=false,options={}) {
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
  const value=await stageLocalBundle(BPA_RESOURCE_ROOT+'bpa-package.json',null,options.progress||null,options.check||(()=>{}),options.verifier||null);(options.check||(()=>{}))();writeState('bundle.json',value);return value;
}
async function stageLocalBundle(indexURL,release=null,progress=null,check=()=>{},verifier=null) {
  if(typeof indexURL!=='string'||!/^https:\/\/[^/?#\s]+\//.test(indexURL))throw errorCode('invalid_url','Gói cập nhật yêu cầu HTTPS.');
  if(progress)await progress(0,0,{phase:'manifest'});
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
  for(const [index,file] of manifest.files.entries()) {
    check();
    const path=bpaFM.joinPath(directory,file.path);
    const meta={index:index+1,count:manifest.files.length};
    if(progress)await progress(bytes,total,{...meta,phase:'verify'});
    if(bpaFM.fileExists(path)) {
      const cached=await resourceIntegrity(bpaFM.read(path),verifier,check);
      if(cached.size===file.size&&cached.sha256===file.sha256){bytes+=file.size;if(progress)await progress(bytes,total,{...meta,phase:'reuse'});continue;}
    }
    // Reuse an older committed package only after checking this manifest's hash.
    const active=readState('bundle.json',null),oldPath=active?.path&&bpaFM.joinPath(active.path,file.path);
    if(oldPath&&oldPath!==path&&bpaFM.fileExists(oldPath)) {
      const old=bpaFM.read(oldPath),integrity=await resourceIntegrity(old,verifier,check);
      if(integrity.size===file.size&&integrity.sha256===file.sha256){
        const parent=path.slice(0,path.lastIndexOf('/'));if(!bpaFM.fileExists(parent))bpaFM.createDirectory(parent,true);
        check();bpaFM.write(path,old);bytes+=file.size;if(progress)await progress(bytes,total,{...meta,phase:'reuse'});continue;
      }
    }
    if(progress)await progress(bytes,total,{...meta,phase:'download'});
    const req=new Request(resourceRoot+file.path.split('/').map(encodeURIComponent).join('/'));req.timeoutInterval=40;
    const data=await req.load();
    if(req.response.statusCode!==200)throw errorCode('bundle_http','Không tải được tài nguyên BPA (HTTP '+req.response.statusCode+').');
    if(progress)await progress(bytes,total,{...meta,phase:'verify'});
    const integrity=await resourceIntegrity(data,verifier,check);
    if(integrity.size!==file.size||integrity.sha256!==file.sha256)throw errorCode('bundle_integrity','Không xác minh được tài nguyên '+file.path);
    const parent=path.slice(0,path.lastIndexOf('/'));if(!bpaFM.fileExists(parent))bpaFM.createDirectory(parent,true);
    check();bpaFM.write(path,data);bytes+=file.size;if(progress)await progress(bytes,total,{...meta,phase:'download'});
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

// Installation UI and native Web Crypto verification. Original Flutter UI is
// loaded into the same presented WebView after preparation completes.
function resourceIntegrityScript() {
  return `window.bpaIntegrity={async digest(encoded){
    if(!window.crypto||!crypto.subtle)throw Error('native_crypto_unavailable');
    const raw=atob(encoded),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    const result=await crypto.subtle.digest('SHA-256',bytes);
    return {size:bytes.length,sha256:Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,'0')).join('')};
  }};`;
}
function bootstrapHTML() {
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;height:100%;background:#edf3fc;color:#142c74;font:17px -apple-system,sans-serif}main{max-width:420px;margin:auto;padding:24px;min-height:90vh;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box}h1{font-size:30px;margin:0 0 24px}p{line-height:1.5}progress{width:100%;height:8px;accent-color:#1747b5}#detail{font-size:14px;color:#627397}button{align-self:flex-start;background:white;border:1px solid #ccd7ee;border-radius:16px;padding:12px 24px;color:#1747b5;font:inherit;margin-top:16px}</style></head><body><main><h1>BPA</h1><p style="font-size:13px;color:#627397">Bản thử nghiệm '+BPA_UPDATE_CHANNEL.versionCode+'</p><p id="status">Đang chuẩn bị BPA…</p><progress id="progress"></progress><p id="detail">Lần đầu cần tải tài nguyên. Các phần đã tải sẽ được giữ lại.</p><button id="cancel">Hủy</button></main><script>'+resourceIntegrityScript()+`
    const waits=[];let cancelled=false;
    window.bpaBootstrap={
      waitCancel(done){if(cancelled)done({cancelled:true});else waits.push(done);},
      finish(){for(const done of waits.splice(0))done({finished:true});},
      update(value){
        document.getElementById('status').textContent=value.status;
        document.getElementById('detail').textContent=value.detail||'';
        const p=document.getElementById('progress');
        if(value.total>0){p.max=value.total;p.value=value.bytes||0;}
        if(value.stopped)document.getElementById('cancel').disabled=true;
      }
    };
    document.getElementById('cancel').onclick=()=>{cancelled=true;document.getElementById('cancel').disabled=true;document.getElementById('status').textContent='Đang dừng…';for(const done of waits.splice(0))done({cancelled:true});};
  </script></body></html>`;
}
let resourceVerifierPromise=null;
async function integrityEvaluation(web,script,timeout=15000) {
  let timer;
  try{return await Promise.race([web.evaluateJavaScript(script,true),new Promise((_,reject)=>{timer=Timer.schedule(timeout,false,()=>reject(errorCode('bundle_hash_timeout','Kiểm tra tài nguyên chưa phản hồi. Chạy lại BPA để tiếp tục.')));})]);}
  finally{if(timer)timer.invalidate();}
}
async function createResourceVerifier(web=null) {
  if(!web){web=new WebView();await web.loadHTML('<!doctype html><script>'+resourceIntegrityScript()+'</script>','https://bpa.local/');}
  let native=false;
  try {
    const sample=await integrityEvaluation(web,'bpaIntegrity.digest("").then(completion,error=>completion({error:String(error)}));',5000);
    native=sample?.sha256==='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }catch(_){}
  return {backend:native?'webcrypto':'cooperative-js',async verify(data,check=()=>{}) {
    check();const encoded=data.toBase64String();
    if(native) {
      const result=await integrityEvaluation(web,`bpaIntegrity.digest(${JSON.stringify(encoded)}).then(completion,error=>completion({error:String(error)}));`);
      check();
      if(result?.error||!Number.isInteger(result?.size)||!/^[0-9a-f]{64}$/.test(result?.sha256||''))throw errorCode('bundle_hash','Không kiểm tra được tài nguyên BPA.');
      return result;
    }
    const raw=base64ByteView(encoded);
    return {size:raw.length,sha256:await sha256Cooperative(raw,check)};
  }};
}
async function resourceIntegrity(data,verifier=null,check=()=>{}) {
  if(!verifier){if(!resourceVerifierPromise)resourceVerifierPromise=createResourceVerifier().catch(error=>{resourceVerifierPromise=null;throw error;});verifier=await resourceVerifierPromise;}
  return await verifier.verify(data,check);
}
function cachedBundleReady() {
  const pending=readState('pending-bundle.json',null),active=readState('bundle.json',null);
  const complete=value=>value&&Array.isArray(value.files)&&BPA_REQUIRED_BUNDLE_FILES.every(name=>value.files.includes(name)&&bpaFM.fileExists(bpaFM.joinPath(value.path,name)));
  return pending&&!pending.bootAttempted&&complete(pending)||complete(active)&&active.versionCode>=BPA_UPDATE_CHANNEL.versionCode;
}
function acquireStartupLease() {
  const name='startup-lease.json',path=bpaPath(name),old=readState(name,null);
  if(old&&Date.now()-old.at<120000)throw errorCode('startup_busy','Một lượt chuẩn bị BPA đang chạy. Hãy quay lại lượt đó.');
  if(bpaFM.fileExists(path))bpaFM.remove(path);
  const id=UUID.string(),claim=bpaPath('startup-claim-'+id+'.json');
  bpaFM.writeString(claim,JSON.stringify({id,at:Date.now()}));
  try{bpaFM.move(claim,path);}catch(error){if(bpaFM.fileExists(claim))bpaFM.remove(claim);throw errorCode('startup_busy','Một lượt chuẩn bị BPA đang chạy.');}
  return {check(){if(readState(name,null)?.id!==id)throw errorCode('cancelled','Lượt chuẩn bị đã bị hủy.');},heartbeat(){this.check();writeState(name,{id,at:Date.now()});},release(){if(readState(name,null)?.id===id)writeState(name,null);}};
}
async function prepareAppBundle(app) {
  if(cachedBundleReady())return {bundle:await ensureLocalBundle(true),presentation:null};
  const lease=acquireStartupLease(),control={closed:false,cancelled:false},startedAt=Date.now();
  let presentation,stage;
  function check(){lease.check();if(control.cancelled||control.closed)throw errorCode('cancelled','Đã dừng chuẩn bị BPA.');}
  try {
    await app.loadHTML(bootstrapHTML(),'https://bpa.local/');
    let cancel;
    const cancellation=new Promise((_,reject)=>cancel=()=>reject(errorCode('cancelled','Đã dừng chuẩn bị BPA.')));
    // Capture completion before later evaluations replace its global binding.
    const waiting=app.evaluateJavaScript('bpaBootstrap.waitCancel(completion);',true).then(value=>{if(value?.cancelled){control.cancelled=true;cancel();}},error=>{if(!control.closed){control.cancelled=true;cancel();}});
    presentation=app.present(true).then(()=>{control.closed=true;control.cancelled=true;cancel();});
    const verifier=await Promise.race([createResourceVerifier(app),cancellation]);check();
    async function progress(bytes,total,meta={}) {
      check();lease.heartbeat();
      const phase=meta.phase||'download';
      writeState('startup-diagnostics.json',{versionCode:BPA_UPDATE_CHANNEL.versionCode,script:module.filename.split('/').pop(),phase,bytes,total,fileIndex:meta.index||0,fileCount:meta.count||0,backend:verifier.backend,elapsedMs:Date.now()-startedAt,at:Date.now()});
      const labels={manifest:'Đang kiểm tra gói BPA…',download:'Đang tải tài nguyên BPA…',verify:'Đang kiểm tra tài nguyên…',reuse:'Đang dùng lại tài nguyên đã tải…'};
      await app.evaluateJavaScript(`bpaBootstrap.update(${JSON.stringify({status:labels[phase]||'Đang chuẩn bị BPA…',detail:total?`${(bytes/1000000).toFixed(1)} / ${(total/1000000).toFixed(1)} MB · ${meta.index||0}/${meta.count||0} phần`:'Lần đầu cần mạng. Bạn có thể hủy và tiếp tục sau.',bytes,total})});null`,false);
    }
    stage=ensureLocalBundle(true,{progress,check,verifier});stage.catch(()=>{});
    const bundle=await Promise.race([stage,cancellation]);check();
    await app.evaluateJavaScript('bpaBootstrap.finish();null',false);
    writeState('startup-diagnostics.json',{versionCode:BPA_UPDATE_CHANNEL.versionCode,script:module.filename.split('/').pop(),status:'ready',backend:verifier.backend,elapsedMs:Date.now()-startedAt,at:Date.now()});
    return {bundle,presentation};
  } catch(error) {
    control.cancelled=true;
    writeState('startup-diagnostics.json',{versionCode:BPA_UPDATE_CHANNEL.versionCode,script:module.filename.split('/').pop(),status:error.code==='cancelled'?'cancelled':'failed',code:error.code||'startup_error',elapsedMs:Date.now()-startedAt,at:Date.now()});
    if(presentation&&!control.closed) {
      try{await app.evaluateJavaScript(`bpaBootstrap.finish();bpaBootstrap.update(${JSON.stringify({status:error.code==='cancelled'?'Đã dừng tải BPA':'Chưa chuẩn bị được BPA',detail:error.code==='cancelled'?'Các phần đã tải được giữ lại. Đóng màn hình rồi chạy BPA để tiếp tục.':error.message,stopped:true})});null`,false);}catch(_){}
      await presentation;
    }
    if(error.code==='cancelled')return null;
    throw error;
  } finally {lease.release();}
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
  if(['previous','next','mode'].includes(action)&&widgetShortcutReady())return widgetShortcutURL({mode:'home',action,kind,instance:id,requestId:UUID.string()});
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
  if(!params.engineOnly)await requestWidgetRefresh(true);
  // Native refresh intent is requested; launcher rendering still needs tests.
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

// Login uses the already presented app WebView. No second presentation or
// undocumented dismiss API, and no requirement to press Done after login.
const appSessions = new WeakMap();
function nativeDelay(milliseconds) {
  return new Promise(resolve => Timer.schedule(milliseconds, false, resolve));
}
async function portalProbe(app) {
  let timer;
  try {
    return await Promise.race([
      app.evaluateJavaScript(`location.hostname==='qldtbeta.phenikaa-uni.edu.vn'?(${SESSION_SCRIPT.trim().replace(/;$/, '')}):null`, false),
      new Promise((_, reject) => {timer=Timer.schedule(5000,false,()=>reject(errorCode('login_readiness_timeout','QLĐT chưa phản hồi. Hãy thử lại.')));})
    ]);
  } catch(error) {
    if(error.code==='login_readiness_timeout')throw error;
    // Navigation can replace the JavaScript world between probes.
    return null;
  } finally {if(timer)timer.invalidate();}
}
async function waitForPortalSession(app, state, generation, timeoutMs=600000) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline) {
    checkSyncGeneration(generation);
    if(state.closed)throw errorCode('cancelled','Đã đóng đăng nhập QLĐT.');
    const raw=await portalProbe(app);
    checkSyncGeneration(generation);
    if(state.closed)throw errorCode('cancelled','Đã đóng đăng nhập QLĐT.');
    if(raw) {
      let value;try {value=JSON.parse(raw);}catch(_){value=null;}
      if(value&&['tokenJWT','userId','iM','appId','strChucNangId'].every(key=>typeof value[key]==='string'&&value[key].trim()))return value;
    }
    await nativeDelay(100);
  }
  throw errorCode('login_timeout','Phiên đăng nhập QLĐT đã hết thời gian. Hãy thử lại.');
}
function wakeAppSession(state) {
  for(const resolve of state.waiters.splice(0))resolve();
}
function waitForAppSession(state) {
  if(state.phase==='app'||state.closed||state.failure)return Promise.resolve();
  return new Promise(resolve=>state.waiters.push(resolve));
}
async function restoreAppAfterLogin(app,state,generation) {
  checkSyncGeneration(generation);
  if(state.closed)return;
  // Keep the original task (including its error) for the rebuilt Flutter UI.
  // Its next sync consumes this once instead of opening login or fetching twice.
  state.loginResume={generation,promise:syncInFlight,claimed:false};
  await app.loadHTML(localAppHTML(state.bundle),'https://bpa.local/');
  checkSyncGeneration(generation);
  if(state.closed)return;
  state.preferences=readState('preferences.json');
  await app.evaluateJavaScript(`bpaHost.init(${JSON.stringify(state.preferences)},{loginResume:true});null`,false);
  state.phase='app';wakeAppSession(state);
}
async function authenticatePortalInApp(app,generation) {
  const state=app&&appSessions.get(app);
  if(!state||state.closed)throw errorCode('login_context','Không tìm thấy giao diện đăng nhập BPA.');
  state.phase='portal';state.epoch++;
  if(state.pollInterrupt)state.pollInterrupt();
  try {
    const preferences=await app.evaluateJavaScript('bpaHost.suspend();',false);
    checkSyncGeneration(generation);
    if(preferences)writeState('preferences.json',preferences);
    await app.loadURL('https://qldtbeta.phenikaa-uni.edu.vn/');
    return await waitForPortalSession(app,state,generation);
  } finally {
    if(!state.closed&&generation===syncGeneration) {
      try {await restoreAppAfterLogin(app,state,generation);}
      catch(error){state.failure=error;wakeAppSession(state);throw error;}
    }
  }
}
function takeLoginResume(app) {
  const state=app&&appSessions.get(app),resume=state&&state.loginResume;
  if(!resume||resume.claimed||resume.generation!==syncGeneration)return false;
  resume.claimed=true;return true;
}
function consumeLoginSync(app) {
  const state=app&&appSessions.get(app),resume=state&&state.loginResume;
  if(!resume||!resume.claimed||resume.generation!==syncGeneration)return null;
  state.loginResume=null;return resume.promise;
}

async function pollAppPacket(app,state) {
  let interrupt;
  const interrupted=new Promise(resolve=>{interrupt=()=>resolve(null);state.pollInterrupt=interrupt;});
  try {return await Promise.race([app.evaluateJavaScript('bpaHost.poll(completion);',true),interrupted]);}
  finally {if(state.pollInterrupt===interrupt)state.pollInterrupt=null;}
}

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
  if(input.action==='sync')return await runBackgroundSyncWorker(input);
  if(!input.action)return {status:'BPA_WIDGET_NO_CHANGE',requestId:input.requestId};
  if(!['previous','next','mode'].includes(input.action)||!['small','overview','widget2'].includes(input.kind)||typeof input.instance!=='string'||!input.instance||input.instance.length>512)throw errorCode('widget_action','Yêu cầu widget không hợp lệ.');
  await widgetAction(input.action,input.kind,input.instance,{engineOnly:true});
  return {status:'BPA_WIDGET_ACTION_COMMITTED',requestId:input.requestId};
}

// Runs in Scriptable's inline Shortcuts extension, independently of the app
// presentation. Physical iOS scheduling still needs a device test.
let syncWorkerContext=null;
function diskState(name,fallback={}) {
  const context=syncWorkerContext;syncWorkerContext=null;
  try{return readState(name,fallback);}finally{syncWorkerContext=context;}
}
function diskWrite(name,value) {
  const context=syncWorkerContext;syncWorkerContext=null;
  try{writeState(name,value);}finally{syncWorkerContext=context;}
}
function backgroundEpoch() {return diskState('account-epoch.json',{value:0}).value;}
function invalidateBackgroundSync() {
  recoverBackgroundCommit();
  diskWrite('account-epoch.json',{value:backgroundEpoch()+1});
  diskWrite('sync-lease.json',null);
}
function workerJobPath(id) {
  if(typeof id!=='string'||! /^[A-Za-z0-9-]{8,80}$/.test(id))throw errorCode('sync_job','Yêu cầu đồng bộ không hợp lệ.');
  return 'sync-job-'+id+'.json';
}
function checkBackgroundJob(job) {
  const lease=diskState('sync-lease.json',null);
  if(backgroundEpoch()!==job.epoch||!lease||lease.requestId!==job.requestId)throw errorCode('cancelled','Phiên đồng bộ đã bị hủy.');
  if(Date.now()-job.startedAt>600000)throw errorCode('sync_timeout','Đồng bộ đã quá thời gian.');
}
function recoverBackgroundCommit() {
  const journal=diskState('sync-commit.json',null);
  if(!journal)return;
  // A later logout owns the cleared state; never restore an older account.
  if(journal.epoch===backgroundEpoch()) {
    const result=diskState(workerJobPath(journal.requestId),null);
    if(result?.status!=='committed')for(const [name,value]of Object.entries(journal.before))diskWrite(name,value);
  }
  diskWrite('sync-commit.json',null);
}
function mergeWorkerPreferences(before,after,current) {
  const merged={...current};
  for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
    if(before[key]===after[key])continue;
    // Keep independent UI edits. Account epoch checks protect account data.
    if(current[key]!==before[key]&&current[key]!==after[key])throw errorCode('sync_conflict','Dữ liệu đã đổi trong lúc đồng bộ. Hãy đồng bộ lại.');
    if(Object.prototype.hasOwnProperty.call(after,key))merged[key]=after[key];else delete merged[key];
  }
  return merged;
}
function commitBackgroundState(job,context,result) {
  checkBackgroundJob(job);
  const changes=Object.fromEntries(context.states);
  changes['preferences.json']=mergeWorkerPreferences(job.preferences,changes['preferences.json']||job.preferences,diskState('preferences.json',{}));
  // Theme loading is incidental to the hidden runtime; foreground theme wins.
  delete changes['theme.json'];delete changes['widget-refresh.json'];
  changes['sync-revision.json']={requestId:job.requestId,epoch:job.epoch};
  const before={};for(const name of Object.keys(changes))before[name]=diskState(name,null);
  diskWrite('sync-commit.json',{requestId:job.requestId,epoch:job.epoch,before});
  try {
    for(const [name,value]of Object.entries(changes)){checkBackgroundJob(job);diskWrite(name,value);}
    checkBackgroundJob(job);
    const receipt={...result,status:'committed',requestId:job.requestId,epoch:job.epoch,completedAt:Date.now()};
    diskWrite(workerJobPath(job.requestId),receipt);
    diskWrite('sync-commit.json',null);return receipt;
  } catch(error) {recoverBackgroundCommit();throw error;}
}
function handleSyncWorkerCall(method) {
  if(!syncWorkerContext)throw errorCode('sync_worker_context','Không tìm thấy tác vụ đồng bộ.');
  checkBackgroundJob(syncWorkerContext.job);
  if(method==='payload')return syncWorkerContext.payload;
  if(method==='complete'){syncWorkerContext.complete=true;return null;}
  if(method==='failed')throw errorCode('sync_save_failed','Không lưu được lịch đã xác minh.');
  throw errorCode('sync_worker_method','Lệnh đồng bộ không hợp lệ.');
}
async function saveWorkerThroughOriginalDart(bundle,context) {
  const web=new WebView();
  await web.loadHTML(localAppHTML(bundle),'https://bpa.local/');
  await web.evaluateJavaScript(`bpaHost.init(${JSON.stringify(context.job.preferences)},{syncWorker:true});null`,false);
  while(!context.complete) {
    checkBackgroundJob(context.job);
    const packet=await web.evaluateJavaScript('bpaHost.poll(completion);',true);
    if(packet.preferences!==null)writeState('preferences.json',packet.preferences);
    for(const asset of packet.assets||[]) {
      if(!validBundlePath(asset.path)||!bundle.files.includes(asset.path))throw errorCode('sync_asset','Tài nguyên đồng bộ không hợp lệ.');
      const result={id:asset.id,data:bpaFM.read(bpaFM.joinPath(bundle.path,asset.path)).toBase64String()};
      await web.evaluateJavaScript(`bpaAssetResult(${JSON.stringify(result)});null`,false);
    }
    for(const call of packet.calls) {
      // No login, card, update, picker or presentation from the worker.
      const channel=call.channel.replace('better_phenikaa/','');
      if(!['sync_worker','ios_runtime','daily_sync','widget_theme','local_files'].includes(channel))throw errorCode('sync_worker_method','Tác vụ nền yêu cầu thao tác ngoài luồng lưu.');
      if(channel==='local_files'&&!['fileExists','readFile'].includes(call.method))throw errorCode('sync_worker_method','Tác vụ nền không mở bộ chọn tệp.');
      const value=await handlePlatform(call,web);
      await web.evaluateJavaScript(`bpaHost.result(${JSON.stringify({id:call.id,result:value})});null`,false);
    }
  }
}
async function runBackgroundSyncWorker(input) {
  const path=workerJobPath(input.requestId),job=diskState(path,null);
  if(!job||job.requestId!==input.requestId||job.status!=='queued')throw errorCode('sync_job','Tác vụ đồng bộ không còn hiệu lực.');
  recoverBackgroundCommit();checkBackgroundJob(job);
  if(!Keychain.contains('BPA.qldt-session'))throw errorCode('qldt_session_expired','Cần đăng nhập QLĐT.');
  const session=JSON.parse(Keychain.get('BPA.qldt-session'));
  if(sha256Raw(unescape(encodeURIComponent(String(session.userId))))!==job.account)throw errorCode('cancelled','Tài khoản đã thay đổi.');
  const context={job,states:new Map(),payload:null,complete:false,reminders:false};
  syncWorkerContext=context;
  try {
    const fetched=await fetchNativeQldt(session);checkBackgroundJob(job);
    context.payload=commitPortalResult(fetched,syncGeneration);
    if(job.save)await saveWorkerThroughOriginalDart(await ensureLocalBundle(),context);
    checkBackgroundJob(job);
    syncWorkerContext=null;
    const receipt=commitBackgroundState(job,context,{...context.payload,savedByScriptableWorker:job.save});
    if(context.stale){checkBackgroundJob(job);try {await scheduleStaleReminder(true);}catch(error){diskWrite('sync-maintenance.json',{requestId:job.requestId,stale:'pending',code:error.code||'notification_error'});}}
    if(context.reminders) {
      try {await scheduleExamReminders();}catch(error){diskWrite('sync-maintenance.json',{requestId:job.requestId,reminders:'pending',code:error.code||'notification_error'});}
    }
    return {status:'BPA_SYNC_COMMITTED',requestId:job.requestId};
  } catch(error) {
    syncWorkerContext=null;
    diskWrite(path,{status:'failed',requestId:job.requestId,epoch:job.epoch,code:error.code||'sync_error'});
    throw error;
  } finally {syncWorkerContext=null;}
}
async function dispatchBackgroundSync(app,generation) {
  const state=appSessions.get(app);if(!state||state.closed)throw errorCode('cancelled','Đã đóng BPA.');
  await ensureWidgetShortcut();checkSyncGeneration(generation);
  // Only authentication failures may open the original QLDT WebView once.
  async function session() {
    if(Keychain.contains('BPA.qldt-session'))return JSON.parse(Keychain.get('BPA.qldt-session'));
    const value=await authenticatePortalInApp(app,generation);checkSyncGeneration(generation);
    Keychain.set('BPA.qldt-session',JSON.stringify(value));return value;
  }
  async function run(value) {
    checkSyncGeneration(generation);recoverBackgroundCommit();
    const existing=diskState('sync-lease.json',null);
    if(existing&&Date.now()-existing.startedAt<600000)throw errorCode('sync_busy','Đang có tác vụ đồng bộ.');
    state.phase='worker';if(state.pollInterrupt)state.pollInterrupt();
    const preferences=await app.evaluateJavaScript('bpaHost.suspend();',false);
    checkSyncGeneration(generation);writeState('preferences.json',preferences);
    const requestId=UUID.string(),epoch=backgroundEpoch(),startedAt=Date.now();
    const job={requestId,epoch,startedAt,preferences,status:'queued',save:preference('better_phenikaa_account_setup_complete_v1')===true,account:sha256Raw(unescape(encodeURIComponent(String(value.userId))))};
    diskWrite(workerJobPath(requestId),job);diskWrite('sync-lease.json',{requestId,epoch,startedAt});
    try {
      let callbackError;
      try {await invokeBundledShortcut('widgets',{mode:'sync',action:'sync',requestId});}catch(error){callbackError=error;}
      checkBackgroundJob(job);checkSyncGeneration(generation);
      const result=diskState(workerJobPath(requestId),null);
      if(result?.status==='failed')throw errorCode(result.code,'Đồng bộ chưa hoàn tất.');
      if(result?.status!=='committed')throw callbackError||errorCode('sync_not_committed','Tác vụ nền chưa xác nhận lưu lịch.');
      state.preferences=readState('preferences.json');state.syncRevision=readState('sync-revision.json',{}).requestId||null;
      await app.evaluateJavaScript(`bpaHost.replacePreferences(${JSON.stringify(state.preferences)});null`,false);
      return result;
    } finally {
      const lease=diskState('sync-lease.json',null);if(lease?.requestId===requestId)diskWrite('sync-lease.json',null);
      diskWrite(workerJobPath(requestId),null);
      if(!state.closed){state.phase='app';wakeAppSession(state);}
    }
  }
  let value=await session();
  try {return await run(value);}catch(error) {
    if(error.code!=='qldt_session_expired')throw error;
    checkSyncGeneration(generation);Keychain.remove('BPA.qldt-session');
    value=await session();return await run(value);
  }
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
  if(syncWorkerContext && syncWorkerContext.states.has(name))return syncWorkerContext.states.get(name);
  const p=bpaPath(name);
  if(!bpaFM.fileExists(p)&&bpaFM.fileExists(p+'.backup'))bpaFM.move(p+'.backup',p);
  return bpaFM.fileExists(p)?JSON.parse(bpaFM.readString(p)):fallback;
}
function writeState(name,value) {
  if(syncWorkerContext){syncWorkerContext.states.set(name,value);return;}
  saveVerified(bpaFM,bpaPath(name),value);
}
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
function syncPortal(app=null) {
  const resumed=consumeLoginSync(app);if(resumed)return resumed;
  if(syncInFlight)return syncInFlight;
  const generation=syncGeneration;
  const job=performPortalSync(generation,app);
  syncInFlight=job;
  const clear=()=>{if(syncInFlight===job)syncInFlight=null;};
  job.then(clear,clear);
  return job;
}
async function performPortalSync(generation,app) {
  if(app)return await dispatchBackgroundSync(app,generation);

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
  const session=await authenticatePortalInApp(app,generation);
  checkSyncGeneration(generation);
  Keychain.set('BPA.qldt-session',JSON.stringify(session));
  // Original Android wire format/verification, while the restored app displays
  // its existing sync state. Authentication is never restarted on fetch errors.
  return commitPortalResult(await fetchNativeQldt(session),generation);
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
  if(channel==='sync_worker'){if(method==='refreshed'&&!syncWorkerContext)return null;return handleSyncWorkerCall(method);}
  if(channel==='qldt_scriptable') {
    if(method==='sync')return await syncPortal(app);
    if(method==='takeLoginResume')return takeLoginResume(app);
    if(method==='clear'){
      invalidateBackgroundSync();
      syncGeneration++;syncInFlight=null;
      for(const key of ['BPA.credentials','BPA.qldt-session'])if(Keychain.contains(key))Keychain.remove(key);
      // A new student can share the university's semester ID, but must not
      // inherit the previous account's earliest class/retention or widget day.
      writeState('semester-v1.json',null);writeState('snapshot.json',{classes:[],exams:[]});
      writeState('widgets.json',{});writeState('pending-action.json',null);
      const state=app&&appSessions.get(app);if(state)state.loginResume=null;
      return null;
    }
  }
  if(channel==='ios_runtime') {
    if(method==='publishSnapshot'){writeState('snapshot.json',args?JSON.parse(args):{classes:[],exams:[]});return null;}
    if(method==='selectWidgetDay'){const id=readState('last-widget.json',{id:'main'}).id;setWidgetSelection(args.kind,id,{...widgetSelection(args.kind,id),day:args.day,index:0,manualPosition:false});return null;}
    if(method==='takeWidgetAction'){const value=readState('pending-action.json',null);writeState('pending-action.json',null);return value;}
    if(method==='beginSync'||method==='endSync')return null;
    if(method==='refreshWidgets'){writeState('widget-refresh.json',{status:'dirty',at:Date.now()});return null;}
  }
  if(channel==='widget_render'&&method==='renderPreview') {
    const kind=args.surface==='large'?'overview':args.surface;
    const rows=widgetRows(snapshot(),{day:isoDay(new Date()),mode:'study'},kind);
    const result=await renderWidgetBitmap({kind,day:isoDay(new Date()),examMode:false,index:0,count:rows.length,items:rows.slice(0,kind==='small'?1:kind==='overview'?4:5),theme:args,hostWidth:args.widthDp,hostHeight:args.heightDp});
    return result.png;
  }
  if(channel==='widget_theme'&&method==='applyTheme'){writeState('theme.json',args);if(args.refreshWidgets!==false)await requestWidgetRefresh(false);return 1;}
  if(channel==='local_files') {
    if(method==='pickFile')return await pickManaged(args.kind);
    if(method==='fileExists')return bpaFM.fileExists(safeManagedPath(args));
    if(method==='readFile'){const path=safeManagedPath(args.path),data=bpaFM.read(path);if(dataSize(data)>args.maximumBytes)throw errorCode('file_too_large','Tệp vượt giới hạn.');return data.toBase64String();}
  }
  if(channel==='widget_pin'&&method==='requestPin') {
    installWidgetScripts();await ensureWidgetShortcut();
    const a=new Alert();a.title='Widget BPA';a.message='Các script widget đã được chuẩn bị. Nhấn giữ màn hình chính → thêm widget Scriptable → chọn script BPA tương ứng.';a.addAction('Xong');await a.presentAlert();return false;
  }
  if(channel==='assistant_test'&&method==='trigger')return await assistantNotification(args);
  if(channel==='daily_sync') {
    if(method==='syncReminders'){if(syncWorkerContext){syncWorkerContext.reminders=true;return null;}await ensureReminderAutomation();return await scheduleExamReminders();}
    if(method==='recordAppSyncSuccess'){
      writeState('sync-status.json',{lastSuccessAtMillis:Date.now()});
      if(syncWorkerContext)syncWorkerContext.stale=true;else await scheduleStaleReminder(true);
      const event=examChangeEvent(preference('better_phenikaa_semester_difference_v1'));
      // Android foreground sync records exam notice without a system notification.
      if(event===4||event===5)writeState('exam-notice.json',{message:assistantTemplate(4),initialized:true});
      return null;
    }
    if(method==='refreshWidgetToday') {
      const selections=readState('widgets.json');
      for(const key of Object.keys(selections))selections[key]={...selections[key],day:isoDay(new Date()),index:0,manualPosition:false};
      writeState('widgets.json',selections);await requestWidgetRefresh(false);return null;
    }
    if(method==='status')return readState('sync-status.json',{lastSuccessAtMillis:0});
    if(method==='examNotice')return readState('exam-notice.json',{message:null}).message;
    if(method==='clearReminders'){
      await Notification.removePending((await Notification.allPending()).filter(n=>n.identifier.startsWith('bpa.exam.')||n.identifier==='bpa.stale'||n.identifier.startsWith('bpa.stale.')||n.identifier==='bpa.changes').map(n=>n.identifier));
      await Notification.removeDelivered((await Notification.allDelivered()).filter(n=>n.identifier==='bpa.stale'||n.identifier.startsWith('bpa.stale.')||n.identifier==='bpa.changes').map(n=>n.identifier));writeState('sync-stale.json',{});writeState('exam-notice.json',{message:null});writeState('exam-reminders.json',{delivered:[],records:{}});return null;
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
    const started=Date.now();await ensureClockShortcut();
    if(Date.now()-started>90000||args.target<=Date.now()+30000)throw errorCode('alarm_setup_timeout','Thời điểm báo thức đã quá gần. Hãy chọn lại giờ.');
    const requestId=UUID.string();
    const response=await invokeBundledShortcut('alarm',{...args,mode:'create',requestId,timeText:String(args.hour).padStart(2,'0')+':'+String(args.minute).padStart(2,'0')});
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
      const uid=await requestCardUID(generation);
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
  const engine=source.replace(/\nif\(typeof Script!=='undefined'\)bpaMain\(\)/,"\nif(false)bpaMain()")+'\nmodule.exports={widgetCommand,reminderMaintenance};\n';
  bpaFM.writeString(bpaFM.joinPath(bpaFM.documentsDirectory(),'BPA — WidgetEngine.js'),engine);
  bpaFM.writeString(bpaFM.joinPath(bpaFM.documentsDirectory(),'BPA — Nhắc lịch.js'),engine+'\nif(typeof Script!=="undefined")reminderMaintenance().then(result=>{Script.setShortcutOutput(JSON.stringify(result));Script.complete();}).catch(error=>{writeState("reminder-error.json",{code:error.code||"reminder_error",at:Date.now()});Script.complete();});\n');
  for(const [name,kind]of [['BPA — Nhỏ','small'],['BPA — Tổng quan','overview'],['BPA — Widget 2','widget2']]) {
    const content=source.replace(/const DEFAULT_KIND='(?:small|overview|widget2)';/,`const DEFAULT_KIND='${kind}';`);
    bpaFM.writeString(bpaFM.joinPath(bpaFM.documentsDirectory(),name+'.js'),content);
  }
}
async function openOriginalApp() {
  const app=new WebView(),prepared=await prepareAppBundle(app);if(!prepared)return;
  const {bundle}=prepared;
  if(preference('better_phenikaa_account_setup_complete_v1')===true)await ensureReminderAutomation();
  bootingApp=app;bootingBundle=bundle;
  await app.loadHTML(localAppHTML(bundle),'https://bpa.local/');
  const ready=await app.evaluateJavaScript('typeof bpaHost!=="undefined"&&typeof bpaStart==="function"',false);
  if(!ready)throw errorCode('web_build_unavailable','Bản giao diện BPA chưa sẵn sàng ở địa chỉ build.');
  const initialPreferences=readState('preferences.json');
  await app.evaluateJavaScript(`bpaHost.init(${JSON.stringify(initialPreferences)});null`,false);
  const state={phase:'app',epoch:0,closed:false,waiters:[],bundle,loginResume:null,failure:null,preferences:initialPreferences,syncRevision:readState('sync-revision.json',{}).requestId||null};
  appSessions.set(app,state);
  const jobs=new Set();
  const presentation=(prepared.presentation||app.present(true)).then(()=>{state.closed=true;syncGeneration++;if(state.pollInterrupt)state.pollInterrupt();wakeAppSession(state);});
  while(!state.closed) {
    if(state.failure)throw state.failure;
    if(state.phase!=='app'){await waitForAppSession(state);continue;}
    const epoch=state.epoch;
    let packet;
    try {packet=await pollAppPacket(app,state);}
    catch(error){if(state.closed)break;if(epoch!==state.epoch||state.phase!=='app')continue;throw error;}
    if(!packet||state.closed||epoch!==state.epoch||state.phase!=='app')continue;
    if(packet.preferences!==null){
      const preferences=mergeWorkerPreferences(state.preferences,packet.preferences,readState('preferences.json'));
      writeState('preferences.json',preferences);state.preferences=preferences;
    }
    const revision=readState('sync-revision.json',{}).requestId||null;
    if(revision!==state.syncRevision){
      state.syncRevision=revision;state.preferences=readState('preferences.json');
      await app.evaluateJavaScript(`bpaHost.replacePreferences(${JSON.stringify(state.preferences)});null`,false);
      await sendNativeEvent(app,'sync_worker','refresh');
    }
    for(const asset of packet.assets||[]) {
      let result;
      try {
        if(!validBundlePath(asset.path)||!bundle.files.includes(asset.path))throw Error('Tài nguyên ngoài gói BPA.');
        result={id:asset.id,data:bpaFM.read(bpaFM.joinPath(bundle.path,asset.path)).toBase64String()};
      } catch(error){result={id:asset.id,error:error.message};}
      if(!state.closed&&epoch===state.epoch&&state.phase==='app')await app.evaluateJavaScript(`bpaAssetResult(${JSON.stringify(result)});null`,false);
    }
    for(const call of packet.calls) {
      if(state.closed||epoch!==state.epoch||state.phase!=='app')break;
      const job=(async()=>{
        let result;
        try {result={id:call.id,result:await handlePlatform(call,app)};}
        catch(error){result={id:call.id,error:{code:error.code||'scriptable_error',message:error.message}};}
        if(!state.closed&&epoch===state.epoch&&state.phase==='app')await app.evaluateJavaScript(`bpaHost.result(${JSON.stringify(result)});null`,false);
      })();
      jobs.add(job);job.then(()=>jobs.delete(job),()=>jobs.delete(job));
    }
  }
  cardGeneration++;
  await Promise.allSettled([...jobs]);
  await presentation;
}
async function bpaMain() {
  recoverBackgroundCommit();
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
