const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(save=true) {
 const files=new Map(),dirs=new Set(),keys=new Map([['BPA.qldt-session',JSON.stringify({userId:'student',tokenJWT:'private-local-only'})]]);
 const fm={documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p)||dirs.has(p),createDirectory:p=>dirs.add(p),readString:p=>files.get(p),writeString:(p,v)=>files.set(p,v),move:(a,b)=>{if(files.has(b))throw Error('exists');files.set(b,files.get(a));files.delete(a);},remove:p=>files.delete(p)};
 const c=vm.createContext({module:{exports:{},filename:'/local/BPA.js'},FileManager:{local:()=>fm},Keychain:{contains:k=>keys.has(k),get:k=>keys.get(k),set:(k,v)=>keys.set(k,v),remove:k=>keys.delete(k)},UUID:{string:()=> 'request-0001'}});
 vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);
 c.input={requestId:'request-0001',action:'sync'};c.preferences={'flutter.better_phenikaa_account_setup_complete_v1':'true',theme:'old'};
 c.job={requestId:c.input.requestId,epoch:0,startedAt:Date.now(),preferences:c.preferences,status:'queued',save,account:vm.runInContext('sha256Raw("student")',c)};
 c.writeState('preferences.json',c.preferences);c.writeState('sync-job-request-0001.json',c.job);c.writeState('sync-lease.json',{requestId:c.input.requestId,epoch:0,startedAt:c.job.startedAt});
 c.writeState('snapshot.json',{classes:['old'],exams:[]});
 c.result={semester:{semesterId:'term',subjects:[],displayName:'QA'},termStartedAt:'2026-09-01T00:00:00'};
 c.fetchNativeQldt=async()=>c.result;c.ensureLocalBundle=async()=>({});
 c.saveWorkerThroughOriginalDart=async()=>{c.writeState('preferences.json',{...c.preferences,snapshot:'new'});c.writeState('snapshot.json',{classes:['new'],exams:[]});};
 return {c,files,keys,fm};
}
test('inline sync commits before returning, leaving the existing app presentation untouched',async()=>{
 const {c}=fixture();let saved=0;
 const original=c.saveWorkerThroughOriginalDart;c.saveWorkerThroughOriginalDart=async(...args)=>{saved++;await original(...args);};
 c.WebView=class{constructor(){throw Error('No app presentation from fixture worker');}};
 const receipt=await vm.runInContext('widgetCommand(input)',c);
 assert.equal(receipt.status,'BPA_SYNC_COMMITTED');assert.equal(saved,1);
 assert.equal(c.readState('snapshot.json').classes[0],'new');
 assert.equal(c.readState('sync-job-request-0001.json').savedByScriptableWorker,true);
 assert.equal(c.readState('sync-commit.json'),null);
 assert.ok(!JSON.stringify(c.readState('sync-job-request-0001.json')).includes('private-local-only'));
});
test('first login fetches and verifies in the runner without skipping the name/save screen',async()=>{
 const {c}=fixture(false);c.saveWorkerThroughOriginalDart=()=>{throw Error('Do not bypass name arrangement');};
 await vm.runInContext('widgetCommand(input)',c);
 assert.equal(c.readState('sync-job-request-0001.json').savedByScriptableWorker,false);
 assert.equal(c.readState('snapshot.json').classes[0],'old');
});
test('logout during fetch cancels a detached worker without restoring the previous account',async()=>{
 const {c}=fixture();let release;c.fetchNativeQldt=()=>new Promise(r=>release=r);
 const pending=vm.runInContext('widgetCommand(input)',c);
 c.invalidateBackgroundSync();c.diskWrite('snapshot.json',{classes:[],exams:[]});release(c.result);
 await assert.rejects(pending,e=>e.code==='cancelled');
 assert.equal(c.readState('snapshot.json').classes.length,0);assert.equal(c.readState('semester-v1.json',null),null);
});
test('a failed original save keeps the previous preferences, schedule and term untouched',async()=>{
 const {c}=fixture();c.saveWorkerThroughOriginalDart=async()=>{c.writeState('snapshot.json',{classes:['partial']});throw c.errorCode('sync_save_failed','save failed');};
 await assert.rejects(vm.runInContext('widgetCommand(input)',c),e=>e.code==='sync_save_failed');
 assert.equal(c.readState('snapshot.json').classes[0],'old');assert.equal(c.readState('preferences.json').snapshot,undefined);assert.equal(c.readState('semester-v1.json',null),null);
});
test('commit IO failure rolls every staged file back and does not issue a committed receipt',async()=>{
 const {c,fm}=fixture();const write=fm.writeString;let fail=true;
 fm.writeString=(p,v)=>{if(p.endsWith('/snapshot.json.pending')&&fail){fail=false;throw Error('storage unavailable');}write(p,v);};
 await assert.rejects(vm.runInContext('widgetCommand(input)',c),/storage unavailable/);
 assert.equal(c.readState('snapshot.json').classes[0],'old');assert.equal(c.readState('preferences.json').snapshot,undefined);
 assert.equal(c.readState('sync-job-request-0001.json').status,'failed');assert.equal(c.readState('sync-commit.json'),null);
});
test('worker merges independent foreground preference edits and refuses a conflicting schedule edit',async()=>{
 const {c}=fixture();c.writeState('preferences.json',{...c.preferences,theme:'changed while running'});
 await vm.runInContext('widgetCommand(input)',c);
 assert.equal(c.readState('preferences.json').theme,'changed while running');assert.equal(c.readState('preferences.json').snapshot,'new');
 const other=fixture();other.c.writeState('preferences.json',{...other.c.preferences,snapshot:'edited'});
 await assert.rejects(vm.runInContext('widgetCommand(input)',other.c),e=>e.code==='sync_conflict');
 assert.equal(other.c.readState('snapshot.json').classes[0],'old');
});
test('journal recovery cannot resurrect data after the account epoch changes',()=>{
 const {c}=fixture();c.writeState('sync-commit.json',{requestId:'request-0001',epoch:0,before:{'snapshot.json':{classes:['previous account']}}});
 c.writeState('account-epoch.json',{value:1});c.writeState('snapshot.json',{classes:[]});c.recoverBackgroundCommit();
 assert.equal(c.readState('snapshot.json').classes.length,0);assert.equal(c.readState('sync-commit.json'),null);
});
test('no matching persisted job means an arbitrary inline sync request cannot read credentials',async()=>{
 const {c,keys}=fixture();c.input.requestId='different-request';keys.clear();
 await assert.rejects(vm.runInContext('widgetCommand(input)',c),e=>e.code==='sync_job');
});
