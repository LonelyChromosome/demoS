const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(){
 const files=new Map(),dirs=new Set(),events=[];let serial=0;
 const fm={documentsDirectory:()=>'/docs',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p)||dirs.has(p),createDirectory:p=>dirs.add(p),readString:p=>files.get(p).toString(),writeString:(p,v)=>files.set(p,Buffer.from(v)),read:p=>new Data(files.get(p)),write:(p,d)=>files.set(p,d.bytes),remove:p=>files.delete(p),move:(a,b)=>{files.set(b,files.get(a));files.delete(a);},copy:(a,b)=>{if(files.has(b))throw Error('exists');files.set(b,files.get(a));}};
 class Data {constructor(bytes){this.bytes=Buffer.from(bytes);this.encodes=0;}toBase64String(){this.encodes++;return this.bytes.toString('base64');}}
 const Timer={schedule:(ms,repeat,fn)=>{const id=setTimeout(fn,ms);return {invalidate:()=>clearTimeout(id)};}};
 class WebView {async loadHTML(){events.push('html');}present(){events.push('present');return new Promise(resolve=>this.close=resolve);}async evaluateJavaScript(script){if(script.includes('waitCancel'))return new Promise(resolve=>this.cancel=()=>resolve({cancelled:true}));if(script.startsWith('bpaIntegrity.digest')){const encoded=JSON.parse(script.match(/digest\(("[^"]*")\)/)[1]),b=Buffer.from(encoded,'base64');return {size:b.length,sha256:hash(b)};}events.push(script);return null;}}
 const c=vm.createContext({Buffer,setTimeout,clearTimeout,module:{exports:{},filename:'/docs/BPA.js'},FileManager:{local:()=>fm},Timer,WebView,UUID:{string:()=>String(++serial)}});vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);
 return {c,files,events,Data,app:new WebView(),run:s=>vm.runInContext(s,c)};
}
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,2));}throw Error('fixture did not reach expected state');}
test('cold launch presents progress before staging; completed bundle uses same presentation',async()=>{
 const {c,app,events,run}=fixture();c.app=app;c.ensureLocalBundle=async(_pending,options)=>{events.push('stage');await options.progress(8,16,{phase:'download',index:1,count:2});return {path:'verified'};};
 const result=await run('prepareAppBundle(app)');assert.ok(events.indexOf('present')<events.indexOf('stage'));assert.equal(events.filter(e=>e==='present').length,1);assert.equal(result.bundle.path,'verified');assert.equal(run('readState("startup-diagnostics.json").backend'),'webcrypto');assert.equal(run('readState("startup-diagnostics.json").script'),'BPA.js');assert.equal(run('readState("startup-lease.json",null)'),null);app.close();await result.presentation;
});
test('warm launch uses committed resources without another setup presentation',async()=>{
 const {c,app,files,events,run}=fixture();c.app=app;run('writeState("bundle.json",{versionCode:BPA_UPDATE_CHANNEL.versionCode,path:"/warm",files:BPA_REQUIRED_BUNDLE_FILES})');for(const name of run('BPA_REQUIRED_BUNDLE_FILES'))files.set('/warm/'+name,Buffer.from('ok'));
 const result=await run('prepareAppBundle(app)');assert.equal(result.bundle.path,'/warm');assert.equal(result.presentation,null);assert.deepEqual(events,[]);
});
test('cancel while a request is pending prevents late writes and frees startup lease',async()=>{
 const {c,app,files,run}=fixture();c.app=app;let finish,lateWrite=false;c.ensureLocalBundle=async(_pending,o)=>{await new Promise(resolve=>finish=resolve);o.check();lateWrite=true;files.set('/late',Buffer.from('bad'));return {};};
 const work=run('prepareAppBundle(app)');await until(()=>finish&&app.cancel);app.cancel();await until(()=>run('readState("startup-diagnostics.json",null)?.status')==='cancelled');finish();await new Promise(r=>setTimeout(r,5));app.close();assert.equal(await work,null);assert.equal(lateWrite,false);assert.equal(run('readState("bundle.json",null)'),null);assert.equal(run('readState("startup-lease.json",null)'),null);
});
test('a second startup cannot download concurrently',async()=>{
 const {run}=fixture();const lease=run('acquireStartupLease()');assert.throws(()=>run('acquireStartupLease()'),e=>e.code==='startup_busy');lease.release();const next=run('acquireStartupLease()');next.release();
});
test('native verifier validates binary data and encodes each file once',async()=>{
 const {c,Data,run}=fixture();c.data=new Data(Buffer.from([0,255,128,13,10]));const value=await run('resourceIntegrity(data)');assert.equal(value.size,5);assert.equal(value.sha256,hash(c.data.bytes));assert.equal(c.data.encodes,1);
});
test('fallback hashing yields to cancellation without accepting an incomplete digest',async()=>{
 const {c,run}=fixture();let ticks=0;c.check=()=>{if(++ticks===3)throw Object.assign(Error('cancel'),{code:'cancelled'});};c.raw='a'.repeat(200000);await assert.rejects(run('sha256Cooperative(raw,check)'),e=>e.code==='cancelled');c.check=()=>{};assert.equal(await run('sha256Cooperative(raw,check)'),hash(Buffer.from(c.raw)));
});
test('resume reuses verified old assets; changed corrupt bytes cannot replace the active bundle',async()=>{
 const {c,Data,files,run}=fixture(),names=run('BPA_REQUIRED_BUNDLE_FILES'),assets=new Map(names.map(name=>[name,Buffer.from('fixture '+name)]));let requests=0;
 const manifest={schema:1,versionCode:59,versionName:'qa',files:names.map(path=>({path,size:assets.get(path).length,sha256:hash(assets.get(path))}))};
 c.Request=class{constructor(url){this.url=url;this.response={statusCode:200};}async loadString(){return JSON.stringify(manifest);}async load(){requests++;return new Data(Buffer.from('corrupt'));}};
 run('writeState("bundle.json",{versionCode:58,path:"/old",files:BPA_REQUIRED_BUNDLE_FILES})');for(const [name,bytes]of assets)files.set('/old/'+name,bytes);
 const result=await run('ensureLocalBundle(true)');assert.equal(result.versionCode,59);assert.equal(requests,0);
 manifest.files[0].sha256=hash(Buffer.from('different'));manifest.versionCode=60;
 await assert.rejects(run('stageLocalBundle("https://example.test/bpa-package.json")'),e=>e.code==='bundle_integrity');assert.equal(run('readState("bundle.json").versionCode'),59);assert.equal(requests,1);
});
