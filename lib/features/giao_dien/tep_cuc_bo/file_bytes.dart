// Chỉ truy cập đường dẫn private do native bridge đã quản lý.
export 'file_bytes_stub.dart' if (dart.library.io) 'file_bytes_io.dart'
    if (dart.library.html) 'file_bytes_web.dart';
