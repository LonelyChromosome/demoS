// Original Android policy: strictly more than two days since success, then
// once per local day at 09:00. A native daily Automation runs maintenance.
function staleReminderDue(now,success,lastRequested) {
  if(!(success>0)||now-success<=2*86400000)return false;
  return !(lastRequested>success)||isoDay(new Date(now))>isoDay(new Date(lastRequested));
}
async function scheduleStaleReminder(reset=false) {
  const success=readState('sync-status.json',{lastSuccessAtMillis:0}).lastSuccessAtMillis;
  if(!(success>0)||!preference('better_phenikaa_current_semester_v1'))return;
  const now=Date.now(),firstAt=success+2*86400000+1;
  let ledger=readState('sync-stale.json',{});
  if(reset||ledger.success!==success) {
    const pending=await Notification.allPending(),delivered=await Notification.allDelivered();
    await Notification.removePending(pending.filter(n=>n.identifier.startsWith('bpa.stale.')).map(n=>n.identifier));
    await Notification.removeDelivered(delivered.filter(n=>n.identifier.startsWith('bpa.stale.')).map(n=>n.identifier));
    ledger={success,lastRequested:0};
  }
  if(ledger.lastRequested&& !staleReminderDue(now,success,ledger.lastRequested))return;
  const at=now<firstAt?firstAt:now;
  const n=new Notification();n.identifier='bpa.stale.'+isoDay(new Date(at));n.threadIdentifier='bpa.stale';
  n.title='Đã lâu chưa đồng bộ';n.body=assistantTemplate(1);n.sound='default';n.openURL=actionURL('open','overview','main');
  if(at>now)n.setTriggerDate(new Date(at));
  await n.schedule();
  // This is a scheduling receipt, never a claim that the phone displayed it.
  writeState('sync-stale.json',{success,lastRequested:at,status:'requested'});
}
async function reminderMaintenance() {
  recoverBackgroundCommit();
  await scheduleStaleReminder();await scheduleExamReminders();
  return {status:'BPA_REMINDERS_REQUESTED'};
}
async function ensureReminderAutomation() {
  if(readState('reminder-automation.json',{}).guideAcknowledged)return;
  const a=new Alert();a.title='Chuẩn bị nhắc lịch';
  a.message='Trong Phím tắt → Tự động hóa, thêm Thời gian trong ngày: 09:00, hằng ngày, chạy ngay. Thêm tác vụ Scriptable “Run Script”, chọn “BPA — Nhắc lịch” và tắt “Run in App”. Sau khi tạo, quay lại BPA. Tác vụ này chỉ nhắc lịch, không tự đồng bộ QLĐT.';
  a.addAction('Đã tạo, tiếp tục');a.addAction('Mở Phím tắt');a.addCancelAction('Để sau');
  const choice=await a.presentAlert();
  if(choice===1){Safari.open('shortcuts://');return;}
  if(choice===0)writeState('reminder-automation.json',{guideAcknowledged:true});
}
