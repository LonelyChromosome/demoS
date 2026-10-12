from pathlib import Path
import hashlib,json,sys
root=Path(sys.argv[1]).resolve()
channel=json.loads((Path(__file__).resolve().parents[1]/'scriptable/update-channel.json').read_text())
files=[]
for p in sorted(root.rglob('*')):
    if not p.is_file() or '.git' in p.relative_to(root).parts:continue
    path=str(p.relative_to(root))
    if path=='bpa-package.json':continue
    raw=p.read_bytes();files.append({'path':path,'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
(root/'bpa-package.json').write_text(json.dumps({'schema':1,'versionCode':channel['versionCode'],'versionName':channel['versionName'],'files':files},ensure_ascii=False,separators=(',',':')))
print(f'{len(files)} local resources indexed')
