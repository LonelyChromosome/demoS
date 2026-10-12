"""Inventory immutable Git blobs, never read/modify the Android worktree."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('source_checkout');args=parser.parse_args()
root=Path(__file__).resolve().parents[1];repo=Path(args.source_checkout)
commit='16f7ee232ad2b74699cf960f33c87c8caaadecc3'
def git(*args):return subprocess.check_output(['git','-C',str(repo),*args])
entries=[]
for path in git('ls-tree','-r','--name-only',commit).decode().splitlines():
 raw=git('show',commit+':'+path);entry={'path':path,'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
 if Path(path).suffix in {'.kt','.dart','.xml','.json','.html','.js','.frag'}:
  text=raw.decode('utf8')
  entry['classes']=re.findall(r'\b(?:class|object|enum\s+class)\s+(\w+)',text)
  entry['android_ids']=sorted(set(re.findall(r'@\+?id/([a-zA-Z0-9_]+)',text)))
  entry['channels']=sorted(set(re.findall(r'better_phenikaa/[a-zA-Z0-9_]+',text)))
  entry['android_actions']=sorted(set(re.findall(r'\bACTION_[A-Z0-9_]+\b',text)))
 entries.append(entry)
result={'repository':'LonelyChromosome/DemoF3','commit':commit,'scope':'All tracked files at immutable commit; inventory only, not completed behavioral audit','file_count':len(entries),'entries':entries}
output=root/'reference/android-full-inventory.json';output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(f'{len(entries)} immutable source files inventoried; Android worktree untouched.')
