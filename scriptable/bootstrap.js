// Installation UI and native Web Crypto verification. Original Flutter UI is
// loaded into the same presented WebView after preparation completes.
function resourceIntegrityScript() {
  return `window.bpaIntegrity={async digest(encoded){
    if(!window.crypto||!crypto.subtle)throw Error('native_crypto_unavailable');
    const raw=atob(encoded),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    const result=await crypto.subtle.digest('SHA-256',bytes);
    return {size:bytes.length,sha256:Array.from(new Uint8Array(result),b=>b.toString(16).padStart(2,'0')).join('')};
  }};`;
}
function bootstrapHTML() {
  return '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;height:100%;background:#edf3fc;color:#142c74;font:17px -apple-system,sans-serif}main{max-width:420px;margin:auto;padding:24px;min-height:90vh;display:flex;flex-direction:column;justify-content:center;box-sizing:border-box}h1{font-size:30px;margin:0 0 24px}p{line-height:1.5}progress{width:100%;height:8px;accent-color:#1747b5}#detail{font-size:14px;color:#627397}button{align-self:flex-start;background:white;border:1px solid #ccd7ee;border-radius:16px;padding:12px 24px;color:#1747b5;font:inherit;margin-top:16px}</style></head><body><main><h1>BPA</h1><p style="font-size:13px;color:#627397">Bản thử nghiệm '+BPA_UPDATE_CHANNEL.versionCode+'</p><p id="status">Đang chuẩn bị BPA…</p><progress id="progress"></progress><p id="detail">Lần đầu cần tải tài nguyên. Các phần đã tải sẽ được giữ lại.</p><button id="cancel">Hủy</button></main><script>'+resourceIntegrityScript()+`
    const waits=[];let cancelled=false;
    window.bpaBootstrap={
      waitCancel(done){if(cancelled)done({cancelled:true});else waits.push(done);},
      finish(){for(const done of waits.splice(0))done({finished:true});},
      update(value){
        document.getElementById('status').textContent=value.status;
        document.getElementById('detail').textContent=value.detail||'';
        const p=document.getElementById('progress');
        if(value.total>0){p.max=value.total;p.value=value.bytes||0;}
        if(value.stopped)document.getElementById('cancel').disabled=true;
      }
    };
    document.getElementById('cancel').onclick=()=>{cancelled=true;document.getElementById('cancel').disabled=true;document.getElementById('status').textContent='Đang dừng…';for(const done of waits.splice(0))done({cancelled:true});};
  </script></body></html>`;
}
let resourceVerifierPromise=null;
async function integrityEvaluation(web,script,timeout=15000) {
  let timer;
  try{return await Promise.race([web.evaluateJavaScript(script,true),new Promise((_,reject)=>{timer=Timer.schedule(timeout,false,()=>reject(errorCode('bundle_hash_timeout','Kiểm tra tài nguyên chưa phản hồi. Chạy lại BPA để tiếp tục.')));})]);}
  finally{if(timer)timer.invalidate();}
}
async function createResourceVerifier(web=null) {
  if(!web){web=new WebView();await web.loadHTML('<!doctype html><script>'+resourceIntegrityScript()+'</script>','https://bpa.local/');}
  let native=false;
  try {
    const sample=await integrityEvaluation(web,'bpaIntegrity.digest("").then(completion,error=>completion({error:String(error)}));',5000);
    native=sample?.sha256==='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  }catch(_){}
  return {backend:native?'webcrypto':'cooperative-js',async verify(data,check=()=>{}) {
    check();const encoded=data.toBase64String();
    if(native) {
      const result=await integrityEvaluation(web,`bpaIntegrity.digest(${JSON.stringify(encoded)}).then(completion,error=>completion({error:String(error)}));`);
      check();
      if(result?.error||!Number.isInteger(result?.size)||!/^[0-9a-f]{64}$/.test(result?.sha256||''))throw errorCode('bundle_hash','Không kiểm tra được tài nguyên BPA.');
      return result;
    }
    const raw=base64ByteView(encoded);
    return {size:raw.length,sha256:await sha256Cooperative(raw,check)};
  }};
}
async function resourceIntegrity(data,verifier=null,check=()=>{}) {
  if(!verifier){if(!resourceVerifierPromise)resourceVerifierPromise=createResourceVerifier().catch(error=>{resourceVerifierPromise=null;throw error;});verifier=await resourceVerifierPromise;}
  return await verifier.verify(data,check);
}
function cachedBundleReady() {
  const pending=readState('pending-bundle.json',null),active=readState('bundle.json',null);
  const complete=value=>value&&Array.isArray(value.files)&&BPA_REQUIRED_BUNDLE_FILES.every(name=>value.files.includes(name)&&bpaFM.fileExists(bpaFM.joinPath(value.path,name)));
  return pending&&!pending.bootAttempted&&complete(pending)||complete(active)&&active.versionCode>=BPA_UPDATE_CHANNEL.versionCode;
}
function acquireStartupLease() {
  const name='startup-lease.json',path=bpaPath(name),old=readState(name,null);
  if(old&&Date.now()-old.at<120000)throw errorCode('startup_busy','Một lượt chuẩn bị BPA đang chạy. Hãy quay lại lượt đó.');
  // Never remove a lease that appeared after an initially empty read.
  if(old&&bpaFM.fileExists(path))bpaFM.remove(path);
  const id=UUID.string(),claim=bpaPath('startup-claim-'+id+'.json');
  bpaFM.writeString(claim,JSON.stringify({id,at:Date.now()}));
  try{bpaFM.move(claim,path);}catch(error){if(bpaFM.fileExists(claim))bpaFM.remove(claim);throw errorCode('startup_busy','Một lượt chuẩn bị BPA đang chạy.');}
  return {check(){if(readState(name,null)?.id!==id)throw errorCode('cancelled','Lượt chuẩn bị đã bị hủy.');},heartbeat(){this.check();writeState(name,{id,at:Date.now()});},release(){if(readState(name,null)?.id===id)bpaFM.remove(path);}};
}
async function prepareAppBundle(app) {
  if(cachedBundleReady())return {bundle:await ensureLocalBundle(true),presentation:null};
  const lease=acquireStartupLease(),control={closed:false,cancelled:false},startedAt=Date.now();
  let presentation,stage;
  function check(){lease.check();if(control.cancelled||control.closed)throw errorCode('cancelled','Đã dừng chuẩn bị BPA.');}
  try {
    await app.loadHTML(bootstrapHTML(),'https://bpa.local/');
    let cancel;
    const cancellation=new Promise((_,reject)=>cancel=()=>reject(errorCode('cancelled','Đã dừng chuẩn bị BPA.')));
    // Capture completion before later evaluations replace its global binding.
    const waiting=app.evaluateJavaScript('bpaBootstrap.waitCancel(completion);',true).then(value=>{if(value?.cancelled){control.cancelled=true;cancel();}},error=>{if(!control.closed){control.cancelled=true;cancel();}});
    presentation=app.present(true).then(()=>{control.closed=true;control.cancelled=true;cancel();});
    const verifier=await Promise.race([createResourceVerifier(app),cancellation]);check();
    async function progress(bytes,total,meta={}) {
      check();lease.heartbeat();
      const phase=meta.phase||'download';
      writeState('startup-diagnostics.json',{versionCode:BPA_UPDATE_CHANNEL.versionCode,script:module.filename.split('/').pop(),phase,bytes,total,fileIndex:meta.index||0,fileCount:meta.count||0,backend:verifier.backend,elapsedMs:Date.now()-startedAt,at:Date.now()});
      const labels={manifest:'Đang kiểm tra gói BPA…',download:'Đang tải tài nguyên BPA…',verify:'Đang kiểm tra tài nguyên…',reuse:'Đang dùng lại tài nguyên đã tải…'};
      await app.evaluateJavaScript(`bpaBootstrap.update(${JSON.stringify({status:labels[phase]||'Đang chuẩn bị BPA…',detail:total?`${(bytes/1000000).toFixed(1)} / ${(total/1000000).toFixed(1)} MB · ${meta.index||0}/${meta.count||0} phần`:'Lần đầu cần mạng. Bạn có thể hủy và tiếp tục sau.',bytes,total})});null`,false);
    }
    stage=ensureLocalBundle(true,{progress,check,verifier});stage.catch(()=>{});
    const bundle=await Promise.race([stage,cancellation]);check();
    await app.evaluateJavaScript('bpaBootstrap.finish();null',false);
    writeState('startup-diagnostics.json',{versionCode:BPA_UPDATE_CHANNEL.versionCode,script:module.filename.split('/').pop(),status:'ready',backend:verifier.backend,elapsedMs:Date.now()-startedAt,at:Date.now()});
    return {bundle,presentation};
  } catch(error) {
    control.cancelled=true;
    writeState('startup-diagnostics.json',{versionCode:BPA_UPDATE_CHANNEL.versionCode,script:module.filename.split('/').pop(),status:error.code==='cancelled'?'cancelled':'failed',code:error.code||'startup_error',elapsedMs:Date.now()-startedAt,at:Date.now()});
    if(presentation&&!control.closed) {
      try{await app.evaluateJavaScript(`bpaBootstrap.finish();bpaBootstrap.update(${JSON.stringify({status:error.code==='cancelled'?'Đã dừng tải BPA':'Chưa chuẩn bị được BPA',detail:error.code==='cancelled'?'Các phần đã tải được giữ lại. Đóng màn hình rồi chạy BPA để tiếp tục.':error.message,stopped:true})});null`,false);}catch(_){}
      await presentation;
    }
    if(error.code==='cancelled')return null;
    throw error;
  } finally {lease.release();}
}
