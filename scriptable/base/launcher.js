// Variables used by Scriptable.
// icon-color: deep-blue; icon-glyph: calendar-alt;
// BPA cooc 1.0 base. Additional features are not initialized by this installer.
const BASE_RELEASE=__RELEASE__;
const BASE_FILES=__FILES__;
__HASH__
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
