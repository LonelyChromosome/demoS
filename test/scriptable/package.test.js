const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function context(extra={}){const c=vm.createContext({console,Buffer,module:{exports:{}},...extra});vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);return c;}
test('local package digest matches SHA256 for empty, UTF8 and multi-block binary files',()=>{
  const c=context();
  for(const bytes of [Buffer.alloc(0),Buffer.from('abc'),Buffer.from('BPA • Cơ sở dữ liệu'),Buffer.from(Array.from({length:257},(_,i)=>i&255)),Buffer.alloc(1000001,255)]) {
    c.raw=bytes.toString('latin1');assert.equal(vm.runInContext('sha256Raw(raw)',c),crypto.createHash('sha256').update(bytes).digest('hex'));
  }
});
test('local bundle rejects traversal and external paths',()=>{
  const c=context();for(const path of ['/private/file','assets/../secret','../file','.git/config','a\\b','a//b','a/./b']){c.path=path;assert.equal(vm.runInContext('validBundlePath(path)',c),false);}
  c.path='assets/assets/tien_mon_premium/fonts/FzCoTrang.ttf';assert.equal(vm.runInContext('validBundlePath(path)',c),true);
});
test('QLDT XOR envelope preserves Vietnamese and form encoding',()=>{
  const c=context();c.text=JSON.stringify({TENHOCPHAN:'Môn Cơ sở dữ liệu',name:'Nguyễn Đạo',quote:'&+/='});c.key='DSA4BRINKCIpAiAPKSAv';
  assert.equal(vm.runInContext('qldtDecode(qldtEncode(text,key),key)',c),c.text);
  let cipher='';for(let i=0;i<c.text.length;i++)cipher+=String.fromCharCode(c.text.charCodeAt(i)^c.key.charCodeAt(i%c.key.length));
  assert.equal(vm.runInContext('qldtEncode(text,key)',c),Buffer.from(cipher,'utf8').toString('base64'));
});
test('Request transport uses original action path, bearer and A/B encoding',async()=>{
  const c=context();let captured;
  c.Request=class {constructor(url){this.url=url;this.response={statusCode:200};captured=this;}async loadJSON(){return {Success:true,Data:{B:vm.runInContext('qldtEncode(JSON.stringify([{ID:"verified"}]),"mode")',c)}};}};
  const result=await vm.runInContext('qldtPost({tokenJWT:"test-token",userId:"student",iM:"mode",appId:"app",strChucNangId:"func-id",cookie:"test-cookie"},"SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv","pkg_congthongtin_hssv_thongtin.LayDSLichCaNhan",{strNgayBatDau:"01/09/2026",strNgayKetThuc:"07/09/2026"})',c);
  assert.equal(result.Data[0].ID,'verified');assert.equal(captured.method,'POST');assert.equal(captured.headers.Authorization,'Bearer test-token');assert.equal(captured.url,'https://qldtbeta.phenikaa-uni.edu.vn/sinhvienapi3/api/SV_ThongTin_MH/DSA4BRINKCIpAiAPKSAv');
  c.encoded=new URLSearchParams(captured.body).get('A');const body=JSON.parse(vm.runInContext('qldtDecode(encoded,"DSA4BRINKCIpAiAPKSAv")',c));
  assert.equal(body.strChucNang_Id,'func-id');assert.equal(body.strVaiTroDangNhap_Id,'app');assert.equal(body.strNgayBatDau,'01/09/2026');
});
test('original four-card window goes to last window before crossing day',()=>{
  const c=context();c.rows=Array.from({length:7},()=>({}));
  const result=vm.runInContext('navigateWidget({day:"2026-10-12",mode:"study",index:0},rows,"overview",1)',c);
  assert.equal(result.index,3);assert.equal(result.day,'2026-10-12');
  assert.equal(vm.runInContext('navigateWidget({day:"2026-10-12",mode:"study",index:3},rows,"overview",-1).index',c),0);
});
test('widget data is sorted by start and scoped to selected day',()=>{
  const c=context();c.input={classes:[{startAt:'2026-10-12T15:00:00',endAt:'2026-10-12T17:00:00',id:2},{startAt:'2026-10-13T08:00:00',endAt:'2026-10-13T09:00:00',id:3},{startAt:'2026-10-12T08:00:00',endAt:'2026-10-12T10:00:00',id:1}]};
  const ids=vm.runInContext('widgetRows(input,{mode:"study",day:"2026-10-12"},"small").map(x=>x.id)',c);assert.deepEqual(Array.from(ids),[1,2]);
});
test('NFC bridge rejects invalid UID rather than treating content as an ID',()=>{
  const c=context();c.uid='04:A2:7F:1B:5E:80:00';assert.equal(vm.runInContext('normalizeCardUID(uid)',c),'04A27F1B5E8000');
  for(const value of ['NoIdentifierInCompatibilityMode','https://example.com','123','ZZ:11:22:33']){c.uid=value;assert.throws(()=>vm.runInContext('normalizeCardUID(uid)',c));}
});
test('NFC receipt must match this request nonce and scan time',async()=>{
  const c=context();c.UUID={string:()=> 'request-1'};
  c.CallbackURL=class {addParameter(){}async open(){return {result:JSON.stringify({uid:'04A27F1B5E8000',requestId:'request-2',scannedAt:new Date().toISOString()})};}};
  await assert.rejects(vm.runInContext('requestCardUID()',c),/yêu cầu BPA/);
  c.CallbackURL=class {addParameter(){}async open(){return {result:JSON.stringify({uid:'04A27F1B5E8000',requestId:'request-1',scannedAt:'2000-01-01T00:00:00Z'})};}};
  await assert.rejects(vm.runInContext('requestCardUID()',c),/hiện tại/);
  c.CallbackURL=class {addParameter(){}async open(){return {result:JSON.stringify({uid:'04:A2:7F:1B:5E:80:00',requestId:'request-1',scannedAt:new Date().toISOString()})};}};
  assert.equal(await vm.runInContext('requestCardUID()',c),'04A27F1B5E8000');
});
test('Scriptable Data semantics preserve binary file hashes and UTF8 QLDT envelopes',()=>{
  const c=context();
  class DataMock {
    constructor(bytes){this.bytes=Buffer.from(bytes);}
    static fromString(text){return new DataMock(Buffer.from(text,'utf8'));}
    static fromBase64String(text){return new DataMock(Buffer.from(text,'base64'));}
    toBase64String(){return this.bytes.toString('base64');}
    toRawString(){try{return new TextDecoder('utf-8',{fatal:true}).decode(this.bytes);}catch(_){return null;}}
  }
  c.Data=DataMock;
  for(const bytes of [Buffer.from([0,255,128,254,1]),Buffer.alloc(65539,254),Buffer.from('Việt Nam','utf8')]) {
    c.data=new DataMock(bytes);assert.equal(vm.runInContext('dataSize(data)',c),bytes.length);
    assert.equal(vm.runInContext('sha256Data(data)',c),crypto.createHash('sha256').update(bytes).digest('hex'));
  }
  c.text=JSON.stringify({name:'Nguyễn Đạo',subject:'Cơ sở dữ liệu'});c.key='mode';
  assert.equal(vm.runInContext('qldtDecode(qldtEncode(text,key),key)',c),c.text);
});
test('Android exam planner keeps local 09:00 tiers, groups subjects and catches due ranges',()=>{
 const c=context();c.semester={subjects:[{subjectId:'S1',name:'Môn A',examSchedules:[{id:'E1',startAt:'2026-10-20T14:00:00',endAt:'2026-10-20T15:00:00',room:'R',className:'C',examForm:'Viết'}]},{subjectId:'S2',name:'Môn B',examSchedules:[{id:'E2',startAt:'2026-10-20T08:00:00',endAt:'2026-10-20T09:00:00',room:'R2',className:'C2',examForm:'Viết'}]}]};
 let plan=vm.runInContext('examReminderPlan(semester,new Date(2026,9,10,18).getTime())',c);
 assert.equal(plan.schedule.length,3);assert.equal(plan.due.length,0);assert.deepEqual(Array.from(plan.schedule[0].subjects),['Môn A','Môn B']);assert.equal(new Date(plan.schedule[0].atMillis).getHours(),9);assert.equal(new Date(plan.schedule[0].atMillis).getDate(),13);
 plan=vm.runInContext('examReminderPlan(semester,new Date(2026,9,15,18).getTime())',c);
 assert.equal(plan.due[0].daysBefore,5);assert.equal(plan.due[0].milestoneKeys.length,2);assert.equal(plan.schedule.length,2);
 c.keys=Array.from(plan.due[0].milestoneKeys);plan=vm.runInContext('examReminderPlan(semester,new Date(2026,9,15,18).getTime(),new Set(["obsolete"]),new Set(keys))',c);
 assert.equal(plan.due.length,0);assert.deepEqual(Array.from(plan.cancel),['obsolete']);
 assert.equal(vm.runInContext('examAssistantText("normal",5,2,true)',c),'Còn 5 ngày nữa bạn có 2 môn thi. Kiểm tra lịch nhé.');
});

test('launching any companion preserves the distinct kinds of all three generated scripts',()=>{
 const original=fs.readFileSync('scriptable/BPA.js','utf8');
 for(const origin of ['small','overview','widget2']) {
  const source=original.replace("const DEFAULT_KIND='small';","const DEFAULT_KIND='"+origin+"';"),writes=new Map();
  const fm={readString:()=>source,documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,writeString:(path,value)=>writes.set(path,value)};
  const c=context({FileManager:{local:()=>fm},module:{exports:{},filename:'/local/companion.js'}});
  vm.runInContext('installWidgetScripts()',c);
  for(const [name,kind]of [['BPA — Nhỏ','small'],['BPA — Tổng quan','overview'],['BPA — Widget 2','widget2']])
   assert.match(writes.get('/local/'+name+'.js'),new RegExp("const DEFAULT_KIND='"+kind+"';"));
 }
});
