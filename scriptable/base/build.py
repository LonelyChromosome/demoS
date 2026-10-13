"""Build the small Scriptable base without full runtime/Shortcut dependencies."""
from pathlib import Path
import json,re,hashlib,argparse,runpy
runpy.run_path(str(Path(__file__).with_name('build_modules.py')))
root=Path(__file__).resolve().parents[2];here=root/'scriptable/base'
parser=argparse.ArgumentParser();parser.add_argument('--release',default='__BPA_BASE_RELEASE__');args=parser.parse_args()
mobile=(root/'lib/features/dang_nhap_qldt/qldt_login_mobile.dart').read_text();session=re.search(r"source: r'''(.*?)'''",mobile[mobile.index('Future<void> _checkReady()'):],re.S).group(1)
registration=re.search(r"String get _script => r\'\'\'(.*?)\'\'\';",(root/'lib/features/dang_nhap_qldt/tracuu_api.dart').read_text(),re.S).group(1).replace('__ATTEMPT__','1')
registration=registration.replace('const system = window.edu && edu.system;', 'const system = bpaSystem;')
schedule=re.search(r"final script =\s*\'\'\'(.+?)\'\'\';",mobile[mobile.index('const concurrency = 8;'):],re.S).group(1).replace('$epoch','1').replace('$concurrency','8').replace('$chunksJson','__BPA_CHUNKS__').replace('edu.system.makeRequest({','bpaSystem.makeRequest({')
sync=(root/'scriptable/core.js').read_text()+'\nconst REGISTRATION_SCRIPT='+json.dumps(registration,ensure_ascii=False)+';\nconst SCHEDULE_SCRIPT='+json.dumps(schedule,ensure_ascii=False)+';\n'+(here/'portal-sync.js').read_text()+'\nmodule.exports={probeScript:'+json.dumps(session,ensure_ascii=False)+',retain:BPACore.retain,fetch:fetchInPortal};\n'
(here/'sync.js').write_text(sync)
local=(root/'scriptable/local-package.js').read_text();hash_code=local[local.index('function* sha256Work'):local.index('function validBundlePath')]
# Avoid unused cooperative helper in the small top-level script.
hash_code=re.sub(r'async function sha256Cooperative\(.*?\n}\n','',hash_code,flags=re.S)
files={name:{'size':(here/name).stat().st_size,'sha256':hashlib.sha256((here/name).read_bytes()).hexdigest()} for name in ['runtime.js','ui.html','sync.js','module-manager.js','services.js','catalog.json']}
if (here/'Roboto-Regular.ttf').exists():files['Roboto-Regular.ttf']={'size':(here/'Roboto-Regular.ttf').stat().st_size,'sha256':hashlib.sha256((here/'Roboto-Regular.ttf').read_bytes()).hexdigest()}
(here/'manifest.json').write_text(json.dumps({'schema':1,'scope':'cooc 1.0 base: in-app day/week calendar and verified QLDT sync','files':files},ensure_ascii=False,indent=2)+'\n')
entry=(here/'launcher.js').read_text().replace('__RELEASE__',json.dumps(args.release)).replace('__FILES__',json.dumps(files,ensure_ascii=False,separators=(',',':'))).replace('__HASH__',hash_code)
(here/'BPA-Base.js').write_text(entry)
envelope={'always_run_in_app':True,'icon':{'color':'deep-blue','glyph':'calendar-alt'},'name':'BPA Base','script':entry,'share_sheet_inputs':[]}
(here/'BPA.scriptable').write_text(json.dumps(envelope,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'import_bytes':len(entry.encode()),'modules':files},ensure_ascii=False))
