const fs=require('node:fs'),crypto=require('node:crypto');
module.exports=async function testBootstrap(page,url,dir){
 await page.goto(url,{waitUntil:'load'});
 await page.getByRole('button',{name:'Hủy',exact:true}).waitFor({state:'visible'});
 const checks=[];
 for(const size of [0,256,8*1024*1024]){
  const bytes=Buffer.alloc(size);for(let i=0;i<size;i++)bytes[i]=(i*131+17)%256;
  const expected=crypto.createHash('sha256').update(bytes).digest('hex');
  const actual=await page.evaluate(async base64=>{const start=performance.now(),result=await window.bpaIntegrity.digest(base64);return {...result,elapsedMs:performance.now()-start};},bytes.toString('base64'));
  if(actual.size!==size||actual.sha256!==expected)throw Error('Bootstrap native binary integrity mismatch');
  checks.push(actual);
 }
 await page.evaluate(()=>{window.__cancelResult=null;window.bpaBootstrap.waitCancel(value=>window.__cancelResult=value);window.bpaBootstrap.update({status:'Đang tải tài nguyên BPA…',detail:'64,0 / 128,3 MB · 48/96 phần',bytes:64000000,total:128277994});});
 await page.screenshot({path:dir+'/startup-progress.png'});
 await page.getByRole('button',{name:'Hủy',exact:true}).click();
 if(!(await page.evaluate(()=>window.__cancelResult?.cancelled)))throw Error('Bootstrap cancellation callback did not run');
 fs.writeFileSync(dir+'/startup-integrity.json',JSON.stringify({checks,cancelled:true,note:'Real desktop browser Web Crypto, not an iPhone measurement'},null,2));
};
