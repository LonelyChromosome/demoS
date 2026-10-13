// Browser QA of the local loader, not a Scriptable/iPhone functional test.
const fs=require('fs'),path=require('path'),vm=require('vm'),http=require('http');
async function capturePaintedFrame(page,file,content=false) {
  for(let attempt=0;attempt<30;attempt++) {
    const bytes=await page.screenshot();
    // Decode outside WebKit: creating another canvas in the app while its
    // route animates changes the graphics workload being measured.
    const {PNG}=require(path.join(process.env.BPA_QA_NODE_MODULES,'pngjs'));
    const image=PNG.sync.read(bytes);let ink=0;
    const end=Math.floor(image.height*.75)*image.width*4;
    const start=Math.floor(image.height*(content?.25:0))*image.width*4;
    for(let i=start;i<end;i+=4)if(image.data[i]<160&&image.data[i+1]<160&&image.data[i+2]<160&&image.data[i+3]>200)ink++;
    fs.writeFileSync(file,bytes);
    if(ink>1000)return bytes;
    await page.waitForTimeout(100);
  }
  throw Error('App semantics exist but its screenshot is still blank');
}
async function main(){
  const root=path.resolve('build/web'),files=[];
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);entry.isDirectory()?walk(file):files.push(path.relative(root,file).replaceAll('\\','/'));}}walk(root);
  const fakeFM={readString:p=>fs.readFileSync(p,'utf8'),joinPath:(a,b)=>path.join(a,b)};
  const ctx=vm.createContext({module:{exports:{}},FileManager:{local:()=>fakeFM},console});
  vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),ctx);ctx.bundle={path:root,files};
  const html=vm.runInContext('localAppHTML(bundle)',ctx);
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const engine=process.env.BPA_QA_ENGINE||'chromium',drivers=require(path.join(process.env.BPA_QA_NODE_MODULES,'playwright'));
  const browser=await drivers[engine].launch(engine==='chromium'?{headless:true,executablePath:process.env.BPA_QA_CHROME||'/usr/bin/google-chrome',args:['--no-sandbox']}:{headless:true});
  const qaDir='build/qa/'+engine;
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[],assetRequests=[],messages=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{messages.push(m.type()+': '+m.text());if(m.type()==='error')errors.push(m.text());});
  fs.mkdirSync(qaDir,{recursive:true});
  await page.exposeFunction('readAsset',async request=>{
    if(!files.includes(request.path))return {id:request.id,error:'Unknown local asset '+request.path};
    assetRequests.push(request.path);return {id:request.id,data:fs.readFileSync(path.join(root,request.path)).toString('base64')};
  });
  const signatureText=fs.readFileSync('test/scriptable/fixtures/release/latest.json.sig','utf8'),badSignature=Buffer.from(signatureText.trim(),'base64');badSignature[0]^=1;
  const qaUpdate={manifest:fs.readFileSync('test/scriptable/fixtures/release/latest.json').toString('base64'),signature:Buffer.from(signatureText).toString('base64'),badSignature:Buffer.from(badSignature.toString('base64')+'\n').toString('base64')};
  await page.addInitScript(qaUpdate=>{
    window.__bpaVerifiedReplies=[];
    window.__bpaLoginSyncs=0;window.__bpaResumeClaims=0;
    window.addEventListener('bpa-asset-request',async event=>{const result=await window.readAsset(event.detail);window.bpaAssetResult(result);});
    window.addEventListener('bpa-platform-call',event=>{
      const call=JSON.parse(event.detail),method=call.method;
      let result=method==='versionCode'?51:method==='versionName'?'cooc.1.6':method==='hasBoundCard'?false:method==='installStatus'?'idle':method==='status'?{lastSuccessAtMillis:0}:null;
      if(call.channel==='better_phenikaa/qldt_scriptable'&&method==='takeLoginResume') {
        result=!!window.__bpaLoginFixture;window.__bpaResumeClaims++;
      }
      if(call.channel==='better_phenikaa/qldt_scriptable'&&method==='sync') {
        window.__bpaLoginSyncs++;result=window.__bpaLoginFixture;
      }
      if(call.channel==='better_phenikaa/sync_worker') {
        window.__bpaWorkerCalls=window.__bpaWorkerCalls||[];window.__bpaWorkerCalls.push(method);
        if(method==='refreshed')window.__bpaWorkerRefresh=call.arguments;
        if(method==='payload')result=window.__bpaWorkerFixture;
      }
      if(call.channel==='better_phenikaa/update_http'&&method==='fetch')result=call.arguments.url.endsWith('.sig')?(window.__bpaBadSignature?qaUpdate.badSignature:qaUpdate.signature):qaUpdate.manifest;
      if(call.channel==='better_phenikaa/update'&&method==='verifyReply')window.__bpaVerifiedReplies.push(call.arguments);
      window.dispatchEvent(new CustomEvent('bpa-platform-result',{detail:JSON.stringify({id:call.id,result})}));
    });
  },qaUpdate);
  let failure=null,vfxCallbacks=0;
  try {
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.evaluate(()=>window.bpaHost.init({}));
    await page.waitForSelector('flutter-view',{timeout:30000});
    // Flutter puts its CanvasKit canvas inside shadow DOM.
    await page.waitForSelector('canvas',{timeout:30000});
    await page.waitForTimeout(6000);
    await page.screenshot({path:qaDir+'/local-loader-login.png'});
    await page.evaluate(()=>window.bpaHost.event('better_phenikaa/update','event',{type:'verifyRelease',requestId:'qa-good-signature'}));
    await page.waitForFunction(()=>window.__bpaVerifiedReplies.some(r=>r.requestId==='qa-good-signature'),{},{timeout:16000});
    const good=await page.evaluate(()=>window.__bpaVerifiedReplies.find(r=>r.requestId==='qa-good-signature'));
    if(good.error||good.manifest?.versionCode!==51)throw Error('Original Dart verifier rejected the signed QA resource index');
    await page.evaluate(()=>{window.__bpaBadSignature=true;window.bpaHost.event('better_phenikaa/update','event',{type:'verifyRelease',requestId:'qa-bad-signature'});});
    await page.waitForFunction(()=>window.__bpaVerifiedReplies.some(r=>r.requestId==='qa-bad-signature'),{},{timeout:16000});
    const bad=await page.evaluate(()=>window.__bpaVerifiedReplies.find(r=>r.requestId==='qa-bad-signature'));
    if(!bad.error)throw Error('Original Dart verifier accepted a tampered signature');
    fs.writeFileSync(qaDir+'/signed-web-update.json',JSON.stringify({good,bad,note:'QA fixture over an actual prior compiled index; not the public update feed'},null,2));
    // Clearly labelled synthetic fixtures, confined to QA, exercise persisted
    // schedules and the original premium renderer. Never copied into BPA data.
    const local=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const today=local(new Date()),rows=[8,10,13,15].map((hour,index)=>({id:'qa-'+index,isExam:false,subjectName:['Cơ sở dữ liệu','Lập trình','Toán rời rạc','Mạng máy tính'][index],room:'QA '+index,className:'QA',startAt:today+'T'+String(hour).padStart(2,'0')+':00:00.000',endAt:today+'T'+String(hour+1).padStart(2,'0')+':00:00.000',periodStart:index*2+1,periodEnd:index*2+2}));
    const snapshot={displayName:'DỮ LIỆU KIỂM THỬ',source:'qldt',syncedAt:new Date().toISOString(),records:rows};
    for(const theme of ['classic','tien_mon_premium']) {
      await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
      const preferences={'flutter.better_phenikaa_snapshot_v1':JSON.stringify(JSON.stringify(snapshot)),'flutter.better_phenikaa_theme_v3':JSON.stringify(theme)};
      await page.evaluate(preferences=>window.bpaHost.init(preferences),preferences);
      await page.waitForSelector('canvas',{timeout:30000});
      await page.locator('flt-semantics-placeholder').evaluate(element=>element.click());
      await page.locator('[aria-label="Lịch học"]').or(page.getByText('Lịch học',{exact:true})).first().waitFor({state:'visible',timeout:30000});
      await page.waitForTimeout(1500);
      await page.screenshot({path:qaDir+'/fixture-'+theme+'.png'});
    }
    // Resume from managed WebView authentication through the actual Dart login,
    // original first-login name screen and original save transaction. QA only.
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    const semester={semesterId:'qa-term',semesterName:'2026_2027_1',displayName:'QALogin',syncedAt:new Date().toISOString(),subjects:rows.map((row,index)=>({subjectId:'qa-subject-'+index,name:row.subjectName,normalizedName:row.subjectName.toLowerCase(),studySchedules:[row],examSchedules:[]}))};
    await page.evaluate(fixture=>{window.__bpaLoginFixture=fixture;window.bpaHost.init({},{loginResume:true});},{semester,termStartedAt:today+'T00:00:00'});
    await page.waitForSelector('canvas',{timeout:30000});
    await page.locator('flt-semantics-placeholder').evaluate(element=>element.click());
    await page.getByText('Nhấp để sắp xếp tên của bạn',{exact:true}).waitFor({state:'visible',timeout:30000});
    await page.waitForTimeout(600); // Original Material route/chip transitions must settle before visual QA.
    await capturePaintedFrame(page,qaDir+'/login-resume-name.png');
    await page.getByText('QALogin',{exact:true}).click();
    await page.waitForTimeout(250);
    await page.getByRole('button').last().click();
    await page.waitForFunction(()=>{
      let value=localStorage.getItem('flutter.better_phenikaa_snapshot_v1');
      for(let i=0;i<2&&typeof value==='string';i++){try{value=JSON.parse(value);}catch(_){break;}}
      return value?.displayName==='QALogin'&&value.records?.length===4;
    },{},{timeout:30000});
    await page.locator('[aria-label="Lịch học"]').or(page.getByText('Lịch học',{exact:true})).first().waitFor({state:'visible',timeout:30000});
    const resume=await page.evaluate(()=>({claims:window.__bpaResumeClaims,syncs:window.__bpaLoginSyncs,setup:localStorage.getItem('flutter.better_phenikaa_account_setup_complete_v1')}));
    if(resume.claims!==1||resume.syncs!==1||resume.setup!=='true')throw Error('Login resume duplicated the task or skipped the original setup/save: '+JSON.stringify(resume));
    fs.writeFileSync(qaDir+'/login-resume.json',JSON.stringify({resume,note:'Synthetic QA data; original Dart name/save flow, not a university or iPhone session'},null,2));
    await page.screenshot({path:qaDir+'/login-resume-timetable.png'});
    // Run the actual original Dart save from the hidden worker entry. Synthetic
    // QA data only; verifies transaction/diff/maintenance, not iOS background time.
    const committedPreferences=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    const changed={...semester,subjects:[...semester.subjects,{...semester.subjects[0],subjectId:'qa-worker-added',name:'Worker QA',normalizedName:'worker qa',studySchedules:[{...rows[0],id:'qa-worker-added',subjectName:'Worker QA',startAt:today+'T17:00:00',endAt:today+'T18:00:00'}]}]};
    await page.evaluate(({preferences,fixture})=>{window.__bpaWorkerFixture=fixture;window.bpaHost.init(preferences,{syncWorker:true});},{preferences:committedPreferences,fixture:{semester:changed,termStartedAt:today+'T00:00:00'}});
    await page.waitForFunction(()=>window.__bpaWorkerCalls?.includes('complete')||window.__bpaWorkerCalls?.includes('failed'),{},{timeout:30000});
    const worker=await page.evaluate(()=>{
      let snapshot=localStorage.getItem('flutter.better_phenikaa_snapshot_v1');for(let i=0;i<2&&typeof snapshot==='string';i++)snapshot=JSON.parse(snapshot);
      return {calls:window.__bpaWorkerCalls,syncs:window.__bpaLoginSyncs,records:snapshot.records.length,preferences:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))};
    });
    if(worker.calls.join(',')!=='payload,complete'||worker.syncs!==0||worker.records!==5)throw Error('Original worker save did not commit once: '+JSON.stringify(worker));
    fs.writeFileSync(qaDir+'/original-dart-worker.json',JSON.stringify({calls:worker.calls,syncs:worker.syncs,records:worker.records,note:'Original Dart transaction with synthetic data; not a device scheduling test'},null,2));
    // A separately reopened presentation receives committed worker preferences
    // without another QLDT fetch/save or a new launch animation.
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.evaluate(preferences=>window.bpaHost.init(preferences),committedPreferences);
    await page.waitForSelector('canvas',{timeout:30000});
    await page.locator('flt-semantics-placeholder').evaluate(element=>element.click());
    await page.locator('[aria-label="Lịch học"]').or(page.getByText('Lịch học',{exact:true})).first().waitFor({state:'visible',timeout:30000});
    await page.waitForTimeout(1200);
    const beforeRefresh=await capturePaintedFrame(page,qaDir+'/worker-reopened-before.png',true);
    await page.evaluate(preferences=>{window.bpaHost.replacePreferences(preferences);window.bpaHost.event('better_phenikaa/sync_worker','event',{type:'refresh'});},worker.preferences);
    await page.waitForFunction(()=>window.__bpaWorkerRefresh?.records===5,{},{timeout:30000});
    // Dart endOfFrame and WebKit's compositor commit are separate events.
    // Keep the visual assertion and wait for the changed native surface.
    let afterRefresh;
    for(let attempt=0;attempt<50;attempt++){
      afterRefresh=await capturePaintedFrame(page,qaDir+'/worker-reopened-after.png',true);
      if(!beforeRefresh.equals(afterRefresh))break;
      await page.waitForTimeout(100);
    }
    if(beforeRefresh.equals(afterRefresh))throw Error('Worker refresh acknowledged but the app frame did not change');
    if(await page.evaluate(()=>window.__bpaLoginSyncs)!==0)throw Error('Receiving a committed worker result started another sync');
    await require('./test_widget_web.cjs')(browser,root,qaDir);
    if(!assetRequests.some(p=>p.includes('tien_mon_premium/app_backgrounds/')))throw Error('Original premium background did not load from local assets');
    // Exercise the exact source HTML. This is not an NFC hardware test.
    const cardHTML=fs.readFileSync(path.join(root,'assets/assets/card_vfx/link.html'),'utf8');
    await page.evaluate(html=>{
      window.__bpaVfxCallbacks=0;
      const frame=document.createElement('iframe');frame.id='bpa-vfx-qa';
      frame.style='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:9999';
      window.addEventListener('message',event=>{if(event.source===frame.contentWindow&&event.data?.type==='bpa-card-callback'&&event.data?.id==='qa'&&event.data?.name==='vfxComplete')window.__bpaVfxCallbacks++;});
      const bridge='<script>window.flutter_inappwebview={callHandler:function(name,...args){parent.postMessage({type:"bpa-card-callback",id:"qa",name,args},"*");return Promise.resolve(null);}};<'+ '/script>';
      frame.srcdoc=html.replace('<head>','<head>'+bridge);
      document.body.appendChild(frame);
    },cardHTML);
    const frame=await (await page.locator('#bpa-vfx-qa').elementHandle()).contentFrame();
    await frame.waitForFunction(()=>typeof window.paSetMode==='function');
    await frame.evaluate(()=>window.paSetMode(false,'accepted','Kiểm tra VFX'));
    await page.waitForFunction(()=>window.__bpaVfxCallbacks===1,{},{timeout:12000});
    await page.screenshot({path:qaDir+'/local-card-link.png'});
    await frame.evaluate(()=>{window.paSetMode(true,'bound','Kiểm tra VFX');window.paStartDelete();});
    await page.waitForFunction(()=>window.__bpaVfxCallbacks===2,{},{timeout:12000});
    await page.screenshot({path:qaDir+'/local-card-unlink.png'});
    vfxCallbacks=await page.evaluate(()=>window.__bpaVfxCallbacks);
    await page.locator('#bpa-vfx-qa').evaluate(element=>element.remove());
  } catch(error){failure=error.message;}
  await page.screenshot({path:qaDir+'/final-state.png'});
  const semantics=await page.locator('[aria-label]').evaluateAll(elements=>elements.map(e=>({label:e.getAttribute('aria-label'),role:e.getAttribute('role')})));
  fs.writeFileSync(qaDir+'/local-loader.json',JSON.stringify({platform:engine+', 390x844 viewport; not iPhone',errors,messages,assetRequests,failure,vfxCallbacks,semantics,canvases:await page.locator('canvas').count()},null,2));
  console.log(JSON.stringify({errors,messages,assetRequests,failure,semantics}));
  await browser.close();await new Promise(resolve=>server.close(resolve));
  if(failure)throw Error(failure);
  if(errors.length)throw Error(errors.join('\n'));
  if(!assetRequests.some(p=>p.endsWith('canvaskit.wasm')))throw Error('CanvasKit local WASM did not load');
  console.log('Local Flutter loader rendered. iPhone and Scriptable remain unverified.');
}
main().catch(error=>{console.error(error);process.exit(1);});
