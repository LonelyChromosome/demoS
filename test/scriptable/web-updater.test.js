const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function setup(){
 const files=new Map(),directories=new Set();class Data{constructor(b){this.bytes=Buffer.from(b);}toBase64String(){return this.bytes.toString('base64');}}
 const fm={documentsDirectory:()=>'/docs',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p)||directories.has(p),createDirectory:p=>directories.add(p),readString:p=>files.get(p).toString(),writeString:(p,v)=>files.set(p,Buffer.from(v)),read:p=>new Data(files.get(p)),write:(p,d)=>files.set(p,d.bytes),remove:p=>files.delete(p),move:(a,b)=>{if(!files.has(a))throw Error('missing '+a);files.set(b,files.get(a));files.delete(a);}};
 const c=vm.createContext({Buffer,setTimeout,clearTimeout,module:{exports:{},filename:'/docs/BPA.js'},FileManager:{local:()=>fm},UUID:{string:()=> 'verification-fixture'}});
 c.Timer={schedule:(ms,repeat,fn)=>{const id=setTimeout(fn,ms);return {invalidate:()=>clearTimeout(id)};}};
 c.WebView=class {async loadHTML(){}async evaluateJavaScript(script){const encoded=JSON.parse(script.match(/bpaIntegrity\.digest\(("[^" ]*")\)/)[1]),bytes=Buffer.from(encoded,'base64');return {size:bytes.length,sha256:hash(bytes)};}};
 vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);
 const index={schema:1,versionCode:52,versionName:'cooc.1.6',files:[]},assets=new Map();
 for(const name of ['main.dart.js','widget-renderer.js','widget-palette.js','scriptable/BPA.js']){const bytes=Buffer.from(name==='scriptable/BPA.js'?"const DEFAULT_KIND='small';":'public fixture '+name);assets.set(name,bytes);index.files.push({path:name,size:bytes.length,sha256:hash(bytes)});}
 const raw=JSON.stringify(index),base='https://example.test/immutable/',release={url:base+'bpa-package.json',sha256:hash(Buffer.from(raw)),size:Buffer.byteLength(raw)+index.files.reduce((n,f)=>n+f.size,0),resourceIndexSize:Buffer.byteLength(raw),versionCode:52,versionName:'cooc.1.6',minimumVersionCode:50};
 let downloads=0,corrupt=false;const events=[];
 c.Request=class {constructor(url){this.url=url;this.response={statusCode:200};}async loadString(){downloads++;return raw;}async load(){downloads++;const name=this.url.slice(base.length);return new Data(corrupt?Buffer.from('corrupt'):assets.get(name));}};
 c.sendNativeEvent=async(_app,_channel,type,extra)=>{events.push(type);if(type==='verifyRelease')c.acceptVerifiedRelease({requestId:extra.requestId,manifest:release});};
 c.release=release;c.app={};vm.runInContext('writeState("bundle.json",{path:"/docs/BPA/old",versionCode:51,files:[]});writeState("preferences.json",{schedule:"preserve"});',c);files.set('/docs/BPA.js',Buffer.from('old host'));
 return {c,files,events,release,corrupt:()=>{corrupt=true;},downloadCount:()=>downloads};
}
test('signed metadata is re-verified before staging; activation waits for new runtime and preserves data',async()=>{
 const {c,files,events}=setup();await vm.runInContext('stageWebUpdate(release,app)',c);
 assert.equal(vm.runInContext('readState("bundle.json").versionCode',c),51);
 assert.equal(vm.runInContext('readState("pending-bundle.json").versionCode',c),52);assert.ok(events.includes('installerLaunched'));
 c.boot=await vm.runInContext('ensureLocalBundle(true)',c);vm.runInContext('bootingApp=app;bootingBundle=boot;',c);
 await vm.runInContext('commitBootedBundle(app)',c);
 assert.equal(vm.runInContext('readState("bundle.json").versionCode',c),52);assert.equal(vm.runInContext('readState("install-status.json").status',c),'installed');
 assert.equal(vm.runInContext('readState("preferences.json").schedule',c),'preserve');assert.equal(files.get('/docs/BPA.js').toString(),"const DEFAULT_KIND='small';");assert.ok(events.includes('installed'));
});
test('bad signature or an altered artifact cannot replace the working bundle',async()=>{
 const {c,corrupt}=setup();corrupt();await assert.rejects(vm.runInContext('stageWebUpdate(release,app)',c),e=>e.code==='bundle_integrity');assert.equal(vm.runInContext('readState("bundle.json").versionCode',c),51);assert.equal(vm.runInContext('readState("pending-bundle.json",null)',c),null);
 const second=setup();second.c.sendNativeEvent=async(_app,_channel,type,extra)=>{if(type==='verifyRelease')second.c.acceptVerifiedRelease({requestId:extra.requestId,error:'bad_signature'});};
 await assert.rejects(vm.runInContext('stageWebUpdate(release,app)',second.c),e=>e.code==='update_signature');assert.equal(second.downloadCount(),0);
});
test('failed first startup rolls back the pending pointer and restores preferences',async()=>{
 const {c}=setup();await vm.runInContext('stageWebUpdate(release,app)',c);await vm.runInContext('ensureLocalBundle(true)',c);
 vm.runInContext('writeState("preferences.json",{schedule:"new boot write"});',c);
 // The old fixture has no file inventory; bypass only its initial fetch fallback.
 c.stageLocalBundle=async()=>({versionCode:51,path:'/docs/BPA/old',files:[]});
 await vm.runInContext('ensureLocalBundle(true)',c);
 assert.equal(vm.runInContext('readState("preferences.json").schedule',c),'preserve');assert.equal(vm.runInContext('readState("pending-bundle.json",null)',c),null);assert.equal(vm.runInContext('readState("install-status.json").status',c),'failed');
});
test('a stale verification reply cannot authorize an installation',()=>{
 const {c}=setup();assert.throws(()=>vm.runInContext('acceptVerifiedRelease({requestId:"stale",manifest:release})',c),e=>e.code==='update_stale_reply');
});

test('cancelling a staged update restores the old host, and repeated staging does not discard it',async()=>{
 const {c,files}=setup();await vm.runInContext('stageWebUpdate(release,app)',c);
 await assert.rejects(vm.runInContext('stageWebUpdate(release,app)',c),e=>e.code==='update_pending');
 assert.ok(vm.runInContext('readState("pending-bundle.json",null)',c));
 vm.runInContext('cancelWebUpdate()',c);assert.equal(files.get('/docs/BPA.js').toString(),'old host');assert.equal(vm.runInContext('readState("pending-bundle.json",null)',c),null);assert.equal(vm.runInContext('readState("bundle.json").versionCode',c),51);
});
