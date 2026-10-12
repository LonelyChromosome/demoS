const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),palette=require('../../web/widget-palette');
function host(){const c=vm.createContext({Buffer,module:{exports:{}}});vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);return c;}
test('small timeline spans intervening empty days and starts at first unfinished class today',()=>{
 const c=host();c.rows={classes:[{id:'a',subjectName:'A',startAt:'2026-10-13T08:00:00',endAt:'2026-10-13T09:00:00'},{id:'b',subjectName:'B',startAt:'2026-10-13T10:00:00',endAt:'2026-10-13T11:00:00'},{id:'c',subjectName:'C',startAt:'2026-10-15T08:00:00',endAt:'2026-10-15T09:00:00'}]};
 const r=vm.runInContext('smallWidgetCollection(rows,{day:"2026-10-13",mode:"study"},new Date(2026,9,13,9,30))',c);
 assert.equal(r.items[r.selectedIndex].id,'b');assert.equal(r.items.find(x=>x.startAt.startsWith('2026-10-14')).emptyDay,true);
 const ended=vm.runInContext('smallWidgetCollection(rows,{day:"2026-10-13",mode:"study"},new Date(2026,9,13,23))',c);assert.equal(ended.items[ended.selectedIndex].id,'b');
});
test('exam widgets retain all of today including completed morning exams like Android',()=>{
 const c=host();c.rows={exams:[{id:'morning',startAt:'2026-10-13T08:00:00',endAt:'2026-10-13T09:00:00'},{id:'yesterday',startAt:'2026-10-12T08:00:00',endAt:'2026-10-12T09:00:00'}]};
 const r=vm.runInContext('widgetRows(rows,{mode:"exam"},"overview",new Date(2026,9,13,18))',c);assert.deepEqual(Array.from(r,x=>x.id),['morning']);
});
test('native palette preserves ARGB and readable accents across light/dark/custom/premium',()=>{
 assert.equal(palette.css(0x80ffd66b),'rgba(255,214,107,0.5019607843137255)');
 for(const [start,end,text]of [[0xff173a8e,0xff992c71,0xffffffff],[0xffeeeeee,0xffaaaaaa,0xff111111]])for(const key of ['classic','tien_mon_premium','tiktok','custom']){
  const p=palette.make(start,end,text,text,key);for(let i=0;i<5;i++){assert.ok(palette.contrast(text,p.cardStart(i,true))>=4.5);assert.ok(palette.contrast(p.time(i,true),p.cardStart(i,true))>=4.5);}
 }
 assert.notEqual(palette.make(0xff173a8e,0xff992c71,0xffffffff,0xffffffff,'tien_mon_premium').accent(0),palette.make(0xff173a8e,0xff992c71,0xffffffff,0xffffffff,'valorant').accent(0));
});
test('theme editor previews use the shared widget renderer without changing the applied theme',async()=>{
 const c=host();c.snapshot=()=>({classes:[{id:'a',startAt:'2026-10-13T08:00:00',endAt:'2026-10-13T09:00:00',subjectName:'A'}]});c.isoDay=()=> '2026-10-13';let captured;
 c.renderWidgetBitmap=async p=>{captured=p;return {png:'preview-bytes'};};
 const out=await vm.runInContext('handlePlatform({channel:"better_phenikaa/widget_render",method:"renderPreview",arguments:{surface:"large",widthDp:320,heightDp:150,theme:"custom",widgetStart:0xffdddddd}},null)',c);
 assert.equal(out,'preview-bytes');assert.equal(captured.kind,'overview');assert.equal(captured.hostWidth,320);assert.equal(captured.items[0].id,'a');
});
test('Clock receipts must contain a returned alarm and this request nonce',async()=>{
 const c=host(),target=new Date(Date.now()+3600000);target.setSeconds(0,0);c.ensureClockShortcut=async()=>{};
 c.input={hour:target.getHours(),minute:target.getMinutes(),target:+target,classStart:+target+3600000,label:'QA fixture'};c.UUID={string:()=> 'alarm-request'};
 let captured;
 c.CallbackURL=class {addParameter(k,v){if(k==='text')captured=JSON.parse(v);}async open(){return {result:JSON.stringify({...captured,status:'BPA_ALARM_CREATED',createdAlarm:'Mock Clock output; not device evidence'})};}};
 assert.equal(await vm.runInContext('handlePlatform({channel:"better_phenikaa/study_alarm",method:"setAlarm",arguments:input},null)',c),true);assert.equal(captured.requestId,'alarm-request');
 c.CallbackURL=class {addParameter(){}async open(){return {result:JSON.stringify({...c.input,status:'BPA_ALARM_CREATED',requestId:'old',createdAlarm:'Mock'})};}};
 await assert.rejects(vm.runInContext('handlePlatform({channel:"better_phenikaa/study_alarm",method:"setAlarm",arguments:input},null)',c),e=>e.code==='clock_unverified');
});
