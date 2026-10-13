"""Build the small Scriptable base without full runtime/Shortcut dependencies."""
from pathlib import Path
import json,re,hashlib,argparse
root=Path(__file__).resolve().parents[2];here=root/'scriptable/base'
parser=argparse.ArgumentParser();parser.add_argument('--release',default='__BPA_BASE_RELEASE__');args=parser.parse_args()
mobile=(root/'lib/features/dang_nhap_qldt/qldt_login_mobile.dart').read_text();session=re.search(r"source: r'''(.*?)'''",mobile[mobile.index('Future<void> _checkReady()'):],re.S).group(1)
transport=(root/'scriptable/native-transport.js').read_text().replace("async function qldtPost(session,action,func,extra) {","async function qldtPost(session,action,func,extra) {\n  activeCheck();").replace("const text=await request.loadString(),status=request.response.statusCode;","const text=await request.loadString(),status=request.response.statusCode;activeCheck();")
sync=(root/'scriptable/core.js').read_text()+'\nfunction errorCode(code,message){return Object.assign(Error(message),{code});}\nlet activeCheck=()=>{};\n'+transport+'\nmodule.exports={probeScript:'+json.dumps(session,ensure_ascii=False)+",retain:BPACore.retain,async fetch(session,check){activeCheck=check;try{check();return await fetchNativeQldt(session);}finally{activeCheck=()=>{};}}};\n"
(here/'sync.js').write_text(sync)
local=(root/'scriptable/local-package.js').read_text();hash_code=local[local.index('function* sha256Work'):local.index('function validBundlePath')]
# Avoid unused cooperative helper in the small top-level script.
hash_code=re.sub(r'async function sha256Cooperative\(.*?\n}\n','',hash_code,flags=re.S)
files={name:{'size':(here/name).stat().st_size,'sha256':hashlib.sha256((here/name).read_bytes()).hexdigest()} for name in ['runtime.js','ui.html','sync.js']}
if (here/'Roboto-Regular.ttf').exists():files['Roboto-Regular.ttf']={'size':(here/'Roboto-Regular.ttf').stat().st_size,'sha256':hashlib.sha256((here/'Roboto-Regular.ttf').read_bytes()).hexdigest()}
(here/'manifest.json').write_text(json.dumps({'schema':1,'scope':'cooc 1.0 base: in-app day/week calendar and verified QLDT sync','files':files},ensure_ascii=False,indent=2)+'\n')
entry=(here/'launcher.js').read_text().replace('__RELEASE__',json.dumps(args.release)).replace('__FILES__',json.dumps(files,ensure_ascii=False,indent=2)).replace('__HASH__',hash_code)
(here/'BPA-Base.js').write_text(entry)
envelope={'always_run_in_app':True,'icon':{'color':'deep-blue','glyph':'calendar-alt'},'name':'BPA Base','script':entry,'share_sheet_inputs':[]}
(here/'BPA.scriptable').write_text(json.dumps(envelope,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'import_bytes':len(entry.encode()),'modules':files},ensure_ascii=False))
