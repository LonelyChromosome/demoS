"""Check the packaged Clock artifact against its compiled public workflow."""
import hashlib
import json
import plistlib
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
directory = root / 'scriptable/shortcuts'
stem = 'BPA-NFC' if len(sys.argv) > 2 and sys.argv[2] == 'nfc' else 'BPA-Alarm'
metadata = json.loads((directory / (stem + '.json')).read_text())
signed = (directory / (stem + '.shortcut')).read_bytes()
source = (directory / (stem + '.cherri')).read_bytes()
compiled = Path(sys.argv[1]).read_bytes()
digest = lambda value: hashlib.sha256(value).hexdigest()
assert metadata['format'] == 'AEA1' and signed.startswith(b'AEA1'), 'Invalid envelope'
assert metadata['size'] == len(signed), 'Signed size changed'
assert metadata['signed_sha256'] == digest(signed), 'Signed artifact changed'
assert metadata['workflow_source_sha256'] == digest(source), 'Source changed; recompile and sign'
unsigned = (directory / (stem + '.unsigned.plist')).read_bytes()
assert metadata['source_sha256'] == digest(unsigned), 'Signing input changed'

def normalize(value):
    if isinstance(value, dict):
        result = {key: normalize(item) for key, item in value.items()}
        # Cherri uses a Go map for dictionary fields; field order has no meaning.
        # All action order and reference UUIDs remain compared exactly.
        if 'WFDictionaryFieldValueItems' in result:
            fields = result['WFDictionaryFieldValueItems']
            result['WFDictionaryFieldValueItems'] = sorted(fields, key=lambda item: json.dumps(item['WFKey'], sort_keys=True))
        return result
    if isinstance(value, list):
        return [normalize(item) for item in value]
    return value

assert normalize(plistlib.loads(unsigned)) == normalize(plistlib.loads(compiled)), 'Compiled workflow differs from signing input'
actions = plistlib.loads(compiled)['WFWorkflowActions']
clock = [action for action in actions if action.get('WFWorkflowActionParameters', {}).get('AppIntentDescriptor', {}).get('AppIntentIdentifier') == 'CreateAlarmIntent']
if stem == 'BPA-Alarm':
    assert len(clock) == metadata['clock_create_actions'] == 1, 'Expected one Clock create action'
    assert clock[0]['WFWorkflowActionParameters']['AppIntentDescriptor']['BundleIdentifier'] == 'com.apple.clock'
else:
    reader = [action for action in actions if action['WFWorkflowActionIdentifier'] == 'is.workflow.actions.openxcallbackurl']
    assert len(clock) == metadata['clock_create_actions'] == 0
    assert len(reader) == metadata['reader_callback_actions'] == 1
    assert reader[0]['WFWorkflowActionParameters']['WFXCallbackCustomSuccessKey'] == 'callback'
    assert reader[0]['WFWorkflowActionParameters']['WFXCallbackCustomCallbackEnabled'] is True
    allowed = {'is.workflow.actions.detect.dictionary', 'is.workflow.actions.dictionary', 'is.workflow.actions.format.date', 'is.workflow.actions.gettext', 'is.workflow.actions.getvalueforkey', 'is.workflow.actions.openxcallbackurl', 'is.workflow.actions.output', 'is.workflow.actions.setvariable', 'is.workflow.actions.urlencode'}
    assert all(action['WFWorkflowActionIdentifier'] in allowed for action in actions)
    text = str(plistlib.loads(compiled))
    assert 'nfchelper://read?params=true&custom=' in text and 'nfchelper://write' not in text and 'post=' not in text
assert metadata['device_verified'] is False, 'Do not infer device verification from signing'
print('Packaged', stem, 'envelope, source and compiled input match; device execution unverified.')
