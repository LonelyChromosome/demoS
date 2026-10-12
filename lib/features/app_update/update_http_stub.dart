import 'dart:convert';
import 'package:better_phenikaa_schedule/platform/bpa_channel.dart';
Future<List<int>> fetchUpdateBytes(Uri uri, int limit) async {
  final result=await const BpaChannel('better_phenikaa/update_http').invokeMethod<String>('fetch',{'url':uri.toString(),'limit':limit});
  if (result==null) throw StateError('Không nhận được manifest cập nhật.');
  final bytes=base64Decode(result);
  if(bytes.length>limit) throw StateError('Manifest vượt giới hạn.');
  return bytes;
}
