// Login uses the already presented app WebView. No second presentation or
// undocumented dismiss API, and no requirement to press Done after login.
const appSessions = new WeakMap();
function nativeDelay(milliseconds) {
  return new Promise(resolve => Timer.schedule(milliseconds, false, resolve));
}
async function portalProbe(app) {
  let timer;
  try {
    return await Promise.race([
      app.evaluateJavaScript(`location.hostname==='qldtbeta.phenikaa-uni.edu.vn'?(${SESSION_SCRIPT.trim().replace(/;$/, '')}):null`, false),
      new Promise((_, reject) => {timer=Timer.schedule(5000,false,()=>reject(errorCode('login_readiness_timeout','QLĐT chưa phản hồi. Hãy thử lại.')));})
    ]);
  } catch(error) {
    if(error.code==='login_readiness_timeout')throw error;
    // Navigation can replace the JavaScript world between probes.
    return null;
  } finally {if(timer)timer.invalidate();}
}
async function waitForPortalSession(app, state, generation, timeoutMs=600000) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline) {
    checkSyncGeneration(generation);
    if(state.closed)throw errorCode('cancelled','Đã đóng đăng nhập QLĐT.');
    const raw=await portalProbe(app);
    checkSyncGeneration(generation);
    if(state.closed)throw errorCode('cancelled','Đã đóng đăng nhập QLĐT.');
    if(raw) {
      let value;try {value=JSON.parse(raw);}catch(_){value=null;}
      if(value&&['tokenJWT','userId','iM','appId','strChucNangId'].every(key=>typeof value[key]==='string'&&value[key].trim()))return value;
    }
    await nativeDelay(100);
  }
  throw errorCode('login_timeout','Phiên đăng nhập QLĐT đã hết thời gian. Hãy thử lại.');
}
function wakeAppSession(state) {
  for(const resolve of state.waiters.splice(0))resolve();
}
function waitForAppSession(state) {
  if(state.phase==='app'||state.closed||state.failure)return Promise.resolve();
  return new Promise(resolve=>state.waiters.push(resolve));
}
async function restoreAppAfterLogin(app,state,generation) {
  checkSyncGeneration(generation);
  if(state.closed)return;
  // Keep the original task (including its error) for the rebuilt Flutter UI.
  // Its next sync consumes this once instead of opening login or fetching twice.
  state.loginResume={generation,promise:syncInFlight,claimed:false};
  await app.loadHTML(localAppHTML(state.bundle),'https://bpa.local/');
  checkSyncGeneration(generation);
  if(state.closed)return;
  await app.evaluateJavaScript(`bpaHost.init(${JSON.stringify(readState('preferences.json'))},{loginResume:true});null`,false);
  state.phase='app';wakeAppSession(state);
}
async function authenticatePortalInApp(app,generation) {
  const state=app&&appSessions.get(app);
  if(!state||state.closed)throw errorCode('login_context','Không tìm thấy giao diện đăng nhập BPA.');
  state.phase='portal';state.epoch++;
  if(state.pollInterrupt)state.pollInterrupt();
  try {
    const preferences=await app.evaluateJavaScript('bpaHost.suspend();',false);
    checkSyncGeneration(generation);
    if(preferences)writeState('preferences.json',preferences);
    await app.loadURL('https://qldtbeta.phenikaa-uni.edu.vn/');
    return await waitForPortalSession(app,state,generation);
  } finally {
    if(!state.closed&&generation===syncGeneration) {
      try {await restoreAppAfterLogin(app,state,generation);}
      catch(error){state.failure=error;wakeAppSession(state);throw error;}
    }
  }
}
function takeLoginResume(app) {
  const state=app&&appSessions.get(app),resume=state&&state.loginResume;
  if(!resume||resume.claimed||resume.generation!==syncGeneration)return false;
  resume.claimed=true;return true;
}
function consumeLoginSync(app) {
  const state=app&&appSessions.get(app),resume=state&&state.loginResume;
  if(!resume||!resume.claimed||resume.generation!==syncGeneration)return null;
  state.loginResume=null;return resume.promise;
}

async function pollAppPacket(app,state) {
  let interrupt;
  const interrupted=new Promise(resolve=>{interrupt=()=>resolve(null);state.pollInterrupt=interrupt;});
  try {return await Promise.race([app.evaluateJavaScript('bpaHost.poll(completion);',true),interrupted]);}
  finally {if(state.pollInterrupt===interrupt)state.pollInterrupt=null;}
}
