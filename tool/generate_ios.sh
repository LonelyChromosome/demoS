#!/usr/bin/env bash
set -euo pipefail
stage="${RUNNER_TEMP:-/tmp}/bpa-ios-native"
host="${RUNNER_TEMP:-/tmp}/bpa-ios-host"
mkdir -p "$stage"
cp -R ios/. "$stage/"
flutter create --platforms=ios --org vn.edu.phenikaa --project-name better_phenikaa_schedule --no-pub "$host"
cp -R "$host/ios/." ios/
cp -R "$stage/." ios/
python3 - <<'PY'
import json,subprocess
from pathlib import Path
root=Path('ios')
icon=root/'Runner/Assets.xcassets/AppIcon.appiconset'
data=json.loads((icon/'Contents.json').read_text())
source=root/'WidgetAssets/AndroidLauncher.png'
for entry in data['images']:
    if 'filename' not in entry: continue
    side=round(float(entry['size'].split('x')[0])*int(entry['scale'].removesuffix('x')))
    subprocess.run(['sips','-z',str(side),str(side),str(source),'--out',str(icon/entry['filename'])],check=True,stdout=subprocess.DEVNULL)
PY
ruby tool/configure_ios.rb
