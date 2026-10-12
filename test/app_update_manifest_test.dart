import 'dart:convert';

import 'package:better_phenikaa_schedule/features/app_update/update_manifest.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final manifest = <String, Object>{
    'schema': 1,
    'packageName': updatePackageName,
    'versionCode': 29,
    'versionName': 'cooc.1.2',
    'minimumVersionCode': 28,
    'apkUrl': 'https://example.org/updates/cooc.1.2.apk',
    'apkSha256': 'a' * 64,
    'apkSize': 1234,
    'publishedAt': '2026-10-07T13:00:00Z',
    'notes': 'Bản mới',
  };

  test('version and applicability', () {
    final parsed = UpdateManifest.parseVerified(
      utf8.encode(jsonEncode(manifest)),
    );
    expect(parsed.appliesTo(28), isTrue);
    expect(parsed.appliesTo(27), isFalse);
    expect(parsed.appliesTo(29), isFalse);
  });

  test('signed raw bytes only; tamper and wrong key fail', () async {
    final algorithm = Ed25519();
    final pair = await algorithm.newKeyPair();
    final public = await pair.extractPublicKey();
    final bytes = utf8.encode(jsonEncode(manifest));
    final signature = await algorithm.sign(bytes, keyPair: pair);
    final verifier = UpdateManifestVerifier();
    final key = base64.encode(public.bytes);
    final sig = base64.encode(signature.bytes);
    expect(
      (await verifier.verify(bytes, sig, publicKeyBase64: key)).versionCode,
      29,
    );
    await expectLater(
      verifier.verify(
        utf8.encode(jsonEncode({...manifest, 'notes': 'Sửa'})),
        sig,
        publicKeyBase64: key,
      ),
      throwsFormatException,
    );
    final other = await (await algorithm.newKeyPair()).extractPublicKey();
    await expectLater(
      verifier.verify(bytes, sig, publicKeyBase64: base64.encode(other.bytes)),
      throwsFormatException,
    );
  });

  test('rejects unknown fields including UID and wrong package', () {
    expect(
      () => UpdateManifest.parseVerified(
        utf8.encode(jsonEncode({...manifest, 'uid': 'PRIVATE'})),
      ),
      throwsFormatException,
    );
    expect(
      () => UpdateManifest.parseVerified(
        utf8.encode(jsonEncode({...manifest, 'packageName': 'other'})),
      ),
      throwsFormatException,
    );
  });
}
