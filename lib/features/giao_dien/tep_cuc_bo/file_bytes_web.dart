import 'dart:convert';
import 'dart:typed_data';
import 'package:better_phenikaa_schedule/platform/bpa_channel.dart';

Future<Uint8List> readManagedFile(String path, {required int maximumBytes}) async {
  final base64=await const BpaChannel('better_phenikaa/local_files').invokeMethod<String>('readFile',{'path':path,'maximumBytes':maximumBytes});
  if (base64 == null) throw StateError('Không đọc được tệp đã chọn.');
  final bytes=base64Decode(base64);
  if (bytes.length>maximumBytes) throw StateError('Tệp vượt giới hạn kích thước.');
  return bytes;
}
Future<bool> managedFileExists(String path) async =>
  await const BpaChannel('better_phenikaa/local_files').invokeMethod<bool>('fileExists',path) ?? false;
