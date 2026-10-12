"""Sign an actual compiled Scriptable resource index with an offline Ed25519 key.
The private key stays outside this repository and is never sent to the host.
"""
import argparse,base64,hashlib,json
from datetime import datetime,timezone
from pathlib import Path
from cryptography.hazmat.primitives import serialization
p=argparse.ArgumentParser();p.add_argument('--key',required=True);p.add_argument('--index',required=True);p.add_argument('--url',required=True);p.add_argument('--out',required=True);p.add_argument('--notes',default='Cập nhật BPA trên Scriptable.');a=p.parse_args()
raw=Path(a.index).read_bytes();index=json.loads(raw)
if index.get('schema')!=1 or not isinstance(index.get('versionCode'),int) or not a.url.startswith('https://raw.githubusercontent.com/LonelyChromosome/demoS/'):raise SystemExit('Not a compiled BPA index')
key=serialization.load_pem_private_key(Path(a.key).read_bytes(),password=None)
public=base64.b64encode(key.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw)).decode()
if public!=json.loads(Path('scriptable/update-channel.json').read_text())['publicKeyBase64']:raise SystemExit('Signing key does not match the pinned public channel')
manifest={'schema':2,'platform':'scriptable','packageName':'vn.edu.phenikaa.better_phenikaa_schedule','versionCode':index['versionCode'],'versionName':index['versionName'],'minimumVersionCode':50,'resourceUrl':a.url,'resourceSha256':hashlib.sha256(raw).hexdigest(),'resourceSize':len(raw)+sum(f['size'] for f in index['files']),'resourceIndexSize':len(raw),'publishedAt':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'notes':a.notes}
blob=json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode();signature=key.sign(blob);key.public_key().verify(signature,blob)
out=Path(a.out);out.mkdir(parents=True,exist_ok=True);(out/'latest.json').write_bytes(blob);(out/'latest.json.sig').write_text(base64.b64encode(signature).decode()+'\n')
print('Signed release',manifest['versionCode'],'for',len(index['files']),'verified resources')
