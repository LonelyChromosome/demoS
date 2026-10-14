// Variables used by Scriptable.
// icon-color: deep-blue; icon-glyph: calendar-alt;
// BPA cooc 1.0 base; optional features load on demand.
const BASE_RELEASE="__BPA_BASE_RELEASE__";
const BASE_NAME=module.filename.split('/').pop().replace(/\.js$/,'');
const BASE_FILES={"runtime.js":{"size":15822,"sha256":"f2f5e7673db8756abd125fa15287e405baae028a427c4dde01546c779b88b5bb"},"ui.html":{"size":21178,"sha256":"da0cf2394ae5492ec08bb0c7edbeda1620441f1b296c560b4231b7014d243cca"},"sync.js":{"size":26619,"sha256":"6dfd2789945c5454b4fd87d58b6df0297e7c974fecbce448ac4e05f74b3bab4d"},"module-manager.js":{"size":4940,"sha256":"952dcde9d9265446df8dc05a639028265753f041a0d41b8334115b0b3e7a3148"},"services.js":{"size":10859,"sha256":"15355e37292e2e4ede60b8d8cffc633c44c8641ddc50e44d670130fd33ace7ce"},"catalog.json":{"size":12598,"sha256":"caba88e0b7d76ade135930eca3bd59ce6f3cc5d9a6c56433ee27e0050b086c71"},"Roboto-Regular.ttf":{"size":171676,"sha256":"79e851404657dac2106b3d22ad256d47824a9a5765458edb72c9102a45816d95"}};
function* sha256Work(raw) {
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],n=raw.length,blocks=Math.ceil((n+9)/64),rotate=(v,b)=>(v>>>b)|(v<<(32-b));
  for(let block=0;block<blocks;block++) {
    const W=new Array(64);
    for(let i=0;i<16;i++){let value=0;for(let j=0;j<4;j++){const at=block*64+i*4+j;const b=at<n?(typeof raw==='string'?raw.charCodeAt(at):raw.byteAt(at)):at===n?128:at>=blocks*64-4?Math.floor(n*8/Math.pow(256,blocks*64-1-at))&255:at>=blocks*64-8?Math.floor(n*8/Math.pow(256,blocks*64-1-at))&255:0;value=(value<<8)|b;}W[i]=value;}
    for(let i=16;i<64;i++){const a=W[i-15],b=W[i-2];W[i]=(W[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+W[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10)))|0;}
    let[a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]+W[i])|0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    [a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)|0);
    if(block%1024===1023)yield;
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
function sha256Raw(raw) {const work=sha256Work(raw);let value;do{value=work.next();}while(!value.done);return value.value;}
function base64ByteView(base64) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',values={};for(let i=0;i<64;i++)values[alphabet[i]]=i;
  const length=base64.length/4*3-(base64.endsWith('==')?2:base64.endsWith('=')?1:0);
  return {length,byteAt(index){const i=Math.floor(index/3)*4,a=values[base64[i]],b=values[base64[i+1]],c=values[base64[i+2]]||0,d=values[base64[i+3]]||0;return index%3===0?(a<<2)|(b>>4):index%3===1?((b&15)<<4)|(c>>2):((c&3)<<6)|d;}};
}
function dataSize(data) {return base64ByteView(data.toBase64String()).length;}
function sha256Data(data) {return sha256Raw(base64ByteView(data.toBase64String()));}

