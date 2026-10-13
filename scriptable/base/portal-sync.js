// Start a page-owned request, then read its mailbox with ordinary synchronous
// evaluations. Never depend on Scriptable's injected completion callback.
let portalJobSequence=0;
async function portalCall(web,evaluate,source,resultHandler,errorHandler,check,delay){
 check();const job=String(Date.now())+'-'+(++portalJobSequence),key=JSON.stringify(job);
 const code=`(()=>{
  const jobs=window.__bpaPortalJobs||(window.__bpaPortalJobs=Object.create(null));
  const entry=jobs[${key}]={result:null,cancel:null};
  const existingBridge=window.flutter_inappwebview,previousBridge=existingBridge?.__bpaPortalBridge===true?existingBridge.__bpaPrevious:existingBridge;
  let finished=false,ownedBridge=null;
  const original=window.edu&&edu.system;
  function finish(value){if(finished)return;finished=true;clearTimeout(timer);entry.result=JSON.stringify(value);setTimeout(()=>{if(ownedBridge&&window.flutter_inappwebview===ownedBridge)window.flutter_inappwebview=previousBridge;},0);}
  const timer=setTimeout(()=>finish({error:'QLDT_REQUEST_TIMEOUT'}),20000);entry.cancel=()=>finish({error:'cancelled'});
  if(!original||typeof original.makeRequest!=='function'){finish({error:'SESSION_EXPIRED'});return 'started';}
  const bpaSystem=Object.create(original);
  bpaSystem.makeRequest=(options,...rest)=>{if(finished)return;const guarded={...options,success:value=>{if(!finished)options.success(value);},error:(...args)=>{if(!finished&&options.error)options.error(...args);}};return original.makeRequest.call(original,guarded,...rest);};
  ownedBridge={__bpaPortalBridge:true,__bpaPrevious:previousBridge,callHandler(name,attempt,value){
   if(finished)return Promise.resolve(null);
   if(name===${JSON.stringify(resultHandler)})finish({value});
   else if(name===${JSON.stringify(errorHandler)})finish({error:String(value||'QLDT_ERROR')});
   return Promise.resolve(null);
  }};window.flutter_inappwebview=ownedBridge;
  try{const result=${source.trim().replace(/;$/,'')};if(['SESSION_EXPIRED','BRIDGE_MISSING','BRIDGE_EXCEPTION','bridge_unavailable','portal_unavailable','request_exception'].includes(result))finish({error:result});}catch(error){finish({error:'QLDT_PAGE_ERROR'});}
  return 'started';
 })();`;
 let result;
 try{
  await evaluate(web,code,false,5000);const deadline=Date.now()+25000;
  while(Date.now()<deadline){check();const raw=await evaluate(web,`window.__bpaPortalJobs?.[${key}]?.result||null`,false,5000);if(raw){result=JSON.parse(raw);break;}await delay(100);}
  check();if(!result)result={error:'QLDT_REQUEST_TIMEOUT'};
 }finally{
  // Cancel gates all late API callbacks; deferred restoration keeps duplicate
  // callbacks in the same task from escaping to the university's old bridge.
  try{await evaluate(web,`(()=>{const jobs=window.__bpaPortalJobs,entry=jobs?.[${key}];if(entry){entry.cancel();delete jobs[${key}];}return null;})()`,false,5000);}catch(_){}
 }
 if(result.error)throw Object.assign(Error(result.error==='QLDT_REQUEST_TIMEOUT'?'QLĐT chưa trả dữ liệu sau 20 giây. Lịch cũ được giữ lại.':result.error==='SESSION_EXPIRED'?'Phiên trong trang QLĐT chưa sẵn sàng.':('QLĐT: '+result.error)),{code:result.error});
 return JSON.parse(result.value);
}
async function fetchInPortal(web,evaluate,check,stage=()=>{},delay){
 stage('registration');
 const raw=await portalCall(web,evaluate,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',check,delay);
 const reg=BPACore.registration(raw),chunks=BPACore.chunksFor(reg);check();stage('schedule');
 const source=SCHEDULE_SCRIPT.replace('__BPA_CHUNKS__',JSON.stringify(chunks));
 const value=chunks.length?await portalCall(web,evaluate,source,'betterPhenikaaSyncResult','betterPhenikaaSyncError',check,delay):{response:{Success:true,Data:[]}};
 check();stage('verification');const semester=BPACore.buildSemester(reg,BPACore.parseSchedule(value.response));
 if(!semester.displayName)throw Error('QLĐT chưa có tên sinh viên đã xác minh.');
 if(!chunks.length)throw Error('Chưa xác định được ngày bắt đầu học kỳ.');
 return {semester,termStartedAt:localISO(BPACore.vnDate(chunks[0].start))};
}
