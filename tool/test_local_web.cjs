// Browser QA of the local loader, not a Scriptable/iPhone functional test.
const fs=require('fs'),path=require('path'),vm=require('vm'),http=require('http');
async function main(){
  const root=path.resolve('build/web'),files=[];
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);entry.isDirectory()?walk(file):files.push(path.relative(root,file).replaceAll('\\','/'));}}walk(root);
  const fakeFM={readString:p=>fs.readFileSync(p,'utf8'),joinPath:(a,b)=>path.join(a,b)};
  const ctx=vm.createContext({module:{exports:{}},FileManager:{local:()=>fakeFM},console});
  vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),ctx);ctx.bundle={path:root,files};
  const html=vm.runInContext('localAppHTML(bundle)',ctx);
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {chromium}=require(path.join(process.env.BPA_QA_NODE_MODULES,'playwright'));
  const browser=await chromium.launch({headless:true,executablePath:process.env.BPA_QA_CHROME||'/usr/bin/google-chrome',args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[],assetRequests=[],messages=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>messages.push(m.type()+': '+m.text()));
  fs.mkdirSync('build/qa',{recursive:true});
  await page.exposeFunction('readAsset',async request=>{
    if(!files.includes(request.path))return {id:request.id,error:'Unknown local asset '+request.path};
    assetRequests.push(request.path);return {id:request.id,data:fs.readFileSync(path.join(root,request.path)).toString('base64')};
  });
  await page.addInitScript(()=>{
    window.addEventListener('bpa-asset-request',async event=>{const result=await window.readAsset(event.detail);window.bpaAssetResult(result);});
    window.addEventListener('bpa-platform-call',event=>{
      const call=JSON.parse(event.detail),method=call.method;
      const result=method==='versionCode'?51:method==='versionName'?'cooc.1.6':method==='hasBoundCard'?false:method==='installStatus'?'idle':method==='status'?{lastSuccessAtMillis:0}:null;
      window.dispatchEvent(new CustomEvent('bpa-platform-result',{detail:JSON.stringify({id:call.id,result})}));
    });
  });
  let failure=null;
  try {
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
    await page.evaluate(()=>window.bpaHost.init({}));
    await page.waitForSelector('flutter-view',{timeout:30000});
    // Flutter puts its CanvasKit canvas inside shadow DOM.
    await page.waitForSelector('canvas',{timeout:30000});
    await page.waitForTimeout(2500);
  } catch(error){failure=error.message;}
  await page.screenshot({path:'build/qa/local-loader-login.png'});
  fs.writeFileSync('build/qa/local-loader.json',JSON.stringify({platform:'Chromium, 390x844 viewport; not iPhone',errors,messages,assetRequests,failure,canvases:await page.locator('canvas').count()},null,2));
  console.log(JSON.stringify({errors,messages,assetRequests,failure}));
  await browser.close();await new Promise(resolve=>server.close(resolve));
  if(failure)throw Error(failure);
  if(errors.length)throw Error(errors.join('\n'));
  if(!assetRequests.some(p=>p.endsWith('canvaskit.wasm')))throw Error('CanvasKit local WASM did not load');
  console.log('Local Flutter loader rendered. iPhone and Scriptable remain unverified.');
}
main().catch(error=>{console.error(error);process.exit(1);});
