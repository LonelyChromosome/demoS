// Local adapter for the original BPA card HTML, including its completion hook.
// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:async';
import 'dart:html' as html;
import 'dart:js_util' as js;
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart'
    show InAppWebViewInitialData, InAppWebViewSettings;
export 'package:flutter_inappwebview/flutter_inappwebview.dart'
    show InAppWebViewInitialData, InAppWebViewSettings, ForceDark;

class InAppWebViewController {
  InAppWebViewController(this.frame);
  final html.IFrameElement frame;
  final handlers = <String, dynamic Function(List<dynamic>)>{};
  void addJavaScriptHandler({required String handlerName, required dynamic Function(List<dynamic>) callback}) {
    handlers[handlerName]=callback;
  }
  Future<dynamic> evaluateJavascript({required String source}) async {
    final window=frame.contentWindow;
    if(window==null)throw StateError('Card frame is not ready');
    return js.callMethod<dynamic>(window,'eval',[source]);
  }
}

class InAppWebView extends StatefulWidget {
  const InAppWebView({super.key,required this.initialData,this.initialSettings,this.onWebViewCreated,this.onLoadStop});
  final InAppWebViewInitialData initialData;
  final InAppWebViewSettings? initialSettings;
  final void Function(InAppWebViewController)? onWebViewCreated;
  final Future<void> Function(InAppWebViewController,dynamic)? onLoadStop;
  @override
  State<InAppWebView> createState()=>_CardWebViewState();
}
class _CardWebViewState extends State<InAppWebView> {
  static int nextID=0;
  late final String id='bpa-card-${++nextID}';
  html.IFrameElement? frame;
  StreamSubscription<html.MessageEvent>? messages;
  StreamSubscription<html.Event>? loaded;
  @override
  Widget build(BuildContext context)=>HtmlElementView.fromTagName(
    tagName:'iframe',
    onElementCreated:(element){
      final iframe=element as html.IFrameElement;frame=iframe;
      iframe.style..border='0'..width='100%'..height='100%'..display='block'..backgroundColor='#050913';
      iframe.setAttribute('scrolling','no');iframe.setAttribute('title','BPA card VFX');
      final controller=InAppWebViewController(iframe);
      widget.onWebViewCreated?.call(controller);
      messages=html.window.onMessage.listen((event){
        if(event.source!=iframe.contentWindow)return;
        final data=event.data;
        if(data is! Map||data['type']!='bpa-card-callback'||data['id']!=id)return;
        final handler=controller.handlers[data['name']];
        if(handler!=null)handler(List<dynamic>.from(data['args'] as List));
      });
      loaded=iframe.onLoad.listen((_){if(mounted)unawaited(widget.onLoadStop?.call(controller,null)??Future<void>.value());});
      final bridge='<script>window.flutter_inappwebview={callHandler:function(name,...args){parent.postMessage({type:"bpa-card-callback",id:"$id",name:name,args:args},"*");return Promise.resolve(null);}};</script>';
      iframe.srcdoc=widget.initialData.data.replaceFirst('<head>','<head>'+bridge);
    },
  );
  @override
  void dispose(){unawaited(messages?.cancel());unawaited(loaded?.cancel());frame=null;super.dispose();}
}
