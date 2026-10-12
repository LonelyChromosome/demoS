const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function context(){const c=vm.createContext({Buffer,module:{exports:{}},UUID:{string:()=> 'reader-fixture'}});vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);return c;}
test('NFC Helper candidate calls only documented read URI and binds its response to this nonce',async()=>{
 const c=context();let url,params={};c.CallbackURL=class {constructor(v){url=v;}getURL(){return 'nfchelper://read?x-success=scriptable%3A%2F%2F%2Fcallback%3Fid%3Dfixture';}addParameter(k,v){params[k]=v;}async open(){return {custom:'reader-fixture',tagid:'04:A2:7F:1B:5E:80:00'};}};
 assert.equal(await vm.runInContext('requestCardUIDViaHelper()',c),'04A27F1B5E8000');assert.equal(url,'nfchelper://read');assert.deepEqual(params,{callback:'scriptable:///callback?id=fixture',params:'true',custom:'reader-fixture'});assert.equal(params.post,undefined);assert.equal(params.url,undefined);
});
test('unknown callback transport, stale nonce and content pretending to be UID fail closed',async()=>{
 const c=context();c.CallbackURL=class {getURL(){return 'nfchelper://read';}addParameter(){}async open(){throw Error('must not open');}};
 await assert.rejects(vm.runInContext('requestCardUIDViaHelper()',c),e=>e.code==='nfc_callback_transport');
 for(const response of [{custom:'old',tagid:'04A27F1B5E8000'},{custom:'reader-fixture',tagid:'https://example.test/card'}]){
  c.CallbackURL=class {getURL(){return 'nfchelper://read?x-success=scriptable%3A%2F%2Fcallback';}addParameter(){}async open(){return response;}};
  await assert.rejects(vm.runInContext('requestCardUIDViaHelper()',c));
 }
});
