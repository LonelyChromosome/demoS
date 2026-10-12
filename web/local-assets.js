// Offline resource transport for Flutter CanvasKit. No university credentials
// enter this protocol. Scriptable returns only files from BPA's local bundle.
(() => {
  if(!window.__BPA_LOCAL__)return;
  let sequence=0;const awaiting=new Map();
  const bytes=b64=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  window.bpaAssetResult=packet=>{const pending=awaiting.get(packet.id);if(!pending)return;awaiting.delete(packet.id);packet.error?pending.reject(new Error(packet.error)):pending.resolve(bytes(packet.data));};
  function assetPath(value){const url=new URL(typeof value==='string'?value:value.url,document.baseURI);if(url.hostname!=='bpa.local')return null;return decodeURIComponent(url.pathname).replace(/^\//,'');}
  window.bpaReadAsset=path=>new Promise((resolve,reject)=>{const id=++sequence;awaiting.set(id,{resolve,reject});window.dispatchEvent(new CustomEvent('bpa-asset-request',{detail:{id,path}}));});
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
