"""Install provisioning material only on the disposable macOS CI runner."""
import base64
import os
import plistlib
import secrets
import subprocess
from pathlib import Path

def main():
    required=('P12_BASE64','P12_PASSWORD','RUNNER_PROFILE','WIDGET_PROFILE','APPLE_TEAM_ID')
    missing=[key for key in required if not os.environ.get(key)]
    if missing: raise SystemExit('Signing not configured: '+', '.join(missing))
    temporary=Path(os.environ['RUNNER_TEMP'])
    p12=temporary/'bpa-signing.p12'
    p12.write_bytes(base64.b64decode(os.environ['P12_BASE64'],validate=True)); p12.chmod(0o600)
    profiles={}
    for variable,name,bundle in [('RUNNER_PROFILE','RUNNER_PROFILE_UUID','vn.edu.phenikaa.bpa'),('WIDGET_PROFILE','WIDGET_PROFILE_UUID','vn.edu.phenikaa.bpa.widgets')]:
        path=temporary/(variable+'.mobileprovision')
        path.write_bytes(base64.b64decode(os.environ[variable],validate=True))
        profile=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(path)]))
        entitlements=profile['Entitlements']
        if entitlements.get('application-identifier') != os.environ['APPLE_TEAM_ID']+'.'+bundle: raise SystemExit('Wrong profile: '+variable)
        if 'group.vn.edu.phenikaa.bpa' not in entitlements.get('com.apple.security.application-groups',[]): raise SystemExit('Profile missing BPA App Group')
        if variable=='RUNNER_PROFILE' and 'TAG' not in entitlements.get('com.apple.developer.nfc.readersession.formats',[]): raise SystemExit('Runner profile missing NFC tag reader entitlement')
        destination=Path.home()/'Library/MobileDevice/Provisioning Profiles'/(profile['UUID']+'.mobileprovision')
        destination.parent.mkdir(parents=True,exist_ok=True); destination.write_bytes(path.read_bytes())
        profiles[bundle]=profile['UUID']
        with Path(os.environ['GITHUB_ENV']).open('a') as output: output.write(name+'='+profile['UUID']+'\n')
    password=secrets.token_urlsafe(32)
    print('::add-mask::'+password)
    with Path(os.environ['GITHUB_ENV']).open('a') as output: output.write('SIGNING_KEYCHAIN_PASSWORD='+password+'\n')
    with (temporary/'bpa-export.plist').open('wb') as output:
        plistlib.dump({'method':'app-store-connect','teamID':os.environ['APPLE_TEAM_ID'],'signingStyle':'manual','provisioningProfiles':profiles,'uploadSymbols':True},output)

if __name__=='__main__': main()
