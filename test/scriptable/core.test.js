const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const core=require('../../scriptable/core');
const response=Data=>({Success:true,Data});
function fixture() {
  return {userId:'student',semesters:response([{ID:'term',THOIGIAN:'2026_2027_1'}]),plans:response([{ID:'plan',MAKEHOACH:'2026_2027_1',DAOTAO_THOIGIANDAOTAO_ID:'term'}]),registrations:response([{DANGKY_KEHOACHDANGKY_ID:'plan',DAOTAO_THOIGIANDAOTAO_ID:'term',DAOTAO_HOCPHAN_ID:'subject',DAOTAO_HOCPHAN_TEN:'Môn Cơ sở dữ liệu',DANGKY_LOPHOCPHAN_ID:'class',DANGKY_LOPHOCPHAN_TEN:'N01',NGAYBATDAU:'01/09/2026',NGAYKETTHUC:'30/12/2026',QLSV_NGUOIHOC_HODEM:'Nguyễn',QLSV_NGUOIHOC_TEN:'Đạo'}])};
}
function row(extra={}) { return {PHANLOAI:'LICHHOC',TENHOCPHAN:'Môn Cơ sở dữ liệu',NGAYHOC:'12/10/2026',GIOBATDAU:8,PHUTBATDAU:0,GIOKETTHUC:9,PHUTKETTHUC:30,TENLOPHOCPHAN:'N01',PHONGHOC_TEN:'A101',...extra}; }
test('Vietnamese normalization keeps accents and canonical equivalence',()=>{
  assert.equal(core.normalizeSubject('  Môn Cơ  sở dữ liệu  '),core.normalizeSubject('Cơ sở dữ liệu'.normalize('NFD')));
  assert.notEqual(core.normalizeSubject('Cơ sở dữ liệu'),core.normalizeSubject('Co so du lieu'));
  assert.equal(core.displayName('Môn Cơ sở dữ liệu-1-1-26(N08)'),'Cơ sở dữ liệu');
});
test('calendar validation and four month seven day clamping',()=>{
  assert.throws(()=>core.vnDate('31/02/2026'));
  assert.equal(core.expiry(new Date(2026,9,31)).getMonth(),2);
  assert.equal(core.expiry(new Date(2026,9,31)).getDate(),7);
});
test('latest verified registration, exact class, correct identity',()=>{
  const reg=core.registration(fixture()), records=core.parseSchedule(response([row(),row()]));
  assert.equal(records.length,1);
  const semester=core.buildSemester(reg,records,new Date('2026-10-12T12:00:00Z'));
  assert.equal(semester.displayName,'Nguyễn Đạo');
  const norm=core.normalizeSubject('Cơ sở dữ liệu');
  assert.equal(semester.subjects[0].subjectId,'S'+Buffer.from(`${reg.id.length}:${reg.id}${norm}`).toString('base64url'));
  assert.equal(semester.subjects[0].studySchedules.length,1);
  assert.throws(()=>core.buildSemester(reg,core.parseSchedule(response([row({TENLOPHOCPHAN:'N02'})]))));
});
test('ambiguous plan and wrong semester are rejected',()=>{
  const raw=fixture(); raw.plans.Data.push({...raw.plans.Data[0],ID:'other'});
  assert.throws(()=>core.registration(raw),/PLAN_AMBIGUOUS/);
  const wrong=fixture(); wrong.registrations.Data[0].DANGKY_KEHOACHDANGKY_ID='wrong';
  assert.throws(()=>core.registration(wrong));
});
test('strict response errors and malformed records cannot become empty success',()=>{
  assert.throws(()=>core.parseSchedule({Success:false,Data:[]}));
  assert.throws(()=>core.parseSchedule(response([row({GIOBATDAU:24})])));
  assert.throws(()=>core.parseSchedule(response([row({GIOKETTHUC:7})])));
  assert.throws(()=>core.parseSchedule(response([row({PHANLOAI:'UNKNOWN'})])));
});
test('exam format accepted only with verified subject and term',()=>{
  const reg=core.registration(fixture());
  const exam=row({PHANLOAI:'LICHTHI',TENLOPHOCPHAN:'Trắc nghiệm trên máy 30p'});
  assert.equal(core.buildSemester(reg,core.parseSchedule(response([exam]))).subjects[0].examSchedules.length,1);
  assert.throws(()=>core.buildSemester(reg,core.parseSchedule(response([{...exam,NGAYHOC:'01/01/2026'}]))));
  assert.equal(core.verify(reg,core.parseSchedule(response([row({TENHOCPHAN:'Môn khác'})]))).length,0);
});
test('weekly chunks cover inclusive expiry without overlap',()=>{
  const chunks=core.chunksFor(core.registration(fixture()));
  assert.equal(chunks[0].start,'01/09/2026'); assert.equal(chunks.at(-1).end,'08/01/2027');
  for(let i=1;i<chunks.length;i++) assert.equal(+core.vnDate(chunks[i].start)-+core.vnDate(chunks[i-1].end),86400000);
});
test('previous semester retained through expiry day, removed following day',()=>{
  const reg=core.registration(fixture()), current=core.buildSemester(reg,core.parseSchedule(response([row()])));
  const old={current:{...current,semesterId:'2025_2026_2'},startedAt:'2026-06-01T00:00:00',previous:null};
  assert.ok(core.retain(old,current,new Date(2026,9,8,12)).previous);
  assert.equal(core.retain(old,current,new Date(2026,9,9)).previous,null);
});
function portalContext(){
  const ctx=vm.createContext({module:{exports:{}},console,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync('scriptable/BPA-Scriptable-Sync.js','utf8'),ctx);
  return ctx;
}
test('original Android registration script works through Scriptable completion adapter',async()=>{
  const ctx=portalContext(),raw=fixture();
  ctx.window=ctx; ctx.edu={system:{userId:'student',iM:'mode',makeRequest(request){
    const result=request.data.func.includes('LayThoiGian')?raw.semesters:request.data.func.includes('LayDSKeHoach')?raw.plans:raw.registrations;
    setTimeout(()=>request.success(result),0);
  }}}; ctx.document={querySelector(){return null;}};
  const web={evaluateJavaScript(source){return new Promise(resolve=>{ctx.completion=resolve; vm.runInContext(source,ctx);});}};
  ctx.web=web;
  const result=await vm.runInContext("callPortal(web,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',1000)",ctx);
  assert.equal(result.userId,'student'); assert.equal(result.registrations.Data.length,1);
});
test('original Android schedule script caps requests at eight and waits for all',async()=>{
  const ctx=portalContext(); let active=0,max=0,completed=0;
  ctx.window=ctx; ctx.edu={system:{userId:'student',iM:'mode',makeRequest(request){
    active++; max=Math.max(max,active);
    setTimeout(()=>{active--;completed++;request.success(response([row()]));},3);
  }}};
  ctx.chunks=Array.from({length:19},()=>({start:'01/09/2026',end:'07/09/2026'}));
  ctx.web={evaluateJavaScript(source){return new Promise(resolve=>{ctx.completion=resolve;vm.runInContext(source,ctx);});}};
  const result=await vm.runInContext("callPortal(web,scheduleScript(chunks),'betterPhenikaaSyncResult','betterPhenikaaSyncError',1000)",ctx);
  assert.equal(max,8); assert.equal(completed,19); assert.equal(result.response.Data.length,19);
});
test('session missing and callback timeout fail explicitly',async()=>{
  const ctx=portalContext(); ctx.window=ctx;
  ctx.web={evaluateJavaScript(source){return new Promise(resolve=>{ctx.completion=resolve;vm.runInContext(source,ctx);});}};
  await assert.rejects(vm.runInContext("callPortal(web,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',20)",ctx),/SESSION_EXPIRED/);
  ctx.edu={system:{userId:'student',iM:'mode',makeRequest(){}}};ctx.document={querySelector(){return null;}};
  await assert.rejects(vm.runInContext("callPortal(web,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',20)",ctx),/TIMEOUT/);
});
test('failed final rename restores prior validated data',()=>{
  const ctx=portalContext(),files=new Map([['data','OLD']]);
  ctx.fm={writeString(p,v){files.set(p,v);},readString:p=>files.get(p),fileExists:p=>files.has(p),remove:p=>files.delete(p),move(a,b){if(a.endsWith('.pending')) throw Error('disk'); files.set(b,files.get(a));files.delete(a);}};
  assert.throws(()=>vm.runInContext("saveVerified(fm,'data',{current:'NEW'})",ctx),/disk/);
  assert.equal(files.get('data'),'OLD');
});
