const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const files=new Map(),states=new Map();
 const fm={documentsDirectory:()=>'/documents',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p),createDirectory(){},read:p=>files.get(p),write:(p,d)=>files.set(p,d)};
 const c=vm.createContext({module:{exports:{}},Buffer,FileManager:{local:()=>fm},Data:{fromBase64String:value=>({toBase64String:()=>value})},UUID:{string:()=> 'setup-nonce'}});
 vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);
 c.readState=(k,f)=>states.has(k)?states.get(k):f;c.writeState=(k,v)=>states.set(k,v);
 return {c,files,states};
}
test('the only BPA installer contains the actual signed Clock binary with a verified hash',()=>{
 const {c,files}=fixture();const asset=vm.runInContext('bundledShortcut("alarm")',c);
 const data=Buffer.from(files.get(asset.path).toBase64String(),'base64');
 assert.deepEqual(data,fs.readFileSync('scriptable/shortcuts/BPA-Alarm.shortcut'));assert.equal(data.subarray(0,4).toString(),'AEA1');
 assert.equal(JSON.parse(fs.readFileSync('scriptable/BPA.scriptable','utf8')).script,fs.readFileSync('scriptable/BPA.js','utf8'));
});
test('corrupted companion data is rejected before any native import',()=>{
 const {c,files}=fixture();vm.runInContext('BPA_BUNDLED_SHORTCUTS.alarm.base64="QUVBMQ=="',c);
 assert.throws(()=>vm.runInContext('bundledShortcut("alarm")',c),e=>e.code==='shortcut_integrity');assert.equal(files.size,0);
});
test('the Clock setup probe creates no alarm and skips import when the companion is already ready',async()=>{
 const {c}=fixture();let imports=0,calls=0;
 c.QuickLook={async present(){imports++;}};
 c.CallbackURL=class {addParameter(k,v){if(k==='text')this.input=JSON.parse(v);}async open(){calls++;assert.equal(this.input.mode,'probe');return {result:JSON.stringify({status:'BPA_CLOCK_READY',requestId:this.input.requestId})};}};
 await vm.runInContext('ensureClockShortcut()',c);assert.equal(imports,0);assert.equal(calls,1);
});
test('first use opens the internally bundled import once and verifies the real companion response afterwards',async()=>{
 const {c,states}=fixture();let installed=false,imports=0,calls=0;
 c.QuickLook={async present(path){assert.match(path,/BPA — Đặt báo thức\.shortcut$/);imports++;installed=true;}};
 c.CallbackURL=class {addParameter(k,v){if(k==='text')this.input=JSON.parse(v);}async open(){calls++;if(!installed)throw Error('Not installed');return {result:JSON.stringify({status:'BPA_CLOCK_READY',requestId:this.input.requestId})};}};
 await vm.runInContext('ensureClockShortcut()',c);assert.equal(imports,1);assert.equal(calls,2);assert.equal(states.size,0);
});
test('closing import without installing never becomes a successful setup or starts a retry loop',async()=>{
 const {c,states}=fixture();let imports=0,calls=0;
 c.QuickLook={async present(){imports++;}};
 c.CallbackURL=class {addParameter(){}async open(){calls++;throw Error('Not installed');}};
 await assert.rejects(vm.runInContext('ensureClockShortcut()',c),/Not installed/);assert.equal(imports,1);assert.equal(calls,2);assert.equal(states.size,0);
});
test('NFC custom callback accepts only a nonce-matched serial field, never NDEF content',()=>{
 const {c}=fixture();
 c.callback='shortcuts://x-callback-url/callback?custom=setup-nonce&tagid=04%3AAA%3ABB%3ACC';
 assert.equal(vm.runInContext('parseReaderCallback(callback,"setup-nonce")',c),'04AABBCC');
 for(const callback of [JSON.stringify({custom:'old',tagid:'04AABBCC'}),JSON.stringify({custom:'setup-nonce',content:'04AABBCC'}),'04AABBCC']){
  c.callback=callback;assert.throws(()=>vm.runInContext('parseReaderCallback(callback,"setup-nonce")',c));
 }
});
