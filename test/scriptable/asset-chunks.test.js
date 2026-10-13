const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function fixture(bytes){
 const events=new EventTarget(),packets=[],requests=[];let reads=0,encodes=0;
 class CustomEvent extends Event{constructor(name,options){super(name);this.detail=options.detail;}}
 const window={__BPA_LOCAL__:true,fetch:async()=>{},XMLHttpRequest:class{},addEventListener:events.addEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events)};
 const c=vm.createContext({module:{exports:{}},FileManager:{local:()=>({joinPath:(a,b)=>a+'/'+b,read:()=>{reads++;return {toBase64String:()=>{encodes++;return bytes.toString('base64');}};}})},Timer:{schedule:(ms,repeat,fn)=>{const id=setTimeout(fn,ms);return {invalidate:()=>clearTimeout(id)};}},window,history:{pushState(){},replaceState(){}},location:{origin:'https://bpa.local'},document:{baseURI:'https://bpa.local/'},atob,URL,Event,CustomEvent,EventTarget,TextDecoder,Blob,Response,setTimeout});
 vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);vm.runInContext(fs.readFileSync('web/local-assets.js','utf8'),c);c.bpaAssetResult=window.bpaAssetResult;
 events.addEventListener('bpa-asset-request',e=>requests.push(e.detail));
 const web={async evaluateJavaScript(script){packets.push(JSON.parse(script.slice('bpaAssetResult('.length,script.indexOf(');null'))));vm.runInContext(script,c);}};
 c.web=web;c.bundle={path:'/verified',files:['asset.bin']};c.asset={id:1,path:'asset.bin'};
 return {c,packets,requests,read:()=>window.bpaReadAsset('asset.bin'),run:s=>vm.runInContext(s,c),counts:()=>({reads,encodes})};
}
for(const size of [0,196609,7284602])test('binary asset '+size+' bytes crosses bounded chunks intact',async()=>{
 const bytes=Buffer.alloc(size);for(let i=0;i<size;i++)bytes[i]=(i*97+23)%256;
 const f=fixture(bytes),result=f.read();assert.equal(f.read(),result);await f.run('transmitLocalAsset(web,bundle,asset)');
 const received=Buffer.from(await result);assert.equal(crypto.createHash('sha256').update(received).digest('hex'),crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(received.length,size);assert.ok(f.packets.every(p=>p.chunk.length<=262144&&!('data' in p)));assert.equal(f.packets.filter(p=>p.final).length,1);assert.deepEqual(f.counts(),{reads:1,encodes:1});assert.equal(f.requests.length,1);
});
test('wrong chunk offset rejects instead of returning partial bytes',async()=>{
 const f=fixture(Buffer.from('hello')),result=f.read();f.c.window.bpaAssetResult({id:1,total:5,offset:3,chunk:'aGVsbG8=',final:true});await assert.rejects(result,/Invalid asset chunk/);const next=f.read();assert.equal(f.requests.length,2);f.c.window.bpaAssetResult({id:2,error:'stopped'});await assert.rejects(next,/stopped/);
});
test('screen cancellation stops sending remaining asset chunks',async()=>{
 const f=fixture(Buffer.alloc(1000000));let checks=0;f.c.check=()=>{if(++checks>2)throw Object.assign(Error('closed'),{code:'cancelled'});};await assert.rejects(f.run('transmitLocalAsset(web,bundle,asset,check)'),e=>e.code==='cancelled');assert.equal(f.packets.length,1);
});
