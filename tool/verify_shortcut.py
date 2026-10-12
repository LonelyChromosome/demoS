"""Check the packaged Clock artifact against its compiled public workflow."""
import hashlib
import json
import plistlib
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
directory = root / 'scriptable/shortcuts'
metadata = json.loads((directory / 'BPA-Alarm.json').read_text())
signed = (directory / 'BPA-Alarm.shortcut').read_bytes()
source = (directory / 'BPA-Alarm.cherri').read_bytes()
compiled = Path(sys.argv[1]).read_bytes()
digest = lambda value: hashlib.sha256(value).hexdigest()
assert metadata['format'] == 'AEA1' and signed.startswith(b'AEA1'), 'Invalid envelope'
assert metadata['size'] == len(signed), 'Signed size changed'
assert metadata['signed_sha256'] == digest(signed), 'Signed artifact changed'
assert metadata['workflow_source_sha256'] == digest(source), 'Source changed; recompile and sign'
unsigned = (directory / 'BPA-Alarm.unsigned.plist').read_bytes()
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
assert len(clock) == metadata['clock_create_actions'] == 1, 'Expected one Clock create action'
assert clock[0]['WFWorkflowActionParameters']['AppIntentDescriptor']['BundleIdentifier'] == 'com.apple.clock'
assert metadata['device_verified'] is False, 'Do not infer device verification from signing'
print('Packaged Clock envelope, source and compiled input match; device execution unverified.')
