// Offline resource transport for Flutter CanvasKit. No university credentials
// enter this protocol. Scriptable returns only files from BPA's local bundle.
(() => {
  if(!window.__BPA_LOCAL__)return;
  // loadHTML has an opaque/file origin on WebKit. Flutter's initial route
  // bookkeeping may resolve "/" against the synthetic asset base. Keep the
  // real history state, but never move a local document to that asset origin.
  for (const method of ['replaceState','pushState']) {
    const original=history[method].bind(history);
    history[method]=(state,title,url)=>{
      if(url!=null&&new URL(String(url),document.baseURI).origin!==location.origin)
        return original(state,title);
      return original(state,title,url);
    };
  }
  let sequence=0;const awaiting=new Map(),inFlight=new Map();
  function decodeInto(base64,target,offset){const raw=atob(base64);for(let i=0;i<raw.length;i++)target[offset+i]=raw.charCodeAt(i);return raw.length;}
  window.bpaAssetResult=packet=>{
    const pending=awaiting.get(packet.id);if(!pending)return;
    try {
      if(packet.error)throw Error(packet.error);
      // Compatibility with a previously installed host; new hosts use chunks.
      if(typeof packet.data==='string'){
        const raw=atob(packet.data),data=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
        awaiting.delete(packet.id);pending.resolve(data);return;
      }
      if(!Number.isInteger(packet.total)||packet.total<0||packet.total>100000000||packet.offset!==(pending.offset||0)||typeof packet.chunk!=='string'||packet.chunk.length>262144)throw Error('Invalid asset chunk');
      if(!pending.data){if(packet.offset!==0)throw Error('Missing asset start');pending.data=new Uint8Array(packet.total);pending.offset=0;}
      if(pending.data.length!==packet.total)throw Error('Changed asset size');
      const size=packet.chunk.length/4*3-(packet.chunk.endsWith('==')?2:packet.chunk.endsWith('=')?1:0);
      if(!Number.isInteger(size)||pending.offset+size>packet.total)throw Error('Asset chunk overflow');
      pending.offset+=decodeInto(packet.chunk,pending.data,pending.offset);
      if(packet.final){if(pending.offset!==packet.total)throw Error('Incomplete asset');awaiting.delete(packet.id);pending.resolve(pending.data);}
    }catch(error){awaiting.delete(packet.id);pending.reject(error);}
  };
  function assetPath(value){const url=new URL(typeof value==='string'?value:value.url,document.baseURI);if(url.hostname!=='bpa.local')return null;return decodeURIComponent(url.pathname).replace(/^\//,'');}
  window.bpaReadAsset=path=>{
    if(inFlight.has(path))return inFlight.get(path);
    const promise=new Promise((resolve,reject)=>{const id=++sequence;awaiting.set(id,{resolve,reject});window.dispatchEvent(new CustomEvent('bpa-asset-request',{detail:{id,path}}));});
    inFlight.set(path,promise);promise.then(()=>inFlight.delete(path),()=>inFlight.delete(path));return promise;
  };
  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,options)=>{
    const path=assetPath(input);if(path===null)return originalFetch(input,options);
    const data=await window.bpaReadAsset(path);
    return new Response(data,{status:200,headers:{'Content-Type':path.endsWith('.wasm')?'application/wasm':'application/octet-stream'}});
  };
  const NativeXHR=window.XMLHttpRequest;
  class LocalXHR extends EventTarget {
    constructor(){super();this.readyState=0;this.status=0;this.responseType='';this.onload=null;this.onerror=null;this.onreadystatechange=null;this.onprogress=null;this.withCredentials=false;this.timeout=0;}
    open(method,url,async=true){this._method=method;this._url=url;this._async=async;this.readyState=1;this._notify('readystatechange');}
    setRequestHeader(){}
    getAllResponseHeaders(){return 'content-type: application/octet-stream\r\n';}
    getResponseHeader(name){return name.toLowerCase()==='content-type'?'application/octet-stream':null;}
    overrideMimeType(){}
    _notify(type){const event=new Event(type);if(typeof this['on'+type]==='function')this['on'+type](event);this.dispatchEvent(event);}
    abort(){this._aborted=true;this._notify('abort');}
    send(body){
      const path=assetPath(this._url);
      if(path===null){const xhr=new NativeXHR();xhr.open(this._method,this._url,this._async);xhr.responseType=this.responseType;for(const type of ['load','error','readystatechange','progress','abort','timeout'])xhr.addEventListener(type,event=>{this.readyState=xhr.readyState;this.status=xhr.status;this.response=xhr.response;if(xhr.responseType===''||xhr.responseType==='text')this.responseText=xhr.responseText;this._notify(type);});xhr.send(body);return;}
      window.bpaReadAsset(path).then(data=>{if(this._aborted)return;this.readyState=4;this.status=200;this.responseURL=new URL(this._url,document.baseURI).toString();this.response=this.responseType==='arraybuffer'?data.buffer:this.responseType==='blob'?new Blob([data]):new TextDecoder().decode(data);if(this.responseType===''||this.responseType==='text')this.responseText=this.response;this._notify('readystatechange');this._notify('load');this._notify('loadend');}).catch(error=>{this.readyState=4;this.status=404;this._notify('error');this._notify('loadend');});
    }
  }
  window.XMLHttpRequest=LocalXHR;
})();
