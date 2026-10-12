import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:better_phenikaa_schedule/features/app_update/update_manifest.dart';
void main() {
  test('Scriptable channel verifies raw Ed25519 metadata and rejects tampering/APK payloads', () async {
    expect(scriptableUpdateBuild, isTrue);
    final algorithm=Ed25519();
    // Explicit test key; unrelated to the production signing key.
    final pair=await algorithm.newKeyPairFromSeed(List<int>.generate(32,(i)=>i));
    final public=await pair.extractPublicKey();
    final payload={'schema':2,'platform':'scriptable','packageName':updatePackageName,'versionCode':52,'versionName':'cooc.1.6','minimumVersionCode':50,'resourceUrl':'https://example.test/compiled/bpa-package.json','resourceSha256':List.filled(64,'a').join(),'resourceSize':9000,'resourceIndexSize':1000,'publishedAt':'2026-10-13T00:00:00Z','notes':'Test fixture'};
    Future<UpdateManifest> verify(Map<String,Object> value) async {
      final bytes=utf8.encode(jsonEncode(value)),sig=await algorithm.sign(bytes,keyPair:pair);
      return const UpdateManifestVerifier().verify(bytes,base64Encode(sig.bytes),publicKeyBase64:base64Encode(public.bytes));
    }
    final verified=await verify(payload);
    expect(verified.resourceIndexSize,1000);expect(verified.installArguments()['resourceIndexSize'],1000);expect(verified.appliesTo(51),isTrue);
    final original=utf8.encode(jsonEncode(payload));final signature=await algorithm.sign(original,keyPair:pair);
    expect(()=>const UpdateManifestVerifier().verify([...original,32],base64Encode(signature.bytes),publicKeyBase64:base64Encode(public.bytes)),throwsFormatException);
    expect(()=>verify({...payload,'platform':'android'}),throwsFormatException);
    expect(()=>verify({...payload,'apkUrl':'https://example.test/app.apk'}),throwsFormatException);
  });
}
