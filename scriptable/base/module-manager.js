// Optional packages are staged file-by-file. A package becomes active only after
// all resources verify; a failed install never replaces its previous activation.
function validateCatalog(value){
 if(value?.schema!==1||!Array.isArray(value.modules)||value.modules.length>32)throw Error('Danh sách phần cài không hợp lệ.');
 const ids=new Set();for(const item of value.modules){if(!/^[a-z][a-z0-9-]{0,40}$/.test(item.id)||ids.has(item.id)||!Array.isArray(item.files)||!item.files.length)throw Error('Phần cài không hợp lệ.');ids.add(item.id);
  const paths=new Set();for(const f of [...item.files,...(item.assets||[])]){if(!/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(f.path)||f.path.split('/').some(v=>v==='.'||v==='..')||paths.has(f.path)||!Number.isInteger(f.size)||f.size<0||f.size>25000000||!/^[0-9a-f]{64}$/.test(f.sha256))throw Error('Tài nguyên phần cài không hợp lệ.');paths.add(f.path);}if(!paths.has(item.entry)||!Array.isArray(item.requires)||item.requires.some(id=>id===item.id))throw Error('Phụ thuộc phần cài không hợp lệ.');
 }for(const item of value.modules)if(item.requires.some(id=>!ids.has(id)))throw Error('Thiếu phần cài phụ thuộc.');return value;
}
function create(ctx,catalog){
 validateCatalog(catalog);let installing=null;const loaded=new Map();
 const registry=()=>ctx.readState('modules.json',{schema:1,active:{}}),get=id=>{const m=catalog.modules.find(m=>m.id===id);if(!m)throw Error('Không có phần cài này.');return m;};
 function list(){const r=registry();return catalog.modules.map(m=>({id:m.id,title:m.title,size:m.files.reduce((n,f)=>n+f.size,0),installed:!!r.active[m.id],current:r.active[m.id]?.release===ctx.release,requires:m.requires}));}
 async function install(id,chain=[]){if(chain.includes(id))throw Error('Phụ thuộc phần cài bị lặp.');const item=get(id);for(const dep of item.requires)if(registry().active[dep]?.release!==ctx.release)await install(dep,[...chain,id]);const paths={};let index=0;
  for(const f of item.files){ctx.check();await ctx.status('Đang cài '+item.title+' • '+(++index)+'/'+item.files.length);paths[f.path]=await ctx.installResource(f);await ctx.delay(1);}
  ctx.check();if(typeof importModule(paths[item.entry]).create!=='function')throw Error('Phần cài chưa có điểm mở.');
  const r=registry();r.active[id]={release:ctx.release,entry:paths[item.entry],paths,assets:item.assets||[],installedAt:Date.now()};ctx.writeState('modules.json',r);loaded.delete(id);
  ctx.writeState('module-host.json',{manager:module.filename,runtime:ctx.runtimePath,catalog:ctx.catalogPath,release:ctx.release,scriptName:ctx.scriptName,services:ctx.servicesPath});
  return r.active[id];
 }
 async function installOne(id){if(installing)throw Error('Đang cài phần khác.');installing=id;try{return await install(id);}finally{installing=null;}}
 async function remove(id){get(id);const r=registry();if(catalog.modules.some(m=>m.requires.includes(id)&&r.active[m.id]))throw Error('Gỡ phần phụ thuộc trước.');if(r.active[id]){const api=load(id);if(api.uninstall)await api.uninstall();}delete r.active[id];ctx.writeState('modules.json',r);const theme=ctx.readState('theme.json',{});if(id==='themes'||id==='tienmon'&&theme.theme==='tien_mon_premium')ctx.writeState('theme.json',{});loaded.delete(id);}
 function load(id){const item=get(id),active=registry().active[id];if(!active)throw Error('Cài '+item.title+' trước.');for(const dep of item.requires)if(!registry().active[dep])throw Error('Phần phụ thuộc đã bị gỡ.');if(loaded.has(id))return loaded.get(id);
  const resources=path=>{const p=active.paths[path];if(!p||!ctx.fm.fileExists(p))throw Error('Thiếu tài nguyên; cài lại '+item.title+'.');return p;};resources(item.entry);
  async function ensureAsset(path){if(active.paths[path]&&ctx.fm.fileExists(active.paths[path]))return active.paths[path];const f=active.assets?.find(f=>f.path===path);if(!f)throw Error('Tài nguyên không thuộc phần đã cài.');const p=await ctx.installResource(f);ctx.check();const r=registry();if(r.active[id]?.entry!==active.entry)throw Error('Phần cài đã thay đổi.');r.active[id].paths[path]=p;active.paths[path]=p;ctx.writeState('modules.json',r);return p;}
  const api=importModule(active.entry).create({...ctx,resource:resources,ensureAsset,renderBitmap:(payload)=>ctx.renderBitmap(payload,resources,ensureAsset),installed:dep=>registry().active[dep],load,installOne,remove,list});loaded.set(id,api);return api;
 }
 async function open(id,command={}){const api=load(id);return await api.handle(command);}
 async function afterSync(){const r=registry();for(const id of ['reminders'])if(r.active[id])try{await load(id).afterSync();}catch(error){ctx.writeState('module-error.json',{id,code:error.code||'after_sync',at:Date.now()});}}
 return {list,installOne,remove,load,open,afterSync};
}
module.exports={validateCatalog,create};
