// Dispatch through the live university page's authenticated transport. There is
// exactly one outstanding callback evaluation and its completion is captured.
async function portalCall(web,evaluate,source,resultHandler,errorHandler,check){
 check();const code=`(()=>{
  const done=completion,previousBridge=window.flutter_inappwebview;
  let finished=false;
  const original=window.edu&&edu.system;
  function finish(value){if(finished)return;finished=true;clearTimeout(timer);window.flutter_inappwebview=previousBridge;done(value);}
  const timer=setTimeout(()=>finish({error:'QLDT_REQUEST_TIMEOUT'}),20000);
  if(!original||typeof original.makeRequest!=='function'){finish({error:'SESSION_EXPIRED'});return;}
  const bpaSystem=Object.create(original);
  bpaSystem.makeRequest=(options,...rest)=>{if(finished)return;const guarded={...options,success:value=>{if(!finished)options.success(value);},error:(...args)=>{if(!finished&&options.error)options.error(...args);}};return original.makeRequest.call(original,guarded,...rest);};
  window.flutter_inappwebview={callHandler(name,attempt,value){
   if(name===${JSON.stringify(resultHandler)})finish({value});
   else if(name===${JSON.stringify(errorHandler)})finish({error:String(value||'QLDT_ERROR')});
   return Promise.resolve(null);
  }};
  try{const result=${source.trim().replace(/;$/,'')};if(['SESSION_EXPIRED','BRIDGE_MISSING','BRIDGE_EXCEPTION','bridge_unavailable','portal_unavailable','request_exception'].includes(result))finish({error:result});}catch(error){finish({error:'QLDT_PAGE_ERROR'});}
 })();`;
 const result=await evaluate(web,code,true,25000);check();
 if(!result||result.error)throw Object.assign(Error(result?.error==='QLDT_REQUEST_TIMEOUT'?'QLĐT chưa trả dữ liệu sau 20 giây. Lịch cũ được giữ lại.':result?.error==='SESSION_EXPIRED'?'Phiên trong trang QLĐT chưa sẵn sàng.':('QLĐT: '+(result?.error||'Không có kết quả'))),{code:result?.error||'qldt_result'});
 return JSON.parse(result.value);
}
async function fetchInPortal(web,evaluate,check,stage=()=>{}){
 stage('registration');
 const raw=await portalCall(web,evaluate,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',check);
 const reg=BPACore.registration(raw),chunks=BPACore.chunksFor(reg);check();stage('schedule');
 const source=SCHEDULE_SCRIPT.replace('__BPA_CHUNKS__',JSON.stringify(chunks));
 const value=chunks.length?await portalCall(web,evaluate,source,'betterPhenikaaSyncResult','betterPhenikaaSyncError',check):{response:{Success:true,Data:[]}};
 check();stage('verification');const semester=BPACore.buildSemester(reg,BPACore.parseSchedule(value.response));
 if(!semester.displayName)throw Error('QLĐT chưa có tên sinh viên đã xác minh.');
 if(!chunks.length)throw Error('Chưa xác định được ngày bắt đầu học kỳ.');
 return {semester,termStartedAt:localISO(BPACore.vnDate(chunks[0].start))};
}
