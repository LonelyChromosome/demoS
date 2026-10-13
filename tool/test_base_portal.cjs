// Exercise the actual portal adapter and sandboxed calendar overlay in browsers.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=async function(browser,url,dir){
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,timezoneId:'Asia/Ho_Chi_Minh'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const c=vm.createContext({module:{exports:{}}});vm.runInContext(fs.readFileSync('scriptable/base/sync.js','utf8'),c);const sync=c.module.exports,runtime=require('../scriptable/base/runtime');
 let ui=fs.readFileSync('scriptable/base/ui.html','utf8');ui=ui.replace('<style>',`<style>@font-face{font-family:Roboto;src:url(data:font/ttf;base64,${fs.readFileSync('scriptable/base/Roboto-Regular.ttf').toString('base64')})}`);
 try{
  await page.goto(url);await page.evaluate(()=>{
   document.querySelector('meta[name=viewport]').content='width=980';document.body.style.transform='scale(0.6)';document.body.style.transformOrigin='0 0';
   window.__portalInstance='live-same-page';window.__portalCalls=[];window.__portalFail=false;
   window.edu={system:{tokenJWT:'QA-local-token',userId:'student',iM:'mode',appId:'',strChucNang_Id:'',makeRequest(options){
    if(this!==window.edu.system||window.__portalInstance!=='live-same-page')throw Error('Portal context replaced');const func=options.data.func;window.__portalCalls.push(func);
    setTimeout(()=>{if(window.__portalFail){options.error();return;}let Data;if(func.includes('LayThoiGian'))Data=[{ID:'term',THOIGIAN:'2026_2027_1'}];else if(func.includes('LayDSKeHoach'))Data=[{ID:'plan',MAKEHOACH:'2026_2027_1',DAOTAO_THOIGIANDAOTAO_ID:'term'}];else if(func.includes('LayKetQuaDangKy'))Data=[{DANGKY_KEHOACHDANGKY_ID:'plan',DAOTAO_THOIGIANDAOTAO_ID:'term',DAOTAO_HOCPHAN_ID:'subject',DAOTAO_HOCPHAN_TEN:'Môn Cơ sở dữ liệu',DANGKY_LOPHOCPHAN_ID:'class',DANGKY_LOPHOCPHAN_TEN:'N01',NGAYBATDAU:'01/09/2026',NGAYKETTHUC:'30/12/2026',QLSV_NGUOIHOC_HODEM:'Nguyễn',QLSV_NGUOIHOC_TEN:'QA'}];else Data=[{PHANLOAI:'LICHHOC',TENHOCPHAN:'Môn Cơ sở dữ liệu',NGAYHOC:'13/10/2026',GIOBATDAU:8,PHUTBATDAU:0,GIOKETTHUC:9,PHUTKETTHUC:30,TENLOPHOCPHAN:'N01',PHONGHOC_TEN:'A101'}];options.success({Success:true,Data});},1);
   }}};
  });
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const evaluate=async(_web,script,callback)=>{if(callback!==false)throw Error('Callback evaluation is forbidden');return page.evaluate(source=>{if(typeof completion!=='undefined')throw Error('Unexpected completion global');return (0,eval)(source);},script);};
  const first=await sync.fetch(null,evaluate,()=>{},()=>{},delay),snapshot={displayName:first.semester.displayName,syncedAt:first.semester.syncedAt,source:'qldt',records:first.semester.subjects.flatMap(s=>s.studySchedules)};
  await page.evaluate(source=>(0,eval)(source),runtime.portalOverlay(ui,'portal-qa-nonce',{snapshot,busy:false,message:'Đồng bộ thành công'}));
  const frame=page.frameLocator('#bpa-base-frame');await frame.getByRole('button',{name:'Theo ngày'}).waitFor();await frame.getByRole('button',{name:'Mở bảng điều khiển'}).click();await frame.getByRole('button',{name:'Hôm nay',exact:true}).click();
  await page.waitForFunction(()=>!!document.getElementById('bpa-base-frame'));
  await frame.locator('#dateLabel').click();await frame.locator('#pickedDate').fill('2026-10-13');await frame.getByRole('button',{name:'Chọn',exact:true}).click();await frame.locator('.card').first().waitFor();const layout=await frame.locator('.heading').evaluate(el=>({top:el.getBoundingClientRect().top,width:window.innerWidth,height:window.innerHeight}));if(layout.top<layout.height/8||layout.width!==390)throw Error('Incorrect overlay viewport or top gap: '+JSON.stringify(layout));
  const button=await frame.locator('#week').boundingBox();await page.mouse.click(button.x+button.width/2,button.y+button.height/2);await frame.locator('#week.active').waitFor();await frame.locator('#day').click();await frame.locator('.card').first().waitFor();await page.screenshot({path:dir+'/portal-overlay-calendar.png'});
  await frame.getByRole('button',{name:'Mở bảng điều khiển'}).click();await frame.getByRole('button',{name:'Đồng bộ',exact:true}).click();
  await page.waitForFunction(()=>window.bpaBaseNative!=null);let commands=[];for(let i=0;i<20&&!commands.length;i++){commands=JSON.parse(await evaluate(null,'bpaBaseNative.drain();',false));if(!commands.length)await page.waitForTimeout(20);}if(commands.length!==1||commands[0].action!=='sync')throw Error('Overlay sync did not reach live parent queue');
  const refreshed=await sync.fetch(null,evaluate,()=>{},()=>{},delay);if(refreshed.semester.subjects[0].studySchedules.length!==1)throw Error('Live-context refresh failed');
  const alive=await page.evaluate(()=>window.__portalInstance==='live-same-page'&&typeof edu.system.makeRequest==='function');if(!alive)throw Error('Login page was destroyed');
  await page.evaluate(()=>window.__portalFail=true);let failed=false;try{await sync.fetch(null,evaluate,()=>{},()=>{},delay);}catch(error){failed=error.code==='NETWORK_ERROR';}if(!failed)throw Error('Portal API error accepted as successful calendar');
  await evaluate(null,runtime.portalOverlay(ui,'portal-qa-nonce',{snapshot,busy:false,message:'QLĐT chưa trả dữ liệu',error:true}),false);await frame.locator('#status').filter({hasText:'QLĐT chưa trả dữ liệu'}).waitFor();if(await frame.locator('.card').count()!==1)throw Error('Failed portal refresh discarded the calendar');await page.screenshot({path:dir+'/portal-error-preserves-calendar.png'});
  if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(dir+'/portal-session.json',JSON.stringify({errors,loginPageAlive:alive,refreshCommands:commands.length,records:1,networkErrorPreservesCalendar:true,usesOriginalMakeRequest:true,callbackFree:true,hostBodyTransformIgnored:true,layout,coordinateTap:true,note:'Real browser with synthetic portal responses; actual iPhone session remains a hardware test'},null,2));
 }catch(error){await page.screenshot({path:dir+'/portal-failure.png'});throw error;}finally{await page.close();}
};
