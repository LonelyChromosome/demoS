"""Bundle the exact Android portal scripts, core and Scriptable adapter."""
from pathlib import Path
import re, json, hashlib
root=Path(__file__).resolve().parents[1]
source=root/'lib/features/dang_nhap_qldt'
registration=re.search(r"String get _script => r'''(.*?)''';",(source/'tracuu_api.dart').read_text(),re.S).group(1).replace('__ATTEMPT__','1')
mobile=(source/'qldt_login_mobile.dart').read_text()
session_script=re.search(r"source: r'''(.*?)'''",mobile[mobile.index('Future<void> _checkReady()'):],re.S).group(1)
schedule=re.search(r"final script =\s*'''(.*?)''';",mobile[mobile.index('const concurrency = 8;'):],re.S).group(1)
schedule=schedule.replace('$epoch','1').replace('$concurrency','8').replace('$chunksJson','__BPA_CHUNKS__')
bundle='// Variables used by Scriptable.\n// icon-color: deep-blue; icon-glyph: calendar-alt;\n// BPA 1.6 Scriptable SYNC CORE — not the complete application.\n'
bundle+=(root/'scriptable/core.js').read_text()+'\n'
bundle+='const REGISTRATION_SCRIPT='+json.dumps(registration,ensure_ascii=False)+';\n'
bundle+='const SCHEDULE_SCRIPT='+json.dumps(schedule,ensure_ascii=False)+';\n'
bundle+='function scheduleScript(chunks) { return SCHEDULE_SCRIPT.replace("__BPA_CHUNKS__",JSON.stringify(chunks)); }\n'
bundle+=(root/'scriptable/runtime.js').read_text()
output=root/'scriptable/BPA-Scriptable-Sync.js'
output.write_text(bundle)
manifest={'android_reference':'16f7ee232ad2b74699cf960f33c87c8caaadecc3','scope':'sync core only; not full BPA','reused_scripts':{'registration_sha256':hashlib.sha256(registration.encode()).hexdigest(),'schedule_sha256':hashlib.sha256(schedule.encode()).hexdigest()},'bundle_sha256':hashlib.sha256(bundle.encode()).hexdigest()}
(root/'scriptable/reuse.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(output)
shared_runtime=(root/'scriptable/runtime.js').read_text().split("if (typeof Script !== 'undefined')")[0]
host_header='// Variables used by Scriptable.\n// icon-color: deep-blue; icon-glyph: calendar-alt;\n// BPA 1.6 — original Flutter UI + Scriptable bridge.\n'
host=host_header+(root/'scriptable/core.js').read_text()+'\n'
host+='const REGISTRATION_SCRIPT='+json.dumps(registration,ensure_ascii=False)+';\n'
host+='const SCHEDULE_SCRIPT='+json.dumps(schedule,ensure_ascii=False)+';\n'
host+='function scheduleScript(chunks) { return SCHEDULE_SCRIPT.replace("__BPA_CHUNKS__",JSON.stringify(chunks)); }\n'
host+='const SESSION_SCRIPT='+json.dumps(session_script,ensure_ascii=False)+';\n'
host+='const BPA_ASSISTANT_CATALOG='+json.dumps(json.loads((root/'scriptable/assistant_pack_texts.json').read_text()),ensure_ascii=False)+';\n'
host+='const BPA_UPDATE_CHANNEL='+json.dumps(json.loads((root/'scriptable/update-channel.json').read_text()))+';\n'
host+=(root/'scriptable/exam-reminders.js').read_text()+'\n'
host+=shared_runtime+'\n'+(root/'scriptable/local-package.js').read_text()+'\n'+(root/'scriptable/native-transport.js').read_text()+'\n'+(root/'scriptable/widgets.js').read_text()+'\n'+(root/'scriptable/web-updater.js').read_text()+'\n'+(root/'scriptable/app-runtime.js').read_text()
(root/'scriptable/BPA.js').write_text(host)

# Export envelope matches a real Scriptable-exported file; device import unverified.
(root/'scriptable/BPA.scriptable').write_text(json.dumps({'always_run_in_app':True,'icon':{'color':'deep-blue','glyph':'calendar-alt'},'name':'BPA','script':host,'share_sheet_inputs':[]},ensure_ascii=False,indent=2)+'\n')
