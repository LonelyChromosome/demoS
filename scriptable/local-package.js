const BPA_RESOURCE_ROOT='https://raw.githubusercontent.com/LonelyChromosome/demoS/scriptable-web/';
function sha256Raw(raw) {
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],n=raw.length,blocks=Math.ceil((n+9)/64),rotate=(v,b)=>(v>>>b)|(v<<(32-b));
  for(let block=0;block<blocks;block++) {
    const W=new Array(64);
    for(let i=0;i<16;i++){let value=0;for(let j=0;j<4;j++){const at=block*64+i*4+j;const b=at<n?raw.charCodeAt(at):at===n?128:at>=blocks*64-4?Math.floor(n*8/Math.pow(256,blocks*64-1-at))&255:at>=blocks*64-8?Math.floor(n*8/Math.pow(256,blocks*64-1-at))&255:0;value=(value<<8)|b;}W[i]=value;}
    for(let i=16;i<64;i++){const a=W[i-15],b=W[i-2];W[i]=(W[i-16]+(rotate(a,7)^rotate(a,18)^(a>>>3))+W[i-7]+(rotate(b,17)^rotate(b,19)^(b>>>10)))|0;}
    let[a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){const t1=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+K[i]+W[i])|0,t2=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
    [a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)|0);
  }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
function validBundlePath(path) {
  return typeof path==='string'&&path.length<300&&!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(v=>v==='..'||v==='.'||v==='.git'||!v);
}
async function ensureLocalBundle() {
  const active=readState('bundle.json',null);
  if(active&&bpaFM.fileExists(bpaFM.joinPath(active.path,'main.dart.js')))return active;
  const request=new Request(BPA_RESOURCE_ROOT+'bpa-package.json');request.timeoutInterval=30;
  const text=await request.loadString();if(request.response.statusCode!==200)throw errorCode('bundle_unavailable','Tài nguyên BPA chưa được phát hành.');
  const manifest=JSON.parse(text);
  if(manifest.schema!==1||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>1000||manifest.files.some(f=>!validBundlePath(f.path)||!Number.isInteger(f.size)||f.size<0||f.size>100000000||!/^[0-9a-f]{64}$/.test(f.sha256)))throw errorCode('invalid_bundle','Danh mục tài nguyên không hợp lệ.');
  if(manifest.files.reduce((n,f)=>n+f.size,0)>350000000)throw errorCode('invalid_bundle','Gói tài nguyên vượt giới hạn.');
  const digest=sha256Raw(unescape(encodeURIComponent(text))),directory=bpaPath('web-'+digest.slice(0,16));
  if(!bpaFM.fileExists(directory))bpaFM.createDirectory(directory,true);
  // Files are staged under a content identity. The active pointer changes only
  // after every asset matches its declared size and digest.
  for(const file of manifest.files) {
    const path=bpaFM.joinPath(directory,file.path);
    if(bpaFM.fileExists(path)&&sha256Raw(bpaFM.read(path).toRawString())===file.sha256)continue;
    const req=new Request(BPA_RESOURCE_ROOT+file.path.split('/').map(encodeURIComponent).join('/'));req.timeoutInterval=40;
    const data=await req.load(),raw=data.toRawString();
    if(req.response.statusCode!==200||raw.length!==file.size||sha256Raw(raw)!==file.sha256)throw errorCode('bundle_integrity','Không xác minh được tài nguyên '+file.path);
    const parent=path.slice(0,path.lastIndexOf('/'));if(!bpaFM.fileExists(parent))bpaFM.createDirectory(parent,true);
    bpaFM.write(path,data);
  }
  const value={path:directory,versionCode:manifest.versionCode,digest,files:manifest.files.map(f=>f.path)};
  writeState('bundle.json',value);return value;
}
function localAppHTML(bundle) {
  const read=name=>bpaFM.readString(bpaFM.joinPath(bundle.path,name));
  // Main Dart and CanvasKit module bytes are embedded once. Fonts, images and
  // WASM remain lazy local reads, avoiding a giant all-assets JS object.
  const modules=bundle.files.filter(p=>p.startsWith('canvaskit/')&&p.endsWith('.js')).map(path=>({path,text:read(path)}));
  const prepare=`const imports={};for(const item of ${JSON.stringify(modules)})imports['https://bpa.local/'+item.path]=URL.createObjectURL(new Blob([item.text],{type:'application/javascript'}));const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.appendChild(map);window.__bpaMainURL=URL.createObjectURL(new Blob([${JSON.stringify(read('main.dart.js'))}],{type:'application/javascript'}));`;
  const storage=`class BPAStorage{constructor(){Object.defineProperty(this,'values',{value:{},enumerable:false,configurable:true});}get length(){return Object.keys(this.values).length;}key(i){return Object.keys(this.values)[i]||null;}getItem(k){return Object.prototype.hasOwnProperty.call(this.values,k)?this.values[k]:null;}setItem(k,v){this.values[String(k)]=String(v);}removeItem(k){delete this.values[k];}clear(){for(const k of Object.keys(this.values))delete this.values[k];}}const memory=new Proxy(new BPAStorage(),{ownKeys:t=>Object.keys(t.values),getOwnPropertyDescriptor:(t,k)=>k in t.values?{value:t.values[k],enumerable:true,configurable:true}:Reflect.getOwnPropertyDescriptor(t,k)});Object.defineProperty(window,'localStorage',{value:memory,configurable:true});`;
  const safe=s=>s.replace(/<\/script/gi,'<\\/script');
  return '<!doctype html><html lang="vi"><head><base href="https://bpa.local/"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{margin:0;height:100%;overflow:hidden;background:#edf3fc}</style></head><body>'+
    '<script>window.__BPA_LOCAL__=true;'+safe(storage)+safe(prepare)+'</script>'+
    '<script>'+safe(read('scriptable-bridge.js'))+'</script>'+
    '<script>'+safe(read('local-assets.js'))+'</script>'+
    '<script>'+safe(read('flutter_bootstrap.js'))+';for(const build of _flutter.buildConfig.builds)build.mainJsPath=window.__bpaMainURL;</script></body></html>';
}
