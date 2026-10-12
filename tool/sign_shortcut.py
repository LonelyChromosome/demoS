"""Sign public workflow code using Shortcuty's documented, keyless API.
Never sends runtime input, credentials or student data. No unbounded retries.
"""
import argparse,base64,hashlib,json,plistlib,urllib.request,uuid,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('input');p.add_argument('output');p.add_argument('--workflow-source',required=True);p.add_argument('--compiler',required=True);p.add_argument('--kind',choices=['clock','nfc'],default='clock');a=p.parse_args()
# Always compile the supplied source here; never sign a stale unsigned file.
with tempfile.TemporaryDirectory(prefix='bpa-clock-') as temporary:
    copied=Path(temporary)/Path(a.workflow_source).name;copied.write_bytes(Path(a.workflow_source).read_bytes())
    subprocess.run([str(Path(a.compiler).resolve()),str(copied),'--skip-sign','--derive-uuids'],check=True)
    candidates=list(Path(temporary).glob('*_unsigned.shortcut'))
    if len(candidates)!=1:raise SystemExit('Compiler did not produce one workflow')
    source=candidates[0].read_bytes()
Path(a.input).parent.mkdir(parents=True,exist_ok=True);Path(a.input).write_bytes(source)
workflow=plistlib.loads(source)
actions=workflow.get('WFWorkflowActions',[])
clock=[x for x in actions if x.get('WFWorkflowActionParameters',{}).get('AppIntentDescriptor',{}).get('AppIntentIdentifier')=='CreateAlarmIntent' or 'MTCreateAlarmIntent' in x.get('WFWorkflowActionIdentifier','')]
reader=[x for x in actions if x.get('WFWorkflowActionIdentifier')=='is.workflow.actions.openxcallbackurl']
if a.kind=='clock' and len(clock)!=1:raise SystemExit('Workflow must contain exactly one real Clock create action')
if a.kind=='nfc':
    allowed={'is.workflow.actions.detect.dictionary','is.workflow.actions.dictionary','is.workflow.actions.format.date','is.workflow.actions.gettext','is.workflow.actions.getvalueforkey','is.workflow.actions.openxcallbackurl','is.workflow.actions.output','is.workflow.actions.setvariable','is.workflow.actions.urlencode'}
    if clock or len(reader)!=1 or any(x['WFWorkflowActionIdentifier'] not in allowed for x in actions):raise SystemExit('Unexpected NFC workflow action')
    params=reader[0]['WFWorkflowActionParameters']
    if params.get('WFXCallbackCustomSuccessKey')!='callback' or params.get('WFXCallbackCustomCallbackEnabled') is not True:raise SystemExit('NFC reader must use the actual custom callback action')
    workflow_text=str(workflow)
    if 'nfchelper://read?params=true&custom=' not in workflow_text or 'nfchelper://write' in workflow_text or 'post=' in workflow_text:raise SystemExit('NFC workflow must only read using the local callback')
boundary='BPA-'+uuid.uuid4().hex
body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="BPA-{a.kind}.shortcut"\r\nContent-Type: application/octet-stream\r\n\r\n').encode()+source+f'\r\n--{boundary}--\r\n'.encode()
request=urllib.request.Request('https://sign.shortcuty.app/api/v1/sign?response=json',data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary,'Accept':'application/json'},method='POST')
with urllib.request.urlopen(request,timeout=60) as response:r=json.load(response)
if r.get('success') is not True:raise SystemExit('Shortcut signer did not report success')
f=r['file'];signed=base64.b64decode(f['content_base64'],validate=True)
input_hash=hashlib.sha256(source).hexdigest();signed_hash=hashlib.sha256(signed).hexdigest()
if not signed.startswith(b'AEA1') or f.get('format')!='AEA1' or f.get('input_sha256')!=input_hash or f.get('signed_sha256')!=signed_hash or f.get('size')!=len(signed):raise SystemExit('Signed workflow envelope/hash does not match request')
out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(signed)
out.with_suffix('.unsigned.plist').write_bytes(source)
out.with_suffix('.json').write_text(json.dumps({'source_sha256':input_hash,'workflow_source_sha256':hashlib.sha256(Path(a.workflow_source).read_bytes()).hexdigest(),'signed_sha256':signed_hash,'format':'AEA1','size':len(signed),'clock_create_actions':len(clock),'reader_callback_actions':len(reader),'device_verified':False},indent=2)+'\n')
print(a.kind+' Shortcut signed; device execution remains unverified.')
