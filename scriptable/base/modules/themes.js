function create(ctx){
 const presets=JSON.parse(ctx.fm.readString(ctx.resource('scriptable/base/modules/theme-presets.json')));
 async function choose(title,options){const a=new Alert();a.title=title;for(const x of options)a.addAction(x);a.addCancelAction('Đóng');return await a.presentAlert();}
 function apply(theme){ctx.writeState('theme.json',theme);return theme;}
 async function handle(command={}){
  const n=await choose('Giao diện',['Chọn theme','Tạo từ màu','Ảnh nền trong app','Font riêng','Ảnh widget tổng quan','Ảnh Widget 2','Viền / độ trong widget','Xóa tùy chỉnh']);if(n<0)return;
  if(n===0){const keys=Object.keys(presets);const i=await choose('Chọn theme',keys.map(k=>presets[k].name));if(i<0)return;const key=keys[i];if(key==='tien_mon_premium'&&!ctx.installed('tienmon'))throw Error('Cài Tiên Môn trước.');apply({...presets[key],theme:key});}
  if(n===1){const a=new Alert();a.title='Tạo từ màu';a.addTextField('Màu chính #RRGGBB','#1747b5');a.addTextField('Màu nền #RRGGBB','#f2f6ff');a.addTextField('Màu chữ #RRGGBB','#102b73');a.addAction('Lưu');a.addCancelAction('Hủy');if(await a.presentAlert()<0)return;const colors=[0,1,2].map(i=>a.textFieldValue(i).trim());if(colors.some(c=>!/^#[0-9a-f]{6}$/i.test(c)))throw Error('Nhập màu theo #RRGGBB.');const [primary,page,text]=colors.map(c=>(0xff000000|parseInt(c.slice(1),16))>>>0);apply({...presets.classic,theme:'custom',primary,pageStart:page,pageEnd:page,textPrimary:text,textSecondary:text,widgetStart:primary,widgetEnd:page,widgetText:text,widgetSubtext:text});}
  if([2,3,4,5].includes(n)){const file=await ctx.pickManaged(n===3?'font':'image');if(!file)return;if(file.size>8000000)throw Error('Tệp tối đa 8 MB.');const t=ctx.readState('theme.json',{});if(n===2)t.backgroundPath=file.path;if(n===3)t.fontPath=file.path;if(n>=4){const config=JSON.parse(t.widgetConfig||'{}');config[n===4?'largeImagePath':'widget2ImagePath']=file.path;t.widgetConfig=JSON.stringify(config);}apply(t);}
  if(n===6){const t=ctx.readState('theme.json',{}),c=JSON.parse(t.widgetConfig||'{}'),a=new Alert();a.title='Widget';a.addTextField('Độ trong 0–1',String(c.glassOpacity??.58));a.addTextField('Độ bo góc 0–40',String(c.cornerRadiusDp??18));a.addTextField('Viền #RRGGBB','#ffd66b');a.addAction('Lưu');a.addCancelAction('Hủy');if(await a.presentAlert()<0)return;const opacity=Number(a.textFieldValue(0)),radius=Number(a.textFieldValue(1)),color=a.textFieldValue(2);if(!(opacity>=0&&opacity<=1&&radius>=0&&radius<=40&&/^#[0-9a-f]{6}$/i.test(color)))throw Error('Thông số widget không hợp lệ.');const border={enabled:true,color:(0xff000000|parseInt(color.slice(1),16))>>>0,widthDp:1,tienMonStyle:t.theme==='tien_mon_premium'};apply({...t,widgetConfig:JSON.stringify({...c,glassOpacity:opacity,cornerRadiusDp:radius,smallBorder:border,largeBorder:border,widget2Border:border})});}
  if(n===7)apply({...presets.classic,theme:'classic'});
 }
 return {handle};
}
module.exports={create};
