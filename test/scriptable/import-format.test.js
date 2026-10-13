const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
test('the imported script avoids giant editor lines and embeds all signed Shortcut bytes unchanged',()=>{
 const envelope=JSON.parse(fs.readFileSync('scriptable/BPA.scriptable','utf8')),source=fs.readFileSync('scriptable/BPA.js','utf8');assert.equal(envelope.script,source);assert.ok(Math.max(...source.split('\n').map(s=>s.length))<2000);
 const c=vm.createContext({module:{exports:{}}});vm.runInContext(source,c);
 for(const [kind,stem]of [['alarm','BPA-Alarm'],['nfc','BPA-NFC'],['widgets','BPA-Widgets']]){
  const data=vm.runInContext('BPA_BUNDLED_SHORTCUTS.'+kind,c),actual=Buffer.from(data.base64,'base64'),expected=fs.readFileSync('scriptable/shortcuts/'+stem+'.shortcut');assert.deepEqual(actual,expected);assert.equal(crypto.createHash('sha256').update(actual).digest('hex'),data.sha256);
 }
});
