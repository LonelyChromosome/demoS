const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const keys=new Map(),states=new Map(),timers=new Set();
 const c=vm.createContext({Buffer,module:{exports:{}},Timer:{schedule(ms,repeat,fn){const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return {invalidate(){clearTimeout(id);timers.delete(id);}};}},Keychain:{contains:k=>keys.has(k),get:k=>keys.get(k),set:(k,v)=>keys.set(k,v),remove:k=>keys.delete(k)}});
 vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);
 c.readState=(k,f)=>states.has(k)?states.get(k):f;c.writeState=(k,v)=>states.set(k,v);
 c.localAppHTML=()=>'<html>BPA</html>';
 c.UUID={string:()=> 'request-0001'};c.ensureWidgetShortcut=async()=>{};
 c.invokeBundledShortcut=async(_kind,input)=>{const session=JSON.parse(keys.get('BPA.qldt-session'));const value=await c.fetchNativeQldt(session);const result=c.commitPortalResult(value,0);c.writeState('sync-job-'+input.requestId+'.json',{...result,status:'committed'});return {};};
 const session={tokenJWT:'test-token',userId:'student',iM:'0',appId:'app',strChucNangId:'function'};
 let probes=0,loads=0,fetches=0,finishFetch;
 const app={async loadURL(url){assert.equal(url,'https://qldtbeta.phenikaa-uni.edu.vn/');loads++;},async loadHTML(html){assert.equal(html,'<html>BPA</html>');},async evaluateJavaScript(source){if(source==='bpaHost.suspend();')return {'flutter.theme':'test'};if(source.startsWith('bpaHost.replacePreferences('))return;if(source.startsWith('bpaHost.init(')){assert.match(source,/loginResume.*true/);return;}probes++;return probes===1?null:JSON.stringify(session);},present(){throw Error('Login must not present or wait for Done');}};
 c.app=app;c.state={phase:'app',epoch:0,closed:false,waiters:[],bundle:{},loginResume:null};
 vm.runInContext('appSessions.set(app,state)',c);
 const result={semester:{semesterId:'2026_2027_1',displayName:'Test',subjects:[]},termStartedAt:'2026-09-01T00:00:00'};
 c.fetchNativeQldt=received=>{assert.equal(received.tokenJWT,session.tokenJWT);fetches++;return new Promise(resolve=>finishFetch=()=>resolve(result));};
 return {c,keys,states,timers,get loads(){return loads;},get probes(){return probes;},get fetches(){return fetches;},finish(){finishFetch();}};
}
test('login detects a live session without Done, restores the same view and hands off one sync to the original app',async()=>{
 const f=fixture(),{c,keys,states}=f;
 const original=vm.runInContext('syncPortal(app)',c);
 while(!f.fetches)await new Promise(r=>setTimeout(r,10));
 assert.equal(c.state.phase,'worker');assert.equal(c.state.epoch,1);assert.equal(f.loads,1);assert.equal(f.probes,2);
 assert.equal(states.get('preferences.json')['flutter.theme'],'test');assert.equal(JSON.parse(keys.get('BPA.qldt-session')).tokenJWT,'test-token');
 assert.equal(vm.runInContext('takeLoginResume(app)',c),true);assert.equal(vm.runInContext('takeLoginResume(app)',c),false);
 const resumed=vm.runInContext('syncPortal(app)',c);assert.equal(resumed,original);
 f.finish();await resumed;assert.equal(f.fetches,1);assert.equal(c.state.loginResume,null);assert.equal(f.timers.size,0);
 assert.equal(states.get('semester-v1.json').current.semesterId,'2026_2027_1');
});
test('a completed handoff is still consumed once and sync failure is returned without re-opening login',async()=>{
 const f=fixture(),{c}=f;let fetches=0;
 c.fetchNativeQldt=async()=>{fetches++;throw c.errorCode('qldt_http','503');};
 const original=vm.runInContext('syncPortal(app)',c);await assert.rejects(original,e=>e.code==='qldt_http');
 assert.equal(vm.runInContext('takeLoginResume(app)',c),true);
 const resumed=vm.runInContext('syncPortal(app)',c);assert.equal(resumed,original);await assert.rejects(resumed,e=>e.code==='qldt_http');
 assert.equal(fetches,1);assert.equal(f.loads,1);assert.equal(f.timers.size,0);
});
test('closing the view cancels live readiness and never saves a session or replaces stored schedules',async()=>{
 const f=fixture(),{c,keys,states}=f;
 c.app.evaluateJavaScript=async source=>source==='bpaHost.suspend();'?{}:null;
 const original=vm.runInContext('syncPortal(app)',c);
 await new Promise(r=>setTimeout(r,10));c.state.closed=true;
 await assert.rejects(original,e=>e.code==='cancelled');assert.equal(keys.size,0);assert.equal(states.has('semester-v1.json'),false);assert.equal(c.state.loginResume,null);
});
test('invalid or incomplete portal sessions cannot be saved as authenticated',async()=>{
 const f=fixture(),{c,keys}=f;
 c.app.evaluateJavaScript=async()=>JSON.stringify({tokenJWT:'',userId:'student',iM:'0'});
 await assert.rejects(vm.runInContext('waitForPortalSession(app,state,syncGeneration,20)',c),e=>e.code==='login_timeout');assert.equal(keys.size,0);
});

test('managed navigation interrupts a pending app poll so a destroyed page cannot hold the host loop',async()=>{
 const f=fixture(),{c}=f;
 let oldReply;c.app.evaluateJavaScript=async()=>new Promise(resolve=>oldReply=resolve);
 const pending=vm.runInContext('pollAppPacket(app,state)',c);
 c.state.pollInterrupt();assert.equal(await pending,null);assert.equal(c.state.pollInterrupt,null);
 oldReply({calls:[{id:1}],assets:[],preferences:null});
});
