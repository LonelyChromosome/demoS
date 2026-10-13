const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const runtime=require('../../scriptable/base/runtime');
test('reads an existing full-app preferences snapshot and preserves optional-module values',()=>{
 const snapshot={displayName:'Nguyễn Đạo',records:[],syncedAt:'2026-10-13T08:00:00'},prefs={'flutter.better_phenikaa_snapshot_v1':JSON.stringify(JSON.stringify(snapshot)),'flutter.theme':'old-theme'};
 assert.deepEqual(runtime.prefValue(prefs,'better_phenikaa_snapshot_v1'),snapshot);runtime.prefWrite(prefs,'better_phenikaa_snapshot_v1',JSON.stringify({...snapshot,records:[{id:'new'}]}));assert.equal(prefs['flutter.theme'],'old-theme');assert.equal(runtime.prefValue(prefs,'better_phenikaa_snapshot_v1').records.length,1);
});
test('failed preferences promotion restores the original semester',()=>{
 const files=new Map([['/prefs',JSON.stringify({records:['old']})]]),fm={fileExists:p=>files.has(p),readString:p=>files.get(p),writeString:(p,v)=>files.set(p,v),remove:p=>files.delete(p),move:(a,b)=>{if(a==='/prefs.pending')throw Error('disk failure');files.set(b,files.get(a));files.delete(a);}};
 assert.throws(()=>runtime.saveAtomic(fm,'/prefs',{records:['new']}),/disk failure/);assert.deepEqual(JSON.parse(files.get('/prefs')),{records:['old']});
});
test('retained old exams survive while old classes are not added to new semester',()=>{
 const row=id=>({id,startAt:'2026-10-13T08:00:00',isExam:id.includes('exam')}),semester={displayName:'QA',syncedAt:'2026-10-13T00:00:00',subjects:[{studySchedules:[row('class')],examSchedules:[row('exam')]}]},old={semester:{subjects:[{studySchedules:[row('old-class')],examSchedules:[row('old-exam')]}]}};
 assert.deepEqual(runtime.flatten(semester,old).records.map(r=>r.id),['class','exam','old-exam']);
});
test('base manifest matches every installable module and excludes full app bundles',()=>{
 const manifest=JSON.parse(fs.readFileSync('scriptable/base/manifest.json'));assert.deepEqual(Object.keys(manifest.files).sort(),['Roboto-Regular.ttf','catalog.json','module-manager.js','runtime.js','services.js','sync.js','ui.html']);for(const [name,item]of Object.entries(manifest.files)){const data=fs.readFileSync('scriptable/base/'+name);assert.equal(data.length,item.size);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256);}
 const envelope=JSON.parse(fs.readFileSync('scriptable/base/BPA.scriptable'));assert.ok(Buffer.byteLength(envelope.script)<10000);assert.doesNotMatch(envelope.script,/BPA_BUNDLED_SHORTCUTS|installWidgetScripts|main\.dart\.js|canvaskit/);
});
test('base sync uses the original live page transport, not Scriptable Request',()=>{
 const source=fs.readFileSync('scriptable/base/sync.js','utf8');assert.match(source,/original\.makeRequest\.call\(original/);assert.doesNotMatch(source,/new Request\(/);assert.match(source,/QLDT_REQUEST_TIMEOUT/);
});
test('mailbox works without completion, ignores duplicate results and restores original bridge',async()=>{
 const original={marker:'university'},page=vm.createContext({window:{edu:{system:{makeRequest(){}}},flutter_inappwebview:original},edu:{system:{makeRequest(){}}},setTimeout,clearTimeout});
 const c=vm.createContext({module:{exports:{}}});vm.runInContext(fs.readFileSync('scriptable/base/sync.js','utf8'),c);
 c.evaluate=async(_web,code,callback)=>{assert.equal(callback,false);assert.equal(typeof page.completion,'undefined');return vm.runInContext(code,page);};c.delay=ms=>new Promise(r=>setTimeout(r,ms));c.source='(()=>{window.flutter_inappwebview.callHandler("ok",1,"{}");window.flutter_inappwebview.callHandler("ok",1,"{}");return "done";})()';
 const result=await vm.runInContext('portalCall(null,evaluate,source,"ok","error",()=>{},delay)',c);assert.equal(JSON.stringify(result),'{}');await new Promise(r=>setTimeout(r,5));assert.equal(page.window.flutter_inappwebview,original);assert.equal(Object.keys(page.window.__bpaPortalJobs).length,0);
});
test('asynchronous portal results cross mailbox without any callback evaluation',async()=>{
 const page=vm.createContext({window:{edu:{system:{makeRequest(){}}}},edu:{system:{makeRequest(){}}},setTimeout,clearTimeout}),c=vm.createContext({module:{exports:{}}});vm.runInContext(fs.readFileSync('scriptable/base/sync.js','utf8'),c);
 c.evaluate=async(_web,code,callback)=>{assert.equal(callback,false);return vm.runInContext(code,page);};c.delay=ms=>new Promise(r=>setTimeout(r,ms));c.source='(()=>{setTimeout(()=>window.flutter_inappwebview.callHandler("ok",1,JSON.stringify({records:[1]})),10);return "started";})()';
 assert.equal(JSON.stringify(await vm.runInContext('portalCall(null,evaluate,source,"ok","error",()=>{},delay)',c)),JSON.stringify({records:[1]}));assert.equal(Object.keys(page.window.__bpaPortalJobs).length,0);
});
test('cancelled mailbox gates late success and restores the original bridge',async()=>{
 const original={marker:'original'},page=vm.createContext({window:{edu:{system:{makeRequest(){}}},flutter_inappwebview:original},edu:{system:{makeRequest(){}}},setTimeout,clearTimeout}),c=vm.createContext({module:{exports:{}}});vm.runInContext(fs.readFileSync('scriptable/base/sync.js','utf8'),c);
 let cancelled=false;c.evaluate=async(_web,code,callback)=>{assert.equal(callback,false);return vm.runInContext(code,page);};c.check=()=>{if(cancelled)throw Object.assign(Error('closed'),{code:'cancelled'});};c.delay=async()=>{cancelled=true;};c.source='(()=>{window.lateBridge=window.flutter_inappwebview;return "started";})()';
 await assert.rejects(vm.runInContext('portalCall(null,evaluate,source,"ok","error",check,delay)',c),{code:'cancelled'});await page.window.lateBridge.callHandler('ok',1,'{}');await new Promise(r=>setTimeout(r,5));assert.equal(page.window.flutter_inappwebview,original);assert.equal(Object.keys(page.window.__bpaPortalJobs).length,0);
});
