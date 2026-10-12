const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{execFileSync}=require('node:child_process');
function fixture(){
 const files=new Map(),dirs=new Set();
 const fm={documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p)||dirs.has(p),createDirectory:p=>dirs.add(p),readString:p=>files.get(p),writeString:(p,v)=>files.set(p,v),move:(a,b)=>{if(files.has(b))throw Error('Destination exists');files.set(b,files.get(a));files.delete(a);},remove:p=>files.delete(p)};
 const c=vm.createContext({module:{exports:{},filename:'/local/BPA.js'},Buffer,FileManager:{local:()=>fm},UUID:{string:()=> 'widget-nonce'}});
 const source=fs.readFileSync('scriptable/BPA.js','utf8');vm.runInContext(source,c);c.source=source;
 vm.runInContext('installWidgetScripts(source)',c);
 const state={'overview:main':{day:'2026-10-13',mode:'study',index:0}};
 files.set('/local/BPA/widgets.json',JSON.stringify(state));
 files.set('/local/BPA/snapshot.json',JSON.stringify({classes:Array.from({length:6},(_,i)=>({id:'qa-'+i,subjectName:'QA',startAt:'2026-10-13T'+String(8+i).padStart(2,'0')+':00:00',endAt:'2026-10-13T'+String(9+i).padStart(2,'0')+':00:00'})),exams:[]}));
 return {c,files,fm};
}
test('the actual compiled inline script changes the widget window once without launching the app',async()=>{
 const {c,files}=fixture();let output,completed=0;
 c.Script={setShortcutOutput:v=>output=JSON.parse(v),complete:()=>completed++};
 c.WebView=class {constructor(){throw Error('Inline widget action must not open UI');}};
 c.Safari={open(){throw Error('Inline widget action must not launch another Shortcut');}};
 c.args={shortcutParameter:{mode:'home',action:'next',kind:'overview',instance:'main',requestId:'request'}};
 c.inline=execFileSync('python3',['-c',"import plistlib,pathlib; w=plistlib.loads(pathlib.Path('scriptable/shortcuts/BPA-Widgets.unsigned.plist').read_bytes());\ndef walk(x):\n if isinstance(x,str) and 'const fm=FileManager.local()' in x: print(x)\n elif isinstance(x,dict):\n  for v in x.values():walk(v)\n elif isinstance(x,list):\n  for v in x:walk(v)\nwalk(w)"],{encoding:'utf8'});
 await vm.runInContext('(async()=>{const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;await new AsyncFunction(inline)();})()',c);
 assert.equal(output.status,'BPA_WIDGET_ACTION_COMMITTED');assert.equal(completed,1);
 assert.equal(JSON.parse(files.get('/local/BPA/widgets.json'))['overview:main'].index,2);
});
test('ready widget button URLs target the inline Shortcut directly while calendar and sync retain the app route',()=>{
 const {c,files}=fixture();const digest=vm.runInContext('BPA_BUNDLED_SHORTCUTS.widgets.sha256',c);
 files.set('/local/BPA/widget-shortcut.json',JSON.stringify({readyDigest:digest}));
 const url=new URL(vm.runInContext('actionURL("next","overview","main")',c));
 assert.equal(url.protocol,'shortcuts:');const input=JSON.parse(url.searchParams.get('text'));assert.equal(input.action,'next');assert.equal(input.instance,'main');
 assert.match(vm.runInContext('actionURL("calendar","overview","main")',c),/^scriptable:/);
 assert.match(vm.runInContext('actionURL("sync","overview","main")',c),/^scriptable:/);
});
test('the inline command refuses app or arbitrary actions instead of presenting UI from an extension',async()=>{
 const {c}=fixture();
 for(const action of ['sync','calendar','open','delete']) {
  c.input={action,kind:'overview',instance:'main',requestId:'request'};
  await assert.rejects(vm.runInContext('widgetCommand(input)',c),e=>e.code==='widget_action');
 }
});
test('automatic refresh never claims a native request before the signed companion is prepared',async()=>{
 const {c,files}=fixture();let opened=0;c.CallbackURL=class {constructor(){opened++;}};
 assert.equal(await vm.runInContext('requestWidgetRefresh(false)',c),false);assert.equal(opened,0);
 assert.equal(JSON.parse(files.get('/local/BPA/widget-refresh.json')).status,'setup_required');
});
test('legacy widget routes commit first, then request refresh and Home Screen without applying the action again',async()=>{
 const {c,files}=fixture();let opened;
 c.ensureWidgetShortcut=async()=>assert.equal(JSON.parse(files.get('/local/BPA/widgets.json'))['overview:main'].index,2);
 c.Safari={open:url=>opened=url};
 await vm.runInContext('widgetAction("next","overview","main",{})',c);
 assert.equal(JSON.parse(files.get('/local/BPA/widgets.json'))['overview:main'].index,2);
 const input=JSON.parse(new URL(opened).searchParams.get('text'));assert.equal(input.mode,'home');assert.equal(input.action,undefined);
});
