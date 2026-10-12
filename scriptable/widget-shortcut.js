function widgetShortcutURL(input) {
  return 'shortcuts://run-shortcut?name='+encodeURIComponent(BPA_BUNDLED_SHORTCUTS.widgets.name)+'&input=text&text='+encodeURIComponent(JSON.stringify(input));
}
function widgetShortcutReady() {
  const asset=BPA_BUNDLED_SHORTCUTS.widgets;
  return !!asset&&readState('widget-shortcut.json',{}).readyDigest===asset.sha256;
}
async function ensureWidgetShortcut() {
  const asset=bundledShortcut('widgets');
  async function probe() {
    const requestId=UUID.string(),response=await invokeBundledShortcut('widgets',{mode:'probe',requestId});
    const value=JSON.parse(response.result||'null');
    if(!value||value.status!=='BPA_WIDGET_BRIDGE_READY'||value.requestId!==requestId)throw errorCode('widget_bridge_setup','Chưa hoàn tất chuẩn bị widget BPA.');
  }
  try {await probe();}
  catch(_) {await QuickLook.present(asset.path,true);await probe();}
  writeState('widget-shortcut.json',{readyDigest:asset.sha256});
}
async function requestWidgetRefresh(returnHome=false) {
  if(returnHome)await ensureWidgetShortcut();
  else if(!widgetShortcutReady()) {
    writeState('widget-refresh.json',{status:'setup_required',at:Date.now()});return false;
  }
  const requestId=UUID.string();
  if(returnHome) {
    // No x-success opens Scriptable again after Return to Home Screen.
    Safari.open(widgetShortcutURL({mode:'home',requestId}));return true;
  }
  const response=await invokeBundledShortcut('widgets',{mode:'refresh',requestId});
  const value=JSON.parse(response.result||'null');
  if(!value||value.status!=='BPA_WIDGET_REFRESH_REQUESTED'||value.requestId!==requestId)throw errorCode('widget_refresh_unverified','Chưa xác nhận được yêu cầu làm mới widget.');
  // An intent request is not proof that the launcher has painted a new frame.
  writeState('widget-refresh.json',{status:'requested',at:Date.now()});return true;
}
async function widgetCommand(input) {
  if(typeof input==='string')input=JSON.parse(input);
  if(!input||typeof input!=='object'||typeof input.requestId!=='string'||!input.requestId)throw errorCode('widget_action','Yêu cầu widget không hợp lệ.');
  if(!input.action)return {status:'BPA_WIDGET_NO_CHANGE',requestId:input.requestId};
  if(!['previous','next','mode'].includes(input.action)||!['small','overview','widget2'].includes(input.kind)||typeof input.instance!=='string'||!input.instance||input.instance.length>512)throw errorCode('widget_action','Yêu cầu widget không hợp lệ.');
  await widgetAction(input.action,input.kind,input.instance,{engineOnly:true});
  return {status:'BPA_WIDGET_ACTION_COMMITTED',requestId:input.requestId};
}
