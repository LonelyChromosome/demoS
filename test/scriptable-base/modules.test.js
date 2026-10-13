const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const managerSource=fs.readFileSync('scriptable/base/module-manager.js','utf8'),realCatalog=JSON.parse(fs.readFileSync('scriptable/base/catalog.json'));
function fixture({fail=null,cancelAt=null}={}){
 const states=new Map(),files=new Map(),downloads=[],imports=[],status=[];let cancelled=false,manager;
 const fm={fileExists:p=>files.has(p),readString:p=>files.get(p),joinPath:(a,b)=>a+'/'+b,documentsDirectory:()=>'/docs',writeString:(p,s)=>files.set(p,s),remove:p=>files.delete(p)};
 const c=vm.createContext({module:{filename:'/modules/manager.js',exports:{}},importModule:p=>{imports.push(p);return {create:ctx=>({async handle(){return ctx.resource(p.slice('/cache/'.length));}})};}});vm.runInContext(managerSource,c);
 const ctx={fm,release:'release-a',runtimePath:'/runtime.js',catalogPath:'/catalog.json',servicesPath:'/services.js',scriptName:'BPA Base',readState:(n,f={})=>states.has(n)?structuredClone(states.get(n)):structuredClone(f),writeState:(n,v)=>states.set(n,structuredClone(v)),check(){if(cancelled)throw Object.assign(Error('closed'),{code:'cancelled'});},async delay(){},async status(s){status.push(s);},async installResource(f){downloads.push(f.path);if(f.path===fail)throw Error('network');if(f.path===cancelAt)cancelled=true;const p='/cache/'+f.path;files.set(p,'cached');return p;},renderBitmap(){}};
 manager=c.module.exports.create(ctx,realCatalog);return {manager,ctx,files,states,downloads,imports,status,changeRelease:v=>ctx.release=v};
}
test('all module resources match immutable source digests and code excludes full Flutter loader',()=>{
 assert.equal(realCatalog.modules.length,7);for(const m of realCatalog.modules){for(const f of [...m.files,...m.assets]){const bytes=fs.readFileSync(f.path);assert.equal(bytes.length,f.size);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),f.sha256);}const code=fs.readFileSync(m.entry,'utf8');assert.doesNotMatch(code,/ensureLocalBundle|main\.dart|prepareAppBundle|new Request\(.*qldt/);}
 assert.ok(realCatalog.modules.find(m=>m.id==='tienmon').files.reduce((n,f)=>n+f.size,0)<300000);assert.ok(realCatalog.modules.find(m=>m.id==='tienmon').assets.length>8);
});
test('dependencies install serially and large scenic assets remain deferred',async()=>{
 const f=fixture();await f.manager.installOne('tienmon');assert.equal(f.manager.list().filter(m=>m.installed).length,2);assert.ok(f.downloads.indexOf('scriptable/base/modules/themes.js')<f.downloads.indexOf('scriptable/base/modules/tienmon.js'));assert.ok(f.downloads.every(p=>!p.endsWith('.png')));assert.equal(f.states.get('module-host.json').services,'/services.js');
});
test('failed update cannot replace an active module or unrelated calendar',async()=>{
 const f=fixture({fail:'scriptable/shortcuts/BPA-Alarm.shortcut'});f.states.set('preferences.json',{snapshot:'old'});f.states.set('modules.json',{schema:1,active:{alarms:{release:'old',entry:'/old/alarms.js',paths:{}}}});await assert.rejects(f.manager.installOne('alarms'),/network/);assert.equal(f.states.get('modules.json').active.alarms.entry,'/old/alarms.js');assert.equal(f.states.get('preferences.json').snapshot,'old');assert.equal(f.imports.length,0);
});
test('closing install before activation never reports an installed package',async()=>{
 const f=fixture({cancelAt:'scriptable/base/modules/alarms.js'});await assert.rejects(f.manager.installOne('alarms'),{code:'cancelled'});assert.equal(f.manager.list().find(m=>m.id==='alarms').installed,false);assert.equal(f.imports.length,0);
});
test('removing a dependency is rejected while a consumer remains installed',async()=>{
 const f=fixture();await f.manager.installOne('tienmon');await assert.rejects(f.manager.remove('themes'),/phụ thuộc/);assert.equal(f.manager.list().find(m=>m.id==='themes').installed,true);
});
test('malicious paths and dependency cycles cannot dispatch a resource request',async()=>{
 const f=fixture(),api=require('../../scriptable/base/module-manager');const bad=structuredClone(realCatalog);bad.modules[0].assets.push({path:'../secret',size:1,sha256:'0'.repeat(64)});assert.throws(()=>api.validateCatalog(bad));const cycle=structuredClone(realCatalog);cycle.modules[0].requires=['tienmon'];const m=api.create(f.ctx,cycle);await assert.rejects(m.installOne('themes'),/lặp/);assert.equal(f.downloads.length,0);
});
test('new module factories keep their exports when instantiated and reuse the real reminder planner',()=>{
 const source=fs.readFileSync('scriptable/base/modules/reminders.js','utf8'),c=vm.createContext({module:{exports:{}}});vm.runInContext(source,c);const create=c.module.exports.create;const ctx={fm:{readString:()=>fs.readFileSync('scriptable/assistant_pack_texts.json','utf8')},resource:()=>'/catalog',readState:()=>({}),writeState(){},preference:()=>null,isoDay:()=>'',path:()=>''};const api=create(ctx);assert.equal(c.module.exports.create,create);assert.equal(typeof api.maintenance,'function');assert.equal(typeof api.afterSyncMaintenance,'function');
});
test('module runners are tiny, use current base data, and do not embed full host or binaries',()=>{
 const runtime=require('../../scriptable/base/runtime'),files=new Map(),states={'module-host.json':{manager:'/manager',runtime:'/runtime',catalog:'/catalog',services:'/services',release:'r',scriptName:'BPA Base'}},fm={documentsDirectory:()=>'/docs',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p),writeString:(p,v)=>files.set(p,v),readString:p=>files.get(p)};
 const service=require('../../scriptable/base/services').create({fm,runtime:{...runtime,readJSON:(_fm,p,f)=>states[p.split('/').pop()]||f},scriptName:'BPA Base'});service.installRunner('widgets');service.installRunner('reminders');assert.equal(files.size,5);for(const [path,code]of files){assert.ok(Buffer.byteLength(code)<1000);assert.doesNotMatch(code,/base64|main\.dart|BPA_BUNDLED_SHORTCUTS/);assert.match(code,/importModule\(host.services\)/);}
});
