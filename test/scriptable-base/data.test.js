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
 const manifest=JSON.parse(fs.readFileSync('scriptable/base/manifest.json'));assert.deepEqual(Object.keys(manifest.files).sort(),['Roboto-Regular.ttf','runtime.js','sync.js','ui.html']);for(const [name,item]of Object.entries(manifest.files)){const data=fs.readFileSync('scriptable/base/'+name);assert.equal(data.length,item.size);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256);}
 const envelope=JSON.parse(fs.readFileSync('scriptable/base/BPA.scriptable'));assert.ok(Buffer.byteLength(envelope.script)<10000);assert.doesNotMatch(envelope.script,/BPA_BUNDLED_SHORTCUTS|installWidgetScripts|main\.dart\.js|canvaskit/);
});
test('base sync uses the original live page transport, not Scriptable Request',()=>{
 const source=fs.readFileSync('scriptable/base/sync.js','utf8');assert.match(source,/original\.makeRequest\.call\(original/);assert.doesNotMatch(source,/new Request\(/);assert.match(source,/QLDT_REQUEST_TIMEOUT/);
});
