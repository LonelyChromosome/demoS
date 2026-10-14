// Optional in-app configuration UI. Installed only with the themes module.
(()=>{
 if(window.bpaThemeUI)return;window.bpaThemeUI=true;
 const api=window.bpaBase,dialog=document.createElement('dialog');dialog.id='themePanel';dialog.style.cssText='width:calc(100% - 32px);max-width:540px;max-height:75dvh;overflow:auto;padding:20px';document.body.append(dialog);
 const style=document.createElement('style');style.textContent='#themePanel h2{margin-top:0}#themePanel h3{font-size:16px}#themePanel label{display:block;margin:12px 0;color:var(--muted)}#themePanel input,#themePanel select{width:100%;min-height:44px;margin:6px 0;padding:10px;background:var(--alt);color:var(--ink);border:1px solid var(--border);border-radius:10px}#themePanel input[type=color]{height:44px;padding:4px}#themePanel button{min-height:44px;border-radius:10px;background:var(--alt);margin:4px;padding:10px;color:var(--blue)}#themePanel .swatches{display:flex;height:56px;border-radius:12px;overflow:hidden}#themePanel .swatches i{flex:1}#themePanel .theme-row{border:1px solid var(--border);padding:12px;border-radius:14px;margin:12px 0}#themePanel .preview{padding:16px;border-radius:14px}#themePanel .theme-error{color:#c54141;line-height:1.5}';document.head.append(style);
 let revision=null,current=null,deleteBusy=false,cover=null,waitingToken=null,captureTimer=null;const attemptedDeletes=new Set();
 const css=c=>'#'+(c>>>0).toString(16).padStart(8,'0').slice(2);
 function send(op,extra={}){api.command('module-open',{id:'themes',op,name:dialog.querySelector('[data-theme-name]')?.value,...extra});}
 function node(tag,text,parent=dialog){const n=document.createElement(tag);if(text!=null)n.textContent=text;parent.append(n);return n;}
 function button(text,op,extra={},parent=dialog){const b=node('button',text,parent);b.type='button';b.onclick=()=>send(op,typeof extra==='function'?extra():extra);return b;}
 function input(label,type,value,parent=dialog){const l=node('label',label,parent),n=node('input',null,l);n.type=type;n.value=value;return n;}
 function select(label,choices,value){const l=node('label',label),n=node('select',null,l);for(const [id,text]of choices){const o=node('option',text,n);o.value=id;}n.value=value;return n;}
 function swatches(tokens,parent){const s=node('div',null,parent);s.className='swatches';for(const k of ['primary','secondary','accent','background','card','widgetStart']){const p=node('i',null,s);p.style.background=css(tokens[k]);}}
 function editor(d){
  node('h3','Sửa theme');const name=input('Tên theme','text',d.name);name.maxLength=80;name.dataset.themeName='true';swatches(d.tokens,dialog);
  const preview=node('div','Lịch học • Ví dụ\n08:00 — Lập trình • Phòng A101');preview.className='preview';preview.style.cssText+='background:'+css(d.tokens.card)+';color:'+css(d.tokens.textPrimary)+';margin-top:12px;white-space:pre-line';
  const mode=select('Chế độ màu',[['auto','Tự động'],['dark','Tối'],['light','Sáng']],d.tokens.dark?'dark':'light');
  if(d.source.kind==='colorMix'){const colors=[],weights=[];for(let i=0;i<3;i++){colors.push(input('Màu '+(i+1),'color',css(d.source.colors[i]??d.source.colors[0])));weights.push(input('Trọng số '+(i+1)+' (0–100)','number',d.source.weights?.[i]??1));weights[i].min=0;weights[i].max=100;}const count=select('Số màu',[['2','2 màu'],['3','3 màu']],String(d.source.colors.length)),radius=input('Độ bo góc app (0–28)','number',d.tokens.radius);button('Tạo lại bảng màu','mix',()=>({colors:colors.slice(0,Number(count.value)).map(n=>n.value),weights:weights.slice(0,Number(count.value)).map(n=>Number(n.value)),dark:mode.value,radius:Number(radius.value)}));}
  else button('Chọn lại ảnh nguồn','image',()=>({dark:mode.value}));
  node('h3','Font: '+(d.font?.label||'Mặc định'));for(const [id,label]of [['system','Mặc định'],['serif','Serif'],['monospace','Monospace'],['minecraft','Minecraft'],['import','Nhập TTF / OTF']])button(label,'font',{key:id});
  node('h3','Widget');button('Ảnh tổng quan','widget-image',{key:'largeImagePath'});button('Ảnh Widget 2','widget-image',{key:'widget2ImagePath'});
  const c=d.widgets||{},opacity=input('Độ trong 0–1','number',c.glassOpacity??.58),corner=input('Độ bo góc widget 0–40','number',c.cornerRadiusDp??18),width=input('Độ dày viền 0–8','number',c.largeBorder?.widthDp??1),color=input('Màu viền','color',css(c.largeBorder?.color??0xffffd66b)),enabled=select('Viền',[['yes','Bật'],['no','Tắt']],c.largeBorder?.enabled===false?'no':'yes');opacity.step=.01;
  button('Cập nhật kiểu widget','widget-style',()=>({opacity:Number(opacity.value),radius:Number(corner.value),width:Number(width.value),color:color.value,enabled:enabled.value==='yes'}));
  button('Lưu và áp dụng','save',()=>({name:name.value}));button('Hủy chỉnh sửa','cancel');
 }
 function render(s){
  const p=s.panel;if(s.error&&deleteBusy){const request=current?.deleteReady;cleanup();if(request){const b=node('button','Xóa không hiệu ứng');b.onclick=()=>send('delete',{key:request.id,token:request.token});}}if(s.error&&dialog.open){let e=dialog.querySelector('.theme-error');if(!e){e=node('p',null);e.className='theme-error';}e.textContent=s.message;}
  if(p?.id!=='themes')return;
  if(p.deleteDone&&p.deleteDone===waitingToken){waitingToken=null;clearTimeout(captureTimer);playDust(cover);cover=null;deleteBusy=false;}
  if(p.revision!==revision){revision=p.revision;current=p;dialog.replaceChildren();node('h2','Giao diện');if(s.error){const e=node('p',s.message);e.className='theme-error';}if(p.draft)editor(p.draft);else {
   node('h3','Theme có sẵn');for(const preset of p.presets){const b=button((p.selected===preset.id?'✓ ':'')+preset.name,'preset',{key:preset.id});b.disabled=!preset.available;b.style.border='1px solid '+css(preset.primary);}
   node('h3','Tạo theme');button('Tạo từ 2 màu','mix',{colors:['#1747b5','#e9a531'],weights:[1,1],dark:'auto'});button('Tạo bảng màu từ ảnh','image',{dark:'auto'});button('Ảnh nền trong app','background');
   node('h3','Lịch sử theme');if(!p.history.length)node('p','Chưa có theme tùy chỉnh.');for(const d of [...p.history].reverse()){const row=node('div');row.className='theme-row';node('strong',(p.selected==='custom:'+d.id?'✓ ':'')+d.name,row);swatches(d.tokens,row);button('Áp dụng','apply',{key:d.id},row);button('Sửa','edit',{key:d.id},row);button('Sao chép','copy',{key:d.id},row);const b=button('Xóa','prepare-delete',{key:d.id},row);b.onclick=()=>{if(deleteBusy)return;if(b.dataset.confirm==='yes')send('prepare-delete',{key:d.id});else{b.dataset.confirm='yes';b.textContent='Xác nhận xóa';const cancel=node('button','Hủy xóa',row);cancel.onclick=()=>{b.dataset.confirm='';b.textContent='Xóa';cancel.remove();};}};}
  }button('Đóng','close');const modules=document.getElementById('modulePanel');if(modules?.open)modules.close();if(!dialog.open)dialog.showModal();}
  for(const b of dialog.querySelectorAll('button'))b.disabled=s.busy||deleteBusy||(b.textContent.includes('Tiên Môn')&&!p.presets.find(v=>v.id==='tien_mon_premium')?.available);
  if(p.deleteReady&&!deleteBusy&&!s.error&&!attemptedDeletes.has(p.deleteReady.token)){attemptedDeletes.add(p.deleteReady.token);capture(p.deleteReady);}
 }
 dialog.addEventListener('cancel',e=>{e.preventDefault();if(!api.state().busy&&!deleteBusy){dialog.close();send('close');}});
 window.addEventListener('bpa-state',e=>{if(e.detail.panel==null&&dialog.open&&!e.detail.busy&&!deleteBusy)dialog.close();render(e.detail);});
 function cleanup(){clearTimeout(captureTimer);if(cover){const layer=cover.parentElement;cover.remove();layer?.remove();}cover=null;waitingToken=null;deleteBusy=false;for(const b of dialog.querySelectorAll('button'))b.disabled=!!api.state().busy;}
 async function capture(request){
  deleteBusy=true;waitingToken=request.token;for(const b of dialog.querySelectorAll('button'))b.disabled=true;
  try{
   const root=document.documentElement.cloneNode(true),originals=[document.documentElement,...document.documentElement.querySelectorAll('*')],clones=[root,...root.querySelectorAll('*')],pixel=document.createElement('canvas');pixel.width=pixel.height=1;const px=pixel.getContext('2d');
   for(let i=0;i<originals.length;i++){
    const o=originals[i],n=clones[i],s=getComputedStyle(o);
    for(const k of ['color','backgroundColor','borderTopColor','borderBottomColor','borderLeftColor','borderRightColor']){const v=s[k];if(/^(color\(|okl|lab|lch)/.test(v)){px.clearRect(0,0,1,1);px.fillStyle=v;px.fillRect(0,0,1,1);const a=px.getImageData(0,0,1,1).data;n.style[k]=`rgba(${a[0]},${a[1]},${a[2]},${a[3]/255})`;}}
    if(o.scrollTop)n.dataset.bpaScroll=o.scrollTop;
    if(o===dialog){const r=o.getBoundingClientRect();n.style.cssText+=`;position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;margin:0;max-height:none;max-width:none;z-index:1000000`;const backdrop=document.createElement('div');backdrop.style.cssText='position:fixed;inset:0;z-index:999999;background:'+getComputedStyle(o,'::backdrop').backgroundColor;n.before(backdrop);}
   }
   for(const e of root.querySelectorAll('script,iframe'))e.remove();
   let html='<!doctype html>'+root.outerHTML;const blobs=[...new Set(html.match(/blob:[^\s"')&]+/g)||[])];
   for(const url of blobs){const blob=await (await fetch(url)).blob(),data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});html=html.split(url).join(data);}
   if(html.length>24000000)throw Error('Màn hình có quá nhiều ảnh.');
   captureTimer=setTimeout(()=>{if(waitingToken){cleanup();const e=node('p','Chụp màn hình quá thời gian; theme vẫn được giữ.');e.className='theme-error';}},40000);
   for(let offset=0;offset<html.length;offset+=65536)api.transport({action:'theme-capture',op:'capture-part',token:request.token,offset,chunk:html.slice(offset,offset+65536)});
   api.transport({action:'theme-capture',op:'capture-end',token:request.token,offset:html.length,width:innerWidth,height:innerHeight});
  }catch(e){cleanup();const p=node('p','Chưa xóa theme: '+e.message);p.className='theme-error';const b=node('button','Xóa không hiệu ứng');b.onclick=()=>send('delete',{key:request.id,token:request.token});}
 }
 window.addEventListener('bpa-snapshot',async event=>{
  if(!waitingToken||!current?.deleteReady||current.deleteReady.token!==waitingToken)return;
  try{const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=event.detail.url;});if(!waitingToken)return;
   const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext('2d').drawImage(image,0,0);URL.revokeObjectURL(event.detail.url);cover=canvas;canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:auto';
   const layer=document.createElement('dialog');layer.style.cssText='position:fixed;inset:0;margin:0;padding:0;border:0;width:100%;height:100%;max-width:none;max-height:none;background:transparent;overflow:hidden';layer.addEventListener('cancel',e=>e.preventDefault());document.body.append(layer);layer.append(canvas);layer.showModal();send('delete',{key:current.deleteReady.id,token:waitingToken});
  }catch(error){cleanup();const p=node('p','Ảnh chụp chưa mở được; chưa xóa theme.');p.className='theme-error';}
 });
 function playDust(snapshot){
  if(!snapshot)return;const canvas=document.createElement('canvas');canvas.width=snapshot.width;canvas.height=snapshot.height;canvas.style.cssText=snapshot.style.cssText;const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false});
  const layer=snapshot.parentElement;if(!gl){snapshot.animate([{opacity:1},{opacity:0}],{duration:2400}).finished.finally(()=>layer.remove());return;}
  const W=innerWidth,H=innerHeight,ratio=canvas.width/W,spacing=Math.max(3.1,Math.sqrt(W*H/38000)),positions=[];let seed=1606;
  for(let y=spacing/2;y<H;y+=spacing)for(let x=spacing/2;x<W;x+=spacing){seed=(Math.imul(seed,1664525)+1013904223)>>>0;positions.push(x/W,y/H,seed/4294967296);}
  const noise=`float hash(vec2 p){float n=mod(p.x*73.0+p.y*151.0,289.0);return mod(n*n*34.0+n,289.0)/289.0;}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}float birth(vec2 uv){return (uv.y*.72+(1.0-uv.x)*.20+(noise(uv*vec2(9,17))*.7+noise(uv*vec2(31,57))*.3)*.08)*1.30;}`;
  function shader(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  function program(v,f){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('Shader không liên kết.');return p;}
  let texture,quad,points,q,p,raf;
  function dispose(){cancelAnimationFrame(raf);for(const b of [quad,points])if(b)gl.deleteBuffer(b);for(const v of [q,p])if(v){for(const s of gl.getAttachedShaders(v)||[])gl.deleteShader(s);gl.deleteProgram(v);}if(texture)gl.deleteTexture(texture);canvas.remove();snapshot.remove();layer.remove();}
  try{
   q=program('attribute vec2 pos;varying vec2 uv;void main(){uv=pos;gl_Position=vec4(pos.x*2.0-1.0,1.0-pos.y*2.0,0,1);}','precision highp float;varying vec2 uv;uniform sampler2D image;uniform float progress;'+noise+'void main(){vec4 c=texture2D(image,uv);c.a*=smoothstep(progress-.008,progress+.008,birth(uv));gl_FragColor=c;}');
   p=program('precision highp float;attribute vec3 point;uniform vec2 size;uniform float progress,spacing,ratio;varying vec2 origin;varying float age,life,rotation;'+noise+'void main(){origin=point.xy;float s=point.z;age=(progress-birth(origin))*1.25;life=.45+s*.34;float a=clamp(age/life,0.0,1.0);rotation=(s-.5)*max(age,0.0)*3.0;float drift=(s-.5)*90.0*age+sin(s*6.283185+age*7.0)*22.0*age;float lift=(32.0+s*62.0)*age+95.0*age*age;vec2 uv=origin+vec2(drift,-lift)/size;gl_Position=vec4(uv.x*2.0-1.0,1.0-uv.y*2.0,0,1);gl_PointSize=spacing*ratio*(1.0-.87*a);}','precision highp float;uniform sampler2D image;uniform vec2 size;uniform float spacing;varying vec2 origin;varying float age,life,rotation;void main(){if(age<0.0||age>=life)discard;vec2 d=gl_PointCoord-.5;d=mat2(cos(rotation),-sin(rotation),sin(rotation),cos(rotation))*d;if(max(abs(d.x),abs(d.y))>.5)discard;vec4 c=texture2D(image,origin+d*spacing/size);c.a*=1.0-pow(age/life,2.0);gl_FragColor=c;}');
   texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,snapshot);
   quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);points=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,points);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);
   gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);const started=performance.now();
   function draw(now){const elapsed=(now-started)/1000,progress=Math.max(0,(elapsed-.06)/1.25);gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);for(const [prog,buffer,attribute,n]of [[q,quad,'pos',2],[p,points,'point',3]]){gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const a=gl.getAttribLocation(prog,attribute);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,n,gl.FLOAT,false,0,0);gl.uniform1f(gl.getUniformLocation(prog,'progress'),progress);gl.uniform2f(gl.getUniformLocation(prog,'size'),W,H);gl.uniform1f(gl.getUniformLocation(prog,'spacing'),spacing);gl.uniform1f(gl.getUniformLocation(prog,'ratio'),ratio);gl.drawArrays(prog===q?gl.TRIANGLE_STRIP:gl.POINTS,0,prog===q?4:positions.length/3);}if(!canvas.isConnected){layer.append(canvas);snapshot.remove();}if(elapsed<2.4)raf=requestAnimationFrame(draw);else dispose();}raf=requestAnimationFrame(draw);
  }catch(e){dispose();}
 }
 render(api.state());
})();
