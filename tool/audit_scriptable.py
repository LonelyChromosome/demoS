"""Trace source coverage without labelling source reuse as device verification."""
from pathlib import Path
import hashlib,json,re
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'reference/source-manifest.json').read_text())
inventory=[]
for name,expected in manifest['files'].items():
    p=root/name
    entry={'source':name,'android_sha256':expected,'present':p.is_file()}
    if p.is_file():
        raw=p.read_bytes();entry['sha256']=hashlib.sha256(raw).hexdigest();entry['byte_identical']=entry['sha256']==expected
        if p.suffix in {'.dart','.kt','.xml'}:
            text=raw.decode('utf8')
            entry['classes']=re.findall(r'\b(?:class|object|enum\s+class)\s+(\w+)',text)
            entry['channels']=re.findall(r'(?:MethodChannel|BpaChannel)\(\s*[\'\"]([^\'\"]+)',text)
    inventory.append(entry)
mobile=(root/'lib/features/dang_nhap_qldt/qldt_login_mobile.dart').read_text()
name_ui=mobile[mobile.index('final class _QldtNameToken'):]
extracted=(root/'lib/features/dang_nhap_qldt/qldt_name_arrange.dart').read_text()
result={'reference_commit':'16f7ee232ad2b74699cf960f33c87c8caaadecc3','reference_repository':'LonelyChromosome/DemoF3','source_inventory':inventory,'reused_ui_slices':[{'source':'lib/features/dang_nhap_qldt/qldt_login_mobile.dart','target':'lib/features/dang_nhap_qldt/qldt_name_arrange.dart','sha256':hashlib.sha256(name_ui.encode()).hexdigest(),'byte_identical_slice':extracted.endswith(name_ui)}],'note':'Inventory and hash evidence only; not an exhaustive behavioral audit or iPhone functional test.'}
(root/'docs/SCRIPTABLE_SOURCE_AUDIT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'{len(inventory)} files inventoried; {sum(i.get("byte_identical",False) for i in inventory)} identical. No device-parity claim.')
