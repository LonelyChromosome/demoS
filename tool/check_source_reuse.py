import hashlib
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
ADAPTERS = {'lib/features/app_update/update_manifest.dart','lib/features/giao_dien/xem_truoc/native_widget_preview.dart','lib/features/app_update/card_link_vfx.dart','lib/app/app.dart','lib/features/dang_nhap_qldt/qldt_login_mobile.dart',
            'lib/features/dong_bo_hang_ngay/daily_sync.dart','lib/features/giao_dien/tep_cuc_bo/local_file_bridge.dart',
            'lib/features/tien_ich_lich_hoc/widget_publisher.dart','lib/theme/app_theme.dart',
            'lib/features/dang_nhap_qldt/qldt_login_web.dart',
            'lib/features/giao_dien/tep_cuc_bo/file_bytes.dart',
            'lib/features/app_update/update_http_stub.dart',
            'lib/features/lich_hoc/study_alarm_card.dart',
            'lib/features/app_update/update_controller.dart'}
manifest=json.loads((ROOT/'reference/source-manifest.json').read_text())
preserved=0
for name,expected in manifest['files'].items():
    file=ROOT/name
    if not file.is_file(): raise SystemExit('Missing original file: '+name)
    if hashlib.sha256(file.read_bytes()).hexdigest()==expected: preserved+=1
    elif name not in ADAPTERS: raise SystemExit('Unexpected original-source change: '+name)
print(f'{preserved} original files byte-identical; {len(ADAPTERS)} declared platform adapters.')
print('Source reuse is not proof of 95% iPhone parity.')
