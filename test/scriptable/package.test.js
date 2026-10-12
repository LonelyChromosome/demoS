const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function context(){const c=vm.createContext({console,Buffer,module:{exports:{}}});vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);return c;}
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
