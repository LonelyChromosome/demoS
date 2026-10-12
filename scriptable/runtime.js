// Runtime bundled with core.js and unmodified JavaScript from Android.
async function callPortal(web, source, resultHandler, errorHandler, timeoutMs) {
  const adapter = `(() => {
    let finished = false;
    const timer = setTimeout(() => finish({error:'TIMEOUT'}), ${timeoutMs});
    function finish(value) { if (finished) return; finished=true; clearTimeout(timer); completion(value); }
    window.flutter_inappwebview = {callHandler(name, attempt, value) {
      if (name === ${JSON.stringify(resultHandler)}) finish({value});
      if (name === ${JSON.stringify(errorHandler)}) finish({error:String(value || 'QLDT_ERROR')});
      return Promise.resolve(null);
    }};
    const status = ${source.trim().replace(/;$/, '')};
    if (['SESSION_EXPIRED','BRIDGE_MISSING','BRIDGE_EXCEPTION','bridge_unavailable','portal_unavailable','request_exception'].includes(status)) finish({error:status});
  })();`;
  const result = await web.evaluateJavaScript(adapter, true);
  if (!result || result.error) throw new Error(result && result.error || 'QLĐT không trả kết quả.');
  return JSON.parse(result.value);
}
function saveVerified(fm, path, value) {
  const temporary = path+'.pending', backup=path+'.backup';
  const serialized = JSON.stringify(value);
  fm.writeString(temporary,serialized);
  if (fm.readString(temporary) !== serialized) throw new Error('Không xác minh được bản lưu.');
  if (fm.fileExists(backup)) fm.remove(backup);
  const hadOld = fm.fileExists(path);
  if (hadOld) fm.move(path,backup);
  try { fm.move(temporary,path); }
  catch (error) {
    if (hadOld && fm.fileExists(backup) && !fm.fileExists(path)) fm.move(backup,path);
    throw error;
  }
  if (fm.fileExists(backup)) fm.remove(backup);
}
async function runBPA() {
  if (config.runsInWidget) {
    throw new Error('File này kiểm tra đồng bộ trong Scriptable; chưa có bộ 3 widget BPA.');
  }
  const notice = new Alert();
  notice.title='BPA • Scriptable • kiểm tra đồng bộ';
  notice.message='Đây là phần đồng bộ thật, chưa phải bản BPA hoàn chỉnh. Đăng nhập QLĐT trong màn hình tiếp theo. Khi đã vào cổng sinh viên, bấm Xong để lấy và xác minh lịch. Không đóng Scriptable trong lúc kiểm tra.';
  notice.addAction('Đăng nhập và đồng bộ'); notice.addCancelAction('Hủy');
  if (await notice.presentAlert() === -1) { Script.complete(); return; }
  const fm=FileManager.local(), directory=fm.joinPath(fm.documentsDirectory(),'BPA-Scriptable');
  if (!fm.fileExists(directory)) fm.createDirectory(directory,true);
  const path=fm.joinPath(directory,'semester-v1.json');
  // Recover the last validated data after a process interruption during rename.
  if (!fm.fileExists(path) && fm.fileExists(path+'.backup')) fm.move(path+'.backup',path);
  const old=fm.fileExists(path)?JSON.parse(fm.readString(path)):null;
  const web=new WebView();
  await web.loadURL('https://qldtbeta.phenikaa-uni.edu.vn/');
  await web.present(false);
  // Credentials remain within the university's login WebView. Never log them.
  const portalHost=await web.evaluateJavaScript('location.hostname',false);
  if (portalHost !== 'qldtbeta.phenikaa-uni.edu.vn') throw new Error('Chưa trở về cổng QLĐT sau đăng nhập.');
  const raw=await callPortal(web,REGISTRATION_SCRIPT,'betterPhenikaaRegistrationResult','betterPhenikaaRegistrationError',20000);
  const reg=BPACore.registration(raw), chunks=BPACore.chunksFor(reg);
  const schedule=chunks.length ? await callPortal(web, scheduleScript(chunks), 'betterPhenikaaSyncResult','betterPhenikaaSyncError',20000) : {response:{Success:true,Data:[]}};
  const current=BPACore.buildSemester(reg,BPACore.parseSchedule(schedule.response));
  const state=BPACore.retain(old,current);
  // Android uses the earliest registered section, including when the first
  // personal lesson is later. Keep that range as the persisted term start.
  if (chunks.length && !(old && old.current && old.current.semesterId === current.semesterId && old.startedAt)) state.startedAt=localISO(BPACore.vnDate(chunks[0].start));
  saveVerified(fm,path,state);
  const study=current.subjects.reduce((n,s)=>n+s.studySchedules.length,0), exams=current.subjects.reduce((n,s)=>n+s.examSchedules.length,0);
  const done=new Alert(); done.title='Đã lưu lịch đã xác minh';
  done.message=`${current.displayName}\n${current.semesterName}\n${study} buổi học • ${exams} ca thi\nDữ liệu cũ chỉ được thay sau khi toàn bộ xác minh thành công.`;
  done.addAction('Xong'); await done.presentAlert();
  Script.complete();
}
if (typeof Script !== 'undefined') {
  runBPA().catch(async error => {
    const alert=new Alert(); alert.title='Chưa đồng bộ được';
    alert.message=String(error && error.message || error)+'\nLịch đã lưu trước đó được giữ lại.';
    alert.addAction('Đóng'); await alert.presentAlert(); Script.complete();
  });
}
