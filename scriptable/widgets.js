// Widget state and real deep-link actions; iOS owns timeline refresh timing.
function actionURL(action,kind,id,extra={}) {
  const params={scriptName:'BPA',action,kind,instance:id,...extra};
  return 'scriptable:///run?'+Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');
}
function widgetRows(data,selection,kind,now=new Date()) {
  const rows=selection.mode==='exam'?data.exams||[]:data.classes||[];
  const today=isoDay(now);
  return rows.filter(r=>selection.mode==='exam'?r.startAt.slice(0,10)>=today:r.startAt.slice(0,10)===selection.day).sort((a,b)=>a.startAt.localeCompare(b.startAt)||String(a.id).localeCompare(String(b.id)));
}
// Android WidgetTimeline.withCalendarDays + arrange, including empty days.
function smallWidgetCollection(data,selection,now=new Date()) {
  if(selection.mode==='exam')return {items:widgetRows(data,selection,'small',now),selectedIndex:0};
  const byDay=new Map(),chosen=new Date(selection.day+'T00:00:00');
  let first=addDays(chosen,-1),last=addDays(chosen,1);
  for(const row of data.classes||[]) {
    const day=row.startAt.slice(0,10),date=new Date(day+'T00:00:00');
    if(date<first)first=date;if(date>last)last=date;
    if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(row);
  }
  const items=[];
  for(let day=first,count=0;day<=last&&count<370;day=addDays(day,1),count++) {
    const key=isoDay(day),rows=byDay.get(key);
    if(rows)items.push(...rows);
    else items.push({id:'empty-day-'+key,subjectName:'Không có lịch học',room:key===isoDay(now)?'Hôm nay • '+key.slice(8,10)+'/'+key.slice(5,7):key.slice(8,10)+'/'+key.slice(5,7),startAt:key+'T00:00:00',endAt:key+'T23:59:59',emptyDay:true});
  }
  items.sort((a,b)=>a.startAt.localeCompare(b.startAt)||String(a.id).localeCompare(String(b.id)));
  const indices=items.map((r,i)=>r.startAt.slice(0,10)===selection.day?i:-1).filter(i=>i>=0);
  const selectedIndex=selection.day===isoDay(now)?indices.find(i=>items[i].endAt.slice(0,19)>=localISO(now))??indices.at(-1)??0:indices[0]??0;
  return {items,selectedIndex};
}
function navigateWidget(selection,rows,kind,direction) {
  const count=kind==='overview'?4:kind==='widget2'?5:1;
  const last=Math.max(0,rows.length-count), index=Math.max(0,Math.min(selection.index||0,last));
  if(kind==='small'&&rows.length)return {...selection,index:Math.max(0,Math.min(index+direction,last))};
  if(kind==='overview'&&direction>0&&index<last)return {...selection,index:last};
  if(kind==='overview'&&direction<0&&index>0)return {...selection,index:0};
  if(selection.mode==='exam')return {...selection,index:Math.max(0,Math.min(index+direction*count,last))};
  const day=new Date(selection.day+'T00:00:00');day.setDate(day.getDate()+direction);
  const dates=(snapshot().classes||[]).map(r=>r.startAt.slice(0,10)).sort();
  const chosen=isoDay(day);
  if(dates.length&&(chosen<dates[0]||chosen>dates[dates.length-1]))return selection;
  return {...selection,day:chosen,index:0};
}
async function widgetAction(action,kind,id,params) {
  let selection=widgetSelection(kind,id);const collection=kind==='small'?smallWidgetCollection(snapshot(),selection):null,rows=collection?collection.items:widgetRows(snapshot(),selection,kind);
  if(collection&&!selection.manualPosition)selection={...selection,index:collection.selectedIndex};
  writeState('last-widget.json',{kind,id});
  if(action==='previous'||action==='next')setWidgetSelection(kind,id,{...navigateWidget(selection,rows,kind,action==='previous'?-1:1),manualPosition:kind==='small'});
  else if(action==='mode')setWidgetSelection(kind,id,{...selection,mode:selection.mode==='exam'?'study':'exam',index:0,manualPosition:false});
  else if(action==='calendar') {
    writeState('pending-action.json',{kind,action:'calendar',day:selection.day});await openOriginalApp();return;
  } else if(action==='sync') {
    writeState('pending-action.json',{kind,action:'sync'});await openOriginalApp();return;
  } else {writeState('pending-action.json',{kind,action:'open'});await openOriginalApp();return;}
  // No preview sheet masquerading as a Home Screen update. The new selection
  // is committed; actual launcher refresh behavior still needs device tests.
}
async function renderBPAWidget(kind,id,preview=false) {
  if(!['small','overview','widget2'].includes(kind))throw errorCode('widget_kind','Loại widget không hợp lệ.');
  const family=config.widgetFamily||'medium';
  if(family==='small')throw errorCode('widget_tap_limit','Widget iOS cỡ small chỉ có một vùng bấm. Chưa tái hiện được toàn bộ icon BPA trong kích thước này.');
  let state=widgetSelection(kind,id);const data=snapshot(),theme=readState('theme.json',{}),collection=kind==='small'?smallWidgetCollection(data,state):null,all=collection?collection.items:widgetRows(data,state,kind);
  if(collection&&!state.manualPosition)state={...state,index:collection.selectedIndex};
  const count=kind==='overview'?4:kind==='widget2'?5:1;
  const start=Math.max(0,Math.min(state.index||0,Math.max(0,all.length-count))),visible=all.slice(start,start+count);
  const payload={kind,day:state.day,examMode:state.mode==='exam',index:start,count:all.length,items:visible,theme,hostHeight:family==='large'?340:158};
  const configData=theme.widgetConfig?JSON.parse(theme.widgetConfig):{};
  for(const key of ['largeImagePath','widget2ImagePath']) {
    if(configData[key]&&bpaFM.fileExists(safeManagedPath(configData[key]))) {
      const data=bpaFM.read(safeManagedPath(configData[key]));
      payload[key]='data:image/'+configData[key].split('.').pop().toLowerCase()+';base64,'+data.toBase64String();
    }
  }
  if(theme.fontPath&&bpaFM.fileExists(safeManagedPath(theme.fontPath)))payload.fontData='data:font/ttf;base64,'+bpaFM.read(safeManagedPath(theme.fontPath)).toBase64String();
  const bundle=await ensureLocalBundle();
  const named={classic:'macdinh.png',lol:'lol.jpg',valorant:'vlr.jpg',minecraft:'minecraft.jpg',facebook:'facebooj.png',shopee:'shoppee.png',tiktok:'tiktok.png',ben10:'ben10.png.webp',youtube:'ytb.png',steam:'steam.png'};
  if(theme.theme==='tien_mon_premium'){const now=new Date(),minutes=now.getHours()*60+now.getMinutes();named.tien_mon_premium=minutes>=990&&minutes<1110?'tinemon-trua.png':minutes>=1110||minutes<300?'tienmon-toi.png':'tienmon-sang.png';}
  if(kind==='overview'&&theme.theme==='tien_mon_premium'&&!payload.largeImagePath) {
    const now=new Date(),minutes=now.getHours()*60+now.getMinutes();
    const name=minutes>=990&&minutes<1110?'wid_chieu.png':minutes>=1110||minutes<300?'w_toi.png':'wid_sang.png';
    const path=bpaFM.joinPath(bundle.path,'assets/assets/tien_mon_premium/widget_overview/'+name);
    payload.largeImagePath='data:image/png;base64,'+bpaFM.read(path).toBase64String();payload.premiumScenic=true;
  }
  if(kind==='widget2'&&!payload.widget2ImagePath&&named[theme.theme||'classic']) {
    const path=bpaFM.joinPath(bundle.path,'widget-assets/widget2_themes/'+named[theme.theme||'classic']);
    payload.widget2ImagePath='data:image/'+path.split('.').pop()+';base64,'+bpaFM.read(path).toBase64String();
  }
  if(!payload.fontData&&['FzCoTrang','MinecraftCustom'].includes(theme.fontFamily)) {
    const name=theme.fontFamily==='FzCoTrang'?'assets/assets/tien_mon_premium/fonts/FzCoTrang.ttf':'assets/assets/fonts/minecraft.ttf';
    payload.fontData='data:font/ttf;base64,'+bpaFM.read(bpaFM.joinPath(bundle.path,name)).toBase64String();
  }
  payload.icons={};
  for(const [name,file]of Object.entries({calendar:'ic_widget_calendar',sync:'ic_widget_reload',mode:state.mode==='exam'?'ic_widget_back':'ic_widget_bell',study:'ic_widget_study',previous:kind==='overview'?'ic_overview_chevron_left':'ic_widget_up',next:kind==='overview'?'ic_overview_chevron_right':'ic_widget_down'}))payload.icons[name]='data:image/svg+xml;base64,'+bpaFM.read(bpaFM.joinPath(bundle.path,'widget-assets/icons/'+file+'.svg')).toBase64String();
  const renderer=new WebView();
  const code=(bpaFM.readString(bpaFM.joinPath(bundle.path,'widget-palette.js'))+'\n'+bpaFM.readString(bpaFM.joinPath(bundle.path,'widget-renderer.js'))).replace(/<\/script/gi,'<\\/script');
  await renderer.loadHTML('<html><body><script>'+code+'</script></body></html>');
  const result=await renderer.evaluateJavaScript(`renderWidget(${JSON.stringify(payload)}).then(completion).catch(e=>completion({error:String(e)}));`,true);
  if(result.error)throw errorCode('widget_render',result.error);
  const image=Image.fromData(Data.fromBase64String(result.png));
  const widget=new ListWidget();widget.backgroundImage=image;widget.setPadding(0,0,0,0);widget.spacing=0;
  const h=family==='large'?340:158,w=340;
  let currentY=0;
  for(const band of result.hitBands) {
    const gap=Math.max(0,band.y-currentY);if(gap)widget.addSpacer(gap*h/result.height);
    const row=widget.addStack();row.layoutHorizontally();row.size=new Size(0,band.height*h/result.height);row.spacing=0;row.setPadding(0,0,0,0);
    let currentX=0;
    for(const hit of band.hits) {
      if(hit.x>currentX)row.addSpacer((hit.x-currentX)*w/result.width);
      const target=row.addStack();target.size=new Size(hit.width*w/result.width,band.height*h/result.height);target.url=actionURL(hit.action,kind,id);target.setPadding(0,0,0,0);target.addSpacer();currentX=hit.x+hit.width;
    }
    row.addSpacer();currentY=band.y+band.height;
  }
  widget.addSpacer();widget.url=actionURL('open',kind,id);
  widget.refreshAfterDate=new Date(Date.now()+15*60000);
  if(preview){if(family==='large')await widget.presentLarge();else await widget.presentMedium();}
  return widget;
}
