const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture() {
 const states=new Map(),notifications=new Map();
 const c=vm.createContext({module:{exports:{}}});vm.runInContext(fs.readFileSync('scriptable/BPA.js','utf8'),c);
 c.readState=(k,f)=>states.has(k)?states.get(k):f;c.writeState=(k,v)=>states.set(k,v);
 c.preference=()=>({subjects:[]});c.assistantTemplate=()=> 'original assistant';
 c.Notification=class {
  setTriggerDate(at){this.at=at;}
  async schedule(){notifications.set(this.identifier,this);}
  static async allPending(){return [...notifications.values()];}
  static async allDelivered(){return [];}
  static async removePending(ids){ids.forEach(id=>notifications.delete(id));}
  static async removeDelivered(){}
 };
 return {c,states,notifications};
}
test('stale reminder matches the Android strict two-day threshold and one request per local day',()=>{
 const {c}=fixture();c.success=new Date(2026,9,13,12).getTime();
 assert.equal(vm.runInContext('staleReminderDue(success+2*86400000,success,0)',c),false);
 assert.equal(vm.runInContext('staleReminderDue(success+2*86400000+1,success,0)',c),true);
 c.last=new Date(2026,9,15,13).getTime();c.now=new Date(2026,9,15,22).getTime();
 assert.equal(vm.runInContext('staleReminderDue(now,success,last)',c),false);
 c.now=new Date(2026,9,16,9).getTime();assert.equal(vm.runInContext('staleReminderDue(now,success,last)',c),true);
});
test('success schedules the exact threshold and repeated maintenance cannot add early/duplicate reminders',async()=>{
 const {c,states,notifications}=fixture();const success=Date.now();states.set('sync-status.json',{lastSuccessAtMillis:success});
 await vm.runInContext('scheduleStaleReminder(true)',c);await vm.runInContext('scheduleStaleReminder()',c);
 assert.equal(notifications.size,1);const notice=[...notifications.values()][0];
 assert.equal(notice.at.getTime(),success+2*86400000+1);assert.equal(notice.body,'original assistant');
 assert.equal(states.get('sync-stale.json').status,'requested');
});
test('the daily runner reuses the original exam reconciliation and an empty account schedules nothing',async()=>{
 const {c,states,notifications}=fixture();let exams=0;c.scheduleExamReminders=async()=>exams++;
 await vm.runInContext('reminderMaintenance()',c);assert.equal(exams,1);assert.equal(notifications.size,0);
});
