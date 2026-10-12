"""Sign public workflow code using Shortcuty's documented, keyless API.
Never sends runtime input, credentials or student data. No unbounded retries.
"""
import argparse,base64,hashlib,json,plistlib,urllib.request,uuid
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');p.add_argument('--workflow-source',required=True);a=p.parse_args()
source=Path(a.input).read_bytes();workflow=plistlib.loads(source)
actions=workflow.get('WFWorkflowActions',[])
clock=[x for x in actions if x.get('WFWorkflowActionParameters',{}).get('AppIntentDescriptor',{}).get('AppIntentIdentifier')=='CreateAlarmIntent' or 'MTCreateAlarmIntent' in x.get('WFWorkflowActionIdentifier','')]
if len(clock)!=1:raise SystemExit('Workflow must contain exactly one real Clock create action')
boundary='BPA-'+uuid.uuid4().hex
body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="BPA-Alarm.shortcut"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()+source+f'\r\n--{boundary}--\r\n'.encode()
request=urllib.request.Request('https://sign.shortcuty.app/api/v1/sign?response=json',data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary,'Accept':'application/json'},method='POST')
with urllib.request.urlopen(request,timeout=60) as response:r=json.load(response)
if r.get('success') is not True:raise SystemExit('Shortcut signer did not report success')
f=r['file'];signed=base64.b64decode(f['content_base64'],validate=True)
input_hash=hashlib.sha256(source).hexdigest();signed_hash=hashlib.sha256(signed).hexdigest()
if not signed.startswith(b'AEA1') or f.get('format')!='AEA1' or f.get('input_sha256')!=input_hash or f.get('signed_sha256')!=signed_hash or f.get('size')!=len(signed):raise SystemExit('Signed workflow envelope/hash does not match request')
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(signed)
out.with_suffix('.unsigned.plist').write_bytes(source)
out.with_suffix('.json').write_text(json.dumps({'source_sha256':input_hash,'workflow_source_sha256':hashlib.sha256(Path(a.workflow_source).read_bytes()).hexdigest(),'signed_sha256':signed_hash,'format':'AEA1','size':len(signed),'clock_create_actions':len(clock),'device_verified':False},indent=2)+'\n')
print('Clock Shortcut signed; import and Clock execution on iPhone remain unverified.')
