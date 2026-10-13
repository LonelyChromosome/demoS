const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const entry=fs.readFileSync('scriptable/base/BPA-Base.js','utf8');
function fixture({corrupt=false,hold=false}={}){
 const files=new Map(),dirs=new Set(),events=[];let close,finishRequest,imports=0;class Data{constructor(bytes){this.bytes=Buffer.from(bytes);}toBase64String(){return this.bytes.toString('base64');}}
 const fm={documentsDirectory:()=>'/docs',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p)||dirs.has(p),createDirectory:p=>dirs.add(p),readString:p=>files.get(p).toString(),writeString:(p,v)=>files.set(p,Buffer.from(v)),read:p=>new Data(files.get(p)),write:(p,d)=>files.set(p,d.bytes),remove:p=>files.delete(p),move:(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
 const web={async loadHTML(){events.push('html');},present(){events.push('present');return new Promise(r=>close=r);},async evaluateJavaScript(){return null;}};
 const c=vm.createContext({console,module:{filename:'/scripts/BPA Base.js'},FileManager:{local:()=>fm},WebView:class{constructor(){return web;}},Timer:{schedule:(ms,repeat,fn)=>{const id=setTimeout(fn,ms);return {invalidate:()=>clearTimeout(id)};}},Script:{complete:()=>events.push('complete')},Request:class{constructor(url){events.push('request');this.response={statusCode:200};}async load(){if(hold)await new Promise(r=>finishRequest=r);return new Data(corrupt?Buffer.from('altered'):fs.readFileSync('scriptable/base/runtime.js'));}},importModule:()=>{imports++;return {async run(_web,ctx){events.push('ready');close();await ctx.presentation;}};}});
 return {files,events,get imports(){return imports;},close:()=>close(),release:()=>finishRequest(),run:()=>vm.runInContext('(async()=>{'+entry+'})()',c)};
}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,2));}throw Error('Expected launcher state not reached');}
test('small native launcher presents its WebView before downloading or importing code',async()=>{
 const f=fixture();await f.run();assert.ok(f.events.indexOf('present')<f.events.indexOf('request'));assert.equal(f.imports,1);assert.ok(f.events.includes('ready'));assert.ok(f.events.includes('complete'));
});
test('bad module hash cannot execute and error stays visible until user closes',async()=>{
 const f=fixture({corrupt:true}),work=f.run();await until(()=>[...f.files.values()].some(v=>v.toString().includes('Không xác minh được')));assert.equal(f.imports,0);f.close();await work;assert.equal([...f.files.keys()].some(p=>p.endsWith('/runtime.js')),false);
});
test('closing during download blocks late module writes and execution',async()=>{
 const f=fixture({hold:true}),work=f.run();await until(()=>f.events.includes('request'));f.close();f.release();await work;assert.equal(f.imports,0);assert.equal([...f.files.keys()].some(p=>p.endsWith('/runtime.js')),false);
});