async function startBase(){
 const fm=FileManager.local(),directory=fm.joinPath(fm.documentsDirectory(),'BPA/base-'+BASE_RELEASE.slice(0,12));if(!fm.fileExists(directory))fm.createDirectory(directory,true);
 const web=new WebView();let closed=false,currentPhase='opening';
 const stopped=Object.assign(Error('Đã đóng BPA.'),{code:'cancelled'});
 let rejectClose;const cancellation=new Promise((_,reject)=>rejectClose=reject);cancellation.catch(()=>{});
 const check=()=>{if(closed)throw stopped;};
 const delay=ms=>new Promise(resolve=>Timer.schedule(ms,false,resolve));
 async function evaluate(view,source,callback=false,ms=10000){check();let timer;try{return await Promise.race([view.evaluateJavaScript(source,callback),cancellation,...(ms?[new Promise((_,reject)=>{timer=Timer.schedule(ms,false,()=>reject(Error('BPA chưa phản hồi ở bước '+currentPhase+'. Đóng rồi chạy lại.')));})]:[])]);}finally{if(timer)timer.invalidate();}}
 async function progress(text){check();currentPhase=text;fm.writeString(fm.joinPath(directory,'startup.json'),JSON.stringify({phase:text,at:Date.now(),script:module.filename,release:BASE_RELEASE}));try{await evaluate(web,`document.getElementById('status')&&(document.getElementById('status').textContent=${JSON.stringify(text)});null`,false);}catch(error){if(closed)throw error;}}
 await web.loadHTML('<!doctype html><html lang="vi"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#f9fbff;color:#102b73;font:17px -apple-system,sans-serif"><main style="padding:28px;min-height:90vh;display:flex;justify-content:center;flex-direction:column"><h1>BPA</h1><p>cooc 1.0 base</p><p id="status" role="status">Đang mở BPA…</p><p style="font-size:13px;color:#7180a0">Lần đầu cần mạng để cài phần trong app. Đóng màn hình để dừng; chạy lại để tiếp tục.</p></main></body></html>','https://bpa.local/');
 const presentation=web.present(true).then(()=>{closed=true;rejectClose(stopped);});
 const installing=new Map();
 async function integrity(data){const raw=base64ByteView(data.toBase64String()),work=sha256Work(raw);let step;do{check();step=work.next();if(!step.done)await delay(1);}while(!step.done);return {size:raw.length,sha256:step.value};}
 async function install(name,resource=null){
  check();if(resource?(!name.startsWith('@')||!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(name.slice(1))||name.slice(1).split('/').some(x=>x==='.'||x==='..')||!Number.isInteger(resource.size)||resource.size>25000000||resource.size<0||!/^[0-9a-f]{64}$/.test(resource.sha256)):!Object.prototype.hasOwnProperty.call(BASE_FILES,name))throw Error('Phần cài không thuộc bản BPA này.');
  if(installing.has(name))return await installing.get(name);
  const job=(async()=>{const expected=resource||BASE_FILES[name],relative=resource?'resources/'+name.slice(1):name,path=fm.joinPath(directory,relative),parent=path.slice(0,path.lastIndexOf('/'));if(!fm.fileExists(parent))fm.createDirectory(parent,true);if(fm.fileExists(path)){const data=fm.read(path);const cached=await integrity(data);if(cached.sha256===expected.sha256&&cached.size===expected.size)return path;}
   await progress(name==='sync.js'?'Đang chuẩn bị kết nối QLĐT…':'Đang chuẩn bị giao diện BPA…');await delay(1);check();const request=new Request('https://raw.githubusercontent.com/LonelyChromosome/demoS/'+BASE_RELEASE+'/'+(resource?name.slice(1):'scriptable/base/'+name));request.timeoutInterval=30;
   const data=await Promise.race([request.load(),cancellation]);check();const verified=await integrity(data);if(request.response.statusCode!==200||verified.size!==expected.size||verified.sha256!==expected.sha256)throw Error('Không xác minh được phần cài BPA. Hãy chạy lại.');
   const pending=path+'.pending';fm.write(pending,data);check();if((await integrity(fm.read(pending))).sha256!==expected.sha256)throw Error('Không lưu được phần cài BPA.');if(fm.fileExists(path))fm.remove(path);fm.move(pending,path);await delay(1);check();return path;
  })();installing.set(name,job);try{return await job;}finally{installing.delete(name);}
 }
 try{const runtime=importModule(await install('runtime.js'));check();await runtime.run(web,{fm,install,installResource:f=>install('@'+f.path,f),release:BASE_RELEASE,baseFiles:BASE_FILES,runtimePath:fm.joinPath(directory,'runtime.js'),scriptName:BASE_NAME,evaluate,delay,check,presentation});}
 catch(error){if(!closed){try{await progress(error.message||String(error));}catch(_){}await presentation;}if(error.code!=='cancelled')console.error(error.message||String(error));}
}
function widgetNotice(message){const widget=new ListWidget();widget.setPadding(16,16,16,16);widget.backgroundColor=new Color('#f9fbff');const title=widget.addText('BPA');title.font=Font.boldSystemFont(20);title.textColor=new Color('#102b73');widget.addSpacer(8);const text=widget.addText(message);text.font=Font.systemFont(13);widget.url='scriptable:///run?scriptName='+encodeURIComponent(BASE_NAME);Script.setWidget(widget);}
async function runEntry(){
 if(typeof config!=='undefined'&&config.runsInWidget){
  const fm=FileManager.local(),root=fm.joinPath(fm.documentsDirectory(),'BPA'),hostPath=fm.joinPath(root,'module-host.json'),registryPath=fm.joinPath(root,'modules.json');
  try{if(!fm.fileExists(hostPath)||!fm.fileExists(registryPath)||!JSON.parse(fm.readString(registryPath)).active?.widgets){widgetNotice('Mở BPA → Phần mở rộng → cài Widget.');return;}
   const host=JSON.parse(fm.readString(hostPath));host.scriptName=BASE_NAME;if(!host.services||!fm.fileExists(host.services))throw Error('Cài lại phần Widget trong BPA.');
   const parts=String(args.widgetParameter||'').trim().split(':'),known=['small','overview','widget2'].includes(parts[0]),kind=known?parts[0]:'overview',instance=(known?parts.slice(1):parts).join(':')||'main';
   await importModule(host.services).runWidget(host,kind,instance);
  }catch(error){widgetNotice(error.message||'Mở BPA để kiểm tra Widget.');}return;
 }
 if(typeof config!=='undefined'&&config.runsInApp===false){Safari.open('scriptable:///run?scriptName='+encodeURIComponent(BASE_NAME));return;}
 await startBase();
}
await runEntry();
Script.complete();
