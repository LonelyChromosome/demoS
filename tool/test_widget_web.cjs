const fs=require('fs'),path=require('path');
module.exports=async function testWidgets(browser,root,qaDir){
 const page=await browser.newPage({viewport:{width:340,height:158},deviceScaleFactor:2}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>errors.push(r.url()+': '+r.failure()?.errorText));
 await page.route('https://bpa-widget.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.slice(1),file=path.join(root,name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
  const ext=path.extname(file),types={'.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ttf':'font/ttf'};
  return route.fulfill({body:fs.readFileSync(file),contentType:types[ext]||'application/octet-stream'});
 });
 await page.setContent('<base href="https://bpa-widget.test/"><style>body{margin:0;background:#111827}</style>');
 await page.addScriptTag({content:fs.readFileSync('web/widget-palette.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('web/widget-renderer.js','utf8')});
 const rows=Array.from({length:5},(_,i)=>({id:'qa-'+i,subjectName:['Cơ sở dữ liệu','Lập trình hướng đối tượng','Toán rời rạc','Mạng máy tính','Phân tích và thiết kế'][i],room:'A'+(101+i),examForm:'Trắc nghiệm trên máy',startAt:'2026-10-13T'+String(8+i*2).padStart(2,'0')+':00:00',endAt:'2026-10-13T'+String(9+i*2).padStart(2,'0')+':30:00'})),results=[];
 for(const kind of ['small','overview','widget2'])for(const key of ['classic','tien_mon_premium','custom'])for(const empty of [false,true]){
  const p={kind,day:'2026-10-13',examMode:empty,index:0,count:empty?0:5,items:empty?[]:rows.slice(0,kind==='small'?1:kind==='overview'?4:5),theme:{theme:key,widgetStart:key==='custom'?0xffdddddd:0xff173a8e,widgetEnd:0xff234b71,widgetText:key==='custom'?0xff111111:0xffffffff,widgetSubtext:key==='custom'?0xff222222:0xffddedff}};
  if(key==='tien_mon_premium'){p.theme.fontFamily='FzCoTrang';if(kind==='overview'){p.largeImagePath='assets/assets/tien_mon_premium/widget_overview/wid_sang.png';p.premiumScenic=true;}}
  const output=await page.evaluate(async p=>{const v=await renderWidget(p);document.body.innerHTML='<img style="width:340px;height:158px" src="data:image/png;base64,'+v.png+'">';const image=document.querySelector('img');await image.decode();const canvas=document.createElement('canvas');canvas.width=340;canvas.height=158;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,340,158);return {...v,topAlpha:ctx.getImageData(170,0,1,1).data[3],png:undefined};},p);
  if(output.width!==340||output.height!==158)throw Error('Widget frame changed aspect ratio');
  if(['small','overview'].includes(kind)&&output.topAlpha!==0)throw Error('Bottom-aligned panel has an opaque outer frame');
  for(const band of output.hitBands){if(band.y<0||band.y+band.height>158)throw Error('Hit band escapes widget');for(let i=1;i<band.hits.length;i++)if(band.hits[i].x<band.hits[i-1].x+band.hits[i-1].width)throw Error('Widget click targets overlap');}
  await page.screenshot({path:path.join(qaDir,'widget-'+kind+'-'+key+(empty?'-empty':'')+'.png')});results.push({kind,theme:key,empty,...output});
 }
 fs.writeFileSync(path.join(qaDir,'widgets.json'),JSON.stringify({errors,results,platform:'Browser renderer; not iPhone Home Screen validation'},null,2));
 await page.close();if(errors.length)throw Error(errors.join('\n'));console.log('18 widget render cases passed; Home Screen interaction unverified.');
};
