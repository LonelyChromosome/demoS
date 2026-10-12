// Direct algorithm port of Android WidgetVisualPalette.kt; ARGB input/output.
const BPAWidgetPalette=(()=>{
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rgb=(r,g,b)=>(0xff000000|(Math.round(r)<<16)|(Math.round(g)<<8)|Math.round(b))>>>0;
 const channels=c=>[(c>>>16)&255,(c>>>8)&255,c&255];
 const mix=(a,b,t)=>{t=clamp(t,0,1);const x=channels(a),y=channels(b);return rgb(...x.map((v,i)=>v*(1-t)+y[i]*t));};
 const alpha=(c,a)=>(((clamp(Math.round(a),0,255)<<24)|(c&0xffffff))>>>0);
 const luminance=c=>channels(c).map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
 const hsv=c=>{const [r,g,b]=channels(c).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;if(d)h=(max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60;return [(h+360)%360,max===0?0:d/max,max];};
 const fromHSV=([h,s,v])=>{const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c,parts=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return rgb(...parts.map(n=>(n+m)*255));};
 const css=c=>{const [r,g,b]=channels(c);return `rgba(${r},${g},${b},${(c>>>24)/255})`;};
 function make(start,end,text,sub,key='classic'){
  const light=luminance(text)>.5,dominant=mix(start,end,.28),a=hsv(start),b=hsv(end),anchor=a[1]>=b[1]?a[0]:b[0];
  const accents=Array.from({length:5},(_,i)=>{const h=hsv(mix(start,end,i/4));const vibe={minecraft:96,ben10:96,lol:43,valorant:355,youtube:355,steam:203,facebook:214,tien_mon_premium:158};h[0]=((key==='tiktok'?(i%2===0?182:331):vibe[key]??(h[1]<.12?anchor:h[0]))+(i-2)*8+360)%360;h[1]=clamp(h[1]*.72+.20,.29,.76);h[2]=clamp(h[2],light?.56:.32,light?.89:.72);return fromHSV(h);});
  const accent=i=>accents[((i%5)+5)%5],surface=mix(dominant,light?0xff000000:0xffffffff,light?.29:.31);
  const readable=c=>{for(let i=0;i<8&&contrast(text,c)<4.7;i++)c=mix(c,light?0xff000000:0xffffffff,.16);return c;};
  const corner=(c,vibrant)=>{const h=hsv(c);if(h[1]<.12)h[0]=anchor;h[1]=clamp(h[1]*(vibrant?1.25:.96),vibrant?.48:.34,vibrant?.86:.78);h[2]=light?clamp(h[2]*(vibrant?1.16:.66),vibrant?.44:.23,vibrant?.68:.39):clamp(h[2]*(vibrant?1.08:.82),vibrant?.88:.72,vibrant?.99:.84);let r=fromHSV(h);for(let i=0;i<8&&contrast(text,r)<4.5;i++)r=mix(r,light?0xff000000:0xffffffff,.14);return r;};
  const cardStart=(i,active)=>readable(mix(surface,accent(i),active?.43:.31)),cardEnd=(i,active)=>readable(mix(surface,accent(i),active?.26:.17));
  return {accent,backgroundStart:corner(start,true),backgroundEnd:corner(end,false),cardStart,cardEnd,
   border:(i,active)=>alpha(mix(accent(i),text,active?.46:.26),active?155:75),glow:(i,active)=>alpha(accent(i),active?89:35),
   time:(i,active)=>{const c=mix(text,accent(i),active?.22:.12);return contrast(c,cardStart(i,active))>=4.5?c:text;},
   trackStart:alpha(mix(text,accent(0),.35),125),trackEnd:alpha(mix(text,accent(4),.35),125),
   dot:(i,bg)=>{const h=hsv(accent(i));h[1]=clamp(h[1]*1.32,.66,.94);h[2]=light?.98:.53;let d=fromHSV(h);for(let j=0;j<8&&contrast(d,bg)<3.5;j++){h[2]=light?Math.min(1,h[2]+.025):Math.max(.24,h[2]-.04);d=fromHSV(h);}return d;}};
 }
 return {make,mix,alpha,css,contrast};
})();
if(typeof module!=='undefined')module.exports=BPAWidgetPalette;
