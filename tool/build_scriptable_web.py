"""Build the original Flutter app with the public Scriptable signing channel."""
import json,subprocess
from pathlib import Path
channel=json.loads(Path('scriptable/update-channel.json').read_text())
subprocess.run(['flutter','build','web','--release','--no-web-resources-cdn','--base-href=/demoS/','--dart-define=BPA_SCRIPTABLE=true','--dart-define=UPDATE_MANIFEST_URL='+channel['manifestUrl'],'--dart-define=UPDATE_PUBLIC_KEY_BASE64='+channel['publicKeyBase64']],check=True)
