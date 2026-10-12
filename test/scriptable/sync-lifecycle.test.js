const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function host(){
 const keys=new Map([['BPA.qldt-session','{"tokenJWT":"test"}']]),states=new Map();
 const c=vm.createContext({Buffer,module:{exports:{}},Keychain:{contains:k=>keys.has(k),get:k=>keys.get(k),set:(k,v)=>keys.set(k,v),remove:k=>keys.delete(k)}});
 vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);
 c.readState=(k,fallback)=>states.has(k)?states.get(k):fallback;c.writeState=(k,v)=>states.set(k,v);
 c.result={semester:{semesterId:'2026_2027_1',displayName:'Test',subjects:[]},termStartedAt:'2026-09-01T00:00:00'};
 return {c,keys,states};
}
test('native sync persists verified state and shares one request across callers',async()=>{
 const {c,states}=host();let calls=0,finish;
 c.fetchNativeQldt=()=>{calls++;return new Promise(r=>finish=r);};
 const a=vm.runInContext('syncPortal()',c),b=vm.runInContext('syncPortal()',c);
 assert.equal(a,b);assert.equal(calls,1);finish(c.result);await a;
 assert.equal(states.get('semester-v1.json').current.semesterId,'2026_2027_1');
 states.get('semester-v1.json').startedAt='2026-08-25T00:00:00';
 c.fetchNativeQldt=async()=>c.result;
 assert.equal((await vm.runInContext('syncPortal()',c)).termStartedAt,'2026-08-25T00:00:00');
});
test('logout invalidates in-flight sync without resurrecting state or credentials',async()=>{
 const {c,keys,states}=host();let finish;c.fetchNativeQldt=()=>new Promise(r=>finish=r);
 const pending=vm.runInContext('syncPortal()',c);
 await vm.runInContext('handlePlatform({channel:"better_phenikaa/qldt_scriptable",method:"clear"},null)',c);
 finish(c.result);await assert.rejects(pending,e=>e.code==='cancelled');
 assert.equal(states.has('semester-v1.json'),false);assert.equal(keys.has('BPA.qldt-session'),false);
});
test('network and verification failure keep saved data and do not open a login loop',async()=>{
 for(const code of ['qldt_http','qldt_response','qldt_verification',undefined]){
  const {c,states,keys}=host();const previous={current:{semesterId:'old'},startedAt:'2026-05-01T00:00:00'};states.set('semester-v1.json',previous);
  let opened=0;c.WebView=class {constructor(){opened++;}};
  c.fetchNativeQldt=async()=>{const e=Error('failure');e.code=code;throw e;};
  await assert.rejects(vm.runInContext('syncPortal()',c),/failure/);
  assert.equal(opened,0);assert.equal(states.get('semester-v1.json'),previous);assert.equal(keys.has('BPA.qldt-session'),true);
  c.fetchNativeQldt=async()=>c.result;await vm.runInContext('syncPortal()',c);
 }
});
test('HTTP errors are identified before trying to parse HTML as JSON',async()=>{
 for(const [status,expected]of [[401,'qldt_session_expired'],[403,'qldt_session_expired'],[503,'qldt_http'],[200,'qldt_response']]){
  const {c}=host();c.Request=class {constructor(){this.response={statusCode:status};}async loadString(){return '<html>unavailable</html>';}};
  await assert.rejects(vm.runInContext('qldtPost({iM:"x"},"SV_X/key","f",{})',c),e=>e.code===expected);
 }
});
test('expired auth requests one managed login; a rejected login never retries recursively',async()=>{
 const {c,keys}=host();let opened=0;
 c.fetchNativeQldt=async()=>{const e=Error('expired');e.code='qldt_session_expired';throw e;};
 c.authenticatePortalInApp=async()=>{opened++;throw c.errorCode('cancelled','Login closed');};
 await assert.rejects(vm.runInContext('syncPortal()',c),e=>e.code==='cancelled');
 assert.equal(opened,1);assert.equal(keys.has('BPA.qldt-session'),false);
});
test('weekly failure stops new dispatch and drains the eight outstanding workers before retry',async()=>{
 const {c}=host();let dispatched=0,settled=false,release=[];
 const ok=Data=>({Success:true,Data});
 c.qldtPost=async(_session,action)=>{
  if(action.startsWith('DKH_ThongTin_MH/DSA4FS'))return ok([{ID:'term',THOIGIAN:'2026_2027_1'}]);
  if(action.startsWith('DKH_ThongTin_MH/DSA4BRI'))return ok([{ID:'plan',MAKEHOACH:'2026_2027_1',DAOTAO_THOIGIANDAOTAO_ID:'term'}]);
  if(action.startsWith('DKH_Chung'))return ok([{DANGKY_KEHOACHDANGKY_ID:'plan',DAOTAO_THOIGIANDAOTAO_ID:'term',DAOTAO_HOCPHAN_ID:'s',DAOTAO_HOCPHAN_TEN:'Môn A',DANGKY_LOPHOCPHAN_ID:'c',DANGKY_LOPHOCPHAN_TEN:'N01',NGAYBATDAU:'01/09/2026',NGAYKETTHUC:'30/12/2026',HOTEN:'Test'}]);
  dispatched++;if(dispatched===1)throw Error('503');return new Promise(r=>release.push(()=>r(ok([]))));
 };
 const pending=vm.runInContext('fetchNativeQldt({userId:"test"})',c);
 const observed=pending.then(()=>{settled=true;},e=>{settled=true;throw e;});
 await new Promise(r=>setImmediate(r));
 assert.equal(dispatched,8);assert.equal(settled,false);assert.equal(release.length,7);
 release.forEach(r=>r());await assert.rejects(observed,/503/);assert.equal(dispatched,8);
});
