// Geometry ported from schedule_widget/overview_widget and Widget2BitmapRenderer.
// Browser output is a bitmap. Home Screen animation parity remains BLOCKED.
async function renderWidget(p) {
  const w=340,h=p.kind==='small'?104:150,s=h/150,c=document.createElement('canvas');c.width=w*2;c.height=h*2;
  const ctx=c.getContext('2d');ctx.scale(2,2);
  const t=p.theme||{},config=t.widgetConfig?JSON.parse(t.widgetConfig):{};
  const color=(n,fallback)=>typeof n==='number'?'#'+(n>>>0).toString(16).padStart(8,'0').slice(2):fallback;
  const start=color(t.widgetStart,'#1747b5'),end=color(t.widgetEnd,'#4c79d8'),text=color(t.widgetText,'#ffffff'),sub=color(t.widgetSubtext,'#e2edff');
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
  async function photo(url,x,y,width,height){if(!url)return;const img=new Image();img.src=url;await img.decode();const scale=Math.min(width/img.width,height/img.height);ctx.drawImage(img,x+(width-img.width*scale)/2,y+(height-img.height*scale)/2,img.width*scale,img.height*scale);}
  const images={classic:'macdinh.png',lol:'lol.jpg',valorant:'vlr.jpg',minecraft:'minecraft.jpg',facebook:'facebooj.png',shopee:'shoppee.png',tiktok:'tiktok.png',ben10:'ben10.png.webp',youtube:'ytb.png',steam:'steam.png'};
  if(t.theme==='tien_mon_premium'){const now=new Date(),minutes=now.getHours()*60+now.getMinutes();images.tien_mon_premium=minutes>=990&&minutes<1110?'tinemon-trua.png':minutes>=1110||minutes<300?'tienmon-toi.png':'tienmon-sang.png';}
  if(p.kind==='overview')await photo(p.largeImagePath,0,0,w,h);
  if(p.kind==='widget2')await photo(p.widget2ImagePath||(images[t.theme||'classic']?'widget-assets/widget2_themes/'+images[t.theme||'classic']:null),w-108,0,108,h);
  const icons={},iconNames={calendar:'ic_widget_calendar',sync:'ic_widget_reload',mode:'ic_widget_bell',previous:'ic_widget_up',next:'ic_widget_down'};
  for(const [name,file]of Object.entries(iconNames)){const img=new Image();img.src=p.icons&&p.icons[name]||'widget-assets/icons/'+file+'.svg';await img.decode();icons[name]=img;}
  const icon=(name,x,y,size=18)=>{if(icons[name])ctx.drawImage(icons[name],x,y,size,size);};
  const hits=[];
  const hit=(action,x,y,width,height)=>hits.push({action,x,y,width,height});
  const time=r=>r.startAt.slice(11,16)+' – '+r.endAt.slice(11,16);
  const date=p.day.slice(8,10)+'/'+p.day.slice(5,7);
  const title=p.examMode?'Lịch thi':(p.day===new Date().toLocaleDateString('sv-SE')?'Hôm nay':'Ngày')+' · '+date;
  const accents=['#ffb547','#45d2b0','#5fa8ff','#a881ff','#ff78ae'];
  function glass(x,y,width,height,index,active=false){rounded(x+.5,y+.5,width-1,height-1,height*.25,`rgba(255,255,255,${(config.glassOpacity||.58)*.25})`,active?accents[index]:'rgba(255,255,255,.30)',1);}
  if(p.kind==='widget2') {
    const right=218,left=8,top=7,cardsTop=32,gap=2.6,ch=(h-cardsTop-7-gap*4)/5;
    line(title,text,left,top,right-left-6,25,14,true);
    if(!p.items.length){glass(left,cardsTop,right-left-6,h-cardsTop-7,0);line(p.examMode?'Không có lịch thi':'Không có lịch học',text,left+9,cardsTop+25,right-left-24,55,12,true,2);}
    else for(let i=0;i<5;i++){const y=cardsTop+i*(ch+gap);glass(left,y,right-left-6,ch,i,i===0);const r=p.items[i];if(!r)continue;rounded(left,y+2,3,ch-4,2,accents[i]);line(r.subjectName,text,left+7,y+1.3,right-left-18,ch-8.2,9.5,true,2);line([time(r),r.room,p.examMode?r.examForm:''].filter(Boolean).join(' · '),sub,left+7,y+ch-9,right-left-18,8.2,6.7);}
    icon('previous',w-120,40,18);icon('next',w-120,78,18);hit('previous',w-120,37,28,38);hit('next',w-120,75,28,38);
    ['calendar','sync','mode'].forEach((name,i)=>{icon(name,w-96+i*28,122,16);hit(name,w-96+i*28,116,28,34);});
  } else if(p.kind==='small') {
    const r=p.items[0];
    if(r){line(r.subjectName,text,18,14,w-110,43,18,true,2);line(r.room,sub,18,65,w-170,20,12);line(time(r),sub,174,65,106,20,12);}
    else line(p.examMode?'Không có lịch thi':'Không có lịch học',text,18,36,w-100,36,14,true,2);
    ['calendar','sync','mode'].forEach((name,i)=>{icon(name,w-31,i*h/3+8,18);hit(name,w-44,i*h/3,44,h/3);});
    icon('previous',270,12,14);icon('next',270,78,14);hit('previous',264,0,32,35);hit('next',264,69,32,35);
    hit('open',0,0,264,h);
  } else {
    line(title,text,12,8,220,20,14,true);line(`${p.count} ${p.examMode?'ca thi':'môn học'}`,sub,12,26,220,14,10);
    ['calendar','sync','mode'].forEach((name,i)=>{icon(name,w-90+i*27,12,18);hit(name,w-94+i*28,0,28,32);});
    const gap=4,cardW=(w-24-3*gap)/4,cardH=82,y=45;
    for(let i=0;i<4;i++){const x=12+i*(cardW+gap),r=p.items[i];glass(x,y,cardW,cardH,i,i===0);if(!r)continue;line(r.startAt.slice(8,10)+'/'+r.startAt.slice(5,7),sub,x+7,y+5,cardW-12,11,9);line(r.startAt.slice(11,16),text,x+7,y+18,cardW-12,16,13,true);line(r.subjectName,text,x+7,y+36,cardW-12,28,10,true,2);line(r.room,sub,x+7,y+67,cardW-12,12,9);}
    line(String(p.index+1)+'–'+String(Math.min(p.index+4,p.count))+'/'+p.count,sub,125,133,90,15,10);
    icon('previous',16,130,15);icon('next',w-31,130,15);hit('previous',0,127,40,23);hit('next',w-40,127,40,23);
    ctx.fillStyle='rgba(255,255,255,.20)';ctx.fillRect(50,140,64,2);ctx.fillStyle=text;ctx.fillRect(50,140,p.count?64*Math.min(1,(p.index+4)/p.count):0,2);
  }
  const border=config[p.kind==='small'?'smallBorder':p.kind==='overview'?'largeBorder':'widget2Border'];
  if(border&&border.enabled){const bw=border.widthDp||1;rounded(bw/2,bw/2,w-bw,h-bw,Math.max(0,radius-bw/2),null,color(border.color,'#ffd66b'),bw);}
  ctx.restore();
  // Split into non-overlapping bands so Scriptable can assign exact hit URLs.
  const edges=[...new Set([0,h,...hits.flatMap(v=>[v.y,v.y+v.height])])].sort((a,b)=>a-b),hitBands=[];
  for(let i=0;i<edges.length-1;i++){const y=edges[i],height=edges[i+1]-y;const inside=hits.filter(v=>v.y<=y&&v.y+v.height>=y+height).sort((a,b)=>a.x-b.x);if(inside.length)hitBands.push({y,height,hits:inside.map(v=>({action:v.action,x:v.x,width:v.width}))});}
  return {png:c.toDataURL('image/png').split(',')[1],width:w,height:h,hitBands};
}
