// Geometry ported from schedule_widget/overview_widget and Widget2BitmapRenderer.
// Browser output is a bitmap. Home Screen animation parity: CHƯA TÌM RA GIẢI PHÁP.
async function renderWidget(p) {
  const w=340,frameHeight=p.hostHeight||158,h=p.kind==='small'?104:p.kind==='overview'?Math.min(frameHeight,Math.max(104,Math.min(156,Math.floor(w*124/320)))):frameHeight,offset=frameHeight-h,c=document.createElement('canvas');c.width=w*2;c.height=frameHeight*2;
  const ctx=c.getContext('2d');ctx.scale(2,2);ctx.translate(0,offset);
  const t=p.theme||{},config=t.widgetConfig?JSON.parse(t.widgetConfig):{};
  const color=(n,fallback)=>typeof n==='number'?'#'+(n>>>0).toString(16).padStart(8,'0').slice(2):fallback;
  const textOverride=config[p.kind==='small'?'smallTextColor':p.kind==='overview'?'largeTextColor':'widget2TextColor'];
  const start=color(t.widgetStart,'#1747b5'),end=color(t.widgetEnd,'#4c79d8'),text=color(textOverride,color(t.widgetText,'#ffffff')),sub=color(t.widgetSubtext,'#e2edff');
  const raw=(n,f)=>typeof n==='number'?n>>>0:f;
  const palette=BPAWidgetPalette.make(raw(t.widgetStart,0xff1747b5),raw(t.widgetEnd,0xff4c79d8),raw(textOverride,raw(t.widgetText,0xffffffff)),raw(t.widgetSubtext,0xffe2edff),t.theme||'classic'),pc=BPAWidgetPalette.css;
  let font='Arial';
  const fontURL=p.fontData||(t.fontFamily==='FzCoTrang'?'assets/assets/tien_mon_premium/fonts/FzCoTrang.ttf':t.fontFamily==='MinecraftCustom'?'assets/assets/fonts/minecraft.ttf':null);
  if(fontURL){const face=new FontFace('BPAWidget',`url(${JSON.stringify(fontURL)})`);await face.load();document.fonts.add(face);font='BPAWidget';}
  const rounded=(x,y,w,h,r,fill,stroke=null,width=1)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}};
  const line=(a,b,x,y,width,height,size=10,bold=false,maxLines=1)=>{
    if(!a)return;
    const words=String(a).split(/\s+/);let lines=[],current='';
    ctx.font=`${bold?'700':'400'} ${size}px ${font}`;
    for(const word of words){const candidate=current?current+' '+word:word;if(ctx.measureText(candidate).width>width&&current){lines.push(current);current=word;}else current=candidate;}if(current)lines.push(current);
    if(lines.length>maxLines){lines=lines.slice(0,maxLines);while(ctx.measureText(lines[maxLines-1]+'…').width>width&&lines[maxLines-1].length)lines[maxLines-1]=lines[maxLines-1].slice(0,-1);lines[maxLines-1]+='…';}
    ctx.save();ctx.beginPath();ctx.rect(x,y,width,height);ctx.clip();ctx.fillStyle=b;ctx.textBaseline='top';lines.forEach((v,i)=>ctx.fillText(v,x,y+i*size*.98));ctx.restore();
  };
  const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,start);gradient.addColorStop(1,end);
  const radius=config.cornerRadiusDp==null?18:config.cornerRadiusDp;
  ctx.save();ctx.beginPath();ctx.roundRect(0,0,w,h,radius);ctx.clip();ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
  async function photo(url,x,y,width,height,cover=false){if(!url)return;const img=new Image();img.src=url;await img.decode();const scale=(cover?Math.max:Math.min)(width/img.width,height/img.height);ctx.drawImage(img,x+(width-img.width*scale)/2,y+(height-img.height*scale)/2,img.width*scale,img.height*scale);}
  const images={classic:'macdinh.png',lol:'lol.jpg',valorant:'vlr.jpg',minecraft:'minecraft.jpg',facebook:'facebooj.png',shopee:'shoppee.png',tiktok:'tiktok.png',ben10:'ben10.png.webp',youtube:'ytb.png',steam:'steam.png'};
  if(t.theme==='tien_mon_premium'){const now=new Date(),minutes=now.getHours()*60+now.getMinutes();images.tien_mon_premium=minutes>=990&&minutes<1110?'tinemon-trua.png':minutes>=1110||minutes<300?'tienmon-toi.png':'tienmon-sang.png';}
  if(p.kind==='overview'){if(t.theme!=='classic'&&t.theme!=='tien_mon_premium'){const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,pc(palette.backgroundStart));bg.addColorStop(.55,pc(BPAWidgetPalette.mix(palette.backgroundStart,palette.backgroundEnd,.48)));bg.addColorStop(1,pc(palette.backgroundEnd));ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);}else if(t.theme==='classic'){const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,start);bg.addColorStop(.52,pc(BPAWidgetPalette.mix(raw(t.widgetStart,0xff1747b5),0xff992c71,.48)));bg.addColorStop(1,'#992c71');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);}await photo(p.largeImagePath,0,0,w,h,p.premiumScenic===true);}
  if(p.kind==='widget2')await photo(p.widget2ImagePath||(images[t.theme||'classic']?'widget-assets/widget2_themes/'+images[t.theme||'classic']:null),w-108,0,108,h);
  const icons={},iconNames={calendar:'ic_widget_calendar',sync:'ic_widget_reload',mode:'ic_widget_bell',previous:'ic_widget_up',next:'ic_widget_down',study:'ic_widget_study'};
  for(const [name,file]of Object.entries(iconNames)){const img=new Image();img.src=p.icons&&p.icons[name]||'widget-assets/icons/'+file+'.svg';await img.decode();icons[name]=img;}
  const icon=(name,x,y,size=18)=>{if(!icons[name])return;const layer=document.createElement('canvas');layer.width=layer.height=size*2;const brush=layer.getContext('2d');brush.drawImage(icons[name],0,0,size*2,size*2);brush.globalCompositeOperation='source-in';brush.fillStyle=color(t.widgetIcon,text);brush.fillRect(0,0,size*2,size*2);ctx.drawImage(layer,x,y,size,size);};
  const hits=[];
  const hit=(action,x,y,width,height)=>hits.push({action,x,y,width,height});
  const time=r=>r.emptyDay?'':r.startAt.slice(11,16)+' – '+r.endAt.slice(11,16);
  const date=p.day.slice(8,10)+'/'+p.day.slice(5,7);
  const title=p.examMode?'Lịch thi':(p.day===new Date().toLocaleDateString('sv-SE')?'Hôm nay':'Ngày')+' · '+date;
  const accents=['#ffb547','#45d2b0','#5fa8ff','#a881ff','#ff78ae'];
  function glass(x,y,width,height,index,active=false){
    if(p.kind==='overview') {
      if(t.theme==='classic'){const accents=[0xff0874ca,0xff334aa9,0xff7644b3,0xffad478e,0xffc24178],accent=accents[index%5],fill=ctx.createLinearGradient(x,y,x+width,y+height);fill.addColorStop(0,pc(BPAWidgetPalette.mix(accent,raw(t.widgetStart,0xff1747b5),.4)));fill.addColorStop(1,pc(accent));rounded(x,y,width,height,12*height/76,fill);return;}
      const premium=t.theme==='tien_mon_premium',edge=(active?premium?2.4:3:premium?1.6:2)*height/76,r=12*height/76;
      if(!premium)rounded(x,y,width,height,r+edge,pc(palette.glow(index,active)));
      const fill=ctx.createLinearGradient(x+edge,y+edge,x+width,y+height);
      fill.addColorStop(0,pc(premium?active?0xb0306758:0x96305f54:palette.cardStart(index,active)));fill.addColorStop(1,pc(premium?active?0xa2244f48:0x84244945:palette.cardEnd(index,active)));
      rounded(x+edge,y+edge,width-2*edge,height-2*edge,r,fill);
      const sheen=ctx.createLinearGradient(0,y+edge,0,y+height*(premium?.72:.68));sheen.addColorStop(0,pc(premium?0x2effffff:BPAWidgetPalette.alpha(raw(t.widgetText,0xffffffff),active?31:17)));sheen.addColorStop(1,'transparent');rounded(x+edge,y+edge,width-2*edge,height-2*edge,r,sheen,premium?pc(active?0xe6ffd66b:0xb8ffd66b):pc(palette.border(index,active)),(active?1.3:premium?.9:.8)*height/76);return;
    }
    const alpha=Math.max(35,Math.min(220,Math.trunc((config.glassOpacity??.58)*190))),fill=ctx.createLinearGradient(x,y,x+width,y+height);
    fill.addColorStop(0,pc(BPAWidgetPalette.alpha(BPAWidgetPalette.mix(raw(t.widgetStart,0xff1747b5),0xffffffff,active?.21:.12),alpha)));
    fill.addColorStop(1,pc(BPAWidgetPalette.alpha(BPAWidgetPalette.mix(raw(t.widgetEnd,0xff4c79d8),0xff000000,.08),Math.trunc(alpha*.76))));
    const borderWidth=Math.max(1,height*.035);rounded(x,y,width,height,height*.25,fill);rounded(x+borderWidth/2,y+borderWidth/2,width-borderWidth,height-borderWidth,Math.max(0,height*.25-borderWidth/2),null,pc(BPAWidgetPalette.alpha(active?parseInt(accents[index].slice(1),16):raw(t.widgetText,0xffffffff),active?175:75)),borderWidth);
  }
  if(p.kind==='widget2') {
    const right=218,left=8,top=7,cardsTop=32,gap=2.6,ch=(h-cardsTop-7-gap*4)/5;
    line(title,text,left,top,right-left-6,25,14,true);
    if(!p.items.length){glass(left,cardsTop,right-left-6,h-cardsTop-7,0);line(p.examMode?'Không có lịch thi':'Không có lịch học',text,left+9,cardsTop+25,right-left-24,55,12,true,2);}
    else for(let i=0;i<5;i++){const y=cardsTop+i*(ch+gap);glass(left,y,right-left-6,ch,i,i===0);const r=p.items[i];if(!r)continue;rounded(left,y+2,3,ch-4,2,accents[i]);line(r.subjectName,text,left+7,y+1.3,right-left-18,ch-8.2,9.5,true,2);line([time(r),r.room,p.examMode?r.examForm:''].filter(Boolean).join(' · '),sub,left+7,y+ch-9,right-left-18,8.2,6.7);}
    icon('previous',w-120,40,18);icon('next',w-120,78,18);hit('previous',w-120,37,28,38);hit('next',w-120,75,28,38);
    ['calendar','sync','mode'].forEach((name,i)=>{icon(name,w-96+i*28,122,16);hit(name,w-96+i*28,116,28,34);});
  } else if(p.kind==='small') {
    const r=p.items[0];
    if(r){line(r.subjectName,text,18,14,w-110,43,18,true,2);line(r.emptyDay?r.room:[r.room,r.startAt.slice(8,10)+'/'+r.startAt.slice(5,7)].filter(Boolean).join(' • '),sub,18,65,w-170,20,12);line(time(r),sub,174,65,106,20,12);}
    else line(p.examMode?'Không có lịch thi':'Không có lịch học',text,18,36,w-100,36,14,true,2);
    ['calendar','sync','mode'].forEach((name,i)=>{icon(name,w-31,i*h/3+8,18);hit(name,w-44,i*h/3,44,h/3);});
    icon('previous',270,12,14);icon('next',270,78,14);hit('previous',264,0,32,35);hit('next',264,69,32,35);
    hit('open',0,0,264,h);
  } else {
    const compact=h<120,top=compact?2:6,header=compact?32:h>=140?42:36,footer=compact?16:h>=140?24:20,cardH=h-(compact?4:10)-header-footer-5,y=top+header,slot=(w-24)/4,cardW=slot-4;
    icon('study',12,top+2,28);line(p.examMode?'Lịch thi · Học kỳ hiện tại':title,text,46,top+2,w-24-34-93,20,compact?14:16,true);line(`${p.count} ${p.examMode?'môn thi sắp tới':'môn học'}`,sub,46,top+22,w-24-34-93,14,compact?10:11);
    ['calendar','sync','mode'].forEach((name,i)=>{const x=w-12-93+i*31;icon(name,x+5,top+5,21);hit(name,x,top,31,header);});
    if(!p.items.length)line(p.examMode?'Không có lịch thi':'Không có lịch học',text,12,y+cardH/2-7,w-24,28,14,true,2);
    for(let i=0;i<p.items.length;i++){const x=12+i*slot,r=p.items[i],idx=p.index+i;glass(x,y,cardW,cardH,idx,i===0);let ty=y+8;
      if(p.examMode){line(r.startAt.slice(8,10)+'/'+r.startAt.slice(5,7),sub,x+8,ty,cardW-13,11,compact?9:10);ty+=11;}
      line(r.startAt.slice(11,16),pc(t.theme==='classic'||t.theme==='custom'?raw(textOverride,raw(t.widgetText,0xffffffff)):palette.time(idx,i===0)),x+8,ty,cardW-13,19,compact?13:17,true);ty+=compact?14:18;
      const words=r.subjectName.split(/\s+/).filter(v=>!['và','cho','của'].includes(v.toLowerCase())),acronym=words.map(v=>v[0]?.toUpperCase()||'').join('')||r.subjectName;
      const form=(r.examForm||r.className||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d'),tn=form.includes('trac nghiem'),tl=form.includes('tu luan');
      const subject=p.examMode?acronym+' ('+(tn&&tl?'TN+TL':tn?'TN':tl?'TL':'?')+')':slot<100&&r.subjectName.length>14?acronym:r.subjectName;
      line(subject,text,x+8,ty,cardW-13,22,compact?10:11,true,2);line((r.room||'').split(' • ')[0],sub,x+8,y+cardH-14,cardW-13,12,compact?9:10);hit('open',x,y,cardW,cardH);
    }
    const fy=h-(compact?2:4)-footer,cy=fy+footer/2;
    if(p.count){ctx.strokeStyle=t.theme==='tien_mon_premium'?'rgba(255,214,107,.8)':t.theme==='classic'?sub:pc(palette.trackStart);ctx.lineWidth=t.theme==='classic'?1.5:1.7;ctx.beginPath();ctx.moveTo(44,cy);ctx.lineTo(w-44,cy);ctx.stroke();
      const dots=[0xff12ccfa,0xff6578ff,0xffc375e8,0xfffa67ba,0xffff557c];for(let i=0;i<Math.min(p.items.length,5);i++){const dx=12+slot*(i+.5)-2,col=['classic','tien_mon_premium'].includes(t.theme)?dots[(p.index+i)%5]:palette.dot(p.index+i,BPAWidgetPalette.mix(palette.backgroundStart,palette.backgroundEnd,(i+.5)/4));if(i===0&&t.theme!=='classic'){ctx.strokeStyle=pc(BPAWidgetPalette.alpha(col,100));ctx.lineWidth=3.2;ctx.beginPath();ctx.arc(dx,cy,7,0,Math.PI*2);ctx.stroke();}ctx.fillStyle=pc(col);ctx.beginPath();ctx.arc(dx,cy,t.theme==='classic'?5:i===0?5.5:4.5,0,Math.PI*2);ctx.fill();}}
    icon('previous',26,fy+2,12);icon('next',w-38,fy+2,12);hit('previous',12,fy,40,footer);hit('next',w-52,fy,40,footer);
  }
  const border=config[p.kind==='small'?'smallBorder':p.kind==='overview'?'largeBorder':'widget2Border'];
  if(border&&border.enabled){const bw=border.widthDp||1;rounded(bw/2,bw/2,w-bw,h-bw,Math.max(0,radius-bw/2),null,color(border.color,'#ffd66b'),bw);}
  ctx.restore();
  // Split into non-overlapping bands so Scriptable can assign exact hit URLs.
  for(const v of hits)v.y+=offset;
  const edges=[...new Set([0,frameHeight,...hits.flatMap(v=>[v.y,v.y+v.height])])].sort((a,b)=>a-b),hitBands=[];
  for(let i=0;i<edges.length-1;i++){const y=edges[i],height=edges[i+1]-y;const inside=hits.filter(v=>v.y<=y&&v.y+v.height>=y+height).sort((a,b)=>a.x-b.x);if(inside.length)hitBands.push({y,height,hits:inside.map(v=>({action:v.action,x:v.x,width:v.width}))});}
  return {png:c.toDataURL('image/png').split(',')[1],width:w,height:frameHeight,panelHeight:h,hitBands};
}
