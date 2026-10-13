// Variables used by Scriptable.
// icon-color: deep-blue; icon-glyph: calendar-alt;
// BPA cooc 1.0 base. Additional features are not initialized by this installer.
const BASE_RELEASE="__BPA_BASE_RELEASE__";
const BASE_FILES={
  "runtime.js": {
    "size": 10037,
    "sha256": "fff3db439a3ef835ee0bf497809793faa22fea1d3ce35b8be862fadbea9cb5cd"
  },
  "ui.html": {
    "size": 13566,
    "sha256": "703bdea2bb0857e939caf0d13e85fa4368a8bd6ed3f6d5047e28ed4db04c83eb"
  },
  "sync.js": {
    "size": 25711,
    "sha256": "a1ff996bc98f5a6e15bfc8ce3053f8797f22abab762b876b9eaeacc910a59200"
  },
  "Roboto-Regular.ttf": {
    "size": 171676,
    "sha256": "79e851404657dac2106b3d22ad256d47824a9a5765458edb72c9102a45816d95"
  }
};
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
 async function install(name){
  check();if(!Object.prototype.hasOwnProperty.call(BASE_FILES,name))throw Error('Phần cài không thuộc bản BPA này.');
  if(installing.has(name))return await installing.get(name);
  const job=(async()=>{const expected=BASE_FILES[name],path=fm.joinPath(directory,name);if(fm.fileExists(path)){const data=fm.read(path);if(sha256Data(data)===expected.sha256)return path;}
   await progress(name==='sync.js'?'Đang chuẩn bị kết nối QLĐT…':'Đang chuẩn bị giao diện BPA…');await delay(1);check();const request=new Request('https://raw.githubusercontent.com/LonelyChromosome/demoS/'+BASE_RELEASE+'/scriptable/base/'+name);request.timeoutInterval=30;
   const data=await Promise.race([request.load(),cancellation]);check();if(request.response.statusCode!==200||dataSize(data)!==expected.size||sha256Data(data)!==expected.sha256)throw Error('Không xác minh được phần cài BPA. Hãy chạy lại.');
   const pending=path+'.pending';fm.write(pending,data);check();if(sha256Data(fm.read(pending))!==expected.sha256)throw Error('Không lưu được phần cài BPA.');if(fm.fileExists(path))fm.remove(path);fm.move(pending,path);await delay(1);check();return path;
  })();installing.set(name,job);try{return await job;}finally{installing.delete(name);}
 }
 try{const runtime=importModule(await install('runtime.js'));check();await runtime.run(web,{fm,install,evaluate,delay,check,presentation});}
 catch(error){if(!closed){try{await progress(error.message||String(error));}catch(_){}await presentation;}if(error.code!=='cancelled')console.error(error.message||String(error));}
}
await startBase();
Script.complete();
